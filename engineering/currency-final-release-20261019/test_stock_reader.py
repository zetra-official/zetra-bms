from pathlib import Path
import sys,json,uuid
from decimal import Decimal as D
sys.dont_write_bytecode=True;sys.path.insert(0,str(Path('engineering/currency-onboarding-20261018').resolve()));import local as l
E=Path(__file__).resolve().parent;N=E.parent/'native-financial-contracts-20261019';l.E=N;l.CLUSTER=N/'disposable-native-v2';q=lambda s:"'"+str(s).replace("'","''")+"'";read=lambda s:l.sql(s)[1];checks=[]
owner=str(uuid.uuid5(uuid.NAMESPACE_URL,'zetra-normal-proforma-1'));auth='SET ROLE coordinated_client;SET request.jwt.claims='+q(json.dumps({'sub':owner}))+';';sig='public.read_original_financial_facts_v1(uuid,text,timestamptz,timestamptz,integer,integer,timestamptz)'
def ck(n,v):assert v,n;checks.append(n)
try:
 l.PORT=l.start();sql=(E/'2026101907-original-financial-readers.DRAFT.sql').read_text().replace('CREATE FUNCTION public.read_original_financial_facts_v1','CREATE OR REPLACE FUNCTION public.read_original_financial_facts_v1');l.sql(sql);l.sql('GRANT EXECUTE ON FUNCTION '+sig+' TO coordinated_client')
 currencies=json.loads((N/'NATIVE-RESULTS.json').read_text())['scenarios'];tzs=next(r for r in currencies if r['currency']=='TZS')
 def clone(table,where,values):return 'INSERT INTO public.'+table+' SELECT (jsonb_populate_record(NULL::public.'+table+',to_jsonb(t)||'+q(json.dumps(values))+'::jsonb)).* FROM public.'+table+' t WHERE '+where+' LIMIT 1;'
 for i in range(201):
  product=str(uuid.uuid4());l.sql(clone('products','id='+q(tzs['productId']),{'id':product,'name':'SYNTHETIC STOCK SNAPSHOT','sku':product,'cost_price':'5.12'})+clone('inventory','store_id='+q(tzs['storeId'])+' AND product_id='+q(tzs['productId']),{'product_id':product,'qty':'1.125'}))
 fixtures=json.loads((E/'ORIGINAL-FACT-FIXTURES.json').read_text())
 for row in currencies:
  statement=auth+'SELECT public.read_original_financial_facts_v1('+q(row['storeId'])+",'STOCK','2026-10-01','2026-11-01',200,0,NULL)";page=json.loads(read(statement));expected=D(read('SELECT sum(i.qty*p.cost_price)::text FROM public.inventory i JOIN public.products p ON p.id=i.product_id WHERE i.store_id='+q(row['storeId'])))
  ck(row['currency']+' exact current-stock valuation aggregated once per original context',len(page['rows'])==1 and D(page['rows'][0]['values']['amount'])==expected)
  fixtures=[page if p['storeId']==row['storeId'] and p['kind']=='STOCK' else p for p in fixtures]
  if row['currency']=='TZS':ck('201-product stock page cannot omit rows',int(page['rows'][0]['values']['productCount'])>=202)
  ck(row['currency']+' NULL page limit denied',l.sql(statement.replace('200,0,NULL','NULL,0,NULL'),False)[0]!=0)
 ck('stock is explicitly current, not historical',page['periodSemantics']=='CURRENT_SNAPSHOT_NOT_HISTORICAL')
 (E/'ORIGINAL-FACT-FIXTURES.json').write_text(json.dumps(fixtures,indent=2));(E/'STOCK-READER-RESULTS.json').write_text(json.dumps({'status':'PASS','count':len(checks),'checks':checks,'scope':'Actual original-context inventory aggregation; >200 products represented in one MVCC stock query; no receipt-cost attestation claim.'},indent=2));print('PASS '+str(len(checks)))
finally:
 if l.PORT:
  l.sql('REVOKE EXECUTE ON FUNCTION '+sig+' FROM coordinated_client',False);l.tool('pg_ctl',['-D',str(l.CLUSTER),'-m','fast','-w','stop'])
