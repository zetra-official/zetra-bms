# Disable and recovery

Current safe state already has gateway client EXECUTE revoked, server switch false, no enrolled actor and source activation flag false. No rollback or cleanup SQL is necessary now. Retain the controls/request/audit objects; do not drop business records.

The exact controls migration is atomic: an execution error before COMMIT rolls back its table/body/ACL changes. A successful command plus independent postimage/object visibility established COMMIT here. ATTEMPT-ONCE.json prevents rerun. After any uncertain outcome use read-only inspection, never automatic retry.

For a later approved canary, use the existing reviewed `engineering/currency-tzs-acceptance-20261019/DISABLE-ROLLBACK.sql` (SHA-256 `5956e8d5d5dce847ac4ec180141989a62ea4d689317643b28f732e29785e1489`) under its applicable authorization: locks config, sets false, audits disable, revokes API EXECUTE, preserves created org/store and historical records. It is not executed now. Allowlist expiry is one hour but does not substitute for audit/disable verification. Core 1802 remains quarantined.

No application source changed or deployed in this continuation. Do not revert unrelated working-tree edits. Future client rollback must target only the exact accepted client diff and does not disable an active backend switch by itself.

Full database recovery is distinct from SQL disable. Backup ID 2007453045 (2026-10-19 05:58:22 UTC) is available with Dashboard Restore controls; restore has NOT been rehearsed. Never restore it automatically over later customer transactions. Any full restore requires explicit Owner approval, outage/reconciliation planning, and handling of post-backup writes. Database backups exclude Storage object contents. No Storage restore is promised.
