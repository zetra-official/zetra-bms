"""Focused1917 tests. Actual canonical writer; isolated synthetic tax authority."""
from pathlib import Path
import sys,json,uuid,shutil,hashlib
from decimal import Decimal as D
sys.dont_write_bytecode=True;sys.path.insert(0,str(Path('engineering/currency-onboarding-20261018').resolve()));import local as db
E=Path(__file__).resolve().parent;N=E.parent/'native-financial-contracts-20261019'
db.E=N/('disposable-tax-capture-'+str(uuid.uuid4()));db.E.mkdir();db.CLUSTER=db.E/'cluster'
q=lambda s:"'"+str(s).replace("'","''")+"'";owner=str(uuid.uuid5(uuid.NAMESPACE_URL,'zetra-normal-proforma-1'));auth='SET ROLE coordinated_client;SET request.jwt.claims='+q(json.dumps({'sub':owner}))+';'
checks=[];scenarios=[]
def ck(name,v):assert v,name;checks.append(name)
try:
 source=N/'disposable-native-v2';assert not(source/'postmaster.pid').exists() and not list((source/'pg_tblspc').iterdir());assert not any(p.is_symlink() for p in source.rglob('*'))
 shutil.copytree(source,db.CLUSTER);db.PORT=db.start()
 for name in ['2026101915-canonical-field-custody.DRAFT.sql','2026101916-original-workflow-readers.DRAFT.sql']:db.sql((E/name).read_text())
 fingerprint="SELECT md5(coalesce(string_agg(v::text,'' ORDER BY k,id),'')) FROM(SELECT 'sales' k,id::text,to_jsonb(s) v FROM public.sales s UNION ALL SELECT 'items',id::text,to_jsonb(s) FROM public.sale_items s UNION ALL SELECT 'payments',id::text,to_jsonb(s) FROM public.sale_payments s) x"
 before=db.sql(fingerprint)[1];acl=db.sql("SELECT proacl::text FROM pg_proc WHERE proname='create_sale_with_payment_v6'")[1]
 migration=E/'2026101917-atomic-sale-tax-capture.DRAFT.sql';db.sql(migration.read_text())
 ck('1917 installs without changing original sale/item/payment histories',db.sql(fingerprint)[1]==before)
 ck('legacy v6 ACL remains unchanged',db.sql("SELECT proacl::text FROM pg_proc WHERE proname='create_sale_with_payment_v6'")[1]==acl)
 for table in ['original_tax_capture_bindings','original_sale_posting_facts']:
  ck(table+' FORCE RLS',db.sql('SELECT relrowsecurity AND relforcerowsecurity FROM pg_class WHERE oid='+q('backend_core.'+table)+'::regclass')[1]=='t')
  for role in ['anon','authenticated','service_role']:
   ck(table+' denied '+role,db.sql('SELECT NOT has_table_privilege('+q(role)+','+q('backend_core.'+table)+",'SELECT,INSERT,UPDATE,DELETE')")[1]=='t')
 ck('private capture hook denies all nonowner execution',db.sql("SELECT count(*)=0 FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.proname='capture_bound_sale_posting_facts_v1' AND a.grantee<>p.proowner")[1]=='t')
 db.sql("CREATE TABLE backend_core.test_verified_original_tax(organization_id uuid PRIMARY KEY,tax numeric NOT NULL);CREATE FUNCTION backend_core.test_posting_tax_source(uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$SELECT jsonb_build_object('saleId',s.id,'organizationId',s.organization_id,'storeId',s.store_id,'currency',s.currency_context->>'currency','sourceReference','EXPLICIT_SYNTHETIC_ORIGINAL_TAX_QUOTE','lines',jsonb_agg(jsonb_build_object('lineId',i.id,'gross',(i.qty*i.unit_price)::text,'discount','0','rounding','0','tax',t.tax::text,'net',(i.qty*i.unit_price-t.tax)::text,'cogs',(i.qty*i.unit_cost)::text))) FROM public.sales s JOIN public.sale_items i ON i.sale_id=s.id JOIN backend_core.test_verified_original_tax t ON t.organization_id=s.organization_id WHERE s.id=$1 GROUP BY s.id,t.tax$$;REVOKE ALL ON FUNCTION backend_core.test_posting_tax_source(uuid) FROM PUBLIC,anon,authenticated,service_role,coordinated_client;INSERT INTO backend_core.original_evidence_adapters VALUES('POSTING_TEST_ONLY','backend_core.test_posting_tax_source(uuid)'::regprocedure,md5(replace(pg_get_functiondef('backend_core.test_posting_tax_source(uuid)'::regprocedure),chr(13),'')),'LOCAL_SYNTHETIC_TAX_SOURCE_NOT_PRODUCTION',true)")
 accounts={s['currency']:s['accountId'] for s in json.loads((E/'SETTLEMENT-BINDING-RESULTS.json').read_text())['scenarios']}
 db.sql('GRANT EXECUTE ON FUNCTION public.post_bound_financial_v1(uuid,uuid,text,integer,text,jsonb,jsonb,uuid,jsonb),public.refund_original_sale_v1(uuid,uuid,uuid,uuid,numeric,boolean,uuid,jsonb) TO coordinated_client')
 for s in json.loads((N/'NATIVE-RESULTS.json').read_text())['scenarios']:
  code,org,store=s['currency'],s['organizationId'],s['storeId'];price='12' if code in ['JPY','UGX'] else '12.345' if code=='KWD' else '12.34';total=str(D(price)*3);tax='2' if code in ['JPY','UGX'] else '1.001' if code=='KWD' else '1.01'
  payload={'organization_id':org,'items':[{'product_id':s['productId'],'qty':'3','unit_price':price}],'payment_method':'CASH','paid_amount':total,'is_credit':False}
  def post(req,body=payload):return auth+'SELECT public.post_bound_financial_v1('+','.join([q(store),q(req),q(code),'1',q('SALE'),q(json.dumps(body))+'::jsonb',q(json.dumps({'CASH':accounts[code]}))+'::jsonb','NULL',q(json.dumps({'source':'OWNER_CONFIRMED','reference':'LOCAL_SAME_TX_TAX_CAPTURE'}))+'::jsonb'])+')'
  def insert(tag,req,body=payload):return "INSERT INTO test_results SELECT "+q(tag)+","+post(req,body).split('SELECT ',1)[1]+";"
  evidence=q(json.dumps({'source':'OWNER_CONFIRMED','reference':'LOCAL_EXACT_ORIGINAL_TAX_REFUND'}))+'::jsonb'
  unknown,verified=str(uuid.uuid4()),str(uuid.uuid4())
  cmd='BEGIN;CREATE TEMP TABLE test_results(tag text PRIMARY KEY,v jsonb);GRANT ALL ON test_results TO coordinated_client;'
  cmd+="CREATE FUNCTION pg_temp.ck(v boolean,n text) RETURNS void LANGUAGE plpgsql AS $$BEGIN IF v IS DISTINCT FROM true THEN RAISE EXCEPTION 'ASSERTION: %',n;END IF;END$$;"
  cmd+='UPDATE backend_core.settlement_rollout SET enabled=true WHERE organization_id='+q(org)+';UPDATE backend_core.native_financial_rollout SET enabled=true WHERE organization_id='+q(org)+';'
  cmd+=auth+insert('UNKNOWN',unknown)+'RESET ROLE;'
  cmd+="SELECT pg_temp.ck((SELECT v->>'originalTaxEvidence'='NO_VERIFIED_PRODUCER' FROM test_results WHERE tag='UNKNOWN'),'unknown tax not zero');"
  cmd+="SELECT pg_temp.ck(NOT EXISTS(SELECT 1 FROM backend_core.original_sale_evidence WHERE sale_id=(SELECT (v->>'saleId')::uuid FROM test_results WHERE tag='UNKNOWN')),'unknown no refund evidence');"
  cmd+="SELECT pg_temp.ck((SELECT jsonb_array_length(facts->'payments')>0 AND jsonb_array_length(facts->'lines')=1 AND facts#>>'{lines,0,cogs}' IS NOT NULL AND NOT(facts ? 'tax') FROM backend_core.original_sale_posting_facts WHERE request_id="+q(unknown)+"),'original raw facts preserved without tax inference');"
  def rejected(command,reason):return "RESET ROLE;DO $$DECLARE before bigint:=(SELECT count(*) FROM public.sales);BEGIN BEGIN "+command+";RAISE EXCEPTION 'UNSAFE_ACCEPTED';EXCEPTION WHEN OTHERS THEN IF SQLERRM<>"+q(reason)+" THEN RAISE;END IF;END;IF (SELECT count(*) FROM public.sales)<>before THEN RAISE EXCEPTION 'FAILED_SALE_NOT_ATOMIC';END IF;END$$;"
  refund_unknown="PERFORM public.refund_original_sale_v1("+q(store)+","+q(str(uuid.uuid4()))+",(SELECT (v->>'saleId')::uuid FROM test_results WHERE tag='UNKNOWN'),(SELECT id FROM public.sale_items WHERE sale_id=(SELECT (v->>'saleId')::uuid FROM test_results WHERE tag='UNKNOWN') LIMIT 1),1,false,NULL,"+evidence+")"
  cmd+=auth+rejected(refund_unknown,'VERIFIED_ORIGINAL_EVIDENCE_REQUIRED')+'RESET ROLE;'
  cmd+='INSERT INTO backend_core.test_verified_original_tax VALUES('+q(org)+','+tax+');INSERT INTO backend_core.original_tax_capture_bindings VALUES('+','.join([q(org),q(code),'1',q('POSTING_TEST_ONLY'),q('LOCAL_SYNTHETIC_ORIGINAL_QUOTE_VERIFIED'),'true'])+');'
  cmd+=auth+insert('VERIFIED',verified)+insert('REPLAY',verified)+'RESET ROLE;'
  cmd+="SELECT pg_temp.ck((SELECT v->>'originalTaxEvidence'='CAPTURED' FROM test_results WHERE tag='VERIFIED'),'tax captured at authoritative sale boundary');"
  cmd+="SELECT pg_temp.ck((SELECT v FROM test_results WHERE tag='VERIFIED')=(SELECT v FROM test_results WHERE tag='REPLAY'),'replay exact result');"
  cmd+="SELECT pg_temp.ck((SELECT count(*)=1 FROM backend_core.original_sale_posting_facts WHERE request_id="+q(verified)+"),'posting facts once');"
  cmd+="SELECT pg_temp.ck((SELECT (snapshot#>>'{lines,0,tax}')::numeric="+tax+" FROM backend_core.original_sale_evidence WHERE sale_id=(SELECT (v->>'saleId')::uuid FROM test_results WHERE tag='VERIFIED')),'explicit trusted original tax captured');"
  cmd+=auth+rejected(post(str(uuid.uuid4()),{**payload,'tax':'99999'}).split('SELECT ',1)[1].join(['PERFORM ','']),'CLIENT_TAX_OVERRIDE_NOT_AUTHORITY')+'RESET ROLE;'
  cmd+='UPDATE backend_core.test_verified_original_tax SET tax=999999 WHERE organization_id='+q(org)+';'+auth+rejected('PERFORM '+post(str(uuid.uuid4())).split('SELECT ',1)[1],'NEGATIVE_ORIGINAL_COMPONENT')+'RESET ROLE;UPDATE backend_core.test_verified_original_tax SET tax='+tax+' WHERE organization_id='+q(org)+';'
  cmd+='UPDATE backend_core.original_tax_capture_bindings SET currency_revision=99 WHERE organization_id='+q(org)+';'+auth+rejected('PERFORM '+post(str(uuid.uuid4())).split('SELECT ',1)[1],'ORIGINAL_TAX_BINDING_REVISION_MISMATCH')+'RESET ROLE;UPDATE backend_core.original_tax_capture_bindings SET currency_revision=1 WHERE organization_id='+q(org)+';'
  cmd+="INSERT INTO test_results SELECT 'LINE',jsonb_build_object('lineId',id) FROM public.sale_items WHERE sale_id=(SELECT (v->>'saleId')::uuid FROM test_results WHERE tag='VERIFIED') LIMIT 1;"
  for n in range(3):
   refund="public.refund_original_sale_v1("+q(store)+","+q(str(uuid.uuid4()))+",(SELECT (v->>'saleId')::uuid FROM test_results WHERE tag='VERIFIED'),(SELECT (v->>'lineId')::uuid FROM test_results WHERE tag='LINE'),1,false,NULL,"+evidence+")"
   cmd+=auth+"INSERT INTO test_results SELECT "+q('REFUND'+str(n))+","+refund+";RESET ROLE;"
  cmd+="SELECT pg_temp.ck((SELECT sum((v#>>'{originalSlice,tax}')::numeric)="+tax+" AND sum((v->>'amount')::numeric)="+total+" FROM test_results WHERE tag LIKE 'REFUND%'),'original tax and paid total conserved across partial refunds');"
  cmd+="SELECT pg_temp.ck(NOT EXISTS(SELECT 1 FROM backend_core.settlement_intents WHERE backend_pid=pg_backend_pid() AND transaction_id=txid_current()),'no orphan sale/refund intents');"
  cmd+="SELECT json_build_object('currency',"+q(code)+",'tax',"+q(tax)+",'total',"+q(total)+",'capture',(SELECT v FROM test_results WHERE tag='VERIFIED'));"
  cmd+=('COMMIT;' if code=='KWD' else 'ROLLBACK;')
  result=db.sql(cmd)[1];scenarios.append(json.loads(result.splitlines()[-1]));checks.extend([code+' '+n for n in ['unknown tax captured without fictional zero','unknown original-tax refund fail-closed','raw original line/payment/COGS facts in sale transaction','verified provider captured automatically in canonical writer','retry exactly once','trusted explicit original tax preserved','client tax override rejected','invalid tax evidence rolls back canonical sale','currency revision mismatch rolls back canonical sale','three partial refunds conserve original tax and payment exactly','no orphan intents']])
 before_facts=db.sql("SELECT md5(string_agg(facts::text,'' ORDER BY sale_id)) FROM backend_core.original_sale_posting_facts")[1]
 db.sql((E/'1917-DISABLE.sql').read_text())
 ck('deny-only disable preserves immutable original posting facts',db.sql("SELECT md5(string_agg(facts::text,'' ORDER BY sale_id)) FROM backend_core.original_sale_posting_facts")[1]==before_facts)
 ck('disable revokes application dispatcher execution',db.sql("SELECT NOT has_function_privilege('coordinated_client','public.post_bound_financial_v1(uuid,uuid,text,integer,text,jsonb,jsonb,uuid,jsonb)','EXECUTE')")[1]=='t')
 (E/'SALE-TAX-CAPTURE-RESULTS.json').write_text(json.dumps({'status':'PASS','count':len(checks),'checks':checks,'scenarios':scenarios,'migrationSha256':hashlib.sha256(migration.read_bytes()).hexdigest(),'scope':'Actual canonical sale/payment/refund writers in independent disposable clone. Explicit synthetic private tax authority only. No actual Production tax calculator certified; missing authority remains unknown and refund-denied.','productionWrites':False},indent=2));print(json.dumps({'status':'PASS','count':len(checks)}))
except Exception:
 raise
finally:
 if db.PORT:db.tool('pg_ctl',['-D',str(db.CLUSTER),'-m','fast','-w','stop'])
