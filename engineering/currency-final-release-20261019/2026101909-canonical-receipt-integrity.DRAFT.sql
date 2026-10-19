BEGIN;SET LOCAL lock_timeout='2s';SET LOCAL statement_timeout='45s';
DO $$BEGIN IF md5(replace(pg_get_functiondef('public.receive_inbound_stock_partial_v1(uuid,jsonb)'::regprocedure),chr(13),''))<>'4a3b4fc039f1384986e28720a433b046' THEN RAISE EXCEPTION 'RECEIPT_CANONICAL_PREIMAGE_MISMATCH';END IF;END$$;
ALTER TABLE public.inbound_stock_items ALTER COLUMN qty_ordered TYPE numeric;
ALTER TABLE public.inbound_stock_items ALTER COLUMN qty_received TYPE numeric;
ALTER TABLE public.inbound_stock_items ALTER COLUMN damaged_qty TYPE numeric;
ALTER TABLE public.inbound_stock_items ALTER COLUMN missing_qty TYPE numeric;
ALTER TABLE public.inbound_stock_items ALTER COLUMN unit_cost TYPE numeric;
ALTER TABLE public.inbound_stock_items ALTER COLUMN proposed_sell_price TYPE numeric;
ALTER TABLE public.inbound_stock_items ALTER COLUMN total_cost TYPE numeric;
CREATE TABLE backend_core.receipt_cost_snapshots(stock_movement_id uuid PRIMARY KEY REFERENCES public.stock_movements(id),organization_id uuid NOT NULL REFERENCES public.organizations(id),store_id uuid NOT NULL REFERENCES public.stores(id),order_id uuid NOT NULL REFERENCES public.inbound_stock_orders(id),item_id uuid NOT NULL REFERENCES public.inbound_stock_items(id),purchase_currency text,quantity numeric NOT NULL,original_unit_cost numeric,applied_unit_cost numeric,source_verified boolean NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp());ALTER TABLE backend_core.receipt_cost_snapshots ENABLE ROW LEVEL SECURITY;ALTER TABLE backend_core.receipt_cost_snapshots FORCE ROW LEVEL SECURITY;REVOKE ALL ON backend_core.receipt_cost_snapshots FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION public.receive_inbound_stock_partial_v1(p_order_id uuid, p_receipts jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org_id uuid;
  v_movement_id uuid;
  v_purchase_currency text;
  v_account_currency text;
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
  where id = p_order_id FOR UPDATE;
  SELECT currency INTO v_purchase_currency FROM public.inbound_stock_orders WHERE id=p_order_id;
  SELECT currency INTO v_account_currency FROM proforma_backend.accounting_currency WHERE organization_id=v_org_id;
  IF v_account_currency IS NOT NULL AND v_purchase_currency IS DISTINCT FROM v_account_currency THEN RAISE EXCEPTION 'PURCHASE_FX_SETTLEMENT_CONTRACT_REQUIRED';END IF;
  IF EXISTS(SELECT 1 FROM backend_core.receipt_cost_snapshots e WHERE e.order_id=p_order_id AND (e.organization_id<>v_org_id OR e.store_id<>v_store_id OR e.purchase_currency IS DISTINCT FROM v_purchase_currency)) THEN RAISE EXCEPTION 'IMMUTABLE_RECEIPT_SCOPE';END IF;
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
  IF jsonb_typeof(p_receipts) IS DISTINCT FROM 'array' OR jsonb_array_length(p_receipts)=0 OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_receipts) j WHERE coalesce(j->>'qty','')!~'^\d{1,18}(\.\d{1,3})?$' OR (j->>'qty')::numeric<=0) OR (SELECT count(*)<>count(DISTINCT j->>'item_id') FROM jsonb_array_elements(p_receipts) j) THEN RAISE EXCEPTION 'INVALID_RECEIPT_QUANTITIES';END IF;
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
      and inbound_order_id = p_order_id FOR UPDATE;
    IF r.unit_cost<0 OR r.proposed_sell_price<0 OR r.unit_cost::text IN ('NaN','Infinity','-Infinity') OR r.proposed_sell_price::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'INVALID_RECEIPT_COST';END IF;
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
      v_receive_event_id) RETURNING id INTO v_movement_id;
    INSERT INTO backend_core.receipt_cost_snapshots(stock_movement_id,organization_id,store_id,order_id,item_id,purchase_currency,quantity,original_unit_cost,applied_unit_cost,source_verified) SELECT v_movement_id,v_org_id,v_store_id,p_order_id,r.id,v_purchase_currency,v_receive_qty,r.unit_cost,p.cost_price,(r.unit_cost IS NOT NULL AND r.unit_cost>0 AND p.cost_price=r.unit_cost AND coalesce(v_account_currency=v_purchase_currency,false)) FROM public.products p WHERE p.id=v_product_id;
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
ALTER TABLE backend_core.native_financial_requests DROP CONSTRAINT native_financial_requests_operation_check;
ALTER TABLE backend_core.native_financial_requests ADD CONSTRAINT native_financial_requests_operation_check CHECK(operation IN ('SALE','REPAYMENT','OPEN_SHIFT','CLOSE_SHIFT','EXPENSE','PURCHASE_RECEIPT'));
CREATE FUNCTION public.receive_purchase_once_v1(p_order_id uuid,p_request_id uuid,p_receipts jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid:=backend_core.active_subject();o uuid;s uuid;body jsonb;prior backend_core.native_financial_requests%ROWTYPE;result jsonb;v_currency text;
BEGIN
 IF actor IS NULL OR p_request_id IS NULL OR jsonb_typeof(p_receipts) IS DISTINCT FROM 'array' OR jsonb_array_length(p_receipts)=0 THEN RAISE EXCEPTION 'INVALID_RECEIPT_REQUEST';END IF;
 SELECT organization_id,store_id INTO o,s FROM public.inbound_stock_orders WHERE id=p_order_id;
 IF o IS NULL OR s IS NULL THEN RAISE EXCEPTION 'INVALID_RECEIPT_ORDER';END IF;PERFORM public.ensure_my_store_access(s);
 IF NOT EXISTS(SELECT 1 FROM public.org_memberships WHERE organization_id=o AND user_id=actor AND coalesce(is_active,true) AND lower(role) IN ('owner','admin')) THEN RAISE EXCEPTION 'RECEIPT_OWNER_ADMIN_REQUIRED';END IF;
 body:=jsonb_build_object('orderId',p_order_id,'receipts',p_receipts);PERFORM pg_advisory_xact_lock(hashtextextended(s::text||':'||p_request_id::text,0));
 SELECT * INTO prior FROM backend_core.native_financial_requests WHERE store_id=s AND request_id=p_request_id;
 IF FOUND THEN IF prior.actor_id<>actor OR prior.organization_id<>o OR prior.operation<>'PURCHASE_RECEIPT' OR prior.payload<>body THEN RAISE EXCEPTION 'NATIVE_REQUEST_CONFLICT';END IF;RETURN prior.result;END IF;
 -- This never creates a settlement permit. Native receipt posting remains
 -- denied by1908 until its authoritative settlement/source binding is approved.
 PERFORM public.receive_inbound_stock_partial_v1(p_order_id,p_receipts);
 SELECT currency INTO v_currency FROM public.inbound_stock_orders WHERE id=p_order_id;
 result:=jsonb_build_object('orderId',p_order_id,'storeId',s,'organizationId',o,'purchaseCurrency',v_currency,'settlementCertified',false);
 INSERT INTO backend_core.native_financial_requests VALUES(s,p_request_id,o,actor,'PURCHASE_RECEIPT',body,result,clock_timestamp());RETURN result;
END $$;
-- Verified legacy payment RPCs have no authoritative account/shift settlement
-- binding. Exclude these native paths server-side, including direct table writes.
CREATE FUNCTION backend_core.unverified_supplier_payment_guard_v1() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE r jsonb;parent_org uuid;row_org uuid;code text;candidate uuid;
BEGIN
 FOR r IN SELECT v FROM (VALUES(CASE WHEN TG_OP<>'INSERT' THEN to_jsonb(OLD) END),(CASE WHEN TG_OP<>'DELETE' THEN to_jsonb(NEW) END)) x(v) WHERE v IS NOT NULL LOOP
  row_org:=nullif(r->>'organization_id','')::uuid;parent_org:=NULL;
  IF TG_TABLE_NAME='inbound_stock_payments' THEN SELECT organization_id INTO parent_org FROM public.inbound_stock_orders WHERE id=(r->>'inbound_order_id')::uuid;
  ELSIF TG_TABLE_NAME='business_debt_payments' THEN SELECT organization_id INTO parent_org FROM public.business_debts WHERE id=(r->>'debt_id')::uuid;
  ELSIF TG_TABLE_NAME='business_loan_payments' THEN SELECT organization_id INTO parent_org FROM public.business_loans WHERE id=(r->>'loan_id')::uuid;END IF;
  FOREACH candidate IN ARRAY ARRAY[row_org,parent_org] LOOP
   SELECT currency INTO code FROM proforma_backend.accounting_currency WHERE organization_id=candidate;
   IF code IS NOT NULL AND code<>'TZS' THEN RAISE EXCEPTION 'NATIVE_SUPPLIER_SETTLEMENT_CONTRACT_REQUIRED';END IF;
  END LOOP;
 END LOOP;
 IF TG_OP='DELETE' THEN RETURN OLD;END IF;RETURN NEW;
END $$;
DO $$DECLARE t text;r record;fn regprocedure:='backend_core.unverified_supplier_payment_guard_v1()'::regprocedure;BEGIN
 FOREACH t IN ARRAY ARRAY['inbound_stock_payments','business_debt_payments','business_loan_payments'] LOOP
 EXECUTE format('CREATE TRIGGER unverified_supplier_payment_guard_v1 BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION backend_core.unverified_supplier_payment_guard_v1()',t);END LOOP;
 REVOKE ALL ON FUNCTION backend_core.unverified_supplier_payment_guard_v1() FROM PUBLIC;
 FOR r IN SELECT DISTINCT pg_get_userbyid(a.grantee) name FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid=fn AND a.grantee<>p.proowner AND a.grantee<>0 LOOP EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %I',fn,r.name);END LOOP;
END $$;
CREATE FUNCTION backend_core.immutable_receipt_cost_v1() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$BEGIN RAISE EXCEPTION 'IMMUTABLE_RECEIPT_COST_EVIDENCE';END $$;
CREATE TRIGGER immutable_receipt_cost_v1 BEFORE UPDATE OR DELETE ON backend_core.receipt_cost_snapshots FOR EACH ROW EXECUTE FUNCTION backend_core.immutable_receipt_cost_v1();
DO $$ DECLARE fn regprocedure;r record;BEGIN
 FOREACH fn IN ARRAY ARRAY['public.receive_purchase_once_v1(uuid,uuid,jsonb)'::regprocedure,'backend_core.immutable_receipt_cost_v1()'::regprocedure] LOOP
 EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC',fn);
 FOR r IN SELECT DISTINCT pg_get_userbyid(a.grantee) AS name FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid=fn AND a.grantee<>p.proowner AND a.grantee<>0 LOOP EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %I',fn,r.name);END LOOP;
 END LOOP;
END $$;

COMMIT;
