from pathlib import Path
import sys,json,uuid,concurrent.futures
sys.dont_write_bytecode=True;sys.path.insert(0,str(Path('engineering/currency-onboarding-20261018').resolve()));import local as l
E=Path(__file__).resolve().parent;l.E=E;l.CLUSTER=E/'disposable-native-v2';q=lambda s:"'"+str(s).replace("'","''")+"'";checks=[]
actor=str(uuid.uuid5(uuid.NAMESPACE_URL,'zetra-normal-proforma-1'));auth='SET ROLE coordinated_client;SET request.jwt.claims='+q(json.dumps({'sub':actor}))+';'
def ck(n,v):assert v,n;checks.append(n)
try:
 l.PORT=l.start();row=next(r for r in json.loads((E/'NATIVE-RESULTS.json').read_text())['scenarios'] if r['currency']=='KWD');store=row['storeId']
 l.sql('GRANT EXECUTE ON FUNCTION public.create_native_sale_v1(uuid,uuid,text,integer,jsonb),public.repay_native_credit_v1(uuid,uuid,text,integer,uuid,numeric,text,text,text) TO coordinated_client')
 body={'organization_id':row['organizationId'],'items':[{'product_id':row['productId'],'qty':'1','unit_price':'12.345'}],'payment_method':'CREDIT','paid_amount':'0','is_credit':True,'customer_name':'SYNTHETIC CONCURRENT '+str(uuid.uuid4())}
 result=json.loads(l.sql(auth+'SELECT public.create_native_sale_v1('+q(store)+','+q(str(uuid.uuid4()))+",'KWD',1,"+q(json.dumps(body))+'::jsonb)')[1]);account=result['creditAccountId']
 def repay(_):return l.sql(auth+'SELECT public.repay_native_credit_v1('+q(store)+','+q(str(uuid.uuid4()))+",'KWD',1,"+q(account)+",12.345,'CASH',NULL,NULL)",False)
 with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:attempts=list(pool.map(repay,range(2)))
 ck('concurrent distinct repayments exactly one committed',sum(r[0]==0 for r in attempts)==1)
 ck('other repayment fails with authoritative balance guard',any('REPAYMENT_EXCEEDS_BALANCE' in r[2] for r in attempts))
 ck('KWD debt reconciles exactly zero',l.sql('SELECT sum(delta)::text FROM public.credit_ledger_v2 WHERE credit_account_id='+q(account))[1] in ('0.000','0'))
 ck('no orphan permit after concurrent failure',l.sql('SELECT count(*) FROM backend_core.native_financial_intents')[1]=='0')
 before=l.sql('SELECT count(*) FROM public.credit_ledger_v2')[1];l.sql((E/'1905-DISABLE-ROLLBACK.sql').read_text());ck('disable rollback retains committed debt and payment history',l.sql('SELECT count(*) FROM public.credit_ledger_v2')[1]==before)
 (E/'CREDIT-CONCURRENCY-RESULTS.json').write_text(json.dumps({'status':'PASS','count':len(checks),'checks':checks,'scope':'Final account-lock path, actual canonical KWD debt ledger, concurrent repayments and disable rollback on disposable full schema. Synthetic Auth.'},indent=2));print('PASS '+str(len(checks)))
finally:
 if l.PORT:
  l.sql('REVOKE EXECUTE ON FUNCTION public.create_native_sale_v1(uuid,uuid,text,integer,jsonb),public.repay_native_credit_v1(uuid,uuid,text,integer,uuid,numeric,text,text,text) FROM coordinated_client',False)
  l.tool('pg_ctl',['-D',str(l.CLUSTER),'-m','fast','-w','stop'])
