from pathlib import Path
import json,urllib.request
E=Path(__file__).resolve().parent;site='40a9e840-5437-480e-bc63-8391d6d0ef24'
c=json.loads(Path(r'C:\Users\ZetraAdmin\AppData\Roaming\netlify\Config\config.json').read_text());a=c['users'][c['userId']]['auth'];token=(a.get('token') or a.get('access_token')) if isinstance(a,dict) else a
req=urllib.request.Request('https://api.netlify.com/api/v1/sites/'+site,headers={'Authorization':'Bearer '+token})
with urllib.request.build_opener(urllib.request.ProxyHandler({})).open(req,timeout=30) as response:s=json.load(response)
assert s['id']==site and s['custom_domain']=='app.zetra.tz';d=s['published_deploy'];out={'site':site,'domain':s['custom_domain'],'deploymentId':d['id'],'state':d['state'],'deployUrl':d.get('deploy_ssl_url'),'publishedAt':d.get('published_at'),'readOnly':True}
(E/'CATALOG-NETLIFY-BASELINE.json').write_text(json.dumps(out,indent=2));print(json.dumps(out))
