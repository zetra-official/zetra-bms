import json,hashlib,sys
sys.dont_write_bytecode=True
import local_runtime as l
E=l.E;checks=[]
def check(n,b):checks.append({'name':n,'status':'PASS' if b else 'FAIL'});assert b,n
def fingerprint():
 return l.db.sql("SELECT md5(string_agg(s,'' ORDER BY s)) FROM (SELECT pg_get_functiondef(p.oid)||coalesce(p.proacl::text,'') s FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE p.prokind='f' AND n.nspname IN ('public','security_m2','stock_funding','funding_control','funding_canonical','funding_evidence') UNION ALL SELECT c.oid::text||c.relrowsecurity::text||coalesce(c.relacl::text,'') FROM pg_class c WHERE c.relnamespace='public'::regnamespace UNION ALL SELECT p.polname||pg_get_expr(p.polqual,p.polrelid)||coalesce(pg_get_expr(p.polwithcheck,p.polrelid),'') FROM pg_policy p) x")[1]
try:
 l.start();before=fingerprint()
 s=(E/'2026102101-owner-privacy.DRAFT.sql').read_text(encoding='utf-8')
 injected=s.replace('COMMIT;',"CREATE TABLE security_m2.synthetic_rollback_marker(id int);GRANT SELECT ON public._backup_inventory_before_fix_stock_root TO anon;DO $$ BEGIN RAISE EXCEPTION 'M2_SYNTHETIC_FINAL_FAILURE'; END $$;COMMIT;")
 r=l.db.sql(injected,False)
 check('injected failure occurs after all draft DDL',r[0]!=0 and 'M2_SYNTHETIC_FINAL_FAILURE' in r[2])
 check('late failure rolls back exact effective catalog state',before==fingerprint())
 check('temporary rollback marker absent',l.db.sql("SELECT to_regclass('security_m2.synthetic_rollback_marker') IS NULL")[1]=='t')
 check('anonymous backup access remains denied after failed DDL',l.db.sql("SELECT NOT has_table_privilege('anon','public._backup_inventory_before_fix_stock_root','SELECT')")[1]=='t')
 # The patch never changes a funding schema, source account or canonical financial body.
 check('no funding-adapter DDL targets in draft',all(x not in s.lower() for x in ['alter function funding_','create or replace function funding_','create or replace function stock_funding.','update funding_','insert into funding_']))
 rows=json.loads(l.db.sql("SELECT coalesce(json_agg(json_build_object('schema',n.nspname,'name',p.proname,'definition',pg_get_functiondef(p.oid))),'[]') FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE p.prokind='f' AND n.nspname IN ('stock_funding','funding_control','funding_canonical','funding_evidence')")[1])
 (E/'local-funding-definitions.private.json').write_text(json.dumps(rows,indent=2),encoding='utf-8')
 live=json.loads((E/'functions.private.json').read_text(encoding='utf-8'))
 boundaries=[('stock_funding','consume_receipt','RECEIPT_ADAPTER_NOT_BOUND'),('funding_control','source_ready','SELECT false'),('funding_canonical','custody_event','CUSTODY_WRITE_CONTRACT_NOT_BOUND'),('funding_evidence','writer_bound','SELECT false'),('funding_evidence','wallet_writers_bound','SELECT false'),('funding_evidence','apply_return','CANONICAL_RETURN_NOT_ACTIVATED')]
 for schema,name,deny in boundaries:
  definition='\n'.join(x['definition'] for x in live if x['schema']==schema and x['name']==name)
  check(schema+'.'+name+' captured live safety boundary remains outside draft',deny in definition and 'CREATE OR REPLACE FUNCTION '+schema+'.'+name not in s)
 # Effective privileges are evidence, not merely policy names.
 q="SELECT json_build_object('backupAnonSelect',has_table_privilege('anon','public._backup_inventory_before_fix_stock_root','SELECT'),'backupAuthSelect',has_table_privilege('authenticated','public._backup_inventory_before_fix_stock_root','SELECT'),'inventoryAuthUpdate',has_table_privilege('authenticated','public.inventory','UPDATE'),'movementsAuthInsert',has_table_privilege('authenticated','public.stock_movements','INSERT'),'productCostAuthSelect',has_column_privilege('authenticated','public.products','cost_price','SELECT'),'productSellingAuthSelect',has_column_privilege('authenticated','public.products','selling_price','SELECT'),'saleCogsAuthSelect',has_column_privilege('authenticated','public.sale_items','unit_cost','SELECT'),'stockInAnonExecute',has_function_privilege('anon','public.get_stock_in_items_v2(uuid,uuid,date,date,boolean)','EXECUTE'))"
 grants=json.loads(l.db.sql(q)[1]);(E/'EFFECTIVE-PRIVILEGES.json').write_text(json.dumps(grants,indent=2))
 check('effective grants match intended Owner-cost and operational separation',grants=={'backupAnonSelect':False,'backupAuthSelect':False,'inventoryAuthUpdate':False,'movementsAuthInsert':False,'productCostAuthSelect':False,'productSellingAuthSelect':True,'saleCogsAuthSelect':False,'stockInAnonExecute':False})
finally:
 (E/'ATOMICITY-RESULTS.json').write_text(json.dumps({'sqlSHA256':hashlib.sha256((E/'2026102101-owner-privacy.DRAFT.sql').read_bytes()).hexdigest(),'checks':checks,'localOnly':True,'hostedWrites':False},indent=2));l.stop()
print('PASS '+str(len(checks))+' atomic DDL, effective privilege and funding-boundary checks')
