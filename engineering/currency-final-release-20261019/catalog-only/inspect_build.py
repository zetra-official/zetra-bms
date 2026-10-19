from pathlib import Path
import subprocess,json
D=Path(__file__).resolve().parent;cli='C:/Users/ZetraAdmin/AppData/Roaming/npm/node_modules/eas-cli/bin/run'
p=subprocess.run(['node',cli,'build:list','--platform','android','--limit','3','--json','--non-interactive'],capture_output=True,text=True,encoding='utf-8',errors='replace',timeout=90);(D/'eas-builds.private.log').write_text(p.stdout+'\n'+p.stderr,encoding='utf-8');assert p.returncode==0
rows=json.loads(p.stdout);result=[]
for b in rows:
 result.append({k:b.get(k) for k in ['id','status','platform','distribution','buildProfile','channel','appVersion','appBuildVersion','runtimeVersion','gitCommitHash','createdAt','completedAt']})
 result[-1]['artifactKeys']=list((b.get('artifacts') or {}).keys())
(D/'ANDROID-BUILD-DELIVERY.json').write_text(json.dumps({'readOnly':True,'builds':result,'publication':False},indent=2));print(json.dumps(result))
