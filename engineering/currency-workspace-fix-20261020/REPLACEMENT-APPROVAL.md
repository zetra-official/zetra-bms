# ZETRA-CURRENCY-AUTH-WORKSPACE-RECOVERY-20261020

Replacement ready for Owner review. No publication, SQL or financial activation has occurred. This package combines the preserved Currency UI Refinement with the minimum Auth/workspace reliability patch. The earlier c2c390dc approval does not authorize this replacement.

## Verified behavior

Genuine Owner login and authenticated Home, protected refresh, new-document session resume, Mobile/Desktop Dashboard, Finance and organization re-selection passed. Final Mobile POS columns measured 175.2/175.2 px with no horizontal overflow at 390 px. Forty unit behavior checks plus four static auth guards passed. Production-configured Web/Android TypeScript, release guard and Expo exports passed. Full source review patches and exact artifact/file manifests are included.

Confirmed fixes: incomplete bundle download now has verified retry/fallback; session transport failure no longer means logout; late bootstrap/identity responses cannot overwrite a newer session; the Tabs remote identity wait no longer renders an empty view; canonical workspace errors receive retry instead of onboarding; render failures have a generic recovery boundary. See ROOT-CAUSE.md for evidence and attribution limits.

Currency UI, FX engine/catalog/policy, Checkout and Catalog sources remain byte-identical to their approved platform baselines. Original TZS display is preserved. No new financial functionality, dependency, runtime, SQL or backend schema is included.

## Exact artifacts

| Platform | ZIP | SHA-256 |
|---|---|---|
| Web | workspace-recovery-web-artifact.zip | `0012d743e4dc100edafcf65017e904b1c902e043f773f52c1b78dd8b444f68f2` |
| Android | workspace-recovery-android-artifact.zip | `718e176b41d4c15fce396e68cc4512a80de3c0c5901ca1da0defcec63b07ec53` |

Web source ZIP SHA-256: `e183cc9949551bec7f78f0fd87df3d3454c538ab2947dd353fc2e053df5d1223`.

Android source ZIP SHA-256: `103835e086c1f1184c9df878fcdd1246129fd8036be95eefe252342300de0397`.

All 272 Web files and 48 Android files match the sealed manifests and ZIP contents. Only seven Web and six Android source paths differ from the approved Currency UI source ZIPs. PACKAGE-SHA256.txt binds the approval documents and public evidence. Never build or deploy the mixed root checkout.

## Explicit acceptance limits

Physical Android/iPhone candidate verification, native app restart and full browser-process restart: **NOT TESTED**. Owner has one accessible organization: genuine organization re-selection passed, genuine switching between two organizations is **NOT TESTED**; deferred identity isolation tests and prior synthetic isolation evidence are retained.

USD/KES/UGX/EUR genuine UI calculation acceptance used hash-verified official BoT captured feeds (20 October); final Dashboard/Finance USD also passed. Current live provider requests were unavailable; fail-closed behavior passed. **Live FX availability is not claimed PASS.** The test-only feed cache/harness is excluded from release artifacts. Existing FX code and 4-day/24-hour policy are unchanged. Recheck live BoT/ECB retrieval at publication and do not claim conversion when unavailable.

No customer incident logs were collected, and not every historic customer complaint is attributed to these paths. No guarantee of future network availability is implied.

## Existing production and rollback

Web: https://app.zetra.tz · Netlify site `40a9e840-5437-480e-bc63-8391d6d0ef24`. Restored active deployment/verified rollback: `6ad76cf47622bc0a29e1244f`.

Android: existing production channel/branch, runtime `1.0.0`, project `a8536709-2bea-40f4-8dd7-01563bd08c70`, package `com.anonymous.zetrabmsclean`. Unchanged update `01a1592b-2ee1-7ed9-ac55-fb2b9185776c`; rollback group `6f0e3704-2774-44c8-afc5-34216997c808`. Runtime/dependency configuration is byte-identical; no APK/native upgrade is requested.

ROLLBACK.json verifies the retained Web and Android rollback files. Channel targets were checked read-only at 2026-10-20T19:50:43.207141+00:00.

## One requested approval

Approve this exact replacement package and its disclosed limits for publication through the existing channels: verify checksums/channel drift, publish Web, run genuine authenticated Desktop/Mobile Home/POS/Finance refresh and live FX smoke without financial postings, then publish compatible Android OTA only after Web PASS. Stop and restore the verified rollback on critical Auth/workspace/financial-integrity failure. Physical-device acceptance remains explicitly pending Owner verification. No SQL, financial activation or unrelated source changes are authorized by this request.
