# LOCAL QUOTA READY — GENUINE AUTH ACCEPTANCE BLOCKED

19 October 2026. Local preparation only; no Production SQL writes, Auth-user creation, enrollment, organization/store creation, financial posting or deployment in this milestone. No Staging. Previous rejected actor and all its memberships/business history left untouched. Fresh read-only lookup explicitly excluded its verified UUID; no other email was guessed from spelling variations.

## Dedicated actor

Fresh Production read-only search at 06:37:17 UTC found **0 explicitly administrator-marked test candidates**, hence 0 verified clean candidates. Eligibility query additionally requires confirmed, active, nonanonymous Auth plus no memberships, organization/store creation or known direct sales/payment/stock/expense/shift/wallet attribution. No emails, credentials, amounts or transaction details exported. This is a bounded search, not proof that no informal/unmarked test identity exists or that every possible historical attribution path has been exhaustively checked.

Owner must create/identify a dedicated new noncustomer Auth identity under Owner control, privately confirm/sign in, and supply its real UUID with explicit canary approval. Creating an Auth user or sending an invitation on Owner's behalf is not currently authorized. No password/token/OTP needed in chat. See AUTH-ACCEPTANCE-PLAN.md. Previously proposed multi-organization identity is ineligible for this preparation and will not be enrolled.

## Server quota

Exact local migration: `2026101902-tzs-canary-quota.DRAFT.sql`.

SHA-256: **7ce3e81d44b402d53f19f4776647e4953471aef34d51faea69536696aeb13e55**.

Requires installed 1802, quarantined 1803 and disabled 1901 rollout controls; pins both existing function definitions, requires no enrolled actor and no existing API grants. Creates **one private forced-RLS quota/intent table**, replaces only the existing TZS gateway, removes unexpected default grants and leaves all client EXECUTE revoked. No managed role, membership, original onboarding RPC, currency authority or financial table altered.

Future enrollment binds actor + immutable approved request ID + normalized organization/store names + TZS + timezone + acknowledgement. Missing intent, new request ID, changed parameters, wrong/expired actor/session and non-TZS requests fail closed before canonical creation. Admin enrollment accepts only explicit synthetic naming and a clean confirmed Auth identity, at most one currently active actor. Existing approved intent cannot be overwritten even after use. Receipt remains after disable/expiry/renewal.

Gateway locks rollout, allowlist and actor quota rows in a consistent order. It invokes unchanged 1802/core and existing canonical creation once per immutable request, verifies returned Owner/org/store/currency result and exactly one store, then records the result in the same transaction. Concurrent retries return the same result; different requests are rejected. Any downstream error or caller rollback rolls back creation, confirmation, core request receipt and quota consumption. JWT/enrollment expiry is rechecked **after waiting for locks**. A disabled switch denies requests even if a future gateway grant exists.

New gateway postimage MD5: `953346c2582e3f4ae047796ec87ff0bf`.

Scope is the controlled TZS gateway, not a new global restriction on every legacy organization/store creation API. Existing canonical administrative and legacy onboarding permissions are deliberately preserved. Dedicated account/harness must perform only this approved trial. No claim that unrelated APIs are globally disabled by this quota. If Owner requires an account-wide ban across legacy endpoints, that is a separate authorization boundary, not covered or claimed here.

## Permissions

| Role | After quota installation | Only during separately approved enrollment |
|---|---|---|
| PUBLIC / anon | Denied | Denied |
| authenticated | Denied | Gateway callable, but only exact enrolled actor/intent/TZS/unexpired session can proceed |
| service_role / authenticator | Denied | Denied |
| Core 1802 direct clients | Denied | Denied |
| Quota/control tables client writes | Denied | Denied |
| postgres owner / verified CLI SET ROLE | Existing administration preserved | Existing administration preserved |

No frontend flag is treated as a security boundary. SQL local tests simulate Auth claims; Supabase remains responsible for real token signature verification. Genuine Auth acceptance has not passed.

## Focused evidence

**55 PostgreSQL checks PASS**, plus **6 expiry-after-row-lock checks PASS = 61 new focused checks**. Real separate PostgreSQL connections against the verified captured 124-table public schema with existing canonical triggers/functions and exact 1802/1803/1901 dependencies. Auth adapters are simulated; not a genuine Supabase Auth service.

Eight simultaneous connections tested four approved retries and four new request IDs: approved responses identical, other IDs denied, one organization and one store. Repeatable-read concurrency produced at most one organization; serialization failure is safe and not automatically retried. Forced downstream confirmation failure, receipt-write failure and explicit caller ROLLBACK left no partial creation/consumption. Owner binding, independent currency read, cross-org denial, expiry, core quarantine, hostile default ACL cleanup, CLI explicit administrative SET ROLE, audit retention and unchanged financial fixture hashes checked. Existing non-gateway function definitions/ACLs unchanged. Exact final disable draft passes twice locally and preserves quota receipts.

The initial sandbox-only run could not connect to loopback; permitted run outside that restriction passed. No remote execution/retry involved. Disposable clusters stopped. Existing accepted 1,423 catalog/helper checks and earlier Global Currency suites were **not rerun**. No application TS/TSX changed, so prior TypeScript 0 errors/Web/Android-Hermes build evidence is reused; new Python/SQL checked by execution/syntax parsing, not labelled Android runtime proof.

Genuine Auth, actual browser canary, physical Android and new PDF workflow acceptance remain **NOT TESTED**. Local tests do not authorize rollout. Accepted main-project source remains intact; no new duplicate currency/financial engine.

## Exact approval gate

APPROVAL-REQUEST.json lists the three new artifact hashes. The old activation artifact deliberately fails its old postimage guard against the quota gateway; do not reuse it. New migration and new activation require **new explicit Owner approval**, never old checksums. No execution runner automatically activates anything.

One consolidated gate requires: verified dedicated test Auth UUID + exact synthetic intent/request + approval of migration, activation and disable artifacts, one-hour trial, max one synthetic org/store through the gateway, zero financial transactions. Fresh Production identity/baseline/ACL/backup checks immediately before any approved execution. Account creation/invitation also needs scope if delegated. Until then: server disabled, clients quarantined, no deployment.

## Remaining Global Currency boundaries

Catalog/display/helper coverage is not native financial certification. Existing fractional-discount rounding, missing immutable transaction/tender/historical FX context, native balances/cashier reconciliation, offline server currency persistence, trusted TZS/KES/UGX provider delivery and real-device/PDF acceptance remain documented in `engineering/global-currency-final-20261019/RESULT.md`. No safe historical denomination can be invented. Those financial/security contracts require authoritative decisions and separately approved migration/activation; this quota package does not silently alter them.

All independent safe canary preparation is saved here. There is no verified actor and no authority for live activation yet. Rollback: ROLLBACK.md. Exact-byte manifest and preserved-source integrity: SHA256-MANIFEST.json and PRESERVATION.json.
