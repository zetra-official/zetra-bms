"""Owner-authorized exact-site Web-only Live Finance patch. Never logs credentials."""
from pathlib import Path
import json,hashlib,urllib.request,urllib.parse,subprocess,time,sys
ROOT=Path(__file__).resolve().parents[1]
E=Path(r'C:\Users\ZetraAdmin\.codex\visualizations\2026\10\12\01a1315c-d129-7d72-ade1-22efb743232c\main-project-release\finance-mobile-ui')
E.mkdir(exist_ok=True)
OUT=ROOT/'dist/unified-web';SITE='40a9e840-5437-480e-bc63-8391d6d0ef24';PREVIOUS='6ad32977f4f57987d81127f9';REVISION=(E/'SOURCE-REVISION.txt').read_text().strip()
c=json.loads(Path(r'C:\Users\ZetraAdmin\AppData\Roaming\netlify\Config\config.json').read_text());a=c['users'][c['userId']]['auth'];token=(a.get('token') or a.get('access_token')) if isinstance(a,dict) else a
opener=urllib.request.build_opener(urllib.request.ProxyHandler({}))
def api(method,path,data=None):
 assert path.startswith('/sites/'+SITE) or path.startswith('/deploys/')
 body=json.dumps(data).encode() if isinstance(data,dict) else data
 req=urllib.request.Request('https://api.netlify.com/api/v1'+path,data=body,method=method,headers={'Authorization':'Bearer '+token,'Content-Type':'application/json' if isinstance(data,dict) else 'application/octet-stream'})
 with opener.open(req,timeout=90) as res:return json.load(res)
site=api('GET','/sites/'+SITE);assert site['id']==SITE and site['custom_domain']=='app.zetra.tz'
mode=sys.argv[1]
if mode=='draft':
 assert site['published_deploy']['id']==PREVIOUS,'Live changed: stop'
 assert subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip()==REVISION
 assert json.loads((ROOT/'tests/release/live-finance-render-results.json').read_text())['status']=='PASS'
 assert not (E/'draft.json').exists(),'Draft already created: inspect receipt, do not retry automatically'
 (OUT/'release.json').write_text(json.dumps({'revision':REVISION,'scope':'Mobile Web Finance presentation only; canonical calculations unchanged','backendMigrations':0}))
 (OUT/'_redirects').write_text('/* /index.html 200\n')
 files={};source={};hashes={}
 for f in OUT.rglob('*'):
  if not f.is_file():continue
  rel=f.relative_to(OUT).as_posix();assert not rel.endswith(('.map','.sql','.env','.ps1','.py'))
  b=f.read_bytes();assert b'-----BEGIN PRIVATE KEY-----' not in b and b'-----BEGIN RSA PRIVATE KEY-----' not in b
  sha=hashlib.sha1(b).hexdigest();files['/'+rel]=sha;source[sha]=(rel,f);hashes[rel]=hashlib.sha256(b).hexdigest()
 (E/'artifact-sha256.json').write_text(json.dumps(hashes,indent=2))
 (E/'before.json').write_text(json.dumps({'site':SITE,'previous':PREVIOUS,'revision':REVISION},indent=2))
 d=api('POST','/sites/'+SITE+'/deploys',{'files':files,'draft':True,'title':'Finance Mobile UI '+REVISION[:12]});assert d['site_id']==SITE
 (E/'draft.json').write_text(json.dumps(d,indent=2))
 for sha in d.get('required',[]):
  rel,f=source[sha];api('PUT','/deploys/'+d['id']+'/files/'+urllib.parse.quote(rel,safe='/'),f.read_bytes())
 for _ in range(60):
  d=api('GET','/deploys/'+d['id']);(E/'draft.json').write_text(json.dumps(d,indent=2))
  if d['state'] in ['ready','error']:break
  time.sleep(2)
 assert d['state']=='ready','Draft failed; do not publish'
 print(json.dumps({'state':d['state'],'id':d['id'],'url':d['deploy_ssl_url']}))
elif mode in ['publish','rollback']:
 d=json.loads((E/'draft.json').read_text());assert d['site_id']==SITE
 target=d['id'] if mode=='publish' else PREVIOUS
 if mode=='publish':
  assert site['published_deploy']['id']==PREVIOUS,'Live changed: stop'
  assert json.loads((E/'draft-smoke.json').read_text())['status']=='PASS'
 api('POST','/sites/'+SITE+'/deploys/'+target+'/restore',{})
 s=api('GET','/sites/'+SITE);assert s['published_deploy']['id']==target
 receipt={'status':'PUBLISHED' if mode=='publish' else 'ROLLED_BACK','site':SITE,'deploymentId':target,'url':s['ssl_url'],'revision':REVISION,'rollbackDeployment':PREVIOUS,'databaseMigrations':0}
 (E/(mode+'.json')).write_text(json.dumps(receipt,indent=2));print(json.dumps(receipt))
else:raise SystemExit('Unsupported operation')
