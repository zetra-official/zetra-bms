from pathlib import Path
import sys,json,uuid,re,concurrent.futures
from decimal import Decimal as D
sys.dont_write_bytecode=True;sys.path.insert(0,str(Path('engineering/currency-onboarding-20261018').resolve()));import local as l
E=Path(__file__).resolve().parent;l.E=E;l.CLUSTER=E/'disposable-native-v2';q=lambda s:"'"+str(s).replace("'","''")+"'";read=lambda s:l.sql(s)[1];C=[];evidence=[]
I=lambda n:str(uuid.uuid5(uuid.NAMESPACE_URL,'zetra-normal-proforma-'+str(n)));owner,template_org,template_store=I(1),I(100),I(200)
def ck(n,v):assert v,n;C.append(n)
def auth(a):return 'SET ROLE coordinated_client;SET request.jwt.claims='+q(json.dumps({'sub':a}))+';'
def clone(table,where,values):return 'INSERT INTO public.'+table+' SELECT (jsonb_populate_record(NULL::public.'+table+',to_jsonb(t)||'+q(json.dumps(values))+'::jsonb)).* FROM public.'+table+' t WHERE '+where+' LIMIT 1;'
def shift(store,request,code,operation,sid,amount,who):return auth(who)+'SELECT public.native_cashier_shift_v1('+','.join([q(store),q(request),q(code),'1',q(operation),q(sid) if sid else 'NULL',str(amount),'NULL'])+');'
try:
 l.PORT=l.start();tail=(E/'1905-gateways.sql').read_text();receipt=re.search(r'CREATE FUNCTION public.get_native_sale_result_v1\(.*?END \$\$;',tail,re.S).group();l.sql(receipt+'REVOKE ALL ON FUNCTION public.get_native_sale_result_v1(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;')
 # Local-only harness admission. Newly added recovery RPC remains denied to
 # all actual API roles and exposes no table SELECT grant.
 for role in ['anon','authenticated','service_role']:
  ck(role+' result recovery quarantined',read('SELECT has_function_privilege('+q(role)+",'public.get_native_sale_result_v1(uuid,uuid)','EXECUTE')")=='f')
 l.sql('GRANT EXECUTE ON FUNCTION public.native_cashier_shift_v1(uuid,uuid,text,integer,text,uuid,numeric,text),public.create_native_sale_v1(uuid,uuid,text,integer,jsonb),public.get_native_sale_result_v1(uuid,uuid) TO coordinated_client')
 cashier=str(uuid.uuid4());l.sql('INSERT INTO auth.users(id) VALUES('+q(cashier)+')')
 for row in json.loads((E/'NATIVE-RESULTS.json').read_text())['scenarios']:
  org,store,product,code,cost=[row[k] for k in ['organizationId','storeId','productId','currency','cost']]
  lines=json.loads(read('SELECT json_agg(json_build_object(\'sale\',s.id,\'qty\',i.qty::text,\'cost\',i.unit_cost::text,\'total\',s.grand_total::text)) FROM public.sale_items i JOIN public.sales s ON s.id=i.sale_id WHERE s.store_id='+q(store)))
  ck(code+' native cost snapshot matches proven product cost',all(D(x['cost'])==D(cost) for x in lines))
  sold=sum(D(x['qty']) for x in lines);stock=D(read('SELECT qty FROM public.inventory WHERE store_id='+q(store)+' AND product_id='+q(product)))
  ck(code+' stock conservation across sale and retries',stock+sold==D('1000'))
  before=read('SELECT md5(string_agg(to_jsonb(i)::text,\'\' ORDER BY id)) FROM public.sale_items i WHERE sale_id IN(SELECT id FROM public.sales WHERE store_id='+q(store)+')')
  l.sql('UPDATE public.products SET cost_price=cost_price+100 WHERE id='+q(product))
  ck(code+' catalog cost changes cannot rewrite historical COGS',read('SELECT md5(string_agg(to_jsonb(i)::text,\'\' ORDER BY id)) FROM public.sale_items i WHERE sale_id IN(SELECT id FROM public.sales WHERE store_id='+q(store)+')')==before)
  evidence.append({'currency':code,'historicalSoldQty':str(sold),'unitCostSnapshot':cost,'cogs':str(sold*D(cost)),'cashierReconciliationScope':'opening + canonical cash sale only; no external cash movement certification'})
  member=str(uuid.uuid4());l.sql(clone('org_memberships','id='+q(row['ownerMembershipId']),{'id':member,'user_id':cashier,'role':'cashier'})+clone('org_membership_stores','membership_id='+q(row['ownerMembershipId'])+' AND store_id='+q(store),{'id':str(uuid.uuid4()),'membership_id':member,'store_id':store}))
  digits=0 if code in ('UGX','JPY') else 3 if code=='KWD' else 2;opening=D('100' if digits==0 else '100.125' if digits==3 else '100.12');req=str(uuid.uuid4());sv=json.loads(read(shift(store,req,code,'OPEN_SHIFT',None,opening,cashier)));sid=sv['shiftId'];ck(code+' native opening preserves exact count',D(sv['openingCash'])==opening and sv['currency']==code)
  ck(code+' open replay does not create second shift',json.loads(read(shift(store,req,code,'OPEN_SHIFT',None,opening,cashier)))==sv)
  paid=D('123' if digits==0 else '12.345' if digits==3 else '12.34');body={'organization_id':org,'items':[{'product_id':product,'qty':'1','unit_price':str(paid)}],'payment_method':'CASH','paid_amount':str(paid),'is_credit':False,'cashier_shift_id':sid}
  statement=auth(cashier)+'SELECT public.create_native_sale_v1('+q(store)+','+q(str(uuid.uuid4()))+','+q(code)+',1,'+q(json.dumps(body))+'::jsonb)';result=json.loads(read(statement));ck(code+' cashier sale uses canonical locked shift',read('SELECT cashier_shift_id::text FROM public.sales WHERE id='+q(result['saleId']))==sid)
  close_req=str(uuid.uuid4());closing=opening+paid;closed=json.loads(read(shift(store,close_req,code,'CLOSE_SHIFT',sid,closing,cashier)));ck(code+' recorded closing equals fixture cash reconciliation',D(closed['drawerCount'])==closing and closed['status']=='CLOSED' and closed['reconciliationCertified']==False)
  ck(code+' close retry idempotent',json.loads(read(shift(store,close_req,code,'CLOSE_SHIFT',sid,closing,cashier)))==closed)
  before_stock=read('SELECT qty FROM public.inventory WHERE store_id='+q(store)+' AND product_id='+q(product));ck(code+' closed shift cannot post another sale',l.sql(statement.replace(result['saleId'],str(uuid.uuid4())),False)[0]!=0 if False else l.sql(auth(cashier)+'SELECT public.create_native_sale_v1('+q(store)+','+q(str(uuid.uuid4()))+','+q(code)+',1,'+q(json.dumps(body))+'::jsonb)',False)[0]!=0)
  ck(code+' rejected closed-shift posting preserves stock',read('SELECT qty FROM public.inventory WHERE store_id='+q(store)+' AND product_id='+q(product))==before_stock)
  receipt=json.loads(read('SELECT json_build_object(\'id\',request_id,\'result\',result) FROM backend_core.native_financial_requests WHERE store_id='+q(store)+" AND actor_id="+q(owner)+" AND operation='SALE' ORDER BY created_at LIMIT 1"))
  recovery='SELECT public.get_native_sale_result_v1('+q(store)+','+q(receipt['id'])+')'
  ck(code+' committed result recoverable without financial repost',json.loads(read(auth(owner)+recovery))==receipt['result'])
  ck(code+' another authorized member cannot read private receipt',read(auth(cashier)+recovery)=='')
 ck('no stranded native permits',read('SELECT count(*) FROM backend_core.native_financial_intents')=='0')
 (E/'COST-CASHIER-RESULTS.json').write_text(json.dumps({'status':'PASS','count':len(C),'checks':C,'evidence':evidence,'scope':'Actual canonical unit_cost snapshots, inventory conservation, opening/sale/recorded-closing contracts and actor-scoped receipt recovery in disposable schema. Full custody/outflow closing, refunds and procurement not certified. Synthetic Auth.'},indent=2));print('PASS '+str(len(C)))
finally:
 if l.PORT:
  l.sql('REVOKE EXECUTE ON FUNCTION public.native_cashier_shift_v1(uuid,uuid,text,integer,text,uuid,numeric,text),public.create_native_sale_v1(uuid,uuid,text,integer,jsonb),public.get_native_sale_result_v1(uuid,uuid) FROM coordinated_client',False)
  l.tool('pg_ctl',['-D',str(l.CLUSTER),'-m','fast','-w','stop'])
