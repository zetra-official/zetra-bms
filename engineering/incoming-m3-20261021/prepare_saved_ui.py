from pathlib import Path
import json,uuid
E=Path(__file__).resolve().parent;s=(E/'test_db.py').read_text(encoding='utf-8');exec(s[:s.index('\ntry:\n')],globals())
f=json.loads((E/'master-fixture.private.json').read_text());prefix=f['prefix'];O=f['org'];S=f['store'];SUP=U(400);pid=U(10002)
p=json.loads(read(f"SELECT row_to_json(p) FROM public.products p WHERE id='{pid}' AND organization_id='{O}' AND store_id='{S}'"))
line={'product_id':pid,'product_name':p['name'],'sku':p['sku'],'barcode':p['barcode'],'unit':p['unit'],'quantity':'12','entered_quantity':'2','stock_mode':'BOX','is_precision':True,'pack_size':str(p['precision_pack_size']),'base_unit':p['precision_base_unit'],'unit_cost':str(p['cost_price']),'selling_price':'1300','expected_selling_price':str(p['selling_price'])}
payload={'mode':'SAVE_ORDER','currency':'TZS','supplier_id':SUP,'lines':[line]}
req,r=rpc(payload,commit=True);assert r[0]==0,r[2];order=result(r)['orderId'];code=read(f"SELECT order_code FROM public.inbound_stock_orders WHERE id='{order}'")
(E/'UI-SAVED-FIXTURE.private.json').write_text(json.dumps({'order':order,'code':code,'org':O,'store':S,'product':pid,'expectedPrice':p['selling_price'],'beforeQty':read(f"SELECT qty FROM public.inventory WHERE store_id='{S}' AND product_id='{pid}'")}));print('Synthetic saved UI fixture prepared:',code)
