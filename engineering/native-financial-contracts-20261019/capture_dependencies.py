from pathlib import Path
import sys,json
sys.dont_write_bytecode=True;sys.path.insert(0,str(Path('engineering/currency-onboarding-20261018').resolve()));import local as l
E=Path(__file__).resolve().parent;l.E=E;l.CLUSTER=E/'disposable-native-v1'
try:
 l.PORT=l.start();sql="""WITH RECURSIVE deps AS (
 SELECT c.oid,1 AS depth FROM pg_depend d JOIN pg_rewrite r ON r.oid=d.objid JOIN pg_class c ON c.oid=r.ev_class WHERE d.refobjid IN ('public.credit_ledger_v2'::regclass,'public.products'::regclass) AND d.refobjsubid IN(SELECT attnum FROM pg_attribute WHERE attrelid=d.refobjid AND attname IN ('delta','price','cost')) AND c.relkind='v'
 UNION ALL SELECT c.oid,p.depth+1 FROM deps p JOIN pg_depend d ON d.refobjid=p.oid JOIN pg_rewrite r ON r.oid=d.objid JOIN pg_class c ON c.oid=r.ev_class WHERE c.oid<>p.oid AND c.relkind='v' AND p.depth<10
 ),nodes AS(SELECT oid,max(depth) depth FROM deps GROUP BY oid)
 SELECT coalesce(json_agg(json_build_object('name',c.oid::regclass::text,'depth',n.depth,'definition',pg_get_viewdef(c.oid,true),'owner',pg_get_userbyid(c.relowner),'options',c.reloptions,'acl',c.relacl::text) ORDER BY n.depth,c.relname),'[]') FROM nodes n JOIN pg_class c ON c.oid=n.oid"""
 v=json.loads(l.sql(sql)[1]);(E/'DEPENDENT-VIEWS.json').write_text(json.dumps(v,indent=2));print(json.dumps(v))
finally:
 if l.PORT:l.tool('pg_ctl',['-D',str(l.CLUSTER),'-m','fast','-w','stop'])
