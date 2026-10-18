-- READ ONLY dependency gates; no customer records read. Exact target must be
-- independently pinned by a future approved runner. No live execution authorized.
BEGIN READ ONLY;
SET LOCAL statement_timeout='10s';
DO $gate$ BEGIN
IF current_database()<>'postgres' THEN RAISE EXCEPTION 'WRONG_DATABASE';END IF;
IF has_schema_privilege('authenticated','public','CREATE') OR has_schema_privilege('anon','public','CREATE') THEN RAISE EXCEPTION 'UNTRUSTED_PUBLIC_SCHEMA_CREATE';END IF;
IF md5(replace(pg_get_functiondef('owner_confirm_org_accounting_currency_v1(uuid,uuid,text,text,text,boolean,text)'::regprocedure),chr(13),''))<>'180028cb985d37c41c4214d306b09cbd' THEN RAISE EXCEPTION 'DEPENDENCY_BASELINE_CHANGED: owner_confirm_org_accounting_currency_v1(uuid,uuid,text,text,text,boolean,text)';END IF;
IF md5(replace(pg_get_functiondef('backend_core.active_subject()'::regprocedure),chr(13),''))<>'23be7ab7c04f05d103a18787fe24681a' THEN RAISE EXCEPTION 'DEPENDENCY_BASELINE_CHANGED: backend_core.active_subject()';END IF;
IF md5(replace(pg_get_functiondef('backend_core.accounting_currency(uuid)'::regprocedure),chr(13),''))<>'92fbfd934a67bd80745681d82297bb51' THEN RAISE EXCEPTION 'DEPENDENCY_BASELINE_CHANGED: backend_core.accounting_currency(uuid)';END IF;
IF md5(replace(pg_get_functiondef('proforma_backend.owner_currency_command(uuid,uuid,text,text,text,boolean,text)'::regprocedure),chr(13),''))<>'4ef90dd2bb7f1986e18c32d840e16469' THEN RAISE EXCEPTION 'DEPENDENCY_BASELINE_CHANGED: proforma_backend.owner_currency_command(uuid,uuid,text,text,text,boolean,text)';END IF;
IF md5(replace(pg_get_functiondef('create_org_with_store(text,text)'::regprocedure),chr(13),''))<>'4883dcef2455a74f1938f4bebb03558e' THEN RAISE EXCEPTION 'DEPENDENCY_BASELINE_CHANGED: create_org_with_store(text,text)';END IF;
IF md5(replace(pg_get_functiondef('set_org_timezone_once(uuid,text)'::regprocedure),chr(13),''))<>'316f03560ca06d1af03cee6313dd6c2f' THEN RAISE EXCEPTION 'DEPENDENCY_BASELINE_CHANGED: set_org_timezone_once(uuid,text)';END IF;
END $gate$;
SELECT 'DEPENDENCY_GATES_PASS';
ROLLBACK;
