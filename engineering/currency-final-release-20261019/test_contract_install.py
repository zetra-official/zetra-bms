from pathlib import Path
import sys,json,hashlib
sys.dont_write_bytecode=True;sys.path.insert(0,str(Path('engineering/currency-onboarding-20261018').resolve()));import local as l
E=Path(__file__).resolve().parent;N=E.parent/'native-financial-contracts-20261019';l.E=N;l.CLUSTER=N/'disposable-final-install';read=lambda s:l.sql(s)[1];checks=[]
def ck(n,v):assert v,n;checks.append(n)
def footprint():return read("SELECT md5(coalesce(string_agg(v::text,'' ORDER BY k,id),'')) FROM (SELECT 'sale' k,id::text,to_jsonb(s) v FROM public.sales s UNION ALL SELECT 'payment',id::text,to_jsonb(p) FROM public.sale_payments p UNION ALL SELECT 'inventory',store_id::text||':'||product_id::text,to_jsonb(i) FROM public.inventory i UNION ALL SELECT 'expense',id::text,to_jsonb(e) FROM public.expenses e UNION ALL SELECT 'inbound',id::text,to_jsonb(o) FROM public.inbound_stock_orders o UNION ALL SELECT 'debt',id::text,to_jsonb(d) FROM public.business_debts d) x")
try:
 l.PORT=l.start();before=footprint()
 for name in ['2026101910-private-settlement-bindings.DRAFT.sql','2026101911-private-procurement-bindings.DRAFT.sql','2026101912-private-cashier-bindings.DRAFT.sql']:l.sql((E/name).read_text());ck(name+' independently commits after exact dependencies',True)
 ck('all sampled historical financial records unchanged',footprint()==before)
 names=['confirm_settlement_account_v1','authorize_settlement_actor_v1','post_bound_financial_v1','read_bound_account_balance_v1','read_bound_shift_reconciliation_v1','original_refund_readiness_v1','open_bound_cashier_shift_v1','close_bound_cashier_shift_v1','get_bound_financial_result_v1']
 for name in names:
  for role in ['anon','authenticated','service_role']:
   ck(name+' effective denial for '+role,read("SELECT NOT has_function_privilege('"+role+"',oid,'EXECUTE') FROM pg_proc WHERE proname='"+name+"'")=='t')
 ck('new private tables FORCE RLS',read("SELECT count(*)=11 AND bool_and(relrowsecurity AND relforcerowsecurity) FROM pg_class WHERE relnamespace='backend_core'::regnamespace AND relname IN ('settlement_rollout','settlement_accounts','settlement_account_permissions','settlement_intents','settlement_requests','settlement_bindings','settlement_audit','receipt_debt_bindings','supplier_payment_bindings','shift_account_bindings','shift_reconciliation_evidence')")=='t')
 ck('no financial rollout enabled by installation',read('SELECT NOT EXISTS(SELECT 1 FROM backend_core.settlement_rollout WHERE enabled) AND NOT EXISTS(SELECT 1 FROM backend_core.native_financial_rollout WHERE enabled)')=='t')
 ck('Funding Control remains deny-only advances authority',read("SELECT pg_get_functiondef('funding_control.source_ready(uuid)'::regprocedure) LIKE '%SELECT false%'")=='t')
 l.sql((E/'1910-1912-DISABLE.sql').read_text());ck('exact consolidated disable succeeds',True);ck('disable retains historical financial records',footprint()==before)
 ck('disable retains provenance and reconciliation tables',read("SELECT to_regclass('backend_core.settlement_bindings') IS NOT NULL AND to_regclass('backend_core.shift_reconciliation_evidence') IS NOT NULL")=='t')
 (E/'CONTRACT-INSTALL-RESULTS.json').write_text(json.dumps({'status':'PASS','count':len(checks),'checks':checks,'scope':'Exact1910-1912 independent disposable full-schema install, effective API privileges, historical record fingerprint and deny-only rollback. No Production changes.'},indent=2));print('PASS '+str(len(checks)))
finally:
 if l.PORT:l.tool('pg_ctl',['-D',str(l.CLUSTER),'-m','fast','-w','stop'])
