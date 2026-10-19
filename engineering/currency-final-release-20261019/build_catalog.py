from pathlib import Path
import subprocess,json,os,sys
R=Path.cwd();D=Path(__file__).resolve().parent/'catalog-only';source=D/'build-source';results=json.loads((D/'BUILD-RESULTS.json').read_text())[:2] if '--web-only' in sys.argv else []
commands=[('guard',['node','scripts/release-guard.cjs']),('typescript',['node',str(R/'node_modules/typescript/bin/tsc'),'--noEmit','-p','tsconfig.json']),('web',['node',str(R/'node_modules/expo/bin/cli'),'export','--platform','web','--output-dir',str(R/'dist/catalog-only-hotfix')])]
for name,cmd in (commands[2:] if '--web-only' in sys.argv else commands):
 with (D/(name+'.log')).open('w',encoding='utf-8') as log:p=subprocess.run(cmd,cwd=source,env={**os.environ,'CI':'1'},stdout=log,stderr=subprocess.STDOUT,timeout=600)
 results.append({'check':name,'exitCode':p.returncode});(D/'BUILD-RESULTS.json').write_text(json.dumps(results,indent=2));print(json.dumps(results[-1]),flush=True)
 if p.returncode:break
