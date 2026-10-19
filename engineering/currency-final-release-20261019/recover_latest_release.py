"""Read-only verification of saved work; writes only new recovery/release receipts."""
from pathlib import Path
from datetime import datetime, timezone
import hashlib
import json
import subprocess
import re

E = Path(__file__).resolve().parent
R = E.parent.parent
def load(name):
    return json.loads((E / name).read_text(encoding='utf-8-sig'))
def ref(path):
    p = R / path
    return {'path': p.relative_to(R).as_posix(), 'sha256': hashlib.sha256(p.read_bytes()).hexdigest()}

old = load('CONTRACT-EXTENSION-APPROVAL.DRAFT.json')
checks = []
sources = load('FINAL-SHA256-MANIFEST.json')['sourceFiles'] + old['sourceFiles']
for item in old['migrationOrder'] + sources:
    assert ref(item['path']) == item, 'SAVED_PACKAGE_DRIFT: ' + item['path']
    checks.append('Saved hash matches: ' + item['path'])
migration = ref((E / '2026101913-original-refund-evidence.DRAFT.sql').relative_to(R))
evidence_names = [
    'GENUINE-FINANCIAL-AUTH-STATUS.json', 'GENUINE-FINANCIAL-ACCEPTANCE.json',
    'GENUINE-LOCAL-FINANCIAL-RESULTS.json', 'GENUINE-LOCAL-PDF-RESULTS.json',
    'PDF-STRUCTURE-CHECKS.json', 'FINANCIAL-ACCEPTANCE-GATE-RESULTS.json',
    'ORIGINAL-REFUND-EVIDENCE-RESULTS.json', '1913-INSTALL-SECURITY-RESULTS.json',
]
for name in evidence_names[1:]:
    v = load(name)
    assert v['status'] == 'PASS', name
    if 'migrationSha256' in v:
        assert v['migrationSha256'] == migration['sha256'], name + ': migration drift'
    checks.append('Saved PASS evidence verified: ' + name)
auth = load(evidence_names[0])
acceptance = load(evidence_names[1])
assert acceptance['actor'] == auth['actor']
assert acceptance['financialTarget'] == 'DISPOSABLE_LOCAL_POSTGRESQL'
assert acceptance['productionFinancialWrites'] is False
assert acceptance['productUIAcceptance'] is False
assert acceptance['refundPosting'] is False and acceptance['custodyPosting'] is False
assert acceptance['authAcceptance'] == 'GENUINE_SUPABASE_AUTH_TO_LOCAL_CANONICAL_SQL_ADAPTER'
assert {s['currency'] for s in acceptance['scenarios']} == {'TZS','USD','KES','UGX','EUR','AED','JPY','KWD'}
checks.append('Genuine Auth actor, eight currencies and acceptance scope consistent')
flags = {
    'src/currency/settlementBindings.ts': 'BOUND_SETTLEMENT_ACTIVE',
    'src/currency/originalFacts.ts': 'ORIGINAL_FACT_READERS_ACTIVE',
    'src/currency/nativeExpense.ts': 'NATIVE_EXPENSE_ACTIVE',
    'src/offline/nativeSaleTransport.ts': 'NATIVE_SALE_PERSISTENCE_ACTIVE',
}
for path, flag in flags.items():
    assert re.search(r'export const '+flag+r'\s*=\s*false\s*;', (R/path).read_text()), flag
    checks.append('Financial client activation remains off: '+flag)
pdfs = []
for doc in load('GENUINE-LOCAL-PDF-RESULTS.json')['documents']:
    p = R/doc['file']
    assert p.read_bytes().startswith(b'%PDF-'), str(p)
    pdfs.append(ref(doc['file']))
checks.append('Ten saved PDF artifacts exist with PDF signatures')
head = subprocess.check_output(['git','rev-parse','HEAD'], cwd=R, text=True).strip()
blockers = [
    'Product Desktop/Mobile financial workflow acceptance and physical Android PDF sharing remain unverified; local Auth adapter/PDF rendering do not certify these.',
    '1913 provides immutable original evidence and refund slices only. No Production tax adapter or atomic original-payment refund/sellable-return writer is installed or certified.',
    'FIELD_PROCUREMENT wallet writers/returns and original-currency custody cutover remain deny-only; PRECISION_RETAIL receipt lifecycle is not certified.',
    'Production preflight/backup evidence is historical. Fresh exact target, dependency/preimage/ACL, lock and backup checks are required; restore rehearsal remains unverified.',
]
package = {
    'status': 'PRE_APPROVAL_HOLD_REQUIRED_ACCEPTANCE_AND_AUTHORITY',
    'recoveredAt': datetime.now(timezone.utc).isoformat(), 'gitHead': head,
    'implementationState': 'HEAD plus preserved uncommitted 1913 and genuine acceptance artifacts',
    'productionExecutionAuthorized': False, 'deploymentAuthorized': False, 'activationAuthorized': False,
    'migrationOrder': old['migrationOrder'] + [migration],
    'rollbackOrder': [ref((E/'1913-DISABLE.sql').relative_to(R))] + old['rollbackOrder'],
    'sourceFiles': sources,
    'savedPdfArtifacts': pdfs,
    'savedAcceptance': {'authVerifiedAt': auth['verifiedAt'], 'financialChecks': acceptance['count'],
        'target': acceptance['financialTarget'], 'scope': acceptance['authAcceptance'],
        'freshAuthVerifiedDuringRecovery': False, 'productUIAcceptance': False},
    'evidence': [ref((E/n).relative_to(R)) for n in evidence_names],
    'blockers': blockers,
    'rollout': 'Keep all financial client flags off, new RPCs denied and unsupported writers quarantined. No blanket EXECUTE grants.',
    'productionApprovalGate': 'Not yet eligible for full Global Currency Production approval. Resolve required acceptance/authority gates, then obtain exact-package Owner authorization with target, actor, operations, grants, expiry and disable plan.',
    'preservation': 'No Catalog, unrelated source, historical data, Production SQL, infrastructure, Staging or deployment changes.',
}
(E/'LATEST-RECOVERED-RELEASE.DRAFT.json').write_text(json.dumps(package,indent=2)+'\n',encoding='utf-8')
receipt = {'status':'PASS','count':len(checks),'checks':checks,'gitHead':head,
           'scope':'Saved evidence integrity and package scope only; no financial suites repeated; no fresh Auth claim'}
(E/'RECOVERY-INTEGRITY-RESULTS.json').write_text(json.dumps(receipt,indent=2)+'\n',encoding='utf-8')
report = f'''# Latest Global Currency recovery — 2026-10-19

HEAD: `{head}` on the existing checkout. Later work is preserved in uncommitted files; HEAD alone is not the latest implementation.

Saved genuine Supabase Auth to disposable local canonical SQL acceptance: {acceptance['count']} PASS across eight currencies. Auth verification time: {auth['verifiedAt']}. This is retained evidence, not fresh session verification. Refund evidence: 65 PASS; independent 1913 install/security/disable: 12 PASS; local PDF documents: 10 PASS; Auth admission gates: 5 PASS. Prior 473-check contract evidence is retained without repetition. Counts describe different bounded evidence sets and are not a combined full-product certification.

The loopback server returned HTTP 200 during recovery. Initial sandbox socket denial did not establish server downtime. Server availability alone does not prove a current authenticated browser session.

`LATEST-RECOVERED-RELEASE.DRAFT.json` pins migrations 1904 through 1913 and adds 1913 disable before the prior rollback sequence. Saved migration/source hashes and the 1913 evidence hashes were verified. Existing reports remain historical; their NOT TESTED statements for genuine adapter acceptance are superseded only within that adapter's scope.

Production status: **PRE-APPROVAL HOLD**. No SQL execution, deployment or activation is authorized by this recovery.

Remaining gates:
''' + '\n'.join('- '+b for b in blockers) + '''

Next executable acceptance work is the actual quarantined product workflow against a controlled local backend, followed by physical Android file sharing. Do not submit the quarantined product UI against customer Production financial endpoints to manufacture acceptance. Unsupported refunds and custody remain disabled until canonical authority is implemented and verified.

Catalog hotfix and all unrelated working changes were left untouched. No completed canary, migration or financial suite was rerun.
'''
(E/'LATEST-RECOVERY-RESULT.md').write_text(report,encoding='utf-8')
paths = [E/'LATEST-RECOVERED-RELEASE.DRAFT.json', E/'LATEST-RECOVERY-RESULT.md',
         E/'RECOVERY-INTEGRITY-RESULTS.json', Path(__file__).resolve(),
         E/'1913-DISABLE.sql', E/'genuine_local_financial.py', E/'serve_genuine_financial.cjs',
         E/'test_1913_install_security.py', E/'test_original_refund_evidence.py',
         E/'test_financial_acceptance_gate.py', E/'render_genuine_financial_documents.cjs']
(E/'LATEST-RECOVERY-SHA256.json').write_text(json.dumps({
    'files':[ref(p.relative_to(R)) for p in paths],
    'scope':'Recovery package, new local runners and verification sources; migration/source/evidence/PDF hashes are pinned inside release package',
},indent=2)+'\n',encoding='utf-8')
print(json.dumps({'status':'PASS','checks':len(checks),'head':head,'migrations':len(package['migrationOrder']),'productionGate':package['status']}))
