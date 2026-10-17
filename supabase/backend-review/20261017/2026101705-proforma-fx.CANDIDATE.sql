-- Awaiting Owner approval. Target dcmhqdckzhbuakvcyjit only.
-- Quote-only, explicitly Owner-confirmed manual rate. No financial posting.
BEGIN;
SET LOCAL search_path=pg_catalog;
SET LOCAL lock_timeout='2s';
SET LOCAL statement_timeout='30s';
DO $$ BEGIN
 IF current_database()<>'postgres' OR current_user<>'postgres' THEN RAISE EXCEPTION 'WRONG_TARGET_ROLE'; END IF;
 IF NOT EXISTS(SELECT 1 FROM backend_core.release_receipts WHERE version='2026101704') THEN RAISE EXCEPTION '1704_REQUIRED'; END IF;
 IF to_regprocedure('public.proforma_document_fx_v1(uuid,uuid,uuid,uuid,integer,jsonb)') IS NOT NULL THEN RAISE EXCEPTION 'ALREADY_PRESENT_NO_RETRY'; END IF;
END $$;
CREATE FUNCTION public.proforma_document_fx_v1(p_org uuid,p_store uuid,p_request uuid,p_document uuid,p_expected integer,p_body jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE ctx jsonb; actor uuid; d proforma_backend.documents%ROWTYPE; prior proforma_backend.requests%ROWTYPE;
 fingerprint bytea; snap jsonb; result jsonb; rate numeric; amount numeric; digits integer; target_code text; next_revision integer; now_at timestamptz:=clock_timestamp();
BEGIN
 ctx:=proforma_backend.document_scope_v1(p_org,p_store);actor:=(ctx->>'actorId')::uuid;
 IF ctx->>'role' IS DISTINCT FROM 'owner' THEN RAISE EXCEPTION 'OWNER_REQUIRED'; END IF;
 IF p_request IS NULL OR p_document IS NULL OR p_body IS NULL OR jsonb_typeof(p_body)<>'object' OR octet_length(p_body::text)>4096 THEN RAISE EXCEPTION 'INVALID_FX'; END IF;
 fingerprint:=sha256(convert_to(jsonb_build_array('PROFORMA_MANUAL_FX_V1',p_store,p_document,p_expected,p_body)::text,'UTF8'));
 PERFORM pg_advisory_xact_lock(hashtextextended(p_org::text||p_request::text,0));
 SELECT * INTO prior FROM proforma_backend.requests WHERE organization_id=p_org AND request_id=p_request;
 IF FOUND THEN IF prior.actor_id<>actor OR prior.payload_hash<>fingerprint THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT';END IF;RETURN prior.result;END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('proforma-document:'||p_document::text,0));
 SELECT * INTO d FROM proforma_backend.documents WHERE id=p_document FOR UPDATE;
 IF d.id IS NULL OR d.organization_id<>p_org OR d.store_id<>p_store THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
 IF d.status<>'DRAFT' OR p_expected IS DISTINCT FROM d.revision OR d.valid_until<=now_at THEN RAISE EXCEPTION 'DRAFT_REVISION_CONFLICT'; END IF;
 IF d.currency<>proforma_backend.confirmed_currency(p_org) THEN RAISE EXCEPTION 'ACCOUNTING_CURRENCY_MISMATCH'; END IF;
 SELECT snapshot INTO snap FROM proforma_backend.revisions WHERE document_id=d.id AND revision=d.revision;
 IF snap->>'sourceContract' IS DISTINCT FROM 'PROFORMA_DOCUMENT_V1' OR EXISTS(SELECT 1 FROM proforma_backend.holds WHERE document_id=d.id) OR EXISTS(SELECT 1 FROM proforma_backend.cashier_links WHERE document_id=d.id) THEN RAISE EXCEPTION 'OTHER_WORKFLOW_DOCUMENT'; END IF;
 target_code:=p_body->>'currency';
 SELECT minor_units INTO digits FROM proforma_backend.currency_catalog WHERE currency_catalog.code=target_code;
 IF digits IS NULL OR digits NOT BETWEEN 0 AND 6 OR target_code=d.currency OR p_body->>'rate' IS NULL OR p_body->>'rate' !~ '^[0-9]{1,12}(\.[0-9]{1,12})?$'
 OR p_body->>'acknowledged' IS DISTINCT FROM 'true' OR nullif(btrim(p_body->>'source'),'') IS NULL OR length(p_body->>'source')>200
 THEN RAISE EXCEPTION 'INVALID_FX'; END IF;
 rate:=(p_body->>'rate')::numeric;IF rate<=0 THEN RAISE EXCEPTION 'INVALID_FX';END IF;
 amount:=round((snap->>'total')::numeric*rate,digits);
 IF amount>=1000000000000000000 THEN RAISE EXCEPTION 'FX_AMOUNT_OUT_OF_RANGE'; END IF;
 next_revision:=d.revision+1;
 snap:=snap||jsonb_build_object('revision',next_revision,'invoiceFx',jsonb_build_object('version',1,'mode','OWNER_CONFIRMED_MANUAL','from',d.currency,'to',target_code,'rate',trim_scale(rate)::text,
 'source',btrim(p_body->>'source'),'confirmedBy',actor,'confirmedAt',now_at,'originalTotal',snap->>'total','convertedTotal',amount::text,'precision',digits,'rounding','HALF_AWAY_FROM_ZERO','postingAllowed',false));
 UPDATE proforma_backend.documents SET revision=next_revision WHERE id=d.id;
 INSERT INTO proforma_backend.revisions VALUES(d.id,next_revision,snap,actor,now_at);
 INSERT INTO proforma_backend.items SELECT document_id,next_revision,product_id,quantity,unit_price,gross,discount,tax,total,description FROM proforma_backend.items WHERE document_id=d.id AND revision=d.revision;
 INSERT INTO proforma_backend.events(document_id,revision,actor_id,event,details) VALUES(d.id,next_revision,actor,'REVISED',jsonb_build_object('operation','OWNER_CONFIRMED_MANUAL_FX','source',p_body->>'source'));
 result:=proforma_backend.document_detail_v1(p_org,p_store,d.id);
 INSERT INTO proforma_backend.requests VALUES(p_org,p_request,actor,fingerprint,result);
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.proforma_document_fx_v1(uuid,uuid,uuid,uuid,integer,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.proforma_document_fx_v1(uuid,uuid,uuid,uuid,integer,jsonb) TO authenticated;
INSERT INTO backend_core.release_receipts(version,body_sha256,committed_transaction)
SELECT '2026101705',encode(sha256(convert_to(replace(pg_get_functiondef('public.proforma_document_fx_v1(uuid,uuid,uuid,uuid,integer,jsonb)'::regprocedure),E'\r',''),'UTF8')),'hex'),txid_current();
COMMIT;
