from pathlib import Path
import json,hashlib,subprocess
R=Path.cwd();E=Path(__file__).resolve().parent;D=E/'catalog-only';out=R/'dist/catalog-only-hotfix';sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
assert all(r['exitCode']==0 for r in json.loads((D/'BUILD-RESULTS.json').read_text()))
artifacts={}
for p in out.rglob('*'):
 if not p.is_file():continue
 assert p.suffix not in ['.sql','.env','.py','.ps1','.map'],'UNEXPECTED_RELEASE_ARTIFACT'
 if p.suffix=='.js':
  b=p.read_bytes()
  for forbidden in [b'create_native_sale_v1',b'create_native_expense_v1',b'read_original_financial_facts_v1',b'-----BEGIN PRIVATE KEY-----']:assert forbidden not in b,'UNFINISHED_FINANCIAL_CODE_LEAK'
 artifacts[p.relative_to(out).as_posix()]=sha(p)
(D/'ARTIFACT-SHA256.json').write_text(json.dumps(artifacts,indent=2));baseline=json.loads((E/'CATALOG-NETLIFY-BASELINE.json').read_text());current=R/'app/catalog.tsx';pre=subprocess.check_output(['git','show','32b81a0:app/catalog.tsx'])
package={'status':'READY_FOR_OWNER_WEB_RELEASE_APPROVAL','site':baseline['site'],'domain':'https://app.zetra.tz','previousDeployment':baseline['deploymentId'],'sourceChanges':{'app/catalog.tsx':sha(current)},'sourcePreimageSha256':hashlib.sha256(pre).hexdigest(),'scope':'Catalog share only: p_store_id null, organization and selected114-product semantics retained','acceptedEvidence':'Owner-reported Expo114-products PASS; not rerun','isolatedBaseline':'Accepted auth/onboarding source manifest of currently deployed6ad49c64c2acd6e0352f242f; all preimages matched','buildChecks':'Guard/TypeScript/Web PASS','artifactManifestSha256':sha(D/'ARTIFACT-SHA256.json'),'artifactFiles':len(artifacts),'financialDraftsIncluded':False,'backendMigrations':[],'androidRelease':False,'publicationAuthorized':False,'approvalRequested':['Create official Netlify Web draft from exactly these artifacts','Run nondestructive Catalog/Login smoke checks against that draft','Publish only if checks pass and Production baseline remains unchanged','Rollback to6ad49c64c2acd6e0352f242f on a critical regression'],'rollback':'Restore previous verified Netlify deployment; no database changes or data restoration'}
(D/'OWNER-APPROVAL.json').write_text(json.dumps(package,indent=2));print(json.dumps({'status':package['status'],'artifacts':len(artifacts),'unverifiedFinancialCode':False,'catalogSha256':sha(current)}))
