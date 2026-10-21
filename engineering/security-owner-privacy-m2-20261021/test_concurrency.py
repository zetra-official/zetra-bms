from pathlib import Path
import json,sys,concurrent.futures,uuid,hashlib
sys.dont_write_bytecode=True
import local_runtime as l
E=l.E
def u(n):return f'21000000-0000-4000-8000-{n:012d}'
org,store,supplier,product,order,item=[str(uuid.uuid4()) for _ in range(6)]
owner=u(1)
checks=[]
def check(n,b):
 checks.append({'name':n,'status':'PASS' if b else 'FAIL'});assert b,n
try:
 l.start()
 l.db.sql(f"""SELECT set_config('request.jwt.claim.sub','{owner}',false);
 INSERT INTO public.organizations(id,name,created_by) VALUES('{org}','M2 isolated race fixture','{owner}');
 INSERT INTO public.org_memberships(organization_id,user_id,role,is_active) VALUES('{org}','{owner}','owner',true);
 INSERT INTO public.stores(id,organization_id,name,store_type,created_by) VALUES('{store}','{org}','M2 race store','STANDARD','{owner}');
 INSERT INTO public.suppliers(id,organization_id,name) VALUES('{supplier}','{org}','M2 race supplier');
 INSERT INTO public.products(id,organization_id,store_id,name,sku,barcode,cost_price,selling_price) VALUES('{product}','{org}','{store}','M2 concurrent synthetic','M2-CONCURRENT','M2-CONCURRENT',51,101) ON CONFLICT(id) DO NOTHING;
 INSERT INTO public.inbound_stock_orders(id,organization_id,store_id,supplier_id,supplier_name,order_code,status,total_goods_value,total_balance_amount,created_by) VALUES('{order}','{org}','{store}','{supplier}','M2 Supplier','M2-CONCURRENT-{order[:8]}','IN_TRANSIT',102,102,'{owner}') ON CONFLICT(id) DO NOTHING;
 INSERT INTO public.inbound_stock_items(id,inbound_order_id,organization_id,product_id,product_name,sku,barcode,qty_ordered,qty_received,unit_cost,proposed_sell_price,total_cost) VALUES('{item}','{order}','{org}','{product}','M2 concurrent synthetic','M2-CONCURRENT','M2-CONCURRENT',2,0,51,101,102) ON CONFLICT(id) DO NOTHING;
 """)
 qty=lambda:l.db.sql(f"SELECT coalesce(sum(qty),0) FROM public.inventory WHERE product_id='{product}'")[1]
 check('fresh isolated concurrency fixture has no inventory',qty()=='0')
 payload=f"[{{\"item_id\":\"{item}\",\"qty\":2}}]"
 def receive(_):
  return l.db.sql(f"BEGIN;SET LOCAL ROLE authenticated;SELECT set_config('request.jwt.claim.sub','{owner}',true);SELECT public.receive_inbound_stock_partial_v1('{order}','{payload}'::jsonb);COMMIT;",False)
 with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:results=list(pool.map(receive,[1,2]))
 check('concurrent receive admits exactly one commit',sum(x[0]==0 for x in results)==1)
 check('second receive rejects without duplicate posting',any(x[0]!=0 and ('received' in x[2].lower() or 'remaining' in x[2].lower()) for x in results))
 check('inventory quantity recognized exactly once',qty()=='2.000')
 check('received quantity exactly ordered quantity',l.db.sql(f"SELECT qty_received=qty_ordered FROM public.inbound_stock_items WHERE id='{item}'")[1]=='t')
 check('single canonical movement',l.db.sql(f"SELECT count(*) FROM public.stock_movements WHERE product_id='{product}'")[1]=='1')
 check('single existing supplier debt recognition',l.db.sql(f"SELECT count(*) FROM public.business_debts WHERE organization_id='{org}' AND note ILIKE '%{order}%'")[1]=='1')
 check('original TZS accounting denomination retained',l.db.sql(f"SELECT currency FROM public.inbound_stock_orders WHERE id='{order}'")[1]=='TZS')
finally:
 (E/'CONCURRENCY-RESULTS.json').write_text(json.dumps({'sqlSHA256':hashlib.sha256((E/'2026102101-owner-privacy.DRAFT.sql').read_bytes()).hexdigest(),'checks':checks,'localSyntheticOnly':True,'realParallelPostgresConnections':True,'hostedWrites':False},indent=2))
 l.stop()
print('PASS '+str(len(checks))+' real concurrent PostgreSQL checks')
