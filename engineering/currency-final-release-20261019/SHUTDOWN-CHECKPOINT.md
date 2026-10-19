# Owner-requested safe shutdown — Global Currency

Paused at Owner request on 2026-10-19. Continue Global Currency only. No Production SQL, financial activation, deployment, Staging or new paid infrastructure was performed. Catalog and unrelated working changes remain untouched.

Recovery base HEAD: `be279a3c65da8ff70024491defe5ee54fd1f7d80` (`main`). A scoped Git checkpoint will preserve this continuation; use the latest Git commit, this file and `SHUTDOWN-PRESERVATION.json` when resuming. Do not reset/clean/stash/pop or restore over this checkout.

## Saved implementation

- New quarantined SQL1914: atomic original-evidence refund writer, original payment/account allocation, exact cumulative tax/discount/COGS slices, idempotency and sellable-only stock return. No tax amount or rate was invented. No Production tax adapter is certified.
- New quarantined SQL1915: canonical Field Procurement wallet/account FUND, RETURN, supplier payment and expense bindings, exact currency revision, zero-history wallet admission and deferred conservation. Reuses existing wallet transactions, inventory receipts, supplier/debt records and settlement projections. Historical wallets remain fail-closed; Funding Control remains advances-only.
- New SQL1916: scoped workflow readers, immutable original sale-item/return movement references and recognized custody coverage for cashier closing. All new RPCs deny public/anon/authenticated/service_role by default. Client `ORIGINAL_WORKFLOW_ACTIVE` remains false.
- Actual source refund and field custody forms/routes and durable request clients are saved. Uncertain requests retain the exact request/payload. Known atomic PostgreSQL refusals can permit correction without a new financial posting.
- Web PDF source fix: Expo Web `printToFileAsync` returns no file URI and prints the current page. `shareFinancialPdf.ts` opens the generated document itself for Web printing; native retains actual Expo Print/Sharing. New refund PDF builder excludes private COGS/source accounts.

## Evidence: precise scope, no blanket release PASS

- Prior genuine Auth adapter57, original refund evidence65,1913 install/security12, PDFs10 and earlier473 contract checks remain saved; do not rerun them without a relevant change.
- `ATOMIC-REFUND-WRITER-RESULTS.json`:52 PASS, actual local PostgreSQL, synthetic Auth/tax fixtures; eight currencies; financial scenarios rolled back.
- `FIELD-CUSTODY-WRITER-RESULTS.json`: latest89 PASS; eight currencies; canonical receipts, supplier/debt settlement, expenses, transfers, retries, direct wallet denial; scenarios rolled back. Verify its migration SHA against the current1915 draft.
- `ORIGINAL-WORKFLOW-SOURCE-RESULTS.json`:16 PASS; request persistence/uncertain-result checks using injected storage/RPC failures.
- `FIELD-CUSTODY-SOURCE-RESULTS.json`:43 PASS; exact requests/persistence; injected storage/RPC failures.
- `FINAL-WRITER-SECURITY-RESULTS.json`:45 PASS is an EARLIER bounded run. Its hashes predate later1915/1916 changes. Do not promote it as final current-package security certification.
- The later final security script reached the legacy TZS probe and failed because the restricted disposable fixture has no v4/v6 EXECUTE grants. A separate rolled-back probe of the actual app's v6 endpoint with an explicit transaction-local fixture grant PASSED. The final security script was corrected to compare unchanged original ACLs and use this fixture-only grant, but its final full invocation has NOT been rerun successfully since that correction.
- Latest completed TypeScript invocation exited0. Browser harness `--build-only` bundled successfully, but that alone is not runtime acceptance.

## Exact current runtime failure / next step

The real local browser session was independently observed as GENUINE AUTH VERIFIED. Actual `OriginalRefundForm` posted TZS refunds through real upstream Supabase Auth to disposable local PostgreSQL; saved events are in `ORIGINAL-WORKFLOW-RUNTIME-EVENTS.json`. This is bounded component/local-transport evidence, not full deployed product acceptance. The first runtime also received extra UI interactions; retain all event records rather than counting them as a planned eight-currency run.

After adding the actual Expo Print/Sharing imports, the refreshed local esbuild harness renders a blank page. Browser console shows:

`ReferenceError: __DEV__ is not defined` in `http://127.0.0.1:55625/client.js`.

NEXT: add the appropriate Metro-compatible `__DEV__` definition to the LOCAL esbuild harness in `serve_original_workflow.cjs`, rebuild, and verify the actual browser form before continuing acceptance. Do not alter Production flags to work around this harness error. Resume saved disposable runtime data deliberately; `original_workflow_runtime.py` currently creates a new random clone by default. Do not overwrite/discard the saved runtime clusters or existing event evidence.

Latest runtime before shutdown:

- Node32784; worker7192; URL127.0.0.1:55625.
- `engineering/native-financial-contracts-20261019/disposable-original-product-b1896a59-dd2b-424a-b989-2ae03f51ed49/cluster`.
- Earlier actual TZS UI postings are retained in `engineering/native-financial-contracts-20261019/disposable-original-product-b05607cd-0e83-4775-aa21-9fda9d7239ab` and the appended event JSON.
- Preserve browser local storage/private Auth session; do not extract tokens or blindly discard pending requests.

Android device was detected as Samsung SM_S938U, serialR5CY23FMCCD. ZETRA, Chrome and Expo Go are installed. No new financial component, native PDF/share or full physical-device lifecycle PASS was executed. Device connectivity is not runtime acceptance.

## Still required before Production approval

1. Verify/register the actual authoritative original-tax snapshot producer/service. Stored totals/current settings are not sufficient evidence; never infer historical tax or rewrite history.1913 defines the private same-sale-transaction adapter contract.
2. Complete genuine current-source Desktop/Mobile/Android/PDF acceptance and all remaining actual product integration checks. Current UI tests do not close this entire gate.
3. Run only the final targeted security/compatibility/build checks justified by these new changes; update the final package to1904–1916 with exact hashes, deny-only rollback and fresh required Production preflight/backup evidence.
4. Obtain one exact consolidated Owner Production approval before any SQL execution, grants, activation or deployment. No such approval has been given.

This is a saved work-in-progress shutdown checkpoint, not RELEASE READY or completion of the mission. Resume directly from the failure above; retain earlier completed evidence.
