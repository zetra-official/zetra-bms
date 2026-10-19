-- Separate Owner approval required. NO defaults for actor/request/approval.
BEGIN;SET LOCAL lock_timeout='3s';SET LOCAL statement_timeout='15s';
DO $activate$
DECLARE actor uuid:=nullif(current_setting('zetra.tzs_canary_actor',true),'')::uuid;
 req uuid:=nullif(current_setting('zetra.tzs_canary_request',true),'')::uuid;
 ref text:=nullif(btrim(current_setting('zetra.tzs_approval',true)),'');
 org_name text:=btrim(current_setting('zetra.tzs_canary_org',true));
 store_name text:=btrim(current_setting('zetra.tzs_canary_store',true));
 tz text:=current_setting('zetra.tzs_canary_timezone',true); fp jsonb; prior backend_core.tzs_onboarding_canary_quota%ROWTYPE;
BEGIN
 IF md5(replace(pg_get_functiondef('public.create_org_with_store_currency_tzs_v1(uuid,text,text,text,text,boolean)'::regprocedure),chr(13),''))<>'11b9c5bda14151174dae0822850ca455' THEN RAISE EXCEPTION 'QUOTA_POSTIMAGE_CHANGED';END IF;
 IF current_user<>'postgres' OR actor IS DISTINCT FROM 'bb2d6dee-773d-4fa7-8fda-1eb85bbad2cd'::uuid OR req IS NULL OR ref IS NULL THEN RAISE EXCEPTION 'EXPLICIT_CANARY_APPROVAL_REQUIRED';END IF;
 IF org_name IS NULL OR store_name IS NULL OR org_name NOT LIKE 'ZETRA CANARY TZS %' OR store_name NOT LIKE 'SYNTHETIC TZS %'
  OR length(org_name) NOT BETWEEN 18 AND 200 OR length(store_name) NOT BETWEEN 15 AND 200 OR tz IS NULL OR NOT EXISTS(SELECT 1 FROM pg_timezone_names WHERE name=tz)
 THEN RAISE EXCEPTION 'EXPLICIT_SYNTHETIC_INTENT_REQUIRED';END IF;
 IF NOT EXISTS(SELECT 1 FROM auth.users u WHERE u.id=actor AND u.email_confirmed_at IS NOT NULL AND u.role='authenticated' AND NOT coalesce(u.is_anonymous,false) AND u.deleted_at IS NULL AND (u.banned_until IS NULL OR u.banned_until<=clock_timestamp())) THEN RAISE EXCEPTION 'INVALID_CANARY_ACTOR';END IF;
 PERFORM 1 FROM backend_core.tzs_onboarding_rollout WHERE singleton FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'ROLLOUT_STATE_MISSING';END IF;
 fp:=jsonb_build_array(org_name,store_name,'TZS',tz,true);
 SELECT * INTO prior FROM backend_core.tzs_onboarding_canary_quota q WHERE q.actor_id=actor FOR UPDATE;
 IF FOUND AND (prior.request_id IS DISTINCT FROM req OR prior.fingerprint IS DISTINCT FROM fp) THEN RAISE EXCEPTION 'CANARY_INTENT_IMMUTABLE';END IF;
 IF EXISTS(SELECT 1 FROM backend_core.tzs_onboarding_allowlist WHERE actor_id<>actor AND expires_at>clock_timestamp()) THEN RAISE EXCEPTION 'OTHER_CANARY_ENROLLED';END IF;

 INSERT INTO backend_core.tzs_onboarding_canary_quota(actor_id,request_id,fingerprint,approval_reference)
 VALUES(actor,req,fp,ref) ON CONFLICT(actor_id) DO NOTHING;
 INSERT INTO backend_core.tzs_onboarding_allowlist(actor_id,expires_at,approval_reference) VALUES(actor,statement_timestamp()+interval '1 hour',ref)
 ON CONFLICT(actor_id) DO UPDATE SET expires_at=EXCLUDED.expires_at,approval_reference=EXCLUDED.approval_reference;
 UPDATE backend_core.tzs_onboarding_rollout SET enabled=true WHERE singleton;
 INSERT INTO backend_core.tzs_onboarding_rollout_audit(action,actor_id,approval_reference) VALUES('CANARY_ENABLED',actor,ref);
END $activate$;
GRANT EXECUTE ON FUNCTION public.create_org_with_store_currency_tzs_v1(uuid,text,text,text,text,boolean) TO authenticated;
DO $post$ BEGIN
 IF NOT has_function_privilege('authenticated','public.create_org_with_store_currency_tzs_v1(uuid,text,text,text,text,boolean)','EXECUTE')
 OR EXISTS(SELECT 1 FROM pg_roles WHERE rolname IN('anon','service_role','authenticator') AND has_function_privilege(oid,'public.create_org_with_store_currency_tzs_v1(uuid,text,text,text,text,boolean)'::regprocedure,'EXECUTE'))
 OR has_function_privilege('authenticated','public.create_org_with_store_currency_v1(uuid,text,text,text,text,boolean)','EXECUTE') THEN RAISE EXCEPTION 'CANARY_PERMISSION_MISMATCH';END IF;
 IF (SELECT count(*) FROM backend_core.tzs_onboarding_allowlist WHERE expires_at>clock_timestamp())<>1 THEN RAISE EXCEPTION 'CANARY_ACTOR_SCOPE_MISMATCH';END IF;
END $post$;
COMMIT;
