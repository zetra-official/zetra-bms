from pathlib import Path
import json,uuid
E=Path(__file__).resolve().parent
s=(E/'test_master_api.py').read_text(encoding='utf-8');exec(s[:s.index('\ntry:\n')],globals())
import sys
sys.path.insert(0,str(E.parent/'security-owner-privacy-m2-20261021'));import local_runtime as l
l.db.E=E;l.db.CLUSTER=E/'disposable';l.db.PORT=json.loads((E/'db.private.json').read_text())['port']
order=l.db.sql("SELECT sr.order_id FROM incoming_m3.saved_receives sr JOIN public.inbound_stock_orders o ON o.id=sr.order_id JOIN public.organizations g ON g.id=o.organization_id WHERE o.status='PARTIAL_RECEIVED' AND g.name='MASTER M3 SYNTHETIC' ORDER BY sr.created_at DESC LIMIT 1")[1].strip()
# The fixture organization name varies between the preserved master seeds; constrain
# to the exact verified synthetic master org ID instead of guessing a name.
if not order:order=l.db.sql(f"SELECT sr.order_id FROM incoming_m3.saved_receives sr JOIN public.inbound_stock_orders o ON o.id=sr.order_id WHERE o.organization_id='{f['org']}' AND o.status='PARTIAL_RECEIVED' ORDER BY sr.created_at DESC LIMIT 1")[1].strip()
assert order
try:
 for role in ['owner','admin','staff','cashier','other_org']:
  code,data=request('http://127.0.0.1:55772/token?grant_type=password',{'email':cfg['actors'][role]['email'],'password':cfg['password']});assert code==200;sessions[role]=data['access_token']
 for role in ['admin','staff','cashier','other_org','anonymous']:
  code,data=rpc(role,'m3_receive_saved_v1',{'p_order_id':order,'p_request_id':str(uuid.uuid4()),'p_receipts':None});check('Direct saved receiving denies '+role,code in [401,403])
 code,data=rpc('owner','m3_saved_order_context_v1',{'p_order_id':order});check('Owner verifies saved order context through genuine API',code==200 and data is True)
 req=str(uuid.uuid4());args={'p_order_id':order,'p_request_id':req,'p_receipts':None};code,data=rpc('owner','m3_receive_saved_v1',args);check('Owner genuine API completes canonical saved remainder',code==200 and data.get('eventId'));ev=data['eventId']
 code,again=rpc('owner','m3_receive_saved_v1',args);check('HTTP retry returns exact receipt without another receipt',code==200 and again==data)
 for role in ['owner','admin','staff','cashier']:
  code,receipt=rpc(role,'m3_incoming_receipt_v1',{'p_event_id':ev});check('Saved receipt API projection '+role,code==200 and (('total_cost' in receipt) if role=='owner' else ('total_cost' not in receipt and all('unit_cost' not in x for x in receipt['lines']))))
 for role in ['other_org','anonymous']:
  code,data=rpc(role,'m3_incoming_receipt_v1',{'p_event_id':ev});check('Saved receipt denies '+role,code in [401,403])
finally:
 out={'localOnly':True,'genuineGoTrueAuth':True,'checks':checks,'pass':sum(c['status']=='PASS' for c in checks),'fail':sum(c['status']=='FAIL' for c in checks)};(E/'UNIFIED-API-RESULTS.json').write_text(json.dumps(out,indent=2));print(json.dumps(out))
