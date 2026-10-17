BEGIN READ ONLY;
SET LOCAL search_path=pg_catalog;
SET LOCAL statement_timeout='15s';
SELECT jsonb_build_object('version','2026101705','readOnly',current_setting('transaction_read_only'),
 'status',CASE WHEN r.version IS NOT NULL AND p.prosecdef AND p.proconfig=ARRAY['search_path=pg_catalog']
 AND has_function_privilege('authenticated',p.oid,'EXECUTE')
 AND NOT has_function_privilege('anon',p.oid,'EXECUTE') AND NOT has_function_privilege('service_role',p.oid,'EXECUTE')
 AND r.body_sha256=encode(sha256(convert_to(replace(pg_get_functiondef(p.oid),E'\r',''),'UTF8')),'hex')
 THEN 'COMMITTED_QUOTE_ONLY_API_PASS' ELSE 'NOT_VERIFIED' END,'transaction',r.committed_transaction,'financialPosting',false)
FROM (SELECT 1) anchor LEFT JOIN backend_core.release_receipts r ON r.version='2026101705'
LEFT JOIN pg_proc p ON p.oid=to_regprocedure('public.proforma_document_fx_v1(uuid,uuid,uuid,uuid,integer,jsonb)');
ROLLBACK;
