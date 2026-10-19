-- LOCAL DRAFT1917. New-sale atomic original-tax capture hook; no rates or tax defaults.
BEGIN;SET LOCAL lock_timeout='3s';SET LOCAL statement_timeout='30s';
DO $$BEGIN IF md5(replace(pg_get_functiondef('public.post_bound_financial_v1(uuid,uuid,text,integer,text,jsonb,jsonb,uuid,jsonb)'::regprocedure),chr(13),''))<>'f9bbd24f2af119c6d48302c00d5a4494' THEN RAISE EXCEPTION '1917_DISPATCHER_PREIMAGE_MISMATCH';END IF;IF to_regprocedure('backend_core.capture_original_sale_evidence_v1(uuid,text)') IS NULL THEN RAISE EXCEPTION '1913_REQUIRED';END IF;IF md5(replace(pg_get_functiondef('backend_core.capture_original_sale_evidence_v1(uuid,text)'::regprocedure),chr(13),''))<>'37cb7a500176a68504f78f9f07b4e5ee' THEN RAISE EXCEPTION '1917_ORIGINAL_CAPTURE_PREIMAGE_MISMATCH';END IF;END$$;
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

CREATE OR REPLACE FUNCTION backend_core.capture_original_sale_evidence_v1(p_sale uuid, p_adapter text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE s public.sales%ROWTYPE;a backend_core.original_evidence_adapters%ROWTYPE;provider pg_proc%ROWTYPE;e jsonb;line jsonb;item public.sale_items%ROWTYPE;
 ids uuid[]:='{}';normalized jsonb:='[]';gross numeric:=0;disc numeric:=0;tax numeric:=0;net numeric:=0;rounding numeric:=0;cost numeric:=0;digits integer;n text;v numeric;
BEGIN
 SELECT * INTO s FROM public.sales WHERE id=p_sale FOR UPDATE;
 IF NOT FOUND OR s.currency_context->>'currency' IS NULL THEN RAISE EXCEPTION 'ORIGINAL_CURRENCY_REQUIRED';END IF;
 PERFORM backend_core.settlement_scope_v1(s.store_id);
 IF NOT EXISTS(SELECT 1 FROM backend_core.settlement_intents WHERE backend_pid=pg_backend_pid() AND transaction_id=txid_current() AND operation='SALE' AND actor_id=backend_core.active_subject() AND organization_id=s.organization_id AND store_id=s.store_id)
 OR NOT backend_core.sale_created_in_current_posting_v1(s.id)
 THEN RAISE EXCEPTION 'ORIGINAL_EVIDENCE_MUST_BE_CAPTURED_IN_SALE_TRANSACTION';END IF;
 SELECT * INTO a FROM backend_core.original_evidence_adapters WHERE name=p_adapter AND enabled;
 IF NOT FOUND THEN RAISE EXCEPTION 'VERIFIED_ORIGINAL_EVIDENCE_ADAPTER_REQUIRED';END IF;
 SELECT * INTO provider FROM pg_proc WHERE oid=a.function_identity;
 IF provider.oid IS NULL OR provider.pronamespace<>'backend_core'::regnamespace OR provider.pronargs<>1 OR provider.proargtypes[0]<>'uuid'::regtype OR provider.prorettype<>'jsonb'::regtype
 OR md5(replace(pg_get_functiondef(provider.oid),chr(13),''))<>a.definition_md5
 OR EXISTS(SELECT 1 FROM aclexplode(coalesce(provider.proacl,acldefault('f',provider.proowner))) x WHERE x.grantee<>provider.proowner)
 THEN RAISE EXCEPTION 'ORIGINAL_EVIDENCE_ADAPTER_SECURITY_OR_PREIMAGE_MISMATCH';END IF;
 EXECUTE format('SELECT %s($1)',provider.oid::regproc) INTO e USING s.id;
 IF jsonb_typeof(e)<>'object' OR e->>'saleId' IS DISTINCT FROM s.id::text OR e->>'organizationId' IS DISTINCT FROM s.organization_id::text OR e->>'storeId' IS DISTINCT FROM s.store_id::text
 OR e->>'currency' IS DISTINCT FROM s.currency_context->>'currency' OR length(trim(coalesce(e->>'sourceReference','')))<8 OR jsonb_typeof(e->'lines') IS DISTINCT FROM 'array' OR jsonb_array_length(e->'lines')=0 THEN RAISE EXCEPTION 'INVALID_ORIGINAL_EVIDENCE_SCOPE';END IF;
 SELECT minor_units INTO digits FROM proforma_backend.currency_catalog WHERE code=e->>'currency';
 IF digits IS NULL THEN RAISE EXCEPTION 'UNKNOWN_ORIGINAL_CURRENCY';END IF;
 FOR line IN SELECT * FROM jsonb_array_elements(e->'lines') LOOP
  IF jsonb_typeof(line) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'INVALID_ORIGINAL_LINE';END IF;
  SELECT * INTO item FROM public.sale_items WHERE id=(line->>'lineId')::uuid AND sale_id=s.id;
  IF NOT FOUND OR item.id=ANY(ids) OR item.qty<=0 OR item.unit_cost IS NULL OR item.unit_cost<0 THEN RAISE EXCEPTION 'ORIGINAL_LINE_IDENTITY_OR_COST_REQUIRED';END IF;
  ids:=array_append(ids,item.id);
  FOREACH n IN ARRAY ARRAY['gross','discount','tax','net','rounding','cogs'] LOOP
   IF coalesce(line->>n,'')!~'^-?\d{1,24}(\.\d{1,18})?$' THEN RAISE EXCEPTION 'INVALID_ORIGINAL_DECIMAL';END IF;
   v:=(line->>n)::numeric;
   IF n<>'rounding' AND v<0 THEN RAISE EXCEPTION 'NEGATIVE_ORIGINAL_COMPONENT';END IF;
   IF n IN ('tax','net') AND v<>round(v,digits) THEN RAISE EXCEPTION 'ORIGINAL_SETTLEMENT_PRECISION_REQUIRED';END IF;
  END LOOP;
  IF (line->>'gross')::numeric<>item.qty*item.unit_price OR (line->>'cogs')::numeric<>item.qty*item.unit_cost
  OR (line->>'gross')::numeric-(line->>'discount')::numeric+(line->>'rounding')::numeric<>(line->>'net')::numeric+(line->>'tax')::numeric THEN RAISE EXCEPTION 'ORIGINAL_LINE_RECONCILIATION_FAILED';END IF;
  gross:=gross+(line->>'gross')::numeric;disc:=disc+(line->>'discount')::numeric;tax:=tax+(line->>'tax')::numeric;net:=net+(line->>'net')::numeric;rounding:=rounding+(line->>'rounding')::numeric;cost:=cost+(line->>'cogs')::numeric;
  normalized:=normalized||jsonb_build_array(line||jsonb_build_object('quantity',item.qty::text,'unitPrice',item.unit_price::text,'unitCost',item.unit_cost::text));
 END LOOP;
 IF cardinality(ids)<>(SELECT count(*) FROM public.sale_items WHERE sale_id=s.id) OR gross IS DISTINCT FROM s.subtotal_amount OR disc IS DISTINCT FROM s.discount_amount OR rounding IS DISTINCT FROM s.settlement_rounding OR net+tax IS DISTINCT FROM s.grand_total THEN RAISE EXCEPTION 'ORIGINAL_DOCUMENT_RECONCILIATION_FAILED';END IF;
 e:=jsonb_set(e,'{lines}',normalized);
 INSERT INTO backend_core.original_sale_evidence VALUES(s.id,s.organization_id,s.store_id,e->>'currency',a.name,a.definition_md5,e->>'sourceReference',e,clock_timestamp());
END $function$;
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
 PERFORM pg_advisory_xact_lock(hashtextextended('settlement-store:'||p_store_id::text,0));
 PERFORM pg_advisory_xact_lock(hashtextextended(p_store_id::text||':'||p_request_id::text,0));SELECT * INTO prior FROM backend_core.settlement_requests WHERE store_id=p_store_id AND request_id=p_request_id;
 IF FOUND THEN IF prior.actor_id<>actor OR prior.organization_id<>o OR prior.payload<>body THEN RAISE EXCEPTION 'BOUND_REQUEST_CONFLICT';END IF;RETURN prior.result;END IF;
 IF NOT EXISTS(SELECT 1 FROM backend_core.settlement_rollout WHERE organization_id=o AND enabled) THEN RAISE EXCEPTION 'SETTLEMENT_ROLLOUT_DISABLED';END IF;
 IF p_shift_id IS NOT NULL THEN PERFORM 1 FROM public.cashier_shifts WHERE id=p_shift_id AND organization_id=o AND store_id=p_store_id AND status='OPEN' FOR UPDATE;IF NOT FOUND THEN RAISE EXCEPTION 'SHIFT_NOT_OPEN';END IF;END IF;
 FOR row IN SELECT DISTINCT value::uuid id FROM jsonb_each_text(p_accounts) ORDER BY 1 LOOP PERFORM 1 FROM backend_core.settlement_accounts WHERE id=row.id AND organization_id=o AND store_id=p_store_id AND currency=p_currency AND NOT locked FOR UPDATE;IF NOT FOUND THEN RAISE EXCEPTION 'BOUND_ACCOUNT_REQUIRED';END IF;END LOOP;
 IF EXISTS(SELECT 1 FROM backend_core.native_financial_requests WHERE store_id=p_store_id AND request_id=p_request_id) THEN RAISE EXCEPTION 'UNBOUND_LEGACY_REQUEST_REQUIRES_REVIEW';END IF;
 INSERT INTO backend_core.settlement_intents VALUES(pg_backend_pid(),txid_current(),actor,o,p_store_id,p_request_id,p_operation,(p_payload->>'order_id')::uuid);
 IF p_operation='SALE' THEN
  IF (p_payload->>'cashier_shift_id')::uuid IS DISTINCT FROM p_shift_id THEN RAISE EXCEPTION 'SALE_SHIFT_LINK_MISMATCH';END IF;
  IF p_payload ?| ARRAY['tax','tax_rate','tax_amount','taxEvidence','taxAllocation','originalTax'] OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_payload->'items') x WHERE x ?| ARRAY['tax','tax_rate','tax_amount','taxEvidence','taxAllocation']) THEN RAISE EXCEPTION 'CLIENT_TAX_OVERRIDE_NOT_AUTHORITY';END IF;
  result:=public.create_native_sale_v1(p_store_id,p_request_id,p_currency,p_revision,p_payload);rid:=(result->>'saleId')::uuid;
  FOR row IN SELECT id,upper(payment_method) method FROM public.sale_payments WHERE sale_id=rid ORDER BY id LOOP PERFORM backend_core.bind_canonical_settlement_v1('SALE_PAYMENT',row.id,(p_accounts->>row.method)::uuid,p_shift_id,p_evidence);END LOOP;
 result:=result||jsonb_build_object('originalTaxEvidence',backend_core.capture_bound_sale_posting_facts_v1(rid));
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
END $function$;
COMMIT;
