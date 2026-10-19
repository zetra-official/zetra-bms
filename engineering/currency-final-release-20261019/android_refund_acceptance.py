"""Owner-authorized visible UI acceptance. No direct financial calls or credentials."""
from pathlib import Path
import contextlib,io,json,runpy,sys,hashlib,xml.etree.ElementTree as X
E=Path(__file__).resolve().parent
DRIVER=E/'android_local_ui.py'
def action(*args):
 old=sys.argv;sys.argv=[str(DRIVER),*args]
 try:
  with contextlib.redirect_stdout(io.StringIO()):return runpy.run_path(str(DRIVER))
 finally:sys.argv=old
def snapshot():return action('snapshot')['nodes']
def has(nodes,label):return any((n.get('content-desc') or n.get('text'))==label for n in nodes)
def visible(label):
 for _ in range(7):
  nodes=snapshot()
  ns=[n for n in nodes if (n.get('content-desc') or n.get('text'))==label]
  if ns:
   import re
   _,y1,_,y2=map(int,re.findall(r'\d+',ns[0].get('bounds','')))
   if 100<(y1+y2)//2<2200:return nodes
  action('down')
 raise AssertionError('VISIBLE_CONTROL_REQUIRED '+label)
def cancel_share(code,adb):
 adb('shell','uiautomator','dump','/sdcard/zetra-share-ui.xml');dest=E/f'android-share-{code}.private.xml'
 adb('pull','/sdcard/zetra-share-ui.xml',str(dest));nodes=list(X.parse(dest).getroot().iter('node'))
 assert any(n.get('package')=='com.android.intentresolver' for n in nodes),'GENUINE_ANDROID_SHARE_SHEET_REQUIRED'
 image=adb('exec-out','screencap','-p');assert image.startswith(b'\x89PNG')
 (E/f'android-share-{code}.private.png').write_bytes(image)
 evidence=json.loads((E/'NATIVE-PDF-EVIDENCE.json').read_text(encoding='utf-8'))
 assert any(r['currency']==code for r in evidence['documents'] if 'currency' in r),'NATIVE_PDF_CALLBACK_REQUIRED'
 adb('shell','input','-d','0','keyevent','KEYCODE_BACK')
 return {'currency':code,'shareSheet':'com.android.intentresolver','uiSha256':hashlib.sha256(dest.read_bytes()).hexdigest(),'recipientSelected':False}

if __name__=='__main__':
 code=sys.argv[1];assert code in ['TZS','USD','KES','UGX','EUR','AED','JPY','KWD']
 api=action('snapshot');adb=api['adb']
 for _ in range(4):action('up')
 action('tap',code)
 # Wait for this currency's actual reader, rather than tapping moving controls.
 for attempt in range(18):
  nodes=snapshot()
  if any((n.get('content-desc') or n.get('text','')).startswith('SYNTHETIC '+code+' ') for n in nodes):break
  if attempt in [4,9] and any('LOCAL_WORKFLOW_UNAVAILABLE' in n.get('text','') for n in nodes):
   action('tap','TZS' if code!='TZS' else 'USD');snapshot();action('tap',code)
 else:raise AssertionError('ORIGINAL_CURRENCY_READER_REQUIRED')
 nodes=visible('Refund reference')
 already_confirmed=has(nodes,'Share refund PDF') or any((n.get('content-desc') or n.get('text',''))=='SYNTHETIC '+code+' · 0' for n in nodes)
 if not already_confirmed:
  action('fill','Refund reference','SYNTHETIC_ORIGINAL_INCLUSIVE_TAX_DOCUMENT')
  visible('Refund original payment');action('tap','Refund original payment')
  retried=False
  for _ in range(24):
   nodes=snapshot()
   if has(nodes,'Share refund PDF'):break
   if any((n.get('content-desc') or n.get('text'))=='Retry saved refund' and n.get('enabled')=='true' for n in nodes):
    assert not retried,'SAVED_REFUND_REQUIRES_EXACT_RESULT_REVIEW'
    action('tap','Retry saved refund');retried=True
  else:raise AssertionError('CONFIRMED_ORIGINAL_REFUND_REQUIRED')
 visible('Share refund PDF')
 # Switching to the Android resolver is the expected outcome, not an app failure.
 try:action('tap','Share refund PDF')
 except AssertionError as error:
  if str(error)!='LOCAL_EXPO_UI_NOT_VISIBLE':raise
 receipt=cancel_share(code,adb)
 out=E/'ANDROID-REFUND-UI-ACCEPTANCE.json'
 state=json.loads(out.read_text(encoding='utf-8')) if out.exists() else {'scope':'Physical Samsung, Expo Go actual source forms, real Auth, disposable synthetic finance; no deployed navigation certification','scenarios':[],'productionFinancialWrites':False}
 state['scenarios'].append(receipt);out.write_text(json.dumps(state,indent=2),encoding='utf-8')
 print(json.dumps(receipt),flush=True)
