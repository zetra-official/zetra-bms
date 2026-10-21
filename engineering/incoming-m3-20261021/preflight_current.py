"""Production catalog-only compatibility read. Never reads customer rows or runs DDL."""
from pathlib import Path
import sys,json,hashlib,datetime
E=Path(__file__).resolve().parent;out=E/'production-20261021';out.mkdir(exist_ok=True)
sys.path.insert(0,str(E.parent/'security-owner-privacy-m2-20261021'))
from capture_catalog import query
sql="""BEGIN READ ONLY;SET LOCAL statement_timeout='20s';
SELECT n.nspname schema,p.proname name,p.oid::regprocedure::text identity,pg_get_functiondef(p.oid) definition,p.proacl::text acl
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE p.prokind='f' AND ((n.nspname='security_m2') OR (n.nspname='public' AND p.proname IN ('upsert_product','adjust_stock','receive_inbound_stock_partial_v1','m3_submit_incoming_v1','m3_staff_operational_v1','get_org_accounting_currency_v1')));
ROLLBACK;"""
try:
 rows=query(sql);(out/'catalog.private.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2),encoding='utf-8')
 summary={'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'readOnly':True,'project':'dcmhqdckzhbuakvcyjit','customerRowsRead':False,'hostedWrites':False,'functions':[{'schema':r['schema'],'name':r['name'],'sha256':hashlib.sha256(r['definition'].encode()).hexdigest()} for r in rows]}
 (out/'CATALOG-PREFLIGHT.json').write_text(json.dumps(summary,indent=2));print(json.dumps(summary))
except Exception as ex:
 (out/'preflight-error.private.log').write_text(str(ex),encoding='utf-8');print('Production catalog read failed:',type(ex).__name__);raise SystemExit(1)
