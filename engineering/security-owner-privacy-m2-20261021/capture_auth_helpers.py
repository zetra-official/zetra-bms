import json
from capture_catalog import query,E
rows=query("BEGIN READ ONLY;SELECT p.oid::regprocedure::text identity,pg_get_functiondef(p.oid) definition,p.proacl::text acl FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='auth' AND p.proname IN ('uid','role','jwt') AND p.prokind='f';ROLLBACK;")
(E/'auth-helpers.private.json').write_text(json.dumps(rows,indent=2))
print('Captured '+str(len(rows))+' read-only Auth claim helpers; no auth users or tokens read')
