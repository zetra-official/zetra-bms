# Currency UI refinement production execution

**ROLLOUT STOPPED — WEB ROLLED BACK.** Owner approval bound to checkpoint c2c390dc and package SHA256 9df2e2ba8b8ed0d6414f06d6990fa32f7fd8a32244c7219460e8253a332f6627.

Exact package, both artifacts, source archives, current channels, runtime1.0.0 and rollback artifacts passed preflight. No rebuild or mixed working-tree source was published. Candidate Web deployment `6ad7a771217ce218428b0c64` was published successfully. Hosted HTML/bundle hashes, routes, live BoT/ECB feeds, decimal calculations and 4-day/24-hour freshness rejection passed.

Actual authenticated candidate UI did not pass. After reloading the newly published bundle `entry-be3dfa2fe1488e3e500f092bd606817c.js`, `/sales/` remained at “Loading your workspace…”; subsequent Home navigation and browser observation timed out. No JavaScript error was returned. Root cause is not established; do not treat browser timeouts alone as proof of a particular source defect. Earlier conversion observations came from an already-open prior-release bundle and are explicitly excluded from candidate acceptance.

Per Owner instructions, rollout stopped and Web was restored to ready deployment `6ad76cf47622bc0a29e1244f`. Fresh authenticated Production Dashboard rendered successfully after rollback; original display preference was restored. No sale, payment, inventory or financial posting was executed; no SQL, activation or unrelated source was published. Checkout/Catalog protections passed the approved source seal, but new candidate end-to-end UI acceptance remains incomplete.

Android OTA was NOT PUBLISHED because the Web gate failed. Existing production runtime1.0.0 remains on update `01a1592b-2ee1-7ed9-ac55-fb2b9185776c`, group `6f0e3704-2774-44c8-afc5-34216997c808`. Physical Android/iPhone candidate verification: NOT TESTED.

Next execution: reproduce and diagnose the authenticated cold-load failure in the isolated candidate, retain the exact failed package/evidence, and prepare a scoped correction before any new publication. No further deployment performed in this execution.

[Production](https://app.zetra.tz/)
