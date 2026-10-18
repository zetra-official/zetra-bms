# Local rollback
No remote rollback required: nothing was deployed or migrated remotely.
SHA256-MANIFEST.json identifies every current source postimage and preserved before image. Before restoring a file, verify its current hash still equals the recorded postimage. If newer changes exist, perform a manual targeted inverse diff; NEVER overwrite newer work, git reset or restore the whole repository.
Restore only the listed existing files from before/<same path>; remove only the listed new source files if unreferenced by newer work. Keep engineering evidence and downloaded public source snapshots. ATOMIC-ONBOARDING.DRAFT.sql was never applied outside the automatically stopped temporary local PostgreSQL cluster. Do not run it as a rollback or deployment script.
Previous profile release and other accepted work remain separate and untouched by this task.
