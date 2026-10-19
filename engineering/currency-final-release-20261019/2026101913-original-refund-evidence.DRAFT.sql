-- LOCAL DRAFT. Evidence and exact reversal planning only. NO refund/payment/stock writer.
-- A real tax/original-sale adapter must be independently verified and registered
-- administratively; a client-supplied document or Owner-entered tax is not evidence.
BEGIN;
SET LOCAL lock_timeout='3s'; SET LOCAL statement_timeout='30s';
DO $$BEGIN
 IF to_regprocedure('backend_core.project_bound_account_v1(uuid)') IS NULL OR to_regprocedure('public.get_bound_financial_result_v1(uuid,uuid)') IS NULL THEN RAISE EXCEPTION '1912_DEPENDENCY_REQUIRED';END IF;
END$$;
CREATE TABLE backend_core.original_evidence_adapters(
 name text PRIMARY KEY, function_identity regprocedure NOT NULL,
 definition_md5 text NOT NULL CHECK(definition_md5 ~ '^[0-9a-f]{32}$'),
 verification_reference text NOT NULL CHECK(length(trim(verification_reference))>=8), enabled boolean NOT NULL DEFAULT false
);
CREATE TABLE backend_core.original_sale_evidence(
 sale_id uuid PRIMARY KEY REFERENCES public.sales(id),organization_id uuid NOT NULL,store_id uuid NOT NULL,
 currency text NOT NULL,adapter text NOT NULL REFERENCES backend_core.original_evidence_adapters(name),
 adapter_md5 text NOT NULL,source_reference text NOT NULL,snapshot jsonb NOT NULL,
 captured_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TRIGGER immutable_original_sale_evidence BEFORE UPDATE OR DELETE ON backend_core.original_sale_evidence FOR EACH ROW EXECUTE FUNCTION backend_core.immutable_settlement_evidence_v1();
CREATE FUNCTION backend_core.capture_original_sale_evidence_v1(p_sale uuid,p_adapter text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE s public.sales%ROWTYPE;a backend_core.original_evidence_adapters%ROWTYPE;provider pg_proc%ROWTYPE;e jsonb;line jsonb;item public.sale_items%ROWTYPE;
 ids uuid[]:='{}';normalized jsonb:='[]';gross numeric:=0;disc numeric:=0;tax numeric:=0;net numeric:=0;rounding numeric:=0;cost numeric:=0;digits integer;n text;v numeric;
BEGIN
 SELECT * INTO s FROM public.sales WHERE id=p_sale FOR UPDATE;
 IF NOT FOUND OR s.currency_context->>'currency' IS NULL THEN RAISE EXCEPTION 'ORIGINAL_CURRENCY_REQUIRED';END IF;
 PERFORM backend_core.settlement_scope_v1(s.store_id);
 IF NOT EXISTS(SELECT 1 FROM backend_core.settlement_intents WHERE backend_pid=pg_backend_pid() AND transaction_id=txid_current() AND operation='SALE' AND actor_id=backend_core.active_subject() AND organization_id=s.organization_id AND store_id=s.store_id)
 OR NOT EXISTS(SELECT 1 FROM public.sales WHERE id=s.id AND xmin=pg_current_xact_id()::text::xid)
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
END $$;
-- Exact cumulative-difference allocation. Prior quantity must come from a future
-- verified, immutable refund writer, NEVER directly from an API caller as authority.
CREATE FUNCTION backend_core.original_refund_slice_v1(p_sale uuid,p_line uuid,p_prior numeric,p_qty numeric) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE e backend_core.original_sale_evidence%ROWTYPE;line jsonb;original_qty numeric;digits integer;n text;v numeric;component numeric;r jsonb:='{}';scale integer;
BEGIN
 SELECT * INTO e FROM backend_core.original_sale_evidence WHERE sale_id=p_sale;
 IF NOT FOUND THEN RAISE EXCEPTION 'VERIFIED_ORIGINAL_EVIDENCE_REQUIRED';END IF;
 PERFORM backend_core.settlement_scope_v1(e.store_id);
 SELECT x INTO line FROM jsonb_array_elements(e.snapshot->'lines') x WHERE x->>'lineId'=p_line::text;
 IF line IS NULL THEN RAISE EXCEPTION 'ORIGINAL_LINE_EVIDENCE_REQUIRED';END IF;
 original_qty:=(line->>'quantity')::numeric;
 IF original_qty IS NULL OR p_qty IS NULL OR p_prior IS NULL OR NOT(p_qty>0 AND p_prior>=0 AND p_prior+p_qty<=original_qty) OR p_qty<>round(p_qty,3) OR p_prior<>round(p_prior,3) THEN RAISE EXCEPTION 'REFUND_QUANTITY_EXCEEDS_ORIGINAL';END IF;
 SELECT minor_units INTO digits FROM proforma_backend.currency_catalog WHERE code=e.currency;
 FOREACH n IN ARRAY ARRAY['gross','discount','rounding','net','tax','cogs'] LOOP
  v:=(line->>n)::numeric;scale:=CASE WHEN n IN ('net','tax') THEN digits ELSE 18 END;
  component:=round(v*(p_prior+p_qty)/original_qty,scale)-round(v*p_prior/original_qty,scale);
  r:=r||jsonb_build_object(n,component::text);
 END LOOP;
 RETURN r||jsonb_build_object('saleId',p_sale,'lineId',p_line,'currency',e.currency,'quantity',p_qty::text,'refundAmount',((r->>'net')::numeric+(r->>'tax')::numeric)::text,'sourceReference',e.source_reference,'postingAllowed',false,'requiredWriter','ATOMIC_ORIGINAL_PAYMENT_REFUND_AND_SELLABLE_RETURN_WRITER');
END $$;
DO $$DECLARE t text;p record;r record;BEGIN
 FOREACH t IN ARRAY ARRAY['original_evidence_adapters','original_sale_evidence'] LOOP EXECUTE format('ALTER TABLE backend_core.%I ENABLE ROW LEVEL SECURITY',t);EXECUTE format('ALTER TABLE backend_core.%I FORCE ROW LEVEL SECURITY',t);EXECUTE format('REVOKE ALL ON backend_core.%I FROM PUBLIC,anon,authenticated,service_role',t);END LOOP;
 FOR p IN SELECT oid,proowner FROM pg_proc WHERE pronamespace='backend_core'::regnamespace AND proname IN('capture_original_sale_evidence_v1','original_refund_slice_v1') LOOP
 EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC',p.oid::regprocedure);
 FOR r IN SELECT DISTINCT pg_get_userbyid(a.grantee) name FROM aclexplode(coalesce((SELECT proacl FROM pg_proc WHERE oid=p.oid),acldefault('f',p.proowner))) a WHERE a.grantee<>p.proowner AND a.grantee<>0 LOOP EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %I',p.oid::regprocedure,r.name);END LOOP;END LOOP;
END $$;
COMMIT;
