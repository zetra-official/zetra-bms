"""Freeze exact scoped release candidates and evidence; never executes Production SQL."""
from pathlib import Path
import json,hashlib,subprocess,datetime
R=Path.cwd();E=Path(__file__).resolve().parent
def read(name):return json.loads((E/name).read_text(encoding='utf-8'))
def record(path):
 p=Path(path);return {'path':p.relative_to(R).as_posix(),'sha256':hashlib.sha256(p.read_bytes()).hexdigest()}
previous=read('CURRENT-1916-RELEASE.DRAFT.json')
for item in previous['migrationOrder']+previous['rollbackOrder']:
 assert record(R/item['path'])['sha256']==item['sha256'],'PRIOR_SQL_HASH_CHANGED '+item['path']
migration=record(E/'2026101917-atomic-sale-tax-capture.DRAFT.sql')
for name in ['SALE-TAX-CAPTURE-RESULTS.json','SALE-TAX-CAPTURE-SECURITY-RESULTS.json']:
 result=read(name);assert result['status']=='PASS' and result['migrationSha256']==migration['sha256']
assert read('CURRENT-ACCEPTANCE-RECONCILIATION.json')['status']=='PASS'
assert read('NATIVE-PDF-VERIFICATION.json')['status']=='PASS'
device=read('NATIVE-DEVICE-RUNTIME.json');device_hash=record(E/'NATIVE-DEVICE-RUNTIME.json')['sha256']
for path,sha in device['sourceHashes'].items():assert record(R/path)['sha256']==sha,'DEVICE_SOURCE_CHANGED '+path
ui=read('ANDROID-REFUND-UI-ACCEPTANCE.json')['scenarios']
for code in ['TZS','USD','KES','UGX','EUR','AED','JPY','KWD']:
 assert any(x['currency']==code and x['recipientSelected'] is False for x in ui),'PHYSICAL_SHARE_SHEET_MISSING '+code
batch=read('NATIVE-BATCH-REPRINT-RESULTS.json')
assert batch['status']=='PASS' and batch['runtimeSourceReceiptSha256']==device_hash and batch['newFinancialRequests']==0
build=read('FINAL-1917-PLATFORM-RESULTS.json')
for item in build['sourceFiles']:assert record(R/item['path'])['sha256']==item['sha256'],'FINAL_BUILD_STALE '+item['path']
evidence=['SALE-TAX-CAPTURE-RESULTS.json','SALE-TAX-CAPTURE-SECURITY-RESULTS.json','AUTHORITATIVE-TAX-TRACE-RESULTS.json','ATOMIC-REFUND-WRITER-RESULTS.json','FIELD-CUSTODY-WRITER-RESULTS.json','FINAL-WRITER-SECURITY-RESULTS.json','ORIGINAL-WORKFLOW-SOURCE-RESULTS.json','FIELD-CUSTODY-SOURCE-RESULTS.json','BROWSER-REFUND-RECONCILIATION.json','BROWSER-CUSTODY-RECONCILIATION.json','BROWSER-SUPPLIER-RECONCILIATION.json','BROWSER-FINANCIAL-EVENTS-SNAPSHOT.json','CURRENT-ACCEPTANCE-RECONCILIATION.json','ANDROID-REFUND-UI-ACCEPTANCE.json','NATIVE-DEVICE-RUNTIME.json','NATIVE-BATCH-REPRINT-RESULTS.json','NATIVE-PDF-EVIDENCE.json','NATIVE-PDF-VERIFICATION.json','FINAL-1917-PLATFORM-RESULTS.json','ORIGINAL-WORKFLOW-RUNTIME-EVENTS.json','1917-DEPENDENCY-PREIMAGE.json','FINAL-ACCOUNT-PICKER-RESULTS.json']
out={'status':'EXACT_BLOCKER_AUTHORITATIVE_TAX_CALCULATION_REQUIRED','createdAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'sourceCheckpoint':subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip(),'migrationOrder':previous['migrationOrder']+[migration],'rollbackOrder':[record(E/'1917-DISABLE.sql')]+previous['rollbackOrder'],'evidence':[record(E/name) for name in evidence],'sourceFiles':build['sourceFiles'],'mandatoryGateBoundaries':{'originalRefundWriter':'PASS local atomicity/idempotency/immutable originals; historical insufficient evidence fails closed','taxCapture':'PASS 101 contract and 25 security checks on exact SQL1917; verified synthetic producer only','custody':'PASS canonical wallet/account/receipt/supplier reconciliation; no parallel ledger','physicalAndroid':'PASS actual source forms/Expo Print/Android share sheets on connected Samsung with real Auth and disposable finance in all eight currencies; KWD custody funding/return also executed','productNavigation':'Full deployed product navigation and installed production APK are NOT certified by the isolated source-component acceptance app','webPrinting':'Native PDFs verified; IAB Web print/dialog execution is NOT certified'},'externalDecision':{'required':'Verified business tax calculation authority/policy for sale-time per-line original tax','reason':'Actual canonical sale chain has no authoritative original-tax producer. Existing generic Proforma client totals do not supply that authority. Zero tax cannot be inferred from absent evidence.','safeProposal':'Keep all rollout and source activation false. Provide the approved calculation contract (organization applicability, actual taxable basis/rates, inclusive/exclusive treatment, discount allocation and rounding authority), or an existing authoritative invoicing/tax service. Bind only its verified same-transaction evidence; no historical inference/backfill.','noProductionApprovalRequestedYet':True},'productionExecutionAuthorized':False,'activationAuthorized':False,'deploymentAuthorized':False,'productionFinancialWrites':False,'rollbackScope':'Disable new admission/RPC execution and retain all immutable financial facts; no destructive downgrade, numeric narrowing or historical rewrite.','remainingProductionGate':'After verified tax authority and complete product acceptance: refresh exact-target preimages/dependencies/ACL/locks and backup availability, prepare isolated scoped deployment artifact preserving unrelated work, then obtain one consolidated Owner SQL/activation/deployment approval. No restore rehearsal or Production smoke PASS is claimed.'}
(E/'CURRENT-1917-RELEASE.DRAFT.json').write_text(json.dumps(out,indent=2),encoding='utf-8')
(E/'CURRENT-1917-SHA256.txt').write_text('\n'.join(x['sha256']+'  '+x['path'] for x in out['migrationOrder']+out['rollbackOrder']+out['evidence']+out['sourceFiles'])+'\n',encoding='utf-8')
print(json.dumps({'status':out['status'],'migrations':len(out['migrationOrder']),'evidenceFiles':len(out['evidence'])}))
