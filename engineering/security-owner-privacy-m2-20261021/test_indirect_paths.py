import json,sys,hashlib
from decimal import Decimal
sys.dont_write_bytecode=True
import local_runtime as l
E=l.E
def u(n):return f'21000000-0000-4000-8000-{n:012d}'
org,store,product=u(100),u(200),u(300)
checks=[]
def check(n,b):checks.append({'name':n,'status':'PASS' if b else 'FAIL'});assert b,n
def actor(n,q,ok=True):
 code,out,err=l.db.sql(f"BEGIN;SET LOCAL ROLE authenticated;SELECT set_config('request.jwt.claim.sub','{u(n)}',true);{q};ROLLBACK;",False)
 if ok:assert code==0,err[-2000:]
 return code,out,err
try:
 l.start()
 l.db.sql((E/'2026102101-owner-privacy.DRAFT.sql').read_text(encoding='utf-8'))
 l.db.sql(f"""INSERT INTO public.product_catalog_shares(id,source_organization_id,source_store_id,code_hash,share_cost_price,share_selling_price,expires_at,max_uses,used_count,created_by)
 VALUES('{u(950)}','{org}','{store}',encode(extensions.digest('M2-PRIVACY-ONLY-CODE','sha256'),'hex'),true,true,now()+interval '1 day',5,0,'{u(1)}') ON CONFLICT(id) DO NOTHING;
 INSERT INTO public.product_catalog_share_items(share_id,product_id) VALUES('{u(950)}','{product}') ON CONFLICT DO NOTHING;""")
 for label,n in [('owner',1),('admin',2),('staff',3),('cashier',4),('no_member',5),('foreign_owner',6),('unassigned',7),('revoked',8)]:
  r=actor(n,"SELECT coalesce(cost_price::text,'REDACTED') FROM public.preview_product_catalog_share_v1('M2-PRIVACY-ONLY-CODE')")[1]
  check(label+' catalog cost privacy despite a valid share code',('51' in r) if n==1 else 'REDACTED' in r)
  if n!=1:
   r=actor(n,f"SELECT id FROM public.products WHERE cost_price=51 AND organization_id='{org}'",False)
   check(label+' cost filtering cannot infer hidden values',r[0]!=0 and 'permission denied' in r[2])
 r=actor(6,f"SELECT * FROM public.import_product_catalog_share_v1('M2-PRIVACY-ONLY-CODE','{u(101)}','{u(202)}')",False)
 check('cross-org cost import cannot launder confidential acquisition costs',r[0]!=0 and 'OWNER_FINANCIAL_ACCESS_REQUIRED' in r[2])
 # Existing Admin operational product edit carries no cost input; preserve stored cost internally.
 q=f"SELECT public.upsert_product('{org}','{product}','M2 Synthetic 商品 منتج','M2-SKU','piece',NULL,true,101,NULL,'M2-BARCODE','{store}');RESET ROLE;SELECT cost_price FROM public.products WHERE id='{product}'"
 r=actor(2,q,False)
 check('existing Owner-only product upsert remains fail-closed for Admin even with NULL cost',r[0]!=0 and 'OWNER_FINANCIAL_ACCESS_REQUIRED' in r[2])
 check('denied Admin product edit preserves original stored acquisition cost',l.db.sql(f"SELECT cost_price FROM public.products WHERE id='{product}'")[1]=='51')
 r=actor(2,f"SELECT public.upsert_product('{org}','{product}','M2 Synthetic','M2-SKU','piece',NULL,true,101,999,'M2-BARCODE','{store}')",False)
 check('Admin cannot overwrite acquisition cost through existing upsert RPC',r[0]!=0 and 'OWNER_FINANCIAL_ACCESS_REQUIRED' in r[2])
 r=actor(2,f"SELECT set_config('request.jwt.claim.role','owner',true);SELECT public.get_stock_on_hand_value_v1('{org}','{store}')",False)
 check('client role claim does not establish Owner privilege',r[0]!=0 and 'OWNER_FINANCIAL_ACCESS_REQUIRED' in r[2])
 check('nested payload under permitted name key is discarded',l.db.sql("SELECT security_m2.operational_json('{\"name\":{\"profit\":51},\"qty\":1}'::jsonb)::text")[1]=='{"qty": 1}')
 exact=actor(1,f"SELECT public.get_stock_on_hand_value_v1('{org}','{store}')")[1].splitlines()[-1]
 check('ordinary Owner stock valuation remains exact: '+exact,Decimal(exact)==Decimal('612'))
 # Deliberately corrupt references only within rollback-only synthetic transactions.
 prefix=f"BEGIN;SELECT set_config('request.jwt.claim.sub','{u(1)}',true);SET LOCAL session_replication_role=replica;INSERT INTO public.products(id,organization_id,store_id,name,cost_price,selling_price) VALUES('{u(980)}','{u(101)}','{u(202)}','M2 FOREIGN PRODUCT',777,999);"
 q=prefix+f"INSERT INTO public.stock_movements(organization_id,store_id,product_id,mode,amount,created_by) VALUES('{org}','{store}','{u(980)}','ADD',1,'{u(1)}');SET LOCAL session_replication_role=origin;SET LOCAL ROLE authenticated;SELECT count(*) FROM public.get_stock_in_items_v2('{org}','{store}',current_date,current_date) WHERE product_id='{u(980)}';ROLLBACK;"
 r=l.db.sql(q,False)
 check('legacy foreign-product movement cannot leak names or cost through stock-in reader',r[0]==0 and r[1].splitlines()[-1]=='0')
 q=prefix+f"INSERT INTO public.inventory(organization_id,store_id,product_id,qty) VALUES('{org}','{store}','{u(980)}',1);SET LOCAL session_replication_role=origin;SET LOCAL ROLE authenticated;SELECT public.get_stock_on_hand_value_v1('{org}','{store}');ROLLBACK;"
 r=l.db.sql(q,False)
 check('legacy foreign-product valuation fails closed without rewriting original records',r[0]!=0 and 'INVENTORY_PRODUCT_SCOPE_MISMATCH' in r[2])
 q=f"BEGIN;SELECT set_config('request.jwt.claim.sub','{u(1)}',true);SET LOCAL session_replication_role=replica;UPDATE public.inbound_stock_items SET organization_id='{u(101)}' WHERE id='{u(501)}';SET LOCAL session_replication_role=origin;SET LOCAL ROLE authenticated;SELECT * FROM public.get_inbound_stock_order_items_v1('{u(500)}');ROLLBACK;"
 r=l.db.sql(q,False)
 check('historical inconsistent incoming child is rejected before confidential evidence is returned',r[0]!=0 and 'INBOUND_EXISTING_SCOPE_MISMATCH' in r[2])
finally:
 (E/'INDIRECT-PATH-RESULTS.json').write_text(json.dumps({'sqlSHA256':hashlib.sha256((E/'2026102101-owner-privacy.DRAFT.sql').read_bytes()).hexdigest(),'checks':checks,'localOnly':True,'hostedWrites':False},indent=2));l.stop()
print('PASS '+str(len(checks))+' indirect disclosure and original-cost preservation checks')
