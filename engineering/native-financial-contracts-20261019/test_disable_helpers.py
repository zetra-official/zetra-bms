from pathlib import Path
import sys,json
sys.dont_write_bytecode=True;sys.path.insert(0,str(Path('engineering/currency-onboarding-20261018').resolve()));import local as l
E=Path(__file__).resolve().parent;l.E=E;l.CLUSTER=E/'disposable-final-install'
try:
 l.PORT=l.start();l.sql('GRANT EXECUTE ON FUNCTION backend_core.bind_native_currency_v1(),backend_core.native_financial_policy_v1(uuid),public.create_native_sale_v1(uuid,uuid,text,integer,jsonb) TO coordinated_client')
 l.sql((E/'1905-DISABLE-ROLLBACK.sql').read_text());checks=[]
 for f in ['backend_core.bind_native_currency_v1()','backend_core.native_financial_policy_v1(uuid)','public.create_native_sale_v1(uuid,uuid,text,integer,jsonb)']:
  assert l.sql("SELECT NOT has_function_privilege('coordinated_client','"+f+"','EXECUTE')")[1]=='t';checks.append('disable removes local test grant '+f)
 (E/'DISABLE-HELPERS-RESULTS.json').write_text(json.dumps({'status':'PASS','count':len(checks),'checks':checks},indent=2));print('PASS '+str(len(checks)))
finally:
 if l.PORT:l.tool('pg_ctl',['-D',str(l.CLUSTER),'-m','fast','-w','stop'])
