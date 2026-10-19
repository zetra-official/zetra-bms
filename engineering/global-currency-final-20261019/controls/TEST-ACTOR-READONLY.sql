BEGIN READ ONLY;
SET LOCAL statement_timeout='10s';
-- Only explicit administrator-owned test-purpose markers qualify as candidates.
-- No customer emails, credentials, identities or transaction records are selected.
WITH marked AS (
 SELECT id,email_confirmed_at IS NOT NULL AS confirmed,deleted_at IS NULL AS not_deleted,
 banned_until IS NULL OR banned_until<=clock_timestamp() AS not_banned
 FROM auth.users
 WHERE raw_app_meta_data->>'purpose' IN ('currency_canary','tzs_onboarding_canary','dedicated_test')
 OR raw_app_meta_data->>'environment' IN ('test','testing','synthetic')
)
SELECT jsonb_build_object('explicitlyMarkedCount',count(*),
 'eligibleCandidates',coalesce(jsonb_agg(id) FILTER(WHERE confirmed AND not_deleted AND not_banned),'[]'::jsonb),
 'ownerApproved',false,'canaryActivated',false) metadata FROM marked;
ROLLBACK;
