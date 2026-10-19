from pathlib import Path
import importlib.util,json,datetime,hashlib
R=Path.cwd();E=Path(__file__).resolve().parent
s=importlib.util.spec_from_file_location('readonly_runtime',R/'engineering/global-currency-final-20261019/controls/common.py');c=importlib.util.module_from_spec(s);s.loader.exec_module(c);c.E=E
assert (R/'supabase/.temp/project-ref').read_text().strip()==c.REF=='dcmhqdckzhbuakvcyjit'
q=E/'PRODUCTION-SETTLEMENT-METADATA-ONLY.sql'
q.write_text("""BEGIN READ ONLY; SET LOCAL statement_timeout='20s'; SET LOCAL lock_timeout='2s';
SELECT jsonb_build_object('capture','SETTLEMENT_AUTHORITY_METADATA_ONLY','database',current_database(),'readOnly',current_setting('transaction_read_only'),
'functions',(SELECT coalesce(jsonb_agg(jsonb_build_object('identity',p.oid::regprocedure::text,'definition',pg_get_functiondef(p.oid),'owner',pg_get_userbyid(p.proowner),'acl',p.proacl,'securityDefiner',p.prosecdef)), '[]') FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE p.prokind='f' AND n.nspname IN ('public','backend_core','funding_control') AND p.proname ~* '(cashier|settle|refund|reversal|supplier.*pay|pay.*supplier|treasury|cash.*movement|cash.*account|bank.*account|mobile.*account|receive_inbound|credit.*repay|repay.*credit|create_sale|source_ready)'),
'columns',(SELECT coalesce(jsonb_agg(jsonb_build_object('schema',table_schema,'table',table_name,'column',column_name,'type',data_type,'nullable',is_nullable)), '[]') FROM information_schema.columns WHERE table_schema IN ('public','funding_control','backend_core') AND table_name ~* '(account|payment|cashier|shift|movement|wallet|settle|refund|tax|debt|credit|inbound_stock)'),
'policies',(SELECT coalesce(jsonb_agg(jsonb_build_object('schema',schemaname,'table',tablename,'name',policyname,'roles',roles,'command',cmd,'using',qual,'check',with_check)),'[]') FROM pg_policies WHERE schemaname IN ('public','funding_control') AND tablename ~* '(account|payment|cashier|shift|movement|wallet|settle|refund|tax|debt|credit)'),
'tables',(SELECT coalesce(jsonb_agg(jsonb_build_object('schema',n.nspname,'table',t.relname,'rls',t.relrowsecurity,'forceRls',t.relforcerowsecurity,'acl',t.relacl)), '[]') FROM pg_class t JOIN pg_namespace n ON n.oid=t.relnamespace WHERE t.relkind='r' AND n.nspname IN ('public','funding_control','backend_core') AND t.relname ~* '(account|payment|cashier|shift|movement|wallet|settle|refund|tax|debt|credit)')) metadata;
ROLLBACK;""",encoding='utf-8')
sql=q.read_text(encoding='utf-8').replace("credit.*repay|repay.*credit|create_sale|source_ready)","credit.*repay|repay|record.*payment|field_wallet|expense|tax|create_sale|source_ready)")
q.write_text(sql,encoding='utf-8')
v=c.query('production-settlement-catalog',q);assert v['readOnly']=='on' and v['capture']=='SETTLEMENT_AUTHORITY_METADATA_ONLY'
summary={'project':c.REF,'capturedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'readOnly':True,'customerRowsRead':False,'querySha256':hashlib.sha256(q.read_bytes()).hexdigest(),'functions':[{'identity':x['identity'],'sha256':hashlib.sha256(x['definition'].encode()).hexdigest()} for x in v['functions']],'tables':sorted(set(x['schema']+'.'+x['table'] for x in v['tables'])),'productionWrites':False}
(E/'PRODUCTION-SETTLEMENT-CAPTURE.json').write_text(json.dumps(summary,indent=2),encoding='utf-8');print(json.dumps({'readOnly':True,'functions':len(summary['functions']),'tables':len(summary['tables']),'customerRowsRead':False}))
