from pathlib import Path
import subprocess,sys
E=Path(__file__).resolve().parent
for name in ['test_indirect_paths.py','test_concurrency.py','test_atomicity.py']:
 p=subprocess.run([sys.executable,str(E/name)],capture_output=True,text=True,encoding='utf-8')
 print(p.stdout.strip(),flush=True)
 if p.returncode:raise RuntimeError(p.stderr[-2500:])
