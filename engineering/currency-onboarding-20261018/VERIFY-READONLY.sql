-- Metadata only. No onboarding call or customer transaction access.
BEGIN READ ONLY;
SET LOCAL statement_timeout='10s';
SELECT p.oid::regprocedure::text identity,p.prosecdef,p.proconfig,
 md5(replace(pg_get_functiondef(p.oid),chr(13),'')) definition_md5,
 has_function_privilege('authenticated',p.oid,'EXECUTE') authenticated_execute,
 has_function_privilege('anon',p.oid,'EXECUTE') anonymous_execute,
 has_function_privilege('service_role',p.oid,'EXECUTE') service_execute
FROM pg_proc p WHERE p.oid='public.create_org_with_store_currency_v1(uuid,text,text,text,text,boolean)'::regprocedure;
SELECT c.relrowsecurity,c.relforcerowsecurity,
 has_table_privilege('authenticated',c.oid,'SELECT') client_select,
 has_table_privilege('authenticated',c.oid,'INSERT') client_insert
FROM pg_class c WHERE c.oid='backend_core.currency_onboarding_requests'::regclass;
ROLLBACK;
