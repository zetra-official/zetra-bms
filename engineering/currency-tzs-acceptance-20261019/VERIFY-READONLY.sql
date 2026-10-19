BEGIN READ ONLY;
SET LOCAL statement_timeout='10s';
SELECT p.oid::regprocedure,pg_get_userbyid(p.proowner),p.prosecdef,p.proconfig,p.proacl,
 md5(replace(pg_get_functiondef(p.oid),chr(13),'')) definition_md5
FROM pg_proc p WHERE p.oid IN(
 'public.create_org_with_store_currency_tzs_v1(uuid,text,text,text,text,boolean)'::regprocedure,
 'public.create_org_with_store_currency_v1(uuid,text,text,text,text,boolean)'::regprocedure);
SELECT r.rolname,
 has_function_privilege(r.oid,'public.create_org_with_store_currency_tzs_v1(uuid,text,text,text,text,boolean)'::regprocedure,'EXECUTE') gateway_execute,
 has_function_privilege(r.oid,'public.create_org_with_store_currency_v1(uuid,text,text,text,text,boolean)'::regprocedure,'EXECUTE') core_execute
FROM pg_roles r WHERE r.rolname IN('anon','authenticated','service_role','authenticator','cli_login_postgres','postgres');
SELECT enabled FROM backend_core.tzs_onboarding_rollout WHERE singleton;
SELECT count(*) AS currently_enrolled FROM backend_core.tzs_onboarding_allowlist WHERE expires_at>clock_timestamp();
SELECT c.oid::regclass,c.relrowsecurity,c.relforcerowsecurity,c.relacl
FROM pg_class c WHERE c.oid IN('backend_core.tzs_onboarding_rollout'::regclass,'backend_core.tzs_onboarding_allowlist'::regclass,'backend_core.tzs_onboarding_rollout_audit'::regclass);
ROLLBACK;
