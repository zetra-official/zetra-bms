from pathlib import Path
import sys,json
sys.dont_write_bytecode=True;sys.path.insert(0,str(Path('engineering/currency-onboarding-20261018').resolve()));import local as l
E=Path(__file__).resolve().parent;l.E=E;l.CLUSTER=E/'disposable-currency-context-v2';read=lambda s:l.sql(s)[1]
try:
 l.PORT=l.start();snap=read("SELECT md5(coalesce(string_agg(to_jsonb(s)::text,'' ORDER BY id),'')) FROM public.sales s");payments=read("SELECT md5(coalesce(string_agg(to_jsonb(s)::text,'' ORDER BY id),'')) FROM public.sale_payments s");expense=read("SELECT md5(coalesce(string_agg(to_jsonb(s)::text,'' ORDER BY id),'')) FROM public.expenses s")
 l.sql((E/'2026101904-ROLLBACK-PRESERVE-CONTEXT.sql').read_text(encoding='utf-8-sig'))
 checks={'rollbackPreservesNewSalesAndSnapshots':read("SELECT md5(coalesce(string_agg(to_jsonb(s)::text,'' ORDER BY id),'')) FROM public.sales s")==snap,'rollbackPreservesPayments':read("SELECT md5(coalesce(string_agg(to_jsonb(s)::text,'' ORDER BY id),'')) FROM public.sale_payments s")==payments,'rollbackPreservesExpenses':read("SELECT md5(coalesce(string_agg(to_jsonb(s)::text,'' ORDER BY id),'')) FROM public.expenses s")==expense,'noNewCaptureTriggers':read("SELECT count(*) FROM pg_trigger WHERE tgname='financial_currency_context_v1'")=='0','columnsRetained':read("SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name IN ('sales','sale_payments','expenses') AND column_name='currency_context'")=='3'}
 assert all(checks.values());(E/'ROLLBACK-RESULTS.json').write_text(json.dumps({'status':'PASS','checks':checks,'scope':'Disposable synthetic schema only; no backup restore or remote writes'},indent=2));print('PASS rollback preserves captured financial facts')
finally:
 if l.PORT:l.tool('pg_ctl',['-D',str(l.CLUSTER),'-m','fast','-w','stop'])
