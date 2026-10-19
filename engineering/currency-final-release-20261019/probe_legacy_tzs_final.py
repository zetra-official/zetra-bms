from pathlib import Path
import sys,json,uuid
sys.dont_write_bytecode=True;sys.path.insert(0,str(Path('engineering/currency-onboarding-20261018').resolve()));import local as l
E=Path(__file__).resolve().parent;N=E.parent/'native-financial-contracts-20261019'
l.E=N/'disposable-writer-security-cceeb35e-db63-4679-bd83-13fedff435d5';l.CLUSTER=l.E/'cluster'
q=lambda s:"'"+str(s).replace("'","''")+"'";owner=str(uuid.uuid5(uuid.NAMESPACE_URL,'zetra-normal-proforma-1'))
try:
 l.PORT=l.start();tzs=next(x for x in json.loads((N/'NATIVE-RESULTS.json').read_text())['scenarios'] if x['currency']=='TZS')
 sig=l.sql("SELECT oid::regprocedure FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='create_sale_with_payment_v6'")[1]
 command='BEGIN;GRANT EXECUTE ON FUNCTION '+sig+' TO authenticated;SET ROLE authenticated;SET request.jwt.claims='+q(json.dumps({'sub':owner}))+';SELECT sale_id FROM public.create_sale_with_payment_v6(p_store_id:='+q(tzs['storeId'])+',p_items:='+q(json.dumps([{'product_id':tzs['productId'],'qty':1,'unit_price':13}]))+"::jsonb,p_payment_method:='CASH',p_paid_amount:=13,p_client_sale_id:="+q(str(uuid.uuid4()))+');ROLLBACK;'
 code,out,err=l.sql(command,False);print(json.dumps({'code':code,'error':err[-2000:],'scope':'Disposable rolled-back legacy TZS probe'}))
finally:
 if l.PORT:l.tool('pg_ctl',['-D',str(l.CLUSTER),'-m','fast','-w','stop'])
