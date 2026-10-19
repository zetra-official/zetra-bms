CREATE OR REPLACE FUNCTION public.create_expense_v2(p_store_id uuid, p_amount numeric, p_category text DEFAULT NULL::text, p_note text DEFAULT NULL::text, p_payment_method text DEFAULT NULL::text, p_expense_date date DEFAULT NULL::date, p_category_name text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org_id uuid;
  v_role text;
  v_membership_id uuid;
  v_cat_id uuid;
  v_cat_name text;
  v_expense_id uuid;
  v_payment_method text;
  v_store_expense_allowed boolean := false;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if p_store_id is null then
    raise exception 'Missing store';
  end if;

  select
    s.organization_id,
    coalesce(s.staff_can_manage_expense, false)
  into
    v_org_id,
    v_store_expense_allowed
  from public.stores s
  where s.id = p_store_id;

  if v_org_id is null then
    raise exception 'Store not found';
  end if;

  select
    m.id,
    lower(coalesce(m.role, ''))
  into
    v_membership_id,
    v_role
  from public.org_memberships m
  where m.user_id = auth.uid()
    and m.organization_id = v_org_id
    and coalesce(m.is_active, true) = true
  limit 1;

  if v_membership_id is null then
    raise exception 'No membership in this organization';
  end if;

  if v_role = 'staff' then
    if not exists (
      select 1
      from public.org_membership_stores ms
      where ms.membership_id = v_membership_id
        and ms.store_id = p_store_id
    ) then
      raise exception 'No access to this store';
    end if;

    if not v_store_expense_allowed then
      raise exception 'Expense permission disabled for staff in this store';
    end if;
  elsif v_role not in ('owner', 'admin') then
    raise exception 'No access';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'Amount must be > 0';
  end if;

  if coalesce(p_category_name, p_category) is not null
     and length(trim(coalesce(p_category_name, p_category))) > 0 then
    v_cat_name := trim(coalesce(p_category_name, p_category));

    select ec.id
    into v_cat_id
    from public.expense_categories ec
    where ec.organization_id = v_org_id
      and upper(ec.name) = upper(v_cat_name)
    limit 1;

    if v_cat_id is null then
      insert into public.expense_categories (organization_id, name)
      values (v_org_id, v_cat_name)
      returning id into v_cat_id;
    end if;
  end if;

  v_payment_method := nullif(trim(coalesce(p_payment_method, '')), '');

  if v_payment_method is not null then
    v_payment_method := upper(v_payment_method);
  end if;

  insert into public.expenses (
    organization_id,
    store_id,
    category_id,
    category_name,
    amount,
    note,
    payment_method,
    expense_date,
    created_by,
    created_by_membership_id
  )
  values (
    v_org_id,
    p_store_id,
    v_cat_id,
    v_cat_name,
    p_amount,
    p_note,
    v_payment_method,
    coalesce(p_expense_date, current_date),
    auth.uid(),
    v_membership_id
  )
  returning id into v_expense_id;

  return v_expense_id;
end;
$function$
