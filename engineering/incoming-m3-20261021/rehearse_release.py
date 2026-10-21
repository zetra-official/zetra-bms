from pathlib import Path
import json,sys,re
E=Path(__file__).resolve().parent;P=E/'production-20261021';sys.path.insert(0,str(E.parent/'security-owner-privacy-m2-20261021'));import local_runtime as l
l.db.E=E;l.db.CLUSTER=E/'disposable';l.db.PORT=json.loads((E/'db.private.json').read_text())['port']
assert Path(l.db.sql("SELECT current_setting('data_directory')")[1].strip()).resolve()==(E/'disposable').resolve()
base=json.loads((P/'dependencies.private.json').read_text(encoding='utf-8'))
fingerprint="SELECT md5(string_agg(pg_get_functiondef(p.oid),'' ORDER BY p.oid)) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('public','incoming_m3','security_m2') AND p.prokind='f'"
before=l.db.sql(fingerprint)[1]
drop="""DO $clean$ DECLARE r record; BEGIN FOR r IN SELECT p.oid::regprocedure ident FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname LIKE 'm3_%' LOOP EXECUTE format('DROP FUNCTION %s CASCADE',r.ident); END LOOP; END $clean$;
DROP SCHEMA incoming_m3 CASCADE;
"""
body=(P/'RELEASE.sql').read_text(encoding='utf-8').removeprefix('BEGIN;').rsplit('COMMIT;',1)[0]
rollback=(P/'ROLLBACK.sql').read_text(encoding='utf-8').removeprefix('BEGIN;').rsplit('COMMIT;',1)[0]
restore='\n'.join(x['definition']+';' for x in base['functions'])
verify="""DO $checks$ BEGIN
IF has_schema_privilege('authenticated','incoming_m3','USAGE') OR has_schema_privilege('anon','incoming_m3','USAGE') THEN RAISE EXCEPTION 'PRIVATE_SCHEMA_EXPOSED'; END IF;
IF has_function_privilege('anon','public.m3_submit_incoming_v1(uuid,uuid,uuid,jsonb)','EXECUTE') OR NOT has_function_privilege('authenticated','public.m3_submit_incoming_v1(uuid,uuid,uuid,jsonb)','EXECUTE') THEN RAISE EXCEPTION 'RPC_ACL_INVALID'; END IF;
IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid='incoming_m3.batches'::regclass) THEN RAISE EXCEPTION 'RLS_REQUIRED'; END IF;
END $checks$;
"""
catalog="SELECT jsonb_agg(jsonb_build_object('identity',p.oid::regprocedure::text,'md5',md5(pg_get_functiondef(p.oid)),'acl',p.proacl::text) ORDER BY p.oid::regprocedure::text) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('incoming_m3','security_m2') AND p.proname IN ('owner_of','store_allowed','require_owner','require_store') OR n.nspname='public' AND p.proname IN ('m3_incoming_catalog_v1','m3_incoming_receipt_v1','m3_submit_incoming_v1','m3_saved_order_context_v1','m3_receive_saved_v1','m3_staff_operational_v1','adjust_stock','receive_inbound_stock_partial_v1','create_stock_movement_notification','create_notification_from_stock_movement')"
q='BEGIN;\n'+drop+restore+'\n'+body+'\n'+verify+'\n'+catalog+';\n'+rollback+'\nROLLBACK;'
r=l.db.sql(q,False);(P/'rehearsal.private.log').write_text(r[1]+'\n'+r[2],encoding='utf-8')
after=l.db.sql(fingerprint)[1]
if r[0]==0:
 expected=json.loads(next(line for line in r[1].splitlines() if line.startswith('[{')))
 for entry in expected:
  original=next((f for f in base['functions'] if f['identity']==entry['identity']),None)
  if original:entry['acl']=original['acl']
 (P/'EXPECTED-FUNCTIONS.json').write_text(json.dumps(expected,indent=2),encoding='utf-8')
out={'localOnly':True,'releaseAndRollbackCompile':r[0]==0,'privateSchemaAndRPCPermissions':r[0]==0,'existingFunctionsUnchangedAfterRehearsal':before==after,'productionWrites':False}
(P/'SQL-REHEARSAL.json').write_text(json.dumps(out,indent=2),encoding='utf-8');print(json.dumps(out));assert r[0]==0,r[2][-2000:];assert before==after
