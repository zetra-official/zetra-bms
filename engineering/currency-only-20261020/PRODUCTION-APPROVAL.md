# Currency-only Production approval — 20 October 2026

Candidate: **ZETRA-CURRENCY-DISPLAY-20261020**. Publication is awaiting Owner approval.

This release adds preferred display currency and latest verified reference-rate valuation to the existing TZS bookkeeping product. It does **not** enable non-TZS business accounting creation or native non-TZS posting. The onboarding selector is explicitly a **preferred display currency** selector; existing accounting denomination and all stored financial amounts remain unchanged.

## Exact proposed release

- Publish the sealed Web artifact to existing `app.zetra.tz`, Netlify site `40a9e840-5437-480e-bc63-8391d6d0ef24`.
- Publish the sealed Android JavaScript/assets through the existing EAS production channel, project `a8536709-2bea-40f4-8dd7-01563bd08c70`, package `com.anonymous.zetrabmsclean`, runtime `1.0.0`. No new APK/native dependency or infrastructure is required.
- Use only `release-artifact-web` and `release-artifact-android`, bound by `SEALED-ARTIFACTS.json`. Never export or publish the mixed root working tree. Private source maps, APKs, credentials and contact screenshots are excluded.
- **Production SQL: none. Financial activation: none.** No SQL1904–1917, tax/refund/custody/wallet writers or historical rewrites are included. Catalog and unrelated pending work are preserved and excluded.

## User behavior

The shared compact converter is connected to Dashboard, Sales cart preview, Finance live/history, Stock Value and Business Statement reports. A separate reference calculator is available. Historical report periods are valued using the latest reference snapshot, explicitly labeled current-rate valuation. The original value remains visible. PDF valuation export includes originals, conversions, status and rate evidence; it does not replace or rewrite original receipts.

153 active international currency codes are selectable from the existing versioned ISO catalog. Selection does not guarantee a provider quote for every pair. TZS pairs use Bank of Tanzania published mean reference rates; other supported pairs use ECB reference rates. Cross-rates use a single provider snapshot and effective date. There is no mixed-provider bridge. Missing, unverified or stale rates display unavailable.

Freshness policy: maximum **4 calendar days** since the provider's effective date and **24 hours** since retrieval, with refresh on entry and every 15 minutes while mounted. Date-only provider publication is not presented as an invented intraday time. Source, effective date and actual retrieval timestamp are disclosed. Reference valuations are estimates, not bank buy/sell execution quotes. Conversion uses exact decimal ratios and ISO target precision; unsafe legacy floating-point aggregation tails are refused. Owner-only values and organization/scope boundaries are retained.

## Verification and limits

- Final isolated Web and Android TypeScript, release guard and export: PASS.
- 14 valuation/security/precision tests and 2 transport/privacy tests: PASS; 52 existing currency-engine regressions: PASS.
- Legacy Proforma math compatibility: 644 cases per platform PASS.
- Exact published Android source-map comparison: only scoped currency changes, the new exchange-rates route, JS-only hashing dependency and a precision compatibility call. All 46 existing asset hashes match. Published Catalog source matches; pending hotfix remains outside this release.
- Actual Web component: mobile-width USD/UGX conversion, searchable catalog, missing BHD fail-closed, original restoration and ECB USD/EUR conversion observed.
- Actual Samsung SM-S938U **Expo Go shared component**: BoT conversion and native PDF generation/share sheet observed with synthetic values. Native one-page PDF text/hash and rendered layout verified. No recipient selected; no financial posting.
- **Not claimed:** installed candidate OTA/APK acceptance or authenticated navigation through every candidate screen. The genuine runtime evidence above covers the actual shared component; screen integrations have isolated compile/source verification. Installed production adoption and existing authenticated screens require the post-publication read-only smoke below. No new financial transaction is authorized by this package.

## Execution, stop conditions and rollback

Before any publication, re-read current production metadata and verify every source/artifact hash. Stop on baseline drift, runtime/channel mismatch, missing files or failed hash checks. Current expected Web deployment: `6ad49c64c2acd6e0352f242f`; current Android group: `9ae993b5-1566-41ea-821c-3cc94dce0151`, update `01a14bd2-bbe2-7d84-b0cd-154911b0a21e`. Do not overwrite a newer unrelated release.

After approval, publish through the existing channels only. Verify `/api/reference-fx/bot` and `/api/reference-fx/ecb` return official parseable public feeds on the real domain; verify fixed proxy rules precede SPA fallback and auth redirects remain present. Inspect existing Owner screens read-only: Dashboard, existing Sales/history data, Finance selected periods, Stock Value, Reports; switch original/USD and another supported currency, check source/effective/retrieved evidence and original preservation. Check non-owner isolation using an existing authorized session if available; do not obtain credentials through chat. On Android, download/apply the approved OTA (possibly two launches), confirm update identity/runtime and repeat read-only UI/PDF checks. No payments/refunds/stock/custody posts.

Stop and roll back if conversion, privacy, auth/navigation, permissions or currency presentation fails. Restore the previous published Netlify deployment above and republish the exact previous Android update group to production. No database rollback is needed because this release changes no database objects or records. Verify previous update identities and existing TZS screens after rollback.

Owner approval requested once for this exact **display-only** release and its post-publication read-only verification/rollback. FX source approval already given does not itself authorize publication. Approval must acknowledge that non-TZS business accounting activation is excluded and installed candidate acceptance occurs after the authorized OTA publication.
