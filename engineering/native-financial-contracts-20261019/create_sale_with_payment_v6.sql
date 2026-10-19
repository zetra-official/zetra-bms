CREATE OR REPLACE FUNCTION public.create_sale_with_payment_v6(p_store_id uuid, p_items jsonb, p_note text DEFAULT NULL::text, p_payment_method text DEFAULT 'CASH'::text, p_paid_amount numeric DEFAULT 0, p_payment_channel text DEFAULT NULL::text, p_reference text DEFAULT NULL::text, p_customer_id uuid DEFAULT NULL::uuid, p_customer_phone text DEFAULT NULL::text, p_customer_full_name text DEFAULT NULL::text, p_discount_type text DEFAULT NULL::text, p_discount_value numeric DEFAULT NULL::numeric, p_discount_note text DEFAULT NULL::text, p_client_sale_id uuid DEFAULT NULL::uuid, p_cashier_shift_id uuid DEFAULT NULL::uuid, p_sold_by_membership_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(sale_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_sale_id uuid;
  v_org_id uuid;
  v_actor_membership_id uuid;
  v_actor_role text;
  v_effective_sold_by_membership_id uuid;
  v_target_role text;
  v_target_org_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if p_store_id is null then
    raise exception 'p_store_id is required';
  end if;

  if p_items is null
     or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) = 0 then
    raise exception 'p_items is required';
  end if;

  perform public.ensure_my_store_access(p_store_id);

  select s.organization_id
    into v_org_id
  from public.stores s
  where s.id = p_store_id
  limit 1;

  if v_org_id is null then
    raise exception 'Store not found';
  end if;

  select m.id, lower(coalesce(m.role, ''))
    into v_actor_membership_id, v_actor_role
  from public.org_memberships m
  where m.user_id = auth.uid()
    and m.organization_id = v_org_id
    and coalesce(m.is_active, true) = true
  limit 1;

  if v_actor_membership_id is null then
    raise exception 'No org membership';
  end if;

  if p_sold_by_membership_id is not null then
    select m.organization_id, lower(coalesce(m.role, ''))
      into v_target_org_id, v_target_role
    from public.org_memberships m
    where m.id = p_sold_by_membership_id
      and coalesce(m.is_active, true) = true
    limit 1;

    if v_target_org_id is null then
      raise exception 'Selected staff membership not found';
    end if;

    if v_target_org_id <> v_org_id then
      raise exception 'Selected staff does not belong to this organization';
    end if;

    if v_target_role <> 'staff' then
      raise exception 'Sales attribution is STAFF only';
    end if;

    v_effective_sold_by_membership_id := p_sold_by_membership_id;

  elsif v_actor_role = 'staff' then
    v_effective_sold_by_membership_id := v_actor_membership_id;

  else
    v_effective_sold_by_membership_id := v_actor_membership_id;
  end if;

  select x.sale_id
    into v_sale_id
  from public.create_sale_with_payment_v4(
    p_store_id := p_store_id,
    p_items := p_items,
    p_note := p_note,
    p_payment_method := p_payment_method,
    p_paid_amount := p_paid_amount,
    p_payment_channel := p_payment_channel,
    p_reference := p_reference,
    p_customer_id := p_customer_id,
    p_customer_phone := p_customer_phone,
    p_customer_full_name := p_customer_full_name,
    p_discount_type := p_discount_type,
    p_discount_value := p_discount_value,
    p_discount_note := p_discount_note,
    p_client_sale_id := case
      when p_client_sale_id is null then null
      else p_client_sale_id::text
    end,
    p_cashier_shift_id := p_cashier_shift_id
  ) x
  limit 1;

  if v_sale_id is null then
    raise exception 'create_sale_with_payment_v4 did not return sale_id';
  end if;

  update public.sales s
     set
       sold_by_membership = v_effective_sold_by_membership_id,
       sold_by_membership_id = v_effective_sold_by_membership_id
   where s.id = v_sale_id;

  return query
  select v_sale_id;
end;
$function$
