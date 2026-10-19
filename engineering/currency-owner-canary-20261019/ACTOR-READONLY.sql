BEGIN READ ONLY;SET LOCAL statement_timeout='10s';
-- Administrative read-only diagnostic context, NOT genuine Auth acceptance.
SELECT set_config('request.jwt.claims','{"sub":"bb2d6dee-773d-4fa7-8fda-1eb85bbad2cd","role":"authenticated"}',true);
SELECT jsonb_build_object('project','dcmhqdckzhbuakvcyjit',
 'actor',(SELECT jsonb_build_object('id',id,'emailMatchesDirective',lower(email)='majaribiapro@gmail.com','emailMatchesPreviouslyInspected',lower(email)='majaribiopro@gmail.com','confirmed',email_confirmed_at IS NOT NULL,'deleted',deleted_at IS NOT NULL,'banned',coalesce(banned_until>clock_timestamp(),false),'anonymous',is_anonymous) FROM auth.users WHERE id='bb2d6dee-773d-4fa7-8fda-1eb85bbad2cd'),
 'ownedOrganizations',(SELECT count(DISTINCT organization_id) FROM public.org_memberships WHERE user_id='bb2d6dee-773d-4fa7-8fda-1eb85bbad2cd' AND role='owner'),
 'effectivePlan',(SELECT jsonb_build_object('planCode',plan_code,'maxOrganizations',max_organizations) FROM public._get_my_effective_plan() LIMIT 1),
 'gatewayMd5',md5(replace(pg_get_functiondef('public.create_org_with_store_currency_tzs_v1(uuid,text,text,text,text,boolean)'::regprocedure),chr(13),'')),
 'enabled',(SELECT enabled FROM backend_core.tzs_onboarding_rollout WHERE singleton),
 'quotaAbsent',to_regclass('backend_core.tzs_onboarding_canary_quota') IS NULL,
 'planDefinition',pg_get_functiondef('public._get_my_effective_plan()'::regprocedure)
) metadata;
ROLLBACK;
