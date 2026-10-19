from pathlib import Path
import json,hashlib,re
E=Path(__file__).resolve().parent
base=(E/'2026101914-atomic-original-refund.DRAFT.sql').read_text()
fact=re.search(r'(CREATE OR REPLACE FUNCTION backend_core\.canonical_settlement_fact_v1.*?END \$function\$)\s*;',base,re.S).group(1)
guard=re.search(r'(CREATE OR REPLACE FUNCTION backend_core\.native_unverified_writer_guard_v1.*?END \$function\$)\s*;',base,re.S).group(1)
branch="""ELSIF k IN ('CUSTODY_IN','CUSTODY_OUT') THEN SELECT jsonb_build_object('organization',w.organization_id,'store',w.store_id,'amount',(CASE WHEN k='CUSTODY_IN' THEN w.amount ELSE -w.amount END)::text,'method',a.kind,'currency',a.currency,'createdAt',w.created_at,'actor',w.created_by) INTO r FROM public.field_wallet_transactions w JOIN backend_core.field_custody_links l ON l.wallet_transaction_id=w.id JOIN backend_core.bound_field_wallets b ON b.wallet_id=w.wallet_id JOIN backend_core.settlement_accounts a ON a.id=CASE WHEN (l.operation='FUND')=(k='CUSTODY_IN') THEN b.account_id ELSE l.source_account_id END WHERE w.id=sid AND l.operation IN('FUND','RETURN');
 """
needle="ELSE RAISE EXCEPTION 'UNVERIFIED_CANONICAL_SETTLEMENT_SOURCE'"
assert fact.count(needle)==1
newfact=fact.replace(needle,branch+needle)
needle=' -- A private, same-transaction refund permit is scoped to the returned product.'
assert guard.count(needle)==1
newguard=guard.replace(needle,""" IF TG_TABLE_NAME IN ('field_wallets','field_wallet_transactions') AND TG_OP IN ('INSERT','UPDATE') AND EXISTS(SELECT 1 FROM backend_core.field_custody_intents i WHERE i.backend_pid=pg_backend_pid() AND i.transaction_id=txid_current() AND i.actor_id=actor AND i.organization_id=o AND i.store_id=s AND (i.wallet_id=CASE WHEN TG_TABLE_NAME='field_wallets' THEN (r->>'id')::uuid ELSE (r->>'wallet_id')::uuid END OR TG_TABLE_NAME='field_wallets' AND TG_OP='INSERT' AND EXISTS(SELECT 1 FROM public.field_wallets w WHERE w.id=i.wallet_id AND w.store_id=s AND w.organization_id=o AND w.membership_id=(r->>'membership_id')::uuid))) THEN RETURN NEW;END IF;
"""+needle)
# Canonical pg_get_functiondef normalizes the final newline after the delimiter.
md5=lambda s:hashlib.md5((s+'\n').replace('\r','').encode()).hexdigest()
sql="BEGIN;SET LOCAL lock_timeout='3s';SET LOCAL statement_timeout='45s';\n"
for ident,definition in [('backend_core.canonical_settlement_fact_v1(text,uuid)',fact),('backend_core.native_unverified_writer_guard_v1()',guard)]:
 sql+="DO $$BEGIN IF md5(replace(pg_get_functiondef('"+ident+"'::regprocedure),chr(13),''))<>'"+md5(definition)+"' THEN RAISE EXCEPTION '1915_EXACT_DEPENDENCY_MISMATCH';END IF;END$$;\n"
sql+=(E/'1915-field-custody.sql').read_text()+'\n'+newfact+';\n'+newguard+';\nCOMMIT;\n'
(E/'2026101915-canonical-field-custody.DRAFT.sql').write_text(sql)
(E/'1915-DISABLE.sql').write_text("BEGIN;UPDATE backend_core.settlement_rollout SET enabled=false WHERE enabled;DO $$DECLARE p record;r record;BEGIN FOR p IN SELECT oid,proowner FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN('confirm_bound_field_wallet_v1','open_bound_field_wallet_v1','post_bound_field_custody_v1') LOOP EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC',p.oid::regprocedure);FOR r IN SELECT DISTINCT pg_get_userbyid(a.grantee) name FROM pg_proc f CROSS JOIN LATERAL aclexplode(coalesce(f.proacl,acldefault('f',f.proowner))) a WHERE f.oid=p.oid AND a.grantee<>0 AND a.grantee<>p.proowner LOOP EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %I',p.oid::regprocedure,r.name);END LOOP;END LOOP;END$$;COMMIT;\n")
print('1915 generated: pinned1914 preimages, canonical wallet links, no live grants')
