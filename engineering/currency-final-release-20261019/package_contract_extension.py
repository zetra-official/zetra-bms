"""Package already-verified local artifacts; no SQL execution or network access."""
from pathlib import Path
import json,hashlib,datetime
R=Path.cwd();E=R/'engineering/currency-final-release-20261019'
digest=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
def ref(p):return {'path':p.relative_to(R).as_posix(),'sha256':digest(p)}
old=json.loads((E/'FINAL-PRODUCTION-PACKAGE.DRAFT.json').read_text())
ordered=[R/x['path'] for x in old['dependencyOrder']]
for p,x in zip(ordered,old['dependencyOrder']):
 assert digest(p)==x['sha256'],p
ordered += [E/name for name in ['2026101910-private-settlement-bindings.DRAFT.sql','2026101911-private-procurement-bindings.DRAFT.sql','2026101912-private-cashier-bindings.DRAFT.sql']]
testnames=['SETTLEMENT-BINDING-RESULTS.json','BOUND-PROCUREMENT-RESULTS.json','BOUND-CASHIER-RESULTS.json','SETTLEMENT-SOURCE-RESULTS.json','SETTLEMENT-QUEUE-RESULTS.json','CONTRACT-INSTALL-RESULTS.json','BINDING-SECURITY-RESULTS.json','BOUND-RECEIPT-COGS-RESULTS.json']
tests=[json.loads((E/n).read_text()) for n in testnames]
assert all(x['status']=='PASS' for x in tests)
assert all(x['exitCode']==0 for x in json.loads((E/'CONTRACT-CLIENT-BUILD-RESULTS.json').read_text()))
assert digest(ordered[-3])==tests[0]['migrationSha256']
assert digest(ordered[-2])==tests[1]['migrationSha256']
package={
 'status':'HOLD_FINANCIAL_ACTIVATION_AND_GENUINE_ACCEPTANCE','targetProject':'dcmhqdckzhbuakvcyjit',
 'productionExecutionAuthorized':False,'deploymentAuthorized':False,'clientActivation':False,
 'migrationOrder':[ref(p) for p in ordered],
 'rollbackOrder':[ref(E/'1910-1912-DISABLE.sql')]+old['rollbackOrder'],
 'scope':'Install private quarantined bindings only if separately approved; this draft does not enable financial clients or RPC grants.',
 'implementedLocally':['Owner-confirmed account opening/source authority with no inferred balances','Atomic canonical sale, collection, expense and split-payment source/account linkage','Immutable offline original currency, source and response recovery context','Canonical inbound receipt/cost -> supplier debt -> supplier payment linkage counted once','Exact receipt-to-sale COGS conservation','Drawer/account binding, delegated operation permissions, full-coverage checks, guarded canonical close and discrepancies'],
 'currenciesLocallyExercised':['TZS','USD','KES','UGX','EUR','AED','JPY','KWD'],
 'focusedChecks':sum(x['count'] for x in tests),'testEvidence':[ref(E/n) for n in testnames],
 'sourceFiles':[ref(R/p) for p in ['src/currency/settlementBindings.ts','src/offline/salesQueue.ts','src/offline/salesSync.ts']],
 'access':{'PUBLIC':'DENIED','anon':'DENIED','authenticated':'DENIED','service_role':'DENIED','functionOwner':'Administrative owner only; no newly granted API access'},
 'refunds':'DENIED: original line-level discount/tax allocations and authorized original reversal source unavailable. Never infer zero tax or current catalog cost.',
 'fieldCustody':'DENIED: canonical custody_event, wallet_writers_bound and apply_return are deny-only; no original-currency/writer-complete custody settlement proof. Funding Control remains advances-only.',
 'historicalPolicy':'No backfill, denomination inference, amount conversion or historical record rewrite.',
 'backupEvidence':ref(E/'CONTRACT-PRODUCTION-PREFLIGHT.json'),
 'recovery':'8 completed backups observed; latest physical ID2007453045. Availability verified, restore rehearsal NOT TESTED, Storage objects excluded. Fresh backup/lock/preimage gates required immediately before any approved execution.',
 'risks':['New precision ALTERs require bounded DDL locks; stop on lock/preimage failure, never force execution.','Disable retains widened numeric types and committed canonical records; never shrink types or restore an old backup over new customer transactions.','Unbound legacy events make complete closing coverage false; timestamps never assign an account or shift.','Legacy TZS fractional settlement exceeding currency minor precision is denied pending an explicit canonical rounding decision; no silent rounding.','Bank/mobile confirmation is Owner-authorized bookkeeping, not provider-settlement verification.'],
 'acceptance':{'PostgreSQL':'DISPOSABLE_SYNTHETIC_AUTH_PASS','TypeScript':'PASS_0_ERRORS','WebBuild':'PASS','AndroidHermesBuild':'PASS','genuineFinancialAuth':'NOT_TESTED','DesktopFinancialE2E':'NOT_TESTED','MobileFinancialE2E':'NOT_TESTED','physicalAndroidFinancialE2E':'NOT_TESTED','PDFShareFinancialE2E':'NOT_TESTED','historicalTZSOnboardingCanary':'ACCEPTED_PREVIOUS_EVIDENCE_NOT_RERUN'},
 'excluded':['Unrelated working-tree changes','Catalog','Refund/tax posting without immutable original evidence','Field Procurement custody posting','Non-TZS live financial activation','All Production execution/deployment'],
 'approvalBoundary':'Not ready for unrestricted financial release. Resolve original evidence/custody authority and perform controlled genuine financial acceptance. Any future Production request must pin these exact hashes and separately define account confirmation, actor, grants, expiry, activation and mandatory disable. No blanket authenticated EXECUTE.',
}
(E/'CONTRACT-EXTENSION-APPROVAL.DRAFT.json').write_text(json.dumps(package,indent=2)+'\n',encoding='utf-8')
report='''# Global Currency private contract extension — local result

Status: PARTIAL — LOCAL CONTRACTS VERIFIED; PRODUCTION/FINANCIAL ACTIVATION HOLD.

Implemented in the existing repository: Owner-confirmed Cash/Bank/Mobile source-account authority, atomic binding to existing sale/credit/expense records, immutable offline settlement context and actor-scoped uncertain-result recovery. No duplicate monetary movement ledger. Canonical inbound receipt and actual supplier debt/payment records reconcile once; receipt-to-sale COGS retains original cost. Cashier account custody, authorized movements, coverage checks and closing discrepancy evidence reuse the canonical shift and close contracts.

Evidence: 473 focused assertions PASS across eight local currencies (TZS, USD, KES, UGX, EUR, AED, JPY, KWD). This is bounded-path evidence, not certification of every financial operation. Exact1910–1912 independently installed after1904–1909, historical fixture fingerprints unchanged; deny-only rollback PASS. TypeScript0 errors, Web and Android/Hermes builds PASS. Existing suites and TZS canary were not repeated.

Security: all new public RPCs deny PUBLIC/anon/authenticated/service_role; private tables FORCE RLS. Concurrent outflows cannot overdraw, repeated requests cannot double-post, bound source/audit evidence is immutable, a non-admin LOGIN cannot escalate through SET ROLE. Clients remain inactive. Missing source links fail closed. Owner bank/mobile confirmations are not external provider settlement proof.

Remaining genuine dependencies:

1. Refund/tax reversal: Production canonical sales/items metadata has no verified original line tax/discount allocation source. The approved policy cannot reconstruct that evidence from totals/current settings. `original_refund_readiness_v1` denies posting. Supply an authoritative original snapshot/tax-service contract; historical unsupported refunds remain disabled.
2. Field Procurement custody: actual `funding_canonical.custody_event(uuid,text,uuid)`, `funding_evidence.wallet_writers_bound(uuid)` and `funding_evidence.apply_return()` remain deny-only. No verified wallet-wide original-currency writer/custody settlement evidence is available. STANDARD inbound supplier settlement is verified locally; FIELD_PROCUREMENT custody and PRECISION_RETAIL-specific receipt lifecycles are not certified. Funding Control was not promoted to treasury. A dedicated reviewed wallet writer/return contract and original-currency cutover evidence are needed; this package does not invent them.
3. Genuine financial Auth/browser/physical Android/PDF sharing acceptance is NOT TESTED. Build and synthetic transport tests do not establish it. Future controlled acceptance needs an authorized non-customer financial runtime/actor and explicit allowed operations. No existing demo/customer records were used or changed.

Read-only Production preflight: canonical pinned signatures/preimages match; no new-object collisions;8 completed backups observed. Latest physical backup ID2007453045, inserted2026-10-19T05:58:22.150Z. Restore rehearsal NOT TESTED; database backup excludes Storage objects. No customer rows read, no Production SQL writes, no deployment.

Exact migration ordering/hashes, source files, exclusions and checks are in `CONTRACT-EXTENSION-APPROVAL.DRAFT.json`; integrity coverage is in `CONTRACT-EXTENSION-SHA256.json`. Earlier accepted reports/manifests remain unchanged. These are drafts, not Production execution authority.

Rollback: disable admission and revoke new RPC access using1910–1912-DISABLE.sql first, then preceding deny-only scripts if needed. Retain original payments, evidence, account snapshots, idempotency receipts and widened numeric types. Do not drop history, narrow amounts or restore an old backup over new transactions. Before any future execution recheck exact target, hashes, preimages, dependencies, bounded locks and current backup availability.

Next: resolve the original refund evidence and wallet custody authority above, then authorize a single scoped genuine financial acceptance/release package. No request to activate incomplete financial paths is made.
'''
(E/'CONTRACT-EXTENSION-RESULT.md').write_text(report,encoding='utf-8')
names=['1910-settlement-bindings.sql','1911-procurement-bindings.sql','1912-cashier-bindings.sql','1911-DEPENDENCY-PREIMAGES.json','1912-DEPENDENCY-PREIMAGES.json','1910-1912-DISABLE.sql','1910-typescript.log','1910-web.log','1910-android-hermes.log','CONTRACT-CLIENT-BUILD-RESULTS.json','CONTRACT-PRODUCTION-PREFLIGHT.json','CONTRACT-RELEASE-PREFLIGHT-READONLY.sql','contract_production_readonly.py','build_contract_clients.py','build_procurement_bindings.py','build_cashier_bindings.py','test_settlement_bindings.py','test_procurement_bound.py','test_bound_cashier.py','test_contract_install.py','test_binding_security.py','test_bound_receipt_cogs.py','settlement-source.test.cjs','settlement-queue.test.cjs','integrate_settlement_source.py','fix_supplier_local.py','CONTRACT-EXTENSION-RESULT.md','CONTRACT-EXTENSION-APPROVAL.DRAFT.json','package_contract_extension.py']
files={E/n for n in names+testnames}|set(ordered)|{R/x['path'] for x in package['sourceFiles']}
files.update((E/'before-1910').rglob('*.ts'))
manifest={'scope':'Local private contract extension; excludes private captures, disposable databases and unrelated work','files':[ref(p) for p in sorted(files)],'status':'VERIFIED_LOCAL_ONLY','productionWrites':False,'deployments':False}
(E/'CONTRACT-EXTENSION-SHA256.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'focusedChecks':package['focusedChecks'],'migrations':package['migrationOrder'][-3:],'manifestFiles':len(files),'status':package['status']},indent=2))
