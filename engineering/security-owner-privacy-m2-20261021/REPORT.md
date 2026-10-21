# ZETRA BMS — Milestone 2 local security hardening

**Status: M2 PARTIAL. M3 readiness: BLOCKED pending the acceptance gaps below.**

Date: 2026-10-21. Baseline: `5f11acf94aade06df52f3a8de2da1205a6565599`.
This is a local review package, not a Production approval package. No hosted remediation has been applied. Existing Production exposure therefore remains until a separately authorized, verified release.

## 1. Scope and preservation

The Owner's Master Security Hardening Directive and mandatory Currency/seven-language addendum govern this work. Source changes were made in separate copies of the exact previously released Web and Android archives. The mixed root application checkout was not patched.

- All 32 pre-existing tracked dirty files retain their captured SHA-256 values.
- Root Catalog SHA-256 remains `a6b548a9567803d9db181b4d6f236349b55afddfc115ead7ba9f6d449c1b4914`.
- Currency, service and localization modules in both candidate platforms remain byte-identical to the released baselines.
- The released Web/Android platform differences were preserved. No Web-only Checkout/Safari change was copied wholesale into Android.
- No historical customer amount, currency, stock quantity, COGS snapshot or account balance was rewritten.
- No M3 bulk receiving, automatic drafts, consolidated receipt/notification, settlement engine, tax feature or native non-TZS posting was implemented.

See `BASELINE.json`, `PRESERVATION.json`, `SOURCE-web.patch`, `SOURCE-android.patch` and `M2-MANIFEST.json`.

## 2. Evidence and implementation

Hosted inspection used catalog-only `BEGIN READ ONLY ... ROLLBACK` queries and Storage **bucket configuration** reads. No auth users, sessions, tokens, customer business rows, storage objects or document contents were queried. Captured metadata includes 785 function definitions, 329 policies, relation/column grants, constraints and triggers. Sensitive/internal catalog snapshots remain in ignored `*.private.json` files.

Tests execute real PostgreSQL roles and synthetic JWT subjects in a separate loopback-only disposable full-schema database. Exact affected live functions, policy helpers, Auth claim helpers, schema ACLs and applicable policies were replayed before reproducing the baseline vulnerabilities. This is actual database authorization testing; it is not an end-to-end Supabase JWT-verification/PostgREST acceptance test.

### Remediations

| Finding / root cause | Local remediation | Evidence |
|---|---|---|
| `inventory_movements` and backup had RLS disabled and broad client privileges | Enable RLS; no client writes; backup inaccessible to clients; raw movement evidence Owner-only | Exact baseline configuration reproduced; effective privilege checks and identity tests PASS |
| `get_stock_in_items_v2` was anonymously executable, SECURITY DEFINER, without caller/store checks | Explicit anonymous revoke; active organization/store authorization; Owner-only cost fields; operational quantity response retained | Anonymous baseline disclosure reproduced, then blocked; role matrix PASS |
| Inbound autocomplete had no auth guard and returned acquisition costs | Verify organization/store scope, redact costs for non-Owners | Anonymous acquisition-cost leak reproduced, then blocked |
| POS product readers exposed purchase costs to Admin | Preserve price/quantity output; costs depend on active server-side Owner membership | Admin baseline POS-cost leak reproduced; Owner/Admin/Staff/Cashier price and quantity regressions PASS |
| Business Debt and supplier liability readers allowed ordinary membership | Owner guards on financial readers/writers; restrictive raw-table policies | Admin debt leak reproduced; all non-Owner identities denied |
| Field allocation used NULL-sensitive `NOT IN`; field expense lacked caller authorization | Owner financial authorization, active operational store, verified target membership/store and existing wallet/cycle scope | Both unrelated-caller baseline writes reproduced inside rollback-only transactions, then blocked |
| False permissive policies named “no direct write” did not override other allows | Revoke direct client DML rather than relying on permissive-policy names; add restrictive active operational read scope | Actual direct write attempts denied; effective grants captured |
| Incoming parent/item/payment/supplier references were independently constrained | Validate organization/store/supplier/product relationships; prevent parent/store reassignment; reject inconsistent legacy order evidence without rewriting it | New and legacy scope attacks PASS |
| Partial receive read the order before serializing inventory changes | Lock the existing order before calling the same canonical receive body; block received-item deletion | Real concurrent connections: one commit, one rejection, one movement and one debt recognition |
| Notification JSON/free-text could disclose original acquisition notes | Owner keeps evidence; non-Owner JSON uses a scalar allowlist; existing notification readers retained | Historical note and nested-payload tests PASS; no M3 consolidation introduced |
| Raw product/sale-item columns could bypass hidden UI | Remove client cost-column access; Owner-filtered financial projections for existing exports; operational projections retained | Direct cost selection/filter inference denied; original stored costs preserved |
| Valid Catalog share codes could expose or import source acquisition costs | Non-Owner preview redaction; cost-bearing imports require verified ownership of both organizations; operational sharing retained | Valid-code disclosure/import tests PASS; root Catalog source untouched |
| Other profit/history readers and raw financial evidence exposed indirect costs | Owner guards/policies cover relevant profit, goods statement, capital, loan-profit, Field and historical evidence paths | 50 Owner-only RPCs attacked by eight unauthorized identity cases: 400 denied invocations |
| Internal snapshot/global reporting entry points unnecessarily exposed to clients | Remove client execution of seven internal/global functions; keep canonical job bodies byte-identical | Effective execution grants and canonical-body hashes PASS |

The draft contains 71 modified existing public functions plus the seven client-entry-point quarantine definitions/ACLs. It reuses existing inventory, receive, supplier debt and wallet bodies; it does not create a ledger or alternative financial engine. Touched definer functions put `pg_catalog` first and temporary objects last in their search path.

### Application changes — five files per platform

1. `app/(tabs)/index.tsx`: non-Owner Desktop summaries do not wait on an Owner-only stock-cost valuation request.
2. `app/(tabs)/settings/business-statement.tsx`: existing Owner financial export reads authorized product and sale-item projections.
3. `app/stores/supplier-detail.tsx`: operational history does not fail because the Owner-only debt request is denied; debt card is Owner-only.
4. `app/finance/business-debts.tsx`: non-Owner loads clear protected state and show the existing localized Owner restriction.
5. `app/stocks/inbound.tsx`: redacted private amounts show a dash rather than fabricated zero; permitted selling prices remain visible; confidential cost-entry modals and new cost-bearing order UI are Owner-only.

UI role checks are presentation controls only. The database guards and privileges enforce the policy independently of client role labels.

## 3. Verified access matrix

| Identity | Confidential own-org costs/debts/profit | Assigned operational products/price/quantity | Other organization | Direct inventory/movement writes |
|---|---|---|---|---|
| Active Owner | PASS through authorized RPC/projection | PASS | DENIED | DENIED; existing canonical RPCs retained |
| Admin | DENIED | PASS under existing org/store permissions | DENIED | DENIED |
| Staff | DENIED | PASS for assigned store | DENIED | DENIED |
| Cashier | DENIED | PASS for assigned store | DENIED | DENIED |
| Anonymous | DENIED | Protected inventory APIs denied | DENIED | DENIED |
| No membership | DENIED | DENIED | DENIED | DENIED |
| Other-org user/Owner | DENIED for tested org | DENIED for tested store | Cannot use foreign ownership to enter tested org | DENIED |
| Unassigned-store user | DENIED | DENIED for tested store | DENIED | DENIED |
| Inactive/revoked membership | DENIED | DENIED | DENIED | DENIED |

Owner historical valuation for an inactive store was explicitly tested and retained. Active membership and correct organization ownership remain mandatory. A forged client `owner` label does not establish financial authority.

Raw cost columns are not directly granted even to the shared authenticated database role. Owner access uses server-filtered projections/RPCs. This avoids granting Admin the same columns merely because both users connect as `authenticated`.

## 4. Regression results

| Evidence | Result |
|---|---|
| `SECURITY-TEST-RESULTS.json` | 147 PASS; includes the nine identities and 400 Owner-only RPC denial probes |
| `INDIRECT-PATH-RESULTS.json` | 25 PASS; valid Catalog code, hidden-cost filtering, forged role, notification payload, original-cost preservation and legacy cross-org references |
| `CONCURRENCY-RESULTS.json` | 8 PASS; real parallel PostgreSQL sessions and one-time inventory/debt recognition |
| `ATOMICITY-RESULTS.json` | 12 PASS; injected late-DDL failure fully rolled back, effective privileges and blocked funding boundaries |
| Currency/localization/source contracts | 24 unique Node checks PASS; seven languages, Arabic direction, exact decimals, tenant mismatch, source/freshness and privacy UI contracts |
| TypeScript | Web PASS; Android PASS |
| Offline exports | Web PASS, 272 files; Android PASS, 48 files |

All four PostgreSQL result files pin the same final SQL SHA-256. Total: **192 PostgreSQL checks PASS**. The 400 denial probes are included in grouped matrix checks, not added again to inflate that total.

Existing canonical full/partial receiving succeeded for Owner and Admin in rollback-only synthetic tests. Owner wallet allocation, expense and incoming payment declaration succeeded. These payment declarations remain the existing contract; this does not certify new settlement-account or cashier reconciliation functionality.

The first draft trigger incorrectly inspected an item-only field on payment rows. A focused regression caught it; the final trigger branches by table and the existing payment path passes. This was a local draft defect, never hosted.

Old snapshot revocations on Auth schema/functions and RLS helpers caused harness configuration failures. Exact live metadata was replayed instead of treating these errors as successful privacy tests. Windows sandbox export-file failures were rerun with the same sources outside the sandbox; final exports pass. These are distinguished from application failures.

## 5. Currency and seven-language compatibility

- BoT remains the reference source for TZS pairs; ECB for other supported pairs.
- The four-day effective-date and 24-hour retrieval policies remain unchanged.
- Known-date archived official feeds were used for deterministic regression; this is not a new live-rate availability certification.
- Source/date evidence, exact decimal rounding, fail-closed missing/stale FX, immutable original amounts and tenant mismatch rejection pass.
- Conversion has no authority to retrieve hidden costs: the protected database readers deny them before presentation; conversion row filtering also retains Owner-only restrictions.
- ISO currency catalog support remains above 150 active currencies, including zero- and three-minor-unit cases.
- English, Kiswahili, French, Portuguese, Arabic, Spanish and Chinese dictionaries/direction behavior are preserved. Existing translated Owner restriction copy was reused.
- No customer product name, supplier identity, SKU or original evidence was translated or rewritten.

**Arabic/Chinese PDF glyph rendering is NOT TESTED on this M2 candidate.** Existing templates use platform font fallback; byte preservation and HTML direction are not proof of native PDF shaping/glyph coverage. No font or translation feature was added to manufacture a PASS.

## 6. Remaining gaps — why M2 is PARTIAL

1. **Genuine full-product acceptance against the hardened backend is NOT TESTED.** Database identity tests and real exports pass, but this milestone has not exercised Login → workspace → POS/Incoming/Owner report/export and organization switching through an authenticated PostgREST/Auth stack using the M2 draft. No Production database was patched to simulate this. This includes stale protected client state and alternate-route/export coverage beyond the five patched screens.
2. **Actual Arabic/Chinese PDF rendering and physical Android/iPhone acceptance are NOT TESTED.** Seven-language dictionary/RTL and build checks do not establish device/PDF acceptance.
3. **Historical public storage objects were not inspected.** The three configured buckets (`club-media`, `product-images`, `organization-logos`) are public and have no MIME allowlist/size limit in captured configuration. No financial-document bucket was found in that configuration. This does not prove that no historical financial file was placed in a public bucket. Changing public image/media policies without validating object ownership/path conventions could break existing Catalog/media. No object was downloaded, rewritten or deleted; no signed URL was generated.
4. **The draft is not a hosted migration release package.** Production preimage/dependency/role-inheritance checks and a separately approved rollout remain necessary. Local effective privileges do not certify every current hosted role or extension configuration.

No unresolved failing assertion remains in the sealed local suites. The gaps above are unperformed acceptance/coverage, not PASS results. Production security closure and full system-wide confidentiality must not be claimed from this package.

## 7. Operational conflicts and decisions for Owner review

- Existing Admin quantity receiving remains available through the canonical full/partial receive RPCs. Staff/Cashier do not gain new receiving permissions.
- Non-Owner purchase-cost entry, debt settlement evidence and Field financial expense/wallet workflows fail closed under the approved Owner-only rule. A separate cost-blind operational contract is needed if agents/Admin must perform those tasks. M2 does not invent Owner approvals, delegated cost entry or a new treasury workflow.
- The existing product upsert was already Owner-only; NULL cost input is not a route for Admin to overwrite original costs.
- Strict Owner privacy changes the effect of cost-enabled Catalog shares. An operational share still works, but a share code is not authority to disclose the source organization's purchase cost. No unrelated Catalog hotfix/source was changed.
- Existing receive costing, current-product valuation formula, integer product mirrors, payment declaration semantics and supplier debt matching were not redesigned. M1's non-security accounting gaps still require the separately authorized financial milestone.

Owner review should resolve the required non-Owner operational responsibilities before M3 architecture is finalized. M3 still requires explicit authorization for bulk receiving, secure automatic drafts, one logical event, permission-aware consolidated notifications/receipt and seven-language labels/PDF behavior. Do not start M3 from this checkpoint automatically.

## 8. Safety, local rollback and handover

- No Production/Staging SQL, database writes, migrations, deployments, Edge publication, OTA publication, financial activation, GitHub push or remote repository change occurred.
- No customer record was deleted or repaired.
- All database mutations were confined to the verified disposable loopback directory and synthetic fixtures. Transactional workflow tests rolled back; concurrency tests deliberately committed only newly created synthetic local records.
- Receipt, funding source, custody, return and cashier safety boundaries remain outside the draft. The captured live blocked contracts remain blocked; no financial adapter was activated.
- Late-DDL failure rollback was rehearsed against the exact final draft. Root/released sources remain available unchanged, with exact source archive hashes in the manifest.
- Do not use `function-preimages.LOCAL-RESTORE.sql` as a Production rollback: it contains known-vulnerable baseline definitions and is only a local reproduction aid. No hosted rollback is needed because M2 was not published.
- The M2 disposable PostgreSQL cluster is stopped after tests. Existing unrelated local servers/processes were not stopped or modified.

Resume from `M2-MANIFEST.json` and the four passing PostgreSQL results. Do not repeat adequately verified suites unless the SQL, relevant source or test environment changes. Complete the four acceptance/coverage gaps before treating M2 as complete or requesting a production hardening release.
