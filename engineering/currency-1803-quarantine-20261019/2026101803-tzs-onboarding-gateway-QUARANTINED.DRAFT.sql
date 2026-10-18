-- Review only: TZS-only entry point. Core 1802 remains client-quarantined.
BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='30s';
DO $preflight$ BEGIN
 IF current_user<>'postgres' OR md5(replace(pg_get_functiondef('public.create_org_with_store_currency_v1(uuid,text,text,text,text,boolean)'::regprocedure),chr(13),''))<>'c5ce18052f9b2f0a1f1629d46920a97c' THEN RAISE EXCEPTION 'ONBOARDING_DEPENDENCY_CHANGED';END IF;
 IF EXISTS(SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(p.proacl) a WHERE p.oid='public.create_org_with_store_currency_v1(uuid,text,text,text,text,boolean)'::regprocedure AND a.grantee<>p.proowner) THEN RAISE EXCEPTION 'CORE_NOT_QUARANTINED';END IF;
 IF EXISTS(SELECT 1 FROM pg_roles r WHERE r.rolname IN('anon','authenticated','service_role','authenticator') AND (r.rolsuper OR pg_has_role(r.oid,'postgres','MEMBER') OR EXISTS(SELECT 1 FROM pg_roles a WHERE a.rolname='cli_login_postgres' AND pg_has_role(r.oid,a.oid,'MEMBER')))) THEN RAISE EXCEPTION 'CLIENT_ADMIN_ROLE_PATH';END IF;
END $preflight$;
CREATE FUNCTION public.create_org_with_store_currency_tzs_v1(p_request_id uuid,p_org_name text,p_first_store_name text,
 p_currency text DEFAULT 'TZS',p_timezone text DEFAULT 'Africa/Dar_es_Salaam',p_acknowledged boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF backend_core.active_subject() IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED';END IF;
 IF p_currency IS DISTINCT FROM 'TZS' THEN RAISE EXCEPTION 'NATIVE_ACCOUNTING_CURRENCY_UNSUPPORTED';END IF;
 RETURN public.create_org_with_store_currency_v1(p_request_id,p_org_name,p_first_store_name,p_currency,p_timezone,p_acknowledged);
END $$;
REVOKE ALL ON FUNCTION public.create_org_with_store_currency_tzs_v1(uuid,text,text,text,text,boolean) FROM PUBLIC,anon,authenticated,service_role;
DO $quarantine$
DECLARE f oid:='public.create_org_with_store_currency_tzs_v1(uuid,text,text,text,text,boolean)'::regprocedure; g record;
BEGIN
 -- Pin the observed administrative login boundary; never grant or alter managed roles.
 IF (SELECT proowner FROM pg_proc WHERE oid=f)<>'postgres'::regrole THEN RAISE EXCEPTION 'UNEXPECTED_FUNCTION_OWNER'; END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='cli_login_postgres') AND NOT EXISTS(
  SELECT 1 FROM pg_roles r WHERE r.rolname='cli_login_postgres' AND r.rolcanlogin AND NOT r.rolsuper AND NOT r.rolinherit
   AND pg_has_role(r.oid,'postgres','SET') AND NOT pg_has_role(r.oid,'postgres','USAGE')
 ) THEN RAISE EXCEPTION 'CLI_ADMIN_BOUNDARY_CHANGED'; END IF;
 IF EXISTS(SELECT 1 FROM pg_roles c WHERE c.rolname IN('anon','authenticated','service_role','authenticator') AND (
  c.rolsuper OR pg_has_role(c.oid,'postgres','MEMBER') OR EXISTS(SELECT 1 FROM pg_roles a WHERE a.rolname='cli_login_postgres' AND pg_has_role(c.oid,a.oid,'MEMBER'))
 )) THEN RAISE EXCEPTION 'CLIENT_ADMIN_ROLE_PATH'; END IF;
 -- Remove grants introduced by owner-specific default ACLs, including inherited roles.
 FOR g IN SELECT DISTINCT a.grantee FROM pg_proc p CROSS JOIN LATERAL aclexplode(p.proacl) a WHERE p.oid=f AND a.grantee<>p.proowner AND a.grantee<>0 LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION public.create_org_with_store_currency_tzs_v1(uuid,text,text,text,text,boolean) FROM %I',pg_get_userbyid(g.grantee));
 END LOOP;
 IF EXISTS(SELECT 1 FROM pg_roles r WHERE NOT r.rolsuper AND r.oid<>(SELECT proowner FROM pg_proc WHERE oid=f) AND (has_function_privilege(r.oid,f,'EXECUTE') OR (pg_has_role(r.oid,(SELECT proowner FROM pg_proc WHERE oid=f),'MEMBER') AND r.rolname<>'cli_login_postgres'))) THEN
  RAISE EXCEPTION 'ONBOARDING_QUARANTINE_EFFECTIVE_EXECUTE';
 END IF;
END $quarantine$;
COMMIT;
