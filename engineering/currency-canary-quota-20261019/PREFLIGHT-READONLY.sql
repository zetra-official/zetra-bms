-- Execute read-only immediately before a separately approved future migration.
BEGIN READ ONLY;SET LOCAL statement_timeout='10s';
SELECT jsonb_build_object('database',current_database(),'role',current_user,
 'ownerBypassRls',(SELECT rolbypassrls FROM pg_roles WHERE rolname='postgres'),
 'gatewayMd5',md5(replace(pg_get_functiondef('public.create_org_with_store_currency_tzs_v1(uuid,text,text,text,text,boolean)'::regprocedure),chr(13),'')),
 'coreMd5',md5(replace(pg_get_functiondef('public.create_org_with_store_currency_v1(uuid,text,text,text,text,boolean)'::regprocedure),chr(13),'')),
 'quotaAbsent',to_regclass('backend_core.tzs_onboarding_canary_quota') IS NULL,
 'enabled',(SELECT enabled FROM backend_core.tzs_onboarding_rollout WHERE singleton),
 'enrolledActors',(SELECT count(*) FROM backend_core.tzs_onboarding_allowlist),
 'apiExecutePaths',(SELECT count(*) FROM pg_roles r CROSS JOIN pg_proc p WHERE r.rolname IN('anon','authenticated','service_role','authenticator') AND p.oid IN('public.create_org_with_store_currency_tzs_v1(uuid,text,text,text,text,boolean)'::regprocedure,'public.create_org_with_store_currency_v1(uuid,text,text,text,text,boolean)'::regprocedure) AND has_function_privilege(r.oid,p.oid,'EXECUTE')),
 'clientOwnerPaths',(SELECT count(*) FROM pg_roles WHERE rolname IN('anon','authenticated','service_role','authenticator') AND (rolsuper OR pg_has_role(oid,'postgres','MEMBER') OR pg_has_role(oid,'cli_login_postgres','MEMBER')))
) metadata;
ROLLBACK;
