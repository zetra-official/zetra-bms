from pathlib import Path
import sys,json,uuid,hashlib
sys.dont_write_bytecode=True;sys.path.insert(0,str(Path('engineering/currency-onboarding-20261018').resolve()));import local as l
R=Path.cwd();D=Path(__file__).resolve().parent;N=D.parent.parent/'native-financial-contracts-20261019';l.E=N;l.CLUSTER=N/'disposable-catalog-release';q=lambda s:"'"+str(s).replace("'","''")+"'";read=lambda s:l.sql(s)[1];checks=[]
I=lambda n:str(uuid.uuid5(uuid.NAMESPACE_URL,'zetra-normal-proforma-'+str(n)));actor=I(1);org0=I(100);store0=I(200);product0=I(300)
def ck(n,v):assert v,n;checks.append(n)
def clone(t,where,v):return 'INSERT INTO public.'+t+' SELECT (jsonb_populate_record(NULL::public.'+t+',to_jsonb(t)||'+q(json.dumps(v))+'::jsonb)).* FROM public.'+t+' t WHERE '+where+' LIMIT 1;'
def auth(who=actor):return 'SET ROLE coordinated_client;SET request.jwt.claims='+q(json.dumps({'sub':who} if who else {}))+';'
def generate(org,ids,cost=False,who=actor):return auth(who)+'SELECT row_to_json(x) FROM public.generate_product_catalog_share_v1('+q(org)+',NULL,ARRAY['+','.join(q(x) for x in ids)+']::uuid[],'+str(cost).lower()+',false,24,1) x'
def preview(code,who=actor):return auth(who)+'SELECT coalesce(json_agg(x),\'[]\') FROM public.preview_product_catalog_share_v1('+q(code)+') x'
def imp(code,org,store,ids,who=actor):return auth(who)+'SELECT row_to_json(x) FROM public.import_product_catalog_share_v1('+q(code)+','+q(org)+','+q(store)+',ARRAY['+','.join(q(x) for x in ids)+']::uuid[]) x'
try:
 l.PORT=l.start();captured=json.loads((D/'catalog-contracts.private.json').read_text())['rows'][0]['metadata'];captured=json.loads(captured) if isinstance(captured,str) else captured
 for f in captured['functions']:l.sql(f['definition']+';GRANT EXECUTE ON FUNCTION public.'+f['identity']+' TO coordinated_client;')
 scopes=[]
 for label in ['SOURCE','TARGET']:
  org,store,member=[str(uuid.uuid4()) for _ in range(3)];l.sql(clone('organizations','id='+q(org0),{'id':org,'name':'SYNTHETIC CATALOG '+label})+clone('stores','id='+q(store0),{'id':store,'organization_id':org,'name':'SYNTHETIC CATALOG STORE '+label})+clone('org_memberships','organization_id='+q(org0)+' AND user_id='+q(actor),{'id':member,'organization_id':org}));scopes.append((org,store))
 source,target=scopes;ids=[]
 for i in range(3):
  p=str(uuid.uuid4());ids.append(p);l.sql(clone('products','id='+q(product0),{'id':p,'organization_id':source[0],'store_id':source[1],'name':'SYNTHETIC CATALOG '+p,'sku':'SYN-'+p,'barcode':None,'cost_price':'5.12','selling_price':'12.34','qty_on_hand':'0','reserved_qty':'0'}))
 g=json.loads(read(generate(source[0],ids[:2])));ck('Generate Code retains exactly selected product IDs',g['product_count']==2)
 page=json.loads(read(preview(g['share_code'])));ck('Enter Code preview returns only selected products',{r['product_id'] for r in page}==set(ids[:2]));ck('cost and selling prices hidden without source consent',all(r['cost_price'] is None and r['selling_price'] is None for r in page))
 ck('cross-organization product selection denied',l.sql(generate(target[0],ids[:1]),False)[0]!=0)
 ck('missing authentication denied',l.sql(generate(source[0],ids[:1],who=None),False)[0]!=0)
 outsider=str(uuid.uuid4());l.sql('INSERT INTO auth.users(id) VALUES('+q(outsider)+')');ck('unassigned actor cannot Generate Code',l.sql(generate(source[0],ids[:1],who=outsider),False)[0]!=0)
 ck('unassigned actor cannot import to target',l.sql(imp(g['share_code'],target[0],target[1],ids[:1],who=outsider),False)[0]!=0)
 ck('store from another organization denied',l.sql(imp(g['share_code'],target[0],source[1],ids[:1]),False)[0]!=0)
 ck('product not in shared selection denied',l.sql(imp(g['share_code'],target[0],target[1],[ids[2]]),False)[0]!=0)
 imported=json.loads(read(imp(g['share_code'],target[0],target[1],ids[:1])));ck('selected import creates only one target product',imported['imported_count']==1 and imported['total_selected']==1)
 ck('imported stock initializes to zero',read('SELECT count(*)=1 AND bool_and(qty_on_hand=0 AND reserved_qty=0 AND cost_price IS NULL) FROM public.products WHERE organization_id='+q(target[0]))=='t')
 ck('code cannot exceed one-use limit',l.sql(imp(g['share_code'],target[0],target[1],ids[:1]),False)[0]!=0)
 g2=json.loads(read(generate(source[0],ids[:1],True)));page2=json.loads(read(preview(g2['share_code'])));ck('explicit authorized source cost consent is preserved',all(str(r['cost_price']) in ['5.12','5.120000'] for r in page2))
 l.sql('UPDATE public.product_catalog_shares SET expires_at=now()-interval \'1 second\' WHERE id='+q(g2['share_id']));ck('expired code preview denied',l.sql(preview(g2['share_code']),False)[0]!=0)
 ck('source stock unchanged by sharing and import',read('SELECT count(*)=3 AND bool_and(qty_on_hand=0 AND reserved_qty=0) FROM public.products WHERE organization_id='+q(source[0]))=='t')
 (D/'CONTRACT-TEST-RESULTS.json').write_text(json.dumps({'status':'PASS','count':len(checks),'checks':checks,'scope':'Exact three Production Catalog RPC definitions, disposable synthetic full schema and synthetic JWT; no Production Generate/import writes. Owner114-products Expo evidence retained, not repeated.','definitionHashes':{f['identity']:hashlib.sha256(f['definition'].encode()).hexdigest() for f in captured['functions']}},indent=2));print('PASS '+str(len(checks)))
finally:
 if l.PORT:l.tool('pg_ctl',['-D',str(l.CLUSTER),'-m','fast','-w','stop'])
