DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='sales' AND column_name='currency_context') OR to_regprocedure('backend_core.capture_financial_currency_v1()') IS NULL THEN RAISE EXCEPTION 'DRAFT_1904_DEPENDENCY_REQUIRED';END IF;
END $$;
CREATE TABLE backend_core.native_financial_rollout(organization_id uuid PRIMARY KEY REFERENCES public.organizations(id),currency text NOT NULL CHECK(currency IN ('TZS','USD','KES','UGX','EUR','AED','JPY','KWD')),revision integer NOT NULL,enabled boolean NOT NULL DEFAULT false,approval_reference text NOT NULL);
CREATE TABLE backend_core.native_financial_intents(backend_pid integer NOT NULL,transaction_id bigint NOT NULL,actor_id uuid NOT NULL,organization_id uuid NOT NULL,store_id uuid NOT NULL,request_id uuid NOT NULL,PRIMARY KEY(backend_pid,transaction_id));
CREATE TABLE backend_core.native_financial_requests(store_id uuid NOT NULL REFERENCES public.stores(id),request_id uuid NOT NULL,organization_id uuid NOT NULL REFERENCES public.organizations(id),actor_id uuid NOT NULL,operation text NOT NULL CHECK(operation IN ('SALE','REPAYMENT','OPEN_SHIFT','CLOSE_SHIFT')),payload jsonb NOT NULL,result jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(store_id,request_id));
ALTER TABLE backend_core.native_financial_rollout ENABLE ROW LEVEL SECURITY;ALTER TABLE backend_core.native_financial_rollout FORCE ROW LEVEL SECURITY;
ALTER TABLE backend_core.native_financial_intents ENABLE ROW LEVEL SECURITY;ALTER TABLE backend_core.native_financial_intents FORCE ROW LEVEL SECURITY;
ALTER TABLE backend_core.native_financial_requests ENABLE ROW LEVEL SECURITY;ALTER TABLE backend_core.native_financial_requests FORCE ROW LEVEL SECURITY;
REVOKE ALL ON backend_core.native_financial_rollout,backend_core.native_financial_intents,backend_core.native_financial_requests FROM PUBLIC,anon,authenticated,service_role;
ALTER TABLE public.sales ADD COLUMN settlement_rounding numeric;
ALTER TABLE public.products ADD COLUMN currency_context jsonb;
ALTER TABLE public.credit_accounts_v2 ADD COLUMN currency_context jsonb;
ALTER TABLE public.credit_ledger_v2 ADD COLUMN currency_context jsonb;
ALTER TABLE public.cashier_shifts ADD COLUMN currency_context jsonb;
-- Numeric widening preserves original values; lock/rewrite impact must be
-- reviewed before any separately approved live execution. No backfill.
ALTER TABLE public.credit_ledger_v2 ALTER COLUMN delta TYPE numeric;
ALTER TABLE public.products ALTER COLUMN price TYPE numeric;
ALTER TABLE public.products ALTER COLUMN cost TYPE numeric;
CREATE FUNCTION backend_core.native_financial_policy_v1(s uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE o uuid;a proforma_backend.accounting_currency%ROWTYPE;digits integer;actor uuid:=backend_core.active_subject();
BEGIN
 IF actor IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED';END IF;
 PERFORM public.ensure_my_store_access(s);
 SELECT organization_id INTO o FROM public.stores WHERE id=s;IF o IS NULL THEN RAISE EXCEPTION 'CURRENCY_STORE_SCOPE_MISMATCH';END IF;
 SELECT * INTO a FROM proforma_backend.accounting_currency WHERE organization_id=o;
 IF NOT FOUND THEN RETURN jsonb_build_object('native',false,'currency',NULL,'scale',2,'discountScale',0);END IF;
 SELECT minor_units INTO digits FROM proforma_backend.currency_catalog WHERE code=a.currency;
 IF digits IS NULL THEN RAISE EXCEPTION 'CURRENCY_METADATA_UNAVAILABLE';END IF;
 IF a.currency<>'TZS' THEN
  IF NOT EXISTS(SELECT 1 FROM backend_core.native_financial_rollout r JOIN backend_core.native_financial_intents i ON i.organization_id=r.organization_id WHERE r.organization_id=o AND r.currency=a.currency AND r.revision=a.revision AND r.enabled AND i.backend_pid=pg_backend_pid() AND i.transaction_id=txid_current() AND i.actor_id=actor AND i.store_id=s) THEN RAISE EXCEPTION 'NATIVE_FINANCIAL_POSTING_NOT_CERTIFIED';END IF;
 END IF;
 RETURN jsonb_build_object('native',a.currency<>'TZS','currency',a.currency,'scale',digits,'discountScale',CASE WHEN a.currency='TZS' THEN 0 ELSE digits END);
END $$;
CREATE FUNCTION backend_core.bind_native_currency_v1() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE o uuid;s uuid;ctx jsonb;a proforma_backend.accounting_currency%ROWTYPE;
BEGIN
 IF TG_TABLE_SCHEMA<>'public' OR TG_TABLE_NAME NOT IN ('products','credit_accounts_v2','credit_ledger_v2','cashier_shifts') THEN RAISE EXCEPTION 'INVALID_CURRENCY_TRIGGER_TARGET';END IF;
 IF TG_OP='UPDATE' THEN
  IF NEW.currency_context IS DISTINCT FROM OLD.currency_context THEN RAISE EXCEPTION 'IMMUTABLE_FINANCIAL_CURRENCY_CONTEXT';END IF;
  IF TG_TABLE_NAME='cashier_shifts' AND NEW.currency_context->>'currency'<>'TZS' THEN PERFORM backend_core.native_financial_policy_v1(NEW.store_id);END IF;RETURN NEW;
 END IF;
 IF TG_TABLE_NAME='products' THEN o:=NEW.organization_id;
 ELSE s:=NEW.store_id;SELECT organization_id INTO o FROM public.stores WHERE id=s;END IF;
 IF o IS NULL THEN RAISE EXCEPTION 'CURRENCY_TENANT_MISMATCH';END IF;
 SELECT * INTO a FROM proforma_backend.accounting_currency WHERE organization_id=o;
 IF TG_TABLE_NAME='cashier_shifts' AND a.currency<>'TZS' THEN PERFORM backend_core.native_financial_policy_v1(s);END IF;
 IF TG_TABLE_NAME='credit_ledger_v2' THEN
  PERFORM backend_core.native_financial_policy_v1(s);
  SELECT currency_context INTO ctx FROM public.credit_accounts_v2 WHERE id=NEW.credit_account_id AND store_id=s;
  IF a.currency<>'TZS' AND (ctx IS NULL OR ctx->>'currency'<>a.currency OR (ctx->>'contextRevision')::integer<>a.revision) THEN RAISE EXCEPTION 'CREDIT_CURRENCY_CONTEXT_REQUIRED';END IF;
  NEW.currency_context:=ctx;
 ELSIF a.organization_id IS NOT NULL THEN
  NEW.currency_context:=jsonb_build_object('version',1,'organizationId',o,'currency',a.currency,'accountingCurrency',a.currency,'contextRevision',a.revision,'source','TRANSACTION_RECORD','exchangeRate','1','rateSource','SAME_CURRENCY_IDENTITY','displayRateUsed',false);
 ELSE NEW.currency_context:=NULL;END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER native_currency_context_v1 BEFORE INSERT OR UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION backend_core.bind_native_currency_v1();
CREATE TRIGGER native_currency_context_v1 BEFORE INSERT OR UPDATE ON public.credit_accounts_v2 FOR EACH ROW EXECUTE FUNCTION backend_core.bind_native_currency_v1();
CREATE TRIGGER native_currency_context_v1 BEFORE INSERT OR UPDATE ON public.credit_ledger_v2 FOR EACH ROW EXECUTE FUNCTION backend_core.bind_native_currency_v1();
CREATE TRIGGER native_currency_context_v1 BEFORE INSERT OR UPDATE ON public.cashier_shifts FOR EACH ROW EXECUTE FUNCTION backend_core.bind_native_currency_v1();
