"""Independent read-only metadata verification of the completed local synthetic rehearsal."""
from pathlib import Path
import sys,socket,json
sys.dont_write_bytecode=True;sys.path.insert(0,str(Path(__file__).parent));import test_local as t
base=t.BASE/'main-project-release/proforma-normal';cluster=max((p for p in base.glob('conversion-*') if p.is_dir() and not(p/'postmaster.pid').exists()),key=lambda p:p.stat().st_ctime)
with socket.socket() as s:s.bind(('127.0.0.1',0));t.PORT=s.getsockname()[1]
query="""BEGIN READ ONLY; SET LOCAL statement_timeout='15s';
SELECT jsonb_build_object('readOnly',current_setting('transaction_read_only'),
 'functions',(SELECT jsonb_agg(jsonb_build_object('identity',p.oid::regprocedure::text,'digest',md5(replace(pg_get_functiondef(p.oid),E'\\r','')),'definer',p.prosecdef,'config',p.proconfig,'authenticated',has_function_privilege('authenticated',p.oid,'EXECUTE'),'anon',has_function_privilege('anon',p.oid,'EXECUTE'),'serviceRole',has_function_privilege('service_role',p.oid,'EXECUTE'))) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('proforma_conversion_preview_v1','proforma_conversion_commit_v1')),
 'privateRls',(SELECT relrowsecurity AND relforcerowsecurity AND NOT has_table_privilege('authenticated',oid,'SELECT,INSERT,UPDATE,DELETE') AND NOT has_table_privilege('anon',oid,'SELECT,INSERT,UPDATE,DELETE') FROM pg_class WHERE oid='proforma_backend.sale_links'::regclass),
 'uniqueKeys',(SELECT count(*) FROM pg_constraint WHERE conrelid='proforma_backend.sale_links'::regclass AND contype IN ('p','u')),
 'immutableAudit',EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='proforma_backend.sale_links'::regclass AND tgname='immutable_sale_links' AND tgenabled='O'),
 'linkMismatches',(SELECT count(*) FROM proforma_backend.sale_links l LEFT JOIN public.sales s ON s.id=l.sale_id LEFT JOIN proforma_backend.documents d ON d.id=l.document_id WHERE s.id IS NULL OR s.organization_id<>l.organization_id OR s.store_id<>l.store_id OR d.sale_id IS DISTINCT FROM l.sale_id OR d.status<>'CONVERTED'));
ROLLBACK;"""
try:
 r=t.pg.tool('pg_ctl',['-D',str(cluster),'-l',str(cluster.with_suffix('.verify.log')),'-o',f'-h 127.0.0.1 -p {t.PORT} -c archive_mode=off -c shared_preload_libraries=','-w','start']);assert r.returncode==0
 data=json.loads(t.read(query));assert data['readOnly']=='on' and data['privateRls'] and data['uniqueKeys']==3 and data['immutableAudit'] and data['linkMismatches']==0
 assert len(data['functions'])==2 and all(f['definer'] and f['config']==['search_path=pg_catalog'] and f['authenticated'] and not f['anon'] and not f['serviceRole'] for f in data['functions'])
 data['status']='PASS';data['scope']='Independent local PostgreSQL read-only metadata; no Production/Staging access'
 (t.ROOT/'engineering/release/proforma-conversion/local-independent-verification.json').write_text(json.dumps(data,indent=2));print('Independent read-only metadata, function identity, RLS, grants and linkage: PASS')
finally:t.pg.tool('pg_ctl',['-D',str(cluster),'-m','fast','-w','stop'])
