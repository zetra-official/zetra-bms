"""Owner-approved exact currency display release. No SQL or financial endpoints."""
from pathlib import Path
import json,hashlib,urllib.request,urllib.parse,subprocess,sys,time
E=Path(__file__).resolve().parent;R=E.parent.parent;D=E/'production-execution';D.mkdir(exist_ok=True)
SITE='40a9e840-5437-480e-bc63-8391d6d0ef24';OLD='6ad49c64c2acd6e0352f242f';GROUP='9ae993b5-1566-41ea-821c-3cc94dce0151'
CLI=r'C:\Users\ZetraAdmin\AppData\Roaming\npm\node_modules\eas-cli\bin\run'
read=lambda p:json.loads(p.read_text(encoding='utf-8'));sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
def save(name,value):
 (D/name).write_text(json.dumps(value,indent=2),encoding='utf-8');return value
def verify():
 p=read(E/'PRODUCTION-APPROVAL.json');assert p['id']=='ZETRA-CURRENCY-DISPLAY-20261020' and not p['productionSql'] and not p['financialWrites']
 assert subprocess.check_output(['git','rev-parse','HEAD'],cwd=R,text=True).strip()=='25fd815b10906511f6237739d250bb57eb0a15bc','CHECKPOINT_DRIFT'
 for f,h in p['sha256'].items():assert sha(E/f)==h,('APPROVAL_HASH_DRIFT',f)
 a=read(E/'SEALED-ARTIFACTS.json')
 for platform,v in a.items():
  root=E/('release-artifact-'+platform)
  assert set(v['files'])=={f.relative_to(root).as_posix() for f in root.rglob('*') if f.is_file()},'EXTRA_ARTIFACT_FILE'
  for f,h in v['files'].items():assert sha(root/f)==h,('ARTIFACT_DRIFT',platform,f)
  m=read(E/('isolated-'+platform+'-source-manifest.json'))
  for f,h in m['allSourceFiles'].items():assert sha(E/('release-source-'+platform)/f)==h,('SOURCE_DRIFT',platform,f)
 assert sha(R/'app/catalog.tsx')=='a6b548a9567803d9db181b4d6f236349b55afddfc115ead7ba9f6d449c1b4914'
 app=read(E/'release-source-android/app.json')['expo']
 assert app['version']=='1.0.0' and app['runtimeVersion']=={'policy':'appVersion'}
 assert app['android']['package']=='com.anonymous.zetrabmsclean'
 assert app['updates']['enabled'] and app['updates']['url']=='https://u.expo.dev/a8536709-2bea-40f4-8dd7-01563bd08c70'
 return a
config=read(Path(r'C:\Users\ZetraAdmin\AppData\Roaming\netlify\Config\config.json'));auth=config['users'][config['userId']]['auth'];token=(auth.get('token') or auth.get('access_token')) if isinstance(auth,dict) else auth
opener=urllib.request.build_opener(urllib.request.ProxyHandler({}))
def api(method,path,data=None):
 assert path.startswith('/sites/'+SITE) or path.startswith('/deploys/')
 body=json.dumps(data).encode() if isinstance(data,dict) else data
 req=urllib.request.Request('https://api.netlify.com/api/v1'+path,data=body,method=method,headers={'Authorization':'Bearer '+token,'Content-Type':'application/json' if isinstance(data,dict) else 'application/octet-stream'})
 with opener.open(req,timeout=90) as response:return json.load(response)
def site():
 s=api('GET','/sites/'+SITE);assert s['id']==SITE and s['custom_domain']=='app.zetra.tz';return s
def channel():
 p=subprocess.run(['node',CLI,'channel:view','production','--json','--non-interactive'],cwd=E/'release-source-android',capture_output=True,text=True,encoding='utf-8',errors='replace',timeout=90)
 assert p.returncode==0,'EAS_CHANNEL_READ_FAILED'
 v=json.loads(p.stdout[p.stdout.index('{'):]);page=v.get('currentPage',v)
 assert page['name']=='production' and page['isPaused'] is False
 branches=page['updateBranches'];assert len(branches)==1 and branches[0]['name']=='production'
 updates=[u for b in branches for g in b.get('updateGroups',[]) for u in (g if isinstance(g,list) else [g]) if u.get('platform')=='android']
 return {'channel':page['name'],'branch':branches[0]['name'],'latestAndroid':[{k:u.get(k) for k in ['id','group','runtimeVersion','createdAt']} for u in updates[:3]]}
mode=sys.argv[1];artifacts=verify()
if mode=='preflight':
 s=site();assert s['published_deploy']['id']==OLD,'WEB_BASELINE_DRIFT'
 rollback=api('GET','/deploys/'+OLD);assert rollback['state']=='ready'
 c=channel();assert c['latestAndroid'][0]['group']==GROUP and c['latestAndroid'][0]['runtimeVersion']=='1.0.0','ANDROID_BASELINE_DRIFT'
 result=save('preflight.json',{'status':'PASS','package':'ZETRA-CURRENCY-DISPLAY-20261020','approvedCheckpoint':'25fd815b','approvalSha256':sha(E/'PRODUCTION-APPROVAL.json'),'webPrevious':OLD,'androidBefore':c,'rollbackReady':True,'sql':[],'financialWrites':False})
 print(json.dumps(result))
elif mode=='prepare-web':
 assert read(D/'preflight.json')['status']=='PASS';assert site()['published_deploy']['id']==OLD
 assert not(D/'web-upload.json').exists(),'EXISTING_UPLOAD_INSPECT_FIRST'
 files={};upload={};root=E/'release-artifact-web'
 for rel in artifacts['web']['files']:
  p=root/rel;h=hashlib.sha1(p.read_bytes()).hexdigest();files['/'+rel]=h;upload[h]=(rel,p)
 d=api('POST','/sites/'+SITE+'/deploys',{'files':files,'draft':True,'title':'Owner-approved ZETRA-CURRENCY-DISPLAY-20261020 / 25fd815b'})
 assert d['site_id']==SITE;save('web-upload.json',d)
 for h in d.get('required',[]):
  rel,p=upload[h];api('PUT','/deploys/'+d['id']+'/files/'+urllib.parse.quote(rel,safe='/'),p.read_bytes())
 for _ in range(60):
  d=api('GET','/deploys/'+d['id']);save('web-upload.json',d)
  if d['state'] in ['ready','error']:break
  time.sleep(2)
 assert d['state']=='ready','WEB_UPLOAD_NOT_READY'
 print(json.dumps({'status':'READY_FOR_ATOMIC_PUBLICATION','deploymentId':d['id'],'url':d['deploy_ssl_url']}))
elif mode in ['publish-web','rollback-web']:
 d=read(D/'web-upload.json');assert d['site_id']==SITE
 target=d['id'] if mode=='publish-web' else OLD
 if mode=='publish-web':
  assert site()['published_deploy']['id']==OLD,'WEB_BASELINE_DRIFT'
  assert read(D/'web-prepublication-smoke.json')['status']=='PASS'
 api('POST','/sites/'+SITE+'/deploys/'+target+'/restore',{})
 s=site();assert s['published_deploy']['id']==target
 print(json.dumps(save(mode+'.json',{'status':'PUBLISHED' if mode=='publish-web' else 'ROLLED_BACK','deploymentId':target,'domain':s['ssl_url'],'rollback':OLD,'sql':[],'financialWrites':False})))
elif mode=='publish-android':
 assert read(D/'web-production-smoke.json')['status']=='PASS','WEB_SMOKE_REQUIRED'
 c=channel();assert c['latestAndroid'][0]['group']==GROUP,'ANDROID_BASELINE_DRIFT'
 assert not(D/'android-publication.private.log').exists(),'PREVIOUS_PUBLICATION_ATTEMPT_INSPECT_FIRST'
 args=['node',CLI,'update','--channel','production','--platform','android','--skip-bundler','--input-dir',str(E/'release-artifact-android'),'--message','ZETRA-CURRENCY-DISPLAY-20261020 approved 25fd815b','--non-interactive','--json']
 p=subprocess.run(args,cwd=E/'release-source-android',capture_output=True,text=True,encoding='utf-8',errors='replace',timeout=600)
 (D/'android-publication.private.log').write_text(p.stdout+'\n'+p.stderr,encoding='utf-8')
 assert p.returncode==0,'ANDROID_PUBLICATION_FAILED_INSPECT_PRIVATE_LOG'
 save('android-channel-after.json',channel());print(json.dumps(read(D/'android-channel-after.json')))
elif mode=='verify-rollback':
 s=site();assert s['published_deploy']['id']==OLD,'ROLLBACK_DEPLOYMENT_MISMATCH'
 c=channel();assert c['latestAndroid'][0]['group']==GROUP,'ANDROID_WAS_CHANGED'
 original=read(E/'production-preimage-readonly.json')
 file=next(f for f in original['files'] if f['path']=='/index.html')
 with opener.open('https://app.zetra.tz/index.html',timeout=60) as response:data=response.read()
 assert hashlib.sha1(data).hexdigest()==file['sha'],'ROLLBACK_HOSTED_BYTES_MISMATCH'
 print(json.dumps(save('rollback-verification.json',{'status':'PASS','webDeployment':OLD,'hostedIndexMatchesPrevious':True,'android':c,'financialWrites':False,'sql':[],'rolloutStopped':True})))
elif mode=='verify-channel':print(json.dumps(save('android-channel-after.json',channel())))
else:raise SystemExit('UNSUPPORTED_MODE')
