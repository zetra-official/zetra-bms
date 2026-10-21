# M2 final acceptance — M2 PARTIAL

Continuation baseline: `761b1f12172ade30246a87f59618f5647ebf2779`.
Environment: local-only security implementation/acceptance, with separately authorized read-only hosted historical-file investigation. No Production/Staging writes, migrations, deployment, GitHub push, financial activation or M3 implementation occurred.

## Decision

The existing financial security draft remains verified locally. The remaining acceptance work substantially closes the previous Auth/API and Web PDF coverage gaps. M2 is **PARTIAL**, because the historical-file investigation found an additional, uncontained attachment/message privacy path. Its narrowly scoped containment needs Owner review/authorization under the requested investigation-only boundary. Do not represent this as full system-wide privacy closure or hosted security certification.

## Preserved results and new evidence

| Evidence | Result | Meaning |
|---|---|---|
| Previous PostgreSQL suites | 192 PASS, preserved | Not rerun. Security 147, indirect paths 25, concurrency 8, atomicity 12. |
| Previous compatibility suites | 24 PASS, preserved | Currency, seven languages/Arabic direction and source contracts; not a new live FX availability claim. |
| Previous Web/Android exports and TypeScript | PASS, preserved | No application source changes in this continuation. |
| New real Auth/PostgREST financial/privacy matrix | 85 PASS | Eight real signed synthetic identities; raw tables, protected projections, canonical readers, signature tampering and organization isolation. |
| New POS/stock-in/valuation HTTP matrix | 27 PASS | Owner cost read; non-Owner cost redaction and valuation denial; anonymous/unassigned/inactive/foreign identities fail closed. |
| New Auth lifecycle | 18 PASS | Six roles: password login, real refresh grant, scoped workspace discovery after refresh. |
| New public-file discovery reproduction | CONFIRMED FAILURE | Anonymous/no-membership/foreign-organization access to synthetic private message and attachment through captured baseline reader. Not counted as PASS. |
| Actual product Desktop/Mobile Web | Executed; coverage below | Real product bundle, genuine local GoTrue + PostgREST + hardened disposable PostgreSQL; no API emulator or role-label substitution. |
| Arabic/Chinese existing Proforma Web PDF | PASS within stated coverage | Actual existing template, two generated PDFs, Poppler rasterization and visual inspection. |

The 130 new successful HTTP/lifecycle assertions are separate from the preserved 192 PostgreSQL and 24 compatibility checks. The newly discovered privacy failure remains visible and is not hidden by those passing totals.

## Actual full-product acceptance

Synthetic records only. Owner/Admin/Staff/Cashier signed in through the actual login screen. Owner organization and store switching executed through the product UI. Desktop Cashier refresh and Mobile Admin refresh preserved the session and correct restrictions. Explicit logout followed by a different role did not display previous Owner financial values.

| Identity/surface | Observed result |
|---|---|
| Owner, Incoming | Goods/paid/balance available; synthetic original order amounts 102; total list balance 204. |
| Owner, Business Debts | Authorized debt total 204 and acquisition-cost stock valuation 612. |
| Owner, Business Statement | Loaded genuine summaries using hardened Owner projections; goods purchased 102, protected COGS/profit fields available; zero-sale fixture values stayed zero. |
| Admin, Desktop Dashboard | Net Profit displays Owner only. Operational zero sales/expense summaries remain usable. |
| Admin, Incoming list/detail | Purchase cost/total/paid/balance display dashes. Selling price 101 and ordered/received/remaining quantities remain available. Canonical partial/full receive controls remain visible. No new receipt was posted through UI; prior canonical receive/race/atomicity PASS is reused. |
| Admin, supplier detail | Supplier operational quantity/history available; debt/liability card absent. No supplier data was saved. |
| Admin, direct debts/statement routes | Owner only / Access Denied. No protected financial state displayed. |
| Staff, Desktop Dashboard/direct debts | Correct Staff identity; profit restricted; direct debts denied. |
| Cashier, Desktop workspace/refresh/direct debts | Correct cashier workspace and queue; session survives refresh; direct debts denied. |
| No organization membership | Referral/business setup boundary; protected deep link returns to onboarding, not another tenant's financial screen. No organization was created. |
| Other-organization Owner | M2 OTHER only; own debts/valuation zero, no M2 SYNTHETIC debts/612 valuation. Actual UI plus direct cross-org API denial verified. |
| Mobile Web 390 x 844 | Actual Admin Home currency control, supplier history, cost-blind Incoming, refresh, read-only POS stock/search and statement denial. Owner statement loads. This is responsive browser acceptance, not a physical-device PASS. |

Direct HTTP responses prove Owner-only acquisition costs, Business Debts, COGS/profit readers and cost valuation. Operational POS and stock-in readers preserve selling prices/quantities while redacting protected fields. Original product cost 51, selling price 101, stock 10, and existing synthetic valuation 612 were not rewritten by these checks. Prior supplier settlement/financial writer/funding boundaries were not activated.

Coverage is representative of the relevant existing screens and canonical data paths, not a claim that every route, export variation, financial transaction or device combination was exercised.

## Environment fidelity and failures resolved

The old sanitized snapshot lacked some current baseline reader definitions/ACLs. Captured unchanged reader definitions and unrelated SELECT grants were replayed only in the disposable clone; every table protected by the M2 draft was excluded from SELECT replay. All **71 protected function definition hashes match the sealed M2 change manifest exactly** afterward. The M2 draft itself remains unchanged.

Real GoTrue required its isolated Auth database migration permissions, search path and existing migration-history alignment. These changes affected only the disposable Auth database. Auth tokens came from genuine password/refresh grants; user JWTs were not fabricated. API authenticator has no superuser/BYPASSRLS/postgres membership.

The independent localhost-origin test initially failed local gateway CORS preflight and showed the preserved-session retry screen. Local-only gateway preflight/credential/private-network headers were corrected; Retry then loaded M2 OTHER, and subsequent Mobile Admin/Owner sign-ins, refresh and reports passed. No product source patch was used to conceal a test-environment failure.

Initial API assertions assumed qty serialized as integer text and expected a cost field in an operational-only inventory RPC. Assertions were corrected to the actual canonical response; Owner cost is verified through the protected projection, not invented in that RPC. Expired tokens in the new message reproduction were renewed before drawing unauthorized-access conclusions.

## Currency and seven-language compatibility

All approved Currency and localization source bytes are unchanged. BoT/ECB selection, effective-date-within-four-days and retrieval-within-24-hours rules, source/date presentation, exact decimal conversion, tenant matching, original amount preservation and fail-closed behavior retain their prior 24-check evidence. The local gateway intentionally reports verified FX unavailable rather than inventing a rate; no new live-provider certification is claimed here. Native non-TZS posting remains blocked.

English, Kiswahili, French, Portuguese, Arabic, Spanish and Chinese dictionaries and Arabic direction behavior remain preserved. No product/supplier name, SKU or original evidence was translated. No new currency or translation feature was added.

Existing compatibility gaps observed: non-Owner desktop CRM can show the technical OWNER_ONLY repository error; some existing English mobile Home copy includes a Kiswahili stock alert. These are documented presentation/localization gaps, not confidential data returned by the tested endpoints. M3 receiving/notification/consolidated-receipt translations were not implemented.

## PDF and device limits

`output/pdf/ar.pdf` and `zh.pdf` use the unchanged existing Proforma HTML generator with local synthetic names, Arabic/Chinese text, SKU, original TZS 101 and supplied zero tax/discount. Chrome generated real one-page A4 PDFs. Poppler-rendered page images were visually inspected: connected Arabic, RTL tables/headings and Chinese glyphs display without missing-glyph boxes or clipping in these fixtures. Original mixed-language product/customer labels were retained.

This establishes existing **Web Proforma template/font rendering**, not native Expo Print/Sharing, every receipt/report template, or long/multipage consolidated receiving. Those remaining template/device scenarios are NOT TESTED on this M2 continuation.

Samsung SM-S938U was available over USB. Local Mobile Web sign-in was opened through adb reverse. The device switched into another app during interaction, so automation stopped and authenticated physical acceptance is NOT VERIFIED. No physical Android native or iPhone test PASS is claimed. Practical plan: reserve an unlocked device exclusively for the test, use the saved synthetic roles/backend, verify Owner vs Admin/Staff/Cashier Incoming/debts/statement, refresh/restart/org switch, then Arabic/Chinese native print/share with no Production postings. For iPhone, run the same local fixture flow in Safari and inspect generated PDF glyphs/RTL. Builds do not substitute for those tests.

## Historical public files and remaining risk

Read `PUBLIC-FILE-PRIVACY.md`, `PUBLIC-DOCUMENT-HEAD.json` and `PUBLIC-FILE-DISCOVERY-REPRO.json`. Five documents are publicly downloadable; three match meeting attachments. The captured message reader locally exposes private synthetic messages/URLs anonymously and across organizations. Customer document contents and hosted customer message access were not tested, so no claim about their confidential contents or actual exploitation is made.

This risk cannot be contained by the existing financial RPC guards, a UI role check, random filenames or public-bucket SELECT RLS alone. The safe next decision is an explicit narrow containment authorization for canonical room authorization, document classification/private retrieval, and an approved historical object/reference transition. Do not disable all public media or rewrite customer records automatically.

## Preservation, handover and M3 readiness

All 32 pre-existing dirty files match their saved baseline hashes. Web/Android sealed source archives match their approved M2 hashes, and the five copied Web M2 source files match the sealed candidate. Global Currency, Catalog, Checkout, original financial records, canonical engines and blocked funding adapters were not modified. No additional application implementation was added in this continuation.

The exact original SQL draft is `../security-owner-privacy-m2-20261021/2026102101-owner-privacy.DRAFT.sql`, SHA-256 `e3423384c3b2110b9af8945e7fd80865e77bff6e8d5dc658d257152312677106`. Its local rollback/atomicity evidence remains preserved; it is not an authorized hosted migration. Do not apply the vulnerable function-preimage restoration file as a Production rollback.

Private runtime credentials, sessions, exact object names/URLs and database files remain ignored and are excluded from the public checkpoint. Public evidence/artifact hashes are in FILE-SHA256.json. The acceptance stack is stopped and saved at handover; existing unrelated servers are preserved. See SHUTDOWN.json for the verified actual stop result.

**M3: NOT AUTHORIZED / not ready for unconditional security sign-off.** Owner can review the financial hardening and verified acceptance evidence now. Resolve the newly confirmed attachment privacy containment scope and the documented device/template acceptance limits before declaring full privacy closure or approving a hosted security rollout. M3 architecture/implementation requires its own explicit approval. Work stops at this report.
