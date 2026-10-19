"""Delta security/legacy checks on the already-passed stopped1917 local clone."""
from pathlib import Path
import sys,json,uuid,hashlib
sys.dont_write_bytecode=True;sys.path.insert(0,str(Path('engineering/currency-onboarding-20261018').resolve()));import local as db
E=Path(__file__).resolve().parent;N=E.parent/'native-financial-contracts-20261019'
db.E=N/'disposable-tax-capture-1c3592b1-8a13-4b02-ae8a-3326baba11d5';db.CLUSTER=db.E/'cluster'
assert db.E.resolve().parent==N.resolve() and not(db.CLUSTER/'postmaster.pid').exists()
q=lambda s:"'"+str(s).replace("'","''")+"'";checks=[]
def ck(n,v):assert v,n;checks.append(n)
try:
 db.PORT=db.start();assert Path(db.sql("SELECT current_setting('data_directory')")[1]).resolve()==db.CLUSTER.resolve()
 ck('passed fixture contains two immutable new-sale snapshots',db.sql('SELECT count(*) FROM backend_core.original_sale_posting_facts')[1]=='2')
 for table in ['original_sale_creation_proofs','original_tax_capture_bindings','original_sale_posting_facts']:
  ck(table+' FORCE RLS',db.sql('SELECT relrowsecurity AND relforcerowsecurity FROM pg_class WHERE oid='+q('backend_core.'+table)+'::regclass')[1]=='t')
  for role in ['anon','authenticated','service_role','coordinated_client']:
   ck(table+' denies '+role,db.sql('SELECT NOT has_table_privilege('+q(role)+','+q('backend_core.'+table)+",'SELECT,INSERT,UPDATE,DELETE')")[1]=='t')
 for name in ['record_original_sale_creation_v1','sale_created_in_current_posting_v1','capture_bound_sale_posting_facts_v1']:
  ck(name+' no nonowner execution',db.sql("SELECT count(*)=0 FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.proname="+q(name)+' AND a.grantee<>p.proowner')[1]=='t')
 sale=db.sql('SELECT sale_id FROM backend_core.original_sale_posting_facts LIMIT 1')[1]
 owner=str(uuid.uuid5(uuid.NAMESPACE_URL,'zetra-normal-proforma-1'));claims='SET request.jwt.claims='+q(json.dumps({'sub':owner}))+';'
 ck('committed sale creation proof cannot authorize later capture',db.sql(claims+'SELECT backend_core.sale_created_in_current_posting_v1('+q(sale)+')')[1]=='f')
 denied=db.sql(claims+'SELECT backend_core.capture_bound_sale_posting_facts_v1('+q(sale)+')',False)
 ck('new hook refuses historical capture',denied[0]!=0 and 'ORIGINAL_SALE_TRANSACTION_REQUIRED' in denied[2])
 denied=db.sql(claims+'SELECT backend_core.capture_original_sale_evidence_v1('+q(sale)+",'POSTING_TEST_ONLY')",False)
 ck('1913 hook still refuses historical backfill',denied[0]!=0 and 'ORIGINAL_EVIDENCE_MUST_BE_CAPTURED_IN_SALE_TRANSACTION' in denied[2])
 for table in ['original_sale_creation_proofs','original_sale_posting_facts']:
  ck(table+' immutable even for privileged accidental update',db.sql('UPDATE backend_core.'+table+' SET sale_id=sale_id',False)[0]!=0)
 s=next(s for s in json.loads((N/'NATIVE-RESULTS.json').read_text())['scenarios'] if s['currency']=='TZS')
 proof_count=db.sql('SELECT count(*) FROM backend_core.original_sale_creation_proofs')[1]
 request=str(uuid.uuid4());payload=json.dumps([{'product_id':s['productId'],'qty':1,'unit_price':12}])
 command='BEGIN;'+claims+'GRANT EXECUTE ON FUNCTION public.create_sale_with_payment_v6(uuid,jsonb,text,text,numeric,text,text,uuid,text,text,text,numeric,text,uuid,uuid,uuid) TO coordinated_client;SET ROLE coordinated_client;SELECT sale_id FROM public.create_sale_with_payment_v6(p_store_id:='+q(s['storeId'])+',p_items:='+q(payload)+'::jsonb,p_paid_amount:=12,p_client_sale_id:='+q(request)+');RESET ROLE;SELECT count(*) FROM backend_core.original_sale_creation_proofs;ROLLBACK;'
 result=db.sql(command)[1].splitlines();ck('legacy TZS v6 sale unchanged and no fictional tax proof created',len(result)==2 and result[-1]==proof_count)
 (E/'SALE-TAX-CAPTURE-SECURITY-RESULTS.json').write_text(json.dumps({'status':'PASS','count':len(checks),'checks':checks,'migrationSha256':hashlib.sha256((E/'2026101917-atomic-sale-tax-capture.DRAFT.sql').read_bytes()).hexdigest(),'scope':'Additional local1917 RLS/ACL, immutable creation proof, anti-backfill and actual legacyTZS v6 rollback-only compatibility. Synthetic Auth; no Production changes.','productionWrites':False},indent=2));print(json.dumps({'status':'PASS','count':len(checks)}))
finally:
 if db.PORT:db.tool('pg_ctl',['-D',str(db.CLUSTER),'-m','fast','-w','stop'])
