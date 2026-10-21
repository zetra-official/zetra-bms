from pathlib import Path
import json,subprocess,sys,hashlib,datetime
E=Path(__file__).resolve().parent;P=E/'production-20261021';CLI=r'C:\Users\ZetraAdmin\AppData\Roaming\npm\node_modules\eas-cli\bin\run';read=lambda n:json.loads((P/n).read_text(encoding='utf-8'));OLD='a22b1c60-6970-4912-887c-72bf70849579'
def save(n,v):(P/n).write_text(json.dumps(v,indent=2),encoding='utf-8');return v
def run(args,name,timeout=120):
 r=subprocess.run(['node',CLI,*args],cwd=E/'source-android',capture_output=True,text=True,encoding='utf-8',errors='replace',timeout=timeout)
 (P/(name+'.private.log')).write_text(r.stdout+'\n'+r.stderr,encoding='utf-8');assert r.returncode==0,name+' failed; inspect private diagnostic'
 return json.loads(r.stdout[min(i for i in [r.stdout.find('{'),r.stdout.find('[')] if i>=0):])
def channel(name):
 v=run(['channel:view','production','--json','--non-interactive'],name);page=v.get('currentPage',v)
 assert page['name']=='production' and page['isPaused'] is False
 assert len(page['updateBranches'])==1 and page['updateBranches'][0]['name']=='production'
 updates=[u for branch in page['updateBranches'] for group in branch['updateGroups'] for u in (group if isinstance(group,list) else [group]) if u.get('platform')=='android'];assert updates[0]['runtimeVersion']=='1.0.0'
 save(name+'.json',{'channel':'production','latestAndroid':[{k:u.get(k) for k in ['id','group','runtimeVersion','platform','createdAt']} for u in updates]});return updates[0]
mode=sys.argv[1]
if mode=='publish':
 assert read('WEB-PRODUCTION.json')['status']=='PASS' and read('PRODUCTION-UI.json')['status']=='PASS' and read('SQL-VERIFIED.json')['status']=='PASS'
 b=read('BUILD-android.json');manifest=read('RELEASE-MANIFEST.json');root=Path(b['artifact'])
 assert hashlib.sha256((P/'BUILD-android.json').read_bytes()).hexdigest()==manifest['platforms']['android']['descriptorSHA256']
 assert all(hashlib.sha256((root/f).read_bytes()).hexdigest()==h for f,h in b['files'].items())
 app=json.loads((E/'source-android/app.json').read_text())['expo'];assert app['version']=='1.0.0' and app['runtimeVersion']=={'policy':'appVersion'} and app['updates']['url']=='https://u.expo.dev/a8536709-2bea-40f4-8dd7-01563bd08c70'
 assert channel('ANDROID-BEFORE')['group']==OLD,'Production channel drift'
 assert not (P/'android-started.json').exists(),'Inspect existing attempt first'
 save('android-started.json',{'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'checkpoint':'d67c5659'})
 result=run(['update','--channel','production','--platform','android','--skip-bundler','--input-dir',str(root),'--message',manifest['release']+' d67c5659','--non-interactive','--json'],'android-publication',900)
 save('android-publication.private.json',result);u=channel('ANDROID-AFTER');assert u['group']!=OLD
 rows=result if isinstance(result,list) else result.get('updates',[result]);assert any(v.get('id')==u['id'] or v.get('group')==u['group'] for v in rows),'Publication identity mismatch'
 print(json.dumps(save('ANDROID-PUBLICATION.json',{'status':'SUCCESS','channel':'production','runtime':'1.0.0','updateId':u['id'],'group':u['group'],'rollbackGroup':OLD,'physicalDevice':'NOT TESTED'})))
elif mode=='verify':print(json.dumps(channel('ANDROID-AFTER')))
elif mode=='rollback':
 assert channel('ANDROID-BEFORE-ROLLBACK')['group']==read('ANDROID-PUBLICATION.json')['group']
 run(['update:republish','--group',OLD,'--destination-channel','production','--platform','android','--message','Combined M3 verified rollback','--non-interactive','--json'],'android-rollback',900);print(json.dumps(channel('ANDROID-ROLLBACK')))
else:raise SystemExit('unsupported mode')
