from pathlib import Path
import sys,json,uuid,re,hashlib
from decimal import Decimal as D
sys.dont_write_bytecode=True;sys.path.insert(0,str(Path('engineering/currency-onboarding-20261018').resolve()));import local as l
E=Path(__file__).resolve().parent;N=E.parent/'native-financial-contracts-20261019';l.E=N;l.CLUSTER=N/'disposable-native-v2';q=lambda s:"'"+str(s).replace("'","''")+"'";read=lambda s:l.sql(s)[1];checks=[];results=[]
owner=str(uuid.uuid5(uuid.NAMESPACE_URL,'zetra-normal-proforma-1'));auth='SET ROLE coordinated_client;SET request.jwt.claims='+q(json.dumps({'sub':owner}))+';'
def ck(n,v):assert v,n;checks.append(n)
def post(row,op,payload,accounts,req=None):return auth+'SELECT public.post_bound_financial_v1('+','.join([q(row['storeId']),q(req or str(uuid.uuid4())),q(row['currency']),'1',q(op),q(json.dumps(payload))+'::jsonb',q(json.dumps(accounts))+'::jsonb','NULL',q(json.dumps({'source':'OWNER_CONFIRMED','reference':'LOCAL_SYNTHETIC_PURCHASE_CONFIRMATION'}))+'::jsonb'])+')'
try:
 l.PORT=l.start();sql=(E/'2026101911-private-procurement-bindings.DRAFT.sql').read_text()
 if read("SELECT to_regclass('backend_core.receipt_debt_bindings') IS NULL")=='t':l.sql(sql)
 else:
  for fn in re.findall(r'CREATE FUNCTION.*?AS \$\$.*?\$\$;', (E/'1911-procurement-bindings.sql').read_text(),re.S):l.sql(fn.replace('CREATE FUNCTION','CREATE OR REPLACE FUNCTION',1))
 ck('1911 local procurement functions installed',True)
 for name in ['post_bound_financial_v1','confirm_settlement_account_v1','read_bound_account_balance_v1']:
  ck(name+' still quarantined',read("SELECT count(*)=0 FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.proname="+q(name)+' AND a.grantee<>p.proowner')=='t')
  for sig in read('SELECT oid::regprocedure FROM pg_proc WHERE proname='+q(name)).splitlines():l.sql('GRANT EXECUTE ON FUNCTION '+sig+' TO coordinated_client')
 for row in json.loads((N/'NATIVE-RESULTS.json').read_text())['scenarios']:
  code=row['currency'];org=row['organizationId'];store=row['storeId'];value='12' if code in ['JPY','UGX'] else '12.345' if code=='KWD' else '12.34';sell='20' if code in ['JPY','UGX'] else '20.125' if code=='KWD' else '20.12';account,supplier,order,item=[str(uuid.uuid4()) for _ in range(4)]
  l.sql(auth+'SELECT public.confirm_settlement_account_v1('+','.join([q(account),q(store),q('CASH'),q(code),'1000',q('SYNTHETIC-PROCUREMENT-'+account),q('OWNER_LOCAL_OPENING_CONFIRMATION')])+')')
  l.sql('INSERT INTO public.suppliers(id,organization_id,name) VALUES('+q(supplier)+','+q(org)+','+q('SYNTHETIC SUPPLIER '+supplier)+')')
  l.sql('INSERT INTO public.inbound_stock_orders(id,organization_id,store_id,supplier_id,supplier_name,order_code,currency,total_goods_value,total_balance_amount,created_by) VALUES('+','.join(q(x) for x in [order,org,store,supplier,'SYNTHETIC SUPPLIER','SYN-'+order[:8],code])+','+value+','+value+','+q(owner)+')')
  l.sql('INSERT INTO public.inbound_stock_items(id,inbound_order_id,organization_id,product_name,sku,qty_ordered,unit_cost,proposed_sell_price,total_cost) VALUES('+','.join(q(x) for x in [item,order,org,'SYNTHETIC ORIGINAL PURCHASE '+item,'SYN-'+item])+',1,'+value+','+sell+','+value+')')
  l.sql('INSERT INTO backend_core.settlement_rollout VALUES('+q(org)+",true,'LOCAL_SYNTHETIC_ONLY') ON CONFLICT(organization_id) DO UPDATE SET enabled=true");l.sql('UPDATE backend_core.native_financial_rollout SET enabled=true WHERE organization_id='+q(org))
  req=str(uuid.uuid4());body={'order_id':order,'receipts':[{'item_id':item,'qty':'1'}]};received=json.loads(read(post(row,'RECEIPT',body,{},req)));ck(code+' receipt original cost attested',received['originalCostProvenance'])
  ck(code+' receipt replay does not duplicate stock',json.loads(read(post(row,'RECEIPT',body,{},req)))==received and read('SELECT count(*)=1 AND sum(quantity)=1 FROM backend_core.receipt_cost_snapshots WHERE order_id='+q(order))=='t')
  ck(code+' debt linked by actual canonical insert not note inference',read('SELECT count(*)=1 FROM backend_core.receipt_debt_bindings WHERE order_id='+q(order))=='t')
  product=read('SELECT product_id FROM public.inbound_stock_items WHERE id='+q(item));ck(code+' native inventory exists exactly once',read('SELECT qty=1 FROM public.inventory WHERE store_id='+q(store)+' AND product_id='+q(product))=='t')
  paidreq=str(uuid.uuid4());payment={'order_id':order,'amount':value,'method':'CASH','reference':'LOCAL ORIGINAL INVOICE','note':'LOCAL SYNTHETIC'};paid=json.loads(read(post(row,'SUPPLIER',payment,{'CASH':account},paidreq)));ck(code+' supplier payment uses one account debit',paid['accountDebitCount']==1)
  ck(code+' supplier replay returns same linked payments',json.loads(read(post(row,'SUPPLIER',payment,{'CASH':account},paidreq)))==paid)
  ck(code+' canonical invoice and supplier debt both reconcile to zero',read('SELECT o.total_balance_amount=0 AND d.paid_amount=d.principal_amount FROM public.inbound_stock_orders o JOIN backend_core.receipt_debt_bindings l ON l.order_id=o.id JOIN public.business_debts d ON d.id=l.debt_id WHERE o.id='+q(order))=='t')
  balance=json.loads(read(auth+'SELECT public.read_bound_account_balance_v1('+q(account)+')'));ck(code+' supplier/debt mirror is not double counted',D(balance['balance'])==D('1000')-D(value))
  ck(code+' overpayment denied with no extra movement',l.sql(post(row,'SUPPLIER',payment,{'CASH':account}),False)[0]!=0 and read('SELECT count(*)=1 FROM backend_core.supplier_payment_bindings WHERE order_id='+q(order))=='t')
  ck(code+' payment did not reduce inventory again',read('SELECT qty=1 FROM public.inventory WHERE store_id='+q(store)+' AND product_id='+q(product))=='t')
  results.append({'currency':code,'orderId':order,'accountId':account,'paid':value,'balance':balance['balance'],'productId':product,'storeId':store})
 (E/'BOUND-PROCUREMENT-RESULTS.json').write_text(json.dumps({'status':'PASS','count':len(checks),'checks':checks,'scenarios':results,'migrationSha256':hashlib.sha256((E/'2026101911-private-procurement-bindings.DRAFT.sql').read_bytes()).hexdigest(),'scope':'Disposable canonical inbound receipt + supplier payment + linked supplier debt. Synthetic Auth only. Funding/Field Procurement custody not activated.'},indent=2));print('PASS '+str(len(checks)))
finally:
 if l.PORT:
  l.sql('UPDATE backend_core.settlement_rollout SET enabled=false',False);l.sql('UPDATE backend_core.native_financial_rollout SET enabled=false',False)
  l.sql("DO $$DECLARE p record;BEGIN FOR p IN SELECT oid FROM pg_proc WHERE proname IN ('post_bound_financial_v1','confirm_settlement_account_v1','read_bound_account_balance_v1') LOOP EXECUTE format('REVOKE ALL ON FUNCTION %s FROM coordinated_client',p.oid::regprocedure);END LOOP;END$$",False);l.tool('pg_ctl',['-D',str(l.CLUSTER),'-m','fast','-w','stop'])
