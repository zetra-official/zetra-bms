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
