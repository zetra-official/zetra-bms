from pathlib import Path
import sys,json,uuid,concurrent.futures,threading
from decimal import Decimal
E=Path(__file__).resolve().parent;sys.path.insert(0,str(E.parent/'security-owner-privacy-m2-20261021'));import local_runtime as l
l.db.E=E;l.db.CLUSTER=E/'disposable';l.db.PORT=json.loads((E/'db.private.json').read_text())['port'];sql=l.db.sql
prefix=uuid.uuid4().hex[:8];U=lambda n:f'{prefix}-1111-4000-8000-{n:012d}';A=lambda n:f'21000000-0000-4000-8000-{n:012d}';O=U(100);S=U(200);SUP=U(400);checks=[]
def check(name,ok):
 checks.append({'name':name,'status':'PASS' if ok else 'FAIL'});assert ok,name

def read(q):return sql(q)[1]
def quoted(v):return "'"+str(v).replace("'","''")+"'"
def rpc(payload,req=None,actor=1,commit=False):
 req=req or str(uuid.uuid4());query=f"BEGIN;SET LOCAL ROLE authenticated;SELECT set_config('request.jwt.claim.sub','{A(actor)}',true);SELECT public.m3_submit_incoming_v1('{O}','{S}','{req}',{quoted(json.dumps(payload))}::jsonb);"+('COMMIT;' if commit else 'ROLLBACK;');r=sql(query,False);
 if r[0]:(E/'last-error.private.log').write_text(r[2],encoding='utf-8')
 return req,r

def result(r):return json.loads(next(x for x in r[1].splitlines() if x.startswith('{')))
def line(n):return {'product_id':U(10000+n),'product_name':f'M3 Synthetic 商品 منتج {n}','sku':f'M3-{n}','barcode':f'M3-BAR-{n}','unit':'pcs','category':'M3','quantity':'2','unit_cost':'51.12','selling_price':'101.01','note':'private M3 acquisition evidence'}
def payload(count=1,mode='RECEIVE_NOW',supplier=None):return {'mode':mode,'purpose':'EXISTING_NON_CREDIT_STOCK','non_credit_confirmed':True,'currency':'TZS','supplier_id':supplier,'note':'private M3 note','lines':[line(i) for i in range(1,count+1)]}
def digest():return read(f"SELECT md5(string_agg(v,'' ORDER BY v)) FROM(SELECT row_to_json(i)::text v FROM public.inventory i WHERE organization_id='{O}' UNION ALL SELECT row_to_json(p)::text FROM public.products p WHERE organization_id='{O}' UNION ALL SELECT row_to_json(d)::text FROM public.business_debts d WHERE organization_id='{O}')q")
try:
 seed=f"INSERT INTO public.organizations(id,name,created_by) VALUES('{O}','M3 SYNTHETIC','{A(1)}');INSERT INTO public.stores(id,organization_id,name,store_type,created_by) VALUES('{S}','{O}','M3 destination','STANDARD','{A(1)}');INSERT INTO public.suppliers(id,organization_id,name,created_by) VALUES('{SUP}','{O}','M3 Verified Supplier','{A(1)}');"
 for n,role in [(1,'owner'),(2,'admin'),(3,'staff'),(4,'cashier')]:
  seed+=f"INSERT INTO public.org_memberships(id,organization_id,user_id,role,is_active) VALUES('{U(1000+n)}','{O}','{A(n)}','{role}',true);"
  if n in [3,4]:seed+=f"INSERT INTO public.org_membership_stores(membership_id,store_id) VALUES('{U(1000+n)}','{S}');"
 for n in range(1,106):seed+=f"INSERT INTO public.products(id,organization_id,store_id,name,sku,barcode,unit,cost_price,selling_price,created_by) VALUES('{U(10000+n)}','{O}','{S}',{quoted(line(n)['product_name'])},'M3-{n}','M3-BAR-{n}','pcs',51.12,101.01,'{A(1)}');"
 sql('BEGIN;'+seed+'COMMIT;');(E/'fixture.private.json').write_text(json.dumps({'org':O,'store':S,'supplier':SUP,'prefix':prefix}));check('Synthetic fixture isolated',True)
 p=payload();req,r=rpc(p,commit=True);check('Single supplier-less non-credit receipt',r[0]==0);one=result(r);check('Single canonical quantity',Decimal(read(f"SELECT qty FROM public.inventory WHERE product_id='{U(10001)}'"))==Decimal('2'));check('One consolidated notification single receipt',read(f"SELECT count(*) FROM public.notifications WHERE event_id='{one['eventId']}'")=='1')
 before=digest();_,r=rpc(p,req,commit=True);check('Same request returns same confirmed result',r[0]==0 and result(r)==one);check('Retry causes no second stock movement',digest()==before)
 wrong=payload();wrong['lines'][0]['quantity']='3';_,r=rpc(wrong,req,commit=True);check('Same request different payload denied',r[0]!=0 and 'REQUEST_CONFLICT' in r[2])
 p=payload(105);req105,r=rpc(p,commit=True);check('105 product lines committed atomically',r[0]==0);many=result(r);event=many['eventId'];check('105 canonical movements share one event',read(f"SELECT count(*)||':'||count(DISTINCT event_id) FROM public.stock_movements WHERE event_id='{event}'")=='105:1');check('105 lines produce one notification',read(f"SELECT count(*) FROM public.notifications WHERE event_id='{event}'")=='1');check('No supplier debt or payment from non-credit receipt',read(f"SELECT (SELECT count(*) FROM public.business_debts WHERE organization_id='{O}')||':'||(SELECT count(*) FROM public.inbound_stock_payments p JOIN public.inbound_stock_orders o ON o.id=p.inbound_order_id WHERE o.organization_id='{O}')")=='0:0')
 for actor in [1,2,3,4,5,6,7,8]:
  r=sql(f"BEGIN;SET LOCAL ROLE authenticated;SELECT set_config('request.jwt.claim.sub','{A(actor)}',true);SELECT public.m3_incoming_receipt_v1('{event}');ROLLBACK;",False)
  if actor in [1,2,3,4]:
   check(f'Actor {actor} authorized consolidated receipt',r[0]==0);rr=result(r);check(f'Actor {actor} sees all 105 lines',len(rr['lines'])==105 and rr['line_count']==105);check(f'Actor {actor} original identifiers/order preserved',rr['lines'][0]['product_id']==U(10001) and rr['lines'][-1]['product_id']==U(10105));check(f'Actor {actor} financial projection',('total_cost' in rr and Decimal(rr['total_cost'])==Decimal('51.12')*210) if actor==1 else ('total_cost' not in rr and all(not ({'unit_cost','total_cost','note'}&set(x)) for x in rr['lines']) and 'note' not in rr))
  else:check(f'Actor {actor} unauthorized receipt denied',r[0]!=0 and ('42501' in r[2] or 'ACCESS_REQUIRED' in r[2]))
 for actor in [2,3,4,5,6,7,8]:
  _,r=rpc(payload(),actor=actor);check(f'Actor {actor} bulk cost entry denied',r[0]!=0 and 'OWNER_FINANCIAL_ACCESS_REQUIRED' in r[2])
 before=digest();_,r=rpc(payload(105,'SAVE_ORDER',SUP),commit=True);check('Save Incoming Order uses verified supplier',r[0]==0);saved=result(r);check('Save order has no receiving event',saved['eventId'] is None and saved['status']=='SAVED');check('Save order does not recognize inventory',digest()==before)
 for name,change in [('unsupported precision',lambda p:p['lines'][0].update(unit_cost='51.123456')),('negative qty',lambda p:p['lines'][0].update(quantity='-1')),('zero qty',lambda p:p['lines'][0].update(quantity='0')),('fractional qty uncertified',lambda p:p['lines'][0].update(quantity='1.5')),('bad late line',lambda p:p['lines'][-1].update(unit_cost='NaN')),('foreign product',lambda p:p['lines'][0].update(product_id=A(300))),('missing supplier order',lambda p:p.update(mode='SAVE_ORDER')),('unverified payment',lambda p:p.update(payment={'amount':'1'})),('native USD',lambda p:p.update(currency='USD')),('unregistered immediate product',lambda p:p['lines'][0].update(product_id=None)),('unconfirmed noncredit',lambda p:p.update(non_credit_confirmed=False))]:
  p=payload(105);change(p);before=digest();_,r=rpc(p,commit=True);check(name+' rejected',r[0]!=0);check(name+' no partial inventory write',digest()==before)
 p=payload();p['lines'].append(line(1));_,r=rpc(p);check('Duplicate product lines rejected',r[0]!=0 and 'DUPLICATE_PRODUCT' in r[2])
 # Same-request concurrent calls must return one committed event.
 p=payload(105);req=str(uuid.uuid4());barrier=threading.Barrier(2)
 def run_concurrent():barrier.wait();return rpc(p,req,commit=True)[1]
 with concurrent.futures.ThreadPoolExecutor(2) as pool:rs=list(pool.map(lambda _:run_concurrent(),range(2)))
 check('Concurrent duplicate requests both resolve consistently',all(r[0]==0 for r in rs) and result(rs[0])==result(rs[1]));ev=result(rs[0])['eventId'];check('Concurrent retry one movement per line',read(f"SELECT count(*) FROM public.stock_movements WHERE event_id='{ev}'")=='105');check('Concurrent retry one notification',read(f"SELECT count(*) FROM public.notifications WHERE event_id='{ev}'")=='1')
 (E/'receipt-owner.private.json').write_text(read(f"SELECT receipt FROM incoming_m3.batches WHERE event_id='{event}'"),encoding='utf-8')
finally:
 out={'checks':checks,'pass':sum(c['status']=='PASS' for c in checks),'fail':sum(c['status']=='FAIL' for c in checks),'localOnly':True,'customerRecordsUsed':False};(E/'POSTGRES-RESULTS.json').write_text(json.dumps(out,indent=2));print(json.dumps({'pass':out['pass'],'fail':out['fail'],'last':checks[-1] if checks else None}))
