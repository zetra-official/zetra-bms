# Customer bugfix Web release â€” published

Web SUCCESS: https://app.zetra.tz â€” deployment `6ad76cf47622bc0a29e1244f`.

Exact six-file Web scope is recorded in SOURCE-DELTA.json. Sealed source ZIP and272-file artifact manifest match publication. Package SHA-256: `5ab6db53d22b516ece6f3f37d0bfadf788e54ea669590638d01262e13b850671`.

- Precision Retail: removed STANDARD-only exclusion while preserving existing roles/store/conversion guards. Existing circular control now always shows +/âˆ’ and has44px touch target. Canonical signed Increase/Decrease retained. Genuine local actual product UI:10â†’12â†’8, then canonical disposable sale and receipt route.
- Confirm Sale: bounded stock/access and sale-response waits; no automatic financial retry. Existing dispatch/recovery guards preserved. Confirmed Web success opens the canonical receipt directly rather than relying on a suppressible browser confirmation dialog. Local attempt restore failure/loading is visible near the action.
- Safari: iOS-only visual viewport/keyboard and dialog sizing;16px input text; pinch zoom preserved; shared flex root can shrink. Physical iPhone Safari Production acceptance PASS, confirmed by Owner20Oct2026: inspected and no issues reported. This is Owner-reported device acceptance; model/iOS were not supplied and Codex did not execute the physical test.
- Tests PASS:14 focused callback/price/viewport cases and10 canonical disposable PostgreSQL groups across STANDARD/PRECISION_RETAIL/CAPITAL_RECOVERY. Exact payment/line totals, stock once, idempotency and catalog/cost preservation verified. Synthetic Auth adapter is explicitly distinct from genuine Supabase Auth.
- Production smoke PASS: exact hosted HTML/JS, routes, official BoT/ECB proxy feeds and exact conversion/freshness; authenticated Mobile Home/POS search, Desktop Products114/search2 and Dashboard; original Currency restored. No financial posting or cart addition on Production.
- Android OTA NOT PUBLISHED. Its separate candidate was not accepted on the physical Samsung because USB disconnected. Existing Production OTA remains unchanged. No new physical Android acceptance claim; responsive Chromium checks are labeled separately.
- Rollback READY: restore existing Currency Web deployment `6ad754388b1e0ec9dc9d905d`. No database changes or rollback required. No SQL, tax/VAT/TRA, new financial activation or unrelated source publication.

Build integrity caught a stale local-endpoint cache artifact before upload. It was withheld/preserved; clean-cache rebuild passed the same-production-backend-origin assertion before sealing and publication. Only the verified clean artifact was published.

Owner confirmed physical iPhone Safari acceptance20Oct2026. Web/Safari acceptance is closed. Android OTA remains a separate unpublished gate. See IPHONE-OWNER-ACCEPTANCE.json.
