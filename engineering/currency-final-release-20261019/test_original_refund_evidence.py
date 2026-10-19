from pathlib import Path
import sys,json,uuid,hashlib,re
from decimal import Decimal as D
sys.dont_write_bytecode=True;sys.path.insert(0,str(Path('engineering/currency-onboarding-20261018').resolve()));import local as l
E=Path(__file__).resolve().parent;N=E.parent/'native-financial-contracts-20261019';l.E=N;l.CLUSTER=N/'disposable-native-v2'
q=lambda s:"'"+str(s).replace("'","''")+"'";read=lambda s:l.sql(s)[1];checks=[];scenarios=[]
owner=str(uuid.uuid5(uuid.NAMESPACE_URL,'zetra-normal-proforma-1'));auth='SET ROLE coordinated_client;SET request.jwt.claims='+q(json.dumps({'sub':owner}))+';'
def ck(n,v):assert v,n;checks.append(n)
try:
 l.PORT=l.start();p=E/'2026101913-original-refund-evidence.DRAFT.sql'
 if read("SELECT to_regclass('backend_core.original_sale_evidence') IS NULL")=='t':l.sql(p.read_text())
 else:
  for fn in re.findall(r'CREATE FUNCTION.*?AS \$\$.*?\$\$;',p.read_text(),re.S):l.sql(fn.replace('CREATE FUNCTION','CREATE OR REPLACE FUNCTION',1))
 ck('1913 exact evidence-only migration commits',True)
 for name in ['capture_original_sale_evidence_v1','original_refund_slice_v1']:
  for role in ['anon','authenticated','service_role']:
   ck(name+' denied for '+role,read('SELECT NOT has_function_privilege('+q(role)+',oid,\'EXECUTE\') FROM pg_proc WHERE proname='+q(name))=='t')
 l.sql('GRANT USAGE ON SCHEMA backend_core TO coordinated_client')
 for sig in read("SELECT oid::regprocedure FROM pg_proc WHERE proname IN('post_bound_financial_v1','capture_original_sale_evidence_v1','original_refund_slice_v1')").splitlines():l.sql('GRANT EXECUTE ON FUNCTION '+sig+' TO coordinated_client')
 l.sql("CREATE TABLE IF NOT EXISTS backend_core.synthetic_original_tax_fixture(sale_id uuid PRIMARY KEY,doc jsonb);CREATE OR REPLACE FUNCTION backend_core.synthetic_original_tax_provider(uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$SELECT doc FROM backend_core.synthetic_original_tax_fixture WHERE sale_id=$1$$;REVOKE ALL ON FUNCTION backend_core.synthetic_original_tax_provider(uuid) FROM PUBLIC,anon,authenticated,service_role,coordinated_client;")
 l.sql("INSERT INTO backend_core.original_evidence_adapters VALUES('LOCAL_SYNTHETIC_TAX', 'backend_core.synthetic_original_tax_provider(uuid)'::regprocedure,md5(replace(pg_get_functiondef('backend_core.synthetic_original_tax_provider(uuid)'::regprocedure),chr(13),'')),'DISPOSABLE_FIXTURE_NOT_PRODUCTION_TAX_SERVICE',true) ON CONFLICT(name) DO UPDATE SET enabled=true")
 native=json.loads((N/'NATIVE-RESULTS.json').read_text())['scenarios'];accounts={x['currency']:x['accountId'] for x in json.loads((E/'SETTLEMENT-BINDING-RESULTS.json').read_text())['scenarios']}
 for row in native:
  code=row['currency'];store=row['storeId'];org=row['organizationId'];price='12' if code in ['JPY','UGX'] else '12.345' if code=='KWD' else '12.34';total=str(D(price)*3);tax='2' if code in ['JPY','UGX'] else '1.001' if code=='KWD' else '1.01';req=str(uuid.uuid4())
  l.sql('UPDATE backend_core.settlement_rollout SET enabled=true WHERE organization_id='+q(org));l.sql('UPDATE backend_core.native_financial_rollout SET enabled=true WHERE organization_id='+q(org))
  payload={'organization_id':org,'items':[{'product_id':row['productId'],'qty':'3','unit_price':price}],'payment_method':'CASH','paid_amount':total,'is_credit':False}
  post='SELECT public.post_bound_financial_v1('+','.join([q(store),q(req),q(code),'1',q('SALE'),q(json.dumps(payload))+'::jsonb',q(json.dumps({'CASH':accounts[code]}))+'::jsonb','NULL',q(json.dumps({'source':'OWNER_CONFIRMED','reference':'SYNTHETIC_ORIGINAL_TAX'}))+'::jsonb'])+')'
  evidence="INSERT INTO backend_core.synthetic_original_tax_fixture SELECT s.id,jsonb_build_object('saleId',s.id,'organizationId',s.organization_id,'storeId',s.store_id,'currency',s.currency_context->>'currency','sourceReference','SYNTHETIC_ORIGINAL_INCLUSIVE_TAX_DOCUMENT','lines',jsonb_agg(jsonb_build_object('lineId',i.id,'gross',(i.qty*i.unit_price)::text,'discount','0','rounding','0','tax',"+q(tax)+",'net',(i.qty*i.unit_price-"+tax+")::text,'cogs',(i.qty*i.unit_cost)::text))) FROM public.sales s JOIN public.sale_items i ON i.sale_id=s.id WHERE s.client_sale_id="+q(req)+' GROUP BY s.id;'
  same_intent='INSERT INTO backend_core.settlement_intents(backend_pid,transaction_id,actor_id,organization_id,store_id,request_id,operation) VALUES(pg_backend_pid(),txid_current(),'+','.join(q(x) for x in [owner,org,store,req])+",'SALE');"
  selected='SELECT set_config(\'zetra.synthetic_original_sale\',(SELECT id::text FROM public.sales WHERE client_sale_id='+q(req)+'),true);'
  command='BEGIN;'+auth+post+';RESET ROLE;'+evidence+same_intent+selected+auth+"SELECT backend_core.capture_original_sale_evidence_v1(current_setting('zetra.synthetic_original_sale')::uuid,'LOCAL_SYNTHETIC_TAX');RESET ROLE;DELETE FROM backend_core.settlement_intents WHERE backend_pid=pg_backend_pid() AND transaction_id=txid_current();COMMIT;"
  l.sql(command);sid=read('SELECT id FROM public.sales WHERE client_sale_id='+q(req));line=read('SELECT id FROM public.sale_items WHERE sale_id='+q(sid))
  pieces=[json.loads(read(auth+'SELECT backend_core.original_refund_slice_v1('+q(sid)+','+q(line)+','+str(i)+',1)')) for i in range(3)]
  ck(code+' three cumulative tax reversals conserve saved tax exactly',sum(D(x['tax']) for x in pieces)==D(tax))
  ck(code+' three refund slices conserve original paid total',sum(D(x['refundAmount']) for x in pieces)==D(total))
  original=json.loads(read('SELECT snapshot FROM backend_core.original_sale_evidence WHERE sale_id='+q(sid)))['lines'][0]
  ck(code+' original COGS conserved independent of present catalog',sum(D(x['cogs']) for x in pieces)==D(original['cogs']))
  ck(code+' excessive quantity denied',l.sql(auth+'SELECT backend_core.original_refund_slice_v1('+q(sid)+','+q(line)+',2,2)',False)[0]!=0)
  ck(code+' no posting authority manufactured by quote',all(x['postingAllowed'] is False for x in pieces))
  ck(code+' evidence cannot be backfilled after sale commit',l.sql(auth+'SELECT backend_core.capture_original_sale_evidence_v1('+q(sid)+",'LOCAL_SYNTHETIC_TAX')",False)[0]!=0)
  ck(code+' evidence immutable',l.sql('UPDATE backend_core.original_sale_evidence SET currency='+q('USD')+' WHERE sale_id='+q(sid),False)[0]!=0)
  scenarios.append({'currency':code,'saleId':sid,'tax':tax,'refundTotal':total,'parts':pieces})
 ck('historical sale lacking original evidence denied',l.sql(auth+'SELECT backend_core.original_refund_slice_v1('+q(str(uuid.uuid4()))+','+q(str(uuid.uuid4()))+',0,1)',False)[0]!=0)
 ck('private evidence tables FORCE RLS',read("SELECT count(*)=2 AND bool_and(relrowsecurity AND relforcerowsecurity) FROM pg_class WHERE relnamespace='backend_core'::regnamespace AND relname IN('original_evidence_adapters','original_sale_evidence')")=='t')
 (E/'ORIGINAL-REFUND-EVIDENCE-RESULTS.json').write_text(json.dumps({'status':'PASS','count':len(checks),'checks':checks,'scenarios':scenarios,'migrationSha256':hashlib.sha256(p.read_bytes()).hexdigest(),'scope':'Local synthetic original-tax provider only. Snapshot validation and exact reversal planning; actual refund settlement/restock remains unavailable and disabled. No genuine Auth or Production writes.'},indent=2));print('PASS '+str(len(checks)))
finally:
 if l.PORT:
  l.sql('UPDATE backend_core.settlement_rollout SET enabled=false',False);l.sql('UPDATE backend_core.native_financial_rollout SET enabled=false',False)
  l.sql("UPDATE backend_core.original_evidence_adapters SET enabled=false",False)
  l.sql("DO $$DECLARE p record;BEGIN FOR p IN SELECT oid FROM pg_proc WHERE proname IN('post_bound_financial_v1','capture_original_sale_evidence_v1','original_refund_slice_v1') LOOP EXECUTE format('REVOKE ALL ON FUNCTION %s FROM coordinated_client',p.oid::regprocedure);END LOOP;END$$",False)
  l.sql('REVOKE USAGE ON SCHEMA backend_core FROM coordinated_client',False)
  l.tool('pg_ctl',['-D',str(l.CLUSTER),'-m','fast','-w','stop'])
