# READY FOR NEW OWNER APPROVAL — quarantined 1803

## Root cause and exact correction

Original 1803 combined installation with backend API activation: line 24 granted authenticated EXECUTE and line 27 required it. The TZS function body itself does not depend on that grant; the grant was needed only for direct client use. Installation and later activation can therefore be separated without an architectural change.

Original 1803 remains unchanged with SHA-256 48ce80926f42d2985441162fd9325eca8d8836654ef80f6fb70c138ec65e95c2. Migration 1802 remains unchanged and is not rerun remotely. No application source changed in this milestone.

New draft: 2026101803-tzs-onboarding-gateway-QUARANTINED.DRAFT.sql

SHA-256: f9ceb3fd153076c9202fe58ac8fa7bd281e11be53af7df7bc37f07232b5e1358

Removed authenticated activation grant and the requirement for that grant. Replaced activation postconditions with the previously tested administrative-boundary quarantine guard. It removes all explicit non-owner/default function grants and asserts absence of effective non-owner EXECUTE and unexpected owner-role memberships before COMMIT. Function owner postgres and the verified CLI NOINHERIT / explicit SET ROLE administrative contract are preserved. Client/authenticator owner/CLI membership paths cause atomic abort. No managed role or membership is modified by the migration. No new trusted-backend role or callable internal wrapper is introduced.

Function body/signature remain unchanged, SECURITY DEFINER with fixed search_path=pg_catalog and qualified core call. The function still rejects non-TZS server-side and delegates only to existing canonical 1802 creation/Owner-confirmation/idempotency. No authority table or ledger is duplicated. Existing legacy onboarding functions and their ACLs are unaffected. Future gateway activation requires a separately reviewed exact ACL change and explicit Owner approval; installation under this package does not activate anything.

## Final effective RPC matrix

| Identity | New TZS gateway | Core 1802 |
|---|---|---|
| PUBLIC | No EXECUTE grant | Remains quarantined |
| anon | Denied | Denied |
| authenticated / app Owner/Admin/Staff | Denied | Denied |
| service_role | Denied | Denied |
| authenticator | Denied | Denied |
| Unrelated default-grant/inherited roles | Denied, otherwise migration aborts | Unchanged |
| cli_login_postgres directly | Denied | Denied |
| CLI explicitly SET ROLE postgres | Existing administrative owner authority | Existing administrative owner authority |
| postgres / platform superusers | Existing administration retained | Existing administration retained |

Frontend flag false is retained but is not the access boundary. EXECUTE is checked before SECURITY DEFINER body execution. Tests found no existing static wrapper referencing the new gateway; role/default-grant and client SET ROLE bypasses are tested directly. No new indirect path is introduced. This is not a claim of a fresh full-system audit of every unrelated legacy dynamic-SQL endpoint; any live dependency/privilege drift must fail future execution gates.

## Focused evidence

40 checks PASS on isolated disposable PostgreSQL with the verified 124-table public schema and synthetic Auth/JWT adapters. Tests cover:

- Exact-role direct gateway invocation denied for anon, authenticated, service_role, authenticator, CLI login and a synthetic inherited role.
- PUBLIC/non-owner ACL absence, hostile default grant cleanup, denied client SET ROLE owner/CLI, administrative CLI SET ROLE transactional DDL still working.
- Owner-context body tests (without any temporary client grant): TZS default confirmation/persistence, Owner binding, USD/KES/UGX rejection without new organization, acknowledgement, invalid/banned subject, cross-org access/authority denial, duplicate/replay/conflict and confirmation-failure rollback.
- Unchanged original function definitions/ACLs, legacy onboarding signature works, financial fingerprints unchanged, core remains quarantined.
- Guarded disable twice without losing records, injected install failure leaves no gateway, and a synthetic client administrative membership causes install abort. Feature flag remains false.

No historical full 94/24/37 or previous client suites repeated. No new application build needed because only SQL/evidence/test artifacts changed. Local cluster stopped. Actual hosted HTTP/PostgREST invocation, genuine Auth service and physical devices were NOT TESTED; no claim of client activation readiness.

## Atomicity and rollback

Single BEGIN/COMMIT, lock_timeout 3s and statement_timeout 30s. All revokes, owner/default/inheritance checks and core-quarantine preconditions complete before COMMIT. CREATE conflict aborts duplicate install. There are no independently committed steps.

ROLLBACK.sql checks exact gateway postimage then revokes client access; it is already disabled for this candidate, remains idempotent and preserves all core/currency/request/business records. Tests executed it twice. Pre-COMMIT failures roll back all gateway DDL/ACL changes. On uncertain COMMIT inspect state read-only; never retry automatically. Do not delete business records or restore stale backups as routine rollback. No post-COMMIT reverse operation is authorized now.

## Next approval and limits

No unresolved local security blocker. Request ONE new Owner approval for installation of this exact quarantined filename/SHA on dcmhqdckzhbuakvcyjit, with fresh read-only identity, current 1802 postimage/quarantine, role hierarchy/default privileges, object absence, backup/control checks, and independent read-only postflight. Previous 1803 authorization does not apply.

Client/backend API activation, deployment, native non-TZS financial posting and historical changes remain separately prohibited. Original accepted backup evidence is retained; physical restore NOT TESTED and availability must be refreshed before future execution. No Production connection, SQL writes, remote migration, Staging work, paid infrastructure, application edits or deployment occurred in this correction milestone.
