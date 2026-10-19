# Native Financial Contract Completion — 2026-10-19

Status: PARTIAL — core native settlement/debt/cost contracts locally verified; complete financial and platform certification remains blocked. Base checkpoint: 5b1c604. No Production writes, deployment, Staging, canary replay or historical currency conversion occurred.

## Implemented in the actual source repository

- src/currency/settlement.ts mirrors the proposed canonical server settlement with decimal strings and existing exact engine arithmetic. Legacy TZS rounding remains unchanged; other native currencies use catalog precision, HALF_AWAY_FROM_ZERO settlement and an explicit rounding delta. Split allocation must equal actual paid amount exactly; a short tender cannot silently become credit.
- src/offline/nativeSaleTransport.ts prepares one atomic canonical-sale request including debt, original organization/currency/revision and immutable request ID. It requires original decimal strings, never silently upgrades old numeric queues, and converts the existing split-note format into a validated structured allocation. Its rollout constant remains FALSE.
- src/offline/salesQueue.ts persists an optional immutable exact native packet. Failed/status updates cannot replace or erase original amounts. Existing legacy queue format remains readable.
- src/offline/salesSync.ts contains the disabled native adapter. It never posts debt separately after the atomic outcome. An uncertain outcome remains NEEDS_REVIEW; actor-scoped read recovery can confirm a committed result without submitting another financial request. Missing/mismatched outcomes retain the queue. Source tests enable this branch only in an isolated bundle transform with fake transport.
- app/(tabs)/sales/offline-receipt.tsx and src/offline/receiptTotals.ts use original decimal strings for quantities, line totals, discount, paid and debt. Values above Number.MAX_SAFE_INTEGER retain precision. Legacy receipt rules remain intact; old unknown denominations are not relabelled using current preferences.

The online Checkout UI has NOT been switched to these new quarantined RPCs. Exact-string online input capture and end-to-end rollout acceptance remain required before activation. No duplicate accounting, inventory, FX or balance engine was added.

## Backend draft and actual root causes

2026101905-native-settlement-atomic.DRAFT.sql depends on the unchanged 1904 draft. SHA-256:
f9f849d7eb43844d8da92cf3c44bc51d8b9603b2c9d896eb2ab6d6e8aa35f3d4

1904 SHA-256: 2d72cf83e848d4304e932403bfae0d6b0af6baae1314d4204128ee830ab9b3b4. Both remain LOCAL DRAFTS, not executed remotely.

Confirmed gaps in captured canonical contracts:
- v4 rounded split equality to whole units, accepting unequal cent allocations. Native discount/final settlement precision was missing.
- v6 sale and client-side credit posting were separate transactions, allowing a sale to succeed while debt recording failed.
- record_credit_sale_v2 local amount and credit_ledger_v2.delta numeric(14,2) could lose KWD's third decimal. products.price/cost numeric(12,2) had the same limitation.
- Existing cost trigger snapshots products.cost_price into sale_items.unit_cost. Historical COGS must use that snapshot, not current product cost or the null unit_cost_price field.

1905 reuses create_sale_with_payment_v6 -> v4 -> create_sale and existing credit/shift contracts. It adds atomic wrappers for sale+debt, repayments, recorded shift opening/closing and actor-owned result lookup. Same-key requests serialize before canonical idempotency checks; changed payloads conflict. Credit-account locks prevent concurrent over-collection. Shift locks prevent a native sale racing a native closing. Structured split inputs reject negative/malformed/raw-note injection before canonical allocation. Failure rolls back sale, payment, stock, debt and request receipt together.

Original authority remains proforma_backend.accounting_currency. New private tables are rollout policy, transaction-local permits and idempotency receipts, NOT a ledger or currency authority. Non-TZS canonical writes require the same actor/store/backend PID/transaction permit as well as enabled organization/revision policy. New tables FORCE RLS with no client policies. All four new public RPCs and new helpers have no nonowner EXECUTE grants. Effective anon/authenticated/service_role/test-client access is DENIED; administrative ownership is preserved. Rollout starts empty. No client flag is treated as server security.

Schema precision widening preserves values but needs real lock/rewrite sizing before any live approval. credit_payments_v2 and credit_sales_v2 depend on delta: exact captured definitions/owner/options/ACL are guarded, dropped without CASCADE and recreated atomically with original owner-only permissions. Canonical v4 and credit function MD5 preimages are guarded; existing ACLs remain unchanged. No customer-record UPDATE/backfill/delete is included. DDL cannot be blindly applied to a drifted schema.

## Evidence and monetary reconciliation

| Evidence | Actual result and scope |
|---|---|
| NATIVE-RESULTS.json | 111 PASS: canonical PostgreSQL sale/payment/stock/debt/repayment, discount/settlement, duplicate and concurrent retry, failure rollback; eight synthetic currencies |
| COST-CASHIER-RESULTS.json | 100 PASS: real cost snapshots, inventory conservation, canonical cashier-role opening/sale/recorded-closing, retries, closed-shift rejection, private receipt recovery |
| FINAL-DELTA-RESULTS.json | 33 PASS: final structured split gateway, exact Cash/Mobile/Bank allocation, malformed/negative/underallocated rejection without financial commit |
| INSTALL-SECURITY-RESULTS.json | 26 PASS: fresh full-schema 1904 -> exact final 1905 installation, effective RPC denial, private RLS, historical preservation, atomic duplicate-install rejection and disable rollback |
| CREDIT-CONCURRENCY-RESULTS.json | 5 PASS: simultaneous distinct full KWD repayments commit once; other fails balance check; debt is exactly zero; rollback retains ledger facts |
| DISABLE-HELPERS-RESULTS.json | 3 PASS: final rollback removes temporary grants to writer/policy/trigger helper |
| SCOPE-SECURITY-RESULTS.json | 7 PASS: missing session, unassigned actor, cross-org payload/product and stale revision denied; immutable product currency; no stranded permits |
| SOURCE-RESULTS.json | 18 PASS: real preview/transport/synchronizer with isolated transport; server totals reconciled, no separate credit write, read-only lost-response recovery |
| OFFLINE-EXACT-RESULTS.json | 8 PASS: actual queue/receipt with synthetic storage; original 9007199254740993.125 KWD survives; no silent legacy upgrade; immutable status/idempotency checks |
| RENDER-RESULTS.json | 14 PASS: real Offline Receipt TSX/RNW at 390/1440 across en/sw/fr/pt/ar/es/zh with synthetic router, queue, session/layout; no overflow/page errors; en/ar screenshots inspected |
| BUILD-RESULTS.json | TypeScript 0 errors; Web production export PASS; Android/Hermes export PASS. Not a device release. Sandbox asset/browser failures resolved by permitted local execution; not application regressions. |

Total this task: 285 focused PostgreSQL assertions, 26 source assertions, 14 rendered combinations. These counts combine bounded suites within this task; accepted historical 94/24/canary suites were NOT repeated. The earlier 111/100 cases were reused after changes limited to structured split/account locking; those final changes have their own targeted tests, and the exact final draft was installed independently.

Example actual canonical KWD settlement: 0.125 × 12.345 = 1.543125; 10% discount rounds to 0.154; raw 1.389125; explicit settlement rounding -0.000125; payable 1.389. Actual split 2.345 + 5 + 5 = 12.345. Debt 12.345 minus repayment 12.345 = 0. Historical cost snapshot remains 5.125 after catalog cost changes. JPY: subtotal 15.375 minus rounded discount 2 plus rounding -0.375 = 13. Detailed per-currency amounts are in NATIVE-RESULTS.json.

Auth in these PostgreSQL tests uses synthetic JWT claims and temporary local grants. It is NOT genuine Supabase Auth acceptance. Existing genuine TZS onboarding acceptance at 92ee8c0 remains accepted and was not reopened.

## Financial coverage

| Path | Status | Exact limit |
|---|---|---|
| Native prices, discounts, tender allocation, canonical sale/stock and atomic debt | LOCALLY VERIFIED | TZS/USD/KES/UGX/EUR/AED/JPY/KWD synthetic end-to-end contracts; no live activation or online client E2E |
| Offline exact packet, idempotency, result recovery | LOCALLY VERIFIED | Real source with fake storage/transport; server commit/retry separately proven; genuine app kill/restart/network E2E NOT TESTED |
| Existing inventory cost snapshots/COGS | LOCALLY VERIFIED | Existing-stock conservation and immutable sale-item costs; new purchase receipt provenance NOT certified |
| Credit and repayments | LOCALLY VERIFIED | Existing canonical credit ledger, exact precision, idempotency and concurrent balance checks |
| Cashier opening/sale/recorded count | LOCALLY VERIFIED | Full expected-cash/custody/outflow/return reconciliation remains BLOCKED; response explicitly reconciliationCertified=false |
| Cash/bank/mobile-money settlement | PARTIAL | Sale payment allocations proven; independent authoritative account balances and external settlement reconciliation not certified |
| Expenses | BLOCKED for new native posting | Prior TZS expense/context evidence retained; new native expense atomic activation/contract not completed |
| Refunds/customer returns | BLOCKED | No authoritative customer sale refund/return RPC in captured relevant schema. delete_sale or procurement custody return is not a refund contract |
| Procurement/supplier settlement | BLOCKED | funding_canonical.receipt_capability returns settlementAllowed=false / CANONICAL_RECEIPT_ATTESTATION_REQUIRED for supported workflows |
| Field Procurement cash returns | BLOCKED | return_intent requires proven wallet writers/custody currency and returns financialPostingActivated=false; apply_return raises CANONICAL_RETURN_NOT_ACTIVATED |
| Native tax allocations | NOT CERTIFIED | Captured canonical sale contract has no verified native tax input/allocation binding; none invented |
| FX/display/reporting | Previous engine preserved | No new provider/rate fabricated; this task does not certify unresolved historical-rate provider or all finance/report screens |
| Desktop/Mobile | SYNTHETIC RENDER VERIFIED | Actual receipt component; full authenticated new financial workflow NOT TESTED |
| Physical Android / business PDF/export/printing | NOT TESTED | New source not installed on device or published; no genuine complete document workflow run |

None of the eight currencies is claimed FULL native-financial-ready across every required path.

## Rollback, preservation and next gate

See ROLLBACK.md. 1905-DISABLE-ROLLBACK.sql revokes new caller/helper grants and disables rollout, retaining every financial fact and original context. Do not shrink numeric precision, restore old unsafe split comparisons, delete request receipts, remove the 1904 protection after native facts, or restore an old database over new customer transactions.

Six application source files only were changed/added; before snapshots cover four modified existing files. Other dirty work was neither staged nor overwritten. SQL definitions, exact hash, tests and rollback are retained in SHA256-MANIFEST.json and the scoped Git checkpoint.

Next: complete the authoritative refund/receipt/settlement and cash-reconciliation bindings, then genuine online/offline/platform acceptance. 1904/1905 need one separate exact Production approval after fresh metadata/dependency/ACL/backup/lock gates; activation grants/rollout and client publication are a further explicit boundary. This report is NOT a Production execution request or release readiness claim.
