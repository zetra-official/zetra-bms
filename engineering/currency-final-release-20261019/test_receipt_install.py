from pathlib import Path
import sys,json,hashlib
sys.dont_write_bytecode=True;sys.path.insert(0,str(Path('engineering/currency-onboarding-20261018').resolve()));import local as l
E=Path(__file__).resolve().parent;N=E.parent/'native-financial-contracts-20261019';l.E=N;l.CLUSTER=N/'disposable-final-install';read=lambda s:l.sql(s)[1];checks=[]
def ck(n,v):assert v,n;checks.append(n)
try:
 l.PORT=l.start();before=read('SELECT json_build_array((SELECT count(*) FROM public.sales),(SELECT count(*) FROM public.sale_payments),(SELECT count(*) FROM public.stock_movements))')
 sql=(E/'2026101909-canonical-receipt-integrity.DRAFT.sql').read_text();l.sql(sql)
 ck('exact1909 commits after independently installed1904-1908',read("SELECT to_regclass('backend_core.receipt_cost_snapshots') IS NOT NULL")=='t')
 ck('existing sale/payment/stock counts preserved',read('SELECT json_build_array((SELECT count(*) FROM public.sales),(SELECT count(*) FROM public.sale_payments),(SELECT count(*) FROM public.stock_movements))')==before)
 ck('cost evidence is private FORCE RLS',read("SELECT relrowsecurity AND relforcerowsecurity FROM pg_class WHERE oid='backend_core.receipt_cost_snapshots'::regclass")=='t')
 for role in ['anon','authenticated','service_role','coordinated_client']:ck(role+' new receipt RPC denied',read("SELECT NOT has_function_privilege('"+role+"','public.receive_purchase_once_v1(uuid,uuid,jsonb)','EXECUTE')")=='t')
 ck('all three unsupported native supplier payment writers guarded',read("SELECT count(*)=3 FROM pg_trigger WHERE tgname='unverified_supplier_payment_guard_v1'")=='t')
 ck('no hidden fractional truncation on seven item columns',read("SELECT count(*)=7 FROM information_schema.columns WHERE table_schema='public' AND table_name='inbound_stock_items' AND column_name IN ('qty_ordered','qty_received','damaged_qty','missing_qty','unit_cost','proposed_sell_price','total_cost') AND numeric_scale IS NULL")=='t')
 ck('repeated migration rejects unexpected preimage atomically',l.sql(sql,False)[0]!=0)
 l.sql((E/'1906-DISABLE.sql').read_text());l.sql((N/'1905-DISABLE-ROLLBACK.sql').read_text())
 ck('disable retains private evidence and native denial triggers',read("SELECT to_regclass('backend_core.receipt_cost_snapshots') IS NOT NULL AND (SELECT count(*)=3 FROM pg_trigger WHERE tgname='unverified_supplier_payment_guard_v1')")=='t')
 ck('rollback/disable preserves business rows',read('SELECT json_build_array((SELECT count(*) FROM public.sales),(SELECT count(*) FROM public.sale_payments),(SELECT count(*) FROM public.stock_movements))')==before)
 (E/'RECEIPT-INSTALL-RESULTS.json').write_text(json.dumps({'status':'PASS','count':len(checks),'checks':checks,'migrationSha256':hashlib.sha256((E/'2026101909-canonical-receipt-integrity.DRAFT.sql').read_bytes()).hexdigest(),'scope':'Disposable full-schema PostgreSQL only.'},indent=2));print('PASS '+str(len(checks)))
finally:
 if l.PORT:l.tool('pg_ctl',['-D',str(l.CLUSTER),'-m','fast','-w','stop'])
