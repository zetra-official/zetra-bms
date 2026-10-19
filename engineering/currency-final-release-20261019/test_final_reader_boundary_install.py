from pathlib import Path
import sys,json
sys.dont_write_bytecode=True;sys.path.insert(0,str(Path('engineering/currency-onboarding-20261018').resolve()));import local as l
E=Path(__file__).resolve().parent;N=E.parent/'native-financial-contracts-20261019';l.E=N;l.CLUSTER=N/'disposable-final-install';read=lambda s:l.sql(s)[1];checks=[]
def ck(n,v):assert v,n;checks.append(n)
try:
 l.PORT=l.start();before=read('SELECT count(*) FROM public.sales');l.sql((E/'2026101907-original-financial-readers.DRAFT.sql').read_text());l.sql((E/'2026101908-native-writer-quarantine.DRAFT.sql').read_text())
 ck('exact final1907 then1908 commits on independently installed1904-1906',read("SELECT to_regprocedure('backend_core.native_unverified_writer_guard_v1()') IS NOT NULL")=='t')
 ck('no historical sale rows rewritten/deleted',read('SELECT count(*) FROM public.sales')==before)
 for name in ['read_original_financial_facts_v1','create_native_sale_v1','repay_native_credit_v1','native_cashier_shift_v1','create_native_expense_v1','native_unverified_writer_guard_v1']:
  ck(name+' has no nonowner ACL',read("SELECT count(*)=0 FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.proname='"+name+"' AND a.grantee<>p.proowner")=='t')
 ck('deny-only native boundary guards attached to all12 tables',read("SELECT count(*) FROM pg_trigger WHERE tgname='native_unverified_writer_guard_v1'")=='12')
 ck('private operation tags constrained',read("SELECT count(*) FROM information_schema.columns WHERE table_schema='backend_core' AND table_name='native_financial_intents' AND column_name='operation'")=='1')
 ck('repeated final1908 fails atomically instead of overriding drift',l.sql((E/'2026101908-native-writer-quarantine.DRAFT.sql').read_text(),False)[0]!=0)
 l.sql((E/'1906-DISABLE.sql').read_text());l.sql((N/'1905-DISABLE-ROLLBACK.sql').read_text());ck('rollback keeps security boundaries and historical facts',read("SELECT count(*) FROM pg_trigger WHERE tgname='native_unverified_writer_guard_v1'")=='12' and read('SELECT count(*) FROM public.sales')==before)
 (E/'FINAL-READER-BOUNDARY-INSTALL.json').write_text(json.dumps({'status':'PASS','count':len(checks),'checks':checks,'scope':'Exact final1907/1908 installed independently; no API activation. Local only.'},indent=2));print('PASS '+str(len(checks)))
finally:
 if l.PORT:l.tool('pg_ctl',['-D',str(l.CLUSTER),'-m','fast','-w','stop'])
