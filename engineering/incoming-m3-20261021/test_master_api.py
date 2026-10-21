from pathlib import Path
import json,urllib.request,urllib.error
E=Path(__file__).resolve().parent;cfg=json.loads((E/'runtime.private.json').read_text());f=json.loads((E/'master-fixture.private.json').read_text());sf=json.loads((E/'staff-fixture.private.json').read_text());checks=[];sessions={}
def request(url,payload,token=None):
 data=None if payload is None else json.dumps(payload).encode();headers={'apikey':cfg['anon'],'Content-Type':'application/json','Authorization':'Bearer '+(token or cfg['anon'])};r=urllib.request.Request(url,data=data,headers=headers)
 try:
  with urllib.request.urlopen(r,timeout=15) as response:return response.status,json.load(response)
 except urllib.error.HTTPError as e:return e.code,json.loads(e.read())
def check(name,ok):checks.append({'name':name,'status':'PASS' if ok else 'FAIL'});assert ok,name
def rpc(role,name,args):return request('http://127.0.0.1:55783/rpc/'+name,args,sessions.get(role))
try:
 for role,actor in cfg['actors'].items():
  code,data=request('http://127.0.0.1:55772/token?grant_type=password',{'email':actor['email'],'password':cfg['password']})
  check('Genuine local GoTrue Auth '+role,code==200 and data.get('user',{}).get('id')==actor['id']);sessions[role]=data['access_token']
 for role in ['owner','admin','staff','cashier','no_membership','other_org','inactive']:
  code,data=rpc(role,'m3_staff_operational_v1',{'p_org_id':sf['org'],'p_store_id':sf['store'],'p_day':'2026-01-01','p_offset':0})
  check('Direct Staff operational API isolation '+role,(code==200 and data.get('actor_id')==cfg['actors']['staff']['id'] and data.get('sales')=='400000') if role=='staff' else code in [401,403])
  if role=='staff':check('Missing collection evidence stays unavailable through API',data.get('money_in') is None and data.get('money_status')=='ATTRIBUTION_UNAVAILABLE')
 code,data=rpc('staff','m3_staff_operational_v1',{'p_org_id':sf['org'],'p_store_id':sf['store2'],'p_day':'2026-01-01','p_offset':0});check('Direct API unassigned store denied',code in [401,403])
 code,data=rpc('staff','m3_staff_operational_v1',{'p_org_id':f['org'],'p_store_id':sf['store'],'p_day':'2026-01-01','p_offset':0});check('Direct API mismatched organization denied',code in [401,403])
 code,data=rpc('anonymous','m3_staff_operational_v1',{'p_org_id':sf['org'],'p_store_id':sf['store']});check('Anonymous operational API denied',code in [401,403])
 for role in ['owner','admin','staff','cashier']:
  code,data=rpc(role,'m3_incoming_receipt_v1',{'p_event_id':f['eventId']});check('Genuine receipt API all 105 lines '+role,code==200 and len(data['lines'])==105)
  check('Genuine receipt API cost projection '+role,('total_cost' in data and all('unit_cost' in v for v in data['lines'])) if role=='owner' else ('total_cost' not in data and all('unit_cost' not in v and 'total_cost' not in v for v in data['lines'])))
  if role=='admin':(E/'receipt-master-operational.private.json').write_text(json.dumps(data,ensure_ascii=False),encoding='utf-8')
  code,data=rpc(role,'get_my_notifications_v1',{'p_store_id':f['store'],'p_limit':200});check('Genuine notification API single receipt link '+role,code==200 and sum(isinstance(x.get('body'),dict) and x['body'].get('event_id')==f['eventId'] for x in data)==1)
 for role in ['admin','staff','cashier']:
  for name,args in [('m3_incoming_catalog_v1',{'p_org_id':f['org'],'p_store_id':f['store'],'p_kind':'PRODUCT'}),('get_stock_on_hand_value_v1',{'p_org_id':f['org'],'p_store_id':f['store']})]:
   code,data=rpc(role,name,args);check(role+' protected RPC '+name+' denied',code in [401,403])
  code,data=request('http://127.0.0.1:55783/products?select=cost_price&limit=1',None,sessions[role]);check(role+' direct acquisition-cost column denied',code in [401,403])
 for role in ['other_org','no_membership','inactive']:
  code,data=rpc(role,'m3_incoming_receipt_v1',{'p_event_id':f['eventId']});check('Foreign/unauthorized receipt API denied '+role,code in [401,403])
finally:
 out={'localOnly':True,'genuineGoTrueAuth':True,'checks':checks,'pass':sum(x['status']=='PASS' for x in checks),'fail':sum(x['status']=='FAIL' for x in checks)};(E/'MASTER-API-RESULTS.json').write_text(json.dumps(out,indent=2));print(json.dumps(out))
