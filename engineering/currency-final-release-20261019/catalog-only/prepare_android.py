from pathlib import Path,PurePosixPath
import json,hashlib,base64,shutil,subprocess
R=Path.cwd();D=Path(__file__).resolve().parent;out=D/'android-source';assert not out.exists(),'PRESERVE_EXISTING_ANDROID_SOURCE_STOP'
v=json.JSONDecoder().raw_decode((D/'eas-channel.private.log').read_text(encoding='utf-8'))[0];u=v['currentPage']['updateBranches'][0]['updateGroups'][0][0];f=json.loads(u['manifestFragment']);hbc=next((R/'dist/_expo/static/js/android').glob('*.hbc'));mp=Path(str(hbc)+'.map')
digest=lambda b:base64.urlsafe_b64encode(hashlib.sha256(b).digest()).decode().rstrip('=')
assert digest(hbc.read_bytes())==f['launchAsset']['fileSHA256'],'PUBLISHED_HERMES_BASELINE_MISMATCH'
m=json.loads(mp.read_text(encoding='utf-8'));files={};assets=[];dependencies=[];missing=[]
extensions={'.ts','.tsx','.js','.jsx','.json','.mjs','.cjs'}
for name,content in zip(m['sources'],m['sourcesContent']):
 if not name.startswith('/') or '?' in name:continue
 rel=name.lstrip('/');parts=PurePosixPath(rel).parts;assert '..' not in parts
 if rel.startswith('node_modules/'):
  p=R/rel
  if p.suffix in extensions and content is not None:
   same=p.is_file() and p.read_text(encoding='utf-8').replace('\r\n','\n')==content.replace('\r\n','\n');dependencies.append({'path':rel,'matches':same})
  continue
 if content is None:missing.append(rel);continue
 if Path(rel).suffix in extensions:files[rel]=content
 else:assets.append(rel)
assert files['app/catalog.tsx'].replace('\r\n','\n')==subprocess.check_output(['git','show','32b81a0:app/catalog.tsx']).decode('utf-8').replace('\r\n','\n'),'CATALOG_BASELINE_MISMATCH'
asset_hashes={x['fileSHA256'] for x in f['assets']};resolved={}
for rel in assets:
 candidates=[R/rel,D/'build-source'/rel,R/'engineering/release/login-startup/build-source'/rel]
 p=next((p for p in candidates if p.is_file() and digest(p.read_bytes()) in asset_hashes),None)
 if p:resolved[rel]=p
 else:missing.append(rel)
result={'publishedUpdate':u['id'],'publishedGroup':u['group'],'runtime':'1.0.0','channel':'production','savedHermesMatchesPublishedLaunch':True,'hermesSha256':hashlib.sha256(hbc.read_bytes()).hexdigest(),'pairedSourceMapSha256':hashlib.sha256(mp.read_bytes()).hexdigest(),'sourceMapContentFiles':len(files),'assetFiles':len(assets),'missing':missing,'dependencyMismatches':[x['path'] for x in dependencies if not x['matches']],'sourceMethod':'Reconstruct application JS/TS from the paired source map of the exact saved published Hermes bundle; verify every raw application asset against published manifest hashes. Dependencies compared against original sourcesContent.','publicationAuthorized':False}
(D/'ANDROID-SOURCE-PROOF.json').write_text(json.dumps(result,indent=2),encoding='utf-8');print(json.dumps(result));assert not missing and not result['dependencyMismatches'],'ANDROID_SOURCE_OR_DEPENDENCY_PROOF_INCOMPLETE'
for rel,content in files.items():p=out/rel;p.parent.mkdir(parents=True,exist_ok=True);p.write_text(content,encoding='utf-8',newline='')
for rel,p in resolved.items():dest=out/rel;dest.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(p,dest)
# Native configuration and lockfile remain the existing appVersion1.0.0;
# no native dependency/configuration release is proposed for a TSX-only patch.
baseline=D/'build-source'
for name in ['app.json','package.json','package-lock.json','tsconfig.json','babel.config.js','metro.config.js','.env','.env.local','expo-env.d.ts','jspdf-browser.d.ts']:
 if (baseline/name).is_file():shutil.copy2(baseline/name,out/name)
shutil.copy2(R/'eas.json',out/'eas.json');(out/'.gitignore').write_text('*\n')
pre=(out/'app/catalog.tsx').read_bytes();new=(R/'app/catalog.tsx').read_bytes();assert pre.replace(b'\r\n',b'\n').replace(b'p_store_id: activeStoreId ?? null,',b'p_store_id: null,')==new.replace(b'\r\n',b'\n')
shutil.copy2(R/'app/catalog.tsx',out/'app/catalog.tsx')
source={rel:hashlib.sha256((out/rel).read_bytes()).hexdigest() for rel in files};(D/'ANDROID-SOURCE-MANIFEST.json').write_text(json.dumps(source,indent=2),encoding='utf-8')
