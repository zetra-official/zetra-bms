"""Focused atomic conversion rehearsal against preserved full schema, synthetic data only."""
from pathlib import Path
from decimal import Decimal
import sys,json,socket,uuid,shutil,concurrent.futures
sys.dont_write_bytecode=True;sys.path.insert(0,str(Path(__file__).parent));import test_local as t
E=t.ROOT/'engineering/release/proforma-conversion';E.mkdir(exist_ok=True)
base=t.BASE/'main-project-release/proforma-normal';source=max((p for p in base.glob('clone-*') if p.is_dir() and not(p/'postmaster.pid').exists()),key=lambda p:p.stat().st_ctime)
cluster=base/('conversion-'+uuid.uuid4().hex);shutil.copytree(source,cluster)
with socket.socket() as s:s.bind(('127.0.0.1',0));t.PORT=s.getsockname()[1]
I=lambda n:str(uuid.uuid5(uuid.NAMESPACE_URL,'zetra-normal-proforma-'+str(n)));actor=I(1);org=I(100);store=I(200);product=I(300);q=t.lit
checks=[];report={'status':'FAIL','remoteConnections':0};started=False
def check(name,ok):
 if not ok:raise AssertionError(name)
 checks.append(name)
def call(name,args,who=actor):return json.loads(t.read('SELECT public.'+name+'('+','.join(args)+')',who))
def reject(statement,code,who=actor):
 before=snapshot();r=t.sql(statement,who,False);check(code,r.returncode!=0 and code in r.stderr);check(code+'_no_partial_postings',before==snapshot())
def snapshot():
 result=t.financial()
 for table in ['customers','cashier_shifts','proforma_backend.sale_links']:
  relation=table if '.' in table else 'public.'+table
  result[relation]=t.read("SELECT md5(coalesce(string_agg(to_jsonb(x)::text,E'\\n' ORDER BY to_jsonb(x)::text),'')) FROM "+relation+' x')
 return result
def pending():
 ctx=call('proforma_document_context_v1',[q(org),q(store)])
 body={'currency':ctx['currency'],'validDate':ctx['validDate'],'items':[{'productId':product,'quantity':'2','unitPrice':ctx['products'][0]['unitPrice']}],'discountType':'fixed','discountValue':'0','customer':{'name':'Synthetic Customer','phone':'0700000000'},'notes':'Synthetic conversion only','terms':''}
 doc=str(uuid.uuid4());saved=call('proforma_document_save_v1',[q(org),q(store),q(str(uuid.uuid4())),q(doc),'NULL',"'SAVE'",q(json.dumps(body))+'::jsonb'])
 call('proforma_document_save_v1',[q(org),q(store),q(str(uuid.uuid4())),q(doc),str(saved['revision']['revision']),"'ISSUE'","'{}'::jsonb"])
 return doc
def preview(doc,who=actor):return call('proforma_conversion_preview_v1',[q(org),q(store),q(doc)],who)
def command(doc,quote,payment,req=None):return 'SELECT public.proforma_conversion_commit_v1('+','.join([q(org),q(store),q(doc),q(req or str(uuid.uuid4())),q(json.dumps(quote))+'::jsonb',q(json.dumps(payment))+'::jsonb'])+')'
try:
 r=t.pg.tool('pg_ctl',['-D',str(cluster),'-l',str(cluster.with_suffix('.log')),'-o',f'-h 127.0.0.1 -p {t.PORT} -c archive_mode=off -c shared_preload_libraries=','-w','start']);assert r.returncode==0;started=True
 check('exact_disposable_identity',Path(t.read("SELECT current_setting('data_directory')")).resolve()==cluster.resolve())
 check('synthetic_business_only',t.read('SELECT created_by='+q(actor)+" AND name ILIKE '%synthetic%' FROM public.organizations WHERE id="+q(org))=='t')
 text=(t.ROOT/'supabase/backend-review/20261017/2026101706-proforma-conversion.CANDIDATE.sql').read_text()
 canonical_before=t.read("SELECT md5(string_agg(pg_get_functiondef(p.oid),E'\\n' ORDER BY p.oid)) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('create_sale','create_sale_with_payment_v4','create_sale_with_payment_v6','attach_customer_to_sale','create_credit_account_v2','record_credit_sale_v2','get_store_sale_items')")
 before=t.financial();r=t.sql(text.rsplit('COMMIT;',1)[0]+"DO $$ BEGIN RAISE EXCEPTION 'INJECTED_MIGRATION_FAILURE';END $$;COMMIT;",ok=False)
 check('migration_atomic_rollback',r.returncode!=0 and t.read("SELECT to_regprocedure('public.proforma_conversion_preview_v1(uuid,uuid,uuid)') IS NULL")=='t' and before==t.financial())
 t.sql(text);check('migration_preserves_business_records',before==t.financial())
 check('private_link_RLS_no_client_grants',t.read("SELECT c.relrowsecurity AND c.relforcerowsecurity AND NOT has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE') FROM pg_class c WHERE c.oid='proforma_backend.sale_links'::regclass")=='t')
 t.sql('UPDATE public.inventory SET qty=1000 WHERE store_id='+q(store)+' AND product_id='+q(product))
 # Captured canonical function definitions execute unchanged, never mocks.
 for method in ['CASH','MOBILE','BANK','CREDIT','SPLIT']:
  doc=pending();p=preview(doc);quote=p['quote'];total=quote['total'];pay={'method':method,'paid':'0' if method=='CREDIT' else total,'channel':'Synthetic Bank','reference':'SYNTHETIC-ONLY'}
  if method=='SPLIT':pay.update(cash=str(float(total)/2),mobile=str(float(total)/2),bank='0')
  statement=command(doc,quote,pay);old_stock=t.read('SELECT qty FROM public.inventory WHERE store_id='+q(store)+' AND product_id='+q(product));result=json.loads(t.read(statement,actor));sale=result['sale_id']
  check(method+'_linked_once',t.read('SELECT count(*) FROM proforma_backend.sale_links WHERE document_id='+q(doc))=='1')
  check(method+'_converted',t.read('SELECT status FROM proforma_backend.documents WHERE id='+q(doc))=='CONVERTED')
  check(method+'_stock_once',float(old_stock)-float(t.read('SELECT qty FROM public.inventory WHERE store_id='+q(store)+' AND product_id='+q(product)))==2)
  after=t.financial();again=json.loads(t.read(statement,actor));check(method+'_retry_idempotent',again['sale_id']==sale and after==t.financial())
  if method=='CASH':reject(command(doc,quote,{**pay,'method':'BANK','channel':'Changed','reference':'Changed'}),'ALREADY_CONVERTED_DIFFERENT_REQUEST')
  if method=='CREDIT':check('credit_exact_debt',Decimal(t.read('SELECT sum(delta) FROM public.credit_ledger_v2 WHERE reference='+q(sale)))==Decimal(total))
  else:check(method+'_payments_reconcile',float(t.read('SELECT sum(paid_amount) FROM public.sale_payments WHERE sale_id='+q(sale)))==float(total))
 # Concurrent requests have one document lock and one sale/stock/payment result.
 doc=pending();quote=preview(doc)['quote'];statement=command(doc,quote,{'method':'CASH','paid':quote['total']});before=t.read('SELECT count(*) FROM public.sales')
 with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:results=list(pool.map(lambda _:json.loads(t.read(statement,actor)),range(4)))
 check('concurrent_exactly_once',len({r['sale_id'] for r in results})==1 and int(t.read('SELECT count(*) FROM public.sales'))==int(before)+1)
 # Different documents compete for the same final stock; one must roll back.
 t.sql('UPDATE public.inventory SET qty=3 WHERE store_id='+q(store)+' AND product_id='+q(product));competing=[pending(),pending()];statements=[]
 for d in competing:
  quote=preview(d)['quote'];statements.append(command(d,quote,{'method':'CASH','paid':quote['total']}))
 before=int(t.read('SELECT count(*) FROM public.sales'))
 with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:outcomes=list(pool.map(lambda statement:t.sql(statement,actor,False),statements))
 check('competing_documents_no_overselling',sum(r.returncode==0 for r in outcomes)==1 and int(t.read('SELECT count(*) FROM public.sales'))==before+1 and Decimal(t.read('SELECT qty FROM public.inventory WHERE store_id='+q(store)+' AND product_id='+q(product)))==1)
 t.sql('UPDATE public.inventory SET qty=1000 WHERE store_id='+q(store)+' AND product_id='+q(product))
 doc=pending();quote=preview(doc)['quote'];pay={'method':'CASH','paid':quote['total']}
 reject(command(doc,quote,pay),'FORBIDDEN',I(6));reject(command(doc,quote,pay),'FORBIDDEN',I(4))
 reject(command(doc,quote,pay),'FORBIDDEN',I(5))
 t.sql('UPDATE public.products SET selling_price=selling_price+1 WHERE id='+q(product));reject(command(doc,quote,pay),'QUOTE_CHANGED_REVIEW_REQUIRED');check('changed_price_is_explicit',preview(doc)['changed'] is True)
 fresh=preview(doc)['quote'];t.sql('UPDATE public.inventory SET qty=0 WHERE store_id='+q(store)+' AND product_id='+q(product));reject(command(doc,fresh,{'method':'CASH','paid':fresh['total']}),'PRODUCT_UNAVAILABLE_OR_UNSUPPORTED');t.sql('UPDATE public.inventory SET qty=1000 WHERE store_id='+q(store)+' AND product_id='+q(product))
 t.sql('UPDATE public.inventory SET qty=1 WHERE store_id='+q(store)+' AND product_id='+q(product));reject(command(doc,fresh,{'method':'CASH','paid':fresh['total']}),'INSUFFICIENT_STOCK');t.sql('UPDATE public.inventory SET qty=1000 WHERE store_id='+q(store)+' AND product_id='+q(product))
 reject(command(doc,fresh,{'method':'BANK','paid':fresh['total']}),'PAYMENT_REFERENCE_REQUIRED')
 # Late failure after sale, payment and stock writes must roll back all of them.
 t.sql("CREATE FUNCTION proforma_backend.synthetic_link_failure() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'INJECTED_LATE_FAILURE';END $$;CREATE TRIGGER synthetic_link_failure BEFORE INSERT ON proforma_backend.sale_links FOR EACH ROW EXECUTE FUNCTION proforma_backend.synthetic_link_failure();")
 reject(command(doc,fresh,{'method':'CASH','paid':fresh['total']}),'INJECTED_LATE_FAILURE');check('failed_sale_remains_pending',t.read('SELECT status FROM proforma_backend.documents WHERE id='+q(doc))=='PENDING')
 reject(command(doc,fresh,{'method':'CREDIT','paid':'0'}),'INJECTED_LATE_FAILURE')
 t.sql('DROP TRIGGER synthetic_link_failure ON proforma_backend.sale_links;DROP FUNCTION proforma_backend.synthetic_link_failure();')
 # Existing protected writer/period guards must propagate; never swallowed by the adapter.
 t.sql("CREATE FUNCTION public.synthetic_period_lock() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'SYNTHETIC_CLOSED_PERIOD';END $$;CREATE TRIGGER synthetic_period_lock BEFORE INSERT ON public.sales FOR EACH ROW EXECUTE FUNCTION public.synthetic_period_lock();")
 reject(command(doc,fresh,{'method':'CASH','paid':fresh['total']}),'SYNTHETIC_CLOSED_PERIOD')
 t.sql('DROP TRIGGER synthetic_period_lock ON public.sales;DROP FUNCTION public.synthetic_period_lock();')
 for who,label in [(I(2),'admin'),(I(3),'assigned_staff')]:
  d=pending();current=preview(d,who)['quote'];check(label+'_canonical_conversion',bool(json.loads(t.read(command(d,current,{'method':'CASH','paid':current['total']}),who))['sale_id']))
 # Cashier mode cannot be bypassed by staff. Use the existing open-shift API.
 t.sql('UPDATE public.stores SET sales_mode=\'CASHIER\' WHERE id='+q(store))
 d=pending();reject('SELECT public.proforma_conversion_preview_v1('+','.join([q(org),q(store),q(d)])+')','SEND_TO_CASHIER_REQUIRED',I(3))
 t.sql('INSERT INTO auth.users(id) VALUES('+q(I(7))+');INSERT INTO public.org_memberships(id,organization_id,user_id,role,is_active) VALUES('+','.join([q(I(1007)),q(org),q(I(7)),"'cashier'",'true'])+');INSERT INTO public.org_membership_stores(membership_id,store_id) VALUES('+q(I(1007))+','+q(store)+');')
 cashier_quote=preview(d,I(7))['quote'];reject(command(d,cashier_quote,{'method':'CASH','paid':cashier_quote['total']}),'OWN_OPEN_SHIFT_REQUIRED',I(7))
 shift=t.read('SET request.jwt.claims='+q(json.dumps({'sub':I(7)}))+';SELECT shift_id FROM public.open_cashier_shift_v1('+q(store)+',0)')
 check('cashier_own_open_shift',bool(json.loads(t.read(command(d,cashier_quote,{'method':'CASH','paid':cashier_quote['total'],'shiftId':shift}),I(7)))['sale_id']))
 check('canonical_definitions_unchanged',canonical_before==t.read("SELECT md5(string_agg(pg_get_functiondef(p.oid),E'\\n' ORDER BY p.oid)) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('create_sale','create_sale_with_payment_v4','create_sale_with_payment_v6','attach_customer_to_sale','create_credit_account_v2','record_credit_sale_v2','get_store_sale_items')"))
 report.update(status='PASS',checks=checks,canonicalFunctionsUnchanged=True)
except Exception as e:
 report.update(error=str(e),checks=checks);raise
finally:
 if started:t.pg.tool('pg_ctl',['-D',str(cluster),'-m','fast','-w','stop'])
 report['stopped']=not(cluster/'postmaster.pid').exists();(E/'postgres-result.json').write_text(json.dumps(report,indent=2));print(json.dumps(report))
