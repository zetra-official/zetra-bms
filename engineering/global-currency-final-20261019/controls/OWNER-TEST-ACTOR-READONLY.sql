BEGIN READ ONLY;
SET LOCAL statement_timeout='10s';
WITH target AS (SELECT id,email_confirmed_at IS NOT NULL AS email_confirmed,
 deleted_at IS NOT NULL AS deleted,banned_until>clock_timestamp() AS banned,
 role,is_anonymous,raw_app_meta_data->>'purpose' AS admin_purpose,
 raw_app_meta_data->'providers' AS providers,raw_user_meta_data->>'purpose' AS user_asserted_purpose
 FROM auth.users WHERE lower(email)=lower('majaribiopro@gmail.com'))
SELECT jsonb_build_object('matchedCount',(SELECT count(*) FROM target),
 'actors',(SELECT coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) FROM target t),
 'memberships',(SELECT coalesce(jsonb_agg(jsonb_build_object('organizationId',m.organization_id,'role',m.role,'active',m.is_active)),'[]'::jsonb) FROM public.org_memberships m JOIN target t ON m.user_id=t.id),
 'storesInMemberOrganizations',(SELECT count(*) FROM public.stores s WHERE s.organization_id IN(SELECT m.organization_id FROM public.org_memberships m JOIN target t ON m.user_id=t.id)),
 'relatedColumns',(SELECT coalesce(jsonb_agg(jsonb_build_object('schema',table_schema,'table',table_name,'column',column_name,'type',data_type)),'[]'::jsonb) FROM information_schema.columns WHERE table_schema IN('public','backend_core','proforma_backend') AND column_name IN('user_id','actor_id','created_by','owner_id','organization_id','store_id') AND data_type='uuid'),
 'rolloutEnabled',(SELECT enabled FROM backend_core.tzs_onboarding_rollout WHERE singleton)
) metadata;
ROLLBACK;
