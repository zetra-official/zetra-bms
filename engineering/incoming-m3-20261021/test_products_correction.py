from pathlib import Path
import json,uuid,concurrent.futures,threading
from decimal import Decimal
E=Path(__file__).resolve().parent;s=(E/'test_db.py').read_text(encoding='utf-8');exec(s[:s.index('\ntry:\n')],globals())
f=json.loads((E/'master-fixture.private.json').read_text());prefix=f['prefix'];O=f['org'];SUP=U(400);checks=[]
def receiving(order,req=None,rows=None,actor=1):
 req=req or str(uuid.uuid4());r=sql(f"BEGIN;SET LOCAL ROLE authenticated;SELECT set_config('request.jwt.claim.sub','{A(actor)}',true);SELECT public.m3_receive_saved_v1('{order}','{req}',{quoted(json.dumps(rows))+'::jsonb' if rows is not None else 'NULL'});COMMIT;",False)
 if r[0]:(E/'products-test-error.private.log').write_text(r[2],encoding='utf-8')
 return req,r
def inventory(pid,store):return Decimal(read(f"SELECT qty FROM public.inventory WHERE product_id='{pid}' AND store_id='{store}'"))
try:
 for precision,S,source,other in [(False,U(201),U(99001),f['store']),(True,f['store'],U(10002),U(201))]:
  label='Precision' if precision else 'Standard';pid=str(uuid.uuid4());sale=str(uuid.uuid4())
  sql(f"BEGIN;SELECT set_config('request.jwt.claim.sub','{A(1)}',true);INSERT INTO public.org_membership_stores(membership_id,store_id) SELECT id,'{S}' FROM public.org_memberships WHERE organization_id='{O}' AND user_id='{A(1)}' ON CONFLICT DO NOTHING;INSERT INTO public.products(id,organization_id,store_id,name,sku,barcode,unit,cost_price,selling_price,qty_on_hand,created_by,is_precision_product,precision_pack_size,precision_base_unit,precision_sell_mode,precision_allow_box_sales,precision_allow_unit_sales) SELECT '{pid}',organization_id,NULL,'PRICE COMPAT SYNTHETIC','PC-'||'{pid}',NULL,unit,500,1000,10,created_by,is_precision_product,precision_pack_size,precision_base_unit,precision_sell_mode,precision_allow_box_sales,precision_allow_unit_sales FROM public.products WHERE id='{source}';INSERT INTO public.inventory(organization_id,store_id,product_id,qty) VALUES('{O}','{S}','{pid}',10),('{O}','{other}','{pid}',7);INSERT INTO public.sales(id,organization_id,store_id,created_by,total_amount) VALUES('{sale}','{O}','{S}','{A(1)}',800);INSERT INTO public.sale_items(sale_id,product_id,qty,unit_price,line_total,unit_cost,unit_cost_price) VALUES('{sale}','{pid}',1,800,800,500,500);COMMIT;")
  p=json.loads(read(f"SELECT row_to_json(p) FROM public.products p WHERE id='{pid}'"));history=read(f"SELECT row_to_json(i) FROM public.sale_items i WHERE sale_id='{sale}'")
  l={'product_id':pid,'product_name':p['name'],'sku':p['sku'],'barcode':p['barcode'],'unit':p['unit'],'quantity':'100','entered_quantity':'100','stock_mode':'UNIT','is_precision':precision,'unit_cost':'600','selling_price':'1200','expected_cost_price':'500','expected_selling_price':'1000'}
  units=100
  if precision:
   units=int(Decimal(str(p['precision_pack_size']))*2);l.update(quantity=str(units),pack_size=str(p['precision_pack_size']),base_unit=p['precision_base_unit'],entered_quantity='2',stock_mode='BOX')
  initial=10+units
  payload={'mode':'RECEIVE_NOW','purpose':'EXISTING_NON_CREDIT_STOCK','non_credit_confirmed':True,'currency':'TZS','supplier_id':None,'lines':[l]}
  req,r=rpc(payload,commit=True);check(label+' edited cost and selling receive via canonical Products',r[0]==0)
  ev=result(r)['eventId'];receipt_before=read(f"SELECT receipt FROM incoming_m3.batches WHERE event_id='{ev}'")
  check(label+' base-unit stock increase is exact only in destination',inventory(pid,S)==initial and inventory(pid,other)==7)
  check(label+' current organization product prices are 600 and 1200',read(f"SELECT cost_price=600 AND selling_price=1200 AND store_id IS NULL FROM public.products WHERE id='{pid}'")=='t')
  check(label+' original identity and precision metadata preserved',read(f"SELECT name={quoted(p['name'])} AND sku={quoted(p['sku'])} AND is_precision_product IS {'TRUE' if precision else 'FALSE'} FROM public.products WHERE id='{pid}'")=='t')
  check(label+' receiving cost evidence is actual 600 per new unit',read(f"SELECT unit_cost=600 AND total_cost={600*units} FROM public.stock_movements WHERE event_id='{ev}'")=='t')
  check(label+' cost and selling audit binds original values and receipt',read(f"SELECT count(*) FROM incoming_m3.price_changes WHERE product_id='{pid}' AND event_id='{ev}' AND previous_cost=500 AND new_cost=600 AND previous_price=1000 AND new_price=1200")=='1')
  _,r=rpc(payload,req,commit=True);check(label+' exact retry does not repeat quantity or price changes',r[0]==0 and inventory(pid,S)==initial)
  # Save an edited price without touching live prices, then receive partial/full.
  l.update(quantity='20',entered_quantity='20',stock_mode='UNIT',unit_cost='700',selling_price='1400',expected_cost_price='600',expected_selling_price='1200');payload.update(mode='SAVE_ORDER',supplier_id=SUP)
  _,r=rpc(payload,commit=True);check(label+' saved intended cost is not current cost until receiving',r[0]==0 and read(f"SELECT cost_price=600 AND selling_price=1200 FROM public.products WHERE id='{pid}'")=='t')
  order=result(r)['orderId'];item=read(f"SELECT id FROM public.inbound_stock_items WHERE inbound_order_id='{order}'");rows=[{'item_id':item,'qty':'5'}]
  req,r=receiving(order,rows=rows);check(label+' partial applies both approved current prices',r[0]==0 and inventory(pid,S)==initial+5 and read(f"SELECT cost_price=700 AND selling_price=1400 FROM public.products WHERE id='{pid}'")=='t')
  _,r=receiving(order,req,rows);check(label+' duplicate partial is idempotent',r[0]==0 and inventory(pid,S)==initial+5)
  _,r=receiving(order);check(label+' full remainder retains the order-applied cost and price',r[0]==0 and inventory(pid,S)==initial+20)
  check(label+' prior receiving receipt unchanged after later price update',read(f"SELECT receipt FROM incoming_m3.batches WHERE event_id='{ev}'")==receipt_before)
  check(label+' historical sale, price and COGS unchanged bytewise',read(f"SELECT row_to_json(i) FROM public.sale_items i WHERE sale_id='{sale}'")==history)
  check(label+' only one canonical supplier liability',read(f"SELECT count(*) FROM public.business_debts WHERE note LIKE '%{order}%'")=='1')
  # Stale cost change is rejected even when selling is unchanged.
  payload.update(mode='RECEIVE_NOW',supplier_id=None);l.update(unit_cost='800',selling_price='1400',expected_cost_price='600',expected_selling_price='1400');_,r=rpc(payload,commit=True)
  check(label+' stale current-cost expectation cannot overwrite a newer edit',r[0]!=0 and 'PRICE_CONFLICT' in r[2] and inventory(pid,S)==initial+20)
  for n in [2,3,4,6]:
   _,r=rpc(payload,actor=n);check(label+f' actor {n} cannot edit protected current prices via Incoming',r[0]!=0)
  l.update(expected_cost_price='700');req=str(uuid.uuid4());barrier=threading.Barrier(2)
  def run():barrier.wait();return rpc(payload,req,commit=True)[1]
  with concurrent.futures.ThreadPoolExecutor(2) as pool:rs=list(pool.map(lambda _:run(),range(2)))
  check(label+' concurrent cost-edit retry returns one exact receipt',all(r[0]==0 for r in rs) and result(rs[0])==result(rs[1]) and inventory(pid,S)==initial+40)
  check(label+' cost-only update does not fabricate a selling change',read(f"SELECT cost_price=800 AND selling_price=1400 FROM public.products WHERE id='{pid}'")=='t')
finally:
 out={'localOnly':True,'canonicalProductsWriter':True,'checks':checks,'pass':sum(c['status']=='PASS' for c in checks),'fail':sum(c['status']=='FAIL' for c in checks)};(E/'PRODUCTS-CORRECTION-RESULTS.json').write_text(json.dumps(out,indent=2));print(json.dumps(out))
