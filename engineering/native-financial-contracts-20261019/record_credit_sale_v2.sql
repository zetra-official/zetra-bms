CREATE OR REPLACE FUNCTION public.record_credit_sale_v2(p_store_id uuid, p_credit_account_id uuid, p_amount numeric, p_note text DEFAULT NULL::text, p_reference text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_id uuid;
  v_amt numeric(14,2);
  v_store uuid;
begin
  if not public.can_manage_credit_store(p_store_id) then
    raise exception 'Not allowed to manage credit for this store';
  end if;

  v_amt := abs(coalesce(p_amount, 0));
  if v_amt <= 0 then
    raise exception 'Amount must be > 0';
  end if;

  select store_id into v_store
  from public.credit_accounts_v2
  where id = p_credit_account_id;

  if v_store is null then
    raise exception 'Credit account not found';
  end if;

  if v_store <> p_store_id then
    raise exception 'Credit account does not belong to this store';
  end if;

  insert into public.credit_ledger_v2 (
    store_id, credit_account_id, entry_type, delta, note, reference, created_by
  ) values (
    p_store_id, p_credit_account_id, 'SALE', v_amt,
    nullif(btrim(p_note),''), nullif(btrim(p_reference),''), auth.uid()
  )
  returning id into v_id;

  return v_id;
end $function$
