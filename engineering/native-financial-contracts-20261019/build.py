from pathlib import Path
import json,hashlib
import re
E=Path(__file__).resolve().parent
v4=(E/'create_sale_with_payment_v4.sql').read_text();credit=(E/'record_credit_sale_v2.sql').read_text()
def once(s,a,b):assert s.count(a)==1,a;return s.replace(a,b)
v4=once(v4,'  v_sale_id uuid;','  v_sale_id uuid;\n  v_policy jsonb;\n  v_scale integer;\n  v_native boolean;\n  v_rounding numeric:=0;')
v4=once(v4,'  if v_client_sale_uuid is not null then',"  v_policy:=backend_core.native_financial_policy_v1(p_store_id);v_scale:=(v_policy->>'discountScale')::integer;v_native:=(v_policy->>'native')::boolean;\n  if v_client_sale_uuid is not null then\n    perform pg_advisory_xact_lock(hashtextextended(p_store_id::text||':'||v_client_sale_uuid::text,0));")
v4=once(v4,'round((v_subtotal * v_dvalue) / 100)','round((v_subtotal * v_dvalue) / 100,v_scale)')
v4=once(v4,'round(v_dvalue)','round(v_dvalue,v_scale)')
v4=once(v4,"  if v_grand_total <= 0 then", "  if v_native then\n    v_rounding:=round(v_grand_total,(v_policy->>'scale')::integer)-v_grand_total;\n    v_grand_total:=v_grand_total+v_rounding;\n    if v_paid<>round(v_paid,(v_policy->>'scale')::integer) or v_split_cash<>round(v_split_cash,(v_policy->>'scale')::integer) or v_split_mobile<>round(v_split_mobile,(v_policy->>'scale')::integer) or v_split_bank<>round(v_split_bank,(v_policy->>'scale')::integer) then raise exception 'INVALID_TENDER_PRECISION';end if;\n  end if;\n  if v_grand_total <= 0 then")
v4=once(v4,'round(v_split_total) <> round(v_paid)','v_split_total <> v_paid')
v4=once(v4,'round(v_paid) <> round(v_grand_total)','v_paid <> v_grand_total')
v4=once(v4,'      grand_total = v_grand_total,','      grand_total = v_grand_total,\n      settlement_rounding = v_rounding,')
credit=once(credit,'  v_amt numeric(14,2);','  v_amt numeric;\n  v_policy jsonb;')
credit=once(credit,'  v_amt := abs(coalesce(p_amount, 0));',"  v_policy:=backend_core.native_financial_policy_v1(p_store_id);\n  if (v_policy->>'native')::boolean then\n   v_amt:=abs(coalesce(p_amount,0));if v_amt<>round(v_amt,(v_policy->>'scale')::integer) then raise exception 'INVALID_CREDIT_PRECISION';end if;\n  else v_amt:=abs(coalesce(p_amount,0))::numeric(14,2);end if;")
header=(E/'1905-header.sql').read_text();tail=(E/'1905-gateways.sql').read_text()
views=json.loads((E/'DEPENDENT-VIEWS.json').read_text());drop=[];restore=[]
for view in sorted(views,key=lambda v:v['depth'],reverse=True):
 name='public.'+view['name'];definition=view['definition'];digest=hashlib.md5(definition.encode()).hexdigest()
 assert view['owner']=='postgres' and view['options'] is None and view['acl']=='{postgres=arwdDxtm/postgres}','UNSUPPORTED_VIEW_SECURITY_BASELINE'
 drop.append("DO $$ BEGIN IF md5(pg_get_viewdef('"+name+"'::regclass,true))<>'"+digest+"' OR (SELECT relacl::text FROM pg_class WHERE oid='"+name+"'::regclass)<>'{postgres=arwdDxtm/postgres}' THEN RAISE EXCEPTION 'CREDIT_VIEW_PREIMAGE_MISMATCH';END IF;END $$;DROP VIEW "+name+';')
for view in sorted(views,key=lambda v:v['depth']):
 name='public.'+view['name'];definition=view['definition'].replace('FROM credit_ledger_v2','FROM public.credit_ledger_v2')
 restore.append('CREATE VIEW '+name+' AS '+definition+';ALTER VIEW '+name+' OWNER TO postgres;REVOKE ALL ON '+name+' FROM PUBLIC,anon,authenticated,service_role;GRANT ALL ON '+name+' TO postgres;')
header=once(header,'ALTER TABLE public.credit_ledger_v2 ALTER COLUMN delta TYPE numeric;', '\n'.join(drop)+'\nALTER TABLE public.credit_ledger_v2 ALTER COLUMN delta TYPE numeric;\n'+'\n'.join(restore))
original=(E.parent/'currency-financial-integration-20261019/2026101904-financial-currency-context.DRAFT.sql').read_text(encoding='utf-8-sig')
capture=re.search(r'CREATE FUNCTION backend_core.capture_financial_currency_v1\(\).*?END \$\$;',original,re.S).group()
capture=once(capture,'CREATE FUNCTION','CREATE OR REPLACE FUNCTION')
capture=once(capture,"IF FOUND AND authority.currency<>'TZS' THEN RAISE EXCEPTION 'NATIVE_FINANCIAL_POSTING_NOT_CERTIFIED'; END IF;","IF FOUND AND authority.currency<>'TZS' THEN PERFORM backend_core.native_financial_policy_v1(NEW.store_id); END IF;")
header+='\n'+capture
pre=json.loads((E/'CAPTURED-CONTRACTS.json').read_text());guards=[]
for name in ['create_sale_with_payment_v4','record_credit_sale_v2']:
 row=next(r for r in pre if r['identity'].startswith(name+'('));guards.append("IF md5(replace(pg_get_functiondef('public."+row['identity']+"'::regprocedure),chr(13),''))<> '"+row['md5']+"' THEN RAISE EXCEPTION 'CANONICAL_PREIMAGE_MISMATCH';END IF;")
body="BEGIN;SET LOCAL lock_timeout='2s';SET LOCAL statement_timeout='45s';\nDO $$BEGIN "+''.join(guards)+" END$$;\n"+header+'\n'+v4+';\n'+credit+';\n'+tail+'\nCOMMIT;\n'
p=E/'2026101905-native-settlement-atomic.DRAFT.sql';p.write_text(body,encoding='utf-8');(E/'1905-SHA256.txt').write_text(hashlib.sha256(p.read_bytes()).hexdigest());print('Built quarantined candidate '+hashlib.sha256(p.read_bytes()).hexdigest())
