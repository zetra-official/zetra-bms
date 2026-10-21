-- UNIFIED PRICE LOCAL DRAFT ONLY. Apply after M2, M3 02,03,04. No hosted execution.
BEGIN;
CREATE TABLE incoming_m3.price_changes(
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, organization_id uuid NOT NULL,
 store_id uuid NOT NULL,product_id uuid NOT NULL,previous_price numeric,new_price numeric,
 actor_id uuid NOT NULL,changed_at timestamptz NOT NULL DEFAULT now(),event_id uuid);
ALTER TABLE incoming_m3.price_changes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON incoming_m3.price_changes FROM PUBLIC,anon,authenticated;
CREATE FUNCTION incoming_m3.guard_price_change() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF OLD.selling_price IS NOT DISTINCT FROM NEW.selling_price THEN RETURN NEW;END IF;
 PERFORM security_m2.require_owner(OLD.organization_id,OLD.store_id);
 IF NEW.organization_id IS DISTINCT FROM OLD.organization_id OR NEW.store_id IS DISTINCT FROM OLD.store_id OR OLD.store_id IS NULL OR EXISTS(SELECT 1 FROM public.inventory i WHERE i.product_id=OLD.id AND i.store_id<>OLD.store_id) THEN RAISE EXCEPTION 'SHARED_PRODUCT_PRICE_POLICY_REQUIRED';END IF;
 IF NEW.selling_price IS NULL OR NEW.selling_price<=0 THEN RAISE EXCEPTION 'INVALID_AMOUNT';END IF;
 INSERT INTO incoming_m3.price_changes(organization_id,store_id,product_id,previous_price,new_price,actor_id,event_id)
 VALUES(OLD.organization_id,OLD.store_id,OLD.id,OLD.selling_price,NEW.selling_price,auth.uid(),incoming_m3.current_event(OLD.organization_id,OLD.store_id));
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION incoming_m3.guard_price_change() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER m3_unified_selling_price BEFORE UPDATE OF selling_price ON public.products FOR EACH ROW EXECUTE FUNCTION incoming_m3.guard_price_change();
CREATE TABLE incoming_m3.saved_receives(request_id uuid PRIMARY KEY,order_id uuid NOT NULL,actor_id uuid NOT NULL,payload_hash text NOT NULL,event_id uuid NOT NULL UNIQUE,created_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE incoming_m3.saved_receives ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON incoming_m3.saved_receives FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.receive_inbound_stock_partial_v1(p_order_id uuid, p_receipts jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
declare
  v_org_id uuid;
  v_m3 boolean := false;
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
BEGIN
PERFORM security_m2.require_store((SELECT o.organization_id FROM public.inbound_stock_orders o WHERE o.id=p_order_id),(SELECT o.store_id FROM public.inbound_stock_orders o WHERE o.id=p_order_id));
IF EXISTS(SELECT 1 FROM public.inbound_stock_orders o WHERE o.id=p_order_id AND (NOT EXISTS(SELECT 1 FROM public.stores s WHERE s.id=o.store_id AND s.organization_id=o.organization_id) OR o.supplier_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.suppliers s WHERE s.id=o.supplier_id AND s.organization_id=o.organization_id) OR EXISTS(SELECT 1 FROM public.inbound_stock_items i LEFT JOIN public.products p ON p.id=i.product_id WHERE i.inbound_order_id=o.id AND (i.organization_id IS DISTINCT FROM o.organization_id OR i.product_id IS NOT NULL AND p.organization_id IS DISTINCT FROM o.organization_id)))) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='INBOUND_EXISTING_SCOPE_MISMATCH'; END IF;
PERFORM pg_advisory_xact_lock(hashtextextended('incoming-store:'||(SELECT store_id FROM public.inbound_stock_orders WHERE id=p_order_id)::text,0));
SELECT EXISTS(SELECT 1 FROM incoming_m3.batches WHERE order_id=p_order_id AND state='SAVED') INTO v_m3;
IF v_m3 THEN
 PERFORM security_m2.require_owner((SELECT organization_id FROM public.inbound_stock_orders WHERE id=p_order_id),(SELECT store_id FROM public.inbound_stock_orders WHERE id=p_order_id));
 SELECT event_id INTO v_receive_event_id FROM incoming_m3.batches WHERE actor_id=auth.uid() AND transaction_id=txid_current() AND state='PROCESSING' AND payload->>'saved_order_id'=p_order_id::text;
 IF v_receive_event_id IS NULL THEN RAISE EXCEPTION 'M3_ORDER_RECEIVING_CONTRACT_REQUIRED';END IF;
END IF;
PERFORM 1 FROM public.inbound_stock_orders o WHERE o.id=p_order_id FOR UPDATE;
IF EXISTS(SELECT 1 FROM public.inbound_stock_orders o WHERE o.id=p_order_id AND (o.deleted_at IS NOT NULL OR o.status='CANCELLED')) THEN RAISE EXCEPTION 'INBOUND_ORDER_CLOSED'; END IF;
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

    IF v_m3 THEN
    v_product_id := r.product_id;
    IF v_product_id IS NULL THEN RAISE EXCEPTION 'REGISTER_PRODUCT_FIRST'; END IF;
    ELSE
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

    END IF;
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

    IF v_m3 THEN
      UPDATE public.products SET qty_on_hand=v_next_qty,selling_price=r.proposed_sell_price,updated_at=now() WHERE id=v_product_id;
    ELSE
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

    END IF;
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
      event_id, unit_cost, total_cost
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
      v_receive_event_id, CASE WHEN v_m3 THEN r.unit_cost ELSE 0 END, CASE WHEN v_m3 THEN r.unit_cost*v_receive_qty ELSE 0 END
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
$function$;


CREATE FUNCTION public.m3_saved_order_context_v1(p_order_id uuid) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE o public.inbound_stock_orders;
BEGIN
 SELECT * INTO o FROM public.inbound_stock_orders WHERE id=p_order_id;
 PERFORM security_m2.require_store(o.organization_id,o.store_id);
 RETURN EXISTS(SELECT 1 FROM incoming_m3.batches WHERE order_id=p_order_id AND state='SAVED');
END $$;
REVOKE ALL ON FUNCTION public.m3_saved_order_context_v1(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.m3_saved_order_context_v1(uuid) TO authenticated;
CREATE FUNCTION public.m3_receive_saved_v1(p_order_id uuid,p_request_id uuid,p_receipts jsonb DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE b incoming_m3.batches;o public.inbound_stock_orders;old incoming_m3.saved_receives;
 h text;ev uuid:=gen_random_uuid();rows jsonb;v_lines jsonb;total numeric;it public.inbound_stock_items;p public.products;l jsonb;x jsonb;expected numeric;q numeric;currency text;
BEGIN
 SELECT * INTO o FROM public.inbound_stock_orders WHERE id=p_order_id;
 PERFORM security_m2.require_owner(o.organization_id,o.store_id);PERFORM security_m2.require_store(o.organization_id,o.store_id);
 IF p_request_id IS NULL THEN RAISE EXCEPTION 'REQUEST_ID_REQUIRED';END IF;
 IF p_receipts IS NOT NULL AND (jsonb_typeof(p_receipts)<>'array' OR jsonb_array_length(p_receipts) NOT BETWEEN 1 AND 500 OR pg_column_size(p_receipts)>2000000) THEN RAISE EXCEPTION 'INVALID_DRAFT';END IF;
 h:=encode(sha256(convert_to(jsonb_build_object('order',p_order_id,'receipts',p_receipts)::text,'UTF8')),'hex');
 PERFORM pg_advisory_xact_lock(hashtextextended('incoming-m3:'||p_request_id::text,0));
 SELECT * INTO old FROM incoming_m3.saved_receives WHERE request_id=p_request_id;
 IF FOUND THEN
  IF old.order_id<>p_order_id OR old.actor_id<>auth.uid() OR old.payload_hash<>h THEN RAISE EXCEPTION 'REQUEST_CONFLICT';END IF;
  RETURN jsonb_build_object('orderId',p_order_id,'eventId',old.event_id,'status','RECEIVED');
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('incoming-store:'||o.store_id::text,0));
 SELECT * INTO o FROM public.inbound_stock_orders WHERE id=p_order_id FOR UPDATE;
 SELECT * INTO b FROM incoming_m3.batches WHERE order_id=p_order_id AND state='SAVED';
 IF b.request_id IS NULL THEN RAISE EXCEPTION 'M3_SAVED_ORDER_REQUIRED';END IF;
 BEGIN SELECT public.get_org_accounting_currency_v1(o.organization_id)->>'currency' INTO currency;
 EXCEPTION WHEN OTHERS THEN IF SQLERRM='ACCOUNTING_CURRENCY_UNCONFIRMED' THEN currency:='TZS';ELSE RAISE EXCEPTION 'ACCOUNTING_AUTHORITY_UNAVAILABLE';END IF;END;
 IF currency IS DISTINCT FROM 'TZS' OR b.payload->>'currency' IS DISTINCT FROM 'TZS' THEN RAISE EXCEPTION 'NATIVE_FINANCIAL_POSTING_NOT_CERTIFIED';END IF;
 IF o.deleted_at IS NOT NULL OR o.status IN ('CANCELLED','RECEIVED') THEN RAISE EXCEPTION 'INBOUND_ORDER_CLOSED';END IF;
 IF EXISTS(SELECT 1 FROM public.suppliers s WHERE s.id=o.supplier_id AND s.organization_id=o.organization_id AND s.is_active IS TRUE) IS NOT TRUE THEN RAISE EXCEPTION 'SUPPLIER_REQUIRED';END IF;
 rows:=p_receipts;
 IF rows IS NULL THEN SELECT jsonb_agg(jsonb_build_object('item_id',id,'qty',(qty_ordered-qty_received)::text) ORDER BY id) INTO rows FROM public.inbound_stock_items WHERE inbound_order_id=p_order_id AND qty_ordered>qty_received;END IF;
 IF rows IS NULL OR EXISTS(SELECT 1 FROM jsonb_array_elements(rows) a GROUP BY a->>'item_id' HAVING count(*)>1) THEN RAISE EXCEPTION 'DUPLICATE_PRODUCT';END IF;
 IF (SELECT sum((value->>'qty')::numeric) FROM jsonb_array_elements(rows))>2147483647 THEN RAISE EXCEPTION 'INVALID_AMOUNT';END IF;
 -- Lock inventory and canonical products in the same deterministic order as Receive Now.
 FOR x IN SELECT value FROM jsonb_array_elements(rows) ORDER BY value->>'item_id' LOOP
  SELECT * INTO it FROM public.inbound_stock_items WHERE id=(x->>'item_id')::uuid AND inbound_order_id=p_order_id FOR UPDATE;
  IF it.id IS NULL OR it.organization_id<>o.organization_id OR it.product_id IS NULL THEN RAISE EXCEPTION 'PRODUCT_SCOPE_REQUIRED';END IF;
  SELECT value INTO l FROM jsonb_array_elements(b.payload->'lines') WHERE value->>'product_id'=it.product_id::text;
  IF l IS NULL OR it.unit_cost IS DISTINCT FROM (l->>'unit_cost')::numeric OR it.proposed_sell_price IS DISTINCT FROM (l->>'selling_price')::numeric OR it.qty_ordered IS DISTINCT FROM (l->>'quantity')::numeric OR it.product_name IS DISTINCT FROM l->>'product_name' OR coalesce(it.sku,'') IS DISTINCT FROM coalesce(l->>'sku','') OR coalesce(it.barcode,'') IS DISTINCT FROM coalesce(l->>'barcode','') THEN RAISE EXCEPTION 'SAVED_ORDER_CHANGED';END IF;
  q:=(x->>'qty')::numeric;
  IF q IS NULL OR q<=0 OR q<>trunc(q) OR q>it.qty_ordered-it.qty_received THEN RAISE EXCEPTION 'INVALID_AMOUNT';END IF;
  INSERT INTO public.inventory(organization_id,store_id,product_id,qty) VALUES(o.organization_id,o.store_id,it.product_id,0) ON CONFLICT(store_id,product_id) DO NOTHING;
  PERFORM 1 FROM public.inventory WHERE store_id=o.store_id AND product_id=it.product_id FOR UPDATE;
  SELECT * INTO p FROM public.products WHERE id=it.product_id AND organization_id=o.organization_id AND store_id=o.store_id FOR UPDATE;
  IF p.id IS NULL THEN RAISE EXCEPTION 'PRODUCT_SCOPE_REQUIRED';END IF;
  expected:=nullif(l->>'expected_selling_price','')::numeric;
  -- Once this order has actually applied its intended price, subsequent partials
  -- may retain it; an unrelated newer price must never be overwritten.
  IF it.qty_received>0 AND EXISTS(SELECT 1 FROM incoming_m3.price_changes pc JOIN incoming_m3.saved_receives sr ON sr.event_id=pc.event_id WHERE sr.order_id=p_order_id AND pc.product_id=p.id AND pc.new_price=it.proposed_sell_price) THEN expected:=it.proposed_sell_price;END IF;
  IF expected IS NULL THEN RAISE EXCEPTION 'PRICE_CONFIRMATION_REQUIRED';END IF;
  IF p.selling_price IS DISTINCT FROM expected THEN RAISE EXCEPTION 'PRICE_CONFLICT';END IF;
  PERFORM incoming_m3.validate_product_line(p,l);
  IF (SELECT qty FROM public.inventory WHERE store_id=o.store_id AND product_id=p.id)+q>999999999 THEN RAISE EXCEPTION 'INVALID_AMOUNT';END IF;
 END LOOP;
 -- A transaction-bound batch context reuses existing movement notification suppression.
 INSERT INTO incoming_m3.batches(request_id,organization_id,store_id,actor_id,payload_hash,payload,state,transaction_id,event_id)
 VALUES(p_request_id,o.organization_id,o.store_id,auth.uid(),h,jsonb_set(jsonb_set(b.payload,'{mode}','"RECEIVE_NOW"'),'{saved_order_id}',to_jsonb(p_order_id::text)),'PROCESSING',txid_current(),ev);
 PERFORM public.receive_inbound_stock_partial_v1(p_order_id,rows);
 SELECT jsonb_agg(jsonb_build_object('product_id',i.product_id,'product_name',i.product_name,'sku',i.sku,'barcode',i.barcode,'unit',CASE WHEN pr.is_precision_product THEN pr.precision_base_unit ELSE i.unit END,'package_unit',i.unit,'pack_size',pr.precision_pack_size::text,'stock_mode','UNIT','entered_quantity',rr.value->>'qty','qty',rr.value->>'qty','unit_cost',i.unit_cost::text,'total_cost',(i.unit_cost*(rr.value->>'qty')::numeric)::text,'selling_price',i.proposed_sell_price::text,'previous_selling_price',coalesce((SELECT pc.previous_price::text FROM incoming_m3.price_changes pc WHERE pc.product_id=i.product_id AND pc.event_id=ev LIMIT 1),i.proposed_sell_price::text)) ORDER BY i.id),sum(i.unit_cost*(rr.value->>'qty')::numeric)
 INTO v_lines,total FROM jsonb_array_elements(rows) rr(value) JOIN public.inbound_stock_items i ON i.id=(rr.value->>'item_id')::uuid JOIN public.products pr ON pr.id=i.product_id;
 UPDATE incoming_m3.batches SET state='RECEIVED',receipt=jsonb_build_object('event_id',ev,'receipt_reference','RCV-'||upper(replace(p_request_id::text,'-','')),'organization_id',o.organization_id,'organization_name',(SELECT name FROM public.organizations WHERE id=o.organization_id),'store_id',o.store_id,'store_name',(SELECT name FROM public.stores WHERE id=o.store_id),'supplier_id',o.supplier_id,'supplier_name',o.supplier_name,'operator_id',auth.uid(),'operator',auth.uid()::text,'created_at',now(),'currency','TZS','line_count',jsonb_array_length(v_lines),'lines',v_lines,'total_cost',total::text,'purpose','SAVED_ORDER_RECEIVING') WHERE request_id=p_request_id;
 INSERT INTO public.notifications(organization_id,store_id,event_id,event_type,title,body,items,total_units,total_skus,actor_user_id,actor_name,created_by)
 VALUES(o.organization_id,o.store_id,ev,'STOCK_IN','RCV-'||p_request_id::text,jsonb_build_object('source','incoming_m3','event_id',ev),(SELECT jsonb_agg(value-'unit_cost'-'total_cost') FROM jsonb_array_elements(v_lines)),(SELECT sum((value->>'qty')::numeric)::integer FROM jsonb_array_elements(v_lines)),jsonb_array_length(v_lines),auth.uid(),auth.uid()::text,auth.uid());
 INSERT INTO incoming_m3.saved_receives VALUES(p_request_id,p_order_id,auth.uid(),h,ev,now());
 RETURN jsonb_build_object('orderId',p_order_id,'eventId',ev,'status','RECEIVED');
END $$;
REVOKE ALL ON FUNCTION public.m3_receive_saved_v1(uuid,uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.m3_receive_saved_v1(uuid,uuid,jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.m3_submit_incoming_v1(p_org_id uuid,p_store_id uuid,p_request_id uuid,p_payload jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE b incoming_m3.batches;h text;v_mode text;v_supplier public.suppliers;v_order uuid;v_item uuid;line jsonb;v_product public.products;v_count integer;v_qty numeric;v_cost numeric;v_sell numeric;v_event uuid;v_code text;v_lines jsonb;v_total numeric;v_currency text;v_operator text;v_notifications integer;
BEGIN
 PERFORM security_m2.require_owner(p_org_id,p_store_id);
 IF p_request_id IS NULL OR p_payload IS NULL OR pg_column_size(p_payload)>2000000 OR jsonb_typeof(p_payload)<>'object' THEN RAISE EXCEPTION 'INVALID_DRAFT'; END IF;
 h:=encode(sha256(convert_to(p_payload::text,'UTF8')),'hex');PERFORM pg_advisory_xact_lock(hashtextextended('incoming-m3:'||p_request_id::text,0));
 SELECT * INTO b FROM incoming_m3.batches WHERE request_id=p_request_id FOR UPDATE;
 IF FOUND THEN
  IF b.organization_id<>p_org_id OR b.store_id<>p_store_id OR b.actor_id<>auth.uid() OR b.payload_hash<>h THEN RAISE EXCEPTION 'REQUEST_CONFLICT';END IF;
  IF b.state NOT IN ('SAVED','RECEIVED') THEN RAISE EXCEPTION 'SUBMISSION_UNCERTAIN';END IF;
  RETURN jsonb_build_object('orderId',b.order_id,'eventId',b.event_id,'status',b.state);
 END IF;
 PERFORM security_m2.require_store(p_org_id,p_store_id);
 IF NOT EXISTS(SELECT 1 FROM public.stores s WHERE s.id=p_store_id AND s.organization_id=p_org_id AND s.is_active IS TRUE AND s.store_type IN ('STANDARD','PRECISION_RETAIL')) THEN RAISE EXCEPTION 'STORE_TYPE_NOT_CERTIFIED'; END IF;
 -- Currency is verified from canonical authority. Unconfirmed legacy organizations remain TZS; authority failures do not become a fabricated confirmation.
 BEGIN
  SELECT public.get_org_accounting_currency_v1(p_org_id)->>'currency' INTO v_currency;
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM='ACCOUNTING_CURRENCY_UNCONFIRMED' THEN v_currency:='TZS';ELSE RAISE EXCEPTION 'ACCOUNTING_AUTHORITY_UNAVAILABLE';END IF;
 END;
 IF v_currency IS DISTINCT FROM 'TZS' OR p_payload->>'currency' IS DISTINCT FROM 'TZS' THEN RAISE EXCEPTION 'NATIVE_FINANCIAL_POSTING_NOT_CERTIFIED'; END IF;
 v_mode:=p_payload->>'mode';IF v_mode NOT IN ('SAVE_ORDER','RECEIVE_NOW') OR v_mode IS NULL THEN RAISE EXCEPTION 'INVALID_DRAFT';END IF;
 IF p_payload ?| ARRAY['payment','payments','paid_amount','payable','settlement','funding','payment_channel'] THEN RAISE EXCEPTION 'FINANCIAL_INTEGRATION_BLOCKED';END IF;
 IF v_mode='RECEIVE_NOW' AND (p_payload->>'purpose' IS DISTINCT FROM 'EXISTING_NON_CREDIT_STOCK' OR p_payload->>'non_credit_confirmed' IS DISTINCT FROM 'true') THEN RAISE EXCEPTION 'NON_CREDIT_REQUIRED';END IF;
 IF jsonb_typeof(p_payload->'lines') IS DISTINCT FROM 'array' OR jsonb_array_length(p_payload->'lines') NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'LINE_LIMIT';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('incoming-store:'||p_store_id::text,0));
 IF nullif(p_payload->>'supplier_id','') IS NOT NULL THEN
  SELECT * INTO v_supplier FROM public.suppliers s WHERE s.id=(p_payload->>'supplier_id')::uuid AND s.organization_id=p_org_id AND s.is_active IS TRUE FOR SHARE;
  IF v_supplier.id IS NULL THEN RAISE EXCEPTION 'SUPPLIER_REQUIRED';END IF;
  IF (SELECT count(*) FROM public.suppliers s WHERE s.organization_id=p_org_id AND s.is_active IS TRUE AND lower(btrim(s.name))=lower(btrim(v_supplier.name)))<>1 THEN RAISE EXCEPTION 'AMBIGUOUS_SUPPLIER';END IF;
 ELSIF v_mode='SAVE_ORDER' THEN RAISE EXCEPTION 'SUPPLIER_REQUIRED';END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_payload->'lines') a GROUP BY a->>'product_id' HAVING nullif(a->>'product_id','') IS NOT NULL AND count(*)>1) THEN RAISE EXCEPTION 'DUPLICATE_PRODUCT';END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_payload->'lines') a CROSS JOIN LATERAL(VALUES('sku:'||nullif(btrim(a->>'sku'),'')),('barcode:'||nullif(btrim(a->>'barcode'),''))) k(v) WHERE k.v IS NOT NULL GROUP BY k.v HAVING count(*)>1) THEN RAISE EXCEPTION 'DUPLICATE_PRODUCT';END IF;
 -- Validate every line before creating canonical records. New immediate receipts must reference registered product identities.
 FOR line IN SELECT * FROM jsonb_array_elements(p_payload->'lines') LOOP
  IF nullif(btrim(line->>'product_name'),'') IS NULL OR length(line->>'product_name')>500 OR nullif(btrim(line->>'unit'),'') IS NULL THEN RAISE EXCEPTION 'PRODUCT_REQUIRED';END IF;
  IF coalesce(line->>'quantity','')!~'^[1-9][0-9]{0,8}$' THEN RAISE EXCEPTION 'WHOLE_QUANTITY_REQUIRED';END IF;
  IF coalesce(line->>'unit_cost','')!~'^(0|[1-9][0-9]{0,11})(\.[0-9]{1,6})?$' OR coalesce(line->>'selling_price','')!~'^(0|[1-9][0-9]{0,11})(\.[0-9]{1,6})?$' THEN RAISE EXCEPTION 'INVALID_AMOUNT';END IF;
  IF v_mode='SAVE_ORDER' AND (scale((line->>'unit_cost')::numeric)>2 OR scale((line->>'selling_price')::numeric)>2) THEN RAISE EXCEPTION 'CANONICAL_PRECISION_REQUIRED';END IF;
  v_qty:=(line->>'quantity')::numeric;v_cost:=(line->>'unit_cost')::numeric;v_sell:=(line->>'selling_price')::numeric;IF v_cost<=0 THEN RAISE EXCEPTION 'INVALID_AMOUNT';END IF;
  v_product:=NULL;
  IF nullif(line->>'product_id','') IS NOT NULL THEN
   SELECT * INTO v_product FROM public.products p WHERE p.id=(line->>'product_id')::uuid AND p.organization_id=p_org_id AND p.store_id=p_store_id;
   IF v_product.id IS NULL THEN RAISE EXCEPTION 'PRODUCT_SCOPE_REQUIRED';END IF;
 IF v_mode='SAVE_ORDER' THEN PERFORM 1 FROM public.products WHERE id=v_product.id FOR SHARE;IF nullif(line->>'expected_selling_price','') IS NULL OR (line->>'expected_selling_price')::numeric IS DISTINCT FROM (SELECT selling_price FROM public.products WHERE id=v_product.id) THEN RAISE EXCEPTION 'PRICE_CONFLICT';END IF;END IF;
   IF v_mode='RECEIVE_NOW' AND ((line->>'unit_cost')::numeric IS DISTINCT FROM v_product.cost_price OR (line->>'selling_price')::numeric IS DISTINCT FROM v_product.selling_price) THEN PERFORM incoming_m3.validate_product_line(v_product,line);END IF;
   IF v_mode='RECEIVE_NOW' THEN PERFORM incoming_m3.validate_product_line(v_product,line);END IF;
   IF coalesce(nullif(v_product.unit,''),'pcs') IS DISTINCT FROM line->>'unit' THEN RAISE EXCEPTION 'PRODUCT_UNIT_CHANGED';END IF;
   IF coalesce(v_product.sku,'')<>coalesce(line->>'sku','') OR coalesce(v_product.barcode,'')<>coalesce(line->>'barcode','') OR v_product.name<>line->>'product_name' THEN RAISE EXCEPTION 'PRODUCT_IDENTITY_CHANGED';END IF;
  ELSIF v_mode='RECEIVE_NOW' THEN RAISE EXCEPTION 'REGISTER_PRODUCT_FIRST';
  ELSIF nullif(btrim(line->>'sku'),'') IS NULL AND nullif(btrim(line->>'barcode'),'') IS NULL THEN RAISE EXCEPTION 'PRODUCT_REQUIRED';
  END IF;
 END LOOP;
 INSERT INTO incoming_m3.batches(request_id,organization_id,store_id,actor_id,payload_hash,payload,state,transaction_id,event_id) VALUES(p_request_id,p_org_id,p_store_id,auth.uid(),h,p_payload,'PROCESSING',txid_current(),CASE WHEN v_mode='RECEIVE_NOW' THEN gen_random_uuid() ELSE NULL END) RETURNING event_id INTO v_event;
 IF v_mode='SAVE_ORDER' THEN
  v_order:=public.create_inbound_stock_order_v1(p_org_id,p_store_id,v_supplier.name,p_payload->>'source_country',p_payload->>'source_city',p_payload->>'destination_name',p_payload->>'invoice_number',p_payload->>'tracking_number',nullif(p_payload->>'expected_arrival_date','')::date,p_payload->>'note');
  IF (SELECT supplier_id FROM public.inbound_stock_orders WHERE id=v_order)<>v_supplier.id THEN RAISE EXCEPTION 'SUPPLIER_IDENTITY_CHANGED';END IF;
  FOR line IN SELECT * FROM jsonb_array_elements(p_payload->'lines') LOOP
   v_item:=public.add_inbound_stock_item_v1(v_order,line->>'product_name',line->>'sku',line->>'unit',line->>'category',line->>'barcode',(line->>'quantity')::numeric,(line->>'unit_cost')::numeric,(line->>'selling_price')::numeric,line->>'note');
   IF nullif(line->>'product_id','') IS NOT NULL THEN UPDATE public.inbound_stock_items SET product_id=(line->>'product_id')::uuid,is_new_product=false WHERE id=v_item;END IF;
  END LOOP;
  UPDATE incoming_m3.batches SET state='SAVED',order_id=v_order WHERE request_id=p_request_id;
  RETURN jsonb_build_object('orderId',v_order,'eventId',NULL,'status','SAVED');
 END IF;
 -- Acquire inventory then product locks, matching the canonical adjustment engine.
 FOR line IN SELECT v FROM jsonb_array_elements(p_payload->'lines') v ORDER BY v->>'product_id' LOOP
  INSERT INTO public.inventory(organization_id,store_id,product_id,qty) VALUES(p_org_id,p_store_id,(line->>'product_id')::uuid,0) ON CONFLICT(store_id,product_id) DO NOTHING;
  PERFORM 1 FROM public.inventory WHERE store_id=p_store_id AND product_id=(line->>'product_id')::uuid FOR UPDATE;
  SELECT * INTO v_product FROM public.products p WHERE p.id=(line->>'product_id')::uuid AND p.organization_id=p_org_id AND p.store_id=p_store_id FOR UPDATE;
  IF v_product.id IS NULL THEN RAISE EXCEPTION 'PRODUCT_SCOPE_REQUIRED';END IF;
  PERFORM incoming_m3.validate_product_line(v_product,line);
  IF EXISTS(SELECT 1 FROM public.inventory i WHERE i.store_id=p_store_id AND i.product_id=v_product.id AND (i.qty<>trunc(i.qty) OR i.qty+(line->>'quantity')::numeric>999999999)) THEN RAISE EXCEPTION 'WHOLE_QUANTITY_REQUIRED';END IF;
 END LOOP;
 IF (SELECT sum((v->>'quantity')::numeric) FROM jsonb_array_elements(p_payload->'lines') v)>2147483647 THEN RAISE EXCEPTION 'WHOLE_QUANTITY_REQUIRED';END IF;
 FOR line IN SELECT * FROM jsonb_array_elements(p_payload->'lines') LOOP
  PERFORM public.adjust_stock(p_store_id,(line->>'product_id')::uuid,(line->>'quantity')::numeric,'ADD','M3 non-credit receipt '||p_request_id::text,NULL::date,v_supplier.name,p_payload->>'invoice_number',30,'UNIT');
  UPDATE public.products SET selling_price=(line->>'selling_price')::numeric,updated_at=now() WHERE id=(line->>'product_id')::uuid AND organization_id=p_org_id AND store_id=p_store_id AND selling_price IS DISTINCT FROM (line->>'selling_price')::numeric;
 END LOOP;
 SELECT count(*) INTO v_count FROM public.stock_movements m WHERE m.event_id=v_event AND m.organization_id=p_org_id AND m.store_id=p_store_id AND m.supplier_id IS NOT DISTINCT FROM v_supplier.id;
 IF v_count<>jsonb_array_length(p_payload->'lines') THEN RAISE EXCEPTION 'RECEIVING_EVENT_MISMATCH';END IF;
 SELECT jsonb_agg(jsonb_build_object('product_id',v->>'product_id','product_name',v->>'product_name','sku',v->>'sku','barcode',v->>'barcode','unit',CASE WHEN (v->>'is_precision')::boolean THEN v->>'base_unit' ELSE v->>'unit' END,'package_unit',v->>'unit','pack_size',v->>'pack_size','entered_quantity',coalesce(v->>'entered_quantity',v->>'quantity'),'stock_mode',coalesce(v->>'stock_mode','UNIT'),'previous_selling_price',coalesce(v->>'expected_selling_price',v->>'selling_price'),'qty',v->>'quantity','selling_price',v->>'selling_price','unit_cost',v->>'unit_cost','total_cost',((v->>'quantity')::numeric*(v->>'unit_cost')::numeric)::text,'note',v->>'note') ORDER BY ord),sum((v->>'quantity')::numeric*(v->>'unit_cost')::numeric) INTO v_lines,v_total FROM jsonb_array_elements(p_payload->'lines') WITH ORDINALITY z(v,ord);
 v_code:='RCV-'||upper(replace(p_request_id::text,'-',''));v_operator:=auth.uid()::text;
 UPDATE incoming_m3.batches SET state='RECEIVED',receipt=jsonb_build_object('event_id',v_event,'receipt_reference',v_code,'organization_id',p_org_id,'organization_name',(SELECT name FROM public.organizations WHERE id=p_org_id),'store_id',p_store_id,'store_name',(SELECT name FROM public.stores WHERE id=p_store_id),'supplier_id',v_supplier.id,'supplier_name',v_supplier.name,'operator_id',auth.uid(),'operator',v_operator,'created_at',now(),'currency','TZS','line_count',jsonb_array_length(v_lines),'lines',v_lines,'total_cost',v_total::text,'purpose','EXISTING_NON_CREDIT_STOCK','note',p_payload->>'note') WHERE request_id=p_request_id;
 INSERT INTO public.notifications(organization_id,store_id,event_id,event_type,title,body,items,total_units,total_skus,actor_user_id,actor_name,created_by)
 VALUES(p_org_id,p_store_id,v_event,'STOCK_IN',v_code,jsonb_build_object('source','incoming_m3','event_id',v_event),
 (SELECT jsonb_agg(jsonb_build_object('product_id',x->'product_id','product_name',x->'product_name','sku',x->'sku','unit',x->'unit','qty',x->'qty')) FROM jsonb_array_elements(v_lines) x),
 (SELECT sum((x->>'qty')::numeric)::integer FROM jsonb_array_elements(v_lines) x),jsonb_array_length(v_lines),auth.uid(),v_operator,auth.uid());
 RETURN jsonb_build_object('orderId',NULL,'eventId',v_event,'status','RECEIVED');
END $$;
DROP FUNCTION IF EXISTS incoming_m3.receive_saved_canonical(uuid,jsonb,uuid);
NOTIFY pgrst,'reload schema';
COMMIT;
