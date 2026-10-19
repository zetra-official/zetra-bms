# Rollback and recovery

Backend is currently disabled and API execution denied. Do not activate merely to demonstrate disable. Preserve committed 1902/1903 audit/quota objects; do not drop tables/helpers or edit managed roles ad hoc. Exact approved disable artifact in CONSOLIDATED-APPROVAL.json is available for any subsequently authorized activation. Verify its hash and state independently; no automatic retry after uncertain SQL.

SQL rollback/disable is different from full database restore. Do not restore an old backup over new customer transactions. Backup availability was verified; actual restoration was not rehearsed. Storage object contents need separate recovery protection. Any destructive schema reversal/full restore requires separate review and authorization.

Source preimages are in before/. Revert only the two formatter files after verifying their current hashes match SHA256-MANIFEST.json and that no subsequent edits would be overwritten. Preserve all unrelated working-tree changes. Rebuild affected clients before a separately approved publication. No client release exists for this continuation, so no hosted rollback is required.
