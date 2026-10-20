from pathlib import Path
import json,zipfile,difflib
E=Path('engineering/currency-ui-refinement-20261020');b=json.loads((E/'BASELINE.json').read_text());p=json.loads((E/'SOURCE-PACKAGE.json').read_text())
for platform in ['web','android']:
 with zipfile.ZipFile(b['sources'][platform]['path']) as z:old={n:z.read(n) for n in z.namelist() if not n.endswith('/')}
 with zipfile.ZipFile(E/p[platform]['zip']) as z:new={n:z.read(n) for n in z.namelist()}
 lines=[]
 for n in sorted(p[platform]['changedFiles']):lines.extend(difflib.diff_bytes(difflib.unified_diff,old.get(n,b'').splitlines(True),new[n].splitlines(True),fromfile=('a/'+n).encode(),tofile=('b/'+n).encode()))
 (E/('source-'+platform+'.patch')).write_bytes(b''.join(lines))
print('Exact-byte source patches saved; source archives unchanged')
