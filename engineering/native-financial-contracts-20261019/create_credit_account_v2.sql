CREATE OR REPLACE FUNCTION public.create_credit_account_v2(p_store_id uuid, p_customer_name text, p_phone text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_id uuid;
  v_norm text;
begin
  if not public.can_manage_credit_store(p_store_id) then
    raise exception 'Not allowed to manage credit for this store';
  end if;

  if p_customer_name is null or btrim(p_customer_name) = '' then
    raise exception 'Customer name is required';
  end if;

  v_norm := public.normalize_phone_simple(p_phone);

  -- reuse existing account if phone already exists
  if v_norm is not null and btrim(v_norm) <> '' then
    select id
      into v_id
    from public.credit_accounts_v2
    where store_id = p_store_id
      and normalized_phone = v_norm
    order by created_at asc
    limit 1;

    if v_id is not null then
      return v_id;
    end if;
  end if;

  insert into public.credit_accounts_v2 (
    store_id,
    customer_name,
    phone,
    normalized_phone,
    created_by
  )
  values (
    p_store_id,
    btrim(p_customer_name),
    nullif(btrim(p_phone), ''),
    v_norm,
    auth.uid()
  )
  returning id into v_id;

  return v_id;
end;
$function$
