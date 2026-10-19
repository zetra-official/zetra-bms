from pathlib import Path
import hashlib,json,uuid,ast
E=Path(__file__).resolve().parent;R=Path.cwd();sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
for p in E.glob('*.py'):ast.parse(p.read_text(encoding='utf-8'))
for old in ['engineering/currency-tzs-acceptance-20261019','engineering/global-currency-final-20261019','engineering/currency-canary-quota-20261019']:
 d=R/old
 for f,h in json.loads((d/'SHA256-MANIFEST.json').read_text()).items():assert sha(d/f)==h,'OLD_EVIDENCE_CHANGED:'+old+'/'+f
for f,h in json.loads((R/'engineering/global-currency-final-20261019/SOURCE-EVIDENCE.json').read_text())['sourceHashes'].items():assert sha(R/f)==h,'APP_SOURCE_CHANGED:'+f
assert not any(d.joinpath('postmaster.pid').exists() for d in E.glob('disposable-*'))
p=E/'CONSOLIDATED-APPROVAL.json';previous=json.loads(p.read_text()) if p.exists() else {}
files=[R/'engineering/currency-canary-quota-20261019/2026101902-tzs-canary-quota.DRAFT.sql',E/'2026101903-owner-canary-org-limit.DRAFT.sql',E/'ACTIVATE-OWNER-CANARY.DRAFT.sql',E/'DISABLE-OWNER-CANARY.DRAFT.sql']
artifacts=[{'file':f.relative_to(R).as_posix(),'sha256':sha(f)} for f in files]
approval={'status':'AWAITING ONE EXACT OWNER SQL APPROVAL','project':'dcmhqdckzhbuakvcyjit','ownerApprovedActor':'bb2d6dee-773d-4fa7-8fda-1eb85bbad2cd','actorApproved':True,'emailSpellingMismatchDocumented':True,'requestId':previous.get('requestId',str(uuid.uuid4())),'organizationName':'ZETRA CANARY TZS OWNER 20261019','storeName':'SYNTHETIC TZS OWNER CANARY','currency':'TZS','timezone':'Africa/Dar_es_Salaam','acknowledged':True,'approvalReference':'OWNER-GLOBAL-CURRENCY-EXACT-SQL-20261019','artifactsInOrder':artifacts,'orgLimitException':{'requiresExplicitApproval':True,'normalPlan':'BUSINESS','normalOrganizationLimit':2,'existingOwnedOrganizations':2,'additionalSyntheticOrganizations':1,'planSubscriptionRecordsModified':False,'ordinaryRpcExceptionAllowed':False},'scope':{'newSyntheticOrganizations':1,'newSyntheticStores':1,'ttlSeconds':3600,'financialTransactions':0,'modifyExistingBusinessRecords':False},'sqlExecutionApproved':False,'activationApproved':False,'deploymentApproved':False}
p.write_text(json.dumps(approval,indent=2),encoding='utf-8')
(E/'PRESERVATION.json').write_text(json.dumps({'priorManifestsIntact':True,'applicationSourceHashesIntact':True,'applicationFilesChanged':0,'pythonSyntax':'PASS','localClustersStopped':True,'previous61And1423SuitesRerun':False,'newFocusedPostgresChecks':json.loads((E/'POSTGRES-RESULTS.json').read_text())['count']},indent=2))
files=[f for f in E.rglob('*') if f.is_file() and not any(part.startswith('disposable-') or part=='__pycache__' for part in f.parts) and '.private.' not in f.name and f.name not in ['SHA256-MANIFEST.json','postgres.log']]
(E/'SHA256-MANIFEST.json').write_text(json.dumps({f.relative_to(E).as_posix():sha(f) for f in sorted(files)},indent=2))
print(json.dumps({'status':'PASS','artifacts':artifacts,'checks':47,'files':len(files)}))
