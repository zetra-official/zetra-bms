"""Owner-approved scoped Web only. No SQL, OTA or financial requests."""
from pathlib import Path
import json,hashlib,urllib.request,urllib.parse,sys,time,concurrent.futures
E=Path(__file__).resolve().parent;D=E/'production';D.mkdir(exist_ok=True);SITE='40a9e840-5437-480e-bc63-8391d6d0ef24';OLD='6ad754388b1e0ec9dc9d905d'
read=lambda p:json.loads(p.read_text(encoding='utf-8'));sha=lambda b:hashlib.sha256(b).hexdigest()
def save(n,v):(D/n).write_text(json.dumps(v,indent=2));return v
package=read(E/'WEB-RELEASE.json');assert package['ownerApprovedWebPublication'] and package['sql']==[]
assert sha((E/'WEB-ARTIFACT-SHA256.json').read_bytes())==package['artifactManifestSha256']
assert sha((E/'SOURCE-DELTA.json').read_bytes())==package['sourceDeltaSha256']
assert sha((E/'customer-bugfix-web-source.zip').read_bytes())==package['sourceZipSha256']
files=read(E/'WEB-ARTIFACT-SHA256.json');root=E/'release-artifact-web';assert set(files)=={p.relative_to(root).as_posix() for p in root.rglob('*') if p.is_file()}
for f,h in files.items():assert sha((root/f).read_bytes())==h,('ARTIFACT_DRIFT',f)
config=read(Path(r'C:\Users\ZetraAdmin\AppData\Roaming\netlify\Config\config.json'));auth=config['users'][config['userId']]['auth'];token=(auth.get('token') or auth.get('access_token')) if isinstance(auth,dict) else auth
op=urllib.request.build_opener(urllib.request.ProxyHandler({}))
def api(method,path,body=None):
 assert path.startswith('/sites/'+SITE) or path.startswith('/deploys/')
 data=json.dumps(body).encode() if isinstance(body,dict) else body
 req=urllib.request.Request('https://api.netlify.com/api/v1'+path,data=data,method=method,headers={'Authorization':'Bearer '+token,'Content-Type':'application/json' if isinstance(body,dict) else 'application/octet-stream'})
 with op.open(req,timeout=90) as r:return json.load(r)
def site():
 s=api('GET','/sites/'+SITE);assert s['custom_domain']=='app.zetra.tz';return s
def get(url,headers={}):
 with op.open(urllib.request.Request(url,headers=headers),timeout=90) as r:return r.read()
mode=sys.argv[1]
if mode=='preflight':
 assert site()['published_deploy']['id']==OLD,'PRODUCTION_DRIFT';assert api('GET','/deploys/'+OLD)['state']=='ready'
 print(json.dumps(save('preflight.json',{'status':'PASS','package':package['id'],'webBaseline':OLD,'webRollbackReady':True,'sourceFiles':list(read(E/'SOURCE-DELTA.json')['changedFiles']),'approvedWebScope':True,'sql':[],'androidPublished':False})))
elif mode=='upload':
 assert read(D/'preflight.json')['status']=='PASS' and site()['published_deploy']['id']==OLD
 assert not(D/'upload.private.json').exists(),'EXISTING_UPLOAD_INSPECT_FIRST'
 byHash={hashlib.sha1((root/f).read_bytes()).hexdigest():f for f in files}
 d=api('POST','/sites/'+SITE+'/deploys',{'draft':True,'title':package['id']+' Owner-approved scoped bugfix','files':{'/'+f:hashlib.sha1((root/f).read_bytes()).hexdigest() for f in files}});assert d['site_id']==SITE;save('upload.private.json',d)
 for h in d.get('required',[]):
  f=byHash[h];api('PUT','/deploys/'+d['id']+'/files/'+urllib.parse.quote(f,safe='/'),(root/f).read_bytes())
 for _ in range(60):
  d=api('GET','/deploys/'+d['id']);save('upload.private.json',d)
  if d['state'] in ['ready','error']:break
  time.sleep(2)
 assert d['state']=='ready'
 print(json.dumps(save('upload.json',{'status':'READY','deploymentId':d['id'],'url':d['deploy_ssl_url']})))
elif mode in ['smoke-candidate','smoke-production']:
 stage='candidate' if mode=='smoke-candidate' else 'production';base=read(D/'upload.json')['url'] if stage=='candidate' else 'https://app.zetra.tz'
 for f in ['index.html','login.html','_redirects']:
  if f=='_redirects':continue
  assert sha(get(base+'/'+f))==files[f],('HOSTED_HTML_DRIFT',f)
 f=package['webEntry'];size=(root/f).stat().st_size
 def chunk(n):
  start=n*524288;end=min(size-1,start+524287)
  for attempt in range(3):
   try:
    b=get(base+'/'+f,{'Range':f'bytes={start}-{end}'});assert len(b)==end-start+1;return b
   except Exception:
    if attempt==2:raise
 with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:bundle=b''.join(pool.map(chunk,range((size+524287)//524288)))
 assert sha(bundle)==files[f],'HOSTED_BUNDLE_DRIFT'
 routes=['sales','sales/checkout','products','finance/live','reports','exchange-rates']
 for route in routes:assert b'<html' in get(base+'/'+route).lower()
 assert b'user-scalable=no' not in get(base+'/index.html') and b'maximum-scale=1' not in get(base+'/index.html')
 for name in ['bot','ecb']:
  data=get(base+'/api/reference-fx/'+name);assert (b'Exchange' in data or b'Rate' in data or b'Cube' in data);(D/(stage+'-'+name+'.public-feed')).write_bytes(data)
 print(json.dumps(save(stage+'-smoke.json',{'status':'PASS','deploymentId':read(D/'upload.json')['deploymentId'],'exactHostedHtmlAndBundle':True,'routes':routes,'fxProxies':'PASS','pinchZoomNotDisabled':True,'financialWrites':False})))
elif mode in ['publish','rollback']:
 target=read(D/'upload.json')['deploymentId'] if mode=='publish' else OLD
 if mode=='publish':assert site()['published_deploy']['id']==OLD and read(D/'candidate-smoke.json')['status']=='PASS' and read(D/'candidate-fx-smoke.json')['status']=='PASS'
 api('POST','/sites/'+SITE+'/deploys/'+target+'/restore',{});assert site()['published_deploy']['id']==target
 print(json.dumps(save(mode+'.json',{'status':'SUCCESS','deploymentId':target,'domain':'https://app.zetra.tz','rollback':OLD,'sql':[],'androidPublished':False})))
elif mode=='verify':
 assert site()['published_deploy']['id']==read(D/'upload.json')['deploymentId'];assert api('GET','/deploys/'+OLD)['state']=='ready'
 print(json.dumps(save('final-verification.json',{'status':'PASS','deploymentId':site()['published_deploy']['id'],'rollbackReady':OLD,'exactArtifactHashes':'PASS','sql':[]})))
else:raise SystemExit('UNSUPPORTED_MODE')
