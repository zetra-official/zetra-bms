"""Produce reviewable SQL from captured exact function preimages; no DB connections."""
from pathlib import Path
import json,re,hashlib
E=Path(__file__).resolve().parent
F=json.loads((E/'functions.private.json').read_text(encoding='utf-8'))
OWNER_NAMES=set('''get_store_net_profit get_store_net_profit_v2 get_profit_summary
get_product_profit_report_v1 get_product_profit_report_v2 get_product_profit_report_v3
get_stock_on_hand_value_v1 get_stock_on_hand_value_v2 get_stock_in_value_v1 get_stock_in_value_v2
get_financial_dashboard_intelligent_v1 get_business_profit_position_v1
get_business_debts get_business_debt_summary create_business_debt update_business_debt_v1 record_business_debt_payment get_supplier_debt_history_v1
get_inbound_stock_summary_v1 add_inbound_stock_item_v1 update_inbound_stock_item_v1 record_inbound_stock_payment_v1
allocate_field_wallet_v1 record_field_expense_v1 get_field_wallet_summary_v1 get_field_wallet_history_v1 get_field_wallet_history_by_cycle_v1
get_business_statement_goods_summary_v1 get_business_statement_goods_summary_v2'''.split())
OWNER_NAMES.update('''get_field_cycle_summary_v1 get_active_field_cycle_summary_v1
get_field_stock_summary_v1 get_field_agent_stock_summary_v1 get_field_stock_summary_by_cycle_v1
get_field_cycles_history_v1 get_active_field_cycle_v1 allocate_field_money_v1 open_field_cycle_v1 close_field_cycle_v1
get_capital_recovery_summary_v1 get_capital_recovery_history_v1 get_capital_recovery_history_v2 get_business_statement_capital_recovery_v1
get_ai_crm_customer_360_v1'''.split())
OWNER_NAMES.update(['get_club_owner_intelligence_v1','get_staff_performance_detail_v1','upsert_product'])
OWNER_NAMES.update(['get_business_loans','get_business_loan_summary','get_business_loan_payments'])
SHARE_NAMES={'preview_product_catalog_share_v1','import_product_catalog_share_v1'}
OP_NAMES=set('''get_stock_in_items_v1 get_stock_in_items_v2 get_inbound_stock_suggestions_v1
get_inbound_stock_orders_v1 get_inbound_stock_order_items_v1 get_store_sale_items get_store_sale_item_by_barcode
get_products get_products_manage get_items_overview_v1 get_supplier_stock_history_v1
receive_inbound_stock_partial_v1 receive_inbound_stock_v1 create_inbound_stock_order_v1 delete_inbound_stock_order_v1
get_my_notifications get_my_notifications_v1 get_my_notifications_v3 get_notification_movement_items_v1'''.split())
def body_parts(d):
 m=re.search(r'AS (\$\w*\$)(.*?)\1',d,re.S);assert m
 return m,m[2]
def scope(d):
 header=d.split(' RETURNS ')[0]
 if 'p_organization_id uuid' in header: org='p_organization_id'
 elif 'p_org_id uuid' in header: org='p_org_id'
 elif 'p_store_id uuid' in header: org='(SELECT s.organization_id FROM public.stores s WHERE s.id=p_store_id)'
 elif 'p_order_id uuid' in header: org='(SELECT o.organization_id FROM public.inbound_stock_orders o WHERE o.id=p_order_id)'
 elif 'p_item_id uuid' in header: org='(SELECT i.organization_id FROM public.inbound_stock_items i WHERE i.id=p_item_id)'
 elif 'p_debt_id uuid' in header: org='(SELECT d.organization_id FROM public.business_debts d WHERE d.id=p_debt_id)'
 elif 'p_supplier_id uuid' in header: org='(SELECT s.organization_id FROM public.suppliers s WHERE s.id=p_supplier_id)'
 elif 'p_loan_id uuid' in header: org='(SELECT b.organization_id FROM public.business_loans b WHERE b.id=p_loan_id)'
 elif 'p_cycle_id uuid' in header: org='(SELECT c.organization_id FROM public.field_cycles c WHERE c.id=p_cycle_id)'
 else:raise ValueError(header)
 store='p_store_id' if 'p_store_id uuid' in header else 'NULL::uuid'
 if 'p_order_id uuid' in header:store='(SELECT o.store_id FROM public.inbound_stock_orders o WHERE o.id=p_order_id)'
 if 'p_item_id uuid' in header:store='(SELECT o.store_id FROM public.inbound_stock_items i JOIN public.inbound_stock_orders o ON o.id=i.inbound_order_id WHERE i.id=p_item_id)'
 return org,store
def guarded(d,guard):
 m,b=body_parts(d)
 if re.search(r'LANGUAGE sql\b',d,re.I):
  d=re.sub(r'LANGUAGE sql\b','LANGUAGE plpgsql',d,flags=re.I)
  m,b=body_parts(d)
  ret='RETURN QUERY ' if 'RETURNS TABLE' in d or 'RETURNS SETOF' in d else 'RETURN ('
  b='BEGIN\n'+guard+'\n'+ret+b.strip().rstrip(';')+(';' if ret.startswith('RETURN QUERY') else ');')+'\nEND;\n'
 else:
  b,n=re.subn(r'\bbegin\b',lambda _: 'BEGIN\n'+guard,b,count=1,flags=re.I);assert n==1
 return d[:m.start(2)]+b+d[m.end(2):]
out=['-- M2 LOCAL ONLY. Generated from exact catalog preimages. No financial activation.','BEGIN;','SET LOCAL check_function_bodies=on;', (E/'security_helpers.DRAFT.sql').read_text()]
pre=[];changes=[]
for f in F:
 if f['schema']!='public' or f['name'] not in OWNER_NAMES|OP_NAMES|SHARE_NAMES:continue
 d=f['definition'].replace('\r','');original=d;name=f['name']
 # Notification RPCs already scope their recipients; redact historical free-text/payload too.
 if name in SHARE_NAMES:
  if name=='preview_product_catalog_share_v1':
   d=d.replace('WHEN v_share.share_cost_price','WHEN v_share.share_cost_price AND security_m2.owner_of(v_share.source_organization_id)')
  else:
   # Do not silently import undisclosed costs under a valid operational share code.
   d=d.replace("  IF v_share_id IS NULL THEN", "  IF v_share_id IS NOT NULL AND v_share_cost_price AND (NOT security_m2.owner_of(v_source_org_id) OR NOT security_m2.owner_of(p_target_org_id)) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='OWNER_FINANCIAL_ACCESS_REQUIRED'; END IF;\n  IF v_share_id IS NULL THEN")
   d=d.replace('    p.auto_cost_per_dispense_unit,','    CASE WHEN security_m2.owner_of(v_source_org_id) AND security_m2.owner_of(p_target_org_id) THEN p.auto_cost_per_dispense_unit ELSE NULL::numeric END AS auto_cost_per_dispense_unit,')
 elif name.startswith('get_my_notifications'):
  d=d.replace('n.body,','CASE WHEN security_m2.owner_of(n.organization_id) THEN n.body ELSE security_m2.operational_json(n.body) END,')
  d=d.replace('n.items,','CASE WHEN security_m2.owner_of(n.organization_id) THEN n.items ELSE security_m2.operational_json(n.items) END,')
 elif name=='get_notification_movement_items_v1':
  d=d.replace('where sm.id = any(p_movement_ids);','where sm.id = any(p_movement_ids) AND security_m2.store_allowed(sm.organization_id,sm.store_id);')
 else:
  org,store=scope(d)
  g=f'PERFORM security_m2.{"require_owner" if name in OWNER_NAMES else "require_store"}({org},{store});'
  if 'p_order_id uuid' in d.split(' RETURNS ')[0]:
   g+="\nIF EXISTS(SELECT 1 FROM public.inbound_stock_orders o WHERE o.id=p_order_id AND (NOT EXISTS(SELECT 1 FROM public.stores s WHERE s.id=o.store_id AND s.organization_id=o.organization_id) OR o.supplier_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.suppliers s WHERE s.id=o.supplier_id AND s.organization_id=o.organization_id) OR EXISTS(SELECT 1 FROM public.inbound_stock_items i LEFT JOIN public.products p ON p.id=i.product_id WHERE i.inbound_order_id=o.id AND (i.organization_id IS DISTINCT FROM o.organization_id OR i.product_id IS NOT NULL AND p.organization_id IS DISTINCT FROM o.organization_id)))) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='INBOUND_EXISTING_SCOPE_MISMATCH'; END IF;"
  if name=='update_business_debt_v1':g+=f"\nIF p_supplier_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.suppliers s WHERE s.id=p_supplier_id AND s.organization_id={org}) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='SUPPLIER_SCOPE_MISMATCH'; END IF;"
  if name in ('get_store_sale_items','get_store_sale_item_by_barcode'):
   d=d.replace('v_is_manage := public._is_owner_or_admin_in_org(v_org_id);','v_is_manage := security_m2.owner_of(v_org_id);')
  if name=='get_products_manage': d=d.replace('public._is_owner_in_org(p_org_id)','security_m2.owner_of(p_org_id)')
  if name in ('get_stock_in_items_v1','get_stock_in_items_v2'):
   # Preserve quantities and original valuation formula; only authorization changes.
   m,b=body_parts(d)
   b=re.sub(r'coalesce\(\s*nullif\(p.cost, 0\),\s*p.cost_price,\s*0\s*\)',f'CASE WHEN security_m2.owner_of({org}) THEN coalesce(nullif(p.cost,0),p.cost_price,0) ELSE NULL::numeric END',b,flags=re.I)
   d=d[:m.start(2)]+b+d[m.end(2):]
   d=d.replace('where sm.organization_id = p_org_id','where sm.organization_id = p_org_id AND (p.id IS NULL OR p.organization_id=sm.organization_id)')
   d=d.replace('and im.organization_id = p_org_id','and im.organization_id = p_org_id AND (p.id IS NULL OR p.organization_id=im.organization_id)')
  if name in ('get_stock_on_hand_value_v1','get_stock_on_hand_value_v2'):
   g+="\nIF EXISTS(SELECT 1 FROM public.inventory i JOIN public.products p ON p.id=i.product_id WHERE i.organization_id=p_org_id AND (p_store_id IS NULL OR i.store_id=p_store_id) AND p.organization_id IS DISTINCT FROM i.organization_id) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='INVENTORY_PRODUCT_SCOPE_MISMATCH'; END IF;"
  if name=='get_inbound_stock_suggestions_v1':d=d.replace('p.cost_price::numeric,','CASE WHEN security_m2.owner_of(p_org_id) THEN p.cost_price ELSE NULL::numeric END,')
  if name=='get_inbound_stock_orders_v1':
   for col in ['total_goods_value','total_paid_amount','total_balance_amount']:
    d=d.replace(f'coalesce(o.{col}, 0)::numeric,',f'CASE WHEN security_m2.owner_of(p_org_id) THEN coalesce(o.{col},0) ELSE NULL::numeric END,')
  if name=='get_inbound_stock_order_items_v1':
   for col in ['unit_cost','total_cost']:
    d=d.replace(f'coalesce(i.{col}, 0),',f'CASE WHEN security_m2.owner_of(v_org_id) THEN coalesce(i.{col},0) ELSE NULL::numeric END,')
   d=d.replace('    i.note,','    CASE WHEN security_m2.owner_of(v_org_id) THEN i.note ELSE NULL::text END,')
  if name=='get_supplier_stock_history_v1':
   g=f"IF NOT EXISTS(SELECT 1 FROM public.org_memberships m JOIN public.organizations o ON o.id=m.organization_id WHERE m.organization_id={org} AND m.user_id=auth.uid() AND m.is_active IS TRUE AND o.is_active IS TRUE) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='WORKSPACE_ACCESS_REQUIRED'; END IF;"
   d=d.replace('    sm.note,','    CASE WHEN security_m2.owner_of(sm.organization_id) THEN sm.note ELSE NULL::text END,')
   d=d.replace("coalesce(i.note, 'Inbound stock order ' || coalesce(o.order_code, o.id::text))::text as note",'CASE WHEN security_m2.owner_of(i.organization_id) THEN i.note ELSE NULL::text END as note')
   d=d.replace('where sm.supplier_id = p_supplier_id','where sm.supplier_id = p_supplier_id AND security_m2.store_allowed(sm.organization_id,sm.store_id)')
   d=d.replace('where o.supplier_id = p_supplier_id','where o.supplier_id = p_supplier_id AND security_m2.store_allowed(o.organization_id,o.store_id)')
  if name in ('receive_inbound_stock_partial_v1','receive_inbound_stock_v1','delete_inbound_stock_order_v1'):
   # Serialize existing engine, reject cancelled/deleted parents and received deletion.
   g+= "\nPERFORM 1 FROM public.inbound_stock_orders o WHERE o.id=p_order_id FOR UPDATE;"
   if name!='delete_inbound_stock_order_v1':g+= "\nIF EXISTS(SELECT 1 FROM public.inbound_stock_orders o WHERE o.id=p_order_id AND (o.deleted_at IS NOT NULL OR o.status='CANCELLED')) THEN RAISE EXCEPTION 'INBOUND_ORDER_CLOSED'; END IF;"
   if name=='delete_inbound_stock_order_v1':g+="\nIF EXISTS(SELECT 1 FROM public.inbound_stock_items i WHERE i.inbound_order_id=p_order_id AND i.qty_received>0) THEN RAISE EXCEPTION 'RECEIVED_ORDER_DELETE_BLOCKED'; END IF;"
  if name in ('allocate_field_wallet_v1','record_field_expense_v1'):
   g+=f'\nPERFORM security_m2.require_store({org},p_store_id);'
   g+="\nIF NOT EXISTS(SELECT 1 FROM public.org_memberships m JOIN public.org_membership_stores ms ON ms.membership_id=m.id JOIN public.stores s ON s.id=ms.store_id WHERE m.id=p_membership_id AND m.is_active IS TRUE AND ms.store_id=p_store_id AND m.organization_id=s.organization_id) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='WALLET_TARGET_SCOPE_REQUIRED'; END IF;"
   g+="\nIF EXISTS(SELECT 1 FROM public.field_wallets w JOIN public.stores s ON s.id=w.store_id WHERE w.store_id=p_store_id AND w.membership_id=p_membership_id AND w.organization_id IS DISTINCT FROM s.organization_id) OR EXISTS(SELECT 1 FROM public.field_cycles c JOIN public.stores s ON s.id=c.store_id WHERE c.store_id=p_store_id AND c.status='OPEN' AND c.organization_id IS DISTINCT FROM s.organization_id) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='WALLET_EXISTING_SCOPE_MISMATCH'; END IF;"
  d=guarded(d,g)
 # Put pg_catalog first and temporary objects last in every touched definer.
 d=d.replace("SET search_path TO 'public'", "SET search_path TO 'pg_catalog', 'public'")
 if "'pg_temp'" not in d.split('AS $')[0]:d=d.replace("SET search_path TO 'pg_catalog', 'public'", "SET search_path TO 'pg_catalog', 'public', 'pg_temp'")
 # Keep exact signature and output; revoke anonymous calls explicitly.
 out.extend([d.rstrip().rstrip(';')+';',f'REVOKE ALL ON FUNCTION public.{f["identity"]} FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.{f["identity"]} TO authenticated;'])
 pre.append(original.rstrip().rstrip(';')+';')
 changes.append({'identity':f['identity'],'preimageSha256':hashlib.sha256(original.encode()).hexdigest(),'resultSha256':hashlib.sha256(d.encode()).hexdigest(),'policy':'OWNER' if name in OWNER_NAMES else 'OPERATIONAL_REDACTION'})

for table in ['inventory_movements','stock_movements','_backup_inventory_before_fix_stock_root','inbound_stock_orders','inbound_stock_items','inbound_stock_payments','inbound_stock_audit','business_debts','business_debt_payments','business_loans','business_loan_payments','capital_recovery_entries','capital_recovery_entry_items','field_wallets','field_wallet_transactions','field_cycles','ai_daily_store_snapshots_v1','notifications','sale_delete_audit_v1']:
 out += [f'ALTER TABLE public.{table} ENABLE ROW LEVEL SECURITY;',f'REVOKE ALL ON public.{table} FROM anon;',f'REVOKE INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public.{table} FROM authenticated;']
 if table=='_backup_inventory_before_fix_stock_root':
  out += [f'REVOKE ALL ON public.{table} FROM authenticated;'];continue
 out += [f'DROP POLICY IF EXISTS m2_owner_raw_read ON public.{table};',f'CREATE POLICY m2_owner_raw_read ON public.{table} AS RESTRICTIVE FOR SELECT TO authenticated USING (security_m2.owner_of(organization_id));']
 # A restrictive policy does not itself grant access; retain existing scoped SELECT policies.
 if table=='inventory_movements':out += [f'DROP POLICY IF EXISTS m2_movement_owner_select ON public.{table};',f'CREATE POLICY m2_movement_owner_select ON public.{table} FOR SELECT TO authenticated USING (security_m2.owner_of(organization_id));']
quarantined={'get_office_system_performance_v2','build_ai_daily_store_snapshot_v1','run_ai_daily_snapshots_v1','run_due_ai_daily_snapshots_v1','backfill_ai_daily_store_snapshots_all_history_v1','run_ai_snapshot_backfill_batch_v1','run_ai_snapshot_backfill_autopilot_v1'}
for f in F:
 if f['schema']=='public' and f['name'] in quarantined:
  # No product caller exists. Keep canonical cron bodies and trusted server jobs
  # unchanged; remove client entry points instead of demanding a user's JWT in cron.
  out += [f['definition'].replace('\r','').rstrip().rstrip(';')+';',f'REVOKE EXECUTE ON FUNCTION public.{f["identity"]} FROM PUBLIC,anon,authenticated;']
out += ['REVOKE INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public.inventory FROM anon,authenticated;']
for table,predicate in {
 'inventory':'security_m2.store_allowed(organization_id,store_id)',
 'products':'security_m2.store_allowed(organization_id,store_id)',
 'sale_items':'EXISTS(SELECT 1 FROM public.sales s WHERE s.id=sale_items.sale_id AND security_m2.store_allowed(s.organization_id,s.store_id))'
}.items():
 out += [f'DROP POLICY IF EXISTS m2_active_operational_scope ON public.{table};',f'CREATE POLICY m2_active_operational_scope ON public.{table} AS RESTRICTIVE FOR SELECT TO authenticated USING ({predicate});']
out += ['GRANT UPDATE ON public.inbound_stock_orders TO authenticated;',
 'DROP POLICY IF EXISTS m2_owner_header_update ON public.inbound_stock_orders;',
 'CREATE POLICY m2_owner_header_update ON public.inbound_stock_orders AS RESTRICTIVE FOR UPDATE TO authenticated USING (security_m2.owner_of(organization_id)) WITH CHECK (security_m2.owner_of(organization_id));']
for table in ['inbound_stock_orders','inbound_stock_items','inbound_stock_payments']:
 out += [f'DROP TRIGGER IF EXISTS m2_inbound_integrity ON public.{table};',f'CREATE TRIGGER m2_inbound_integrity BEFORE INSERT OR UPDATE ON public.{table} FOR EACH ROW EXECUTE FUNCTION security_m2.inbound_integrity();']
# Column-level privileges must remove both relation and existing column ACL grants.
columns=json.loads((E/'columns.private.json').read_text())
for table,protected in {'products':{'cost','cost_price','auto_cost_per_dispense_unit'},'sale_items':{'unit_cost','unit_cost_price'}}.items():
 cs=[x['column_name'] for x in columns if x['table_schema']=='public' and x['table_name']==table]
 quote=lambda a:','.join('"'+x+'"' for x in a)
 out += [f'REVOKE SELECT ON public.{table} FROM PUBLIC,anon,authenticated;', f'REVOKE SELECT ({quote(cs)}) ON public.{table} FROM PUBLIC,anon,authenticated;',f'GRANT SELECT ({quote([x for x in cs if x not in protected])}) ON public.{table} TO authenticated;']
 out += [f'REVOKE INSERT,UPDATE,DELETE ON public.{table} FROM PUBLIC,anon,authenticated;',f'REVOKE INSERT ({quote(cs)}),UPDATE ({quote(cs)}) ON public.{table} FROM PUBLIC,anon,authenticated;']
 if table=='products':out += [f'GRANT UPDATE ({quote([x for x in cs if x not in protected])}) ON public.products TO authenticated;']
 # Owner-only complete projection for existing financial exports, not operational callers.
 out += [f'CREATE OR REPLACE VIEW public.m2_owner_{table} WITH (security_barrier=true) AS SELECT * FROM public.{table} WHERE security_m2.owner_of(organization_id);' if table=='products' else f'CREATE OR REPLACE VIEW public.m2_owner_{table} WITH (security_barrier=true) AS SELECT i.* FROM public.{table} i JOIN public.sales s ON s.id=i.sale_id WHERE security_m2.owner_of(s.organization_id);',f'REVOKE ALL ON public.m2_owner_{table} FROM PUBLIC,anon; GRANT SELECT ON public.m2_owner_{table} TO authenticated;']
out+=['COMMIT;']
(E/'2026102101-owner-privacy.DRAFT.sql').write_text('\n\n'.join(out),encoding='utf-8')
(E/'function-preimages.LOCAL-RESTORE.sql').write_text('\n'.join(pre),encoding='utf-8')
(E/'FUNCTION-CHANGE-MANIFEST.json').write_text(json.dumps(changes,indent=2))
(E/'CLIENT-QUARANTINE.json').write_text(json.dumps([{'identity':f['identity'],'canonicalBodyUnchanged':True} for f in F if f['schema']=='public' and f['name'] in quarantined],indent=2))
print('Generated local draft for '+str(len(changes))+' exact functions')
