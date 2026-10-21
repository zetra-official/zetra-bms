from pathlib import Path
import json,uuid
E=Path(__file__).resolve().parent;s=(E/'test_db.py').read_text(encoding='utf-8');exec(s[:s.index('\ntry:\n')],globals());f=json.loads((E/'master-fixture.private.json').read_text());prefix=f['prefix'];O=f['org'];S=U(201);SUP=U(400);checks=[]
try:
 sql(f"BEGIN;INSERT INTO public.stores(id,organization_id,name,store_type,created_by) VALUES('{S}','{O}','MASTER Standard','STANDARD','{A(1)}');INSERT INTO public.products(id,organization_id,store_id,name,sku,barcode,unit,cost_price,selling_price,qty_on_hand,created_by) VALUES('{U(99001)}','{O}','{S}','MASTER Standard product','MASTER-STD','MASTER-STD-BAR','pcs',500,10000,10,'{A(1)}');INSERT INTO public.inventory(organization_id,store_id,product_id,qty) VALUES('{O}','{S}','{U(99001)}',10);COMMIT;")
 p={'mode':'RECEIVE_NOW','purpose':'EXISTING_NON_CREDIT_STOCK','non_credit_confirmed':True,'currency':'TZS','supplier_id':None,'lines':[{'product_id':U(99001),'product_name':'MASTER Standard product','sku':'MASTER-STD','barcode':'MASTER-STD-BAR','unit':'pcs','quantity':'100','entered_quantity':'100','stock_mode':'UNIT','is_precision':False,'unit_cost':'500','selling_price':'12000','expected_selling_price':'10000'}]}
 req,r=rpc(p,commit=True);check('STANDARD current product price update accepted',r[0]==0);check('10 existing plus 100 received equals 110',Decimal(read(f"SELECT qty FROM public.inventory WHERE product_id='{U(99001)}'"))==110);check('Current store selling price is 12000',read(f"SELECT selling_price FROM public.products WHERE id='{U(99001)}'")=='12000')
 check('No duplicate product',read(f"SELECT count(*) FROM public.products WHERE store_id='{S}'")=='1');check('Other store prices unchanged',read(f"SELECT count(*) FROM public.products WHERE store_id='{f['store']}' AND selling_price=12000")=='0')
 _,r=rpc(p,req,commit=True);check('STANDARD idempotent retry no duplicate stock',r[0]==0 and Decimal(read(f"SELECT qty FROM public.inventory WHERE product_id='{U(99001)}'"))==110)
 p['mode']='SAVE_ORDER';p['supplier_id']=SUP;p['lines'][0].update(expected_selling_price='12000',selling_price='13000');before=digest();_,r=rpc(p,commit=True);check('STANDARD Save Order does not change stock/current price',r[0]==0 and digest()==before)
 for actor in [2,3,4]:
  _,r=rpc(p,actor=actor);check(f'Non-Owner {actor} cannot enter acquisition cost/update price through bulk',r[0]!=0)
 r=sql(f"BEGIN;SET LOCAL ROLE authenticated;SELECT set_config('request.jwt.claim.sub','{A(1)}',true);SELECT public.m3_incoming_catalog_v1('{O}','{S}','CONTEXT','');ROLLBACK;");check('STANDARD store type comes from authorized server context',result(r)['store_type']=='STANDARD')
finally:
 out={'localOnly':True,'checks':checks,'pass':sum(x['status']=='PASS' for x in checks),'fail':sum(x['status']=='FAIL' for x in checks)};(E/'STANDARD-MASTER-RESULTS.json').write_text(json.dumps(out,indent=2));print(json.dumps(out))
