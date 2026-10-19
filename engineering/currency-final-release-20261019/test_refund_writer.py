from pathlib import Path
import sys,json,uuid,hashlib
from decimal import Decimal as D
sys.dont_write_bytecode=True
sys.path.insert(0,str(Path('engineering/currency-onboarding-20261018').resolve()))
import local as l
E=Path(__file__).resolve().parent;N=E.parent/'native-financial-contracts-20261019'
l.E=N;l.CLUSTER=N/'disposable-native-v2'
q=lambda s:"'"+str(s).replace("'","''")+"'"
owner=str(uuid.uuid5(uuid.NAMESPACE_URL,'zetra-normal-proforma-1'))
auth='SET ROLE coordinated_client;SET request.jwt.claims='+q(json.dumps({'sub':owner}))+';'
checks=[]
try:
 l.PORT=l.start()
 path=E/'2026101914-atomic-original-refund.DRAFT.sql'
 # Install once, never replace a previously installed function to hide drift.
 if l.sql("SELECT to_regclass('backend_core.original_refunds') IS NULL")[1]=='t':l.sql(path.read_text())
 checks.append('1914 additive exact-preimage installation succeeds')
 for role in ['anon','authenticated','service_role']:
  assert l.sql("SELECT NOT has_function_privilege("+q(role)+",'public.refund_original_sale_v1(uuid,uuid,uuid,uuid,numeric,boolean,uuid,jsonb)','EXECUTE')")[1]=='t'
  checks.append(role+' cannot execute new refund RPC')
 for scenario in json.loads((E/'ORIGINAL-REFUND-EVIDENCE-RESULTS.json').read_text())['scenarios']:
  sid=scenario['saleId'];meta=json.loads(l.sql("SELECT json_build_object('store',s.store_id,'org',s.organization_id,'line',i.id,'product',i.product_id,'account',b.account_id) FROM public.sales s JOIN public.sale_items i ON i.sale_id=s.id JOIN public.sale_payments p ON p.sale_id=s.id JOIN backend_core.settlement_bindings b ON b.source_kind='SALE_PAYMENT' AND b.source_id=p.id WHERE s.id="+q(sid)+" LIMIT 1")[1])
  store=meta['store'];line=meta['line'];ac=meta['account'];req=str(uuid.uuid4())
  evidence=q(json.dumps({'source':'OWNER_CONFIRMED','reference':'LOCAL_REFUND_SAVED_ORIGINAL'}))+'::jsonb'
  call=lambda request,qty,sell:'SELECT public.refund_original_sale_v1('+','.join([q(store),q(request),q(sid),q(line),str(qty),str(sell).lower(),'NULL',evidence])+')'
  start="BEGIN;CREATE FUNCTION pg_temp.ck(v boolean,n text) RETURNS void LANGUAGE plpgsql AS $$BEGIN IF v IS DISTINCT FROM true THEN RAISE EXCEPTION 'ASSERTION: %',n;END IF;END$$;"
  start+='GRANT EXECUTE ON FUNCTION public.refund_original_sale_v1(uuid,uuid,uuid,uuid,numeric,boolean,uuid,jsonb),public.read_bound_account_balance_v1(uuid) TO coordinated_client;'
  start+='UPDATE backend_core.settlement_rollout SET enabled=true WHERE organization_id='+q(meta['org'])+';'
  start+='CREATE TEMP TABLE prior AS SELECT qty FROM public.inventory WHERE store_id='+q(store)+' AND product_id='+q(meta['product'])+';'
  start+='CREATE TEMP TABLE account_before AS SELECT backend_core.project_bound_account_v1('+q(ac)+') doc;'+auth
  cmd=start+call(req,1,True)+';'+call(req,1,True)+';RESET ROLE;'
  cmd+="SELECT pg_temp.ck((SELECT count(*)=1 FROM backend_core.original_refunds WHERE sale_id="+q(sid)+"),'retry exactly once');"
  cmd+='SELECT pg_temp.ck((SELECT qty=(SELECT qty+1 FROM prior) FROM public.inventory WHERE store_id='+q(store)+' AND product_id='+q(meta['product'])+'),\'sellable return restores stock once\');'
  cmd+=auth+call(str(uuid.uuid4()),1,False)+';RESET ROLE;'
  cmd+='SELECT pg_temp.ck((SELECT qty=(SELECT qty+1 FROM prior) FROM public.inventory WHERE store_id='+q(store)+' AND product_id='+q(meta['product'])+'),\'nonsellable return does not restore stock\');'
  cmd+=auth+call(str(uuid.uuid4()),1,True)+';RESET ROLE;'
  cmd+='SELECT pg_temp.ck((SELECT sum((original_slice->>\'refundAmount\')::numeric)='+scenario['refundTotal']+' AND sum((original_slice->>\'tax\')::numeric)='+scenario['tax']+' FROM backend_core.original_refunds WHERE sale_id='+q(sid)+'),\'full quantity refunds conserve original paid and tax\');'
  cmd+='SELECT pg_temp.ck((SELECT (backend_core.project_bound_account_v1('+q(ac)+")->>'balance')::numeric=(doc->>'balance')::numeric-"+scenario['refundTotal']+" FROM account_before),'account debit exactly original paid');"
  cmd+="DO $$BEGIN BEGIN PERFORM public.refund_original_sale_v1("+','.join([q(store),q(str(uuid.uuid4())),q(sid),q(line),'1','true','NULL',evidence])+ ");RAISE EXCEPTION 'OVER_REFUND_ACCEPTED';EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%REFUND_QUANTITY_EXCEEDS_ORIGINAL%' THEN RAISE;END IF;END;END$$;"
  cmd+='SELECT pg_temp.ck((SELECT count(*)=3 FROM backend_core.original_refunds WHERE sale_id='+q(sid)+'),\'failed overrefund leaves no extra record\');'
  cmd+='ROLLBACK;'
  l.sql(cmd)
  checks.extend([scenario['currency']+' '+x for x in ['idempotent refund','sellable stock restored once','nonsellable stock excluded','original tax/paid conservation','original account debited once','excess quantity atomic denial']])
 result={'status':'PASS','count':len(checks),'checks':checks,'migrationSha256':hashlib.sha256(path.read_bytes()).hexdigest(),'productionWrites':False,'scope':'Actual local canonical original-evidence refund writer; synthetic Auth and tax fixture. Every currency test rolled back; no verified Production tax adapter claimed.'}
 (E/'ATOMIC-REFUND-WRITER-RESULTS.json').write_text(json.dumps(result,indent=2));print(json.dumps({'status':'PASS','count':len(checks)}))
finally:
 if l.PORT:l.tool('pg_ctl',['-D',str(l.CLUSTER),'-m','fast','-w','stop'])
