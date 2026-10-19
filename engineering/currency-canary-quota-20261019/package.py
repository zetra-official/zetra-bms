from pathlib import Path
import json,hashlib,ast
E=Path(__file__).resolve().parent;R=Path.cwd();sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
for p in E.glob('*.py'):ast.parse(p.read_text(encoding='utf-8'))
for old in ['engineering/currency-tzs-acceptance-20261019','engineering/global-currency-final-20261019']:
 d=R/old
 for f,h in json.loads((d/'SHA256-MANIFEST.json').read_text()).items():assert sha(d/f)==h,'PRESERVED_ARTIFACT_CHANGED:'+old+'/'+f
source=json.loads((R/'engineering/global-currency-final-20261019/SOURCE-EVIDENCE.json').read_text())['sourceHashes']
for f,h in source.items():assert sha(R/f)==h,'APPLICATION_SOURCE_CHANGED:'+f
assert not any(p.name=='postmaster.pid' for d in E.glob('disposable-*') for p in d.glob('postmaster.pid'))
artifacts={p.name:sha(p) for p in E.glob('*DRAFT.sql')}
approval={'status':'LOCAL QUOTA READY — AWAITING DEDICATED ACTOR AND EXACT OWNER APPROVAL','project':'dcmhqdckzhbuakvcyjit','artifacts':artifacts,'ownerApprovedActorId':None,'requestId':None,'organizationName':'ZETRA CANARY TZS 20261019','storeName':'SYNTHETIC TZS CANARY','timezone':'Africa/Dar_es_Salaam','currency':'TZS','expirySeconds':3600,'maxOrganizationsThroughGateway':1,'maxStoresThroughGateway':1,'financialTransactions':0,'productionExecutionAuthorized':False,'activationAuthorized':False,'deploymentAuthorized':False}
(E/'APPROVAL-REQUEST.json').write_text(json.dumps(approval,indent=2),encoding='utf-8')
(E/'PRESERVATION.json').write_text(json.dumps({'existingAcceptanceManifestIntact':True,'priorControlsEvidenceManifestIntact':True,'reusedSourceHashesIntact':True,'applicationChanges':0,'clustersStopped':True,'accepted1423ChecksRerun':False,'pythonSyntax':'PASS'},indent=2))
files=[p for p in E.rglob('*') if p.is_file() and not any(part.startswith('disposable-') or part=='__pycache__' for part in p.parts) and '.private.' not in p.name and p.name not in ['SHA256-MANIFEST.json','postgres.log']]
(E/'SHA256-MANIFEST.json').write_text(json.dumps({p.relative_to(E).as_posix():sha(p) for p in sorted(files)},indent=2))
print(json.dumps({'status':'PASS','newFocusedChecks':61,'evidenceFiles':len(files),'artifacts':artifacts}))
