from pathlib import Path
import hashlib
E=Path(__file__).resolve().parent
base=Path('engineering/currency-tzs-acceptance-20261019/2026101901-tzs-rollout-controls.DRAFT.sql')
assert hashlib.sha256(base.read_bytes()).hexdigest()=='4cd1c6e61626cd00b0e98b4c01ebfc26e66fbbb1d3a29ddf0cbf820ddee29b15'
s=base.read_text(encoding='utf-8');body=s[s.index('CREATE OR REPLACE FUNCTION'):s.index('COMMIT;')]
body=body.replace('DECLARE actor uuid; rollout_enabled boolean;','DECLARE actor uuid; rollout_enabled boolean; intent backend_core.tzs_onboarding_canary_quota%ROWTYPE; result jsonb;')
body=body.replace('FOR SHARE;\n IF NOT FOUND THEN RAISE EXCEPTION', 'FOR UPDATE;\n IF NOT FOUND THEN RAISE EXCEPTION')
body=body.replace(' RETURN public.create_org_with_store_currency_v1(p_request_id,p_org_name,p_first_store_name,p_currency,p_timezone,p_acknowledged);', ''' SELECT * INTO intent FROM backend_core.tzs_onboarding_canary_quota q WHERE q.actor_id=actor FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'CANARY_INTENT_NOT_APPROVED';END IF;
 IF p_request_id IS DISTINCT FROM intent.request_id OR
  jsonb_build_array(btrim(p_org_name),btrim(p_first_store_name),p_currency,p_timezone,p_acknowledged) IS DISTINCT FROM intent.fingerprint
 THEN RAISE EXCEPTION 'CANARY_QUOTA_OR_INTENT_MISMATCH';END IF;
 -- Recheck time after lock waits; entry-time checks cannot extend enrollment.
 IF (auth.jwt()->>'exp')::numeric<=extract(epoch FROM clock_timestamp()) THEN RAISE EXCEPTION 'AUTH_SESSION_EXPIRED';END IF;
 IF NOT EXISTS(SELECT 1 FROM backend_core.tzs_onboarding_allowlist a WHERE a.actor_id=actor AND a.expires_at>clock_timestamp()) THEN RAISE EXCEPTION 'TZS_ROLLOUT_NOT_ENABLED';END IF;
 result:=public.create_org_with_store_currency_v1(p_request_id,p_org_name,p_first_store_name,p_currency,p_timezone,p_acknowledged);
 IF result->>'currency' IS DISTINCT FROM 'TZS' OR result->>'status' IS DISTINCT FROM 'CONFIRMED'
  OR result->'postingActivated' IS DISTINCT FROM 'false'::jsonb
  OR NOT EXISTS(SELECT 1 FROM public.organizations o JOIN public.org_memberships m ON m.organization_id=o.id
   WHERE o.id=(result->>'organizationId')::uuid AND o.created_by=actor AND m.user_id=actor AND m.is_active IS TRUE AND lower(m.role)='owner')
  OR (SELECT count(*) FROM public.stores WHERE organization_id=(result->>'organizationId')::uuid)<>1
  OR NOT EXISTS(SELECT 1 FROM public.stores WHERE id=(result->>'storeId')::uuid AND organization_id=(result->>'organizationId')::uuid)
 THEN RAISE EXCEPTION 'CANARY_RESULT_INVALID';END IF;
 IF intent.result IS NOT NULL AND intent.result IS DISTINCT FROM result THEN RAISE EXCEPTION 'CANARY_RESULT_CHANGED';END IF;
 IF intent.result IS NULL THEN
  UPDATE backend_core.tzs_onboarding_canary_quota SET result=result,consumed_at=statement_timestamp() WHERE actor_id=actor;
 END IF;
 RETURN result;''')
# Qualify the PL/pgSQL value: avoid variable/column collisions in final guards/DML.
body=body.replace(' result jsonb;',' canonical_result jsonb;').replace(' result:=',' canonical_result:=').replace("result->", "canonical_result->").replace('DISTINCT FROM result THEN','DISTINCT FROM canonical_result THEN').replace('SET result=result,','SET result=canonical_result,').replace(' RETURN result;',' RETURN canonical_result;')
prefix='''-- LOCAL DRAFT ONLY. Installs one-intent quota, keeps all RPCs quarantined.
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
'''
(E/'2026101902-tzs-canary-quota.DRAFT.sql').write_text(prefix+body+'COMMIT;\n',encoding='utf-8')
print('Prepared local quota SQL; activation requires tested postimage hash.')
