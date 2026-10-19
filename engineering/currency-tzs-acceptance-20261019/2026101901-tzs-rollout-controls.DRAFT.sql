-- Review only: TZS-only entry point. Core 1802 remains client-quarantined.
BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='30s';
DO $preflight$ BEGIN
 IF md5(replace(pg_get_functiondef('public.create_org_with_store_currency_tzs_v1(uuid,text,text,text,text,boolean)'::regprocedure),chr(13),''))<>'13057618f9362520fa8bd4ffdd20ed2f' THEN RAISE EXCEPTION 'GATEWAY_BASELINE_CHANGED';END IF;
 IF current_user<>'postgres' OR md5(replace(pg_get_functiondef('public.create_org_with_store_currency_v1(uuid,text,text,text,text,boolean)'::regprocedure),chr(13),''))<>'c5ce18052f9b2f0a1f1629d46920a97c' THEN RAISE EXCEPTION 'ONBOARDING_DEPENDENCY_CHANGED';END IF;
 IF EXISTS(SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(p.proacl) a WHERE p.oid='public.create_org_with_store_currency_v1(uuid,text,text,text,text,boolean)'::regprocedure AND a.grantee<>p.proowner) THEN RAISE EXCEPTION 'CORE_NOT_QUARANTINED';END IF;
 IF EXISTS(SELECT 1 FROM pg_roles r WHERE r.rolname IN('anon','authenticated','service_role','authenticator') AND (r.rolsuper OR pg_has_role(r.oid,'postgres','MEMBER') OR EXISTS(SELECT 1 FROM pg_roles a WHERE a.rolname='cli_login_postgres' AND pg_has_role(r.oid,a.oid,'MEMBER')))) THEN RAISE EXCEPTION 'CLIENT_ADMIN_ROLE_PATH';END IF;
END $preflight$;
-- DRAFT ONLY: installs disabled rollout controls; does NOT activate RPC access.
CREATE TABLE backend_core.tzs_onboarding_rollout (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton), enabled boolean NOT NULL DEFAULT false
);
CREATE TABLE backend_core.tzs_onboarding_allowlist (
 actor_id uuid PRIMARY KEY, expires_at timestamptz NOT NULL, approval_reference text NOT NULL CHECK(length(btrim(approval_reference))>0)
);
CREATE TABLE backend_core.tzs_onboarding_rollout_audit (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, action text NOT NULL CHECK(action IN('CANARY_ENABLED','DISABLED')),
 actor_id uuid, approval_reference text NOT NULL, occurred_at timestamptz NOT NULL DEFAULT statement_timestamp()
);
INSERT INTO backend_core.tzs_onboarding_rollout(singleton,enabled) VALUES(true,false);
ALTER TABLE backend_core.tzs_onboarding_rollout ENABLE ROW LEVEL SECURITY;
ALTER TABLE backend_core.tzs_onboarding_rollout FORCE ROW LEVEL SECURITY;
ALTER TABLE backend_core.tzs_onboarding_allowlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE backend_core.tzs_onboarding_allowlist FORCE ROW LEVEL SECURITY;
ALTER TABLE backend_core.tzs_onboarding_rollout_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE backend_core.tzs_onboarding_rollout_audit FORCE ROW LEVEL SECURITY;
DO $private$ DECLARE obj record;grantee record;BEGIN
 FOR obj IN SELECT c.oid,c.relkind FROM pg_class c WHERE c.oid IN('backend_core.tzs_onboarding_rollout'::regclass,'backend_core.tzs_onboarding_allowlist'::regclass,'backend_core.tzs_onboarding_rollout_audit'::regclass,pg_get_serial_sequence('backend_core.tzs_onboarding_rollout_audit','id')::regclass) LOOP
  EXECUTE format('REVOKE ALL ON %s %s FROM PUBLIC,anon,authenticated,service_role',CASE WHEN obj.relkind='S' THEN 'SEQUENCE' ELSE 'TABLE' END,obj.oid::regclass);
  FOR grantee IN SELECT DISTINCT a.grantee FROM pg_class c CROSS JOIN LATERAL aclexplode(c.relacl) a WHERE c.oid=obj.oid AND a.grantee<>c.relowner AND a.grantee<>0 LOOP
   EXECUTE format('REVOKE ALL ON %s %s FROM %I',CASE WHEN obj.relkind='S' THEN 'SEQUENCE' ELSE 'TABLE' END,obj.oid::regclass,pg_get_userbyid(grantee.grantee));
  END LOOP;
 END LOOP;
END $private$;
CREATE OR REPLACE FUNCTION public.create_org_with_store_currency_tzs_v1(p_request_id uuid,p_org_name text,p_first_store_name text,
 p_currency text DEFAULT 'TZS',p_timezone text DEFAULT 'Africa/Dar_es_Salaam',p_acknowledged boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid; rollout_enabled boolean;
BEGIN
 actor:=backend_core.active_subject();
 IF actor IS NULL OR auth.role() IS DISTINCT FROM 'authenticated' THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED';END IF;
 IF jsonb_typeof(auth.jwt()->'exp') IS DISTINCT FROM 'number' THEN RAISE EXCEPTION 'AUTH_SESSION_EXPIRED';END IF;
 IF (auth.jwt()->>'exp')::numeric<=extract(epoch FROM clock_timestamp()) THEN RAISE EXCEPTION 'AUTH_SESSION_EXPIRED';END IF;
 IF p_currency IS DISTINCT FROM 'TZS' THEN RAISE EXCEPTION 'NATIVE_ACCOUNTING_CURRENCY_UNSUPPORTED';END IF;
 SELECT enabled INTO rollout_enabled FROM backend_core.tzs_onboarding_rollout WHERE singleton FOR SHARE;
 IF NOT FOUND OR rollout_enabled IS DISTINCT FROM true THEN RAISE EXCEPTION 'TZS_ROLLOUT_NOT_ENABLED';END IF;
 PERFORM 1 FROM backend_core.tzs_onboarding_allowlist a WHERE a.actor_id=actor AND a.expires_at>clock_timestamp() FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'TZS_ROLLOUT_NOT_ENABLED';END IF;
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
