BEGIN; SET LOCAL lock_timeout='3s'; SET LOCAL statement_timeout='30s';
UPDATE backend_core.original_evidence_adapters SET enabled=false WHERE enabled;
DO $$DECLARE p record;r record;BEGIN
 FOR p IN SELECT oid,proowner FROM pg_proc WHERE pronamespace='backend_core'::regnamespace AND proname IN('capture_original_sale_evidence_v1','original_refund_slice_v1') LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC',p.oid::regprocedure);
  FOR r IN SELECT DISTINCT pg_get_userbyid(a.grantee) name FROM aclexplode(coalesce((SELECT proacl FROM pg_proc WHERE oid=p.oid),acldefault('f',p.proowner))) a WHERE a.grantee<>p.proowner AND a.grantee<>0 LOOP EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %I',p.oid::regprocedure,r.name);END LOOP;
 END LOOP;
END$$;
-- Retain all original snapshots; no DROP, monetary rewrite, stock or payment action.
COMMIT;
