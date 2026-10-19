BEGIN READ ONLY;SET LOCAL statement_timeout='20s';
WITH old_orgs AS (SELECT organization_id FROM public.org_memberships WHERE user_id='bb2d6dee-773d-4fa7-8fda-1eb85bbad2cd'::uuid AND organization_id IS DISTINCT FROM (SELECT (result->>'organizationId')::uuid FROM backend_core.tzs_onboarding_canary_quota WHERE actor_id='bb2d6dee-773d-4fa7-8fda-1eb85bbad2cd')),
old_stores AS (SELECT id FROM public.stores WHERE organization_id IN(SELECT organization_id FROM old_orgs)),
checks AS (
 SELECT 'organizations' AS name,count(*) AS rows,md5(coalesce(string_agg(md5(to_jsonb(r)::text),'' ORDER BY to_jsonb(r)::text),'')) AS fingerprint FROM public.organizations r WHERE id IN(SELECT organization_id FROM old_orgs)
 UNION ALL SELECT 'stores',count(*),md5(coalesce(string_agg(md5(to_jsonb(r)::text),'' ORDER BY to_jsonb(r)::text),'')) FROM public.stores r WHERE id IN(SELECT id FROM old_stores)
 UNION ALL SELECT 'memberships',count(*),md5(coalesce(string_agg(md5(to_jsonb(r)::text),'' ORDER BY to_jsonb(r)::text),'')) FROM public.org_memberships r WHERE organization_id IN(SELECT organization_id FROM old_orgs)
 UNION ALL SELECT 'sales',count(*),md5(coalesce(string_agg(md5(to_jsonb(r)::text),'' ORDER BY to_jsonb(r)::text),'')) FROM public.sales r WHERE organization_id IN(SELECT organization_id FROM old_orgs)
 UNION ALL SELECT 'payments',count(*),md5(coalesce(string_agg(md5(to_jsonb(r)::text),'' ORDER BY to_jsonb(r)::text),'')) FROM public.sale_payments r WHERE organization_id IN(SELECT organization_id FROM old_orgs)
 UNION ALL SELECT 'inventory',count(*),md5(coalesce(string_agg(md5(to_jsonb(r)::text),'' ORDER BY to_jsonb(r)::text),'')) FROM public.inventory r WHERE organization_id IN(SELECT organization_id FROM old_orgs)
 UNION ALL SELECT 'stock_movements',count(*),md5(coalesce(string_agg(md5(to_jsonb(r)::text),'' ORDER BY to_jsonb(r)::text),'')) FROM public.stock_movements r WHERE organization_id IN(SELECT organization_id FROM old_orgs)
 UNION ALL SELECT 'expenses',count(*),md5(coalesce(string_agg(md5(to_jsonb(r)::text),'' ORDER BY to_jsonb(r)::text),'')) FROM public.expenses r WHERE organization_id IN(SELECT organization_id FROM old_orgs)
 UNION ALL SELECT 'cashier_shifts',count(*),md5(coalesce(string_agg(md5(to_jsonb(r)::text),'' ORDER BY to_jsonb(r)::text),'')) FROM public.cashier_shifts r WHERE organization_id IN(SELECT organization_id FROM old_orgs)
 UNION ALL SELECT 'credit_ledger',count(*),md5(coalesce(string_agg(md5(to_jsonb(r)::text),'' ORDER BY to_jsonb(r)::text),'')) FROM public.credit_ledger_v2 r WHERE store_id IN(SELECT id FROM old_stores)
 UNION ALL SELECT 'organization_subscriptions',count(*),md5(coalesce(string_agg(md5(to_jsonb(r)::text),'' ORDER BY to_jsonb(r)::text),'')) FROM public.organization_subscriptions r WHERE organization_id IN(SELECT organization_id FROM old_orgs)
 UNION ALL SELECT 'plans',count(*),md5(coalesce(string_agg(md5(to_jsonb(r)::text),'' ORDER BY to_jsonb(r)::text),'')) FROM public.plans r
)
SELECT jsonb_build_object('checks',(SELECT jsonb_agg(to_jsonb(c) ORDER BY name) FROM checks c),'oldOrganizationCount',(SELECT count(*) FROM old_orgs)) metadata;
ROLLBACK;
