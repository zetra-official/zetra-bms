-- Separate explicit approval required. Requires verified actor UUID and approval reference
-- as transaction/session parameters supplied by a future exact authorized runner.
BEGIN;
SET LOCAL lock_timeout='3s';SET LOCAL statement_timeout='15s';
DO $postimage$ BEGIN IF md5(replace(pg_get_functiondef('public.create_org_with_store_currency_tzs_v1(uuid,text,text,text,text,boolean)'::regprocedure),chr(13),''))<>'a1a33dfe9a5de26fed5c04c42eee1044' THEN RAISE EXCEPTION 'ROLLOUT_POSTIMAGE_CHANGED';END IF;END $postimage$;
DO $activate$ DECLARE actor uuid:=nullif(current_setting('zetra.tzs_canary_actor',true),'')::uuid; ref text:=nullif(btrim(current_setting('zetra.tzs_approval',true)),'');BEGIN
 IF current_user<>'postgres' OR actor IS NULL OR ref IS NULL THEN RAISE EXCEPTION 'EXPLICIT_CANARY_APPROVAL_REQUIRED';END IF;
 IF NOT EXISTS(SELECT 1 FROM auth.users u WHERE u.id=actor AND u.deleted_at IS NULL AND (u.banned_until IS NULL OR u.banned_until<=clock_timestamp())) THEN RAISE EXCEPTION 'INVALID_CANARY_ACTOR';END IF;
 PERFORM 1 FROM backend_core.tzs_onboarding_rollout WHERE singleton FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'ROLLOUT_STATE_MISSING';END IF;
 INSERT INTO backend_core.tzs_onboarding_allowlist(actor_id,expires_at,approval_reference) VALUES(actor,statement_timestamp()+interval '1 hour',ref)
 ON CONFLICT(actor_id) DO UPDATE SET expires_at=EXCLUDED.expires_at,approval_reference=EXCLUDED.approval_reference;
 UPDATE backend_core.tzs_onboarding_rollout SET enabled=true WHERE singleton;
 INSERT INTO backend_core.tzs_onboarding_rollout_audit(action,actor_id,approval_reference) VALUES('CANARY_ENABLED',actor,ref);
END $activate$;
GRANT EXECUTE ON FUNCTION public.create_org_with_store_currency_tzs_v1(uuid,text,text,text,text,boolean) TO authenticated;
DO $postconditions$ BEGIN
 IF NOT has_function_privilege('authenticated','public.create_org_with_store_currency_tzs_v1(uuid,text,text,text,text,boolean)','EXECUTE') THEN RAISE EXCEPTION 'CANARY_EXECUTE_MISSING';END IF;
 IF EXISTS(SELECT 1 FROM pg_roles r WHERE r.rolname IN('anon','service_role','authenticator') AND has_function_privilege(r.oid,'public.create_org_with_store_currency_tzs_v1(uuid,text,text,text,text,boolean)'::regprocedure,'EXECUTE')) THEN RAISE EXCEPTION 'CANARY_UNAUTHORIZED_EXECUTE';END IF;
 IF has_function_privilege('authenticated','public.create_org_with_store_currency_v1(uuid,text,text,text,text,boolean)','EXECUTE') THEN RAISE EXCEPTION 'CORE_QUARANTINE_LOST';END IF;
 IF NOT EXISTS(SELECT 1 FROM backend_core.tzs_onboarding_rollout r JOIN backend_core.tzs_onboarding_allowlist a ON a.actor_id=nullif(current_setting('zetra.tzs_canary_actor',true),'')::uuid WHERE r.singleton AND r.enabled AND a.expires_at>clock_timestamp()) THEN RAISE EXCEPTION 'CANARY_ENROLLMENT_MISSING';END IF;
END $postconditions$;
COMMIT;
