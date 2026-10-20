# Currency Display — Dashboard replacement candidate

Package ID: **ZETRA-CURRENCY-DISPLAY-DASHBOARD-FIX-20261020**.

This replaces the failed `ZETRA-CURRENCY-DISPLAY-20261020` candidate. Relative to that preserved package, only `app/(tabs)/index.tsx` and two new Dashboard display modules change. The source-map comparison and source archives bind that exact delta. The full replacement still includes the earlier Currency-only features for Sales, Finance, Stock Value and Reports; it is not merely a Dashboard patch against the currently restored pre-currency Production release.

## Dashboard correction

A single `Dashboard currency` entry is rendered outside the Mobile Web lite, Desktop and native branches. Opening it displays authorized current-store totals, or all authorized stores for Owner/admin when no store is selected. The existing canonical Finance read RPCs supply original TZS Sales, and Owner-only Expenses/Profit/Stock Value. No new ledger, posting, balance calculation or financial writer is introduced. Exact existing decimal helpers sum the response amounts; missing/unsafe data and explicit foreign-store/organization responses are rejected.

The panel shares the unchanged Currency-only selector, conversion and PDF presentation. USD/KES/UGX/EUR quick choices and the existing 153-active-code catalog are available. TZS pairs use a verified BoT mean reference snapshot, with source/effective date/retrieval evidence; other supported pairs retain the approved ECB path. No cross-provider/date blending is introduced. Four-calendar-day reference freshness, 24-hour retrieval freshness and missing-rate fail-closed behavior are unchanged. Original restores the same source amounts. Display selection does not change accounting currency, business records or settlements.

Organization/store/role/membership/date are part of the summary scope. Results from an earlier scope are hidden and discarded. Unauthorized or locked stores are excluded before requests; non-owners cannot request or receive Owner-only totals. Original bookkeeping remains legacy TZS-only; no non-TZS accounting activation is included.

## Verification

- `dashboard-tests.log`: 10 focused tests cover unconditional all-platform Dashboard entry, source isolation, canonical read-only calls, exact totals, original preservation, currencies, foreign-scope response refusal, role restrictions, duplicates, cancellations and unsafe decimal rejection.
- Final isolated Web and Android TypeScript/release guard/export passed. `ISOLATION-PROOF.json` confirms only three runtime modules differ from the previous candidate, no unrelated dependency/application changes, identical native assets and identical Web proxy rules.
- `WEB-DASHBOARD-ACCEPTANCE.json`: actual complete replacement app, privately authenticated Owner, 320/390px mobile and 1440px desktop Dashboard, selector/catalog, USD/KES/UGX/EUR/KWD, source evidence and exact Original restoration. These are actual UI observations with canonical summaries, not standalone component fixtures. This account exposes one organization; live multi-organization switching is not claimed. Foreign-organization, locked-store and stale-scope rejection are covered by controlled-port tests.
- `ANDROID-DASHBOARD-ACCEPTANCE.json`: **PASS on physical Samsung SM-S938U**, actual complete privately authenticated replacement app in Expo Go. All four canonical Dashboard totals were checked in USD/KES/UGX/EUR against exact BoT decimal quotes and ISO precision; every original amount remained present and Original restored the exact TZS values. The real Dashboard entry and scrollable currency panel were visually reviewed. No financial posting or OTA publication. This is full local Dashboard runtime acceptance, not a standalone component fixture; installed candidate OTA adoption remains a future post-publication check.
- Screenshots containing private business totals and raw private auth/device logs stay local; sanitized results and nonfinancial Dashboard entry screenshots are suitable for the checkpoint. No credentials are in the package.

## Exact release boundary and rollback

`SEALED-ARTIFACTS.json` binds exact Web and Android outputs; `.map`, `.env`, private logs, SQL and APK files are excluded. Source ZIPs preserve reproducible candidate inputs independently of the mixed working tree. Never publish the root checkout. The existing Catalog hotfix and unrelated work remain outside this candidate.

Existing targets only: Netlify site `40a9e840-5437-480e-bc63-8391d6d0ef24`, `app.zetra.tz`; EAS project `a8536709-2bea-40f4-8dd7-01563bd08c70`, Android package `com.anonymous.zetrabmsclean`, `production` channel/branch, runtime `1.0.0`. There is no new native module, APK requirement or infrastructure. No publication is authorized by this document.

**Production SQL: none. Financial activation/writes: none.** No tax/VAT/TRA, unfinished refund/custody contracts or historical rewrites. Owner approval of the old exact artifact bytes does not authorize a replacement publication.

After a future explicit replacement approval, recheck artifact/source hashes and current Production baselines, upload only the sealed artifacts, verify real-domain BoT/ECB proxies and authenticated Dashboard at mobile/desktop widths, then publish Android only after Web gates pass. Verify installed OTA identity and read-only Dashboard behavior. Stop and rollback on a mandatory UI, permission, FX, original-data or auth failure. No financial transaction may be used as a smoke test.

Web rollback remains deployment `6ad49c64c2acd6e0352f242f`, already executed and verified after the first attempt. Android rollback remains group `9ae993b5-1566-41ea-821c-3cc94dce0151`, update `01a14bd2-bbe2-7d84-b0cd-154911b0a21e`, runtime `1.0.0`. Stop on baseline drift; preserve any newer unrelated release. Restore the exact prior Web deployment / republish the prior Android group via the existing channels. No database restore is needed because this is a display-only release.

Current instruction: **prepare replacement approval package only; no Web deployment or Android OTA publication**.

**Final gate status: replacement READY for Owner review.** All Dashboard gates above have passed within their stated scope. No publication has been performed in this task.
