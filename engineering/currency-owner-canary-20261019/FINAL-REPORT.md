# PARTIAL — EXACT REMAINING BLOCKERS

## Owner-approved identity and live facts

The Owner explicitly approves Auth UUID **bb2d6dee-773d-4fa7-8fda-1eb85bbad2cd** and attests that its existing organizations/history are demonstration records. That attestation is accepted. No replacement account or zero-membership condition is required by this package. Existing records remain protected.

Fresh bounded read-only Production diagnostic: UUID confirmed, active, nonanonymous, not deleted/banned. The stored email matches the previously inspected **majaribiopro@gmail.com**, whereas the new directive spells **majaribiapro@gmail.com**. No Auth email/identity changed. Enrollment is pinned to the explicitly approved UUID, and genuine login must match that UUID; email spelling is not substituted for identity and no different account is selected.

Actual canonical plan result: **BUSINESS, max organizations 2; currently owns 2**. Existing `create_org_with_store` therefore rejects a third organization with ORG_LIMIT_REACHED. This is distinct from the now-withdrawn clean-account rule. No Production plan/subscription/limit was edited. Read-only administrative diagnostics used actor claim context to inspect this backend rule; they are **not genuine Auth/session acceptance**.

Production remains: 1802/1803/1901 installed; gateway MD5 `a1a33dfe9a5de26fed5c04c42eee1044`, switch false, quota 1902 absent. No live SQL execution, enrollment, organization/store creation, financial posting or deployment occurred in this continuation. Historical accepted execution evidence remains intact.

## Prepared exact solution

1. **1902 unchanged**: `engineering/currency-canary-quota-20261019/2026101902-tzs-canary-quota.DRAFT.sql`, SHA-256 `7ce3e81d44b402d53f19f4776647e4953471aef34d51faea69536696aeb13e55`. Private persistent one-intent quota, exact request/fingerprint, safe retries/concurrency, one-hour server enrollment. It does not itself reject historical memberships.
2. **1903 new local draft**: `2026101903-owner-canary-org-limit.DRAFT.sql`. Adds one private transaction-bound, one-use permit helper/table; modifies only the existing canonical organization-limit condition and the guarded gateway. No second organization-creation engine, new ledger, subscription upgrade or changed plan data. Helper permits only the approved UUID, matching backend PID/transaction/request, active server rollout, unexpired enrollment/JWT and unconsumed quota. Token removed in the same transaction after canonical creation. An error rolls it all back. Direct client helper/table access denied. Original creation inputs, inserts and return signature retained.
3. **Owner activation draft new**: `ACTIVATE-OWNER-CANARY.DRAFT.sql`. Removes zero-history rejection; hard-pins the approved UUID and final tested postimage. Requires explicit request ID, synthetic names, timezone and approval reference. Normal roles/other actors cannot enroll. Core direct EXECUTE stays denied. No original SQL overwritten.
4. **New disable**: `DISABLE-OWNER-CANARY.DRAFT.sql`. Pins final gateway, turns server switch off, revokes API EXECUTE, audits disable and retains all history/quota/results. SHA-256 values are in CONSOLIDATED-APPROVAL.json and SHA256-MANIFEST.json.

**Material decision requiring exact SQL approval:** 1903 is a one-use exception to the current organization-count rule for this synthetic gateway trial. It deliberately permits a third synthetic organization while normal plan metadata remains BUSINESS/2. After disable it does not permit ordinary creation, but the retained synthetic organization still counts as owned. It must not be silently described as already authorized by approval of the actor or by the old 1902 hash. No old records will be removed to make space. No paid plan/billing change proposed.

Quota applies to records created through the controlled gateway. Existing unrelated organization/store management endpoints and RLS remain unchanged; no new grants to them. It is not a global revocation of every existing business API. For this saturated-plan actor the tested legacy creation RPC remains denied outside the private gateway transaction. The approved harness must perform no other business writes.

## Focused tests and preservation

**47 new PostgreSQL checks PASS.** Real disposable PostgreSQL with the captured full public schema, actual canonical org/plan functions, simulated Auth/JWT and synthetic replica of the approved UUID. Seeded two training organizations and observed BUSINESS/2 metadata; no Production data imported. Local fixture catalog was empty and its legacy RPC ACL quarantined: seeded synthetic plan/subscription fixtures using verified schema and restored only the previously verified Production creation-RPC ACL for this local test. Initial setup failures corrected; none involved Production writes.

Verified: third normal creation denied; failed install rolls back; helper/table inaccessible to API roles; wrong actor enrollment denied; approved actor with history enrolls; ordinary plan stays 2; direct legacy API cannot use exception; downstream failure leaves no partial creation/permit; concurrent retries identical; exactly one additional org/one store; no leftover permit; new IDs denied; authoritative TZS/Owner binding; cross-org currency read denied; preexisting organization/store/membership/assignment rows byte-for-byte unchanged; sales/payments/items/inventory/stock/expenses/shifts/credit, plans and subscriptions unchanged; disable retains receipt and revokes access.

Previous **61 quota/expiry checks** and **1,423 catalog/helper checks** retained, not rerun. The new generator preserves the original 1902 checksum. Actual application source hashes and previous manifests are checked, no TS/TSX changes in this continuation. Existing TypeScript 0 errors, Web and Android/Hermes build results reused; no changed application code requiring another bundle build. A database fixture/Node pass is not a native-device or genuine Auth pass.

## Currency / financial coverage

| Area | Actual status | Remaining release boundary |
|---|---|---|
| Catalog / seven-language exact formatting | 153 active currencies; nine representative currencies and 0/2/3 decimal helper evidence retained | Not native posting certification |
| Accounting authority / onboarding | Existing Owner-confirmed authority, TZS controller and disabled gateway in main source; quota/Owner-specific exception drafted | Exact SQL approval and genuine canary pending |
| Regional Settings / display preferences | Separate from server accounting authority | Full multi-device acceptance pending |
| Products / POS / checkout / sales / refunds | Existing canonical posting and adjusted-price work preserved | Immutable native currency/tender context and currency-aware discount/tax contracts incomplete |
| Inventory valuation / COGS / transfers | Existing stock engine preserved | Native/historical cost denomination and reconciliation incomplete |
| Credit / repayments / expenses | Existing records/posting preserved | Original/accounting/tender provenance and native fractional reconciliation incomplete |
| Cash / bank / mobile money / cashier | Existing balances/locks/closing preserved | Native settlement and cross-currency closing not certified |
| Procurement / suppliers | Existing wallets and held contracts preserved | Authoritative financial/cost provenance blockers retained; no activation |
| Finance / statements / dashboard / reports | Existing converter and report selectors; verified-source informational estimates only | Unknown historical amounts never relabelled; not booked multi-currency statements |
| Receipts / PDF / exports | Existing outputs retained | Current genuine workflow/physical PDF acceptance NOT TESTED |
| Offline / sync | Existing additive immutable-envelope helper evidence retained | Canonical server currency persistence adapter unverified; no queue activation |

TZS/USD/KES/EUR/AED/CNY have 2 ISO decimals; UGX/JPY 0; KWD 3. Their metadata/helper coverage does not authorize native posting. The existing percentage-discount helper rounds whole units (10% of 12.34 -> 1); non-TZS/fractional native certification cannot be declared. Canonical financial calculation changes need their authoritative server rounding/tax/ledger contracts, not a speculative UI fix. ECB captured reference coverage does not supply TZS/KES/UGX; no rates fabricated. Original historical denomination/rates cannot be inferred from current Owner confirmation. Source inventory/evidence from the prior consolidated report is reused, no new broad audit or duplicate engine.

## Genuine acceptance and one approval gate

Genuine Supabase Auth canary **NOT EXECUTED**, Desktop/Mobile/physical Android and new PDF canary acceptance **NOT TESTED**. Existing synthetic/browser/build evidence remains labelled as such. The source activation flag remains false. No Web/OTA deployment. No financial transaction authorized for the canary.

One consolidated Owner approval must cover the exact ordered 1902 + 1903 installation, explicit one-use org-limit exception, fixed-UUID activation, max one new synthetic TZS org/store, one hour, zero financial transactions, and exact disable artifact. Request/fingerprint/approval reference are fixed in CONSOLIDATED-APPROVAL.json. Fresh target/schema/ACL/backup gates before each live execution; stop on mismatch/error or uncertain COMMIT, no automatic retry. Independently verify disabled installation before enrolling.

Owner logs in privately through normal Auth; verify session.user.id, never request/extract password/OTP/token in chat. Use existing onboarding controller with the approved request ID persisted in its actor-scoped intent storage, not a new RPC. Verify real PostgREST creation, authoritative Owner/currency read, same-request retry, wrong-input/new-request denial, expiry/revocation and audit. Disable, independently verify, retain synthetic records. This release cannot proceed under unapproved new SQL. The same Owner-approved actor is accepted; the remaining gate is exact SQL/exception authorization, not a demand for another account.

Backup evidence retained: eight completed physical backups, last observed 19 October 05:58:22 UTC; actual restore rehearsal NOT TESTED. Refresh availability before live execution. No full restore over new transactions. No Staging, additional subscription or paid infrastructure.

All safe work prepared here is local. Global Currency is **not fully complete**: live approval/genuine acceptance and the listed native financial contracts remain exact blockers. One consolidated decision request, not serial small approvals. Rollback: ROLLBACK.md. Git checkpoint recorded in final response.
