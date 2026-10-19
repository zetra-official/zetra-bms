BEGIN;SET LOCAL lock_timeout='2s';SET LOCAL statement_timeout='45s';
DO $$BEGIN IF md5(replace(pg_get_functiondef('public.create_expense_v2(uuid,numeric,text,text,text,date,text)'::regprocedure),chr(13),''))<>'38edad67c083cf61c37b9cce782912e6' THEN RAISE EXCEPTION 'EXPENSE_CANONICAL_PREIMAGE_MISMATCH';END IF;END$$;
DO $$BEGIN IF md5(replace(pg_get_functiondef('backend_core.capture_financial_currency_v1()'::regprocedure),chr(13),''))<>'5c5c58b370a68a37ef5a012184ddc1e0' OR (SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid='backend_core.native_financial_requests'::regclass AND conname='native_financial_requests_operation_check') IS DISTINCT FROM 'CHECK ((operation = ANY (ARRAY[''SALE''::text, ''REPAYMENT''::text, ''OPEN_SHIFT''::text, ''CLOSE_SHIFT''::text])))' THEN RAISE EXCEPTION 'NATIVE_1905_DEPENDENCY_DRIFT';END IF;END$$;
CREATE OR REPLACE FUNCTION backend_core.capture_financial_currency_v1() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE context jsonb; authority proforma_backend.accounting_currency%ROWTYPE; parent_org uuid; parent_store uuid;
BEGIN
 IF TG_TABLE_SCHEMA<>'public' OR TG_TABLE_NAME NOT IN ('sales','sale_payments','expenses') THEN RAISE EXCEPTION 'INVALID_CURRENCY_TRIGGER_TARGET'; END IF;
 IF TG_OP='UPDATE' THEN
  IF NEW.currency_context IS DISTINCT FROM OLD.currency_context OR NEW.organization_id IS DISTINCT FROM OLD.organization_id OR NEW.store_id IS DISTINCT FROM OLD.store_id THEN RAISE EXCEPTION 'IMMUTABLE_FINANCIAL_CURRENCY_CONTEXT'; END IF;
  IF TG_TABLE_NAME='sale_payments' AND (to_jsonb(NEW)->>'sale_id') IS DISTINCT FROM (to_jsonb(OLD)->>'sale_id') THEN RAISE EXCEPTION 'IMMUTABLE_PAYMENT_SALE'; END IF;
  IF OLD.currency_context->>'currency'<>'TZS' THEN
   PERFORM backend_core.native_financial_policy_v1(NEW.store_id);
   IF NOT EXISTS(SELECT 1 FROM backend_core.native_financial_intents i JOIN proforma_backend.accounting_currency a ON a.organization_id=i.organization_id WHERE i.backend_pid=pg_backend_pid() AND i.transaction_id=txid_current() AND i.actor_id=backend_core.active_subject() AND i.store_id=NEW.store_id AND a.currency=OLD.currency_context->>'currency' AND a.revision=(OLD.currency_context->>'contextRevision')::integer) THEN RAISE EXCEPTION 'NATIVE_MUTATION_REQUIRES_ATOMIC_CONTRACT';END IF;
  END IF;
  RETURN NEW;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.stores s WHERE s.id=NEW.store_id AND s.organization_id=NEW.organization_id) THEN RAISE EXCEPTION 'CURRENCY_STORE_SCOPE_MISMATCH'; END IF;
 SELECT * INTO authority FROM proforma_backend.accounting_currency WHERE organization_id=NEW.organization_id;
 IF FOUND AND authority.currency<>'TZS' THEN PERFORM backend_core.native_financial_policy_v1(NEW.store_id); END IF;
 IF TG_TABLE_NAME='sale_payments' THEN
  SELECT s.currency_context,s.organization_id,s.store_id INTO context,parent_org,parent_store FROM public.sales s WHERE s.id=(to_jsonb(NEW)->>'sale_id')::uuid;
  IF NOT FOUND OR parent_org IS DISTINCT FROM NEW.organization_id OR parent_store IS DISTINCT FROM NEW.store_id THEN RAISE EXCEPTION 'PAYMENT_CURRENCY_SCOPE_MISMATCH'; END IF;
  -- Old sale currency remains unknown; today's owner confirmation cannot relabel it.
  NEW.currency_context:=context;
 ELSIF authority.organization_id IS NOT NULL THEN
  NEW.currency_context:=jsonb_build_object('version',1,'organizationId',NEW.organization_id,'currency',authority.currency,'accountingCurrency',authority.currency,'contextRevision',authority.revision,'source','TRANSACTION_RECORD','exchangeRate','1','rateSource','SAME_CURRENCY_IDENTITY','displayRateUsed',false);
 ELSE NEW.currency_context:=NULL;
 END IF;
 RETURN NEW;
END $$;
ALTER TABLE backend_core.native_financial_requests DROP CONSTRAINT native_financial_requests_operation_check;
ALTER TABLE backend_core.native_financial_requests ADD CONSTRAINT native_financial_requests_operation_check CHECK(operation IN ('SALE','REPAYMENT','OPEN_SHIFT','CLOSE_SHIFT','EXPENSE'));
CREATE FUNCTION public.create_native_expense_v1(p_store_id uuid,p_request_id uuid,p_currency text,p_revision integer,p_expense jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid:=backend_core.active_subject();o uuid;a proforma_backend.accounting_currency%ROWTYPE;prior backend_core.native_financial_requests%ROWTYPE;body jsonb;v_amount numeric;digits integer;eid uuid;result jsonb;
BEGIN
 IF actor IS NULL OR p_request_id IS NULL OR jsonb_typeof(p_expense) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'INVALID_NATIVE_EXPENSE';END IF;
 PERFORM public.ensure_my_store_access(p_store_id);SELECT organization_id INTO o FROM public.stores WHERE id=p_store_id;
 IF p_expense->>'organization_id' IS DISTINCT FROM o::text THEN RAISE EXCEPTION 'CURRENCY_TENANT_MISMATCH';END IF;
 body:=jsonb_build_object('currency',p_currency,'revision',p_revision,'expense',p_expense);
 PERFORM pg_advisory_xact_lock(hashtextextended(p_store_id::text||':'||p_request_id::text,0));
 SELECT * INTO prior FROM backend_core.native_financial_requests WHERE store_id=p_store_id AND request_id=p_request_id;
 IF FOUND THEN IF prior.actor_id<>actor OR prior.organization_id<>o OR prior.operation<>'EXPENSE' OR prior.payload<>body THEN RAISE EXCEPTION 'NATIVE_REQUEST_CONFLICT';END IF;RETURN prior.result;END IF;
 SELECT * INTO a FROM proforma_backend.accounting_currency WHERE organization_id=o;
 IF NOT FOUND OR a.currency IS DISTINCT FROM p_currency OR a.revision IS DISTINCT FROM p_revision THEN RAISE EXCEPTION 'OFFLINE_CURRENCY_REVIEW_REQUIRED';END IF;
 IF NOT EXISTS(SELECT 1 FROM backend_core.native_financial_rollout WHERE organization_id=o AND currency=a.currency AND revision=a.revision AND enabled) THEN RAISE EXCEPTION 'NATIVE_FINANCIAL_POSTING_NOT_CERTIFIED';END IF;
 SELECT minor_units INTO digits FROM proforma_backend.currency_catalog WHERE code=a.currency;
 IF digits IS NULL OR coalesce(p_expense->>'amount','')!~'^\d{1,18}(\.\d{1,12})?$' THEN RAISE EXCEPTION 'INVALID_EXPENSE_AMOUNT';END IF;
 v_amount:=(p_expense->>'amount')::numeric;
 IF v_amount<=0 OR v_amount<>round(v_amount,digits) THEN RAISE EXCEPTION 'INVALID_TENDER_PRECISION';END IF;
 IF p_expense->>'payment_method' IS NULL OR p_expense->>'payment_method' NOT IN ('CASH','MOBILE','BANK') THEN RAISE EXCEPTION 'INVALID_NATIVE_PAYMENT';END IF;
 INSERT INTO backend_core.native_financial_intents VALUES(pg_backend_pid(),txid_current(),actor,o,p_store_id,p_request_id);
 eid:=public.create_expense_v2(p_store_id,v_amount,p_expense->>'category',p_expense->>'note',p_expense->>'payment_method',(p_expense->>'expense_date')::date,NULL);
 SELECT jsonb_build_object('expenseId',e.id,'organizationId',e.organization_id,'storeId',e.store_id,'amount',e.amount::text,'currency',e.currency_context->>'currency','revision',(e.currency_context->>'contextRevision')::integer,'paymentMethod',e.payment_method,'expenseDate',e.expense_date,'accountSettlementCertified',false) INTO result FROM public.expenses e WHERE e.id=eid AND e.store_id=p_store_id AND e.organization_id=o AND e.amount=v_amount;
 IF result IS NULL OR result->>'currency' IS DISTINCT FROM a.currency THEN RAISE EXCEPTION 'EXPENSE_RECONCILIATION_FAILED';END IF;
 INSERT INTO backend_core.native_financial_requests VALUES(p_store_id,p_request_id,o,actor,'EXPENSE',body,result,clock_timestamp());
 DELETE FROM backend_core.native_financial_intents WHERE backend_pid=pg_backend_pid() AND transaction_id=txid_current();RETURN result;
END $$;
CREATE FUNCTION backend_core.protect_native_expense_v1() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF OLD.currency_context->>'currency'<>'TZS' THEN RAISE EXCEPTION 'NATIVE_EXPENSE_REVERSAL_CONTRACT_REQUIRED';END IF;
 IF TG_OP='DELETE' THEN RETURN OLD;END IF;RETURN NEW;
END $$;
CREATE TRIGGER protect_native_expense_v1 BEFORE UPDATE OR DELETE ON public.expenses FOR EACH ROW EXECUTE FUNCTION backend_core.protect_native_expense_v1();
DO $$ DECLARE fn regprocedure;r record;BEGIN
 FOREACH fn IN ARRAY ARRAY['public.create_native_expense_v1(uuid,uuid,text,integer,jsonb)'::regprocedure,'backend_core.protect_native_expense_v1()'::regprocedure] LOOP
 EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC',fn);
 FOR r IN SELECT DISTINCT pg_get_userbyid(a.grantee) AS name FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid=fn AND a.grantee<>p.proowner AND a.grantee<>0 LOOP EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %I',fn,r.name);END LOOP;
 END LOOP;
END $$;

COMMIT;
