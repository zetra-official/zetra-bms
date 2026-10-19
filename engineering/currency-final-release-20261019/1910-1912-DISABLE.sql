BEGIN;SET LOCAL lock_timeout='3s';SET LOCAL statement_timeout='45s';
-- Serialize with admitted bound commands. Keep every account snapshot,
-- canonical payment, request receipt, provenance link and mutation guard.
DO $$DECLARE s record;BEGIN FOR s IN SELECT id FROM public.stores WHERE organization_id IN(SELECT organization_id FROM backend_core.settlement_rollout WHERE enabled) ORDER BY id LOOP PERFORM pg_advisory_xact_lock(hashtextextended('settlement-store:'||s.id::text,0));END LOOP;END$$;
UPDATE backend_core.settlement_rollout SET enabled=false WHERE enabled;
UPDATE backend_core.native_financial_rollout SET enabled=false WHERE enabled;
DO $$DECLARE p record;r record;BEGIN FOR p IN SELECT oid,proowner FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN ('confirm_settlement_account_v1','authorize_settlement_actor_v1','post_bound_financial_v1','read_bound_account_balance_v1','read_bound_shift_reconciliation_v1','original_refund_readiness_v1','open_bound_cashier_shift_v1','close_bound_cashier_shift_v1','get_bound_financial_result_v1') LOOP EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC',p.oid::regprocedure);FOR r IN SELECT DISTINCT pg_get_userbyid(a.grantee) name FROM pg_proc f CROSS JOIN LATERAL aclexplode(coalesce(f.proacl,acldefault('f',f.proowner))) a WHERE f.oid=p.oid AND a.grantee<>p.proowner AND a.grantee<>0 LOOP EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %I',p.oid::regprocedure,r.name);END LOOP;END LOOP;END$$;
COMMIT;
