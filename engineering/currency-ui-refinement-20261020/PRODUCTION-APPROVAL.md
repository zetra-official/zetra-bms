# ZETRA-CURRENCY-UI-REFINEMENT-20261020

Currency-only replacement candidate. Production publication is NOT authorized yet. Use PRODUCTION-APPROVAL.json and its exact SHA-256 bindings; never build/publish the mixed root working tree.

## Problem and result

The old device-global display preference was not scoped to an authenticated user/organization. Conversion was principally inside valuation dialogs; Dashboard, POS, Products and Finance still used independent original-TZS formatters. Currency controls also occupied separate large rows.

This candidate connects eligible monetary display readers to one user/organization preference and the existing verified FX engine. Mobile Home places the compact selector between title and existing logo/profile control. Desktop places it beside the greeting. POS puts compact Proforma and Currency controls in equal columns on one row. The picker no longer repeats `USD USD`.

Changing display currency never changes accounting currency, cart numeric values, payment inputs, RPC payloads, records, stock or balances. Checkout remains canonical TZS. Existing unscoped preference storage is preserved but not assigned to an unverified user/organization; users may need to select their display currency once after this upgrade. Subsequent navigation, refresh and restart use the scoped preference.

## Exact source scope

SOURCE-PACKAGE.json binds both complete isolated source archives and every changed source hash. source-web.patch and source-android.patch provide reviewable byte-preserving diffs against the deployed platform baselines.

- Shared preference/conversion presentation: `src/currency/displayPreference.ts`, `PreferredDisplay.tsx`, `DashboardCurrency.tsx`, `CurrentRateValuation.tsx`, `LegacyTzsValuation.tsx`, `src/i18n/LanguageProvider.tsx`, provider ordering in `app/_layout.tsx`, and `CurrencyPickerAll.tsx`.
- Home/POS placement: `app/(tabs)/index.tsx`, `app/(tabs)/sales/index.tsx`, `src/proforma/ProformaOrdersAction.tsx`.
- Eligible readers: Products; Finance Live/History/Business Position/Business Debts; Stock History; Business Statement; existing Home financial cards, charts and legends. Statement HTML includes FX provenance. Compact chart labels use converted numeric values, with currency/source in the surrounding presentation; chart width fits its container.
- Dashboard, Finance, Stock and Statement readers check their loaded organization/store/period scope before presenting converted totals. Preference reads/writes use generation guards and ordered persistence.

The Web baseline is the deployed Checkout/Safari bugfix source (deployment `6ad76cf47622bc0a29e1244f`). The Android baseline is the deployed Currency Dashboard source (update `01a1592b-2ee1-7ed9-ac55-fb2b9185776c`). The unpublished Android Checkout/Safari candidate is excluded.

Checkout, FX engine/current-rate policy, BoT/ECB clients, runtime dependencies and Catalog remain unchanged from their respective baseline. Protected Web Input/Screen Safari fixes remain byte-identical. No SQL, tax/VAT/TRA, native financial posting activation, new financial writers or unrelated Catalog work is included.

## Verification

- 19 focused preference/precision/FX contracts PASS, including delayed reads, ordered writes, restart restoration, logout, separate users/organizations, missing/stale/future rates and exact original decimal retention.
- 5 additional actual display-hook boundary contracts PASS with React hooks stubbed; these are unit tests, not physical-device tests.
- Canonical Supabase calls and navigation payloads in 41 changed TypeScript files are AST-identical to the deployed baselines. Protected Checkout and FX sources are byte-identical.
- Actual local product Web UI: Regional Settings USD selection -> Dashboard -> refresh; USD/KES/UGX/EUR selection; Products and Finance propagation; Business Statement conversion; original-currency Checkout inputs; two synthetic organizations with independent preferences/data.
- Official BoT snapshot, effective 2026-10-20: TZS250000 -> USD94.78, KES12321.40, UGX396637, EUR84.35. Actual UI matches exact decimal calculation; original TZS250000 remains visible in valuation details. See ACTUAL-FX-UI-RESULTS.json.
- Supported catalog:153 currencies observed. AFN without an available quote explicitly shows conversion unavailable and original TZS; no fabricated rate. Proforma pending count2 is read from two synthetic scoped fixtures.
- Responsive Web: mobile320/390 and Desktop1280/1440, equal POS columns and no document horizontal overflow. Screenshots and measured geometry are saved. The browser is Chromium with viewport overrides; this is not physical iPhone/Android-browser acceptance.
- Web and Android TypeScript/release-guard/production-configured exports must both PASS in BUILD-web.json / BUILD-android.json before sealing.

Auth for this milestone's UI fixtures is a synthetic local adapter, not genuine Supabase Auth. It has no remote database connection and rejects financial writers. No sale, payment, inventory or customer financial posting was executed. The Checkout route retained numeric unit_price/line_total250000 and Paid(TZS)250000 while the POS preview showed USD94.78.

## Physical-device status and Owner decision

Owner explicitly directed completion without Samsung connection on20Oct2026. Final candidate physical Android APK/Expo acceptance: **NOT TESTED**. Physical Android Mobile Browser: **NOT TESTED**. New candidate physical iPhone Safari/WebKit: **NOT TESTED**. Earlier partial native observations and earlier deployed-release acceptance are not represented as final candidate PASS. Existing Android builds and verified prior production evidence are retained as baseline evidence only.

No further Samsung action is required to prepare this approval package. Installed-device behavior after an approved OTA must not be claimed verified from a build/manifest alone.

## Screenshots

- desktop-dashboard-usd.png and desktop-dashboard-1440.png: actual local Desktop Web Dashboard.
- mobile-home-320.png / mobile-home-390.png: actual product Home at simulated mobile Chromium widths, not Android screenshots.
- mobile-pos-usd.png / mobile-pos-320.png: actual product Proforma/Currency row and converted cart preview.
- mobile-unavailable-afn.png: explicit unavailable conversion with original TZS.

## Approval requested

Approve only the exact source/artifact hashes in PRODUCTION-APPROVAL.json for existing Web Production `https://app.zetra.tz` and compatible Android OTA channel/branch `production`, runtime `1.0.0`, project `a8536709-2bea-40f4-8dd7-01563bd08c70`.

After approval: recheck hashes and current targets, publish sealed Web artifact, perform read-only Mobile/Desktop Dashboard/POS/Finance/FX smoke, then publish the compatible Android artifact and verify channel/update manifest and asset hashes. If a physical device is unavailable, record installed-device smoke as NOT TESTED. Do not claim delivered/installed UI PASS without execution.

No SQL migration, accounting-currency confirmation, financial activation, customer posting or unrelated source publication is authorized by this package.

## Rollback

Web: restore existing ready deployment `6ad76cf47622bc0a29e1244f`. Android: republish verified group `6f0e3704-2774-44c8-afc5-34216997c808` / update `01a1592b-2ee1-7ed9-ac55-fb2b9185776c` to production runtime1.0.0. ROLLBACK.json binds locally verified artifact manifests and CURRENT-TARGETS.json verifies existing channel metadata with read-only calls. No database rollback is required. Stop rollout and restore these artifacts if a critical failure occurs.
