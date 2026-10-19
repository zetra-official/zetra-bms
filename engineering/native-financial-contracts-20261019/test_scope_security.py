from pathlib import Path
import sys,json,uuid
sys.dont_write_bytecode=True;sys.path.insert(0,str(Path('engineering/currency-onboarding-20261018').resolve()));import local as l
E=Path(__file__).resolve().parent;l.E=E;l.CLUSTER=E/'disposable-native-v2';q=lambda s:"'"+str(s).replace("'","''")+"'";checks=[]
owner=str(uuid.uuid5(uuid.NAMESPACE_URL,'zetra-normal-proforma-1'));unknown=str(uuid.uuid4())
def auth(actor):return 'SET ROLE coordinated_client;SET request.jwt.claims='+q(json.dumps({'sub':actor} if actor else {}))+';'
def ck(n,v):assert v,n;checks.append(n)
try:
 l.PORT=l.start();rows=json.loads((E/'NATIVE-RESULTS.json').read_text())['scenarios'];r=next(x for x in rows if x['currency']=='KWD');other=next(x for x in rows if x['currency']=='USD')
 l.sql('INSERT INTO auth.users(id) VALUES('+q(unknown)+');GRANT EXECUTE ON FUNCTION public.create_native_sale_v1(uuid,uuid,text,integer,jsonb) TO coordinated_client;UPDATE backend_core.native_financial_rollout SET enabled=true WHERE organization_id='+q(r['organizationId']))
 base=l.sql('SELECT count(*) FROM public.sales')[1]
 body={'organization_id':r['organizationId'],'items':[{'product_id':r['productId'],'qty':'1','unit_price':'12.345'}],'payment_method':'CASH','paid_amount':'12.345','is_credit':False}
 cases=[('missing session',None,body,1),('unassigned actor',unknown,body,1),('cross organization payload',owner,{**body,'organization_id':other['organizationId']},1),('cross organization product',owner,{**body,'items':[{'product_id':other['productId'],'qty':'1','unit_price':'12.345'}]},1),('stale authority revision',owner,body,2)]
 for label,actor,b,revision in cases:
  out=l.sql(auth(actor)+'SELECT public.create_native_sale_v1('+q(r['storeId'])+','+q(str(uuid.uuid4()))+",'KWD',"+str(revision)+','+q(json.dumps(b))+'::jsonb)',False);ck(label+' denied before financial commit',out[0]!=0 and l.sql('SELECT count(*) FROM public.sales')[1]==base)
 ck('captured product currency cannot be rewritten',l.sql("UPDATE public.products SET currency_context=jsonb_set(currency_context,'{currency}','\"USD\"') WHERE id="+q(r['productId']),False)[0]!=0)
 ck('no orphan permit on authorization failures',l.sql('SELECT count(*) FROM backend_core.native_financial_intents')[1]=='0')
 (E/'SCOPE-SECURITY-RESULTS.json').write_text(json.dumps({'status':'PASS','count':len(checks),'checks':checks,'scope':'Actual disposable full-schema backend authorization and immutable contexts, synthetic JWT subjects.'},indent=2));print('PASS '+str(len(checks)))
finally:
 if l.PORT:
  l.sql((E/'1905-DISABLE-ROLLBACK.sql').read_text(),False)
  l.tool('pg_ctl',['-D',str(l.CLUSTER),'-m','fast','-w','stop'])
