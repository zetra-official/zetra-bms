BEGIN READ ONLY;
SET LOCAL statement_timeout='10s';
SELECT p.oid::regprocedure AS signature,pg_get_userbyid(p.proowner) AS owner,
 p.prosecdef,p.proconfig,p.proacl,
 md5(replace(pg_get_functiondef(p.oid),chr(13),'')) AS definition_md5
FROM pg_proc p WHERE p.oid='public.create_org_with_store_currency_v1(uuid,text,text,text,text,boolean)'::regprocedure;
SELECT r.rolname,r.rolsuper,
 has_function_privilege(r.oid,p.oid,'EXECUTE') AS effective_execute,
 pg_has_role(r.oid,p.proowner,'MEMBER') AS owner_membership
FROM pg_roles r CROSS JOIN pg_proc p
WHERE p.oid='public.create_org_with_store_currency_v1(uuid,text,text,text,text,boolean)'::regprocedure;
SELECT c.relrowsecurity,c.relforcerowsecurity,c.relacl FROM pg_class c
WHERE c.oid='backend_core.currency_onboarding_requests'::regclass;
ROLLBACK;
