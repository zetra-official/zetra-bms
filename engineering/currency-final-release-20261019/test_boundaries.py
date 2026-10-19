from pathlib import Path
import sys,json,uuid
sys.dont_write_bytecode=True;sys.path.insert(0,str(Path('engineering/currency-onboarding-20261018').resolve()));import local as l
E=Path(__file__).resolve().parent;N=E.parent/'native-financial-contracts-20261019';l.E=N;l.CLUSTER=N/'disposable-native-v2';q=lambda s:"'"+str(s).replace("'","''")+"'";read=lambda s:l.sql(s)[1];checks=[]
owner=str(uuid.uuid5(uuid.NAMESPACE_URL,'zetra-normal-proforma-1'));auth='SET ROLE coordinated_client;SET request.jwt.claims='+q(json.dumps({'sub':owner}))+';'
def ck(n,v):assert v,n;checks.append(n)
try:
 l.PORT=l.start()
 # Remove only the failed prior local guard draft; no financial rows changed.
 if read("SELECT to_regprocedure('backend_core.native_unverified_writer_guard_v1()') IS NOT NULL")=='t':
  for table in ['inventory','stock_movements','products','sale_items','credit_ledger_v2','business_debts','field_wallets','field_wallet_transactions','sales','sale_payments','cashier_shifts']:l.sql('DROP TRIGGER native_unverified_writer_guard_v1 ON public.'+table)
  l.sql('DROP FUNCTION backend_core.native_unverified_writer_guard_v1()')
 l.sql((E/'2026101908-native-writer-quarantine.DRAFT.sql').read_text());l.sql('GRANT EXECUTE ON FUNCTION public.create_native_sale_v1(uuid,uuid,text,integer,jsonb) TO coordinated_client')
 for row in json.loads((N/'NATIVE-RESULTS.json').read_text())['scenarios']:
  code=row['currency'];price='123' if code in ('JPY','UGX') else '12.345' if code=='KWD' else '12.34';store,product=row['storeId'],row['productId'];l.sql('UPDATE backend_core.native_financial_rollout SET enabled=true WHERE organization_id='+q(row['organizationId']))
  body={'organization_id':row['organizationId'],'items':[{'product_id':product,'qty':'1','unit_price':price}],'payment_method':'CASH','paid_amount':price,'is_credit':False};result=json.loads(read(auth+'SELECT public.create_native_sale_v1('+q(store)+','+q(str(uuid.uuid4()))+','+q(code)+',1,'+q(json.dumps(body))+'::jsonb)'));ck(code+' canonical sale remains compatible with stock guards',result['total']==price)
  if code!='TZS':
   before=read('SELECT qty FROM public.inventory WHERE store_id='+q(store)+' AND product_id='+q(product))
   ck(code+' direct inventory mutation denied',l.sql('UPDATE public.inventory SET qty=qty+1 WHERE store_id='+q(store)+' AND product_id='+q(product),False)[0]!=0)
   ck(code+' original stock remains intact',read('SELECT qty FROM public.inventory WHERE store_id='+q(store)+' AND product_id='+q(product))==before)
   ck(code+' unverified product repricing denied',l.sql('UPDATE public.products SET cost_price=1 WHERE id='+q(product),False)[0]!=0)
   ck(code+' destructive sale deletion denied',l.sql('DELETE FROM public.sales WHERE id='+q(result['saleId']),False)[0]!=0)
 ck('helper inaccessible to API roles',read("SELECT NOT has_function_privilege('authenticated','backend_core.native_unverified_writer_guard_v1()','EXECUTE')")=='t')
 ck('default grants do not expose helper',read("SELECT count(*)=0 FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid='backend_core.native_unverified_writer_guard_v1()'::regprocedure AND a.grantee<>p.proowner")=='t')
 (E/'BOUNDARY-RESULTS.json').write_text(json.dumps({'status':'PASS','count':len(checks),'checks':checks,'scope':'Disposable canonical sale with actual stock writer; unsupported native mutation/delete paths fail closed. No native financial activation.'},indent=2));print('PASS '+str(len(checks)))
finally:
 if l.PORT:
  l.sql('REVOKE EXECUTE ON FUNCTION public.create_native_sale_v1(uuid,uuid,text,integer,jsonb) FROM coordinated_client;UPDATE backend_core.native_financial_rollout SET enabled=false',False);l.tool('pg_ctl',['-D',str(l.CLUSTER),'-m','fast','-w','stop'])
