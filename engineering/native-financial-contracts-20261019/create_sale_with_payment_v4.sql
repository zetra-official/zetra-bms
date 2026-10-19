CREATE OR REPLACE FUNCTION public.create_sale_with_payment_v4(p_store_id uuid, p_items jsonb, p_note text DEFAULT NULL::text, p_payment_method text DEFAULT 'CASH'::text, p_paid_amount numeric DEFAULT 0, p_payment_channel text DEFAULT NULL::text, p_reference text DEFAULT NULL::text, p_customer_id uuid DEFAULT NULL::uuid, p_customer_phone text DEFAULT NULL::text, p_customer_full_name text DEFAULT NULL::text, p_discount_type text DEFAULT NULL::text, p_discount_value numeric DEFAULT NULL::numeric, p_discount_note text DEFAULT NULL::text, p_client_sale_id text DEFAULT NULL::text, p_cashier_shift_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(sale_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_sale_id uuid;
  v_org_id uuid;
  v_membership_id uuid;
  v_shift_store_id uuid;
  v_shift_org_id uuid;
  v_shift_membership_id uuid;
  v_shift_status text;
  v_client_sale_uuid uuid;

  v_subtotal numeric := 0;
  v_discount_amount numeric := 0;
  v_grand_total numeric := 0;
  v_paid numeric := 0;
  v_balance numeric := 0;
  v_method text;
  v_channel text;
  v_ref text;
  v_dtype text;
  v_dvalue numeric;
  v_is_credit boolean;
  v_sale_payment_method text;

  v_note text;
  v_split_cash numeric := 0;
  v_split_mobile numeric := 0;
  v_split_bank numeric := 0;
  v_split_total numeric := 0;
  v_is_split boolean := false;
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

  select s.organization_id into v_org_id
  from public.stores s
  where s.id = p_store_id
  limit 1;

  if v_org_id is null then
    raise exception 'Store not found';
  end if;

  select m.id into v_membership_id
  from public.org_memberships m
  where m.user_id = auth.uid()
    and m.organization_id = v_org_id
    and coalesce(m.is_active, true) = true
  limit 1;

  if v_membership_id is null then
    raise exception 'No org membership';
  end if;

  v_client_sale_uuid := null;

  if nullif(btrim(coalesce(p_client_sale_id, '')), '') is not null then
    begin
      v_client_sale_uuid := p_client_sale_id::uuid;
    exception when others then
      raise exception 'Invalid p_client_sale_id uuid';
    end;
  end if;

  if v_client_sale_uuid is not null then
    select s.id into v_sale_id
    from public.sales s
    where s.store_id = p_store_id
      and s.client_sale_id = v_client_sale_uuid
    limit 1;

    if v_sale_id is not null then
      return query select v_sale_id;
      return;
    end if;
  end if;

  if p_cashier_shift_id is not null then
    select cs.store_id, cs.organization_id, cs.membership_id, cs.status
    into v_shift_store_id, v_shift_org_id, v_shift_membership_id, v_shift_status
    from public.cashier_shifts cs
    where cs.id = p_cashier_shift_id
    limit 1;

    if v_shift_store_id is null then raise exception 'Cashier shift not found'; end if;
    if v_shift_store_id <> p_store_id then raise exception 'Cashier shift does not belong to this store'; end if;
    if v_shift_org_id <> v_org_id then raise exception 'Cashier shift does not belong to this organization'; end if;
    if v_shift_membership_id <> v_membership_id then raise exception 'You can only use your own cashier shift'; end if;
    if coalesce(v_shift_status, '') <> 'OPEN' then raise exception 'Cashier shift must be OPEN'; end if;
  end if;

  v_note := coalesce(p_note, '');
  v_method := upper(btrim(coalesce(p_payment_method, 'CASH')));
  v_paid := greatest(0, coalesce(p_paid_amount, 0));
  v_channel := nullif(btrim(coalesce(p_payment_channel, '')), '');
  v_ref := nullif(btrim(coalesce(p_reference, '')), '');

  if v_note ilike '%SPLIT_PAYMENT:%' then
    v_split_cash := coalesce(nullif(substring(v_note from 'CASH=([0-9]+(?:\.[0-9]+)?)'), '')::numeric, 0);
    v_split_mobile := coalesce(nullif(substring(v_note from 'MOBILE=([0-9]+(?:\.[0-9]+)?)'), '')::numeric, 0);
    v_split_bank := coalesce(nullif(substring(v_note from 'BANK=([0-9]+(?:\.[0-9]+)?)'), '')::numeric, 0);
    v_split_total := v_split_cash + v_split_mobile + v_split_bank;
    v_is_split := v_split_total > 0;
  end if;

  select coalesce(sum(
    coalesce((x->>'qty')::numeric, 0) * coalesce((x->>'unit_price')::numeric, 0)
  ), 0)
  into v_subtotal
  from jsonb_array_elements(p_items) x;

  if v_subtotal <= 0 then
    raise exception 'subtotal_amount must be > 0 (check qty/unit_price in items)';
  end if;

  v_dtype := upper(btrim(coalesce(p_discount_type, '')));
  if v_dtype not in ('PERCENT', 'FIXED') then v_dtype := null; end if;

  v_dvalue := greatest(0, coalesce(p_discount_value, 0));

  if v_dtype is null or v_dvalue <= 0 then
    v_discount_amount := 0;
  elsif v_dtype = 'PERCENT' then
    v_dvalue := least(100, greatest(0, v_dvalue));
    v_discount_amount := round((v_subtotal * v_dvalue) / 100);
  else
    v_discount_amount := round(v_dvalue);
  end if;

  v_discount_amount := greatest(0, least(v_subtotal, v_discount_amount));
  v_grand_total := greatest(0, v_subtotal - v_discount_amount);

  if v_grand_total <= 0 then raise exception 'grand_total must be > 0 after discount'; end if;
  if v_paid > v_grand_total then raise exception 'paid_amount cannot exceed grand_total'; end if;

  if v_is_split and round(v_split_total) <> round(v_paid) then
    raise exception 'Split payment total must equal paid_amount';
  end if;

  v_is_credit := (v_method = 'CREDIT') or (v_paid < v_grand_total);

  if v_is_credit then
    v_balance := greatest(0, v_grand_total - v_paid);
  else
    v_balance := 0;
    if round(v_paid) <> round(v_grand_total) then
      raise exception 'Non-credit sale must be fully paid (paid_amount must equal grand_total)';
    end if;
  end if;

  select cs.sale_id into v_sale_id
  from public.create_sale(
    p_store_id := p_store_id,
    p_items := p_items,
    p_note := nullif(btrim(coalesce(p_note, '')), ''),
    p_cashier_shift_id := p_cashier_shift_id
  ) cs
  limit 1;

  if v_sale_id is null then
    raise exception 'create_sale did not return sale_id';
  end if;

  v_sale_payment_method := case
    when v_is_split then 'SPLIT'
    when v_balance > 0 then 'CREDIT'
    else v_method
  end;

  update public.sales s
  set client_sale_id = coalesce(v_client_sale_uuid, s.client_sale_id),
      cashier_shift_id = coalesce(p_cashier_shift_id, s.cashier_shift_id),
      subtotal_amount = v_subtotal,
      discount_type = v_dtype,
      discount_value = case when v_dtype is null then null else v_dvalue end,
      discount_note = nullif(btrim(coalesce(p_discount_note, '')), ''),
      discount_amount = v_discount_amount,
      grand_total = v_grand_total,
      total_amount = v_grand_total,
      payment_method = v_sale_payment_method,
      paid_amount = v_paid,
      balance_amount = v_balance,
      payment_status = case when v_balance > 0 then 'OUTSTANDING' else 'PAID' end,
      amount_paid = v_paid,
      balance_due = v_balance
  where s.id = v_sale_id;

  if v_paid > 0 then
    if v_is_split then
      if v_split_cash > 0 then
        insert into public.sale_payments (organization_id, store_id, sale_id, payment_method, paid_amount, payment_channel, reference, note, created_by, created_at)
        values (v_org_id, p_store_id, v_sale_id, 'CASH', v_split_cash, null, null, nullif(btrim(coalesce(p_note, '')), ''), auth.uid(), now());
      end if;

      if v_split_mobile > 0 then
        insert into public.sale_payments (organization_id, store_id, sale_id, payment_method, paid_amount, payment_channel, reference, note, created_by, created_at)
        values (v_org_id, p_store_id, v_sale_id, 'MOBILE', v_split_mobile, coalesce(v_channel, 'M-PESA'), v_ref, nullif(btrim(coalesce(p_note, '')), ''), auth.uid(), now());
      end if;

      if v_split_bank > 0 then
        insert into public.sale_payments (organization_id, store_id, sale_id, payment_method, paid_amount, payment_channel, reference, note, created_by, created_at)
        values (v_org_id, p_store_id, v_sale_id, 'BANK', v_split_bank, v_channel, v_ref, nullif(btrim(coalesce(p_note, '')), ''), auth.uid(), now());
      end if;
    else
      insert into public.sale_payments (
        organization_id, store_id, sale_id, payment_method, paid_amount,
        payment_channel, reference, note, created_by, created_at
      )
      values (
        v_org_id, p_store_id, v_sale_id, v_method, v_paid,
        case when v_method in ('MOBILE', 'BANK') then v_channel else null end,
        case when v_method in ('MOBILE', 'BANK') then v_ref else null end,
        nullif(btrim(coalesce(p_note, '')), ''),
        auth.uid(),
        now()
      );
    end if;
  end if;

  return query select v_sale_id;
end;
$function$
