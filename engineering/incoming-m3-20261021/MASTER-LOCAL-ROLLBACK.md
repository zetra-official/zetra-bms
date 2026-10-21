# Local review recovery — not a hosted rollback authorization

Implementation checkpoint: `b82f0640` (preceded by `4db62c5d`). All changes are confined to isolated M3 candidates and disposable local PostgreSQL. Root application changes and Production rollback/OTA packages were preserved.

`MASTER-M2-PREIMAGES.zip` contains the exact sealed M2 bytes for candidate paths that existed before M3. Its index identifies new M3-only paths separately. Verify archive and entry hashes against `MASTER-LOCAL-MANIFEST.json` before use. Recover into a separate local review directory; preserve the current candidate, private disposable fixtures, audit rows and evidence. Do not reset Git or overwrite unrelated root work.

The Web/Android exports target the loopback acceptance backend and are not Production artifacts. Returning the local UI to M2 requires its matching local backend. Do not replay a source archive over a hosted application or execute these drafts remotely.

Local SQL dependencies are the sealed M2 draft, then 2026102102 Incoming, 2026102103 Staff, 2026102104 Precision, and 2026102105 unified price. The final draft uses the existing canonical partial receiver; the prototype helper is absent. The new public wrappers can be revoked locally to contain access while a review copy is restored. Preserve private batches, request registry and price audit evidence; do not reverse stock, rewrite costs or delete financial history as a rollback technique.

No hosted migration or rollout happened in this milestone. A Production rollback procedure must be separately reviewed against the future approved hosted package; this local preimage archive does not claim that certification.
