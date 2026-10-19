-- LOCAL DRAFT ONLY. Future-row context; no historical backfill/native activation.
BEGIN;
SET LOCAL lock_timeout='2s'; SET LOCAL statement_timeout='30s';
DO $$ BEGIN
 IF to_regclass('proforma_backend.accounting_currency') IS NULL OR to_regprocedure('backend_core.active_subject()') IS NULL THEN RAISE EXCEPTION 'VERIFIED_CURRENCY_DEPENDENCIES_REQUIRED'; END IF;
 IF to_regprocedure('backend_core.capture_financial_currency_v1()') IS NOT NULL THEN RAISE EXCEPTION 'MIGRATION_ALREADY_PRESENT'; END IF;
 IF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name IN ('sales','sale_payments','expenses') AND column_name='currency_context') THEN RAISE EXCEPTION 'CURRENCY_CONTEXT_BASELINE_MISMATCH'; END IF;
END $$;
ALTER TABLE public.sales ADD COLUMN currency_context jsonb;
ALTER TABLE public.sale_payments ADD COLUMN currency_context jsonb;
ALTER TABLE public.expenses ADD COLUMN currency_context jsonb;
CREATE FUNCTION backend_core.capture_financial_currency_v1() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE context jsonb; authority proforma_backend.accounting_currency%ROWTYPE; parent_org uuid; parent_store uuid;
BEGIN
 IF TG_TABLE_SCHEMA<>'public' OR TG_TABLE_NAME NOT IN ('sales','sale_payments','expenses') THEN RAISE EXCEPTION 'INVALID_CURRENCY_TRIGGER_TARGET'; END IF;
 IF TG_OP='UPDATE' THEN
  IF NEW.currency_context IS DISTINCT FROM OLD.currency_context OR NEW.organization_id IS DISTINCT FROM OLD.organization_id OR NEW.store_id IS DISTINCT FROM OLD.store_id THEN RAISE EXCEPTION 'IMMUTABLE_FINANCIAL_CURRENCY_CONTEXT'; END IF;
  IF TG_TABLE_NAME='sale_payments' AND (to_jsonb(NEW)->>'sale_id') IS DISTINCT FROM (to_jsonb(OLD)->>'sale_id') THEN RAISE EXCEPTION 'IMMUTABLE_PAYMENT_SALE'; END IF;
  RETURN NEW;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.stores s WHERE s.id=NEW.store_id AND s.organization_id=NEW.organization_id) THEN RAISE EXCEPTION 'CURRENCY_STORE_SCOPE_MISMATCH'; END IF;
 SELECT * INTO authority FROM proforma_backend.accounting_currency WHERE organization_id=NEW.organization_id;
 IF FOUND AND authority.currency<>'TZS' THEN RAISE EXCEPTION 'NATIVE_FINANCIAL_POSTING_NOT_CERTIFIED'; END IF;
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
REVOKE ALL ON FUNCTION backend_core.capture_financial_currency_v1() FROM PUBLIC,anon,authenticated,service_role;
-- Function-level default grants must not expose a trigger helper to any role.
DO $$ DECLARE role_name text; BEGIN
 FOR role_name IN SELECT DISTINCT r.rolname FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a JOIN pg_roles r ON r.oid=a.grantee WHERE p.oid='backend_core.capture_financial_currency_v1()'::regprocedure AND a.grantee<>p.proowner LOOP
 EXECUTE format('REVOKE ALL ON FUNCTION backend_core.capture_financial_currency_v1() FROM %I',role_name);
 END LOOP;
END $$;
CREATE TRIGGER financial_currency_context_v1 BEFORE INSERT OR UPDATE ON public.sales FOR EACH ROW EXECUTE FUNCTION backend_core.capture_financial_currency_v1();
CREATE TRIGGER financial_currency_context_v1 BEFORE INSERT OR UPDATE ON public.sale_payments FOR EACH ROW EXECUTE FUNCTION backend_core.capture_financial_currency_v1();
CREATE TRIGGER financial_currency_context_v1 BEFORE INSERT OR UPDATE ON public.expenses FOR EACH ROW EXECUTE FUNCTION backend_core.capture_financial_currency_v1();
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid='backend_core.capture_financial_currency_v1()'::regprocedure AND a.grantee<>p.proowner) THEN RAISE EXCEPTION 'UNSAFE_TRIGGER_ACL'; END IF;
END $$;
COMMIT;
