from pathlib import Path
import subprocess,json,hashlib
R=Path.cwd();D=Path(__file__).resolve().parent;E=D.parent
assert not subprocess.check_output(['git','diff','--cached','--name-only'],text=True).strip(),'PREEXISTING_STAGED_WORK_STOP'
files=[p for p in D.iterdir() if p.is_file() and '.private.' not in p.name and p.name!='RELEASE-EVIDENCE-SHA256.json']+[E/'DEPENDENCY-DECISION-PACKAGE.json']
(D/'RELEASE-EVIDENCE-SHA256.json').write_text(json.dumps({p.relative_to(R).as_posix():hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(files)},indent=2),encoding='utf-8')
paths=[p.relative_to(R).as_posix() for p in files]+[(D/'RELEASE-EVIDENCE-SHA256.json').relative_to(R).as_posix()]
assert all('build-source' not in p and 'android-source/' not in p and '.private.' not in p for p in paths)
subprocess.run(['git','add','--',*paths],check=True);staged=set(subprocess.check_output(['git','diff','--cached','--name-only'],text=True).splitlines());assert staged<=set(paths),'UNRELATED_STAGE_STOP'
subprocess.run(['git','commit','-m','Prepare isolated Catalog Web and Android OTA approval; record currency contract decisions'],check=True)
print(subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip())
