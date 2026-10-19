from pathlib import Path
import sys,json
sys.dont_write_bytecode=True;sys.path.insert(0,str(Path('engineering/currency-onboarding-20261018').resolve()));import local as l
E=Path(__file__).resolve().parent;N=E.parent/'native-financial-contracts-20261019';l.E=N;l.CLUSTER=N/'disposable-final-install';checks=[]
read=lambda s:l.sql(s)[1]
def ck(n,v):assert v,n;checks.append(n)
try:
 l.PORT=l.start();sql=(E/'2026101906-native-expense-integrity.DRAFT.sql').read_text();l.sql(sql)
 for role in ['anon','authenticated','service_role','coordinated_client']:
  ck(role+' cannot execute final native expense',read("SELECT NOT has_function_privilege('"+role+"','public.create_native_expense_v1(uuid,uuid,text,integer,jsonb)','EXECUTE')")=='t')
 ck('no nonowner/default grant to new expense helpers',read("SELECT count(*)=0 FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.proname IN ('create_native_expense_v1','protect_native_expense_v1') AND a.grantee<>p.proowner")=='t')
 ck('repeat migration rejected by precise dependency guard',l.sql(sql,False)[0]!=0)
 ck('default rollout remains disabled',read('SELECT NOT EXISTS(SELECT 1 FROM backend_core.native_financial_rollout WHERE enabled)')=='t')
 (E/'FINAL-INSTALL-RESULTS.json').write_text(json.dumps({'status':'PASS','count':len(checks),'checks':checks,'scope':'Exact final1906 installs on verified local1904/1905; atomic repeated-install refusal; no Production access.'},indent=2));print('PASS '+str(len(checks)))
finally:
 if l.PORT:l.tool('pg_ctl',['-D',str(l.CLUSTER),'-m','fast','-w','stop'])
