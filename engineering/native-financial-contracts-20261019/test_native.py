from pathlib import Path
import sys,json,uuid,concurrent.futures
from decimal import Decimal as D,ROUND_HALF_UP
sys.dont_write_bytecode=True;sys.path.insert(0,str(Path('engineering/currency-onboarding-20261018').resolve()));import local as l
E=Path(__file__).resolve().parent;l.E=E;l.CLUSTER=E/'disposable-native-v2';l.env.update(PGPASSFILE=str(E/'NO-CREDENTIALS'),PGSERVICEFILE=str(E/'NO-SERVICES'))
q=lambda s:"'"+str(s).replace("'","''")+"'";read=lambda s:l.sql(s)[1];C=[];results=[]
I=lambda n:str(uuid.uuid5(uuid.NAMESPACE_URL,'zetra-normal-proforma-'+str(n)));actor,template_org,template_store,template_product=I(1),I(100),I(200),I(300)
def ck(n,v):assert v,n;C.append(n)
def auth():return 'SET ROLE coordinated_client;SET request.jwt.claims='+q(json.dumps({'sub':actor}))+';'
def invoke(store,request,code,body,ok=True):return l.sql(auth()+'SELECT public.create_native_sale_v1('+q(store)+','+q(request)+','+q(code)+',1,'+q(json.dumps(body))+'::jsonb);',ok)
def clone(table,where,values):return 'INSERT INTO public.'+table+' SELECT (jsonb_populate_record(NULL::public.'+table+',to_jsonb(t)||'+q(json.dumps(values))+'::jsonb)).* FROM public.'+table+' t WHERE '+where+' LIMIT 1;'
def fingerprint():return read("SELECT md5(coalesce(string_agg((to_jsonb(s)-'currency_context'-'settlement_rounding')::text,'' ORDER BY id),'')) FROM public.sales s")
def financial_counts():return read("SELECT json_build_array((SELECT count(*) FROM public.sales),(SELECT count(*) FROM public.sale_payments),(SELECT count(*) FROM public.credit_ledger_v2),(SELECT count(*) FROM backend_core.native_financial_requests))")
try:
 l.PORT=l.start();ck('isolated full-schema local identity',Path(read('SHOW data_directory')).resolve()==l.CLUSTER.resolve())
 base=fingerprint()
 if read("SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='sales' AND column_name='currency_context'")=='0':l.sql((E.parent/'currency-financial-integration-20261019/2026101904-financial-currency-context.DRAFT.sql').read_text(encoding='utf-8-sig'))
 if read("SELECT to_regclass('backend_core.native_financial_rollout') IS NULL")=='t':l.sql((E/'2026101905-native-settlement-atomic.DRAFT.sql').read_text())
 l.sql('REVOKE EXECUTE ON FUNCTION public.create_native_sale_v1(uuid,uuid,text,integer,jsonb),public.repay_native_credit_v1(uuid,uuid,text,integer,uuid,numeric,text,text,text) FROM coordinated_client')
 ck('historical sale values unchanged',read("SELECT md5(coalesce(string_agg((to_jsonb(s)-'currency_context'-'settlement_rounding')::text,'' ORDER BY id),'')) FROM public.sales s")==base)
 for role in ['anon','authenticated','service_role','coordinated_client']:
  ck(role+' new RPC denied by default',read('SELECT has_function_privilege('+q(role)+",'public.create_native_sale_v1(uuid,uuid,text,integer,jsonb)','EXECUTE')")=='f')
 ck('no active public RPC grants',read("SELECT NOT has_function_privilege('authenticated','public.create_native_sale_v1(uuid,uuid,text,integer,jsonb)','EXECUTE')")=='t')
 l.sql('GRANT EXECUTE ON FUNCTION public.create_native_sale_v1(uuid,uuid,text,integer,jsonb),public.repay_native_credit_v1(uuid,uuid,text,integer,uuid,numeric,text,text,text) TO coordinated_client')
 for code,digits in [('TZS',2),('USD',2),('KES',2),('UGX',0),('EUR',2),('AED',2),('JPY',0),('KWD',3)]:
  org,store,product,member=[str(uuid.uuid4()) for _ in range(4)]
  l.sql(clone('organizations','id='+q(template_org),{'id':org,'name':'SYNTHETIC NATIVE '+code})+clone('stores','id='+q(template_store),{'id':store,'organization_id':org,'name':'SYNTHETIC NATIVE STORE '+code})+clone('org_memberships','organization_id='+q(template_org)+' AND user_id='+q(actor),{'id':member,'organization_id':org}))
  l.sql(clone('org_membership_stores','store_id='+q(template_store)+' AND membership_id IN(SELECT id FROM public.org_memberships WHERE organization_id='+q(template_org)+' AND user_id='+q(actor)+')',{'id':str(uuid.uuid4()),'membership_id':member,'store_id':store}))
  l.sql('INSERT INTO proforma_backend.accounting_currency(organization_id,currency,revision,confirmed_by,origin,acknowledgement) VALUES('+q(org)+','+q(code)+',1,'+q(actor)+",'NEW_ORGANIZATION','NO_HISTORICAL_RESTATEMENT_V1')")
  price=D('123' if digits==0 else '12.345' if digits==3 else '12.34');cost=D('5' if digits==0 else '5.125' if digits==3 else '5.12')
  l.sql(clone('products','id='+q(template_product),{'id':product,'organization_id':org,'name':'SYNTHETIC '+code,'sku':'SYN-'+product[:8],'price':str(price),'selling_price':str(price),'cost':str(cost),'cost_price':str(cost)})+clone('inventory','store_id='+q(template_store)+' AND product_id='+q(template_product),{'id':str(uuid.uuid4()),'store_id':store,'organization_id':org,'product_id':product,'qty':'1000'}))
  body={'organization_id':org,'items':[{'product_id':product,'qty':'0.125','unit_price':str(price)}],'payment_method':'CASH','paid_amount':'1','discount_type':'PERCENT','discount_value':'10','is_credit':False}
  before=financial_counts();r=invoke(store,str(uuid.uuid4()),code,body,False);ck(code+' private rollout denies before writes',r[0]!=0 and 'NOT_CERTIFIED' in r[2] and financial_counts()==before)
  l.sql('INSERT INTO backend_core.native_financial_rollout VALUES('+q(org)+','+q(code)+",1,true,'LOCAL_SYNTHETIC_CERTIFICATION_ONLY')")
  subtotal=price*D('.125');discount=(subtotal*D('.1')).quantize(D('1') if code=='TZS' else D(1).scaleb(-digits),rounding=ROUND_HALF_UP);raw=subtotal-discount;total=raw if code=='TZS' else raw.quantize(D(1).scaleb(-digits),rounding=ROUND_HALF_UP);body['paid_amount']=str(total)
  req=str(uuid.uuid4());v=json.loads(invoke(store,req,code,body)[1]);sid=v['saleId']
  ck(code+' exact discount and settlement',D(v['subtotal'])==subtotal and D(v['discount'])==discount and D(v['total'])==total and D(v['rounding'])==total-raw)
  ck(code+' exact stock deduction',D(read('SELECT qty FROM public.inventory WHERE store_id='+q(store)+' AND product_id='+q(product)))==D('999.875'))
  ck(code+' immutable original currency stored',read('SELECT currency_context->>\'currency\' FROM public.sales WHERE id='+q(sid))==code)
  ck(code+' exact canonical payment reconciliation',D(read('SELECT sum(paid_amount) FROM public.sale_payments WHERE sale_id='+q(sid)))==total)
  old=financial_counts();ck(code+' retry returns original IDs without posting',json.loads(invoke(store,req,code,body)[1])==v and financial_counts()==old)
  changed={**body,'paid_amount':'0'};ck(code+' same key different payload rejected',invoke(store,req,code,changed,False)[0]!=0 and financial_counts()==old)
  # A single failure after sale/stock/payment execution rolls back the entire RPC.
  bad={**body,'paid_amount':'0','is_credit':True,'customer_name':''};stock=read('SELECT qty FROM public.inventory WHERE store_id='+q(store)+' AND product_id='+q(product));ck(code+' failed credit rolls back all financial writes',invoke(store,str(uuid.uuid4()),code,bad,False)[0]!=0 and financial_counts()==old and read('SELECT qty FROM public.inventory WHERE store_id='+q(store)+' AND product_id='+q(product))==stock)
  credit_body={'organization_id':org,'items':[{'product_id':product,'qty':'1','unit_price':str(price)}],'payment_method':'CREDIT','paid_amount':'0','is_credit':True,'customer_name':'SYNTHETIC '+code,'customer_phone':None};cv=json.loads(invoke(store,str(uuid.uuid4()),code,credit_body)[1]);account=cv['creditAccountId']
  ck(code+' debt equals canonical sale balance',D(read('SELECT sum(delta) FROM public.credit_ledger_v2 WHERE credit_account_id='+q(account)))==price)
  repay=str(uuid.uuid4());statement=auth()+'SELECT public.repay_native_credit_v1('+','.join([q(store),q(repay),q(code),'1',q(account),str(price),q('CASH')])+')';rv=json.loads(read(statement));ck(code+' repayment closes debt exactly',D(rv['balance'])==0 and D(read('SELECT sum(delta) FROM public.credit_ledger_v2 WHERE credit_account_id='+q(account)))==0)
  old=financial_counts();ck(code+' repayment replay cannot double collect',json.loads(read(statement))==rv and financial_counts()==old)
  # Different simultaneous requests and replays must share the exact receipt.
  conc=str(uuid.uuid4());before_count=int(read('SELECT count(*) FROM public.sales WHERE store_id='+q(store)))
  with concurrent.futures.ThreadPoolExecutor(3) as pool:out=list(pool.map(lambda _:invoke(store,conc,code,body),range(3)))
  ck(code+' concurrent retries exactly one sale',all(json.loads(x[1])==json.loads(out[0][1]) for x in out) and int(read('SELECT count(*) FROM public.sales WHERE store_id='+q(store)))==before_count+1)
  ck(code+' no orphan transaction permit',read('SELECT count(*) FROM backend_core.native_financial_intents')=='0')
  results.append({'organizationId':org,'storeId':store,'productId':product,'ownerMembershipId':member,'cost':str(cost),'currency':code,'subtotal':str(subtotal),'discount':str(discount),'rounding':str(total-raw),'total':str(total),'nativeSaleDebtRepayment':'LOCAL_PASS','fullFinancialCertification':False})
 (E/'NATIVE-RESULTS.json').write_text(json.dumps({'status':'PASS','count':len(C),'checks':C,'scenarios':results,'auth':'Synthetic JWT/local test-only RPC grants; not genuine Auth','productionWrites':0,'scope':'Canonical sale/tender/stock, atomic debt/repayment and retries; not complete procurement/refund/closing certification'},indent=2));print('PASS '+str(len(C)))
finally:
 if l.PORT:
  l.sql("DO $$BEGIN IF to_regprocedure('public.create_native_sale_v1(uuid,uuid,text,integer,jsonb)') IS NOT NULL THEN REVOKE EXECUTE ON FUNCTION public.create_native_sale_v1(uuid,uuid,text,integer,jsonb),public.repay_native_credit_v1(uuid,uuid,text,integer,uuid,numeric,text,text,text) FROM coordinated_client;END IF;END $$",False)
  l.tool('pg_ctl',['-D',str(l.CLUSTER),'-m','fast','-w','stop'])
