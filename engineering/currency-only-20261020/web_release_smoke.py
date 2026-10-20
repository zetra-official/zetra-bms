from pathlib import Path
import json,hashlib,urllib.request,subprocess,sys,datetime,http.client,concurrent.futures
E=Path(__file__).resolve().parent;D=E/'production-execution';stage=sys.argv[1];assert stage in ['prepublication','production']
read=lambda p:json.loads(p.read_text(encoding='utf-8'))
base=read(D/'web-upload.json')['deploy_ssl_url'] if stage=='prepublication' else 'https://app.zetra.tz'
opener=urllib.request.build_opener(urllib.request.ProxyHandler({}))
def get(path):
 req=urllib.request.Request(base+path,headers={'Cache-Control':'no-cache'})
 with opener.open(req,timeout=60) as r:
  assert r.status==200;return r.read(),r.geturl(),r.headers.get('Content-Type','')
def exact_file(rel):
 p=E/'release-artifact-web'/rel;size=p.stat().st_size
 if size<1000000:return get('/'+rel)[0]
 def chunk(start):
  end=min(size-1,start+524287)
  for attempt in range(3):
   try:
    req=urllib.request.Request(base+'/'+rel,headers={'Range':f'bytes={start}-{end}','Accept-Encoding':'identity'})
    with opener.open(req,timeout=60) as r:
     assert r.status==206 and r.headers['Content-Range']==f'bytes {start}-{end}/{size}','RANGE_NOT_SUPPORTED'
     data=r.read();assert len(data)==end-start+1;return data
   except (http.client.IncompleteRead,TimeoutError):
    if attempt==2:raise
 with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:return b''.join(pool.map(chunk,range(0,size,524288)))
files=read(E/'SEALED-ARTIFACTS.json')['web']['files'];checked=[]
for rel in ['login.html','index.html',next(k for k in files if k.endswith('.js'))]:
 data=exact_file(rel);assert hashlib.sha256(data).hexdigest()==files[rel],('HOSTED_HASH_MISMATCH',rel);checked.append(rel)
for route in ['/finance/live','/finance/history','/stocks/history','/sales','/settings/business-statement','/finance/exchange-rates','/login']:
 data,url,kind=get(route);assert 'text/html' in kind and len(data)>100;checked.append(route)
for provider in ['bot','ecb']:
 data,url,kind=get('/api/reference-fx/'+provider);assert len(data)<400000
 assert (b'<Cube' in data or b'<gesmes:Envelope' in data) if provider=='ecb' else b'table1' in data
 (D/(stage+'-'+provider+'.public-feed')).write_bytes(data)
subprocess.run(['node',str(E/'production_fx_smoke.cjs'),stage],cwd=E.parent.parent,check=True)
result={'status':'PASS','stage':stage,'url':base,'routesAndExactFilesChecked':checked,'officialFxProxyFeeds':'PASS','sql':[],'financialWrites':False,'timestamp':datetime.datetime.now(datetime.timezone.utc).isoformat()}
out='web-prepublication-smoke.json' if stage=='prepublication' else 'web-production-smoke.json'
(D/out).write_text(json.dumps(result,indent=2),encoding='utf-8');print(json.dumps(result))
