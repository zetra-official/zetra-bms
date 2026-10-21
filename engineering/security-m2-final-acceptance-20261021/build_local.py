from pathlib import Path
import json,subprocess,os
E=Path('engineering/security-m2-final-acceptance-20261021').resolve();c=json.loads((E/'runtime.private.json').read_text());env=os.environ.copy();env.update(EXPO_PUBLIC_SUPABASE_URL='http://127.0.0.1:55770',EXPO_PUBLIC_SUPABASE_ANON_KEY=c['anon'],EXPO_OFFLINE='1',EXPO_NO_TELEMETRY='1',CI='1')
p=subprocess.run(['node',str(Path('node_modules/expo/bin/cli').resolve()),'export','--clear','--platform','web','--output-dir',str(E/'build-web-local')],cwd=E/'source-web',env=env,stdout=(E/'BUILD.log').open('w'),stderr=subprocess.STDOUT);print('Local-only full product export exit:',p.returncode)
