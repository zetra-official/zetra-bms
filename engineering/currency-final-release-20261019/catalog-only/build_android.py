from pathlib import Path
import subprocess,json,os
R=Path.cwd();D=Path(__file__).resolve().parent;source=D/'android-source';out=R/'dist/catalog-only-android'
with (D/'android-build.log').open('w',encoding='utf-8') as log:p=subprocess.run(['node',str(R/'node_modules/expo/bin/cli'),'export','--platform','android','--source-maps','--output-dir',str(out)],cwd=source,env={**os.environ,'CI':'1'},stdout=log,stderr=subprocess.STDOUT,timeout=600)
(D/'ANDROID-BUILD-RESULTS.json').write_text(json.dumps({'androidHermesExitCode':p.returncode,'source':'ANDROID-SOURCE-MANIFEST.json','publication':False},indent=2));print('Android/Hermes exit '+str(p.returncode));raise SystemExit(p.returncode)
