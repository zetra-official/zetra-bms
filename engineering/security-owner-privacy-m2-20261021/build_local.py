"""Offline local exports only; deliberately contains no publication command."""
from pathlib import Path
import subprocess,os,json,hashlib,concurrent.futures,re
E=Path(__file__).resolve().parent;R=E.parent.parent
env=os.environ.copy();env.update(EXPO_OFFLINE='1',EXPO_NO_TELEMETRY='1',CI='1')
for name in ['.env','.env.local']:
 p=R/name
 if p.exists():
  for line in p.read_text(encoding='utf-8').splitlines():
   m=re.match(r'^(EXPO_PUBLIC_[A-Z0-9_]+)=(.*)$',line)
   if m:env[m[1]]=m[2].strip().strip('"').strip("'")
def build(platform):
 source=E/('source-'+platform);output=E/('build-'+platform)
 with (E/('BUILD-'+platform+'.log')).open('w',encoding='utf-8') as log:
  p=subprocess.run(['node',str(R/'node_modules/expo/bin/cli'),'export','--platform',platform,'--output-dir',str(output)],cwd=source,env=env,stdout=log,stderr=subprocess.STDOUT,timeout=900)
 files={x.relative_to(output).as_posix():hashlib.sha256(x.read_bytes()).hexdigest() for x in output.rglob('*') if x.is_file()} if output.exists() else {}
 result={'platform':platform,'exitCode':p.returncode,'status':'PASS' if p.returncode==0 else 'FAIL','publication':False,'files':files}
 (E/('BUILD-'+platform+'.json')).write_text(json.dumps(result,indent=2));return {'platform':platform,'exitCode':p.returncode,'files':len(files)}
with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:results=list(pool.map(build,['web','android']))
print(json.dumps(results))
assert all(x['exitCode']==0 for x in results)
