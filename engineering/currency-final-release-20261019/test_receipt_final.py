from pathlib import Path
import sys,json,uuid,concurrent.futures
sys.dont_write_bytecode=True;sys.path.insert(0,str(Path('engineering/currency-onboarding-20261018').resolve()));import local as l
E=Path(__file__).resolve().parent;N=E.parent/'native-financial-contracts-20261019';l.E=N;l.CLUSTER=N/'disposable-native-v2';q=lambda s:"'"+str(s).replace("'","''")+"'";read=lambda s:l.sql(s)[1];checks=[]
owner=str(uuid.uuid5(uuid.NAMESPACE_URL,'zetra-normal-proforma-1'));sig='public.receive_purchase_once_v1(uuid,uuid,jsonb)'
def ck(n,v):assert v,n;checks.append(n)
try:
 l.PORT=l.start();w=(E/'1909-receipt-wrapper.sql').read_text();guard=w[w.index('CREATE FUNCTION backend_core.unverified_supplier_payment_guard_v1'):w.index('CREATE FUNCTION backend_core.immutable_receipt_cost_v1')]
 if read("SELECT to_regprocedure('backend_core.unverified_supplier_payment_guard_v1()') IS NULL")=='t':l.sql(guard)
 rows=json.loads((N/'NATIVE-RESULTS.json').read_text())['scenarios'];tzs=next(r for r in rows if r['currency']=='TZS');kwd=next(r for r in rows if r['currency']=='KWD')
 supplier=read('SELECT id FROM public.suppliers WHERE organization_id='+q(tzs['organizationId'])+' LIMIT 1');order=str(uuid.uuid4());item=str(uuid.uuid4());req=str(uuid.uuid4())
 l.sql('INSERT INTO public.inbound_stock_orders(id,organization_id,store_id,supplier_id,supplier_name,order_code,currency,created_by) VALUES('+','.join(q(x) for x in [order,tzs['organizationId'],tzs['storeId'],supplier,'Synthetic concurrency supplier','SYN-'+order[:8],'TZS',owner])+')')
 l.sql('INSERT INTO public.inbound_stock_items(id,inbound_order_id,organization_id,product_name,sku,qty_ordered,unit_cost,proposed_sell_price) VALUES('+','.join(q(x) for x in [item,order,tzs['organizationId'],'Synthetic concurrent receipt','SYN-'+item])+',0.250,12.345,20.125)')
 l.sql('GRANT EXECUTE ON FUNCTION '+sig+' TO coordinated_client')
 def call(request,qty='0.125'):return 'SET ROLE coordinated_client;SET request.jwt.claims='+q(json.dumps({'sub':owner}))+';SELECT public.receive_purchase_once_v1('+q(order)+','+q(request)+','+q(json.dumps([{'item_id':item,'qty':qty}]))+'::jsonb)'
 with concurrent.futures.ThreadPoolExecutor(2) as pool:results=list(pool.map(lambda _:l.sql(call(req),False),range(2)))
 ck('concurrent same-key requests both resolve successfully',all(r[0]==0 for r in results));ck('concurrent retry returns same receipt',results[0][1]==results[1][1])
 ck('concurrency creates exactly one stock movement',read('SELECT count(*)=1 AND sum(quantity)=0.125 FROM backend_core.receipt_cost_snapshots WHERE order_id='+q(order))=='t')
 with concurrent.futures.ThreadPoolExecutor(2) as pool:results=list(pool.map(lambda _:l.sql(call(str(uuid.uuid4()),'0.125'),False),range(2)))
 ck('different-key concurrent overreceipt only one commits',sum(r[0]==0 for r in results)==1)
 ck('received quantity never exceeds ordered',read('SELECT qty_received=0.250 FROM public.inbound_stock_items WHERE id='+q(item))=='t')
 ck('two legitimate partial receipts retain exact provenance',read('SELECT count(*)=2 AND sum(quantity)=0.250 FROM backend_core.receipt_cost_snapshots WHERE order_id='+q(order))=='t')
 ck('zero quantity rejected',l.sql(call(str(uuid.uuid4()),'0'),False)[0]!=0)
 # Direct legacy supplier-payment writer must fail before creating native rows.
 nativeorder=str(uuid.uuid4());l.sql('INSERT INTO public.inbound_stock_orders(id,organization_id,store_id,supplier_name,order_code,currency,created_by) VALUES('+','.join(q(x) for x in [nativeorder,kwd['organizationId'],kwd['storeId'],'Synthetic native supplier','SYN-'+nativeorder[:8],'KWD',owner])+')')
 ck('native supplier-payment direct write denied',l.sql('INSERT INTO public.inbound_stock_payments(inbound_order_id,organization_id,amount,payment_type) VALUES('+q(nativeorder)+','+q(kwd['organizationId'])+",1.001,'GOODS')",False)[0]!=0)
 ck('spoofed TZS row scope cannot bypass native parent',l.sql('INSERT INTO public.inbound_stock_payments(inbound_order_id,organization_id,amount,payment_type) VALUES('+q(nativeorder)+','+q(tzs['organizationId'])+",1.001,'GOODS')",False)[0]!=0)
 ck('native supplier payment remains absent',read('SELECT count(*)=0 FROM public.inbound_stock_payments WHERE inbound_order_id='+q(nativeorder))=='t')
 legacy=l.sql('INSERT INTO public.inbound_stock_payments(inbound_order_id,organization_id,created_by,amount,payment_type) VALUES('+q(order)+','+q(tzs['organizationId'])+','+q(owner)+",1,'GOODS')",False);assert legacy[0]==0,legacy[2];ck('legacy TZS payment contract retained',True)
 ck('supplier-payment guard has no client execute',read("SELECT NOT has_function_privilege('authenticated','backend_core.unverified_supplier_payment_guard_v1()','EXECUTE')")=='t')
 ck('rollback disable preserves receipt cost evidence',l.sql((E/'1906-DISABLE.sql').read_text(),False)[0]==0 and read('SELECT count(*)=2 FROM backend_core.receipt_cost_snapshots WHERE order_id='+q(order))=='t')
 (E/'RECEIPT-CONCURRENCY-RESULTS.json').write_text(json.dumps({'status':'PASS','count':len(checks),'checks':checks,'scope':'Actual disposable full-schema PostgreSQL concurrent transactions, synthetic Auth only.'},indent=2));print('PASS '+str(len(checks)))
finally:
 if l.PORT:
  l.sql('REVOKE ALL ON FUNCTION '+sig+' FROM coordinated_client',False);l.tool('pg_ctl',['-D',str(l.CLUSTER),'-m','fast','-w','stop'])
