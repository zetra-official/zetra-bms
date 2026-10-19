# Rollback / disable

Not installed in Production. Existing 1802/1803/1901 remain unchanged and disabled. No live rollback needed now.

New installation is one atomic transaction with bounded lock/statement timeouts and baseline/ACL guards. Failure before COMMIT restores existing gateway/ACLs and removes the new table transactionally; tested locally. Uncertain outcome requires independent read-only inspection, never automatic retry.

After a future separately approved canary, execute only this package's `DISABLE-ROLLBACK.DRAFT.sql`: pin new gateway postimage, lock config, switch false, append disable audit and revoke gateway API EXECUTE. It preserves immutable quota/request/result receipts and all org/store/currency/financial records. It is idempotent in disabled state; tested twice. Do not drop the quota table, delete a synthetic business, reset the quota or restore the pre-quota gateway after consumption: that could reopen the limit.

The old 1901 disable draft pins the old gateway MD5 and must not be used after this patch. New disable hash is in APPROVAL-REQUEST.json. No automatic schema downgrade or historical rewrite.

Full database restore is distinct and not a rollback for this additive control change. Accepted Production backup evidence exists; actual restore rehearsal remains NOT TESTED. Refresh backup availability before future live execution. Never restore an old full backup over later customer transactions. No new project/paid recovery infrastructure used.
