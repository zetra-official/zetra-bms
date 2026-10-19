from pathlib import Path
import sys,json,uuid
from decimal import Decimal as D
sys.dont_write_bytecode=True
sys.path.insert(0,str(Path('engineering/currency-onboarding-20261018').resolve()))
import local as l
E=Path(__file__).resolve().parent;N=E.parent/'native-financial-contracts-20261019'
l.E=N;l.CLUSTER=N/'disposable-native-v2'
q=lambda s:"'"+str(s).replace("'","''")+"'"
read=lambda s:l.sql(s)[1]
owner=str(uuid.uuid5(uuid.NAMESPACE_URL,'zetra-normal-proforma-1'))
auth='SET ROLE coordinated_client;SET request.jwt.claims='+q(json.dumps({'sub':owner}))+';'
checks=[];scenarios=[]
def ck(n,v):
 assert v,n
 checks.append(n)
try:
 l.PORT=l.start()
 for sig in read("SELECT oid::regprocedure FROM pg_proc WHERE proname='post_bound_financial_v1'").splitlines():l.sql('GRANT EXECUTE ON FUNCTION '+sig+' TO coordinated_client')
 for row in json.loads((E/'BOUND-PROCUREMENT-RESULTS.json').read_text())['scenarios']:
  store=row['storeId'];code=row['currency'];product=row['productId'];org=read('SELECT organization_id FROM public.stores WHERE id='+q(store))
  price=read('SELECT selling_price FROM public.products WHERE id='+q(product))
  l.sql('UPDATE backend_core.settlement_rollout SET enabled=true WHERE organization_id='+q(org))
  l.sql('UPDATE backend_core.native_financial_rollout SET enabled=true WHERE organization_id='+q(org))
  sale={'organization_id':org,'items':[{'product_id':product,'qty':'1','unit_price':price}],'payment_method':'CASH','paid_amount':price,'is_credit':False}
  request=str(uuid.uuid4())
  sql=auth+'SELECT public.post_bound_financial_v1('+','.join([q(store),q(request),q(code),'1',q('SALE'),q(json.dumps(sale))+'::jsonb',q(json.dumps({'CASH':row['accountId']}))+'::jsonb','NULL',q(json.dumps({'source':'OWNER_CONFIRMED','reference':'SYNTHETIC_RECEIPT_COGS'}))+'::jsonb'])+')'
  result=json.loads(read(sql));sid=result['saleId']
  actual=json.loads(read('SELECT json_build_object(\'cost\',unit_cost::text,\'qty\',qty::text) FROM public.sale_items WHERE sale_id='+q(sid)+' AND product_id='+q(product)))
  ck(code+' original receipt cost used in canonical sale',D(actual['cost'])==D(row['paid']) and D(actual['qty'])==1)
  ck(code+' received quantity deducted once and original cost retained',read('SELECT qty=0 FROM public.inventory WHERE store_id='+q(store)+' AND product_id='+q(product))=='t' and read('SELECT count(*)=1 FROM backend_core.receipt_cost_snapshots WHERE order_id='+q(row['orderId']))=='t')
  ck(code+' sale retry preserves COGS and stock',json.loads(read(sql))==result and read('SELECT count(*)=1 FROM public.sale_items WHERE sale_id='+q(sid))=='t')
  scenarios.append({'currency':code,'originalReceiptCost':row['paid'],'nativeSaleTotal':result['total'],'cogs':actual['cost'],'grossMarginBeforeOtherExpenses':str(D(result['total'])-D(actual['cost'])),'inventoryAfter':'0','saleId':sid})
 (E/'BOUND-RECEIPT-COGS-RESULTS.json').write_text(json.dumps({'status':'PASS','count':len(checks),'checks':checks,'scenarios':scenarios,'acceptance':'Disposable canonical receipt-to-sale lifecycle; synthetic Auth, no Production writes. Gross margin excludes tax/refunds/unbound expenses and is not certified net profit.'},indent=2))
 print('PASS '+str(len(checks)))
finally:
 if l.PORT:
  l.sql('UPDATE backend_core.settlement_rollout SET enabled=false',False)
  l.sql('UPDATE backend_core.native_financial_rollout SET enabled=false',False)
  l.sql("DO $$DECLARE p record;BEGIN FOR p IN SELECT oid FROM pg_proc WHERE proname='post_bound_financial_v1' LOOP EXECUTE format('REVOKE ALL ON FUNCTION %s FROM coordinated_client',p.oid::regprocedure);END LOOP;END$$",False)
  l.tool('pg_ctl',['-D',str(l.CLUSTER),'-m','fast','-w','stop'])
