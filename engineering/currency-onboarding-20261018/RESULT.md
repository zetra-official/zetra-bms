# Atomic Currency Onboarding — full-schema local milestone
**LOCAL VALIDATION: PASS. RELEASE STATUS: PARTIAL / NOT ACTIVATED.**

## Exact implementation
Changed `src/currency/onboarding.ts` and `app/(onboarding)/store.tsx`; added `src/currency/OnboardingCurrencyAcknowledgement.tsx`. Added this evidence/migration package only. All other 17 sources from the accepted currency foundation remain byte-identical (foundation-preservation.json); accepted 124 checks retained, not rerun.

The client keeps TZS default, prepares explicit seven-language acknowledgement, validates committed backend currency/identity/status, retains one actor/request intent for retry and fails closed on response mismatch. Successful versioned API uses its exact returned organization ID, not a business-name match. Legacy current flow remains intact. The new activation flag remains false; non-TZS completion is not advertised as live.

## Authoritative contracts verified
Actual preserved definitions: `public.create_org_with_store(text,text)` returns TABLE(organization_id,store_id,membership_id), creates canonical store, Owner membership and store assignment and enforces effective-plan organization limits. Existing `public.owner_confirm_org_accounting_currency_v1` delegates to `proforma_backend.owner_currency_command`; existing authority/audit tables are reused. `backend_core.active_subject` rejects deleted/banned users. `set_org_timezone_once` and existing organization timezone default were inspected. No parallel currency authority or financial ledger.

The wrapper serializes per actor (not only request ID), preserves same-request idempotency/conflict rejection, rechecks active Owner+organization+currency for replay, validates ISO/server precision, calls canonical creation and existing Owner confirmation atomically and initializes only its newly-created organization timezone. A later currency change is not silently performed. No FX availability needed, display preference never authorizes accounting currency.

## Schema and test evidence
- Preserved full public schema: 124 tables, 312 RLS policies, 79 user triggers. Actual canonical definitions/triggers/RLS execute in disposable PostgreSQL 17.
- 63 full-schema checks PASS: TZS/USD/KES/UGX; invalid/inactive/precision mismatch; rollback/injected authority failure; retries; same/different-request concurrency; subscription limits; staff/admin/foreign/disabled user denial; existing currency protection; unchanged financial fingerprints and original helper definitions; legacy signature and unchanged public RLS/trigger counts; read-only dependency gates.
- 15 focused client assertions PASS.
- 14 real RN-Web component renders PASS (seven languages × 390/1440 widths): checkbox toggle/accessibility, no page errors/overflow. Synthetic language context, not authenticated app or physical-device E2E.
- 2 rollback assertions PASS: new client execution removed; organization, currency and receipt counts retained. Exact function postimage guard.
- TypeScript PASS, 0 errors. Web and Android/Hermes exports PASS. No OTA, APK, hosting or remote migration.

New assertions total 94; categories are distinct and are not financial service/device acceptance. Temporary clusters stopped. The original source cluster was never started/modified.

## Prepared exact migration
`2026101802-atomic-currency-onboarding.DRAFT.sql`
SHA-256: `64ad02ea0bd8783f690ff363f1a2714e565a3a5deb381d8ba8b07c5fcbcb60a4`
Creates only private forced-RLS request metadata and one versioned authenticated RPC. Original RPC signatures/grants/financial functions unchanged. Scope includes new organization timezone initialization only; no changes to existing organizations, historical amounts or posted financial records. No cross-currency posting. The old draft is superseded for review; never execute both.
`PREFLIGHT-READONLY.sql` pins dependency definitions and trusted public-schema creation privileges. `VERIFY-READONLY.sql` inspects metadata only. `ROLLBACK.sql` is a guarded revoke-only disable; audit/request data retained. See RECOVERY.md for uncertain-COMMIT handling.

## Limits / blockers
The fixture preserves full captured public schema and local backend changes; it is not proof of today's live schema/ACL parity. Its direct legacy RPC ACL remains quarantined; legacy body/signature verified as database owner without changing its ACL. Real Supabase Auth/Storage services are not running: Auth records/JWT GUCs are explicitly synthetic adapters. Physical Android/mobile, authenticated full-application onboarding and live deployment NOT TESTED. ISO/server precision conflicts (e.g. IQD) remain deliberately rejected, not silently changed. Existing source accounting history has not been rewritten.

Earlier local fixture failures were test-only: direct legacy call encountered preserved quarantine ACL; definition comparison normalized CRLF. A rendered test caught missing Web checkbox checked-state mapping; aria-checked was added and rerun. Failed receipts retained separately. No validation/security checks were removed to pass.

## Exact next Owner boundary
Review this exact versioned migration/hash and grant separate authorization for its specified target execution ONLY after fresh read-only target/dependency/ACL gates and recovery availability are confirmed. Current package is LOCAL REVIEW, not an executable Production approval. Client activation requires verified remote postflight and separate release scope; cross-currency financial posting remains excluded. No live writes are requested or performed now.
