# Rollback and recovery

No 1902/1903/Owner activation executed in Production in this continuation. Keep the current 1901 switch false and RPCs quarantined pending approval.

Future ordered execution is staged: exact 1902 transaction COMMIT/independent disabled-state verification; exact 1903 transaction COMMIT/independent disabled-state verification; only then approved activation. Failure at either install leaves the prior completed stage quarantined; do not retry or activate after an error. 1903 transaction rollback restores original canonical limit clause and removes its private helper/table/body changes; locally tested.

After an approved trial, use only this package's final-postimage `DISABLE-OWNER-CANARY.DRAFT.sql`. It turns off server rollout, audits disable and revokes gateway EXECUTE, retaining all quota/request/organization/store/currency records. The private one-use exception cannot be used without active rollout, enrollment and a transaction-bound permit. Keep receipts immutable. Never delete old or new organizations to reduce the membership count, reset quota, or overwrite financial history.

Do not use earlier disable files pinned to old gateway hashes. No automatic destructive schema downgrade. A later removal of the inactive canonical hook requires separately reviewed exact SQL and confirmation of no active canary/permits. Existing plan/subscription rows are never temporarily edited or upgraded by this design; normal creation remains blocked at its original limit.

Full database restore is not the rollback procedure for this additive control change. Restore rehearsal remains untested; current backup availability must be refreshed before approved live execution. Any full restore requires separate approval and reconciliation of later customer transactions. Storage object contents are outside database physical-backup coverage. No new infrastructure created.
