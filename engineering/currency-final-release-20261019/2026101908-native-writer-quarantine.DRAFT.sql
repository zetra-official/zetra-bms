BEGIN;SET LOCAL lock_timeout='2s';SET LOCAL statement_timeout='30s';
DO $$BEGIN IF md5(replace(pg_get_functiondef('create_native_sale_v1(uuid,uuid,text,integer,jsonb)'::regprocedure),chr(13),''))<>'40dc32a182e8a4694cdf98dd475a7cc7' THEN RAISE EXCEPTION 'INTENT_GATEWAY_PREIMAGE_MISMATCH';END IF;IF EXISTS(SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid='create_native_sale_v1(uuid,uuid,text,integer,jsonb)'::regprocedure AND a.grantee<>p.proowner) THEN RAISE EXCEPTION 'UNEXPECTED_GATEWAY_ACTIVATION';END IF;IF md5(replace(pg_get_functiondef('repay_native_credit_v1(uuid,uuid,text,integer,uuid,numeric,text,text,text)'::regprocedure),chr(13),''))<>'fcc46842a356d1ebf120d7bc8b126d4b' THEN RAISE EXCEPTION 'INTENT_GATEWAY_PREIMAGE_MISMATCH';END IF;IF EXISTS(SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid='repay_native_credit_v1(uuid,uuid,text,integer,uuid,numeric,text,text,text)'::regprocedure AND a.grantee<>p.proowner) THEN RAISE EXCEPTION 'UNEXPECTED_GATEWAY_ACTIVATION';END IF;IF md5(replace(pg_get_functiondef('native_cashier_shift_v1(uuid,uuid,text,integer,text,uuid,numeric,text)'::regprocedure),chr(13),''))<>'12adbcd5b874fcc8f2628701a89f60b8' THEN RAISE EXCEPTION 'INTENT_GATEWAY_PREIMAGE_MISMATCH';END IF;IF EXISTS(SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid='native_cashier_shift_v1(uuid,uuid,text,integer,text,uuid,numeric,text)'::regprocedure AND a.grantee<>p.proowner) THEN RAISE EXCEPTION 'UNEXPECTED_GATEWAY_ACTIVATION';END IF;IF md5(replace(pg_get_functiondef('create_native_expense_v1(uuid,uuid,text,integer,jsonb)'::regprocedure),chr(13),''))<>'a826398fc01b023d4c1b474523e7767e' THEN RAISE EXCEPTION 'INTENT_GATEWAY_PREIMAGE_MISMATCH';END IF;IF EXISTS(SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid='create_native_expense_v1(uuid,uuid,text,integer,jsonb)'::regprocedure AND a.grantee<>p.proowner) THEN RAISE EXCEPTION 'UNEXPECTED_GATEWAY_ACTIVATION';END IF;END$$;
ALTER TABLE backend_core.native_financial_intents ADD COLUMN operation text CHECK(operation IN ('SALE','REPAYMENT','SHIFT','EXPENSE'));
CREATE OR REPLACE FUNCTION public.create_native_sale_v1(p_store_id uuid, p_request_id uuid, p_currency text, p_revision integer, p_sale jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
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
 INSERT INTO backend_core.native_financial_intents VALUES(pg_backend_pid(),txid_current(),actor,o,p_store_id,p_request_id,'SALE');
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
END $function$
;
CREATE OR REPLACE FUNCTION public.repay_native_credit_v1(p_store_id uuid, p_request_id uuid, p_currency text, p_revision integer, p_account_id uuid, p_amount numeric, p_method text, p_reference text DEFAULT NULL::text, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
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
 INSERT INTO backend_core.native_financial_intents VALUES(pg_backend_pid(),txid_current(),actor,o,p_store_id,p_request_id,'REPAYMENT');
 lid:=public.record_credit_payment_v2(p_store_id,p_account_id,p_amount,p_method,p_reference,p_note);
 result:=jsonb_build_object('ledgerId',lid,'organizationId',o,'storeId',p_store_id,'currency',a.currency,'revision',a.revision,'amount',p_amount::text,'balance',(balance-p_amount)::text);
 INSERT INTO backend_core.native_financial_requests VALUES(p_store_id,p_request_id,o,actor,'REPAYMENT',body,result,clock_timestamp());
 DELETE FROM backend_core.native_financial_intents WHERE backend_pid=pg_backend_pid() AND transaction_id=txid_current();RETURN result;
END $function$
;
CREATE OR REPLACE FUNCTION public.native_cashier_shift_v1(p_store_id uuid, p_request_id uuid, p_currency text, p_revision integer, p_operation text, p_shift_id uuid, p_amount numeric, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
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
 INSERT INTO backend_core.native_financial_intents VALUES(pg_backend_pid(),txid_current(),actor,o,p_store_id,p_request_id,'SHIFT');
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
END $function$
;
CREATE OR REPLACE FUNCTION public.create_native_expense_v1(p_store_id uuid, p_request_id uuid, p_currency text, p_revision integer, p_expense jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE actor uuid:=backend_core.active_subject();o uuid;a proforma_backend.accounting_currency%ROWTYPE;prior backend_core.native_financial_requests%ROWTYPE;body jsonb;v_amount numeric;digits integer;eid uuid;result jsonb;
BEGIN
 IF actor IS NULL OR p_request_id IS NULL OR jsonb_typeof(p_expense) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'INVALID_NATIVE_EXPENSE';END IF;
 PERFORM public.ensure_my_store_access(p_store_id);SELECT organization_id INTO o FROM public.stores WHERE id=p_store_id;
 IF p_expense->>'organization_id' IS DISTINCT FROM o::text THEN RAISE EXCEPTION 'CURRENCY_TENANT_MISMATCH';END IF;
 body:=jsonb_build_object('currency',p_currency,'revision',p_revision,'expense',p_expense);
 PERFORM pg_advisory_xact_lock(hashtextextended(p_store_id::text||':'||p_request_id::text,0));
 SELECT * INTO prior FROM backend_core.native_financial_requests WHERE store_id=p_store_id AND request_id=p_request_id;
 IF FOUND THEN IF prior.actor_id<>actor OR prior.organization_id<>o OR prior.operation<>'EXPENSE' OR prior.payload<>body THEN RAISE EXCEPTION 'NATIVE_REQUEST_CONFLICT';END IF;RETURN prior.result;END IF;
 SELECT * INTO a FROM proforma_backend.accounting_currency WHERE organization_id=o;
 IF NOT FOUND OR a.currency IS DISTINCT FROM p_currency OR a.revision IS DISTINCT FROM p_revision THEN RAISE EXCEPTION 'OFFLINE_CURRENCY_REVIEW_REQUIRED';END IF;
 IF NOT EXISTS(SELECT 1 FROM backend_core.native_financial_rollout WHERE organization_id=o AND currency=a.currency AND revision=a.revision AND enabled) THEN RAISE EXCEPTION 'NATIVE_FINANCIAL_POSTING_NOT_CERTIFIED';END IF;
 SELECT minor_units INTO digits FROM proforma_backend.currency_catalog WHERE code=a.currency;
 IF digits IS NULL OR coalesce(p_expense->>'amount','')!~'^\d{1,18}(\.\d{1,12})?$' THEN RAISE EXCEPTION 'INVALID_EXPENSE_AMOUNT';END IF;
 v_amount:=(p_expense->>'amount')::numeric;
 IF v_amount<=0 OR v_amount<>round(v_amount,digits) THEN RAISE EXCEPTION 'INVALID_TENDER_PRECISION';END IF;
 IF p_expense->>'payment_method' IS NULL OR p_expense->>'payment_method' NOT IN ('CASH','MOBILE','BANK') THEN RAISE EXCEPTION 'INVALID_NATIVE_PAYMENT';END IF;
 INSERT INTO backend_core.native_financial_intents VALUES(pg_backend_pid(),txid_current(),actor,o,p_store_id,p_request_id,'EXPENSE');
 eid:=public.create_expense_v2(p_store_id,v_amount,p_expense->>'category',p_expense->>'note',p_expense->>'payment_method',(p_expense->>'expense_date')::date,NULL);
 SELECT jsonb_build_object('expenseId',e.id,'organizationId',e.organization_id,'storeId',e.store_id,'amount',e.amount::text,'currency',e.currency_context->>'currency','revision',(e.currency_context->>'contextRevision')::integer,'paymentMethod',e.payment_method,'expenseDate',e.expense_date,'accountSettlementCertified',false) INTO result FROM public.expenses e WHERE e.id=eid AND e.store_id=p_store_id AND e.organization_id=o AND e.amount=v_amount;
 IF result IS NULL OR result->>'currency' IS DISTINCT FROM a.currency THEN RAISE EXCEPTION 'EXPENSE_RECONCILIATION_FAILED';END IF;
 INSERT INTO backend_core.native_financial_requests VALUES(p_store_id,p_request_id,o,actor,'EXPENSE',body,result,clock_timestamp());
 DELETE FROM backend_core.native_financial_intents WHERE backend_pid=pg_backend_pid() AND transaction_id=txid_current();RETURN result;
END $function$
;
-- Unsupported native operations are excluded at the database boundary, not
-- merely hidden in clients. Existing TZS/unknown historical paths are retained.
CREATE FUNCTION backend_core.native_unverified_writer_guard_v1() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE r jsonb;oldr jsonb;o uuid;s uuid;old_o uuid;old_s uuid;currency text;old_currency text;record_currency text;actor uuid:=backend_core.active_subject();admitted boolean:=false;
BEGIN
 r:=CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
 IF TG_OP='UPDATE' THEN oldr:=to_jsonb(OLD);END IF;
 o:=nullif(r->>'organization_id','')::uuid;s:=nullif(r->>'store_id','')::uuid;
 IF TG_TABLE_NAME='sale_items' THEN
  SELECT organization_id,store_id,currency_context->>'currency' INTO o,s,record_currency FROM public.sales WHERE id=(r->>'sale_id')::uuid;
 END IF;
 IF o IS NULL AND s IS NOT NULL THEN SELECT organization_id INTO o FROM public.stores WHERE id=s;END IF;
 SELECT a.currency INTO currency FROM proforma_backend.accounting_currency a WHERE a.organization_id=o;
 IF TG_OP='UPDATE' THEN
  old_o:=nullif(oldr->>'organization_id','')::uuid;old_s:=nullif(oldr->>'store_id','')::uuid;
  IF TG_TABLE_NAME='sale_items' THEN SELECT organization_id,store_id,currency_context->>'currency' INTO old_o,old_s,old_currency FROM public.sales WHERE id=(oldr->>'sale_id')::uuid;END IF;
  IF old_o IS NULL AND old_s IS NOT NULL THEN SELECT organization_id INTO old_o FROM public.stores WHERE id=old_s;END IF;
  IF old_currency IS NULL THEN SELECT a.currency INTO old_currency FROM proforma_backend.accounting_currency a WHERE a.organization_id=old_o;END IF;
 END IF;
 record_currency:=coalesce(record_currency,r->'currency_context'->>'currency');
 IF coalesce(currency,'TZS')='TZS' AND coalesce(record_currency,'TZS')='TZS' AND coalesce(old_currency,'TZS')='TZS' THEN IF TG_OP='DELETE' THEN RETURN OLD;END IF;RETURN NEW;END IF;
 IF TG_OP='UPDATE' AND ((oldr->>'organization_id') IS DISTINCT FROM (r->>'organization_id') OR (oldr->>'store_id') IS DISTINCT FROM (r->>'store_id') OR (oldr->>'sale_id') IS DISTINCT FROM (r->>'sale_id')) THEN RAISE EXCEPTION 'NATIVE_FINANCIAL_SCOPE_IMMUTABLE';END IF;
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'NATIVE_REVERSAL_CONTRACT_REQUIRED';END IF;
 -- Nonmonetary presentation edits retain existing RLS permissions.
 IF TG_TABLE_NAME='products' AND TG_OP='UPDATE' AND r-ARRAY['name','description','image_url','updated_at','updated_by','is_active']=oldr-ARRAY['name','description','image_url','updated_at','updated_by','is_active'] THEN RETURN NEW;END IF;
 IF TG_TABLE_NAME='credit_accounts_v2' AND (TG_OP='INSERT' OR (TG_OP='UPDATE' AND r-ARRAY['name','full_name','phone','note','updated_at','updated_by']=oldr-ARRAY['name','full_name','phone','note','updated_at','updated_by'])) THEN RETURN NEW;END IF;
 -- Only the already-validated canonical sale transaction may write stock.
 IF TG_TABLE_NAME IN ('inventory','stock_movements','products','sale_items') THEN
  SELECT EXISTS(SELECT 1 FROM backend_core.native_financial_intents i WHERE i.operation='SALE' AND i.backend_pid=pg_backend_pid() AND i.transaction_id=txid_current() AND i.actor_id=actor AND i.organization_id=o AND (s IS NULL OR i.store_id=s)) INTO admitted;
 ELSIF TG_TABLE_NAME='credit_ledger_v2' AND TG_OP='INSERT' THEN
  SELECT EXISTS(SELECT 1 FROM backend_core.native_financial_intents i WHERE i.operation IN ('SALE','REPAYMENT') AND i.backend_pid=pg_backend_pid() AND i.transaction_id=txid_current() AND i.actor_id=actor AND i.organization_id=o AND i.store_id=s) INTO admitted;
 END IF;
 IF NOT admitted THEN RAISE EXCEPTION 'NATIVE_WRITER_CONTRACT_NOT_CERTIFIED';END IF;
 IF TG_OP='DELETE' THEN RETURN OLD;END IF;RETURN NEW;
END $$;
DO $$ DECLARE t text;r record;fn regprocedure:='backend_core.native_unverified_writer_guard_v1()'::regprocedure;BEGIN
 FOREACH t IN ARRAY ARRAY['inventory','stock_movements','products','sale_items','credit_accounts_v2','credit_ledger_v2','business_debts','field_wallets','field_wallet_transactions'] LOOP
 EXECUTE format('CREATE TRIGGER native_unverified_writer_guard_v1 BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION backend_core.native_unverified_writer_guard_v1()',t);
 END LOOP;
 -- Sale/payment INSERT/UPDATE already have exact 1904/1905/1906 guards.
 FOREACH t IN ARRAY ARRAY['sales','sale_payments','cashier_shifts'] LOOP
 EXECUTE format('CREATE TRIGGER native_unverified_writer_guard_v1 BEFORE DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION backend_core.native_unverified_writer_guard_v1()',t);
 END LOOP;
 EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC',fn);
 FOR r IN SELECT DISTINCT pg_get_userbyid(a.grantee) AS name FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid=fn AND a.grantee<>p.proowner AND a.grantee<>0 LOOP EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %I',fn,r.name);END LOOP;
END $$;

COMMIT;
