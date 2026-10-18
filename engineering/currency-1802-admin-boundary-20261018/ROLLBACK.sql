-- REVIEW ONLY. Disable the new entry point, retaining metadata and all created
-- organizations/currency confirmations. Never delete business records to roll back.
BEGIN;
SET LOCAL lock_timeout='3s';SET LOCAL statement_timeout='10s';
DO $guard$ BEGIN IF md5(replace(pg_get_functiondef('public.create_org_with_store_currency_v1(uuid,text,text,text,text,boolean)'::regprocedure),chr(13),''))<>'c5ce18052f9b2f0a1f1629d46920a97c' THEN RAISE EXCEPTION 'ROLLBACK_POSTIMAGE_CHANGED';END IF;END $guard$;
REVOKE ALL ON FUNCTION public.create_org_with_store_currency_v1(uuid,text,text,text,text,boolean) FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
-- Restore the previous client release / keep ATOMIC_CURRENCY_ONBOARDING_ACTIVE=false.
-- Keep backend_core.currency_onboarding_requests for audit and safe retry recovery.
-- Do not drop organizations, stores, memberships, currency/audit or request rows.
