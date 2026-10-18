# RPC security correction â€” BLOCKED — administrative role boundary

## Root cause and correction

Original migration granted authenticated EXECUTE on a SECURITY DEFINER RPC. A false UI flag cannot prevent direct PostgREST invocation. Original SQL and its SHA-256 64ad02ea0bd8783f690ff363f1a2714e565a3a5deb381d8ba8b07c5fcbcb60a4 remain unchanged at currency-onboarding-20261018.

Corrected version: 2026101802-atomic-currency-onboarding-QUARANTINED.DRAFT.sql. PROVENANCE.json and SHA256-MANIFEST.json contain exact new hashes. Change is restricted to new RPC ACL/security postconditions before the original COMMIT; function body/signature and business rules are byte-identical in the source text. No new business/schema feature introduced.

PUBLIC, anon, authenticated and service_role are denied. A transaction-local block removes every explicit non-owner grant on this function, including grants originating in owner-specific default privileges. It does not modify global default privileges or existing RPC grants. It aborts the entire migration if any non-superuser/non-owner retains effective EXECUTE or membership in the function-owner role, including NOINHERIT membership permitting SET ROLE. Function remains owned by its creating trusted database owner with SECURITY DEFINER and search_path=pg_catalog. Owner/superusers necessarily retain administrative execution ability; no application backend role is approved or granted access. A privileged administrator can intentionally change permissions later; this is not prevented by PostgreSQL object ACLs.

## Access matrix

| Role | New RPC access |
|---|---|
| PUBLIC | No EXECUTE |
| anon | Denied |
| authenticated (including app Owner/Admin/Staff JWT users) | Denied |
| service_role | Denied |
| Synthetic direct/inherited default-grant roles | Denied |
| Function owner / superusers | Administrative authority retained; not application activation |
| Other non-superuser roles / owner membership | Must have no access; migration aborts otherwise |

Direct SQL invocation is denied before the function body runs, independent of JWT subject, tenant and frontend flags. PostgREST uses database role permissions; actual hosted HTTP invocation is NOT TESTED because remote installation is unauthorized. No static alternative wrapper referencing the new function exists in the tested verified schema. Existing canonical RPCs intentionally remain unchanged. This scoped check does not claim to eliminate unrelated privileged arbitrary-SQL endpoints; any live material drift must stop execution.

## Local evidence

28 focused checks PASS on a disposable loopback PostgreSQL 17 copy of the verified full public schema (124 tables). Includes actual anon/authenticated/service-role/direct/inherited calls, hostile default ACL, PUBLIC absence, owner/config checks, session-authorization escalation denial, self-grant denial, forced RLS and request-table denial, unchanged existing function definitions/ACLs (including Owner/isolation contracts), unchanged business/financial fingerprints, no alternate static wrapper, frontend-disabled evidence, injected transaction failure/absence of partial DDL, guarded disable twice, and NOINHERIT owner-membership failure with full rollback. Original 94 + 24 suites preserved, not rerun.

First local attempt was blocked by sandbox loopback access; cluster was safely stopped. Approved local rerun passed. No remote connection, customer data, application source change, build, deployment, Staging operation or Production write. Synthetic PostgreSQL role testing is not real Auth-service/device acceptance. Disposable cluster stopped after testing.

## Rollback / next boundary

ROLLBACK.sql is the accepted guarded revoke-only disable, unchanged because the function body/postimage is unchanged. Tested twice against this candidate; it preserves data and remains safe when already quarantined. A failed migration transaction rolls back DDL and ACL changes. After uncertain COMMIT inspect metadata once; never retry automatically. After COMMIT do not delete metadata/businesses or restore an old backup automatically. Explicitly preserve later customer transactions.

Old migration approval does NOT authorize this candidate. Next: obtain exact new Owner approval for this hash on Production dcmhqdckzhbuakvcyjit, with fresh identity/dependency/default-ACL/role-membership and backup gates, transaction-local security postconditions and independent read-only postflight. If existing non-superuser membership in the chosen database owner prevents quarantine, STOP; do not revoke unrelated role memberships or weaken the guard. No live role condition was inferred from local fixtures. Backend/client activation and financial posting need separate approval. Local correction/tests pass, but fresh Production metadata confirms cli_login_postgres is a non-superuser NOINHERIT member of postgres. The guard deliberately aborts for that membership. Therefore this candidate is BLOCKED for live execution; do not approve or run it as-is. Resolving this requires a separately reviewed administrative-owner exception or ownership design, retaining denial for all client roles. No existing role membership was altered. The CLI management role already has owner-level administrative capability via SET ROLE; it is not an application backend contract or reason to grant application EXECUTE. Evidence: OWNER-ROLE-EVIDENCE.json.
