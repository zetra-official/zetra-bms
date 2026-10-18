from pathlib import Path
import sys,json,uuid,hashlib,concurrent.futures
sys.dont_write_bytecode=True;sys.path.insert(0,str(Path('engineering/currency-onboarding-20261018').resolve()))
import local as l
E=Path('engineering/currency-1803-quarantine-20261019').resolve();l.E=E;l.CLUSTER=E/'disposable';checks=[]
F='public.create_org_with_store_currency_tzs_v1(uuid,text,text,text,text,boolean)';CORE='public.create_org_with_store_currency_v1(uuid,text,text,text,text,boolean)'
S=(E/'2026101803-tzs-onboarding-gateway-QUARANTINED.DRAFT.sql').read_text();q=lambda x:"'"+str(x).replace("'","''")+"'"
def read(s):return l.sql(s)[1]
def ck(n,b):assert b,n;checks.append(n)
def actor():
 a=str(uuid.uuid4());l.sql('INSERT INTO auth.users(id)VALUES('+q(a)+')');return a
def call(a,c='TZS',r=None,ack=True,ok=True):
 return l.sql('SET request.jwt.claims='+q(json.dumps({'sub':a,'role':'authenticated'}))+';SELECT public.create_org_with_store_currency_tzs_v1('+','.join([q(r or uuid.uuid4()),"'Synthetic Scoped'","'Synthetic Store'",q(c),"'UTC'",str(ack).lower()])+');',ok)
def financial():return {t:read("SELECT md5(coalesce(string_agg(to_jsonb(t)::text,'' ORDER BY to_jsonb(t)::text),'')) FROM "+t+' t') for t in ['public.sales','public.sale_items','public.sale_payments','public.inventory','public.stock_movements','public.credit_ledger_v2','public.cashier_shifts']}
try:
 l.PORT=l.start();ck('isolated data directory',Path(read("SELECT current_setting('data_directory')")).resolve()==l.CLUSTER.resolve())
 ck('full verified public schema',read("SELECT count(*) FROM pg_tables WHERE schemaname='public'")=='124')
 l.sql('DROP FUNCTION IF EXISTS '+CORE+';DROP TABLE IF EXISTS backend_core.currency_onboarding_requests;')
 l.sql("CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$SELECT coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}'::jsonb)$$;CREATE OR REPLACE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$SELECT coalesce(auth.jwt()->>'role',current_user)$$;")
 l.sql("CREATE ROLE cli_login_postgres LOGIN NOINHERIT;GRANT postgres TO cli_login_postgres WITH INHERIT FALSE,SET TRUE;")
 l.sql(Path('engineering/currency-1802-admin-boundary-20261018/2026101802-atomic-currency-onboarding-ADMIN-BOUNDARY.DRAFT.sql').read_text())
 before=financial();baseline=read("SELECT md5(string_agg(pg_get_functiondef(p.oid)||coalesce(p.proacl::text,''),'' ORDER BY p.oid)) FROM pg_proc p WHERE p.prokind='f'")
 l.sql("CREATE ROLE synthetic_gateway_default;CREATE ROLE synthetic_inherited INHERIT;GRANT synthetic_gateway_default TO synthetic_inherited;ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO synthetic_gateway_default;")
 l.sql(S)
 ck('hostile default grant removed',read("SELECT has_function_privilege('synthetic_gateway_default','"+F+"','EXECUTE')")=='f')
 for role in ['anon','authenticated','service_role','authenticator','cli_login_postgres','synthetic_inherited']:
  ck(role+' gateway denied',l.sql('SET ROLE '+role+";SELECT public.create_org_with_store_currency_tzs_v1('11111111-1111-4111-8111-111111111111','X','S');",False)[0]!=0)
 ck('PUBLIC no ACL',read("SELECT count(*) FROM pg_proc p CROSS JOIN LATERAL aclexplode(p.proacl) a WHERE p.oid='"+F+"'::regprocedure AND a.grantee=0")=='0')
 ck('no nonowner explicit grants',read("SELECT count(*) FROM pg_proc p CROSS JOIN LATERAL aclexplode(p.proacl) a WHERE p.oid='"+F+"'::regprocedure AND a.grantee<>p.proowner")=='0')
 ck('CLI SET ROLE DDL preserved',l.sql("SET SESSION AUTHORIZATION cli_login_postgres;SET ROLE postgres;BEGIN;CREATE TABLE public.synthetic_ddl(id int);ROLLBACK;")[0]==0)
 ck('client cannot SET ROLE owner',l.sql('SET SESSION AUTHORIZATION authenticated;SET ROLE postgres;',False)[0]!=0)
 ck('client cannot SET ROLE CLI',l.sql('SET SESSION AUTHORIZATION authenticated;SET ROLE cli_login_postgres;',False)[0]!=0)
 ck('no alternate static wrapper',read("SELECT count(*) FROM pg_proc p WHERE p.prokind='f' AND p.oid<>'"+F+"'::regprocedure AND pg_get_functiondef(p.oid) LIKE '%create_org_with_store_currency_tzs_v1%'")=='0')
 ck('unauthenticated subject denied',call(str(uuid.uuid4()),ok=False)[0]!=0)
 a=actor();r=str(uuid.uuid4());v=json.loads(call(a,r=r)[1]);o=v['organizationId']
 ck('TZS confirmed',v['currency']=='TZS' and v['status']=='CONFIRMED' and not v['postingActivated'])
 ck('canonical owner membership',read('SELECT count(*) FROM public.org_memberships WHERE user_id='+q(a)+' AND organization_id='+q(o)+" AND role='owner' AND is_active")=='1')
 ck('authority persisted server-side',json.loads(read('SET ROLE authenticated;SET request.jwt.claims='+q(json.dumps({'sub':a}))+';SELECT public.get_org_accounting_currency_v1('+q(o)+');'))['currency']=='TZS')
 ck('exact retry',json.loads(call(a,r=r)[1])==v)
 for c in ['USD','KES','UGX']:
  u=actor();n=read('SELECT count(*) FROM public.organizations');err=call(u,c,ok=False)
  ck(c+' server blocked no org',err[0]!=0 and 'NATIVE_ACCOUNTING_CURRENCY_UNSUPPORTED' in err[2] and read('SELECT count(*) FROM public.organizations')==n)
 u=actor();ck('Owner acknowledgement mandatory',call(u,ack=False,ok=False)[0]!=0)
 foreign=actor();err=l.sql('SET ROLE authenticated;SET request.jwt.claims='+q(json.dumps({'sub':foreign}))+';SELECT public.get_org_accounting_currency_v1('+q(o)+');',False);ck('cross organization reader denied',err[0]!=0)
 ck('foreign cannot change existing authority',l.sql('SET ROLE authenticated;SET request.jwt.claims='+q(json.dumps({'sub':foreign}))+';SELECT public.owner_confirm_org_accounting_currency_v1('+','.join([q(o),q(uuid.uuid4()),"'USD'","'CONFIRM'","'EXISTING_BUSINESS'",'true','NULL'])+');',False)[0]!=0)
 ck('core remains quarantined',read("SELECT has_function_privilege('authenticated','"+CORE+"','EXECUTE')")=='f')
 u=actor();l.sql("UPDATE auth.users SET banned_until=statement_timestamp()+interval '1 day' WHERE id="+q(u));ck('disabled actor denied',call(u,ok=False)[0]!=0)
 u=actor();r=str(uuid.uuid4())
 with concurrent.futures.ThreadPoolExecutor(2) as pool:out=list(pool.map(lambda _:call(u,r=r),range(2)))
 ck('concurrent duplicates same result',out[0][1]==out[1][1]);ck('one owner org for duplicates',read('SELECT count(*) FROM public.org_memberships WHERE user_id='+q(u)+" AND role='owner'")=='1')
 ck('changed retry payload rejected',l.sql('SET ROLE authenticated;SET request.jwt.claims='+q(json.dumps({'sub':u}))+';SELECT public.create_org_with_store_currency_tzs_v1('+q(r)+",'Changed','Store','TZS','UTC',true);",False)[0]!=0)
 u=actor();n=read('SELECT count(*) FROM public.organizations');l.sql("CREATE FUNCTION proforma_backend.synthetic_fail_currency() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'SYNTHETIC_CURRENCY_FAILURE';END$$;CREATE TRIGGER synthetic_fail_currency BEFORE INSERT ON proforma_backend.accounting_currency FOR EACH ROW EXECUTE FUNCTION proforma_backend.synthetic_fail_currency();")
 err=call(u,ok=False);ck('failed authority rolls back org',err[0]!=0 and 'SYNTHETIC_CURRENCY_FAILURE' in err[2] and read('SELECT count(*) FROM public.organizations')==n)
 l.sql('DROP TRIGGER synthetic_fail_currency ON proforma_backend.accounting_currency;DROP FUNCTION proforma_backend.synthetic_fail_currency();')
 ck('existing contracts ACL definitions unchanged',read("SELECT md5(string_agg(pg_get_functiondef(p.oid)||coalesce(p.proacl::text,''),'' ORDER BY p.oid)) FROM pg_proc p WHERE p.prokind='f' AND p.oid<>'"+F+"'::regprocedure")==baseline)
 legacy=actor();ck('legacy onboarding signature works',bool(read('SET request.jwt.claims='+q(json.dumps({'sub':legacy}))+';SELECT organization_id FROM public.create_org_with_store(\'Synthetic Legacy\',\'Store\');')))
 ck('financial history untouched',financial()==before)
 definition=read('SELECT pg_get_functiondef('+q(F)+'::regprocedure)')+'\n';digest=hashlib.md5(definition.replace('\r','').encode()).hexdigest()
 rb="BEGIN;SET LOCAL lock_timeout='3s';SET LOCAL statement_timeout='10s';DO $guard$ BEGIN IF md5(replace(pg_get_functiondef('"+F+"'::regprocedure),chr(13),''))<>'"+digest+"' THEN RAISE EXCEPTION 'GATEWAY_POSTIMAGE_CHANGED';END IF;END $guard$;REVOKE ALL ON FUNCTION "+F+" FROM PUBLIC,anon,authenticated,service_role;COMMIT;"
 (E/'ROLLBACK.sql').write_text(rb);l.sql(rb);l.sql(rb)
 ck('gateway disable idempotent',read("SELECT has_function_privilege('authenticated','"+F+"','EXECUTE')")=='f');ck('disable preserves business records',read('SELECT count(*) FROM public.organizations WHERE id='+q(o))=='1')
 l.sql('DROP FUNCTION '+F+';');err=l.sql(S.replace('COMMIT;',"DO $$BEGIN RAISE EXCEPTION 'SYNTHETIC_INSTALL_FAILURE';END$$;COMMIT;"),False)
 ck('gateway failed install rolls back',err[0]!=0 and read('SELECT to_regprocedure('+q(F)+') IS NULL')=='t')
 l.sql('GRANT cli_login_postgres TO authenticated;')
 err=l.sql(S,False);ck('client admin path aborts install',err[0]!=0 and 'CLIENT_ADMIN_ROLE_PATH' in err[2] and read('SELECT to_regprocedure('+q(F)+') IS NULL')=='t')
 l.sql('REVOKE cli_login_postgres FROM authenticated;')
 ck('client activation stays false','ATOMIC_CURRENCY_ONBOARDING_ACTIVE=false' in Path('src/currency/onboarding.ts').read_text())
 (E/'POSTIMAGE.json').write_text(json.dumps({'gatewayDefinitionMd5':digest,'coreDefinitionMd5':'c5ce18052f9b2f0a1f1629d46920a97c'},indent=2))
 (E/'POSTGRES-RESULTS.json').write_text(json.dumps({'status':'PASS','count':len(checks),'checks':checks,'scope':'Synthetic full-schema PostgreSQL; client execution denial plus owner-context TZS body tests, not API activation or real Auth/device E2E','remoteWrites':False},indent=2));print('PASS '+str(len(checks)))
finally:
 if l.PORT:assert l.tool('pg_ctl',['-D',str(l.CLUSTER),'-m','fast','-w','stop'])[0]==0
