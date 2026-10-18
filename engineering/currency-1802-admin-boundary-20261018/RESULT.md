# READY FOR NEW OWNER APPROVAL — administrative boundary correction

## Root cause / live evidence

The prior guard conflated membership in an administrative owner role with immediately inherited RPC EXECUTE. Fresh metadata-only Production inspection (dcmhqdckzhbuakvcyjit) confirms cli_login_postgres is LOGIN, NOINHERIT, not superuser; its postgres membership has INHERIT FALSE / SET TRUE. It can explicitly SET ROLE postgres but does not inherit postgres privileges. postgres is the verified creating/function-owner role and is not a Production superuser. anon, authenticated, service_role and authenticator have neither postgres nor CLI membership/SET paths. Evidence: OWNER-ROLE-EVIDENCE.json. No managed role, membership or privilege was modified remotely.

PostgreSQL distinguishes SET membership from INHERIT usage: https://www.postgresql.org/docs/17/role-membership.html . Administrative sessions intentionally becoming the function owner already have DDL authority and can administer the function. An RPC ACL cannot meaningfully remove that pre-existing authority. It is not authorization to expose the RPC through API client roles.

## Minimal correction

New version: 2026101802-atomic-currency-onboarding-ADMIN-BOUNDARY.DRAFT.sql

SHA-256: 843db64a95e89240389371fce10a24f4105fb8d39d3e9cdff528600a67079c99

Original draft (64ad02ea...) and quarantined draft (ca693dce...) remain byte-identical. Function body/signature and existing business rules unchanged. Only the new function's quarantine assertion differs from the previous candidate.

The guard pins function owner postgres; recognizes only the verified CLI administrative identity with NOINHERIT and explicit SET capability; rejects a changed CLI role contract; rejects client/authenticator membership in postgres or CLI; removes all non-owner explicit/default function grants; and rejects remaining effective EXECUTE for all non-superuser non-owner roles, including CLI direct execution. Other unexpected owner memberships still fail closed. The CLI exception only exempts its verified existing owner-membership relationship from the former blanket membership assertion. No EXECUTE grant, ALTER ROLE or role-membership change is added. Restrictions and guards execute inside the same transaction before COMMIT.

## Effective access matrix

| Identity | Direct new RPC | SET ROLE owner/admin | Meaning |
|---|---|---|---|
| PUBLIC | No grant | Not a login role | No default API access |
| anon | Denied | Denied | Client disabled |
| authenticated, including app Owner/Admin/Staff | Denied | Denied | Client disabled regardless JWT/UI flag |
| service_role | Denied | Denied | No trusted application backend activation |
| authenticator | No new grant; client admin path prohibited | No owner/CLI path verified | PostgREST does not gain an owner path |
| cli_login_postgres | Denied as CLI identity | Existing explicit SET ROLE postgres allowed | Administrative DDL only; no new grant |
| postgres function owner | Owner authority | Already owner | Existing administration |
| Platform superuser | Administrative bypass | Administrative authority | Pre-existing platform trust; not an app role |
| Other default-grant / inherited roles | Denied or entire migration aborts | Unexpected owner membership aborts | Fail closed |

SECURITY DEFINER does not bypass the initial function EXECUTE check. Fixed search_path=pg_catalog and unchanged qualified body remain. An administrator explicitly becoming postgres can execute as owner and alter DDL; this unavoidable existing capability is disclosed rather than falsely described as denied. No blanket administrative grant is made.

## Focused verification

37 targeted PostgreSQL checks PASS on an isolated loopback copy of the verified full public schema. This is the corrected ACL/boundary suite, not a rerun of Global Currency 94 + 24 suites. Tests include hostile default grants, inherited role denial, actual calls as anon/authenticated/service_role, PUBLIC ACL absence, explicit non-owner ACL absence, permission-escalation/self-grant denial, forced RLS, original function/ACL compatibility, business/financial fingerprints, no alternate static wrapper, false client flag, injected failure rollback and guarded disable twice.

New representative hierarchy tests demonstrate CLI direct invocation denied, no inherited postgres usage, explicit CLI SET ROLE postgres successfully performing transactional DDL, clients unable to SET ROLE CLI, and full migration abort on either a client administrative membership path or unexpected CLI inheritance. Unexpected non-CLI owner membership also aborts. Test sessions use SET SESSION AUTHORIZATION for escalation checks, not a privileged postgres session merely changing current role. Local postgres is the disposable administrator; the live non-superuser owner attributes are separately recorded by read-only evidence. These local tests are not hosted Auth/PostgREST E2E.

Cluster stopped after tests. No app changes, build reruns, Production writes, deployment, Staging actions or financial activation.

## Rollback / approval boundary

Accepted ROLLBACK.sql remains unchanged and compatible because pg_get_functiondef body/postimage is unchanged. It checks that postimage and disables only the new entry point, retaining metadata and all business/currency records. Tested twice without data changes. Before COMMIT a failure rolls back the transaction; uncertain COMMIT requires independent read-only state verification, never automatic retry. Do not automatically restore an old full backup or delete business records.

No unresolved local blocker. Fresh live identity, backup, dependency, ACL and role hierarchy gates remain required at execution time. Owner must approve THIS filename and full new SHA for one Production attempt. Previous approvals do not apply. Migration must remain client-quarantined; client activation, application deployment, financial posting and historical conversion are separate and unauthorized.
