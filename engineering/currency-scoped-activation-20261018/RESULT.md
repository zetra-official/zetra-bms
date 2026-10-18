# Scoped activation package

Status: READY FOR SCOPED ACTIVATION APPROVAL — TZS-only backend gateway. Full client/customer release remains held pending explicit activation scope and genuine Auth/device acceptance. This is not full Global Currency or native non-TZS release readiness.

## Architecture / exact scope

Migration 1802 is completed and unchanged. Its broad-currency RPC stays owner-only. New versioned DRAFT 2026101803-tzs-onboarding-gateway.DRAFT.sql adds only one constrained SECURITY DEFINER public gateway and function ACL changes on that new function, inside a bounded atomic transaction. It accepts the same typed onboarding arguments, rejects any p_currency other than TZS server-side, checks active_subject, and delegates to the exact verified 1802 RPC. No second authority, accounting engine, table, ledger or currency audit is introduced.

Core supplies per-actor advisory locking, idempotency/conflict checks, canonical subscription/creation rules, new Owner membership, existing Owner-confirmation authority, timezone initialization only for the new organization, request receipt and currency audit. No caller-supplied existing organization ID. Existing businesses cannot be adopted or relabelled through this gateway. Currency acknowledgement is mandatory; display preference never authorizes accounting currency. A new user does not need pre-existing Owner membership: canonical creation establishes ownership of that new organization and the existing confirmation API validates that same actor.

The draft pins the core definition hash/quarantine and client administrative role isolation; removes inherited default explicit grants on the gateway, then grants authenticated access only to the TZS gate. Core ACL, managed roles, existing RLS and existing public APIs are not changed. Postconditions reject anon/service_role/authenticator effective gateway access and verify owner/search_path. Independent read-only verification SQL is provided; Production preflight must also refresh current roles/dependencies/backup state before any future execution.

## Permissions

| Identity | Proposed gateway | Core 1802 |
|---|---|---|
| PUBLIC / anon | Denied | Denied |
| authenticated active user | TZS + explicit acknowledgement + canonical plan/ownership checks | Direct call denied |
| inactive/deleted/banned/missing subject | Denied by server | Remains quarantined |
| application Owner/Admin/Staff | No authority over an existing org through this gate; new org only if canonical creation allows | Direct call denied |
| service_role / authenticator | Denied | Denied |
| postgres / administrative SET ROLE | Existing administrative authority | Existing administrative authority |

No blanket EXECUTE on schemas or other functions. Inherited authenticated capability remains subject to the same active JWT identity and canonical checks; this is not a permission to change other organizations. PostgREST token validation remains the existing platform boundary; local JWT GUC adapters are not a claim of real Auth E2E.

## Main source changes

- src/currency/onboarding.ts: adds the TZS-only capability and gateway name, plus scoped persisted intent preparation; generic historical helper retained. ATOMIC_CURRENCY_ONBOARDING_ACTIVE stays false.
- app/(onboarding)/store.tsx: future atomic path targets the constrained gateway; non-TZS remains blocked even if a feature flag is flipped. Existing legacy RPC path and handlers remain intact. New server response supplies exact org identity; no financial posting is added.
- src/currency/masterMessages.ts: scoped/unsupported messaging in all seven languages. No navigation/layout redesign.

before/ holds exact rollback source copies. Unrelated dirty files and accepted Git checkpoints preserved.

## Test evidence / limits

27 focused PostgreSQL checks PASS against a disposable copy of verified 124-table public schema with synthetic Auth/JWT adapters: TZS authority/Owner persistence, USD/KES/UGX rejection with no organization creation, anonymous/service-role/invalid/banned denial, acknowledgement, cross-org read/authority denial, core quarantine, replay/conflict and duplicate concurrency, injected confirmation failure rolling back org creation, unchanged original definitions/ACLs and financial fingerprints, guarded disable twice and failed gateway installation rolling back. Cluster stopped.

27 executed client/helper/dictionary checks PASS: default TZS payload, scoped gateway, non-TZS rejection before persistence, same intent on retry, changed uncertain intent rejection, validated authoritative response, legacy path retained, client flag false and seven-language copy parity.

Current TypeScript: 0 errors. Web production export PASS. Android/Hermes export PASS. These are build compatibility results, not physical-device acceptance. Prior 94 + 24 and administrative 37 checks retained, not rerun as full suites. Initial test-only quoting error prevented the first PostgreSQL test from starting; corrected fixture passed. Dictionary test initially used an inappropriate character-count threshold for Chinese; corrected to semantic TZS presence and seven-language parity. Product validation was not relaxed.

Desktop/Mobile Browser authenticated full workflow, native Android physical launch, actual Auth service token lifecycle and PDF/device output: NOT TESTED in this milestone. New code performs no hosted requests during tests. Prior rendered acceptance is not claimed as newly executed. No real business transactions were created.

## Rollout / rollback / approval

1. Owner approval must name exact NEW 1803 draft/hash and Production target dcmhqdckzhbuakvcyjit. No migration authorized now. Scope only enables server-constrained TZS gateway; 1802 core remains quarantined and all non-TZS native paths remain unavailable.
2. After any future approved installation, independent read-only postflight must match gateway/core hashes, ACL matrix, existing contracts and roles before client activation is considered. Keep current client flag false on any failure; no automatic retries.
3. A separate approved controlled Auth/onboarding acceptance must use disposable authorized identities/records, never real customer records; verify refresh/server currency persistence, Owner binding, routing, retry and old-client coexistence. This is a live-write acceptance boundary requiring explicit scope, not something this local package silently performs.
4. Only then authorize an exact client flag/release patch and platform publication. No deployment-ready claim for current complete application. Physical/runtime acceptance is pending. Do not simply grant clients the broad core RPC.

ROLLBACK.sql pins gateway postimage and revokes only new gateway execution, retaining core quarantine, organization/store/currency/audit/request data. Source rollback restores these three files only after comparing postimages or keeps flag false. Never delete created organizations, restore an old backup over newer transactions or overwrite unrelated working-tree changes. In-flight authorized transactions require incident coordination; revoke is not cancellation of already-running work.

Existing Production backup evidence is retained: completed physical backup ID 1998078774, 2026-10-18T06:01:17.400Z; restore rehearsal NOT TESTED. Refresh availability at execution time. No Staging, new project, paid service, remote write, release, backend/client activation, FX posting or historical change occurred.

Remaining blockers: non-TZS native contract integration (matrix in NATIVE-READINESS.md); genuine Auth/device/PDF acceptance for client release; cross-device display preference and verified universal FX delivery remain prior known limitations. No unresolved local TZS gateway security blocker found.
