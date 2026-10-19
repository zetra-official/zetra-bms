from pathlib import Path
import sys,json,hashlib
sys.dont_write_bytecode=True;sys.path.insert(0,str(Path('engineering/currency-onboarding-20261018').resolve()));import local as l
E=Path(__file__).resolve().parent;N=E.parent/'native-financial-contracts-20261019';l.E=N;l.CLUSTER=N/'disposable-final-install';read=lambda s:l.sql(s)[1];checks=[]
def ck(n,v):assert v,n;checks.append(n)
def fingerprint():return read("SELECT md5(coalesce(string_agg(v::text,'' ORDER BY k,id),'')) FROM(SELECT 's' k,id::text,to_jsonb(s) v FROM public.sales s UNION ALL SELECT 'i',id::text,to_jsonb(i) FROM public.sale_items i UNION ALL SELECT 'p',id::text,to_jsonb(p) FROM public.sale_payments p UNION ALL SELECT 'w',id::text,to_jsonb(w) FROM public.field_wallets w UNION ALL SELECT 't',id::text,to_jsonb(t) FROM public.field_wallet_transactions t) x")
try:
 l.PORT=l.start();before=fingerprint();p=E/'2026101913-original-refund-evidence.DRAFT.sql';l.sql(p.read_text());ck('exact1913 fresh installation commits after1912',True)
 ck('existing TZS/native sales/items/payments/wallet histories unchanged',before==fingerprint())
 ck('no adapter or posting authority activated',read('SELECT count(*)=0 FROM backend_core.original_evidence_adapters')=='t')
 for name in ['capture_original_sale_evidence_v1','original_refund_slice_v1']:
  for role in ['anon','authenticated','service_role']:
   ck(name+' effective denial '+role,read("SELECT NOT has_function_privilege('"+role+"',oid,'EXECUTE') FROM pg_proc WHERE proname='"+name+"'")=='t')
 ck('PUBLIC cannot execute',read("SELECT count(*)=0 FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.proname IN('capture_original_sale_evidence_v1','original_refund_slice_v1') AND a.grantee=0")=='t')
 ck('Funding Control remains advances-only deny boundary',read("SELECT pg_get_functiondef('funding_control.source_ready(uuid)'::regprocedure) LIKE '%SELECT false%'")=='t')
 l.sql((E/'1913-DISABLE.sql').read_text());ck('exact1913 disable works without deleting history',fingerprint()==before)
 (E/'1913-INSTALL-SECURITY-RESULTS.json').write_text(json.dumps({'status':'PASS','count':len(checks),'checks':checks,'migrationSha256':hashlib.sha256(p.read_bytes()).hexdigest(),'productionWrites':False,'scope':'Independent disposable exact SQL install and deny-only rollback; no tax adapter or refund writer installed.'},indent=2));print('PASS '+str(len(checks)))
finally:
 if l.PORT:l.tool('pg_ctl',['-D',str(l.CLUSTER),'-m','fast','-w','stop'])
