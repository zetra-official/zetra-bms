BEGIN;
SET LOCAL lock_timeout='2s';SET LOCAL statement_timeout='15s';
-- Add to1906-DISABLE and1905-DISABLE-ROLLBACK. Do not delete monetary facts,
-- provenance, idempotency receipts, guards, original context, or precision.
REVOKE ALL ON FUNCTION public.read_original_financial_facts_v1(uuid,text,timestamptz,timestamptz,integer,integer,timestamptz) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.receive_purchase_once_v1(uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;
DO $$DECLARE p record;r record;BEGIN
 FOR p IN SELECT oid,proowner FROM pg_proc WHERE oid IN ('public.read_original_financial_facts_v1(uuid,text,timestamptz,timestamptz,integer,integer,timestamptz)'::regprocedure,'public.receive_purchase_once_v1(uuid,uuid,jsonb)'::regprocedure) LOOP
 FOR r IN SELECT DISTINCT pg_get_userbyid(a.grantee) name FROM aclexplode(coalesce((SELECT proacl FROM pg_proc WHERE oid=p.oid),acldefault('f',p.proowner))) a WHERE a.grantee<>p.proowner AND a.grantee<>0 LOOP EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %I',p.oid::regprocedure,r.name);END LOOP;
 END LOOP;
END $$;
COMMIT;
