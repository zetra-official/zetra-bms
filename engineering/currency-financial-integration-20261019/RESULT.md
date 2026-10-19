# Global Currency Financial Integration — Consolidated Result

Status: PARTIAL — meaningful local source/contract integration completed; full native financial certification and release remain blocked. This is not full-system completion or Production readiness.

## Implemented in actual application source

- POS/Checkout read get_org_accounting_currency_v1 through a scoped, focus/session-aware adapter. Device display preference cannot supply authoritative currency. Unconfirmed current amounts are not silently labelled with a preferred currency. Pending/failed reads have seven-language feedback; late requests are cancelled/ignored across org/session changes. Existing legacy TZS calculations and canonical sale RPC are preserved. Non-TZS posting is blocked in the new checkout path pending certification; this client guard is not claimed as Production backend security.
- New offline sale captures optionally persist the verified original currency/revision/identity-rate context. Old queues are not backfilled. Same sale ID cannot acquire another currency snapshot, and status updates cannot rewrite it. Sync verifies actual store organization, current server currency and revision before using a captured context; mismatches and uncertified native posting stop before the sale RPC. Old queues without context retain their legacy path and are not claimed as currency-certified.
- Offline Receipt now preserves fractional quantities and exact line/subtotal values. The former Math.trunc quantities/Math.round line totals were incorrect for precision retail. Existing canonical whole-unit discount policy is retained; no new financial rounding policy activated. Original captured currency is used; unknown legacy denomination is not relabelled using current preferences. Share output uses the same totals.
- Existing central engine gained exact add/subtract/multiply and denomination-separated recorded totals. No parallel ledger, balance engine, rate provider or tax model. These helpers preserve decimal strings; they are not authorization or settlement certification.
- New currency diagnostic messages integrate with the existing system-message render boundary in en/sw/fr/pt/ar/es/zh. Unknown business/user text is preserved.

## Additive backend draft — NOT EXECUTED

2026101904-financial-currency-context.DRAFT.sql adds nullable currency_context to future sales, sale_payments and expenses. No default/backfill, UPDATE of old amounts, new financial RPC or EXECUTE grant. New sale/expense context comes only from existing proforma_backend.accounting_currency. Payment context inherits its actual parent sale; unknown historical parent currency remains null. Context/store/org mutation is denied; new non-TZS inserts are denied pending certification. Existing RLS and financial functions remain unchanged. This is a limited context/safety foundation, not native financial activation.

Draft SHA-256: 2d72cf83e848d4304e932403bfae0d6b0af6baae1314d4204128ee830ab9b3b4.
Rollback retains columns/captured facts and removes only new capture triggers; use only with app rollback/explicit authorization. Restoring an old database over new transactions is not an acceptable SQL rollback.

Focused Production inspection read catalog metadata only. Touched columns/types, authority columns, canonical RPC definitions, existing triggers and RLS flags exactly match the disposable schema used for testing (SCHEMA-COMPARISON.json). This is not a broad audit, data export or execution approval. Fresh backup/locks/schema checks are still mandatory immediately before any subsequently authorized write.

## Verification evidence

- FOCUSED-RESULTS.json: 24 PASS — actual exact engine, eight currency authority contexts, tenant denial, stale revisions, serialized queue immutability, real synchronizer with isolated transport, cancellation and seven-language diagnostics. Synthetic adapters, not financial E2E.
- POSTGRES-RESULTS.json: 24 PASS — captured full schema, real canonical sale RPC and stock/payment triggers, exact 6.17 fractional payment, future TZS context, idempotent retry, client helper denial, atomic non-TZS rejection, migration transaction rollback, old record preservation. Local test-only JWT claims/role grant; not genuine Auth.
- PAYMENT-EXPENSE-RESULTS.json: 16 PASS — TZS Cash/Mobile/Bank/Credit-sale/Split totals and payment snapshots; exact 12.345 expense. CREDIT sale does not certify the separate credit/repayment ledger.
- ROLLBACK-RESULTS.json: rollback preserves all new synthetic sales/payments/expenses and captured context columns.
- RENDER-RESULTS.json: 14 PASS — actual Offline Receipt TSX, React Native Web and existing dictionaries at 390/1440 widths across seven languages; synthetic router/queue/session/layout adapters, no external network. No horizontal overflow or page errors. KWD 15.475 and quantity 1.25 retained. en/ar screenshots inspected.
- Synthetic browser-print PDFs generated; Arabic A4 first page rendered and visually inspected. English PDF metadata: one A4 page. These are not end-to-end tests of the complete business PDF/receipt printing pipeline.
- BUILD-RESULTS.json records final TypeScript/Web/Android-Hermes outcomes. Sandbox asset-output failure was resolved by running affected build phases outside sandbox; no publication.
- Previous accepted 94/24/canary suites were not rerun. TZS genuine Auth canary PASS and mandatory disable remain accepted at 92ee8c0; not reopened.

## Financial module coverage

| Module | Completed/verified now | Remaining blocked or not tested |
|---|---|---|
| POS / Checkout / Sales | Authoritative current-currency reading, exact presentation, local TZS canonical sale/payment snapshot draft | Non-TZS currency-aware canonical discount/tax/tender reconciliation; legacy v6 whole-unit discount remains unchanged |
| Product prices | Native decimal helpers/metadata reused; no catalog values changed | Catalog read/write APIs lack immutable denomination lineage; full native product workflow NOT TESTED |
| Inventory / stock value / COGS | Existing stock transaction exercised by TZS canonical local sale; engine unchanged | Cost provenance/original inventory denomination and native valuation reconciliation not certified |
| Credit / debt / repayments | Exact string subtraction/denomination isolation tests; canonical CREDIT sale snapshot | Separate credit account/ledger/repayment currency contracts and historical balance lineage incomplete |
| Expenses | Future-context draft; real canonical local exact 12.345 expense | Native expense CRUD/report currency context and cross-currency settlement not certified |
| Cash / Bank / Mobile Money | Existing TZS canonical tender methods and Split tested locally | Authoritative source-account denomination, settlement balances and cross-currency reconciliation incomplete |
| Cashier shifts / closing | Existing behavior/locks untouched | Shift tender currency snapshots and native closing reconciliation not certified |
| Procurement / supplier payments | Existing contracts preserved, no competing wallet/ledger | Field Procurement custody/return and receipt cost-provenance currency contracts remain incomplete; no guessed balances |
| Refunds / returns | Existing engines untouched | Currency binding to original sale/payment/cost context and native reversals not certified |
| Finance / statements / dashboard / reports | Existing separate display/FX engine preserved; exact currency-separated aggregation helper added | Unknown historical denomination cannot be inferred from current confirmation; per-record adapters and booked native reports incomplete |
| FX / display conversion | Existing official reference feed, provenance and historical helpers retained; missing pairs fail closed | No new live provider/pair coverage certified for TZS/KES/UGX/AED/KWD; no fabricated rate or rate=1 cross-currency fallback |
| PDF / exports / printing | Changed offline receipt and synthetic browser-print coverage | Full business PDF/export/native print E2E NOT TESTED |
| Offline / synchronization | New captured context/tenant/revision checks, immutable queue, exact receipt quantities/totals | Atomic server-side envelope/revision consumption not yet implemented; legacy queue remains unverified for native currencies |

Representative TZS/USD/KES/UGX/EUR/AED/JPY/KWD have local authority/helper tests. TZS canonical posting was exercised in the disposable schema. No new non-TZS currency is certified for native financial posting by this work. Metadata/formatting support is not financial readiness.

## Platforms, source preservation and release

Desktop/Mobile: synthetic headless Edge viewport rendering PASS, not genuine application financial E2E. Native Android device is connected via ADB; new local code has not been installed in its existing binary, so physical acceptance NOT TESTED. Android/Hermes export is compatibility evidence only. No OTA/APK, Netlify deployment, remote SQL, financial activation, historical rewrites, Staging or paid infrastructure.

Preimages and SCOPE-DELTA.patch preserve the exact changes from the starting working tree, including pre-existing in-file POS/Proforma work. Do not reset/overwrite unrelated pending work. Source SHA manifest pins the tested files; build results apply to the actual working tree, which also contains prior pending changes, not an asserted clean checkout of only this commit.

## One consolidated execution boundary

There is no blanket Production execution or release request. Draft1904 is one bounded future-context prerequisite, not a full Global Currency activation package. Do not approve/execute it as certification of remaining financial paths. Native settlement/cost/credit/closing/refund/offline contracts must be completed and independently exercised before a consolidated native activation/release authorization can safely be requested. No additional canary/account action is required.
