from pathlib import Path
import subprocess,json,hashlib,sys
E=Path(__file__).resolve().parent;P=E/'production-20261021';source=E/'source-web'
raw=P/'export-web-1792615592434';dest=P/'web-sealed'
assert raw.is_dir()
if not dest.exists():
 result=subprocess.run([sys.executable,str(source/'scripts/package-web-bootstrap.py'),'\\\\?\\'+str(raw),'\\\\?\\'+str(dest)],capture_output=True,text=True)
 (P/'web-packaging.log').write_text(result.stdout+result.stderr,encoding='utf-8')
 assert result.returncode==0,result.stderr
expected=json.loads((E/'MASTER-BUILD-WEB.json').read_text())['sourceInputs']
actual={str(p.relative_to(source)).replace('\\','/'):hashlib.sha256(p.read_bytes()).hexdigest() for d in ['app','src','components','hooks','constants','assets','scripts'] for p in (source/d).rglob('*') if p.is_file()}
assert all((source/k).is_file() and hashlib.sha256((source/k).read_bytes()).hexdigest()==v for k,v in expected.items()),'source drift'
files={str(p.relative_to(dest)).replace('\\','/'):hashlib.sha256(p.read_bytes()).hexdigest() for p in dest.rglob('*') if p.is_file()}
(P/'BUILD-web.json').write_text(json.dumps({'platform':'web','status':'PASS','productionProject':'dcmhqdckzhbuakvcyjit','artifact':str(dest),'sourceInputs':actual,'files':files},indent=2),encoding='utf-8')
print('Web packaging/source integrity PASS; no rebuild or publication')
