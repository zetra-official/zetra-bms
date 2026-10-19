from pathlib import Path
import sys,json
sys.dont_write_bytecode=True
sys.path.insert(0,str(Path('engineering/currency-onboarding-20261018').resolve()))
import local as l
E=Path(__file__).resolve().parent
l.E=E.parent/'native-financial-contracts-20261019'
l.CLUSTER=l.E/'disposable-native-v2'
try:
 l.PORT=l.start()
 tables="('sales','sale_items','sale_payments','inventory','stock_movements','inventory_movements','field_wallets','field_wallet_transactions','advances','movements','custody_links','wallet_units','settlement_bindings')"
 v=l.sql("SELECT json_build_object('columns',(SELECT json_agg(json_build_object('schema',table_schema,'table',table_name,'column',column_name,'type',data_type,'default',column_default)) FROM information_schema.columns WHERE table_name IN "+tables+" AND table_schema IN ('public','stock_funding','funding_control','funding_evidence','backend_core')),'constraints',(SELECT json_agg(json_build_object('table',conrelid::regclass::text,'definition',pg_get_constraintdef(oid))) FROM pg_constraint WHERE conrelid IN(SELECT c.oid FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relname IN "+tables+" AND n.nspname IN ('public','stock_funding','funding_control','funding_evidence','backend_core'))),'functions',(SELECT json_agg(json_build_object('identity',p.oid::regprocedure::text,'definition',pg_get_functiondef(p.oid))) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE p.prokind='f' AND (n.nspname IN ('funding_control','funding_evidence','funding_canonical','stock_funding') OR n.nspname='public' AND p.proname ~ '(field.*wallet|wallet.*field|field.*receipt|field.*purchase|inventory.*movement|stock.*movement)')))")[1]
 (E/'FINAL-CONTRACT-METADATA.json').write_text(json.dumps(json.loads(v),indent=2))
 v=l.sql("SELECT json_build_object('triggers',(SELECT json_agg(json_build_object('table',tgrelid::regclass::text,'definition',pg_get_triggerdef(oid),'function',pg_get_functiondef(tgfoid))) FROM pg_trigger WHERE NOT tgisinternal AND tgrelid IN('public.stock_movements'::regclass,'public.inventory'::regclass,'public.field_wallets'::regclass,'public.field_wallet_transactions'::regclass)),'functions',(SELECT json_agg(json_build_object('identity',p.oid::regprocedure::text,'definition',pg_get_functiondef(p.oid),'md5',md5(replace(pg_get_functiondef(p.oid),chr(13),'')))) FROM pg_proc p WHERE p.oid IN('backend_core.canonical_settlement_fact_v1(text,uuid)'::regprocedure,'backend_core.bind_canonical_settlement_v1(text,uuid,uuid,uuid,jsonb)'::regprocedure)))")[1]
 (E/'FINAL-WRITER-DEPENDENCIES.json').write_text(json.dumps(json.loads(v),indent=2))
 print('Local metadata captured; no customer rows')
finally:
 if l.PORT:l.tool('pg_ctl',['-D',str(l.CLUSTER),'-m','fast','-w','stop'])
