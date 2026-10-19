from pathlib import Path
import sys,json,uuid,concurrent.futures,re
sys.dont_write_bytecode=True;sys.path.insert(0,str(Path('engineering/currency-onboarding-20261018').resolve()));import local as l
E=Path(__file__).resolve().parent;N=E.parent/'native-financial-contracts-20261019';l.E=N;l.CLUSTER=N/'disposable-native-v2';q=lambda s:"'"+str(s).replace("'","''")+"'";read=lambda s:l.sql(s)[1];checks=[];scenarios=[]
owner=str(uuid.uuid5(uuid.NAMESPACE_URL,'zetra-normal-proforma-1'))
def ck(n,v):assert v,n;checks.append(n)
def auth(actor=owner):return 'SET ROLE coordinated_client;SET request.jwt.claims='+q(json.dumps({'sub':actor} if actor else {}))+';'
def call(row,request,body,actor=owner):return auth(actor)+'SELECT public.create_native_expense_v1('+q(row['storeId'])+','+q(request)+','+q(row['currency'])+',1,'+q(json.dumps(body))+'::jsonb)'
try:
 l.PORT=l.start();historical=read("SELECT md5(string_agg(to_jsonb(e)::text,'' ORDER BY id)) FROM public.expenses e");exists=read("SELECT to_regprocedure('public.create_native_expense_v1(uuid,uuid,text,integer,jsonb)') IS NOT NULL")=='t'
 if exists:
  definition=re.search(r'CREATE FUNCTION public.create_native_expense_v1\(.*?END \$\$;', (E/'1906-expense.sql').read_text(),re.S).group().replace('CREATE FUNCTION','CREATE OR REPLACE FUNCTION',1);l.sql(definition)
 else:l.sql((E/'2026101906-native-expense-integrity.DRAFT.sql').read_text())
 ck('migration does not rewrite previous expenses',historical==read("SELECT md5(string_agg(to_jsonb(e)::text,'' ORDER BY id)) FROM public.expenses e"))
 for role in ['anon','authenticated','service_role','coordinated_client']:
  ck(role+' native expense RPC quarantined',read("SELECT NOT has_function_privilege('"+role+"','public.create_native_expense_v1(uuid,uuid,text,integer,jsonb)','EXECUTE')")=='t')
 l.sql('GRANT EXECUTE ON FUNCTION public.create_native_expense_v1(uuid,uuid,text,integer,jsonb) TO coordinated_client')
 for row in json.loads((N/'NATIVE-RESULTS.json').read_text())['scenarios']:
  code=row['currency'];amount='123' if code in ('JPY','UGX') else '12.345' if code=='KWD' else '12.34';body={'organization_id':row['organizationId'],'amount':amount,'category':'SYNTHETIC NATIVE','payment_method':'CASH','expense_date':'2026-10-19'};request=str(uuid.uuid4())
  ck(code+' denied before rollout',l.sql(call(row,request,body),False)[0]!=0)
  l.sql('UPDATE backend_core.native_financial_rollout SET enabled=true WHERE organization_id='+q(row['organizationId']))
  result=json.loads(read(call(row,request,body)));eid=result['expenseId'];ck(code+' exact original amount and currency stored',result['amount']==amount and result['currency']==code and not result['accountSettlementCertified'])
  ck(code+' replay returns same immutable record',json.loads(read(call(row,request,body)))==result)
  ck(code+' changed payload conflicts',l.sql(call(row,request,{**body,'amount':'1'}),False)[0]!=0)
  ck(code+' invalid precision rejected before write',l.sql(call(row,str(uuid.uuid4()),{**body,'amount':amount+'.1' if '.' not in amount else amount+'1'}),False)[0]!=0)
  if code!='TZS':
   ck(code+' native financial expense cannot be edited without reversal',l.sql('UPDATE public.expenses SET amount=1 WHERE id='+q(eid),False)[0]!=0)
   ck(code+' native expense cannot be deleted',l.sql('DELETE FROM public.expenses WHERE id='+q(eid),False)[0]!=0)
  concurrent_request=str(uuid.uuid4())
  with concurrent.futures.ThreadPoolExecutor(2) as pool:out=list(pool.map(lambda _:json.loads(read(call(row,concurrent_request,body))),range(2)))
  ck(code+' concurrent retry creates one expense',out[0]==out[1] and read('SELECT count(*) FROM public.expenses WHERE id='+q(out[0]['expenseId']))=='1')
  ck(code+' cross organization denied',l.sql(call(row,str(uuid.uuid4()),{**body,'organization_id':str(uuid.uuid4())}),False)[0]!=0)
  ck(code+' unauthenticated request denied',l.sql(call(row,str(uuid.uuid4()),body,None),False)[0]!=0)
  scenarios.append({'currency':code,'amount':amount,'expenseId':eid,'accountSettlementCertified':False})
 ck('no orphan permits',read('SELECT count(*) FROM backend_core.native_financial_intents')=='0')
 (E/'EXPENSE-RESULTS.json').write_text(json.dumps({'status':'PASS','count':len(checks),'checks':checks,'scenarios':scenarios,'scope':'Canonical create_expense_v2 and exact native envelope in disposable full schema. Synthetic Auth; not an external cash/account settlement.'},indent=2));print('PASS '+str(len(checks)))
finally:
 if l.PORT:
  l.sql('UPDATE backend_core.native_financial_rollout SET enabled=false;REVOKE EXECUTE ON FUNCTION public.create_native_expense_v1(uuid,uuid,text,integer,jsonb) FROM coordinated_client',False)
  l.tool('pg_ctl',['-D',str(l.CLUSTER),'-m','fast','-w','stop'])


