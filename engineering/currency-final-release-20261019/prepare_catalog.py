from pathlib import Path
import json,hashlib,subprocess,shutil
R=Path.cwd();E=Path(__file__).resolve().parent;D=E/'catalog-only';D.mkdir(exist_ok=True)
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
release=json.loads((R/'engineering/auth-onboarding/release/source-manifest.json').read_text());baseline=R/'engineering/release/login-startup/build-source'
assert json.loads((E/'CATALOG-NETLIFY-BASELINE.json').read_text())['deploymentId']=='6ad49c64c2acd6e0352f242f'
before=[p/'before' for p in (R/'engineering').iterdir() if p.is_dir() and (p/'before').is_dir()]
resolved={};missing=[]
for rel,h in release['files'].items():
 candidates=[R/rel,baseline/rel,*[p/rel for p in before]];found=next((p for p in candidates if p.is_file() and sha(p)==h),None)
 if found:resolved[rel]=found
 else:missing.append(rel)
catalog=R/'app/catalog.tsx';pre=subprocess.check_output(['git','show','32b81a0:app/catalog.tsx']);old=b'p_store_id: activeStoreId ?? null,';new=b'p_store_id: null,';working=catalog.read_bytes().replace(b'\r\n',b'\n');original=pre.replace(b'\r\n',b'\n')
assert original.count(old)==1 and original.replace(old,new)==working,'CATALOG_SCOPE_CHANGED'
baseline_catalog=baseline/'app/catalog.tsx';assert baseline_catalog.read_bytes().replace(b'\r\n',b'\n')==original,'DEPLOYED_CATALOG_PREIMAGE_UNMATCHED'
result={'status':'SOURCE_RESOLVED' if not missing else 'BLOCKED_SOURCE_PREIMAGE','baseDeployment':'6ad49c64c2acd6e0352f242f','site':'40a9e840-5437-480e-bc63-8391d6d0ef24','missing':missing,'catalogSha256':sha(catalog),'catalogChange':'Only share-generation p_store_id becomes null; original organization and selected product IDs retained','accepted114Products':'Owner-reported Expo test; not independently rerun','databaseChanges':[],'deploymentAuthorized':False}
(D/'READINESS.json').write_text(json.dumps(result,indent=2));print(json.dumps(result))
if missing:raise SystemExit(2)
out=D/'build-source';assert not out.exists(),'Do not overwrite an existing isolated build'
for folder in ['app','src','components','constants','hooks','public','assets']:
 if (baseline/folder).exists():shutil.copytree(baseline/folder,out/folder)
for name in ['app.json','package.json','package-lock.json','tsconfig.json','babel.config.js','metro.config.js','.env','.env.local','expo-env.d.ts','netlify.toml','jspdf-browser.d.ts']:
 if (baseline/name).exists():shutil.copy2(baseline/name,out/name)
for rel,p in resolved.items():(out/rel).parent.mkdir(parents=True,exist_ok=True);shutil.copy2(p,out/rel)
shutil.copy2(catalog,out/'app/catalog.tsx');(out/'.gitignore').write_text('*\n')
(D/'SOURCE-MANIFEST.json').write_text(json.dumps({'base':release,'isolatedHotfix':{'app/catalog.tsx':sha(catalog)},'excluded':'All current Global Currency, profile and unrelated unapproved work'},indent=2))

