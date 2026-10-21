from pathlib import Path
import json,re,hashlib
E=Path(__file__).resolve().parent;P=E/'production-20261021'
baseline=json.loads((P/'dependencies.private.json').read_text(encoding='utf-8'))
m2=(E.parent/'security-owner-privacy-m2-20261021/2026102101-owner-privacy.DRAFT.sql').read_text(encoding='utf-8')
helpers=m2[m2.index('CREATE OR REPLACE FUNCTION security_m2.owner_of'):m2.index('CREATE OR REPLACE FUNCTION security_m2.inbound_integrity')]
parts=['BEGIN;\nSET LOCAL lock_timeout=\'5s\';\nSET LOCAL statement_timeout=\'60s\';\nCREATE SCHEMA IF NOT EXISTS security_m2;\nREVOKE ALL ON SCHEMA security_m2 FROM PUBLIC,anon,authenticated;\n'+helpers+'\nREVOKE ALL ON ALL FUNCTIONS IN SCHEMA security_m2 FROM PUBLIC,anon,authenticated;']
for name in ['2026102102-incoming-m3.DRAFT.sql','2026102103-staff-operational.DRAFT.sql','2026102104-precision-price.DRAFT.sql','2026102105-unified-price.DRAFT.sql','2026102106-products-price-compatibility.sql']:
 text=(E/name).read_text(encoding='utf-8');text=re.sub(r'(?m)^BEGIN;\s*$|^COMMIT;\s*$|^NOTIFY pgrst,.*$','',text)
 parts.append('-- Approved Combined M3 component: '+name+'\n'+text)
parts.append("NOTIFY pgrst,'reload schema';\nCOMMIT;\n")
sql='\n'.join(parts)
assert 'CREATE OR REPLACE FUNCTION public.upsert_product' not in sql
(P/'RELEASE.sql').write_text(sql,encoding='utf-8')
restore=['BEGIN;\nSET LOCAL lock_timeout=\'5s\';\nSET LOCAL statement_timeout=\'60s\';\nDROP TRIGGER IF EXISTS m3_unified_selling_price ON public.products;']
changed=['adjust_stock','receive_inbound_stock_partial_v1','create_stock_movement_notification','create_notification_from_stock_movement']
restore += [x['definition']+';' for x in baseline['functions'] if x['identity'].split('(')[0] in changed]
restore.append('''DO $rollback$ DECLARE r record; BEGIN
 FOR r IN SELECT p.oid::regprocedure ident FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('m3_incoming_catalog_v1','m3_incoming_receipt_v1','m3_submit_incoming_v1','m3_receive_saved_v1','m3_saved_order_context_v1','m3_staff_operational_v1') LOOP
 EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',r.ident); END LOOP;
END $rollback$;
-- Keep private audit/batch evidence and helper dependencies. Never undo receipts,
-- completed sales, inventory movements, current customer prices or balances.
NOTIFY pgrst,'reload schema';
COMMIT;''')
(P/'ROLLBACK.sql').write_text('\n'.join(restore),encoding='utf-8')
manifest={'baselineFunctions':[{k:x[k] for k in ['identity','md5','acl']} for x in baseline['functions']], 'sql':{n:hashlib.sha256((P/n).read_bytes()).hexdigest() for n in ['RELEASE.sql','ROLLBACK.sql']},'customerDataRewrite':False,'broadM2Deployment':False,'existingProductsWriterReplaced':False,'rollbackPreservesPostedEvidence':True}
(P/'SQL-MANIFEST.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
print('Scoped release and evidence-preserving rollback composed; not executed hosted')
