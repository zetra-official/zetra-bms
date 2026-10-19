from pathlib import Path
import sys,json,uuid
sys.dont_write_bytecode=True;sys.path.insert(0,str(Path('engineering/currency-onboarding-20261018').resolve()));import local as l
E=Path(__file__).resolve().parent;N=E.parent/'native-financial-contracts-20261019';l.E=N;l.CLUSTER=N/'disposable-native-v2';q=lambda s:"'"+str(s).replace("'","''")+"'";read=lambda s:l.sql(s)[1];checks=[]
owner=str(uuid.uuid5(uuid.NAMESPACE_URL,'zetra-normal-proforma-1'));sig='public.receive_purchase_once_v1(uuid,uuid,jsonb)'
def ck(n,v):assert v,n;checks.append(n)
try:
 l.PORT=l.start()
 if read("SELECT to_regclass('backend_core.receipt_cost_snapshots') IS NULL")=='t':l.sql((E/'2026101909-canonical-receipt-integrity.DRAFT.sql').read_text())
 columns=read("SELECT json_agg(json_build_object('table',table_name,'column',column_name,'nullable',is_nullable,'default',column_default)) FROM information_schema.columns WHERE table_schema='public' AND table_name IN ('suppliers','inbound_stock_orders','inbound_stock_items')")
 (E/'RECEIPT-TEST-COLUMNS.json').write_text(columns)
 for r in ['anon','authenticated','service_role','coordinated_client']:ck(r+' receipt wrapper quarantined',read('SELECT NOT has_function_privilege('+q(r)+','+q(sig)+",'EXECUTE')")=='t')
 row=next(r for r in json.loads((N/'NATIVE-RESULTS.json').read_text())['scenarios'] if r['currency']=='TZS');o=row['organizationId'];s=row['storeId'];supplier=str(uuid.uuid4());order=str(uuid.uuid4());item=str(uuid.uuid4());request=str(uuid.uuid4())
 l.sql('INSERT INTO public.suppliers(id,organization_id,name) VALUES('+q(supplier)+','+q(o)+','+q('Synthetic receipt supplier '+supplier)+')')
 l.sql('INSERT INTO public.inbound_stock_orders(id,organization_id,store_id,supplier_id,supplier_name,order_code,currency,created_by) VALUES('+','.join(q(x) for x in [order,o,s,supplier,'Synthetic receipt supplier','SYN-'+order[:8],'TZS',owner])+')')
 l.sql('INSERT INTO public.inbound_stock_items(id,inbound_order_id,organization_id,product_name,sku,qty_ordered,qty_received,unit_cost,proposed_sell_price,total_cost) VALUES('+','.join(q(x) for x in [item,order,o,'Synthetic exact receipt','SYN-'+item])+',0.125,0,12.345,20.125,1.543125)')
 l.sql('GRANT EXECUTE ON FUNCTION '+sig+' TO coordinated_client')
 def call(items=None,req=request,actor=owner):
  payload=items if items is not None else [{'item_id':item,'qty':'0.125'}]
  return 'SET ROLE coordinated_client;SET request.jwt.claims='+q(json.dumps({'sub':actor}))+';SELECT public.receive_purchase_once_v1('+q(order)+','+q(req)+','+q(json.dumps(payload))+'::jsonb)'
 result=read(call());ck('receipt accepted through canonical receiver',json.loads(result)['settlementCertified'] is False)
 ck('idempotent retry returns original receipt',read(call())==result)
 ck('exact receipt quantity and cost preserved',read('SELECT qty_received=0.125 AND unit_cost=12.345 FROM public.inbound_stock_items WHERE id='+q(item))=='t')
 ck('one stock movement and exact cost provenance',read('SELECT count(*)=1 AND bool_and(quantity=0.125 AND original_unit_cost=12.345 AND source_verified) FROM backend_core.receipt_cost_snapshots WHERE order_id='+q(order))=='t')
 ck('stock increment occurs once',read('SELECT i.qty=0.125 FROM public.inventory i JOIN backend_core.receipt_cost_snapshots e ON e.store_id=i.store_id JOIN public.stock_movements m ON m.id=e.stock_movement_id AND m.product_id=i.product_id WHERE e.order_id='+q(order))=='t')
 ck('changed retry rejected',l.sql(call([{'item_id':item,'qty':'0.1'}]),False)[0]!=0)
 ck('overreceipt rejected atomically',l.sql(call(req=str(uuid.uuid4())),False)[0]!=0)
 ck('immutable original cost evidence',l.sql('UPDATE backend_core.receipt_cost_snapshots SET original_unit_cost=1 WHERE order_id='+q(order),False)[0]!=0)
 ck('private cost evidence inaccessible to client',l.sql('SET ROLE coordinated_client;SELECT * FROM backend_core.receipt_cost_snapshots',False)[0]!=0)
 ck('unassigned actor denied',l.sql(call(req=str(uuid.uuid4()),actor=str(uuid.uuid4())),False)[0]!=0)
 ck('no duplicate movement after all failures',read('SELECT count(*)=1 FROM backend_core.receipt_cost_snapshots WHERE order_id='+q(order))=='t')
 (E/'RECEIPT-INTEGRITY-RESULTS.json').write_text(json.dumps({'status':'PASS','count':len(checks),'checks':checks,'scope':'Disposable full-schema PostgreSQL. Synthetic Auth. No native supplier settlement certification.'},indent=2));print('PASS '+str(len(checks)))
finally:
 if l.PORT:
  l.sql('REVOKE ALL ON FUNCTION '+sig+' FROM coordinated_client',False)
  l.tool('pg_ctl',['-D',str(l.CLUSTER),'-m','fast','-w','stop'])
