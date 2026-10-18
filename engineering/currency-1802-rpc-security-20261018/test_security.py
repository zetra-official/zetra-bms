from pathlib import Path
import sys,json,hashlib
sys.dont_write_bytecode=True
sys.path.insert(0,str(Path('engineering/currency-onboarding-20261018').resolve()))
import local as l
E=Path('engineering/currency-1802-rpc-security-20261018').resolve();l.E=E;l.CLUSTER=E/'disposable';checks=[]
M=E/'2026101802-atomic-currency-onboarding-QUARANTINED.DRAFT.sql';S=M.read_text()
F="public.create_org_with_store_currency_v1(uuid,text,text,text,text,boolean)"
def read(q):return l.sql(q)[1]
def check(n,b):
 assert b,n
 checks.append(n)
def fp():return read("SELECT md5(coalesce(string_agg(x.s,'' ORDER BY x.s),'')) FROM ("+" UNION ALL ".join("SELECT to_jsonb(t)::text s FROM "+t+" t" for t in ['public.organizations','public.stores','public.org_memberships','public.sales','public.sale_items','public.sale_payments','public.inventory','public.stock_movements','proforma_backend.accounting_currency'])+") x")
try:
 l.PORT=l.start();check('loopback disposable identity',Path(read("SELECT current_setting('data_directory')")).resolve()==l.CLUSTER.resolve())
 check('verified full public schema',read("SELECT count(*) FROM pg_tables WHERE schemaname='public'")=='124')
 l.sql('DROP FUNCTION IF EXISTS '+F+';DROP TABLE IF EXISTS backend_core.currency_onboarding_requests;')
 before=fp();baseline=read("SELECT md5(string_agg(pg_get_functiondef(p.oid)||coalesce(p.proacl::text,''),'' ORDER BY p.oid)) FROM pg_proc p WHERE p.prokind='f'")
 # Deliberately hostile default ACL and role inheritance; only local synthetic roles.
 l.sql("CREATE ROLE synthetic_parent;CREATE ROLE synthetic_child INHERIT;GRANT synthetic_parent TO synthetic_child;ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO synthetic_parent;")
 l.sql(S)
 for role in ['anon','authenticated','service_role','synthetic_parent','synthetic_child']:
  check(role+' effective execute denied',read("SELECT has_function_privilege('"+role+"','"+F+"','EXECUTE')")=='f')
  r=l.sql("SET ROLE "+role+";SELECT public.create_org_with_store_currency_v1('11111111-1111-4111-8111-111111111111','X','S');",False)
  check(role+' actual direct invocation denied',r[0]!=0 and 'permission denied' in r[2])
 check('PUBLIC no execute grant',read("SELECT count(*) FROM pg_proc p CROSS JOIN LATERAL aclexplode(p.proacl) a WHERE p.oid='"+F+"'::regprocedure AND a.grantee=0")=='0')
 check('only owner explicit ACL',read("SELECT count(*) FROM pg_proc p CROSS JOIN LATERAL aclexplode(p.proacl) a WHERE p.oid='"+F+"'::regprocedure AND a.grantee<>p.proowner")=='0')
 check('owner is postgres fixed definer path',read("SELECT prosecdef AND proowner='postgres'::regrole AND proconfig=ARRAY['search_path=pg_catalog'] FROM pg_proc WHERE oid='"+F+"'::regprocedure")=='t')
 check('no unauthorized role escalation',l.sql('SET SESSION AUTHORIZATION authenticated;SET ROLE postgres;',False)[0]!=0)
 check('cannot grant own execute',l.sql('SET SESSION AUTHORIZATION authenticated;GRANT EXECUTE ON FUNCTION '+F+' TO authenticated;',False)[0]!=0)
 check('request RLS forced',read("SELECT relrowsecurity AND relforcerowsecurity FROM pg_class WHERE oid='backend_core.currency_onboarding_requests'::regclass")=='t')
 check('request access denied',l.sql('SET ROLE authenticated;SELECT * FROM backend_core.currency_onboarding_requests;',False)[0]!=0)
 check('no business or financial data changed',fp()==before)
 # Original functions/ACL retained, excluding only new function (default privileges changed no old ACLs).
 check('existing onboarding Owner and isolation contracts unchanged',read("SELECT md5(string_agg(pg_get_functiondef(p.oid)||coalesce(p.proacl::text,''),'' ORDER BY p.oid)) FROM pg_proc p WHERE p.prokind='f' AND p.oid<>'"+F+"'::regprocedure")==baseline)
 check('no alternate static wrapper reference',read("SELECT count(*) FROM pg_proc p WHERE p.prokind='f' AND p.oid<>'"+F+"'::regprocedure AND pg_get_functiondef(p.oid) LIKE '%create_org_with_store_currency_v1%'")=='0')
 check('frontend remains disabled', 'ATOMIC_CURRENCY_ONBOARDING_ACTIVE=false' in Path('src/currency/onboarding.ts').read_text())
 # Entire migration rolled back on injected final failure, not a partial DDL commit.
 l.sql('DROP FUNCTION '+F+';DROP TABLE backend_core.currency_onboarding_requests;')
 r=l.sql(S.replace('COMMIT;',"DO $$BEGIN RAISE EXCEPTION 'SYNTHETIC_FAILURE';END$$;COMMIT;"),False)
 check('injected failure',r[0]!=0 and 'SYNTHETIC_FAILURE' in r[2])
 check('atomic rollback objects absent',read("SELECT to_regprocedure('"+F+"') IS NULL AND to_regclass('backend_core.currency_onboarding_requests') IS NULL")=='t')
 check('rollback preserves business data',fp()==before)
 l.sql(S)
 rb=Path('engineering/currency-onboarding-20261018/ROLLBACK.sql').read_text();l.sql(rb);l.sql(rb)
 check('existing guarded disable compatible idempotent',read("SELECT has_function_privilege('authenticated','"+F+"','EXECUTE')")=='f' and fp()==before)
 # Inheritance of function-owner authority cannot be revoked through ACL: fail closed.
 l.sql('DROP FUNCTION '+F+';DROP TABLE backend_core.currency_onboarding_requests;CREATE ROLE synthetic_owner_member NOINHERIT;GRANT postgres TO synthetic_owner_member;')
 r=l.sql(S,False);check('owner inheritance aborts entire migration',r[0]!=0 and 'ONBOARDING_QUARANTINE_EFFECTIVE_EXECUTE' in r[2] and read("SELECT to_regclass('backend_core.currency_onboarding_requests') IS NULL")=='t')
 (E/'TEST-RESULTS.json').write_text(json.dumps({'status':'PASS','count':len(checks),'checks':checks,'syntheticLocalPostgres':True,'remoteConnections':0,'applicationAuthServiceE2E':False},indent=2));print('PASS '+str(len(checks))+' focused checks')
finally:
 if l.PORT:assert l.tool('pg_ctl',['-D',str(l.CLUSTER),'-m','fast','-w','stop'])[0]==0
