# Global Currency final integration checkpoint

Decision: NO-GO for full native-financial Production release. Local expense and financial-mutation safeguards are implemented and verified. This is not full-system certification or a deployment approval. Parent checkpoint 61dc9e3 remains preserved.

## Completed this continuation

- Existing app/(tabs)/sales/expenses.tsx now sends original decimal strings instead of converting input through Number. Save/edit/delete check existing server accounting authority and retain the non-TZS legacy-posting restriction. Failed requests preserve form edits and existing feedback/duplicate-submit handling. No UI redesign or Catalog hotfix changes.
- src/currency/nativeExpense.ts validates exact amounts, native minor-unit precision and immutable organization/store/request/currency/revision/date packets. Its native activation flag is FALSE. The existing Expenses screen does not yet switch to the quarantined native RPC; current TZS behavior is retained. No native client activation is claimed.
- SQL1906 adds a quarantined, atomic, idempotent native envelope around existing create_expense_v2. Store access and canonical owner/admin/staff expense rules remain authoritative. It reuses the 1905 request receipt/permit tables rather than adding a ledger. It returns accountSettlementCertified=false: an expense entry is not proof that a cash/bank/mobile-money account was settled.
- A real security gap in draft1905 was found: capture_financial_currency_v1 returned early on UPDATE after checking only scope/context immutability. Existing native sales/payment amounts could therefore be mutated outside the new atomic permit once native facts existed. 1906 preserves the original1905 artifact and adds native UPDATE permit/current-context checks. Native expense UPDATE/DELETE fail closed pending a verified reversal contract; existing TZS edit/delete behavior is unchanged.
- Final draft1906 guards exact existing create_expense_v2 definition,1905 capture-trigger definition and request-operation constraint. A mismatch aborts the transaction. New RPC and trigger-helper default grants are stripped before COMMIT. No managed-role changes, RLS relaxation, historical UPDATE/backfill/delete, financial activation or migration execution occurred remotely.

## Actual verification

| Evidence | Result |
|---|---|
| EXPENSE-RESULTS.json | 84 PASS: real canonical expense creation, exact native amount/context, replay/concurrent retry, payload conflict, precision rejection, tenant/session denial, native edit/delete rejection and no orphan permits |
| FINAL-INSTALL-RESULTS.json | 7 PASS: exact final1906 installed on independently verified disposable1904/1905, no nonowner/default EXECUTE, repeated install refused atomically, rollout disabled |
| MUTATION-COMPATIBILITY-RESULTS.json | 27 PASS: canonical sale remains valid inside permit; direct native sale mutation denied; original sale-item snapshots reconcile revenue/COGS/gross profit; legacy TZS expense update succeeds; disable retains expense facts |
| SOURCE-RESULTS.json | 14 PASS: actual exact-expense module, all eight currency packets against PostgreSQL results, precision/unsafe exponent rejection, large decimal preservation and actual screen wiring |
| BUILD-RESULTS.json | TypeScript 0 errors, Web export PASS, Android/Hermes export PASS. Hermes initially hit sandbox file permission denial; affected export passed with permitted local execution |

New focused checks: 118 PostgreSQL +14 source. Previous 285 PostgreSQL/26 source/14 rendered results and canary evidence were preserved, not rerun as historical suites. Initial local failures were corrected: ambiguous PL/pgSQL amount variable, test concurrency-module shadowing, zero-decimal test fixture, missing test-only legacy RPC grant and a source quote typo. No failed Production attempt occurred.

Expense amounts verified: TZS/USD/KES/EUR/AED 12.34, UGX/JPY123, KWD12.345. Original expense amount/currency/revision are persisted by the same backend transaction. Actual revenue, payment, COGS and gross-profit facts for all eight currencies are in MUTATION-COMPATIBILITY-RESULTS.json. Those gross-profit facts deliberately use recorded sale_items.unit_cost, including the synthetic catalog-cost changes used by the previous preservation test. They are not invented positive profits or a complete net-income statement.

## Exact remaining financial boundaries

The additional focused contract capture found actual inbound receipt functions; the earlier absence of a funding attestation must not be misreported as absence of all inventory receiving:

- receive_inbound_stock_partial_v1 updates inventory, products.cost_price/selling_price, stock_movements and business_debts. It does not persist authoritative original purchase currency or an immutable per-receipt unit-cost snapshot. It reads remaining receipt quantities before locking the order/item, and its supplier balance lookup uses a note-based order reference. The full-receive wrapper builds its remaining payload before invoking partial receive. Native receipt certification requires one locked/idempotent receiving event with immutable purchase currency/cost and verified supplier-debt linkage. Existing behavior was not silently replaced with a new costing or supplier ledger.
- funding_canonical.receipt_capability still returns settlementAllowed=false / CANONICAL_RECEIPT_ATTESTATION_REQUIRED. Field wallet return_intent requires custody/writer/currency bindings and reports financialPostingActivated=false; apply_return raises CANONICAL_RETURN_NOT_ACTIVATED. The existing wallet engine is retained.
- The captured get_my_cashier_closing_payment_summary_v1 aggregates shift-linked sales and sale_payments. It does not bind credit_ledger_v2 repayments, funding_control cash movements, wallet custody returns, expenses or customer refunds to that shift. Payment channel labels are not bank/mobile-money account balances. Complete closing cannot be certified from this subtotal alone.
- No customer-sale refund/return RPC exists in the captured relevant canonical schema. Procurement return_intent is not a customer refund; destructive delete_sale is not an acceptable reversal. Refund authorization, refundable quantity, original price/discount/tax allocation, restock disposition, original COGS reversal and settlement-ledger linkage require a defined canonical reversal contract. No guessed refund or tax rule was activated.
- Captured canonical sale RPCs expose no verified native-tax allocation/reversal input. Jurisdictional rates and inclusive/exclusive rounding cannot be inferred from currency. No tax default was invented.
- Existing expense/report readers return legacy numeric summaries without immutable per-record currency proof. New native expense creation is locally certified; current history/report/PDF readers must be upgraded to exact original currency facts before enabling it in clients. Display preference alone cannot supply those facts.

These are explicit accounting/security contract gaps, not merely missing labels. Existing source-only fixes cannot establish missing historical currency or account/shift ownership facts safely.

## Consolidated coverage

| Financial path | Status |
|---|---|
| Native sale/discount/split, stock deduction, atomic debt/repayment, offline packet/recovery | Prior local PASS retained; client rollout remains disabled |
| Native expense creation | Local canonical PASS for eight currencies; native app/history/account settlement not activated |
| Existing-stock COGS and gross-profit snapshot reconciliation | Local PASS; not full receipt costing/net-income certification |
| Refunds/returns and native tax | BLOCKED by exact canonical reversal/rule bindings above |
| Procurement/supplier receipts and settlement | PARTIAL: actual legacy writers identified; native provenance/locking/idempotency/debt binding not certified |
| Cashier full reconciliation | BLOCKED by missing movement/collection/refund-to-shift bindings |
| Financial statements/dashboard/reporting FX | PARTIAL: exact engine and immutable snapshot arithmetic retained; complete native report feeds/provider coverage not certified |
| Onboarding | Accepted TZS genuine canary remains PASS; no replay or migration1802/1803/1901/1902/1903 execution |
| Web/Mobile runtime | Prior14 synthetic receipt renders retained; changed expense flow not genuine authenticated financial E2E |
| Android | Hermes compatibility PASS; new-source physical-device financial acceptance NOT TESTED |
| PDFs/exports/printing | Complete original-currency business document generation/sharing NOT TESTED; prior browser-print evidence is not a substitute |
| Seven languages/RTL | Existing strings/architecture retained; no new visual-language acceptance claimed this continuation |

None of the eight currencies is declared fully native-financial-ready across every required path. A build or synthetic JWT is not genuine Auth/platform acceptance.

## Production package and release gate

PRODUCTION-APPROVAL.DRAFT.json lists exact1904/1905/1906 artifacts and checksums, dependencies, exclusions and deny-only rollback. It is an INVENTORY, NOT an executable approved release package. Overall execution and deployment are HOLD; no approval is being requested to activate incomplete native paths. Live migration authorization has not been given for any of these drafts.

Order if subsequently approved:1904 ->1905 ->1906. Fresh Production catalog/preimage/ACL/backup/lock readiness must pass immediately before that separate execution. Previous metadata/backup evidence is retained but was not freshly revalidated for a release that currently fails functional gates. No current recovery-ready claim is made.

Catalog customer hotfix app/catalog.tsx remains excluded and untouched. Login, Proforma, profile work and other dirty files were not staged or overwritten. No native financial code is mixed into a Catalog release. This continuation changes only the Expenses source plus the exact native-expense module and scoped evidence.

Before full release, the precise owner/business decisions required are the canonical refund/restock/tax policy and approved settlement/shift ownership bindings; technical implementation must then pass genuine financial acceptance in an authorized disposable runtime or explicitly approved controlled actor workflow. The old onboarding canary authorization is not financial-write permission. There is no safe blanket execution/deployment approval to request now.

Rollback: disable1906, then deny-only1905 rollback; retain all native facts, request receipts, precision widening and capture/mutation guards. Never narrow numeric columns or restore an old backup over new business transactions. Source rollback uses this checkpoint's two source files and the before snapshot only, after preserving later edits. See the consolidated manifest; no destructive Git operation is required.
