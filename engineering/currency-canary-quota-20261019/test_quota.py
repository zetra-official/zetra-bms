from pathlib import Path
import sys,json,uuid,time,concurrent.futures,runpy,hashlib
sys.dont_write_bytecode=True
sys.path.insert(0,str(Path('engineering/currency-onboarding-20261018').resolve()))
import local as l
E=Path(__file__).resolve().parent;l.E=E;l.CLUSTER=E/('disposable-'+uuid.uuid4().hex[:8]);C=[]
l.env.update(PGPASSFILE=str(E/'NO-CREDENTIALS'),PGSERVICEFILE=str(E/'NO-SERVICES'))
F='public.create_org_with_store_currency_tzs_v1(uuid,text,text,text,text,boolean)';CORE='public.create_org_with_store_currency_v1(uuid,text,text,text,text,boolean)'
q=lambda v:"'"+str(v).replace("'","''")+"'"
def read(s):return l.sql(s)[1]
def ck(n,v):assert v,n;C.append(n)
def actor():
 a=str(uuid.uuid4());l.sql('INSERT INTO auth.users(id,email_confirmed_at,role,is_anonymous)VALUES('+q(a)+",clock_timestamp(),'authenticated',false)");return a
def claims(a,exp=None,role='authenticated'):return q(json.dumps({'sub':a,'role':role,'exp':int(time.time())+3600 if exp is None else exp}))
def call(a,r,name='ZETRA CANARY TZS LOCAL',store='SYNTHETIC TZS LOCAL',currency='TZS',exp=None,role='authenticated',ok=True,wrap=''):
 return l.sql(wrap+'SET ROLE authenticated;SET request.jwt.claims='+claims(a,exp,role)+';SELECT public.create_org_with_store_currency_tzs_v1('+','.join([q(r),q(name),q(store),q(currency),"'UTC'",'true'])+');'+('COMMIT;' if wrap else ''),ok)
def enroll(a,r,ok=True):
 s='SET zetra.tzs_canary_actor='+q(a)+';SET zetra.tzs_canary_request='+q(r)+";SET zetra.tzs_approval='LOCAL_ONLY';SET zetra.tzs_canary_org='ZETRA CANARY TZS LOCAL';SET zetra.tzs_canary_store='SYNTHETIC TZS LOCAL';SET zetra.tzs_canary_timezone='UTC';"
 return l.sql(s+(E/'ACTIVATE-QUOTA-CANARY.DRAFT.sql').read_text(),ok)
def finances():return {t:read("SELECT md5(coalesce(string_agg(to_jsonb(t)::text,'' ORDER BY to_jsonb(t)::text),'')) FROM public."+t+' t') for t in ['sales','sale_items','sale_payments','inventory','stock_movements','credit_ledger_v2','cashier_shifts','expenses']}
try:
 l.PORT=l.start();ck('disposable loopback path isolated',Path(read("SHOW data_directory")).resolve()==l.CLUSTER.resolve());ck('verified captured public schema restored',read("SELECT count(*) FROM pg_tables WHERE schemaname='public'")=='124')
 l.sql('DROP FUNCTION IF EXISTS '+CORE+';DROP TABLE IF EXISTS backend_core.currency_onboarding_requests;')
 l.sql("ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS email_confirmed_at timestamptz;ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS role text DEFAULT 'authenticated';ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS is_anonymous boolean DEFAULT false;CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$SELECT coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}'::jsonb)$$;CREATE OR REPLACE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$SELECT coalesce(auth.jwt()->>'role',current_user)$$;CREATE ROLE cli_login_postgres LOGIN NOINHERIT;GRANT postgres TO cli_login_postgres WITH INHERIT FALSE,SET TRUE;")
 for f in ['engineering/currency-1802-admin-boundary-20261018/2026101802-atomic-currency-onboarding-ADMIN-BOUNDARY.DRAFT.sql','engineering/currency-1803-quarantine-20261019/2026101803-tzs-onboarding-gateway-QUARANTINED.DRAFT.sql','engineering/currency-tzs-acceptance-20261019/2026101901-tzs-rollout-controls.DRAFT.sql']:l.sql(Path(f).read_text(encoding='utf-8'))
 baseline=read("SELECT md5(string_agg(pg_get_functiondef(p.oid)||coalesce(p.proacl::text,''),'' ORDER BY p.oid)) FROM pg_proc p WHERE p.prokind='f' AND p.oid<>'"+F+"'::regprocedure");before=finances();sql=(E/'2026101902-tzs-canary-quota.DRAFT.sql').read_text()
 err=l.sql(sql.replace('COMMIT;',"DO $$BEGIN RAISE EXCEPTION 'SYNTHETIC_INSTALL_FAIL';END$$;COMMIT;"),False)
 ck('failed migration rolls back quota table and gateway',err[0]!=0 and read("SELECT to_regclass('backend_core.tzs_onboarding_canary_quota') IS NULL AND md5(replace(pg_get_functiondef('"+F+"'::regprocedure),chr(13),''))='a1a33dfe9a5de26fed5c04c42eee1044'")=='t')
 l.sql('CREATE ROLE hostile_quota_reader;ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA backend_core GRANT ALL ON TABLES TO hostile_quota_reader;');l.sql(sql)
 digest=read("SELECT md5(replace(pg_get_functiondef('"+F+"'::regprocedure),chr(13),''))");(E/'POSTIMAGE.json').write_text(json.dumps({'gatewayMd5':digest},indent=2));runpy.run_path(str(E/'build_activation.py'))
 ck('install leaves server disabled',read('SELECT enabled FROM backend_core.tzs_onboarding_rollout')=='f')
 ck('forced RLS quota owner-only ACL',read("SELECT relrowsecurity AND relforcerowsecurity AND NOT EXISTS(SELECT 1 FROM aclexplode(relacl) a WHERE a.grantee<>relowner) FROM pg_class WHERE oid='backend_core.tzs_onboarding_canary_quota'::regclass")=='t')
 for role in ['anon','authenticated','service_role','authenticator','cli_login_postgres','hostile_quota_reader']:
  ck(role+' no effective gateway EXECUTE after install',read("SELECT has_function_privilege("+q(role)+','+q(F)+",'EXECUTE')")=='f')
  ck(role+' cannot edit quota',l.sql('SET ROLE '+role+';INSERT INTO backend_core.tzs_onboarding_canary_quota(actor_id,request_id,fingerprint,approval_reference)VALUES(gen_random_uuid(),gen_random_uuid(),\'[1,2,3,4,5]\',\'x\');',False)[0]!=0)
 ck('NOINHERIT CLI can explicitly SET ROLE postgres for DDL',l.sql('SET SESSION AUTHORIZATION cli_login_postgres;SET ROLE postgres;BEGIN;CREATE TABLE backend_core.local_admin_probe(id int);ROLLBACK;')[0]==0)
 ck('activation missing approved parameters denied',l.sql((E/'ACTIVATE-QUOTA-CANARY.DRAFT.sql').read_text(),False)[0]!=0)
 a=actor();r=str(uuid.uuid4());enroll(a,r)
 ck('activation only scoped gateway, core still denied',read("SELECT has_function_privilege('authenticated',"+q(F)+",'EXECUTE') AND NOT has_function_privilege('authenticated',"+q(CORE)+",'EXECUTE')")=='t')
 ck('one-hour expiry exact at enrollment transaction',read("SELECT extract(epoch FROM a.expires_at-q.approved_at)=3600 FROM backend_core.tzs_onboarding_allowlist a JOIN backend_core.tzs_onboarding_canary_quota q USING(actor_id) WHERE actor_id="+q(a))=='t')
 for role in ['anon','service_role','authenticator']:ck(role+' denied after activation',read('SELECT has_function_privilege('+q(role)+','+q(F)+",'EXECUTE')")=='f')
 other=actor();ck('unenrolled actor cannot create',call(other,r,ok=False)[0]!=0);ck('second simultaneously active actor enrollment denied',enroll(other,str(uuid.uuid4()),False)[0]!=0)
 ck('new request ID denied before first creation',call(a,str(uuid.uuid4()),ok=False)[0]!=0)
 ck('changed name denied',call(a,r,name='ZETRA CANARY TZS OTHER',ok=False)[0]!=0);ck('changed store denied',call(a,r,store='SYNTHETIC TZS OTHER',ok=False)[0]!=0)
 for currency in ['USD','KES','UGX','EUR']:ck(currency+' denied',call(a,r,currency=currency,ok=False)[0]!=0)
 ck('expired session denied',call(a,r,exp=int(time.time())-1,ok=False)[0]!=0);ck('wrong JWT role denied',call(a,r,role='service_role',ok=False)[0]!=0)
 n=read('SELECT count(*) FROM public.organizations')
 l.sql("CREATE FUNCTION proforma_backend.fail_quota_confirmation() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'SYNTHETIC_CONFIRM_FAIL';END$$;CREATE TRIGGER fail_quota_confirmation BEFORE INSERT ON proforma_backend.accounting_currency FOR EACH ROW EXECUTE FUNCTION proforma_backend.fail_quota_confirmation();")
 ck('failed confirmation rolls back org and quota consumption',call(a,r,ok=False)[0]!=0 and read('SELECT count(*) FROM public.organizations')==n and read('SELECT result IS NULL AND consumed_at IS NULL FROM backend_core.tzs_onboarding_canary_quota WHERE actor_id='+q(a))=='t')
 l.sql('DROP TRIGGER fail_quota_confirmation ON proforma_backend.accounting_currency;DROP FUNCTION proforma_backend.fail_quota_confirmation();')
 # Eight real simultaneous PostgreSQL connections: four approved retries, four other IDs.
 requests=[r]*4+[str(uuid.uuid4()) for _ in range(4)]
 with concurrent.futures.ThreadPoolExecutor(8) as pool:out=list(pool.map(lambda req:call(a,req,ok=False),requests))
 ck('concurrent approved retries all succeed',all(v[0]==0 for v in out[:4]));ck('concurrent new requests all denied',all(v[0]!=0 for v in out[4:]));results=[json.loads(v[1]) for v in out[:4]]
 ck('concurrent results identical',all(v==results[0] for v in results));v=results[0];o=v['organizationId']
 ck('one organization for actor',read('SELECT count(*) FROM public.org_memberships WHERE user_id='+q(a))=='1');ck('one store in synthetic organization',read('SELECT count(*) FROM public.stores WHERE organization_id='+q(o))=='1')
 ck('consumption receipt exact and timestamped',read('SELECT result='+q(json.dumps(v))+'::jsonb AND consumed_at IS NOT NULL FROM backend_core.tzs_onboarding_canary_quota WHERE actor_id='+q(a))=='t')
 ck('retry independent connection replays exact result',json.loads(call(a,r)[1])==v);ck('new intent after consumption denied',call(a,str(uuid.uuid4()),ok=False)[0]!=0)
 ck('reenrollment cannot reset consumed quota',enroll(a,str(uuid.uuid4()),False)[0]!=0)
 ck('cross org accounting read denied',l.sql('SET ROLE authenticated;SET request.jwt.claims='+claims(other)+';SELECT public.get_org_accounting_currency_v1('+q(o)+');',False)[0]!=0)
 ck('same actor accounting currency persists',json.loads(read('SET ROLE authenticated;SET request.jwt.claims='+claims(a)+';SELECT public.get_org_accounting_currency_v1('+q(o)+');'))['currency']=='TZS')
 l.sql('UPDATE backend_core.tzs_onboarding_allowlist SET expires_at=clock_timestamp()-interval \'1 second\' WHERE actor_id='+q(a));ck('expired enrollment blocks even replay',call(a,r,ok=False)[0]!=0)
 # Fresh second actor: downstream quota receipt failure rolls back the whole canonical transaction.
 enroll(other,r);l.sql("CREATE FUNCTION backend_core.fail_quota_receipt() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'SYNTHETIC_RECEIPT_FAIL';END$$;CREATE TRIGGER fail_quota_receipt BEFORE UPDATE ON backend_core.tzs_onboarding_canary_quota FOR EACH ROW EXECUTE FUNCTION backend_core.fail_quota_receipt();")
 n=read('SELECT count(*) FROM public.organizations');ck('failed receipt has no partial organization/store/confirmation',call(other,r,ok=False)[0]!=0 and read('SELECT count(*) FROM public.organizations')==n and read('SELECT count(*) FROM backend_core.currency_onboarding_requests WHERE actor_id='+q(other))=='0')
 l.sql('DROP TRIGGER fail_quota_receipt ON backend_core.tzs_onboarding_canary_quota;DROP FUNCTION backend_core.fail_quota_receipt();')
 l.sql('BEGIN;SET ROLE authenticated;SET LOCAL request.jwt.claims='+claims(other)+';SELECT public.create_org_with_store_currency_tzs_v1('+q(r)+",'ZETRA CANARY TZS LOCAL','SYNTHETIC TZS LOCAL','TZS','UTC',true);ROLLBACK;")
 ck('explicit caller rollback preserves unconsumed quota',read('SELECT count(*) FROM public.organizations')==n and read('SELECT result IS NULL FROM backend_core.tzs_onboarding_canary_quota WHERE actor_id='+q(other))=='t')
 with concurrent.futures.ThreadPoolExecutor(2) as pool:rr=list(pool.map(lambda _:call(other,r,ok=False,wrap='BEGIN ISOLATION LEVEL REPEATABLE READ;'),range(2)))
 ck('repeatable read creates at most one organization even on serialization failure',read('SELECT count(*) FROM public.org_memberships WHERE user_id='+q(other))=='1' and any(z[0]==0 for z in rr))
 l.sql((E/'DISABLE-ROLLBACK.DRAFT.sql').read_text());l.sql((E/'DISABLE-ROLLBACK.DRAFT.sql').read_text())
 ck('disable denies calls and preserves receipts',read('SELECT enabled FROM backend_core.tzs_onboarding_rollout')=='f' and read('SELECT count(*) FROM backend_core.tzs_onboarding_canary_quota WHERE consumed_at IS NOT NULL')=='2' and read('SELECT has_function_privilege(\'authenticated\','+q(F)+",'EXECUTE')")=='f')
 ck('rollout audit includes enrollment and disable',int(read('SELECT count(*) FROM backend_core.tzs_onboarding_rollout_audit'))>=4)
 ck('existing onboarding and authority definitions unchanged',read("SELECT md5(string_agg(pg_get_functiondef(p.oid)||coalesce(p.proacl::text,''),'' ORDER BY p.oid)) FROM pg_proc p WHERE p.prokind='f' AND p.oid<>'"+F+"'::regprocedure")==baseline)
 ck('all historical financial fixture rows unchanged',finances()==before)
 (E/'POSTGRES-RESULTS.json').write_text(json.dumps({'status':'PASS','count':len(C),'checks':C,'gatewayMd5':digest,'scope':'Real local PostgreSQL concurrency and full captured public schema; simulated Auth claims. No genuine Supabase Auth E2E or remote writes.'},indent=2));print('PASS '+str(len(C)))
finally:
 if l.PORT:assert l.tool('pg_ctl',['-D',str(l.CLUSTER),'-m','fast','-w','stop'])[0]==0
