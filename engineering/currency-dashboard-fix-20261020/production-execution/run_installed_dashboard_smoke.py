"""Actual physical Expo Dashboard only. No credentials or financial form actions."""
from pathlib import Path
import subprocess,json,re,xml.etree.ElementTree as X,datetime,hashlib,shutil
E=Path(__file__).resolve().parent;assert json.loads((E/'ota-network-proof.json').read_text())['status']=='PASS';SERIAL='R5CY23FMCCD';labels=['Sales','Expenses','Profit','Stock Value']
def adb(*args):
 p=subprocess.run(['adb','-s',SERIAL,*args],capture_output=True,timeout=25);assert p.returncode==0,'ADB_FAILED';return p.stdout
def ui(*args):
 adb('shell','input','keyevent','KEYCODE_WAKEUP')
 p=subprocess.run(['python',str(E/'android_production_ui.py'),*args],capture_output=True,text=True,timeout=50)
 if p.returncode:raise RuntimeError('LOCAL_EXPO_UI_OR_CREDENTIAL_GUARD_STOPPED_ACCEPTANCE')
def read(currency):
 ns=list(X.parse(E/'android-production-ui.private.xml').iter('node'))
 assert any(n.get('package')=='com.anonymous.zetrabmsclean' for n in ns)
 assert not any(n.get('password')=='true' or 'password' in n.get('content-desc','').lower() for n in ns),'CREDENTIAL_HANDOFF_REQUIRED'
 texts=[n.get('text','') for n in ns if n.get('class')=='android.widget.TextView'];rows={}
 for index,label in enumerate(texts):
  if label not in labels:continue
  tail=[]
  for text in texts[index+1:]:
   if text in labels:break
   tail.append(text)
  value=next((re.fullmatch(r'(-?[\d,.]+) '+currency,t) for t in tail if re.fullmatch(r'(-?[\d,.]+) '+currency,t)),None)
  original=next((re.search(r'Original\s*:\s*(-?[\d,.]+)\s+TZS',t) for t in tail if re.search(r'Original\s*:\s*(-?[\d,.]+)\s+TZS',t)),None)
  if value:rows[label]={'amount':value.group(1).replace(',',''),'original':original.group(1).replace(',','') if original else None}
 evidence=' '.join(n.get('content-desc','')+' '+n.get('text','') for n in ns if 'BOT_REFERENCE' in n.get('content-desc','') or 'BOT_REFERENCE' in n.get('text',''))
 return rows,evidence
def capture(currency):
 rows,evidence=read(currency)
 for _ in range(2):
  if len(rows)==4 and (currency=='TZS' or all(r['original'] is not None for r in rows.values())) and 'Effective date' in evidence:break
  ui('down');extra,source=read(currency);rows.update(extra);evidence+=' '+source
 assert set(rows)==set(labels),'INCOMPLETE_DASHBOARD_ROWS'
 ui('up');ui('up')
 return rows,evidence
adb('shell','input','keyevent','KEYCODE_WAKEUP');adb('shell','am','start','-W','-n','com.anonymous.zetrabmsclean/.MainActivity')
ui('snapshot')
ns=list(X.parse(E/'android-production-ui.private.xml').iter('node'))
if any(n.get('content-desc')=='Dashboard currency' for n in ns):ui('tap','Dashboard currency')
ui('tap','Original');originalRows,source=capture('TZS');originals={label:r['amount'] for label,r in originalRows.items()};private={'originals':originals,'stages':{}};results=[]
for currency in ['USD','KES','UGX','EUR']:
 ui('tap','View in '+currency);rows,source=capture(currency)
 p=subprocess.run(['node',str(E.parent/'native_expected_values.cjs')],input=json.dumps({'currency':currency,'originals':originals}),capture_output=True,text=True,timeout=20);assert p.returncode==0,'EXPECTED_QUOTE_FAILED';expected=json.loads(p.stdout)
 assert 'BOT_REFERENCE' in source and expected['referenceDate'] in source,'NATIVE_SOURCE_EVIDENCE_MISMATCH'
 assert all(rows[label]['original']==originals[label] and rows[label]['amount']==expected['amounts'][label] for label in labels),'NATIVE_VALUE_OR_ORIGINAL_MISMATCH'
 private['stages'][currency]=rows;results.append({'currency':currency,'allFourTotals':'PASS','originalPreserved':True,'exactQuoteAndIsoPrecision':'PASS'})
 if currency=='USD':
  ui('screen');shutil.copy2(E/'android-production-screen.private.png',E/'native-dashboard-usd.private.png')
ui('tap','Original');after,_=capture('TZS');assert {label:r['amount'] for label,r in after.items()}==originals,'ORIGINAL_RESTORATION_FAILED'
ui('tap','Close dashboard currency');ui('screen');shutil.copy2(E/'android-production-screen.private.png',E/'installed-production-dashboard.png')
(E/'native-dashboard-values.private.json').write_text(json.dumps(private,indent=2),encoding='utf-8')
result={'status':'PASS','checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'runtime':'Actual installed Production APK with approved OTA, Samsung SM-S938U, USB','package':'com.anonymous.zetrabmsclean','source':'Installed Production app; OTA network identity and sealed bundle hash verified','model':'SM-S938U','device':'R5CY23FMCCD','dashboardEntryVisible':True,'allFourCanonicalTotals':True,'results':results,'sourceEvidence':'BoT reference date 2026-10-20; actual native HTTPS retrieval metadata observed','originalTzsRestoration':'PASS','financialWrites':False,'otaPublication':True,'installedCandidateAcceptanceClaimed':True,'privateEvidenceSha256':{f:hashlib.sha256((E/f).read_bytes()).hexdigest() for f in ['native-dashboard-usd.private.png','native-dashboard-values.private.json']},'entryScreenshotSha256':hashlib.sha256((E/'installed-production-dashboard.png').read_bytes()).hexdigest()}
(E/'android-installed-ui-smoke.json').write_text(json.dumps(result,indent=2),encoding='utf-8');print(json.dumps(result))
