from pathlib import Path
import json,urllib.request
D=Path(__file__).parent
c=json.loads(Path(r'C:\Users\ZetraAdmin\AppData\Roaming\netlify\Config\config.json').read_text());a=c['users'][c['userId']]['auth'];token=(a.get('token') or a.get('access_token')) if isinstance(a,dict) else a
identifier=json.loads((D/'upload.private.json').read_text())['id']
op=urllib.request.build_opener(urllib.request.ProxyHandler({}))
with op.open(urllib.request.Request('https://api.netlify.com/api/v1/deploys/'+identifier,headers={'Authorization':'Bearer '+token}),timeout=30) as r:v=json.load(r)
print(json.dumps({'deploymentId':identifier,'state':v['state'],'remainingRequired':len(v.get('required',[])),'error':v.get('error_message')}))
