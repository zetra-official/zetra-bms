from pathlib import Path
import sys,json,uuid
from decimal import Decimal as D
sys.dont_write_bytecode=True;sys.path.insert(0,str(Path('engineering/currency-onboarding-20261018').resolve()));import local as l
E=Path(__file__).resolve().parent;N=E.parent/'native-financial-contracts-20261019';l.E=N;l.CLUSTER=N/'disposable-native-v2';q=lambda s:"'"+str(s).replace("'","''")+"'";read=lambda s:l.sql(s)[1];checks=[];pages=[]
owner=str(uuid.uuid5(uuid.NAMESPACE_URL,'zetra-normal-proforma-1'));sig='public.read_original_financial_facts_v1(uuid,text,timestamp with time zone,timestamp with time zone,integer,integer,timestamp with time zone)'
def ck(n,v):assert v,n;checks.append(n)
def auth(actor=owner):return 'SET ROLE coordinated_client;SET request.jwt.claims='+q(json.dumps({'sub':actor} if actor else {}))+';'
def call(store,kind,actor=owner,offset=0):return auth(actor)+'SELECT public.read_original_financial_facts_v1('+q(store)+','+q(kind)+",'2026-10-01','2026-11-01',200,"+str(offset)+')'
try:
 l.PORT=l.start();l.sql('DROP FUNCTION IF EXISTS public.read_original_financial_facts_v1(uuid,text,timestamptz,timestamptz,integer,integer)');l.sql((E/'2026101907-original-financial-readers.DRAFT.sql').read_text())
 for role in ['anon','authenticated','service_role','coordinated_client']:ck(role+' exact reader quarantined',read("SELECT NOT has_function_privilege('"+role+"','"+sig+"','EXECUTE')")=='t')
 l.sql('GRANT EXECUTE ON FUNCTION '+sig+' TO coordinated_client')
 for row in json.loads((N/'NATIVE-RESULTS.json').read_text())['scenarios']:
  for kind in ['SALE','PAYMENT','EXPENSE','CREDIT','COGS','STOCK']:
   page=json.loads(read(call(row['storeId'],kind)));ck(row['currency']+' '+kind+' scoped original decimal facts',page['organizationId']==row['organizationId'] and page['storeId']==row['storeId'] and all(v is None or isinstance(v,str) for r in page['rows'] for v in r['values'].values()))
   ck(row['currency']+' '+kind+' retains recorded currency',all(r['context'] is None or r['context']['currency']==row['currency'] for r in page['rows']))
   pages.append(page)
 unknown=str(uuid.uuid4());l.sql('INSERT INTO auth.users(id) VALUES('+q(unknown)+')')
 sample=json.loads((N/'NATIVE-RESULTS.json').read_text())['scenarios'][0];ck('unassigned actor cannot read store facts',l.sql(call(sample['storeId'],'SALE',unknown),False)[0]!=0);ck('no session cannot read facts',l.sql(call(sample['storeId'],'SALE',None),False)[0]!=0)
 # Existing actual cashier membership has store access but must not see cost/profit.
 cashier=read("SELECT m.user_id FROM public.org_memberships m WHERE m.organization_id="+q(sample['organizationId'])+" AND m.role='cashier' LIMIT 1")
 ck('cashier cannot retrieve owner COGS',l.sql(call(sample['storeId'],'COGS',cashier),False)[0]!=0)
 ck('cashier cannot retrieve owner stock valuation',l.sql(call(sample['storeId'],'STOCK',cashier),False)[0]!=0)
 ck('cashier authorized sale reader preserved',l.sql(call(sample['storeId'],'SALE',cashier),False)[0]==0)
 ck('reader cannot activate financial posting',all(p['postingAllowed'] is False for p in pages))
 (E/'ORIGINAL-FACT-FIXTURES.json').write_text(json.dumps(pages,indent=2));(E/'READER-RESULTS.json').write_text(json.dumps({'status':'PASS','count':len(checks),'checks':checks,'scope':'Canonical tables, original string amounts/context, owner-only costs and store authorization in disposable PostgreSQL. Synthetic Auth.'},indent=2));print('PASS '+str(len(checks)))
finally:
 if l.PORT:
  l.sql('REVOKE EXECUTE ON FUNCTION '+sig+' FROM coordinated_client',False);l.tool('pg_ctl',['-D',str(l.CLUSTER),'-m','fast','-w','stop'])
