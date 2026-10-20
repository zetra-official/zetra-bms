# Global Currency Production — deployed and verified

Owner-approved replacement: ZETRA-CURRENCY-DISPLAY-DASHBOARD-FIX-20261020, checkpoint 6f343efc. Exact approved hashes and isolated scope verified before each publication; unchanged package and production channels verified afterward.

- Web SUCCESS: https://app.zetra.tz — deployment `6ad754388b1e0ec9dc9d905d`.
- Android OTA SUCCESS: production channel/branch, runtime `1.0.0`; update `01a1592b-2ee1-7ed9-ac55-fb2b9185776c`, group `6f0e3704-2774-44c8-afc5-34216997c808`.
- Actual authenticated Mobile Web (390×844) and Desktop (1440×1000) Dashboard PASS; Finance USD conversion and original restoration PASS.
- Actual installed Samsung Production app PASS: Dashboard currency visible; USD/KES/UGX/EUR all four canonical totals match exact decimal reference conversion; original TZS restored. This is installed-app OTA acceptance, separate from prior Expo Go acceptance.
- Public production OTA manifest identifies the new update; downloaded Hermes SHA-256 `011d8424fe29e30cb380c23fe6f63f2ef85e0b80ee24c6d0a6475d051e011ae8` matches sealed bytes; all46 unique asset hashes match. Native download log observed expected update and NEW_UPDATE_LOADED. Following cold start, new control and conversions passed. Launch log does not independently expose launched update ID.
- Live BoT/ECB feeds and conversion/freshness checks PASS. BoT effective20Oct2026; ECB effective19Oct2026. Four-calendar-day reference and24-hour retrieval limits enforced; unavailable rates fail closed. Reference valuation is not a bank buy/sell quote.
- Existing TZS compatibility PASS. Original transaction amounts, stock and account balances were not written. Live acceptance was read-only. Tenant/store guards unchanged and focused isolation tests retained; live session exposes one organization only.
- Rollback READY: restore Web `6ad49c64c2acd6e0352f242f`; republish Android group `9ae993b5-1566-41ea-821c-3cc94dce0151`. No rollback needed for replacement.
- No SQL migrations, financial activation, tax/VAT/TRA, unfinished financial contracts or unrelated source publication. Catalog and all unrelated working files preserved.

Evidence: web-product-ui-smoke.json, web-production-smoke.json, production-fx-smoke.json, ota-network-proof.json, native-update-identity.json, android-installed-ui-smoke.json, final-channel-verification.json. Private credentials/session captures/logs are excluded from Git; retained local private evidence is hash-referenced.
