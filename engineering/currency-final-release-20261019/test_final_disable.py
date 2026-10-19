from pathlib import Path
import sys,json
sys.dont_write_bytecode=True;sys.path.insert(0,str(Path('engineering/currency-onboarding-20261018').resolve()));import local as l
E=Path(__file__).resolve().parent;N=E.parent/'native-financial-contracts-20261019';l.E=N;l.CLUSTER=N/'disposable-final-install';checks=[];read=lambda s:l.sql(s)[1]
try:
 l.PORT=l.start();before=read('SELECT json_build_array((SELECT count(*) FROM public.sales),(SELECT count(*) FROM public.stock_movements),(SELECT count(*) FROM backend_core.receipt_cost_snapshots))')
 l.sql((E/'1907-1909-DISABLE.sql').read_text());checks.append('exact final disable SQL commits')
 for name in ['read_original_financial_facts_v1','receive_purchase_once_v1']:
  assert read("SELECT count(*)=0 FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.proname='"+name+"' AND a.grantee<>p.proowner")=='t';checks.append(name+' no nonowner execute')
 assert read('SELECT json_build_array((SELECT count(*) FROM public.sales),(SELECT count(*) FROM public.stock_movements),(SELECT count(*) FROM backend_core.receipt_cost_snapshots))')==before;checks.append('original financial and provenance row counts retained')
 assert read("SELECT count(*)=15 FROM pg_trigger WHERE tgname IN ('native_unverified_writer_guard_v1','unverified_supplier_payment_guard_v1')")=='t';checks.append('all native deny boundaries retained')
 (E/'FINAL-DISABLE-RESULTS.json').write_text(json.dumps({'status':'PASS','count':len(checks),'checks':checks},indent=2));print('PASS '+str(len(checks)))
finally:
 if l.PORT:l.tool('pg_ctl',['-D',str(l.CLUSTER),'-m','fast','-w','stop'])
