CREATE OR REPLACE FUNCTION public.create_sale(p_store_id uuid, p_items jsonb, p_note text DEFAULT NULL::text, p_cashier_shift_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(sale_id uuid, total_qty integer, total_amount numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org_id uuid;
  v_sale_id uuid;
  v_total_qty numeric := 0;
  v_total_amount numeric := 0;
  v_membership_id uuid;
  v_role text;
  v_is_cashier boolean := false;

  item jsonb;

  v_handoff_id_text text;
  v_handoff_id uuid;
  v_handoff public.cashier_handoffs%rowtype;
  v_cashier_membership_id uuid;

  v_shift public.cashier_shifts%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if p_store_id is null then
    raise exception 'p_store_id is required';
  end if;

  select s.organization_id
    into v_org_id
  from public.stores s
  where s.id = p_store_id
  limit 1;

  if v_org_id is null then
    raise exception 'Store % not found or has no organization', p_store_id;
  end if;

  select m.id, m.role
    into v_membership_id, v_role
  from public.org_memberships m
  where m.organization_id = v_org_id
    and m.user_id = auth.uid()
    and coalesce(m.is_active, true) = true
  order by m.created_at asc nulls last, m.id asc
  limit 1;

  if v_membership_id is null then
    raise exception 'User has no membership in this organization';
  end if;

  v_is_cashier := coalesce(v_role, '') = 'cashier';

  perform public.ensure_my_store_access(p_store_id);

  if p_items is null
     or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) = 0 then
    raise exception 'p_items must be a non-empty JSON array';
  end if;

  select
    coalesce(sum((j->>'qty')::numeric), 0),
    coalesce(sum(((j->>'qty')::numeric) * (j->>'unit_price')::numeric), 0)
  into v_total_qty, v_total_amount
  from jsonb_array_elements(p_items) as j;

  if v_total_qty <= 0 then
    raise exception 'Total quantity must be greater than zero';
  end if;

  insert into public.sales (
    organization_id,
    store_id,
    sold_by_membership_id,
    cashier_shift_id,
    note,
    total_qty,
    total_amount,
    created_by
  )
  values (
    v_org_id,
    p_store_id,
    v_membership_id,
    p_cashier_shift_id,
    p_note,
    v_total_qty,
    v_total_amount,
    auth.uid()
  )
  returning id into v_sale_id;

  for item in
    select * from jsonb_array_elements(p_items)
  loop
    insert into public.sale_items (
      sale_id,
      product_id,
      qty,
      unit_price,
      line_total
    )
    values (
      v_sale_id,
      (item->>'product_id')::uuid,
      (item->>'qty')::numeric,
      (item->>'unit_price')::numeric,
      ((item->>'qty')::numeric) * (item->>'unit_price')::numeric
    );

    perform public.adjust_stock(
      p_amount     := (item->>'qty')::numeric,
      p_mode       := 'REDUCE',
      p_note       := 'SALE:' || v_sale_id::text,
      p_product_id := (item->>'product_id')::uuid,
      p_store_id   := p_store_id
    );
  end loop;

  if v_is_cashier and p_cashier_shift_id is null and v_handoff_id is not null then
    update public.cashier_handoffs ch
       set sale_id = v_sale_id,
           updated_at = now()
     where ch.id = v_handoff_id;
  end if;

  return query
  select v_sale_id, ceil(v_total_qty)::integer, v_total_amount;
end;
$function$
