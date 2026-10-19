from pathlib import Path
import sys,json,hashlib
sys.dont_write_bytecode=True;sys.path.insert(0,str(Path('engineering/currency-onboarding-20261018').resolve()));import local as l
E=Path(__file__).resolve().parent;N=E.parent/'native-financial-contracts-20261019';l.E=N;l.CLUSTER=N/'disposable-native-v2'
try:
 l.PORT=l.start();rows=json.loads(l.sql("SELECT json_agg(json_build_object('identity',p.oid::regprocedure::text,'definition',pg_get_functiondef(p.oid),'acl',p.proacl,'owner',pg_get_userbyid(p.proowner))) FROM pg_proc p WHERE p.proname IN ('create_native_sale_v1','repay_native_credit_v1','native_cashier_shift_v1','create_native_expense_v1')")[1]);(E/'1908-GATEWAY-PREIMAGES.json').write_text(json.dumps(rows,indent=2));print('Captured four quarantined transaction intent gateways')
finally:
 if l.PORT:l.tool('pg_ctl',['-D',str(l.CLUSTER),'-m','fast','-w','stop'])
