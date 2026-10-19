BEGIN;SET LOCAL lock_timeout='2s';SET LOCAL statement_timeout='30s';
DO $$BEGIN IF to_regprocedure('public.create_native_expense_v1(uuid,uuid,text,integer,jsonb)') IS NULL OR to_regprocedure('backend_core.protect_native_expense_v1()') IS NULL THEN RAISE EXCEPTION 'VERIFIED_1906_REQUIRED';END IF;END$$;
-- Exact original facts only; no historical denomination inference or FX posting.
CREATE FUNCTION public.read_original_financial_facts_v1(p_store_id uuid,p_kind text,p_from timestamptz,p_to timestamptz,p_limit integer DEFAULT 200,p_offset integer DEFAULT 0,p_snapshot timestamptz DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid:=backend_core.active_subject();o uuid;rows jsonb;v_snapshot timestamptz:=coalesce(p_snapshot,statement_timestamp());
BEGIN
 IF actor IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED';END IF;
 PERFORM public.ensure_my_store_access(p_store_id);SELECT organization_id INTO o FROM public.stores WHERE id=p_store_id;
 IF o IS NULL OR p_from IS NULL OR p_to IS NULL OR p_to<=p_from OR p_to-p_from>interval '367 days' OR p_limit IS NULL OR p_offset IS NULL OR p_limit NOT BETWEEN 1 AND 200 OR p_offset NOT BETWEEN 0 AND 100000 THEN RAISE EXCEPTION 'INVALID_FINANCIAL_READ_SCOPE';END IF;
 IF v_snapshot>statement_timestamp() OR v_snapshot<statement_timestamp()-interval '15 minutes' THEN RAISE EXCEPTION 'INVALID_REPORT_SNAPSHOT';END IF;
 IF p_kind NOT IN ('SALE','PAYMENT','EXPENSE','CREDIT','COGS','STOCK') OR p_kind IS NULL THEN RAISE EXCEPTION 'INVALID_FINANCIAL_READ_KIND';END IF;
 IF p_kind IN ('COGS','STOCK') AND NOT EXISTS(SELECT 1 FROM public.org_memberships m WHERE m.organization_id=o AND m.user_id=actor AND m.is_active AND lower(m.role)='owner') THEN RAISE EXCEPTION 'OWNER_PROFIT_ACCESS_REQUIRED';END IF;
 IF p_kind='SALE' THEN
  SELECT coalesce(jsonb_agg(f ORDER BY f->>'at',f->>'id'),'[]') INTO rows FROM (
   SELECT jsonb_build_object('id',s.id,'at',s.sold_at,'context',s.currency_context,'values',jsonb_build_object('total',s.grand_total::text,'paid',s.paid_amount::text,'balance',s.balance_amount::text,'discount',s.discount_amount::text,'rounding',s.settlement_rounding::text,'itemCount',(SELECT count(*) FROM public.sale_items li WHERE li.sale_id=s.id)::text)) f
   FROM public.sales s WHERE s.organization_id=o AND s.store_id=p_store_id AND s.sold_at>=p_from AND s.sold_at<p_to AND s.created_at<=v_snapshot AND coalesce(s.status,'COMPLETED')='COMPLETED' ORDER BY s.sold_at,s.id LIMIT p_limit OFFSET p_offset) t;
 ELSIF p_kind='PAYMENT' THEN
  SELECT coalesce(jsonb_agg(f ORDER BY f->>'at',f->>'id'),'[]') INTO rows FROM (
   SELECT jsonb_build_object('id',p.id,'at',p.created_at,'context',p.currency_context,'parentId',p.sale_id,'method',p.payment_method,'values',jsonb_build_object('amount',p.paid_amount::text)) f
   FROM public.sale_payments p JOIN public.sales s ON s.id=p.sale_id AND s.organization_id=p.organization_id AND s.store_id=p.store_id WHERE p.organization_id=o AND p.store_id=p_store_id AND p.created_at>=p_from AND p.created_at<p_to AND p.created_at<=v_snapshot ORDER BY p.created_at,p.id LIMIT p_limit OFFSET p_offset) t;
 ELSIF p_kind='EXPENSE' THEN
  SELECT coalesce(jsonb_agg(f ORDER BY f->>'at',f->>'id'),'[]') INTO rows FROM (
   SELECT jsonb_build_object('id',e.id,'at',e.expense_date,'context',e.currency_context,'method',e.payment_method,'category',e.category_name,'values',jsonb_build_object('amount',e.amount::text)) f
   FROM public.expenses e WHERE e.organization_id=o AND e.store_id=p_store_id AND e.expense_date>=(p_from AT TIME ZONE 'UTC')::date AND e.expense_date<(p_to AT TIME ZONE 'UTC')::date AND e.created_at<=v_snapshot ORDER BY e.expense_date,e.id LIMIT p_limit OFFSET p_offset) t;
 ELSIF p_kind='CREDIT' THEN
  SELECT coalesce(jsonb_agg(f ORDER BY f->>'at',f->>'id'),'[]') INTO rows FROM (
   SELECT jsonb_build_object('id',c.id,'at',c.created_at,'context',c.currency_context,'parentId',c.credit_account_id,'values',jsonb_build_object('amount',c.delta::text)) f
   FROM public.credit_ledger_v2 c JOIN public.credit_accounts_v2 a ON a.id=c.credit_account_id AND a.store_id=c.store_id WHERE c.store_id=p_store_id AND c.created_at>=p_from AND c.created_at<p_to AND c.created_at<=v_snapshot ORDER BY c.created_at,c.id LIMIT p_limit OFFSET p_offset) t;
 ELSIF p_kind='COGS' THEN
  SELECT coalesce(jsonb_agg(f ORDER BY f->>'at',f->>'id'),'[]') INTO rows FROM (
   SELECT jsonb_build_object('id',i.id,'at',s.sold_at,'context',s.currency_context,'parentId',s.id,'values',jsonb_build_object('amount',(i.qty*i.unit_cost)::text,'quantity',i.qty::text,'unitCost',i.unit_cost::text)) f
   FROM public.sale_items i JOIN public.sales s ON s.id=i.sale_id WHERE s.organization_id=o AND s.store_id=p_store_id AND s.sold_at>=p_from AND s.sold_at<p_to AND s.created_at<=v_snapshot AND coalesce(s.status,'COMPLETED')='COMPLETED' ORDER BY s.sold_at,i.id LIMIT p_limit OFFSET p_offset) t;
 ELSE
  SELECT coalesce(jsonb_agg(f ORDER BY f->>'id'),'[]') INTO rows FROM (
   SELECT jsonb_build_object('id','stock-'||md5(o::text||p_store_id::text||coalesce(p.currency_context::text,'UNVERIFIED')),'at',statement_timestamp(),'context',p.currency_context,'valueSource','CURRENT_CATALOG_COST_NOT_RECEIPT_ATTESTATION','values',jsonb_build_object('amount',CASE WHEN p.currency_context IS NOT NULL AND bool_and(i.qty IS NOT NULL AND p.cost_price IS NOT NULL) THEN sum(i.qty*p.cost_price)::text ELSE NULL END,'productCount',count(*)::text)) f
   FROM public.inventory i JOIN public.products p ON p.id=i.product_id AND p.organization_id=o WHERE i.store_id=p_store_id AND i.organization_id=o GROUP BY p.currency_context ORDER BY p.currency_context::text LIMIT p_limit OFFSET p_offset) t;
 END IF;
 RETURN jsonb_build_object('organizationId',o,'storeId',p_store_id,'kind',p_kind,'rows',rows,'offset',p_offset,'limit',p_limit,'snapshot',v_snapshot,'periodSemantics',CASE WHEN p_kind='EXPENSE' THEN 'EXPENSE_DATE_UTC_DATE_BOUNDS' WHEN p_kind='STOCK' THEN 'CURRENT_SNAPSHOT_NOT_HISTORICAL' ELSE 'TIMESTAMP_HALF_OPEN' END,'postingAllowed',false);
END $$;
DO $$ DECLARE r record;fn regprocedure:='public.read_original_financial_facts_v1(uuid,text,timestamp with time zone,timestamp with time zone,integer,integer,timestamp with time zone)'::regprocedure;BEGIN
 EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC',fn);
 FOR r IN SELECT DISTINCT pg_get_userbyid(a.grantee) AS name FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid=fn AND a.grantee<>p.proowner AND a.grantee<>0 LOOP EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %I',fn,r.name);END LOOP;
END $$;

COMMIT;
