"""ADB UI actions explicitly authorized by Owner; Expo Go test app only.
Mirroring remains visible. Never accepts credentials or arbitrary shell text.
"""
from pathlib import Path
import subprocess,sys,re,json,xml.etree.ElementTree as X
E=Path(__file__).resolve().parent;SERIAL='R5CY23FMCCD';XML=E/'android-current-ui.private.xml'
def adb(*args):
 p=subprocess.run(['adb','-s',SERIAL,*args],capture_output=True,timeout=25)
 assert p.returncode==0,p.stderr.decode('utf-8',errors='replace')[-400:]
 return p.stdout
def snapshot():
 adb('shell','uiautomator','dump','/sdcard/zetra-currency-ui.xml');adb('pull','/sdcard/zetra-currency-ui.xml',str(XML))
 root=X.parse(XML).getroot();nodes=list(root.iter('node'))
 assert any(n.get('package')=='host.exp.exponent' for n in nodes),'LOCAL_EXPO_UI_NOT_VISIBLE'
 assert not any(n.get('password')=='true' for n in nodes),'PRIVATE_CREDENTIAL_SCREEN_HANDOFF_REQUIRED'
 return nodes
def target(nodes,label,kind,prefix=False):
 ns=[n for n in nodes if n.get('package')=='host.exp.exponent' and n.get('class')==kind and any((v.startswith(label) if prefix else v==label) for v in [n.get('text',''),n.get('content-desc','')])]
 assert len(ns)==1,'EXACT_VISIBLE_TARGET_REQUIRED: '+label+' / '+str(len(ns))
 assert ns[0].get('enabled')=='true','CONTROL_DISABLED: '+label
 return ns[0]
def tap(n):
 x1,y1,x2,y2=map(int,re.findall(r'\d+',n.get('bounds','')));assert x2>x1 and y2>y1
 assert 100<(y1+y2)//2<2240,'TARGET_OUTSIDE_SAFE_APP_AREA_SCROLL_REQUIRED'
 adb('shell','input','-d','0','tap',str((x1+x2)//2),str((y1+y2)//2))
def summary(nodes):
 out=[{'text':n.get('content-desc') or n.get('text'),'value':n.get('text') if n.get('class')=='android.widget.EditText' else None,'kind':n.get('class').split('.')[-1],'bounds':n.get('bounds'),'enabled':n.get('enabled'),'focused':n.get('focused')} for n in nodes if n.get('package')=='host.exp.exponent' and (n.get('text') or n.get('content-desc')) and n.get('class')!='android.widget.TextView']
 print(json.dumps(out,ensure_ascii=True))
nodes=snapshot();op=sys.argv[1] if len(sys.argv)>1 else 'snapshot'
if op in ['tap','prefix']:
 keyboard=adb('shell','dumpsys','input_method').decode('utf-8',errors='replace')
 if re.search(r'(mInputShown|isInputShown)\s*=\s*true',keyboard):
  adb('shell','input','-d','0','keyevent','KEYCODE_BACK');nodes=snapshot()
 label=sys.argv[2];assert not re.search('password|sign in|private session',label,re.I),'PRIVATE_AUTH_HANDOFF_ONLY'
 tap(target(nodes,label,'android.widget.Button',op=='prefix'));nodes=snapshot()
elif op in ['fill','replace']:
 label,value=sys.argv[2:4];assert label in ['Amount','Search source accounts','Refund reference','Confirmation reference','Quantity']
 assert re.fullmatch(r'[A-Za-z0-9_.:-]{1,128}',value),'ONLY_LOCAL_FIXTURE_TEXT_ALLOWED'
 n=target(nodes,label,'android.widget.EditText');current=n.get('text','')
 assert op=='replace' or current in ['',label,value],'EXISTING_INPUT_REVIEW_REQUIRED'
 if current!=value:
  tap(n);focused=snapshot();n=target(focused,label,'android.widget.EditText');assert n.get('focused')=='true','EDIT_FOCUS_REQUIRED'
  if op=='replace' and current not in ['',label]:
   adb('shell','input','-d','0','keyevent','KEYCODE_MOVE_END');adb('shell','input','-d','0','keyevent',*(['KEYCODE_DEL']*len(current)))
  adb('shell','input','-d','0','text',value);nodes=snapshot()
  state=adb('shell','dumpsys','input_method').decode('utf-8',errors='replace')
  if re.search(r'(mInputShown|isInputShown)\s*=\s*true',state):
   adb('shell','input','-d','0','keyevent','KEYCODE_BACK');nodes=snapshot()
elif op=='hide-keyboard':
 state=adb('shell','dumpsys','input_method').decode('utf-8',errors='replace')
 assert re.search(r'(mInputShown|isInputShown)\s*=\s*true',state),'KEYBOARD_NOT_CONFIRMED_VISIBLE'
 adb('shell','input','-d','0','keyevent','KEYCODE_BACK');nodes=snapshot()
elif op in ['down','up']:
 # Bounded swipe within the known1080x2340 test screen, away from system bars.
 adb('shell','input','-d','0','swipe','540','1900' if op=='down' else '700','540','700' if op=='down' else '1900','400');nodes=snapshot()
elif op=='screen':
 png=adb('exec-out','screencap','-p');assert png.startswith(b'\x89PNG');(E/'android-live-screen.png').write_bytes(png)
elif op!='snapshot':raise ValueError('UNKNOWN_UI_ACTION')
summary(nodes)
