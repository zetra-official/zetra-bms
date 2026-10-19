from pathlib import Path
import json,hashlib
R=Path.cwd();D=Path(__file__).resolve().parent;sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();p=json.loads((D/'CATALOG-RELEASE-APPROVAL.json').read_text());checks=[]
assert sha(R/p['sourceChange']['file'])==p['sourceChange']['sha256'];checks.append('main Catalog source unchanged')
for platform in ['web','android']:
 v=p[platform];manifest=D/v['artifactManifest'];assert sha(manifest)==v['artifactManifestSha256'];files=json.loads(manifest.read_text());root=R/v['artifactDirectory'];actual={f.relative_to(root).as_posix() for f in root.rglob('*') if f.is_file()};assert actual==set(files)
 for rel,h in files.items():assert sha(root/rel)==h,platform+':'+rel
 checks.append(platform+' exact artifacts and manifest verified')
for rel,h in json.loads((D/'ANDROID-SOURCE-MANIFEST.json').read_text()).items():assert sha(D/'android-source'/rel)==h,rel
checks.append('all reconstructed native source hashes unchanged')
assert not p['databaseMigrations'] and not p['financialActivation'] and not p['publicationAuthorized'];checks.append('no migration, financial activation or existing publication authorization')
print(json.dumps({'status':'PASS','checks':checks,'productionWrites':False}))
