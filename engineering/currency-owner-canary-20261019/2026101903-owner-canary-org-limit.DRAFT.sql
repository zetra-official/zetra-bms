-- LOCAL REVIEW DRAFT: explicit Owner-only canary org-limit exception, not a plan upgrade.
BEGIN;SET LOCAL lock_timeout='3s';SET LOCAL statement_timeout='30s';
DO $baseline$ BEGIN
 IF current_user<>'postgres' OR md5(replace(pg_get_functiondef('public.create_org_with_store(text,text)'::regprocedure),chr(13),''))<>'4883dcef2455a74f1938f4bebb03558e'
 OR md5(replace(pg_get_functiondef('public.create_org_with_store_currency_tzs_v1(uuid,text,text,text,text,boolean)'::regprocedure),chr(13),''))<>'953346c2582e3f4ae047796ec87ff0bf' THEN RAISE EXCEPTION 'CANARY_OR_CANONICAL_BASELINE_CHANGED';END IF;
 IF NOT EXISTS(SELECT 1 FROM backend_core.tzs_onboarding_rollout WHERE singleton AND NOT enabled) OR EXISTS(SELECT 1 FROM backend_core.tzs_onboarding_allowlist WHERE expires_at>clock_timestamp()) THEN RAISE EXCEPTION 'CANARY_ALREADY_ACTIVE';END IF;
 IF EXISTS(SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(p.proacl) a WHERE p.oid IN('public.create_org_with_store_currency_tzs_v1(uuid,text,text,text,text,boolean)'::regprocedure,'public.create_org_with_store_currency_v1(uuid,text,text,text,text,boolean)'::regprocedure) AND a.grantee<>p.proowner) THEN RAISE EXCEPTION 'CORE_OR_GATEWAY_NOT_QUARANTINED';END IF;
END $baseline$;
CREATE TABLE backend_core.tzs_canary_creation_permits (
 actor_id uuid PRIMARY KEY CHECK(actor_id='bb2d6dee-773d-4fa7-8fda-1eb85bbad2cd'::uuid),
 request_id uuid NOT NULL,backend_pid integer NOT NULL,transaction_id bigint NOT NULL,used boolean NOT NULL DEFAULT false
);
ALTER TABLE backend_core.tzs_canary_creation_permits ENABLE ROW LEVEL SECURITY;
ALTER TABLE backend_core.tzs_canary_creation_permits FORCE ROW LEVEL SECURITY;
REVOKE ALL ON backend_core.tzs_canary_creation_permits FROM PUBLIC,anon,authenticated,service_role;
DO $private$ DECLARE g record;BEGIN
 FOR g IN SELECT DISTINCT a.grantee FROM pg_class c CROSS JOIN LATERAL aclexplode(c.relacl) a WHERE c.oid='backend_core.tzs_canary_creation_permits'::regclass AND a.grantee<>c.relowner AND a.grantee<>0 LOOP
 EXECUTE format('REVOKE ALL ON backend_core.tzs_canary_creation_permits FROM %I',pg_get_userbyid(g.grantee));END LOOP;
END $private$;
CREATE FUNCTION backend_core.consume_tzs_canary_org_permit(p_actor uuid) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE allowed boolean;BEGIN
 IF p_actor IS DISTINCT FROM 'bb2d6dee-773d-4fa7-8fda-1eb85bbad2cd'::uuid OR auth.uid() IS DISTINCT FROM p_actor OR auth.role() IS DISTINCT FROM 'authenticated'
  OR jsonb_typeof(auth.jwt()->'exp') IS DISTINCT FROM 'number' THEN RETURN false;END IF;
 IF (auth.jwt()->>'exp')::numeric<=extract(epoch FROM clock_timestamp()) THEN RETURN false;END IF;
 UPDATE backend_core.tzs_canary_creation_permits t SET used=true
 WHERE t.actor_id=p_actor AND t.backend_pid=pg_backend_pid() AND t.transaction_id=txid_current() AND NOT t.used
 AND EXISTS(SELECT 1 FROM backend_core.tzs_onboarding_rollout WHERE singleton AND enabled)
 AND EXISTS(SELECT 1 FROM backend_core.tzs_onboarding_allowlist a WHERE a.actor_id=p_actor AND a.expires_at>clock_timestamp())
 AND EXISTS(SELECT 1 FROM backend_core.tzs_onboarding_canary_quota q WHERE q.actor_id=p_actor AND q.request_id=t.request_id AND q.result IS NULL)
 RETURNING true INTO allowed;
 RETURN coalesce(allowed,false);
END $$;
REVOKE ALL ON FUNCTION backend_core.consume_tzs_canary_org_permit(uuid) FROM PUBLIC,anon,authenticated,service_role;
DO $acl$ DECLARE g record;BEGIN
 FOR g IN SELECT DISTINCT a.grantee FROM pg_proc p CROSS JOIN LATERAL aclexplode(p.proacl) a WHERE p.oid='backend_core.consume_tzs_canary_org_permit(uuid)'::regprocedure AND a.grantee<>p.proowner AND a.grantee<>0 LOOP
 EXECUTE format('REVOKE ALL ON FUNCTION backend_core.consume_tzs_canary_org_permit(uuid) FROM %I',pg_get_userbyid(g.grantee));END LOOP;
END $acl$;
CREATE OR REPLACE FUNCTION public.create_org_with_store(p_org_name text, p_first_store_name text)
 RETURNS TABLE(organization_id uuid, store_id uuid, membership_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid;
  v_org_id uuid;
  v_store_id uuid;
  v_membership_id uuid;
  v_plan_code text := 'FREE';
  v_max_orgs integer := 1;
  v_owned_orgs integer := 0;
BEGIN
  v_uid := auth.uid();

  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF coalesce(trim(p_org_name), '') = '' THEN
    RAISE EXCEPTION 'Business name is required';
  END IF;

  IF coalesce(trim(p_first_store_name), '') = '' THEN
    RAISE EXCEPTION 'First store name is required';
  END IF;

  BEGIN
    SELECT
      x.plan_code,
      x.max_organizations
    INTO
      v_plan_code,
      v_max_orgs
    FROM public._get_my_effective_plan() x
    LIMIT 1;
  EXCEPTION
    WHEN OTHERS THEN
      v_plan_code := 'FREE';
      v_max_orgs := 1;
  END;

  v_plan_code := coalesce(upper(trim(v_plan_code)), 'FREE');
  v_max_orgs := coalesce(v_max_orgs, 1);

  SELECT count(DISTINCT m.organization_id)::int
    INTO v_owned_orgs
  FROM public.org_memberships m
  WHERE m.user_id = v_uid
    AND m.role = 'owner';

  IF coalesce(v_owned_orgs, 0) >= v_max_orgs AND NOT backend_core.consume_tzs_canary_org_permit(v_uid) THEN
    RAISE EXCEPTION
      'ORG_LIMIT_REACHED: plan=% | orgs_allowed=% | owned=%',
      v_plan_code,
      v_max_orgs,
      v_owned_orgs;
  END IF;

  INSERT INTO public.organizations (
    name,
    created_by
  )
  VALUES (
    trim(p_org_name),
    v_uid
  )
  RETURNING id INTO v_org_id;

  INSERT INTO public.stores (
    organization_id,
    name,
    created_by
  )
  VALUES (
    v_org_id,
    trim(p_first_store_name),
    v_uid
  )
  RETURNING id INTO v_store_id;

  INSERT INTO public.org_memberships (
    organization_id,
    user_id,
    role
  )
  VALUES (
    v_org_id,
    v_uid,
    'owner'
  )
  RETURNING id INTO v_membership_id;

  INSERT INTO public.org_membership_stores (
    membership_id,
    store_id
  )
  VALUES (
    v_membership_id,
    v_store_id
  )
  ON CONFLICT DO NOTHING;

  organization_id := v_org_id;
  store_id := v_store_id;
  membership_id := v_membership_id;
  RETURN NEXT;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.create_org_with_store_currency_tzs_v1(p_request_id uuid,p_org_name text,p_first_store_name text,
 p_currency text DEFAULT 'TZS',p_timezone text DEFAULT 'Africa/Dar_es_Salaam',p_acknowledged boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid; rollout_enabled boolean; intent backend_core.tzs_onboarding_canary_quota%ROWTYPE; canonical_result jsonb;
BEGIN
 actor:=backend_core.active_subject();
 IF actor IS DISTINCT FROM 'bb2d6dee-773d-4fa7-8fda-1eb85bbad2cd'::uuid THEN RAISE EXCEPTION 'OWNER_CANARY_ACTOR_REQUIRED';END IF;
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
 IF intent.result IS NULL THEN
  INSERT INTO backend_core.tzs_canary_creation_permits(actor_id,request_id,backend_pid,transaction_id)
  VALUES(actor,p_request_id,pg_backend_pid(),txid_current());
 END IF;
 canonical_result:=public.create_org_with_store_currency_v1(p_request_id,p_org_name,p_first_store_name,p_currency,p_timezone,p_acknowledged);
 DELETE FROM backend_core.tzs_canary_creation_permits WHERE actor_id=actor AND backend_pid=pg_backend_pid() AND transaction_id=txid_current();
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
DO $post$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles r WHERE NOT r.rolsuper AND r.rolname<>'postgres' AND has_function_privilege(r.oid,'backend_core.consume_tzs_canary_org_permit(uuid)'::regprocedure,'EXECUTE')) THEN RAISE EXCEPTION 'PERMIT_HELPER_EXPOSED';END IF;
 IF EXISTS(SELECT 1 FROM backend_core.tzs_canary_creation_permits) THEN RAISE EXCEPTION 'UNEXPECTED_LIVE_PERMIT';END IF;
END $post$;
COMMIT;

