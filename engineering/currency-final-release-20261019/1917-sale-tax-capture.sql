-- New bound sales only. No tax amount/rate/default is supplied by this migration.
CREATE TABLE backend_core.original_sale_creation_proofs(
 sale_id uuid PRIMARY KEY REFERENCES public.sales(id),organization_id uuid NOT NULL,store_id uuid NOT NULL,
 backend_pid integer NOT NULL,transaction_id bigint NOT NULL,actor_id uuid NOT NULL,request_id uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),UNIQUE(backend_pid,transaction_id,request_id)
);
CREATE TRIGGER immutable_original_sale_creation_proofs BEFORE UPDATE OR DELETE ON backend_core.original_sale_creation_proofs FOR EACH ROW EXECUTE FUNCTION backend_core.immutable_settlement_evidence_v1();
CREATE FUNCTION backend_core.record_original_sale_creation_v1() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE i backend_core.settlement_intents%ROWTYPE;
BEGIN
 SELECT * INTO i FROM backend_core.settlement_intents WHERE backend_pid=pg_backend_pid() AND transaction_id=txid_current() AND operation='SALE' AND actor_id=backend_core.active_subject() AND organization_id=NEW.organization_id AND store_id=NEW.store_id;
 IF FOUND THEN INSERT INTO backend_core.original_sale_creation_proofs VALUES(NEW.id,NEW.organization_id,NEW.store_id,pg_backend_pid(),txid_current(),i.actor_id,i.request_id,clock_timestamp());END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER record_original_sale_creation AFTER INSERT ON public.sales FOR EACH ROW EXECUTE FUNCTION backend_core.record_original_sale_creation_v1();
CREATE FUNCTION backend_core.sale_created_in_current_posting_v1(p_sale uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT EXISTS(SELECT 1 FROM backend_core.original_sale_creation_proofs c JOIN public.sales s ON s.id=c.sale_id JOIN backend_core.settlement_intents i ON i.backend_pid=c.backend_pid AND i.transaction_id=c.transaction_id AND i.request_id=c.request_id AND i.actor_id=c.actor_id AND i.organization_id=c.organization_id AND i.store_id=c.store_id AND i.operation='SALE' WHERE c.sale_id=p_sale AND c.backend_pid=pg_backend_pid() AND c.transaction_id=txid_current() AND c.actor_id=backend_core.active_subject() AND s.organization_id=c.organization_id AND s.store_id=c.store_id AND s.client_sale_id=c.request_id)
$$;
REVOKE ALL ON FUNCTION backend_core.record_original_sale_creation_v1(),backend_core.sale_created_in_current_posting_v1(uuid) FROM PUBLIC,anon,authenticated,service_role;
CREATE TABLE backend_core.original_tax_capture_bindings(
 organization_id uuid PRIMARY KEY REFERENCES public.organizations(id),
 currency text NOT NULL, currency_revision integer NOT NULL CHECK(currency_revision>0),
 adapter text NOT NULL REFERENCES backend_core.original_evidence_adapters(name),
 verification_reference text NOT NULL CHECK(length(trim(verification_reference))>=8),
 enabled boolean NOT NULL DEFAULT false
);
CREATE TABLE backend_core.original_sale_posting_facts(
 sale_id uuid PRIMARY KEY REFERENCES public.sales(id),organization_id uuid NOT NULL,
 store_id uuid NOT NULL,currency text NOT NULL,request_id uuid NOT NULL,
 tax_evidence_status text NOT NULL CHECK(tax_evidence_status IN('CAPTURED','NO_VERIFIED_PRODUCER')),
 facts jsonb NOT NULL, captured_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(store_id,request_id)
);
CREATE TRIGGER immutable_original_sale_posting_facts BEFORE UPDATE OR DELETE ON backend_core.original_sale_posting_facts FOR EACH ROW EXECUTE FUNCTION backend_core.immutable_settlement_evidence_v1();
CREATE FUNCTION backend_core.capture_bound_sale_posting_facts_v1(p_sale uuid) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE s public.sales%ROWTYPE;i backend_core.settlement_intents%ROWTYPE;
 b backend_core.original_tax_capture_bindings%ROWTYPE;status text:='NO_VERIFIED_PRODUCER';
 lines jsonb;payments jsonb;facts jsonb;
BEGIN
 SELECT * INTO s FROM public.sales WHERE id=p_sale FOR UPDATE;
 IF NOT FOUND OR s.currency_context->>'currency' IS NULL THEN RAISE EXCEPTION 'ORIGINAL_CURRENCY_REQUIRED';END IF;
 SELECT * INTO i FROM backend_core.settlement_intents WHERE backend_pid=pg_backend_pid() AND transaction_id=txid_current() AND operation='SALE' AND actor_id=backend_core.active_subject() AND organization_id=s.organization_id AND store_id=s.store_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'ORIGINAL_SALE_TRANSACTION_REQUIRED';END IF;
 IF NOT backend_core.sale_created_in_current_posting_v1(s.id) THEN RAISE EXCEPTION 'ORIGINAL_SALE_TRANSACTION_REQUIRED';END IF;
 IF EXISTS(SELECT 1 FROM public.sale_payments p WHERE p.sale_id=s.id AND NOT EXISTS(SELECT 1 FROM backend_core.settlement_bindings x WHERE x.source_kind='SALE_PAYMENT' AND x.source_id=p.id AND x.organization_id=s.organization_id AND x.store_id=s.store_id)) THEN RAISE EXCEPTION 'ORIGINAL_PAYMENT_BINDINGS_REQUIRED';END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('lineId',x.id,'productId',x.product_id,'quantity',x.qty::text,'unitPrice',x.unit_price::text,'unitCost',x.unit_cost::text,'gross',(x.qty*x.unit_price)::text,'cogs',(x.qty*x.unit_cost)::text) ORDER BY x.id),'[]') INTO lines FROM public.sale_items x WHERE x.sale_id=s.id;
 SELECT coalesce(jsonb_agg(jsonb_build_object('paymentId',p.id,'method',p.payment_method,'amount',p.paid_amount::text,'accountId',x.account_id) ORDER BY p.id),'[]') INTO payments FROM public.sale_payments p JOIN backend_core.settlement_bindings x ON x.source_kind='SALE_PAYMENT' AND x.source_id=p.id WHERE p.sale_id=s.id;
 IF jsonb_array_length(lines)=0 OR EXISTS(SELECT 1 FROM public.sale_items WHERE sale_id=s.id AND (unit_cost IS NULL OR unit_cost<0)) THEN RAISE EXCEPTION 'ORIGINAL_LINE_COST_REQUIRED';END IF;
 IF EXISTS(SELECT 1 FROM backend_core.original_tax_capture_bindings WHERE organization_id=s.organization_id AND enabled AND (currency IS DISTINCT FROM s.currency_context->>'currency' OR currency_revision IS DISTINCT FROM (s.currency_context->>'contextRevision')::integer)) THEN RAISE EXCEPTION 'ORIGINAL_TAX_BINDING_REVISION_MISMATCH';END IF;
 SELECT * INTO b FROM backend_core.original_tax_capture_bindings WHERE organization_id=s.organization_id AND enabled;
 IF FOUND THEN
  -- 1913 checks scope, private provider signature/preimage/ACL, exact original
  -- line tax/net, discount, rounding and COGS in this same sale transaction.
  PERFORM backend_core.capture_original_sale_evidence_v1(s.id,b.adapter);
  status:='CAPTURED';
 END IF;
 -- Missing tax evidence stays unknown, never zero. These raw posting facts do
 -- not themselves authorize refunds or permit historical tax enrichment.
 facts:=jsonb_build_object('saleId',s.id,'organizationId',s.organization_id,'storeId',s.store_id,'currencyContext',s.currency_context,'subtotal',s.subtotal_amount::text,'documentDiscount',s.discount_amount::text,'rounding',s.settlement_rounding::text,'total',s.grand_total::text,'paid',s.paid_amount::text,'lines',lines,'payments',payments,'taxEvidenceStatus',status);
 INSERT INTO backend_core.original_sale_posting_facts VALUES(s.id,s.organization_id,s.store_id,s.currency_context->>'currency',i.request_id,status,facts,clock_timestamp());
 RETURN status;
END $$;
DO $$DECLARE t text;BEGIN FOREACH t IN ARRAY ARRAY['original_sale_creation_proofs','original_tax_capture_bindings','original_sale_posting_facts'] LOOP EXECUTE format('ALTER TABLE backend_core.%I ENABLE ROW LEVEL SECURITY',t);EXECUTE format('ALTER TABLE backend_core.%I FORCE ROW LEVEL SECURITY',t);EXECUTE format('REVOKE ALL ON backend_core.%I FROM PUBLIC,anon,authenticated,service_role',t);END LOOP;END$$;
REVOKE ALL ON FUNCTION backend_core.capture_bound_sale_posting_facts_v1(uuid) FROM PUBLIC,anon,authenticated,service_role;
