"""Owner-authorized exact M3 DDL. No customer DML, fixtures or financial postings."""
from pathlib import Path
import json,sys,hashlib,subprocess,datetime
E=Path(__file__).resolve().parent;P=E/'production-20261021';sys.path.insert(0,str(E.parent/'security-owner-privacy-m2-20261021'));from capture_catalog import query
cli=Path(r'C:\Users\ZetraAdmin\AppData\Local\npm-cache\_npx\aa8e5c70f9d8d161\node_modules\@supabase\cli-windows-x64\bin\supabase.exe')
read=lambda n:json.loads((P/n).read_text(encoding='utf-8'));mode=sys.argv[1];manifest=read('RELEASE-MANIFEST.json');sqlmanifest=read('SQL-MANIFEST.json')
def run_file(sql,name):
 path=P/(name+'.private.sql');path.write_text(sql,encoding='utf-8')
 r=subprocess.run([str(cli),'db','query','--linked','--project-ref','dcmhqdckzhbuakvcyjit','--file',str(path),'-o','json'],capture_output=True,text=True,encoding='utf-8',timeout=180)
 (P/(name+'.private.log')).write_text(r.stdout+'\n'+r.stderr,encoding='utf-8');return r
if mode=='apply':
 assert not (P/'SQL-EXECUTION.json').exists(),'Inspect existing execution first'
 assert read('SQL-REHEARSAL.json')['releaseAndRollbackCompile'] and read('WEB-CANDIDATE.json')['status']=='PASS'
 for name,h in sqlmanifest['sql'].items():assert hashlib.sha256((P/name).read_bytes()).hexdigest()==h==manifest['sql']['sql'][name]
 guards=[]
 for f in sqlmanifest['baselineFunctions']:
  ident=f['identity'];guards.append("IF md5(pg_get_functiondef('public."+ident+"'::regprocedure)) IS DISTINCT FROM '"+f['md5']+"' THEN RAISE EXCEPTION 'BASELINE_DRIFT'; END IF;")
 guards.append("IF EXISTS(SELECT 1 FROM pg_namespace WHERE nspname IN ('security_m2','incoming_m3')) THEN RAISE EXCEPTION 'RELEASE_NAMESPACE_EXISTS'; END IF;")
 sql=(P/'RELEASE.sql').read_text(encoding='utf-8');sql=sql.replace('BEGIN;','BEGIN;\nDO $precondition$ BEGIN\n'+'\n'.join(guards)+'\nEND $precondition$;\n',1)
 r=run_file(sql,'sql-apply');out={'status':'SUCCESS' if r.returncode==0 else 'FAILED','at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'release':manifest['release'],'releaseSHA256':sqlmanifest['sql']['RELEASE.sql'],'customerFinancialPostings':False,'exitCode':r.returncode}
 (P/'SQL-EXECUTION.json').write_text(json.dumps(out,indent=2),encoding='utf-8');print(json.dumps(out));assert r.returncode==0,'See private SQL diagnostic; no automatic retry'
elif mode=='verify':
 expected=read('EXPECTED-FUNCTIONS.json');ids=[f['identity'] for f in expected]
 rows=query("BEGIN READ ONLY;SET LOCAL statement_timeout='20s';SELECT p.oid::regprocedure::text identity,md5(pg_get_functiondef(p.oid)) md5,p.proacl::text acl FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE p.oid::regprocedure::text IN ("+','.join("'"+s+"'" for s in ids)+");ROLLBACK;")
 actual={x['identity']:x for x in rows};assert all(actual.get(x['identity'])==x for x in expected),'Installed definition/ACL drift'
 baseline=sqlmanifest['baselineFunctions'];existing={x['identity']:x for x in baseline}
 assert all(actual[x['identity']]['acl']==x['acl'] for x in baseline if x['identity'] in actual),'Legacy ACL changed'
 upsert=next(x for x in baseline if x['identity'].startswith('upsert_product('));rows=query("BEGIN READ ONLY;SELECT md5(pg_get_functiondef('public."+upsert['identity']+"'::regprocedure)) md5;ROLLBACK;");assert rows[0]['md5']==upsert['md5'],'Canonical Products changed'
 out={'status':'PASS','installedFunctionDefinitionsAndACLs':len(expected),'existingProductsWriterUnchanged':True,'customerFinancialWrites':False};(P/'SQL-VERIFIED.json').write_text(json.dumps(out,indent=2),encoding='utf-8');print(json.dumps(out))
elif mode=='rollback':
 assert read('SQL-EXECUTION.json')['status']=='SUCCESS';sql=(P/'ROLLBACK.sql').read_text(encoding='utf-8');assert hashlib.sha256(sql.encode()).hexdigest()==sqlmanifest['sql']['ROLLBACK.sql'];r=run_file(sql,'sql-rollback');assert r.returncode==0
 (P/'SQL-ROLLBACK.json').write_text(json.dumps({'status':'SUCCESS','customerDataReversed':False}),encoding='utf-8');print('SQL rollback SUCCESS; private posting evidence preserved')
else:raise SystemExit('unsupported mode')
