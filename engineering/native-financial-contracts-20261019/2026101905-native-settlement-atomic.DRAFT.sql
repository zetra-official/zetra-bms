BEGIN;SET LOCAL lock_timeout='2s';SET LOCAL statement_timeout='45s';
DO $$BEGIN IF md5(replace(pg_get_functiondef('public.create_sale_with_payment_v4(uuid,jsonb,text,text,numeric,text,text,uuid,text,text,text,numeric,text,text,uuid)'::regprocedure),chr(13),''))<> '09c0ee2a16b55a3fcedbe85563d1b897' THEN RAISE EXCEPTION 'CANONICAL_PREIMAGE_MISMATCH';END IF;IF md5(replace(pg_get_functiondef('public.record_credit_sale_v2(uuid,uuid,numeric,text,text)'::regprocedure),chr(13),''))<> '1f3bfeed0ccb99dc0428ae77c7a7606e' THEN RAISE EXCEPTION 'CANONICAL_PREIMAGE_MISMATCH';END IF; END$$;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='sales' AND column_name='currency_context') OR to_regprocedure('backend_core.capture_financial_currency_v1()') IS NULL THEN RAISE EXCEPTION 'DRAFT_1904_DEPENDENCY_REQUIRED';END IF;
END $$;
CREATE TABLE backend_core.native_financial_rollout(organization_id uuid PRIMARY KEY REFERENCES public.organizations(id),currency text NOT NULL CHECK(currency IN ('TZS','USD','KES','UGX','EUR','AED','JPY','KWD')),revision integer NOT NULL,enabled boolean NOT NULL DEFAULT false,approval_reference text NOT NULL);
CREATE TABLE backend_core.native_financial_intents(backend_pid integer NOT NULL,transaction_id bigint NOT NULL,actor_id uuid NOT NULL,organization_id uuid NOT NULL,store_id uuid NOT NULL,request_id uuid NOT NULL,PRIMARY KEY(backend_pid,transaction_id));
CREATE TABLE backend_core.native_financial_requests(store_id uuid NOT NULL REFERENCES public.stores(id),request_id uuid NOT NULL,organization_id uuid NOT NULL REFERENCES public.organizations(id),actor_id uuid NOT NULL,operation text NOT NULL CHECK(operation IN ('SALE','REPAYMENT','OPEN_SHIFT','CLOSE_SHIFT')),payload jsonb NOT NULL,result jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(store_id,request_id));
ALTER TABLE backend_core.native_financial_rollout ENABLE ROW LEVEL SECURITY;ALTER TABLE backend_core.native_financial_rollout FORCE ROW LEVEL SECURITY;
ALTER TABLE backend_core.native_financial_intents ENABLE ROW LEVEL SECURITY;ALTER TABLE backend_core.native_financial_intents FORCE ROW LEVEL SECURITY;
ALTER TABLE backend_core.native_financial_requests ENABLE ROW LEVEL SECURITY;ALTER TABLE backend_core.native_financial_requests FORCE ROW LEVEL SECURITY;
REVOKE ALL ON backend_core.native_financial_rollout,backend_core.native_financial_intents,backend_core.native_financial_requests FROM PUBLIC,anon,authenticated,service_role;
ALTER TABLE public.sales ADD COLUMN settlement_rounding numeric;
ALTER TABLE public.products ADD COLUMN currency_context jsonb;
ALTER TABLE public.credit_accounts_v2 ADD COLUMN currency_context jsonb;
ALTER TABLE public.credit_ledger_v2 ADD COLUMN currency_context jsonb;
ALTER TABLE public.cashier_shifts ADD COLUMN currency_context jsonb;
-- Numeric widening preserves original values; lock/rewrite impact must be
-- reviewed before any separately approved live execution. No backfill.
DO $$ BEGIN IF md5(pg_get_viewdef('public.credit_payments_v2'::regclass,true))<>'77e9d6116810a1dc2d57d04fcbe6648e' OR (SELECT relacl::text FROM pg_class WHERE oid='public.credit_payments_v2'::regclass)<>'{postgres=arwdDxtm/postgres}' THEN RAISE EXCEPTION 'CREDIT_VIEW_PREIMAGE_MISMATCH';END IF;END $$;DROP VIEW public.credit_payments_v2;
DO $$ BEGIN IF md5(pg_get_viewdef('public.credit_sales_v2'::regclass,true))<>'2d52e9768c51b7c486c85810743b92c8' OR (SELECT relacl::text FROM pg_class WHERE oid='public.credit_sales_v2'::regclass)<>'{postgres=arwdDxtm/postgres}' THEN RAISE EXCEPTION 'CREDIT_VIEW_PREIMAGE_MISMATCH';END IF;END $$;DROP VIEW public.credit_sales_v2;
ALTER TABLE public.credit_ledger_v2 ALTER COLUMN delta TYPE numeric;
CREATE VIEW public.credit_payments_v2 AS  SELECT store_id,
    credit_account_id,
    abs(delta::numeric) AS amount,
    created_at
   FROM public.credit_ledger_v2 cl
  WHERE delta IS NOT NULL AND delta < 0::numeric;;ALTER VIEW public.credit_payments_v2 OWNER TO postgres;REVOKE ALL ON public.credit_payments_v2 FROM PUBLIC,anon,authenticated,service_role;GRANT ALL ON public.credit_payments_v2 TO postgres;
CREATE VIEW public.credit_sales_v2 AS  SELECT store_id,
    credit_account_id,
    delta::numeric AS total_amount,
    created_at
   FROM public.credit_ledger_v2 cl
  WHERE delta IS NOT NULL AND delta > 0::numeric;;ALTER VIEW public.credit_sales_v2 OWNER TO postgres;REVOKE ALL ON public.credit_sales_v2 FROM PUBLIC,anon,authenticated,service_role;GRANT ALL ON public.credit_sales_v2 TO postgres;
ALTER TABLE public.products ALTER COLUMN price TYPE numeric;
ALTER TABLE public.products ALTER COLUMN cost TYPE numeric;
CREATE FUNCTION backend_core.native_financial_policy_v1(s uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE o uuid;a proforma_backend.accounting_currency%ROWTYPE;digits integer;actor uuid:=backend_core.active_subject();
BEGIN
 IF actor IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED';END IF;
 PERFORM public.ensure_my_store_access(s);
 SELECT organization_id INTO o FROM public.stores WHERE id=s;IF o IS NULL THEN RAISE EXCEPTION 'CURRENCY_STORE_SCOPE_MISMATCH';END IF;
 SELECT * INTO a FROM proforma_backend.accounting_currency WHERE organization_id=o;
 IF NOT FOUND THEN RETURN jsonb_build_object('native',false,'currency',NULL,'scale',2,'discountScale',0);END IF;
 SELECT minor_units INTO digits FROM proforma_backend.currency_catalog WHERE code=a.currency;
 IF digits IS NULL THEN RAISE EXCEPTION 'CURRENCY_METADATA_UNAVAILABLE';END IF;
 IF a.currency<>'TZS' THEN
  IF NOT EXISTS(SELECT 1 FROM backend_core.native_financial_rollout r JOIN backend_core.native_financial_intents i ON i.organization_id=r.organization_id WHERE r.organization_id=o AND r.currency=a.currency AND r.revision=a.revision AND r.enabled AND i.backend_pid=pg_backend_pid() AND i.transaction_id=txid_current() AND i.actor_id=actor AND i.store_id=s) THEN RAISE EXCEPTION 'NATIVE_FINANCIAL_POSTING_NOT_CERTIFIED';END IF;
 END IF;
 RETURN jsonb_build_object('native',a.currency<>'TZS','currency',a.currency,'scale',digits,'discountScale',CASE WHEN a.currency='TZS' THEN 0 ELSE digits END);
END $$;
CREATE FUNCTION backend_core.bind_native_currency_v1() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE o uuid;s uuid;ctx jsonb;a proforma_backend.accounting_currency%ROWTYPE;
BEGIN
 IF TG_TABLE_SCHEMA<>'public' OR TG_TABLE_NAME NOT IN ('products','credit_accounts_v2','credit_ledger_v2','cashier_shifts') THEN RAISE EXCEPTION 'INVALID_CURRENCY_TRIGGER_TARGET';END IF;
 IF TG_OP='UPDATE' THEN
  IF NEW.currency_context IS DISTINCT FROM OLD.currency_context THEN RAISE EXCEPTION 'IMMUTABLE_FINANCIAL_CURRENCY_CONTEXT';END IF;
  IF TG_TABLE_NAME='cashier_shifts' AND NEW.currency_context->>'currency'<>'TZS' THEN PERFORM backend_core.native_financial_policy_v1(NEW.store_id);END IF;RETURN NEW;
 END IF;
 IF TG_TABLE_NAME='products' THEN o:=NEW.organization_id;
 ELSE s:=NEW.store_id;SELECT organization_id INTO o FROM public.stores WHERE id=s;END IF;
 IF o IS NULL THEN RAISE EXCEPTION 'CURRENCY_TENANT_MISMATCH';END IF;
 SELECT * INTO a FROM proforma_backend.accounting_currency WHERE organization_id=o;
 IF TG_TABLE_NAME='cashier_shifts' AND a.currency<>'TZS' THEN PERFORM backend_core.native_financial_policy_v1(s);END IF;
 IF TG_TABLE_NAME='credit_ledger_v2' THEN
  PERFORM backend_core.native_financial_policy_v1(s);
  SELECT currency_context INTO ctx FROM public.credit_accounts_v2 WHERE id=NEW.credit_account_id AND store_id=s;
  IF a.currency<>'TZS' AND (ctx IS NULL OR ctx->>'currency'<>a.currency OR (ctx->>'contextRevision')::integer<>a.revision) THEN RAISE EXCEPTION 'CREDIT_CURRENCY_CONTEXT_REQUIRED';END IF;
  NEW.currency_context:=ctx;
 ELSIF a.organization_id IS NOT NULL THEN
  NEW.currency_context:=jsonb_build_object('version',1,'organizationId',o,'currency',a.currency,'accountingCurrency',a.currency,'contextRevision',a.revision,'source','TRANSACTION_RECORD','exchangeRate','1','rateSource','SAME_CURRENCY_IDENTITY','displayRateUsed',false);
 ELSE NEW.currency_context:=NULL;END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER native_currency_context_v1 BEFORE INSERT OR UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION backend_core.bind_native_currency_v1();
CREATE TRIGGER native_currency_context_v1 BEFORE INSERT OR UPDATE ON public.credit_accounts_v2 FOR EACH ROW EXECUTE FUNCTION backend_core.bind_native_currency_v1();
CREATE TRIGGER native_currency_context_v1 BEFORE INSERT OR UPDATE ON public.credit_ledger_v2 FOR EACH ROW EXECUTE FUNCTION backend_core.bind_native_currency_v1();
CREATE TRIGGER native_currency_context_v1 BEFORE INSERT OR UPDATE ON public.cashier_shifts FOR EACH ROW EXECUTE FUNCTION backend_core.bind_native_currency_v1();

CREATE OR REPLACE FUNCTION backend_core.capture_financial_currency_v1() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE context jsonb; authority proforma_backend.accounting_currency%ROWTYPE; parent_org uuid; parent_store uuid;
BEGIN
 IF TG_TABLE_SCHEMA<>'public' OR TG_TABLE_NAME NOT IN ('sales','sale_payments','expenses') THEN RAISE EXCEPTION 'INVALID_CURRENCY_TRIGGER_TARGET'; END IF;
 IF TG_OP='UPDATE' THEN
  IF NEW.currency_context IS DISTINCT FROM OLD.currency_context OR NEW.organization_id IS DISTINCT FROM OLD.organization_id OR NEW.store_id IS DISTINCT FROM OLD.store_id THEN RAISE EXCEPTION 'IMMUTABLE_FINANCIAL_CURRENCY_CONTEXT'; END IF;
  IF TG_TABLE_NAME='sale_payments' AND (to_jsonb(NEW)->>'sale_id') IS DISTINCT FROM (to_jsonb(OLD)->>'sale_id') THEN RAISE EXCEPTION 'IMMUTABLE_PAYMENT_SALE'; END IF;
  RETURN NEW;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.stores s WHERE s.id=NEW.store_id AND s.organization_id=NEW.organization_id) THEN RAISE EXCEPTION 'CURRENCY_STORE_SCOPE_MISMATCH'; END IF;
 SELECT * INTO authority FROM proforma_backend.accounting_currency WHERE organization_id=NEW.organization_id;
 IF FOUND AND authority.currency<>'TZS' THEN PERFORM backend_core.native_financial_policy_v1(NEW.store_id); END IF;
 IF TG_TABLE_NAME='sale_payments' THEN
  SELECT s.currency_context,s.organization_id,s.store_id INTO context,parent_org,parent_store FROM public.sales s WHERE s.id=(to_jsonb(NEW)->>'sale_id')::uuid;
  IF NOT FOUND OR parent_org IS DISTINCT FROM NEW.organization_id OR parent_store IS DISTINCT FROM NEW.store_id THEN RAISE EXCEPTION 'PAYMENT_CURRENCY_SCOPE_MISMATCH'; END IF;
  -- Old sale currency remains unknown; today's owner confirmation cannot relabel it.
  NEW.currency_context:=context;
 ELSIF authority.organization_id IS NOT NULL THEN
  NEW.currency_context:=jsonb_build_object('version',1,'organizationId',NEW.organization_id,'currency',authority.currency,'accountingCurrency',authority.currency,'contextRevision',authority.revision,'source','TRANSACTION_RECORD','exchangeRate','1','rateSource','SAME_CURRENCY_IDENTITY','displayRateUsed',false);
 ELSE NEW.currency_context:=NULL;
 END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION public.create_sale_with_payment_v4(p_store_id uuid, p_items jsonb, p_note text DEFAULT NULL::text, p_payment_method text DEFAULT 'CASH'::text, p_paid_amount numeric DEFAULT 0, p_payment_channel text DEFAULT NULL::text, p_reference text DEFAULT NULL::text, p_customer_id uuid DEFAULT NULL::uuid, p_customer_phone text DEFAULT NULL::text, p_customer_full_name text DEFAULT NULL::text, p_discount_type text DEFAULT NULL::text, p_discount_value numeric DEFAULT NULL::numeric, p_discount_note text DEFAULT NULL::text, p_client_sale_id text DEFAULT NULL::text, p_cashier_shift_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(sale_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$

declare

  v_sale_id uuid;
  v_policy jsonb;
  v_scale integer;
  v_native boolean;
  v_rounding numeric:=0;

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



  v_policy:=backend_core.native_financial_policy_v1(p_store_id);v_scale:=(v_policy->>'discountScale')::integer;v_native:=(v_policy->>'native')::boolean;
  if v_client_sale_uuid is not null then
    perform pg_advisory_xact_lock(hashtextextended(p_store_id::text||':'||v_client_sale_uuid::text,0));

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

    v_discount_amount := round((v_subtotal * v_dvalue) / 100,v_scale);

  else

    v_discount_amount := round(v_dvalue,v_scale);

  end if;



  v_discount_amount := greatest(0, least(v_subtotal, v_discount_amount));

  v_grand_total := greatest(0, v_subtotal - v_discount_amount);



  if v_native then
    v_rounding:=round(v_grand_total,(v_policy->>'scale')::integer)-v_grand_total;
    v_grand_total:=v_grand_total+v_rounding;
    if v_paid<>round(v_paid,(v_policy->>'scale')::integer) or v_split_cash<>round(v_split_cash,(v_policy->>'scale')::integer) or v_split_mobile<>round(v_split_mobile,(v_policy->>'scale')::integer) or v_split_bank<>round(v_split_bank,(v_policy->>'scale')::integer) then raise exception 'INVALID_TENDER_PRECISION';end if;
  end if;
  if v_grand_total <= 0 then raise exception 'grand_total must be > 0 after discount'; end if;

  if v_paid > v_grand_total then raise exception 'paid_amount cannot exceed grand_total'; end if;



  if v_is_split and v_split_total <> v_paid then

    raise exception 'Split payment total must equal paid_amount';

  end if;



  v_is_credit := (v_method = 'CREDIT') or (v_paid < v_grand_total);



  if v_is_credit then

    v_balance := greatest(0, v_grand_total - v_paid);

  else

    v_balance := 0;

    if v_paid <> v_grand_total then

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
      settlement_rounding = v_rounding,

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
;
CREATE OR REPLACE FUNCTION public.record_credit_sale_v2(p_store_id uuid, p_credit_account_id uuid, p_amount numeric, p_note text DEFAULT NULL::text, p_reference text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$

declare

  v_id uuid;

  v_amt numeric;
  v_policy jsonb;

  v_store uuid;

begin

  if not public.can_manage_credit_store(p_store_id) then

    raise exception 'Not allowed to manage credit for this store';

  end if;



  v_policy:=backend_core.native_financial_policy_v1(p_store_id);
  if (v_policy->>'native')::boolean then
   v_amt:=abs(coalesce(p_amount,0));if v_amt<>round(v_amt,(v_policy->>'scale')::integer) then raise exception 'INVALID_CREDIT_PRECISION';end if;
  else v_amt:=abs(coalesce(p_amount,0))::numeric(14,2);end if;

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
;
CREATE FUNCTION public.create_native_sale_v1(p_store_id uuid,p_request_id uuid,p_currency text,p_revision integer,p_sale jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid:=backend_core.active_subject();o uuid;a proforma_backend.accounting_currency%ROWTYPE;prior backend_core.native_financial_requests%ROWTYPE;sid uuid;debt numeric;account uuid;ledger uuid;body jsonb;result jsonb;line jsonb;digits integer;canonical_note text;allocation numeric:=0;channel text;
BEGIN
 IF actor IS NULL OR p_request_id IS NULL OR jsonb_typeof(p_sale) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'INVALID_NATIVE_SALE';END IF;
 PERFORM public.ensure_my_store_access(p_store_id);
 SELECT organization_id INTO o FROM public.stores WHERE id=p_store_id;
 IF o IS NULL THEN RAISE EXCEPTION 'CURRENCY_TENANT_MISMATCH';END IF;
 IF p_sale->>'organization_id' IS DISTINCT FROM o::text THEN RAISE EXCEPTION 'CURRENCY_TENANT_MISMATCH';END IF;
 body:=jsonb_build_object('currency',p_currency,'revision',p_revision,'sale',p_sale);
 PERFORM pg_advisory_xact_lock(hashtextextended(p_store_id::text||':'||p_request_id::text,0));
 SELECT * INTO prior FROM backend_core.native_financial_requests WHERE store_id=p_store_id AND request_id=p_request_id;
 IF FOUND THEN
  IF prior.actor_id<>actor OR prior.organization_id<>o OR prior.operation<>'SALE' OR prior.payload<>body THEN RAISE EXCEPTION 'NATIVE_REQUEST_CONFLICT';END IF;RETURN prior.result;
 END IF;
 IF EXISTS(SELECT 1 FROM public.sales WHERE store_id=p_store_id AND client_sale_id=p_request_id) THEN RAISE EXCEPTION 'LEGACY_REQUEST_REQUIRES_REVIEW';END IF;
 SELECT * INTO a FROM proforma_backend.accounting_currency WHERE organization_id=o;
 IF NOT FOUND OR a.currency IS DISTINCT FROM p_currency OR a.revision IS DISTINCT FROM p_revision THEN RAISE EXCEPTION 'OFFLINE_CURRENCY_REVIEW_REQUIRED';END IF;
 IF NOT EXISTS(SELECT 1 FROM backend_core.native_financial_rollout WHERE organization_id=o AND currency=a.currency AND revision=a.revision AND enabled) THEN RAISE EXCEPTION 'NATIVE_FINANCIAL_POSTING_NOT_CERTIFIED';END IF;
 SELECT minor_units INTO digits FROM proforma_backend.currency_catalog WHERE code=a.currency;
 IF jsonb_typeof(p_sale->'items') IS DISTINCT FROM 'array' OR jsonb_array_length(p_sale->'items')=0 OR jsonb_array_length(p_sale->'items')>500 THEN RAISE EXCEPTION 'INVALID_NATIVE_ITEMS';END IF;
 FOR line IN SELECT * FROM jsonb_array_elements(p_sale->'items') LOOP
  IF coalesce(line->>'qty','')!~'^\d{1,18}(\.\d{1,3})?$' OR coalesce(line->>'unit_price','')!~'^\d{1,18}(\.\d{1,12})?$' OR (line->>'qty')::numeric<=0 OR (line->>'unit_price')::numeric<=0 THEN RAISE EXCEPTION 'INVALID_NATIVE_ITEMS';END IF;
  IF a.currency<>'TZS' AND NOT EXISTS(SELECT 1 FROM public.products p WHERE p.id=(line->>'product_id')::uuid AND p.organization_id=o AND p.currency_context->>'currency'=a.currency AND (p.currency_context->>'contextRevision')::integer=a.revision AND p.currency_context->>'organizationId'=o::text) THEN RAISE EXCEPTION 'PRODUCT_CURRENCY_CONTEXT_REQUIRED';END IF;
 END LOOP;
 IF coalesce(p_sale->>'paid_amount','')!~'^\d{1,18}(\.\d{1,12})?$' OR coalesce(p_sale->>'payment_method','') NOT IN ('CASH','MOBILE','BANK','CREDIT') THEN RAISE EXCEPTION 'INVALID_NATIVE_PAYMENT';END IF;
 IF p_sale->>'discount_type' IS NOT NULL AND p_sale->>'discount_type' NOT IN ('PERCENT','FIXED') THEN RAISE EXCEPTION 'INVALID_DISCOUNT';END IF;
 IF p_sale->>'discount_value' IS NOT NULL AND (p_sale->>'discount_value')!~'^\d{1,18}(\.\d{1,12})?$' THEN RAISE EXCEPTION 'INVALID_DISCOUNT';END IF;
 canonical_note:=coalesce(p_sale->>'note','');
 IF canonical_note ILIKE '%SPLIT_PAYMENT:%' THEN RAISE EXCEPTION 'STRUCTURED_SPLIT_REQUIRED';END IF;
 IF p_sale ? 'split' THEN
  IF jsonb_typeof(p_sale->'split') IS DISTINCT FROM 'object' OR (SELECT count(*) FROM jsonb_object_keys(p_sale->'split'))<>3 THEN RAISE EXCEPTION 'INVALID_NATIVE_SPLIT';END IF;
  FOREACH channel IN ARRAY ARRAY['cash','mobile','bank'] LOOP
   IF coalesce(p_sale->'split'->>channel,'')!~'^\d{1,18}(\.\d{1,12})?$' THEN RAISE EXCEPTION 'INVALID_NATIVE_SPLIT';END IF;
   allocation:=allocation+(p_sale->'split'->>channel)::numeric;
  END LOOP;
  IF allocation<=0 OR allocation<>(p_sale->>'paid_amount')::numeric THEN RAISE EXCEPTION 'PAYMENT_RECONCILIATION_FAILED';END IF;
  canonical_note:='SPLIT_PAYMENT: CASH='||(p_sale->'split'->>'cash')||' | MOBILE='||(p_sale->'split'->>'mobile')||' | BANK='||(p_sale->'split'->>'bank')||E'\n'||canonical_note;
 END IF;
 INSERT INTO backend_core.native_financial_intents VALUES(pg_backend_pid(),txid_current(),actor,o,p_store_id,p_request_id);
 IF EXISTS(SELECT 1 FROM public.org_memberships WHERE organization_id=o AND user_id=actor AND is_active AND lower(role)='cashier') AND p_sale->>'cashier_shift_id' IS NULL THEN RAISE EXCEPTION 'CASHIER_SHIFT_REQUIRED';END IF;
 IF p_sale->>'cashier_shift_id' IS NOT NULL THEN
  PERFORM 1 FROM public.cashier_shifts WHERE id=(p_sale->>'cashier_shift_id')::uuid AND organization_id=o AND store_id=p_store_id AND status='OPEN' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'CASHIER_SHIFT_NOT_OPEN';END IF;
 END IF;
 SELECT x.sale_id INTO sid FROM public.create_sale_with_payment_v6(p_store_id:=p_store_id,p_items:=p_sale->'items',p_note:=canonical_note,p_payment_method:=p_sale->>'payment_method',p_paid_amount:=(p_sale->>'paid_amount')::numeric,p_payment_channel:=p_sale->>'payment_channel',p_reference:=p_sale->>'reference',p_customer_id:=(p_sale->>'customer_id')::uuid,p_customer_phone:=p_sale->>'customer_phone',p_customer_full_name:=p_sale->>'customer_name',p_discount_type:=p_sale->>'discount_type',p_discount_value:=(p_sale->>'discount_value')::numeric,p_discount_note:=p_sale->>'discount_note',p_client_sale_id:=p_request_id,p_cashier_shift_id:=(p_sale->>'cashier_shift_id')::uuid,p_sold_by_membership_id:=(p_sale->>'sold_by_membership_id')::uuid) x;
 SELECT balance_amount INTO debt FROM public.sales WHERE id=sid AND organization_id=o AND store_id=p_store_id;
 IF debt IS NULL THEN RAISE EXCEPTION 'NATIVE_SALE_OUTCOME_UNKNOWN';END IF;
 IF debt>0 THEN
  IF p_sale->>'is_credit' IS DISTINCT FROM 'true' OR nullif(btrim(p_sale->>'customer_name'),'') IS NULL THEN RAISE EXCEPTION 'EXPLICIT_CREDIT_AUTHORIZATION_REQUIRED';END IF;
  account:=public.create_credit_account_v2(p_store_id,p_sale->>'customer_name',p_sale->>'customer_phone');
  PERFORM 1 FROM public.credit_accounts_v2 WHERE id=account AND store_id=p_store_id FOR UPDATE;
  IF a.currency<>'TZS' AND NOT EXISTS(SELECT 1 FROM public.credit_accounts_v2 c WHERE c.id=account AND c.store_id=p_store_id AND c.currency_context->>'currency'=a.currency AND c.currency_context->>'organizationId'=o::text AND (c.currency_context->>'contextRevision')::integer=a.revision) THEN RAISE EXCEPTION 'CREDIT_CURRENCY_CONTEXT_REQUIRED';END IF;
  ledger:=public.record_credit_sale_v2(p_store_id,account,debt,p_sale->>'note',sid::text);
  IF NOT EXISTS(SELECT 1 FROM public.credit_ledger_v2 WHERE id=ledger AND credit_account_id=account AND delta=debt) THEN RAISE EXCEPTION 'CREDIT_RECONCILIATION_FAILED';END IF;
 END IF;
 IF (SELECT coalesce(sum(paid_amount),0) FROM public.sale_payments WHERE sale_id=sid)<>(SELECT paid_amount FROM public.sales WHERE id=sid) THEN RAISE EXCEPTION 'PAYMENT_RECONCILIATION_FAILED';END IF;
 SELECT jsonb_build_object('saleId',s.id,'organizationId',o,'storeId',p_store_id,'currency',a.currency,'revision',a.revision,'subtotal',s.subtotal_amount::text,'discount',s.discount_amount::text,'rounding',s.settlement_rounding::text,'total',s.grand_total::text,'paid',s.paid_amount::text,'balance',s.balance_amount::text,'creditAccountId',account,'creditLedgerId',ledger) INTO result FROM public.sales s WHERE s.id=sid;
 INSERT INTO backend_core.native_financial_requests VALUES(p_store_id,p_request_id,o,actor,'SALE',body,result,clock_timestamp());
 DELETE FROM backend_core.native_financial_intents WHERE backend_pid=pg_backend_pid() AND transaction_id=txid_current();
 RETURN result;
END $$;
DO $$ DECLARE c regclass;BEGIN
 FOREACH c IN ARRAY ARRAY['public.credit_payments_v2'::regclass,'public.credit_sales_v2'::regclass] LOOP
 IF EXISTS(SELECT 1 FROM pg_class t CROSS JOIN LATERAL aclexplode(coalesce(t.relacl,acldefault('r',t.relowner))) a WHERE t.oid=c AND a.grantee<>t.relowner) THEN RAISE EXCEPTION 'CREDIT_VIEW_PERMISSION_DRIFT';END IF;
 END LOOP;
END $$;
CREATE FUNCTION public.repay_native_credit_v1(p_store_id uuid,p_request_id uuid,p_currency text,p_revision integer,p_account_id uuid,p_amount numeric,p_method text,p_reference text DEFAULT NULL,p_note text DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid:=backend_core.active_subject();o uuid;a proforma_backend.accounting_currency%ROWTYPE;prior backend_core.native_financial_requests%ROWTYPE;body jsonb;result jsonb;lid uuid;balance numeric;digits integer;
BEGIN
 IF actor IS NULL OR p_request_id IS NULL OR p_amount IS NULL OR p_amount<=0 OR p_amount::text!~'^\d{1,18}(\.\d{1,12})?$' OR p_method NOT IN ('CASH','MOBILE','BANK') THEN RAISE EXCEPTION 'INVALID_NATIVE_REPAYMENT';END IF;
 PERFORM public.ensure_my_store_access(p_store_id);SELECT organization_id INTO o FROM public.stores WHERE id=p_store_id;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_store_id::text||':'||p_request_id::text,0));
 body:=jsonb_build_object('account',p_account_id,'amount',p_amount,'currency',p_currency,'revision',p_revision,'method',p_method,'reference',p_reference,'note',p_note);
 SELECT * INTO prior FROM backend_core.native_financial_requests WHERE store_id=p_store_id AND request_id=p_request_id;
 IF FOUND THEN IF prior.actor_id<>actor OR prior.operation<>'REPAYMENT' OR prior.organization_id<>o OR prior.payload<>body THEN RAISE EXCEPTION 'NATIVE_REQUEST_CONFLICT';END IF;RETURN prior.result;END IF;
 SELECT * INTO a FROM proforma_backend.accounting_currency WHERE organization_id=o;
 IF NOT FOUND OR a.currency IS DISTINCT FROM p_currency OR a.revision IS DISTINCT FROM p_revision THEN RAISE EXCEPTION 'OFFLINE_CURRENCY_REVIEW_REQUIRED';END IF;
 IF NOT EXISTS(SELECT 1 FROM backend_core.native_financial_rollout WHERE organization_id=o AND currency=a.currency AND revision=a.revision AND enabled) THEN RAISE EXCEPTION 'NATIVE_FINANCIAL_POSTING_NOT_CERTIFIED';END IF;
 SELECT minor_units INTO digits FROM proforma_backend.currency_catalog WHERE code=a.currency;
 IF p_amount<>round(p_amount,digits) THEN RAISE EXCEPTION 'INVALID_TENDER_PRECISION';END IF;
 PERFORM 1 FROM public.credit_accounts_v2 WHERE id=p_account_id AND store_id=p_store_id FOR UPDATE;IF NOT FOUND THEN RAISE EXCEPTION 'CREDIT_CURRENCY_CONTEXT_REQUIRED';END IF;
 IF a.currency<>'TZS' AND NOT EXISTS(SELECT 1 FROM public.credit_accounts_v2 WHERE id=p_account_id AND currency_context->>'currency'=a.currency AND currency_context->>'organizationId'=o::text AND (currency_context->>'contextRevision')::integer=a.revision) THEN RAISE EXCEPTION 'CREDIT_CURRENCY_CONTEXT_REQUIRED';END IF;
 SELECT coalesce(sum(delta),0) INTO balance FROM public.credit_ledger_v2 WHERE credit_account_id=p_account_id AND store_id=p_store_id;
 IF p_amount>balance THEN RAISE EXCEPTION 'REPAYMENT_EXCEEDS_BALANCE';END IF;
 INSERT INTO backend_core.native_financial_intents VALUES(pg_backend_pid(),txid_current(),actor,o,p_store_id,p_request_id);
 lid:=public.record_credit_payment_v2(p_store_id,p_account_id,p_amount,p_method,p_reference,p_note);
 result:=jsonb_build_object('ledgerId',lid,'organizationId',o,'storeId',p_store_id,'currency',a.currency,'revision',a.revision,'amount',p_amount::text,'balance',(balance-p_amount)::text);
 INSERT INTO backend_core.native_financial_requests VALUES(p_store_id,p_request_id,o,actor,'REPAYMENT',body,result,clock_timestamp());
 DELETE FROM backend_core.native_financial_intents WHERE backend_pid=pg_backend_pid() AND transaction_id=txid_current();RETURN result;
END $$;
CREATE FUNCTION public.native_cashier_shift_v1(p_store_id uuid,p_request_id uuid,p_currency text,p_revision integer,p_operation text,p_shift_id uuid,p_amount numeric,p_note text DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid:=backend_core.active_subject();o uuid;a proforma_backend.accounting_currency%ROWTYPE;prior backend_core.native_financial_requests%ROWTYPE;body jsonb;result jsonb;sid uuid;shift public.cashier_shifts%ROWTYPE;digits integer;
BEGIN
 IF actor IS NULL OR p_request_id IS NULL OR p_operation NOT IN ('OPEN_SHIFT','CLOSE_SHIFT') OR p_amount IS NULL OR p_amount<0 OR p_amount::text!~'^\d{1,18}(\.\d{1,12})?$' THEN RAISE EXCEPTION 'INVALID_NATIVE_SHIFT';END IF;
 PERFORM public.ensure_my_store_access(p_store_id);SELECT organization_id INTO o FROM public.stores WHERE id=p_store_id;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_store_id::text||':'||p_request_id::text,0));
 body:=jsonb_build_object('currency',p_currency,'revision',p_revision,'operation',p_operation,'shift',p_shift_id,'amount',p_amount,'note',p_note);
 SELECT * INTO prior FROM backend_core.native_financial_requests WHERE store_id=p_store_id AND request_id=p_request_id;
 IF FOUND THEN IF prior.actor_id<>actor OR prior.operation<>p_operation OR prior.organization_id<>o OR prior.payload<>body THEN RAISE EXCEPTION 'NATIVE_REQUEST_CONFLICT';END IF;RETURN prior.result;END IF;
 SELECT * INTO a FROM proforma_backend.accounting_currency WHERE organization_id=o;
 IF NOT FOUND OR a.currency IS DISTINCT FROM p_currency OR a.revision IS DISTINCT FROM p_revision THEN RAISE EXCEPTION 'OFFLINE_CURRENCY_REVIEW_REQUIRED';END IF;
 IF NOT EXISTS(SELECT 1 FROM backend_core.native_financial_rollout WHERE organization_id=o AND currency=a.currency AND revision=a.revision AND enabled) THEN RAISE EXCEPTION 'NATIVE_FINANCIAL_POSTING_NOT_CERTIFIED';END IF;
 SELECT minor_units INTO digits FROM proforma_backend.currency_catalog WHERE code=a.currency;IF p_amount<>round(p_amount,digits) THEN RAISE EXCEPTION 'INVALID_TENDER_PRECISION';END IF;
 INSERT INTO backend_core.native_financial_intents VALUES(pg_backend_pid(),txid_current(),actor,o,p_store_id,p_request_id);
 IF p_operation='OPEN_SHIFT' THEN
  PERFORM pg_advisory_xact_lock(hashtextextended('native-shift-open:'||p_store_id::text||':'||actor::text,0));
  SELECT x.shift_id INTO sid FROM public.open_cashier_shift_v1(p_store_id,p_amount) x;
 ELSE
  SELECT * INTO shift FROM public.cashier_shifts WHERE id=p_shift_id AND store_id=p_store_id AND organization_id=o FOR UPDATE;
  IF NOT FOUND OR shift.currency_context->>'currency' IS DISTINCT FROM a.currency OR (shift.currency_context->>'contextRevision')::integer IS DISTINCT FROM a.revision THEN RAISE EXCEPTION 'SHIFT_CURRENCY_CONTEXT_REQUIRED';END IF;
  SELECT x.shift_id INTO sid FROM public.close_cashier_shift_v1(p_shift_id,p_amount,p_note) x;
 END IF;
 SELECT * INTO shift FROM public.cashier_shifts WHERE id=sid;
 IF shift.currency_context->>'currency' IS DISTINCT FROM a.currency OR (p_operation='OPEN_SHIFT' AND shift.opening_cash<>p_amount) THEN RAISE EXCEPTION 'SHIFT_CURRENCY_CONTEXT_REQUIRED';END IF;
 result:=jsonb_build_object('shiftId',sid,'organizationId',o,'storeId',p_store_id,'currency',a.currency,'revision',a.revision,'status',shift.status,'openingCash',shift.opening_cash::text,'drawerCount',shift.drawer_count::text,'reconciliationCertified',false);
 INSERT INTO backend_core.native_financial_requests VALUES(p_store_id,p_request_id,o,actor,p_operation,body,result,clock_timestamp());
 DELETE FROM backend_core.native_financial_intents WHERE backend_pid=pg_backend_pid() AND transaction_id=txid_current();RETURN result;
END $$;
CREATE FUNCTION public.get_native_sale_result_v1(p_store_id uuid,p_request_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid:=backend_core.active_subject();result jsonb;
BEGIN
 IF actor IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED';END IF;
 PERFORM public.ensure_my_store_access(p_store_id);
 PERFORM pg_advisory_xact_lock(hashtextextended(p_store_id::text||':'||p_request_id::text,0));
 SELECT r.result INTO result FROM backend_core.native_financial_requests r JOIN public.stores s ON s.id=r.store_id AND s.organization_id=r.organization_id WHERE r.store_id=p_store_id AND r.request_id=p_request_id AND r.actor_id=actor AND r.operation='SALE';
 RETURN result;
END $$;
-- Preserve administrative ownership; do not expose any new RPC/helper via
-- explicit or inherited default grants. No caller activation in this draft.
DO $$ DECLARE fn regprocedure;r record;BEGIN
 FOREACH fn IN ARRAY ARRAY['backend_core.native_financial_policy_v1(uuid)'::regprocedure,'backend_core.bind_native_currency_v1()'::regprocedure,'public.create_native_sale_v1(uuid,uuid,text,integer,jsonb)'::regprocedure,'public.repay_native_credit_v1(uuid,uuid,text,integer,uuid,numeric,text,text,text)'::regprocedure,'public.native_cashier_shift_v1(uuid,uuid,text,integer,text,uuid,numeric,text)'::regprocedure,'public.get_native_sale_result_v1(uuid,uuid)'::regprocedure] LOOP
 EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC',fn);
 FOR r IN SELECT DISTINCT pg_get_userbyid(a.grantee) AS name FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid=fn AND a.grantee<>p.proowner AND a.grantee<>0 LOOP EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %I',fn,r.name);END LOOP;
 END LOOP;
END $$;

COMMIT;
