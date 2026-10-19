from pathlib import Path
import sys,json,uuid,hashlib,concurrent.futures,time
sys.dont_write_bytecode=True;sys.path.insert(0,str(Path('engineering/currency-onboarding-20261018').resolve()))
import local as l
E=Path('engineering/currency-tzs-acceptance-20261019').resolve();l.E=E;l.CLUSTER=E/'disposable';C=[]
F='public.create_org_with_store_currency_tzs_v1(uuid,text,text,text,text,boolean)';CORE='public.create_org_with_store_currency_v1(uuid,text,text,text,text,boolean)';S=(E/'2026101901-tzs-rollout-controls.DRAFT.sql').read_text();q=lambda x:"'"+str(x).replace("'","''")+"'"
def read(s):return l.sql(s)[1]
def ck(n,b):assert b,n;C.append(n)
def actor():
 a=str(uuid.uuid4());l.sql('INSERT INTO auth.users(id)VALUES('+q(a)+')');return a
def claims(a,exp=None,role='authenticated'):
 return {'sub':a,'role':role,'exp':int(time.time())+3600 if exp is None else exp}
def call(a,r=None,c='TZS',exp=None,role='authenticated',ack=True,ok=True):
 return l.sql('SET ROLE authenticated;SET request.jwt.claims='+q(json.dumps(claims(a,exp,role)))+';SELECT public.create_org_with_store_currency_tzs_v1('+','.join([q(r or uuid.uuid4()),"'Synthetic Rollout'","'Store'",q(c),"'UTC'",str(ack).lower()])+');',ok)
def finances():return {t:read("SELECT md5(coalesce(string_agg(to_jsonb(t)::text,'' ORDER BY to_jsonb(t)::text),'')) FROM "+t+' t') for t in ['public.sales','public.sale_items','public.sale_payments','public.inventory','public.stock_movements','public.credit_ledger_v2','public.cashier_shifts']}
def enroll(a):l.sql('SET zetra.tzs_canary_actor='+q(a)+";SET zetra.tzs_approval='LOCAL_SYNTHETIC';"+(E/'ACTIVATE-CANARY.DRAFT.sql').read_text())
try:
 l.PORT=l.start();ck('loopback isolated cluster',Path(read("SELECT current_setting('data_directory')")).resolve()==l.CLUSTER.resolve())
 ck('verified full public schema',read("SELECT count(*) FROM pg_tables WHERE schemaname='public'")=='124')
 l.sql('DROP FUNCTION IF EXISTS '+CORE+';DROP TABLE IF EXISTS backend_core.currency_onboarding_requests;')
 l.sql("CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$SELECT coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}'::jsonb)$$;CREATE OR REPLACE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$SELECT coalesce(auth.jwt()->>'role',current_user)$$;CREATE ROLE cli_login_postgres LOGIN NOINHERIT;GRANT postgres TO cli_login_postgres WITH INHERIT FALSE,SET TRUE;")
 for f in ['engineering/currency-1802-admin-boundary-20261018/2026101802-atomic-currency-onboarding-ADMIN-BOUNDARY.DRAFT.sql','engineering/currency-1803-quarantine-20261019/2026101803-tzs-onboarding-gateway-QUARANTINED.DRAFT.sql']:l.sql(Path(f).read_text())
 baseline=read("SELECT md5(string_agg(pg_get_functiondef(p.oid)||coalesce(p.proacl::text,''),'' ORDER BY p.oid)) FROM pg_proc p WHERE p.prokind='f' AND p.oid<>'"+F+"'::regprocedure");before=finances()
 failed=l.sql(S.replace('COMMIT;',"DO $$BEGIN RAISE EXCEPTION 'SYNTHETIC_INSTALL_FAIL';END$$;COMMIT;"),False)
 ck('failed install atomically rolls back controls and function',failed[0]!=0 and read("SELECT to_regclass('backend_core.tzs_onboarding_rollout') IS NULL AND md5(replace(pg_get_functiondef('"+F+"'::regprocedure),chr(13),''))='13057618f9362520fa8bd4ffdd20ed2f'")=='t')
 l.sql("CREATE ROLE synthetic_control_reader;ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA backend_core GRANT ALL ON TABLES TO synthetic_control_reader;")
 l.sql(S);ck('install disabled by default',read('SELECT enabled FROM backend_core.tzs_onboarding_rollout')=='f')
 ck('control tables forced RLS',read("SELECT count(*) FROM pg_class WHERE oid IN('backend_core.tzs_onboarding_rollout'::regclass,'backend_core.tzs_onboarding_allowlist'::regclass,'backend_core.tzs_onboarding_rollout_audit'::regclass) AND relrowsecurity AND relforcerowsecurity")=='3')
 ck('hostile default control ACL cleaned',l.sql('SET ROLE synthetic_control_reader;SELECT * FROM backend_core.tzs_onboarding_rollout;',False)[0]!=0)
 ck('client cannot change rollout',l.sql('SET ROLE authenticated;UPDATE backend_core.tzs_onboarding_rollout SET enabled=true;',False)[0]!=0)
 ck('gateway still quarantined after install',read("SELECT has_function_privilege('authenticated','"+F+"','EXECUTE')")=='f')
 definition=read('SELECT pg_get_functiondef('+q(F)+'::regprocedure)')+'\n';digest=hashlib.md5(definition.replace('\r','').encode()).hexdigest()
 guard="DO $postimage$ BEGIN IF md5(replace(pg_get_functiondef('"+F+"'::regprocedure),chr(13),''))<>'"+digest+"' THEN RAISE EXCEPTION 'ROLLOUT_POSTIMAGE_CHANGED';END IF;END $postimage$;"
 p=E/'ACTIVATE-CANARY.DRAFT.sql';s=p.read_text().replace('-- VERIFIED_POSTIMAGE_GUARD',guard);p.write_text(s)
 rb="BEGIN;SET LOCAL lock_timeout='3s';SET LOCAL statement_timeout='15s';"+guard+"DO $disable$ BEGIN IF current_user<>'postgres' THEN RAISE EXCEPTION 'ADMIN_REQUIRED';END IF;PERFORM 1 FROM backend_core.tzs_onboarding_rollout WHERE singleton FOR UPDATE;UPDATE backend_core.tzs_onboarding_rollout SET enabled=false WHERE singleton;INSERT INTO backend_core.tzs_onboarding_rollout_audit(action,approval_reference) VALUES('DISABLED','OWNER_APPROVED_DISABLE');END $disable$;REVOKE ALL ON FUNCTION "+F+" FROM PUBLIC,anon,authenticated,service_role;COMMIT;"
 (E/'DISABLE-ROLLBACK.sql').write_text(rb)
 # Local-only exposure intentionally tests server controls even when a client can call the RPC.
 l.sql('GRANT EXECUTE ON FUNCTION '+F+' TO authenticated;');a=actor()
 err=call(a,ok=False);ck('false server switch blocks despite client EXECUTE',err[0]!=0 and 'TZS_ROLLOUT_NOT_ENABLED' in err[2])
 l.sql('UPDATE backend_core.tzs_onboarding_rollout SET enabled=true;');err=call(a,ok=False);ck('missing allowlist denied',err[0]!=0 and 'TZS_ROLLOUT_NOT_ENABLED' in err[2])
 ck('activation requires explicit actor parameters',l.sql((E/'ACTIVATE-CANARY.DRAFT.sql').read_text(),False)[0]!=0)
 enroll(a);r=str(uuid.uuid4());v=json.loads(call(a,r)[1]);o=v['organizationId']
 ck('approved TZS onboarding confirmed',v['currency']=='TZS' and v['status']=='CONFIRMED' and not v['postingActivated'])
 ck('new organization Owner binding',read('SELECT count(*) FROM public.org_memberships WHERE user_id='+q(a)+' AND organization_id='+q(o)+" AND role='owner' AND is_active")=='1')
 ck('currency persists on independent connection',json.loads(read('SET ROLE authenticated;SET request.jwt.claims='+q(json.dumps(claims(a)))+';SELECT public.get_org_accounting_currency_v1('+q(o)+');'))['currency']=='TZS')
 ck('same request replays exact result',json.loads(call(a,r)[1])==v)
 for exp in [int(time.time())-1,'invalid']:
  err=call(a,r,exp=exp,ok=False);ck('expired or invalid exp denied '+str(exp),err[0]!=0 and 'AUTH_SESSION_EXPIRED' in err[2])
 ck('wrong JWT role denied',call(a,r,role='service_role',ok=False)[0]!=0)
 for c in ['USD','KES','UGX','EUR']:
  err=call(a,c=c,ok=False);ck(c+' denied server-side',err[0]!=0 and 'NATIVE_ACCOUNTING_CURRENCY_UNSUPPORTED' in err[2])
 other=actor();ck('other active account not enrolled denied',call(other,ok=False)[0]!=0)
 ck('cross org authority reader denied',l.sql('SET ROLE authenticated;SET request.jwt.claims='+q(json.dumps(claims(other)))+';SELECT public.get_org_accounting_currency_v1('+q(o)+');',False)[0]!=0)
 l.sql('UPDATE backend_core.tzs_onboarding_allowlist SET expires_at=clock_timestamp()-interval \'1 second\' WHERE actor_id='+q(a));ck('expired allowlist denies replay',call(a,r,ok=False)[0]!=0)
 b=actor();enroll(b);l.sql('UPDATE auth.users SET banned_until=clock_timestamp()+interval \'1 day\' WHERE id='+q(b));ck('banned enrolled user denied',call(b,ok=False)[0]!=0)
 c=actor();enroll(c);ck('acknowledgement enforced',call(c,ack=False,ok=False)[0]!=0)
 r2=str(uuid.uuid4())
 with concurrent.futures.ThreadPoolExecutor(2) as pool:out=list(pool.map(lambda _:call(c,r2),range(2)))
 ck('concurrent duplicate result equal',out[0][1]==out[1][1]);ck('one org for concurrent request',read('SELECT count(*) FROM public.org_memberships WHERE user_id='+q(c)+" AND role='owner'")=='1')
 d=actor();enroll(d);n=read('SELECT count(*) FROM public.organizations');l.sql("CREATE FUNCTION proforma_backend.synthetic_rollout_fail() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'SYNTHETIC_CONFIRM_FAIL';END$$;CREATE TRIGGER synthetic_rollout_fail BEFORE INSERT ON proforma_backend.accounting_currency FOR EACH ROW EXECUTE FUNCTION proforma_backend.synthetic_rollout_fail();")
 ck('failed confirmation no orphan org',call(d,ok=False)[0]!=0 and read('SELECT count(*) FROM public.organizations')==n)
 l.sql('DROP TRIGGER synthetic_rollout_fail ON proforma_backend.accounting_currency;DROP FUNCTION proforma_backend.synthetic_rollout_fail();')
 ck('original functions ACLs unchanged',read("SELECT md5(string_agg(pg_get_functiondef(p.oid)||coalesce(p.proacl::text,''),'' ORDER BY p.oid)) FROM pg_proc p WHERE p.prokind='f' AND p.oid<>'"+F+"'::regprocedure")==baseline)
 ck('core remains client quarantined',read("SELECT has_function_privilege('authenticated','"+CORE+"','EXECUTE')")=='f')
 for role in ['anon','service_role']:ck(role+' gateway permission denied',l.sql('SET ROLE '+role+";SELECT public.create_org_with_store_currency_tzs_v1('11111111-1111-4111-8111-111111111111','X','Y');",False)[0]!=0)
 n=read('SELECT count(*) FROM public.organizations');l.sql(rb);l.sql(rb)
 ck('disable switch and EXECUTE revoked',read('SELECT enabled FROM backend_core.tzs_onboarding_rollout')=='f' and read("SELECT has_function_privilege('authenticated','"+F+"','EXECUTE')")=='f')
 ck('disable preserves organizations and finance',n==read('SELECT count(*) FROM public.organizations') and before==finances())
 ck('activation disable audit retained',int(read('SELECT count(*) FROM backend_core.tzs_onboarding_rollout_audit'))>=6)
 (E/'POSTIMAGE.json').write_text(json.dumps({'definitionMd5':digest},indent=2))
 (E/'POSTGRES-RESULTS.json').write_text(json.dumps({'status':'PASS','count':len(C),'checks':C,'scope':'Synthetic JWT/Auth adapters; full verified public schema plus exact local 1802/1803 fixtures. No genuine Auth E2E.','remoteWrites':False},indent=2));print('PASS '+str(len(C)))
finally:
 if l.PORT:assert l.tool('pg_ctl',['-D',str(l.CLUSTER),'-m','fast','-w','stop'])[0]==0
