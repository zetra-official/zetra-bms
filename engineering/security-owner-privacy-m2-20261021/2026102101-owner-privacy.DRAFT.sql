-- M2 LOCAL ONLY. Generated from exact catalog preimages. No financial activation.

BEGIN;

SET LOCAL check_function_bodies=on;

-- LOCAL M2 DRAFT ONLY. Not approved for hosted execution.
CREATE SCHEMA IF NOT EXISTS security_m2;
REVOKE ALL ON SCHEMA security_m2 FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA security_m2 TO authenticated;

CREATE OR REPLACE FUNCTION security_m2.owner_of(p_org uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT auth.uid() IS NOT NULL AND EXISTS (
 SELECT 1 FROM public.org_memberships m JOIN public.organizations o ON o.id=m.organization_id
 WHERE m.organization_id=p_org AND m.user_id=auth.uid()
 AND m.role='owner' AND m.is_active IS TRUE AND o.is_active IS TRUE);
$$;
CREATE OR REPLACE FUNCTION security_m2.store_allowed(p_org uuid,p_store uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT auth.uid() IS NOT NULL AND EXISTS (
 SELECT 1 FROM public.org_memberships m JOIN public.organizations o ON o.id=m.organization_id
 WHERE m.organization_id=p_org AND m.user_id=auth.uid() AND m.is_active IS TRUE
 AND o.is_active IS TRUE AND m.role IN ('owner','admin','staff','cashier')
 AND (p_store IS NULL AND m.role IN ('owner','admin') OR EXISTS (
 SELECT 1 FROM public.stores s WHERE s.id=p_store AND s.organization_id=p_org AND s.is_active IS TRUE
 AND (m.role IN ('owner','admin') OR EXISTS (
 SELECT 1 FROM public.org_membership_stores ms WHERE ms.membership_id=m.id AND ms.store_id=s.id)))));
$$;
CREATE OR REPLACE FUNCTION security_m2.require_owner(p_org uuid,p_store uuid DEFAULT NULL) RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 BEGIN
 IF NOT security_m2.owner_of(p_org) OR (p_store IS NOT NULL AND NOT EXISTS (
 SELECT 1 FROM public.stores s WHERE s.id=p_store AND s.organization_id=p_org)) THEN
 RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='OWNER_FINANCIAL_ACCESS_REQUIRED'; END IF;
 END;
$$;
CREATE OR REPLACE FUNCTION security_m2.require_store(p_org uuid,p_store uuid) RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 BEGIN IF NOT security_m2.store_allowed(p_org,p_store) THEN
 RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='WORKSPACE_ACCESS_REQUIRED'; END IF; END;
$$;
CREATE OR REPLACE FUNCTION security_m2.inbound_integrity() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE parent_org uuid; parent_store uuid;
BEGIN
 IF TG_TABLE_NAME='inbound_stock_orders' THEN
  IF TG_OP='UPDATE' AND (NEW.organization_id IS DISTINCT FROM OLD.organization_id OR NEW.store_id IS DISTINCT FROM OLD.store_id) THEN
   RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='INBOUND_SCOPE_IMMUTABLE'; END IF;
  IF NEW.store_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.stores s WHERE s.id=NEW.store_id AND s.organization_id=NEW.organization_id)
  OR NEW.supplier_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.suppliers s WHERE s.id=NEW.supplier_id AND s.organization_id=NEW.organization_id) THEN
   RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='INBOUND_SCOPE_MISMATCH'; END IF;
 ELSE
  IF TG_OP='UPDATE' AND (NEW.organization_id IS DISTINCT FROM OLD.organization_id OR NEW.inbound_order_id IS DISTINCT FROM OLD.inbound_order_id) THEN
   RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='INBOUND_PARENT_SCOPE_IMMUTABLE'; END IF;
  SELECT o.organization_id,o.store_id INTO parent_org,parent_store FROM public.inbound_stock_orders o WHERE o.id=NEW.inbound_order_id FOR KEY SHARE;
  IF parent_org IS NULL OR parent_org IS DISTINCT FROM NEW.organization_id THEN
   RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='INBOUND_PARENT_SCOPE_MISMATCH'; END IF;
  IF TG_TABLE_NAME='inbound_stock_items' THEN
   IF NEW.product_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.products p WHERE p.id=NEW.product_id AND p.organization_id=parent_org) THEN
   RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='INBOUND_PRODUCT_SCOPE_MISMATCH'; END IF;
  END IF;
 END IF;
 RETURN NEW;
END;
$$;
-- All callers of protected JSON receive an allowlist, never a keyword blacklist.
-- User-entered names/SKUs are copied verbatim; arbitrary free-text evidence is Owner-only.
CREATE OR REPLACE FUNCTION security_m2.operational_json(p jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT CASE jsonb_typeof(p) WHEN 'array' THEN
 (SELECT coalesce(jsonb_agg(security_m2.operational_json(v)),'[]'::jsonb) FROM jsonb_array_elements(p) v)
 WHEN 'object' THEN (SELECT coalesce(jsonb_object_agg(k,v),'{}'::jsonb) FROM jsonb_each(p) e(k,v)
 WHERE k IN ('product_id','product_name','name','sku','barcode','unit','category','qty','quantity','mode','source','movement_id','event_id')
 AND jsonb_typeof(v) IN ('string','number','boolean','null'))
 ELSE '{}'::jsonb END;
$$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA security_m2 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION security_m2.owner_of(uuid),security_m2.store_allowed(uuid,uuid),
 security_m2.require_owner(uuid,uuid),security_m2.require_store(uuid,uuid),security_m2.operational_json(jsonb) TO authenticated;


CREATE OR REPLACE FUNCTION public.get_club_owner_intelligence_v1(p_store_id uuid, p_from timestamp with time zone, p_to timestamp with time zone)
 RETURNS TABLE(store_id uuid, currency text, paid_revenue numeric, awaiting_revenue numeric, paid_orders integer, awaiting_orders integer, net_cash numeric, profit numeric, margin_pct numeric, cash_at_risk numeric, health text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_org_id uuid;
  v_role text;

  v_dash record;

  v_has_products boolean := (to_regclass('public.products') is not null);
  v_has_cost boolean := false;

  v_profit numeric := 0;
  v_paid numeric := 0;
  v_awaiting numeric := 0;
  v_paid_orders int := 0;
  v_awaiting_orders int := 0;
  v_currency text := 'TZS';
BEGIN
PERFORM security_m2.require_owner((SELECT s.organization_id FROM public.stores s WHERE s.id=p_store_id),p_store_id);
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  -- store -> organization_id
  select s.organization_id
    into v_org_id
  from public.stores s
  where s.id = p_store_id;

  if v_org_id is null then
    raise exception 'Store not found';
  end if;

  -- owner-only access (profit/cash intelligence)
  select m.role
    into v_role
  from public.org_memberships m
  where m.user_id = v_uid
    and m.organization_id = v_org_id
  limit 1;

  if v_role is null then
    raise exception 'Not a member of this organization';
  end if;

  if v_role <> 'owner' then
    raise exception 'Owner-only';
  end if;

  -- Base dashboard numbers from your existing canonical function
  select *
    into v_dash
  from public.get_club_revenue_dashboard_v2(
    p_store_id := p_store_id,
    p_from := p_from,
    p_to := p_to
  )
  limit 1;

  v_currency := coalesce(v_dash.currency::text, 'TZS');
  v_paid := coalesce(v_dash.paid_revenue, 0);
  v_awaiting := coalesce(v_dash.awaiting_revenue, 0);
  v_paid_orders := coalesce(v_dash.paid_orders, 0);
  v_awaiting_orders := coalesce(v_dash.awaiting_orders, 0);

  -- detect products.cost
  if v_has_products then
    select exists (
      select 1
      from information_schema.columns
      where table_schema='public'
        and table_name='products'
        and column_name='cost'
    ) into v_has_cost;
  end if;

  -- Profit (DELIVERED) only if products.cost exists AND club tables exist
  if v_has_cost
     and to_regclass('public.club_orders') is not null
     and to_regclass('public.club_order_items') is not null then

    -- profit from delivered orders in range
    select coalesce(sum( (coalesce(i.price,0) - coalesce(p.cost,0)) * coalesce(i.qty,0) ), 0)
      into v_profit
    from public.club_orders o
    join public.club_order_items i on i.order_id = o.id
    join public.products p on p.id = i.product_id
    where o.store_id = p_store_id
      and o.created_at >= p_from
      and o.created_at <= p_to
      and o.status = 'DELIVERED';

  else
    v_profit := 0;
  end if;

  store_id := p_store_id;
  currency := v_currency;

  paid_revenue := v_paid;
  awaiting_revenue := v_awaiting;
  paid_orders := v_paid_orders;
  awaiting_orders := v_awaiting_orders;

  -- Expenses are not connected here yet => net_cash = paid_revenue for now (safe baseline)
  net_cash := v_paid;

  profit := v_profit;
  margin_pct := case when coalesce(v_dash.revenue,0) > 0
                     then round( (v_profit / coalesce(v_dash.revenue,0)) * 100, 2)
                     else 0 end;

  cash_at_risk := v_awaiting;

  -- simple health rules (owner view)
  health := case
    when v_awaiting_orders >= 5 then 'RED'
    when v_awaiting_orders between 1 and 4 then 'YELLOW'
    else 'GREEN'
  end;

  return next;
end;
$function$;

REVOKE ALL ON FUNCTION public.get_club_owner_intelligence_v1(uuid,timestamp with time zone,timestamp with time zone) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.get_club_owner_intelligence_v1(uuid,timestamp with time zone,timestamp with time zone) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_store_net_profit(p_store_id uuid, p_from timestamp with time zone, p_to timestamp with time zone)
 RETURNS TABLE(sales_total numeric, expenses_total numeric, net_profit numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  v_org_id uuid;
  v_role text;
BEGIN
PERFORM security_m2.require_owner((SELECT s.organization_id FROM public.stores s WHERE s.id=p_store_id),p_store_id);
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if p_store_id is null then
    raise exception 'p_store_id is required';
  end if;

  if p_from is null or p_to is null then
    raise exception 'p_from and p_to are required';
  end if;

  if p_to <= p_from then
    raise exception 'Invalid range: p_to must be greater than p_from';
  end if;

  -- Get store org
  select s.organization_id
    into v_org_id
  from public.stores s
  where s.id = p_store_id;

  if v_org_id is null then
    raise exception 'Store not found';
  end if;

  -- Get caller role
  select m.role
    into v_role
  from public.org_memberships m
  where m.organization_id = v_org_id
    and m.user_id = auth.uid()
  limit 1;

  if v_role is null then
    raise exception 'No org membership';
  end if;

  -- OWNER ONLY (DORA v1)
  if v_role <> 'owner' then
    raise exception 'Not allowed: owner only';
  end if;

  return query
  with sales_in_range as (
    select s.id
    from public.sales s
    where s.store_id = p_store_id
      and coalesce(s.status, 'COMPLETED') = 'COMPLETED'
      and s.created_at >= p_from
      and s.created_at <  p_to
  ),
  sales_sum as (
    select
      coalesce(sum(coalesce(si.line_total, 0)::numeric), 0::numeric) as sales_total
    from public.sale_items si
    join sales_in_range sr on sr.id = si.sale_id
  ),
  expense_sum as (
    select
      coalesce(sum(coalesce(e.amount, 0)::numeric), 0::numeric) as expenses_total
    from public.expenses e
    where e.store_id = p_store_id
      and e.expense_date >= (p_from::date)
      and e.expense_date <= (p_to::date)
  )
  select
    ss.sales_total,
    es.expenses_total,
    (ss.sales_total - es.expenses_total)::numeric as net_profit
  from sales_sum ss
  cross join expense_sum es;

end;
$function$;

REVOKE ALL ON FUNCTION public.get_store_net_profit(uuid,timestamp with time zone,timestamp with time zone) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.get_store_net_profit(uuid,timestamp with time zone,timestamp with time zone) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_profit_summary(p_store_id uuid, p_from timestamp with time zone, p_to timestamp with time zone)
 RETURNS TABLE(sales_count integer, total_qty numeric, revenue numeric, net_profit numeric, covered_qty numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
declare
  v_org_id uuid;
  v_role text;
BEGIN
PERFORM security_m2.require_owner((SELECT s.organization_id FROM public.stores s WHERE s.id=p_store_id),p_store_id);
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if p_store_id is null then
    raise exception 'p_store_id is required';
  end if;

  if p_from is null or p_to is null then
    raise exception 'p_from and p_to are required';
  end if;

  if p_to <= p_from then
    raise exception 'Invalid range: p_to must be greater than p_from';
  end if;

  -- Get store org
  select s.organization_id
    into v_org_id
  from public.stores s
  where s.id = p_store_id;

  if v_org_id is null then
    raise exception 'Store not found';
  end if;

  -- Get caller role in that org
  select m.role
    into v_role
  from public.org_memberships m
  where m.organization_id = v_org_id
    and m.user_id = auth.uid()
  limit 1;

  if v_role is null then
    raise exception 'No org membership';
  end if;

  -- OWNER ONLY (DORA v1)
  if v_role <> 'owner' then
    raise exception 'Not allowed: owner only';
  end if;

  -- Compute (avoid join-duplication by separating sales + items)
  return query
  with sales_in_range as (
    select
      s.id,
      coalesce(s.total_amount, 0)::numeric as total_amount
    from public.sales s
    where s.store_id = p_store_id
      and s.sold_at >= p_from
      and s.sold_at <= p_to
      and coalesce(s.status, 'COMPLETED') = 'COMPLETED'
  ),
  item_rollup as (
    select
      -- total_qty numeric
      coalesce(sum(coalesce(si.qty, 0)::numeric), 0::numeric) as total_qty,

      -- net_profit numeric (explicit casts to prevent bigint/numeric mismatch)
      coalesce(
        sum(
          case
            when si.unit_cost is null then 0::numeric
            else
              (
                (coalesce(si.unit_price, 0)::numeric - si.unit_cost::numeric)
                * coalesce(si.qty, 0)::numeric
              )
          end
        ),
        0::numeric
      ) as net_profit,

      -- covered_qty numeric
      coalesce(
        sum(
          case
            when si.unit_cost is null then 0::numeric
            else coalesce(si.qty, 0)::numeric
          end
        ),
        0::numeric
      ) as covered_qty
    from public.sale_items si
    join sales_in_range sr on sr.id = si.sale_id
  ),
  sales_rollup as (
    select
      count(*)::integer as sales_count,
      coalesce(sum(sr.total_amount), 0::numeric) as revenue
    from sales_in_range sr
  )
  select
    coalesce(sr.sales_count, 0) as sales_count,
    coalesce(ir.total_qty, 0::numeric) as total_qty,
    coalesce(sr.revenue, 0::numeric) as revenue,
    coalesce(ir.net_profit, 0::numeric) as net_profit,
    coalesce(ir.covered_qty, 0::numeric) as covered_qty
  from sales_rollup sr
  cross join item_rollup ir;

end;
$function$;

REVOKE ALL ON FUNCTION public.get_profit_summary(uuid,timestamp with time zone,timestamp with time zone) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.get_profit_summary(uuid,timestamp with time zone,timestamp with time zone) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_my_notifications_v1(p_store_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 60)
 RETURNS TABLE(id uuid, organization_id uuid, store_id uuid, source_store_id uuid, event_type text, title text, body jsonb, items jsonb, total_units integer, total_skus integer, actor_user_id uuid, actor_name text, ref_movement_id uuid, created_by uuid, created_at timestamp with time zone, is_read boolean, read_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  return query
  with my_memberships as (
    select
      m.id as membership_id,
      m.organization_id,
      m.role
    from public.org_memberships m
    where m.user_id = auth.uid()
      and m.is_active = true
  )
  select
    n.id,
    n.organization_id,
    n.store_id,
    n.source_store_id,
    n.event_type,
    n.title,
    CASE WHEN security_m2.owner_of(n.organization_id) THEN n.body ELSE security_m2.operational_json(n.body) END,
    CASE WHEN security_m2.owner_of(n.organization_id) THEN n.items ELSE security_m2.operational_json(n.items) END,
    coalesce(n.total_units, 0)::int as total_units,
    coalesce(n.total_skus, 0)::int as total_skus,
    n.actor_user_id,
    n.actor_name,
    n.ref_movement_id,
    n.created_by,
    n.created_at,
    (nr.read_at is not null) as is_read,
    nr.read_at
  from public.notifications n
  join my_memberships mm
    on mm.organization_id = n.organization_id
  left join public.notification_reads nr
    on nr.notification_id = n.id
   and nr.user_id = auth.uid()
  where
    (
      p_store_id is null
      or n.store_id = p_store_id
    )
    and (
      mm.role in ('owner', 'admin')
      or exists (
        select 1
        from public.org_membership_stores ms
        where ms.membership_id = mm.membership_id
          and ms.store_id = n.store_id
      )
    )
  order by n.created_at desc
  limit greatest(1, least(coalesce(p_limit, 60), 200));
end;
$function$;

REVOKE ALL ON FUNCTION public.get_my_notifications_v1(uuid,integer) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.get_my_notifications_v1(uuid,integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_financial_dashboard_intelligent_v1(p_org_id uuid, p_store_id uuid DEFAULT NULL::uuid, p_date_from date DEFAULT CURRENT_DATE, p_date_to date DEFAULT CURRENT_DATE)
 RETURNS TABLE(org_id uuid, store_id uuid, date_from date, date_to date, stock_on_hand_value numeric, stock_in_value numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
BEGIN
PERFORM security_m2.require_owner(p_org_id,p_store_id);
  org_id := p_org_id;
  store_id := p_store_id;
  date_from := p_date_from;
  date_to := p_date_to;

  stock_on_hand_value := public.get_stock_on_hand_value_v1(p_org_id, p_store_id);
  stock_in_value := public.get_stock_in_value_v1(p_org_id, p_store_id, p_date_from, p_date_to);

  return next;
end;
$function$;

REVOKE ALL ON FUNCTION public.get_financial_dashboard_intelligent_v1(uuid,uuid,date,date) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.get_financial_dashboard_intelligent_v1(uuid,uuid,date,date) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_stock_on_hand_value_v1(p_org_id uuid, p_store_id uuid DEFAULT NULL::uuid)
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
declare
  v_membership_id uuid;
  v_role text;
  v_value numeric;
BEGIN
PERFORM security_m2.require_owner(p_org_id,p_store_id);
IF EXISTS(SELECT 1 FROM public.inventory i JOIN public.products p ON p.id=i.product_id WHERE i.organization_id=p_org_id AND (p_store_id IS NULL OR i.store_id=p_store_id) AND p.organization_id IS DISTINCT FROM i.organization_id) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='INVENTORY_PRODUCT_SCOPE_MISMATCH'; END IF;
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select membership_id, role
    into v_membership_id, v_role
  from public._resolve_my_membership_in_org(p_org_id);

  if v_membership_id is null then
    raise exception 'Not a member of this organization';
  end if;

  if v_role = 'staff' and p_store_id is null then
    raise exception 'Staff must query by store';
  end if;

  if p_store_id is not null then
    perform public._require_store_access_in_org(p_org_id, p_store_id);
  end if;

  select coalesce(
           sum(i.qty * coalesce(nullif(p.cost,0), p.cost_price, 0)),
           0
         )::numeric
    into v_value
  from public.inventory i
  join public.products p on p.id = i.product_id
  where i.organization_id = p_org_id
    and (p_store_id is null or i.store_id = p_store_id);

  return v_value;
end;
$function$;

REVOKE ALL ON FUNCTION public.get_stock_on_hand_value_v1(uuid,uuid) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.get_stock_on_hand_value_v1(uuid,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_stock_on_hand_value_v2(p_org_id uuid, p_store_id uuid DEFAULT NULL::uuid)
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
declare
  v_membership_id uuid;
  v_role text;
  v_value numeric;
BEGIN
PERFORM security_m2.require_owner(p_org_id,p_store_id);
IF EXISTS(SELECT 1 FROM public.inventory i JOIN public.products p ON p.id=i.product_id WHERE i.organization_id=p_org_id AND (p_store_id IS NULL OR i.store_id=p_store_id) AND p.organization_id IS DISTINCT FROM i.organization_id) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='INVENTORY_PRODUCT_SCOPE_MISMATCH'; END IF;
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  -- membership in org required
  select membership_id, role
    into v_membership_id, v_role
  from public._resolve_my_membership_in_org(p_org_id);

  if v_membership_id is null then
    raise exception 'Not a member of this organization';
  end if;

  -- staff must specify store_id (no org-wide)
  if v_role = 'staff' and p_store_id is null then
    raise exception 'Staff must query by store';
  end if;

  -- if store specified, enforce store access + store belongs to org
  if p_store_id is not null then
    perform public._require_store_access_in_org(p_org_id, p_store_id);
  end if;

  select coalesce(
           sum(
             i.qty * coalesce(nullif(p.cost, 0), p.cost_price, 0)
           ),
           0
         )::numeric
    into v_value
  from public.inventory i
  join public.products p on p.id = i.product_id
  where i.organization_id = p_org_id
    and (p_store_id is null or i.store_id = p_store_id);

  return v_value;
end;
$function$;

REVOKE ALL ON FUNCTION public.get_stock_on_hand_value_v2(uuid,uuid) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.get_stock_on_hand_value_v2(uuid,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.close_field_cycle_v1(p_cycle_id uuid, p_close_note text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
declare
  v_org_id uuid;
BEGIN
PERFORM security_m2.require_owner((SELECT c.organization_id FROM public.field_cycles c WHERE c.id=p_cycle_id),NULL::uuid);
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if p_cycle_id is null then
    raise exception 'p_cycle_id is required';
  end if;

  select c.organization_id
    into v_org_id
  from public.field_cycles c
  where c.id = p_cycle_id
  limit 1;

  if v_org_id is null then
    raise exception 'Field cycle not found';
  end if;

  if not exists (
    select 1
    from public.org_memberships m
    where m.organization_id = v_org_id
      and m.user_id = auth.uid()
      and coalesce(m.is_active, true) = true
      and m.role in ('owner', 'admin')
  ) then
    raise exception 'No access: owner/admin only';
  end if;

  update public.field_cycles
  set
    status = 'CLOSED',
    closed_by = auth.uid(),
    closed_at = now(),
    close_note = nullif(trim(coalesce(p_close_note, '')), ''),
    updated_at = now()
  where id = p_cycle_id
    and status = 'OPEN';

  if not found then
    raise exception 'Field cycle is already closed or not found';
  end if;

  return p_cycle_id;
end;
$function$;

REVOKE ALL ON FUNCTION public.close_field_cycle_v1(uuid,text) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.close_field_cycle_v1(uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_field_cycle_summary_v1(p_cycle_id uuid)
 RETURNS TABLE(cycle_id uuid, title text, target_amount numeric, total_allocated numeric, target_used numeric, operational_used numeric, total_spent numeric, remaining_balance numeric, status text, opened_at timestamp with time zone, closed_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
BEGIN
PERFORM security_m2.require_owner((SELECT c.organization_id FROM public.field_cycles c WHERE c.id=p_cycle_id),NULL::uuid);
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  return query
  select
    c.id,
    c.title,
    coalesce(c.target_amount, 0)::numeric,
    coalesce(sum(t.amount) filter (where t.type = 'ALLOCATE'), 0)::numeric as total_allocated,
    coalesce(sum(t.amount) filter (where t.type = 'EXPENSE' and t.purpose = 'TARGET'), 0)::numeric as target_used,
    coalesce(sum(t.amount) filter (where t.type = 'EXPENSE' and t.purpose = 'OPERATIONAL'), 0)::numeric as operational_used,
    coalesce(sum(t.amount) filter (where t.type = 'EXPENSE'), 0)::numeric as total_spent,
    (
      coalesce(sum(t.amount) filter (where t.type = 'ALLOCATE'), 0)
      - coalesce(sum(t.amount) filter (where t.type = 'EXPENSE'), 0)
    )::numeric as remaining_balance,
    c.status,
    c.opened_at,
    c.closed_at
  from public.field_cycles c
  left join public.field_wallet_transactions t
    on t.field_cycle_id = c.id
  where c.id = p_cycle_id
  group by c.id;
end;
$function$;

REVOKE ALL ON FUNCTION public.get_field_cycle_summary_v1(uuid) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.get_field_cycle_summary_v1(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_my_notifications(p_store_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 60)
 RETURNS TABLE(id uuid, organization_id uuid, store_id uuid, source_store_id uuid, event_type text, title text, body jsonb, items jsonb, total_units integer, total_skus integer, actor_user_id uuid, actor_name text, ref_movement_id uuid, created_by uuid, created_at timestamp with time zone, is_read boolean, read_at timestamp with time zone)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
  select * from public.get_my_notifications_v1(p_store_id, p_limit);
$function$;

REVOKE ALL ON FUNCTION public.get_my_notifications(uuid,integer) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.get_my_notifications(uuid,integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_store_sale_item_by_barcode(p_store_id uuid, p_barcode text)
 RETURNS TABLE(product_id uuid, name text, sku text, category text, unit text, barcode text, selling_price numeric, cost_price numeric, qty numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
declare
  v_org_id uuid;
  v_is_manage boolean := false;
  v_bc text;
BEGIN
PERFORM security_m2.require_store((SELECT s.organization_id FROM public.stores s WHERE s.id=p_store_id),p_store_id);
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if p_store_id is null then
    raise exception 'p_store_id is required';
  end if;

  v_bc := btrim(coalesce(p_barcode, ''));
  if v_bc = '' then
    raise exception 'p_barcode is required';
  end if;

  perform public.ensure_my_store_access(p_store_id);

  select s.organization_id
    into v_org_id
  from public.stores s
  where s.id = p_store_id;

  if v_org_id is null then
    raise exception 'Store not found';
  end if;

  v_is_manage := security_m2.owner_of(v_org_id);

  return query
  select
    p.id as product_id,
    p.name,
    p.sku,
    p.category,
    p.unit,
    p.barcode,
    p.selling_price,
    case
      when v_is_manage then p.cost_price
      else null
    end as cost_price,
    i.qty::numeric as qty
  from public.inventory i
  join public.products p
    on p.id = i.product_id
  where i.store_id = p_store_id
    and coalesce(i.qty, 0) > 0
    and p.is_active is true
    and p.organization_id = v_org_id
    and p.barcode is not null
    and length(btrim(p.barcode)) > 0
    and btrim(p.barcode) = v_bc
  limit 1;
end;
$function$;

REVOKE ALL ON FUNCTION public.get_store_sale_item_by_barcode(uuid,text) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.get_store_sale_item_by_barcode(uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_product_profit_report_v1(p_store_id uuid, p_from timestamp with time zone, p_to timestamp with time zone, p_limit integer DEFAULT 20)
 RETURNS TABLE(product_id uuid, product_name text, sku text, category text, unit text, qty_sold numeric, revenue numeric, estimated_cost numeric, gross_profit numeric, profit_margin_pct numeric, sales_count integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$BEGIN
PERFORM security_m2.require_owner((SELECT s.organization_id FROM public.stores s WHERE s.id=p_store_id),p_store_id);
RETURN QUERY select
    si.product_id,
    coalesce(p.name,'Product') as product_name,
    p.sku,
    p.category,
    p.unit,
    sum(si.qty) as qty_sold,
    sum(si.line_total) as revenue,
    sum(si.qty * coalesce(p.cost_price,0)) as estimated_cost,
    sum(si.line_total) - sum(si.qty * coalesce(p.cost_price,0)) as gross_profit,
    case
        when sum(si.line_total) > 0
        then ((sum(si.line_total) - sum(si.qty * coalesce(p.cost_price,0))) / sum(si.line_total)) * 100
        else 0
    end as profit_margin_pct,
    count(distinct s.id) as sales_count
from sales s
join sale_items si on si.sale_id = s.id
left join products p on p.id = si.product_id
where
    s.store_id = p_store_id
    and s.created_at >= p_from
    and s.created_at <= p_to
    and s.status != 'cancelled'
group by
    si.product_id,
    p.name,
    p.sku,
    p.category,
    p.unit
order by
    gross_profit desc
limit p_limit;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_product_profit_report_v1(uuid,timestamp with time zone,timestamp with time zone,integer) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.get_product_profit_report_v1(uuid,timestamp with time zone,timestamp with time zone,integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_product_profit_report_v2(p_store_id uuid, p_from timestamp with time zone, p_to timestamp with time zone, p_limit integer DEFAULT 20)
 RETURNS TABLE(product_id uuid, product_name text, sku text, category text, unit text, qty_sold numeric, revenue numeric, estimated_cost numeric, gross_profit numeric, profit_margin_pct numeric, sales_count integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$BEGIN
PERFORM security_m2.require_owner((SELECT s.organization_id FROM public.stores s WHERE s.id=p_store_id),p_store_id);
RETURN QUERY select
  si.product_id,
  coalesce(p.name,'Product') as product_name,
  p.sku,
  p.category,
  p.unit,
  sum(si.qty) as qty_sold,
  sum(si.qty * si.unit_price) as revenue,
  sum(si.qty * coalesce(si.unit_cost_price, p.cost_price, 0)) as estimated_cost,
  sum(si.qty * si.unit_price) -
  sum(si.qty * coalesce(si.unit_cost_price, p.cost_price, 0)) as gross_profit,
  case
    when sum(si.qty * si.unit_price) > 0 then
      (
        (sum(si.qty * si.unit_price) -
         sum(si.qty * coalesce(si.unit_cost_price, p.cost_price, 0)))
        / sum(si.qty * si.unit_price)
      ) * 100
    else 0
  end as profit_margin_pct,
  count(distinct s.id) as sales_count
from public.sale_items si
join public.sales s on s.id = si.sale_id
left join public.products p on p.id = si.product_id
where
  s.store_id = p_store_id
  and s.created_at >= p_from
  and s.created_at <= p_to
group by
  si.product_id, p.name, p.sku, p.category, p.unit
order by
  gross_profit desc
limit p_limit;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_product_profit_report_v2(uuid,timestamp with time zone,timestamp with time zone,integer) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.get_product_profit_report_v2(uuid,timestamp with time zone,timestamp with time zone,integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_stock_in_value_v1(p_org_id uuid, p_store_id uuid, p_date_from date, p_date_to date)
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
declare
  v_membership_id uuid;
  v_role text;
  v_value numeric;
BEGIN
PERFORM security_m2.require_owner(p_org_id,p_store_id);
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select membership_id, role
    into v_membership_id, v_role
  from public._resolve_my_membership_in_org(p_org_id);

  if v_membership_id is null then
    raise exception 'Not a member of this organization';
  end if;

  if v_role = 'staff' and p_store_id is null then
    raise exception 'Staff must query by store';
  end if;

  if p_store_id is not null then
    perform public._require_store_access_in_org(p_org_id, p_store_id);
  end if;

  if p_date_from is null or p_date_to is null then
    raise exception 'date_from and date_to are required';
  end if;

  if p_date_from > p_date_to then
    raise exception 'date_from cannot be after date_to';
  end if;

  with positive_inventory_movements as (
    select
      m.store_id,
      m.product_id,
      coalesce(m.delta, 0)::numeric as qty_in
    from public.inventory_movements m
    where m.organization_id = p_org_id
      and coalesce(m.delta, 0) > 0
      and (p_store_id is null or m.store_id = p_store_id)
      and (m.created_at::date between p_date_from and p_date_to)
  ),
  positive_stock_movements as (
    select
      sm.store_id,
      sm.product_id,
      case
        when upper(coalesce(sm.mode, '')) in ('ADD', 'IN') then coalesce(sm.amount, 0)::numeric
        else 0::numeric
      end as qty_in
    from public.stock_movements sm
    where sm.organization_id = p_org_id
      and upper(coalesce(sm.mode, '')) in ('ADD', 'IN')
      and coalesce(sm.amount, 0) > 0
      and (p_store_id is null or sm.store_id = p_store_id)
      and (sm.created_at::date between p_date_from and p_date_to)
  ),
  all_positive_moves as (
    select store_id, product_id, qty_in
    from positive_inventory_movements

    union all

    select sm.store_id, sm.product_id, sm.qty_in
    from positive_stock_movements sm
    where not exists (
      select 1
      from positive_inventory_movements im
      where im.store_id = sm.store_id
        and im.product_id = sm.product_id
        and im.qty_in = sm.qty_in
    )
  )
  select coalesce(
           sum(
             apm.qty_in * coalesce(p.cost, p.cost_price, 0)
           ),
           0
         )::numeric
    into v_value
  from all_positive_moves apm
  join public.products p
    on p.id = apm.product_id
  where p.organization_id = p_org_id;

  return coalesce(v_value, 0)::numeric;
end;
$function$;

REVOKE ALL ON FUNCTION public.get_stock_in_value_v1(uuid,uuid,date,date) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.get_stock_in_value_v1(uuid,uuid,date,date) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_capital_recovery_summary_v1(p_store_id uuid)
 RETURNS TABLE(total_asset numeric, total_cost numeric, total_income numeric, remaining_cost numeric, remaining_asset numeric, realized_profit numeric, entries_count bigint, last_entry_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$BEGIN
PERFORM security_m2.require_owner((SELECT s.organization_id FROM public.stores s WHERE s.id=p_store_id),p_store_id);
RETURN QUERY with base as (
    select
      coalesce(sum(case when e.entry_type = 'ASSET' then e.amount else 0 end), 0)::numeric as total_asset,
      coalesce(sum(case when e.entry_type = 'COST' then e.amount else 0 end), 0)::numeric as total_cost,
      coalesce(sum(case when e.entry_type = 'INCOME' then e.amount else 0 end), 0)::numeric as total_income,
      count(*)::bigint as entries_count,
      max(e.created_at) as last_entry_at
    from public.capital_recovery_entries e
    where e.store_id = p_store_id
  )
  select
    b.total_asset,
    b.total_cost,
    b.total_income,
    greatest(b.total_cost - b.total_income, 0)::numeric as remaining_cost,
    greatest(
      b.total_asset - greatest(b.total_income - b.total_cost, 0),
      0
    )::numeric as remaining_asset,
    greatest(b.total_income - b.total_cost - b.total_asset, 0)::numeric as realized_profit,
    b.entries_count,
    b.last_entry_at
  from base b
  where public.has_store_access(p_store_id);
END;
$function$;

REVOKE ALL ON FUNCTION public.get_capital_recovery_summary_v1(uuid) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.get_capital_recovery_summary_v1(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_capital_recovery_history_v1(p_store_id uuid, p_limit integer DEFAULT 20)
 RETURNS TABLE(id uuid, entry_type text, amount numeric, note text, created_at timestamp with time zone, created_by uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$BEGIN
PERFORM security_m2.require_owner((SELECT s.organization_id FROM public.stores s WHERE s.id=p_store_id),p_store_id);
RETURN QUERY select
    e.id,
    e.entry_type,
    e.amount,
    e.note,
    e.created_at,
    e.created_by
  from public.capital_recovery_entries e
  where e.store_id = p_store_id
    and public.has_store_access(p_store_id)
  order by e.created_at desc
  limit greatest(coalesce(p_limit, 20), 1);
END;
$function$;

REVOKE ALL ON FUNCTION public.get_capital_recovery_history_v1(uuid,integer) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.get_capital_recovery_history_v1(uuid,integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.allocate_field_wallet_v1(p_store_id uuid, p_membership_id uuid, p_amount numeric, p_note text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
declare
  v_org_id uuid;
  v_actor_role text;
  v_wallet_id uuid;
  v_before numeric := 0;
  v_after numeric := 0;
  v_cycle_id uuid;
BEGIN
PERFORM security_m2.require_owner((SELECT s.organization_id FROM public.stores s WHERE s.id=p_store_id),p_store_id);
PERFORM security_m2.require_store((SELECT s.organization_id FROM public.stores s WHERE s.id=p_store_id),p_store_id);
IF NOT EXISTS(SELECT 1 FROM public.org_memberships m JOIN public.org_membership_stores ms ON ms.membership_id=m.id JOIN public.stores s ON s.id=ms.store_id WHERE m.id=p_membership_id AND m.is_active IS TRUE AND ms.store_id=p_store_id AND m.organization_id=s.organization_id) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='WALLET_TARGET_SCOPE_REQUIRED'; END IF;
IF EXISTS(SELECT 1 FROM public.field_wallets w JOIN public.stores s ON s.id=w.store_id WHERE w.store_id=p_store_id AND w.membership_id=p_membership_id AND w.organization_id IS DISTINCT FROM s.organization_id) OR EXISTS(SELECT 1 FROM public.field_cycles c JOIN public.stores s ON s.id=c.store_id WHERE c.store_id=p_store_id AND c.status='OPEN' AND c.organization_id IS DISTINCT FROM s.organization_id) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='WALLET_EXISTING_SCOPE_MISMATCH'; END IF;
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if p_store_id is null then
    raise exception 'p_store_id is required';
  end if;

  if p_membership_id is null then
    raise exception 'p_membership_id is required';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'Amount must be greater than zero';
  end if;

  select s.organization_id
    into v_org_id
  from public.stores s
  where s.id = p_store_id
    and s.store_type = 'FIELD_PROCUREMENT'
    and coalesce(s.is_active, true) = true;

  if v_org_id is null then
    raise exception 'Invalid Field Procurement store';
  end if;

  select m.role
    into v_actor_role
  from public.org_memberships m
  where m.organization_id = v_org_id
    and m.user_id = auth.uid()
    and coalesce(m.is_active, true) = true
  limit 1;

  if v_actor_role not in ('owner', 'admin') then
    raise exception 'Only owner/admin can allocate field wallet funds';
  end if;

  select c.id
    into v_cycle_id
  from public.field_cycles c
  where c.store_id = p_store_id
    and c.status = 'OPEN'
  order by c.opened_at desc
  limit 1;

  if v_cycle_id is null then
    raise exception 'NO_ACTIVE_FIELD: Open a field cycle before allocating money';
  end if;

  if not exists (
    select 1
    from public.org_memberships m
    join public.org_membership_stores ms on ms.membership_id = m.id
    where m.id = p_membership_id
      and m.organization_id = v_org_id
      and ms.store_id = p_store_id
      and coalesce(m.is_active, true) = true
  ) then
    raise exception 'Target member is not assigned to this store';
  end if;

  insert into public.field_wallets (
    organization_id,
    store_id,
    membership_id,
    balance,
    created_by,
    is_active
  )
  values (
    v_org_id,
    p_store_id,
    p_membership_id,
    0,
    auth.uid(),
    true
  )
  on conflict (store_id, membership_id)
  do nothing;

  select w.id, w.balance
    into v_wallet_id, v_before
  from public.field_wallets w
  where w.store_id = p_store_id
    and w.membership_id = p_membership_id
    and w.organization_id = v_org_id
  for update;

  v_after := coalesce(v_before, 0) + p_amount;

  update public.field_wallets
  set
    balance = v_after,
    updated_at = now(),
    is_active = true
  where id = v_wallet_id;

  insert into public.field_wallet_transactions (
    wallet_id,
    organization_id,
    store_id,
    membership_id,
    field_cycle_id,
    type,
    amount,
    balance_before,
    balance_after,
    note,
    created_by
  )
  values (
    v_wallet_id,
    v_org_id,
    p_store_id,
    p_membership_id,
    v_cycle_id,
    'ALLOCATE',
    p_amount,
    coalesce(v_before, 0),
    v_after,
    nullif(trim(coalesce(p_note, '')), ''),
    auth.uid()
  );

  return v_wallet_id;
end;
$function$;

REVOKE ALL ON FUNCTION public.allocate_field_wallet_v1(uuid,uuid,numeric,text) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.allocate_field_wallet_v1(uuid,uuid,numeric,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.allocate_field_money_v1(p_store_id uuid, p_membership_id uuid, p_amount numeric, p_note text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
declare
  v_actor uuid;
  v_role text;
  v_wallet_id uuid;
  v_tx_id uuid;
BEGIN
PERFORM security_m2.require_owner((SELECT s.organization_id FROM public.stores s WHERE s.id=p_store_id),p_store_id);
  -- 1. Auth check
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'Not authenticated';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'Amount must be greater than 0';
  end if;

  -- 2. Check actor role (owner/admin)
  select lower(m.role)
  into v_role
  from public.org_memberships m
  where m.user_id = v_actor
    and m.organization_id = (
      select s.organization_id from public.stores s where s.id = p_store_id
    )
    and coalesce(m.is_active, true) = true
  limit 1;

  if v_role not in ('owner','admin') then
    raise exception 'No access: owner/admin only';
  end if;

  -- 3. Get or create wallet
  select w.id
  into v_wallet_id
  from public.field_wallets w
  where w.store_id = p_store_id
    and w.membership_id = p_membership_id
  limit 1;

  if v_wallet_id is null then
    insert into public.field_wallets (
      store_id,
      membership_id,
      balance,
      total_allocated
    )
    values (
      p_store_id,
      p_membership_id,
      0,
      0
    )
    returning id into v_wallet_id;
  end if;

  -- 4. Insert transaction
  insert into public.field_wallet_transactions (
    wallet_id,
    store_id,
    membership_id,
    amount,
    type,
    note,
    created_by
  )
  values (
    v_wallet_id,
    p_store_id,
    p_membership_id,
    p_amount,
    'ALLOCATE',
    p_note,
    v_actor
  )
  returning id into v_tx_id;

  -- 5. Update wallet balance
  update public.field_wallets
  set
    balance = coalesce(balance,0) + p_amount,
    total_allocated = coalesce(total_allocated,0) + p_amount,
    updated_at = now()
  where id = v_wallet_id;

  return v_tx_id;
end;
$function$;

REVOKE ALL ON FUNCTION public.allocate_field_money_v1(uuid,uuid,numeric,text) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.allocate_field_money_v1(uuid,uuid,numeric,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_active_field_cycle_summary_v1(p_store_id uuid)
 RETURNS TABLE(cycle_id uuid, organization_id uuid, store_id uuid, title text, target_amount numeric, total_allocated numeric, field_remaining numeric, total_expenses numeric, target_spent numeric, operational_spent numeric, agent_wallet_balance numeric, status text, opened_at timestamp with time zone, note text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp', 'auth'
AS $function$
declare
  v_org_id uuid;
  v_actor_membership_id uuid;
  v_actor_role text;
  v_cycle_id uuid;
BEGIN
PERFORM security_m2.require_owner((SELECT s.organization_id FROM public.stores s WHERE s.id=p_store_id),p_store_id);
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select s.organization_id
    into v_org_id
  from public.stores s
  where s.id = p_store_id
    and s.store_type = 'FIELD_PROCUREMENT'
    and coalesce(s.is_active, true) = true;

  if v_org_id is null then
    raise exception 'Invalid Field Procurement store';
  end if;

  select m.id, m.role
    into v_actor_membership_id, v_actor_role
  from public.org_memberships m
  where m.organization_id = v_org_id
    and m.user_id = auth.uid()
    and coalesce(m.is_active, true) = true
  limit 1;

  if v_actor_membership_id is null then
    raise exception 'Not a member of this organization';
  end if;

  select c.id
    into v_cycle_id
  from public.field_cycles c
  where c.store_id = p_store_id
    and c.status = 'OPEN'
  order by c.opened_at desc
  limit 1;

  if v_cycle_id is null then
    return;
  end if;

  return query
  select
    c.id as cycle_id,
    c.organization_id,
    c.store_id,
    c.title,
    coalesce(c.target_amount, 0)::numeric as target_amount,

    coalesce(sum(t.amount) filter (where t.type = 'ALLOCATE'), 0)::numeric as total_allocated,

    greatest(
      coalesce(c.target_amount, 0)
      - coalesce(sum(t.amount) filter (where t.type = 'ALLOCATE'), 0),
      0
    )::numeric as field_remaining,

    coalesce(sum(t.amount) filter (where t.type = 'EXPENSE'), 0)::numeric as total_expenses,

    coalesce(sum(t.amount) filter (
      where t.type = 'EXPENSE'
        and coalesce(t.purpose, '') = 'TARGET'
    ), 0)::numeric as target_spent,

    coalesce(sum(t.amount) filter (
      where t.type = 'EXPENSE'
        and coalesce(t.purpose, '') = 'OPERATIONAL'
    ), 0)::numeric as operational_spent,

    coalesce((
      select sum(w.balance)
      from public.field_wallets w
      where w.store_id = p_store_id
        and w.organization_id = v_org_id
    ), 0)::numeric as agent_wallet_balance,

    c.status::text,
    c.opened_at,
    c.note
  from public.field_cycles c
  left join public.field_wallet_transactions t
    on t.field_cycle_id = c.id
   and t.store_id = c.store_id
  where c.id = v_cycle_id
    and c.organization_id = v_org_id
    and (
      v_actor_role in ('owner', 'admin')
      or exists (
        select 1
        from public.field_wallets w
        where w.store_id = p_store_id
          and w.membership_id = v_actor_membership_id
      )
    )
  group by
    c.id,
    c.organization_id,
    c.store_id,
    c.title,
    c.target_amount,
    c.status,
    c.opened_at,
    c.note;
end;
$function$;

REVOKE ALL ON FUNCTION public.get_active_field_cycle_summary_v1(uuid) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.get_active_field_cycle_summary_v1(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_field_wallet_history_by_cycle_v1(p_store_id uuid, p_cycle_id uuid)
 RETURNS TABLE(id uuid, type text, amount numeric, purpose text, category text, note text, agent_email text, created_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
BEGIN
PERFORM security_m2.require_owner((SELECT s.organization_id FROM public.stores s WHERE s.id=p_store_id),p_store_id);
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  return query
  select
    t.id::uuid,
    t.type::text,
    coalesce(t.amount, 0)::numeric,
    coalesce(t.purpose, 'OPERATIONAL')::text,
    coalesce(t.category, 'OTHER')::text,
    t.note::text,
    coalesce(u.email, '')::text,
    t.created_at::timestamptz
  from public.field_wallet_transactions t
  left join public.org_memberships m on m.id = t.membership_id
  left join auth.users u on u.id = m.user_id
  where t.store_id = p_store_id
    and t.field_cycle_id = p_cycle_id
  order by t.created_at desc;
end;
$function$;

REVOKE ALL ON FUNCTION public.get_field_wallet_history_by_cycle_v1(uuid,uuid) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.get_field_wallet_history_by_cycle_v1(uuid,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_capital_recovery_history_v2(p_store_id uuid, p_limit integer)
 RETURNS TABLE(id uuid, entry_type text, amount numeric, note text, created_at timestamp with time zone, created_by uuid, created_by_name text, created_role text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  v_role text;
BEGIN
PERFORM security_m2.require_owner((SELECT s.organization_id FROM public.stores s WHERE s.id=p_store_id),p_store_id);
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  perform public.assert_my_store_access(p_store_id);

  v_role := public.get_my_capital_recovery_role_v1(p_store_id);

  return query
  select
    e.id,
    e.entry_type,
    e.amount,
    e.note,
    e.created_at,
    e.created_by,

    -- 🔥 HII NDIO FIX HALISI
    coalesce(
      nullif(trim(u.email), ''),
      'Unknown'
    ) as created_by_name,

    coalesce(nullif(trim(e.created_role), ''), 'staff') as created_role

  from public.capital_recovery_entries e
  left join auth.users u
    on u.id = e.created_by

  where e.store_id = p_store_id
    and (
      coalesce(v_role, '') = 'owner'
      or e.entry_type <> 'ASSET'
    )
  order by e.created_at desc
  limit greatest(coalesce(p_limit, 20), 1);
end;
$function$;

REVOKE ALL ON FUNCTION public.get_capital_recovery_history_v2(uuid,integer) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.get_capital_recovery_history_v2(uuid,integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_store_net_profit_v2(p_store_id uuid, p_from timestamp with time zone, p_to timestamp with time zone)
 RETURNS TABLE(sales_total numeric, cogs_total numeric, expenses_total numeric, net_profit numeric, orders_count integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
declare
  v_sales numeric := 0;
  v_expenses numeric := 0;
  v_cogs numeric := 0;
  v_orders integer := 0;

  v_qty_col text;
  v_cost_col text;
  v_sql text;
BEGIN
PERFORM security_m2.require_owner((SELECT s.organization_id FROM public.stores s WHERE s.id=p_store_id),p_store_id);
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if p_store_id is null then
    raise exception 'p_store_id is required';
  end if;

  if p_from is null or p_to is null then
    raise exception 'p_from and p_to are required';
  end if;

  if p_to <= p_from then
    raise exception 'Invalid range';
  end if;

  -- OWNER ONLY
  if not exists (
    select 1
    from public.org_memberships m
    join public.stores s
      on s.organization_id = m.organization_id
    where s.id = p_store_id
      and m.user_id = auth.uid()
      and m.is_active = true
      and m.role = 'owner'
  ) then
    raise exception 'Owner only';
  end if;

  -- SALES + ORDERS
  select
    coalesce(sum(coalesce(s.grand_total, s.total_amount, 0)), 0),
    count(*)::int
  into
    v_sales,
    v_orders
  from public.sales s
  where s.store_id = p_store_id
    and s.sold_at >= p_from
    and s.sold_at < p_to
    and coalesce(s.status, 'COMPLETED') = 'COMPLETED';

  -- EXPENSES
  select
    coalesce(sum(coalesce(e.amount, 0)), 0)
  into
    v_expenses
  from public.expenses e
  where e.store_id = p_store_id
    and e.expense_date >= timezone('Africa/Dar_es_Salaam', p_from)::date
    and e.expense_date <= timezone('Africa/Dar_es_Salaam', p_to)::date;

  -- AUTO DETECT QTY
  select c.column_name
  into v_qty_col
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name = 'sale_items'
    and c.column_name in ('quantity', 'qty')
  order by case c.column_name
    when 'quantity' then 1
    when 'qty' then 2
    else 99
  end
  limit 1;

  -- AUTO DETECT COST
  select c.column_name
  into v_cost_col
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name = 'sale_items'
    and c.column_name in ('unit_cost', 'cost_price', 'buying_price')
  order by case c.column_name
    when 'unit_cost' then 1
    when 'cost_price' then 2
    when 'buying_price' then 3
    else 99
  end
  limit 1;

  -- COGS CALC
  if v_qty_col is not null and v_cost_col is not null then
    v_sql := format(
      'select coalesce(sum(coalesce(si.%I, 0) * coalesce(si.%I, 0)), 0)
       from public.sale_items si
       join public.sales s on s.id = si.sale_id
       where s.store_id = $1
         and s.sold_at >= $2
         and s.sold_at < $3
         and coalesce(s.status, ''COMPLETED'') = ''COMPLETED''',
      v_qty_col,
      v_cost_col
    );

    execute v_sql into v_cogs using p_store_id, p_from, p_to;
  else
    raise exception 'COGS columns not found in sale_items';
  end if;

  sales_total := coalesce(v_sales, 0);
  cogs_total := coalesce(v_cogs, 0);
  expenses_total := coalesce(v_expenses, 0);
  net_profit := coalesce(v_sales, 0) - coalesce(v_cogs, 0) - coalesce(v_expenses, 0);
  orders_count := coalesce(v_orders, 0);

  return next;
end;
$function$;

REVOKE ALL ON FUNCTION public.get_store_net_profit_v2(uuid,timestamp with time zone,timestamp with time zone) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.get_store_net_profit_v2(uuid,timestamp with time zone,timestamp with time zone) TO authenticated;

CREATE OR REPLACE FUNCTION public.record_field_expense_v1(p_store_id uuid, p_membership_id uuid, p_amount numeric, p_note text DEFAULT NULL::text, p_purpose text DEFAULT 'OPERATIONAL'::text, p_category text DEFAULT 'OTHER'::text, p_item_name text DEFAULT NULL::text, p_unit text DEFAULT NULL::text, p_quantity numeric DEFAULT NULL::numeric, p_expected_unit_price numeric DEFAULT NULL::numeric, p_actual_unit_price numeric DEFAULT NULL::numeric, p_variance_note text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
declare
  v_wallet_id uuid;
  v_org_id uuid;
  v_balance_before numeric;
  v_balance_after numeric;
  v_txn_id uuid;
  v_cycle_id uuid;
  v_purpose text;
  v_category text;
  v_item_name text;
  v_unit text;
  v_quantity numeric;
  v_expected numeric;
  v_actual numeric;
  v_variance numeric;
BEGIN
PERFORM security_m2.require_owner((SELECT s.organization_id FROM public.stores s WHERE s.id=p_store_id),p_store_id);
PERFORM security_m2.require_store((SELECT s.organization_id FROM public.stores s WHERE s.id=p_store_id),p_store_id);
IF NOT EXISTS(SELECT 1 FROM public.org_memberships m JOIN public.org_membership_stores ms ON ms.membership_id=m.id JOIN public.stores s ON s.id=ms.store_id WHERE m.id=p_membership_id AND m.is_active IS TRUE AND ms.store_id=p_store_id AND m.organization_id=s.organization_id) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='WALLET_TARGET_SCOPE_REQUIRED'; END IF;
IF EXISTS(SELECT 1 FROM public.field_wallets w JOIN public.stores s ON s.id=w.store_id WHERE w.store_id=p_store_id AND w.membership_id=p_membership_id AND w.organization_id IS DISTINCT FROM s.organization_id) OR EXISTS(SELECT 1 FROM public.field_cycles c JOIN public.stores s ON s.id=c.store_id WHERE c.store_id=p_store_id AND c.status='OPEN' AND c.organization_id IS DISTINCT FROM s.organization_id) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='WALLET_EXISTING_SCOPE_MISMATCH'; END IF;
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if p_store_id is null then
    raise exception 'p_store_id is required';
  end if;

  if p_membership_id is null then
    raise exception 'p_membership_id is required';
  end if;

  if coalesce(p_amount, 0) <= 0 then
    raise exception 'Amount must be greater than zero';
  end if;

  select c.id
    into v_cycle_id
  from public.field_cycles c
  where c.store_id = p_store_id
    and c.status = 'OPEN'
  order by c.opened_at desc
  limit 1;

  if v_cycle_id is null then
    raise exception 'NO_ACTIVE_FIELD: Open a field cycle before recording expense';
  end if;

  v_purpose := upper(trim(coalesce(p_purpose, 'OPERATIONAL')));
  v_category := upper(trim(coalesce(p_category, 'OTHER')));

  if v_purpose not in ('TARGET', 'OPERATIONAL') then
    v_purpose := 'OPERATIONAL';
  end if;

  v_item_name := nullif(trim(coalesce(p_item_name, '')), '');
  v_unit := nullif(trim(coalesce(p_unit, '')), '');
  v_quantity := nullif(p_quantity, 0);
  v_expected := nullif(p_expected_unit_price, 0);
  v_actual := nullif(p_actual_unit_price, 0);

  if v_actual is null and v_quantity is not null and v_quantity > 0 then
    v_actual := p_amount / v_quantity;
  end if;

  if v_expected is not null and v_actual is not null then
    v_variance := v_actual - v_expected;
  else
    v_variance := null;
  end if;

  select w.id, w.organization_id, coalesce(w.balance, 0)
    into v_wallet_id, v_org_id, v_balance_before
  from public.field_wallets w
  where w.store_id = p_store_id
    and w.membership_id = p_membership_id
    and coalesce(w.is_active, true) = true
  for update;

  if v_wallet_id is null then
    raise exception 'Wallet not found for this agent';
  end if;

  if v_balance_before < p_amount then
    raise exception 'Insufficient wallet balance';
  end if;

  v_balance_after := v_balance_before - p_amount;

  insert into public.field_wallet_transactions (
    wallet_id,
    organization_id,
    store_id,
    membership_id,
    field_cycle_id,
    type,
    amount,
    balance_before,
    balance_after,
    note,
    purpose,
    category,
    item_name,
    unit,
    quantity,
    expected_unit_price,
    actual_unit_price,
    variance_amount,
    variance_note,
    created_by
  )
  values (
    v_wallet_id,
    v_org_id,
    p_store_id,
    p_membership_id,
    v_cycle_id,
    'EXPENSE',
    p_amount,
    v_balance_before,
    v_balance_after,
    nullif(trim(coalesce(p_note, '')), ''),
    v_purpose,
    v_category,
    v_item_name,
    v_unit,
    v_quantity,
    v_expected,
    v_actual,
    v_variance,
    nullif(trim(coalesce(p_variance_note, '')), ''),
    auth.uid()
  )
  returning id into v_txn_id;

  update public.field_wallets
  set
    balance = v_balance_after,
    updated_at = now()
  where id = v_wallet_id;

  return v_txn_id;
end;
$function$;

REVOKE ALL ON FUNCTION public.record_field_expense_v1(uuid,uuid,numeric,text,text,text,text,text,numeric,numeric,numeric,text) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.record_field_expense_v1(uuid,uuid,numeric,text,text,text,text,text,numeric,numeric,numeric,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.open_field_cycle_v1(p_store_id uuid, p_title text, p_target_amount numeric DEFAULT 0, p_note text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
declare
  v_org_id uuid;
  v_cycle_id uuid;
BEGIN
PERFORM security_m2.require_owner((SELECT s.organization_id FROM public.stores s WHERE s.id=p_store_id),p_store_id);
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select s.organization_id
  into v_org_id
  from public.stores s
  where s.id = p_store_id
    and s.store_type = 'FIELD_PROCUREMENT'
    and coalesce(s.is_active, true) = true;

  if v_org_id is null then
    raise exception 'Invalid Field Procurement store';
  end if;

  if not exists (
    select 1 from public.org_memberships m
    where m.organization_id = v_org_id
      and m.user_id = auth.uid()
      and coalesce(m.is_active, true) = true
      and m.role in ('owner','admin')
  ) then
    raise exception 'No access: owner/admin only';
  end if;

  if exists (
    select 1 from public.field_cycles c
    where c.store_id = p_store_id
      and c.status = 'OPEN'
  ) then
    raise exception 'ACTIVE_FIELD_EXISTS: Close current field before opening a new one';
  end if;

  -- ✅ New field starts fresh, old history stays in transactions
  update public.field_wallets
  set balance = 0,
      updated_at = now()
  where store_id = p_store_id
    and organization_id = v_org_id;

  insert into public.field_cycles (
    organization_id, store_id, title, target_amount, status, opened_by, note
  )
  values (
    v_org_id,
    p_store_id,
    trim(p_title),
    greatest(coalesce(p_target_amount, 0), 0),
    'OPEN',
    auth.uid(),
    nullif(trim(coalesce(p_note, '')), '')
  )
  returning id into v_cycle_id;

  return v_cycle_id;
end;
$function$;

REVOKE ALL ON FUNCTION public.open_field_cycle_v1(uuid,text,numeric,text) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.open_field_cycle_v1(uuid,text,numeric,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_business_statement_goods_summary_v2(p_store_id uuid, p_from timestamp with time zone, p_to timestamp with time zone)
 RETURNS TABLE(total_goods_purchased numeric, purchase_orders bigint, total_items_purchased numeric, supplier_outstanding numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
BEGIN
PERFORM security_m2.require_owner((SELECT s.organization_id FROM public.stores s WHERE s.id=p_store_id),p_store_id);
  /*
   * ============================================================
   * SECURITY / INPUT VALIDATION
   * ============================================================
   */

  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if p_store_id is null then
    raise exception 'p_store_id is required';
  end if;

  if p_from is null or p_to is null then
    raise exception 'p_from and p_to are required';
  end if;

  if p_to <= p_from then
    raise exception 'Invalid range';
  end if;

  -- OWNER ONLY
  if not exists (
    select 1
    from public.org_memberships m
    join public.stores s
      on s.organization_id = m.organization_id
    where s.id = p_store_id
      and m.user_id = auth.uid()
      and m.is_active = true
      and m.role = 'owner'
  ) then
    raise exception 'Owner only';
  end if;

  /*
   * ============================================================
   * CANONICAL GOODS PURCHASED
   * ============================================================
   *
   * stock_movements:
   *   actual receiving event + actual received quantity
   *
   * inbound_stock_items:
   *   historical purchase unit cost
   *
   * Only ADD movements linked to a real inbound order qualify.
   *
   * We intentionally DO NOT use:
   *   stock_movements.unit_cost
   *   stock_movements.total_cost
   *   products.cost / cost_price
   *
   * because production audit proved that valid inbound receipts
   * can contain zero movement cost while inbound_stock_items
   * contains the correct historical purchase cost.
   */

  return query

  with receipt_lines as (
    select
      o.id as inbound_order_id,

      abs(coalesce(sm.amount, 0))::numeric
        as received_qty,

      (
        abs(coalesce(sm.amount, 0))
        * coalesce(i.unit_cost, 0)
      )::numeric
        as received_goods_value

    from public.stock_movements sm

    join public.inbound_stock_orders o
      on o.store_id = sm.store_id
     and o.organization_id = sm.organization_id
     and o.order_code = sm.supplier_invoice_no

    join public.inbound_stock_items i
      on i.inbound_order_id = o.id
     and i.organization_id = o.organization_id
     and i.product_id = sm.product_id

    where sm.store_id = p_store_id

      and upper(coalesce(sm.mode, '')) = 'ADD'

      and sm.created_at >= p_from
      and sm.created_at <= p_to

      and o.deleted_at is null

      and upper(coalesce(o.status, '')) = 'RECEIVED'

      and abs(coalesce(sm.amount, 0)) > 0
  ),

  period_orders as (
    select distinct
      rl.inbound_order_id
    from receipt_lines rl
  ),

  supplier_balance as (
    /*
     * Current outstanding balance belonging specifically
     * to purchase orders represented in this statement period.
     *
     * Production audit confirmed:
     *
     * total_paid_amount = SUM(inbound_stock_payments.amount)
     *
     * total_balance_amount =
     * total_goods_value - total payments
     */

    select
      coalesce(
        sum(
          greatest(
            coalesce(o.total_balance_amount, 0),
            0
          )
        ),
        0
      )::numeric as balance

    from public.inbound_stock_orders o

    join period_orders po
      on po.inbound_order_id = o.id

    where o.store_id = p_store_id
      and o.deleted_at is null
      and upper(coalesce(o.status, '')) = 'RECEIVED'
  )

  select
    coalesce(
      sum(rl.received_goods_value),
      0
    )::numeric
      as total_goods_purchased,

    count(
      distinct rl.inbound_order_id
    )::bigint
      as purchase_orders,

    coalesce(
      sum(rl.received_qty),
      0
    )::numeric
      as total_items_purchased,

    coalesce(
      (
        select sb.balance
        from supplier_balance sb
      ),
      0
    )::numeric
      as supplier_outstanding

  from receipt_lines rl;

end;
$function$;

REVOKE ALL ON FUNCTION public.get_business_statement_goods_summary_v2(uuid,timestamp with time zone,timestamp with time zone) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.get_business_statement_goods_summary_v2(uuid,timestamp with time zone,timestamp with time zone) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_field_wallet_summary_v1(p_store_id uuid)
 RETURNS TABLE(wallet_id uuid, organization_id uuid, store_id uuid, membership_id uuid, agent_email text, agent_role text, balance numeric, total_allocated numeric, total_purchases numeric, total_expenses numeric, total_adjustments numeric, last_activity_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp', 'auth'
AS $function$
declare
  v_org_id uuid;
  v_actor_membership_id uuid;
  v_actor_role text;
  v_cycle_id uuid;
BEGIN
PERFORM security_m2.require_owner((SELECT s.organization_id FROM public.stores s WHERE s.id=p_store_id),p_store_id);
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select s.organization_id
  into v_org_id
  from public.stores s
  where s.id = p_store_id
    and s.store_type = 'FIELD_PROCUREMENT'
    and coalesce(s.is_active, true) = true;

  if v_org_id is null then
    raise exception 'Invalid Field Procurement store';
  end if;

  select m.id, m.role
  into v_actor_membership_id, v_actor_role
  from public.org_memberships m
  where m.organization_id = v_org_id
    and m.user_id = auth.uid()
    and coalesce(m.is_active, true) = true
  limit 1;

  if v_actor_membership_id is null then
    raise exception 'Not a member of this organization';
  end if;

  select c.id
  into v_cycle_id
  from public.field_cycles c
  where c.store_id = p_store_id
    and c.status = 'OPEN'
  order by c.opened_at desc
  limit 1;

  -- ✅ No active field = no old wallet summary
  if v_cycle_id is null then
    return;
  end if;

  return query
  select
    w.id,
    w.organization_id,
    w.store_id,
    w.membership_id,
    coalesce(u.email, '—')::text,
    coalesce(m.role, 'staff')::text,
    coalesce(w.balance, 0)::numeric,
    coalesce(sum(t.amount) filter (where t.type = 'ALLOCATE'), 0)::numeric,
    coalesce(sum(t.amount) filter (where t.type = 'PURCHASE'), 0)::numeric,
    coalesce(sum(t.amount) filter (where t.type = 'EXPENSE'), 0)::numeric,
    coalesce(sum(t.amount) filter (where t.type = 'ADJUST'), 0)::numeric,
    max(t.created_at)
  from public.field_wallets w
  join public.org_memberships m on m.id = w.membership_id
  left join auth.users u on u.id = m.user_id
  join public.field_wallet_transactions t
    on t.wallet_id = w.id
   and t.field_cycle_id = v_cycle_id
  where w.store_id = p_store_id
    and w.organization_id = v_org_id
    and (
      v_actor_role in ('owner', 'admin')
      or w.membership_id = v_actor_membership_id
    )
  group by w.id, w.organization_id, w.store_id, w.membership_id, u.email, m.role, w.balance
  order by max(t.created_at) desc;
end;
$function$;

REVOKE ALL ON FUNCTION public.get_field_wallet_summary_v1(uuid) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.get_field_wallet_summary_v1(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_field_stock_summary_v1(p_store_id uuid)
 RETURNS TABLE(item_name text, unit text, total_quantity numeric, total_amount numeric, avg_unit_price numeric, records_count bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
BEGIN
PERFORM security_m2.require_owner((SELECT s.organization_id FROM public.stores s WHERE s.id=p_store_id),p_store_id);
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  return query
  select
    coalesce(nullif(trim(t.item_name), ''), 'Unknown Item')::text as item_name,
    coalesce(nullif(trim(t.unit), ''), 'unit')::text as unit,
    coalesce(sum(t.quantity), 0)::numeric as total_quantity,
    coalesce(sum(t.amount), 0)::numeric as total_amount,
    case
      when coalesce(sum(t.quantity), 0) > 0
      then (coalesce(sum(t.amount), 0) / coalesce(sum(t.quantity), 0))::numeric
      else 0::numeric
    end as avg_unit_price,
    count(t.id)::bigint as records_count
  from public.field_wallet_transactions t
  where t.store_id = p_store_id
    and t.type = 'EXPENSE'
    and coalesce(t.purpose, 'OPERATIONAL') = 'TARGET'
    and nullif(trim(coalesce(t.item_name, '')), '') is not null
  group by
    coalesce(nullif(trim(t.item_name), ''), 'Unknown Item'),
    coalesce(nullif(trim(t.unit), ''), 'unit')
  order by item_name asc, unit asc;
end;
$function$;

REVOKE ALL ON FUNCTION public.get_field_stock_summary_v1(uuid) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.get_field_stock_summary_v1(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_business_statement_capital_recovery_v1(p_store_id uuid, p_from timestamp with time zone, p_to timestamp with time zone)
 RETURNS TABLE(id uuid, entry_type text, amount numeric, note text, created_at timestamp with time zone, created_by uuid, created_by_name text, created_role text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
declare
  v_role text;
BEGIN
PERFORM security_m2.require_owner((SELECT s.organization_id FROM public.stores s WHERE s.id=p_store_id),p_store_id);
  /*
   * ============================================================
   * SECURITY / INPUT VALIDATION
   * ============================================================
   */

  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if p_store_id is null then
    raise exception 'p_store_id is required';
  end if;

  if p_from is null or p_to is null then
    raise exception 'p_from and p_to are required';
  end if;

  if p_to < p_from then
    raise exception 'Invalid range';
  end if;

  /*
   * Existing canonical store-access path.
   */
  perform public.assert_my_store_access(p_store_id);

  v_role := public.get_my_capital_recovery_role_v1(p_store_id);

  if coalesce(v_role, '') <> 'owner' then
    raise exception 'Owner only';
  end if;

  /*
   * ============================================================
   * BUSINESS STATEMENT CAPITAL RECOVERY
   * ============================================================
   *
   * Database filters the requested statement period directly.
   *
   * No p_limit.
   * No frontend date filtering required.
   * Owner receives ASSET + COST + INCOME.
   */

  return query
  select
    e.id,
    upper(trim(e.entry_type)) as entry_type,
    e.amount,
    e.note,
    e.created_at,
    e.created_by,

    coalesce(
      nullif(trim(u.email), ''),
      'Unknown'
    ) as created_by_name,

    coalesce(
      nullif(trim(e.created_role), ''),
      'staff'
    ) as created_role

  from public.capital_recovery_entries e

  left join auth.users u
    on u.id = e.created_by

  where e.store_id = p_store_id
    and e.created_at >= p_from
    and e.created_at <= p_to
    and upper(trim(e.entry_type)) in ('ASSET', 'COST', 'INCOME')

  order by e.created_at desc;
end;
$function$;

REVOKE ALL ON FUNCTION public.get_business_statement_capital_recovery_v1(uuid,timestamp with time zone,timestamp with time zone) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.get_business_statement_capital_recovery_v1(uuid,timestamp with time zone,timestamp with time zone) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_active_field_cycle_v1(p_store_id uuid)
 RETURNS TABLE(cycle_id uuid, organization_id uuid, store_id uuid, title text, target_amount numeric, status text, opened_at timestamp with time zone, opened_by uuid, note text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
BEGIN
PERFORM security_m2.require_owner((SELECT s.organization_id FROM public.stores s WHERE s.id=p_store_id),p_store_id);
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  return query
  select
    c.id,
    c.organization_id,
    c.store_id,
    c.title,
    c.target_amount,
    c.status,
    c.opened_at,
    c.opened_by,
    c.note
  from public.field_cycles c
  where c.store_id = p_store_id
    and c.status = 'OPEN'
  order by c.opened_at desc
  limit 1;
end;
$function$;

REVOKE ALL ON FUNCTION public.get_active_field_cycle_v1(uuid) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.get_active_field_cycle_v1(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_field_cycles_history_v1(p_store_id uuid)
 RETURNS TABLE(cycle_id uuid, organization_id uuid, store_id uuid, title text, target_amount numeric, status text, opened_at timestamp with time zone, closed_at timestamp with time zone, note text, total_allocated numeric, total_target_spent numeric, total_operational_spent numeric, total_spent numeric, agent_wallet_balance numeric, field_remaining numeric, records_count bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
declare
  v_membership_id uuid;
  v_role text;
  v_can_manage boolean := false;
BEGIN
PERFORM security_m2.require_owner((SELECT s.organization_id FROM public.stores s WHERE s.id=p_store_id),p_store_id);
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select m.id, lower(coalesce(m.role, ''))
    into v_membership_id, v_role
  from public.org_memberships m
  join public.stores s on s.organization_id = m.organization_id
  where s.id = p_store_id
    and m.user_id = auth.uid()
    and coalesce(m.is_active, true) = true
  limit 1;

  if v_membership_id is null then
    raise exception 'No access to this store';
  end if;

  v_can_manage := v_role in ('owner', 'admin');

  return query
  select
    c.id::uuid,
    c.organization_id::uuid,
    c.store_id::uuid,
    c.title::text,

    case when v_can_manage then coalesce(c.target_amount, 0) else 0 end::numeric,

    c.status::text,
    c.opened_at,
    c.closed_at,
    c.note::text,

    coalesce(sum(t.amount) filter (where t.type = 'ALLOCATE'), 0)::numeric,
    coalesce(sum(t.amount) filter (where t.type = 'EXPENSE' and coalesce(t.purpose, 'OPERATIONAL') = 'TARGET'), 0)::numeric,
    coalesce(sum(t.amount) filter (where t.type = 'EXPENSE' and coalesce(t.purpose, 'OPERATIONAL') = 'OPERATIONAL'), 0)::numeric,
    coalesce(sum(t.amount) filter (where t.type = 'EXPENSE'), 0)::numeric,

    greatest(
      coalesce(sum(t.amount) filter (where t.type = 'ALLOCATE'), 0)
      - coalesce(sum(t.amount) filter (where t.type = 'EXPENSE'), 0),
      0
    )::numeric,

    case
      when v_can_manage then greatest(
        coalesce(c.target_amount, 0)
        - coalesce(sum(t.amount) filter (where t.type = 'ALLOCATE'), 0),
        0
      )
      else 0
    end::numeric,

    count(t.id)::bigint
  from public.field_cycles c
  left join public.field_wallet_transactions t
    on t.field_cycle_id = c.id
   and (
     v_can_manage
     or t.membership_id = v_membership_id
   )
  where c.store_id = p_store_id
    and (
      v_can_manage
      or exists (
        select 1
        from public.field_wallet_transactions tx
        where tx.field_cycle_id = c.id
          and tx.membership_id = v_membership_id
      )
    )
  group by c.id
  order by
    case when c.status = 'OPEN' then 0 else 1 end,
    c.opened_at desc;
end;
$function$;

REVOKE ALL ON FUNCTION public.get_field_cycles_history_v1(uuid) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.get_field_cycles_history_v1(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_field_wallet_history_v1(p_store_id uuid)
 RETURNS TABLE(id uuid, field_cycle_id uuid, type text, amount numeric, purpose text, category text, note text, agent_email text, created_at timestamp with time zone, item_name text, unit text, quantity numeric, actual_unit_price numeric, normalized_unit text, normalized_quantity numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
declare
  v_membership_id uuid;
  v_role text;
  v_can_manage boolean := false;
BEGIN
PERFORM security_m2.require_owner((SELECT s.organization_id FROM public.stores s WHERE s.id=p_store_id),p_store_id);
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select m.id, lower(coalesce(m.role, ''))
    into v_membership_id, v_role
  from public.org_memberships m
  join public.stores s on s.organization_id = m.organization_id
  where s.id = p_store_id
    and m.user_id = auth.uid()
    and coalesce(m.is_active, true) = true
  limit 1;

  if v_membership_id is null then
    raise exception 'No access to this store';
  end if;

  v_can_manage := v_role in ('owner', 'admin');

  return query
  select
    t.id::uuid,
    t.field_cycle_id::uuid,
    t.type::text,
    coalesce(t.amount, 0)::numeric,
    coalesce(t.purpose, 'OPERATIONAL')::text,
    coalesce(t.category, 'GENERAL')::text,
    t.note::text,
    coalesce(u.email, '—')::text,
    t.created_at::timestamptz,

    t.item_name::text,
    t.unit::text,
    coalesce(t.quantity, 0)::numeric,
    coalesce(t.actual_unit_price, 0)::numeric,

    case
      when lower(coalesce(t.unit, '')) in ('g', 'gram', 'grams') then 'gram'
      when lower(coalesce(t.unit, '')) in ('kg', 'kilogram', 'kilograms') then 'gram'
      when lower(coalesce(t.unit, '')) in ('ton', 'tons', 'tani') then 'kg'
      when lower(coalesce(t.unit, '')) in ('piece', 'pcs', 'pc') then 'piece'
      when lower(coalesce(t.unit, '')) in ('sack', 'bag') then 'sack'
      else lower(coalesce(t.unit, ''))
    end::text,

    case
      when lower(coalesce(t.unit, '')) in ('g', 'gram', 'grams') then coalesce(t.quantity, 0)
      when lower(coalesce(t.unit, '')) in ('kg', 'kilogram', 'kilograms') then coalesce(t.quantity, 0) * 1000
      when lower(coalesce(t.unit, '')) in ('ton', 'tons', 'tani') then coalesce(t.quantity, 0) * 1000
      else coalesce(t.quantity, 0)
    end::numeric
  from public.field_wallet_transactions t
  left join public.org_memberships m on m.id = t.membership_id
  left join auth.users u on u.id = m.user_id
  where t.store_id = p_store_id
    and (v_can_manage or t.membership_id = v_membership_id)
  order by t.created_at desc
  limit 500;
end;
$function$;

REVOKE ALL ON FUNCTION public.get_field_wallet_history_v1(uuid) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.get_field_wallet_history_v1(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_field_agent_stock_summary_v1(p_store_id uuid, p_cycle_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(membership_id uuid, agent_email text, item_name text, unit text, total_quantity numeric, total_amount numeric, avg_unit_price numeric, records_count bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
declare
  v_membership_id uuid;
  v_role text;
  v_can_manage boolean := false;
BEGIN
PERFORM security_m2.require_owner((SELECT s.organization_id FROM public.stores s WHERE s.id=p_store_id),p_store_id);
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select m.id, lower(coalesce(m.role, ''))
    into v_membership_id, v_role
  from public.org_memberships m
  join public.stores s on s.organization_id = m.organization_id
  where s.id = p_store_id
    and m.user_id = auth.uid()
    and coalesce(m.is_active, true) = true
  limit 1;

  if v_membership_id is null then
    raise exception 'No access to this store';
  end if;

  v_can_manage := v_role in ('owner', 'admin');

  return query
  select
    t.membership_id::uuid,
    coalesce(u.email, '—')::text,
    coalesce(nullif(trim(t.item_name), ''), 'Unknown Item')::text,
    coalesce(nullif(trim(t.unit), ''), 'unit')::text,
    coalesce(sum(t.quantity), 0)::numeric,
    coalesce(sum(t.amount), 0)::numeric,
    case
      when coalesce(sum(t.quantity), 0) > 0
      then (coalesce(sum(t.amount), 0) / coalesce(sum(t.quantity), 0))::numeric
      else 0::numeric
    end,
    count(t.id)::bigint
  from public.field_wallet_transactions t
  left join public.org_memberships m on m.id = t.membership_id
  left join auth.users u on u.id = m.user_id
  where t.store_id = p_store_id
    and (p_cycle_id is null or t.field_cycle_id = p_cycle_id)
    and (v_can_manage or t.membership_id = v_membership_id)
    and t.type = 'EXPENSE'
    and coalesce(t.purpose, '') = 'TARGET'
    and coalesce(t.quantity, 0) > 0
    and nullif(trim(coalesce(t.item_name, '')), '') is not null
  group by t.membership_id, u.email, t.item_name, t.unit
  order by u.email asc, t.item_name asc, t.unit asc;
end;
$function$;

REVOKE ALL ON FUNCTION public.get_field_agent_stock_summary_v1(uuid,uuid) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.get_field_agent_stock_summary_v1(uuid,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_field_stock_summary_by_cycle_v1(p_store_id uuid, p_cycle_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(item_name text, unit text, total_quantity numeric, total_amount numeric, avg_unit_price numeric, records_count bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
declare
  v_membership_id uuid;
  v_role text;
  v_can_manage boolean := false;
BEGIN
PERFORM security_m2.require_owner((SELECT s.organization_id FROM public.stores s WHERE s.id=p_store_id),p_store_id);
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select m.id, lower(coalesce(m.role, ''))
    into v_membership_id, v_role
  from public.org_memberships m
  join public.stores s on s.organization_id = m.organization_id
  where s.id = p_store_id
    and m.user_id = auth.uid()
    and coalesce(m.is_active, true) = true
  limit 1;

  if v_membership_id is null then
    raise exception 'No access to this store';
  end if;

  v_can_manage := v_role in ('owner', 'admin');

  return query
  select
    coalesce(nullif(trim(t.item_name), ''), 'Unknown Item')::text,
    coalesce(nullif(trim(t.unit), ''), 'unit')::text,
    coalesce(sum(t.quantity), 0)::numeric,
    coalesce(sum(t.amount), 0)::numeric,
    case
      when coalesce(sum(t.quantity), 0) > 0
      then (coalesce(sum(t.amount), 0) / coalesce(sum(t.quantity), 0))::numeric
      else 0::numeric
    end,
    count(t.id)::bigint
  from public.field_wallet_transactions t
  where t.store_id = p_store_id
    and (p_cycle_id is null or t.field_cycle_id = p_cycle_id)
    and (v_can_manage or t.membership_id = v_membership_id)
    and t.type = 'EXPENSE'
    and coalesce(t.purpose, 'OPERATIONAL') = 'TARGET'
    and coalesce(t.quantity, 0) > 0
    and nullif(trim(coalesce(t.item_name, '')), '') is not null
  group by
    coalesce(nullif(trim(t.item_name), ''), 'Unknown Item'),
    coalesce(nullif(trim(t.unit), ''), 'unit')
  order by item_name asc, unit asc;
end;
$function$;

REVOKE ALL ON FUNCTION public.get_field_stock_summary_by_cycle_v1(uuid,uuid) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.get_field_stock_summary_by_cycle_v1(uuid,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.preview_product_catalog_share_v1(p_share_code text)
 RETURNS TABLE(share_id uuid, source_organization_id uuid, source_organization_name text, source_store_id uuid, source_store_name text, product_id uuid, product_name text, sku text, barcode text, category text, unit text, image_url text, cost_price numeric, selling_price numeric, is_precision_product boolean, precision_pack_size numeric, precision_base_unit text, precision_sell_mode text, precision_allow_box_sales boolean, precision_allow_unit_sales boolean, share_cost_price boolean, share_selling_price boolean, expires_at timestamp with time zone, max_uses integer, used_count integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  v_hash text;
  v_share public.product_catalog_shares%ROWTYPE;
BEGIN
  -- ==========================================================
  -- AUTH
  -- ==========================================================

  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_share_code IS NULL OR btrim(p_share_code) = '' THEN
    RAISE EXCEPTION 'Share code is required';
  END IF;


  -- ==========================================================
  -- HASH PROVIDED CODE
  --
  -- Same normalization/hash used by generator.
  -- ==========================================================

  v_hash := encode(
    digest(upper(btrim(p_share_code)), 'sha256'),
    'hex'
  );


  -- ==========================================================
  -- FIND SHARE
  -- ==========================================================

  SELECT pcs.*
  INTO v_share
  FROM public.product_catalog_shares pcs
  WHERE pcs.code_hash = v_hash
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid catalog share code';
  END IF;


  -- ==========================================================
  -- SECURITY / VALIDITY CHECKS
  -- ==========================================================

  IF v_share.revoked_at IS NOT NULL THEN
    RAISE EXCEPTION 'This catalog share code has been revoked';
  END IF;

  IF v_share.expires_at IS NOT NULL
     AND v_share.expires_at <= now() THEN
    RAISE EXCEPTION 'This catalog share code has expired';
  END IF;

  IF v_share.used_count >= v_share.max_uses THEN
    RAISE EXCEPTION 'This catalog share code has reached its usage limit';
  END IF;


  -- ==========================================================
  -- SOURCE ORGANIZATION MUST STILL EXIST / BE ACTIVE
  -- ==========================================================

  IF NOT EXISTS (
    SELECT 1
    FROM public.organizations o
    WHERE o.id = v_share.source_organization_id
      AND coalesce(o.is_active, true) = true
  ) THEN
    RAISE EXCEPTION 'Source organization is unavailable';
  END IF;


  -- ==========================================================
  -- SOURCE STORE
  --
  -- IMPORTANT:
  -- Real stores column is "active", NOT "is_active".
  -- ==========================================================

  IF v_share.source_store_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.stores s
      WHERE s.id = v_share.source_store_id
        AND s.organization_id = v_share.source_organization_id
        AND coalesce(s.is_active, true) = true
    ) THEN
      RAISE EXCEPTION 'Source store is unavailable';
    END IF;
  END IF;


  -- ==========================================================
  -- PRODUCT PREVIEW
  --
  -- SECURITY:
  -- Cost and Selling Price are exposed ONLY when source owner
  -- explicitly allowed them when generating the share.
  --
  -- No stock/inventory/customer/sales/credit data is returned.
  -- ==========================================================

  RETURN QUERY
  SELECT
    v_share.id,
    v_share.source_organization_id,
    o.name::text,

    v_share.source_store_id,
    s.name::text,

    p.id,
    p.name::text,
    p.sku::text,
    p.barcode::text,
    p.category::text,
    p.unit::text,
    p.image_url::text,

    CASE
      WHEN v_share.share_cost_price AND security_m2.owner_of(v_share.source_organization_id)
        THEN p.cost_price
      ELSE NULL::numeric
    END,

    CASE
      WHEN v_share.share_selling_price
        THEN p.selling_price
      ELSE NULL::numeric
    END,

    coalesce(p.is_precision_product, false),

    p.precision_pack_size,

    p.precision_base_unit::text,

    p.precision_sell_mode::text,

    coalesce(p.precision_allow_box_sales, false),

    coalesce(p.precision_allow_unit_sales, true),

    v_share.share_cost_price,
    v_share.share_selling_price,
    v_share.expires_at,
    v_share.max_uses,
    v_share.used_count

  FROM public.product_catalog_share_items pcsi

  JOIN public.products p
    ON p.id = pcsi.product_id
   AND p.organization_id = v_share.source_organization_id
   AND coalesce(p.is_active, true) = true

  JOIN public.organizations o
    ON o.id = v_share.source_organization_id

  LEFT JOIN public.stores s
    ON s.id = v_share.source_store_id
   AND s.organization_id = v_share.source_organization_id

  WHERE pcsi.share_id = v_share.id

  ORDER BY
    lower(p.name),
    p.id;

END;
$function$;

REVOKE ALL ON FUNCTION public.preview_product_catalog_share_v1(text) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.preview_product_catalog_share_v1(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.import_product_catalog_share_v1(p_code text, p_target_org_id uuid, p_target_store_id uuid DEFAULT NULL::uuid, p_product_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS TABLE(imported_count integer, skipped_count integer, total_selected integer, share_used_count integer, share_max_uses integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  v_role text;
  v_code_hash text;

  v_share_id uuid;
  v_source_org_id uuid;
  v_source_store_id uuid;

  v_share_cost_price boolean := false;
  v_share_selling_price boolean := false;

  v_expires_at timestamptz;
  v_max_uses integer := 1;
  v_used_count integer := 0;

  v_product_limit integer;
  v_current_product_count integer := 0;
  v_new_product_count integer := 0;

  v_total_selected integer := 0;
  v_imported_count integer := 0;
  v_skipped_count integer := 0;

  v_target_store_type text;

BEGIN

  -- ==========================================================
  -- AUTH
  -- ==========================================================

  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_target_org_id IS NULL THEN
    RAISE EXCEPTION 'p_target_org_id is required';
  END IF;

  IF nullif(btrim(coalesce(p_code, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Catalog Share Code is required';
  END IF;


  -- ==========================================================
  -- TARGET ORGANIZATION ROLE
  -- Owner/Admin only
  -- ==========================================================

  SELECT lower(coalesce(m.role, ''))
    INTO v_role
  FROM public.org_memberships m
  WHERE m.organization_id = p_target_org_id
    AND m.user_id = auth.uid()
    AND coalesce(m.is_active, true) = true
  LIMIT 1;

  IF v_role IS NULL THEN
    RAISE EXCEPTION 'Not a member of target organization';
  END IF;

  IF v_role NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'Owner or admin only';
  END IF;


  -- ==========================================================
  -- TARGET ORGANIZATION
  -- ==========================================================

  IF NOT EXISTS (
    SELECT 1
    FROM public.organizations o
    WHERE o.id = p_target_org_id
      AND coalesce(o.is_active, true) = true
  ) THEN
    RAISE EXCEPTION 'Target organization not found or inactive';
  END IF;


  -- ==========================================================
  -- OPTIONAL TARGET STORE
  -- VERIFIED SCHEMA: stores.is_active
  -- ==========================================================

  IF p_target_store_id IS NOT NULL THEN

    SELECT coalesce(s.store_type, 'STANDARD')
      INTO v_target_store_type
    FROM public.stores s
    WHERE s.id = p_target_store_id
      AND s.organization_id = p_target_org_id
      AND coalesce(s.is_active, true) = true
    LIMIT 1;

    IF v_target_store_type IS NULL THEN
      RAISE EXCEPTION 'Target store not found or inactive';
    END IF;

  END IF;


  -- ==========================================================
  -- HASH SHARE CODE
  -- ==========================================================

  v_code_hash := encode(
    digest(
      upper(btrim(p_code)),
      'sha256'
    ),
    'hex'
  );


  -- ==========================================================
  -- LOCK + VALIDATE SHARE
  -- ==========================================================

  SELECT
    pcs.id,
    pcs.source_organization_id,
    pcs.source_store_id,
    pcs.share_cost_price,
    pcs.share_selling_price,
    pcs.expires_at,
    pcs.max_uses,
    pcs.used_count
  INTO
    v_share_id,
    v_source_org_id,
    v_source_store_id,
    v_share_cost_price,
    v_share_selling_price,
    v_expires_at,
    v_max_uses,
    v_used_count
  FROM public.product_catalog_shares pcs
  WHERE pcs.code_hash = v_code_hash
  FOR UPDATE;

  IF v_share_id IS NOT NULL AND v_share_cost_price AND (NOT security_m2.owner_of(v_source_org_id) OR NOT security_m2.owner_of(p_target_org_id)) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='OWNER_FINANCIAL_ACCESS_REQUIRED'; END IF;
  IF v_share_id IS NULL THEN
    RAISE EXCEPTION 'Invalid Catalog Share Code';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.product_catalog_shares pcs
    WHERE pcs.id = v_share_id
      AND pcs.revoked_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Catalog Share Code has been revoked';
  END IF;

  IF v_expires_at IS NOT NULL
     AND v_expires_at <= now() THEN
    RAISE EXCEPTION 'Catalog Share Code has expired';
  END IF;

  IF coalesce(v_used_count, 0) >= coalesce(v_max_uses, 1) THEN
    RAISE EXCEPTION 'Catalog Share Code has reached its maximum uses';
  END IF;


  -- ==========================================================
  -- PREVENT SAME-ORG IMPORT
  -- ==========================================================

  IF v_source_org_id = p_target_org_id THEN
    RAISE EXCEPTION
      'Source and target organization cannot be the same';
  END IF;


  -- ==========================================================
  -- BUILD SELECTED PRODUCT SNAPSHOT
  -- ==========================================================

  CREATE TEMP TABLE tmp_catalog_import_products
  ON COMMIT DROP
  AS
  SELECT DISTINCT
    p.id AS source_product_id,

    p.name,
    p.sku,
    p.barcode,
    p.unit,
    p.category,
    p.image_url,

    CASE
      WHEN v_share_cost_price
        THEN p.cost_price
      ELSE NULL
    END AS cost_price,

    CASE
      WHEN v_share_selling_price
        THEN p.selling_price
      ELSE NULL
    END AS selling_price,

    coalesce(p.is_precision_product, false)
      AS is_precision_product,

    p.allow_decimal_qty,
    p.requires_expiry,
    p.requires_batch_tracking,
    p.dosage_unit,
    p.min_sell_qty,
    p.max_sell_qty,
    p.purchase_unit,
    p.dispense_unit,
    p.purchase_unit_qty,
    CASE WHEN security_m2.owner_of(v_source_org_id) AND security_m2.owner_of(p_target_org_id) THEN p.auto_cost_per_dispense_unit ELSE NULL::numeric END AS auto_cost_per_dispense_unit,
    p.auto_sell_per_dispense_unit,
    p.pharmacy_mode,

    p.precision_pack_size,
    p.precision_base_unit,
    p.precision_sell_mode,
    p.precision_allow_box_sales,
    p.precision_allow_unit_sales

  FROM public.product_catalog_share_items pcsi
  JOIN public.products p
    ON p.id = pcsi.product_id

  WHERE pcsi.share_id = v_share_id
    AND p.organization_id = v_source_org_id
    AND coalesce(p.is_active, true) = true
    AND (
      coalesce(cardinality(p_product_ids), 0) = 0
      OR p.id = ANY(p_product_ids)
    );


  SELECT count(*)
    INTO v_total_selected
  FROM tmp_catalog_import_products;


  IF v_total_selected <= 0 THEN
    RAISE EXCEPTION 'No valid products selected for import';
  END IF;


  -- ==========================================================
  -- VALIDATE EXPLICIT PRODUCT IDS
  -- ==========================================================

  IF coalesce(cardinality(p_product_ids), 0) > 0 THEN

    IF EXISTS (
      SELECT 1
      FROM unnest(p_product_ids) requested(product_id)
      WHERE NOT EXISTS (
        SELECT 1
        FROM tmp_catalog_import_products t
        WHERE t.source_product_id = requested.product_id
      )
    ) THEN
      RAISE EXCEPTION
        'One or more selected products do not belong to this shared catalog';
    END IF;

  END IF;


  -- ==========================================================
  -- DUPLICATE DETECTION
  -- ==========================================================

  DELETE FROM tmp_catalog_import_products t
  USING public.products existing
  WHERE existing.organization_id = p_target_org_id
    AND coalesce(existing.is_active, true) = true
    AND (
      (
        nullif(btrim(t.barcode), '') IS NOT NULL
        AND nullif(btrim(existing.barcode), '') IS NOT NULL
        AND lower(btrim(existing.barcode))
          = lower(btrim(t.barcode))
      )
      OR
      (
        lower(
          regexp_replace(
            btrim(existing.name),
            '\s+',
            ' ',
            'g'
          )
        )
        =
        lower(
          regexp_replace(
            btrim(t.name),
            '\s+',
            ' ',
            'g'
          )
        )

        AND (
          existing.store_id IS NULL
          OR p_target_store_id IS NULL
          OR existing.store_id = p_target_store_id
        )
      )
    );


  GET DIAGNOSTICS v_skipped_count = ROW_COUNT;


  SELECT count(*)
    INTO v_new_product_count
  FROM tmp_catalog_import_products;


  -- ==========================================================
  -- NOTHING NEW
  -- ==========================================================

  IF v_new_product_count <= 0 THEN

    RETURN QUERY
    SELECT
      0::integer,
      v_skipped_count::integer,
      v_total_selected::integer,
      v_used_count::integer,
      v_max_uses::integer;

    RETURN;

  END IF;


  -- ==========================================================
  -- PRODUCT PLAN LIMIT
  -- FREE = 30
  -- PAID PLANS = 0 means UNLIMITED
  -- ==========================================================

  SELECT pl.product_limit
    INTO v_product_limit
  FROM public._get_org_plan_limits_v2(
    p_target_org_id
  ) pl
  LIMIT 1;


  SELECT count(*)
    INTO v_current_product_count
  FROM public.products p
  WHERE p.organization_id = p_target_org_id
    AND coalesce(p.is_active, true) = true;


  IF v_product_limit IS NOT NULL
     AND v_product_limit > 0
     AND (
       v_current_product_count + v_new_product_count
     ) > v_product_limit THEN

    RAISE EXCEPTION
      'Product limit reached. Current: %, Import: %, Limit: %',
      v_current_product_count,
      v_new_product_count,
      v_product_limit;

  END IF;


  -- ==========================================================
  -- INSERT TARGET PRODUCTS
  -- ==========================================================

  INSERT INTO public.products (
    organization_id,
    store_id,

    name,
    sku,
    barcode,
    unit,
    category,
    image_url,

    cost_price,
    selling_price,

    cost,
    price,

    is_active,
    created_by,

    qty_on_hand,
    reserved_qty,

    is_precision_product,
    allow_decimal_qty,
    requires_expiry,
    requires_batch_tracking,
    dosage_unit,
    min_sell_qty,
    max_sell_qty,
    purchase_unit,
    dispense_unit,
    purchase_unit_qty,
    auto_cost_per_dispense_unit,
    auto_sell_per_dispense_unit,
    pharmacy_mode,

    precision_pack_size,
    precision_base_unit,
    precision_sell_mode,
    precision_allow_box_sales,
    precision_allow_unit_sales
  )
  SELECT
    p_target_org_id,
    p_target_store_id,

    t.name,
    t.sku,
    nullif(btrim(t.barcode), ''),
    t.unit,
    t.category,
    t.image_url,

    t.cost_price,
    t.selling_price,

    coalesce(t.cost_price, 0),
    coalesce(t.selling_price, 0),

    true,
    auth.uid(),

    0,
    0,

    coalesce(t.is_precision_product, false),
    coalesce(t.allow_decimal_qty, false),
    coalesce(t.requires_expiry, false),
    coalesce(t.requires_batch_tracking, false),
    t.dosage_unit,
    t.min_sell_qty,
    t.max_sell_qty,
    t.purchase_unit,
    t.dispense_unit,
    t.purchase_unit_qty,
    t.auto_cost_per_dispense_unit,
    t.auto_sell_per_dispense_unit,
    t.pharmacy_mode,

    t.precision_pack_size,
    t.precision_base_unit,
    coalesce(t.precision_sell_mode, 'UNIT'),
    coalesce(t.precision_allow_box_sales, true),
    coalesce(t.precision_allow_unit_sales, true)

  FROM tmp_catalog_import_products t;


  GET DIAGNOSTICS v_imported_count = ROW_COUNT;


  -- ==========================================================
  -- INITIALIZE STORE INVENTORY AT ZERO
  -- VERIFIED SCHEMA: inventory.qty
  -- ==========================================================

  IF p_target_store_id IS NOT NULL
     AND v_imported_count > 0 THEN

    INSERT INTO public.inventory (
      store_id,
      product_id,
      qty
    )
    SELECT
      p_target_store_id,
      p.id,
      0
    FROM public.products p
    WHERE p.organization_id = p_target_org_id
      AND p.store_id = p_target_store_id
      AND p.created_by = auth.uid()
      AND p.created_at >= transaction_timestamp()
    ON CONFLICT DO NOTHING;

  END IF;


  -- ==========================================================
  -- CONSUME ONE SHARE USE
  -- ==========================================================

  UPDATE public.product_catalog_shares pcs
  SET used_count = pcs.used_count + 1
  WHERE pcs.id = v_share_id
  RETURNING pcs.used_count
  INTO v_used_count;


  -- ==========================================================
  -- RESULT
  -- ==========================================================

  RETURN QUERY
  SELECT
    v_imported_count::integer,
    v_skipped_count::integer,
    v_total_selected::integer,
    v_used_count::integer,
    v_max_uses::integer;

END;
$function$;

REVOKE ALL ON FUNCTION public.import_product_catalog_share_v1(text,uuid,uuid,uuid[]) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.import_product_catalog_share_v1(text,uuid,uuid,uuid[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_product_profit_report_v3(p_store_id uuid, p_from timestamp with time zone, p_to timestamp with time zone, p_limit integer DEFAULT 20)
 RETURNS TABLE(product_id uuid, product_name text, sku text, category text, unit text, qty_sold numeric, revenue numeric, estimated_cost numeric, gross_profit numeric, profit_margin_pct numeric, sales_count integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
BEGIN
PERFORM security_m2.require_owner((SELECT s.organization_id FROM public.stores s WHERE s.id=p_store_id),p_store_id);
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_store_id IS NULL THEN
    RAISE EXCEPTION 'p_store_id is required';
  END IF;

  IF p_from IS NULL OR p_to IS NULL THEN
    RAISE EXCEPTION 'p_from and p_to are required';
  END IF;

  IF p_to <= p_from THEN
    RAISE EXCEPTION 'Invalid range';
  END IF;

  -- Product profit is sensitive financial information.
  -- Keep the same owner-only rule as canonical net profit.
  IF NOT EXISTS (
    SELECT 1
    FROM public.org_memberships m
    JOIN public.stores st
      ON st.organization_id = m.organization_id
    WHERE st.id = p_store_id
      AND m.user_id = auth.uid()
      AND COALESCE(m.is_active, true) = true
      AND m.role = 'owner'
  ) THEN
    RAISE EXCEPTION 'Owner only';
  END IF;

  RETURN QUERY

  WITH eligible_sales AS (
    SELECT
      s.id AS sale_id,

      COALESCE(
        s.grand_total,
        s.total_amount,
        0
      )::numeric AS final_sale_value

    FROM public.sales s

    WHERE s.store_id = p_store_id
      AND s.sold_at >= p_from
      AND s.sold_at < p_to
      AND UPPER(COALESCE(s.status, 'COMPLETED')) = 'COMPLETED'
  ),

  sale_item_totals AS (
    SELECT
      es.sale_id,
      es.final_sale_value,

      COALESCE(
        SUM(COALESCE(si.line_total, 0)),
        0
      )::numeric AS items_subtotal

    FROM eligible_sales es

    JOIN public.sale_items si
      ON si.sale_id = es.sale_id

    GROUP BY
      es.sale_id,
      es.final_sale_value
  ),

  adjusted_items AS (
    SELECT
      si.sale_id,
      si.product_id,

      COALESCE(
        NULLIF(si.product_name, ''),
        p.name,
        'Unknown Product'
      )::text AS product_name,

      p.sku::text AS sku,
      p.category::text AS category,
      p.unit::text AS unit,

      COALESCE(si.qty, 0)::numeric AS qty_sold,

      CASE
        WHEN COALESCE(sit.items_subtotal, 0) > 0 THEN
          (
            COALESCE(si.line_total, 0)::numeric
            / sit.items_subtotal
          )
          * sit.final_sale_value
        ELSE 0::numeric
      END AS actual_revenue,

      (
        COALESCE(si.qty, 0)::numeric
        *
        COALESCE(
          si.unit_cost,
          p.cost_price,
          0
        )::numeric
      ) AS actual_cost

    FROM eligible_sales es

    JOIN sale_item_totals sit
      ON sit.sale_id = es.sale_id

    JOIN public.sale_items si
      ON si.sale_id = es.sale_id

    LEFT JOIN public.products p
      ON p.id = si.product_id
  ),

  product_rollup AS (
    SELECT
      ai.product_id,
      ai.product_name,
      ai.sku,
      ai.category,
      ai.unit,

      COALESCE(
        SUM(ai.qty_sold),
        0
      )::numeric AS qty_sold,

      COALESCE(
        SUM(ai.actual_revenue),
        0
      )::numeric AS revenue,

      COALESCE(
        SUM(ai.actual_cost),
        0
      )::numeric AS estimated_cost,

      (
        COALESCE(SUM(ai.actual_revenue), 0)
        -
        COALESCE(SUM(ai.actual_cost), 0)
      )::numeric AS gross_profit,

      COUNT(DISTINCT ai.sale_id)::integer AS sales_count

    FROM adjusted_items ai

    GROUP BY
      ai.product_id,
      ai.product_name,
      ai.sku,
      ai.category,
      ai.unit
  )

  SELECT
    pr.product_id,
    pr.product_name,
    pr.sku,
    pr.category,
    pr.unit,

    pr.qty_sold,

    ROUND(pr.revenue, 2)::numeric AS revenue,

    ROUND(pr.estimated_cost, 2)::numeric AS estimated_cost,

    ROUND(pr.gross_profit, 2)::numeric AS gross_profit,

    CASE
      WHEN pr.revenue > 0 THEN
        ROUND(
          (pr.gross_profit / pr.revenue) * 100,
          2
        )::numeric
      ELSE
        0::numeric
    END AS profit_margin_pct,

    pr.sales_count

  FROM product_rollup pr

  ORDER BY
    pr.gross_profit DESC,
    pr.revenue DESC,
    pr.product_name ASC

  LIMIT GREATEST(COALESCE(p_limit, 20), 1);

END;
$function$;

REVOKE ALL ON FUNCTION public.get_product_profit_report_v3(uuid,timestamp with time zone,timestamp with time zone,integer) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.get_product_profit_report_v3(uuid,timestamp with time zone,timestamp with time zone,integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_products(p_org_id uuid, p_store_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(id uuid, organization_id uuid, store_id uuid, name text, sku text, unit text, category text, barcode text, image_url text, selling_price numeric, is_active boolean, created_at timestamp with time zone, updated_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
declare
  v_store_type text := 'STANDARD';
BEGIN
PERFORM security_m2.require_store(p_org_id,p_store_id);
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if p_org_id is null then raise exception 'org_id required'; end if;

  if not exists (
    select 1 from public.org_memberships m
    where m.user_id = auth.uid()
      and m.organization_id = p_org_id
      and coalesce(m.is_active, true) = true
  ) then raise exception 'Not allowed'; end if;

  if p_store_id is not null then
    perform public.ensure_my_store_access(p_store_id);
    select coalesce(s.store_type, 'STANDARD') into v_store_type
    from public.stores s
    where s.id = p_store_id and s.organization_id = p_org_id
    limit 1;
    if v_store_type is null then raise exception 'Store not found for org'; end if;
  end if;

  return query
  select
    p.id, p.organization_id, p.store_id, p.name, p.sku, p.unit,
    p.category, p.barcode, p.image_url, p.selling_price,
    p.is_active, p.created_at, p.updated_at
  from public.products p
  where p.organization_id = p_org_id
    and coalesce(p.is_active, true) = true
    and (
      (upper(coalesce(v_store_type, 'STANDARD')) = 'CAPITAL_RECOVERY' and p.store_id = p_store_id)
      or
      (upper(coalesce(v_store_type, 'STANDARD')) <> 'CAPITAL_RECOVERY'
        and (
          p_store_id is null
          or p.store_id is null
          or p.store_id = p_store_id
          or exists (select 1 from public.inventory i where i.store_id = p_store_id and i.product_id = p.id)
          or exists (
            select 1 from public.sales s
            join public.sale_items si on si.sale_id = s.id
            where s.store_id = p_store_id and si.product_id = p.id
          )
          or exists (select 1 from public.stock_movements sm where sm.store_id = p_store_id and sm.product_id = p.id)
          or exists (select 1 from public.stock_batches sb where sb.store_id = p_store_id and sb.product_id = p.id)
        )
      )
    )
  order by
    case when p.store_id = p_store_id then 0 else 1 end,
    case when p.store_id is null then 1 else 0 end,
    p.created_at desc,
    p.name asc;
end;
$function$;

REVOKE ALL ON FUNCTION public.get_products(uuid,uuid) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.get_products(uuid,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_products_manage(p_org_id uuid, p_store_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(id uuid, organization_id uuid, store_id uuid, name text, sku text, unit text, category text, barcode text, image_url text, selling_price numeric, cost_price numeric, is_active boolean, created_at timestamp with time zone, updated_at timestamp with time zone, is_precision_product boolean, precision_pack_size numeric, precision_base_unit text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
declare
  v_store_type text := 'STANDARD';
BEGIN
PERFORM security_m2.require_store(p_org_id,p_store_id);
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if p_org_id is null then raise exception 'org_id required'; end if;
  if not public._is_owner_or_admin_in_org(p_org_id) then raise exception 'Owner/Admin only'; end if;

  if p_store_id is not null then
    perform public.ensure_my_store_access(p_store_id);
    select coalesce(s.store_type, 'STANDARD') into v_store_type
    from public.stores s
    where s.id = p_store_id and s.organization_id = p_org_id
    limit 1;
    if v_store_type is null then raise exception 'Store not found for org'; end if;
  end if;

  return query
  select
    p.id, p.organization_id, p.store_id, p.name, p.sku, p.unit,
    p.category, p.barcode, p.image_url, p.selling_price,
    case
      when upper(coalesce(v_store_type, 'STANDARD')) = 'CAPITAL_RECOVERY' then null::numeric
      when security_m2.owner_of(p_org_id) then p.cost_price
      else null::numeric
    end,
    p.is_active, p.created_at, p.updated_at,
    coalesce(p.is_precision_product, false),
    p.precision_pack_size,
    p.precision_base_unit
  from public.products p
  where p.organization_id = p_org_id
    and coalesce(p.is_active, true) = true
    and (
      (upper(coalesce(v_store_type, 'STANDARD')) = 'CAPITAL_RECOVERY' and p.store_id = p_store_id)
      or
      (upper(coalesce(v_store_type, 'STANDARD')) <> 'CAPITAL_RECOVERY'
        and (
          p_store_id is null
          or p.store_id is null
          or p.store_id = p_store_id
          or exists (select 1 from public.inventory i where i.store_id = p_store_id and i.product_id = p.id)
          or exists (
            select 1 from public.sales s
            join public.sale_items si on si.sale_id = s.id
            where s.store_id = p_store_id and si.product_id = p.id
          )
          or exists (select 1 from public.stock_movements sm where sm.store_id = p_store_id and sm.product_id = p.id)
          or exists (select 1 from public.stock_batches sb where sb.store_id = p_store_id and sb.product_id = p.id)
        )
      )
    )
  order by
    case when p.store_id = p_store_id then 0 else 1 end,
    case when p.store_id is null then 1 else 0 end,
    p.created_at desc,
    p.name asc;
end;
$function$;

REVOKE ALL ON FUNCTION public.get_products_manage(uuid,uuid) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.get_products_manage(uuid,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.upsert_product(p_org_id uuid, p_product_id uuid, p_name text, p_sku text, p_unit text, p_category text, p_is_active boolean, p_selling_price numeric, p_cost_price numeric, p_barcode text, p_store_id uuid, p_is_precision_product boolean DEFAULT false, p_precision_pack_size numeric DEFAULT NULL::numeric, p_precision_base_unit text DEFAULT NULL::text, p_precision_sell_mode text DEFAULT 'UNIT'::text, p_precision_allow_box_sales boolean DEFAULT false, p_precision_allow_unit_sales boolean DEFAULT true, p_image_url text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
declare
  v_id uuid;
  v_store_type text := 'STANDARD';
  v_effective_store_id uuid := null;
  v_product_limit integer := 0;
  v_current_product_count integer := 0;
BEGIN
PERFORM security_m2.require_owner(p_org_id,p_store_id);
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if p_org_id is null then raise exception 'org_id required'; end if;
  if coalesce(btrim(p_name), '') = '' then raise exception 'name required'; end if;
  if not public._is_owner_in_org(p_org_id) then raise exception 'Owner only'; end if;

  if p_store_id is not null then
    select coalesce(s.store_type, 'STANDARD') into v_store_type
    from public.stores s
    where s.id = p_store_id and s.organization_id = p_org_id
    limit 1;
    if not found then raise exception 'Store not found for org'; end if;
  end if;

  if p_selling_price is not null and p_selling_price <= 0 then raise exception 'Selling price must be > 0'; end if;
  if p_cost_price is not null and p_cost_price < 0 then raise exception 'Cost price must be >= 0'; end if;

  if coalesce(p_is_precision_product, false) = true then
    if p_precision_pack_size is null or p_precision_pack_size <= 0 then raise exception 'Precision product requires valid pack size'; end if;
    if coalesce(btrim(p_precision_base_unit), '') = '' then raise exception 'Precision product requires base unit'; end if;
  end if;

  if p_store_id is not null and upper(v_store_type) = 'CAPITAL_RECOVERY' then
    if p_selling_price is null then raise exception 'Capital Recovery product requires selling price'; end if;
    v_effective_store_id := p_store_id;
    p_barcode := null;
    p_cost_price := null;
    p_is_precision_product := false;
    p_precision_pack_size := null;
    p_precision_base_unit := null;
  else
    v_effective_store_id := p_store_id;
  end if;

  if p_barcode is not null and btrim(p_barcode) = '' then p_barcode := null; end if;
  if p_image_url is not null and btrim(p_image_url) = '' then p_image_url := null; end if;

  if p_product_id is null then
    select coalesce(l.product_limit, 0) into v_product_limit
    from public._get_org_plan_limits_v2(p_org_id) l
    limit 1;

    if v_product_limit > 0 then
      select count(*) into v_current_product_count
      from public.products p
      where p.organization_id = p_org_id
        and coalesce(p.is_active, true) = true;

      if v_current_product_count >= v_product_limit then
        raise exception 'Product limit reached (% products). Upgrade your plan.', v_product_limit;
      end if;
    end if;

    insert into public.products (
      organization_id, store_id, name, sku, unit, category, is_active,
      selling_price, cost_price, barcode, image_url, created_by,
      is_precision_product, precision_pack_size, precision_base_unit,
      precision_sell_mode, precision_allow_box_sales, precision_allow_unit_sales
    )
    values (
      p_org_id, v_effective_store_id, btrim(p_name), nullif(btrim(p_sku), ''),
      nullif(btrim(p_unit), ''), nullif(btrim(p_category), ''),
      coalesce(p_is_active, true), p_selling_price, p_cost_price,
      p_barcode, p_image_url, auth.uid(),
      coalesce(p_is_precision_product, false), p_precision_pack_size,
      nullif(btrim(p_precision_base_unit), ''),
      coalesce(nullif(btrim(p_precision_sell_mode), ''), 'UNIT'),
      coalesce(p_precision_allow_box_sales, false),
      coalesce(p_precision_allow_unit_sales, true)
    )
    returning id into v_id;

    if v_effective_store_id is not null then
      insert into public.inventory (store_id, product_id, qty)
      values (v_effective_store_id, v_id, 0)
      on conflict (store_id, product_id) do nothing;
    end if;

    return v_id;
  else
    update public.products
    set
      store_id = v_effective_store_id,
      name = btrim(p_name),
      sku = nullif(btrim(p_sku), ''),
      unit = nullif(btrim(p_unit), ''),
      category = nullif(btrim(p_category), ''),
      is_active = coalesce(p_is_active, true),
      selling_price = p_selling_price,
      cost_price = p_cost_price,
      barcode = p_barcode,
      image_url = p_image_url,
      is_precision_product = coalesce(p_is_precision_product, false),
      precision_pack_size = p_precision_pack_size,
      precision_base_unit = nullif(btrim(p_precision_base_unit), ''),
      precision_sell_mode = coalesce(nullif(btrim(p_precision_sell_mode), ''), 'UNIT'),
      precision_allow_box_sales = coalesce(p_precision_allow_box_sales, false),
      precision_allow_unit_sales = coalesce(p_precision_allow_unit_sales, true),
      updated_at = now()
    where id = p_product_id
      and organization_id = p_org_id
    returning id into v_id;

    if v_id is null then raise exception 'Product not found'; end if;
    return v_id;
  end if;
end;
$function$;

REVOKE ALL ON FUNCTION public.upsert_product(uuid,uuid,text,text,text,text,boolean,numeric,numeric,text,uuid,boolean,numeric,text,text,boolean,boolean,text) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.upsert_product(uuid,uuid,text,text,text,text,boolean,numeric,numeric,text,uuid,boolean,numeric,text,text,boolean,boolean,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_business_loan_summary(p_organization_id uuid, p_store_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(total_loans numeric, total_repaid numeric, total_balance numeric, open_count bigint, partial_count bigint, paid_count bigint, overdue_count bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
PERFORM security_m2.require_owner(p_organization_id,p_store_id);
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if not exists (
    select 1
    from public.org_memberships m
    where m.organization_id = p_organization_id
      and m.user_id = auth.uid()
  ) then
    raise exception 'Access denied';
  end if;

  return query
  select
    coalesce(sum(l.principal_amount), 0)::numeric as total_loans,
    coalesce(sum(l.repaid_amount), 0)::numeric as total_repaid,
    coalesce(sum(greatest(l.principal_amount - l.repaid_amount, 0)), 0)::numeric as total_balance,
    count(*) filter (where l.status = 'OPEN')::bigint as open_count,
    count(*) filter (where l.status = 'PARTIAL')::bigint as partial_count,
    count(*) filter (where l.status = 'PAID')::bigint as paid_count,
    count(*) filter (
      where l.due_date is not null
        and l.due_date < current_date
        and l.status not in ('PAID', 'CANCELLED')
    )::bigint as overdue_count
  from public.business_loans l
  where l.organization_id = p_organization_id
    and (p_store_id is null or l.store_id = p_store_id);
end;
$function$;

REVOKE ALL ON FUNCTION public.get_business_loan_summary(uuid,uuid) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.get_business_loan_summary(uuid,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_business_loans(p_organization_id uuid, p_store_id uuid DEFAULT NULL::uuid, p_status text DEFAULT NULL::text)
 RETURNS TABLE(id uuid, organization_id uuid, store_id uuid, store_name text, borrower_name text, borrower_phone text, borrower_note text, principal_amount numeric, repaid_amount numeric, total_due_amount numeric, balance_amount numeric, interest_enabled boolean, interest_rate_percent numeric, purpose text, loan_date date, due_date date, status text, is_overdue boolean, created_by uuid, created_at timestamp with time zone, updated_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
BEGIN
PERFORM security_m2.require_owner(p_organization_id,p_store_id);

  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.org_memberships m
    WHERE m.organization_id = p_organization_id
      AND m.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  PERFORM public.apply_business_loan_interest_v1(bl.id)
  FROM public.business_loans bl
  WHERE bl.organization_id = p_organization_id
    AND (
      p_store_id IS NULL
      OR bl.store_id = p_store_id
    );

  RETURN QUERY
  SELECT
    l.id,
    l.organization_id,
    l.store_id,
    s.name::text AS store_name,
    l.borrower_name,
    l.borrower_phone,
    l.borrower_note,
    l.principal_amount,
    l.repaid_amount,

    COALESCE(l.total_due_amount, l.principal_amount)::numeric AS total_due_amount,

    GREATEST(
      COALESCE(l.total_due_amount, l.principal_amount)
      - l.repaid_amount,
      0
    )::numeric AS balance_amount,

    COALESCE(l.interest_enabled, false) AS interest_enabled,
    l.interest_rate_percent,

    l.purpose,
    l.loan_date,
    l.due_date,
    l.status,

    (
      l.due_date IS NOT NULL
      AND l.due_date < current_date
      AND l.status <> 'PAID'
      AND l.status <> 'CANCELLED'
    ) AS is_overdue,

    l.created_by,
    l.created_at,
    l.updated_at

  FROM public.business_loans l
  JOIN public.stores s
    ON s.id = l.store_id

  WHERE l.organization_id = p_organization_id
    AND (
      p_store_id IS NULL
      OR l.store_id = p_store_id
    )
    AND (
      p_status IS NULL
      OR l.status = p_status
    )

  ORDER BY l.created_at DESC;

END;
$function$;

REVOKE ALL ON FUNCTION public.get_business_loans(uuid,uuid,text) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.get_business_loans(uuid,uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_ai_crm_customer_360_v1(p_org_id uuid, p_customer_id uuid, p_from timestamp with time zone, p_to timestamp with time zone, p_store_id uuid DEFAULT NULL::uuid, p_receipt_limit integer DEFAULT 50)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
declare
  v_uid uuid := auth.uid();

  v_customer record;

  v_store_valid boolean := false;

  v_receipt_limit integer :=
    greatest(
      1,
      least(coalesce(p_receipt_limit, 50), 100)
    );

  v_period_orders bigint := 0;
  v_period_revenue numeric := 0;
  v_period_discount numeric := 0;

  v_period_cogs_verified numeric := 0;
  v_period_cost_items bigint := 0;
  v_period_cost_verified_items bigint := 0;
  v_period_missing_cost_items bigint := 0;

  v_period_gross_profit numeric := null;
  v_period_profit_fully_verified boolean := false;
  v_period_cost_coverage numeric := 0;

  v_historical_orders bigint := 0;
  v_historical_revenue numeric := 0;
  v_historical_cogs_verified numeric := 0;
  v_historical_cost_items bigint := 0;
  v_historical_cost_verified_items bigint := 0;
  v_historical_missing_cost_items bigint := 0;
  v_historical_gross_profit numeric := null;
  v_historical_profit_fully_verified boolean := false;
  v_historical_cost_coverage numeric := 0;

  v_first_purchase timestamptz := null;
  v_last_purchase timestamptz := null;

  v_receipts jsonb := '[]'::jsonb;
  v_products jsonb := '[]'::jsonb;

BEGIN
PERFORM security_m2.require_owner(p_org_id,p_store_id);

  -- ==========================================================
  -- SECURITY
  -- ==========================================================

  if v_uid is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if p_org_id is null then
    raise exception 'ORG_REQUIRED';
  end if;

  if p_customer_id is null then
    raise exception 'CUSTOMER_REQUIRED';
  end if;

  if p_from is null or p_to is null then
    raise exception 'DATE_RANGE_REQUIRED';
  end if;

  if p_from > p_to then
    raise exception 'INVALID_DATE_RANGE';
  end if;

  if not public._is_owner_in_org(p_org_id) then
    raise exception 'OWNER_REQUIRED';
  end if;

  -- ==========================================================
  -- OPTIONAL STORE VALIDATION
  -- ==========================================================

  if p_store_id is not null then
    select exists (
      select 1
      from public.stores st
      where st.id = p_store_id
        and st.organization_id = p_org_id
    )
    into v_store_valid;

    if not v_store_valid then
      raise exception 'INVALID_STORE';
    end if;
  end if;

  -- ==========================================================
  -- CANONICAL CUSTOMER IDENTITY
  -- ==========================================================

  select
    c.id,
    c.organization_id,
    c.full_name,
    c.name,
    c.phone,
    c.normalized_phone,
    c.created_at
  into v_customer
  from public.customers c
  where c.id = p_customer_id
    and c.organization_id = p_org_id
  limit 1;

  if not found then
    raise exception 'CUSTOMER_NOT_FOUND';
  end if;

  -- ==========================================================
  -- PERIOD SALE SUMMARY
  -- ==========================================================

  select
    count(*),
    coalesce(sum(s.total_amount), 0),
    coalesce(sum(coalesce(s.discount_amount, 0)), 0)
  into
    v_period_orders,
    v_period_revenue,
    v_period_discount
  from public.sales s
  where s.organization_id = p_org_id
    and s.customer_id = p_customer_id
    and s.status = 'COMPLETED'
    and s.sold_at >= p_from
    and s.sold_at <= p_to
    and (
      p_store_id is null
      or s.store_id = p_store_id
    );

  -- ==========================================================
  -- PERIOD HISTORICAL COST COVERAGE
  -- ==========================================================

  select
    count(si.id),
    count(si.id) filter (
      where si.unit_cost is not null
    ),
    count(si.id) filter (
      where si.unit_cost is null
    ),
    coalesce(
      sum(
        case
          when si.unit_cost is not null
          then si.qty * si.unit_cost
          else 0
        end
      ),
      0
    )
  into
    v_period_cost_items,
    v_period_cost_verified_items,
    v_period_missing_cost_items,
    v_period_cogs_verified
  from public.sales s
  join public.sale_items si
    on si.sale_id = s.id
  where s.organization_id = p_org_id
    and s.customer_id = p_customer_id
    and s.status = 'COMPLETED'
    and s.sold_at >= p_from
    and s.sold_at <= p_to
    and (
      p_store_id is null
      or s.store_id = p_store_id
    );

  if v_period_cost_items > 0 then
    v_period_cost_coverage :=
      round(
        (
          v_period_cost_verified_items::numeric
          / v_period_cost_items::numeric
        ) * 100,
        2
      );
  else
    v_period_cost_coverage := 0;
  end if;

  v_period_profit_fully_verified :=
    (
      v_period_orders > 0
      and v_period_cost_items > 0
      and v_period_missing_cost_items = 0
    );

  if v_period_profit_fully_verified then
    v_period_gross_profit :=
      v_period_revenue - v_period_cogs_verified;
  else
    v_period_gross_profit := null;
  end if;

  -- ==========================================================
  -- HISTORICAL CUSTOMER SUMMARY
  -- Through requested p_to.
  -- This is verified historical value, NOT predictive CLV.
  -- ==========================================================

  select
    count(*),
    coalesce(sum(s.total_amount), 0),
    min(s.sold_at),
    max(s.sold_at)
  into
    v_historical_orders,
    v_historical_revenue,
    v_first_purchase,
    v_last_purchase
  from public.sales s
  where s.organization_id = p_org_id
    and s.customer_id = p_customer_id
    and s.status = 'COMPLETED'
    and s.sold_at <= p_to
    and (
      p_store_id is null
      or s.store_id = p_store_id
    );

  select
    count(si.id),
    count(si.id) filter (
      where si.unit_cost is not null
    ),
    count(si.id) filter (
      where si.unit_cost is null
    ),
    coalesce(
      sum(
        case
          when si.unit_cost is not null
          then si.qty * si.unit_cost
          else 0
        end
      ),
      0
    )
  into
    v_historical_cost_items,
    v_historical_cost_verified_items,
    v_historical_missing_cost_items,
    v_historical_cogs_verified
  from public.sales s
  join public.sale_items si
    on si.sale_id = s.id
  where s.organization_id = p_org_id
    and s.customer_id = p_customer_id
    and s.status = 'COMPLETED'
    and s.sold_at <= p_to
    and (
      p_store_id is null
      or s.store_id = p_store_id
    );

  if v_historical_cost_items > 0 then
    v_historical_cost_coverage :=
      round(
        (
          v_historical_cost_verified_items::numeric
          / v_historical_cost_items::numeric
        ) * 100,
        2
      );
  else
    v_historical_cost_coverage := 0;
  end if;

  v_historical_profit_fully_verified :=
    (
      v_historical_orders > 0
      and v_historical_cost_items > 0
      and v_historical_missing_cost_items = 0
    );

  if v_historical_profit_fully_verified then
    v_historical_gross_profit :=
      v_historical_revenue
      - v_historical_cogs_verified;
  else
    v_historical_gross_profit := null;
  end if;

  -- ==========================================================
  -- RECEIPT HISTORY
  -- ==========================================================

  select coalesce(
    jsonb_agg(
      receipt_data
      order by receipt_sold_at desc
    ),
    '[]'::jsonb
  )
  into v_receipts
  from (
    select
      s.sold_at as receipt_sold_at,

      jsonb_build_object(
        'saleId', s.id,
        'soldAt', s.sold_at,

        'store',
        jsonb_build_object(
          'id', st.id,
          'name', st.name
        ),

        'seller',
        jsonb_build_object(
          'membershipId', om.id,
          'userId', om.user_id,
          'displayName', pr.display_name
        ),

        'subtotal',
          coalesce(
            s.subtotal_amount,
            s.total_amount
              + coalesce(s.discount_amount, 0)
          ),

        'discount',
        jsonb_build_object(
          'type', s.discount_type,
          'value', s.discount_value,
          'amount', coalesce(s.discount_amount, 0),
          'note', s.discount_note
        ),

        'finalAmount', s.total_amount,

        'payment',
        jsonb_build_object(
          'amountPaid', s.amount_paid,
          'balanceDue', s.balance_due,
          'method', s.payment_method,
          'status', s.payment_status
        ),

        'cost',
        jsonb_build_object(
          'verifiedCogs', rc.verified_cogs,
          'itemCount', rc.item_count,
          'verifiedCostItems', rc.verified_cost_items,
          'missingCostItems', rc.missing_cost_items,
          'costCoveragePercent',
            case
              when rc.item_count > 0
              then round(
                (
                  rc.verified_cost_items::numeric
                  / rc.item_count::numeric
                ) * 100,
                2
              )
              else 0
            end,
          'profitFullyVerified',
            (
              rc.item_count > 0
              and rc.missing_cost_items = 0
            ),
          'grossProfit',
            case
              when rc.item_count > 0
               and rc.missing_cost_items = 0
              then s.total_amount - rc.verified_cogs
              else null
            end
        ),

        'items',
          coalesce(ri.items, '[]'::jsonb)

      ) as receipt_data

    from public.sales s

    join public.stores st
      on st.id = s.store_id
     and st.organization_id = s.organization_id

    join public.org_memberships om
      on om.id = s.sold_by_membership_id
     and om.organization_id = s.organization_id

    join public.profiles pr
      on pr.id = om.user_id

    left join lateral (
      select
        count(si.id) as item_count,

        count(si.id) filter (
          where si.unit_cost is not null
        ) as verified_cost_items,

        count(si.id) filter (
          where si.unit_cost is null
        ) as missing_cost_items,

        coalesce(
          sum(
            case
              when si.unit_cost is not null
              then si.qty * si.unit_cost
              else 0
            end
          ),
          0
        ) as verified_cogs

      from public.sale_items si
      where si.sale_id = s.id
    ) rc on true

    left join lateral (
      select
        jsonb_agg(
          jsonb_build_object(
            'saleItemId', si.id,
            'productId', si.product_id,
            'productName', p.name,
            'productNameSource', 'CURRENT_PRODUCT_RECORD',
            'qty', si.qty,
            'unitPrice', si.unit_price,
            'lineTotal', si.line_total,
            'historicalUnitCost', si.unit_cost,
            'historicalCostVerified',
              (si.unit_cost is not null),
            'historicalLineCogs',
              case
                when si.unit_cost is not null
                then si.qty * si.unit_cost
                else null
              end
          )
          order by si.created_at, si.id
        ) as items

      from public.sale_items si
      join public.products p
        on p.id = si.product_id
      where si.sale_id = s.id
    ) ri on true

    where s.organization_id = p_org_id
      and s.customer_id = p_customer_id
      and s.status = 'COMPLETED'
      and s.sold_at >= p_from
      and s.sold_at <= p_to
      and (
        p_store_id is null
        or s.store_id = p_store_id
      )

    order by s.sold_at desc
    limit v_receipt_limit
  ) q;

  -- ==========================================================
  -- PRODUCT SUMMARY FOR REQUESTED PERIOD
  --
  -- spend = PRE-DISCOUNT line value.
  -- It is intentionally NOT labelled final customer revenue.
  -- ==========================================================

  select coalesce(
    jsonb_agg(
      product_data
      order by product_spend desc,
               product_qty desc,
               product_id
    ),
    '[]'::jsonb
  )
  into v_products
  from (
    select
      si.product_id as product_id,
      sum(si.line_total) as product_spend,
      sum(si.qty) as product_qty,

      jsonb_build_object(
        'productId', si.product_id,
        'productName', p.name,
        'productNameSource', 'CURRENT_PRODUCT_RECORD',

        'qtyBought',
          sum(si.qty),

        'purchaseCount',
          count(distinct s.id),

        'preDiscountLineValue',
          sum(si.line_total),

        'historicalCogsVerified',
          coalesce(
            sum(
              case
                when si.unit_cost is not null
                then si.qty * si.unit_cost
                else 0
              end
            ),
            0
          ),

        'costItemCount',
          count(si.id),

        'verifiedCostItems',
          count(si.id) filter (
            where si.unit_cost is not null
          ),

        'missingCostItems',
          count(si.id) filter (
            where si.unit_cost is null
          ),

        'costFullyVerified',
          (
            count(si.id) > 0
            and count(si.id) filter (
              where si.unit_cost is null
            ) = 0
          )

      ) as product_data

    from public.sales s

    join public.sale_items si
      on si.sale_id = s.id

    join public.products p
      on p.id = si.product_id

    where s.organization_id = p_org_id
      and s.customer_id = p_customer_id
      and s.status = 'COMPLETED'
      and s.sold_at >= p_from
      and s.sold_at <= p_to
      and (
        p_store_id is null
        or s.store_id = p_store_id
      )

    group by
      si.product_id,
      p.name
  ) q;

  -- ==========================================================
  -- FINAL CANONICAL RESPONSE
  -- ==========================================================

  return jsonb_build_object(

    'engineVersion',
      'CRM_CUSTOMER_360_V1',

    'organizationId',
      p_org_id,

    'storeId',
      p_store_id,

    'requestedRange',
      jsonb_build_object(
        'from', p_from,
        'to', p_to
      ),

    'customer',
      jsonb_build_object(
        'id', v_customer.id,
        'name',
          coalesce(
            nullif(trim(v_customer.full_name), ''),
            nullif(trim(v_customer.name), ''),
            'UNKNOWN'
          ),
        'phone', v_customer.phone,
        'normalizedPhone', v_customer.normalized_phone,
        'customerRecordCreatedAt', v_customer.created_at
      ),

    'periodSummary',
      jsonb_build_object(
        'purchaseCount', v_period_orders,
        'revenue', v_period_revenue,
        'discountAmount', v_period_discount,

        'verifiedHistoricalCogs',
          v_period_cogs_verified,

        'grossProfit',
          v_period_gross_profit,

        'profitFullyVerified',
          v_period_profit_fully_verified,

        'costCoveragePercent',
          v_period_cost_coverage,

        'costItemCount',
          v_period_cost_items,

        'verifiedCostItems',
          v_period_cost_verified_items,

        'missingCostItems',
          v_period_missing_cost_items,

        'averageOrderValue',
          case
            when v_period_orders > 0
            then round(
              v_period_revenue
              / v_period_orders::numeric,
              2
            )
            else 0
          end
      ),

    'historicalSummary',
      jsonb_build_object(
        'asOf', p_to,

        'purchaseCount',
          v_historical_orders,

        'verifiedHistoricalSpend',
          v_historical_revenue,

        'firstVerifiedPurchaseAt',
          v_first_purchase,

        'lastVerifiedPurchaseAt',
          v_last_purchase,

        'verifiedHistoricalCogs',
          v_historical_cogs_verified,

        'grossProfit',
          v_historical_gross_profit,

        'profitFullyVerified',
          v_historical_profit_fully_verified,

        'costCoveragePercent',
          v_historical_cost_coverage,

        'costItemCount',
          v_historical_cost_items,

        'verifiedCostItems',
          v_historical_cost_verified_items,

        'missingCostItems',
          v_historical_missing_cost_items
      ),

    'receipts',
      v_receipts,

    'productSummary',
      v_products,

    'capabilities',
      jsonb_build_object(
        'verifiedReceiptHistory', true,
        'verifiedProductHistory', true,
        'verifiedSellerAttribution', true,
        'historicalCostBasedProfit', true,
        'creditLedgerMerged', false,
        'predictiveCustomerLifetimeValue', false,
        'automaticCrossStoreIdentityMerge', false
      ),

    'dataQuality',
      jsonb_build_object(

        'identityRule',
          'VERIFIED_CUSTOMER_ID_ONLY',

        'productNameSource',
          'CURRENT_PRODUCT_RECORD',

        'historicalProductNameSnapshotGuaranteed',
          false,

        'historicalCostSource',
          'SALE_ITEMS_UNIT_COST',

        'currentProductCostFallbackAllowed',
          false,

        'profitRule',
          'FULL_GROSS_PROFIT_ONLY_WHEN_ALL_RELEVANT_ITEM_COSTS_ARE_VERIFIED',

        'anonymousSalesAttributedToCustomer',
          false,

        'nameOrPhoneIdentityInference',
          false,

        'creditAccountAutoLinkedByPhoneOrName',
          false
      ),

    'generatedAt',
      now()
  );

end;
$function$;

REVOKE ALL ON FUNCTION public.get_ai_crm_customer_360_v1(uuid,uuid,timestamp with time zone,timestamp with time zone,uuid,integer) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.get_ai_crm_customer_360_v1(uuid,uuid,timestamp with time zone,timestamp with time zone,uuid,integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_business_debt(p_organization_id uuid, p_lender_name text, p_principal_amount numeric, p_store_id uuid DEFAULT NULL::uuid, p_debt_scope text DEFAULT 'STORE'::text, p_debt_type text DEFAULT 'SUPPLIER'::text, p_lender_phone text DEFAULT NULL::text, p_purpose text DEFAULT NULL::text, p_note text DEFAULT NULL::text, p_due_date date DEFAULT NULL::date)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
declare
  v_debt_id uuid;
  v_scope text;
BEGIN
PERFORM security_m2.require_owner(p_organization_id,p_store_id);
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  v_scope := upper(coalesce(p_debt_scope, 'STORE'));

  if v_scope not in ('STORE', 'ORG') then
    raise exception 'Invalid debt scope';
  end if;

  if not exists (
    select 1
    from public.org_memberships m
    where m.organization_id = p_organization_id
      and m.user_id = auth.uid()
      and m.role in ('owner', 'admin')
  ) then
    raise exception 'Access denied';
  end if;

  if v_scope = 'STORE' and p_store_id is null then
    raise exception 'Store debt requires store_id';
  end if;

  if p_store_id is not null and not exists (
    select 1
    from public.stores s
    where s.id = p_store_id
      and s.organization_id = p_organization_id
  ) then
    raise exception 'Store does not belong to organization';
  end if;

  insert into public.business_debts (
    organization_id,
    store_id,
    debt_scope,
    lender_name,
    lender_phone,
    debt_type,
    principal_amount,
    purpose,
    note,
    due_date,
    created_by
  )
  values (
    p_organization_id,
    case when v_scope = 'ORG' then null else p_store_id end,
    v_scope,
    trim(p_lender_name),
    nullif(trim(coalesce(p_lender_phone, '')), ''),
    upper(coalesce(p_debt_type, 'SUPPLIER')),
    p_principal_amount,
    nullif(trim(coalesce(p_purpose, '')), ''),
    nullif(trim(coalesce(p_note, '')), ''),
    p_due_date,
    auth.uid()
  )
  returning id into v_debt_id;

  return v_debt_id;
end;
$function$;

REVOKE ALL ON FUNCTION public.create_business_debt(uuid,text,numeric,uuid,text,text,text,text,text,date) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.create_business_debt(uuid,text,numeric,uuid,text,text,text,text,text,date) TO authenticated;

CREATE OR REPLACE FUNCTION public.record_business_debt_payment(p_debt_id uuid, p_amount numeric, p_note text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
declare
  v_payment_id uuid;
  v_org_id uuid;
  v_store_id uuid;
  v_new_paid numeric;
  v_principal numeric;
BEGIN
PERFORM security_m2.require_owner((SELECT d.organization_id FROM public.business_debts d WHERE d.id=p_debt_id),NULL::uuid);
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select d.organization_id, d.store_id, d.principal_amount
  into v_org_id, v_store_id, v_principal
  from public.business_debts d
  where d.id = p_debt_id
    and d.status <> 'CANCELLED';

  if v_org_id is null then
    raise exception 'Debt not found';
  end if;

  if not exists (
    select 1
    from public.org_memberships m
    where m.organization_id = v_org_id
      and m.user_id = auth.uid()
      and m.role in ('owner', 'admin')
  ) then
    raise exception 'Access denied';
  end if;

  insert into public.business_debt_payments (
    debt_id,
    organization_id,
    store_id,
    amount,
    note,
    created_by
  )
  values (
    p_debt_id,
    v_org_id,
    v_store_id,
    p_amount,
    nullif(trim(coalesce(p_note, '')), ''),
    auth.uid()
  )
  returning id into v_payment_id;

  select coalesce(sum(amount), 0)
  into v_new_paid
  from public.business_debt_payments
  where debt_id = p_debt_id;

  update public.business_debts
  set
    paid_amount = v_new_paid,
    status = case
      when v_new_paid >= v_principal then 'PAID'
      when v_new_paid > 0 then 'PARTIAL'
      else 'OPEN'
    end,
    updated_at = now()
  where id = p_debt_id;

  return v_payment_id;
end;
$function$;

REVOKE ALL ON FUNCTION public.record_business_debt_payment(uuid,numeric,text) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.record_business_debt_payment(uuid,numeric,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_business_debts(p_organization_id uuid, p_store_id uuid DEFAULT NULL::uuid, p_status text DEFAULT NULL::text)
 RETURNS TABLE(id uuid, organization_id uuid, store_id uuid, store_name text, debt_scope text, lender_name text, lender_phone text, debt_type text, principal_amount numeric, paid_amount numeric, balance_amount numeric, purpose text, note text, debt_date date, due_date date, status text, is_overdue boolean, created_by uuid, created_at timestamp with time zone, updated_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
BEGIN
PERFORM security_m2.require_owner(p_organization_id,p_store_id);
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if not exists (
    select 1
    from public.org_memberships m
    where m.organization_id = p_organization_id
      and m.user_id = auth.uid()
  ) then
    raise exception 'Access denied';
  end if;

  return query
  select
    d.id,
    d.organization_id,
    d.store_id,
    coalesce(s.name, 'Organization')::text as store_name,
    d.debt_scope,
    d.lender_name,
    d.lender_phone,
    d.debt_type,
    d.principal_amount,
    d.paid_amount,
    greatest(d.principal_amount - d.paid_amount, 0)::numeric as balance_amount,
    d.purpose,
    d.note,
    d.debt_date,
    d.due_date,
    d.status,
    (
      d.due_date is not null
      and d.due_date < current_date
      and d.status <> 'PAID'
      and d.status <> 'CANCELLED'
    ) as is_overdue,
    d.created_by,
    d.created_at,
    d.updated_at
  from public.business_debts d
  left join public.stores s on s.id = d.store_id
  where d.organization_id = p_organization_id
    and (
      p_store_id is null
      or d.store_id = p_store_id
    )
    and (
      p_status is null
      or d.status = p_status
    )
  order by d.created_at desc;
end;
$function$;

REVOKE ALL ON FUNCTION public.get_business_debts(uuid,uuid,text) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.get_business_debts(uuid,uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_business_debt_summary(p_organization_id uuid, p_store_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(total_debt numeric, total_paid numeric, total_balance numeric, open_count bigint, partial_count bigint, paid_count bigint, overdue_count bigint, stock_value numeric, debt_vs_stock_difference numeric, risk_level text, risk_message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
declare
  v_total_debt numeric := 0;
  v_total_paid numeric := 0;
  v_total_balance numeric := 0;
  v_open_count bigint := 0;
  v_partial_count bigint := 0;
  v_paid_count bigint := 0;
  v_overdue_count bigint := 0;
  v_stock_value numeric := 0;
  v_store record;
BEGIN
PERFORM security_m2.require_owner(p_organization_id,p_store_id);
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if not exists (
    select 1
    from public.org_memberships m
    where m.organization_id = p_organization_id
      and m.user_id = auth.uid()
  ) then
    raise exception 'Access denied';
  end if;

  select
    coalesce(sum(d.principal_amount), 0),
    coalesce(sum(d.paid_amount), 0),
    coalesce(sum(greatest(d.principal_amount - d.paid_amount, 0)), 0),
    count(*) filter (where d.status = 'OPEN'),
    count(*) filter (where d.status = 'PARTIAL'),
    count(*) filter (where d.status = 'PAID'),
    count(*) filter (
      where d.due_date is not null
        and d.due_date < current_date
        and d.status <> 'PAID'
        and d.status <> 'CANCELLED'
    )
  into
    v_total_debt,
    v_total_paid,
    v_total_balance,
    v_open_count,
    v_partial_count,
    v_paid_count,
    v_overdue_count
  from public.business_debts d
  where d.organization_id = p_organization_id
    and d.status <> 'CANCELLED'
    and (
      p_store_id is null
      or d.store_id = p_store_id
    );

  if p_store_id is not null then
    select coalesce(public.get_stock_on_hand_value_v1(p_organization_id, p_store_id), 0)
    into v_stock_value;
  else
    v_stock_value := 0;

    for v_store in
      select s.id
      from public.stores s
      where s.organization_id = p_organization_id
    loop
      v_stock_value :=
        v_stock_value + coalesce(public.get_stock_on_hand_value_v1(p_organization_id, v_store.id), 0);
    end loop;
  end if;

  return query
  select
    v_total_debt,
    v_total_paid,
    v_total_balance,
    v_open_count,
    v_partial_count,
    v_paid_count,
    v_overdue_count,
    v_stock_value,
    (v_stock_value - v_total_balance)::numeric as debt_vs_stock_difference,
    case
      when v_total_balance <= 0 then 'SAFE'
      when v_stock_value >= v_total_balance then 'SAFE'
      when v_stock_value > 0 and v_total_balance > v_stock_value then 'RISK'
      else 'WATCH'
    end as risk_level,
    case
      when v_total_balance <= 0 then 'Hakuna deni active kwa sasa.'
      when v_stock_value >= v_total_balance then 'Biashara iko salama: stock value ni kubwa kuliko deni lililobaki.'
      when v_stock_value > 0 and v_total_balance > v_stock_value then 'Tahadhari: deni lililobaki ni kubwa kuliko thamani ya stock iliyopo.'
      else 'Deni lipo, lakini stock value haijapatikana au ni ndogo sana.'
    end as risk_message;
end;
$function$;

REVOKE ALL ON FUNCTION public.get_business_debt_summary(uuid,uuid) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.get_business_debt_summary(uuid,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_supplier_debt_history_v1(p_supplier_id uuid)
 RETURNS TABLE(debt_id uuid, organization_id uuid, store_id uuid, store_name text, lender_name text, principal_amount numeric, paid_amount numeric, balance_amount numeric, purpose text, note text, debt_date date, due_date date, status text, is_overdue boolean, created_at timestamp with time zone, updated_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
BEGIN
PERFORM security_m2.require_owner((SELECT s.organization_id FROM public.suppliers s WHERE s.id=p_supplier_id),NULL::uuid);
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  return query
  select
    d.id,
    d.organization_id,
    d.store_id,
    coalesce(s.name, 'Organization')::text as store_name,
    d.lender_name,
    d.principal_amount,
    d.paid_amount,
    greatest(d.principal_amount - d.paid_amount, 0)::numeric as balance_amount,
    d.purpose,
    d.note,
    d.debt_date,
    d.due_date,
    d.status,
    (
      d.due_date is not null
      and d.due_date < current_date
      and d.status not in ('PAID', 'CANCELLED')
    ) as is_overdue,
    d.created_at,
    d.updated_at
  from public.business_debts d
  left join public.stores s on s.id = d.store_id
  where d.supplier_id = p_supplier_id
    and exists (
      select 1
      from public.org_memberships om
      where om.organization_id = d.organization_id
        and om.user_id = auth.uid()
        and coalesce(om.is_active, true) = true
    )
  order by d.created_at desc;
end;
$function$;

REVOKE ALL ON FUNCTION public.get_supplier_debt_history_v1(uuid) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.get_supplier_debt_history_v1(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.update_business_debt_v1(p_debt_id uuid, p_lender_name text, p_principal_amount numeric, p_purpose text DEFAULT NULL::text, p_note text DEFAULT NULL::text, p_supplier_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
declare
  v_org_id uuid;
  v_paid numeric;
BEGIN
PERFORM security_m2.require_owner((SELECT d.organization_id FROM public.business_debts d WHERE d.id=p_debt_id),NULL::uuid);
IF p_supplier_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.suppliers s WHERE s.id=p_supplier_id AND s.organization_id=(SELECT d.organization_id FROM public.business_debts d WHERE d.id=p_debt_id)) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='SUPPLIER_SCOPE_MISMATCH'; END IF;
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select organization_id, paid_amount
  into v_org_id, v_paid
  from public.business_debts
  where id = p_debt_id
    and status <> 'CANCELLED';

  if v_org_id is null then
    raise exception 'Debt not found';
  end if;

  if not exists (
    select 1
    from public.org_memberships m
    where m.organization_id = v_org_id
      and m.user_id = auth.uid()
      and m.role in ('owner', 'admin')
  ) then
    raise exception 'Access denied';
  end if;

  if p_principal_amount <= 0 then
    raise exception 'Invalid debt amount';
  end if;

  if p_supplier_id is not null and not exists (
    select 1
    from public.suppliers sp
    where sp.id = p_supplier_id
      and sp.organization_id = v_org_id
  ) then
    raise exception 'Invalid supplier';
  end if;

  update public.business_debts
  set
    lender_name = nullif(trim(coalesce(p_lender_name, '')), ''),
    principal_amount = p_principal_amount,
    purpose = nullif(trim(coalesce(p_purpose, '')), ''),
    note = nullif(trim(coalesce(p_note, '')), ''),
    supplier_id = p_supplier_id,
    status = case
      when coalesce(v_paid, 0) >= p_principal_amount then 'PAID'
      when coalesce(v_paid, 0) > 0 then 'PARTIAL'
      else 'OPEN'
    end,
    updated_at = now()
  where id = p_debt_id;

  return p_debt_id;
end;
$function$;

REVOKE ALL ON FUNCTION public.update_business_debt_v1(uuid,text,numeric,text,text,uuid) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.update_business_debt_v1(uuid,text,numeric,text,text,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_inbound_stock_summary_v1(p_organization_id uuid, p_store_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(total_orders bigint, active_orders bigint, arrived_orders bigint, received_orders bigint, cancelled_orders bigint, total_goods_value numeric, total_paid_amount numeric, total_balance_amount numeric, total_landed_cost numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$BEGIN
PERFORM security_m2.require_owner(p_organization_id,p_store_id);
RETURN QUERY select
    count(*)::bigint as total_orders,
    count(*) filter (where upper(coalesce(o.status, '')) in ('DRAFT','ORDERED','IN_TRANSIT'))::bigint as active_orders,
    count(*) filter (where upper(coalesce(o.status, '')) = 'ARRIVED')::bigint as arrived_orders,
    count(*) filter (where upper(coalesce(o.status, '')) = 'RECEIVED')::bigint as received_orders,
    count(*) filter (where upper(coalesce(o.status, '')) = 'CANCELLED')::bigint as cancelled_orders,
    coalesce(sum(o.total_goods_value), 0)::numeric as total_goods_value,
    coalesce(sum(o.total_paid_amount), 0)::numeric as total_paid_amount,
    coalesce(sum(o.total_balance_amount), 0)::numeric as total_balance_amount,
    coalesce(sum(
      coalesce(o.total_goods_value, 0)
      + coalesce(o.freight_cost, 0)
      + coalesce(o.customs_cost, 0)
      + coalesce(o.other_cost, 0)
    ), 0)::numeric as total_landed_cost
  from public.inbound_stock_orders o
  where o.organization_id = p_organization_id
    and (p_store_id is null or o.store_id = p_store_id)
    and exists (
      select 1
      from public.org_memberships m
      where m.organization_id = o.organization_id
        and m.user_id = auth.uid()
        and coalesce(m.is_active, true) = true
    );
END;
$function$;

REVOKE ALL ON FUNCTION public.get_inbound_stock_summary_v1(uuid,uuid) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.get_inbound_stock_summary_v1(uuid,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.receive_inbound_stock_partial_v1(p_order_id uuid, p_receipts jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
declare
  v_org_id uuid;
  v_store_id uuid;
  v_supplier_id uuid;
  v_supplier_name text;
  v_order_code text;
  v_product_id uuid;
  v_all_received boolean;
  v_goods_total numeric := 0;
  v_paid_total numeric := 0;
  v_balance numeric := 0;
  v_existing_debt_id uuid;
  v_current_qty numeric := 0;
  v_next_qty numeric := 0;

  -- One canonical business event for THIS receiving execution.
  v_receive_event_id uuid := gen_random_uuid();

  x jsonb;
  r record;
  v_receive_qty numeric;
  v_remaining numeric;
BEGIN
PERFORM security_m2.require_store((SELECT o.organization_id FROM public.inbound_stock_orders o WHERE o.id=p_order_id),(SELECT o.store_id FROM public.inbound_stock_orders o WHERE o.id=p_order_id));
IF EXISTS(SELECT 1 FROM public.inbound_stock_orders o WHERE o.id=p_order_id AND (NOT EXISTS(SELECT 1 FROM public.stores s WHERE s.id=o.store_id AND s.organization_id=o.organization_id) OR o.supplier_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.suppliers s WHERE s.id=o.supplier_id AND s.organization_id=o.organization_id) OR EXISTS(SELECT 1 FROM public.inbound_stock_items i LEFT JOIN public.products p ON p.id=i.product_id WHERE i.inbound_order_id=o.id AND (i.organization_id IS DISTINCT FROM o.organization_id OR i.product_id IS NOT NULL AND p.organization_id IS DISTINCT FROM o.organization_id)))) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='INBOUND_EXISTING_SCOPE_MISMATCH'; END IF;
PERFORM 1 FROM public.inbound_stock_orders o WHERE o.id=p_order_id FOR UPDATE;
IF EXISTS(SELECT 1 FROM public.inbound_stock_orders o WHERE o.id=p_order_id AND (o.deleted_at IS NOT NULL OR o.status='CANCELLED')) THEN RAISE EXCEPTION 'INBOUND_ORDER_CLOSED'; END IF;
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select
    organization_id,
    store_id,
    supplier_id,
    supplier_name,
    order_code
  into
    v_org_id,
    v_store_id,
    v_supplier_id,
    v_supplier_name,
    v_order_code
  from public.inbound_stock_orders
  where id = p_order_id;

  if v_org_id is null then
    raise exception 'Invalid inbound order';
  end if;

  if v_store_id is null then
    raise exception 'Order has no store selected';
  end if;

  if v_supplier_id is null then
    raise exception 'Supplier is not linked to this inbound order';
  end if;

  if not exists (
    select 1
    from public.org_memberships m
    where m.organization_id = v_org_id
      and m.user_id = auth.uid()
      and m.role in ('owner','admin')
      and coalesce(m.is_active,true)=true
  ) then
    raise exception 'Access denied';
  end if;

  if exists (
    select 1
    from public.inbound_stock_orders
    where id = p_order_id
      and status = 'RECEIVED'
  ) then
    raise exception 'This inbound order is already fully received';
  end if;

  for x in
    select *
    from jsonb_array_elements(coalesce(p_receipts, '[]'::jsonb))
  loop

    v_receive_qty := coalesce((x->>'qty')::numeric, 0);

    if v_receive_qty <= 0 then
      continue;
    end if;

    select *
    into r
    from public.inbound_stock_items
    where id = (x->>'item_id')::uuid
      and inbound_order_id = p_order_id;

    if r.id is null then
      raise exception 'Invalid inbound item';
    end if;

    v_remaining :=
      coalesce(r.qty_ordered,0) -
      coalesce(r.qty_received,0);

    if v_receive_qty > v_remaining then
      raise exception 'Receive qty cannot exceed remaining qty';
    end if;

    v_product_id := null;

    select p.id
    into v_product_id
    from public.products p
    where p.organization_id = v_org_id
      and p.store_id = v_store_id
      and (
        (
          r.barcode is not null
          and r.barcode <> ''
          and p.barcode = r.barcode
        )
        or
        (
          r.sku is not null
          and r.sku <> ''
          and p.sku = r.sku
        )
      )
    limit 1;

    if v_product_id is null then

      insert into public.products (
        organization_id,
        store_id,
        name,
        sku,
        barcode,
        unit,
        category,
        cost_price,
        selling_price,
        qty_on_hand,
        created_by
      )
      values (
        v_org_id,
        v_store_id,
        coalesce(
          nullif(trim(r.product_name),''),
          'Unnamed Product'
        ),
        nullif(trim(coalesce(r.sku,'')),''),
        nullif(trim(coalesce(r.barcode,'')),''),
        coalesce(
          nullif(trim(coalesce(r.unit,'')),''),
          'pcs'
        ),
        nullif(trim(coalesce(r.category,'')),''),
        coalesce(r.unit_cost,0),
        coalesce(r.proposed_sell_price,0),
        0,
        auth.uid()
      )
      returning id into v_product_id;

    end if;

    insert into public.inventory (
      organization_id,
      store_id,
      product_id,
      qty
    )
    values (
      v_org_id,
      v_store_id,
      v_product_id,
      0
    )
    on conflict (store_id, product_id)
    do nothing;

    select coalesce(i.qty, 0)
    into v_current_qty
    from public.inventory i
    where i.store_id = v_store_id
      and i.product_id = v_product_id
    for update;

    v_next_qty :=
      coalesce(v_current_qty, 0) +
      v_receive_qty;

    update public.inventory
    set
      qty = v_next_qty,
      organization_id = v_org_id,
      updated_at = now()
    where store_id = v_store_id
      and product_id = v_product_id;

    update public.products
    set
      qty_on_hand = v_next_qty,
      unit = coalesce(
        nullif(trim(coalesce(r.unit,'')),''),
        unit
      ),
      category = coalesce(
        nullif(trim(coalesce(r.category,'')),''),
        category
      ),
      cost_price = coalesce(
        nullif(r.unit_cost,0),
        cost_price
      ),
      selling_price = coalesce(
        nullif(r.proposed_sell_price,0),
        selling_price
      ),
      updated_at = now()
    where id = v_product_id;

    -- ========================================================
    -- IMPORTANT CHANGE:
    -- Every movement produced by THIS receive execution gets
    -- the SAME event_id.
    -- ========================================================

    insert into public.stock_movements (
      organization_id,
      store_id,
      product_id,
      mode,
      amount,
      note,
      created_by,
      supplier_id,
      supplier_name,
      supplier_invoice_no,
      event_id
    )
    values (
      v_org_id,
      v_store_id,
      v_product_id,
      'ADD',
      v_receive_qty,
      'Partial received from inbound order ' ||
        coalesce(v_order_code, p_order_id::text),
      auth.uid(),
      v_supplier_id,
      v_supplier_name,
      v_order_code,
      v_receive_event_id
    );

    update public.inbound_stock_items
    set
      product_id = v_product_id,
      qty_received =
        coalesce(qty_received,0) +
        v_receive_qty,
      updated_at = now()
    where id = r.id;

  end loop;

  select not exists (
    select 1
    from public.inbound_stock_items
    where inbound_order_id = p_order_id
      and coalesce(qty_received,0) <
          coalesce(qty_ordered,0)
  )
  into v_all_received;

  select
    coalesce(total_goods_value,0),
    coalesce(total_paid_amount,0),
    coalesce(total_balance_amount,0)
  into
    v_goods_total,
    v_paid_total,
    v_balance
  from public.inbound_stock_orders
  where id = p_order_id;

  if coalesce(v_balance,0) <= 0 then
    v_balance :=
      greatest(
        coalesce(v_goods_total,0) -
        coalesce(v_paid_total,0),
        0
      );
  end if;

  select id
  into v_existing_debt_id
  from public.business_debts
  where organization_id = v_org_id
    and supplier_id = v_supplier_id
    and note ilike '%' || p_order_id::text || '%'
  limit 1;

  if v_balance > 0
     and v_existing_debt_id is null then

    insert into public.business_debts (
      organization_id,
      store_id,
      debt_scope,
      lender_name,
      lender_phone,
      debt_type,
      principal_amount,
      paid_amount,
      purpose,
      note,
      debt_date,
      status,
      supplier_id,
      created_by
    )
    values (
      v_org_id,
      v_store_id,
      'STORE',
      coalesce(
        nullif(trim(v_supplier_name),''),
        'Supplier'
      ),
      null,
      'SUPPLIER',
      v_balance,
      0,
      'Inbound stock balance: ' ||
        coalesce(v_order_code, p_order_id::text),
      'Auto-created from inbound order. INBOUND_ORDER_ID:' ||
        p_order_id::text,
      current_date,
      'OPEN',
      v_supplier_id,
      auth.uid()
    );

  end if;

  update public.inbound_stock_orders
  set
    status =
      case
        when v_all_received
          then 'RECEIVED'
        else 'PARTIAL_RECEIVED'
      end,

    received_at =
      case
        when v_all_received
          then coalesce(received_at, now())
        else received_at
      end,

    updated_at = now()

  where id = p_order_id;

  return true;
end;
$function$;

REVOKE ALL ON FUNCTION public.receive_inbound_stock_partial_v1(uuid,jsonb) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.receive_inbound_stock_partial_v1(uuid,jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_inbound_stock_orders_v1(p_org_id uuid, p_store_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(id uuid, order_code text, supplier_name text, source_country text, source_city text, destination_name text, status text, total_items integer, total_goods_value numeric, total_paid_amount numeric, total_balance_amount numeric, expected_arrival_date date, created_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$BEGIN
PERFORM security_m2.require_store(p_org_id,p_store_id);
RETURN QUERY select
    o.id,
    o.order_code,
    o.supplier_name,
    o.source_country,
    o.source_city,
    o.destination_name,
    o.status,
    coalesce(o.total_items, 0)::integer,
    CASE WHEN security_m2.owner_of(p_org_id) THEN coalesce(o.total_goods_value,0) ELSE NULL::numeric END,
    CASE WHEN security_m2.owner_of(p_org_id) THEN coalesce(o.total_paid_amount,0) ELSE NULL::numeric END,
    CASE WHEN security_m2.owner_of(p_org_id) THEN coalesce(o.total_balance_amount,0) ELSE NULL::numeric END,
    o.expected_arrival_date,
    o.created_at
  from public.inbound_stock_orders o
  where o.organization_id = p_org_id
    and (p_store_id is null or o.store_id = p_store_id)
  order by o.created_at desc;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_inbound_stock_orders_v1(uuid,uuid) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.get_inbound_stock_orders_v1(uuid,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.record_inbound_stock_payment_v1(p_order_id uuid, p_amount numeric, p_payment_method text DEFAULT NULL::text, p_reference text DEFAULT NULL::text, p_note text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
declare
  v_payment_id uuid;
  v_org_id uuid;
  v_has_total_paid boolean;
  v_has_total_paid_amount boolean;
  v_has_balance_amount boolean;
  v_has_total_balance_amount boolean;
  v_has_total_value boolean;
  v_has_total_goods_value boolean;
BEGIN
PERFORM security_m2.require_owner((SELECT o.organization_id FROM public.inbound_stock_orders o WHERE o.id=p_order_id),(SELECT o.store_id FROM public.inbound_stock_orders o WHERE o.id=p_order_id));
IF EXISTS(SELECT 1 FROM public.inbound_stock_orders o WHERE o.id=p_order_id AND (NOT EXISTS(SELECT 1 FROM public.stores s WHERE s.id=o.store_id AND s.organization_id=o.organization_id) OR o.supplier_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.suppliers s WHERE s.id=o.supplier_id AND s.organization_id=o.organization_id) OR EXISTS(SELECT 1 FROM public.inbound_stock_items i LEFT JOIN public.products p ON p.id=i.product_id WHERE i.inbound_order_id=o.id AND (i.organization_id IS DISTINCT FROM o.organization_id OR i.product_id IS NOT NULL AND p.organization_id IS DISTINCT FROM o.organization_id)))) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='INBOUND_EXISTING_SCOPE_MISMATCH'; END IF;
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if coalesce(p_amount, 0) <= 0 then
    raise exception 'Payment amount must be greater than zero';
  end if;

  select o.organization_id
    into v_org_id
  from public.inbound_stock_orders o
  where o.id = p_order_id;

  if v_org_id is null then
    raise exception 'Invalid inbound order';
  end if;

  if not exists (
    select 1
    from public.org_memberships m
    where m.organization_id = v_org_id
      and m.user_id = auth.uid()
      and m.role in ('owner', 'admin')
      and coalesce(m.is_active, true) = true
  ) then
    raise exception 'Access denied';
  end if;

  insert into public.inbound_stock_payments (
    inbound_order_id,
    organization_id,
    created_by,
    payment_type,
    amount,
    payment_method,
    reference_number,
    note,
    paid_at
  )
  values (
    p_order_id,
    v_org_id,
    auth.uid(),
    'GOODS',
    p_amount,
    nullif(trim(coalesce(p_payment_method, '')), ''),
    nullif(trim(coalesce(p_reference, '')), ''),
    nullif(trim(coalesce(p_note, '')), ''),
    now()
  )
  returning id into v_payment_id;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'inbound_stock_orders'
      and column_name = 'total_paid'
  ) into v_has_total_paid;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'inbound_stock_orders'
      and column_name = 'total_paid_amount'
  ) into v_has_total_paid_amount;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'inbound_stock_orders'
      and column_name = 'balance_amount'
  ) into v_has_balance_amount;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'inbound_stock_orders'
      and column_name = 'total_balance_amount'
  ) into v_has_total_balance_amount;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'inbound_stock_orders'
      and column_name = 'total_value'
  ) into v_has_total_value;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'inbound_stock_orders'
      and column_name = 'total_goods_value'
  ) into v_has_total_goods_value;

  if v_has_total_paid_amount then
    update public.inbound_stock_orders
    set total_paid_amount = coalesce(total_paid_amount, 0) + p_amount
    where id = p_order_id;
  elsif v_has_total_paid then
    update public.inbound_stock_orders
    set total_paid = coalesce(total_paid, 0) + p_amount
    where id = p_order_id;
  end if;

  if v_has_total_balance_amount and v_has_total_goods_value and v_has_total_paid_amount then
    update public.inbound_stock_orders
    set total_balance_amount = greatest(coalesce(total_goods_value, 0) - coalesce(total_paid_amount, 0), 0)
    where id = p_order_id;
  elsif v_has_balance_amount and v_has_total_value and v_has_total_paid then
    update public.inbound_stock_orders
    set balance_amount = greatest(coalesce(total_value, 0) - coalesce(total_paid, 0), 0)
    where id = p_order_id;
  end if;

  return v_payment_id;
end;
$function$;

REVOKE ALL ON FUNCTION public.record_inbound_stock_payment_v1(uuid,numeric,text,text,text) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.record_inbound_stock_payment_v1(uuid,numeric,text,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.add_inbound_stock_item_v1(p_order_id uuid, p_product_name text, p_sku text DEFAULT NULL::text, p_unit text DEFAULT NULL::text, p_category text DEFAULT NULL::text, p_barcode text DEFAULT NULL::text, p_quantity numeric DEFAULT 0, p_unit_cost numeric DEFAULT 0, p_selling_price numeric DEFAULT 0, p_note text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
declare
  v_item_id uuid;
  v_org_id uuid;
  v_total numeric;
  v_paid numeric;
BEGIN
PERFORM security_m2.require_owner((SELECT o.organization_id FROM public.inbound_stock_orders o WHERE o.id=p_order_id),(SELECT o.store_id FROM public.inbound_stock_orders o WHERE o.id=p_order_id));
IF EXISTS(SELECT 1 FROM public.inbound_stock_orders o WHERE o.id=p_order_id AND (NOT EXISTS(SELECT 1 FROM public.stores s WHERE s.id=o.store_id AND s.organization_id=o.organization_id) OR o.supplier_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.suppliers s WHERE s.id=o.supplier_id AND s.organization_id=o.organization_id) OR EXISTS(SELECT 1 FROM public.inbound_stock_items i LEFT JOIN public.products p ON p.id=i.product_id WHERE i.inbound_order_id=o.id AND (i.organization_id IS DISTINCT FROM o.organization_id OR i.product_id IS NOT NULL AND p.organization_id IS DISTINCT FROM o.organization_id)))) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='INBOUND_EXISTING_SCOPE_MISMATCH'; END IF;
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select o.organization_id into v_org_id
  from public.inbound_stock_orders o
  where o.id = p_order_id;

  if v_org_id is null then
    raise exception 'Inbound order not found';
  end if;

  if not exists (
    select 1
    from public.org_memberships m
    where m.organization_id = v_org_id
      and m.user_id = auth.uid()
      and m.role in ('owner', 'admin')
      and coalesce(m.is_active, true) = true
  ) then
    raise exception 'Access denied';
  end if;

  if nullif(trim(coalesce(p_product_name, '')), '') is null then
    raise exception 'Product name is required';
  end if;

  if coalesce(p_quantity, 0) <= 0 then
    raise exception 'Quantity must be greater than zero';
  end if;

  if coalesce(p_unit_cost, 0) <= 0 then
    raise exception 'Unit cost must be greater than zero';
  end if;

  v_total := coalesce(p_quantity, 0) * coalesce(p_unit_cost, 0);

  insert into public.inbound_stock_items (
    inbound_order_id,
    organization_id,
    product_name,
    sku,
    unit,
    category,
    barcode,
    qty_ordered,
    unit_cost,
    proposed_sell_price,
    total_cost,
    is_new_product,
    note
  )
  values (
    p_order_id,
    v_org_id,
    nullif(trim(coalesce(p_product_name, '')), ''),
    nullif(trim(coalesce(p_sku, '')), ''),
    nullif(trim(coalesce(p_unit, '')), ''),
    nullif(trim(coalesce(p_category, '')), ''),
    nullif(trim(coalesce(p_barcode, '')), ''),
    p_quantity,
    p_unit_cost,
    coalesce(p_selling_price, 0),
    v_total,
    true,
    nullif(trim(coalesce(p_note, '')), '')
  )
  returning id into v_item_id;

  select coalesce(sum(i.total_cost), 0) into v_total
  from public.inbound_stock_items i
  where i.inbound_order_id = p_order_id;

  select coalesce(sum(p.amount), 0) into v_paid
  from public.inbound_stock_payments p
  where p.inbound_order_id = p_order_id;

  update public.inbound_stock_orders
  set
    total_goods_value = v_total,
    total_balance_amount = greatest(v_total - v_paid, 0),
    updated_at = now()
  where id = p_order_id;

  return v_item_id;
end;
$function$;

REVOKE ALL ON FUNCTION public.add_inbound_stock_item_v1(uuid,text,text,text,text,text,numeric,numeric,numeric,text) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.add_inbound_stock_item_v1(uuid,text,text,text,text,text,numeric,numeric,numeric,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_inbound_stock_order_items_v1(p_order_id uuid)
 RETURNS TABLE(id uuid, inbound_order_id uuid, product_name text, sku text, barcode text, qty_ordered numeric, qty_received numeric, damaged_qty numeric, missing_qty numeric, unit_cost numeric, proposed_sell_price numeric, total_cost numeric, is_new_product boolean, note text, created_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
declare
  v_org_id uuid;
BEGIN
PERFORM security_m2.require_store((SELECT o.organization_id FROM public.inbound_stock_orders o WHERE o.id=p_order_id),(SELECT o.store_id FROM public.inbound_stock_orders o WHERE o.id=p_order_id));
IF EXISTS(SELECT 1 FROM public.inbound_stock_orders o WHERE o.id=p_order_id AND (NOT EXISTS(SELECT 1 FROM public.stores s WHERE s.id=o.store_id AND s.organization_id=o.organization_id) OR o.supplier_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.suppliers s WHERE s.id=o.supplier_id AND s.organization_id=o.organization_id) OR EXISTS(SELECT 1 FROM public.inbound_stock_items i LEFT JOIN public.products p ON p.id=i.product_id WHERE i.inbound_order_id=o.id AND (i.organization_id IS DISTINCT FROM o.organization_id OR i.product_id IS NOT NULL AND p.organization_id IS DISTINCT FROM o.organization_id)))) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='INBOUND_EXISTING_SCOPE_MISMATCH'; END IF;
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select o.organization_id
    into v_org_id
  from public.inbound_stock_orders o
  where o.id = p_order_id;

  if v_org_id is null then
    raise exception 'Invalid inbound order';
  end if;

  if not exists (
    select 1
    from public.org_memberships m
    where m.organization_id = v_org_id
      and m.user_id = auth.uid()
      and coalesce(m.is_active, true) = true
  ) then
    raise exception 'Access denied';
  end if;

  return query
  select
    i.id,
    i.inbound_order_id,
    i.product_name,
    i.sku,
    i.barcode,
    coalesce(i.qty_ordered, 0),
    coalesce(i.qty_received, 0),
    coalesce(i.damaged_qty, 0),
    coalesce(i.missing_qty, 0),
    CASE WHEN security_m2.owner_of(v_org_id) THEN coalesce(i.unit_cost,0) ELSE NULL::numeric END,
    coalesce(i.proposed_sell_price, 0),
    CASE WHEN security_m2.owner_of(v_org_id) THEN coalesce(i.total_cost,0) ELSE NULL::numeric END,
    coalesce(i.is_new_product, true),
    CASE WHEN security_m2.owner_of(v_org_id) THEN i.note ELSE NULL::text END,
    i.created_at
  from public.inbound_stock_items i
  where i.inbound_order_id = p_order_id
  order by i.created_at asc, i.product_name asc;
end;
$function$;

REVOKE ALL ON FUNCTION public.get_inbound_stock_order_items_v1(uuid) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.get_inbound_stock_order_items_v1(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.delete_inbound_stock_order_v1(p_order_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
declare
  v_org_id uuid;
  v_status text;
BEGIN
PERFORM security_m2.require_store((SELECT o.organization_id FROM public.inbound_stock_orders o WHERE o.id=p_order_id),(SELECT o.store_id FROM public.inbound_stock_orders o WHERE o.id=p_order_id));
IF EXISTS(SELECT 1 FROM public.inbound_stock_orders o WHERE o.id=p_order_id AND (NOT EXISTS(SELECT 1 FROM public.stores s WHERE s.id=o.store_id AND s.organization_id=o.organization_id) OR o.supplier_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.suppliers s WHERE s.id=o.supplier_id AND s.organization_id=o.organization_id) OR EXISTS(SELECT 1 FROM public.inbound_stock_items i LEFT JOIN public.products p ON p.id=i.product_id WHERE i.inbound_order_id=o.id AND (i.organization_id IS DISTINCT FROM o.organization_id OR i.product_id IS NOT NULL AND p.organization_id IS DISTINCT FROM o.organization_id)))) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='INBOUND_EXISTING_SCOPE_MISMATCH'; END IF;
PERFORM 1 FROM public.inbound_stock_orders o WHERE o.id=p_order_id FOR UPDATE;
IF EXISTS(SELECT 1 FROM public.inbound_stock_items i WHERE i.inbound_order_id=p_order_id AND i.qty_received>0) THEN RAISE EXCEPTION 'RECEIVED_ORDER_DELETE_BLOCKED'; END IF;
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select o.organization_id, o.status
    into v_org_id, v_status
  from public.inbound_stock_orders o
  where o.id = p_order_id;

  if v_org_id is null then
    raise exception 'Invalid inbound order';
  end if;

  if not exists (
    select 1
    from public.org_memberships m
    where m.organization_id = v_org_id
      and m.user_id = auth.uid()
      and m.role in ('owner', 'admin')
      and coalesce(m.is_active, true) = true
  ) then
    raise exception 'Access denied';
  end if;

  if upper(coalesce(v_status, '')) in ('RECEIVED', 'COMPLETED', 'CLOSED') then
    raise exception 'This inbound order is already finalized and cannot be deleted';
  end if;

  delete from public.inbound_stock_payments
  where inbound_order_id = p_order_id;

  delete from public.inbound_stock_items
  where inbound_order_id = p_order_id;

  delete from public.inbound_stock_orders
  where id = p_order_id;

  return true;
end;
$function$;

REVOKE ALL ON FUNCTION public.delete_inbound_stock_order_v1(uuid) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.delete_inbound_stock_order_v1(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_inbound_stock_suggestions_v1(p_org_id uuid, p_store_id uuid DEFAULT NULL::uuid, p_query text DEFAULT NULL::text)
 RETURNS TABLE(suggestion_type text, product_id uuid, product_name text, sku text, unit text, category text, barcode text, cost_price numeric, selling_price numeric, supplier_name text, supplier_phone text, supplier_email text, supplier_location text, supplier_address text, source_country text, source_city text, destination_name text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
declare
  v_query text := lower(trim(coalesce(p_query, '')));
BEGIN
PERFORM security_m2.require_store(p_org_id,p_store_id);
  return query
  select *
  from (
    select *
    from (
      select
        'PRODUCT'::text,
        p.id::uuid,
        p.name::text,
        p.sku::text,
        p.unit::text,
        p.category::text,
        p.barcode::text,
        CASE WHEN security_m2.owner_of(p_org_id) THEN p.cost_price ELSE NULL::numeric END,
        p.selling_price::numeric,
        null::text,
        null::text,
        null::text,
        null::text,
        null::text,
        null::text,
        null::text,
        null::text
      from public.products p
      where p.organization_id = p_org_id
        and coalesce(p.is_active, true) is true

      union all

      select
        'SUPPLIER'::text,
        null::uuid,
        null::text,
        null::text,
        null::text,
        null::text,
        null::text,
        null::numeric,
        null::numeric,
        s.name::text,
        s.phone::text,
        s.email::text,
        s.location::text,
        s.address::text,
        null::text,
        null::text,
        null::text
      from public.suppliers s
      where s.organization_id = p_org_id
        and coalesce(s.is_active, true) is true

      union all

      select
        'SUPPLIER'::text,
        null::uuid,
        null::text,
        null::text,
        null::text,
        null::text,
        null::text,
        null::numeric,
        null::numeric,
        o.supplier_name::text,
        null::text,
        null::text,
        null::text,
        null::text,
        o.source_country::text,
        o.source_city::text,
        o.destination_name::text
      from public.inbound_stock_orders o
      where o.organization_id = p_org_id
    ) as q(
      suggestion_type,
      product_id,
      product_name,
      sku,
      unit,
      category,
      barcode,
      cost_price,
      selling_price,
      supplier_name,
      supplier_phone,
      supplier_email,
      supplier_location,
      supplier_address,
      source_country,
      source_city,
      destination_name
    )
    where
      v_query = ''
      or lower(coalesce(q.product_name, '')) like '%' || v_query || '%'
      or lower(coalesce(q.sku, '')) like '%' || v_query || '%'
      or lower(coalesce(q.barcode, '')) like '%' || v_query || '%'
      or lower(coalesce(q.supplier_name, '')) like '%' || v_query || '%'
      or lower(coalesce(q.supplier_phone, '')) like '%' || v_query || '%'
      or lower(coalesce(q.supplier_email, '')) like '%' || v_query || '%'
  ) final_q
  order by
    final_q.suggestion_type asc,
    final_q.supplier_name nulls last,
    final_q.product_name nulls last
  limit 120;
end;
$function$;

REVOKE ALL ON FUNCTION public.get_inbound_stock_suggestions_v1(uuid,uuid,text) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.get_inbound_stock_suggestions_v1(uuid,uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_inbound_stock_order_v1(p_org_id uuid, p_store_id uuid, p_supplier_name text, p_source_country text DEFAULT NULL::text, p_source_city text DEFAULT NULL::text, p_destination_name text DEFAULT NULL::text, p_invoice_number text DEFAULT NULL::text, p_tracking_number text DEFAULT NULL::text, p_expected_arrival_date date DEFAULT NULL::date, p_note text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
declare
  v_order_id uuid;
  v_order_code text;
  v_supplier_id uuid;
  v_supplier_name text := nullif(trim(coalesce(p_supplier_name, '')), '');
BEGIN
PERFORM security_m2.require_store(p_org_id,p_store_id);
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if p_org_id is null then
    raise exception 'p_org_id is required';
  end if;

  if v_supplier_name is null then
    raise exception 'Supplier name is required';
  end if;

  if not exists (
    select 1
    from public.org_memberships m
    where m.organization_id = p_org_id
      and m.user_id = auth.uid()
      and m.role in ('owner', 'admin')
      and coalesce(m.is_active, true) = true
  ) then
    raise exception 'Access denied';
  end if;

  if p_store_id is not null and not exists (
    select 1
    from public.stores s
    where s.id = p_store_id
      and s.organization_id = p_org_id
  ) then
    raise exception 'Invalid store';
  end if;

  select s.id
    into v_supplier_id
  from public.suppliers s
  where s.organization_id = p_org_id
    and lower(trim(s.name)) = lower(v_supplier_name)
    and coalesce(s.is_active, true) = true
  order by s.updated_at desc nulls last, s.created_at desc nulls last
  limit 1;

  if v_supplier_id is null then
    insert into public.suppliers (
      organization_id,
      name,
      is_active,
      created_by
    )
    values (
      p_org_id,
      v_supplier_name,
      true,
      auth.uid()
    )
    returning id into v_supplier_id;
  end if;

  v_order_code := 'INB-' || to_char(now(), 'YYYYMMDD-HH24MISS') || '-' ||
                  upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));

  insert into public.inbound_stock_orders (
    organization_id,
    store_id,
    supplier_id,
    order_code,
    supplier_name,
    source_country,
    source_city,
    destination_name,
    invoice_number,
    tracking_number,
    expected_arrival_date,
    note,
    status,
    created_by
  )
  values (
    p_org_id,
    p_store_id,
    v_supplier_id,
    v_order_code,
    v_supplier_name,
    nullif(trim(coalesce(p_source_country, '')), ''),
    nullif(trim(coalesce(p_source_city, '')), ''),
    nullif(trim(coalesce(p_destination_name, '')), ''),
    nullif(trim(coalesce(p_invoice_number, '')), ''),
    nullif(trim(coalesce(p_tracking_number, '')), ''),
    p_expected_arrival_date,
    nullif(trim(coalesce(p_note, '')), ''),
    'IN_TRANSIT',
    auth.uid()
  )
  returning id into v_order_id;

  return v_order_id;
end;
$function$;

REVOKE ALL ON FUNCTION public.create_inbound_stock_order_v1(uuid,uuid,text,text,text,text,text,text,date,text) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.create_inbound_stock_order_v1(uuid,uuid,text,text,text,text,text,text,date,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_supplier_stock_history_v1(p_supplier_id uuid)
 RETURNS TABLE(movement_id uuid, supplier_id uuid, supplier_name text, supplier_invoice_no text, organization_id uuid, store_id uuid, store_name text, product_id uuid, product_name text, sku text, mode text, amount numeric, note text, created_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$BEGIN
IF NOT EXISTS(SELECT 1 FROM public.org_memberships m JOIN public.organizations o ON o.id=m.organization_id WHERE m.organization_id=(SELECT s.organization_id FROM public.suppliers s WHERE s.id=p_supplier_id) AND m.user_id=auth.uid() AND m.is_active IS TRUE AND o.is_active IS TRUE) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='WORKSPACE_ACCESS_REQUIRED'; END IF;
RETURN QUERY select
    sm.id as movement_id,
    sm.supplier_id,
    coalesce(sm.supplier_name, s.name)::text as supplier_name,
    sm.supplier_invoice_no,
    sm.organization_id,
    sm.store_id,
    st.name as store_name,
    sm.product_id,
    p.name as product_name,
    p.sku,
    sm.mode,
    sm.amount,
    CASE WHEN security_m2.owner_of(sm.organization_id) THEN sm.note ELSE NULL::text END,
    sm.created_at
  from public.stock_movements sm
  left join public.suppliers s on s.id = sm.supplier_id
  left join public.products p on p.id = sm.product_id
  left join public.stores st on st.id = sm.store_id
  where sm.supplier_id = p_supplier_id AND security_m2.store_allowed(sm.organization_id,sm.store_id)
    and exists (
      select 1
      from public.org_memberships om
      where om.organization_id = sm.organization_id
        and om.user_id = auth.uid()
        and coalesce(om.is_active, true) = true
    )

  union all

  select
    i.id as movement_id,
    o.supplier_id,
    coalesce(o.supplier_name, s.name)::text as supplier_name,
    coalesce(o.invoice_number, o.order_code)::text as supplier_invoice_no,
    i.organization_id,
    o.store_id,
    st.name as store_name,
    i.product_id,
    i.product_name,
    i.sku,
    'INBOUND'::text as mode,
    i.qty_ordered as amount,
    CASE WHEN security_m2.owner_of(i.organization_id) THEN i.note ELSE NULL::text END as note,
    i.created_at
  from public.inbound_stock_items i
  join public.inbound_stock_orders o on o.id = i.inbound_order_id
  left join public.suppliers s on s.id = o.supplier_id
  left join public.stores st on st.id = o.store_id
  where o.supplier_id = p_supplier_id AND security_m2.store_allowed(o.organization_id,o.store_id)
    and exists (
      select 1
      from public.org_memberships om
      where om.organization_id = i.organization_id
        and om.user_id = auth.uid()
        and coalesce(om.is_active, true) = true
    )

  order by created_at desc;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_supplier_stock_history_v1(uuid) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.get_supplier_stock_history_v1(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.receive_inbound_stock_v1(p_order_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  v_payload jsonb;
BEGIN
PERFORM security_m2.require_store((SELECT o.organization_id FROM public.inbound_stock_orders o WHERE o.id=p_order_id),(SELECT o.store_id FROM public.inbound_stock_orders o WHERE o.id=p_order_id));
IF EXISTS(SELECT 1 FROM public.inbound_stock_orders o WHERE o.id=p_order_id AND (NOT EXISTS(SELECT 1 FROM public.stores s WHERE s.id=o.store_id AND s.organization_id=o.organization_id) OR o.supplier_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.suppliers s WHERE s.id=o.supplier_id AND s.organization_id=o.organization_id) OR EXISTS(SELECT 1 FROM public.inbound_stock_items i LEFT JOIN public.products p ON p.id=i.product_id WHERE i.inbound_order_id=o.id AND (i.organization_id IS DISTINCT FROM o.organization_id OR i.product_id IS NOT NULL AND p.organization_id IS DISTINCT FROM o.organization_id)))) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='INBOUND_EXISTING_SCOPE_MISMATCH'; END IF;
PERFORM 1 FROM public.inbound_stock_orders o WHERE o.id=p_order_id FOR UPDATE;
IF EXISTS(SELECT 1 FROM public.inbound_stock_orders o WHERE o.id=p_order_id AND (o.deleted_at IS NOT NULL OR o.status='CANCELLED')) THEN RAISE EXCEPTION 'INBOUND_ORDER_CLOSED'; END IF;
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'item_id', i.id,
        'qty', greatest(coalesce(i.qty_ordered,0) - coalesce(i.qty_received,0), 0)
      )
    ),
    '[]'::jsonb
  )
  into v_payload
  from public.inbound_stock_items i
  where i.inbound_order_id = p_order_id
    and greatest(coalesce(i.qty_ordered,0) - coalesce(i.qty_received,0), 0) > 0;

  if jsonb_array_length(v_payload) = 0 then
    raise exception 'No remaining stock to receive';
  end if;

  return public.receive_inbound_stock_partial_v1(p_order_id, v_payload);
end;
$function$;

REVOKE ALL ON FUNCTION public.receive_inbound_stock_v1(uuid) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.receive_inbound_stock_v1(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_my_notifications_v3(p_store_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 60)
 RETURNS TABLE(id uuid, organization_id uuid, store_id uuid, source_store_id uuid, event_type text, title text, body jsonb, items jsonb, total_units integer, total_skus integer, actor_user_id uuid, actor_name text, ref_movement_id uuid, event_id uuid, created_by uuid, created_at timestamp with time zone, is_read boolean, read_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  return query
  with my_memberships as (
    select
      m.id as membership_id,
      m.organization_id,
      m.role
    from public.org_memberships m
    where m.user_id = auth.uid()
      and m.is_active = true
  )
  select
    n.id,
    n.organization_id,
    n.store_id,
    n.source_store_id,
    n.event_type,
    n.title,
    CASE WHEN security_m2.owner_of(n.organization_id) THEN n.body ELSE security_m2.operational_json(n.body) END,
    CASE WHEN security_m2.owner_of(n.organization_id) THEN n.items ELSE security_m2.operational_json(n.items) END,
    coalesce(n.total_units, 0)::int as total_units,
    coalesce(n.total_skus, 0)::int as total_skus,
    n.actor_user_id,
    n.actor_name,
    n.ref_movement_id,

    -- V3 addition
    n.event_id,

    n.created_by,
    n.created_at,
    (nr.read_at is not null) as is_read,
    nr.read_at

  from public.notifications n

  join my_memberships mm
    on mm.organization_id = n.organization_id

  left join public.notification_reads nr
    on nr.notification_id = n.id
   and nr.user_id = auth.uid()

  where
    (
      p_store_id is null
      or n.store_id = p_store_id
    )
    and (
      mm.role in ('owner', 'admin')
      or exists (
        select 1
        from public.org_membership_stores ms
        where ms.membership_id = mm.membership_id
          and ms.store_id = n.store_id
      )
    )

  order by n.created_at desc

  limit greatest(
    1,
    least(coalesce(p_limit, 60), 200)
  );
end;
$function$;

REVOKE ALL ON FUNCTION public.get_my_notifications_v3(uuid,integer) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.get_my_notifications_v3(uuid,integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_business_profit_position_v1(p_organization_id uuid, p_store_id uuid DEFAULT NULL::uuid, p_date_from date DEFAULT NULL::date, p_date_to date DEFAULT NULL::date)
 RETURNS TABLE(principal_out_total numeric, repaid_total numeric, outstanding_total numeric, interest_profit_total numeric, accrued_interest_total numeric, active_loans integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
BEGIN
PERFORM security_m2.require_owner(p_organization_id,p_store_id);
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if not exists (
    select 1
    from public.org_memberships m
    where m.organization_id = p_organization_id
      and m.user_id = auth.uid()
      and m.role in ('owner', 'admin')
  ) then
    raise exception 'Not allowed';
  end if;

  return query
  with loan_base as (
    select
      l.id,
      coalesce(l.principal_amount, 0) as principal_amount,
      coalesce(l.repaid_amount, 0) as repaid_amount,
      coalesce(l.balance_amount, 0) as balance_amount,
      coalesce(l.accrued_interest_amount, 0) as accrued_interest_amount,
      l.status
    from public.business_loans l
    where l.organization_id = p_organization_id
      and (p_store_id is null or l.store_id = p_store_id)
      and (p_date_from is null or l.loan_date >= p_date_from)
      and (p_date_to is null or l.loan_date <= p_date_to)
  ),
  payment_interest as (
    select
      coalesce(sum(p.interest_amount), 0) as interest_profit
    from public.business_loan_payments p
    join loan_base l on l.id = p.loan_id
  )
  select
    coalesce(sum(l.principal_amount), 0)::numeric as principal_out_total,
    coalesce(sum(l.repaid_amount), 0)::numeric as repaid_total,
    coalesce(sum(l.balance_amount), 0)::numeric as outstanding_total,
    coalesce(max(pi.interest_profit), 0)::numeric as interest_profit_total,
    coalesce(sum(l.accrued_interest_amount), 0)::numeric as accrued_interest_total,
    count(*) filter (where l.status not in ('PAID', 'CANCELLED'))::integer as active_loans
  from loan_base l
  cross join payment_interest pi;
end;
$function$;

REVOKE ALL ON FUNCTION public.get_business_profit_position_v1(uuid,uuid,date,date) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.get_business_profit_position_v1(uuid,uuid,date,date) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_business_loan_payments(p_loan_id uuid)
 RETURNS TABLE(id uuid, loan_id uuid, store_id uuid, amount numeric, principal_amount numeric, interest_amount numeric, note text, payment_date date, created_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  v_org_id uuid;
BEGIN
PERFORM security_m2.require_owner((SELECT b.organization_id FROM public.business_loans b WHERE b.id=p_loan_id),NULL::uuid);
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT l.organization_id
  INTO v_org_id
  FROM public.business_loans l
  WHERE l.id = p_loan_id;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Loan not found';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.org_memberships m
    WHERE m.organization_id = v_org_id
      AND m.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  RETURN QUERY
  SELECT
    p.id,
    p.loan_id,
    p.store_id,
    p.amount,
    COALESCE(p.principal_amount, 0)::numeric AS principal_amount,
    COALESCE(p.interest_amount, 0)::numeric AS interest_amount,
    p.note,
    p.payment_date,
    p.created_at
  FROM public.business_loan_payments p
  WHERE p.loan_id = p_loan_id
  ORDER BY p.created_at DESC;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_business_loan_payments(uuid) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.get_business_loan_payments(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_stock_in_items_v2(p_org_id uuid, p_store_id uuid, p_date_from date, p_date_to date, p_include_transfer_in boolean DEFAULT true)
 RETURNS TABLE(id uuid, product_id uuid, product_name text, store_id uuid, qty numeric, unit_cost numeric, total_value numeric, created_at timestamp with time zone, source text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$BEGIN
PERFORM security_m2.require_store(p_org_id,p_store_id);
RETURN QUERY -- ==========================================================
  -- A. GENUINE STOCK IN
  -- Existing stock_movements source
  -- ==========================================================

  select
    sm.id,
    sm.product_id,
    coalesce(p.name, 'Unknown Product')::text as product_name,
    sm.store_id,

    coalesce(sm.amount, 0)::numeric as qty,

    CASE WHEN security_m2.owner_of(p_org_id) THEN coalesce(nullif(p.cost,0),p.cost_price,0) ELSE NULL::numeric END::numeric as unit_cost,

    (
      coalesce(sm.amount, 0)::numeric
      *
      CASE WHEN security_m2.owner_of(p_org_id) THEN coalesce(nullif(p.cost,0),p.cost_price,0) ELSE NULL::numeric END::numeric
    ) as total_value,

    sm.created_at,

    'stock_movements'::text as source

  from public.stock_movements sm

  left join public.products p
    on p.id = sm.product_id

  where sm.organization_id = p_org_id AND (p.id IS NULL OR p.organization_id=sm.organization_id)
    and sm.store_id = p_store_id

    and sm.created_at >= p_date_from::timestamptz
    and sm.created_at < (p_date_to + 1)::timestamptz

    and coalesce(sm.amount, 0) > 0

    and upper(coalesce(sm.mode, '')) in (
      'ADD',
      'IN',
      'STOCK_IN',
      'RECEIVE',
      'RECEIVED',
      'PURCHASE',
      'INBOUND'
    )

    -- Restoring stock after deleting/voiding a sale
    -- is NOT new incoming stock.
    and upper(coalesce(sm.note, ''))
        not like 'OWNER_SALE_DELETE_RESTORE:%'


  union all


  -- ==========================================================
  -- B. INTERNAL STORE TRANSFER IN
  --
  -- transfer_stock_batch_v1 writes:
  -- mode   = TRANSFER
  -- delta  > 0 on destination store
  -- reason = TRANSFER
  -- note   contains FROM=<source store>
  -- ==========================================================

  select
    im.id,
    im.product_id,
    coalesce(p.name, 'Unknown Product')::text as product_name,
    im.store_id,

    coalesce(im.delta, im.amount, 0)::numeric as qty,

    CASE WHEN security_m2.owner_of(p_org_id) THEN coalesce(nullif(p.cost,0),p.cost_price,0) ELSE NULL::numeric END::numeric as unit_cost,

    (
      coalesce(im.delta, im.amount, 0)::numeric
      *
      CASE WHEN security_m2.owner_of(p_org_id) THEN coalesce(nullif(p.cost,0),p.cost_price,0) ELSE NULL::numeric END::numeric
    ) as total_value,

    im.created_at,

    'TRANSFER_IN'::text as source

  from public.inventory_movements im

  left join public.products p
    on p.id = im.product_id

  where coalesce(p_include_transfer_in, false) = true

    and im.organization_id = p_org_id AND (p.id IS NULL OR p.organization_id=im.organization_id)
    and im.store_id = p_store_id

    and im.created_at >= p_date_from::timestamptz
    and im.created_at < (p_date_to + 1)::timestamptz

    and upper(coalesce(im.mode, '')) = 'TRANSFER'
    and upper(coalesce(im.reason, '')) = 'TRANSFER'

    -- Destination side only.
    and coalesce(im.delta, 0) > 0

  order by created_at desc;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_stock_in_items_v2(uuid,uuid,date,date,boolean) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.get_stock_in_items_v2(uuid,uuid,date,date,boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_store_sale_items(p_store_id uuid)
 RETURNS TABLE(product_id uuid, name text, sku text, category text, unit text, barcode text, image_url text, selling_price numeric, cost_price numeric, qty numeric, is_precision_product boolean, precision_pack_size numeric, precision_base_unit text, precision_sell_mode text, precision_allow_box_sales boolean, precision_allow_unit_sales boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
declare
  v_org_id uuid;
  v_is_manage boolean := false;
BEGIN
PERFORM security_m2.require_store((SELECT s.organization_id FROM public.stores s WHERE s.id=p_store_id),p_store_id);
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if p_store_id is null then
    raise exception 'p_store_id is required';
  end if;

  perform public.ensure_my_store_access(p_store_id);

  select s.organization_id
    into v_org_id
  from public.stores s
  where s.id = p_store_id;

  if v_org_id is null then
    raise exception 'Store not found';
  end if;

  v_is_manage := security_m2.owner_of(v_org_id);

  return query
  select
    p.id as product_id,
    p.name::text,
    p.sku::text,
    p.category::text,
    p.unit::text,
    p.barcode::text,
    p.image_url::text,
    p.selling_price::numeric,
    case when v_is_manage then p.cost_price else null end::numeric as cost_price,

    -- Sales page uses inventory.qty first.
    -- products.qty_on_hand is only fallback for old records with no inventory row.
    coalesce(i.qty, p.qty_on_hand, 0)::numeric as qty,

    coalesce(p.is_precision_product, false)::boolean,
    p.precision_pack_size::numeric,
    p.precision_base_unit::text,
    coalesce(p.precision_sell_mode, 'UNIT')::text,
    coalesce(p.precision_allow_box_sales, false)::boolean,
    coalesce(p.precision_allow_unit_sales, true)::boolean
  from public.products p
  left join public.inventory i
    on i.product_id = p.id
   and i.store_id = p_store_id
  where p.organization_id = v_org_id
    and p.is_active is true
    and (
      p.store_id = p_store_id
      or i.store_id = p_store_id
    )
    and coalesce(i.qty, p.qty_on_hand, 0) > 0
  order by p.name asc;
end;
$function$;

REVOKE ALL ON FUNCTION public.get_store_sale_items(uuid) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.get_store_sale_items(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_stock_in_items_v1(p_org_id uuid, p_store_id uuid, p_date_from date, p_date_to date)
 RETURNS TABLE(id uuid, product_id uuid, product_name text, store_id uuid, qty numeric, unit_cost numeric, total_value numeric, created_at timestamp with time zone, source text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$BEGIN
PERFORM security_m2.require_store(p_org_id,p_store_id);
RETURN QUERY select
    sm.id,
    sm.product_id,
    coalesce(p.name, 'Unknown Product')::text as product_name,
    sm.store_id,
    coalesce(sm.amount, 0)::numeric as qty,
    CASE WHEN security_m2.owner_of(p_org_id) THEN coalesce(nullif(p.cost,0),p.cost_price,0) ELSE NULL::numeric END::numeric as unit_cost,
    (
      coalesce(sm.amount, 0)::numeric
      * CASE WHEN security_m2.owner_of(p_org_id) THEN coalesce(nullif(p.cost,0),p.cost_price,0) ELSE NULL::numeric END::numeric
    ) as total_value,
    sm.created_at,
    'stock_movements'::text as source
  from public.stock_movements sm
  left join public.products p on p.id = sm.product_id
  where sm.organization_id = p_org_id AND (p.id IS NULL OR p.organization_id=sm.organization_id)
    and sm.store_id = p_store_id
    and sm.created_at >= p_date_from::timestamptz
    and sm.created_at < (p_date_to + 1)::timestamptz
    and coalesce(sm.amount, 0) > 0
    and upper(coalesce(sm.mode, '')) in (
      'ADD',
      'IN',
      'STOCK_IN',
      'RECEIVE',
      'RECEIVED',
      'PURCHASE',
      'INBOUND'
    )
  order by sm.created_at desc;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_stock_in_items_v1(uuid,uuid,date,date) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.get_stock_in_items_v1(uuid,uuid,date,date) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_stock_in_value_v2(p_org_id uuid, p_store_id uuid, p_date_from date, p_date_to date)
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
declare
  v_membership_id uuid;
  v_role text;
  v_value numeric;
BEGIN
PERFORM security_m2.require_owner(p_org_id,p_store_id);
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select membership_id, role
    into v_membership_id, v_role
  from public._resolve_my_membership_in_org(p_org_id);

  if v_membership_id is null then
    raise exception 'Not a member of this organization';
  end if;

  if v_role = 'staff' and p_store_id is null then
    raise exception 'Staff must query by store';
  end if;

  if p_store_id is not null then
    perform public._require_store_access_in_org(p_org_id, p_store_id);
  end if;

  if p_date_from is null or p_date_to is null then
    raise exception 'date_from and date_to are required';
  end if;

  if p_date_from > p_date_to then
    raise exception 'date_from cannot be after date_to';
  end if;

  select coalesce(
    sum(
      coalesce(sm.amount, 0)::numeric
      * coalesce(nullif(p.cost, 0), p.cost_price, 0)::numeric
    ),
    0
  )::numeric
  into v_value
  from public.stock_movements sm
  join public.products p on p.id = sm.product_id
  where sm.organization_id = p_org_id
    and p.organization_id = p_org_id
    and (p_store_id is null or sm.store_id = p_store_id)
    and sm.created_at::date between p_date_from and p_date_to
    and coalesce(sm.amount, 0) > 0
    and upper(coalesce(sm.mode, '')) in (
      'ADD',
      'IN',
      'STOCK_IN',
      'RECEIVE',
      'RECEIVED',
      'PURCHASE',
      'INBOUND'
    );

  return coalesce(v_value, 0)::numeric;
end;
$function$;

REVOKE ALL ON FUNCTION public.get_stock_in_value_v2(uuid,uuid,date,date) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.get_stock_in_value_v2(uuid,uuid,date,date) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_notification_movement_items_v1(p_movement_ids uuid[])
 RETURNS TABLE(movement_id uuid, product_id uuid, product_name text, sku text, barcode text, category text, unit text, selling_price numeric, qty numeric, mode text)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
  select
    sm.id as movement_id,
    sm.product_id,
    coalesce(nullif(p.name, ''), 'Unknown Product') as product_name,
    p.sku,
    p.barcode,
    p.category,
    p.unit,
    coalesce(p.selling_price, p.price, 0) as selling_price,
    abs(coalesce(sm.amount, 0)) as qty,
    sm.mode
  from public.stock_movements sm
  left join public.products p
    on p.id = sm.product_id
   and p.organization_id = sm.organization_id
  where sm.id = any(p_movement_ids) AND security_m2.store_allowed(sm.organization_id,sm.store_id);
$function$;

REVOKE ALL ON FUNCTION public.get_notification_movement_items_v1(uuid[]) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.get_notification_movement_items_v1(uuid[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.update_inbound_stock_item_v1(p_item_id uuid, p_product_name text, p_sku text DEFAULT NULL::text, p_unit text DEFAULT NULL::text, p_category text DEFAULT NULL::text, p_barcode text DEFAULT NULL::text, p_qty_ordered numeric DEFAULT NULL::numeric, p_unit_cost numeric DEFAULT NULL::numeric, p_selling_price numeric DEFAULT NULL::numeric, p_note text DEFAULT NULL::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
declare
  v_org_id uuid;
  v_order_id uuid;
  v_received numeric;
  v_total numeric;
  v_paid numeric;
BEGIN
PERFORM security_m2.require_owner((SELECT i.organization_id FROM public.inbound_stock_items i WHERE i.id=p_item_id),(SELECT o.store_id FROM public.inbound_stock_items i JOIN public.inbound_stock_orders o ON o.id=i.inbound_order_id WHERE i.id=p_item_id));
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select i.organization_id, i.inbound_order_id, coalesce(i.qty_received,0)
  into v_org_id, v_order_id, v_received
  from public.inbound_stock_items i
  where i.id = p_item_id;

  if v_org_id is null then
    raise exception 'Inbound item not found';
  end if;

  if not exists (
    select 1
    from public.org_memberships m
    where m.organization_id = v_org_id
      and m.user_id = auth.uid()
      and m.role in ('owner','admin')
      and coalesce(m.is_active,true)=true
  ) then
    raise exception 'Access denied';
  end if;

  if exists (
    select 1
    from public.inbound_stock_orders o
    where o.id = v_order_id
      and o.status = 'RECEIVED'
  ) then
    raise exception 'Cannot edit a fully received order';
  end if;

  if coalesce(p_qty_ordered,0) < v_received then
    raise exception 'Qty ordered cannot be below already received qty';
  end if;

  update public.inbound_stock_items
  set
    product_name = nullif(trim(coalesce(p_product_name,'')), ''),
    sku = nullif(trim(coalesce(p_sku,'')), ''),
    unit = nullif(trim(coalesce(p_unit,'')), ''),
    category = nullif(trim(coalesce(p_category,'')), ''),
    barcode = nullif(trim(coalesce(p_barcode,'')), ''),
    qty_ordered = coalesce(p_qty_ordered, qty_ordered),
    unit_cost = coalesce(p_unit_cost, unit_cost),
    proposed_sell_price = coalesce(p_selling_price, proposed_sell_price),
    total_cost = coalesce(p_qty_ordered, qty_ordered) * coalesce(p_unit_cost, unit_cost),
    note = nullif(trim(coalesce(p_note,'')), ''),
    updated_at = now()
  where id = p_item_id;

  select coalesce(sum(total_cost),0) into v_total
  from public.inbound_stock_items
  where inbound_order_id = v_order_id;

  select coalesce(sum(amount),0) into v_paid
  from public.inbound_stock_payments
  where inbound_order_id = v_order_id;

  update public.inbound_stock_orders
  set
    total_goods_value = v_total,
    total_balance_amount = greatest(v_total - v_paid, 0),
    updated_at = now()
  where id = v_order_id;

  return true;
end;
$function$;

REVOKE ALL ON FUNCTION public.update_inbound_stock_item_v1(uuid,text,text,text,text,text,numeric,numeric,numeric,text) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.update_inbound_stock_item_v1(uuid,text,text,text,text,text,numeric,numeric,numeric,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_items_overview_v1(p_org_id uuid, p_store_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(product_id uuid, store_id uuid, store_name text, product_name text, sku text, unit text, category text, barcode text, image_url text, selling_price numeric, cost_price numeric, qty numeric, is_precision_product boolean, precision_pack_size numeric, precision_base_unit text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
declare
    v_role text;
BEGIN
PERFORM security_m2.require_store(p_org_id,p_store_id);

    if auth.uid() is null then
        raise exception 'Not authenticated';
    end if;

    select lower(role)
      into v_role
    from public.org_memberships
    where organization_id = p_org_id
      and user_id = auth.uid()
      and coalesce(is_active,true)=true
    limit 1;

    if v_role is null then
        raise exception 'Access denied';
    end if;

    return query

    select

        p.id,
        i.store_id,
        s.name,

        p.name,
        p.sku,
        p.unit,
        p.category,
        p.barcode,
        p.image_url,

        p.selling_price,

        case
            when v_role='owner'
            then p.cost_price
            else null
        end,

        coalesce(i.qty,0),

        coalesce(p.is_precision_product,false),
        p.precision_pack_size,
        p.precision_base_unit

    from public.inventory i

    join public.products p
      on p.id=i.product_id

    left join public.stores s
      on s.id=i.store_id

    where

        p.organization_id=p_org_id

        and i.organization_id=p_org_id

        and coalesce(p.is_active,true)=true

        and coalesce(i.qty,0)>0

        and (
            p_store_id is null
            or i.store_id=p_store_id
        )

        and (

            v_role in ('owner','admin')

            or exists(

                select 1
                from public.org_memberships m
                join public.org_membership_stores ms
                  on ms.membership_id=m.id

                where m.organization_id=p_org_id
                  and m.user_id=auth.uid()
                  and coalesce(m.is_active,true)=true
                  and ms.store_id=i.store_id

            )

        )

    order by
        s.name,
        p.name;

end;
$function$;

REVOKE ALL ON FUNCTION public.get_items_overview_v1(uuid,uuid) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.get_items_overview_v1(uuid,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_business_statement_goods_summary_v1(p_store_id uuid, p_from timestamp with time zone, p_to timestamp with time zone)
 RETURNS TABLE(total_goods_purchased numeric, purchase_orders bigint, total_items_purchased numeric, supplier_outstanding numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$BEGIN
PERFORM security_m2.require_owner((SELECT s.organization_id FROM public.stores s WHERE s.id=p_store_id),p_store_id);
RETURN QUERY with stock_in as (
    select
      sm.id,
      case
        when upper(coalesce(sm.mode, '')) = 'ADD'
          then abs(coalesce(sm.amount, 0))::numeric
        when upper(coalesce(sm.mode, '')) = 'REDUCE'
          then -abs(coalesce(sm.amount, 0))::numeric
        else coalesce(sm.amount, 0)::numeric
      end as qty,
      coalesce(
        nullif(to_jsonb(sm)->>'unit_cost', '')::numeric,
        nullif(to_jsonb(p)->>'cost_price', '')::numeric,
        nullif(to_jsonb(p)->>'cost', '')::numeric,
        nullif(to_jsonb(p)->>'buying_price', '')::numeric,
        nullif(to_jsonb(p)->>'purchase_price', '')::numeric,
        0
      ) as unit_cost,
      coalesce(
        nullif(to_jsonb(sm)->>'total_cost', '')::numeric,
        abs(coalesce(sm.amount, 0))::numeric * coalesce(
          nullif(to_jsonb(sm)->>'unit_cost', '')::numeric,
          nullif(to_jsonb(p)->>'cost_price', '')::numeric,
          nullif(to_jsonb(p)->>'cost', '')::numeric,
          nullif(to_jsonb(p)->>'buying_price', '')::numeric,
          nullif(to_jsonb(p)->>'purchase_price', '')::numeric,
          0
        )
      ) as total_cost
    from public.stock_movements sm
    left join public.products p
      on p.id = sm.product_id
     and p.organization_id = sm.organization_id
    where sm.store_id = p_store_id
      and sm.created_at >= p_from
      and sm.created_at <= p_to
      and upper(coalesce(sm.mode, '')) = 'ADD'
  ),
  debts as (
    select
      coalesce(
        sum(
          greatest(
            coalesce(d.principal_amount, 0) - coalesce(d.paid_amount, 0),
            0
          )
        ),
        0
      )::numeric as balance
    from public.business_debts d
    where d.store_id = p_store_id
      and upper(coalesce(d.status, '')) not in ('PAID', 'CLOSED', 'DELETED')
  )
  select
    coalesce(sum(stock_in.total_cost), 0)::numeric as total_goods_purchased,
    count(stock_in.id)::bigint as purchase_orders,
    coalesce(sum(stock_in.qty), 0)::numeric as total_items_purchased,
    coalesce((select balance from debts), 0)::numeric as supplier_outstanding
  from stock_in
  where stock_in.qty > 0;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_business_statement_goods_summary_v1(uuid,timestamp with time zone,timestamp with time zone) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.get_business_statement_goods_summary_v1(uuid,timestamp with time zone,timestamp with time zone) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_staff_performance_detail_v1(p_org_id uuid, p_membership_id uuid, p_from_date date, p_to_date date)
 RETURNS TABLE(sale_id uuid, sale_date timestamp with time zone, sale_amount numeric, gross_profit numeric, commission_percent numeric, commission_amount numeric, net_profit_after_commission numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  v_role text;
  v_target_role text;
BEGIN
PERFORM security_m2.require_owner(p_org_id,NULL::uuid);

  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;


  IF p_org_id IS NULL THEN
    RAISE EXCEPTION 'p_org_id is required';
  END IF;


  IF p_membership_id IS NULL THEN
    RAISE EXCEPTION 'p_membership_id is required';
  END IF;


  IF p_from_date IS NULL
     OR p_to_date IS NULL THEN

    RAISE EXCEPTION
      'Date range is required';

  END IF;


  IF p_from_date > p_to_date THEN
    RAISE EXCEPTION
      'Invalid date range';
  END IF;


  SELECT
    lower(
      coalesce(
        om.role,
        ''
      )
    )

  INTO
    v_role

  FROM public.org_memberships om

  WHERE om.organization_id =
        p_org_id

    AND om.user_id =
        auth.uid()

    AND coalesce(
      om.is_active,
      true
    ) = true

  LIMIT 1;


  IF v_role NOT IN (
    'owner',
    'admin'
  ) THEN

    RAISE EXCEPTION
      'Owner/Admin only';

  END IF;


  SELECT
    lower(
      coalesce(
        om.role,
        ''
      )
    )

  INTO
    v_target_role

  FROM public.org_memberships om

  WHERE om.organization_id =
        p_org_id

    AND om.id =
        p_membership_id

    AND coalesce(
      om.is_active,
      true
    ) = true

  LIMIT 1;


  IF v_target_role <> 'staff' THEN
    RAISE EXCEPTION
      'Target membership must be STAFF';
  END IF;


  RETURN QUERY

  WITH sales_base AS (
    SELECT
      s.id::uuid AS sale_id,

      s.sold_at::timestamptz AS sale_date,

      COALESCE(
        s.grand_total,
        s.total_amount,
        0
      )::numeric AS sale_amount,

      COALESCE(
        SUM(
          (
            COALESCE(
              si.unit_price,
              0
            )
            -
            COALESCE(
              si.unit_cost_price,
              si.unit_cost,
              0
            )
          )
          *
          COALESCE(
            si.qty,
            0
          )
        ),
        0
      )::numeric AS gross_profit

    FROM public.sales s

    LEFT JOIN public.sale_items si
      ON si.sale_id =
         s.id

    WHERE s.organization_id =
          p_org_id

      AND s.sold_by_membership_id =
          p_membership_id

      AND (
        s.sold_at
        AT TIME ZONE
        'Africa/Dar_es_Salaam'
      )::date
      BETWEEN
        p_from_date
        AND p_to_date

      AND upper(
        coalesce(
          s.status,
          'COMPLETED'
        )
      ) NOT IN (
        'CANCELLED',
        'CANCELED',
        'VOID'
      )

    GROUP BY
      s.id,
      s.sold_at,
      s.grand_total,
      s.total_amount
  ),

  rated AS (
    SELECT
      sb.*,

      public.get_staff_commission_rate_at_v1(
        p_org_id,
        p_membership_id,
        sb.sale_date
      )::numeric AS rate

    FROM sales_base sb
  )

  SELECT
    r.sale_id,
    r.sale_date,
    r.sale_amount,
    r.gross_profit,

    COALESCE(
      r.rate,
      0
    )::numeric,

    ROUND(
      r.sale_amount
      *
      (
        COALESCE(
          r.rate,
          0
        ) / 100.0
      ),
      2
    )::numeric,

    ROUND(
      r.gross_profit
      -
      (
        r.sale_amount
        *
        (
          COALESCE(
            r.rate,
            0
          ) / 100.0
        )
      ),
      2
    )::numeric

  FROM rated r

  ORDER BY
    r.sale_date DESC;

END;
$function$;

REVOKE ALL ON FUNCTION public.get_staff_performance_detail_v1(uuid,uuid,date,date) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.get_staff_performance_detail_v1(uuid,uuid,date,date) TO authenticated;

ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.inventory_movements FROM anon;

REVOKE INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public.inventory_movements FROM authenticated;

DROP POLICY IF EXISTS m2_owner_raw_read ON public.inventory_movements;

CREATE POLICY m2_owner_raw_read ON public.inventory_movements AS RESTRICTIVE FOR SELECT TO authenticated USING (security_m2.owner_of(organization_id));

DROP POLICY IF EXISTS m2_movement_owner_select ON public.inventory_movements;

CREATE POLICY m2_movement_owner_select ON public.inventory_movements FOR SELECT TO authenticated USING (security_m2.owner_of(organization_id));

ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.stock_movements FROM anon;

REVOKE INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public.stock_movements FROM authenticated;

DROP POLICY IF EXISTS m2_owner_raw_read ON public.stock_movements;

CREATE POLICY m2_owner_raw_read ON public.stock_movements AS RESTRICTIVE FOR SELECT TO authenticated USING (security_m2.owner_of(organization_id));

ALTER TABLE public._backup_inventory_before_fix_stock_root ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public._backup_inventory_before_fix_stock_root FROM anon;

REVOKE INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public._backup_inventory_before_fix_stock_root FROM authenticated;

REVOKE ALL ON public._backup_inventory_before_fix_stock_root FROM authenticated;

ALTER TABLE public.inbound_stock_orders ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.inbound_stock_orders FROM anon;

REVOKE INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public.inbound_stock_orders FROM authenticated;

DROP POLICY IF EXISTS m2_owner_raw_read ON public.inbound_stock_orders;

CREATE POLICY m2_owner_raw_read ON public.inbound_stock_orders AS RESTRICTIVE FOR SELECT TO authenticated USING (security_m2.owner_of(organization_id));

ALTER TABLE public.inbound_stock_items ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.inbound_stock_items FROM anon;

REVOKE INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public.inbound_stock_items FROM authenticated;

DROP POLICY IF EXISTS m2_owner_raw_read ON public.inbound_stock_items;

CREATE POLICY m2_owner_raw_read ON public.inbound_stock_items AS RESTRICTIVE FOR SELECT TO authenticated USING (security_m2.owner_of(organization_id));

ALTER TABLE public.inbound_stock_payments ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.inbound_stock_payments FROM anon;

REVOKE INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public.inbound_stock_payments FROM authenticated;

DROP POLICY IF EXISTS m2_owner_raw_read ON public.inbound_stock_payments;

CREATE POLICY m2_owner_raw_read ON public.inbound_stock_payments AS RESTRICTIVE FOR SELECT TO authenticated USING (security_m2.owner_of(organization_id));

ALTER TABLE public.inbound_stock_audit ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.inbound_stock_audit FROM anon;

REVOKE INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public.inbound_stock_audit FROM authenticated;

DROP POLICY IF EXISTS m2_owner_raw_read ON public.inbound_stock_audit;

CREATE POLICY m2_owner_raw_read ON public.inbound_stock_audit AS RESTRICTIVE FOR SELECT TO authenticated USING (security_m2.owner_of(organization_id));

ALTER TABLE public.business_debts ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.business_debts FROM anon;

REVOKE INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public.business_debts FROM authenticated;

DROP POLICY IF EXISTS m2_owner_raw_read ON public.business_debts;

CREATE POLICY m2_owner_raw_read ON public.business_debts AS RESTRICTIVE FOR SELECT TO authenticated USING (security_m2.owner_of(organization_id));

ALTER TABLE public.business_debt_payments ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.business_debt_payments FROM anon;

REVOKE INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public.business_debt_payments FROM authenticated;

DROP POLICY IF EXISTS m2_owner_raw_read ON public.business_debt_payments;

CREATE POLICY m2_owner_raw_read ON public.business_debt_payments AS RESTRICTIVE FOR SELECT TO authenticated USING (security_m2.owner_of(organization_id));

ALTER TABLE public.business_loans ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.business_loans FROM anon;

REVOKE INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public.business_loans FROM authenticated;

DROP POLICY IF EXISTS m2_owner_raw_read ON public.business_loans;

CREATE POLICY m2_owner_raw_read ON public.business_loans AS RESTRICTIVE FOR SELECT TO authenticated USING (security_m2.owner_of(organization_id));

ALTER TABLE public.business_loan_payments ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.business_loan_payments FROM anon;

REVOKE INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public.business_loan_payments FROM authenticated;

DROP POLICY IF EXISTS m2_owner_raw_read ON public.business_loan_payments;

CREATE POLICY m2_owner_raw_read ON public.business_loan_payments AS RESTRICTIVE FOR SELECT TO authenticated USING (security_m2.owner_of(organization_id));

ALTER TABLE public.capital_recovery_entries ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.capital_recovery_entries FROM anon;

REVOKE INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public.capital_recovery_entries FROM authenticated;

DROP POLICY IF EXISTS m2_owner_raw_read ON public.capital_recovery_entries;

CREATE POLICY m2_owner_raw_read ON public.capital_recovery_entries AS RESTRICTIVE FOR SELECT TO authenticated USING (security_m2.owner_of(organization_id));

ALTER TABLE public.capital_recovery_entry_items ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.capital_recovery_entry_items FROM anon;

REVOKE INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public.capital_recovery_entry_items FROM authenticated;

DROP POLICY IF EXISTS m2_owner_raw_read ON public.capital_recovery_entry_items;

CREATE POLICY m2_owner_raw_read ON public.capital_recovery_entry_items AS RESTRICTIVE FOR SELECT TO authenticated USING (security_m2.owner_of(organization_id));

ALTER TABLE public.field_wallets ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.field_wallets FROM anon;

REVOKE INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public.field_wallets FROM authenticated;

DROP POLICY IF EXISTS m2_owner_raw_read ON public.field_wallets;

CREATE POLICY m2_owner_raw_read ON public.field_wallets AS RESTRICTIVE FOR SELECT TO authenticated USING (security_m2.owner_of(organization_id));

ALTER TABLE public.field_wallet_transactions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.field_wallet_transactions FROM anon;

REVOKE INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public.field_wallet_transactions FROM authenticated;

DROP POLICY IF EXISTS m2_owner_raw_read ON public.field_wallet_transactions;

CREATE POLICY m2_owner_raw_read ON public.field_wallet_transactions AS RESTRICTIVE FOR SELECT TO authenticated USING (security_m2.owner_of(organization_id));

ALTER TABLE public.field_cycles ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.field_cycles FROM anon;

REVOKE INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public.field_cycles FROM authenticated;

DROP POLICY IF EXISTS m2_owner_raw_read ON public.field_cycles;

CREATE POLICY m2_owner_raw_read ON public.field_cycles AS RESTRICTIVE FOR SELECT TO authenticated USING (security_m2.owner_of(organization_id));

ALTER TABLE public.ai_daily_store_snapshots_v1 ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.ai_daily_store_snapshots_v1 FROM anon;

REVOKE INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public.ai_daily_store_snapshots_v1 FROM authenticated;

DROP POLICY IF EXISTS m2_owner_raw_read ON public.ai_daily_store_snapshots_v1;

CREATE POLICY m2_owner_raw_read ON public.ai_daily_store_snapshots_v1 AS RESTRICTIVE FOR SELECT TO authenticated USING (security_m2.owner_of(organization_id));

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.notifications FROM anon;

REVOKE INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public.notifications FROM authenticated;

DROP POLICY IF EXISTS m2_owner_raw_read ON public.notifications;

CREATE POLICY m2_owner_raw_read ON public.notifications AS RESTRICTIVE FOR SELECT TO authenticated USING (security_m2.owner_of(organization_id));

ALTER TABLE public.sale_delete_audit_v1 ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.sale_delete_audit_v1 FROM anon;

REVOKE INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public.sale_delete_audit_v1 FROM authenticated;

DROP POLICY IF EXISTS m2_owner_raw_read ON public.sale_delete_audit_v1;

CREATE POLICY m2_owner_raw_read ON public.sale_delete_audit_v1 AS RESTRICTIVE FOR SELECT TO authenticated USING (security_m2.owner_of(organization_id));

CREATE OR REPLACE FUNCTION public.get_office_system_performance_v2(p_from date, p_to date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_email text;

  v_from timestamptz;
  v_to timestamptz;

  v_total_organizations bigint := 0;
  v_active_organizations bigint := 0;
  v_new_organizations bigint := 0;

  v_total_members bigint := 0;
  v_active_members bigint := 0;

  v_total_stores bigint := 0;
  v_active_stores bigint := 0;
  v_stores_with_activity bigint := 0;

  v_subscription_payments_count bigint := 0;
  v_subscription_revenue numeric := 0;

begin
  ------------------------------------------------------------
  -- OFFICE ACCESS
  ------------------------------------------------------------
  v_email := lower(
    coalesce(
      auth.jwt() ->> 'email',
      ''
    )
  );

  if v_email <> 'zetraofficialtz@gmail.com' then
    raise exception 'ZETRA Office access required';
  end if;


  ------------------------------------------------------------
  -- VALIDATE DATE RANGE
  ------------------------------------------------------------
  if p_from is null or p_to is null then
    raise exception 'From date and To date are required';
  end if;

  if p_from > p_to then
    raise exception 'From date cannot be after To date';
  end if;


  ------------------------------------------------------------
  -- RANGE
  --
  -- Tanzania timezone.
  -- v_to is exclusive so the entire p_to day is included.
  ------------------------------------------------------------
  v_from :=
    p_from::timestamp
    at time zone 'Africa/Dar_es_Salaam';

  v_to :=
    (p_to + 1)::timestamp
    at time zone 'Africa/Dar_es_Salaam';


  ------------------------------------------------------------
  -- ORGANIZATIONS / ZETRA CUSTOMERS
  ------------------------------------------------------------
  select count(*)
  into v_total_organizations
  from public.organizations;

  select count(*)
  into v_active_organizations
  from public.organizations
  where is_active = true;

  select count(*)
  into v_new_organizations
  from public.organizations
  where created_at >= v_from
    and created_at < v_to;


  ------------------------------------------------------------
  -- MEMBERS
  ------------------------------------------------------------
  select count(*)
  into v_total_members
  from public.org_memberships;

  select count(*)
  into v_active_members
  from public.org_memberships
  where is_active = true;


  ------------------------------------------------------------
  -- STORES
  ------------------------------------------------------------
  select count(*)
  into v_total_stores
  from public.stores;

  select count(*)
  into v_active_stores
  from public.stores
  where is_active = true;


  ------------------------------------------------------------
  -- STORE USAGE SIGNAL ONLY
  --
  -- We DO NOT read:
  -- total_amount
  -- paid_amount
  -- balance_amount
  -- profit
  -- customer financial values
  --
  -- Sales is used ONLY as an activity signal.
  ------------------------------------------------------------
  select count(distinct store_id)
  into v_stores_with_activity
  from public.sales
  where sold_at >= v_from
    and sold_at < v_to
    and store_id is not null;


  ------------------------------------------------------------
  -- ZETRA SUBSCRIPTION PERFORMANCE
  ------------------------------------------------------------
  select
    count(*),
    coalesce(sum(submitted_amount), 0)
  into
    v_subscription_payments_count,
    v_subscription_revenue
  from public.subscription_payment_requests
  where status::text = 'APPROVED'
    and approved_at >= v_from
    and approved_at < v_to;


  ------------------------------------------------------------
  -- RESULT
  ------------------------------------------------------------
  return jsonb_build_object(

    'period_from', p_from,
    'period_to', p_to,
    'generated_at', now(),

    'customers', jsonb_build_object(
      'total', v_total_organizations,
      'active', v_active_organizations,
      'inactive',
        greatest(
          v_total_organizations - v_active_organizations,
          0
        ),
      'new_in_period', v_new_organizations
    ),

    'members', jsonb_build_object(
      'total', v_total_members,
      'active', v_active_members,
      'inactive',
        greatest(
          v_total_members - v_active_members,
          0
        )
    ),

    'stores', jsonb_build_object(
      'total', v_total_stores,
      'active', v_active_stores,
      'inactive',
        greatest(
          v_total_stores - v_active_stores,
          0
        ),
      'with_activity_in_period', v_stores_with_activity,
      'without_activity_in_period',
        greatest(
          v_total_stores - v_stores_with_activity,
          0
        )
    ),

    'subscriptions', jsonb_build_object(
      'payments_count', v_subscription_payments_count,
      'revenue', v_subscription_revenue
    )

  );
end;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_office_system_performance_v2(date,date) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.run_ai_daily_snapshots_v1()
 RETURNS TABLE(organization_id uuid, store_id uuid, snapshot_date date, timezone text, sales_total numeric, cogs_total numeric, expenses_total numeric, gross_profit numeric, net_profit numeric, orders_count integer, stock_qty numeric, available_stock_qty numeric, cogs_coverage_percent numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$

BEGIN

    RETURN QUERY

    WITH store_clock AS (

        SELECT
            s.organization_id AS org_id,
            s.id AS sid,

            COALESCE(
                NULLIF(s.timezone, ''),
                NULLIF(o.timezone, ''),
                'UTC'
            )::text AS effective_timezone

        FROM public.stores s

        JOIN public.organizations o
            ON o.id = s.organization_id

        WHERE COALESCE(
            NULLIF(s.timezone, ''),
            NULLIF(o.timezone, ''),
            'UTC'
        ) IN (
            SELECT name
            FROM pg_timezone_names
        )

    ),

    closed_business_day AS (

        SELECT
            sc.org_id,
            sc.sid,
            sc.effective_timezone,

            (
                CURRENT_TIMESTAMP
                AT TIME ZONE sc.effective_timezone
            )::date - 1 AS local_closed_date

        FROM store_clock sc

    )

    SELECT
        snap.organization_id,
        snap.store_id,
        snap.snapshot_date,
        snap.timezone,
        snap.sales_total,
        snap.cogs_total,
        snap.expenses_total,
        snap.gross_profit,
        snap.net_profit,
        snap.orders_count,
        snap.stock_qty,
        snap.available_stock_qty,
        snap.cogs_coverage_percent

    FROM closed_business_day cbd

    CROSS JOIN LATERAL
        public.build_ai_daily_store_snapshot_v1(
            cbd.sid,
            cbd.local_closed_date
        ) AS snap;

END;

$function$;

REVOKE EXECUTE ON FUNCTION public.run_ai_daily_snapshots_v1() FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.run_due_ai_daily_snapshots_v1()
 RETURNS TABLE(stores_checked integer, snapshots_run integer, snapshots_skipped integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$

DECLARE
    r record;

    v_checked integer := 0;
    v_run integer := 0;
    v_skipped integer := 0;

    v_local_now timestamp;
    v_today date;
    v_yesterday date;

    v_yesterday_period_end timestamptz;
    v_yesterday_updated_at timestamptz;

BEGIN

    /*
      ==========================================================
      ZETRA AI CANONICAL SNAPSHOT SCHEDULER V2
      ==========================================================

      Cron calls this function every 15 minutes.

      PURPOSE:

      1. Refresh TODAY snapshot every run.
         This gives ZETRA AI current verified business metrics.

      2. Finalize YESTERDAY after local midnight.
         This captures transactions from the final minutes
         of the previous business day.

      3. build_ai_daily_store_snapshot_v1() is idempotent.
         It uses UPSERT on:

           organization_id
           store_id
           snapshot_date

         Therefore repeated execution does NOT create duplicates.
      ==========================================================
    */


    FOR r IN

        SELECT
            s.id AS store_id,
            s.organization_id,

            COALESCE(
                NULLIF(s.timezone, ''),
                NULLIF(o.timezone, ''),
                'UTC'
            ) AS effective_timezone

        FROM public.stores AS s

        JOIN public.organizations AS o
          ON o.id = s.organization_id

    LOOP

        v_checked := v_checked + 1;


        -- =====================================================
        -- 1. VALIDATE TIMEZONE
        -- =====================================================

        IF NOT EXISTS (
            SELECT 1
            FROM pg_timezone_names AS t
            WHERE t.name = r.effective_timezone
        ) THEN

            v_skipped := v_skipped + 1;

            CONTINUE;

        END IF;


        -- =====================================================
        -- 2. RESOLVE LOCAL BUSINESS DATE
        -- =====================================================

        v_local_now :=
            CURRENT_TIMESTAMP
            AT TIME ZONE r.effective_timezone;

        v_today :=
            v_local_now::date;

        v_yesterday :=
            v_today - 1;


        -- =====================================================
        -- 3. FINALIZE YESTERDAY
        -- =====================================================
        --
        -- We only need to finalize yesterday once.
        --
        -- If updated_at is already at or after period_end_utc,
        -- that snapshot has already been finalized after the
        -- business day ended.
        -- =====================================================

        v_yesterday_period_end := NULL;
        v_yesterday_updated_at := NULL;

        SELECT
            snap.period_end_utc,
            snap.updated_at

        INTO
            v_yesterday_period_end,
            v_yesterday_updated_at

        FROM public.ai_daily_store_snapshots_v1 AS snap

        WHERE snap.organization_id =
              r.organization_id

          AND snap.store_id =
              r.store_id

          AND snap.snapshot_date =
              v_yesterday

        LIMIT 1;


        IF
            v_yesterday_updated_at IS NULL
            OR
            v_yesterday_period_end IS NULL
            OR
            v_yesterday_updated_at <
            v_yesterday_period_end
        THEN

            BEGIN

                PERFORM
                    public.build_ai_daily_store_snapshot_v1(
                        r.store_id,
                        v_yesterday
                    );

                v_run := v_run + 1;

            EXCEPTION
                WHEN OTHERS THEN

                    v_skipped :=
                        v_skipped + 1;

            END;

        END IF;


        -- =====================================================
        -- 4. REFRESH TODAY
        -- =====================================================
        --
        -- This intentionally runs every cron cycle.
        --
        -- Sales, COGS and expenses are recalculated for today's
        -- local business-date range.
        --
        -- Inventory is the current position at snapshot time.
        --
        -- UPSERT guarantees only one row per store/date.
        -- =====================================================

        BEGIN

            PERFORM
                public.build_ai_daily_store_snapshot_v1(
                    r.store_id,
                    v_today
                );

            v_run := v_run + 1;

        EXCEPTION
            WHEN OTHERS THEN

                v_skipped :=
                    v_skipped + 1;

        END;

    END LOOP;


    -- =========================================================
    -- 5. RETURN SCHEDULER SUMMARY
    -- =========================================================

    stores_checked :=
        v_checked;

    snapshots_run :=
        v_run;

    snapshots_skipped :=
        v_skipped;

    RETURN NEXT;

END;

$function$;

REVOKE EXECUTE ON FUNCTION public.run_due_ai_daily_snapshots_v1() FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.build_ai_daily_store_snapshot_v1(p_store_id uuid, p_snapshot_date date DEFAULT NULL::date)
 RETURNS TABLE(organization_id uuid, store_id uuid, snapshot_date date, timezone text, sales_total numeric, cogs_total numeric, expenses_total numeric, gross_profit numeric, net_profit numeric, orders_count integer, stock_qty numeric, available_stock_qty numeric, cogs_coverage_percent numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$

DECLARE
    v_org_id uuid;
    v_timezone text;

    v_snapshot_date date;
    v_today date;

    v_start timestamptz;
    v_end timestamptz;

    v_sales numeric := 0;
    v_orders integer := 0;

    v_cogs numeric := 0;
    v_cogs_items integer := 0;
    v_cogs_missing integer := 0;
    v_cogs_coverage numeric := 0;

    v_expenses numeric := 0;
    v_expense_count integer := 0;

    v_stock_qty numeric := 0;
    v_reserved_qty numeric := 0;
    v_available_qty numeric := 0;

    v_products_in_stock integer := 0;
    v_out_of_stock integer := 0;
    v_low_stock integer := 0;

    v_inventory_data_status text;
    v_financial_data_status text;

BEGIN

    /*
    ============================================================
    ZETRA AI CANONICAL DAILY STORE SNAPSHOT V2
    ============================================================

    FINANCIAL TRUTH POLICY

    VERIFIED
      = all sale items have historical unit_cost.

    PARTIAL_COGS
      = one or more sale items are missing historical unit_cost.

    We NEVER fabricate missing COGS.

    ------------------------------------------------------------

    INVENTORY TRUTH POLICY

    TODAY
      = LIVE_VERIFIED
      = public.inventory is current authoritative stock.

    HISTORICAL DATE
      = HISTORICAL_UNAVAILABLE
      = current inventory is NOT copied backwards.

    ------------------------------------------------------------

    ENGINE
      = CANONICAL_V2
    ============================================================
    */


    -- ========================================================
    -- 1. STORE + ORGANIZATION + EFFECTIVE TIMEZONE
    -- ========================================================

    SELECT
        s.organization_id,
        COALESCE(
            NULLIF(s.timezone, ''),
            NULLIF(o.timezone, ''),
            'UTC'
        )
    INTO
        v_org_id,
        v_timezone
    FROM public.stores AS s
    JOIN public.organizations AS o
      ON o.id = s.organization_id
    WHERE s.id = p_store_id
    LIMIT 1;


    IF v_org_id IS NULL THEN
        RAISE EXCEPTION
            'Store not found: %',
            p_store_id;
    END IF;


    -- ========================================================
    -- 2. VALIDATE TIMEZONE
    -- ========================================================

    IF NOT EXISTS (
        SELECT 1
        FROM pg_timezone_names AS ptn
        WHERE ptn.name = v_timezone
    ) THEN

        RAISE EXCEPTION
            'Invalid timezone "%" for store %',
            v_timezone,
            p_store_id;

    END IF;


    -- ========================================================
    -- 3. RESOLVE LOCAL BUSINESS DATE
    -- ========================================================

    v_today :=
        (
            CURRENT_TIMESTAMP
            AT TIME ZONE v_timezone
        )::date;


    v_snapshot_date :=
        COALESCE(
            p_snapshot_date,
            v_today
        );


    IF v_snapshot_date > v_today THEN

        RAISE EXCEPTION
            'Future snapshot date not allowed. Requested %, local today %',
            v_snapshot_date,
            v_today;

    END IF;


    -- ========================================================
    -- 4. LOCAL BUSINESS DATE -> UTC RANGE
    -- ========================================================

    v_start :=
        v_snapshot_date::timestamp
        AT TIME ZONE v_timezone;


    v_end :=
        (v_snapshot_date + 1)::timestamp
        AT TIME ZONE v_timezone;


    -- ========================================================
    -- 5. SALES
    -- ========================================================

    SELECT
        COALESCE(
            SUM(
                COALESCE(
                    s.grand_total,
                    s.total_amount,
                    0
                )
            ),
            0
        )::numeric,

        COUNT(*)::integer

    INTO
        v_sales,
        v_orders

    FROM public.sales AS s

    WHERE s.organization_id = v_org_id
      AND s.store_id = p_store_id
      AND s.sold_at >= v_start
      AND s.sold_at < v_end

      AND COALESCE(
            s.status,
            'COMPLETED'
          ) = 'COMPLETED';


    -- ========================================================
    -- 6. HISTORICAL COGS
    --
    -- Source of truth:
    -- sale_items.unit_cost
    --
    -- Missing costs are NOT fabricated.
    -- ========================================================

    SELECT
        COALESCE(
            SUM(
                CASE

                    WHEN si.unit_cost IS NOT NULL
                    THEN
                        COALESCE(si.qty, 0)
                        * si.unit_cost

                    ELSE
                        0

                END
            ),
            0
        )::numeric,

        COUNT(*)::integer,

        COUNT(*) FILTER (
            WHERE si.unit_cost IS NULL
        )::integer

    INTO
        v_cogs,
        v_cogs_items,
        v_cogs_missing

    FROM public.sale_items AS si

    JOIN public.sales AS s
      ON s.id = si.sale_id

    WHERE s.organization_id = v_org_id
      AND s.store_id = p_store_id
      AND s.sold_at >= v_start
      AND s.sold_at < v_end

      AND COALESCE(
            s.status,
            'COMPLETED'
          ) = 'COMPLETED';


    -- ========================================================
    -- 7. COGS COVERAGE
    -- ========================================================

    v_cogs_coverage :=

        CASE

            WHEN v_cogs_items = 0 THEN
                100::numeric

            ELSE

                ROUND(
                    (
                        (
                            v_cogs_items
                            - v_cogs_missing
                        )::numeric
                        /
                        v_cogs_items::numeric
                    )
                    * 100,
                    2
                )

        END;


    -- ========================================================
    -- 8. FINANCIAL DATA STATUS
    -- ========================================================

    IF v_cogs_missing > 0 THEN

        v_financial_data_status :=
            'PARTIAL_COGS';

    ELSE

        v_financial_data_status :=
            'VERIFIED';

    END IF;


    -- ========================================================
    -- 9. EXPENSES
    -- ========================================================

    SELECT
        COALESCE(
            SUM(
                COALESCE(e.amount, 0)
            ),
            0
        )::numeric,

        COUNT(*)::integer

    INTO
        v_expenses,
        v_expense_count

    FROM public.expenses AS e

    WHERE e.organization_id = v_org_id
      AND e.store_id = p_store_id
      AND e.expense_date = v_snapshot_date;


    -- ========================================================
    -- 10. INVENTORY TRUTH POLICY
    -- ========================================================

    IF v_snapshot_date = v_today THEN

        /*
        ========================================================
        TODAY
        ========================================================

        Current public.inventory is authoritative.

        Negative raw quantities are not exposed as available
        stock.

        ========================================================
        */

        SELECT

            COALESCE(
                SUM(
                    GREATEST(
                        COALESCE(i.qty, 0),
                        0
                    )
                ),
                0
            )::numeric,

            COALESCE(
                SUM(
                    GREATEST(
                        COALESCE(i.reserved_qty, 0),
                        0
                    )
                ),
                0
            )::numeric,

            COALESCE(
                SUM(
                    GREATEST(
                        COALESCE(i.qty, 0)
                        - COALESCE(i.reserved_qty, 0),
                        0
                    )
                ),
                0
            )::numeric,

            COUNT(*) FILTER (
                WHERE
                    GREATEST(
                        COALESCE(i.qty, 0)
                        - COALESCE(i.reserved_qty, 0),
                        0
                    ) > 0
            )::integer,

            COUNT(*) FILTER (
                WHERE
                    GREATEST(
                        COALESCE(i.qty, 0)
                        - COALESCE(i.reserved_qty, 0),
                        0
                    ) <= 0
            )::integer,

            COUNT(*) FILTER (
                WHERE

                    GREATEST(
                        COALESCE(i.qty, 0)
                        - COALESCE(i.reserved_qty, 0),
                        0
                    ) > 0

                    AND COALESCE(
                        i.low_stock_threshold,
                        0
                    ) > 0

                    AND GREATEST(
                        COALESCE(i.qty, 0)
                        - COALESCE(i.reserved_qty, 0),
                        0
                    )
                    <= COALESCE(
                        i.low_stock_threshold,
                        0
                    )
            )::integer

        INTO
            v_stock_qty,
            v_reserved_qty,
            v_available_qty,
            v_products_in_stock,
            v_out_of_stock,
            v_low_stock

        FROM public.inventory AS i

        WHERE i.organization_id = v_org_id
          AND i.store_id = p_store_id;


        v_inventory_data_status :=
            'LIVE_VERIFIED';


    ELSE

        /*
        ========================================================
        HISTORICAL INVENTORY
        ========================================================

        We do NOT copy today's inventory backwards.

        Old inventory_daily_snapshots are not automatically
        treated as canonical historical truth.

        Historical financials remain usable.

        Historical inventory remains explicitly unavailable.
        ========================================================
        */

        v_stock_qty := 0;

        v_reserved_qty := 0;

        v_available_qty := 0;

        v_products_in_stock := 0;

        v_out_of_stock := 0;

        v_low_stock := 0;


        v_inventory_data_status :=
            'HISTORICAL_UNAVAILABLE';

    END IF;


    -- ========================================================
    -- 11. UPSERT CANONICAL SNAPSHOT
    -- ========================================================

    INSERT INTO public.ai_daily_store_snapshots_v1 (

        organization_id,
        store_id,
        snapshot_date,
        timezone,

        period_start_utc,
        period_end_utc,

        sales_total,
        orders_count,

        cogs_total,
        cogs_items_count,
        cogs_missing_items_count,
        cogs_coverage_percent,

        expenses_total,
        expenses_count,

        gross_profit,
        net_profit,

        stock_qty,
        reserved_qty,
        available_stock_qty,

        products_in_stock,
        out_of_stock_products,
        low_stock_products,

        inventory_data_status,
        financial_data_status,

        engine_version,

        generated_at,
        updated_at
    )

    VALUES (

        v_org_id,
        p_store_id,
        v_snapshot_date,
        v_timezone,

        v_start,
        v_end,

        v_sales,
        v_orders,

        v_cogs,
        v_cogs_items,
        v_cogs_missing,
        v_cogs_coverage,

        v_expenses,
        v_expense_count,

        (
            v_sales
            - v_cogs
        ),

        (
            v_sales
            - v_cogs
            - v_expenses
        ),

        v_stock_qty,
        v_reserved_qty,
        v_available_qty,

        v_products_in_stock,
        v_out_of_stock,
        v_low_stock,

        v_inventory_data_status,
        v_financial_data_status,

        'CANONICAL_V2',

        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
    )


    ON CONFLICT
    ON CONSTRAINT ai_daily_store_snapshots_v1_unique

    DO UPDATE SET

        timezone =
            EXCLUDED.timezone,

        period_start_utc =
            EXCLUDED.period_start_utc,

        period_end_utc =
            EXCLUDED.period_end_utc,

        sales_total =
            EXCLUDED.sales_total,

        orders_count =
            EXCLUDED.orders_count,

        cogs_total =
            EXCLUDED.cogs_total,

        cogs_items_count =
            EXCLUDED.cogs_items_count,

        cogs_missing_items_count =
            EXCLUDED.cogs_missing_items_count,

        cogs_coverage_percent =
            EXCLUDED.cogs_coverage_percent,

        expenses_total =
            EXCLUDED.expenses_total,

        expenses_count =
            EXCLUDED.expenses_count,

        gross_profit =
            EXCLUDED.gross_profit,

        net_profit =
            EXCLUDED.net_profit,

        stock_qty =
            EXCLUDED.stock_qty,

        reserved_qty =
            EXCLUDED.reserved_qty,

        available_stock_qty =
            EXCLUDED.available_stock_qty,

        products_in_stock =
            EXCLUDED.products_in_stock,

        out_of_stock_products =
            EXCLUDED.out_of_stock_products,

        low_stock_products =
            EXCLUDED.low_stock_products,

        inventory_data_status =
            EXCLUDED.inventory_data_status,

        financial_data_status =
            EXCLUDED.financial_data_status,

        engine_version =
            EXCLUDED.engine_version,

        generated_at =
            CURRENT_TIMESTAMP,

        updated_at =
            CURRENT_TIMESTAMP;


    -- ========================================================
    -- 12. RETURN CANONICAL RESULT
    -- ========================================================

    RETURN QUERY

    SELECT
        snap.organization_id,
        snap.store_id,
        snap.snapshot_date,
        snap.timezone,

        snap.sales_total,
        snap.cogs_total,
        snap.expenses_total,

        snap.gross_profit,
        snap.net_profit,

        snap.orders_count,

        snap.stock_qty,
        snap.available_stock_qty,

        snap.cogs_coverage_percent

    FROM public.ai_daily_store_snapshots_v1 AS snap

    WHERE snap.organization_id = v_org_id
      AND snap.store_id = p_store_id
      AND snap.snapshot_date = v_snapshot_date

    LIMIT 1;

END;

$function$;

REVOKE EXECUTE ON FUNCTION public.build_ai_daily_store_snapshot_v1(uuid,date) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.backfill_ai_daily_store_snapshots_all_history_v1()
 RETURNS TABLE(stores_checked integer, stores_backfilled integer, stores_without_history integer, snapshots_processed bigint, snapshots_failed bigint, earliest_date_processed date, latest_date_processed date)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$

DECLARE
    r record;

    v_store_first_sales_date date;
    v_store_first_expense_date date;
    v_store_first_date date;
    v_store_last_date date;

    v_date date;

    v_checked integer := 0;
    v_backfilled integer := 0;
    v_without_history integer := 0;

    v_processed bigint := 0;
    v_failed bigint := 0;

    v_global_first date := NULL;
    v_global_last date := NULL;

BEGIN

    /*
    ============================================================
    ZETRA AI — FULL HISTORICAL CANONICAL BACKFILL V1
    ============================================================

    PURPOSE

    For every store:

      1. Resolve effective timezone.
      2. Find earliest REAL financial business date from:
           - sales.sold_at
           - expenses.expense_date
      3. Backfill every business date from earliest date
         through yesterday.
      4. Use:
           build_ai_daily_store_snapshot_v1()

    IMPORTANT

    Historical:
      SALES       = reconstructed
      COGS        = reconstructed
      EXPENSES    = reconstructed
      GROSS PROFIT= reconstructed
      NET PROFIT  = reconstructed

    Historical inventory:
      inventory_data_status = HISTORICAL_UNAVAILABLE

    Current day:
      NOT handled here.
      Existing scheduler continues refreshing TODAY.

    This function is safe to rerun because canonical snapshot
    builder uses UPSERT on:

      organization_id
      store_id
      snapshot_date

    ============================================================
    */


    FOR r IN

        SELECT
            s.id AS store_id,
            s.organization_id,

            COALESCE(
                NULLIF(s.timezone, ''),
                NULLIF(o.timezone, ''),
                'UTC'
            ) AS effective_timezone

        FROM public.stores AS s

        JOIN public.organizations AS o
          ON o.id = s.organization_id

        ORDER BY
            s.organization_id,
            s.id

    LOOP

        v_checked := v_checked + 1;


        -- =====================================================
        -- 1. VALIDATE TIMEZONE
        -- =====================================================

        IF NOT EXISTS (
            SELECT 1
            FROM pg_timezone_names AS t
            WHERE t.name = r.effective_timezone
        ) THEN
            v_without_history := v_without_history + 1;
            CONTINUE;
        END IF;


        -- =====================================================
        -- 2. FIND FIRST SALES BUSINESS DATE
        -- =====================================================

        SELECT
            MIN(
                (
                    s.sold_at
                    AT TIME ZONE r.effective_timezone
                )::date
            )

        INTO
            v_store_first_sales_date

        FROM public.sales AS s

        WHERE s.organization_id = r.organization_id
          AND s.store_id = r.store_id
          AND COALESCE(
                s.status,
                'COMPLETED'
              ) = 'COMPLETED';


        -- =====================================================
        -- 3. FIND FIRST EXPENSE BUSINESS DATE
        -- =====================================================

        SELECT
            MIN(e.expense_date)

        INTO
            v_store_first_expense_date

        FROM public.expenses AS e

        WHERE e.organization_id = r.organization_id
          AND e.store_id = r.store_id;


        -- =====================================================
        -- 4. EARLIEST REAL BUSINESS HISTORY
        -- =====================================================

        v_store_first_date :=
            CASE
                WHEN v_store_first_sales_date IS NULL
                     AND v_store_first_expense_date IS NULL
                THEN NULL

                WHEN v_store_first_sales_date IS NULL
                THEN v_store_first_expense_date

                WHEN v_store_first_expense_date IS NULL
                THEN v_store_first_sales_date

                ELSE
                    LEAST(
                        v_store_first_sales_date,
                        v_store_first_expense_date
                    )
            END;


        -- =====================================================
        -- 5. NO HISTORY = SKIP STORE
        -- =====================================================

        IF v_store_first_date IS NULL THEN

            v_without_history :=
                v_without_history + 1;

            CONTINUE;

        END IF;


        -- =====================================================
        -- 6. LAST HISTORICAL DATE = YESTERDAY LOCAL TIME
        -- =====================================================

        v_store_last_date :=
            (
                CURRENT_TIMESTAMP
                AT TIME ZONE r.effective_timezone
            )::date - 1;


        IF v_store_first_date > v_store_last_date THEN

            v_without_history :=
                v_without_history + 1;

            CONTINUE;

        END IF;


        -- =====================================================
        -- 7. GLOBAL AUDIT BOUNDARIES
        -- =====================================================

        IF
            v_global_first IS NULL
            OR v_store_first_date < v_global_first
        THEN
            v_global_first :=
                v_store_first_date;
        END IF;


        IF
            v_global_last IS NULL
            OR v_store_last_date > v_global_last
        THEN
            v_global_last :=
                v_store_last_date;
        END IF;


        v_backfilled :=
            v_backfilled + 1;


        -- =====================================================
        -- 8. BUILD EVERY HISTORICAL BUSINESS DAY
        -- =====================================================

        v_date :=
            v_store_first_date;


        WHILE v_date <= v_store_last_date LOOP

            BEGIN

                PERFORM
                    public.build_ai_daily_store_snapshot_v1(
                        r.store_id,
                        v_date
                    );

                v_processed :=
                    v_processed + 1;

            EXCEPTION
                WHEN OTHERS THEN

                    v_failed :=
                        v_failed + 1;

                    RAISE WARNING
                        'ZETRA historical backfill failed. store=%, date=%, error=%',
                        r.store_id,
                        v_date,
                        SQLERRM;

            END;


            v_date :=
                v_date + 1;

        END LOOP;

    END LOOP;


    -- =========================================================
    -- 9. RETURN SUMMARY
    -- =========================================================

    stores_checked :=
        v_checked;

    stores_backfilled :=
        v_backfilled;

    stores_without_history :=
        v_without_history;

    snapshots_processed :=
        v_processed;

    snapshots_failed :=
        v_failed;

    earliest_date_processed :=
        v_global_first;

    latest_date_processed :=
        v_global_last;

    RETURN NEXT;

END;

$function$;

REVOKE EXECUTE ON FUNCTION public.backfill_ai_daily_store_snapshots_all_history_v1() FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.run_ai_snapshot_backfill_batch_v1(p_limit integer DEFAULT 50)
 RETURNS TABLE(picked integer, completed integer, failed integer, remaining bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$

DECLARE
    r record;

    v_picked integer := 0;
    v_completed integer := 0;
    v_failed integer := 0;

BEGIN

    IF p_limit IS NULL OR p_limit < 1 THEN
        p_limit := 50;
    END IF;

    IF p_limit > 250 THEN
        p_limit := 250;
    END IF;


    /*
      Recover anything abandoned by an interrupted execution.
    */

    UPDATE public.ai_snapshot_backfill_queue_v1
    SET
        status = 'PENDING',
        started_at = NULL,
        updated_at = now()
    WHERE status = 'PROCESSING'
      AND started_at < now() - interval '15 minutes';


    FOR r IN

        SELECT
            q.organization_id,
            q.store_id,
            q.snapshot_date

        FROM public.ai_snapshot_backfill_queue_v1 q

        WHERE q.status IN (
            'PENDING',
            'FAILED'
        )

          AND q.attempts < 5

        ORDER BY
            q.snapshot_date,
            q.organization_id,
            q.store_id

        LIMIT p_limit

        FOR UPDATE SKIP LOCKED

    LOOP

        v_picked := v_picked + 1;


        UPDATE public.ai_snapshot_backfill_queue_v1
        SET
            status = 'PROCESSING',
            attempts = attempts + 1,
            started_at = now(),
            last_error = NULL,
            updated_at = now()

        WHERE organization_id = r.organization_id
          AND store_id = r.store_id
          AND snapshot_date = r.snapshot_date;


        BEGIN

            PERFORM
                public.build_ai_daily_store_snapshot_v1(
                    r.store_id,
                    r.snapshot_date
                );


            UPDATE public.ai_snapshot_backfill_queue_v1
            SET
                status = 'DONE',
                completed_at = now(),
                updated_at = now(),
                last_error = NULL

            WHERE organization_id = r.organization_id
              AND store_id = r.store_id
              AND snapshot_date = r.snapshot_date;


            v_completed :=
                v_completed + 1;


        EXCEPTION
            WHEN OTHERS THEN

                UPDATE public.ai_snapshot_backfill_queue_v1
                SET
                    status = 'FAILED',
                    last_error = SQLERRM,
                    updated_at = now()

                WHERE organization_id = r.organization_id
                  AND store_id = r.store_id
                  AND snapshot_date = r.snapshot_date;


                v_failed :=
                    v_failed + 1;

        END;

    END LOOP;


    picked :=
        v_picked;

    completed :=
        v_completed;

    failed :=
        v_failed;


    SELECT COUNT(*)
    INTO remaining
    FROM public.ai_snapshot_backfill_queue_v1 q
    WHERE q.status IN (
        'PENDING',
        'PROCESSING',
        'FAILED'
    )
      AND q.attempts < 5;


    RETURN NEXT;

END;

$function$;

REVOKE EXECUTE ON FUNCTION public.run_ai_snapshot_backfill_batch_v1(integer) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.run_ai_snapshot_backfill_autopilot_v1()
 RETURNS TABLE(picked integer, completed integer, failed integer, remaining bigint, autopilot_status text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'cron'
AS $function$

DECLARE
    v_result record;

BEGIN

    -- --------------------------------------------------------
    -- Run one safe batch.
    -- Existing batch function itself caps maximum at 250.
    -- We intentionally use 200 because it has already passed
    -- successfully without timeout.
    -- --------------------------------------------------------

    SELECT *
    INTO v_result
    FROM public.run_ai_snapshot_backfill_batch_v1(200);


    picked :=
        COALESCE(v_result.picked, 0);

    completed :=
        COALESCE(v_result.completed, 0);

    failed :=
        COALESCE(v_result.failed, 0);

    remaining :=
        COALESCE(v_result.remaining, 0);


    -- --------------------------------------------------------
    -- If everything is finished, stop this cron automatically.
    -- --------------------------------------------------------

    IF remaining = 0 THEN

        BEGIN

            PERFORM cron.unschedule(
                'zetra_ai_snapshot_history_backfill_v1'
            );

        EXCEPTION
            WHEN OTHERS THEN
                NULL;
        END;


        autopilot_status :=
            'COMPLETE_AND_STOPPED';

    ELSE

        autopilot_status :=
            'RUNNING';

    END IF;


    RETURN NEXT;

END;

$function$;

REVOKE EXECUTE ON FUNCTION public.run_ai_snapshot_backfill_autopilot_v1() FROM PUBLIC,anon,authenticated;

REVOKE INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public.inventory FROM anon,authenticated;

DROP POLICY IF EXISTS m2_active_operational_scope ON public.inventory;

CREATE POLICY m2_active_operational_scope ON public.inventory AS RESTRICTIVE FOR SELECT TO authenticated USING (security_m2.store_allowed(organization_id,store_id));

DROP POLICY IF EXISTS m2_active_operational_scope ON public.products;

CREATE POLICY m2_active_operational_scope ON public.products AS RESTRICTIVE FOR SELECT TO authenticated USING (security_m2.store_allowed(organization_id,store_id));

DROP POLICY IF EXISTS m2_active_operational_scope ON public.sale_items;

CREATE POLICY m2_active_operational_scope ON public.sale_items AS RESTRICTIVE FOR SELECT TO authenticated USING (EXISTS(SELECT 1 FROM public.sales s WHERE s.id=sale_items.sale_id AND security_m2.store_allowed(s.organization_id,s.store_id)));

GRANT UPDATE ON public.inbound_stock_orders TO authenticated;

DROP POLICY IF EXISTS m2_owner_header_update ON public.inbound_stock_orders;

CREATE POLICY m2_owner_header_update ON public.inbound_stock_orders AS RESTRICTIVE FOR UPDATE TO authenticated USING (security_m2.owner_of(organization_id)) WITH CHECK (security_m2.owner_of(organization_id));

DROP TRIGGER IF EXISTS m2_inbound_integrity ON public.inbound_stock_orders;

CREATE TRIGGER m2_inbound_integrity BEFORE INSERT OR UPDATE ON public.inbound_stock_orders FOR EACH ROW EXECUTE FUNCTION security_m2.inbound_integrity();

DROP TRIGGER IF EXISTS m2_inbound_integrity ON public.inbound_stock_items;

CREATE TRIGGER m2_inbound_integrity BEFORE INSERT OR UPDATE ON public.inbound_stock_items FOR EACH ROW EXECUTE FUNCTION security_m2.inbound_integrity();

DROP TRIGGER IF EXISTS m2_inbound_integrity ON public.inbound_stock_payments;

CREATE TRIGGER m2_inbound_integrity BEFORE INSERT OR UPDATE ON public.inbound_stock_payments FOR EACH ROW EXECUTE FUNCTION security_m2.inbound_integrity();

REVOKE SELECT ON public.products FROM PUBLIC,anon,authenticated;

REVOKE SELECT ("id","organization_id","price","cost","is_active","created_at","updated_at","cost_price","selling_price","reserved_qty","qty_on_hand","created_by","store_id","alert_level","is_precision_product","allow_decimal_qty","requires_expiry","requires_batch_tracking","min_sell_qty","max_sell_qty","purchase_unit_qty","auto_cost_per_dispense_unit","auto_sell_per_dispense_unit","pharmacy_mode","precision_pack_size","precision_allow_box_sales","precision_allow_unit_sales","global_product_id","name","sku","barcode","unit","category","image_url","dosage_unit","purchase_unit","dispense_unit","precision_base_unit","precision_sell_mode") ON public.products FROM PUBLIC,anon,authenticated;

GRANT SELECT ("id","organization_id","price","is_active","created_at","updated_at","selling_price","reserved_qty","qty_on_hand","created_by","store_id","alert_level","is_precision_product","allow_decimal_qty","requires_expiry","requires_batch_tracking","min_sell_qty","max_sell_qty","purchase_unit_qty","auto_sell_per_dispense_unit","pharmacy_mode","precision_pack_size","precision_allow_box_sales","precision_allow_unit_sales","global_product_id","name","sku","barcode","unit","category","image_url","dosage_unit","purchase_unit","dispense_unit","precision_base_unit","precision_sell_mode") ON public.products TO authenticated;

REVOKE INSERT,UPDATE,DELETE ON public.products FROM PUBLIC,anon,authenticated;

REVOKE INSERT ("id","organization_id","price","cost","is_active","created_at","updated_at","cost_price","selling_price","reserved_qty","qty_on_hand","created_by","store_id","alert_level","is_precision_product","allow_decimal_qty","requires_expiry","requires_batch_tracking","min_sell_qty","max_sell_qty","purchase_unit_qty","auto_cost_per_dispense_unit","auto_sell_per_dispense_unit","pharmacy_mode","precision_pack_size","precision_allow_box_sales","precision_allow_unit_sales","global_product_id","name","sku","barcode","unit","category","image_url","dosage_unit","purchase_unit","dispense_unit","precision_base_unit","precision_sell_mode"),UPDATE ("id","organization_id","price","cost","is_active","created_at","updated_at","cost_price","selling_price","reserved_qty","qty_on_hand","created_by","store_id","alert_level","is_precision_product","allow_decimal_qty","requires_expiry","requires_batch_tracking","min_sell_qty","max_sell_qty","purchase_unit_qty","auto_cost_per_dispense_unit","auto_sell_per_dispense_unit","pharmacy_mode","precision_pack_size","precision_allow_box_sales","precision_allow_unit_sales","global_product_id","name","sku","barcode","unit","category","image_url","dosage_unit","purchase_unit","dispense_unit","precision_base_unit","precision_sell_mode") ON public.products FROM PUBLIC,anon,authenticated;

GRANT UPDATE ("id","organization_id","price","is_active","created_at","updated_at","selling_price","reserved_qty","qty_on_hand","created_by","store_id","alert_level","is_precision_product","allow_decimal_qty","requires_expiry","requires_batch_tracking","min_sell_qty","max_sell_qty","purchase_unit_qty","auto_sell_per_dispense_unit","pharmacy_mode","precision_pack_size","precision_allow_box_sales","precision_allow_unit_sales","global_product_id","name","sku","barcode","unit","category","image_url","dosage_unit","purchase_unit","dispense_unit","precision_base_unit","precision_sell_mode") ON public.products TO authenticated;

CREATE OR REPLACE VIEW public.m2_owner_products WITH (security_barrier=true) AS SELECT * FROM public.products WHERE security_m2.owner_of(organization_id);

REVOKE ALL ON public.m2_owner_products FROM PUBLIC,anon; GRANT SELECT ON public.m2_owner_products TO authenticated;

REVOKE SELECT ON public.sale_items FROM PUBLIC,anon,authenticated;

REVOKE SELECT ("id","sale_id","product_id","qty","unit_price","line_total","created_at","unit_cost_price","unit_cost","product_name") ON public.sale_items FROM PUBLIC,anon,authenticated;

GRANT SELECT ("id","sale_id","product_id","qty","unit_price","line_total","created_at","product_name") ON public.sale_items TO authenticated;

REVOKE INSERT,UPDATE,DELETE ON public.sale_items FROM PUBLIC,anon,authenticated;

REVOKE INSERT ("id","sale_id","product_id","qty","unit_price","line_total","created_at","unit_cost_price","unit_cost","product_name"),UPDATE ("id","sale_id","product_id","qty","unit_price","line_total","created_at","unit_cost_price","unit_cost","product_name") ON public.sale_items FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE VIEW public.m2_owner_sale_items WITH (security_barrier=true) AS SELECT i.* FROM public.sale_items i JOIN public.sales s ON s.id=i.sale_id WHERE security_m2.owner_of(s.organization_id);

REVOKE ALL ON public.m2_owner_sale_items FROM PUBLIC,anon; GRANT SELECT ON public.m2_owner_sale_items TO authenticated;

COMMIT;