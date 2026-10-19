from pathlib import Path
import sys,json
sys.dont_write_bytecode=True;sys.path.insert(0,str(Path('engineering/currency-onboarding-20261018').resolve()));import local as l
E=Path(__file__).resolve().parent;l.E=E;l.CLUSTER=Path('engineering/currency-financial-integration-20261019/disposable-currency-context-v2').resolve()
l.E=l.CLUSTER.parent
try:
 l.PORT=l.start();v=l.sql("SELECT coalesce(json_agg(json_build_object('identity',p.oid::regprocedure::text,'definition',pg_get_functiondef(p.oid),'md5',md5(replace(pg_get_functiondef(p.oid),chr(13),''))) ORDER BY p.proname),'[]') FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE p.prokind='f' AND n.nspname='public' AND (p.proname IN ('create_sale','create_sale_with_payment_v6','create_credit_account_v2','record_credit_sale_v2','create_expense_v2') OR p.proname ~ '(repay|refund|return|close_cashier|cashier.*movement|create_sale_with_payment|record_credit_payment|cashier_shift)' )")[1];rows=json.loads(v)
 for r in rows:(E/(r['identity'].split('(')[0].replace('.','_')+'.sql')).write_text(r['definition'],encoding='utf-8')
 (E/'CAPTURED-CONTRACTS.json').write_text(json.dumps([{'identity':r['identity'],'md5':r['md5']} for r in rows],indent=2));print('\n'.join(r['identity'] for r in rows))
 numeric=json.loads(l.sql("SELECT json_agg(json_build_object('table',table_name,'column',column_name,'precision',numeric_precision,'scale',numeric_scale)) FROM information_schema.columns WHERE table_schema='public' AND table_name IN ('sales','sale_items','sale_payments','credit_ledger_v2','products','cashier_shifts') AND data_type='numeric'")[1]);(E/'NUMERIC-SCALES.json').write_text(json.dumps(numeric,indent=2));print(json.dumps(numeric))
finally:
 if l.PORT:l.tool('pg_ctl',['-D',str(l.CLUSTER),'-m','fast','-w','stop'])
