"""Only the current schema/ACL baseline needed for the approved M3 functions."""
from pathlib import Path
import sys,json,hashlib,datetime,re
E=Path(__file__).resolve().parent;P=E/'production-20261021';sys.path.insert(0,str(E.parent/'security-owner-privacy-m2-20261021'));from capture_catalog import query
names=['adjust_stock','receive_inbound_stock_partial_v1','create_stock_movement_notification','create_notification_from_stock_movement','upsert_product','get_org_accounting_currency_v1','create_inbound_stock_order_v1','add_inbound_stock_item_v1']
tables=['products','inventory','stock_movements','inbound_stock_orders','inbound_stock_items','inbound_stock_payments','business_debts','notifications','organizations','org_memberships','org_membership_stores','stores','suppliers','sales','sale_items','sale_payments','expenses','credit_ledger_v2']
sql="BEGIN READ ONLY;SET LOCAL statement_timeout='20s';SELECT jsonb_build_object('functions',(SELECT jsonb_agg(jsonb_build_object('identity',p.oid::regprocedure::text,'definition',pg_get_functiondef(p.oid),'md5',md5(pg_get_functiondef(p.oid)),'acl',p.proacl::text)) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ("+','.join("'"+n+"'" for n in names)+")),'columns',(SELECT jsonb_agg(to_jsonb(c)) FROM information_schema.columns c WHERE table_schema='public' AND table_name IN ("+','.join("'"+n+"'" for n in tables)+")),'securitySchemaExists',EXISTS(SELECT 1 FROM pg_namespace WHERE nspname='security_m2')) evidence;ROLLBACK;"
try:
 rows=query(sql);data=rows[0]['evidence'];data=json.loads(data) if isinstance(data,str) else data
 (P/'dependencies.private.json').write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf-8')
 summary={'readOnly':True,'hostedWrites':False,'customerRowsRead':False,'capturedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'functions':[{'identity':x['identity'],'md5':x['md5'],'acl':x['acl']} for x in data['functions']],'columnsCaptured':len(data['columns']),'securitySchemaExists':data['securitySchemaExists']}
 (P/'DEPENDENCY-PREFLIGHT.json').write_text(json.dumps(summary,indent=2));print(json.dumps(summary))
except Exception as ex:(P/'dependency-error.private.log').write_text(str(ex));print(type(ex).__name__);raise SystemExit(1)
