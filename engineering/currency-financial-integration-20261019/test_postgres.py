from pathlib import Path
import sys,json,uuid,hashlib
sys.dont_write_bytecode=True;sys.path.insert(0,str(Path('engineering/currency-onboarding-20261018').resolve()));import local as l
E=Path(__file__).resolve().parent;l.E=E;l.CLUSTER=E/'disposable-currency-context-v2';l.env.update(PGPASSFILE=str(E/'NO-CREDENTIALS'),PGSERVICEFILE=str(E/'NO-SERVICES'))
C=[];q=lambda s:"'"+str(s).replace("'","''")+"'";read=lambda s:l.sql(s)[1]
def ck(n,v):assert v,n;C.append(n)
I=lambda n:str(uuid.uuid5(uuid.NAMESPACE_URL,'zetra-normal-proforma-'+str(n)))
a,org,store,product=I(1),I(100),I(200),I(300)
def auth():return 'SET ROLE coordinated_client;SET request.jwt.claims='+q(json.dumps({'sub':a}))+';'
def sale(req=None):return auth()+"SELECT public.create_sale_with_payment_v6(p_store_id:="+q(store)+"::uuid,p_items:="+q(json.dumps([{'product_id':product,'qty':'0.5','unit_price':'12.34'}]))+"::jsonb,p_payment_method:='CASH',p_paid_amount:=6.17,p_client_sale_id:="+q(req or str(uuid.uuid4()))+");"
def fingerprint():return read("SELECT md5(coalesce(string_agg(to_jsonb(s)::text,'' ORDER BY id),'')) FROM public.sales s")
try:
 l.PORT=l.start();ck('disposable local identity',Path(read('SHOW data_directory')).resolve()==l.CLUSTER.resolve())
 ck('synthetic canonical fixture',read('SELECT name ILIKE \'%synthetic%\' FROM public.organizations WHERE id='+q(org))=='t')
 l.sql('ALTER TABLE proforma_backend.accounting_currency DISABLE TRIGGER USER;UPDATE proforma_backend.accounting_currency SET currency=\'TZS\' WHERE organization_id='+q(org)+';ALTER TABLE proforma_backend.accounting_currency ENABLE TRIGGER USER;')
 sql=(E/'2026101904-financial-currency-context.DRAFT.sql').read_text(encoding='utf-8-sig');before=fingerprint()
 # Test actual additive migration transaction failure/rollback before installation.
 l.sql(sql.replace('COMMIT;','ROLLBACK;'))
 ck('migration rollback removes additive columns',read("SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND column_name='currency_context' AND table_name IN ('sales','sale_payments','expenses')")=='0')
 ck('rollback preserves existing financial data',fingerprint()==before)
 l.sql(sql)
 # Added null columns change row shape, so compare preserved fields explicitly.
 ck('historical snapshots remain unknown',read('SELECT count(*) FROM public.sales WHERE currency_context IS NOT NULL')=='0')
 ck('historical original amounts unchanged',read("SELECT md5(coalesce(string_agg((to_jsonb(s)-'currency_context')::text,'' ORDER BY id),'')) FROM public.sales s")==before)
 identity=read("SELECT p.oid::regprocedure::text FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='create_sale_with_payment_v6'");l.sql('GRANT EXECUTE ON FUNCTION '+identity+' TO coordinated_client')
 # Local-only harness grant; existing real RPC, stock and payment triggers remain active.
 l.sql('UPDATE public.inventory SET qty=10000 WHERE store_id='+q(store)+' AND product_id='+q(product))
 ck('existing TZS authority',read('SELECT currency FROM proforma_backend.accounting_currency WHERE organization_id='+q(org))=='TZS')
 req=str(uuid.uuid4());sid=read(sale(req));ck('canonical sale and snapshot commit',read('SELECT currency_context->>\'currency\' FROM public.sales WHERE id='+q(sid))=='TZS')
 ck('canonical fractional amounts stored',read('SELECT sum(paid_amount)=6.17 FROM public.sale_payments WHERE sale_id='+q(sid))=='t')
 ck('payment inherits sale snapshot',read('SELECT bool_and(p.currency_context=s.currency_context) FROM public.sale_payments p JOIN public.sales s ON s.id=p.sale_id WHERE s.id='+q(sid))=='t')
 ck('same request remains idempotent',read(sale(req))==sid)
 ck('snapshot mutation denied',l.sql('UPDATE public.sales SET currency_context=\'{"currency":"USD"}\' WHERE id='+q(sid),False)[0]!=0)
 for role in ['anon','authenticated','service_role','coordinated_client']:
  ck(role+' has no trigger EXECUTE',read('SELECT has_function_privilege('+q(role)+",'backend_core.capture_financial_currency_v1()','EXECUTE')")=='f')
 # Change authority only inside rollback-only local test transaction; immutable
 # authority protection is disabled locally for synthetic fixture substitution.
 for code in ['USD','KES','UGX','EUR','AED','JPY','KWD']:
  n=read('SELECT count(*) FROM public.sales');stock=read('SELECT qty FROM public.inventory WHERE store_id='+q(store)+' AND product_id='+q(product))
  statement='BEGIN;ALTER TABLE proforma_backend.accounting_currency DISABLE TRIGGER USER;UPDATE proforma_backend.accounting_currency SET currency='+q(code)+' WHERE organization_id='+q(org)+';'+sale()+'ROLLBACK;'
  rc,out,err=l.sql(statement,False);ck(code+' native posting fails closed atomically',rc!=0 and 'NATIVE_FINANCIAL_POSTING_NOT_CERTIFIED' in err and read('SELECT count(*) FROM public.sales')==n and read('SELECT qty FROM public.inventory WHERE store_id='+q(store)+' AND product_id='+q(product))==stock)
 ck('original confirmed authority preserved',read('SELECT currency FROM proforma_backend.accounting_currency WHERE organization_id='+q(org))=='TZS')
 r={'status':'PASS','count':len(C),'checks':C,'migrationSha256':hashlib.sha256((E/'2026101904-financial-currency-context.DRAFT.sql').read_bytes()).hexdigest(),'scope':'Captured full-schema synthetic canonical RPC; synthetic JWT claims and local-only harness grant; no remote writes or native financial certification','productionCompatibility':'NOT PREFLIGHTED; requires fresh target object/signature/trigger check before approval'};(E/'POSTGRES-RESULTS.json').write_text(json.dumps(r,indent=2));print(json.dumps(r))
finally:
 if l.PORT:l.tool('pg_ctl',['-D',str(l.CLUSTER),'-m','fast','-w','stop'])
