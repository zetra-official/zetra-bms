from pathlib import Path
import subprocess,json
E=Path('engineering/currency-1802-rpc-security-20261018')
CLI=Path(r'C:\Users\ZetraAdmin\AppData\Local\npm-cache\_npx\aa8e5c70f9d8d161\node_modules\@supabase\cli-windows-x64\bin\supabase.exe')
p=subprocess.run([str(CLI),'db','query','--linked','--project-ref','dcmhqdckzhbuakvcyjit','--file',str(E/'OWNER-ROLES-READONLY.sql'),'-o','json'],capture_output=True,text=True,encoding='utf-8',timeout=60)
if p.returncode: raise RuntimeError('READONLY_OWNER_ROLE_CHECK_FAILED')
x=json.loads(p.stdout)['rows'][0]['metadata'];x=json.loads(x) if isinstance(x,str) else x
(E/'OWNER-ROLE-EVIDENCE.json').write_text(json.dumps(x,indent=2));print(json.dumps(x))
