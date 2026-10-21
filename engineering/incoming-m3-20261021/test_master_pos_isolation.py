from pathlib import Path
import json,uuid
E=Path(__file__).resolve().parent;s=(E/'test_db.py').read_text(encoding='utf-8');exec(s[:s.index('\ntry:\n')],globals());f=json.loads((E/'master-fixture.private.json').read_text());prefix=f['prefix'];O=f['org'];S=f['store'];checks=[]
try:
 for actor in [1,2,3,4]:
  r=sql(f"BEGIN;SET LOCAL ROLE authenticated;SELECT set_config('request.jwt.claim.sub','{A(actor)}',true);SELECT row_to_json(p) FROM public.get_store_sale_items('{S}') p WHERE p.product_id='{U(10002)}';ROLLBACK;",False);check(f'Canonical POS reader role {actor} still works',r[0]==0);v=result(r)
  check(f'Canonical POS role {actor} sees updated per-unit price and unchanged pack contract',Decimal(str(v['selling_price']))==1200 and v['is_precision_product'] is True and Decimal(str(v['precision_pack_size']))==6 and v['precision_base_unit']=='tablet' and v['precision_sell_mode']=='UNIT' and v['precision_allow_box_sales'] and v['precision_allow_unit_sales'])
  if actor!=1:check(f'Canonical POS role {actor} acquisition cost stays hidden',v['cost_price'] is None)
 p={'mode':'RECEIVE_NOW','purpose':'EXISTING_NON_CREDIT_STOCK','non_credit_confirmed':True,'currency':'TZS','lines':[{'product_id':U(99001),'product_name':'MASTER Standard product','sku':'MASTER-STD','barcode':'MASTER-STD-BAR','unit':'pcs','quantity':'1','unit_cost':'500','selling_price':'14000','expected_selling_price':'12000'}]}
 r=sql(f"BEGIN;INSERT INTO public.inventory(organization_id,store_id,product_id,qty) VALUES('{O}','{S}','{U(99001)}',0);SET LOCAL ROLE authenticated;SELECT set_config('request.jwt.claim.sub','{A(1)}',true);SELECT public.m3_submit_incoming_v1('{O}','{U(201)}','{uuid.uuid4()}',{quoted(json.dumps(p))}::jsonb);ROLLBACK;",False)
 check('Shared product cannot silently reprice another store',r[0]!=0 and 'SHARED_PRODUCT_PRICE_POLICY_REQUIRED' in r[2]);check('Shared-price failure does not change current price',read(f"SELECT selling_price FROM public.products WHERE id='{U(99001)}'")=='12000')
finally:
 out={'localOnly':True,'checks':checks,'pass':sum(c['status']=='PASS' for c in checks),'fail':sum(c['status']=='FAIL' for c in checks)};(E/'MASTER-POS-ISOLATION-RESULTS.json').write_text(json.dumps(out,indent=2));print(json.dumps(out))
