# Recovery and approval boundary
LOCAL REVIEW ONLY. No live migration, client activation or financial posting authorized.

Before a future reviewed release: pin exact project independently, fresh metadata-only dependency gates, exact candidate SHA256, execution receipt and one authorized transaction. Existing draft 20261018 foundation remains unchanged; this version supersedes it for review. Never run both drafts.

Migration creates one private RLS/forced-RLS request metadata table and one versioned authenticated RPC. Original two-argument RPC, currency authority and financial ledger stay intact. The wrapper serializes per actor, calls canonical org/store/membership creation and existing Owner confirmation, initializes only the new organization timezone, then stores an idempotency result. FX is not required. No existing organization is adopted or changed. Failed transaction rolls back all wrapper side effects. Different request IDs are serialized to retain subscription limits among new wrapper callers; legacy callers retain their existing behavior.

After uncertain COMMIT: NO automatic retry/new request. Read exact request receipt under server authority and existing org/currency state first. Reuse the persisted identical actor/request and payload only after state resolution. Mismatched currency/backend response requires review; never silently create another organization.

Rollback: pin postimage guard, revoke only new RPC access via ROLLBACK.sql and retain all organizations, stores, memberships, currency confirmations/audit and request receipts. Set client feature gate false / restore only changed client files after comparing current postimages. Never restore an old database backup over newer transactions or delete newly created businesses to roll back.

Before/ backups preserve the two existing changed sources. The new acknowledgement component is independently removable only if no newer references exist. The previous 124-check foundation and all unrelated dirty work are preserved.

Known limitation: the preserved full-public-schema fixture intentionally has quarantined direct legacy RPC ACLs; this milestone does not infer deployed client grants from it. Auth users/claims are synthetic local adapters, not actual Supabase GoTrue acceptance. A future live release still needs fresh metadata gates and exact Owner authorization; do not activate the false client flag from this draft.
