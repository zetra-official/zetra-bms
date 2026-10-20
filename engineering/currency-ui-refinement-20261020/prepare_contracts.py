import zipfile,json
from pathlib import Path
E=Path('engineering/currency-ui-refinement-20261020');b=json.loads((E/'BASELINE.json').read_text());d=json.loads((E/'SOURCE-DELTA.json').read_text());out={}
for platform in ['web','android']:
 with zipfile.ZipFile(b['sources'][platform]['path']) as z:out[platform]={x['path']:z.read(x['path']).decode('utf-8-sig') for x in d[platform]['changed'] if x['path'].endswith(('.ts','.tsx'))}
(E/'baseline-sources.private.json').write_text(json.dumps(out))
