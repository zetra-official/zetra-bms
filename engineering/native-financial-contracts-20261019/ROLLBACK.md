# Scoped rollback / recovery

No remote migration or deployment occurred. Existing Production remains unchanged.

Source: preserve all current edits before reversal. Revert only this checkpoint's six application files, using the four before/ snapshots or the parent 5b1c604 versions after checking for subsequent edits; remove the two newly added source modules only when imports are also reverted. Never reset the working tree or revert unrelated milestones. The native client constant is false throughout.

Database draft order is 1904 then 1905, one explicit Owner approval required before any future Production execution. Both use bounded transaction/lock timeouts. An error before COMMIT rolls back that attempt; uncertain commit requires independent read-only inspection, never automatic retry.

Once installed, use 1905-DISABLE-ROLLBACK.sql as the deny-only operational rollback, with separate live authorization. It disables all rollout entries and strips nonowner access to new functions/helpers. Existing canonical TZS calls remain available; non-TZS writes fail closed. Retain native request receipts, sale/payment/credit facts, rounding deltas, currency snapshots and widened numeric precision. No ledger replacement, financial UPDATE, deletion, narrowing cast or customer-history rewrite.

The disable script was verified on fresh schema, after real synthetic native sales/debt/repayments, and against temporary helper grants. Full backup recovery is a separate operation, not this rollback. No current remote backup/restore readiness claim is made in this local task. Before any live migration, revalidate actual backup reference/retention and documented recovery procedure, schema MD5/ACL/view dependencies, lock/rewrite impact and application compatibility. Do not restore an older backup over new business transactions as a migration rollback.

Disposable test clusters remain stopped under ignored disposable*/ paths. They contain synthetic fixtures only and can be retained for reproducing tests. No credential, Auth token or customer export is required by the tests.
