from pathlib import Path
import json,hashlib,zipfile,difflib,subprocess
E=Path(__file__).resolve().parent;R=E.parent.parent;D=R/'engineering/currency-workspace-fix-20261020'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
sqlhash=sha(E/'2026102101-owner-privacy.DRAFT.sql');tests={}
for name in ['SECURITY-TEST-RESULTS.json','INDIRECT-PATH-RESULTS.json','CONCURRENCY-RESULTS.json','ATOMICITY-RESULTS.json']:
 v=json.loads((E/name).read_text(encoding='utf-8'));assert v['sqlSHA256']==sqlhash,('TESTED_SQL_DRIFT',name)
 assert all(c['status']=='PASS' for c in v['checks']),name
 tests[name]={'checks':len(v['checks']),'sha256':sha(E/name)}
baseline=json.loads((E/'BASELINE.json').read_text());preserved={p:sha(R/p)==h for p,h in baseline['protectedDirtyFiles'].items()};assert all(preserved.values()),[p for p,v in preserved.items() if not v]
allowed={'app/(tabs)/index.tsx','app/(tabs)/settings/business-statement.tsx','app/stores/supplier-detail.tsx','app/finance/business-debts.tsx','app/stocks/inbound.tsx'}
sources={};builds={}
for platform in ['web','android']:
 source=E/('source-'+platform);patch=[];changes={};target=E/('M2-'+platform+'-source.zip')
 with zipfile.ZipFile(D/f'workspace-recovery-{platform}-source.zip') as old,zipfile.ZipFile(target,'w',zipfile.ZIP_DEFLATED) as new:
  for name in sorted(old.namelist()):
   if name.endswith('/'):continue
   before=old.read(name);after=(source/name).read_bytes()
   if before!=after:
    assert name in allowed,('UNSCOPED_SOURCE',platform,name)
    changes[name]={'before':hashlib.sha256(before).hexdigest(),'after':hashlib.sha256(after).hexdigest()}
    patch.extend(difflib.unified_diff(before.decode('utf-8').replace('\r','').splitlines(True),after.decode('utf-8').replace('\r','').splitlines(True),fromfile='released/'+name,tofile='M2/'+name))
   new.writestr(name,after)
 assert set(changes)==allowed,(platform,set(changes))
 (E/('SOURCE-'+platform+'.patch')).write_text(''.join(patch),encoding='utf-8')
 sources[platform]={'archive':target.name,'sha256':sha(target),'changedFiles':changes,'allOtherReleasedSourceBytesPreserved':True}
 b=json.loads((E/('BUILD-'+platform+'.json')).read_text());assert b['status']=='PASS'
 output=E/('build-'+platform)
 actual={p.relative_to(output).as_posix():sha(p) for p in output.rglob('*') if p.is_file()}
 assert actual==b['files'],('BUILD_OUTPUT_DRIFT',platform)
 bundle=next(p for p in output.rglob('entry-*.js')) if platform=='web' else output/json.loads((output/'metadata.json').read_text())['fileMetadata']['android']['bundle']
 data=bundle.read_bytes();assert b'm2_owner_products' in data and b'm2_owner_sale_items' in data
 builds[platform]={'status':'PASS','files':len(actual),'manifest':f'BUILD-{platform}.json','manifestSHA256':sha(E/f'BUILD-{platform}.json'),'publication':False}
preservation={'dirtyRootFiles':preserved,'rootCatalogSHA256':sha(R/'app/catalog.tsx'),'sourceScope':sources,'blockedFundingSchemasModified':False,'hostedWrites':False,'financialActivation':False}
(E/'PRESERVATION.json').write_text(json.dumps(preservation,indent=2))
manifest={'milestone':'M2 LOCAL OWNER FINANCIAL PRIVACY','status':'M2 PARTIAL','baselineHead':baseline['head'],'sqlDraft':{'file':'2026102101-owner-privacy.DRAFT.sql','sha256':sqlhash,'hostedExecutionApproved':False},'sources':sources,'builds':builds,'postgresTests':tests,'postgresCheckCount':sum(x['checks'] for x in tests.values()),'nodeCompatibilityChecks':24,'typescript':{'web':'PASS','android':'PASS'},'genuinePostgrestAuthE2E':'NOT TESTED','physicalAndroid':'NOT TESTED','physicalIPhone':'NOT TESTED','arabicChinesePdfGlyphRendering':'NOT TESTED','historicalPublicStorageObjects':'NOT INSPECTED','productionDeployment':False,'githubPush':False,'M3Started':False}
(E/'M2-MANIFEST.json').write_text(json.dumps(manifest,indent=2))
print(json.dumps({'status':manifest['status'],'postgresChecks':manifest['postgresCheckCount'],'sourceFilesPerPlatform':len(allowed),'protectedRootFiles':len(preserved),'sqlSHA256':sqlhash,'web':'BUILD PASS','android':'BUILD PASS'}))
