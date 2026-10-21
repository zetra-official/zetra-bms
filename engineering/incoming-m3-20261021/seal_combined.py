"""Hash and preserve a local review candidate, never a deployable release."""
from pathlib import Path
import json,hashlib,zipfile
E=Path(__file__).resolve().parent;root=E.parent.parent;M=E.parent/'security-owner-privacy-m2-20261021'
sha=lambda b:hashlib.sha256(b).hexdigest()
base=json.loads((M/'BASELINE.json').read_text());protected=base['protectedDirtyFiles']
sealed=json.loads((M/'M2-MANIFEST.json').read_text())
for platform in ['web','android']:
 assert sha((M/sealed['sources'][platform]['archive']).read_bytes())==sealed['sources'][platform]['sha256']
assert all(sha((root/p).read_bytes())==h for p,h in protected.items())
old=json.loads((E/'M3-WORKING-STATE.json').read_text());files=set(old['sourceFiles'])
for platform in ['web','android']:
 files.update(str(p.relative_to(E)).replace('\\','/') for p in (E/f'source-{platform}/src/staff').glob('*.ts*'))
 files.update([f'source-{platform}/app/(tabs)/index.tsx',f'source-{platform}/src/currency/dashboardValuation.ts'])
 # Preimages for companion correction only, not an undo of M2 or Incoming.
 with zipfile.ZipFile(M/f'M2-{platform}-source.zip') as z:
  for name in ['app/(tabs)/index.tsx','src/currency/dashboardValuation.ts']:
   before=E/f'rollback-staff/{platform}'/name;before.parent.mkdir(parents=True,exist_ok=True);before.write_bytes(z.read(name))
  for name in ['src/currency/engine.ts','src/currency/currentValuation.ts','src/services/referenceFx.ts','src/i18n/catalog.ts','src/i18n/LanguageProvider.tsx']:
   assert z.read(name)==(E/f'source-{platform}'/name).read_bytes(),name
incoming=[p for p in old['sourceFiles'] if '/src/incoming/' in p or p.endswith('/stocks/bulk.tsx') or p.endswith('/stocks/receiving-receipt.tsx')]
assert all(sha((E/p).read_bytes())==old['sourceFiles'][p] for p in incoming)
sql=['2026102102-incoming-m3.DRAFT.sql','2026102103-staff-operational.DRAFT.sql']
hashes={p:sha((E/p).read_bytes()) for p in sorted(files|set(sql))}
archive=E/'COMBINED-LOCAL-REVIEW-SOURCE.zip'
with zipfile.ZipFile(archive,'w',compression=zipfile.ZIP_DEFLATED) as z:
 for p in hashes:z.write(E/p,p)
 for p in (E/'rollback-staff').rglob('*'):
  if p.is_file():z.write(p,str(p.relative_to(E)))
manifest={'status':'COMBINED PARTIAL — NOT A PRODUCTION RELEASE','baseCheckpoint':'62c3a3ae','incomingStatus':'PARTIAL','staffStatus':'PARTIAL — source and unexecuted read-contract draft','sourceFiles':len(files),'hashes':hashes,'reviewArchive':{'file':archive.name,'sha256':sha(archive.read_bytes())},'protectedOriginalFiles':{'count':len(protected),'allUnchanged':True},'incomingCoreFilesUnchanged':len(incoming),'originalCurrencyAndLocalizationEnginesUnchanged':True,'staffSqlApplied':False,'staffDatabaseRoleAcceptance':'NOT EXECUTED — local socket permission restriction','currentWebExport':'FAILED — EPERM output mkdir','currentAndroidExport':'NOT VERIFIED — retained Hermes permission restriction','genuineUi':'NOT VERIFIED','physicalDevices':'NOT TESTED','hostedWrites':False,'deployment':False,'githubPush':False,'nativeNonTzsPostingActivation':False}
manifest['currentWebTypeScript']='PASS'
manifest['currentAndroidTypeScript']='PASS'
manifest['evidenceHashes']={p.name:sha(p.read_bytes()) for p in E.glob('staff-*.log')}
manifest['evidenceHashes']['combined-typecheck.log']=sha((E/'combined-typecheck.log').read_bytes())
manifest['evidenceHashes']['combined-android-typecheck.log']=sha((E/'combined-android-typecheck.log').read_bytes())
(E/'COMBINED-LOCAL-MANIFEST.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
print(json.dumps({'files':len(files),'reviewArchiveSha256':manifest['reviewArchive']['sha256'],'protectedFilesUnchanged':len(protected)}))
