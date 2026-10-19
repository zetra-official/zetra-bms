BEGIN;
SET LOCAL lock_timeout='2s';SET LOCAL statement_timeout='20s';
UPDATE backend_core.native_financial_rollout SET enabled=false;
DO $$ DECLARE r record;fn regprocedure:='public.create_native_expense_v1(uuid,uuid,text,integer,jsonb)'::regprocedure;BEGIN
 EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC',fn);
 FOR r IN SELECT DISTINCT pg_get_userbyid(a.grantee) AS name FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid=fn AND a.grantee<>p.proowner AND a.grantee<>0 LOOP EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %I',fn,r.name);END LOOP;
END $$;
-- Retain native mutation guards and immutable expense/context/request facts.
COMMIT;
