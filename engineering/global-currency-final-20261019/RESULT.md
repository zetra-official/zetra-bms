# PARTIAL — SPECIFIC UNRESOLVED BLOCKERS

## Executed and independently verified

Production `dcmhqdckzhbuakvcyjit`: exact approved `2026101901-tzs-rollout-controls.DRAFT.sql`, SHA-256 `4cd1c6e61626cd00b0e98b4c01ebfc26e66fbbb1d3a29ddf0cbf820ddee29b15`, executed once, 19 October 2026 06:17:20–06:17:28 UTC. CLI succeeded; independent connections observed the committed gateway postimage and all three private controls. No migration retry. Migrations 1802/1803 were not rerun.

Server switch **false**, allowlist **0**, audit enrollments **0**. Gateway EXECUTE: PUBLIC/anon/authenticated/service_role/authenticator denied; raw cli_login_postgres denied; postgres owner allowed, existing administrative SET ROLE preserved. Private tables force RLS; tables/identity sequence have zero nonowner grants and zero effective client privileges. Core 1802, existing catalog contracts and managed roles match preflight. No new wrapper path observed. Financial posting/client activation remain off. No existing business records were selected for integrity exports or modified by this controls installation; this is exact SQL/object verification, not an independent full customer-data audit.

An initial sandboxed independent verification connection failed; the permitted read-only check then succeeded outside that restriction. This was not another SQL execution. See controls/EXECUTION-RESULT.json and the one-attempt receipt.

Backup API and authenticated Dashboard agree: eight completed physical backups, latest ID **2007453045**, **2026-10-19 05:58:22 UTC**, correct Production/Pro organization. Restore controls observed; **restore rehearsal NOT TESTED**. Current visible window 12–19 October; Pro seven-day policy evidence retained from accepted recovery gate. Storage object contents excluded. No restore executed.

## Reused source integration and new local work

Existing main-project onboarding controller, persistent request identity, authoritative response validation, TZS default/acknowledgement, organization selection and seven-language feedback are preserved at checkpoint `7736018`. `ATOMIC_CURRENCY_ONBOARDING_ACTIVE=false`. Central exact currency/FX engine, catalog, Finance converter and report selectors reused; no second ledger, authority or engine created. No application source file changed in this continuation, so accepted TypeScript 0 errors, Web and Android/Hermes builds remain the applicable evidence; no unrelated repeat builds.

New reusable certification runner executes actual production helpers for **153 active currencies × seven languages**, nine representative ISO scales, signed rounding, immutable originals, offline-envelope revision/tenant checks, display/posting separation and the existing captured official ECB feed. **1,423 checks PASS**, helper/catalog scope only. No live rate fetched or fabricated. Formatting tests run under Node Intl, not native Android Intl or rendered RTL layout. Offline envelope tests do not activate the legacy queue adapter.

Nine representatives: TZS/USD/KES/EUR/AED/CNY **2 decimals**, UGX/JPY **0**, KWD **3**. All have metadata/helper coverage; none gain new native posting certification from this result. Official saved ECB evidence supports the available display pairs only; TZS/KES/UGX/AED/KWD missing pairs fail closed in this fixture. Historical capture is not a claim of a fresh market rate.

Native probes expose a concrete remaining constraint: existing `src/utils/discount.ts` rounds percentage discounts to whole units. For 10% of 12.34 it returns 1, while ISO-scale preview expectations are 1.23 (2 decimals) / 1.234 (KWD). Seven representative currencies therefore remain **NOT CERTIFIED for native fractional discount posting**. This legacy helper was not altered: matching canonical server rounding, quote/version and reconciliation rules must be agreed/tested before changing live financial semantics. Existing TZS behavior preserved.

## Financial-module coverage

| Surface | Verified/reused implementation | Remaining native/acceptance boundary |
|---|---|---|
| Onboarding / Regional Settings | Owner-confirmed server authority; TZS controller; installed disabled rollout controls | Genuine Auth canary, restart/multi-device acceptance; no broad activation |
| Products / POS / checkout | Existing catalog, adjusted-price and canonical sale contracts preserved | Immutable denomination and currency-aware discount/tax reconciliation not certified across native currencies |
| Sales / receipts / refunds | Existing canonical records and receipts untouched | Original transaction currency/rate snapshots and refund semantics not verified end-to-end |
| Inventory / valuation / COGS / transfers | Existing stock engine untouched | Native/historical denomination and cost provenance incomplete |
| Purchase funding / supplier payments / Field Procurement | Existing held contracts and wallets retained | Financial authority blockers retained; Field Procurement TZS literals remain; no activation |
| Expenses / credit / repayments | Existing posting preserved | Original/accounting/tender provenance and currency reconciliation incomplete |
| Cash / bank / mobile money / cashier | Existing locks, balances and closing unchanged | Native tender balance/settlement and closing contracts not certified |
| Finance / statements / dashboards / reports | Separate informational converter/report selectors; legacy-unbound values not converted | Unknown historical denomination cannot be inferred from current Owner confirmation; no official booked FX statements |
| PDF / printing / exports | Existing outputs preserved | New currency-context end-to-end acceptance **NOT TESTED** |
| Offline / sync | Additive immutable envelope helper tested for nine currencies | Legacy SaleQueueItem not wired to a verified atomic server currency adapter |
| Subscription billing | Separate platform billing unchanged | Not a business accounting-currency contract |

This matrix reuses `engineering/currency-scoped-activation-20261018/NATIVE-READINESS.md` and accepted implementation inventory; no broad module audit was repeated. Missing immutable financial context cannot be supplied by display preferences or by relabelling historical rows. No unspecified financial migration was executed or drafted from guessed business rules.

## Acceptance and exact external blocker

Read-only Auth lookup selected only explicit administrator-controlled dedicated-test markers, no emails or customer identities. **0 marked candidates**. This does not prove that an unmarked account is not a test account; none can be treated as verified/approved. No account selected, created, modified or used. No canary SQL executed.

**Updated Owner-proposed identity inspection:** exact account found, UUID `bb2d6dee-773d-4fa7-8fda-1eb85bbad2cd`, confirmed email and active Auth state. It already has six memberships and member organizations with financial/stock history. Training-only purpose is **not verified**. See CANARY-ACTOR-READINESS.md and nonexecutable pending configuration. Identity verification is not canary eligibility or release acceptance. No enrollment performed. Current actor/TTL guard is not a lifetime one-organization quota across different request IDs; acceptance must not claim otherwise.

**One Owner action:** confirm a dedicated synthetic identity and exact testing scope, preferably a clean account. If retaining this proposed identity, explicitly attest its suitability despite existing financial history; existing records remain protected. Short procedure: identify/create a dedicated noncustomer test account through normal Auth administration, verify/sign in privately, provide its Auth UUID and approve one TZS test organization/store for one hour. Never send password/token. Account creation/email delivery itself needs explicit scope if delegated. Existing canary SQL unchanged; no activation or new routine controls approval requested here.

Genuine Auth canary and persistent organization acceptance **NOT TESTED** pending this identity. Prior browser route/controller checks used synthetic Auth/transport adapters, not actual authenticated E2E. Physical Desktop/Mobile/Android acceptance and new PDF workflow acceptance **NOT TESTED** in this continuation. Android/Hermes build evidence is compatibility evidence only. No client Web/OTA publication before these essential gates. Non-TZS financial contract certification remains a separate live-activation approval boundary, even after TZS canary passes.

## Evidence, preservation and release state

Accepted 94 + 24 + 37 + 40 PostgreSQL checkpoint tests and latest 37 rollout PostgreSQL + 2 activation-postcondition + 25 client checks retained, not rerun. New 1,423 helper checks are separate and must not be counted as genuine Auth or financial posting acceptance.

Only this new engineering directory added. Existing application changes, original SQLs, 251 frozen files and previous artifacts not edited by this continuation. The accepted TZS package manifest is rechecked locally. SHA256-MANIFEST.json lists this handover; SOURCE-EVIDENCE.json pins reused helpers and prior package manifest. Raw catalog/private diagnostics are Git-ignored. No credentials or customer data added to Git.

**Web: NOT DEPLOYED. Android: NOT DEPLOYED. Canary: NOT ACTIVATED.** Rollback/recovery procedure: ROLLBACK.md. No current client publication or financial authorization requested. Resume from the committed disabled state; never rerun controls installation.
