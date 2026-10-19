from pathlib import Path
import sys,json,uuid,time,concurrent.futures
sys.dont_write_bytecode=True;sys.path.insert(0,str(Path('engineering/currency-onboarding-20261018').resolve()))
import local as l
E=Path(__file__).resolve().parent;l.E=E;l.CLUSTER=max(E.glob('disposable-*'),key=lambda p:p.stat().st_ctime)
l.env.update(PGPASSFILE=str(E/'NO-CREDENTIALS'),PGSERVICEFILE=str(E/'NO-SERVICES'))
q=lambda v:"'"+str(v).replace("'","''")+"'";C=[]
def read(s):return l.sql(s)[1]
def ck(n,v):assert v,n;C.append(n)
try:
 l.PORT=l.start()
 digest=json.loads((E/'POSTIMAGE.json').read_text())['gatewayMd5'];assert read("SELECT md5(replace(pg_get_functiondef('public.create_org_with_store_currency_tzs_v1(uuid,text,text,text,text,boolean)'::regprocedure),chr(13),''))")==digest
 l.sql("UPDATE backend_core.tzs_onboarding_allowlist SET expires_at=clock_timestamp()-interval '1 second';")
 actor=str(uuid.uuid4());req=str(uuid.uuid4())
 l.sql('INSERT INTO auth.users(id,email_confirmed_at,role,is_anonymous)VALUES('+q(actor)+",clock_timestamp(),'authenticated',false);")
 enrollment='SET zetra.tzs_canary_actor='+q(actor)+';SET zetra.tzs_canary_request='+q(req)+";SET zetra.tzs_approval='LOCAL_LOCK_EXPIRY';SET zetra.tzs_canary_org='ZETRA CANARY TZS LOCAL';SET zetra.tzs_canary_store='SYNTHETIC TZS LOCAL';SET zetra.tzs_canary_timezone='UTC';"+(E/'ACTIVATE-QUOTA-CANARY.DRAFT.sql').read_text()
 l.sql(enrollment);n=read('SELECT count(*) FROM public.organizations')
 def call(exp):return l.sql('SET ROLE authenticated;SET request.jwt.claims='+q(json.dumps({'sub':actor,'role':'authenticated','exp':exp}))+';SELECT public.create_org_with_store_currency_tzs_v1('+q(req)+",'ZETRA CANARY TZS LOCAL','SYNTHETIC TZS LOCAL','TZS','UTC',true);",False)
 for kind in ['enrollment','jwt']:
  l.sql("UPDATE backend_core.tzs_onboarding_allowlist SET expires_at=clock_timestamp()+interval '1 hour' WHERE actor_id="+q(actor))
  with concurrent.futures.ThreadPoolExecutor(1) as pool:
   lock=pool.submit(l.sql,'BEGIN;SELECT actor_id FROM backend_core.tzs_onboarding_canary_quota WHERE actor_id='+q(actor)+" FOR UPDATE;SELECT pg_sleep(2.5) /*quota_lock_probe*/;COMMIT;")
   for _ in range(20):
    if read("SELECT count(*) FROM pg_stat_activity WHERE wait_event='PgSleep' AND query LIKE '%quota_lock_probe%'")!='0':break
    time.sleep(.03)
   else:raise AssertionError('BLOCKER_NOT_OBSERVED')
   if kind=='enrollment':l.sql("UPDATE backend_core.tzs_onboarding_allowlist SET expires_at=clock_timestamp()+interval '0.8 seconds' WHERE actor_id="+q(actor))
   out=call(int(time.time())+(1 if kind=='jwt' else 3600));lock.result()
  ck(kind+' expiry rechecked after quota row-lock wait',out[0]!=0 and ('AUTH_SESSION_EXPIRED' if kind=='jwt' else 'TZS_ROLLOUT_NOT_ENABLED') in out[2])
  ck(kind+' expiry creates no org or consumed receipt',read('SELECT count(*) FROM public.organizations')==n and read('SELECT result IS NULL FROM backend_core.tzs_onboarding_canary_quota WHERE actor_id='+q(actor))=='t')
 l.sql((E/'DISABLE-ROLLBACK.DRAFT.sql').read_text())
 l.sql('UPDATE auth.users SET email_confirmed_at=NULL WHERE id='+q(actor))
 out=l.sql(enrollment,False);ck('unconfirmed Auth actor cannot enroll',out[0]!=0 and 'INVALID_CANARY_ACTOR' in out[2])
 ck('failed enrollment preserves disabled switch',read('SELECT enabled FROM backend_core.tzs_onboarding_rollout')=='f')
 (E/'LOCK-EXPIRY-RESULTS.json').write_text(json.dumps({'status':'PASS','count':len(C),'checks':C,'scope':'Actual PostgreSQL row-lock waits; simulated Auth JWT claims; loopback disposable only'},indent=2));print('PASS '+str(len(C)))
finally:
 if l.PORT:assert l.tool('pg_ctl',['-D',str(l.CLUSTER),'-m','fast','-w','stop'])[0]==0
