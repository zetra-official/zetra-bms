"""GET metadata only. No deploy, update, migration, or financial endpoint."""
from pathlib import Path
import json,urllib.request,subprocess,datetime
E=Path(__file__).resolve().parent;SITE='40a9e840-5437-480e-bc63-8391d6d0ef24'
config=json.loads(Path(r'C:\Users\ZetraAdmin\AppData\Roaming\netlify\Config\config.json').read_text());a=config['users'][config['userId']]['auth'];token=(a.get('token') or a.get('access_token')) if isinstance(a,dict) else a
opener=urllib.request.build_opener(urllib.request.ProxyHandler({}))
def get(path):
 assert path.startswith('/sites/'+SITE) or path.startswith('/deploys/')
 req=urllib.request.Request('https://api.netlify.com/api/v1'+path,headers={'Authorization':'Bearer '+token},method='GET')
 with opener.open(req,timeout=30) as r:return json.load(r)
site=get('/sites/'+SITE);assert site['custom_domain']=='app.zetra.tz' and site['published_deploy']['id']=='6ad49c64c2acd6e0352f242f','WEB_BASELINE_DRIFT'
rollback=get('/deploys/6ad49c64c2acd6e0352f242f');assert rollback['state']=='ready'
cli=r'C:\Users\ZetraAdmin\AppData\Roaming\npm\node_modules\eas-cli\bin\run'
p=subprocess.run(['node',cli,'channel:view','production','--json','--non-interactive'],cwd=E/'release-source-android',capture_output=True,text=True,encoding='utf-8',errors='replace',timeout=90);assert p.returncode==0,'EAS_READ_FAILED'
v=json.loads(p.stdout[p.stdout.index('{'):]);page=v.get('currentPage',v);assert page['name']=='production' and page['isPaused'] is False
updates=[u for b in page['updateBranches'] for g in b['updateGroups'] for u in (g if isinstance(g,list) else [g]) if u.get('platform')=='android'];u=updates[0]
assert u['group']=='9ae993b5-1566-41ea-821c-3cc94dce0151' and u['runtimeVersion']=='1.0.0','ANDROID_BASELINE_DRIFT'
result={'status':'PASS','checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'readOnly':True,'webSite':SITE,'webDomain':'app.zetra.tz','webActiveAndRollback':rollback['id'],'webRollbackState':'ready','androidChannel':'production','androidUpdate':u['id'],'androidRollbackGroup':u['group'],'androidRuntime':u['runtimeVersion'],'publicationExecuted':False,'productionSql':[],'financialWrites':False}
(E/'CURRENT-TARGETS-READONLY.json').write_text(json.dumps(result,indent=2),encoding='utf-8');print(json.dumps(result))
