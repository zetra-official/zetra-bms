import json
from capture_catalog import query,E
rows=query("BEGIN READ ONLY;SELECT nspname,nspacl::text acl FROM pg_namespace WHERE nspname IN ('public','auth','storage');ROLLBACK;")
(E/'schema-acls.private.json').write_text(json.dumps(rows,indent=2))
print(json.dumps(rows))
