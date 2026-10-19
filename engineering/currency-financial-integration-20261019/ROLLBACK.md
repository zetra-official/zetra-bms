# Recovery / rollback

No Production SQL or client publication occurred in this continuation. Existing canary remains disabled under accepted 92ee8c0 evidence. No original financial amount/currency was rewritten.

Source: before/ and SCOPE-DELTA.patch preserve pre-existing working tree and only this continuation's delta. Check exact current postimage hashes before reversing individual changes. Do not git reset/stash/discard unrelated changes. In particular Checkout and POS already contained accepted pending work before this task; preserve it.

SQL1904: transaction failure before COMMIT rolls back new objects. Prepared rollback removes only three new capture triggers and retains all currency_context columns/values, captured financial facts and quarantined helper. Disposable rehearsal verifies preservation after new synthetic sale/payment/expense rows. That rollback returns capture behavior toward the legacy baseline and must not be used to activate non-TZS posting. Keep client restrictions and require an approved mitigation if legacy backend behavior is unsafe for the intended rollout.

Before any Owner-approved live migration: reverify project/hash, current schema/function/trigger/RLS metadata, completed backup availability, bounded locks, recovery limitations and exact command. Current Pro backup availability evidence belongs to prior approved canary execution; restore rehearsal remains NOT TESTED. Storage contents are not covered by database backup. Do not restore an old backup over new customer transactions. No automatic retries after failed or uncertain execution.
