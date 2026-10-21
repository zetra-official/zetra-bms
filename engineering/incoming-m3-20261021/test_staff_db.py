from pathlib import Path
import json,sys,uuid
E=Path(__file__).resolve().parent
sys.path.insert(0,str(E.parent/'security-owner-privacy-m2-20261021'));import local_runtime as l
l.db.E=E;l.db.CLUSTER=E/'disposable';l.db.PORT=json.loads((E/'db.private.json').read_text())['port'];sql=l.db.sql
assert Path(sql("SELECT current_setting('data_directory')")[1].strip()).resolve()==(E/'disposable').resolve()
prefix=uuid.uuid4().hex[:8];U=lambda n:f'{prefix}-2222-4000-8000-{n:012d}';A=lambda n:f'21000000-0000-4000-8000-{n:012d}'
O,S,S2=U(1),U(2),U(3);checks=[]
def check(name,ok):checks.append({'name':name,'status':'PASS' if ok else 'FAIL'});assert ok,name
def rpc(actor=3,org=O,store=S):
 r=sql(f"BEGIN;SET LOCAL ROLE authenticated;SELECT set_config('request.jwt.claim.sub','{A(actor)}',true);SELECT public.m3_staff_operational_v1('{org}','{store}','2026-01-01',0);ROLLBACK;",False)
 return r,json.loads(next(x for x in r[1].splitlines() if x.startswith('{'))) if r[0]==0 else None
try:
 r=sql((E/'2026102103-staff-operational.DRAFT.sql').read_text(),False);check('New Staff read draft applied only to verified disposable backend',r[0]==0)
 seed=f"INSERT INTO public.organizations(id,name,created_by) VALUES('{O}','M3 STAFF SYNTHETIC','{A(1)}');INSERT INTO public.stores(id,organization_id,name,store_type,created_by) VALUES('{S}','{O}','M3 staff destination','STANDARD','{A(1)}'),('{S2}','{O}','M3 unassigned store','STANDARD','{A(1)}');"
 for n,role in [(1,'owner'),(2,'admin'),(3,'staff'),(4,'cashier'),(7,'staff'),(8,'staff')]:
  seed+=f"INSERT INTO public.org_memberships(id,organization_id,user_id,role,is_active) VALUES('{U(100+n)}','{O}','{A(n)}','{role}',{'false' if n==8 else 'true'});"
  if n in [3,4,7,8]:seed+=f"INSERT INTO public.org_membership_stores(membership_id,store_id) VALUES('{U(100+n)}','{S}');"
 for n,seller,creator,amount,paid in [(1,3,3,250000,100000),(2,3,3,50000,0),(3,3,4,100000,100000),(4,7,7,999999,500000)]:
  seed+=f"INSERT INTO public.sales(id,organization_id,store_id,sold_by_membership_id,sold_by_membership,created_by,sold_at,total_amount,grand_total,paid_amount) VALUES('{U(200+n)}','{O}','{S}','{U(100+seller)}','{U(100+seller)}','{A(creator)}','2026-01-01T10:00:00Z',{amount},{amount},{paid});"
 for n,sale,collector,amount in [(1,1,3,100000),(2,3,4,100000),(3,4,7,500000)]:
  seed+=f"INSERT INTO public.sale_payments(id,organization_id,store_id,sale_id,received_by_membership_id,created_by,created_at,payment_method,paid_amount) VALUES('{U(300+n)}','{O}','{S}','{U(200+sale)}','{U(100+collector)}','{A(collector)}','2026-01-01T11:00:00Z','CASH',{amount});"
 for n,actor,amount in [(1,3,5000),(2,7,9000),(3,1,99999)]:
  seed+=f"INSERT INTO public.expenses(id,organization_id,store_id,created_by,created_by_membership_id,amount,expense_date) VALUES('{U(400+n)}','{O}','{S}','{A(actor)}','{U(100+actor)}',{amount},'2026-01-01');"
 sql('BEGIN;'+seed+'COMMIT;');r,data=rpc();check('Staff genuine SQL-role read succeeds',r[0]==0)
 if r[0]: (E/'staff-db-error.private.log').write_text(r[2]);raise RuntimeError('See local private SQL diagnostic')
 check('Personal completed sales exclude same-store colleague',data['sales']=='400000' and data['orders']==3)
 check('Money In counts own verified collection, excludes unpaid and cashier collections',data['money_in']=='100000' and data['money_status']=='VERIFIED_GROSS_COLLECTIONS')
 check('Own expense visibility independent of management flag',data['expenses']=='5000')
 check('Average order value exact numeric display',data['average']=='133333.33')
 check('Private fields absent from response',not any(k in data for k in ['profit','cogs','cost_price','supplier_liabilities','business_debts']))
 check('Personal history has five authorized rows only',len(data['history'])==5)
 for n in [1,2,4,5,6,8]:check(f'Actor {n} denied new Staff-only contract',rpc(n)[0][0]!=0)
 other=rpc(7)[1];check('Same-store second Staff sees only own metrics',other['sales']=='999999' and other['money_in']=='500000' and other['expenses']=='9000')
 check('Unassigned store denied',rpc(store=S2)[0][0]!=0)
 check('Cross-organization scope denied',rpc(org=U(999))[0][0]!=0)
 r=sql(f"BEGIN;SET LOCAL ROLE anon;SELECT public.m3_staff_operational_v1('{O}','{S}','2026-01-01',0);ROLLBACK;",False);check('Anonymous direct call denied',r[0]!=0)
 sql(f"UPDATE public.sales SET sold_by_membership_id=NULL,sold_by_membership=NULL WHERE id='{U(201)}';")
 missing=rpc()[1];check('Missing own seller evidence unavailable rather than zero',missing['sales'] is None and missing['orders'] is None and missing['sales_status']=='ATTRIBUTION_UNAVAILABLE')
 sql(f"UPDATE public.sales SET sold_by_membership_id='{U(103)}',sold_by_membership='{U(103)}' WHERE id='{U(201)}';DELETE FROM public.sale_payments WHERE id='{U(301)}';")
 missing=rpc()[1];check('Paid sale without collection evidence unavailable rather than inferred cash',missing['money_in'] is None and missing['money_status']=='ATTRIBUTION_UNAVAILABLE')
 (E/'staff-fixture.private.json').write_text(json.dumps({'org':O,'store':S,'store2':S2,'prefix':prefix}))
finally:
 out={'localOnly':True,'hostedWrites':False,'checks':checks,'pass':sum(x['status']=='PASS' for x in checks),'fail':sum(x['status']=='FAIL' for x in checks)};(E/'STAFF-POSTGRES-RESULTS.json').write_text(json.dumps(out,indent=2));print(json.dumps(out))
