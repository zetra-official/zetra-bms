from pathlib import Path
import sys,json,uuid,concurrent.futures,re,tempfile
from decimal import Decimal as D
sys.dont_write_bytecode=True;sys.path.insert(0,str(Path('engineering/currency-onboarding-20261018').resolve()));import local as l
E=Path(__file__).resolve().parent;N=E.parent/'native-financial-contracts-20261019';l.E=N;l.CLUSTER=N/'disposable-native-v2';q=lambda s:"'"+str(s).replace("'","''")+"'";read=lambda s:l.sql(s)[1];checks=[];owner=str(uuid.uuid5(uuid.NAMESPACE_URL,'zetra-normal-proforma-1'))
def ck(n,v):assert v,n;checks.append(n)
def auth(a=owner):return 'SET ROLE coordinated_client;SET request.jwt.claims='+q(json.dumps({'sub':a} if a else {}))+';'
def count():return read('SELECT json_build_array((SELECT count(*) FROM public.sales),(SELECT count(*) FROM public.sale_payments),(SELECT count(*) FROM public.expenses),(SELECT count(*) FROM backend_core.settlement_bindings))')
try:
 l.PORT=l.start();row=next(r for r in json.loads((N/'NATIVE-RESULTS.json').read_text())['scenarios'] if r['currency']=='KWD');o=row['organizationId'];s=row['storeId'];account=str(uuid.uuid4());names=['confirm_settlement_account_v1','post_bound_financial_v1','read_bound_account_balance_v1','get_bound_financial_result_v1','original_refund_readiness_v1']
 for name in names:
  for role in ['anon','authenticated','service_role']:ck(name+' effective API denial '+role,read("SELECT NOT has_function_privilege('"+role+"',oid,'EXECUTE') FROM pg_proc WHERE proname="+q(name))=='t')
  for sig in read('SELECT oid::regprocedure FROM pg_proc WHERE proname='+q(name)).splitlines():l.sql('GRANT EXECUTE ON FUNCTION '+sig+' TO coordinated_client')
 l.sql("CREATE ROLE settlement_inherited_test NOLOGIN INHERIT;GRANT authenticated TO settlement_inherited_test;CREATE ROLE settlement_session_test LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;GRANT settlement_inherited_test TO settlement_session_test")
 ck('inheriting authenticated cannot bypass quarantine',read("SELECT NOT has_function_privilege('settlement_inherited_test','public.post_bound_financial_v1(uuid,uuid,text,integer,text,jsonb,jsonb,uuid,jsonb)','EXECUTE')")=='t')
 # SET ROLE from a postgres session retains administrative session authority.
 # Verify escalation on an actual unprivileged LOGIN session instead.
 with tempfile.TemporaryDirectory(dir=N) as tmp:
  f=Path(tmp)/'role.sql';f.write_text('SET ROLE postgres;',encoding='utf-8');r=l.tool('psql',['-X','-w','-qAt','-v','ON_ERROR_STOP=1','-h','127.0.0.1','-p',str(l.PORT),'-U','settlement_session_test','-d','postgres','-f',str(f)]);ck('unprivileged inherited client session cannot SET ROLE postgres',r[0]!=0 and 'permission denied' in r[2])
 ck('private account table inaccessible',l.sql('SET ROLE authenticated;SELECT * FROM backend_core.settlement_accounts',False)[0]!=0)
 ck('private source bindings inaccessible',l.sql('SET ROLE authenticated;SELECT * FROM backend_core.settlement_bindings',False)[0]!=0)
 confirm=auth()+'SELECT public.confirm_settlement_account_v1('+','.join([q(account),q(s),q('CASH'),q('KWD'),'2.000',q('SYNTHETIC-CONCURRENCY-'+account),q('OWNER_LOCAL_FUNDS_CONFIRMATION')])+')';read(confirm)
 ck('account opening cannot be guessed from device or altered on retry',l.sql(confirm.replace('2.000','999.000'),False)[0]!=0)
 outsider=str(uuid.uuid4());l.sql('INSERT INTO auth.users(id) VALUES('+q(outsider)+')');ck('unassigned user cannot read account balances',l.sql(auth(outsider)+'SELECT public.read_bound_account_balance_v1('+q(account)+')',False)[0]!=0)
 l.sql('UPDATE backend_core.settlement_rollout SET enabled=true WHERE organization_id='+q(o));l.sql('UPDATE backend_core.native_financial_rollout SET enabled=true WHERE organization_id='+q(o))
 def command(op,payload,req=None,actor=owner,ac=account):return auth(actor)+'SELECT public.post_bound_financial_v1('+','.join([q(s),q(req or str(uuid.uuid4())),q('KWD'),'1',q(op),q(json.dumps(payload))+'::jsonb',q(json.dumps({'CASH':ac}))+'::jsonb','NULL',q(json.dumps({'source':'OWNER_CONFIRMED','reference':'LOCAL_CONCURRENT_ORIGINAL_RECORD'}))+'::jsonb'])+')'
 expense={'organization_id':o,'amount':'1.500','category':'OTHER','payment_method':'CASH','expense_date':'2026-10-19','note':'LOCAL CONCURRENT'}
 with concurrent.futures.ThreadPoolExecutor(2) as pool:r=list(pool.map(lambda _:l.sql(command('EXPENSE',expense),False),range(2)))
 ck('concurrent outflows cannot overdraw verified funds',sum(x[0]==0 for x in r)==1 and any('FUNDS_INSUFFICIENT' in x[2] for x in r))
 balance=json.loads(read(auth()+'SELECT public.read_bound_account_balance_v1('+q(account)+')'));ck('failed outflow leaves exact original balance',D(balance['balance'])==D('0.500'))
 ck('failed outflow creates no extra binding',read('SELECT count(*)=1 FROM backend_core.settlement_bindings WHERE account_id='+q(account))=='t')
 sale={'organization_id':o,'items':[{'product_id':row['productId'],'qty':'1','unit_price':'12.345'}],'payment_method':'CASH','paid_amount':'12.345','is_credit':False};req=str(uuid.uuid4())
 with concurrent.futures.ThreadPoolExecutor(2) as pool:r=list(pool.map(lambda _:l.sql(command('SALE',sale,req),False),range(2)))
 ck('concurrent retry records one canonical sale and receipt',all(x[0]==0 for x in r) and r[0][1]==r[1][1])
 result=json.loads(r[0][1]);recovery=auth()+'SELECT public.get_bound_financial_result_v1('+q(s)+','+q(req)+')';ck('read-only recovery returns bound outcome without posting',json.loads(read(recovery))==result)
 cashier=read('SELECT user_id FROM public.org_memberships WHERE organization_id='+q(o)+" AND role='cashier' AND is_active LIMIT 1");ck('another store member cannot recover another actor request',read(auth(cashier)+'SELECT public.get_bound_financial_result_v1('+q(s)+','+q(req)+')')=='')
 before=count();ck('refund request without original evidence remains denied',l.sql(command('REFUND',{'sale_id':result['saleId']}),False)[0]!=0 and count()==before)
 ck('missing manual confirmation rolls back entire new sale',l.sql(command('SALE',sale).replace('LOCAL_CONCURRENT_ORIGINAL_RECORD',''),False)[0]!=0 and count()==before)
 ck('bound canonical payment cannot be rewritten',l.sql('UPDATE public.sale_payments SET paid_amount=1 WHERE sale_id='+q(result['saleId']),False)[0]!=0)
 ck('no stranded permission intents after failed requests',read('SELECT (SELECT count(*)=0 FROM backend_core.settlement_intents) AND (SELECT count(*)=0 FROM backend_core.native_financial_intents)')=='t')
 ck('Funding Control not promoted or activated',read("SELECT pg_get_functiondef('funding_control.source_ready(uuid)'::regprocedure) LIKE '%SELECT false%'")=='t')
 (E/'BINDING-SECURITY-RESULTS.json').write_text(json.dumps({'status':'PASS','count':len(checks),'checks':checks,'scope':'Actual disposable transactions, role inheritance, account projection, concurrent funds protection, bound recovery and refund denial. No genuine Auth or Production writes.'},indent=2));print('PASS '+str(len(checks)))
finally:
 if l.PORT:
  l.sql('UPDATE backend_core.settlement_rollout SET enabled=false',False);l.sql('UPDATE backend_core.native_financial_rollout SET enabled=false',False);l.sql('DROP ROLE IF EXISTS settlement_session_test;DROP ROLE IF EXISTS settlement_inherited_test',False)
  l.sql("DO $$DECLARE p record;BEGIN FOR p IN SELECT oid FROM pg_proc WHERE proname IN ('confirm_settlement_account_v1','post_bound_financial_v1','read_bound_account_balance_v1','get_bound_financial_result_v1','original_refund_readiness_v1') LOOP EXECUTE format('REVOKE ALL ON FUNCTION %s FROM coordinated_client',p.oid::regprocedure);END LOOP;END$$",False);l.tool('pg_ctl',['-D',str(l.CLUSTER),'-m','fast','-w','stop'])
