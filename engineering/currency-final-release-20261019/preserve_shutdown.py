"""Owner-requested local preservation; no Git/index/source/database mutation."""
from pathlib import Path
from datetime import datetime,timezone
import subprocess,json,hashlib,zipfile,os
R=Path.cwd().resolve();E=R/'engineering/currency-final-release-20261019'
def git(*args):return subprocess.check_output(['git',*args],cwd=R)
status=git('status','--porcelain=v1','-z','--untracked-files=all')
(E/'SHUTDOWN-WORKTREE-STATUS.private.txt').write_bytes(status.replace(b'\0',b'\n'))
(E/'SHUTDOWN-WORKTREE.private.patch').write_bytes(git('diff','--binary','HEAD'))
paths=set()
for raw in [git('diff','--name-only','-z','HEAD'),git('ls-files','--others','--exclude-standard','-z')]:
 paths.update(x.decode('utf-8') for x in raw.split(b'\0') if x)
paths.update(str((E/n).relative_to(R)).replace('\\','/') for n in ['SHUTDOWN-WORKTREE-STATUS.private.txt','SHUTDOWN-WORKTREE.private.patch'])
archive=E/'SHUTDOWN-WORKTREE.private.zip'
assert not archive.exists(),'Never overwrite an existing preservation archive'
files=[]
with zipfile.ZipFile(archive,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=3,allowZip64=True) as z:
 for name in sorted(paths):
  p=R/name
  if not p.exists() or not p.is_file():continue
  assert not p.is_symlink() and p.resolve().is_relative_to(R),name
  digest=hashlib.sha256()
  with p.open('rb') as f:
   for block in iter(lambda:f.read(1024*1024),b''):digest.update(block)
  files.append({'path':name,'bytes':p.stat().st_size,'sha256':digest.hexdigest()})
  z.write(p,name)
with archive.open('rb') as f:os.fsync(f.fileno())
with zipfile.ZipFile(archive) as z:
 assert z.testzip() is None
 assert set(z.namelist())=={f['path'] for f in files}
digest=hashlib.sha256()
with archive.open('rb') as f:
 for block in iter(lambda:f.read(1024*1024),b''):digest.update(block)
receipt={'status':'VERIFIED','atUtc':datetime.now(timezone.utc).isoformat(),'baseHead':git('rev-parse','HEAD').decode().strip(),
 'archive':str(archive.relative_to(R)).replace('\\','/'),'archiveBytes':archive.stat().st_size,'archiveSha256':digest.hexdigest(),
 'archiveCrcVerified':True,'fileCount':len(files),'files':files,
 'scope':'All Git-visible dirty tracked and untracked files plus exact binary diff/status. Ignored private captures and disposable databases remain intact on disk; task databases were cleanly stopped separately. No restore/reset/delete performed.'}
with (E/'SHUTDOWN-PRESERVATION.json').open('w',encoding='utf-8') as f:
 json.dump(receipt,f,indent=2);f.write('\n');f.flush();os.fsync(f.fileno())
print(json.dumps({k:receipt[k] for k in ['status','fileCount','archiveBytes','archiveSha256','archiveCrcVerified']}))
