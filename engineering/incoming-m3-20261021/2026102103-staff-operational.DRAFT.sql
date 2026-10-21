-- LOCAL REVIEW DRAFT. Not executed or certified; no hosted authorization.
-- New read contract only. Existing permissions, tables and writers are unchanged.
BEGIN;
CREATE FUNCTION public.m3_staff_operational_v1(p_org_id uuid,p_store_id uuid,p_day date DEFAULT NULL,p_offset integer DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid:=auth.uid(); member uuid; zone text; day date; first_time timestamptz; last_time timestamptz; currency_info jsonb; answer jsonb;
BEGIN
 IF actor IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='AUTH_REQUIRED'; END IF;
 PERFORM security_m2.require_store(p_org_id,p_store_id);
 IF (SELECT count(*) FROM public.org_memberships m WHERE m.organization_id=p_org_id AND m.user_id=actor AND m.is_active IS TRUE)<>1 THEN
  RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='AMBIGUOUS_MEMBERSHIP'; END IF;
 SELECT m.id INTO member FROM public.org_memberships m
 WHERE m.organization_id=p_org_id AND m.user_id=actor AND m.role='staff' AND m.is_active IS TRUE
 AND EXISTS(SELECT 1 FROM public.org_membership_stores a WHERE a.membership_id=m.id AND a.store_id=p_store_id);
 IF member IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='STAFF_ASSIGNED_STORE_REQUIRED'; END IF;
 IF p_offset IS NULL OR p_offset<0 OR p_offset>100000 THEN RAISE EXCEPTION 'INVALID_PAGE'; END IF;
 SELECT o.timezone INTO STRICT zone FROM public.organizations o WHERE o.id=p_org_id AND o.is_active IS TRUE;
 day:=coalesce(p_day,(current_timestamp AT TIME ZONE zone)::date);
 IF day>(current_timestamp AT TIME ZONE zone)::date THEN RAISE EXCEPTION 'INVALID_DAY'; END IF;
 first_time:=day::timestamp AT TIME ZONE zone;last_time:=(day+1)::timestamp AT TIME ZONE zone;
 BEGIN
  currency_info:=public.get_org_accounting_currency_v1(p_org_id);
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM<>'ACCOUNTING_CURRENCY_UNCONFIRMED' THEN RAISE; END IF;
  currency_info:=NULL; -- existing certified legacy readers are TZS-only
 END;
 IF currency_info IS NOT NULL AND currency_info->>'currency' IS DISTINCT FROM 'TZS' THEN RAISE EXCEPTION 'NATIVE_CURRENCY_READER_UNVERIFIED'; END IF;
 WITH eligible AS (
  SELECT s.* FROM public.sales s WHERE s.organization_id=p_org_id AND s.store_id=p_store_id
  AND s.status='COMPLETED'
 ), own_sales AS (
  SELECT s.id,s.sold_at,coalesce(s.grand_total,s.total_amount) amount,s.paid_amount,s.amount_paid
  FROM eligible s WHERE s.sold_at>=first_time AND s.sold_at<last_time
  AND coalesce(s.sold_by_membership_id,s.sold_by_membership)=member
  AND (s.sold_by_membership_id IS NULL OR s.sold_by_membership IS NULL OR s.sold_by_membership_id=s.sold_by_membership)
 ), own_payments AS (
  SELECT p.id,p.created_at,p.paid_amount amount FROM public.sale_payments p
  JOIN eligible s ON s.id=p.sale_id AND s.organization_id=p.organization_id AND s.store_id=p.store_id
  WHERE p.organization_id=p_org_id AND p.store_id=p_store_id
  AND p.created_at>=first_time AND p.created_at<last_time AND p.received_by_membership_id=member
  AND (p.created_by IS NULL OR p.created_by=actor)
  AND upper(p.payment_method) IN ('CASH','BANK','MOBILE','CARD','TRANSFER')
 ), own_expenses AS (
  SELECT e.id,e.created_at,e.amount FROM public.expenses e WHERE e.organization_id=p_org_id AND e.store_id=p_store_id
  AND e.expense_date=day AND e.created_by_membership_id=member AND (e.created_by IS NULL OR e.created_by=actor)
 ), coverage AS (
  -- Header paid fields are not evidence of who collected money. Never infer cash.
  SELECT NOT EXISTS(SELECT 1 FROM own_sales s WHERE greatest(coalesce(s.paid_amount,0),coalesce(s.amount_paid,0))>0
   AND NOT EXISTS(SELECT 1 FROM public.sale_payments p WHERE p.sale_id=s.id AND p.organization_id=p_org_id AND p.store_id=p_store_id))
  AND NOT EXISTS(SELECT 1 FROM public.sale_payments p JOIN eligible s ON s.id=p.sale_id
   WHERE p.organization_id=p_org_id AND p.store_id=p_store_id AND p.created_at>=first_time AND p.created_at<last_time
   AND (p.received_by_membership_id=member OR p.created_by=actor)
   AND (p.received_by_membership_id IS DISTINCT FROM member OR p.created_by IS NOT NULL AND p.created_by<>actor
    OR p.paid_amount<0 OR upper(p.payment_method) NOT IN ('CASH','BANK','MOBILE','CARD','TRANSFER'))) ok,
  NOT EXISTS(SELECT 1 FROM eligible s WHERE s.sold_at>=first_time AND s.sold_at<last_time AND
   (s.created_by=actor AND s.sold_by_membership_id IS NULL AND s.sold_by_membership IS NULL
    OR (s.sold_by_membership_id=member OR s.sold_by_membership=member) AND s.sold_by_membership_id IS NOT NULL AND s.sold_by_membership IS NOT NULL AND s.sold_by_membership_id<>s.sold_by_membership)) sales_ok,
  NOT EXISTS(SELECT 1 FROM public.expenses e WHERE e.organization_id=p_org_id AND e.store_id=p_store_id AND e.expense_date=day
   AND (e.created_by=actor OR e.created_by_membership_id=member)
   AND (e.created_by_membership_id IS DISTINCT FROM member OR e.created_by IS NOT NULL AND e.created_by<>actor)) expenses_ok
 ), history AS (
  SELECT 'SALE'::text kind,id,sold_at at,amount FROM own_sales UNION ALL
  SELECT 'PAYMENT',id,created_at,amount FROM own_payments WHERE amount>=0 UNION ALL
  SELECT 'EXPENSE',id,created_at,amount FROM own_expenses
 ), page AS (SELECT * FROM history ORDER BY at DESC,kind,id LIMIT 50 OFFSET p_offset)
 SELECT jsonb_build_object('version',1,'actor_id',actor,'organization_id',p_org_id,'store_id',p_store_id,'day',day,'timezone',zone,'currency','TZS',
  'sales',CASE WHEN (SELECT sales_ok FROM coverage) THEN (SELECT coalesce(sum(amount),0)::text FROM own_sales) ELSE NULL END,
  'sales_status',CASE WHEN (SELECT sales_ok FROM coverage) THEN 'VERIFIED' ELSE 'ATTRIBUTION_UNAVAILABLE' END,
  'orders',CASE WHEN (SELECT sales_ok FROM coverage) THEN (SELECT count(*) FROM own_sales) ELSE NULL END,
  'money_in',CASE WHEN (SELECT ok FROM coverage) THEN (SELECT coalesce(sum(amount),0)::text FROM own_payments) ELSE NULL END,
  'money_status',CASE WHEN (SELECT ok FROM coverage) THEN 'VERIFIED_GROSS_COLLECTIONS' ELSE 'ATTRIBUTION_UNAVAILABLE' END,
  'expenses',CASE WHEN (SELECT expenses_ok FROM coverage) THEN (SELECT coalesce(sum(amount),0)::text FROM own_expenses) ELSE NULL END,
  'expenses_status',CASE WHEN (SELECT expenses_ok FROM coverage) THEN 'VERIFIED' ELSE 'ATTRIBUTION_UNAVAILABLE' END,
  'average',CASE WHEN (SELECT sales_ok FROM coverage) THEN (SELECT CASE WHEN count(*)=0 THEN '0' ELSE round(sum(amount)/count(*),2)::text END FROM own_sales) ELSE NULL END,
  'history_total',(SELECT count(*) FROM history),'history',coalesce((SELECT jsonb_agg(jsonb_build_object('kind',kind,'id',id,'at',at,'amount',amount::text) ORDER BY at DESC,kind,id) FROM page),'[]'::jsonb)) INTO answer;
 RETURN answer;
END;
$$;
REVOKE ALL ON FUNCTION public.m3_staff_operational_v1(uuid,uuid,date,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.m3_staff_operational_v1(uuid,uuid,date,integer) TO authenticated;
COMMIT;
