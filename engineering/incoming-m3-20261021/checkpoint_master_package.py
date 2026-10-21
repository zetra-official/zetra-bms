from pathlib import Path
import hashlib,json,zipfile,subprocess,re
E=Path(__file__).resolve().parent;root=E.parent.parent
m=json.loads((E/'MASTER-LOCAL-MANIFEST.json').read_text());sha=lambda b:hashlib.sha256(b).hexdigest()
assert not subprocess.check_output(['git','diff','--cached','--name-only'],cwd=root,text=True).strip(),'Preserve existing index'
for p,h in m['hashes'].items():assert sha((E/p).read_bytes())==h,p
for p in m['sourcePaths']:
 old=subprocess.check_output(['git','show',m['implementationCheckpoint']+':engineering/incoming-m3-20261021/'+p],cwd=root)
 assert sha(old)==m['hashes'][p],p
with zipfile.ZipFile(E/m['archive']['file']) as z:
 assert all(sha(z.read(p))==h for p,h in m['hashes'].items())
assert sha((E/m['archive']['file']).read_bytes())==m['archive']['sha256']
names=set(m['hashes'])|{'MASTER-LOCAL-MANIFEST.json','MASTER-LOCAL-REVIEW-SOURCE.zip','MASTER-SHA256SUMS.txt','package_master.py','checkpoint_master_package.py'}
for p in names:
 assert '.private' not in p
 data=(E/p).read_bytes()
 if (E/p).suffix not in ['.pdf','.png','.zip']:assert not re.search(rb'eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.',data),p
subprocess.run(['git','add','-f','--',*[str((E/p).relative_to(root)) for p in sorted(names)]],cwd=root,check=True)
staged=subprocess.check_output(['git','diff','--cached','--name-only'],cwd=root,text=True).splitlines();assert all(p.startswith('engineering/incoming-m3-20261021/') for p in staged)
print('Archive/source integrity verified; scoped package files staged:',len(staged))
