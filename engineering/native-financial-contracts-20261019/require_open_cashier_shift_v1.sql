CREATE OR REPLACE FUNCTION public.require_open_cashier_shift_v1(p_store_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_shift_id uuid;
begin
  select x.shift_id
    into v_shift_id
  from public.get_my_open_cashier_shift_v1(p_store_id) x
  limit 1;

  if v_shift_id is null then
    raise exception 'No OPEN cashier shift for this store';
  end if;

  return v_shift_id;
end;
$function$
