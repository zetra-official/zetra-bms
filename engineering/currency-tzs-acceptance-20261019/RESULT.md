# PARTIAL — ACCEPTANCE INCOMPLETE

Local TZS integration and controlled activation package prepared. This is not permission to execute any SQL or deploy, and not a customer release-ready claim. Completed Production 1802/1803 were not rerun or modified remotely.

## Completed source integration

New src/currency/onboardingClient.ts centralizes the scoped submission: valid unexpired client session, persisted actor-bound intent, same-process coalescing of duplicate submissions, exact existing TZS gateway name, no automatic retry/fallback, and authoritative response validation. Different concurrent input is rejected for review. Unknown/network errors retain the request ID. Restart/retry uses persistent storage; backend per-actor locking/request receipts remain the authority. Cross-device different request IDs are separate intents, not a promised semantic business-name deduplication mechanism.

app/(onboarding)/store.tsx uses that controller only in the future atomic branch, shows pending state immediately, cleans up lock/loading through one finally even on session errors, surfaces failure rather than silently returning, and selects the exact returned organization through existing OrgContext before refresh. Existing legacy RPC path remains unchanged. Existing store selection/tenant enforcement still belongs to OrgContext and canonical RPCs. src/currency/masterMessages.ts adds seven-language expired-session, rollout-denial and unresolved-request feedback. TZS default/selection and acknowledgement remain present; native non-TZS remains blocked. ATOMIC_CURRENCY_ONBOARDING_ACTIVE remains false in actual source.

Only these three application files changed; rollback source copies in before/. No currency authority, display-FX engine or transaction ledger was duplicated. Display and transaction currencies remain distinct; no historical values or financial calculations were touched.

## Activation architecture

2026101901-tzs-rollout-controls.DRAFT.sql pins the existing 1802 core and 1803 gateway baseline, creates three private forced-RLS rollout/control/audit tables, inserts a disabled singleton, and updates only the existing TZS gateway body. It keeps all RPC client grants revoked. No existing business currency rows change.

Gateway checks existing active_subject, authenticated JWT role, numeric future JWT exp, TZS only, enabled server switch and unexpired actor allowlist before delegating to unchanged 1802. Supabase JWT signature validation remains the platform/Auth boundary; reading claims in SQL is not independent signature verification. Production read-only inspection confirmed auth.jwt/auth.uid/auth.role and postgres BYPASSRLS, required by the existing forced-RLS owner model. No role attributes/memberships were changed.

ACTIVATE-CANARY.DRAFT.sql is a separate, parameterized approval operation, not part of installation. It pins the new gateway postimage and requires an explicit verified actor UUID and approval reference through zetra.tzs_canary_actor / zetra.tzs_approval session parameters. Only postgres administration may enroll an active existing synthetic Auth identity. It records a one-hour allowlist and audit entry, then grants authenticated EXECUTE on this server-guarded function only. Transaction-local postconditions confirm restricted permissions, enrollment and continued core quarantine. No UI, service-role or user-facing administration can edit the allowlist/switch. No new internal bypass RPC exists.

An app user need not already own a business: canonical creation makes that actor Owner of the new organization, and the existing confirmation API checks that ownership. Existing organizations cannot be passed into this gateway. Subscription/creation permissions and organization limits remain canonical. Owner approval of rollout is represented by restricted administrative enrollment/audit, not a client-supplied Boolean or display currency. The acknowledgement Boolean remains explicit confirmation of the newly created organization's TZS accounting currency.

## Proposed permission matrix

| Identity/state | Controls installation | Future approved canary phase |
|---|---|---|
| PUBLIC / anon | Denied | Denied |
| authenticated | Direct EXECUTE denied | May enter gateway, but only active, valid-JWT, unexpired enrolled actors can create TZS org |
| expired/missing JWT, banned/deleted user, unenrolled/expired enrollment | Denied | Server rejects before organization creation |
| service_role / authenticator | Denied | Denied |
| client trying rollout-table writes | Denied | Denied |
| core 1802 direct client call | Denied | Denied |
| administrative postgres / verified CLI SET ROLE | Existing administration | Existing administration, no new blanket grant |

This is a conditional canary authorization, not unrestricted financial functionality. USD/KES/UGX/EUR native onboarding remains rejected. Existing legacy onboarding clients continue their existing creation path; this rollout controls the NEW atomic currency path, not a retrospective revocation of old canonical RPCs.

## Focused evidence

- 37 new rollout PostgreSQL checks PASS on disposable full public schema with synthetic Auth/JWT adapters: disabled default and quarantine; hostile control-table default ACL cleanup; forced RLS; client control-write denial; rollout switch/allowlist/TTL; valid TZS Owner binding and server currency read; expired/malformed claims; wrong role; USD/KES/UGX/EUR denial; unenrolled/foreign/banned users; duplicate concurrency and replay; failed confirmation without orphan org; original definitions/ACLs/financial fingerprints; core quarantine; activation/disable audit and safe disable.
- 2 additional final activation-postcondition checks PASS after adding final restricted-grant assertions; exact final activation draft and disable executed locally. No historical full 94/24/37/40 suites rerun. Local fixture replays of installed 1802/1803 establish prerequisites only, never remote execution.
- 25 client/controller/dictionary checks PASS: invalid/expired session, coalescing, conflicting intent, persisted retry ID, actor separation, offline error propagation, no fallback, authoritative mismatch, rollout denial and seven-language feedback.
- Browser acceptance: actual onboarding route and controller in the in-app browser with synthetic Auth/transport/OrgContext/UI-shell/CommonText adapters. Prospective true flag exists only in harness bundle. TZS acknowledgement and scoped payload routed to /(tabs); 390x844 expired-session feedback made no RPC; offline retry retained the identical UUID and form; 1440x900 Arabic RTL displayed non-TZS block after complete input. No overflow in observed adapter layouts. These are simulated interactions, not pixel-perfect full-app or real Auth acceptance. CSP connect-src none blocked remote network. Temporary tab/viewport reset and harness stopped.
- Current TypeScript: PASS, zero errors. Web production export PASS. Android/Hermes export PASS. Builds are not physical-device evidence. Real signed Supabase JWT lifecycle, actual token expiry/revocation, real service HTTP errors, physical Android/Chrome/Samsung Internet, native keyboard and real multi-device app restart remain NOT TESTED. Local persistence and independent SQL connections are tested; they do not replace genuine platform acceptance.

## Rollback and rollout procedure

DISABLE-ROLLBACK.sql pins new gateway postimage, locks rollout state, disables the switch, audits the disable and revokes client access. Gateway holds shared rollout/allowlist row locks during its transaction; administrative disable coordinates with in-flight work and has bounded timeouts. It retains organization/store/currency/request/audit records. Never delete created business records or restore an old full backup automatically. Source rollback uses before/ and postimage comparison or leaves client flag false; preserve unrelated work.

No schema rollback to the old gateway is performed automatically. A failed controls-install transaction rolls back all new controls/body/ACL changes; tested. An uncertain COMMIT requires read-only diagnosis, no retry. Restoring original source does not disable an already-activated server gate: run a separately approved server disable when necessary.

## Remaining acceptance boundary / exact next Owner approval

PARTIAL because genuine Supabase Auth and physical-device acceptance remain unexecuted. No current genuine local Auth service acceptance environment was established; existing closed Docker/runtime troubleshooting was not reopened. No new project, Staging, paid infrastructure or live business test was used. The remaining Auth boundary cannot be represented as PASS by mocks.

One consolidated future Owner package may authorize, conditionally and in this order:
1. Exact controls-install draft/hash on dcmhqdckzhbuakvcyjit after fresh baseline/role/backup checks; independently verify disabled state/core quarantine.
2. Exact canary activation draft/hash ONLY for an Owner-verified synthetic Auth actor UUID and explicit approval reference, one-hour TTL. Account/actor identity must be established through trusted Auth evidence, not arbitrary supplied claims.
3. Explicit controlled acceptance scope: one synthetic identity and at most one clearly labelled new TZS organization/store, zero sales/payments/stock/financial postings, no real-customer changes. Owner enters any authentication credentials privately; no passwords/tokens in chat. This step performs Auth/business writes and therefore is NOT currently authorized. Retain synthetic records for review; no automatic destructive cleanup. If no existing suitable identity is available, account creation/email delivery also requires explicit scope.
4. Keep broad client publication unauthorized until genuine Auth/canary and platform acceptance pass. CLIENT-ACTIVATION.patch is review-only; no current source activation or deployment. Physical Android remains a separate acceptance condition.

Approval should list exact hashes and actor/record limits rather than authorize unrestricted rollout. The current task performs none of those live actions. Non-TZS financial certification remains a separate later milestone, not started.

Prior Production backup evidence is retained; latest previously verified physical backup ID 1998078774 at 2026-10-18T06:01:17.400Z, Pro retention seven days. Restore NOT TESTED. Refresh actual availability before any future live change. No SQL writes, API/client activation, deployment, Git push, financial posting, Staging or historical rewriting occurred here.
