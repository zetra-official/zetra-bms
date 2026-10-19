from pathlib import Path
import sys,json
sys.dont_write_bytecode=True;sys.path.insert(0,str(Path('engineering/currency-onboarding-20261018').resolve()));import local as l
E=Path(__file__).resolve().parent;l.E=E.parent/'native-financial-contracts-20261019';l.CLUSTER=l.E/'disposable-native-v2'
try:
 l.PORT=l.start()
 v=l.sql("SELECT json_agg(json_build_object('identity',oid::regprocedure::text,'definition',pg_get_functiondef(oid))) FROM pg_proc WHERE prokind='f' AND pronamespace='public'::regnamespace AND (proname IN('receive_inbound_stock_partial_v1','record_field_expense_v1') OR proname LIKE '%field%purchase%')")[1]
 (E/'CANONICAL-FIELD-RECEIPT.json').write_text(json.dumps(json.loads(v),indent=2));print('Local canonical receipt definitions captured')
finally:
 if l.PORT:l.tool('pg_ctl',['-D',str(l.CLUSTER),'-m','fast','-w','stop'])
