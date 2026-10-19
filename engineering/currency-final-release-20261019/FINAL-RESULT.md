# Global Currency — consolidated final safe release decision

Status: **EXACT EXTERNAL CONTRACT / ACCEPTANCE BLOCKERS — FINANCIAL RELEASE HOLD**.

Continues accepted financial checkpoint32b81a0. Catalog-only checkpointcc03b36 is separate. No canary, completed migrations, or historical full suites were repeated. No Production database writes, Auth changes, financial transactions, deployments, new project, Staging, billing changes, or historical rewrites were performed in this continuation.

## Implemented and verified locally

1. Original-currency canonical readers for sales, payments, expenses, credit ledger, original sale-item COGS and current stock. Exact decimal strings, immutable currency context, organization/store checks, Owner-only cost/profit access, bounded pagination, shared report snapshot and fail-closed incomplete history. Stock aggregates in one database snapshot, including stores with more than200 products. Stock is explicitly current catalog-cost valuation, not historical receipt attestation.
2. Actual Finance Live and Business Statement source integration with seven-language/Arabic RTL component and common PDF builder. Rollout remains false, and new RPC execution is denied in SQL. Existing screens continue unchanged until separately approved activation. This is not completion of every legacy dashboard/export reader.
3. Server-side exclusions for unsupported native inventory, cost, debt, custody and destructive writers. Backend-private operation permits preserve the certified canonical SALE/REPAYMENT paths. Source flags are not the security boundary.
4. Canonical inbound receipt extension: order/item locking, exact three-decimal quantities and unconstrained numeric purchase costs, immutable private original-cost provenance, stable request idempotency and concurrent-overreceipt rejection. Reuses the existing receiving function and inventory ledger. It is not supplier payment settlement; native stock receiving remains denied by1908 until that authority is resolved.
5. Legacy inbound/debt/loan payment writers are guarded against unsupported non-TZS settlement, including a spoofed TZS row referencing a native parent. Existing legacy TZS behavior was verified locally.
6. Independent final1909 installation after1904–1908, private FORCE RLS evidence, nonowner RPC denial, exact preimage failure and deny-only rollback. No history backfill or balance inference.

## Focused evidence

| Evidence | Result / limit |
|---|---|
| READER-RESULTS.json |106 canonical PostgreSQL reader checks PASS; synthetic Auth |
| STOCK-READER-RESULTS.json |18 checks PASS, including201 added synthetic products |
| BOUNDARY-RESULTS.json / METADATA-BOUNDARY-RESULTS.json |38 +5 writer/metadata checks PASS |
| FINAL-READER-BOUNDARY-INSTALL.json |12 independent1907/1908 install/disable checks PASS |
| RECEIPT-INTEGRITY-RESULTS.json |15 receipt/provenance/idempotency checks PASS |
| RECEIPT-CONCURRENCY-RESULTS.json |13 actual concurrent-transaction and payment denial checks PASS |
| RECEIPT-INSTALL-RESULTS.json / FINAL-DISABLE-RESULTS.json |12 +5 exact final installation/rollback checks PASS |
| READER-SOURCE-RESULTS.json |71 actual decoder/exact totals/document-builder checks PASS |
| STATEMENT-RENDER-RESULTS.json |14 rendered Desktop/Mobile viewport × seven languages checks PASS; synthetic Auth/transport/Print adapters |
| DOCUMENT-RESULTS.json / PDF-INTEGRITY-RESULTS.json |9 actual Chromium PDFs, rendered and text-verified; eight currencies plus Arabic KWD; contact sheet inspected |
| BUILD-RESULTS.json |TypeScript0 errors, Web PASS, Android/Hermes PASS |

The only repeated build phases followed a real source correction or sandbox export failure. Earlier fixture failures were local missing-required-field issues, corrected without changing Production. No completed canary or accepted large historical suite was rerun.

Prior accepted native sale/discount/split allocation, stock deduction, credit/repayment, exact expense creation and offline persistence/replay evidence from61dc9e3 and32b81a0 is retained. The eight currencies are **TZS, USD, KES, UGX, EUR, AED, JPY and KWD**. They have local certified arithmetic and selected canonical paths, not complete native-financial certification.

## Actual Production authority investigation

PRODUCTION-SETTLEMENT-CAPTURE.json and PRODUCTION-SETTLEMENT-AUTHORITY-RESULT.json record bounded fresh metadata-only inspection of projectdcmhqdckzhbuakvcyjit:52 relevant functions and25 relevant tables. No customer transaction rows were read/exported. Exact canonical receiving definition matches the1909 draft's authoritative preimage. Private catalog captures are excluded from Git; only sanitized conclusions and definition hashes are published.

* Sales/payment truth is public.sales/public.sale_payments through existing canonical sales RPCs. Cash/Bank/Mobile payment labels and amounts are not authoritative source-account balances or external settlement confirmation.
* Customer collections use credit_ledger_v2/record_credit_payment_v2. No verified collection-to-cashier-shift/source-account binding was found.
* Inbound supplier payments use record_inbound_stock_payment_v1/inbound_stock_payments and order paid/balance totals. Purchase currency exists on the order, but payment account/shift settlement and original-cost guarantees do not follow from this RPC.
* Business debt payments use record_business_debt_payment/business_debt_payments. Its amount/note records do not establish account ownership or shift settlement.
* Cashier summary reads shift-linked sales/sale_payments. It does not read credit collections, expenses or refund movements. Cashier close itself records drawer count/status; that is not a complete treasury reconciliation.
* Field Procurement wallets/history remain procurement custody. funding_control.source_ready(uuid) still returns SELECT false. Funding Control remains advances-only as explicitly directed by Owner; no general treasury ownership was assigned.
* No verified customer refund/original-tax reversal contract was found in the relevant canonical Production APIs. The approved refund policy is preserved in OWNER-POLICY-BOUNDARIES.json. No zero-tax assumption or invented tax allocation was introduced.

## Financial coverage and exact remaining blockers

| Path | Decision |
|---|---|
| Native sale, discount, split allocation, debt/repayment, offline atomic persistence | Prior local PASS retained; client/Production rollout disabled |
| Original sale-item COGS and exact gross profit | Local PASS; not tax/refund-adjusted net income |
| Native expenses | Prior local PASS; verified source-account settlement not established |
| Receipt precision, locking, original-cost provenance, idempotency | Local PASS; native receipt posting excluded pending settlement/cost authority |
| Customer refunds and historical tax reversal | BLOCKED: immutable original tax/discount/refundable allocations and original authorized settlement reversal contract missing |
| Supplier/Funding/Field custody settlement | BLOCKED: canonical payment-to-source-account and receipt/funding/custody settlement attestation missing; no duplicate ledger introduced |
| Full cashier cash/bank/mobile closing | BLOCKED: authoritative collection/expense/refund/movement-to-account/shift references missing |
| Original-currency statement/PDF | New reader path locally PASS, inactive; legacy readers and unknown historical denominations are not all certified |
| FX reporting | Existing exact engine retained; rates require verified source/time or explicit manual confirmation. No provider/rate was invented or historical values rewritten |

Recommended single contract decision: establish an explicit treasury **binding** contract for the existing canonical payment records, covering account ownership/opening authority, external settlement confirmation, original-currency/FX snapshot, shift linkage and reversal references; separately bind original saved tax allocations. Do not promote Funding Control or create another financial ledger by inference. Until that authority is specified, the affected native posting paths remain disabled. This is an accounting/security ownership dependency, not a request for routine development permission.

## Genuine acceptance and platforms

Accepted TZS onboarding genuine Auth canary remains PASS at92ee8c0 and was not reopened. New financial E2E uses actual disposable PostgreSQL with synthetic JWT claims; it is **not genuine Supabase Auth financial acceptance**. Browser statement rendering and PDF output are real local renderer runs with synthetic Auth/data adapters. No real customer sale/payment was submitted.

A physical Android device is connected and ZETRA is installed. Hermes build compatibility is PASS. New native financial workflow and Android PDF file-sharing are **NOT TESTED on-device**: the new backend/client paths are quarantined and the verified source has not been installed or deployed. Device availability alone is not a runtime PASS. Full genuine authenticated Desktop/Mobile financial lifecycle acceptance is likewise NOT TESTED until an authorized non-customer runtime can execute the completed contracts.

## Exact database package and recovery

FINAL-PRODUCTION-PACKAGE.DRAFT.json gives ordered exact hashes for1904 →1905 →1906 →1907 →1908 →1909. It is a draft inventory, **not an approved executable release or activation request**. All new RPCs are denied to PUBLIC/anon/authenticated/service_role. No additional live migration was run.

Before any future execution: mandatory functional authority/acceptance gates, fresh Production target/dependency/preimage/ACL checks, current backup verification and bounded lock/rewrite assessment must pass, followed by explicit exact-package Owner approval. No current recovery-ready/restore-tested claim is made from the metadata inspection.

Rollback order:1907-1909-DISABLE.sql,1906-DISABLE.sql,1905-DISABLE-ROLLBACK.sql; retain all deny boundaries, original contexts, request receipts and private provenance. Never narrow numeric columns, delete recorded facts or restore a stale backup over new customer transactions. Revert only the five scoped reader/source integrations after preserving later edits; their preimages are in before/ and Git. Full database restore is a separate disruptive recovery procedure, not this SQL disable.

## Independent customer Catalog release

cc03b36 preserves the one-line Catalog-only fix. The exact current deployed source baseline was reconstructed and checked, only Catalog was patched, isolated TypeScript/Web builds passed and271 artifacts were hashed. No Global Currency source is included. catalog-only/OWNER-APPROVAL.json is READY FOR OWNER WEB RELEASE APPROVAL. Current verified rollback deployment:6ad49c64c2acd6e0352f242f. Nothing was published. This optional isolated Web approval is separate from the blocked financial package.

Final decision: financial release **HOLD**, with specific canonical authority and genuine acceptance gaps above. No FULL PASS or full-system production readiness is claimed. Existing business records were neither read as test fixtures nor changed. Safe source, exact draft migrations, focused evidence, rollback and SHA-256 manifest are preserved in the existing repository.
