"""Publish only the sealed, Owner-approved Android display artifact after Web UI PASS."""
from pathlib import Path
import json,subprocess,sys,hashlib,datetime
D=Path(__file__).resolve().parent;E=D.parent
CLI=r'C:\Users\ZetraAdmin\AppData\Roaming\npm\node_modules\eas-cli\bin\run'
OLD='6f0e3704-2774-44c8-afc5-34216997c808'
def save(n,v):(D/n).write_text(json.dumps(v,indent=2));return v
def run(args,name,timeout=120):
 p=subprocess.run(['node',CLI,*args],cwd=E/'source-android',capture_output=True,text=True,encoding='utf-8',errors='replace',timeout=timeout)
 (D/(name+'.private.log')).write_text(p.stdout+'\n'+p.stderr,encoding='utf-8')
 assert p.returncode==0,name+' FAILED; inspect private log'
 return json.loads(p.stdout[min(i for i in [p.stdout.find('{'),p.stdout.find('[')] if i>=0):])
def channel(name):
 v=run(['channel:view','production','--json','--non-interactive'],name);page=v.get('currentPage',v)
 assert page['name']=='production' and page['isPaused'] is False
 assert len(page['updateBranches'])==1 and page['updateBranches'][0]['name']=='production'
 updates=[u for b in page['updateBranches'] for g in b['updateGroups'] for u in (g if isinstance(g,list) else [g]) if u.get('platform')=='android']
 result={'channel':'production','latestAndroid':[{k:u.get(k) for k in ['id','group','runtimeVersion','platform','createdAt']} for u in updates]}
 assert updates[0]['runtimeVersion']=='1.0.0'
 save(name+'.json',result);return updates[0]
mode=sys.argv[1]
if mode=='publish':
 assert json.loads((D/'production-smoke.json').read_text())['status']=='PASS'
 assert json.loads((D/'production-ui-smoke.json').read_text())['fxSafeDisplay']=='PASS'
 assert json.loads((D/'production-ui-smoke.json').read_text())['status']=='PASS'
 assert json.loads((D/'preflight.json').read_text())['status']=='PASS'
 manifest=json.loads((E/'ARTIFACT-android-SHA256.json').read_text())
 for f,h in manifest.items():assert hashlib.sha256((E/'release-artifact-android'/f).read_bytes()).hexdigest()==h
 assert channel('android-channel-before')['group']==OLD,'CHANNEL_DRIFT'
 assert not(D/'android-publication-started.json').exists(),'EXISTING_ATTEMPT_INSPECT_FIRST'
 save('android-publication-started.json',{'approvedCheckpoint':'553ac83c','startedAt':datetime.datetime.now(datetime.timezone.utc).isoformat()})
 result=run(['update','--channel','production','--platform','android','--skip-bundler','--input-dir',str(E/'release-artifact-android'),'--message','ZETRA-CURRENCY-AUTH-WORKSPACE-RECOVERY-20261020 approved 553ac83c','--non-interactive','--json'],'android-publication',600)
 save('android-publication.private.json',result)
 u=channel('android-channel-after');assert u['group']!=OLD
 print(json.dumps(save('android-publication.json',{'status':'SUCCESS','channel':'production','runtime':'1.0.0','updateId':u['id'],'group':u['group'],'rollbackGroup':OLD,'physicalDevice':'NOT TESTED'})))
elif mode=='verify':print(json.dumps(channel('android-channel-after')))
elif mode=='rollback':
 expected=json.loads((D/'android-publication.json').read_text())['group'];assert channel('android-channel-before-rollback')['group']==expected
 run(['update:republish','--group',OLD,'--destination-channel','production','--platform','android','--message','Verified rollback Currency UI refinement','--non-interactive','--json'],'android-rollback',600)
 print(json.dumps(channel('android-channel-rollback')))
else:raise SystemExit('UNKNOWN MODE')
