"""Visible, receipt-only native batch acceptance; no financial RPC or credentials."""
from pathlib import Path
import contextlib,io,runpy,sys,json,hashlib,datetime
E=Path(__file__).resolve().parent;DRIVER=E/'android_local_ui.py'
def action(*args):
 old=sys.argv;sys.argv=[str(DRIVER),*args]
 try:
  with contextlib.redirect_stdout(io.StringIO()):return runpy.run_path(str(DRIVER))
 finally:sys.argv=old
def events():return json.loads((E/'ORIGINAL-WORKFLOW-RUNTIME-EVENTS.json').read_text(encoding='utf-8'))['events']
def mutations():return {(e['rpc'],e['args']['p_request_id']) for e in events() if e['rpc'] in ['refund_original_sale_v1','post_bound_field_custody_v1'] and e['error'] is None}
before=mutations();started=datetime.datetime.now(datetime.timezone.utc).isoformat()
api=action('snapshot');adb=api['adb']
for _ in range(15):
 nodes=action('snapshot')['nodes']
 labels=[n.get('content-desc') or n.get('text','') for n in nodes]
 if 'Reprint verified receipts' in labels:break
 if 'Retry local connection' in labels:action('tap','Retry local connection')
else:raise AssertionError('VERIFIED_NATIVE_REPRINT_BUTTON_REQUIRED')
action('up');action('tap','Reprint verified receipts')
for _ in range(80):
 nodes=action('snapshot')['nodes']
 status=next((n.get('text','') for n in nodes if n.get('text','').startswith('NATIVE VERIFIED REPRINTS COMPLETE: 8 currencies.')),None)
 if status:break
 failure=next((n.get('text','') for n in nodes if n.get('text','').startswith(('LOCAL_WORKFLOW_UNAVAILABLE','CONFIRMED_ORIGINAL_RECEIPT_REQUIRED','Network request failed'))),None)
 idle=any((n.get('content-desc') or n.get('text'))=='Reprint verified receipts' and n.get('enabled')=='true' for n in nodes)
 assert not (failure and idle),failure
else:raise AssertionError('EIGHT_NATIVE_REPRINTS_NOT_CONFIRMED')
assert before==mutations(),'NEW_FINANCIAL_REQUEST_DURING_RECEIPT_ONLY_ACCEPTANCE'
documents=json.loads((E/'NATIVE-PDF-EVIDENCE.json').read_text(encoding='utf-8'))['documents'][-8:]
assert {x['currency'] for x in documents}=={'TZS','USD','KES','UGX','EUR','AED','JPY','KWD'}
assert all(x['at']>=started[:19] for x in documents)
png=adb('exec-out','screencap','-p');assert png.startswith(b'\x89PNG');(E/'android-batch-complete.private.png').write_bytes(png)
out={'status':'PASS','startedAt':started,'observedNativeStatus':status,'deviceModel':adb('shell','getprop','ro.product.model').decode().strip(),'scope':'Physical Android UI-triggered Expo Print batch; existing canonical server-confirmed receipts only. Sharing was separately observed in all eight currencies; this batch sends nothing externally.','runtimeSourceReceiptSha256':hashlib.sha256((E/'NATIVE-DEVICE-RUNTIME.json').read_bytes()).hexdigest(),'currencies':[x['currency'] for x in documents],'documents':[{'currency':x['currency'],'refundId':x['refundId'],'sha256':x['sha256'],'file':x['file']} for x in documents],'newFinancialRequests':0,'productionFinancialWrites':False}
(E/'NATIVE-BATCH-REPRINT-RESULTS.json').write_text(json.dumps(out,indent=2),encoding='utf-8');print(json.dumps({'status':'PASS','currencies':8,'newFinancialRequests':0}),flush=True)
