# ZETRA POS Checkout Recovery — approved scoped release

Owner authorized publication on 26 October 2026. No SQL migration, financial mutation or Android publication is included.

## Release source and repository scope
The live Production baseline is Netlify deployment `6adf3191a53a8fa940120a8b`, app.zetra.tz. GitHub main (`f0a0a917ef1c6a68a4101a4baac3c4ad379745c0`) predates this live source and lacks its existing POS persistence dependencies. Consequently this narrowly scoped commit records the release patch, three verified before-images, four exact source snapshots and acceptance evidence under this engineering directory. It does not overwrite older root app paths with a partial dependency set, synchronize unrelated work, or pretend GitHub's default build equals current Production. Publication uses the verified active deployment artifact plus this POS-only overlay through the existing Netlify digest-upload/restore workflow. There is no confirmed automatic GitHub→Netlify integration and no infrastructure change is requested or performed.

Application source scope, represented exactly under scoped-source/:
- app/(tabs)/sales/checkout.tsx
- src/pos/saleAttempt.ts
- src/offline/salesQueue.ts
- src/pos/saleRecovery.ts

POS-RECOVERY.patch applies against before-source/ and the verified live baseline, not blindly against older GitHub main. All unrelated local changes are preserved. 823 non-POS files compared against the saved source snapshot are unchanged. No translations, JSX layout, price/stock calculations, canonical sale RPC arguments, customer/credit posting bodies, backend contracts or permissions changed.

## Root cause and correction
The blocker is per-device AsyncStorage state keyed by actor+organization+store. Another device has independent state. The old recovery opens a receipt for requiresFollowUp attempts without releasing the persisted guard, even after a completed follow-up. The customer-specific pending client ID is not available remotely; neither the TZS 19,000 absence nor PARTIAL payment status establishes failure.

The correction performs bounded read-only automatic reconciliation on checkout focus and through the existing Refresh action. It verifies exact organization/store/client-sale/sale IDs, COMPLETED status, optional original expected total and required customer/credit evidence. Proven completed attempts are archived before conditional removal, with browser Web Locks and identity comparisons. Concurrent or unresolved queue senders are retained; matching verified non-sending queue entries can be retired atomically through the existing IndexedDB queue transaction. No financial RPC or non-idempotent customer/credit follow-up is replayed. New metadata is optional and old pos_attempt_ records retain the same parser/key format. Malformed, missing, insufficiently evidenced, legacy ambiguous credit/SPLIT, mismatched or pending outcomes remain blocked. Zero current balance alone cannot prove original credit completion.

## Acceptance
PASS: 26 executed local TypeScript/storage/concurrency regression cases.
PASS: real Chromium AsyncStorage, Web Locks and IndexedDB tests (9 cases), including duplicate claim, SENDING protection and cross-store/client isolation.
PASS: actual production-built Desktop checkout with local synthetic Auth/REST fixture backed by existing canonical PostgreSQL: legacy committed recovery, receipt rendering, unknown-state protection, refresh, tab close/reopen, 503 failure and same-ID recovery after connection restoration.
PASS: same account on two isolated browser origins reproduces blocked versus enabled checkout. This is device-state separation simulation; it is not physical-device execution.
PASS: actual canonical create_sale_with_payment_v6 called twice with one client ID in disposable PostgreSQL returns one sale ID, one sale, inventory delta exactly one. Transaction rolled back. Lost acknowledgement is simulated by discarding the first result.
PASS: actual PostgreSQL hashes for sales, sale_items, sale_payments, inventory, stock_movements, credit_ledger_v2, credit_accounts_v2 and fixture wallet tables unchanged across read-only browser recovery.
PASS: genuine hosted Supabase Auth Owner session verifies new recovery sale columns, exact scoped client lookup, credit evidence columns, wrong-store filtering and denied access to another existing organization. Password/token never logged or saved. Other genuine roles NOT TESTED.
PASS: final TypeScript; Web export; focused ESLint has zero errors and 8 pre-existing warnings. Existing financial writers and JSX preserved.
NOT TESTED: complete browser-process restart; physical Android/Expo/iPhone; actual LJ customer's remote browser state.

## Production source/artifact integrity
Exact original-root baseline rebuild matches the co-deployed baseline bundle SHA256 a76c5e0ff73387d0180a3748fe88fb1e0c786c97b1f721f4da199ec475895faf. The served root bundle SHA256 1a445c236a23a33fcd50672ebded47375124057d2fe0dbf7cef5cac58f403b74 has all 1,289 identical function bodies and an exact ordered dependency-graph bijection; only generated module numbering/registration order differs. Runtime bootstrap matches after those ID correspondences. This is verified build/source equivalence, not invented source reconstruction. A preliminary nested-junction build had different asset URLs and was not used.

The rollback snapshot contains all 547 original files, each checked against Netlify SHA1. The protected original netlify.toml was recovered through Netlify's official authenticated deployment ZIP and matches exactly. The candidate preserves every original file, every existing configuration byte, headers and redirects; retains old JS chunks; adds only required compiled JS and changes only entry filenames inside existing HTML. Manifest lists exact file deltas and SHA256 values. Never publish the test-only localhost-endpoint artifacts.

## Publication and rollback
After the scoped release-record commit is pushed to GitHub main, confirm active Netlify deployment remains the verified baseline. Create an immutable draft on the SAME Production site, preserving every original file digest and original netlify.toml; upload only new verified artifact bytes. Verify candidate route/HTML/bundle hashes before publishing through the established restore-deploy endpoint. This is artifact preflight, not a Staging environment or new site. Then verify the actual live deployment ID and entry hash, non-posting POS/checkout routes, and genuine read-only permissions; no live sale/stock test.

Critical regression: restore original deployment 6adf3191a53a8fa940120a8b through the same existing site restore endpoint, then reverify root scripts and non-posting routes. The full exact local rollback ZIP and provider-retained deployment remain available. No SQL rollback applies.

## Customer recovery and limitations
Customer opens/refreshes app.zetra.tz and opens checkout; automatic verification runs. If needed, press Refresh once. Proven committed attempts resolve to the existing receipt, after which a new sale can be started. A missing/uncertain result retains the guard; no DevTools, storage deletion, SQL or new transaction ID is requested. Actual LJ resolution cannot be claimed before the affected browser is checked after deployment. Some legacy records lack sufficient original follow-up evidence; these require authoritative transaction reconciliation, not a blind reset.
