from pathlib import Path
import json,hashlib,subprocess
D=Path(__file__).parent; root=Path.cwd();prefix=D.resolve().relative_to(root.resolve()).as_posix()+'/'
def git(*args):return subprocess.check_output(['git',*args])
approval=json.loads((D/'REPLACEMENT-APPROVAL.json').read_text())
for line in (D/'PACKAGE-SHA256.txt').read_text().splitlines():
 h,name=line.split('  ',1);assert hashlib.sha256((D/name).read_bytes()).hexdigest()==h,name
paths=[prefix+n for n in approval['checkpointFiles']]
assert all('.private' not in p and Path(p).resolve().is_relative_to(D.resolve()) for p in paths)
existing={p.decode() for p in git('diff','--cached','--name-only','-z').split(b'\0') if p}
assert existing.issubset(set(paths)),'Existing unrelated staged work must be preserved'
def unrelated():return [p for p in git('diff','--name-only','-z').split(b'\0') if p and not p.decode().startswith(prefix)]
before=unrelated()
subprocess.run(['git','add','-f','--',*paths],check=True)
staged=[p.decode() for p in git('diff','--cached','--name-only','-z').split(b'\0') if p]
assert set(staged)==set(paths),'Unexpected staged scope'
for name in staged:assert git('show',':'+name)==Path(name).read_bytes(),('Index byte mismatch',name)
subprocess.run(['git','commit','-m','fix(auth): seal currency workspace reliability replacement'],check=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
assert unrelated()==before,'Unrelated tracked working state changed'
print(json.dumps({'checkpoint':git('rev-parse','HEAD').decode().strip(),'files':len(paths),'exactIndexBytesVerified':True,'unrelatedTrackedWorkPreserved':True,'productionPublication':False}))
