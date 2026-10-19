from pathlib import Path
import re,hashlib,json
E=Path(__file__).resolve().parent
base=(E/'1912-cashier-bindings.sql').read_text()
coverage=re.search(r'CREATE FUNCTION backend_core\.bound_shift_coverage_v1.*?END \$\$;',base,re.S).group(0)
old='SELECT count(*) INTO n FROM public.field_wallet_transactions p WHERE p.store_id=s.store_id AND p.created_at>=s.opened_at AND p.created_at<=last_time;'
new=old[:-1]+" AND NOT EXISTS(SELECT 1 FROM backend_core.field_custody_links l WHERE l.wallet_transaction_id=p.id);"
assert coverage.count(old)==1
coverage=coverage.replace('CREATE FUNCTION','CREATE OR REPLACE FUNCTION',1).replace(old,new)
sql="BEGIN;SET LOCAL lock_timeout='3s';SET LOCAL statement_timeout='45s';\nDO $$BEGIN IF to_regclass('backend_core.field_custody_links') IS NULL OR to_regprocedure('public.refund_original_sale_v1(uuid,uuid,uuid,uuid,numeric,boolean,uuid,jsonb)') IS NULL THEN RAISE EXCEPTION '1914_1915_REQUIRED';END IF;END$$;\n"
preimage=json.loads((E/'1916-DEPENDENCY-PREIMAGE.json').read_text())
sql+="DO $$BEGIN IF md5(replace(pg_get_functiondef('"+preimage['identity']+"'::regprocedure),chr(13),''))<>'"+preimage['md5']+"' THEN RAISE EXCEPTION '1916_COVERAGE_PREIMAGE_MISMATCH';END IF;END$$;\n"
sql+=(E/'1916-original-workflow-readers.sql').read_text()+'\n'+coverage+'\nCOMMIT;\n'
(E/'2026101916-original-workflow-readers.DRAFT.sql').write_text(sql)
(E/'1916-DISABLE.sql').write_text("BEGIN;DO $$DECLARE p record;r record;BEGIN FOR p IN SELECT oid,proowner FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN('get_original_refund_sale_v1','get_bound_field_custody_v1') LOOP EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC',p.oid::regprocedure);FOR r IN SELECT DISTINCT pg_get_userbyid(a.grantee) name FROM pg_proc f CROSS JOIN LATERAL aclexplode(coalesce(f.proacl,acldefault('f',f.proowner))) a WHERE f.oid=p.oid AND a.grantee<>0 AND a.grantee<>p.proowner LOOP EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %I',p.oid::regprocedure,r.name);END LOOP;END LOOP;END$$;COMMIT;\n")
print('1916 workflow readers and canonical custody coverage generated; no grants')
