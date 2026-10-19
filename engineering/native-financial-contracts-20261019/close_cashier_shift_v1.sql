CREATE OR REPLACE FUNCTION public.close_cashier_shift_v1(p_shift_id uuid, p_drawer_count numeric, p_closing_note text DEFAULT NULL::text)
 RETURNS TABLE(shift_id uuid, organization_id uuid, store_id uuid, membership_id uuid, opening_cash numeric, drawer_count numeric, closing_note text, status text, opened_at timestamp with time zone, closed_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org_id uuid;
  v_membership_id uuid;
  v_role text;
  v_shift record;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if p_shift_id is null then
    raise exception 'p_shift_id is required';
  end if;

  if coalesce(p_drawer_count, 0) < 0 then
    raise exception 'drawer_count cannot be negative';
  end if;

  select
    cs.id,
    cs.organization_id,
    cs.store_id,
    cs.membership_id,
    cs.opening_cash,
    cs.drawer_count,
    cs.closing_note,
    cs.status,
    cs.opened_at,
    cs.closed_at
  into v_shift
  from public.cashier_shifts cs
  where cs.id = p_shift_id
  limit 1;

  if v_shift.id is null then
    raise exception 'Shift not found';
  end if;

  perform public.ensure_my_store_access(v_shift.store_id);

  select
    m.id,
    m.role
  into
    v_membership_id,
    v_role
  from public.org_memberships m
  where m.user_id = auth.uid()
    and m.organization_id = v_shift.organization_id
    and coalesce(m.is_active, true) = true
  limit 1;

  if v_membership_id is null then
    raise exception 'No org membership';
  end if;

  if v_role <> 'cashier' then
    raise exception 'Only cashier can close cashier shift';
  end if;

  if v_shift.membership_id <> v_membership_id then
    raise exception 'You can only close your own shift';
  end if;

  if coalesce(v_shift.status, '') <> 'OPEN' then
    raise exception 'Shift is not OPEN';
  end if;

  update public.cashier_shifts cs
  set
    drawer_count = coalesce(p_drawer_count, 0),
    closing_note = nullif(trim(coalesce(p_closing_note, '')), ''),
    closed_at = now(),
    status = 'CLOSED'
  where cs.id = p_shift_id
    and cs.membership_id = v_membership_id
    and cs.status = 'OPEN';

  if not found then
    raise exception 'Failed to close shift';
  end if;

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
  where cs.id = p_shift_id
  limit 1;
end;
$function$
