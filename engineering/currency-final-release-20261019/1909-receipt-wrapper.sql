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
