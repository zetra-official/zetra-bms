BEGIN READ ONLY;
SET LOCAL statement_timeout='10s';
SELECT p.oid::regprocedure,p.prosecdef,pg_get_userbyid(p.proowner),p.proconfig,p.proacl,
 md5(replace(pg_get_functiondef(p.oid),chr(13),'')) definition_md5
FROM pg_proc p WHERE p.oid IN(
 'public.create_org_with_store_currency_tzs_v1(uuid,text,text,text,text,boolean)'::regprocedure,
 'public.create_org_with_store_currency_v1(uuid,text,text,text,text,boolean)'::regprocedure);
SELECT r.rolname,
 has_function_privilege(r.oid,'public.create_org_with_store_currency_tzs_v1(uuid,text,text,text,text,boolean)'::regprocedure,'EXECUTE') gateway_execute,
 has_function_privilege(r.oid,'public.create_org_with_store_currency_v1(uuid,text,text,text,text,boolean)'::regprocedure,'EXECUTE') core_execute
FROM pg_roles r WHERE r.rolname IN('anon','authenticated','service_role','authenticator','cli_login_postgres','postgres');
ROLLBACK;
