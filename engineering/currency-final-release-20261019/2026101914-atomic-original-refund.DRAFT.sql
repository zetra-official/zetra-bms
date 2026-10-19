BEGIN;SET LOCAL lock_timeout='3s';SET LOCAL statement_timeout='45s';
DO $$BEGIN IF md5(replace(pg_get_functiondef('backend_core.canonical_settlement_fact_v1(text,uuid)'::regprocedure),chr(13),''))<>'b15ea4022093bfa0b412cc918af6c9a0' THEN RAISE EXCEPTION '1914_EXACT_DEPENDENCY_MISMATCH';END IF;END$$;
DO $$BEGIN IF md5(replace(pg_get_functiondef('backend_core.native_unverified_writer_guard_v1()'::regprocedure),chr(13),''))<>'1e7589e2240e97daed95c46cfc835cd6' THEN RAISE EXCEPTION '1914_EXACT_DEPENDENCY_MISMATCH';END IF;END$$;
-- Additive LOCAL DRAFT. No tax rate/source is inferred; missing 1913 evidence denies.
CREATE TABLE backend_core.original_refunds(
 id uuid PRIMARY KEY, sale_id uuid NOT NULL REFERENCES public.sales(id),
 line_id uuid NOT NULL REFERENCES public.sale_items(id), organization_id uuid NOT NULL,
 store_id uuid NOT NULL, request_id uuid NOT NULL, actor_id uuid NOT NULL,
 quantity numeric NOT NULL CHECK(quantity>0), sellable boolean NOT NULL,
 original_slice jsonb NOT NULL, movement_id uuid UNIQUE REFERENCES public.stock_movements(id) DEFERRABLE INITIALLY DEFERRED,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(), UNIQUE(store_id,request_id)
);
CREATE TABLE backend_core.original_refund_payments(
 id uuid PRIMARY KEY,refund_id uuid NOT NULL REFERENCES backend_core.original_refunds(id),
 original_payment_id uuid NOT NULL REFERENCES public.sale_payments(id),
 amount numeric NOT NULL CHECK(amount>0), UNIQUE(refund_id,original_payment_id)
);
CREATE TABLE backend_core.refund_stock_intents(
 backend_pid integer NOT NULL,transaction_id bigint NOT NULL,actor_id uuid NOT NULL,
 organization_id uuid NOT NULL,store_id uuid NOT NULL,product_id uuid NOT NULL,
 PRIMARY KEY(backend_pid,transaction_id)
);
CREATE TRIGGER immutable_original_refund BEFORE UPDATE OR DELETE ON backend_core.original_refunds FOR EACH ROW EXECUTE FUNCTION backend_core.immutable_settlement_evidence_v1();
CREATE TRIGGER immutable_original_refund_payment BEFORE UPDATE OR DELETE ON backend_core.original_refund_payments FOR EACH ROW EXECUTE FUNCTION backend_core.immutable_settlement_evidence_v1();
ALTER TABLE backend_core.settlement_bindings DROP CONSTRAINT settlement_bindings_source_kind_check;
ALTER TABLE backend_core.settlement_bindings ADD CONSTRAINT settlement_bindings_source_kind_check CHECK(source_kind IN('SALE_PAYMENT','COLLECTION','EXPENSE','SUPPLIER_PAYMENT','REFUND'));
CREATE FUNCTION public.refund_original_sale_v1(p_store_id uuid,p_request_id uuid,p_sale_id uuid,p_line_id uuid,p_quantity numeric,p_sellable boolean,p_shift_id uuid,p_evidence jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE o uuid:=backend_core.settlement_scope_v1(p_store_id);actor uuid:=backend_core.active_subject();
 s public.sales%ROWTYPE;it public.sale_items%ROWTYPE;e backend_core.original_sale_evidence%ROWTYPE;
 prior backend_core.settlement_requests%ROWTYPE;body jsonb;part jsonb;result jsonb;previous numeric;
 rid uuid:=gen_random_uuid();mid uuid;pid uuid;pay record;remaining numeric;available numeric;take numeric;bal jsonb;
BEGIN
 IF p_request_id IS NULL OR p_sale_id IS NULL OR p_line_id IS NULL OR p_sellable IS NULL OR jsonb_typeof(p_evidence) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'INVALID_ORIGINAL_REFUND_REQUEST';END IF;
 body:=jsonb_build_object('operation','ORIGINAL_REFUND','sale',p_sale_id,'line',p_line_id,'quantity',p_quantity::text,'sellable',p_sellable,'shift',p_shift_id,'evidence',p_evidence);
 PERFORM pg_advisory_xact_lock(hashtextextended('settlement-store:'||p_store_id::text,0));
 PERFORM pg_advisory_xact_lock(hashtextextended(p_store_id::text||':'||p_request_id::text,0));
 SELECT * INTO prior FROM backend_core.settlement_requests WHERE store_id=p_store_id AND request_id=p_request_id;
 IF FOUND THEN IF prior.actor_id<>actor OR prior.organization_id<>o OR prior.payload<>body THEN RAISE EXCEPTION 'BOUND_REQUEST_CONFLICT';END IF;RETURN prior.result;END IF;
 IF NOT EXISTS(SELECT 1 FROM backend_core.settlement_rollout WHERE organization_id=o AND enabled) THEN RAISE EXCEPTION 'SETTLEMENT_ROLLOUT_DISABLED';END IF;
 SELECT * INTO s FROM public.sales WHERE id=p_sale_id AND store_id=p_store_id AND organization_id=o FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'ORIGINAL_SALE_SCOPE_REQUIRED';END IF;
 SELECT * INTO e FROM backend_core.original_sale_evidence WHERE sale_id=s.id;
 IF NOT FOUND OR e.organization_id<>o OR e.store_id<>p_store_id OR e.currency IS DISTINCT FROM s.currency_context->>'currency' THEN RAISE EXCEPTION 'VERIFIED_ORIGINAL_EVIDENCE_REQUIRED';END IF;
 IF NOT EXISTS(SELECT 1 FROM proforma_backend.accounting_currency WHERE organization_id=o AND currency=e.currency AND revision=(s.currency_context->>'contextRevision')::integer) THEN RAISE EXCEPTION 'ORIGINAL_REFUND_CURRENCY_CHANGED';END IF;
 SELECT * INTO it FROM public.sale_items WHERE id=p_line_id AND sale_id=s.id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'ORIGINAL_LINE_EVIDENCE_REQUIRED';END IF;
 -- Credit forgiveness/collection refunds require their own original allocations.
 IF coalesce(s.balance_amount,0)<>0 OR coalesce(s.balance_due,0)<>0 OR s.grand_total IS DISTINCT FROM (SELECT sum(p.paid_amount) FROM public.sale_payments p WHERE p.sale_id=s.id AND p.paid_amount>0)
 OR EXISTS(SELECT 1 FROM public.sale_payments p WHERE p.sale_id=s.id AND (p.paid_amount<=0 OR p.currency_context->>'currency' IS DISTINCT FROM e.currency OR NOT EXISTS(SELECT 1 FROM backend_core.settlement_bindings b WHERE b.source_kind='SALE_PAYMENT' AND b.source_id=p.id AND b.organization_id=o AND b.store_id=p_store_id))) THEN RAISE EXCEPTION 'COMPLETE_ORIGINAL_PAID_ALLOCATION_REQUIRED';END IF;
 SELECT coalesce(sum(quantity),0) INTO previous FROM backend_core.original_refunds WHERE line_id=it.id;
 part:=backend_core.original_refund_slice_v1(s.id,it.id,previous,p_quantity);
 remaining:=(part->>'refundAmount')::numeric;
 IF remaining<=0 THEN RAISE EXCEPTION 'POSITIVE_ORIGINAL_REFUND_REQUIRED';END IF;
 -- Global account order matches settlement writer order; locks precede inventory.
 FOR pay IN SELECT DISTINCT b.account_id FROM public.sale_payments p JOIN backend_core.settlement_bindings b ON b.source_kind='SALE_PAYMENT' AND b.source_id=p.id WHERE p.sale_id=s.id ORDER BY b.account_id LOOP
  PERFORM 1 FROM backend_core.settlement_accounts WHERE id=pay.account_id FOR UPDATE;
 END LOOP;
 INSERT INTO backend_core.settlement_intents VALUES(pg_backend_pid(),txid_current(),actor,o,p_store_id,p_request_id,'REFUND',s.id);
 INSERT INTO backend_core.original_refunds VALUES(rid,s.id,it.id,o,p_store_id,p_request_id,actor,p_quantity,p_sellable,part,CASE WHEN p_sellable THEN rid END,clock_timestamp());
 FOR pay IN SELECT p.*,b.account_id FROM public.sale_payments p JOIN backend_core.settlement_bindings b ON b.source_kind='SALE_PAYMENT' AND b.source_id=p.id WHERE p.sale_id=s.id ORDER BY p.id LOOP
  SELECT pay.paid_amount-coalesce(sum(amount),0) INTO available FROM backend_core.original_refund_payments WHERE original_payment_id=pay.id;
  take:=least(remaining,available);
  IF take>0 THEN
   pid:=gen_random_uuid();INSERT INTO backend_core.original_refund_payments VALUES(pid,rid,pay.id,take);
   PERFORM backend_core.bind_canonical_settlement_v1('REFUND',pid,pay.account_id,p_shift_id,p_evidence);
   remaining:=remaining-take;
  END IF;
  EXIT WHEN remaining=0;
 END LOOP;
 IF remaining<>0 THEN RAISE EXCEPTION 'ORIGINAL_PAID_REFUND_LIMIT_EXCEEDED';END IF;
 IF p_sellable THEN
  INSERT INTO backend_core.refund_stock_intents VALUES(pg_backend_pid(),txid_current(),actor,o,p_store_id,it.product_id);
  PERFORM 1 FROM public.inventory WHERE store_id=p_store_id AND product_id=it.product_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ORIGINAL_INVENTORY_ROW_REQUIRED';END IF;
  UPDATE public.inventory SET qty=qty+p_quantity WHERE store_id=p_store_id AND product_id=it.product_id;
  mid:=rid;INSERT INTO public.stock_movements(id,organization_id,store_id,product_id,mode,amount,created_by,unit_cost,total_cost,note,event_id)
   VALUES(mid,o,p_store_id,it.product_id,'ADD',p_quantity,actor,it.unit_cost,p_quantity*it.unit_cost,'Original sellable return '||rid::text,rid);
  DELETE FROM backend_core.refund_stock_intents WHERE backend_pid=pg_backend_pid() AND transaction_id=txid_current();
 END IF;
 result:=jsonb_build_object('refundId',rid,'saleId',s.id,'lineId',it.id,'currency',e.currency,'quantity',p_quantity::text,'amount',part->>'refundAmount','originalSlice',part,'sellable',p_sellable,'stockMovementId',mid,'canonicalAccountBinding',true,'externalProviderVerified',false);
 INSERT INTO backend_core.settlement_requests VALUES(p_store_id,p_request_id,actor,o,body,result,clock_timestamp());
 DELETE FROM backend_core.settlement_intents WHERE backend_pid=pg_backend_pid() AND transaction_id=txid_current();
 RETURN result;
END $$;
DO $$DECLARE t text;BEGIN FOREACH t IN ARRAY ARRAY['original_refunds','original_refund_payments','refund_stock_intents'] LOOP
 EXECUTE format('ALTER TABLE backend_core.%I ENABLE ROW LEVEL SECURITY',t);EXECUTE format('ALTER TABLE backend_core.%I FORCE ROW LEVEL SECURITY',t);EXECUTE format('REVOKE ALL ON backend_core.%I FROM PUBLIC,anon,authenticated,service_role',t);
END LOOP;END $$;
REVOKE ALL ON FUNCTION public.refund_original_sale_v1(uuid,uuid,uuid,uuid,numeric,boolean,uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;

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
 ELSIF k='REFUND' THEN SELECT jsonb_build_object('organization',f.organization_id,'store',f.store_id,'amount',(-p.amount)::text,'method',upper(op.payment_method),'currency',s.currency_context->>'currency','createdAt',f.created_at,'actor',f.actor_id,'saleId',f.sale_id) INTO r FROM backend_core.original_refund_payments p JOIN backend_core.original_refunds f ON f.id=p.refund_id JOIN public.sale_payments op ON op.id=p.original_payment_id AND op.sale_id=f.sale_id JOIN public.sales s ON s.id=f.sale_id WHERE p.id=sid;
 ELSE RAISE EXCEPTION 'UNVERIFIED_CANONICAL_SETTLEMENT_SOURCE';END IF;
 IF r IS NULL OR r->>'currency' IS NULL OR (r->>'amount')::numeric=0 THEN RAISE EXCEPTION 'ORIGINAL_SETTLEMENT_FACT_REQUIRED';END IF;RETURN r;
END $function$
;
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
 -- A private, same-transaction refund permit is scoped to the returned product.
 IF TG_TABLE_NAME IN ('inventory','stock_movements') AND TG_OP IN ('INSERT','UPDATE') AND EXISTS(
 SELECT 1 FROM backend_core.refund_stock_intents i WHERE i.backend_pid=pg_backend_pid() AND i.transaction_id=txid_current() AND i.actor_id=actor AND i.organization_id=o AND i.store_id=s AND i.product_id=(r->>'product_id')::uuid) THEN RETURN NEW;END IF;
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
COMMIT;
