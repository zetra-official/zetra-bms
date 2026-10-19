from pathlib import Path
import sys,json,uuid,concurrent.futures,runpy,time
sys.dont_write_bytecode=True;sys.path.insert(0,str(Path('engineering/currency-onboarding-20261018').resolve()))
import local as l
E=Path(__file__).resolve().parent;OLD=Path('engineering/currency-canary-quota-20261019').resolve()
l.SOURCE=max(OLD.glob('disposable-*'),key=lambda p:p.stat().st_ctime);l.E=E;l.CLUSTER=E/('disposable-'+uuid.uuid4().hex[:8]);l.env.update(PGPASSFILE=str(E/'NO-CREDENTIALS'),PGSERVICEFILE=str(E/'NO-SERVICES'))
A='bb2d6dee-773d-4fa7-8fda-1eb85bbad2cd';REQ=str(uuid.uuid4());C=[];q=lambda x:"'"+str(x).replace("'","''")+"'"
F='public.create_org_with_store_currency_tzs_v1(uuid,text,text,text,text,boolean)'
def read(s):return l.sql(s)[1]
def ck(n,v):assert v,n;C.append(n)
def claims(a=A):return q(json.dumps({'sub':a,'role':'authenticated','exp':int(time.time())+3600}))
def auth(a=A):return 'SET ROLE authenticated;SET request.jwt.claims='+claims(a)+';'
def plan():return json.loads(read('SET request.jwt.claims='+claims()+';SELECT row_to_json(p) FROM public._get_my_effective_plan() p'))
def call(req=REQ,ok=True):return l.sql(auth()+'SELECT public.create_org_with_store_currency_tzs_v1('+q(req)+",'ZETRA CANARY TZS OWNER','SYNTHETIC TZS OWNER','TZS','Africa/Dar_es_Salaam',true);",ok)
def enroll(actor=A,req=REQ,ok=True):return l.sql('SET zetra.tzs_canary_actor='+q(actor)+';SET zetra.tzs_canary_request='+q(req)+";SET zetra.tzs_approval='LOCAL_OWNER_APPROVAL';SET zetra.tzs_canary_org='ZETRA CANARY TZS OWNER';SET zetra.tzs_canary_store='SYNTHETIC TZS OWNER';SET zetra.tzs_canary_timezone='Africa/Dar_es_Salaam';"+(E/'ACTIVATE-OWNER-CANARY.DRAFT.sql').read_text(),ok)
def snapshot(t,where='true'):return read("SELECT md5(coalesce(string_agg(to_jsonb(x)::text,'' ORDER BY to_jsonb(x)::text),'')) FROM "+t+' x WHERE '+where)
try:
 l.PORT=l.start();ck('isolated disposable full-schema copy',Path(read('SHOW data_directory')).resolve()==l.CLUSTER.resolve())
 l.sql("UPDATE backend_core.tzs_onboarding_allowlist SET expires_at=clock_timestamp()-interval '1 second';")
 ck('original 1902 postimage retained',read("SELECT md5(replace(pg_get_functiondef('"+F+"'::regprocedure),chr(13),''))")=='953346c2582e3f4ae047796ec87ff0bf')
 l.sql('INSERT INTO auth.users(id,email_confirmed_at,role,is_anonymous)VALUES('+q(A)+",clock_timestamp(),'authenticated',false)")
 # The captured reconstruction fixture quarantined this legacy entry point;
 # restore only its independently verified Production ACL for this local test.
 ck('canonical definition matches Production before restoring fixture ACL',read("SELECT md5(replace(pg_get_functiondef('public.create_org_with_store(text,text)'::regprocedure),chr(13),''))")=='4883dcef2455a74f1938f4bebb03558e')
 l.sql('GRANT EXECUTE ON FUNCTION public.create_org_with_store(text,text) TO PUBLIC,anon,authenticated,service_role;')
 # Catalog fixture is empty, not a Production data dump. Seed only the observed
 # BUSINESS / max_organizations=2 metadata; no billing/payment simulation claim.
 business_id=read("INSERT INTO public.plans(code,name,max_organizations)VALUES('BUSINESS','SYNTHETIC BUSINESS PLAN',2) RETURNING id")
 old_orgs=[]
 for i in range(2):
  org=read("INSERT INTO public.organizations(name,created_by)VALUES('SYNTHETIC OLD TRAINING "+str(i)+"',"+q(A)+') RETURNING id');old_orgs.append(org)
  l.sql('INSERT INTO public.stores(organization_id,name,created_by)VALUES('+q(org)+",'SYNTHETIC OLD STORE',"+q(A)+');INSERT INTO public.org_memberships(organization_id,user_id,role)VALUES('+q(org)+','+q(A)+",'owner');")
  l.sql('INSERT INTO public.organization_subscriptions(organization_id,plan_id,status,end_at,created_by) SELECT '+q(org)+','+q(business_id)+",'ACTIVE',clock_timestamp()+interval '1 day',"+q(A)+' WHERE NOT EXISTS(SELECT 1 FROM public.organization_subscriptions WHERE organization_id='+q(org)+');UPDATE public.organization_subscriptions SET plan_id='+q(business_id)+",status='ACTIVE',end_at=clock_timestamp()+interval '1 day' WHERE organization_id="+q(org))
 ck('actual backend plan helper sees BUSINESS 2 with two owned training orgs',plan()['max_organizations']==2)
 err=l.sql(auth()+"SELECT * FROM public.create_org_with_store('SYNTHETIC UNAPPROVED','SYNTHETIC STORE');",False);ck('existing canonical plan rejects third organization: '+err[2][-300:],err[0]!=0 and 'ORG_LIMIT_REACHED' in err[2])
 finances={t:snapshot('public.'+t) for t in ['sales','sale_payments','sale_items','inventory','stock_movements','expenses','cashier_shifts','credit_ledger_v2','plans','organization_subscriptions']}
 oldrows={t:snapshot('public.'+t) for t in ['organizations','stores','org_memberships','org_membership_stores']}
 # Track exact preexisting IDs: exclude only the future newly created canary rows.
 oldids={t:json.loads(read('SELECT coalesce(json_agg(id),\'[]\'::json) FROM public.'+t)) for t in oldrows}
 sql=(E/'2026101903-owner-canary-org-limit.DRAFT.sql').read_text()
 err=l.sql(sql.replace('COMMIT;',"DO $$BEGIN RAISE EXCEPTION 'SYNTHETIC_INSTALL_FAIL';END$$;COMMIT;"),False)
 ck('failed install rolls back canonical clause and permits',err[0]!=0 and read("SELECT to_regclass('backend_core.tzs_canary_creation_permits') IS NULL AND md5(replace(pg_get_functiondef('public.create_org_with_store(text,text)'::regprocedure),chr(13),''))='4883dcef2455a74f1938f4bebb03558e'")=='t')
 l.sql(sql)
 digest=read("SELECT md5(replace(pg_get_functiondef('"+F+"'::regprocedure),chr(13),''))");canon=read("SELECT md5(replace(pg_get_functiondef('public.create_org_with_store(text,text)'::regprocedure),chr(13),''))")
 (E/'POSTIMAGE.json').write_text(json.dumps({'gatewayMd5':digest,'canonicalMd5':canon},indent=2));runpy.run_path(str(E/'build_drafts.py'))
 ck('installation remains quarantined',read("SELECT NOT enabled AND NOT has_function_privilege('authenticated',"+q(F)+",'EXECUTE') FROM backend_core.tzs_onboarding_rollout")=='t')
 for role in ['anon','authenticated','service_role','authenticator','cli_login_postgres']:
  ck(role+' cannot call private permit helper',read('SELECT has_function_privilege('+q(role)+",'backend_core.consume_tzs_canary_org_permit(uuid)','EXECUTE')")=='f')
  ck(role+' cannot insert permit',l.sql('SET ROLE '+role+';INSERT INTO backend_core.tzs_canary_creation_permits VALUES('+q(A)+','+q(REQ)+',pg_backend_pid(),txid_current(),false);',False)[0]!=0)
 ck('ordinary existing onboarding still enforces plan',l.sql(auth()+"SELECT * FROM public.create_org_with_store('SYNTHETIC BYPASS','STORE');",False)[0]!=0)
 bad=str(uuid.uuid4());l.sql('INSERT INTO auth.users(id,email_confirmed_at,role,is_anonymous)VALUES('+q(bad)+",clock_timestamp(),'authenticated',false)")
 ck('activation rejects any different actor',enroll(bad,ok=False)[0]!=0)
 enroll();ck('approved Owner with existing memberships can enroll',read('SELECT count(*) FROM backend_core.tzs_onboarding_allowlist WHERE actor_id='+q(A))=='1')
 ck('enrollment does not raise ordinary account plan',plan()['max_organizations']==2)
 ck('legacy API cannot consume canary allowance',l.sql(auth()+"SELECT * FROM public.create_org_with_store('SYNTHETIC BYPASS','STORE');",False)[0]!=0)
 ck('new request ID rejected before any plan exception',call(str(uuid.uuid4()),False)[0]!=0)
 n=read('SELECT count(*) FROM public.organizations')
 l.sql("CREATE FUNCTION backend_core.fail_owner_receipt() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'SYNTHETIC_OWNER_RECEIPT_FAILURE';END$$;CREATE TRIGGER fail_owner_receipt BEFORE UPDATE ON backend_core.tzs_onboarding_canary_quota FOR EACH ROW EXECUTE FUNCTION backend_core.fail_owner_receipt();")
 ck('downstream failure rolls back extra org and private permit',call(ok=False)[0]!=0 and read('SELECT count(*) FROM public.organizations')==n and read('SELECT count(*) FROM backend_core.tzs_canary_creation_permits')=='0')
 l.sql('DROP TRIGGER fail_owner_receipt ON backend_core.tzs_onboarding_canary_quota;DROP FUNCTION backend_core.fail_owner_receipt();')
 with concurrent.futures.ThreadPoolExecutor(4) as pool:out=list(pool.map(lambda _:call(),range(4)))
 v=json.loads(out[0][1]);ck('concurrent approved retries same result',all(json.loads(x[1])==v for x in out))
 ck('exactly one additional synthetic organization',read('SELECT count(*) FROM public.org_memberships WHERE user_id='+q(A)+" AND role='owner'")=='3')
 ck('exactly one new synthetic store',read('SELECT count(*) FROM public.stores WHERE organization_id='+q(v['organizationId']))=='1')
 ck('no persistent transaction permit',read('SELECT count(*) FROM backend_core.tzs_canary_creation_permits')=='0')
 ck('new intent cannot obtain second exception',call(str(uuid.uuid4()),False)[0]!=0)
 ck('legacy API still denied after accepted canary',l.sql(auth()+"SELECT * FROM public.create_org_with_store('SYNTHETIC FOURTH','STORE');",False)[0]!=0)
 ck('new TZS authority persisted without posting',json.loads(read(auth()+'SELECT public.get_org_accounting_currency_v1('+q(v['organizationId'])+');'))['currency']=='TZS' and not v['postingActivated'])
 ck('other Auth actor cannot read new organization currency',l.sql(auth(bad)+'SELECT public.get_org_accounting_currency_v1('+q(v['organizationId'])+');',False)[0]!=0)
 for t,expected in oldrows.items():ck(t+' preexisting rows byte-for-byte unchanged',snapshot('public.'+t,'id IN('+','.join(q(i)+'::uuid' for i in oldids[t])+')')==expected)
 for t,expected in finances.items():ck(t+' historical records/plan unchanged',snapshot('public.'+t)==expected)
 l.sql((E/'DISABLE-OWNER-CANARY.DRAFT.sql').read_text());ck('disable revokes access and retains one receipt',read('SELECT NOT enabled AND NOT has_function_privilege(\'authenticated\','+q(F)+",'EXECUTE') FROM backend_core.tzs_onboarding_rollout")=='t' and read('SELECT count(*) FROM backend_core.tzs_onboarding_canary_quota WHERE actor_id='+q(A)+' AND result IS NOT NULL')=='1')
 (E/'POSTGRES-RESULTS.json').write_text(json.dumps({'status':'PASS','count':len(C),'checks':C,'scope':'Actual local canonical plan/subscription/org functions with synthetic Owner UUID replica and captured schema; simulated JWT/Auth, not genuine Supabase Auth','productionWrites':False},indent=2));print('PASS '+str(len(C)))
finally:
 if l.PORT:assert l.tool('pg_ctl',['-D',str(l.CLUSTER),'-m','fast','-w','stop'])[0]==0
