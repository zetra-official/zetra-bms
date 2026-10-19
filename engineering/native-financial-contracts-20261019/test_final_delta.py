from pathlib import Path
import sys,json,re,uuid
from decimal import Decimal as D
sys.dont_write_bytecode=True;sys.path.insert(0,str(Path('engineering/currency-onboarding-20261018').resolve()));import local as l
E=Path(__file__).resolve().parent;l.E=E;l.CLUSTER=E/'disposable-native-v2'
q=lambda s:"'"+str(s).replace("'","''")+"'";read=lambda s:l.sql(s)[1];checks=[]
actor=str(uuid.uuid5(uuid.NAMESPACE_URL,'zetra-normal-proforma-1'))
def ck(n,v):assert v,n;checks.append(n)
def auth():return 'SET ROLE coordinated_client;SET request.jwt.claims='+q(json.dumps({'sub':actor}))+';'
def call(row,body):return auth()+'SELECT public.create_native_sale_v1('+q(row['storeId'])+','+q(str(uuid.uuid4()))+','+q(row['currency'])+',1,'+q(json.dumps(body))+'::jsonb)'
def state():return read("SELECT md5(string_agg(to_jsonb(s)::text,'' ORDER BY id)) FROM public.sales s")
try:
 l.PORT=l.start()
 tail=(E/'1905-gateways.sql').read_text();definition=re.search(r'CREATE FUNCTION public.create_native_sale_v1\(.*?END \$\$;',tail,re.S).group().replace('CREATE FUNCTION','CREATE OR REPLACE FUNCTION',1)
 l.sql(definition+'GRANT EXECUTE ON FUNCTION public.create_native_sale_v1(uuid,uuid,text,integer,jsonb) TO coordinated_client')
 for row in json.loads((E/'NATIVE-RESULTS.json').read_text())['scenarios']:
  code=row['currency'];price='123' if code in ('JPY','UGX') else '12.345' if code=='KWD' else '12.34';cash='23' if code in ('JPY','UGX') else '2.345' if code=='KWD' else '2.34'
  body={'organization_id':row['organizationId'],'items':[{'product_id':row['productId'],'qty':'1','unit_price':price}],'payment_method':'CASH','paid_amount':price,'is_credit':False,'split':{'cash':cash,'mobile':'5','bank':str(D(price)-D(cash)-5)}}
  result=json.loads(read(call(row,body)));payments=json.loads(read('SELECT json_object_agg(payment_method,paid_amount::text) FROM public.sale_payments WHERE sale_id='+q(result['saleId'])))
  ck(code+' exact three-way canonical payment allocation',payments=={'CASH':cash,'MOBILE':'5','BANK':str(D(price)-D(cash)-5)})
  for label,changes in [('negative split',{'split':{'cash':'-1','mobile':'5','bank':'5'}}),('underallocated split',{'split':{'cash':'0','mobile':'0','bank':'1'}}),('untrusted note',{'note':'SPLIT_PAYMENT: CASH=1 | MOBILE=1 | BANK=1'})]:
   before=state();bad=l.sql(call(row,{**body,**changes}),False);ck(code+' '+label+' rejected atomically',bad[0]!=0 and state()==before)
 ck('no stranded transaction permits',read('SELECT count(*) FROM backend_core.native_financial_intents')=='0')
 # Capture actual remaining canonical boundaries, not inferred alternatives.
 contracts=read("SELECT coalesce(json_agg(json_build_object('identity',p.oid::regprocedure::text,'definition',pg_get_functiondef(p.oid))),'[]') FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('funding_canonical','funding_evidence') AND p.proname IN ('receipt_capability','return_intent','apply_return')")
 (E/'PROCUREMENT-BOUNDARIES.json').write_text(json.dumps(json.loads(contracts),indent=2))
 (E/'FINAL-DELTA-RESULTS.json').write_text(json.dumps({'status':'PASS','count':len(checks),'checks':checks,'scope':'Final structured allocation gateway on full-schema disposable PostgreSQL. Synthetic Auth. No live transactions.'},indent=2));print('PASS '+str(len(checks)))
finally:
 if l.PORT:
  l.sql('REVOKE EXECUTE ON FUNCTION public.create_native_sale_v1(uuid,uuid,text,integer,jsonb) FROM coordinated_client',False)
  l.tool('pg_ctl',['-D',str(l.CLUSTER),'-m','fast','-w','stop'])
