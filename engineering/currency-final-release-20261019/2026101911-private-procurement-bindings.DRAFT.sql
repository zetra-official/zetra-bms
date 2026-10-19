BEGIN;SET LOCAL lock_timeout='2s';SET LOCAL statement_timeout='45s';
DO $$BEGIN IF md5(replace(pg_get_functiondef('backend_core.native_unverified_writer_guard_v1()'::regprocedure),chr(13),''))<>'c96b536ddcb5afb391b52a82db0197a4' THEN RAISE EXCEPTION 'PROCUREMENT_BINDING_PREIMAGE_MISMATCH';END IF;IF md5(replace(pg_get_functiondef('backend_core.unverified_supplier_payment_guard_v1()'::regprocedure),chr(13),''))<>'079a4b4d6338dd4cff5d712c41db001a' THEN RAISE EXCEPTION 'PROCUREMENT_BINDING_PREIMAGE_MISMATCH';END IF;IF md5(replace(pg_get_functiondef('post_bound_financial_v1(uuid,uuid,text,integer,text,jsonb,jsonb,uuid,jsonb)'::regprocedure),chr(13),''))<>'36224f65b27cefe69059bcfa707675ed' THEN RAISE EXCEPTION 'PROCUREMENT_BINDING_PREIMAGE_MISMATCH';END IF;IF md5(replace(pg_get_functiondef('backend_core.canonical_settlement_fact_v1(text,uuid)'::regprocedure),chr(13),''))<>'e32e4f9d5c1dab9fee5c121b814b9bc5' THEN RAISE EXCEPTION 'PROCUREMENT_BINDING_PREIMAGE_MISMATCH';END IF;IF md5(replace(pg_get_functiondef('backend_core.bind_canonical_settlement_v1(text,uuid,uuid,uuid,jsonb)'::regprocedure),chr(13),''))<>'291cb96eb7362ce40b3ae0db0b660016' THEN RAISE EXCEPTION 'PROCUREMENT_BINDING_PREIMAGE_MISMATCH';END IF;END $$;
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

CREATE OR REPLACE FUNCTION backend_core.native_unverified_writer_guard_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE r jsonb;oldr jsonb;o uuid;s uuid;old_o uuid;old_s uuid;currency text;old_currency text;record_currency text;actor uuid:=backend_core.active_subject();admitted boolean:=false;
BEGIN
 r:=CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
 IF TG_OP='UPDATE' THEN oldr:=to_jsonb(OLD);END IF;
 o:=nullif(r->>'organization_id','')::uuid;s:=nullif(r->>'store_id','')::uuid;
 IF TG_TABLE_NAME='sale_items' THEN
  SELECT organization_id,store_id,currency_context->>'currency' INTO o,s,record_currency FROM public.sales WHERE id=(r->>'sale_id')::uuid;
 END IF;
 IF o IS NULL AND s IS NOT NULL THEN SELECT organization_id INTO o FROM public.stores WHERE id=s;END IF;
 SELECT a.currency INTO currency FROM proforma_backend.accounting_currency a WHERE a.organization_id=o;
 IF TG_OP='UPDATE' THEN
  old_o:=nullif(oldr->>'organization_id','')::uuid;old_s:=nullif(oldr->>'store_id','')::uuid;
  IF TG_TABLE_NAME='sale_items' THEN SELECT organization_id,store_id,currency_context->>'currency' INTO old_o,old_s,old_currency FROM public.sales WHERE id=(oldr->>'sale_id')::uuid;END IF;
  IF old_o IS NULL AND old_s IS NOT NULL THEN SELECT organization_id INTO old_o FROM public.stores WHERE id=old_s;END IF;
  IF old_currency IS NULL THEN SELECT a.currency INTO old_currency FROM proforma_backend.accounting_currency a WHERE a.organization_id=old_o;END IF;
 END IF;
 record_currency:=coalesce(record_currency,r->'currency_context'->>'currency');
 IF coalesce(currency,'TZS')='TZS' AND coalesce(record_currency,'TZS')='TZS' AND coalesce(old_currency,'TZS')='TZS' THEN IF TG_OP='DELETE' THEN RETURN OLD;END IF;RETURN NEW;END IF;
 IF TG_OP='UPDATE' AND ((oldr->>'organization_id') IS DISTINCT FROM (r->>'organization_id') OR (oldr->>'store_id') IS DISTINCT FROM (r->>'store_id') OR (oldr->>'sale_id') IS DISTINCT FROM (r->>'sale_id')) THEN RAISE EXCEPTION 'NATIVE_FINANCIAL_SCOPE_IMMUTABLE';END IF;
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'NATIVE_REVERSAL_CONTRACT_REQUIRED';END IF;
 -- Nonmonetary presentation edits retain existing RLS permissions.
 IF TG_TABLE_NAME='products' AND TG_OP='UPDATE' AND r-ARRAY['name','description','image_url','updated_at','updated_by','is_active']=oldr-ARRAY['name','description','image_url','updated_at','updated_by','is_active'] THEN RETURN NEW;END IF;
 IF TG_TABLE_NAME='credit_accounts_v2' AND (TG_OP='INSERT' OR (TG_OP='UPDATE' AND r-ARRAY['name','full_name','phone','note','updated_at','updated_by']=oldr-ARRAY['name','full_name','phone','note','updated_at','updated_by'])) THEN RETURN NEW;END IF;
 -- Only the already-validated canonical sale transaction may write stock.
 IF TG_TABLE_NAME IN ('inventory','stock_movements','products','sale_items') THEN
  SELECT EXISTS(SELECT 1 FROM backend_core.native_financial_intents i WHERE (i.operation='SALE' OR i.operation='RECEIPT' AND TG_TABLE_NAME<>'sale_items') AND i.backend_pid=pg_backend_pid() AND i.transaction_id=txid_current() AND i.actor_id=actor AND i.organization_id=o AND (s IS NULL OR i.store_id=s)) INTO admitted;
 ELSIF TG_TABLE_NAME='credit_ledger_v2' AND TG_OP='INSERT' THEN
  SELECT EXISTS(SELECT 1 FROM backend_core.native_financial_intents i WHERE i.operation IN ('SALE','REPAYMENT') AND i.backend_pid=pg_backend_pid() AND i.transaction_id=txid_current() AND i.actor_id=actor AND i.organization_id=o AND i.store_id=s) INTO admitted;
 END IF;
 IF TG_TABLE_NAME='business_debts' THEN SELECT EXISTS(SELECT 1 FROM backend_core.settlement_intents i WHERE i.backend_pid=pg_backend_pid() AND i.transaction_id=txid_current() AND i.actor_id=actor AND i.organization_id=o AND i.store_id=s AND (i.operation='RECEIPT' AND TG_OP='INSERT' OR i.operation='SUPPLIER' AND TG_OP='UPDATE' AND EXISTS(SELECT 1 FROM backend_core.receipt_debt_bindings b WHERE b.order_id=i.source_id AND b.debt_id=(r->>'id')::uuid))) INTO admitted;END IF;
 IF NOT admitted THEN RAISE EXCEPTION 'NATIVE_WRITER_CONTRACT_NOT_CERTIFIED';END IF;
 IF TG_OP='DELETE' THEN RETURN OLD;END IF;RETURN NEW;
END $function$
;
CREATE OR REPLACE FUNCTION backend_core.unverified_supplier_payment_guard_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE r jsonb;parent_org uuid;row_org uuid;code text;candidate uuid;
BEGIN
 FOR r IN SELECT v FROM (VALUES(CASE WHEN TG_OP<>'INSERT' THEN to_jsonb(OLD) END),(CASE WHEN TG_OP<>'DELETE' THEN to_jsonb(NEW) END)) x(v) WHERE v IS NOT NULL LOOP
  row_org:=nullif(r->>'organization_id','')::uuid;parent_org:=NULL;
  IF TG_TABLE_NAME='inbound_stock_payments' THEN SELECT organization_id INTO parent_org FROM public.inbound_stock_orders WHERE id=(r->>'inbound_order_id')::uuid;
  ELSIF TG_TABLE_NAME='business_debt_payments' THEN SELECT organization_id INTO parent_org FROM public.business_debts WHERE id=(r->>'debt_id')::uuid;
  ELSIF TG_TABLE_NAME='business_loan_payments' THEN SELECT organization_id INTO parent_org FROM public.business_loans WHERE id=(r->>'loan_id')::uuid;END IF;
  FOREACH candidate IN ARRAY ARRAY[row_org,parent_org] LOOP
   SELECT currency INTO code FROM proforma_backend.accounting_currency WHERE organization_id=candidate;
   IF code IS NOT NULL AND code<>'TZS' AND NOT EXISTS(SELECT 1 FROM backend_core.settlement_intents i WHERE i.backend_pid=pg_backend_pid() AND i.transaction_id=txid_current() AND i.actor_id=backend_core.active_subject() AND i.organization_id=candidate AND i.operation='SUPPLIER' AND (TG_TABLE_NAME='inbound_stock_payments' AND i.source_id=(r->>'inbound_order_id')::uuid OR TG_TABLE_NAME='business_debt_payments' AND EXISTS(SELECT 1 FROM backend_core.receipt_debt_bindings b WHERE b.order_id=i.source_id AND b.debt_id=(r->>'debt_id')::uuid))) THEN RAISE EXCEPTION 'NATIVE_SUPPLIER_SETTLEMENT_CONTRACT_REQUIRED';END IF;
  END LOOP;
 END LOOP;
 IF TG_OP='DELETE' THEN RETURN OLD;END IF;RETURN NEW;
END $function$
;
CREATE OR REPLACE FUNCTION backend_core.canonical_settlement_fact_v1(k text, sid uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE r jsonb;
BEGIN
 IF k='SALE_PAYMENT' THEN SELECT jsonb_build_object('organization',p.organization_id,'store',p.store_id,'amount',p.paid_amount::text,'method',upper(p.payment_method),'currency',p.currency_context->>'currency','createdAt',p.created_at,'actor',p.created_by,'saleId',p.sale_id) INTO r FROM public.sale_payments p WHERE p.id=sid;
 ELSIF k='COLLECTION' THEN SELECT jsonb_build_object('organization',s.organization_id,'store',p.store_id,'amount',(-p.delta)::text,'method',upper(coalesce(p.method,p.payment_method)),'currency',p.currency_context->>'currency','createdAt',p.created_at,'actor',p.created_by) INTO r FROM public.credit_ledger_v2 p JOIN public.credit_accounts_v2 c ON c.id=p.credit_account_id AND c.store_id=p.store_id JOIN public.stores s ON s.id=p.store_id WHERE p.id=sid AND p.delta<0 AND p.entry_type='PAYMENT';
 ELSIF k='EXPENSE' THEN SELECT jsonb_build_object('organization',p.organization_id,'store',p.store_id,'amount',(-p.amount)::text,'method',upper(p.payment_method),'currency',p.currency_context->>'currency','createdAt',p.created_at,'actor',p.created_by) INTO r FROM public.expenses p WHERE p.id=sid;
 ELSIF k='SUPPLIER_PAYMENT' THEN SELECT jsonb_build_object('organization',p.organization_id,'store',o.store_id,'amount',(-p.amount)::text,'method',upper(p.payment_method),'currency',b.currency,'createdAt',p.created_at,'actor',p.created_by) INTO r FROM public.inbound_stock_payments p JOIN public.inbound_stock_orders o ON o.id=p.inbound_order_id JOIN backend_core.receipt_debt_bindings b ON b.order_id=o.id JOIN backend_core.supplier_payment_bindings z ON z.inbound_payment_id=p.id WHERE p.id=sid;
 ELSE RAISE EXCEPTION 'UNVERIFIED_CANONICAL_SETTLEMENT_SOURCE';END IF;
 IF r IS NULL OR r->>'currency' IS NULL OR (r->>'amount')::numeric=0 THEN RAISE EXCEPTION 'ORIGINAL_SETTLEMENT_FACT_REQUIRED';END IF;RETURN r;
END $function$
;
CREATE OR REPLACE FUNCTION backend_core.bind_canonical_settlement_v1(k text, id uuid, ac uuid, shift uuid, evidence jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE a backend_core.settlement_accounts%ROWTYPE;r jsonb;i backend_core.settlement_intents%ROWTYPE;cs public.cashier_shifts%ROWTYPE;op text;role text;digits integer;available numeric;other record;
BEGIN
 SELECT * INTO i FROM backend_core.settlement_intents WHERE backend_pid=pg_backend_pid() AND transaction_id=txid_current() AND actor_id=backend_core.active_subject();IF NOT FOUND THEN RAISE EXCEPTION 'ATOMIC_SETTLEMENT_CONTEXT_REQUIRED';END IF;
 r:=backend_core.canonical_settlement_fact_v1(k,id);SELECT * INTO a FROM backend_core.settlement_accounts WHERE settlement_accounts.id=ac FOR UPDATE;
 op:=CASE k WHEN 'SALE_PAYMENT' THEN 'SALE' WHEN 'SUPPLIER_PAYMENT' THEN 'SUPPLIER' ELSE k END;
 IF a.id IS NULL OR a.locked OR a.organization_id IS DISTINCT FROM i.organization_id OR a.store_id IS DISTINCT FROM i.store_id OR (r->>'organization')::uuid IS DISTINCT FROM i.organization_id OR (r->>'store')::uuid IS DISTINCT FROM i.store_id OR r->>'currency' IS DISTINCT FROM a.currency OR r->>'method' IS DISTINCT FROM a.kind OR (r->>'actor')::uuid IS DISTINCT FROM i.actor_id OR (r->>'createdAt')::timestamptz<transaction_timestamp() OR (r->>'createdAt')::timestamptz<a.opening_at THEN RAISE EXCEPTION 'SETTLEMENT_ACCOUNT_SOURCE_SCOPE_MISMATCH';END IF;
 SELECT minor_units INTO digits FROM proforma_backend.currency_catalog WHERE code=a.currency;IF (r->>'amount')::numeric<>round((r->>'amount')::numeric,digits) THEN RAISE EXCEPTION 'SETTLEMENT_PRECISION_MISMATCH';END IF;
 IF NOT backend_core.settlement_owner_v1(i.organization_id) AND NOT EXISTS(SELECT 1 FROM backend_core.settlement_account_permissions WHERE account_id=a.id AND actor_id=i.actor_id AND operation=op) THEN RAISE EXCEPTION 'ACCOUNT_OPERATION_NOT_AUTHORIZED';END IF;
 IF length(btrim(coalesce(evidence->>'reference','')))<8 OR evidence->>'source' IS DISTINCT FROM 'OWNER_CONFIRMED' AND a.kind<>'CASH' THEN RAISE EXCEPTION 'SETTLEMENT_CONFIRMATION_REQUIRED';END IF;
 IF a.kind<>'CASH' AND NOT backend_core.settlement_owner_v1(i.organization_id) THEN RAISE EXCEPTION 'TRUSTED_PROVIDER_OR_OWNER_CONFIRMATION_REQUIRED';END IF;
 SELECT lower(m.role) INTO role FROM public.org_memberships m WHERE m.organization_id=i.organization_id AND m.user_id=i.actor_id AND coalesce(m.is_active,true) LIMIT 1;
 IF role='cashier' AND shift IS NULL THEN RAISE EXCEPTION 'CASHIER_SHIFT_REQUIRED';END IF;
 IF shift IS NOT NULL THEN
  SELECT * INTO cs FROM public.cashier_shifts WHERE cashier_shifts.id=shift FOR UPDATE;
  IF cs.id IS NULL OR cs.status<>'OPEN' OR cs.organization_id<>i.organization_id OR cs.store_id<>i.store_id OR cs.currency_context->>'currency' IS DISTINCT FROM a.currency OR NOT EXISTS(SELECT 1 FROM public.org_memberships m WHERE m.id=cs.membership_id AND m.user_id=i.actor_id AND coalesce(m.is_active,true)) THEN RAISE EXCEPTION 'SETTLEMENT_SHIFT_OWNERSHIP_OR_STATE_INVALID';END IF;
  IF (r->>'createdAt')::timestamptz<cs.opened_at THEN RAISE EXCEPTION 'SETTLEMENT_OUTSIDE_SHIFT';END IF;
  IF k='SALE_PAYMENT' AND NOT EXISTS(SELECT 1 FROM public.sales s WHERE s.id=(r->>'saleId')::uuid AND s.cashier_shift_id=shift) THEN RAISE EXCEPTION 'SALE_SHIFT_LINK_MISMATCH';END IF;
 END IF;
 IF (r->>'amount')::numeric<0 THEN
  available:=a.opening_amount;FOR other IN SELECT * FROM backend_core.settlement_bindings WHERE account_id=a.id LOOP available:=available+(backend_core.canonical_settlement_fact_v1(other.source_kind,other.source_id)->>'amount')::numeric;END LOOP;
  IF available+(r->>'amount')::numeric<0 THEN RAISE EXCEPTION 'VERIFIED_ACCOUNT_FUNDS_INSUFFICIENT';END IF;
 END IF;
 INSERT INTO backend_core.settlement_bindings VALUES(k,id,ac,i.organization_id,i.store_id,shift,i.actor_id,i.request_id,evidence->>'reference',CASE WHEN a.kind='CASH' THEN 'AUTHORIZED_CANONICAL_CASH_RECORD' ELSE 'OWNER_CONFIRMED_RECORD_NOT_PROVIDER_VERIFIED' END,clock_timestamp());
 INSERT INTO backend_core.settlement_audit(event,actor_id,organization_id,store_id,request_id,details) VALUES('CANONICAL_SETTLEMENT_BOUND',i.actor_id,i.organization_id,i.store_id,i.request_id,jsonb_build_object('sourceKind',k,'sourceId',id,'accountId',ac,'shiftId',shift));
END $function$
;
CREATE OR REPLACE FUNCTION public.post_bound_financial_v1(p_store_id uuid, p_request_id uuid, p_currency text, p_revision integer, p_operation text, p_payload jsonb, p_accounts jsonb, p_shift_id uuid, p_evidence jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE actor uuid:=backend_core.active_subject();o uuid:=backend_core.settlement_scope_v1(p_store_id);body jsonb;prior backend_core.settlement_requests%ROWTYPE;result jsonb;rid uuid;row record;
BEGIN
 IF p_request_id IS NULL OR p_operation IS NULL OR p_operation NOT IN ('SALE','COLLECTION','EXPENSE','RECEIPT','SUPPLIER') OR jsonb_typeof(p_payload) IS DISTINCT FROM 'object' OR jsonb_typeof(p_accounts) IS DISTINCT FROM 'object' OR jsonb_typeof(p_evidence) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'INVALID_BOUND_FINANCIAL_REQUEST';END IF;
 body:=jsonb_build_object('currency',p_currency,'revision',p_revision,'operation',p_operation,'payload',p_payload,'accounts',p_accounts,'shift',p_shift_id,'evidence',p_evidence);
 PERFORM pg_advisory_xact_lock(hashtextextended(p_store_id::text||':'||p_request_id::text,0));SELECT * INTO prior FROM backend_core.settlement_requests WHERE store_id=p_store_id AND request_id=p_request_id;
 IF FOUND THEN IF prior.actor_id<>actor OR prior.organization_id<>o OR prior.payload<>body THEN RAISE EXCEPTION 'BOUND_REQUEST_CONFLICT';END IF;RETURN prior.result;END IF;
 IF NOT EXISTS(SELECT 1 FROM backend_core.settlement_rollout WHERE organization_id=o AND enabled) THEN RAISE EXCEPTION 'SETTLEMENT_ROLLOUT_DISABLED';END IF;
 IF p_shift_id IS NOT NULL THEN PERFORM 1 FROM public.cashier_shifts WHERE id=p_shift_id AND organization_id=o AND store_id=p_store_id AND status='OPEN' FOR UPDATE;IF NOT FOUND THEN RAISE EXCEPTION 'SHIFT_NOT_OPEN';END IF;END IF;
 FOR row IN SELECT DISTINCT value::uuid id FROM jsonb_each_text(p_accounts) ORDER BY 1 LOOP PERFORM 1 FROM backend_core.settlement_accounts WHERE id=row.id AND organization_id=o AND store_id=p_store_id AND currency=p_currency AND NOT locked FOR UPDATE;IF NOT FOUND THEN RAISE EXCEPTION 'BOUND_ACCOUNT_REQUIRED';END IF;END LOOP;
 IF EXISTS(SELECT 1 FROM backend_core.native_financial_requests WHERE store_id=p_store_id AND request_id=p_request_id) THEN RAISE EXCEPTION 'UNBOUND_LEGACY_REQUEST_REQUIRES_REVIEW';END IF;
 INSERT INTO backend_core.settlement_intents VALUES(pg_backend_pid(),txid_current(),actor,o,p_store_id,p_request_id,p_operation,(p_payload->>'order_id')::uuid);
 IF p_operation='SALE' THEN
  IF (p_payload->>'cashier_shift_id')::uuid IS DISTINCT FROM p_shift_id THEN RAISE EXCEPTION 'SALE_SHIFT_LINK_MISMATCH';END IF;
  result:=public.create_native_sale_v1(p_store_id,p_request_id,p_currency,p_revision,p_payload);rid:=(result->>'saleId')::uuid;
  FOR row IN SELECT id,upper(payment_method) method FROM public.sale_payments WHERE sale_id=rid ORDER BY id LOOP PERFORM backend_core.bind_canonical_settlement_v1('SALE_PAYMENT',row.id,(p_accounts->>row.method)::uuid,p_shift_id,p_evidence);END LOOP;
 ELSIF p_operation='COLLECTION' THEN
  result:=public.repay_native_credit_v1(p_store_id,p_request_id,p_currency,p_revision,(p_payload->>'credit_account_id')::uuid,(p_payload->>'amount')::numeric,p_payload->>'method',p_payload->>'reference',p_payload->>'note');
  PERFORM backend_core.bind_canonical_settlement_v1('COLLECTION',(result->>'ledgerId')::uuid,(p_accounts->>(p_payload->>'method'))::uuid,p_shift_id,p_evidence);
 ELSIF p_operation='EXPENSE' THEN
  result:=public.create_native_expense_v1(p_store_id,p_request_id,p_currency,p_revision,p_payload);
  PERFORM backend_core.bind_canonical_settlement_v1('EXPENSE',(result->>'expenseId')::uuid,(p_accounts->>(p_payload->>'payment_method'))::uuid,p_shift_id,p_evidence);
 ELSIF p_operation='RECEIPT' THEN
  result:=backend_core.receive_bound_purchase_v1(p_store_id,p_request_id,p_currency,p_revision,p_payload);
 ELSE
  result:=backend_core.pay_bound_supplier_v1(p_store_id,p_request_id,p_currency,p_revision,p_payload);
  PERFORM backend_core.bind_canonical_settlement_v1('SUPPLIER_PAYMENT',(result->>'inboundPaymentId')::uuid,(p_accounts->>(p_payload->>'method'))::uuid,p_shift_id,p_evidence);
 END IF;
 result:=result||jsonb_build_object('canonicalAccountBinding',true,'externalProviderVerified',false);
 INSERT INTO backend_core.settlement_requests VALUES(p_store_id,p_request_id,actor,o,body,result,clock_timestamp());DELETE FROM backend_core.settlement_intents WHERE backend_pid=pg_backend_pid() AND transaction_id=txid_current();RETURN result;
END $function$
;
DO $$DECLARE p record;r record;BEGIN FOR p IN SELECT oid,proowner FROM pg_proc WHERE pronamespace='backend_core'::regnamespace AND proname IN ('capture_receipt_debt_binding_v1','receive_bound_purchase_v1','pay_bound_supplier_v1','freeze_bound_supplier_v1','check_bound_supplier_v1') LOOP EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC',p.oid::regprocedure);FOR r IN SELECT DISTINCT pg_get_userbyid(a.grantee) name FROM pg_proc f CROSS JOIN LATERAL aclexplode(coalesce(f.proacl,acldefault('f',f.proowner))) a WHERE f.oid=p.oid AND a.grantee<>p.proowner AND a.grantee<>0 LOOP EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %I',p.oid::regprocedure,r.name);END LOOP;END LOOP;END$$;
COMMIT;
