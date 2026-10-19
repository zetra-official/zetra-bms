from pathlib import Path
import subprocess,json,datetime,os,argparse
E=Path(__file__).resolve().parent
commands=[('typescript',['node','node_modules/typescript/bin/tsc','--noEmit','-p','tsconfig.json']),('web',['node','node_modules/expo/bin/cli','export','--platform','web','--output-dir','dist/native-financial-web']),('android-hermes',['node','node_modules/expo/bin/cli','export','--platform','android','--output-dir','dist/native-financial-android'])]
p=argparse.ArgumentParser();p.add_argument('--from-phase',choices=['typescript','web','android-hermes'],default='typescript');phase=p.parse_args().from_phase
commands=commands[next(i for i,(name,_) in enumerate(commands) if name==phase):]
results=json.loads((E/'BUILD-RESULTS.json').read_text()) if phase!='typescript' else []
results=[r for r in results if r['check'] not in [name for name,_ in commands]]
for name,cmd in commands:
 with (E/(name+'-build.log')).open('w',encoding='utf-8') as log:p=subprocess.run(cmd,stdout=log,stderr=subprocess.STDOUT,timeout=600,env={**os.environ,'CI':'1'})
 results.append({'check':name,'exitCode':p.returncode});(E/'BUILD-RESULTS.json').write_text(json.dumps(results,indent=2));print(json.dumps(results[-1]),flush=True)
 if p.returncode:break

