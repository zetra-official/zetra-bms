-- Preserve every saved Proforma/revision. No financial rollback required.
BEGIN;
SET LOCAL lock_timeout='2s';
REVOKE EXECUTE ON FUNCTION public.proforma_document_fx_v1(uuid,uuid,uuid,uuid,integer,jsonb) FROM authenticated;
COMMIT;
