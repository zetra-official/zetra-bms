# Global Currency private contract extension — local result

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
