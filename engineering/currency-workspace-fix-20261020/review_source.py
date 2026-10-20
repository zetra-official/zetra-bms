from pathlib import Path
import json,hashlib,zipfile,difflib
D=Path(__file__).parent; E=D.parent/'currency-ui-refinement-20261020'
meta=json.loads((D/'SOURCE-PACKAGE.json').read_text())
for platform in ('web','android'):
 with zipfile.ZipFile(E/f'currency-ui-{platform}-source.zip') as old,zipfile.ZipFile(D/meta[platform]['archive']) as new:
  patch=[]
  for name in meta[platform]['changedAgainstApprovedCurrencyRefinement']:
   a=old.read(name).decode().replace('\r\n','\n').splitlines(True) if name in old.namelist() else []
   b=new.read(name).decode().replace('\r\n','\n').splitlines(True)
   patch.extend(difflib.unified_diff(a,b,fromfile='approved/'+name,tofile='replacement/'+name))
  (D/f'source-{platform}.patch').write_text(''.join(patch),encoding='utf-8')
pres=json.loads((D/'PRESERVATION.json').read_text()); sha=lambda b:hashlib.sha256(b).hexdigest()
for platform,names in pres['byteIdenticalAgainstApprovedCurrencyRefinement'].items():
 with zipfile.ZipFile(E/f'currency-ui-{platform}-source.zip') as old,zipfile.ZipFile(D/meta[platform]['archive']) as new:
  for name in names:assert old.read(name)==new.read(name),(platform,name)
assert sha(Path('app/catalog.tsx').read_bytes())==pres['rootCatalogSHA256']
for platform in ('web','android'):
 root=D/f'release-artifact-{platform}'
 files=json.loads((D/f'ARTIFACT-{platform}-SHA256.json').read_text())
 assert set(files)=={f.relative_to(root).as_posix() for f in root.rglob('*') if f.is_file()}
 for name,h in files.items():assert sha((root/name).read_bytes())==h
 with zipfile.ZipFile(D/f'workspace-recovery-{platform}-artifact.zip') as z:
  assert set(z.namelist())==set(files)
  for name,h in files.items():assert sha(z.read(name))==h
print('Exact archive/file manifests, strict source scope, protected Currency/Checkout/Catalog and root Catalog preservation PASS')
