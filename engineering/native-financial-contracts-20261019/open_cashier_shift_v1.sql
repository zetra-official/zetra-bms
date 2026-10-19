CREATE OR REPLACE FUNCTION public.open_cashier_shift_v1(p_store_id uuid, p_opening_cash numeric)
 RETURNS TABLE(shift_id uuid, organization_id uuid, store_id uuid, membership_id uuid, opening_cash numeric, drawer_count numeric, closing_note text, status text, opened_at timestamp with time zone, closed_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  v_org_id uuid;
  v_membership_id uuid;
  v_role text;
  v_existing_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if p_store_id is null then
    raise exception 'p_store_id is required';
  end if;

  if coalesce(p_opening_cash, 0) < 0 then
    raise exception 'opening_cash cannot be negative';
  end if;

  perform public.ensure_my_store_access(p_store_id);

  select s.organization_id
    into v_org_id
  from public.stores s
  where s.id = p_store_id;

  if v_org_id is null then
    raise exception 'Store not found';
  end if;

  select m.id, m.role
    into v_membership_id, v_role
  from public.org_memberships m
  where m.user_id = auth.uid()
    and m.organization_id = v_org_id
    and coalesce(m.is_active, true) = true
  limit 1;

  if v_membership_id is null then
    raise exception 'No org membership';
  end if;

  if v_role <> 'cashier' then
    raise exception 'Only cashier can open cashier shift';
  end if;

  select cs.id
    into v_existing_id
  from public.cashier_shifts cs
  where cs.store_id = p_store_id
    and cs.membership_id = v_membership_id
    and cs.status = 'OPEN'
  order by cs.opened_at desc
  limit 1;

  if v_existing_id is not null then
    return query
    select
      cs.id as shift_id,
      cs.organization_id,
      cs.store_id,
      cs.membership_id,
      cs.opening_cash,
      cs.drawer_count,
      cs.closing_note,
      cs.status,
      cs.opened_at,
      cs.closed_at
    from public.cashier_shifts cs
    where cs.id = v_existing_id
    limit 1;
    return;
  end if;

  insert into public.cashier_shifts (
    organization_id,
    store_id,
    membership_id,
    opening_cash,
    status,
    opened_at,
    created_by
  )
  values (
    v_org_id,
    p_store_id,
    v_membership_id,
    coalesce(p_opening_cash, 0),
    'OPEN',
    now(),
    auth.uid()
  );

  return query
  select
    cs.id as shift_id,
    cs.organization_id,
    cs.store_id,
    cs.membership_id,
    cs.opening_cash,
    cs.drawer_count,
    cs.closing_note,
    cs.status,
    cs.opened_at,
    cs.closed_at
  from public.cashier_shifts cs
  where cs.store_id = p_store_id
    and cs.membership_id = v_membership_id
    and cs.status = 'OPEN'
  order by cs.opened_at desc
  limit 1;
end;
$function$
