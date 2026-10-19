from pathlib import Path
import sys,json
sys.dont_write_bytecode=True;sys.path.insert(0,str(Path('engineering/currency-onboarding-20261018').resolve()));import local as l
E=Path(__file__).resolve().parent;N=E.parent/'native-financial-contracts-20261019';l.E=N;l.CLUSTER=N/'disposable-native-v2'
try:
 l.PORT=l.start();cols=l.sql("SELECT json_agg(json_build_object('column',column_name,'type',data_type,'generated',is_generated,'expression',generation_expression)) FROM information_schema.columns WHERE table_schema='public' AND table_name='inbound_stock_items'")[1];deps=l.sql("SELECT coalesce(json_agg(DISTINCT v.oid::regclass::text),'[]') FROM pg_depend d JOIN pg_rewrite r ON r.oid=d.objid JOIN pg_class v ON v.oid=r.ev_class WHERE d.refobjid='public.inbound_stock_items'::regclass AND v.relkind IN ('v','m')")[1];(E/'INBOUND-TYPE-DEPENDENCIES.json').write_text(json.dumps({'columns':json.loads(cols),'views':json.loads(deps)},indent=2));print('Inbound type dependencies captured')
finally:
 if l.PORT:l.tool('pg_ctl',['-D',str(l.CLUSTER),'-m','fast','-w','stop'])
