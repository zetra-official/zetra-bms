from pathlib import Path
import sys,json
sys.dont_write_bytecode=True;sys.path.insert(0,str(Path('engineering/currency-onboarding-20261018').resolve()));import local as l
E=Path(__file__).resolve().parent;N=E.parent/'native-financial-contracts-20261019';l.E=N;l.CLUSTER=N/'disposable-native-v2'
try:
 l.PORT=l.start()
 functions=l.sql("SELECT coalesce(json_agg(json_build_object('identity',p.oid::regprocedure::text,'definition',pg_get_functiondef(p.oid))),'[]') FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE p.prokind='f' AND n.nspname IN ('public','funding_control','funding_canonical','funding_evidence') AND (p.proname ~ '(refund|reversal|tax|settle|supplier.*pay|pay.*supplier)' OR (n.nspname='funding_control' AND p.proname ~ '(post|can|shift|cash|source_ready)'))")[1]
 columns=l.sql("SELECT json_agg(json_build_object('schema',table_schema,'table',table_name,'column',column_name,'type',data_type,'precision',numeric_precision,'scale',numeric_scale)) FROM information_schema.columns WHERE (table_schema='funding_control' AND table_name IN ('accounts','movements')) OR (table_schema='public' AND table_name IN ('credit_ledger_v2','cashier_shifts','business_debts','inbound_stock_orders','inbound_stock_items','stock_movements'))")[1]
 (E/'REMAINING-AUTHORITY-PROOF.json').write_text(json.dumps({'functions':json.loads(functions),'columns':json.loads(columns),'scope':'Verified disposable full-schema metadata only; no remote records or guessed policy.'},indent=2));print('Saved exact settlement/reversal/shift authority evidence')
finally:
 if l.PORT:l.tool('pg_ctl',['-D',str(l.CLUSTER),'-m','fast','-w','stop'])
