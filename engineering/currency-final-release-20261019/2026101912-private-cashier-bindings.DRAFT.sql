BEGIN;SET LOCAL lock_timeout='2s';SET LOCAL statement_timeout='45s';
DO $$BEGIN IF md5(replace(pg_get_functiondef('authorize_settlement_actor_v1(uuid,uuid,text[])'::regprocedure),chr(13),''))<>'f4fb65fd7d253a361a5b97379b7974ef' THEN RAISE EXCEPTION 'CASHIER_BINDING_PREIMAGE_MISMATCH';END IF;IF md5(replace(pg_get_functiondef('post_bound_financial_v1(uuid,uuid,text,integer,text,jsonb,jsonb,uuid,jsonb)'::regprocedure),chr(13),''))<>'225c966dd184d8b8179a388dc59022c1' THEN RAISE EXCEPTION 'CASHIER_BINDING_PREIMAGE_MISMATCH';END IF;IF md5(replace(pg_get_functiondef('read_bound_account_balance_v1(uuid)'::regprocedure),chr(13),''))<>'fbbfdb4eda3b13fee8fbdeede8761b3b' THEN RAISE EXCEPTION 'CASHIER_BINDING_PREIMAGE_MISMATCH';END IF;IF md5(replace(pg_get_functiondef('read_bound_shift_reconciliation_v1(uuid)'::regprocedure),chr(13),''))<>'5189c86e9ff4eb47271037363e6802c3' THEN RAISE EXCEPTION 'CASHIER_BINDING_PREIMAGE_MISMATCH';END IF;IF md5(replace(pg_get_functiondef('backend_core.bind_canonical_settlement_v1(text,uuid,uuid,uuid,jsonb)'::regprocedure),chr(13),''))<>'924e372eef597a8ed570feaac26c1022' THEN RAISE EXCEPTION 'CASHIER_BINDING_PREIMAGE_MISMATCH';END IF;END $$;
ALTER TABLE backend_core.settlement_account_permissions DROP CONSTRAINT settlement_account_permissions_operation_check;
ALTER TABLE backend_core.settlement_account_permissions ADD CONSTRAINT settlement_account_permissions_operation_check CHECK(operation IN ('SALE','COLLECTION','EXPENSE','SUPPLIER','REFUND','SHIFT'));
CREATE TABLE backend_core.shift_account_bindings(shift_id uuid PRIMARY KEY REFERENCES public.cashier_shifts(id),account_id uuid NOT NULL REFERENCES backend_core.settlement_accounts(id),request_id uuid NOT NULL,confirmation_reference text NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp());
CREATE TABLE backend_core.shift_reconciliation_evidence(shift_id uuid PRIMARY KEY REFERENCES public.cashier_shifts(id),request_id uuid NOT NULL,details jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp());
CREATE TRIGGER immutable_shift_account_binding BEFORE UPDATE OR DELETE ON backend_core.shift_account_bindings FOR EACH ROW EXECUTE FUNCTION backend_core.immutable_settlement_evidence_v1();
CREATE TRIGGER immutable_shift_reconciliation BEFORE UPDATE OR DELETE ON backend_core.shift_reconciliation_evidence FOR EACH ROW EXECUTE FUNCTION backend_core.immutable_settlement_evidence_v1();
CREATE FUNCTION backend_core.project_bound_account_v1(ac uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE a backend_core.settlement_accounts%ROWTYPE;b record;r jsonb;movement numeric:=0;
BEGIN SELECT * INTO a FROM backend_core.settlement_accounts WHERE id=ac;IF NOT FOUND THEN RAISE EXCEPTION 'BOUND_ACCOUNT_REQUIRED';END IF;
 FOR b IN SELECT * FROM backend_core.settlement_bindings WHERE account_id=ac LOOP r:=backend_core.canonical_settlement_fact_v1(b.source_kind,b.source_id);IF r->>'currency' IS DISTINCT FROM a.currency THEN RAISE EXCEPTION 'BOUND_ORIGINAL_CURRENCY_DRIFT';END IF;movement:=movement+(r->>'amount')::numeric;END LOOP;
 RETURN jsonb_build_object('accountId',a.id,'currency',a.currency,'opening',a.opening_amount::text,'openingAt',a.opening_at,'netCanonicalMovements',movement::text,'balance',(a.opening_amount+movement)::text,'source','OWNER_CONFIRMED_OPENING_PLUS_BOUND_CANONICAL_RECORDS','externalProviderVerified',false);
END $$;
CREATE FUNCTION public.open_bound_cashier_shift_v1(p_store_id uuid,p_request_id uuid,p_currency text,p_revision integer,p_account_id uuid,p_opening numeric,p_confirmation_reference text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE o uuid:=backend_core.settlement_scope_v1(p_store_id);actor uuid:=backend_core.active_subject();a backend_core.settlement_accounts%ROWTYPE;prior backend_core.settlement_requests%ROWTYPE;body jsonb;result jsonb;current_balance jsonb;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('settlement-store:'||p_store_id::text,0));PERFORM pg_advisory_xact_lock(hashtextextended(p_store_id::text||':'||p_request_id::text,0));body:=jsonb_build_object('operation','OPEN_BOUND_SHIFT','currency',p_currency,'revision',p_revision,'account',p_account_id,'opening',p_opening::text,'confirmation',p_confirmation_reference);
 SELECT * INTO prior FROM backend_core.settlement_requests WHERE store_id=p_store_id AND request_id=p_request_id;IF FOUND THEN IF prior.actor_id<>actor OR prior.payload<>body OR prior.organization_id<>o THEN RAISE EXCEPTION 'BOUND_REQUEST_CONFLICT';END IF;RETURN prior.result;END IF;
 SELECT * INTO a FROM backend_core.settlement_accounts WHERE id=p_account_id FOR UPDATE;
 IF a.id IS NULL OR a.kind<>'CASH' OR a.currency IS DISTINCT FROM p_currency OR a.organization_id<>o OR a.store_id<>p_store_id OR a.locked OR NOT EXISTS(SELECT 1 FROM backend_core.settlement_rollout WHERE organization_id=o AND enabled) OR NOT EXISTS(SELECT 1 FROM backend_core.settlement_account_permissions WHERE account_id=a.id AND actor_id=actor AND operation='SHIFT') OR length(btrim(coalesce(p_confirmation_reference,'')))<8 THEN RAISE EXCEPTION 'AUTHORIZED_DRAWER_ACCOUNT_REQUIRED';END IF;
 IF EXISTS(SELECT 1 FROM backend_core.shift_account_bindings b JOIN public.cashier_shifts s ON s.id=b.shift_id WHERE b.account_id=a.id AND s.status='OPEN') THEN RAISE EXCEPTION 'DRAWER_ALREADY_IN_OPEN_SHIFT';END IF;
 current_balance:=backend_core.project_bound_account_v1(a.id);IF p_opening IS NULL OR p_opening IS DISTINCT FROM (current_balance->>'balance')::numeric THEN RAISE EXCEPTION 'OWNER_ACCOUNT_AND_DRAWER_OPENING_MISMATCH';END IF;
 result:=public.native_cashier_shift_v1(p_store_id,p_request_id,p_currency,p_revision,'OPEN_SHIFT',NULL,p_opening,'Bound drawer opening: '||p_confirmation_reference);
 INSERT INTO backend_core.shift_account_bindings VALUES((result->>'shiftId')::uuid,a.id,p_request_id,p_confirmation_reference,clock_timestamp());result:=result||jsonb_build_object('accountId',a.id,'accountBalanceChanged',false);
 INSERT INTO backend_core.settlement_requests VALUES(p_store_id,p_request_id,actor,o,body,result,clock_timestamp());
 INSERT INTO backend_core.settlement_audit(event,actor_id,organization_id,store_id,request_id,details) VALUES('DRAWER_SHIFT_OPENED',actor,o,p_store_id,p_request_id,result);RETURN result;
END $$;
CREATE FUNCTION backend_core.bound_shift_coverage_v1(sid uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE s public.cashier_shifts%ROWTYPE;unknown_count bigint:=0;n bigint;last_time timestamptz:=statement_timestamp();
BEGIN SELECT * INTO s FROM public.cashier_shifts WHERE id=sid;IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM backend_core.shift_account_bindings WHERE shift_id=s.id) THEN RETURN jsonb_build_object('complete',false,'unknownSources',NULL,'reason','VERIFIED_DRAWER_BINDING_REQUIRED');END IF;
 last_time:=coalesce(s.closed_at,last_time);
 SELECT count(*) INTO n FROM public.sale_payments p JOIN public.sales sale ON sale.id=p.sale_id WHERE sale.cashier_shift_id=s.id AND NOT EXISTS(SELECT 1 FROM backend_core.settlement_bindings b WHERE b.source_kind='SALE_PAYMENT' AND b.source_id=p.id AND b.shift_id=s.id);unknown_count:=unknown_count+n;
 SELECT count(*) INTO n FROM public.credit_ledger_v2 p WHERE p.store_id=s.store_id AND p.delta<0 AND p.created_at>=s.opened_at AND p.created_at<=last_time AND NOT EXISTS(SELECT 1 FROM backend_core.settlement_bindings b WHERE b.source_kind='COLLECTION' AND b.source_id=p.id);unknown_count:=unknown_count+n;
 SELECT count(*) INTO n FROM public.expenses p WHERE p.store_id=s.store_id AND p.created_at>=s.opened_at AND p.created_at<=last_time AND NOT EXISTS(SELECT 1 FROM backend_core.settlement_bindings b WHERE b.source_kind='EXPENSE' AND b.source_id=p.id);unknown_count:=unknown_count+n;
 SELECT count(*) INTO n FROM public.inbound_stock_payments p JOIN public.inbound_stock_orders o ON o.id=p.inbound_order_id WHERE o.store_id=s.store_id AND p.created_at>=s.opened_at AND p.created_at<=last_time AND NOT EXISTS(SELECT 1 FROM backend_core.settlement_bindings b WHERE b.source_kind='SUPPLIER_PAYMENT' AND b.source_id=p.id);unknown_count:=unknown_count+n;
 SELECT count(*) INTO n FROM public.business_debt_payments p WHERE p.store_id=s.store_id AND p.created_at>=s.opened_at AND p.created_at<=last_time AND NOT EXISTS(SELECT 1 FROM backend_core.supplier_payment_bindings b WHERE b.debt_payment_id=p.id);unknown_count:=unknown_count+n;
 SELECT count(*) INTO n FROM public.business_loan_payments p WHERE p.store_id=s.store_id AND p.created_at>=s.opened_at AND p.created_at<=last_time;unknown_count:=unknown_count+n;
 SELECT count(*) INTO n FROM public.field_wallet_transactions p WHERE p.store_id=s.store_id AND p.created_at>=s.opened_at AND p.created_at<=last_time;unknown_count:=unknown_count+n;
 SELECT count(*) INTO n FROM funding_control.movements p WHERE p.shift_id=s.id;unknown_count:=unknown_count+n;
 RETURN jsonb_build_object('complete',unknown_count=0,'unknownSources',unknown_count,'scope','BOUND_CANONICAL_SOURCE_COVERAGE','historicalAllocationInferred',false,'refundPostingAllowed',false,'custodyPostingAllowed',false);
END $$;
CREATE FUNCTION public.close_bound_cashier_shift_v1(p_store_id uuid,p_request_id uuid,p_currency text,p_revision integer,p_shift_id uuid,p_drawer numeric,p_note text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE o uuid:=backend_core.settlement_scope_v1(p_store_id);actor uuid:=backend_core.active_subject();prior backend_core.settlement_requests%ROWTYPE;body jsonb;r jsonb;result jsonb;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('settlement-store:'||p_store_id::text,0));PERFORM pg_advisory_xact_lock(hashtextextended(p_store_id::text||':'||p_request_id::text,0));body:=jsonb_build_object('operation','CLOSE_BOUND_SHIFT','currency',p_currency,'revision',p_revision,'shift',p_shift_id,'drawer',p_drawer::text,'note',p_note);
 SELECT * INTO prior FROM backend_core.settlement_requests WHERE store_id=p_store_id AND request_id=p_request_id;IF FOUND THEN IF prior.actor_id<>actor OR prior.organization_id<>o OR prior.payload<>body THEN RAISE EXCEPTION 'BOUND_REQUEST_CONFLICT';END IF;RETURN prior.result;END IF;
 IF NOT EXISTS(SELECT 1 FROM backend_core.settlement_rollout WHERE organization_id=o AND enabled) THEN RAISE EXCEPTION 'SETTLEMENT_ROLLOUT_DISABLED';END IF;
 PERFORM 1 FROM public.cashier_shifts WHERE id=p_shift_id AND organization_id=o AND store_id=p_store_id AND status='OPEN' FOR UPDATE;IF NOT FOUND THEN RAISE EXCEPTION 'SHIFT_NOT_OPEN';END IF;
 r:=public.read_bound_shift_reconciliation_v1(p_shift_id);IF r->>'currency' IS DISTINCT FROM p_currency OR r->>'complete' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'SHIFT_HAS_UNVERIFIED_CANONICAL_SOURCES';END IF;
 IF p_drawer IS DISTINCT FROM (r->>'expectedCash')::numeric AND nullif(btrim(p_note),'') IS NULL THEN RAISE EXCEPTION 'CLOSING_DISCREPANCY_NOTE_REQUIRED';END IF;
 INSERT INTO backend_core.settlement_intents VALUES(pg_backend_pid(),txid_current(),actor,o,p_store_id,p_request_id,'CLOSE_SHIFT',p_shift_id);
 result:=public.native_cashier_shift_v1(p_store_id,p_request_id,p_currency,p_revision,'CLOSE_SHIFT',p_shift_id,p_drawer,p_note);
 r:=r||jsonb_build_object('drawerCount',p_drawer::text,'discrepancy',(p_drawer-(r->>'expectedCash')::numeric)::text,'canonicalShiftClosed',true);
 INSERT INTO backend_core.shift_reconciliation_evidence VALUES(p_shift_id,p_request_id,r,clock_timestamp());result:=result||jsonb_build_object('boundReconciliation',r);
 INSERT INTO backend_core.settlement_requests VALUES(p_store_id,p_request_id,actor,o,body,result,clock_timestamp());DELETE FROM backend_core.settlement_intents WHERE backend_pid=pg_backend_pid() AND transaction_id=txid_current();
 INSERT INTO backend_core.settlement_audit(event,actor_id,organization_id,store_id,request_id,details) VALUES('DRAWER_SHIFT_CLOSED',actor,o,p_store_id,p_request_id,r);RETURN result;
END $$;
CREATE FUNCTION backend_core.guard_bound_shift_close_v1() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN IF OLD.status='OPEN' AND NEW.status='CLOSED' AND EXISTS(SELECT 1 FROM backend_core.shift_account_bindings WHERE shift_id=OLD.id) AND NOT EXISTS(SELECT 1 FROM backend_core.settlement_intents WHERE backend_pid=pg_backend_pid() AND transaction_id=txid_current() AND actor_id=backend_core.active_subject() AND operation='CLOSE_SHIFT' AND source_id=OLD.id) THEN RAISE EXCEPTION 'BOUND_SHIFT_ATOMIC_RECONCILIATION_REQUIRED';END IF;RETURN NEW;END $$;
CREATE TRIGGER guard_bound_shift_close_v1 BEFORE UPDATE ON public.cashier_shifts FOR EACH ROW EXECUTE FUNCTION backend_core.guard_bound_shift_close_v1();
CREATE FUNCTION public.get_bound_financial_result_v1(p_store_id uuid,p_request_id uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE o uuid:=backend_core.settlement_scope_v1(p_store_id);r jsonb;BEGIN SELECT result INTO r FROM backend_core.settlement_requests WHERE store_id=p_store_id AND request_id=p_request_id AND organization_id=o AND actor_id=backend_core.active_subject();RETURN r;END $$;
DO $$DECLARE t text;p record;r record;BEGIN
 FOREACH t IN ARRAY ARRAY['shift_account_bindings','shift_reconciliation_evidence'] LOOP EXECUTE format('ALTER TABLE backend_core.%I ENABLE ROW LEVEL SECURITY',t);EXECUTE format('ALTER TABLE backend_core.%I FORCE ROW LEVEL SECURITY',t);EXECUTE format('REVOKE ALL ON backend_core.%I FROM PUBLIC,anon,authenticated,service_role',t);END LOOP;
 FOR p IN SELECT oid,proowner FROM pg_proc WHERE pronamespace IN ('public'::regnamespace,'backend_core'::regnamespace) AND proname IN ('project_bound_account_v1','open_bound_cashier_shift_v1','bound_shift_coverage_v1','close_bound_cashier_shift_v1','guard_bound_shift_close_v1','get_bound_financial_result_v1') LOOP EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC',p.oid::regprocedure);FOR r IN SELECT DISTINCT pg_get_userbyid(a.grantee) name FROM pg_proc f CROSS JOIN LATERAL aclexplode(coalesce(f.proacl,acldefault('f',f.proowner))) a WHERE f.oid=p.oid AND a.grantee<>p.proowner AND a.grantee<>0 LOOP EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %I',p.oid::regprocedure,r.name);END LOOP;END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.authorize_settlement_actor_v1(p_account_id uuid, p_actor_id uuid, p_operations text[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE a backend_core.settlement_accounts%ROWTYPE;op text;BEGIN
 SELECT * INTO a FROM backend_core.settlement_accounts WHERE id=p_account_id FOR UPDATE;
 IF NOT FOUND OR NOT backend_core.settlement_owner_v1(a.organization_id) THEN RAISE EXCEPTION 'ACCOUNT_OWNER_AUTHORIZATION_REQUIRED';END IF;PERFORM public.ensure_my_store_access(a.store_id);
 IF p_operations IS NULL OR cardinality(p_operations)=0 OR EXISTS(SELECT 1 FROM unnest(p_operations) x WHERE x IS NULL OR x NOT IN ('SALE','COLLECTION','EXPENSE','SUPPLIER','REFUND','SHIFT')) THEN RAISE EXCEPTION 'INVALID_ACCOUNT_OPERATIONS';END IF;
 IF NOT EXISTS(SELECT 1 FROM public.org_memberships m WHERE m.organization_id=a.organization_id AND m.user_id=p_actor_id AND coalesce(m.is_active,true) AND (lower(m.role) IN ('owner','admin') OR EXISTS(SELECT 1 FROM public.org_membership_stores ms WHERE ms.membership_id=m.id AND ms.store_id=a.store_id))) THEN RAISE EXCEPTION 'TARGET_ACTOR_STORE_ACCESS_REQUIRED';END IF;
 FOREACH op IN ARRAY p_operations LOOP INSERT INTO backend_core.settlement_account_permissions VALUES(a.id,p_actor_id,op) ON CONFLICT DO NOTHING;END LOOP;
 INSERT INTO backend_core.settlement_audit(event,actor_id,organization_id,store_id,request_id,details) VALUES('ACCOUNT_ACTOR_AUTHORIZED',backend_core.active_subject(),a.organization_id,a.store_id,a.id,jsonb_build_object('actor',p_actor_id,'operations',p_operations));
END $function$
;
CREATE OR REPLACE FUNCTION backend_core.bind_canonical_settlement_v1(k text, id uuid, ac uuid, shift uuid, evidence jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE a backend_core.settlement_accounts%ROWTYPE;r jsonb;i backend_core.settlement_intents%ROWTYPE;cs public.cashier_shifts%ROWTYPE;op text;role text;digits integer;available numeric;other record;
BEGIN
 SELECT * INTO i FROM backend_core.settlement_intents WHERE backend_pid=pg_backend_pid() AND transaction_id=txid_current() AND actor_id=backend_core.active_subject();IF NOT FOUND THEN RAISE EXCEPTION 'ATOMIC_SETTLEMENT_CONTEXT_REQUIRED';END IF;
 r:=backend_core.canonical_settlement_fact_v1(k,id);SELECT * INTO a FROM backend_core.settlement_accounts WHERE settlement_accounts.id=ac FOR UPDATE;
 op:=CASE k WHEN 'SALE_PAYMENT' THEN 'SALE' WHEN 'SUPPLIER_PAYMENT' THEN 'SUPPLIER' ELSE k END;
 IF a.id IS NULL OR a.locked OR a.organization_id IS DISTINCT FROM i.organization_id OR a.store_id IS DISTINCT FROM i.store_id OR (r->>'organization')::uuid IS DISTINCT FROM i.organization_id OR (r->>'store')::uuid IS DISTINCT FROM i.store_id OR r->>'currency' IS DISTINCT FROM a.currency OR r->>'method' IS DISTINCT FROM a.kind OR (r->>'actor')::uuid IS DISTINCT FROM i.actor_id OR (r->>'createdAt')::timestamptz<transaction_timestamp() OR (r->>'createdAt')::timestamptz<a.opening_at THEN RAISE EXCEPTION 'SETTLEMENT_ACCOUNT_SOURCE_SCOPE_MISMATCH';END IF;
 SELECT minor_units INTO digits FROM proforma_backend.currency_catalog WHERE code=a.currency;IF (r->>'amount')::numeric<>round((r->>'amount')::numeric,digits) THEN RAISE EXCEPTION 'SETTLEMENT_PRECISION_MISMATCH';END IF;
 IF NOT backend_core.settlement_owner_v1(i.organization_id) AND NOT EXISTS(SELECT 1 FROM backend_core.settlement_account_permissions WHERE account_id=a.id AND actor_id=i.actor_id AND operation=op) THEN RAISE EXCEPTION 'ACCOUNT_OPERATION_NOT_AUTHORIZED';END IF;
 IF length(btrim(coalesce(evidence->>'reference','')))<8 THEN RAISE EXCEPTION 'SETTLEMENT_CONFIRMATION_REQUIRED';END IF;
 IF a.kind<>'CASH' AND NOT (evidence->>'source'='OWNER_CONFIRMED' AND backend_core.settlement_owner_v1(i.organization_id) OR evidence->>'source'='AUTHORIZED_OPERATOR_CONFIRMATION' AND EXISTS(SELECT 1 FROM backend_core.settlement_account_permissions WHERE account_id=a.id AND actor_id=i.actor_id AND operation=op)) THEN RAISE EXCEPTION 'EXPLICIT_OWNER_OR_DELEGATED_ACCOUNT_CONFIRMATION_REQUIRED';END IF;
 SELECT lower(m.role) INTO role FROM public.org_memberships m WHERE m.organization_id=i.organization_id AND m.user_id=i.actor_id AND coalesce(m.is_active,true) LIMIT 1;
 IF role='cashier' AND shift IS NULL THEN RAISE EXCEPTION 'CASHIER_SHIFT_REQUIRED';END IF;
 IF a.kind='CASH' AND shift IS NULL AND EXISTS(SELECT 1 FROM backend_core.shift_account_bindings b JOIN public.cashier_shifts s ON s.id=b.shift_id WHERE b.account_id=a.id AND s.status='OPEN') THEN RAISE EXCEPTION 'OPEN_DRAWER_SHIFT_CONTEXT_REQUIRED';END IF;
 IF a.kind='CASH' AND shift IS NOT NULL AND NOT EXISTS(SELECT 1 FROM backend_core.shift_account_bindings WHERE shift_id=shift AND account_id=a.id) THEN RAISE EXCEPTION 'DRAWER_SOURCE_ACCOUNT_MISMATCH';END IF;
 IF shift IS NOT NULL THEN
  SELECT * INTO cs FROM public.cashier_shifts WHERE cashier_shifts.id=shift FOR UPDATE;
  IF cs.id IS NULL OR cs.status<>'OPEN' OR cs.organization_id<>i.organization_id OR cs.store_id<>i.store_id OR cs.currency_context->>'currency' IS DISTINCT FROM a.currency OR (NOT backend_core.settlement_owner_v1(i.organization_id) AND NOT EXISTS(SELECT 1 FROM public.org_memberships m WHERE m.id=cs.membership_id AND m.user_id=i.actor_id AND coalesce(m.is_active,true))) THEN RAISE EXCEPTION 'SETTLEMENT_SHIFT_OWNERSHIP_OR_STATE_INVALID';END IF;
  IF (r->>'createdAt')::timestamptz<cs.opened_at THEN RAISE EXCEPTION 'SETTLEMENT_OUTSIDE_SHIFT';END IF;
  IF k='SALE_PAYMENT' AND NOT EXISTS(SELECT 1 FROM public.sales s WHERE s.id=(r->>'saleId')::uuid AND s.cashier_shift_id=shift) THEN RAISE EXCEPTION 'SALE_SHIFT_LINK_MISMATCH';END IF;
 END IF;
 IF (r->>'amount')::numeric<0 THEN
  available:=a.opening_amount;FOR other IN SELECT * FROM backend_core.settlement_bindings WHERE account_id=a.id LOOP available:=available+(backend_core.canonical_settlement_fact_v1(other.source_kind,other.source_id)->>'amount')::numeric;END LOOP;
  IF available+(r->>'amount')::numeric<0 THEN RAISE EXCEPTION 'VERIFIED_ACCOUNT_FUNDS_INSUFFICIENT';END IF;
 END IF;
 INSERT INTO backend_core.settlement_bindings VALUES(k,id,ac,i.organization_id,i.store_id,shift,i.actor_id,i.request_id,evidence->>'reference',CASE WHEN a.kind='CASH' THEN 'AUTHORIZED_CANONICAL_CASH_RECORD' ELSE 'AUTHORIZED_CONFIRMED_RECORD_NOT_PROVIDER_VERIFIED' END,clock_timestamp());
 INSERT INTO backend_core.settlement_audit(event,actor_id,organization_id,store_id,request_id,details) VALUES('CANONICAL_SETTLEMENT_BOUND',i.actor_id,i.organization_id,i.store_id,i.request_id,jsonb_build_object('sourceKind',k,'sourceId',id,'accountId',ac,'shiftId',shift));
END $function$
;
CREATE OR REPLACE FUNCTION public.post_bound_financial_v1(p_store_id uuid, p_request_id uuid, p_currency text, p_revision integer, p_operation text, p_payload jsonb, p_accounts jsonb, p_shift_id uuid, p_evidence jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE actor uuid:=backend_core.active_subject();o uuid:=backend_core.settlement_scope_v1(p_store_id);body jsonb;prior backend_core.settlement_requests%ROWTYPE;result jsonb;rid uuid;row record;
BEGIN
 IF p_request_id IS NULL OR p_operation IS NULL OR p_operation NOT IN ('SALE','COLLECTION','EXPENSE','RECEIPT','SUPPLIER') OR jsonb_typeof(p_payload) IS DISTINCT FROM 'object' OR jsonb_typeof(p_accounts) IS DISTINCT FROM 'object' OR jsonb_typeof(p_evidence) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'INVALID_BOUND_FINANCIAL_REQUEST';END IF;
 body:=jsonb_build_object('currency',p_currency,'revision',p_revision,'operation',p_operation,'payload',p_payload,'accounts',p_accounts,'shift',p_shift_id,'evidence',p_evidence);
 PERFORM pg_advisory_xact_lock(hashtextextended('settlement-store:'||p_store_id::text,0));
 PERFORM pg_advisory_xact_lock(hashtextextended(p_store_id::text||':'||p_request_id::text,0));SELECT * INTO prior FROM backend_core.settlement_requests WHERE store_id=p_store_id AND request_id=p_request_id;
 IF FOUND THEN IF prior.actor_id<>actor OR prior.organization_id<>o OR prior.payload<>body THEN RAISE EXCEPTION 'BOUND_REQUEST_CONFLICT';END IF;RETURN prior.result;END IF;
 IF NOT EXISTS(SELECT 1 FROM backend_core.settlement_rollout WHERE organization_id=o AND enabled) THEN RAISE EXCEPTION 'SETTLEMENT_ROLLOUT_DISABLED';END IF;
 IF p_shift_id IS NOT NULL THEN PERFORM 1 FROM public.cashier_shifts WHERE id=p_shift_id AND organization_id=o AND store_id=p_store_id AND status='OPEN' FOR UPDATE;IF NOT FOUND THEN RAISE EXCEPTION 'SHIFT_NOT_OPEN';END IF;END IF;
 FOR row IN SELECT DISTINCT value::uuid id FROM jsonb_each_text(p_accounts) ORDER BY 1 LOOP PERFORM 1 FROM backend_core.settlement_accounts WHERE id=row.id AND organization_id=o AND store_id=p_store_id AND currency=p_currency AND NOT locked FOR UPDATE;IF NOT FOUND THEN RAISE EXCEPTION 'BOUND_ACCOUNT_REQUIRED';END IF;END LOOP;
 IF EXISTS(SELECT 1 FROM backend_core.native_financial_requests WHERE store_id=p_store_id AND request_id=p_request_id) THEN RAISE EXCEPTION 'UNBOUND_LEGACY_REQUEST_REQUIRES_REVIEW';END IF;
 INSERT INTO backend_core.settlement_intents VALUES(pg_backend_pid(),txid_current(),actor,o,p_store_id,p_request_id,p_operation,(p_payload->>'order_id')::uuid);
 IF p_operation='SALE' THEN
  IF (p_payload->>'cashier_shift_id')::uuid IS DISTINCT FROM p_shift_id THEN RAISE EXCEPTION 'SALE_SHIFT_LINK_MISMATCH';END IF;
  result:=public.create_native_sale_v1(p_store_id,p_request_id,p_currency,p_revision,p_payload);rid:=(result->>'saleId')::uuid;
  FOR row IN SELECT id,upper(payment_method) method FROM public.sale_payments WHERE sale_id=rid ORDER BY id LOOP PERFORM backend_core.bind_canonical_settlement_v1('SALE_PAYMENT',row.id,(p_accounts->>row.method)::uuid,p_shift_id,p_evidence);END LOOP;
 ELSIF p_operation='COLLECTION' THEN
  result:=public.repay_native_credit_v1(p_store_id,p_request_id,p_currency,p_revision,(p_payload->>'credit_account_id')::uuid,(p_payload->>'amount')::numeric,p_payload->>'method',p_payload->>'reference',p_payload->>'note');
  PERFORM backend_core.bind_canonical_settlement_v1('COLLECTION',(result->>'ledgerId')::uuid,(p_accounts->>(p_payload->>'method'))::uuid,p_shift_id,p_evidence);
 ELSIF p_operation='EXPENSE' THEN
  result:=public.create_native_expense_v1(p_store_id,p_request_id,p_currency,p_revision,p_payload);
  PERFORM backend_core.bind_canonical_settlement_v1('EXPENSE',(result->>'expenseId')::uuid,(p_accounts->>(p_payload->>'payment_method'))::uuid,p_shift_id,p_evidence);
 ELSIF p_operation='RECEIPT' THEN
  result:=backend_core.receive_bound_purchase_v1(p_store_id,p_request_id,p_currency,p_revision,p_payload);
 ELSE
  result:=backend_core.pay_bound_supplier_v1(p_store_id,p_request_id,p_currency,p_revision,p_payload);
  PERFORM backend_core.bind_canonical_settlement_v1('SUPPLIER_PAYMENT',(result->>'inboundPaymentId')::uuid,(p_accounts->>(p_payload->>'method'))::uuid,p_shift_id,p_evidence);
 END IF;
 result:=result||jsonb_build_object('canonicalAccountBinding',true,'externalProviderVerified',false);
 INSERT INTO backend_core.settlement_requests VALUES(p_store_id,p_request_id,actor,o,body,result,clock_timestamp());DELETE FROM backend_core.settlement_intents WHERE backend_pid=pg_backend_pid() AND transaction_id=txid_current();RETURN result;
END $function$
;
CREATE OR REPLACE FUNCTION public.read_bound_account_balance_v1(p_account_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE a backend_core.settlement_accounts%ROWTYPE;movement numeric:=0;b record;r jsonb;
BEGIN SELECT * INTO a FROM backend_core.settlement_accounts WHERE id=p_account_id;IF NOT FOUND THEN RAISE EXCEPTION 'ACCOUNT_NOT_FOUND';END IF;PERFORM backend_core.settlement_scope_v1(a.store_id);
 IF NOT backend_core.settlement_owner_v1(a.organization_id) THEN RAISE EXCEPTION 'ACCOUNT_OWNER_READ_REQUIRED';END IF;
 RETURN backend_core.project_bound_account_v1(a.id);
END $function$
;
CREATE OR REPLACE FUNCTION public.read_bound_shift_reconciliation_v1(p_shift_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE cs public.cashier_shifts%ROWTYPE;b record;r jsonb;cash numeric:=0;bank numeric:=0;mobile numeric:=0;missing bigint;breakdown jsonb:='{}';
BEGIN SELECT * INTO cs FROM public.cashier_shifts WHERE id=p_shift_id;IF NOT FOUND THEN RAISE EXCEPTION 'SHIFT_NOT_FOUND';END IF;PERFORM backend_core.settlement_scope_v1(cs.store_id);
 IF NOT backend_core.settlement_owner_v1(cs.organization_id) AND NOT EXISTS(SELECT 1 FROM public.org_memberships m WHERE m.id=cs.membership_id AND m.user_id=backend_core.active_subject() AND coalesce(m.is_active,true)) THEN RAISE EXCEPTION 'SHIFT_READ_FORBIDDEN';END IF;
 IF cs.currency_context->>'currency' IS NULL THEN RAISE EXCEPTION 'ORIGINAL_SHIFT_CURRENCY_REQUIRED';END IF;
 FOR b IN SELECT x.*,a.kind FROM backend_core.settlement_bindings x JOIN backend_core.settlement_accounts a ON a.id=x.account_id WHERE x.shift_id=cs.id LOOP
  r:=backend_core.canonical_settlement_fact_v1(b.source_kind,b.source_id);IF r->>'currency' IS DISTINCT FROM cs.currency_context->>'currency' THEN RAISE EXCEPTION 'SHIFT_CURRENCY_MISMATCH';END IF;
  IF b.kind='CASH' THEN cash:=cash+(r->>'amount')::numeric;ELSIF b.kind='BANK' THEN bank:=bank+(r->>'amount')::numeric;ELSE mobile:=mobile+(r->>'amount')::numeric;END IF;
  breakdown:=jsonb_set(breakdown,ARRAY[b.source_kind],to_jsonb((coalesce(breakdown->>b.source_kind,'0')::numeric+(r->>'amount')::numeric)::text));
 END LOOP;
 SELECT count(*) INTO missing FROM public.sale_payments p JOIN public.sales s ON s.id=p.sale_id WHERE s.cashier_shift_id=cs.id AND NOT EXISTS(SELECT 1 FROM backend_core.settlement_bindings x WHERE x.source_kind='SALE_PAYMENT' AND x.source_id=p.id);
 RETURN jsonb_build_object('shiftId',cs.id,'currency',cs.currency_context->>'currency','openingCash',cs.opening_cash::text,'cashMovements',cash::text,'bankMovements',bank::text,'mobileMovements',mobile::text,'expectedCash',(cs.opening_cash+cash)::text,'drawerCount',cs.drawer_count::text,'discrepancy',CASE WHEN cs.drawer_count IS NULL THEN NULL ELSE (cs.drawer_count-cs.opening_cash-cash)::text END,'canonicalBreakdown',breakdown,'unboundSalePayments',missing,'complete',(backend_core.bound_shift_coverage_v1(cs.id)->>'complete')::boolean,'coverage',backend_core.bound_shift_coverage_v1(cs.id),'refundPostingAllowed',false,'custodyPostingAllowed',false,'note','Original canonical source coverage only; unsupported refund/custody posting remains disabled; no historical allocation inferred');
END $function$
;
COMMIT;
