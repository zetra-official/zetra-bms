"""Called only after the loopback server validates the real Supabase Auth user.
Financial operations use the existing disposable PostgreSQL ONLY, not Supabase.
This is adapter acceptance, not deployed product UI/PostgREST certification.
"""
from pathlib import Path
import sys,json,uuid
from decimal import Decimal as D
sys.dont_write_bytecode=True;sys.path.insert(0,str(Path('engineering/currency-onboarding-20261018').resolve()));import local as l
E=Path(__file__).resolve().parent;N=E.parent/'native-financial-contracts-20261019';l.E=N;l.CLUSTER=N/'disposable-native-v2'
actor=str(uuid.UUID(sys.argv[1]));run=str(uuid.UUID(sys.argv[2]));assert actor=='bb2d6dee-773d-4fa7-8fda-1eb85bbad2cd'
q=lambda s:"'"+str(s).replace("'","''")+"'";read=lambda s:l.sql(s)[1];checks=[];results=[];reports=[]
auth='SET ROLE coordinated_client;SET request.jwt.claims='+q(json.dumps({'sub':actor}))+';'
def ck(n,v):assert v,n;checks.append(n)
def post(row,op,payload,accounts,request):
 return auth+'SELECT public.post_bound_financial_v1('+','.join([q(row['storeId']),q(request),q(row['currency']),'1',q(op),q(json.dumps(payload))+'::jsonb',q(json.dumps(accounts))+'::jsonb','NULL',q(json.dumps({'source':'OWNER_CONFIRMED','reference':'LOCAL_SYNTHETIC_ACCEPTANCE_ONLY'}))+'::jsonb'])+')'
try:
 l.PORT=l.start();ck('database is the exact disposable local cluster',Path(read("SELECT current_setting('data_directory')")).resolve()==l.CLUSTER.resolve())
 for sig in read("SELECT oid::regprocedure FROM pg_proc WHERE proname IN('post_bound_financial_v1','confirm_settlement_account_v1','read_bound_account_balance_v1','read_original_financial_facts_v1')").splitlines():l.sql('GRANT EXECUTE ON FUNCTION '+sig+' TO coordinated_client')
 for row in json.loads((N/'NATIVE-RESULTS.json').read_text())['scenarios']:
  code=row['currency'];org=row['organizationId'];store=row['storeId'];mid=str(uuid.uuid5(uuid.NAMESPACE_URL,actor+org));account=str(uuid.uuid5(uuid.NAMESPACE_URL,run+code+'account'))
  # These memberships/accounts exist only in the disposable fixture. They do not
  # add access to any real organization or alter the actor's Supabase account.
  l.sql("DO $$BEGIN IF to_regclass('auth.users') IS NOT NULL THEN INSERT INTO auth.users(id) VALUES("+q(actor)+") ON CONFLICT(id) DO NOTHING;END IF;END$$")
  l.sql('INSERT INTO public.org_memberships(id,organization_id,user_id,role,is_active) VALUES('+','.join(q(x) for x in [mid,org,actor,'owner'])+',true) ON CONFLICT DO NOTHING')
  l.sql('INSERT INTO public.org_membership_stores(membership_id,store_id) VALUES('+q(mid)+','+q(store)+') ON CONFLICT DO NOTHING')
  price='12' if code in ['UGX','JPY'] else '12.345' if code=='KWD' else '12.34';expense='1' if code in ['UGX','JPY'] else '1.001' if code=='KWD' else '1.01'
  l.sql(auth+'SELECT public.confirm_settlement_account_v1('+','.join([q(account),q(store),q('CASH'),q(code),'1000',q('GENUINE_AUTH_LOCAL_'+account),q('SYNTHETIC_OPENING_NOT_REAL_MONEY')])+')')
  l.sql('UPDATE backend_core.settlement_rollout SET enabled=true WHERE organization_id='+q(org));l.sql('UPDATE backend_core.native_financial_rollout SET enabled=true WHERE organization_id='+q(org))
  body={'organization_id':org,'items':[{'product_id':row['productId'],'qty':'1','unit_price':price}],'payment_method':'CASH','paid_amount':price,'is_credit':False}
  req=str(uuid.uuid5(uuid.NAMESPACE_URL,run+code+'sale'));command=post(row,'SALE',body,{'CASH':account},req);sale=json.loads(read(command))
  ck(code+' authenticated canonical sale context',sale['currency']==code and sale['canonicalAccountBinding'])
  ck(code+' retry stable',json.loads(read(command))==sale)
  credit={**body,'payment_method':'CREDIT','paid_amount':'0','is_credit':True,'customer_name':'SYNTHETIC ACCEPTANCE '+code}
  debt=json.loads(read(post(row,'SALE',credit,{},str(uuid.uuid5(uuid.NAMESPACE_URL,run+code+'credit')))))
  repaid=json.loads(read(post(row,'COLLECTION',{'credit_account_id':debt['creditAccountId'],'amount':price,'method':'CASH'},{'CASH':account},str(uuid.uuid5(uuid.NAMESPACE_URL,run+code+'repay')))))
  ck(code+' original currency debt repayment zero',D(repaid['balance'])==0)
  exp={'organization_id':org,'amount':expense,'category':'OTHER','payment_method':'CASH','expense_date':'2026-10-19','note':'SYNTHETIC AUTH ACCEPTANCE'}
  exp_result=json.loads(read(post(row,'EXPENSE',exp,{'CASH':account},str(uuid.uuid5(uuid.NAMESPACE_URL,run+code+'expense')))))
  balance=json.loads(read(auth+'SELECT public.read_bound_account_balance_v1('+q(account)+')'))
  expected=D(1000)+D(price)*2-D(expense)
  ck(code+' exact account conservation',D(balance['balance'])==expected)
  bad={**body,'organization_id':str(uuid.uuid4())}
  ck(code+' cross organization payload denied',l.sql(post(row,'SALE',bad,{'CASH':account},str(uuid.uuid4())),False)[0]!=0)
  facts={};sale_ids={sale['saleId'],debt['saleId']}
  for kind in ['SALE','COGS','EXPENSE']:
   page=json.loads(read(auth+'SELECT public.read_original_financial_facts_v1('+q(store)+','+q(kind)+",date_trunc('day',clock_timestamp() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC',(date_trunc('day',clock_timestamp() AT TIME ZONE 'UTC')+interval '1 day') AT TIME ZONE 'UTC',200,0,NULL)"))
   facts[kind]=[x for x in page['rows'] if (x['id'] in sale_ids if kind=='SALE' else x.get('parentId') in sale_ids if kind=='COGS' else x['id']==exp_result['expenseId'])]
  ck(code+' original report reader preserves currency and actual sale',len(facts['SALE'])==2 and all(x['context']['currency']==code for x in facts['SALE']))
  ck(code+' UTC report includes exact original expense',len(facts['EXPENSE'])==1 and D(facts['EXPENSE'][0]['values']['amount'])==D(expense) and facts['EXPENSE'][0]['context']['currency']==code)
  reports.append({'organizationId':org,'storeId':store,'storeName':'LOCAL SYNTHETIC '+code,'language':'en','from':'2026-10-19','to':'2026-10-20','facts':facts})
  results.append({'currency':code,'originalSaleTotal':price,'collected':price,'expense':expense,'accountBalance':str(expected),'saleId':sale['saleId'],'scope':'LOCAL_SYNTHETIC_ONLY'})
 receipt={'status':'PASS','count':len(checks),'checks':checks,'scenarios':results,'reportInputs':reports,'actor':actor,'request':run,'financialTarget':'DISPOSABLE_LOCAL_POSTGRESQL','productionFinancialWrites':False,'authVerification':'Required upstream server GET /auth/v1/user; standalone execution is not Auth proof','productUIAcceptance':False,'refundPosting':False,'custodyPosting':False}
 (E/'GENUINE-LOCAL-FINANCIAL-RESULTS.json').write_text(json.dumps(receipt,indent=2));print(json.dumps(receipt))
finally:
 if l.PORT:
  l.sql('UPDATE backend_core.settlement_rollout SET enabled=false',False);l.sql('UPDATE backend_core.native_financial_rollout SET enabled=false',False)
  l.sql("DO $$DECLARE p record;BEGIN FOR p IN SELECT oid FROM pg_proc WHERE proname IN('post_bound_financial_v1','confirm_settlement_account_v1','read_bound_account_balance_v1','read_original_financial_facts_v1') LOOP EXECUTE format('REVOKE ALL ON FUNCTION %s FROM coordinated_client',p.oid::regprocedure);END LOOP;END$$",False)
  l.tool('pg_ctl',['-D',str(l.CLUSTER),'-m','fast','-w','stop'])
