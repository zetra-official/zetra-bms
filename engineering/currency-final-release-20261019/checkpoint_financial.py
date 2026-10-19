from pathlib import Path
import subprocess,json,hashlib
R=Path.cwd();E=Path(__file__).resolve().parent
assert not subprocess.check_output(['git','diff','--cached','--name-only'],text=True).strip(),'PREEXISTING_STAGED_WORK_PRESERVED_STOP'
m=json.loads((E/'FINAL-SHA256-MANIFEST.json').read_text());paths=[r['path'] for r in m['files']]
for r in m['files']:assert hashlib.sha256((R/r['path']).read_bytes()).hexdigest()==r['sha256']
paths.append((E/'FINAL-SHA256-MANIFEST.json').relative_to(R).as_posix())
assert all('.private.' not in p and 'build-source' not in p and 'node_modules' not in p and p!='app/catalog.tsx' for p in paths)
subprocess.run(['git','add','--',*paths],check=True)
staged=set(subprocess.check_output(['git','diff','--cached','--name-only'],text=True).splitlines());assert staged<=set(paths),'UNRELATED_STAGED_WORK_STOP'
subprocess.run(['git','commit','-m','Complete local original-currency readers and receipt safeguards; hold financial activation'],check=True)
print(subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip())
