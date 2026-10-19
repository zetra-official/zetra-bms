from pathlib import Path
import sys,json,uuid
sys.dont_write_bytecode=True;sys.path.insert(0,str(Path('engineering/currency-onboarding-20261018').resolve()));import local as l
E=Path(__file__).resolve().parent;N=E.parent/'native-financial-contracts-20261019';l.E=N;l.CLUSTER=N/'disposable-native-v2';q=lambda s:"'"+str(s).replace("'","''")+"'";read=lambda s:l.sql(s)[1];checks=[];facts=[]
owner=str(uuid.uuid5(uuid.NAMESPACE_URL,'zetra-normal-proforma-1'));auth='SET ROLE coordinated_client;SET request.jwt.claims='+q(json.dumps({'sub':owner}))+';'
def ck(n,v):assert v,n;checks.append(n)
try:
 l.PORT=l.start();l.sql('GRANT EXECUTE ON FUNCTION public.create_native_sale_v1(uuid,uuid,text,integer,jsonb),public.update_expense_v2(uuid,numeric,text,text,text) TO coordinated_client')
 for row in json.loads((N/'NATIVE-RESULTS.json').read_text())['scenarios']:
  code=row['currency'];price='123' if code in ('UGX','JPY') else '12.345' if code=='KWD' else '12.34';l.sql('UPDATE backend_core.native_financial_rollout SET enabled=true WHERE organization_id='+q(row['organizationId']))
  body={'organization_id':row['organizationId'],'items':[{'product_id':row['productId'],'qty':'1','unit_price':price}],'payment_method':'CASH','paid_amount':price,'is_credit':False}
  result=json.loads(read(auth+'SELECT public.create_native_sale_v1('+q(row['storeId'])+','+q(str(uuid.uuid4()))+','+q(code)+',1,'+q(json.dumps(body))+'::jsonb)'))
  ck(code+' canonical sale update remains valid within atomic permit',result['total']==price)
  if code!='TZS':
   ck(code+' legacy direct financial update denied outside permit',l.sql("UPDATE public.sales SET paid_amount=0 WHERE id="+q(result['saleId']),False)[0]!=0)
  fact=json.loads(read("SELECT json_build_object('currency',s.currency_context->>'currency','revenue',s.grand_total::text,'paid',s.paid_amount::text,'cogs',sum(i.qty*i.unit_cost)::text,'grossProfit',(s.grand_total-sum(i.qty*i.unit_cost))::text) FROM public.sales s JOIN public.sale_items i ON i.sale_id=s.id WHERE s.id="+q(result['saleId'])+' GROUP BY s.id'))
  from decimal import Decimal as D
  ck(code+' statement revenue COGS profit reconcile from recorded snapshots',D(fact['revenue'])-D(fact['cogs'])==D(fact['grossProfit']) and fact['currency']==code and D(fact['paid'])==D(fact['revenue']));facts.append(fact)
 existing=json.loads((E/'EXPENSE-RESULTS.json').read_text())['scenarios'];tzs=next(r for r in existing if r['currency']=='TZS')
 out=l.sql(auth+'SELECT public.update_expense_v2('+q(tzs['expenseId'])+",12.34,'SYNTHETIC NATIVE',NULL,'CASH')",False);assert out[0]==0,out[2];checks.append('legacy TZS expense update compatible')
 ck('no orphan native transaction permits',read('SELECT count(*) FROM backend_core.native_financial_intents')=='0')
 before=read('SELECT count(*) FROM public.expenses');l.sql((E/'1906-DISABLE.sql').read_text());ck('1906 disable retains expense facts',read('SELECT count(*) FROM public.expenses')==before)
 ck('1906 disable revokes temporary caller grant',read("SELECT NOT has_function_privilege('coordinated_client','public.create_native_expense_v1(uuid,uuid,text,integer,jsonb)','EXECUTE')")=='t')
 (E/'MUTATION-COMPATIBILITY-RESULTS.json').write_text(json.dumps({'status':'PASS','count':len(checks),'checks':checks,'facts':facts,'scope':'Actual canonical sale/expense tables and immutable recorded cost snapshots. Gross profit only; not a complete tax/refund/closing financial statement.'},indent=2));print('PASS '+str(len(checks)))
finally:
 if l.PORT:
  l.sql('REVOKE EXECUTE ON FUNCTION public.create_native_sale_v1(uuid,uuid,text,integer,jsonb),public.update_expense_v2(uuid,numeric,text,text,text) FROM coordinated_client;UPDATE backend_core.native_financial_rollout SET enabled=false',False)
  l.tool('pg_ctl',['-D',str(l.CLUSTER),'-m','fast','-w','stop'])
