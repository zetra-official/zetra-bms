"""Existing Netlify/EAS channel metadata only, preserving current rollback identity."""
from pathlib import Path
import json,urllib.request,subprocess,datetime
E=Path(__file__).resolve().parent;P=E/'production-20261021';SITE='40a9e840-5437-480e-bc63-8391d6d0ef24'
config=json.loads(Path(r'C:\Users\ZetraAdmin\AppData\Roaming\netlify\Config\config.json').read_text());auth=config['users'][config['userId']]['auth'];token=(auth.get('token') or auth.get('access_token')) if isinstance(auth,dict) else auth
with urllib.request.urlopen(urllib.request.Request('https://api.netlify.com/api/v1/sites/'+SITE,headers={'Authorization':'Bearer '+token}),timeout=30) as r:site=json.load(r)
assert site['custom_domain']=='app.zetra.tz';deploy=site['published_deploy'];assert deploy['state']=='ready'
cli=r'C:\Users\ZetraAdmin\AppData\Roaming\npm\node_modules\eas-cli\bin\run'
r=subprocess.run(['node',cli,'channel:view','production','--json','--non-interactive'],cwd=E/'source-android',capture_output=True,text=True,encoding='utf-8',timeout=120)
(P/'eas-channel.private.log').write_text(r.stdout+'\n'+r.stderr,encoding='utf-8');assert r.returncode==0
v=json.loads(r.stdout[min(i for i in [r.stdout.find('{'),r.stdout.find('[')] if i>=0):]);page=v.get('currentPage',v)
assert page['name']=='production' and page['isPaused'] is False
updates=[u for b in page['updateBranches'] for g in b['updateGroups'] for u in (g if isinstance(g,list) else [g]) if u.get('platform')=='android'];u=updates[0];assert u['runtimeVersion']=='1.0.0'
result={'readOnly':True,'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'site':SITE,'webRollback':deploy['id'],'webDomain':'https://app.zetra.tz','androidChannel':'production','androidRuntime':'1.0.0','androidRollbackGroup':u['group'],'androidRollbackUpdate':u['id'],'publication':False}
(P/'TARGETS.json').write_text(json.dumps(result,indent=2));print(json.dumps(result))
