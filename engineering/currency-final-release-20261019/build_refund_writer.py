from pathlib import Path
import json,hashlib
E=Path(__file__).resolve().parent
d=json.loads((E/'FINAL-WRITER-DEPENDENCIES.json').read_text())
fact=next(x for x in d['functions'] if x['identity'].startswith('backend_core.canonical_settlement_fact_v1'))
guard=next(x['function'] for x in d['triggers'] if 'native_unverified_writer_guard_v1' in x['definition'])
branch="""ELSIF k='REFUND' THEN SELECT jsonb_build_object('organization',f.organization_id,'store',f.store_id,'amount',(-p.amount)::text,'method',upper(op.payment_method),'currency',s.currency_context->>'currency','createdAt',f.created_at,'actor',f.actor_id,'saleId',f.sale_id) INTO r FROM backend_core.original_refund_payments p JOIN backend_core.original_refunds f ON f.id=p.refund_id JOIN public.sale_payments op ON op.id=p.original_payment_id AND op.sale_id=f.sale_id JOIN public.sales s ON s.id=f.sale_id WHERE p.id=sid;
 """
needle="ELSE RAISE EXCEPTION 'UNVERIFIED_CANONICAL_SETTLEMENT_SOURCE'"
assert fact['definition'].count(needle)==1
newfact=fact['definition'].replace(needle,branch+needle)
needle=" -- Only the already-validated canonical sale transaction may write stock."
assert guard.count(needle)==1
newguard=guard.replace(needle,""" -- A private, same-transaction refund permit is scoped to the returned product.
 IF TG_TABLE_NAME IN ('inventory','stock_movements') AND TG_OP IN ('INSERT','UPDATE') AND EXISTS(
 SELECT 1 FROM backend_core.refund_stock_intents i WHERE i.backend_pid=pg_backend_pid() AND i.transaction_id=txid_current() AND i.actor_id=actor AND i.organization_id=o AND i.store_id=s AND i.product_id=(r->>'product_id')::uuid) THEN RETURN NEW;END IF;
"""+needle)
md5=lambda s:hashlib.md5(s.replace('\r','').encode()).hexdigest()
sql="BEGIN;SET LOCAL lock_timeout='3s';SET LOCAL statement_timeout='45s';\n"
for ident,definition in [(fact['identity'],fact['definition']),('backend_core.native_unverified_writer_guard_v1()',guard)]:
 sql+="DO $$BEGIN IF md5(replace(pg_get_functiondef('"+ident+"'::regprocedure),chr(13),''))<>'"+md5(definition)+"' THEN RAISE EXCEPTION '1914_EXACT_DEPENDENCY_MISMATCH';END IF;END$$;\n"
sql+=(E/'1914-refund-writer.sql').read_text()+'\n'+newfact+';\n'+newguard+';\nCOMMIT;\n'
(E/'2026101914-atomic-original-refund.DRAFT.sql').write_text(sql)
(E/'1914-DISABLE.sql').write_text("BEGIN;SET LOCAL lock_timeout='3s';REVOKE ALL ON FUNCTION public.refund_original_sale_v1(uuid,uuid,uuid,uuid,numeric,boolean,uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;DO $$DECLARE r record;BEGIN FOR r IN SELECT DISTINCT pg_get_userbyid(a.grantee) name FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid='public.refund_original_sale_v1(uuid,uuid,uuid,uuid,numeric,boolean,uuid,jsonb)'::regprocedure AND a.grantee<>0 AND a.grantee<>p.proowner LOOP EXECUTE format('REVOKE ALL ON FUNCTION public.refund_original_sale_v1(uuid,uuid,uuid,uuid,numeric,boolean,uuid,jsonb) FROM %I',r.name);END LOOP;END$$;UPDATE backend_core.settlement_rollout SET enabled=false WHERE enabled;COMMIT;\n")
print('1914 generated with pinned canonical/guard preimages; no grants or activation')
