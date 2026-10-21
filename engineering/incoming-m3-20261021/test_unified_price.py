from pathlib import Path
import json,uuid,concurrent.futures,threading
from decimal import Decimal
E=Path(__file__).resolve().parent
s=(E/'test_db.py').read_text(encoding='utf-8');exec(s[:s.index('\ntry:\n')],globals())
f=json.loads((E/'master-fixture.private.json').read_text());prefix=f['prefix'];O=f['org'];SUP=U(400);checks=[]
def actor(q,n=1):return sql(f"BEGIN;SET LOCAL ROLE authenticated;SELECT set_config('request.jwt.claim.sub','{A(n)}',true);{q};COMMIT;",False)
def receive(order,rows=None,req=None,n=1):
 req=req or str(uuid.uuid4());r=actor(f"SELECT public.m3_receive_saved_v1('{order}','{req}',{quoted(json.dumps(rows))+'::jsonb' if rows is not None else 'NULL'})",n)
 if r[0]:(E/'unified-last-error.private.log').write_text(r[2])
 return req,r
def price(pid):return read(f"SELECT selling_price FROM public.products WHERE id='{pid}'")
def qty(pid):return Decimal(read(f"SELECT qty FROM public.inventory WHERE product_id='{pid}'"))
def save(S,pid,precision=False):
 p=json.loads(read(f"SELECT row_to_json(p) FROM public.products p WHERE id='{pid}'"))
 line={'product_id':pid,'product_name':p['name'],'sku':p['sku'],'barcode':p['barcode'],'unit':p['unit'],'quantity':'20','entered_quantity':'20','stock_mode':'UNIT','unit_cost':'500','selling_price':'1300','expected_selling_price':str(p['selling_price']),'is_precision':precision}
 if precision:line.update(pack_size=str(p['precision_pack_size']),base_unit=p['precision_base_unit'])
 payload={'mode':'SAVE_ORDER','currency':'TZS','supplier_id':SUP,'lines':[line]}
 req,r=rpc(payload,commit=True);check('Save intended price without live repricing',r[0]==0 and Decimal(price(pid))==Decimal(str(p['selling_price'])))
 order=result(r)['orderId'];item=read(f"SELECT id FROM public.inbound_stock_items WHERE inbound_order_id='{order}'")
 return order,item,payload
try:
 for precision,S,source in [(False,U(201),U(99001)),(True,f['store'],U(10002))]:
  pid=str(uuid.uuid4());sql(f"INSERT INTO public.products(id,organization_id,store_id,name,sku,barcode,unit,cost_price,selling_price,qty_on_hand,created_by,is_precision_product,precision_pack_size,precision_base_unit,precision_sell_mode,precision_allow_box_sales,precision_allow_unit_sales) SELECT '{pid}',organization_id,store_id,'UNIFIED local product','UP-'||'{pid}',NULL,unit,500,1000,10,created_by,is_precision_product,precision_pack_size,precision_base_unit,precision_sell_mode,precision_allow_box_sales,precision_allow_unit_sales FROM public.products WHERE id='{source}';INSERT INTO public.inventory(organization_id,store_id,product_id,qty) VALUES('{O}','{S}','{pid}',10);")
  order,item,payload=save(S,pid,precision)
  r=actor(f"SELECT public.receive_inbound_stock_partial_v1('{order}',{quoted(json.dumps([{'item_id':item,'qty':'5'}]))}::jsonb)")
  check('M3 legacy shortcut blocked',r[0]!=0 and 'M3_ORDER_RECEIVING_CONTRACT_REQUIRED' in r[2])
  rows=[{'item_id':item,'qty':'5'}];req,r=receive(order,rows);check(('Precision' if precision else 'Standard')+' partial canonical receipt',r[0]==0)
  ev=result(r)['eventId'];check('Partial quantity and all units current price',qty(pid)==15 and Decimal(price(pid))==1300)
  check('One auditable price transition bound to receipt',read(f"SELECT count(*) FROM incoming_m3.price_changes WHERE product_id='{pid}' AND event_id='{ev}' AND previous_price=1000 AND new_price=1300")=='1')
  check('One consolidated notification',read(f"SELECT count(*) FROM public.notifications WHERE event_id='{ev}'")=='1')
  check('Movement captures actual new goods cost only',read(f"SELECT unit_cost=500 AND total_cost=2500 FROM public.stock_movements WHERE event_id='{ev}'")=='t')
  _,r=receive(order,rows,req);check('Duplicate partial replay has no stock or price side effect',r[0]==0 and qty(pid)==15 and result(r)['eventId']==ev)
  _,r=receive(order,[{'item_id':item,'qty':'6'}],req);check('Reused request with changed quantity denied',r[0]!=0 and 'REQUEST_CONFLICT' in r[2])
  _,r=receive(order,None);check('Full remainder accepts price applied by earlier partial',r[0]==0 and qty(pid)==30 and Decimal(price(pid))==1300)
  check('Canonical supplier liability is not duplicated across partial/full',read(f"SELECT count(*) FROM public.business_debts WHERE note LIKE '%{order}%'")=='1')
  check('One unchanged acquisition basis',read(f"SELECT cost_price FROM public.products WHERE id='{pid}'")=='500')
  # New order becomes stale after a canonical Products price edit.
  order2,item2,_=save(S,pid,precision)
  sql(f"BEGIN;SELECT set_config('request.jwt.claim.sub','{A(1)}',true);UPDATE public.products SET selling_price=1400 WHERE id='{pid}';COMMIT;")
  before=qty(pid);_,r=receive(order2,[{'item_id':item2,'qty':'2'}]);check('Newer Products price cannot be overwritten by saved order',r[0]!=0 and 'PRICE_CONFLICT' in r[2] and qty(pid)==before and price(pid)=='1400')
  for n in [2,3,4,6]:
   _,r=receive(order2,[{'item_id':item2,'qty':'1'}],n=n);check(f'Actor {n} cannot use cost-bearing saved receipt',r[0]!=0)
  sql(f"BEGIN;SELECT set_config('request.jwt.claim.sub','{A(1)}',true);UPDATE public.products SET selling_price=1300 WHERE id='{pid}';COMMIT;")
  # Concurrency resolves to one event for the same stable request.
  req=str(uuid.uuid4());barrier=threading.Barrier(2)
  def concurrent_call():barrier.wait();return receive(order2,[{'item_id':item2,'qty':'2'}],req)[1]
  with concurrent.futures.ThreadPoolExecutor(2) as pool:rs=list(pool.map(lambda _:concurrent_call(),range(2)))
  check('Concurrent retry resolves one exact event',all(r[0]==0 for r in rs) and result(rs[0])==result(rs[1]) and qty(pid)==before+2)
  check('Private price audit inaccessible to ordinary API role',actor('SELECT * FROM incoming_m3.price_changes',3)[0]!=0)
finally:
 out={'localOnly':True,'checks':checks,'pass':sum(c['status']=='PASS' for c in checks),'fail':sum(c['status']=='FAIL' for c in checks)};(E/'UNIFIED-PRICE-RESULTS.json').write_text(json.dumps(out,indent=2));print(json.dumps(out))

