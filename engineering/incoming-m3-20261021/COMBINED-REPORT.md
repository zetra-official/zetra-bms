# COMBINED PARTIAL — local review candidate only

Continued from `62c3a3ae`. No Production/Staging connection or write, hosted migration, deployment, GitHub push, financial activation or unrelated source modification was performed. Existing M2 and Incoming work is preserved.

## A — Incoming Stock: PARTIAL

Preserved implementation: atomic bulk Save Incoming Order without inventory recognition; canonical non-credit registered-product receiving; encrypted/scoped automatic drafts with frozen idempotent retry; one logical notification and a permission-aware receipt containing all received lines.

Preserved evidence: **104 distinct PostgreSQL PASS** and **30 unique draft/storage/localization PASS**. Incoming core and routes (20 files across both platforms) have matching pre-continuation SHA-256 values; no reason to repeat those tests. These are historical local results, not current hosted or full-app acceptance.

Remaining limits: genuine full-app UI acceptance, visual Arabic/Chinese multipage PDF and native Print/Share, physical devices and current Android export are unverified. Legacy single-order entry does not gain autosave; consolidated receipt/notification applies to the new non-credit receiving path, not every legacy partial purchase receipt. Cross-tab draft conflict handling is not certified. Supplier payment/debt and funding adapters remain separately gated. Native non-TZS posting remains disabled.

## B — Staff Operational Dashboard: PARTIAL

### Source-confirmed findings

- Existing Dashboard reads `get_sales` and channel summaries across the selected store, without personal seller/collector attribution. Those contracts cannot prove a Staff member's own activity.
- Existing Money In subtracts channel expenses from collections. This is a remaining-funds measure, not the requested verified personal collections metric. Legacy credit collections use another ledger and must not be blindly added to sale-payment totals.
- Desktop loading checks several RPC errors before setting `desktopValuationScope`; a failed data request leaves the display formatter unready. Mobile similarly gates formatting on the sales request and sometimes replaces errors with zero/hidden errors. Data readiness therefore appears as “Conversion unavailable”.
- Existing same-currency formatting already supports TZS without FX. No FX engine rewrite was needed. The precise triggering failed request for the customer's session remains unverified: no new genuine runtime claim is made.

### Candidate correction

- Staff Home uses a separate operational projection on Desktop/Mobile/Tablet-width layouts and shared Android source. Owner/Admin/Cashier views remain on their existing branches. Existing Capital Recovery Staff behavior is retained; it is not newly certified.
- New `m3_staff_operational_v1` **unexecuted SQL draft** derives actor from `auth.uid()`, requires one active Staff membership and assigned active store, and returns explicit fields only. No target-user parameter, table grant expansion or writer modification.
- Personal sales use canonical seller membership, not every store sale or cashier-shift proximity. Money In reads attributed eligible sale-payment rows once, by collection date, without subtracting expenses or inferring cash from credit/header totals. Expenses require matching personal creator attribution; this grants no expense-management ability.
- Missing/conflicting attribution is null/unavailable, distinct from verified zero. Avg/Order uses exact numeric sales/count with display rounding. The UI keeps original decimal strings, rejects actor/org/store response mismatches, clears stale scope state and bounds request waits.
- TZS formatting works without rates. Cross-currency display reuses unchanged BoT/ECB engine/freshness rules and retains original TZS on unavailable conversion. No originals are rewritten.
- New labels and states cover English, Kiswahili, French, Portuguese, Arabic, Spanish and Chinese; Arabic has RTL layout. Customer-entered names/identities are not translated.

### Evidence and limits

**26 unique source-level checks PASS:** response allowlist and actor/org/store/currency boundaries; missing attribution versus zero; personal Dashboard RPC routing; denied/foreign-scope failure; existing Admin operational route; seven-language formatting/copy; archived authoritative BoT hash and USD/KES/UGX/EUR display conversion; 4-day effective-date and 24-hour retrieval rejection. Archived-feed tests use a fixed historical clock and do not claim today's provider availability.

Current Web and Android TypeScript PASS. Full-app Web export bundled routes but failed to persist output at `build-web-local/club/inbox` with EPERM. It is **not a successful final artifact**. Android export retains the earlier Hermes temporary-file permission failure; no retry was attempted. TypeScript success is not runtime or export acceptance.

**Database authorization/metric calculations and direct API/RPC tests are NOT EXECUTED for the new Staff contract.** Local read-only PostgreSQL inspection was refused with socket error 10013. No alternate connection, privilege escalation or safety bypass was used for that operation. The new draft has not been applied or parsed by PostgreSQL. Source mocks do not prove server isolation.

Money In draft coverage is intentionally limited to attributed `sale_payments` gross collections. Legacy credit-ledger-v2, refund/reversal coverage and actual mobile/bank method aliases require verification before complete financial acceptance. No net refund balance is asserted. The executable/fixture acceptance requirements are listed in `STAFF-DATABASE-ACCEPTANCE-PLAN.md`.

## C — Combined readiness

**Not release ready.** The two workstreams are preserved as one local review delta over the sealed M2 source archives. Root application source was not integrated or deployed. All **32 pre-existing modified files** match the M2 preservation baseline. Original currency engine, FX provider/freshness logic and localization engine files match their sealed M2 archives byte-for-byte. New changes are confined to isolated Incoming/Staff candidate source, two local SQL drafts and evidence/packaging files.

`COMBINED-LOCAL-MANIFEST.json` records all 34 changed/new candidate source files, the two SQL draft hashes and the review archive hash. `COMBINED-LOCAL-REVIEW-SOURCE.zip` contains review source, **not a deployable artifact**. Staff preimages under `rollback-staff/` preserve the M2 Home and Dashboard reader bytes; restoring those candidate-only files and removing the new candidate Staff module reverses this companion correction. The new Staff SQL was not applied, so it has no database rollback operation. Existing Production rollback/OTA artifacts were not modified.

### Required next action

Provide a normally permitted local acceptance environment capable of local PostgreSQL connections, Web output writes, Android compiler output and approved browser/PDF rendering. Then apply/test the new read draft only in the disposable backend, execute the role/attribution plan and genuine UI/PDF checks, and seal a successful combined build. Do not retry denied operations or weaken restrictions to obtain that result.

No feature-scope or Production decision is requested now. Separate Owner approval remains required before any hosted migration, deployment or push. Work stops after this combined report, as directed.
