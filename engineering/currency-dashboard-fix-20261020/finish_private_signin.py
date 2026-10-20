"""Submit human-entered local sign-in once; never read/print/edit credentials."""
from pathlib import Path
import subprocess,re,xml.etree.ElementTree as X
E=Path(__file__).resolve().parent;SERIAL='R5CY23FMCCD'
def adb(*args):
 p=subprocess.run(['adb','-s',SERIAL,*args],capture_output=True,timeout=25);assert p.returncode==0;return p.stdout
def nodes():
 adb('shell','uiautomator','dump','/sdcard/zetra-dashboard-auth.xml');p=E/'native-auth-current.private.xml';adb('pull','/sdcard/zetra-dashboard-auth.xml',str(p));ns=list(X.parse(p).iter('node'));assert any(n.get('package')=='host.exp.exponent' for n in ns);return ns
def button(ns,label):
 matches=[n for n in ns if n.get('package')=='host.exp.exponent' and n.get('class')=='android.widget.Button' and label in [n.get('content-desc'),n.get('text')]];assert len(matches)==1;return matches[0]
def tap(n):
 assert n.get('enabled')=='true';a,b,c,d=map(int,re.findall(r'\d+',n.get('bounds')));adb('shell','input','-d','0','tap',str((a+c)//2),str((b+d)//2))
ns=nodes()
if any(n.get('class')=='android.widget.Button' and 'Hide' in [n.get('content-desc'),n.get('text')] for n in ns):tap(button(ns,'Hide'));ns=nodes()
tap(button(ns,'Sign in'))
print('Human-entered local Expo sign-in submitted once; credential values neither read nor printed')
