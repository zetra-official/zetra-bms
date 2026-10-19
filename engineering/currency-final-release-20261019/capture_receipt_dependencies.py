from pathlib import Path
import sys,json
sys.dont_write_bytecode=True;sys.path.insert(0,str(Path('engineering/currency-onboarding-20261018').resolve()));import local as l
E=Path(__file__).resolve().parent;N=E.parent/'native-financial-contracts-20261019';l.E=N;l.CLUSTER=N/'disposable-native-v2'
try:
 l.PORT=l.start();result=l.sql("SELECT coalesce(json_agg(json_build_object('table',t.tgrelid::regclass::text,'trigger',pg_get_triggerdef(t.oid),'definition',pg_get_functiondef(t.tgfoid))),'[]') FROM pg_trigger t WHERE NOT t.tgisinternal AND t.tgrelid IN ('public.inventory'::regclass,'public.stock_movements'::regclass,'public.inbound_stock_orders'::regclass,'public.inbound_stock_items'::regclass,'public.business_debts'::regclass)")[1];(E/'RECEIPT-DEPENDENCIES.json').write_text(json.dumps(json.loads(result),indent=2));print('\n'.join(x['table']+': '+x['trigger'] for x in json.loads(result)))
finally:
 if l.PORT:l.tool('pg_ctl',['-D',str(l.CLUSTER),'-m','fast','-w','stop'])
