"""Local-only exact source/artifact isolation. Never contacts hosting or EAS."""
from pathlib import Path
import json,hashlib,zipfile,shutil
E=Path(__file__).resolve().parent;R=E.parent.parent;OLD=R/'engineering/currency-only-20261020'
read=lambda p:json.loads(p.read_text(encoding='utf-8'));sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();norm=lambda s:(s or '').replace('\r\n','\n')
old=read(next((OLD/'isolated-android-build').rglob('*.map')));new=read(next((E/'isolated-android-build').rglob('*.map')))
a=dict(zip(old['sources'],old['sourcesContent']));b=dict(zip(new['sources'],new['sourcesContent']))
ctxA=next(k for k in a if k.startswith('/app?ctx='));ctxB=next(k for k in b if k.startswith('/app?ctx='))
context=b.pop(ctxB);oldContext=a.pop(ctxA)
assert context.replace(json.dumps(str(E/'release-source-android'))[1:-1],json.dumps(str(OLD/'release-source-android'))[1:-1])==oldContext,'UNEXPECTED_ROUTE_CHANGE'
changed=[k for k in b if k in a and norm(b[k])!=norm(a[k])];added=[k for k in b if k not in a];removed=[k for k in a if k not in b]
assert changed==['/app/(tabs)/index.tsx'],changed
assert set(added)=={'/src/currency/DashboardCurrency.tsx','/src/currency/dashboardValuation.ts'},added
assert not removed,removed
assert sha(R/'app/catalog.tsx')=='a6b548a9567803d9db181b4d6f236349b55afddfc115ead7ba9f6d449c1b4914'
artifacts={}
for platform in ['web','android']:
 m=read(E/('isolated-'+platform+'-source-manifest.json'));source=E/('release-source-'+platform)
 for rel,h in m['allSourceFiles'].items():assert sha(source/rel)==h,('SOURCE_DRIFT',platform,rel)
 log=(E/('isolated-'+platform+'-build.log')).read_text(encoding='utf-8');assert 'Exported:' in log and 'Release guard PASS' in log
 target=E/('release-artifact-'+platform)
 files={};build=E/('isolated-'+platform+'-build')
 for p in build.rglob('*'):
  if not p.is_file() or p.suffix=='.map':continue
  rel=p.relative_to(build).as_posix();assert '.private.' not in rel and not rel.endswith(('.sql','.env'))
  dest=target/rel;dest.parent.mkdir(parents=True,exist_ok=True)
  if dest.exists():assert sha(dest)==sha(p),'PRESERVE_DIFFERENT_ARTIFACT_STOP'
  else:shutil.copy2(p,dest)
  files[rel]=sha(dest)
 assert set(files)=={p.relative_to(target).as_posix() for p in target.rglob('*') if p.is_file()},'EXTRA_ARTIFACT_FILE'
 if platform=='web':
  assert (target/'_redirects').read_bytes()==(OLD/'release-artifact-web/_redirects').read_bytes()
 else:
  prior=read(OLD/'SEALED-ARTIFACTS.json')['android']['files'];assert {k:v for k,v in files.items() if k.startswith('assets/')}=={k:v for k,v in prior.items() if k.startswith('assets/')}
 archive=E/('dashboard-fix-'+platform+'-source.zip')
 if archive.exists():
  with zipfile.ZipFile(archive) as z:
   assert set(z.namelist())==set(m['allSourceFiles'])
   for rel,h in m['allSourceFiles'].items():assert hashlib.sha256(z.read(rel)).hexdigest()==h,'PRESERVE_DIFFERENT_ARCHIVE_STOP'
 else:
  with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED) as z:
   for rel in sorted(m['allSourceFiles']):
    assert not rel.startswith('.env') and 'node_modules/' not in rel and '.private.' not in rel
    z.write(source/rel,rel)
 artifacts[platform]={'files':files,'sourceManifestSha256':sha(E/('isolated-'+platform+'-source-manifest.json')),'sourceArchive':archive.name,'sourceArchiveSha256':sha(archive),'privateMapsExcluded':True}
(E/'SEALED-ARTIFACTS.json').write_text(json.dumps(artifacts,indent=2),encoding='utf-8')
(E/'ISOLATION-PROOF.json').write_text(json.dumps({'status':'PASS','baseline':'ZETRA-CURRENCY-DISPLAY-20261020','changedRuntimeModules':changed,'addedRuntimeModules':added,'removedModules':removed,'otherDependencyOrApplicationChanges':False,'catalogUnchanged':True,'androidAssetsUnchanged':True,'webProxyRulesUnchanged':True,'productionSql':[],'publication':False},indent=2),encoding='utf-8')
print('Dashboard-only artifacts sealed locally; no publication')
