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
