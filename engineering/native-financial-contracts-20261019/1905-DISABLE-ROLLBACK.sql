BEGIN;
SET LOCAL lock_timeout='2s';
SET LOCAL statement_timeout='20s';
UPDATE backend_core.native_financial_rollout SET enabled=false;
DO $$ DECLARE f record;r record;BEGIN
 FOR f IN SELECT p.oid,p.proowner FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE
 (n.nspname='public' AND p.proname IN ('create_native_sale_v1','repay_native_credit_v1','native_cashier_shift_v1','get_native_sale_result_v1')) OR
 (n.nspname='backend_core' AND p.proname IN ('native_financial_policy_v1','bind_native_currency_v1')) LOOP
 EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC',f.oid::regprocedure);
 FOR r IN SELECT DISTINCT a.grantee FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid=f.oid AND a.grantee<>0 AND a.grantee<>f.proowner LOOP
 EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %I',f.oid::regprocedure,pg_get_userbyid(r.grantee));END LOOP;
 END LOOP;
END $$;
-- Retain financial facts, request receipts, widened precision and contexts.
-- Do not narrow numeric columns, drop ledgers or restore a stale full backup.
COMMIT;

