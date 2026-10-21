from local_env import *
cfg=json.loads((E/'runtime.private.json').read_text());checks=[]
def check(name,ok):
 checks.append({'name':name,'status':'PASS' if ok else 'FAIL'})
def call(actor,path,body=None,token=None):return request('http://127.0.0.1:55773/'+path,body, token or (cfg['actors'][actor]['session']['access_token'] if actor else cfg['anon']))
org='21000000-0000-4000-8000-000000000100';store='21000000-0000-4000-8000-000000000200';order='21000000-0000-4000-8000-000000000500'
private={'cost_price','unit_cost','total_cost','total_goods_value','total_paid_amount','total_balance_amount','principal_amount','paid_amount','balance_amount','cogs','gross_profit','net_profit','purchase_price'}
def no_cost(v):
 if isinstance(v,list):return all(no_cost(i) for i in v)
 if isinstance(v,dict):return all((x is None if k in private else no_cost(x)) for k,x in v.items())
 return True
for actor in cfg['actors']:
 tok=cfg['actors'][actor]['session']['access_token'];s,r=request('http://127.0.0.1:55772/user',token=tok);check(actor+' genuine signed identity',s==200 and r.get('id')==cfg['actors'][actor]['id'])
 s,r=call(actor,'rpc/get_store_inventory_v2',{'p_store_id':store});authorized=actor in ['owner','admin','staff','cashier'];check(actor+' operational store scope',s==200 and len(r)>0 if authorized else s in [400,401,403]);
 if authorized:
  match=next((x for x in r if x.get('product_id')=='21000000-0000-4000-8000-000000000300'),None);check(actor+' original quantity/selling price preserved',match is not None and float(match['selling_price'])==101 and float(match['qty'])==10)
  check(actor+' acquisition-cost visibility',no_cost(r))
 s,r=call(actor,'rpc/get_business_debts',{'p_organization_id':org,'p_store_id':store});check(actor+' debt RPC authority',s==200 and any(x['principal_amount']==102 for x in r) if actor=='owner' else s==403 and r.get('code')=='42501')
 s,r=call(actor,'business_debts?select=id,principal_amount&organization_id=eq.'+org);check(actor+' raw debt RLS',s==200 and len(r)>0 if actor=='owner' else s==200 and r==[])
 s,r=call(actor,'m2_owner_products?select=id,cost_price&id=eq.21000000-0000-4000-8000-000000000300');check(actor+' Owner cost projection',s==200 and len(r)==1 and r[0]['cost_price']==51 if actor=='owner' else s==200 and r==[])
 s,r=call(actor,'products?select=id,cost_price');check(actor+' raw cost column blocked',s==403)
 for fn,args in [('get_store_net_profit_v2',{'p_store_id':store,'p_from':'2026-10-01T00:00:00Z','p_to':'2026-11-01T00:00:00Z'}),('get_product_profit_report_v3',{'p_store_id':store,'p_from':'2026-10-01T00:00:00Z','p_to':'2026-11-01T00:00:00Z'})]:
  s,r=call(actor,'rpc/'+fn,args);check(actor+' '+fn+' owner boundary',s==200 if actor=='owner' else s==403 and r.get('code')=='42501')
 if authorized:
  for fn,args in [('get_inbound_stock_orders_v1',{'p_org_id':org,'p_store_id':store}),('get_inbound_stock_order_items_v1',{'p_order_id':order})]:
   s,r=call(actor,'rpc/'+fn,args);check(actor+' '+fn+' role filtering',s==200 and len(r)>0 and (True if actor=='owner' else no_cost(r)))
for actor in [None]:
 for path,body in [('rpc/get_business_debts',{'p_organization_id':org}),('products?select=id,cost_price',None),('rpc/get_store_inventory_v2',{'p_store_id':store})]:
  s,r=call(actor,path,body);check('anonymous '+path+' denied',s in [400,401,403])
t=cfg['actors']['admin']['session']['access_token'];parts=t.split('.');parts[2]=('a' if parts[2][0]!='a' else 'b')+parts[2][1:];s,r=call('admin','rpc/get_business_debts',{'p_organization_id':org},'.'.join(parts));check('tampered signature rejected',s==401)
s,r=call('owner','rpc/get_business_debts',{'p_organization_id':'21000000-0000-4000-8000-000000000101'});check('Owner cross organization denied',s==403)
result={'environment':'real local GoTrue + PostgREST + hardened disposable PostgreSQL','checks':checks,'pass':sum(x['status']=='PASS' for x in checks),'fail':sum(x['status']=='FAIL' for x in checks),'hostedWrites':False};(E/'AUTHENTICATED-API-RESULTS.json').write_text(json.dumps(result,indent=2));print(json.dumps({'pass':result['pass'],'fail':result['fail'],'failures':[x['name'] for x in checks if x['status']=='FAIL']}))
