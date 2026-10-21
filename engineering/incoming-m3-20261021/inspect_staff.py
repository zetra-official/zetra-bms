from pathlib import Path
import json,sys
E=Path(__file__).resolve().parent
sys.path.insert(0,str(E.parent/'security-owner-privacy-m2-20261021'))
import local_runtime as l
l.db.E=E;l.db.CLUSTER=E/'disposable';l.db.PORT=json.loads((E/'db.private.json').read_text())['port']
query="""SELECT json_build_object('directory',current_setting('data_directory'),'columns',(SELECT json_agg(row_to_json(c)) FROM(SELECT table_name,column_name,data_type,column_default,is_nullable FROM information_schema.columns WHERE table_schema='public' AND table_name IN ('sales','sale_payments','expenses','org_memberships','org_membership_stores','stores','sale_refunds','sale_refund_payments') ORDER BY table_name,ordinal_position)c),'functions',(SELECT json_agg(json_build_object('name',p.proname,'definition',pg_get_functiondef(p.oid))) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('public','zetra_m2') AND p.proname IN ('get_sales','get_expense_summary_v2','require_store','create_sale','create_sale_v2','create_sale_v3','create_sale_v4','add_payment_to_sale','record_expense','create_expense','present_expense')),'triggers',(SELECT json_agg(json_build_object('table',c.relname,'definition',pg_get_triggerdef(t.oid))) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid WHERE NOT t.tgisinternal AND c.relname IN ('sales','sale_payments','expenses')));"""
code,out,err=l.db.sql(query,False)
if code:print('Local schema inspection unavailable: '+err[:700]);raise SystemExit(code)
d=json.loads(out);assert Path(d['directory']).resolve()==(E/'disposable').resolve();(E/'staff-schema.private.json').write_text(json.dumps(d,ensure_ascii=False,indent=2),encoding='utf-8')
print('Verified disposable data directory; schema captured locally')
for c in d['columns']:print(c['table_name']+'.'+c['column_name']+' '+c['data_type']+' '+str(c['column_default']))
for f in d['functions'] or []:print(f['definition'])
