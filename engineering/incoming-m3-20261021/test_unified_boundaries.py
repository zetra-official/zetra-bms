from pathlib import Path
import json,uuid
E=Path(__file__).resolve().parent;s=(E/'test_db.py').read_text(encoding='utf-8');exec(s[:s.index('\ntry:\n')],globals())
f=json.loads((E/'master-fixture.private.json').read_text());prefix=f['prefix'];O=f['org'];S=U(201);SUP=U(400);checks=[]
def scenario(name,body,expect=None,extra=''):
 pid=str(uuid.uuid4());req=str(uuid.uuid4());rid=str(uuid.uuid4())
 line={'product_id':pid,'product_name':'BOUNDARY synthetic','sku':pid,'barcode':'','unit':'pcs','quantity':'10','entered_quantity':'10','stock_mode':'UNIT','is_precision':False,'unit_cost':'500','selling_price':'1200','expected_selling_price':'1000'}
 payload={'mode':'SAVE_ORDER','currency':'TZS','supplier_id':SUP,'lines':[line]}
 init=f"INSERT INTO public.products(id,organization_id,store_id,name,sku,unit,cost_price,selling_price,qty_on_hand,created_by) VALUES('{pid}','{O}','{S}','BOUNDARY synthetic','{pid}','pcs',500,1000,10,'{A(1)}');INSERT INTO public.inventory(organization_id,store_id,product_id,qty) VALUES('{O}','{S}','{pid}',10);"
 block=f"DECLARE res jsonb;ord uuid;item uuid;ev uuid;p public.products;BEGIN res:=public.m3_submit_incoming_v1('{O}','{S}','{req}',{quoted(json.dumps(payload))}::jsonb);ord:=(res->>'orderId')::uuid;SELECT id INTO item FROM public.inbound_stock_items WHERE inbound_order_id=ord;"+body.replace('$PID',pid).replace('$REQ',rid).replace('$ORG',O).replace('$STORE',S)+" END"
 query=f"BEGIN;SELECT set_config('request.jwt.claim.sub','{A(1)}',true);{init}{extra}DO $case$ {block} $case$;ROLLBACK;"
 r=sql(query,False)
 check(name,(r[0]!=0 and expect in r[2]) if expect else r[0]==0)
try:
 scenario('Different current acquisition basis remains fail-closed',"UPDATE public.products SET cost_price=600 WHERE id='$PID';PERFORM public.m3_receive_saved_v1(ord,'$REQ',NULL);",'COST_BASIS_POLICY_REQUIRED')
 scenario('Shared product cannot be repriced by saved receiving',"INSERT INTO public.inventory(organization_id,store_id,product_id,qty) VALUES('$ORG','"+f['store']+"','$PID',1);PERFORM public.m3_receive_saved_v1(ord,'$REQ',NULL);",'SHARED_PRODUCT_PRICE_POLICY_REQUIRED')
 scenario('Saved intended amounts cannot be edited behind captured evidence',"UPDATE public.inbound_stock_items SET proposed_sell_price=999 WHERE id=item;PERFORM public.m3_receive_saved_v1(ord,'$REQ',NULL);",'SAVED_ORDER_CHANGED')
 scenario('Duplicate selected item cannot double-receive',"PERFORM public.m3_receive_saved_v1(ord,'$REQ',jsonb_build_array(jsonb_build_object('item_id',item,'qty','2'),jsonb_build_object('item_id',item,'qty','2')));",'DUPLICATE_PRODUCT')
 scenario('Fractional base quantity is not rounded into inventory',"PERFORM public.m3_receive_saved_v1(ord,'$REQ',jsonb_build_array(jsonb_build_object('item_id',item,'qty','1.5')));",'INVALID_AMOUNT')
 scenario('Over-receiving is rejected',"PERFORM public.m3_receive_saved_v1(ord,'$REQ',jsonb_build_array(jsonb_build_object('item_id',item,'qty','11')));",'INVALID_AMOUNT')
 scenario('Late invalid item rolls back the whole selected receipt',"PERFORM public.m3_receive_saved_v1(ord,'$REQ',jsonb_build_array(jsonb_build_object('item_id',item,'qty','2'),jsonb_build_object('item_id',gen_random_uuid(),'qty','1')));",'PRODUCT_SCOPE_REQUIRED')
 scenario('Full duplicate request returns original receipt after order closure',"res:=public.m3_receive_saved_v1(ord,'$REQ',NULL);ev:=(res->>'eventId')::uuid;res:=public.m3_receive_saved_v1(ord,'$REQ',NULL);IF (res->>'eventId')::uuid<>ev OR (SELECT qty FROM public.inventory WHERE product_id='$PID')<>20 THEN RAISE EXCEPTION 'TEST_DUPLICATE';END IF;")
 scenario('Operational receipt hides costs and private notes for Admin',"res:=public.m3_receive_saved_v1(ord,'$REQ',NULL);ev:=(res->>'eventId')::uuid;PERFORM set_config('request.jwt.claim.sub','"+A(2)+"',true);res:=public.m3_incoming_receipt_v1(ev);IF res ? 'total_cost' OR EXISTS(SELECT 1 FROM jsonb_array_elements(res->'lines') l WHERE l ?| ARRAY['unit_cost','total_cost','note']) THEN RAISE EXCEPTION 'TEST_COST_LEAK';END IF;")
 scenario('Products RPC and Incoming share one price audit trigger',"SELECT * INTO p FROM public.products WHERE id='$PID';PERFORM public.upsert_product(p.organization_id,p.id,p.name,p.sku,p.unit,p.category,p.is_active,1100,p.cost_price,p.barcode,p.store_id,p.is_precision_product,p.precision_pack_size,p.precision_base_unit,p.precision_sell_mode,p.precision_allow_box_sales,p.precision_allow_unit_sales,p.image_url);IF (SELECT count(*) FROM incoming_m3.price_changes WHERE product_id='$PID' AND previous_price=1000 AND new_price=1100)<>1 THEN RAISE EXCEPTION 'TEST_CANONICAL_AUDIT';END IF;")
 scenario('Products RPC also rejects cross-store repricing',"INSERT INTO public.inventory(organization_id,store_id,product_id,qty) VALUES('$ORG','"+f['store']+"','$PID',1);SELECT * INTO p FROM public.products WHERE id='$PID';PERFORM public.upsert_product(p.organization_id,p.id,p.name,p.sku,p.unit,p.category,p.is_active,1100,p.cost_price,p.barcode,p.store_id,p.is_precision_product,p.precision_pack_size,p.precision_base_unit,p.precision_sell_mode,p.precision_allow_box_sales,p.precision_allow_unit_sales,p.image_url);",'SHARED_PRODUCT_PRICE_POLICY_REQUIRED')
 # Grant checks do not depend on application filtering.
 check('Anonymous cannot call saved receiving or context',read("SELECT NOT has_function_privilege('anon','public.m3_receive_saved_v1(uuid,uuid,jsonb)','EXECUTE') AND NOT has_function_privilege('anon','public.m3_saved_order_context_v1(uuid)','EXECUTE')")=='t')
 check('No parallel saved inventory writer remains',read("SELECT to_regprocedure('incoming_m3.receive_saved_canonical(uuid,jsonb,uuid)') IS NULL")=='t')
 check('Authenticated cannot read shared audit or request registry',read("SELECT NOT has_table_privilege('authenticated','incoming_m3.price_changes','SELECT') AND NOT has_table_privilege('authenticated','incoming_m3.saved_receives','SELECT')")=='t')
finally:
 out={'localOnly':True,'checks':checks,'pass':sum(c['status']=='PASS' for c in checks),'fail':sum(c['status']=='FAIL' for c in checks)};(E/'UNIFIED-BOUNDARY-RESULTS.json').write_text(json.dumps(out,indent=2));print(json.dumps(out))
