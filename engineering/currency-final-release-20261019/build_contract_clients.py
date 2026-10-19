from pathlib import Path
import subprocess,json,os
R=Path.cwd();E=Path(__file__).resolve().parent;results=[]
for name,cmd in [('typescript',['node','node_modules/typescript/bin/tsc','--noEmit','-p','tsconfig.json']),('web',['node','node_modules/expo/bin/cli','export','--platform','web','--output-dir','dist/currency-contract-web']),('android-hermes',['node','node_modules/expo/bin/cli','export','--platform','android','--output-dir','dist/currency-contract-android'])]:
 with (E/('1910-'+name+'.log')).open('w',encoding='utf-8') as log:p=subprocess.run(cmd,stdout=log,stderr=subprocess.STDOUT,timeout=600,env={**os.environ,'CI':'1'})
 results.append({'check':name,'exitCode':p.returncode});(E/'CONTRACT-CLIENT-BUILD-RESULTS.json').write_text(json.dumps(results,indent=2));print(json.dumps(results[-1]),flush=True)
 if p.returncode:break
