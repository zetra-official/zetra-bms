-- Disable only the new entry points; retain all sales, payments, stock, credit and audit links.
BEGIN;
SET LOCAL lock_timeout='2s';
SET LOCAL statement_timeout='15s';
REVOKE EXECUTE ON FUNCTION public.proforma_conversion_preview_v1(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE EXECUTE ON FUNCTION public.proforma_conversion_commit_v1(uuid,uuid,uuid,uuid,jsonb,jsonb) FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
