from pathlib import Path
import json,hashlib,zipfile,re,shutil
E=Path(__file__).resolve().parent;R=E.parent.parent;OLD=R/'engineering/currency-dashboard-fix-20261020';sha=lambda b:hashlib.sha256(b).hexdigest()
allowed={'app/_layout.tsx','app/(tabs)/sales/checkout.tsx','src/ui/Screen.tsx','src/ui/Input.tsx','src/ui/WebViewport.tsx','src/pos/checkoutAvailability.ts'}
baseline={}
with zipfile.ZipFile(OLD/'dashboard-fix-web-source.zip') as z:
 for n in z.namelist():
  if not n.endswith('/'):baseline[n]=z.read(n)
source=E/'source-web';files={n:(source/n).read_bytes() for n in baseline}
for n in allowed:
 if (source/n).exists():files[n]=(source/n).read_bytes()
# Expo tooling may append generated ignore entries. Preserve original source archive bytes.
files['.gitignore']=baseline['.gitignore']
delta={n:{'before':sha(baseline[n]) if n in baseline else None,'after':sha(v)} for n,v in files.items() if n not in baseline or v!=baseline[n]}
assert set(delta)==allowed,('UNEXPECTED_SOURCE_SCOPE',list(delta))
assert all(files[n]==v for n,v in baseline.items() if n.startswith('src/currency/') or n=='app/catalog.tsx')
archive=E/'customer-bugfix-web-source.zip'
if archive.exists():
 with zipfile.ZipFile(archive) as z:assert set(z.namelist())==set(files) and all(z.read(n)==v for n,v in files.items())
else:
 with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED) as z:
  for n,v in sorted(files.items()):z.writestr(n,v)
build=E/'production-web-build';dest=E/'release-artifact-web';assert not dest.exists()
assets={}
for p in build.rglob('*'):
 if not p.is_file():continue
 rel=p.relative_to(build).as_posix();assert not any(s in rel for s in ['.env','.private.','.sql','.apk'])
 if p.suffix=='.map':continue
 target=dest/rel;target.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(p,target);assets[rel]=sha(p.read_bytes())
entry=next(n for n in assets if re.fullmatch('_expo/static/js/web/entry-[a-f0-9]+.js',n));bundle=(dest/entry).read_text(encoding='utf-8')
assert '127.0.0.1:55650' not in bundle and '192.168.100.131' not in bundle and 'SYNTHETIC-DISPOSABLE' not in bundle
oldentry=next((OLD/'release-artifact-web/_expo/static/js/web').glob('entry-*.js'));origins=lambda s:set(re.findall(r'https://[a-z0-9]+\.supabase\.co',s))
assert origins(bundle)==origins(oldentry.read_text(encoding='utf-8')) and origins(bundle),'BACKEND_TARGET_DRIFT'
assert (dest/'_redirects').read_bytes()==(OLD/'release-artifact-web/_redirects').read_bytes(),'ROUTING_OR_FX_PROXY_DRIFT'
assert json.loads((E/'focused-test-results.json').read_text())['status']=='PASS' and json.loads((E/'postgres-results.json').read_text())['status']=='PASS'
(E/'SOURCE-DELTA.json').write_text(json.dumps({'status':'PASS','baselineWebDeployment':'6ad754388b1e0ec9dc9d905d','changedFiles':delta,'currencyAndCatalogUnchanged':True,'sql':[],'newFinancialFeatures':False},indent=2))
(E/'WEB-ARTIFACT-SHA256.json').write_text(json.dumps(assets,indent=2))
package={'id':'ZETRA-CUSTOMER-CHECKOUT-SAFARI-20261020','ownerApprovedWebPublication':True,'approval':'Owner directive: Proceed with verified scoped customer bugfix Web release now,20Oct2026','webEntry':entry,'sourceZipSha256':sha(archive.read_bytes()),'artifactManifestSha256':sha((E/'WEB-ARTIFACT-SHA256.json').read_bytes()),'sourceDeltaSha256':sha((E/'SOURCE-DELTA.json').read_bytes()),'tests':{'focused':14,'canonicalDatabaseGroups':10,'actualPrecisionUi':'Increase10→12, decrease10→8; canonical sale posted in disposable database; receipt route opened','homeResponsiveWidths':[320,375,390,430],'iPhoneSafari':'Owner requested verification on Production after publication; not claimed PASS','physicalAndroid':'Device disconnected before new candidate runtime acceptance; not claimed PASS'},'webRollback':'6ad754388b1e0ec9dc9d905d','androidPublication':False,'sql':[],'financialActivation':False,'productionFinancialTestWrites':False}
(E/'WEB-RELEASE.json').write_text(json.dumps(package,indent=2));print(json.dumps({'status':'SEALED','files':len(assets),'changedSourceFiles':len(delta),'package':package['id']}))
