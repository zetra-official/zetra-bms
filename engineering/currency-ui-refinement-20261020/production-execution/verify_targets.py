"""GET existing channel metadata only; no upload, deployment, SQL or financial endpoint."""
from pathlib import Path
import json,urllib.request,subprocess,datetime
E=Path(__file__).resolve().parent.parent;SITE='40a9e840-5437-480e-bc63-8391d6d0ef24';WEB='6ad76cf47622bc0a29e1244f';GROUP='6f0e3704-2774-44c8-afc5-34216997c808'
c=json.loads(Path(r'C:\Users\ZetraAdmin\AppData\Roaming\netlify\Config\config.json').read_text());a=c['users'][c['userId']]['auth'];token=(a.get('token') or a.get('access_token')) if isinstance(a,dict) else a
op=urllib.request.build_opener(urllib.request.ProxyHandler({}))
def get(p):
 assert p in ['/sites/'+SITE,'/deploys/'+WEB]
 with op.open(urllib.request.Request('https://api.netlify.com/api/v1'+p,method='GET',headers={'Authorization':'Bearer '+token}),timeout=30) as r:return json.load(r)
s=get('/sites/'+SITE);assert s['custom_domain']=='app.zetra.tz' and s['published_deploy']['id']==WEB,'WEB_CHANNEL_DRIFT';d=get('/deploys/'+WEB);assert d['state']=='ready'
p=subprocess.run(['node',r'C:\Users\ZetraAdmin\AppData\Roaming\npm\node_modules\eas-cli\bin\run','channel:view','production','--json','--non-interactive'],cwd=E/'source-android',capture_output=True,text=True,encoding='utf-8',errors='replace',timeout=90);assert p.returncode==0,'EAS_READ_FAILED';v=json.loads(p.stdout[p.stdout.index('{'):]);page=v.get('currentPage',v);assert page['name']=='production' and page['isPaused'] is False
updates=[u for b in page['updateBranches'] for g in b['updateGroups'] for u in (g if isinstance(g,list) else [g]) if u.get('platform')=='android'];u=updates[0];assert u['group']==GROUP and u['runtimeVersion']=='1.0.0','ANDROID_CHANNEL_DRIFT'
result={'status':'PASS','checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'readOnly':True,'site':SITE,'domain':'https://app.zetra.tz','webActiveAndRollback':WEB,'rollbackState':'ready','androidChannel':'production','androidBranch':'production','androidUpdate':u['id'],'androidRollbackGroup':u['group'],'runtime':u['runtimeVersion'],'publication':False,'sql':[],'financialWrites':False};(E/'production-execution/preflight-targets.json').write_text(json.dumps(result,indent=2));print(json.dumps(result))
