from local_env import *
cfg=json.loads((E/'runtime.private.json').read_text());checks=[];store='21000000-0000-4000-8000-000000000200';org='21000000-0000-4000-8000-000000000100'
for actor in list(cfg['actors'])+[None]:
 token=cfg['actors'][actor]['session']['access_token'] if actor else cfg['anon'];authorized=actor in ['owner','admin','staff','cashier']
 for fn,args in [('get_store_sale_items',{'p_store_id':store}),('get_stock_in_items_v2',{'p_org_id':org,'p_store_id':store,'p_date_from':'2026-10-21','p_date_to':'2026-10-21'}),('get_stock_on_hand_value_v1',{'p_org_id':org,'p_store_id':store})]:
  s,r=request('http://127.0.0.1:55773/rpc/'+fn,args,token)
  if fn=='get_stock_on_hand_value_v1':ok=s==200 and '612' in json.dumps(r) if actor=='owner' else s in [401,403]
  elif authorized:ok=s==200 and bool(r) and (any(x.get('cost_price',x.get('unit_cost'))==51 for x in r) if actor=='owner' else all(x.get('cost_price',x.get('unit_cost')) is None for x in r))
  else:ok=s in [400,401,403]
  checks.append({'actor':actor or 'anon','rpc':fn,'http':s,'status':'PASS' if ok else 'FAIL','error':r.get('message') if isinstance(r,dict) and not ok else None})
r={'checks':checks,'pass':sum(x['status']=='PASS' for x in checks),'fail':sum(x['status']=='FAIL' for x in checks),'localOnly':True};(E/'POS-VALUATION-API.json').write_text(json.dumps(r,indent=2));print(json.dumps(r))
