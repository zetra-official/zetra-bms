from pathlib import Path
import json,uuid,copy,concurrent.futures,threading
E=Path(__file__).resolve().parent;s=(E/'test_db.py').read_text(encoding='utf-8');exec(s[:s.index('\ntry:\n')],globals());prefix=uuid.uuid4().hex[:8];O=U(100);S=U(200);SUP=U(400);checks=[]
def newLine(n):
 precision=n%4!=0;size=[100,10,6][n%3]
 return {'product_id':U(10000+n),'product_name':f'MASTER 商品 منتج {n}','sku':f'MASTER-{n}','barcode':f'MASTER-BAR-{n}','unit':'Box' if precision else 'pcs','category':'M3','quantity':str(2*size if precision else 2),'entered_quantity':'2','stock_mode':'BOX' if precision else 'UNIT','is_precision':precision,'pack_size':str(size) if precision else None,'base_unit':'tablet' if precision else None,'unit_cost':'500','selling_price':'1000','expected_selling_price':'800','note':'synthetic acquisition evidence'}
def master(count=105):return {'mode':'RECEIVE_NOW','purpose':'EXISTING_NON_CREDIT_STOCK','non_credit_confirmed':True,'currency':'TZS','supplier_id':None,'lines':[newLine(n) for n in range(1,count+1)]}
try:
 seed=f"INSERT INTO public.organizations(id,name,created_by) VALUES('{O}','MASTER M3 SYNTHETIC','{A(1)}');INSERT INTO public.stores(id,organization_id,name,store_type,created_by) VALUES('{S}','{O}','MASTER Precision','PRECISION_RETAIL','{A(1)}');INSERT INTO public.suppliers(id,organization_id,name,created_by) VALUES('{SUP}','{O}','MASTER supplier','{A(1)}');"
 for n,role in [(1,'owner'),(2,'admin'),(3,'staff'),(4,'cashier')]:
  seed+=f"INSERT INTO public.org_memberships(id,organization_id,user_id,role,is_active) VALUES('{U(1000+n)}','{O}','{A(n)}','{role}',true);"
  if n in [1,3,4]:seed+=f"INSERT INTO public.org_membership_stores(membership_id,store_id) VALUES('{U(1000+n)}','{S}');"
 for n in range(1,106):
  v=newLine(n);pr=v['is_precision'];seed+=f"INSERT INTO public.products(id,organization_id,store_id,name,sku,barcode,unit,category,cost_price,selling_price,qty_on_hand,is_precision_product,precision_pack_size,precision_base_unit,precision_allow_box_sales,precision_allow_unit_sales,created_by) VALUES('{v['product_id']}','{O}','{S}',{quoted(v['product_name'])},'{v['sku']}','{v['barcode']}','{v['unit']}','M3',500,800,10,{'true' if pr else 'false'},{v['pack_size'] if pr else 'NULL'},{quoted(v['base_unit']) if pr else 'NULL'},true,true,'{A(1)}');INSERT INTO public.inventory(organization_id,store_id,product_id,qty) VALUES('{O}','{S}','{v['product_id']}',10);"
 seed+=f"INSERT INTO public.sales(id,organization_id,store_id,created_by,total_amount) VALUES('{U(700)}','{O}','{S}','{A(1)}',800);INSERT INTO public.sale_items(sale_id,product_id,qty,unit_price,line_total,unit_cost,unit_cost_price) VALUES('{U(700)}','{U(10001)}',1,800,800,500,500);"
 sql(f"BEGIN;SELECT set_config('request.jwt.claim.sub','{A(1)}',true);"+seed+'COMMIT;')
 historical=read(f"SELECT row_to_json(x) FROM public.sale_items x WHERE sale_id='{U(700)}'")
 p=master();req,r=rpc(p,commit=True);check('105 mixed Standard/Precision lines receive atomically in Precision store',r[0]==0)
 if r[0]:raise RuntimeError(r[2])
 ev=result(r)['eventId'];rr=json.loads(read(f"SELECT receipt FROM incoming_m3.batches WHERE event_id='{ev}'"));check('Receipt all 105 lines and original entry order',len(rr['lines'])==105 and rr['lines'][0]['product_id']==U(10001))
 check('Pack/Box quantities converted to base inventory exactly',all(Decimal(read(f"SELECT qty FROM public.inventory WHERE product_id='{U(10000+n)}'"))==10+Decimal(newLine(n)['quantity']) for n in range(1,106)))
 check('Current selling price updated on all existing products only',read(f"SELECT count(*) FROM public.products WHERE organization_id='{O}' AND selling_price=1000")=='105')
 check('Product identities not duplicated',read(f"SELECT count(*) FROM public.products WHERE organization_id='{O}'")=='105')
 check('Registered cost basis not changed',read(f"SELECT count(*) FROM public.products WHERE organization_id='{O}' AND cost_price=500")=='105')
 check('Original historical sale/COGS snapshot preserved byte for byte',read(f"SELECT row_to_json(x) FROM public.sale_items x WHERE sale_id='{U(700)}'")==historical)
 check('One canonical event and notification for 105 lines',read(f"SELECT count(*)||':'||count(DISTINCT event_id) FROM public.stock_movements WHERE event_id='{ev}'")=='105:1' and read(f"SELECT count(*) FROM public.notifications WHERE event_id='{ev}'")=='1')
 check('New movement cost evidence accurately recorded',read(f"SELECT count(*) FROM public.stock_movements WHERE event_id='{ev}' AND unit_cost=500 AND total_cost=500*amount")=='105')
 check('Precision metadata preserved on product master',read(f"SELECT count(*) FROM public.products WHERE organization_id='{O}' AND is_precision_product IS TRUE AND precision_base_unit='tablet'")=='79')
 check('Receipt records base and package units plus before/after price audit',rr['lines'][0]['unit']=='tablet' and rr['lines'][0]['package_unit']=='Box' and rr['lines'][0]['stock_mode']=='BOX' and rr['lines'][0]['previous_selling_price']=='800' and rr['lines'][0]['selling_price']=='1000')
 for actor in [2,3,4]:
  r0=sql(f"BEGIN;SET LOCAL ROLE authenticated;SELECT set_config('request.jwt.claim.sub','{A(actor)}',true);SELECT public.m3_incoming_receipt_v1('{ev}');ROLLBACK;",False);safe=result(r0);check(f'Role {actor} complete receipt without acquisition costs',r0[0]==0 and len(safe['lines'])==105 and 'total_cost' not in safe and all('unit_cost' not in x and 'total_cost' not in x for x in safe['lines']))
 for mode in ['UNIT','BOX']:
  pp=master(1);v=pp['lines'][0];v.update(selling_price='1000',expected_selling_price='1000',stock_mode=mode,entered_quantity='2',quantity='2' if mode=='UNIT' else str(2*int(v['pack_size'])));rq,rp=rpc(pp,commit=True);check(mode+' receiving succeeds with registered metadata',rp[0]==0)
 pp=master();pp.update(mode='SAVE_ORDER',supplier_id=SUP);before=digest();_,rs=rpc(pp,commit=True);check('Save Order preserves intended prices without repricing or stock posting',rs[0]==0 and digest()==before)
 order=result(rs)['orderId'];r0=sql(f"BEGIN;SET LOCAL ROLE authenticated;SELECT set_config('request.jwt.claim.sub','{A(1)}',true);SELECT public.receive_inbound_stock_partial_v1('{order}','[]'::jsonb);ROLLBACK;",False);check('Specialized intended-price order fails closed before unsafe legacy receiving',r0[0]!=0 and 'M3_ORDER_RECEIVING_CONTRACT_REQUIRED' in r0[2])
 sql(f"UPDATE public.products SET selling_price=1100 WHERE id='{U(10001)}';")
 _,retry=rpc(p,req,commit=True);check('Confirmed retry cannot overwrite a newer current price',retry[0]==0 and read(f"SELECT selling_price FROM public.products WHERE id='{U(10001)}'")=='1100')
 for name,change,expected in [('Stale price',lambda v:v.update(expected_selling_price='800',selling_price='1200'),'PRICE_CONFLICT'),('Changed acquisition basis',lambda v:v.update(unit_cost='600'),'COST_BASIS_POLICY_REQUIRED'),('Tampered pack size',lambda v:v.update(pack_size='999'),'PRECISION_METADATA_CHANGED'),('Tampered base quantity',lambda v:v.update(quantity='2'),'UNSUPPORTED_QUANTITY_PRECISION')]:
  pp=master(1);pp['lines'][0].update(expected_selling_price='1100',selling_price='1100');change(pp['lines'][0]);before=digest();_,rx=rpc(pp,commit=True);check(name+' rejected',rx[0]!=0 and expected in rx[2]);check(name+' no inventory/price partial commit',digest()==before)
 pp=master();
 for v in pp['lines']:v.update(expected_selling_price='1000',selling_price='1200')
 before=digest();_,rx=rpc(pp,commit=True);check('Later conflicting product rolls back whole 105-line batch',rx[0]!=0 and digest()==before)
 pp=master(1);pp['lines'][0].update(expected_selling_price='1100',selling_price='1200');rq=str(uuid.uuid4());barrier=threading.Barrier(2)
 def run():barrier.wait();return rpc(pp,rq,commit=True)[1]
 with concurrent.futures.ThreadPoolExecutor(2) as pool:replies=list(pool.map(lambda _:run(),range(2)))
 check('Concurrent same-request receiving resolves to one result',all(r[0]==0 for r in replies) and result(replies[0])==result(replies[1]))
 ev2=result(replies[0])['eventId'];check('Concurrent stock and price update occur once',read(f"SELECT count(*) FROM public.stock_movements WHERE event_id='{ev2}'")=='1' and read(f"SELECT count(*) FROM public.notifications WHERE event_id='{ev2}'")=='1')
 (E/'master-fixture.private.json').write_text(json.dumps({'org':O,'store':S,'prefix':prefix,'eventId':ev,'requestId':req}));(E/'receipt-master-owner.private.json').write_text(json.dumps(rr,ensure_ascii=False),encoding='utf-8')
finally:
 out={'localOnly':True,'checks':checks,'pass':sum(x['status']=='PASS' for x in checks),'fail':sum(x['status']=='FAIL' for x in checks)};(E/'PRECISION-POSTGRES-RESULTS.json').write_text(json.dumps(out,indent=2));print(json.dumps(out))
