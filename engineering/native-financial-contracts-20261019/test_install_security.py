from pathlib import Path
import sys,json,hashlib
sys.dont_write_bytecode=True;sys.path.insert(0,str(Path('engineering/currency-onboarding-20261018').resolve()));import local as l
E=Path(__file__).resolve().parent;l.E=E;l.CLUSTER=E/'disposable-final-install';checks=[]
read=lambda s:l.sql(s)[1]
def ck(n,v):assert v,n;checks.append(n)
def facts():return read("SELECT json_build_object('sales',(SELECT md5(coalesce(string_agg(to_jsonb(t)::text,'' ORDER BY id),'')) FROM public.sales t),'stock',(SELECT md5(coalesce(string_agg(to_jsonb(t)::text,'' ORDER BY id),'')) FROM public.inventory t))")
try:
 l.PORT=l.start()
 l.sql((E.parent/'currency-financial-integration-20261019/2026101904-financial-currency-context.DRAFT.sql').read_text(encoding='utf-8-sig'))
 # Column additions change row JSON shape; compare exact financial data after 1904
 # and before 1905 with new metadata excluded.
 stable="SELECT md5(coalesce(string_agg((to_jsonb(t)-'currency_context'-'settlement_rounding')::text,'' ORDER BY id),'')) FROM public.sales t"
 original=read(stable);p=E/'2026101905-native-settlement-atomic.DRAFT.sql';digest=hashlib.sha256(p.read_bytes()).hexdigest();ck('exact final draft checksum',digest==(E/'1905-SHA256.txt').read_text())
 l.sql(p.read_text());ck('final full migration installs atomically',read("SELECT to_regprocedure('public.get_native_sale_result_v1(uuid,uuid)') IS NOT NULL")=='t')
 ck('historical financial values unchanged',read(stable)==original)
 ck('rollout starts empty',read('SELECT count(*) FROM backend_core.native_financial_rollout')=='0')
 funcs=json.loads(read("SELECT json_agg(p.oid::regprocedure::text) FROM pg_proc p WHERE proname IN ('create_native_sale_v1','repay_native_credit_v1','native_cashier_shift_v1','get_native_sale_result_v1')"))
 matrix={}
 for role in ['anon','authenticated','service_role','coordinated_client']:
  matrix[role]={}
  for f in funcs:
   denied=read("SELECT NOT has_function_privilege('"+role+"','"+f+"','EXECUTE')")=='t';matrix[role][f]='DENIED' if denied else 'ALLOWED';ck(role+' denied '+f,denied)
 ck('PUBLIC and inherited grants cannot bypass quarantine',read("SELECT count(*)=0 FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.proname IN ('create_native_sale_v1','repay_native_credit_v1','native_cashier_shift_v1','get_native_sale_result_v1') AND a.grantee<>p.proowner")=='t')
 ck('private rollout intents receipts FORCE RLS',read("SELECT bool_and(relrowsecurity AND relforcerowsecurity) FROM pg_class WHERE oid IN ('backend_core.native_financial_rollout'::regclass,'backend_core.native_financial_intents'::regclass,'backend_core.native_financial_requests'::regclass)")=='t')
 ck('no client policy on private receipts',read("SELECT count(*)=0 FROM pg_policy WHERE polrelid='backend_core.native_financial_requests'::regclass")=='t')
 ck('administrative ownership preserved',read("SELECT bool_and(pg_get_userbyid(proowner)='postgres') FROM pg_proc WHERE proname IN ('create_native_sale_v1','repay_native_credit_v1','native_cashier_shift_v1','get_native_sale_result_v1')")=='t')
 ck('duplicate migration fails without partial change',l.sql(p.read_text(),False)[0]!=0 and read(stable)==original)
 l.sql((E/'1905-DISABLE-ROLLBACK.sql').read_text());ck('disable rollback preserves historical values',read(stable)==original)
 (E/'INSTALL-SECURITY-RESULTS.json').write_text(json.dumps({'status':'PASS','count':len(checks),'checks':checks,'rpcMatrix':matrix,'sha256':digest,'scope':'Fresh disposable full-schema installation of exact 1904 then final1905, security and disable rollback. No remote access.'},indent=2));print('PASS '+str(len(checks)))
finally:
 if l.PORT:l.tool('pg_ctl',['-D',str(l.CLUSTER),'-m','fast','-w','stop'])

