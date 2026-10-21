from pathlib import Path
import json,subprocess,os,datetime,hashlib
E=Path(__file__).resolve().parent;cfg=json.loads((E/'runtime.private.json').read_text());env=os.environ.copy();env.update(EXPO_PUBLIC_SUPABASE_URL='http://127.0.0.1:55780',EXPO_PUBLIC_SUPABASE_ANON_KEY=cfg['anon'],EXPO_OFFLINE='1',EXPO_NO_TELEMETRY='1',CI='1')
platform=__import__('sys').argv[1];temporary=E/('build-temp-'+platform);temporary.mkdir(exist_ok=True);env.update(TEMP=str(temporary),TMP=str(temporary))
source=E/('source-'+platform)
def snapshot():
 paths=[p for folder in ['app','src','components','hooks','constants','assets'] for p in (source/folder).rglob('*') if p.is_file()]
 paths.extend(p for p in source.glob('*') if p.is_file() and p.suffix in ['.json','.js','.ts'])
 return {str(p.relative_to(source)).replace('\\','/'):hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(set(paths))}
inputs=snapshot()
tag=datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S%f');output=E/('build-master-'+platform+'-'+tag);log=E/('master-build-'+platform+'.log')
if log.exists():(E/('build-history-'+platform+'-'+tag+'.log')).write_bytes(log.read_bytes())
cmd=['node',str(E.parent.parent/'node_modules/expo/bin/cli'),'export','--max-workers','2','--platform',platform,'--output-dir',str(output)];p=subprocess.run(cmd,cwd=E/('source-'+('web' if platform=='web' else 'android')),env=env,stdout=log.open('w'),stderr=subprocess.STDOUT)
if p.returncode==0:
 assert inputs==snapshot(),'Source changed during export; artifact is not sealed'
 (E/('MASTER-BUILD-'+platform.upper()+'.json')).write_text(json.dumps({'platform':platform,'status':'PASS','directory':output.name,'localOnly':True,'sourceInputs':inputs,'files':{str(f.relative_to(output)).replace('\\','/'):hashlib.sha256(f.read_bytes()).hexdigest() for f in output.rglob('*') if f.is_file()}},indent=2))
print(platform,'export exit',p.returncode);raise SystemExit(p.returncode)
