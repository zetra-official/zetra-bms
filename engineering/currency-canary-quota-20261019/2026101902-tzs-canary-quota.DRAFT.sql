-- LOCAL DRAFT ONLY. Installs one-intent quota, keeps all RPCs quarantined.
BEGIN;
SET LOCAL lock_timeout='3s';SET LOCAL statement_timeout='30s';
DO $baseline$ BEGIN
 IF current_user<>'postgres' OR md5(replace(pg_get_functiondef('public.create_org_with_store_currency_tzs_v1(uuid,text,text,text,text,boolean)'::regprocedure),chr(13),''))<>'a1a33dfe9a5de26fed5c04c42eee1044' THEN RAISE EXCEPTION 'ROLLOUT_BASELINE_CHANGED';END IF;
 IF md5(replace(pg_get_functiondef('public.create_org_with_store_currency_v1(uuid,text,text,text,text,boolean)'::regprocedure),chr(13),''))<>'c5ce18052f9b2f0a1f1629d46920a97c' THEN RAISE EXCEPTION 'CORE_BASELINE_CHANGED';END IF;
 IF NOT EXISTS(SELECT 1 FROM backend_core.tzs_onboarding_rollout WHERE singleton AND NOT enabled) OR EXISTS(SELECT 1 FROM backend_core.tzs_onboarding_allowlist) THEN RAISE EXCEPTION 'CANARY_ALREADY_ENROLLED';END IF;
 IF EXISTS(SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(p.proacl) a WHERE p.oid IN('public.create_org_with_store_currency_tzs_v1(uuid,text,text,text,text,boolean)'::regprocedure,'public.create_org_with_store_currency_v1(uuid,text,text,text,text,boolean)'::regprocedure) AND a.grantee<>p.proowner) THEN RAISE EXCEPTION 'BASELINE_NOT_QUARANTINED';END IF;
END $baseline$;
CREATE TABLE backend_core.tzs_onboarding_canary_quota (
 actor_id uuid PRIMARY KEY, request_id uuid NOT NULL,
 fingerprint jsonb NOT NULL CHECK(jsonb_typeof(fingerprint)='array' AND jsonb_array_length(fingerprint)=5),
 approval_reference text NOT NULL CHECK(length(btrim(approval_reference))>0),
 approved_at timestamptz NOT NULL DEFAULT statement_timestamp(),
 result jsonb, consumed_at timestamptz,
 CHECK((result IS NULL)=(consumed_at IS NULL))
);
ALTER TABLE backend_core.tzs_onboarding_canary_quota ENABLE ROW LEVEL SECURITY;
ALTER TABLE backend_core.tzs_onboarding_canary_quota FORCE ROW LEVEL SECURITY;
REVOKE ALL ON backend_core.tzs_onboarding_canary_quota FROM PUBLIC,anon,authenticated,service_role;
DO $private$ DECLARE grantee record;BEGIN
 FOR grantee IN SELECT DISTINCT a.grantee FROM pg_class c CROSS JOIN LATERAL aclexplode(c.relacl) a WHERE c.oid='backend_core.tzs_onboarding_canary_quota'::regclass AND a.grantee<>c.relowner AND a.grantee<>0 LOOP
 EXECUTE format('REVOKE ALL ON backend_core.tzs_onboarding_canary_quota FROM %I',pg_get_userbyid(grantee.grantee));END LOOP;
END $private$;
CREATE OR REPLACE FUNCTION public.create_org_with_store_currency_tzs_v1(p_request_id uuid,p_org_name text,p_first_store_name text,
 p_currency text DEFAULT 'TZS',p_timezone text DEFAULT 'Africa/Dar_es_Salaam',p_acknowledged boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid; rollout_enabled boolean; intent backend_core.tzs_onboarding_canary_quota%ROWTYPE; canonical_result jsonb;
BEGIN
 actor:=backend_core.active_subject();
 IF actor IS NULL OR auth.role() IS DISTINCT FROM 'authenticated' THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED';END IF;
 IF jsonb_typeof(auth.jwt()->'exp') IS DISTINCT FROM 'number' THEN RAISE EXCEPTION 'AUTH_SESSION_EXPIRED';END IF;
 IF (auth.jwt()->>'exp')::numeric<=extract(epoch FROM clock_timestamp()) THEN RAISE EXCEPTION 'AUTH_SESSION_EXPIRED';END IF;
 IF p_currency IS DISTINCT FROM 'TZS' THEN RAISE EXCEPTION 'NATIVE_ACCOUNTING_CURRENCY_UNSUPPORTED';END IF;
 SELECT enabled INTO rollout_enabled FROM backend_core.tzs_onboarding_rollout WHERE singleton FOR SHARE;
 IF NOT FOUND OR rollout_enabled IS DISTINCT FROM true THEN RAISE EXCEPTION 'TZS_ROLLOUT_NOT_ENABLED';END IF;
 PERFORM 1 FROM backend_core.tzs_onboarding_allowlist a WHERE a.actor_id=actor AND a.expires_at>clock_timestamp() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'TZS_ROLLOUT_NOT_ENABLED';END IF;
 SELECT * INTO intent FROM backend_core.tzs_onboarding_canary_quota q WHERE q.actor_id=actor FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'CANARY_INTENT_NOT_APPROVED';END IF;
 IF p_request_id IS DISTINCT FROM intent.request_id OR
  jsonb_build_array(btrim(p_org_name),btrim(p_first_store_name),p_currency,p_timezone,p_acknowledged) IS DISTINCT FROM intent.fingerprint
 THEN RAISE EXCEPTION 'CANARY_QUOTA_OR_INTENT_MISMATCH';END IF;
 -- Recheck time after lock waits; entry-time checks cannot extend enrollment.
 IF (auth.jwt()->>'exp')::numeric<=extract(epoch FROM clock_timestamp()) THEN RAISE EXCEPTION 'AUTH_SESSION_EXPIRED';END IF;
 IF NOT EXISTS(SELECT 1 FROM backend_core.tzs_onboarding_allowlist a WHERE a.actor_id=actor AND a.expires_at>clock_timestamp()) THEN RAISE EXCEPTION 'TZS_ROLLOUT_NOT_ENABLED';END IF;
 canonical_result:=public.create_org_with_store_currency_v1(p_request_id,p_org_name,p_first_store_name,p_currency,p_timezone,p_acknowledged);
 IF canonical_result->>'currency' IS DISTINCT FROM 'TZS' OR canonical_result->>'status' IS DISTINCT FROM 'CONFIRMED'
  OR canonical_result->'postingActivated' IS DISTINCT FROM 'false'::jsonb
  OR NOT EXISTS(SELECT 1 FROM public.organizations o JOIN public.org_memberships m ON m.organization_id=o.id
   WHERE o.id=(canonical_result->>'organizationId')::uuid AND o.created_by=actor AND m.user_id=actor AND m.is_active IS TRUE AND lower(m.role)='owner')
  OR (SELECT count(*) FROM public.stores WHERE organization_id=(canonical_result->>'organizationId')::uuid)<>1
  OR NOT EXISTS(SELECT 1 FROM public.stores WHERE id=(canonical_result->>'storeId')::uuid AND organization_id=(canonical_result->>'organizationId')::uuid)
 THEN RAISE EXCEPTION 'CANARY_RESULT_INVALID';END IF;
 IF intent.result IS NOT NULL AND intent.result IS DISTINCT FROM canonical_result THEN RAISE EXCEPTION 'CANARY_RESULT_CHANGED';END IF;
 IF intent.result IS NULL THEN
  UPDATE backend_core.tzs_onboarding_canary_quota SET result=canonical_result,consumed_at=statement_timestamp() WHERE actor_id=actor;
 END IF;
 RETURN canonical_result;
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
