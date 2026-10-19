BEGIN READ ONLY;SET LOCAL statement_timeout='10s';
WITH marked AS (
 SELECT id FROM auth.users u WHERE u.id<>'bb2d6dee-773d-4fa7-8fda-1eb85bbad2cd'::uuid
 AND (raw_app_meta_data->>'purpose' IN('currency_canary','tzs_onboarding_canary','dedicated_test') OR raw_app_meta_data->>'environment' IN('test','testing','synthetic'))
),eligible AS (
 SELECT u.id FROM auth.users u JOIN marked m USING(id)
 WHERE u.email_confirmed_at IS NOT NULL AND u.deleted_at IS NULL AND (u.banned_until IS NULL OR u.banned_until<=clock_timestamp()) AND u.role='authenticated' AND NOT coalesce(u.is_anonymous,false)
 AND NOT EXISTS(SELECT 1 FROM public.org_memberships WHERE user_id=u.id)
 AND NOT EXISTS(SELECT 1 FROM public.organizations WHERE created_by=u.id)
 AND NOT EXISTS(SELECT 1 FROM public.stores WHERE created_by=u.id)
 AND NOT EXISTS(SELECT 1 FROM public.sales WHERE created_by=u.id)
 AND NOT EXISTS(SELECT 1 FROM public.sale_payments WHERE created_by=u.id)
 AND NOT EXISTS(SELECT 1 FROM public.stock_movements WHERE created_by=u.id)
 AND NOT EXISTS(SELECT 1 FROM public.expenses WHERE created_by=u.id)
 AND NOT EXISTS(SELECT 1 FROM public.cashier_shifts WHERE created_by=u.id)
 AND NOT EXISTS(SELECT 1 FROM public.field_wallets WHERE created_by=u.id)
)
SELECT jsonb_build_object('markedCount',(SELECT count(*) FROM marked),'eligibleCount',(SELECT count(*) FROM eligible),'candidateIds',(SELECT coalesce(jsonb_agg(id),'[]'::jsonb) FROM eligible),'scope','Explicit administrator-marked candidates; bounded absence checks, not all historical attribution','canaryActivated',false) metadata;
ROLLBACK;
