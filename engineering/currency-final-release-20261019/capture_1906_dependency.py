from pathlib import Path
import sys,json
sys.dont_write_bytecode=True;sys.path.insert(0,str(Path('engineering/currency-onboarding-20261018').resolve()));import local as l
E=Path(__file__).resolve().parent;N=E.parent/'native-financial-contracts-20261019';l.E=N;l.CLUSTER=N/'disposable-final-install'
try:
 l.PORT=l.start();data=json.loads(l.sql("SELECT json_build_object('captureMd5',md5(replace(pg_get_functiondef('backend_core.capture_financial_currency_v1()'::regprocedure),chr(13),'')),'operationConstraint',(SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid='backend_core.native_financial_requests'::regclass AND conname='native_financial_requests_operation_check'))")[1]);(E/'1906-DEPENDENCY.json').write_text(json.dumps(data,indent=2));print('Captured exact local 1905 dependency')
finally:
 if l.PORT:l.tool('pg_ctl',['-D',str(l.CLUSTER),'-m','fast','-w','stop'])
