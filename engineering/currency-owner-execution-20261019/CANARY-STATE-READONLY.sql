BEGIN READ ONLY;SET LOCAL statement_timeout='15s';
SELECT jsonb_build_object('enabled',(SELECT enabled FROM backend_core.tzs_onboarding_rollout WHERE singleton),
 'allowlist',(SELECT coalesce(jsonb_agg(jsonb_build_object('actor',actor_id,'expiresAt',expires_at,'approval',approval_reference)),'[]'::jsonb) FROM backend_core.tzs_onboarding_allowlist),
 'quota',(SELECT to_jsonb(q) FROM backend_core.tzs_onboarding_canary_quota q WHERE actor_id='bb2d6dee-773d-4fa7-8fda-1eb85bbad2cd'),
 'permits',(SELECT count(*) FROM backend_core.tzs_canary_creation_permits),
 'audit',(SELECT coalesce(jsonb_agg(jsonb_build_object('action',action,'actor',actor_id,'at',occurred_at,'approval',approval_reference) ORDER BY id),'[]'::jsonb) FROM backend_core.tzs_onboarding_rollout_audit),
 'orgCount',(SELECT count(*) FROM public.organizations WHERE id=(SELECT (result->>'organizationId')::uuid FROM backend_core.tzs_onboarding_canary_quota WHERE actor_id='bb2d6dee-773d-4fa7-8fda-1eb85bbad2cd')),
 'storeCount',(SELECT count(*) FROM public.stores WHERE organization_id=(SELECT (result->>'organizationId')::uuid FROM backend_core.tzs_onboarding_canary_quota WHERE actor_id='bb2d6dee-773d-4fa7-8fda-1eb85bbad2cd')),
 'financialRows',(SELECT count(*) FROM public.sales WHERE organization_id=(SELECT (result->>'organizationId')::uuid FROM backend_core.tzs_onboarding_canary_quota WHERE actor_id='bb2d6dee-773d-4fa7-8fda-1eb85bbad2cd'))+(SELECT count(*) FROM public.sale_payments WHERE organization_id=(SELECT (result->>'organizationId')::uuid FROM backend_core.tzs_onboarding_canary_quota WHERE actor_id='bb2d6dee-773d-4fa7-8fda-1eb85bbad2cd'))+(SELECT count(*) FROM public.stock_movements WHERE organization_id=(SELECT (result->>'organizationId')::uuid FROM backend_core.tzs_onboarding_canary_quota WHERE actor_id='bb2d6dee-773d-4fa7-8fda-1eb85bbad2cd'))+(SELECT count(*) FROM public.expenses WHERE organization_id=(SELECT (result->>'organizationId')::uuid FROM backend_core.tzs_onboarding_canary_quota WHERE actor_id='bb2d6dee-773d-4fa7-8fda-1eb85bbad2cd'))
) metadata;
ROLLBACK;
