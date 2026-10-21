from pathlib import Path
import json,sys,uuid
E=Path(__file__).resolve().parent;sys.path.insert(0,str(E.parent/'security-owner-privacy-m2-20261021'));import local_runtime as l
l.db.E=E;l.db.CLUSTER=E/'disposable';l.db.PORT=json.loads((E/'db.private.json').read_text())['port']
assert Path(l.db.sql("SELECT current_setting('data_directory')")[1].strip()).resolve()==(E/'disposable').resolve()
f=json.loads((E/'master-fixture.private.json').read_text());pid=str(uuid.uuid4());source=f['prefix']+'-1111-4000-8000-000000010002';other=f['prefix']+'-1111-4000-8000-000000000201'
q=f"""BEGIN;INSERT INTO public.products(id,organization_id,store_id,name,sku,barcode,unit,cost_price,selling_price,qty_on_hand,created_by,is_precision_product,precision_pack_size,precision_base_unit,precision_sell_mode,precision_allow_box_sales,precision_allow_unit_sales)
SELECT '{pid}',organization_id,NULL,'PRICE COMPAT UI SYNTHETIC','PC-UI-{pid}',NULL,unit,500,1000,10,created_by,is_precision_product,precision_pack_size,precision_base_unit,precision_sell_mode,precision_allow_box_sales,precision_allow_unit_sales FROM public.products WHERE id='{source}';
INSERT INTO public.inventory(organization_id,store_id,product_id,qty) VALUES('{f['org']}','{f['store']}','{pid}',10),('{f['org']}','{other}','{pid}',7);COMMIT;"""
l.db.sql(q);(E/'price-ui.private.json').write_text(json.dumps({'product':pid,'org':f['org'],'store':f['store'],'otherStore':other}),encoding='utf-8');print('Unique synthetic organization-level price fixture ready locally')

