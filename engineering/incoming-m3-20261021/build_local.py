from pathlib import Path
import json,subprocess,os
E=Path(__file__).resolve().parent;cfg=json.loads((E/'runtime.private.json').read_text());env=os.environ.copy();env.update(EXPO_PUBLIC_SUPABASE_URL='http://127.0.0.1:55780',EXPO_PUBLIC_SUPABASE_ANON_KEY=cfg['anon'],EXPO_OFFLINE='1',EXPO_NO_TELEMETRY='1',CI='1')
platform=__import__('sys').argv[1];cmd=['node',str(E.parent.parent/'node_modules/expo/bin/cli'),'export','--clear','--max-workers','2','--platform',platform,'--output-dir',str(E/('build-'+platform+'-local'))];p=subprocess.run(cmd,cwd=E/('source-'+('web' if platform=='web' else 'android')),env=env,stdout=(E/('build-'+platform+'.log')).open('w'),stderr=subprocess.STDOUT);print(platform,'export exit',p.returncode);raise SystemExit(p.returncode)
