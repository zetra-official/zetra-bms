-- OWNER APPROVAL REQUIRED. Target externally attested: dcmhqdckzhbuakvcyjit.
-- Additive adapter only. Existing sale/payment/credit/stock functions remain unchanged.
BEGIN;
SET LOCAL search_path=pg_catalog;
SET LOCAL lock_timeout='2s';
SET LOCAL statement_timeout='30s';
SET LOCAL idle_in_transaction_session_timeout='30s';
DO $$ BEGIN
 IF current_database()<>'postgres' OR current_user<>'postgres' THEN RAISE EXCEPTION 'WRONG_DATABASE_OR_ROLE'; END IF;
 IF has_schema_privilege('anon','public','CREATE') OR has_schema_privilege('authenticated','public','CREATE') THEN RAISE EXCEPTION 'UNTRUSTED_PUBLIC_SCHEMA_CREATE'; END IF;
 IF to_regprocedure('public.proforma_document_fx_v1(uuid,uuid,uuid,uuid,integer,jsonb)') IS NULL THEN RAISE EXCEPTION '1705_BASELINE_REQUIRED'; END IF;
 IF to_regprocedure('public.proforma_conversion_preview_v1(uuid,uuid,uuid)') IS NOT NULL THEN RAISE EXCEPTION 'ALREADY_PRESENT_NO_RETRY'; END IF;
 IF md5(replace(pg_get_functiondef(to_regprocedure('public.attach_customer_to_sale(uuid,uuid,text,text,numeric)')),E'\r','')) IS DISTINCT FROM '9120c743fca972f61b6a3f8fc36cfedf' THEN RAISE EXCEPTION 'CANONICAL_BASELINE_CHANGED:attach_customer_to_sale'; END IF;
 IF md5(replace(pg_get_functiondef(to_regprocedure('public.create_credit_account_v2(uuid,text,text)')),E'\r','')) IS DISTINCT FROM '7e4d3c1abe446af9720a55bc7965ba88' THEN RAISE EXCEPTION 'CANONICAL_BASELINE_CHANGED:create_credit_account_v2'; END IF;
 IF md5(replace(pg_get_functiondef(to_regprocedure('public.create_sale(uuid,jsonb,text,uuid)')),E'\r','')) IS DISTINCT FROM '322c4ec027ce6f43fa73baa6e663b7ea' THEN RAISE EXCEPTION 'CANONICAL_BASELINE_CHANGED:create_sale'; END IF;
 IF md5(replace(pg_get_functiondef(to_regprocedure('public.create_sale_with_payment_v4(uuid,jsonb,text,text,numeric,text,text,uuid,text,text,text,numeric,text,text,uuid)')),E'\r','')) IS DISTINCT FROM '09c0ee2a16b55a3fcedbe85563d1b897' THEN RAISE EXCEPTION 'CANONICAL_BASELINE_CHANGED:create_sale_with_payment_v4'; END IF;
 IF md5(replace(pg_get_functiondef(to_regprocedure('public.create_sale_with_payment_v6(uuid,jsonb,text,text,numeric,text,text,uuid,text,text,text,numeric,text,uuid,uuid,uuid)')),E'\r','')) IS DISTINCT FROM '67eddab421487dc39d00da9f81f4c29e' THEN RAISE EXCEPTION 'CANONICAL_BASELINE_CHANGED:create_sale_with_payment_v6'; END IF;
 IF md5(replace(pg_get_functiondef(to_regprocedure('public.get_store_sale_items(uuid)')),E'\r','')) IS DISTINCT FROM '29616231912babcdb2e2c5ba08a33611' THEN RAISE EXCEPTION 'CANONICAL_BASELINE_CHANGED:get_store_sale_items'; END IF;
 IF md5(replace(pg_get_functiondef(to_regprocedure('public.record_credit_sale_v2(uuid,uuid,numeric,text,text)')),E'\r','')) IS DISTINCT FROM '1f3bfeed0ccb99dc0428ae77c7a7606e' THEN RAISE EXCEPTION 'CANONICAL_BASELINE_CHANGED:record_credit_sale_v2'; END IF;
END $$;
CREATE TABLE proforma_backend.sale_links (
 document_id uuid PRIMARY KEY REFERENCES proforma_backend.documents(id),
 organization_id uuid NOT NULL REFERENCES public.organizations(id),store_id uuid NOT NULL REFERENCES public.stores(id),
 sale_id uuid NOT NULL UNIQUE REFERENCES public.sales(id),request_id uuid NOT NULL,actor_id uuid NOT NULL,
 document_revision integer NOT NULL,quote jsonb NOT NULL,payment_hash text NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(organization_id,request_id)
);
ALTER TABLE proforma_backend.sale_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE proforma_backend.sale_links FORCE ROW LEVEL SECURITY;
REVOKE ALL ON proforma_backend.sale_links FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER immutable_sale_links BEFORE UPDATE OR DELETE ON proforma_backend.sale_links FOR EACH ROW EXECUTE FUNCTION proforma_backend.immutable_history();

CREATE FUNCTION public.proforma_conversion_preview_v1(p_org uuid,p_store uuid,p_document uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE ctx jsonb;d proforma_backend.documents%ROWTYPE;snap jsonb;item jsonb;product record;lines jsonb:='[]';customer jsonb;
 subtotal numeric:=0;discount numeric;total numeric;code text;input jsonb;v_price_changed boolean:=false;linked uuid;
BEGIN
 ctx:=proforma_backend.document_scope_v1(p_org,p_store);
 SELECT * INTO d FROM proforma_backend.documents WHERE id=p_document AND organization_id=p_org AND store_id=p_store;
 IF d.id IS NULL THEN RAISE EXCEPTION 'DOCUMENT_NOT_FOUND'; END IF;
 SELECT sale_id INTO linked FROM proforma_backend.sale_links WHERE document_id=d.id;
 IF linked IS NOT NULL THEN RETURN jsonb_build_object('version','2026101706','organizationId',p_org,'storeId',p_store,'documentId',d.id,'saleId',linked,'converted',true); END IF;
 IF d.sale_id IS NOT NULL THEN RAISE EXCEPTION 'UNLINKED_SALE_REQUIRES_REVIEW'; END IF;
 IF d.status NOT IN ('PENDING','ACCEPTED') OR d.valid_until<=clock_timestamp() THEN RAISE EXCEPTION 'PENDING_UNEXPIRED_DOCUMENT_REQUIRED'; END IF;
 IF ctx->>'role'='staff' AND (SELECT sales_mode FROM public.stores WHERE id=p_store)='CASHIER' THEN RAISE EXCEPTION 'SEND_TO_CASHIER_REQUIRED'; END IF;
 SELECT snapshot INTO snap FROM proforma_backend.revisions WHERE document_id=d.id AND revision=d.revision;
 IF snap->>'sourceContract' IS DISTINCT FROM 'PROFORMA_DOCUMENT_V1' OR (snap->>'tax')::numeric<>0 THEN RAISE EXCEPTION 'UNSUPPORTED_DOCUMENT_MAPPING'; END IF;
 code:=proforma_backend.confirmed_currency(p_org);
 IF code IS DISTINCT FROM d.currency THEN RAISE EXCEPTION 'ACCOUNTING_CURRENCY_CHANGED'; END IF;
 input:=snap->'editInput';customer:=snap->'customer';
 IF nullif(customer->>'id','') IS NOT NULL THEN
  SELECT jsonb_build_object('id',c.id,'name',coalesce(c.full_name,c.name),'phone',c.phone) INTO customer FROM public.customers c WHERE c.id=(customer->>'id')::uuid AND c.organization_id=p_org AND c.store_id=p_store;
  IF customer IS NULL THEN RAISE EXCEPTION 'CUSTOMER_SCOPE_MISMATCH'; END IF;
 END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(snap->'items') LOOP
  SELECT * INTO product FROM public.get_store_sale_items(p_store) si WHERE si.product_id=(item->>'productId')::uuid;
  IF NOT FOUND OR product.is_precision_product OR product.selling_price IS NULL OR product.selling_price<=0 THEN RAISE EXCEPTION 'PRODUCT_UNAVAILABLE_OR_UNSUPPORTED'; END IF;
  IF (item->>'quantity')::numeric<=0 OR product.qty<(item->>'quantity')::numeric THEN RAISE EXCEPTION 'INSUFFICIENT_STOCK'; END IF;
  IF (item->>'tax')::numeric<>0 OR (item->>'discount')::numeric<>0 THEN RAISE EXCEPTION 'UNSUPPORTED_ITEM_MAPPING'; END IF;
  v_price_changed:=v_price_changed OR product.selling_price<>(item->>'unitPrice')::numeric;
  subtotal:=subtotal+product.selling_price*(item->>'quantity')::numeric;
  lines:=lines||jsonb_build_array(jsonb_build_object('product_id',product.product_id,'name',product.name,'sku',product.sku,'unit',product.unit,'qty',(item->>'quantity')::numeric,'unit_price',product.selling_price));
 END LOOP;
 IF input->>'discountType'='percent' THEN discount:=least(subtotal,round(subtotal*(input->>'discountValue')::numeric/100));
 ELSIF input->>'discountType'='fixed' THEN discount:=least(subtotal,round((input->>'discountValue')::numeric));
 ELSE RAISE EXCEPTION 'INVALID_DISCOUNT'; END IF;
 total:=subtotal-discount;IF total<=0 THEN RAISE EXCEPTION 'INVALID_TOTAL'; END IF;
 RETURN jsonb_build_object('version','2026101706','organizationId',p_org,'storeId',p_store,'documentId',d.id,'revision',d.revision,'converted',false,
  'changed',v_price_changed OR total<>(snap->>'total')::numeric OR customer IS DISTINCT FROM snap->'customer',
  'originalTotal',snap->>'total','quote',jsonb_build_object('documentId',d.id,'revision',d.revision,'currency',code,'items',lines,'customer',customer,
   'discountType',input->>'discountType','discountValue',input->>'discountValue','subtotal',trim_scale(subtotal)::text,'discount',trim_scale(discount)::text,'total',trim_scale(total)::text));
END $$;

CREATE FUNCTION public.proforma_conversion_commit_v1(p_org uuid,p_store uuid,p_document uuid,p_request uuid,p_quote jsonb,p_payment jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE ctx jsonb;d proforma_backend.documents%ROWTYPE;prior proforma_backend.sale_links%ROWTYPE;preview jsonb;quote jsonb;snap jsonb;
 method text;via text;paid numeric;total numeric;cash numeric:=0;mobile numeric:=0;bank numeric:=0;shift uuid;sale uuid;account uuid;
 note text;channel text;reference text;fingerprint text;debt numeric;v_pid uuid;v_member uuid;
BEGIN
 ctx:=proforma_backend.document_scope_v1(p_org,p_store);
 IF p_request IS NULL OR p_payment IS NULL OR jsonb_typeof(p_payment)<>'object' THEN RAISE EXCEPTION 'INVALID_REQUEST'; END IF;
 -- Hold authorization/mode and shift rows until the financial transaction ends.
 PERFORM 1 FROM public.org_memberships WHERE id=(ctx->>'membershipId')::uuid AND is_active IS TRUE FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
 PERFORM 1 FROM public.stores WHERE id=p_store AND organization_id=p_org FOR SHARE;
 PERFORM 1 FROM proforma_backend.accounting_currency WHERE organization_id=p_org FOR SHARE;
 SELECT * INTO d FROM proforma_backend.documents WHERE id=p_document AND organization_id=p_org AND store_id=p_store FOR UPDATE;
 IF d.id IS NULL THEN RAISE EXCEPTION 'DOCUMENT_NOT_FOUND'; END IF;
 fingerprint:=md5(p_payment::text||p_quote::text);
 SELECT * INTO prior FROM proforma_backend.sale_links WHERE document_id=d.id;
 IF FOUND THEN
  IF d.sale_id IS DISTINCT FROM prior.sale_id OR d.status<>'CONVERTED' THEN RAISE EXCEPTION 'CONVERSION_LINK_INTEGRITY_FAILURE'; END IF;
  IF prior.payment_hash IS DISTINCT FROM fingerprint THEN RAISE EXCEPTION 'ALREADY_CONVERTED_DIFFERENT_REQUEST'; END IF;
  RETURN jsonb_build_object('version','2026101706','organizationId',p_org,'storeId',p_store,'documentId',d.id,'sale_id',prior.sale_id,'converted',true);
 END IF;
 -- Same lock order as existing inventory writers; no new inventory ledger.
 FOR v_pid IN SELECT product_id FROM proforma_backend.items WHERE document_id=d.id AND revision=d.revision ORDER BY product_id LOOP
  PERFORM 1 FROM public.inventory WHERE store_id=p_store AND organization_id=p_org AND product_id=v_pid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'AUTHORITATIVE_INVENTORY_REQUIRED'; END IF;
  PERFORM 1 FROM public.products WHERE id=v_pid AND organization_id=p_org FOR UPDATE;
  IF EXISTS(SELECT 1 FROM proforma_backend.holds WHERE organization_id=p_org AND store_id=p_store AND product_id=v_pid AND status='ACTIVE' AND expires_at>clock_timestamp()) THEN RAISE EXCEPTION 'ACTIVE_RESERVATIONS_UNSUPPORTED'; END IF;
 END LOOP;
 preview:=public.proforma_conversion_preview_v1(p_org,p_store,p_document);quote:=preview->'quote';
 IF quote IS DISTINCT FROM p_quote THEN RAISE EXCEPTION 'QUOTE_CHANGED_REVIEW_REQUIRED'; END IF;
 SELECT snapshot INTO snap FROM proforma_backend.revisions WHERE document_id=d.id AND revision=d.revision;
 IF p_payment->>'paid' IS NULL OR p_payment->>'paid' !~ '^(0|[1-9][0-9]{0,11})(\.[0-9]{1,2})?$' THEN RAISE EXCEPTION 'INVALID_PAID_AMOUNT'; END IF;
 method:=p_payment->>'method';via:=coalesce(p_payment->>'paidVia',method);paid:=(p_payment->>'paid')::numeric;total:=(quote->>'total')::numeric;debt:=total-paid;
 IF method NOT IN ('CASH','MOBILE','BANK','CREDIT','SPLIT') OR method IS NULL OR paid>total THEN RAISE EXCEPTION 'INVALID_PAYMENT'; END IF;
 IF method<>'CREDIT' AND paid<>total THEN RAISE EXCEPTION 'FULL_PAYMENT_REQUIRED'; END IF;
 IF method='CREDIT' AND (via NOT IN ('CASH','MOBILE','BANK','CREDIT') OR debt<=0 OR debt<>round(debt,2) OR NOT public.can_manage_credit_store(p_store) OR nullif(btrim(quote#>>'{customer,name}'),'') IS NULL OR nullif(btrim(quote#>>'{customer,phone}'),'') IS NULL) THEN RAISE EXCEPTION 'CREDIT_NOT_ALLOWED_OR_CUSTOMER_REQUIRED'; END IF;
 channel:=nullif(btrim(p_payment->>'channel'),'');reference:=nullif(btrim(p_payment->>'reference'),'');
 IF length(coalesce(channel,''))>200 OR length(coalesce(reference,''))>200 THEN RAISE EXCEPTION 'INVALID_PAYMENT_REFERENCE'; END IF;
 IF (method IN ('MOBILE','BANK') OR (method='CREDIT' AND paid>0 AND via IN ('MOBILE','BANK'))) AND (channel IS NULL OR reference IS NULL) THEN RAISE EXCEPTION 'PAYMENT_REFERENCE_REQUIRED'; END IF;
 note:=coalesce(snap->>'notes','');
 IF note ~* '(SPLIT_PAYMENT:|CASH=|MOBILE=|BANK=)' THEN RAISE EXCEPTION 'RESERVED_PAYMENT_NOTE_MARKER'; END IF;
 IF method='SPLIT' THEN
  IF EXISTS(SELECT 1 FROM unnest(ARRAY['cash','mobile','bank']) k WHERE p_payment->>k IS NULL OR p_payment->>k !~ '^(0|[1-9][0-9]{0,11})(\.[0-9]{1,2})?$') THEN RAISE EXCEPTION 'INVALID_SPLIT'; END IF;
  cash:=(p_payment->>'cash')::numeric;mobile:=(p_payment->>'mobile')::numeric;bank:=(p_payment->>'bank')::numeric;
  IF cash+mobile+bank<>paid OR ((mobile>0 OR bank>0) AND (channel IS NULL OR reference IS NULL)) THEN RAISE EXCEPTION 'INVALID_SPLIT'; END IF;
  note:='SPLIT_PAYMENT: CASH='||cash||' | MOBILE='||mobile||' | BANK='||bank||E'\n'||note;
 END IF;
 shift:=nullif(p_payment->>'shiftId','')::uuid;
 IF ctx->>'role'='cashier' THEN
  PERFORM 1 FROM public.cashier_shifts WHERE id=shift AND store_id=p_store AND organization_id=p_org AND membership_id=(ctx->>'membershipId')::uuid AND status='OPEN' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'OWN_OPEN_SHIFT_REQUIRED'; END IF;
 ELSIF shift IS NOT NULL THEN RAISE EXCEPTION 'UNEXPECTED_SHIFT'; END IF;
 v_member:=nullif(p_payment->>'soldByMembershipId','')::uuid;
 IF v_member IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.org_memberships m JOIN public.org_membership_stores ms ON ms.membership_id=m.id WHERE m.id=v_member AND m.organization_id=p_org AND m.is_active IS TRUE AND m.role='staff' AND ms.store_id=p_store) THEN RAISE EXCEPTION 'INVALID_STAFF_ATTRIBUTION'; END IF;
 IF EXISTS(SELECT 1 FROM public.sales WHERE store_id=p_store AND client_sale_id=p_document) THEN RAISE EXCEPTION 'EXTERNAL_SALE_ID_COLLISION'; END IF;
 SELECT x.sale_id INTO STRICT sale FROM public.create_sale_with_payment_v6(
  p_store_id:=p_store,p_items:=quote->'items',p_note:=note,p_payment_method:=CASE WHEN method='SPLIT' THEN 'CASH' WHEN method='CREDIT' AND paid>0 THEN via ELSE method END,
  p_paid_amount:=paid,p_payment_channel:=channel,p_reference:=reference,p_customer_id:=null,p_customer_phone:=quote#>>'{customer,phone}',p_customer_full_name:=quote#>>'{customer,name}',
  p_discount_type:=CASE WHEN quote->>'discountType'='percent' THEN 'PERCENT' ELSE 'FIXED' END,p_discount_value:=(quote->>'discountValue')::numeric,p_discount_note:=null,
  p_client_sale_id:=p_document,p_cashier_shift_id:=shift,p_sold_by_membership_id:=v_member) x;
 IF sale IS NULL THEN RAISE EXCEPTION 'CANONICAL_SALE_MISSING'; END IF;
 IF nullif(btrim(quote#>>'{customer,phone}'),'') IS NOT NULL THEN PERFORM public.attach_customer_to_sale(sale,p_store,quote#>>'{customer,phone}',quote#>>'{customer,name}',total); END IF;
 IF method='CREDIT' THEN
  account:=public.create_credit_account_v2(p_store,quote#>>'{customer,name}',quote#>>'{customer,phone}');
  PERFORM public.record_credit_sale_v2(p_store,account,debt,note,sale::text);
 END IF;
 -- Any failure above OR below aborts the same transaction, including canonical writes.
 INSERT INTO proforma_backend.sale_links(document_id,organization_id,store_id,sale_id,request_id,actor_id,document_revision,quote,payment_hash)
 VALUES(d.id,p_org,p_store,sale,p_request,(ctx->>'actorId')::uuid,d.revision,quote,fingerprint);
 UPDATE proforma_backend.documents SET status='CONVERTED',sale_id=sale WHERE id=d.id;
 RETURN jsonb_build_object('version','2026101706','organizationId',p_org,'storeId',p_store,'documentId',d.id,'sale_id',sale,'converted',true);
END $$;
REVOKE ALL ON FUNCTION public.proforma_conversion_preview_v1(uuid,uuid,uuid) FROM PUBLIC,anon,service_role;
REVOKE ALL ON FUNCTION public.proforma_conversion_commit_v1(uuid,uuid,uuid,uuid,jsonb,jsonb) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.proforma_conversion_preview_v1(uuid,uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.proforma_conversion_commit_v1(uuid,uuid,uuid,uuid,jsonb,jsonb) TO authenticated;
COMMIT;
