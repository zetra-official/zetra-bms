# Customer Checkout and Safari Web bugfix

Owner authorized scoped Web publication20Oct2026, with physical iPhone Safari acceptance to follow on Production. No local iPhone testing is requested further.

Root causes/fixes:
- Precision Retail price adjustment was disabled by a STANDARD-only eligibility condition. The existing canonical signed adjustment card now permits STANDARD and PRECISION_RETAIL with unchanged role, store, conversion/handoff/reservation guards. The same circular44px control always displays +/−. Existing Increase/Decrease arithmetic is retained.
- Canonical confirmation could wait indefinitely for stock/access/network responses. Read and sale requests now have a30-second deadline. A dispatched sale remains blocked and must be reconciled in history; no automatic retry/cancellation claim. Existing durable Web attempt recovery and native submission guard are preserved. Existing browser confirm popup after successful sale is replaced by direct navigation to the known canonical receipt ID. Storage initialization failure/loading is visible near the Web action.
- iOS Web used the layout viewport while the keyboard/toolbar changed the visible area; small input fonts could trigger focus zoom. An iOS-only viewport adapter tracks visualViewport height, including existing dialogs, and ignores pinch-zoom scaling. Search/dialog input fonts are16px; user zoom remains enabled. Shared flex roots can shrink with minWidth0. Android runtime behavior of this adapter is a no-op.

Evidence:14 focused source/callback/viewport tests PASS;10 disposable canonical PostgreSQL groups PASS across STANDARD, PRECISION_RETAIL and CAPITAL_RECOVERY (amount/payment integrity, stock once, idempotency, unchanged catalog/cost). Genuine local exported-app Precision POS→Checkout UI: circular +/− opened,10→12→8, valid sale created in canonical disposable database and receipt route opened. Synthetic Auth adapter, not genuine Supabase Auth acceptance. Home widths320/375/390/430 measured without document overflow and with navigation within viewport. Production read-only smoke follows publication. No Production financial posting test.

Limits: physical iPhone/WebKit runtime acceptance is pending Owner review of Production; no simulated iPhone PASS claimed. Samsung disconnected before new candidate runtime acceptance; no new Android physical PASS claimed. Android build/callback checks are separate from OTA publication. Android OTA is withheld in this Web release.

Scope: six Web source files only (SOURCE-DELTA.json), derived from exact deployed Currency sources. Global Currency modules, Catalog, routing/FX proxies and all canonical backend SQL unchanged. No tax, new financial writers, financial activation or unrelated source included. Rollback restores existing Currency Web deployment6ad754388b1e0ec9dc9d905d; no database rollback needed.

Build preflight caught and withheld a Metro-cached local endpoint artifact before any publication. It is retained as rejected-local-env-artifact-web. Clean-cache rebuild and an explicit same-production-backend-origin assertion are mandatory before sealing/publication.
