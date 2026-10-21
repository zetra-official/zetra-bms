from pathlib import Path
import json,hashlib,zipfile
E=Path(__file__).resolve().parent;P=E/'production-20261021';sha=lambda b:hashlib.sha256(b).hexdigest()
result={'release':'ZETRA-COMBINED-M3-PRODUCTS-COMPAT-20261022','approvedBase':'b2aed3c1','platforms':{},'sql':json.loads((P/'SQL-MANIFEST.json').read_text()),'targets':json.loads((P/'TARGETS.json').read_text()),'physicalDeviceAcceptance':'NOT TESTED','financialSmokeWrites':False}
for platform in ['web','android']:
 b=json.loads((P/f'BUILD-{platform}.json').read_text());root=Path(b['artifact']);source=E/('source-'+platform)
 assert b['status']=='PASS'
 assert all(sha((root/f).read_bytes())==h for f,h in b['files'].items())
 assert all(sha((source/f).read_bytes())==h for f,h in b['sourceInputs'].items())
 assert set(b['files'])=={p.relative_to(root).as_posix() for p in root.rglob('*') if p.is_file()}
 archive=P/f'RELEASE-{platform}.zip'
 with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED) as z:
  for f in b['files']:z.write(root/f,f)
 result['platforms'][platform]={'descriptor':f'BUILD-{platform}.json','descriptorSHA256':sha((P/f'BUILD-{platform}.json').read_bytes()),'archive':archive.name,'archiveSHA256':sha(archive.read_bytes()),'files':len(b['files'])}
for n in ['SQL-REHEARSAL.json','PRICE-UI-RECONCILIATION.json']:assert json.loads((P/n).read_text()).get('status','PASS')=='PASS'
result['evidence']={n:sha((P/n).read_bytes()) for n in ['SQL-REHEARSAL.json','PRICE-UI-RECONCILIATION.json','local-corrected-price.png']}
(P/'RELEASE-MANIFEST.json').write_text(json.dumps(result,indent=2),encoding='utf-8');print('Sealed Web/Android/SQL artifact integrity PASS')
