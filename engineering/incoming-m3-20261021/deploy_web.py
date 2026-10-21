"""Exact Owner-approved Combined M3 artifact, existing Netlify site only."""
from pathlib import Path
import json,hashlib,urllib.request,urllib.parse,urllib.error,sys,time,concurrent.futures
E=Path(__file__).resolve().parent;P=E/'production-20261021';read=lambda p:json.loads(p.read_text(encoding='utf-8'));sha=lambda b:hashlib.sha256(b).hexdigest()
m=read(P/'RELEASE-MANIFEST.json');b=read(P/'BUILD-web.json');root=Path(b['artifact']);files=b['files'];SITE='40a9e840-5437-480e-bc63-8391d6d0ef24';OLD='6ad7c9964f937e8f233408c1'
assert sha((P/'BUILD-web.json').read_bytes())==m['platforms']['web']['descriptorSHA256']
assert all(sha((root/f).read_bytes())==h for f,h in files.items())
config=read(Path(r'C:\Users\ZetraAdmin\AppData\Roaming\netlify\Config\config.json'));auth=config['users'][config['userId']]['auth'];token=(auth.get('token') or auth.get('access_token')) if isinstance(auth,dict) else auth
op=urllib.request.build_opener(urllib.request.ProxyHandler({}))
def save(n,v):(P/n).write_text(json.dumps(v,indent=2),encoding='utf-8');return v
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
if mode=='inspect':
 d=api('GET','/sites/'+SITE+'/deploys/'+read(P/'web-upload.private.json')['id']);save('web-upload-inspection.private.json',d);print(json.dumps({'state':d['state'],'required':len(d.get('required',[])),'hasRequired':'required' in d}))
elif mode=='inspect-files':
 d=read(P/'web-upload.private.json');listing=api('GET','/deploys/'+d['id']+'/files');save('web-files.private.json',listing);print(json.dumps({'records':len(listing),'sampleKeys':list(listing[0]) if listing else []}))
elif mode=='diagnose-upload':
 d=read(P/'web-upload.private.json')
 try:
  api('PUT','/deploys/'+d['id']+'/files/index.html',(root/'index.html').read_bytes());print('Single HTML upload accepted')
 except urllib.error.HTTPError as error:
  detail={'status':error.code,'retryAfter':error.headers.get('Retry-After'),'body':error.read().decode('utf-8','replace')[:1500]};save('UPLOAD-DIAGNOSTIC.json',detail);print(json.dumps(detail))
elif mode in ['upload','resume-upload']:
 assert site()['published_deploy']['id']==OLD,'Production drift'
 assert api('GET','/deploys/'+OLD)['state']=='ready'
 byHash={hashlib.sha1((root/f).read_bytes()).hexdigest():f for f in files}
 if mode=='upload':
  assert not (P/'web-upload.private.json').exists(),'Inspect existing upload first'
  d=api('POST','/sites/'+SITE+'/deploys',{'draft':True,'title':m['release'],'files':{'/'+f:hashlib.sha1((root/f).read_bytes()).hexdigest() for f in files}})
 else:d=api('GET','/sites/'+SITE+'/deploys/'+read(P/'web-upload.private.json')['id'])
 assert d['site_id']==SITE;save('web-upload.private.json',d)
 completed=read(P/'uploaded-hashes.json') if (P/'uploaded-hashes.json').exists() else []
 def upload(h):
  f=byHash[h]
  for attempt in range(5):
   try:
    api('PUT','/deploys/'+d['id']+'/files/'+urllib.parse.quote(f,safe='/'),(root/f).read_bytes());return
   except urllib.error.HTTPError as error:
    if error.code!=429 or attempt==4:raise
    time.sleep(max(30,int(error.headers.get('Retry-After','60'))))
 pending=d.get('required',[]) or (list(byHash) if d['state']=='uploading' else [])
 for h in pending:
  if h in completed:continue
  try:upload(h)
  except urllib.error.HTTPError:
   if api('GET','/deploys/'+d['id'])['state']=='ready':break
   raise
  completed.append(h);save('uploaded-hashes.json',completed);time.sleep(1)
 for _ in range(60):
  d=api('GET','/deploys/'+d['id']);save('web-upload.private.json',d)
  if d['state'] in ['ready','error']:break
  time.sleep(2)
 assert d['state']=='ready';print(json.dumps(save('WEB-UPLOAD.json',{'status':'READY','deploymentId':d['id'],'url':d['deploy_ssl_url'],'rollback':OLD})))
elif mode in ['candidate','production']:
 d=read(P/'WEB-UPLOAD.json');base=d['url'] if mode=='candidate' else 'https://app.zetra.tz'
 for f in ['index.html','login.html']:assert sha(get(base+'/'+f))==files[f],f
 entry=next(f for f in files if f.startswith('_expo/static/js/web/entry-') and f.endswith('.js'));raw=(root/entry).read_bytes();count=(len(raw)+262143)//262144
 def chunk(n):
  start=n*262144;end=min(len(raw),start+262144)-1
  data=get(base+'/'+entry,{'Range':f'bytes={start}-{end}'});assert data==raw[start:end+1],('chunk',n)
 if mode=='candidate':
  with concurrent.futures.ThreadPoolExecutor(8) as pool:list(pool.map(chunk,range(count)))
 else:
  assert read(P/'WEB-CANDIDATE.json')['status']=='PASS'
  for n in [0,count-1]:chunk(n)
 for route in ['stocks/bulk','stocks/inbound','stocks/receiving-receipt','products','sales','finance/live']:assert b'<html' in get(base+'/'+route).lower(),route
 print(json.dumps(save('WEB-'+mode.upper()+'.json',{'status':'PASS','deploymentId':d['deploymentId'],'artifactIntegrity':True,'routes':True,'customerFinancialWrites':False})))
elif mode in ['publish','rollback']:
 target=read(P/'WEB-UPLOAD.json')['deploymentId'] if mode=='publish' else OLD
 if mode=='publish':
  assert read(P/'WEB-CANDIDATE.json')['status']=='PASS';assert read(P/'SQL-EXECUTION.json')['status']=='SUCCESS';assert site()['published_deploy']['id']==OLD
 api('POST','/sites/'+SITE+'/deploys/'+target+'/restore',{});assert site()['published_deploy']['id']==target
 print(json.dumps(save('WEB-'+mode.upper()+'.json',{'status':'SUCCESS','deploymentId':target,'rollback':OLD})))
elif mode=='verify':
 assert site()['published_deploy']['id']==read(P/'WEB-UPLOAD.json')['deploymentId'];assert api('GET','/deploys/'+OLD)['state']=='ready'
 print(json.dumps(save('WEB-FINAL-VERIFICATION.json',{'status':'PASS','publishedDeployment':read(P/'WEB-UPLOAD.json')['deploymentId'],'rollbackDeployment':OLD,'rollbackReady':True})))
else:raise SystemExit('unsupported mode')
