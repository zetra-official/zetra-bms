# Combined M3 — canonical Products price compatibility

Owner-approved continuation of b2aed3c1. The earlier report is historical; its
cost and shared-store policy gates are superseded by the Owner's explicit
organization-level Products pricing approval.

Incoming now carries the verified original current cost independently of the
edited cost. A successful immediate or saved partial/full receipt applies current
cost and selling price through the existing `public.upsert_product` writer in the
same transaction. Product identity and precision metadata are retained. Current
organization prices also apply to remaining stock, exactly as existing Products
editing does. Destination quantity changes only in the selected store. No new
costing method, inventory engine, financial ledger or payment adapter is added.

Stale edits fail closed; replay/concurrent submissions remain idempotent. Saved
orders do not change current prices until receipt. Historical completed sales,
COGS and earlier receipt snapshots remain unchanged. The audit trigger records
changes without removing established legacy operational receiving permissions.

Focused evidence: 42 PostgreSQL checks, 5 model/source checks, 17 affected legacy
regressions, Web/Android TypeScript and exports passed. Genuine authenticated local
UI received two six-unit boxes with cost 600/selling 1200; reconciliation proves
destination 10→22, other store 7 unchanged, one movement and one price audit.
Existing M2/M3, Staff, draft, seven-language and four PDF evidence is retained;
obsolete tests expecting the Owner-approved price changes to be rejected are not
represented as current requirements.

`RELEASE-MANIFEST.json` seals artifact/SQL hashes. `RELEASE.sql` adds only the four
private authorization helpers required by M3, its private evidence tables/new APIs,
and reviewed canonical receiving/notification extensions. The full historical M2
hardening draft is **not** deployed. Existing Products writer and legacy ACLs are
preserved. The sealed SQL/rollback compile and permissions rehearsal is local and
transactionally rolled back without losing existing fixture evidence.

Rollback restores captured canonical function preimages, removes the product
audit trigger and revokes new API execution. It retains private receipt/audit data
and never reverses customer financial/inventory transactions. Web baseline:
6ad7c9964f937e8f233408c1. Android rollback group:
a22b1c60-6970-4912-887c-72bf70849579, production/runtime 1.0.0.

Production verification is read-only. Physical Android/iPhone and native
Print/Share for this candidate are NOT TESTED. No physical PASS is implied by a
build or OTA publication. Existing verified currency/localization behavior and
unrelated dirty root files are preserved. No GitHub push is needed.
