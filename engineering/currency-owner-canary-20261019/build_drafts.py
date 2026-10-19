from pathlib import Path
import json,hashlib
E=Path(__file__).resolve().parent;OLD=Path('engineering/currency-canary-quota-20261019')
assert hashlib.sha256((OLD/'2026101902-tzs-canary-quota.DRAFT.sql').read_bytes()).hexdigest()=='7ce3e81d44b402d53f19f4776647e4953471aef34d51faea69536696aeb13e55'
defs=json.loads(Path('engineering/currency-onboarding-20261018/authoritative-definitions.private.json').read_text(encoding='utf-8'))
canonical=next(r['definition'] for r in defs if r['identity'].startswith('create_org_with_store(')).replace('\r','')
assert hashlib.md5(canonical.encode()).hexdigest()=='4883dcef2455a74f1938f4bebb03558e'
needle='IF coalesce(v_owned_orgs, 0) >= v_max_orgs THEN';assert canonical.count(needle)==1
canonical=canonical.replace(needle,'IF coalesce(v_owned_orgs, 0) >= v_max_orgs AND NOT backend_core.consume_tzs_canary_org_permit(v_uid) THEN')
body=(OLD/'2026101902-tzs-canary-quota.DRAFT.sql').read_text(encoding='utf-8');body=body[body.index('CREATE OR REPLACE FUNCTION'):body.index('REVOKE ALL ON FUNCTION')]
body=body.replace(" actor:=backend_core.active_subject();"," actor:=backend_core.active_subject();\n IF actor IS DISTINCT FROM 'bb2d6dee-773d-4fa7-8fda-1eb85bbad2cd'::uuid THEN RAISE EXCEPTION 'OWNER_CANARY_ACTOR_REQUIRED';END IF;")
needle=' canonical_result:=public.create_org_with_store_currency_v1';assert body.count(needle)==1
body=body.replace(needle,""" IF intent.result IS NULL THEN
  INSERT INTO backend_core.tzs_canary_creation_permits(actor_id,request_id,backend_pid,transaction_id)
  VALUES(actor,p_request_id,pg_backend_pid(),txid_current());
 END IF;
 canonical_result:=public.create_org_with_store_currency_v1""")
needle=' IF canonical_result->';assert body.count(needle)==1
body=body.replace(needle," DELETE FROM backend_core.tzs_canary_creation_permits WHERE actor_id=actor AND backend_pid=pg_backend_pid() AND transaction_id=txid_current();\n IF canonical_result->")
prefix="""-- LOCAL REVIEW DRAFT: explicit Owner-only canary org-limit exception, not a plan upgrade.
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
"""
# Reuse the tested owner/NOINHERIT quarantine guard, unchanged except gateway postimage.
quota=(OLD/'2026101902-tzs-canary-quota.DRAFT.sql').read_text(encoding='utf-8');tail=quota[quota.index('REVOKE ALL ON FUNCTION'):]
post="""DO $post$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles r WHERE NOT r.rolsuper AND r.rolname<>'postgres' AND has_function_privilege(r.oid,'backend_core.consume_tzs_canary_org_permit(uuid)'::regprocedure,'EXECUTE')) THEN RAISE EXCEPTION 'PERMIT_HELPER_EXPOSED';END IF;
 IF EXISTS(SELECT 1 FROM backend_core.tzs_canary_creation_permits) THEN RAISE EXCEPTION 'UNEXPECTED_LIVE_PERMIT';END IF;
END $post$;
COMMIT;
"""
(E/'2026101903-owner-canary-org-limit.DRAFT.sql').write_text(prefix+canonical+';\n'+body+tail.replace('COMMIT;',post),encoding='utf-8')

def activation(digest):
 s=(OLD/'ACTIVATE-QUOTA-CANARY.DRAFT.sql').read_text(encoding='utf-8')
 start=s.index(' IF EXISTS(SELECT 1 FROM public.org_memberships WHERE user_id=actor)');end=s.index("THEN RAISE EXCEPTION 'DEDICATED_CLEAN_ACTOR_REQUIRED';END IF;",start)+len("THEN RAISE EXCEPTION 'DEDICATED_CLEAN_ACTOR_REQUIRED';END IF;")
 s=s[:start]+s[end:];s=s.replace("IF current_user<>'postgres' OR actor IS NULL OR req IS NULL OR ref IS NULL", "IF current_user<>'postgres' OR actor IS DISTINCT FROM 'bb2d6dee-773d-4fa7-8fda-1eb85bbad2cd'::uuid OR req IS NULL OR ref IS NULL")
 s=s.replace('953346c2582e3f4ae047796ec87ff0bf',digest)
 (E/'ACTIVATE-OWNER-CANARY.DRAFT.sql').write_text(s,encoding='utf-8')
 disable=(OLD/'DISABLE-ROLLBACK.DRAFT.sql').read_text(encoding='utf-8').replace('953346c2582e3f4ae047796ec87ff0bf',digest)
 (E/'DISABLE-OWNER-CANARY.DRAFT.sql').write_text(disable,encoding='utf-8')

if (E/'POSTIMAGE.json').exists():activation(json.loads((E/'POSTIMAGE.json').read_text())['gatewayMd5'])
