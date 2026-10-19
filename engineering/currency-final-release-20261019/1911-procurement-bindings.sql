ALTER TABLE backend_core.settlement_intents ADD COLUMN source_id uuid;
ALTER TABLE backend_core.native_financial_intents DROP CONSTRAINT native_financial_intents_operation_check;
ALTER TABLE backend_core.native_financial_intents ADD CONSTRAINT native_financial_intents_operation_check CHECK(operation IN ('SALE','REPAYMENT','SHIFT','EXPENSE','RECEIPT'));
ALTER TABLE backend_core.settlement_bindings DROP CONSTRAINT settlement_bindings_source_kind_check;
ALTER TABLE backend_core.settlement_bindings ADD CONSTRAINT settlement_bindings_source_kind_check CHECK(source_kind IN ('SALE_PAYMENT','COLLECTION','EXPENSE','SUPPLIER_PAYMENT'));
ALTER TABLE public.inbound_stock_payments ALTER COLUMN amount TYPE numeric;
ALTER TABLE public.inbound_stock_orders ALTER COLUMN total_goods_value TYPE numeric;
ALTER TABLE public.inbound_stock_orders ALTER COLUMN total_paid_amount TYPE numeric;
ALTER TABLE public.inbound_stock_orders ALTER COLUMN total_balance_amount TYPE numeric;
CREATE TABLE backend_core.receipt_debt_bindings(order_id uuid PRIMARY KEY REFERENCES public.inbound_stock_orders(id),debt_id uuid NOT NULL UNIQUE REFERENCES public.business_debts(id),organization_id uuid NOT NULL,store_id uuid NOT NULL,currency text NOT NULL,request_id uuid NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp());
CREATE TABLE backend_core.supplier_payment_bindings(inbound_payment_id uuid PRIMARY KEY REFERENCES public.inbound_stock_payments(id),debt_payment_id uuid NOT NULL UNIQUE REFERENCES public.business_debt_payments(id),order_id uuid NOT NULL REFERENCES public.inbound_stock_orders(id),request_id uuid NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp());
CREATE TRIGGER immutable_receipt_debt_binding BEFORE UPDATE OR DELETE ON backend_core.receipt_debt_bindings FOR EACH ROW EXECUTE FUNCTION backend_core.immutable_settlement_evidence_v1();
CREATE TRIGGER immutable_supplier_payment_binding BEFORE UPDATE OR DELETE ON backend_core.supplier_payment_bindings FOR EACH ROW EXECUTE FUNCTION backend_core.immutable_settlement_evidence_v1();
CREATE FUNCTION backend_core.capture_receipt_debt_binding_v1() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE i backend_core.settlement_intents%ROWTYPE;o public.inbound_stock_orders%ROWTYPE;
BEGIN SELECT * INTO i FROM backend_core.settlement_intents WHERE backend_pid=pg_backend_pid() AND transaction_id=txid_current() AND operation='RECEIPT' AND actor_id=backend_core.active_subject();IF NOT FOUND THEN RETURN NEW;END IF;
 SELECT * INTO o FROM public.inbound_stock_orders WHERE id=i.source_id;
 IF o.id IS NULL OR NEW.organization_id<>i.organization_id OR NEW.store_id<>i.store_id OR NEW.supplier_id IS DISTINCT FROM o.supplier_id OR NEW.created_by IS DISTINCT FROM i.actor_id OR NEW.principal_amount<>greatest(o.total_goods_value-o.total_paid_amount,0) THEN RAISE EXCEPTION 'RECEIPT_DEBT_CANONICAL_LINK_MISMATCH';END IF;
 INSERT INTO backend_core.receipt_debt_bindings VALUES(o.id,NEW.id,i.organization_id,i.store_id,o.currency,i.request_id,clock_timestamp());RETURN NEW;
END $$;
CREATE TRIGGER capture_receipt_debt_binding_v1 AFTER INSERT ON public.business_debts FOR EACH ROW EXECUTE FUNCTION backend_core.capture_receipt_debt_binding_v1();
CREATE FUNCTION backend_core.receive_bound_purchase_v1(s uuid,req uuid,code text,rev integer,body jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE o public.inbound_stock_orders%ROWTYPE;i backend_core.settlement_intents%ROWTYPE;r jsonb;
BEGIN SELECT * INTO i FROM backend_core.settlement_intents WHERE backend_pid=pg_backend_pid() AND transaction_id=txid_current() AND operation='RECEIPT' AND source_id=(body->>'order_id')::uuid AND actor_id=backend_core.active_subject();IF NOT FOUND THEN RAISE EXCEPTION 'ATOMIC_RECEIPT_CONTEXT_REQUIRED';END IF;
 SELECT * INTO o FROM public.inbound_stock_orders WHERE id=i.source_id FOR UPDATE;
 IF o.id IS NULL OR o.store_id<>s OR o.organization_id<>i.organization_id OR o.currency IS DISTINCT FROM code OR NOT EXISTS(SELECT 1 FROM proforma_backend.accounting_currency WHERE organization_id=o.organization_id AND currency=code AND revision=rev) THEN RAISE EXCEPTION 'ORIGINAL_PURCHASE_CURRENCY_REQUIRED';END IF;
 IF EXISTS(SELECT 1 FROM public.inbound_stock_items WHERE inbound_order_id=o.id AND (unit_cost IS NULL OR unit_cost<=0 OR proposed_sell_price IS NULL OR proposed_sell_price<=0)) THEN RAISE EXCEPTION 'ORIGINAL_VERIFIED_PURCHASE_COST_REQUIRED';END IF;
 INSERT INTO backend_core.native_financial_intents VALUES(pg_backend_pid(),txid_current(),i.actor_id,i.organization_id,s,req,'RECEIPT');r:=public.receive_purchase_once_v1(o.id,req,body->'receipts');DELETE FROM backend_core.native_financial_intents WHERE backend_pid=pg_backend_pid() AND transaction_id=txid_current();
 IF EXISTS(SELECT 1 FROM backend_core.receipt_cost_snapshots WHERE order_id=o.id AND NOT source_verified) THEN RAISE EXCEPTION 'RECEIPT_COST_PROVENANCE_UNVERIFIED';END IF;
 RETURN r||jsonb_build_object('originalCostProvenance',true,'supplierSettlementIncluded',false);
END $$;
CREATE FUNCTION backend_core.pay_bound_supplier_v1(s uuid,req uuid,code text,rev integer,body jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE o public.inbound_stock_orders%ROWTYPE;i backend_core.settlement_intents%ROWTYPE;link backend_core.receipt_debt_bindings%ROWTYPE;pay uuid;debtpay uuid;v_amount numeric;digits integer;
BEGIN SELECT * INTO i FROM backend_core.settlement_intents WHERE backend_pid=pg_backend_pid() AND transaction_id=txid_current() AND operation='SUPPLIER' AND source_id=(body->>'order_id')::uuid AND actor_id=backend_core.active_subject();IF NOT FOUND THEN RAISE EXCEPTION 'ATOMIC_SUPPLIER_CONTEXT_REQUIRED';END IF;
 SELECT * INTO o FROM public.inbound_stock_orders WHERE id=i.source_id FOR UPDATE;SELECT * INTO link FROM backend_core.receipt_debt_bindings WHERE order_id=o.id;
 IF o.id IS NULL OR o.store_id<>s OR o.organization_id<>i.organization_id OR o.currency IS DISTINCT FROM code OR o.status<>'RECEIVED' OR link.order_id IS NULL OR link.currency<>code OR NOT EXISTS(SELECT 1 FROM proforma_backend.accounting_currency WHERE organization_id=o.organization_id AND currency=code AND revision=rev) THEN RAISE EXCEPTION 'COMPLETE_RECEIPT_ORIGINAL_DEBT_BINDING_REQUIRED';END IF;
 IF EXISTS(SELECT 1 FROM public.inbound_stock_items it WHERE it.inbound_order_id=o.id AND it.qty_received IS DISTINCT FROM (SELECT sum(e.quantity) FROM backend_core.receipt_cost_snapshots e WHERE e.order_id=o.id AND e.item_id=it.id AND e.source_verified AND e.purchase_currency=code)) THEN RAISE EXCEPTION 'COMPLETE_ORIGINAL_RECEIPT_ATTESTATION_REQUIRED';END IF;
 SELECT minor_units INTO digits FROM proforma_backend.currency_catalog WHERE currency_catalog.code=pay_bound_supplier_v1.code;
 IF coalesce(body->>'amount','')!~'^\d{1,18}(\.\d{1,12})?$' THEN RAISE EXCEPTION 'INVALID_SUPPLIER_AMOUNT';END IF;v_amount:=(body->>'amount')::numeric;
 IF v_amount<=0 OR v_amount<>round(v_amount,digits) OR v_amount>o.total_balance_amount THEN RAISE EXCEPTION 'SUPPLIER_AMOUNT_PRECISION_OR_BALANCE_INVALID';END IF;
 PERFORM 1 FROM public.business_debts WHERE id=link.debt_id AND organization_id=o.organization_id AND store_id=s AND principal_amount-paid_amount>=v_amount FOR UPDATE;IF NOT FOUND THEN RAISE EXCEPTION 'SUPPLIER_DEBT_BALANCE_MISMATCH';END IF;
 pay:=public.record_inbound_stock_payment_v1(o.id,v_amount,body->>'method',body->>'reference',body->>'note');debtpay:=public.record_business_debt_payment(link.debt_id,v_amount,'Canonical supplier payment '||pay::text);
 IF NOT EXISTS(SELECT 1 FROM public.inbound_stock_payments WHERE id=pay AND inbound_order_id=o.id AND inbound_stock_payments.amount=v_amount) OR NOT EXISTS(SELECT 1 FROM public.business_debt_payments WHERE id=debtpay AND debt_id=link.debt_id AND business_debt_payments.amount=v_amount) THEN RAISE EXCEPTION 'SUPPLIER_PAYMENT_RECONCILIATION_FAILED';END IF;
 INSERT INTO backend_core.supplier_payment_bindings VALUES(pay,debtpay,o.id,req,clock_timestamp());
 RETURN jsonb_build_object('inboundPaymentId',pay,'debtPaymentId',debtpay,'orderId',o.id,'currency',code,'amount',v_amount::text,'accountDebitCount',1,'saleCreated',false);
END $$;
CREATE FUNCTION backend_core.freeze_bound_supplier_v1() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN IF TG_TABLE_NAME='inbound_stock_payments' AND EXISTS(SELECT 1 FROM backend_core.supplier_payment_bindings WHERE inbound_payment_id=OLD.id) OR TG_TABLE_NAME='business_debt_payments' AND EXISTS(SELECT 1 FROM backend_core.supplier_payment_bindings WHERE debt_payment_id=OLD.id) THEN RAISE EXCEPTION 'BOUND_SUPPLIER_SOURCE_IMMUTABLE';END IF;IF TG_OP='DELETE' THEN RETURN OLD;END IF;RETURN NEW;END $$;
CREATE TRIGGER freeze_bound_supplier_v1 BEFORE UPDATE OR DELETE ON public.inbound_stock_payments FOR EACH ROW EXECUTE FUNCTION backend_core.freeze_bound_supplier_v1();
CREATE TRIGGER freeze_bound_supplier_v1 BEFORE UPDATE OR DELETE ON public.business_debt_payments FOR EACH ROW EXECUTE FUNCTION backend_core.freeze_bound_supplier_v1();
CREATE FUNCTION backend_core.check_bound_supplier_v1() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN IF EXISTS(SELECT 1 FROM backend_core.settlement_rollout WHERE organization_id=NEW.organization_id AND enabled) THEN
 IF TG_TABLE_NAME='inbound_stock_payments' AND NOT EXISTS(SELECT 1 FROM backend_core.settlement_bindings WHERE source_kind='SUPPLIER_PAYMENT' AND source_id=NEW.id) OR TG_TABLE_NAME='business_debt_payments' AND NOT EXISTS(SELECT 1 FROM backend_core.supplier_payment_bindings l JOIN backend_core.settlement_bindings b ON b.source_kind='SUPPLIER_PAYMENT' AND b.source_id=l.inbound_payment_id WHERE l.debt_payment_id=NEW.id) THEN RAISE EXCEPTION 'SUPPLIER_SETTLEMENT_BINDING_REQUIRED';END IF;END IF;RETURN NEW;END $$;
CREATE CONSTRAINT TRIGGER check_bound_supplier_v1 AFTER INSERT ON public.inbound_stock_payments DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION backend_core.check_bound_supplier_v1();
CREATE CONSTRAINT TRIGGER check_bound_supplier_v1 AFTER INSERT ON public.business_debt_payments DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION backend_core.check_bound_supplier_v1();
DO $$DECLARE t text;BEGIN FOREACH t IN ARRAY ARRAY['receipt_debt_bindings','supplier_payment_bindings'] LOOP EXECUTE format('ALTER TABLE backend_core.%I ENABLE ROW LEVEL SECURITY',t);EXECUTE format('ALTER TABLE backend_core.%I FORCE ROW LEVEL SECURITY',t);EXECUTE format('REVOKE ALL ON backend_core.%I FROM PUBLIC,anon,authenticated,service_role',t);END LOOP;END $$;
