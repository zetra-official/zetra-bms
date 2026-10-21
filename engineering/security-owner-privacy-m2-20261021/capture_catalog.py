"""Hosted catalog-only read; never reads customer rows or executes hosted DDL."""
from pathlib import Path
import subprocess,json,hashlib,datetime
E=Path(__file__).resolve().parent; R=E.parent.parent
CLI=Path(r'C:\Users\ZetraAdmin\AppData\Local\npm-cache\_npx\aa8e5c70f9d8d161\node_modules\@supabase\cli-windows-x64\bin\supabase.exe')
def query(sql):
    assert sql.startswith('BEGIN READ ONLY;') and sql.endswith('ROLLBACK;')
    p=subprocess.run([str(CLI),'db','query','--linked','--project-ref','dcmhqdckzhbuakvcyjit',sql,'-o','json'],capture_output=True,text=True,encoding='utf-8',timeout=120)
    if p.returncode: raise RuntimeError(p.stderr[-1500:])
    return json.loads(p.stdout)['rows']
queries={
 'functions':"SELECT n.nspname schema,p.proname name,p.oid::regprocedure::text identity,pg_get_functiondef(p.oid) definition,p.proacl::text acl,pg_get_userbyid(p.proowner) owner FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE p.prokind='f' AND n.nspname IN ('public','backend_core','stock_funding','funding_control','funding_canonical','funding_evidence','proforma_backend')",
 'policies':"SELECT * FROM pg_policies WHERE schemaname IN ('public','storage')",
 'relations':"SELECT n.nspname schema,c.relname name,c.relkind,c.relrowsecurity,c.relforcerowsecurity,c.relacl::text acl,CASE WHEN c.relkind='v' THEN pg_get_viewdef(c.oid,true) END view_definition FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','storage') AND c.relkind IN ('r','v','m','p')",
 'columns':"SELECT table_schema,table_name,column_name,data_type,udt_name,is_nullable,column_default,numeric_precision,numeric_scale FROM information_schema.columns WHERE table_schema IN ('public','storage')",
 'constraints':"SELECT n.nspname schema,c.relname table_name,k.conname,pg_get_constraintdef(k.oid,true) definition FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','storage')",
 'grants':"SELECT * FROM information_schema.table_privileges WHERE table_schema IN ('public','storage')",
 'column_grants':"SELECT * FROM information_schema.column_privileges WHERE table_schema IN ('public','storage')",
 'triggers':"SELECT n.nspname schema,c.relname table_name,t.tgname,pg_get_triggerdef(t.oid,true) definition FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE NOT t.tgisinternal AND n.nspname IN ('public','storage')"
}
if __name__=='__main__':
    result={}
    for name,sql in queries.items():
        rows=query("BEGIN READ ONLY;SET LOCAL statement_timeout='20s';"+sql+';ROLLBACK;')
        (E/(name+'.private.json')).write_text(json.dumps(rows,ensure_ascii=False,indent=2),encoding='utf-8');result[name]=len(rows)
    status=subprocess.run(['git','status','--porcelain','--untracked-files=no'],capture_output=True,text=True,check=True).stdout
    paths=[line[3:] for line in status.splitlines()]
    hashes={p:hashlib.sha256((R/p).read_bytes()).hexdigest() for p in paths if (R/p).is_file()}
    (E/'BASELINE.json').write_text(json.dumps({'capturedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'head':subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip(),'protectedDirtyFiles':hashes,'catalogCounts':result,'hostedWrites':False,'customerRowsRead':False},indent=2))
    print(json.dumps(result))
