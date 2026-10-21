BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
DROP TRIGGER IF EXISTS m3_unified_selling_price ON public.products;
CREATE OR REPLACE FUNCTION public.adjust_stock(p_store_id uuid, p_product_id uuid, p_amount numeric, p_mode text, p_note text DEFAULT NULL::text, p_expiry_date date DEFAULT NULL::date, p_supplier_name text DEFAULT NULL::text, p_supplier_invoice_no text DEFAULT NULL::text, p_expiry_alert_days integer DEFAULT 30, p_precision_stock_mode text DEFAULT 'UNIT'::text)
 RETURNS TABLE(new_qty numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_mode text;
  v_org_id uuid;
  v_store_type text := 'STANDARD';

  v_current_qty numeric(12,3) := 0;
  v_next_qty numeric(12,3) := 0;
  v_effective_amount numeric(12,3) := 0;

  v_product_exists boolean := false;

  v_supplier_id uuid := null;
  v_supplier_name text := null;
  v_supplier_invoice_no text := null;

  v_batch_id uuid;

  v_is_precision boolean := false;
  v_pack_size numeric(12,3) := null;
  v_precision_mode text := 'UNIT';
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  v_mode := upper(trim(coalesce(p_mode, '')));

  if v_mode = 'ADD' then
    v_mode := 'IN';
  elsif v_mode = 'REDUCE' then
    v_mode := 'OUT';
  end if;

  if v_mode not in ('IN', 'OUT') then
    raise exception 'Invalid mode';
  end if;

  if p_amount is null or p_amount < 0 then
    raise exception 'Invalid amount';
  end if;

  perform public.ensure_my_store_access(p_store_id);

  select
    s.organization_id,
    coalesce(s.store_type, 'STANDARD')
  into
    v_org_id,
    v_store_type
  from public.stores s
  where s.id = p_store_id
  limit 1;

  if v_org_id is null then
    raise exception 'Store not found';
  end if;

  select exists (
    select 1
    from public.products p
    where p.id = p_product_id
      and p.organization_id = v_org_id
  )
  into v_product_exists;

  if not v_product_exists then
    raise exception 'Product not found in this organization';
  end if;

  select
    coalesce(p.is_precision_product, false),
    p.precision_pack_size
  into
    v_is_precision,
    v_pack_size
  from public.products p
  where p.id = p_product_id
    and p.organization_id = v_org_id
  limit 1;

  v_precision_mode := upper(trim(coalesce(p_precision_stock_mode, 'UNIT')));

  if v_precision_mode not in ('UNIT', 'PACK', 'BOX', 'CARTON') then
    v_precision_mode := 'UNIT';
  end if;

  -- Standard products: old behavior remains.
  -- Precision products: PACK/BOX/CARTON converts to base units.
  if v_is_precision
     and coalesce(v_pack_size, 0) > 0
     and v_precision_mode in ('PACK', 'BOX', 'CARTON') then
    v_effective_amount := p_amount * v_pack_size;
  else
    v_effective_amount := p_amount;
  end if;

  v_effective_amount := v_effective_amount::numeric(12,3);

  v_supplier_name := nullif(trim(coalesce(p_supplier_name, '')), '');
  v_supplier_invoice_no := nullif(trim(coalesce(p_supplier_invoice_no, '')), '');

  if v_mode = 'IN' and v_supplier_name is not null then
    insert into public.suppliers (
      organization_id,
      name,
      created_by,
      created_at,
      updated_at
    )
    values (
      v_org_id,
      v_supplier_name,
      auth.uid(),
      now(),
      now()
    )
    on conflict (organization_id, name)
    do update set updated_at = now()
    returning id into v_supplier_id;
  end if;

  insert into public.inventory (
    organization_id,
    store_id,
    product_id,
    qty
  )
  values (
    v_org_id,
    p_store_id,
    p_product_id,
    0
  )
  on conflict (store_id, product_id)
  do nothing;

  select coalesce(i.qty, 0)::numeric(12,3)
  into v_current_qty
  from public.inventory i
  where i.store_id = p_store_id
    and i.product_id = p_product_id
  for update;

  if v_mode = 'OUT' then
    v_next_qty := v_current_qty - v_effective_amount;

    if v_next_qty < 0 then
      raise exception 'Insufficient stock. Current=% , Needed=%',
        v_current_qty,
        v_effective_amount;
    end if;
  else
    v_next_qty := v_current_qty + v_effective_amount;
  end if;

  update public.inventory
  set
    qty = v_next_qty,
    organization_id = v_org_id,
    updated_at = now()
  where store_id = p_store_id
    and product_id = p_product_id;

  update public.products
  set
    qty_on_hand = v_next_qty,
    updated_at = now()
  where id = p_product_id
    and organization_id = v_org_id
    and store_id = p_store_id;

  if not found then
    update public.products
    set
      qty_on_hand = v_next_qty,
      updated_at = now()
    where id = p_product_id
      and organization_id = v_org_id
      and store_id is null;
  end if;

  if v_mode = 'IN'
     and p_expiry_date is not null
     and v_effective_amount > 0 then

    insert into public.stock_batches (
      organization_id,
      store_id,
      product_id,
      received_qty,
      remaining_qty,
      expiry_date,
      expiry_alert_days,
      created_by,
      created_at,
      updated_at
    )
    values (
      v_org_id,
      p_store_id,
      p_product_id,
      v_effective_amount::integer,
      v_effective_amount::integer,
      p_expiry_date,
      greatest(coalesce(p_expiry_alert_days, 30), 1),
      auth.uid(),
      now(),
      now()
    )
    returning id into v_batch_id;
  end if;

  if v_effective_amount > 0 then
    insert into public.stock_movements (
      organization_id,
      store_id,
      product_id,
      mode,
      amount,
      note,
      supplier_id,
      supplier_name,
      supplier_invoice_no,
      created_by,
      created_at
    )
    values (
      v_org_id,
      p_store_id,
      p_product_id,
      case when v_mode = 'IN' then 'ADD' else 'REDUCE' end,
      v_effective_amount,
      p_note,
      v_supplier_id,
      v_supplier_name,
      v_supplier_invoice_no,
      auth.uid(),
      now()
    );
  end if;

  return query
  select v_next_qty;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.create_notification_from_stock_movement()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
begin
  insert into public.notifications (
    organization_id,
    store_id,
    source_store_id,
    event_type,
    title,
    body,
    items,
    total_units,
    total_skus,
    actor_user_id,
    actor_name,
    ref_movement_id,
    created_by,
    created_at
  )
  values (
    new.organization_id,
    new.store_id,
    new.store_id,
    case when new.mode = 'ADD' then 'STOCK_IN' else 'STOCK_OUT' end,
    case when new.mode = 'ADD' then 'New Stock Received' else 'Stock Reduced' end,

    jsonb_build_object(
      'message', coalesce(new.note, 'Stock update'),
      'mode', new.mode,
      'amount', new.amount,
      'product_id', new.product_id
    ),

    jsonb_build_array(
      jsonb_build_object(
        'product_id', new.product_id,
        'qty', new.amount,
        'mode', new.mode
      )
    ),
    new.amount,
    1,
    new.created_by,
    null,
    new.id,
    new.created_by,
    now()
  );

  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.create_stock_movement_notification()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_product_name text;
  v_sku text;
  v_unit text;
  v_category text;
  v_title text;
  v_event_type text;
  v_qty numeric;
  v_event_id uuid;
begin
  v_qty := abs(coalesce(new.amount, 0));

  if v_qty <= 0 or new.product_id is null then
    return new;
  end if;

  -- Business-event identity:
  -- inbound batch/partial receive -> shared event_id
  -- ordinary movement          -> movement id
  v_event_id := coalesce(new.event_id, new.id);

  select
    p.name,
    p.sku,
    p.unit,
    p.category
  into
    v_product_name,
    v_sku,
    v_unit,
    v_category
  from public.products p
  where p.id = new.product_id
    and p.organization_id = new.organization_id
  limit 1;

  if upper(coalesce(new.mode, '')) in (
    'ADD',
    'IN',
    'STOCK_IN',
    'RECEIVE',
    'RECEIVED',
    'PURCHASE',
    'INBOUND'
  ) then
    v_title := 'New Stock Received';
    v_event_type := 'STOCK_IN';
  else
    v_title := 'Stock Reduced';
    v_event_type := 'STOCK_OUT';
  end if;

  -- Idempotency remains movement-level.
  if exists (
    select 1
    from public.notifications n
    where n.ref_movement_id = new.id
    limit 1
  ) then
    return new;
  end if;

  insert into public.notifications (
    organization_id,
    store_id,
    source_store_id,
    event_type,
    title,
    body,
    items,
    total_units,
    total_skus,
    actor_user_id,
    actor_name,
    ref_movement_id,
    created_by,
    created_at,
    event_id
  )
  values (
    new.organization_id,
    new.store_id,
    null,
    v_event_type,
    v_title,

    jsonb_build_object(
      'source', 'stock_movements',
      'mode', new.mode,
      'note', new.note,
      'movement_id', new.id,
      'event_id', v_event_id,
      'product_id', new.product_id,
      'product_name',
        coalesce(
          nullif(v_product_name, ''),
          'Unknown Product'
        )
    ),

    jsonb_build_array(
      jsonb_build_object(
        'product_id', new.product_id,
        'product_name',
          coalesce(
            nullif(v_product_name, ''),
            'Unknown Product'
          ),
        'name',
          coalesce(
            nullif(v_product_name, ''),
            'Unknown Product'
          ),
        'sku', v_sku,
        'unit', v_unit,
        'category', v_category,
        'qty', v_qty
      )
    ),

    v_qty,
    1,
    coalesce(new.created_by, auth.uid()),
    null,
    new.id,
    coalesce(new.created_by, auth.uid()),
    coalesce(new.created_at, now()),
    v_event_id
  );

  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.receive_inbound_stock_partial_v1(p_order_id uuid, p_receipts jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
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
begin
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
$function$
;
DO $rollback$ DECLARE r record; BEGIN
 FOR r IN SELECT p.oid::regprocedure ident FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('m3_incoming_catalog_v1','m3_incoming_receipt_v1','m3_submit_incoming_v1','m3_receive_saved_v1','m3_saved_order_context_v1','m3_staff_operational_v1') LOOP
 EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',r.ident); END LOOP;
END $rollback$;
-- Keep private audit/batch evidence and helper dependencies. Never undo receipts,
-- completed sales, inventory movements, current customer prices or balances.
NOTIFY pgrst,'reload schema';
COMMIT;