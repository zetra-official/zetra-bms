from pathlib import Path
import sys,json,uuid
sys.dont_write_bytecode=True;sys.path.insert(0,str(Path('engineering/currency-onboarding-20261018').resolve()));import local as l
D=Path(__file__).resolve().parent;N=D.parent.parent/'native-financial-contracts-20261019';l.E=N;l.CLUSTER=N/'disposable-catalog-release';q=lambda s:"'"+str(s).replace("'","''")+"'";read=lambda s:l.sql(s)[1];checks=[]
try:
 l.PORT=l.start();org=read("SELECT id FROM public.organizations WHERE name='SYNTHETIC CATALOG SOURCE' ORDER BY created_at DESC LIMIT 1");target=read("SELECT id FROM public.organizations WHERE name='SYNTHETIC CATALOG TARGET' ORDER BY created_at DESC LIMIT 1");actor=str(uuid.uuid4());l.sql('INSERT INTO auth.users(id) VALUES('+q(actor)+')')
 for o in [org,target]:l.sql('INSERT INTO public.org_memberships SELECT (jsonb_populate_record(NULL::public.org_memberships,to_jsonb(m)||'+q(json.dumps({'id':str(uuid.uuid4()),'user_id':actor,'role':'staff','organization_id':o}))+'::jsonb)).* FROM public.org_memberships m WHERE m.organization_id='+q(o)+' LIMIT 1')
 auth='SET ROLE coordinated_client;SET request.jwt.claims='+q(json.dumps({'sub':actor}))+';'
 r=l.sql(auth+'SELECT * FROM public.generate_product_catalog_share_v1('+q(org)+')',False);assert r[0]!=0 and 'Owner or admin only' in r[2];checks.append('staff cannot Generate Code or grant cost-price sharing')
 r=l.sql(auth+"SELECT * FROM public.import_product_catalog_share_v1('SYNTHETIC-UNUSED',"+q(target)+')',False);assert r[0]!=0 and 'Owner or admin only' in r[2];checks.append('staff cannot import into business through direct RPC')
 r=l.sql('SET ROLE coordinated_client;SET request.jwt.claims=\'{}\';SELECT * FROM public.preview_product_catalog_share_v1(\'SYNTHETIC-UNUSED\')',False);assert r[0]!=0 and 'Not authenticated' in r[2];checks.append('unauthenticated Enter Code preview denied')
 (D/'STAFF-SECURITY-RESULTS.json').write_text(json.dumps({'status':'PASS','count':len(checks),'checks':checks,'scope':'Disposable PostgreSQL, exact captured Production RPCs; synthetic JWT only'},indent=2));print('PASS '+str(len(checks)))
finally:
 if l.PORT:l.tool('pg_ctl',['-D',str(l.CLUSTER),'-m','fast','-w','stop'])
