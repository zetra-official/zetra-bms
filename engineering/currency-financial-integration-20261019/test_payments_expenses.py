from pathlib import Path
import sys,json,uuid
from decimal import Decimal as D
sys.dont_write_bytecode=True;sys.path.insert(0,str(Path('engineering/currency-onboarding-20261018').resolve()));import local as l
E=Path(__file__).resolve().parent;l.E=E;l.CLUSTER=E/'disposable-currency-context-v2';q=lambda s:"'"+str(s).replace("'","''")+"'";read=lambda s:l.sql(s)[1];C=[]
I=lambda n:str(uuid.uuid5(uuid.NAMESPACE_URL,'zetra-normal-proforma-'+str(n)));a,org,store,product=I(1),I(100),I(200),I(300)
def ck(n,v):assert v,n;C.append(n)
def auth():return 'SET ROLE coordinated_client;SET request.jwt.claims='+q(json.dumps({'sub':a}))+';'
try:
 l.PORT=l.start()
 for method in ['CASH','MOBILE','BANK','CREDIT','SPLIT']:
  req=str(uuid.uuid4());items=json.dumps([{'product_id':product,'qty':1,'unit_price':'12.34'}]);extra=",p_payment_channel:='SYNTHETIC',p_reference:='SYNTHETIC'" if method in ['MOBILE','BANK'] else ''
  note=",p_note:='SPLIT_PAYMENT: CASH=4.12 | MOBILE=4.11 | BANK=4.11'" if method=='SPLIT' else ''
  sid=read(auth()+'SELECT public.create_sale_with_payment_v6(p_store_id:='+q(store)+'::uuid,p_items:='+q(items)+"::jsonb,p_payment_method:="+q('CASH' if method=='SPLIT' else method)+',p_paid_amount:='+('0' if method=='CREDIT' else '12.34')+',p_client_sale_id:='+q(req)+extra+note+');')
  ck(method+' authoritative original sale currency',read('SELECT currency_context->>\'currency\' FROM public.sales WHERE id='+q(sid))=='TZS')
  ck(method+' stored payment sum reconciles',D(read('SELECT coalesce(sum(paid_amount),0) FROM public.sale_payments WHERE sale_id='+q(sid)))==D('0' if method=='CREDIT' else '12.34'))
  ck(method+' payment snapshots consistent',read('SELECT coalesce(bool_and(p.currency_context=s.currency_context),true) FROM public.sale_payments p JOIN public.sales s ON s.id=p.sale_id WHERE s.id='+q(sid))=='t')
 identity=read("SELECT p.oid::regprocedure::text FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='create_expense_v2'");l.sql('GRANT EXECUTE ON FUNCTION '+identity+' TO coordinated_client')
 expense=read(auth()+"SELECT public.create_expense_v2(p_store_id:="+q(store)+"::uuid,p_amount:=12.345,p_category:='SYNTHETIC',p_note:='SYNTHETIC',p_payment_method:='CASH',p_expense_date:=current_date)")
 # Return identity shape is verified from the actual RPC, not assumed by client code.
 try:
  v=json.loads(expense);eid=v if isinstance(v,str) else v.get('id',v.get('expense_id'))
 except ValueError:eid=expense
 ck('expense retains exact original amount and context',read('SELECT amount=12.345 AND currency_context->>\'currency\'=\'TZS\' FROM public.expenses WHERE id='+q(eid))=='t')
 l.sql('REVOKE EXECUTE ON FUNCTION '+identity+' FROM coordinated_client')
 (E/'PAYMENT-EXPENSE-RESULTS.json').write_text(json.dumps({'status':'PASS','count':len(C),'checks':C,'scope':'TZS captured canonical RPCs in disposable synthetic database; CREDIT sale test does not certify separate debt/repayment ledger; synthetic JWT not genuine Auth'},indent=2));print('PASS '+str(len(C)))
finally:
 if l.PORT:l.tool('pg_ctl',['-D',str(l.CLUSTER),'-m','fast','-w','stop'])
