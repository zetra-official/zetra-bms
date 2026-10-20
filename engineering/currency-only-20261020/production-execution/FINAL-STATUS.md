# Production attempt stopped and rolled back

Owner approved exact package `ZETRA-CURRENCY-DISPLAY-20261020`, checkpoint `25fd815b`, on 20 October 2026. Exact package/source/artifact hashes, existing Production baselines and Android runtime `1.0.0` passed preflight. No package source was modified or rebuilt for this attempt.

Web deployment `6ad738f89834af8455409492` was uploaded, checked, and atomically published to `app.zetra.tz`. Real BoT/ECB proxies, exact hosted file checks and reference calculations passed before and after publication. The generic `web-production-smoke.json` result covers those network/routes/calculation checks only; **it is not the final product acceptance result**.

Authenticated product acceptance found a mandatory Dashboard failure. Finance `View in USD` loaded real BoT evidence and converted existing read-only Sales/Expenses/Stock Value/Profit while retaining originals. The mobile Web lite Dashboard had no currency control. Component acceptance and compilation did not cover this integration defect. The earlier release-ready conclusion was too broad. An initial source diagnosis incorrectly said the desktop scope setter was absent; further exact inspection found the setter at line 8608. That initial diagnosis is withdrawn. Desktop runtime acceptance is not claimed either way.

As the Owner required, Android publication was stopped and Web rolled back immediately. **This package must not be republished as-is.** No corrected source or replacement artifact was published.

## Verified final state

- Web release result: **FAILED mandatory product gate; ROLLED BACK successfully**.
- Active Web deployment: `6ad49c64c2acd6e0352f242f`; Netlify metadata and hosted index SHA-1 match the saved previous release.
- Android release result: **NOT PUBLISHED**; rollout stopped before EAS update. Existing `production` channel / `production` branch / runtime `1.0.0` remains update `01a14bd2-bbe2-7d84-b0cd-154911b0a21e`, group `9ae993b5-1566-41ea-821c-3cc94dce0151`.
- BoT/ECB feed and exact synthetic calculation smoke: **PASS**. TZS250000 → USD94.86 / KES12326.44 / UGX395070 / EUR84.50 / JPY15018 / KWD29.220. Provider dates 20 October BoT and 19 October ECB; four-day/date and 24-hour/retrieval rejection checks PASS.
- Existing TZS compatibility: **PASS for observed authenticated Finance and rollback smoke**. The same original Sales, Money In, Expenses, Stock Value and Profit totals were visible before conversion and after rollback; no financial posting was performed. This does not claim a database-wide audit or verification of unvisited screens.
- Rollback readiness: **EXECUTED AND VERIFIED** for Web; unchanged prior Android group remains available. No SQL or financial activation occurred, so no data rollback was required.
- Milestone: **NOT COMPLETE**. Production safely restored; no new Android OTA is active.

Exact next work: correct Dashboard integration in a new isolated Currency-only candidate, provide a scoped currency entry in the mobile Web lite Dashboard using the existing canonical summary reader, then run genuine authenticated Dashboard acceptance at mobile and desktop widths and verify native Dashboard behavior. Preserve existing desktop scope guards. Rebuild and hash both corrected candidates. The exact approved bytes must not be changed or silently republished; a replacement artifact package requires Owner approval before Production publication. Existing tax/financial/Catalog scope exclusions remain in force.
