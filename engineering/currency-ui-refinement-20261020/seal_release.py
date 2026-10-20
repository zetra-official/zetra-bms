from pathlib import Path
import json,hashlib,zipfile,re,shutil
E=Path(__file__).resolve().parent;R=E.parent.parent;sha=lambda b:hashlib.sha256(b).hexdigest();read=lambda p:json.loads(p.read_text(encoding='utf-8-sig'))
source=read(E/'SOURCE-PACKAGE.json');base=read(E/'BASELINE.json');artifacts={}
for platform in ['web','android']:
 build=read(E/('BUILD-'+platform+'.json'));assert build['status']=='PASS';assert build['sourceZipSHA256']==source[platform]['sha256']==sha((E/source[platform]['zip']).read_bytes())
 with zipfile.ZipFile(E/source[platform]['zip']) as z:
  for n in z.namelist():
   assert not n.endswith('.sql') and not n.startswith('.env')
   if n!='.gitignore':assert z.read(n)==(E/('source-'+platform)/n).read_bytes(),('SOURCE_CHANGED_AFTER_BUILD',n)
  with zipfile.ZipFile(R/base['sources'][platform]['path']) as old:
   for n in ['app/catalog.tsx','app.json','package.json','eas.json','app/(tabs)/sales/checkout.tsx','src/currency/engine.ts','src/services/referenceFx.ts','src/services/currentFx.ts','src/currency/currentValuation.ts','src/ui/Input.tsx','src/ui/Screen.tsx']:
    if n in old.namelist():assert z.read(n)==old.read(n),('PROTECTED_SOURCE_DRIFT',n)
 root=E/build['output'];dest=E/('release-artifact-'+platform);assert not dest.exists();files={}
 for p in root.rglob('*'):
  if not p.is_file() or p.suffix=='.map':continue
  rel=p.relative_to(root).as_posix();assert not any(s in rel for s in ['.env','.private.','.sql','.apk'])
  target=dest/rel;target.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(p,target);files[rel]=sha(p.read_bytes())
 if platform=='web':
  entries=[n for n in files if re.fullmatch('_expo/static/js/web/entry-[a-f0-9]+.js',n)];assert len(entries)==1;entry=entries[0];oldroot=R/'engineering/checkout-safari-fix-20261020/release-artifact-web';oldentry=next((oldroot/'_expo/static/js/web').glob('entry-*.js'));oldbundle=oldentry.read_bytes();assert (dest/'_redirects').read_bytes()==(oldroot/'_redirects').read_bytes()
 else:
  entry=read(dest/'metadata.json')['fileMetadata']['android']['bundle'];oldroot=R/'engineering/currency-dashboard-fix-20261020/release-artifact-android';oldentry=read(oldroot/'metadata.json')['fileMetadata']['android']['bundle'];oldbundle=(oldroot/oldentry).read_bytes()
 raw=(dest/entry).read_bytes();origins=lambda b:set(re.findall(rb'https://[a-z0-9]+\.supabase\.co',b));assert origins(raw)==origins(oldbundle) and origins(raw),'PRODUCTION_BACKEND_DRIFT'
 for forbidden in [b'127.0.0.1:55650',b'127.0.0.1:55654',b'synthetic-local-only',b'LOCAL-TEST-ONLY',b'synthetic@example.invalid']:assert forbidden not in raw,('LOCAL_FIXTURE_IN_RELEASE',forbidden)
 assert b'zetra_display_currency_v2:' in raw,'NEW_PREFERENCE_MISSING'
 manifest=E/('ARTIFACT-'+platform+'-SHA256.json');manifest.write_text(json.dumps(files,indent=2),encoding='utf-8')
 archive=E/('currency-ui-'+platform+'-artifact.zip')
 with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED) as z:
  for n in sorted(files):z.write(dest/n,n)
 artifacts[platform]={'zip':archive.name,'zipSHA256':sha(archive.read_bytes()),'manifest':manifest.name,'manifestSHA256':sha(manifest.read_bytes()),'entry':entry,'files':len(files),'sameProductionBackend':True,'localFixturesExcluded':True,'runtime':'1.0.0' if platform=='android' else None}
rollback={}
for platform in ['web','android']:
 old=R/('engineering/checkout-safari-fix-20261020' if platform=='web' else 'engineering/currency-dashboard-fix-20261020');manifest=read(old/'WEB-ARTIFACT-SHA256.json') if platform=='web' else read(old/'SEALED-ARTIFACTS.json')['android']['files'];root=old/('release-artifact-'+platform)
 for n,h in manifest.items():assert sha((root/n).read_bytes())==h,('ROLLBACK_ARTIFACT_DRIFT',n)
 rollback[platform]={'status':'VERIFIED','files':len(manifest),'manifestSHA256':sha(json.dumps(manifest,sort_keys=True,separators=(',',':')).encode()),'deploymentId':'6ad76cf47622bc0a29e1244f' if platform=='web' else None,'updateId':'01a1592b-2ee1-7ed9-ac55-fb2b9185776c' if platform=='android' else None,'group':'6f0e3704-2774-44c8-afc5-34216997c808' if platform=='android' else None,'runtime':'1.0.0' if platform=='android' else None}
assert read(E/'CURRENT-TARGETS.json')['status']=='PASS'
(E/'ROLLBACK.json').write_text(json.dumps(rollback,indent=2));(E/'SEALED-ARTIFACTS.json').write_text(json.dumps(artifacts,indent=2))
catalog=sha((R/'app/catalog.tsx').read_bytes());assert catalog=='a6b548a9567803d9db181b4d6f236349b55afddfc115ead7ba9f6d449c1b4914'
(E/'PRESERVATION.json').write_text(json.dumps({'catalogSHA256':catalog,'catalogUnchanged':True,'checkoutPerPlatformByteIdentical':True,'fxEngineAndPolicyByteIdentical':True,'runtimeDependenciesByteIdentical':True,'productionSql':[],'financialActivation':False,'financialWrites':False,'rootMixedWorkPreserved':True,'isolatedDeployedBaselines':base},indent=2))
print(json.dumps({'status':'SEALED','artifacts':artifacts,'rollback':'VERIFIED','publication':False}))
