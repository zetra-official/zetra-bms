# Staging currency prerequisites — final readiness
**BLOCKED: recovery readiness. SQL package locally verified and ready for Owner review, not execution.**

Target: jvhczzaotfopizhubssg only. No Production access. No remote writes/migrations/deployment or financial activation.

## Missing objects and authoritative provenance
Remote postgres catalog scans confirm backend_core/proforma_backend and their currency objects are absent across schemas; this is not search_path/ACL filtering. Platform auth.uid(), auth.users id/deleted_at/banned_until and pg_catalog.sha256(bytea) exist.

Extracted exactly four existing currency tables and six function bodies from the approved 1702 source (SHA256 11574357145b075fd4965194a501d08b516ea5a0007e328e4ffe170799f1b2eb, matched to preserved approval manifest): currency_catalog, accounting_currency, currency_audit, currency_requests; active_subject, actor, owner_currency_command, accounting_currency reader and two public APIs. actor declaration changes CREATE OR REPLACE to CREATE only because schema absence is confirmed; body unchanged. Exact legacy catalog seed retained; 1802 refuses unsupported/ISO precision conflicts rather than changing history.

Private schemas/tables/functions/sequences deny client access; four private tables force RLS. Authenticated reader only. Direct Owner mutation API is intentionally NOT granted to clients at prerequisite stage; the authorized new onboarding RPC nests the existing authority as SECURITY DEFINER. Existing public function ACLs, tenant/business rules and canonical ledger untouched. No duplicate currency authority or financial engine.

## Verification
24 new focused PostgreSQL assertions PASS: 20 prerequisite/order/security/rollback + 4 phase-aware disable checks. Captured public schema 124 tables /312 policies /79 triggers and original ACLs match the targeted Staging conditions. Failed prereq transaction leaves no schemas; unchanged 1802 dependencies resolve; 1802 failure rolls back its phase; synthetic onboarding saves currency and replays once; foreign org reader denied; no financial records; safe rollback with/without 1802 retains confirmations and is idempotent. All local clusters stopped.
Prior 94 tests and TypeScript/Web/Android builds reused. No application source changes, no need for new builds. Real Auth service/device E2E NOT TESTED; Auth adapters explicitly synthetic.

## Files/checksums
- 2026101802P-currency-prerequisites.DRAFT.sql: 6f16feb5eb7f45719606fa4e65f4edb3e5c859ee8ae0813710afadd8804bea05
- Existing 2026101802-atomic-currency-onboarding.DRAFT.sql unchanged: 64ad02ea0bd8783f690ff363f1a2714e565a3a5deb381d8ba8b07c5fcbcb60a4
- ROLLBACK.sql: 0605d4f14391e39058382b7b2fa60c4a78d30446672df7256def9e603a6cea57
All artifacts in SHA256-MANIFEST.json. Sources, read-only evidence, tests, order, history and recovery plan included.

## Recovery and next authorization
Dashboard confirms Free Plan lacks included scheduled backups; PITR is not enabled and is a Pro add-on. No accessible backup reference/retention or tested restore is verified. See DASHBOARD-RECOVERY-EVIDENCE.json and RECOVERY-READINESS.md. No invented migration history created; external receipt workflow retained.

ONE next Owner action: authorize encrypted Staging-only logical backup/export and disposable local restore rehearsal to close recovery gate (no Production, remote restore or SQL writes). Alternatively Owner can provision managed backup coverage and provide a usable reference; no upgrade is performed by Codex. Until recovery gate passes, prerequisite/1802 execution approval remains deferred. No automatic retry, deployment, historical conversion or cross-currency posting.
