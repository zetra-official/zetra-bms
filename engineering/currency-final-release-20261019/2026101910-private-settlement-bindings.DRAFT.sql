-- Local-only, additive, quarantined extension. No client grants or activation.
BEGIN;
SET LOCAL lock_timeout='2s';SET LOCAL statement_timeout='45s';
DO $$BEGIN IF md5(replace(pg_get_functiondef('create_native_sale_v1(uuid,uuid,text,integer,jsonb)'::regprocedure),chr(13),''))<>'35b8eb66c705f8601ef618b862cc2daa' THEN RAISE EXCEPTION 'SETTLEMENT_DEPENDENCY_PREIMAGE_MISMATCH';END IF;IF md5(replace(pg_get_functiondef('repay_native_credit_v1(uuid,uuid,text,integer,uuid,numeric,text,text,text)'::regprocedure),chr(13),''))<>'aa9c462bb854b8301df5b56c3c307cbb' THEN RAISE EXCEPTION 'SETTLEMENT_DEPENDENCY_PREIMAGE_MISMATCH';END IF;IF md5(replace(pg_get_functiondef('create_native_expense_v1(uuid,uuid,text,integer,jsonb)'::regprocedure),chr(13),''))<>'7d4c7c0b807980609eb8931c26211d77' THEN RAISE EXCEPTION 'SETTLEMENT_DEPENDENCY_PREIMAGE_MISMATCH';END IF;IF md5(replace(pg_get_functiondef('backend_core.native_unverified_writer_guard_v1()'::regprocedure),chr(13),''))<>'c96b536ddcb5afb391b52a82db0197a4' THEN RAISE EXCEPTION 'SETTLEMENT_DEPENDENCY_PREIMAGE_MISMATCH';END IF;IF md5(replace(pg_get_functiondef('backend_core.unverified_supplier_payment_guard_v1()'::regprocedure),chr(13),''))<>'079a4b4d6338dd4cff5d712c41db001a' THEN RAISE EXCEPTION 'SETTLEMENT_DEPENDENCY_PREIMAGE_MISMATCH';END IF; END$$;
DO $$BEGIN
 IF to_regclass('backend_core.receipt_cost_snapshots') IS NULL OR to_regprocedure('public.create_native_expense_v1(uuid,uuid,text,integer,jsonb)') IS NULL THEN RAISE EXCEPTION 'EXACT_1904_1909_DEPENDENCIES_REQUIRED';END IF;
END $$;
CREATE TABLE backend_core.settlement_rollout(organization_id uuid PRIMARY KEY REFERENCES public.organizations(id),enabled boolean NOT NULL DEFAULT false,approval_reference text NOT NULL);
CREATE TABLE backend_core.settlement_accounts(
 id uuid PRIMARY KEY,organization_id uuid NOT NULL REFERENCES public.organizations(id),store_id uuid NOT NULL REFERENCES public.stores(id),
 kind text NOT NULL CHECK(kind IN ('CASH','BANK','MOBILE')),currency text NOT NULL REFERENCES proforma_backend.currency_catalog(code),
 source_reference text NOT NULL,opening_amount numeric NOT NULL,opening_at timestamptz NOT NULL,confirmed_by uuid NOT NULL,confirmation_reference text NOT NULL,
 payload jsonb NOT NULL,locked boolean NOT NULL DEFAULT false,UNIQUE(organization_id,source_reference,currency));
CREATE TABLE backend_core.settlement_account_permissions(account_id uuid NOT NULL REFERENCES backend_core.settlement_accounts(id),actor_id uuid NOT NULL,operation text NOT NULL CHECK(operation IN ('SALE','COLLECTION','EXPENSE','SUPPLIER','REFUND')),PRIMARY KEY(account_id,actor_id,operation));
CREATE TABLE backend_core.settlement_intents(backend_pid integer NOT NULL,transaction_id bigint NOT NULL,actor_id uuid NOT NULL,organization_id uuid NOT NULL,store_id uuid NOT NULL,request_id uuid NOT NULL,operation text NOT NULL,PRIMARY KEY(backend_pid,transaction_id));
CREATE TABLE backend_core.settlement_requests(store_id uuid NOT NULL,request_id uuid NOT NULL,actor_id uuid NOT NULL,organization_id uuid NOT NULL,payload jsonb NOT NULL,result jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(store_id,request_id));
-- Amounts remain in canonical sources. These are unique provenance/authority links.
CREATE TABLE backend_core.settlement_bindings(source_kind text NOT NULL CHECK(source_kind IN ('SALE_PAYMENT','COLLECTION','EXPENSE')),source_id uuid NOT NULL,account_id uuid NOT NULL REFERENCES backend_core.settlement_accounts(id),organization_id uuid NOT NULL,store_id uuid NOT NULL,shift_id uuid REFERENCES public.cashier_shifts(id),actor_id uuid NOT NULL,request_id uuid NOT NULL,evidence_reference text NOT NULL,confirmation_source text NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(source_kind,source_id));
CREATE INDEX settlement_bindings_account ON backend_core.settlement_bindings(account_id);
CREATE INDEX settlement_bindings_shift ON backend_core.settlement_bindings(shift_id);
CREATE TABLE backend_core.settlement_audit(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,event text NOT NULL,actor_id uuid NOT NULL,organization_id uuid NOT NULL,store_id uuid NOT NULL,request_id uuid NOT NULL,details jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp());
CREATE FUNCTION backend_core.immutable_settlement_evidence_v1() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$BEGIN RAISE EXCEPTION 'IMMUTABLE_SETTLEMENT_EVIDENCE';END $$;
CREATE TRIGGER immutable_settlement_evidence BEFORE UPDATE OR DELETE ON backend_core.settlement_bindings FOR EACH ROW EXECUTE FUNCTION backend_core.immutable_settlement_evidence_v1();
CREATE TRIGGER immutable_settlement_evidence BEFORE UPDATE OR DELETE ON backend_core.settlement_audit FOR EACH ROW EXECUTE FUNCTION backend_core.immutable_settlement_evidence_v1();
CREATE TRIGGER immutable_settlement_evidence BEFORE UPDATE OR DELETE ON backend_core.settlement_requests FOR EACH ROW EXECUTE FUNCTION backend_core.immutable_settlement_evidence_v1();
CREATE FUNCTION backend_core.settlement_scope_v1(s uuid) RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE o uuid;BEGIN IF backend_core.active_subject() IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED';END IF;PERFORM public.ensure_my_store_access(s);SELECT organization_id INTO o FROM public.stores WHERE id=s;IF o IS NULL THEN RAISE EXCEPTION 'INVALID_STORE_SCOPE';END IF;RETURN o;END $$;
CREATE FUNCTION backend_core.settlement_owner_v1(o uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$SELECT EXISTS(SELECT 1 FROM public.org_memberships m WHERE m.organization_id=o AND m.user_id=backend_core.active_subject() AND coalesce(m.is_active,true) AND lower(m.role)='owner')$$;
CREATE FUNCTION public.confirm_settlement_account_v1(p_account_id uuid,p_store_id uuid,p_kind text,p_currency text,p_opening numeric,p_source_reference text,p_confirmation_reference text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE o uuid:=backend_core.settlement_scope_v1(p_store_id);a backend_core.settlement_accounts%ROWTYPE;body jsonb;digits integer;
BEGIN
 IF NOT backend_core.settlement_owner_v1(o) THEN RAISE EXCEPTION 'ACCOUNT_OWNER_CONFIRMATION_REQUIRED';END IF;
 SELECT minor_units INTO digits FROM proforma_backend.currency_catalog WHERE code=p_currency;
 IF p_account_id IS NULL OR p_kind IS NULL OR p_kind NOT IN ('CASH','BANK','MOBILE') OR digits IS NULL OR p_opening IS NULL OR p_opening::text!~'^\d{1,18}(\.\d{1,12})?$' OR p_opening<>round(p_opening,digits) OR length(btrim(coalesce(p_source_reference,'')))<4 OR length(btrim(coalesce(p_confirmation_reference,'')))<8 THEN RAISE EXCEPTION 'INVALID_OWNER_ACCOUNT_CONFIRMATION';END IF;
 IF NOT EXISTS(SELECT 1 FROM proforma_backend.accounting_currency WHERE organization_id=o AND currency=p_currency) THEN RAISE EXCEPTION 'VERIFIED_ACCOUNTING_CURRENCY_REQUIRED';END IF;
 body:=jsonb_build_object('store',p_store_id,'kind',p_kind,'currency',p_currency,'opening',p_opening::text,'source',p_source_reference,'confirmation',p_confirmation_reference);
 PERFORM pg_advisory_xact_lock(hashtextextended('settlement-account:'||p_account_id::text,0));SELECT * INTO a FROM backend_core.settlement_accounts WHERE id=p_account_id;
 IF FOUND THEN IF a.organization_id<>o OR a.payload<>body THEN RAISE EXCEPTION 'ACCOUNT_CONFIRMATION_CONFLICT';END IF;RETURN jsonb_build_object('accountId',a.id,'currency',a.currency,'opening',a.opening_amount::text,'openingAt',a.opening_at);END IF;
 INSERT INTO backend_core.settlement_accounts VALUES(p_account_id,o,p_store_id,p_kind,p_currency,p_source_reference,p_opening,clock_timestamp(),backend_core.active_subject(),p_confirmation_reference,body,false) RETURNING * INTO a;
 INSERT INTO backend_core.settlement_audit(event,actor_id,organization_id,store_id,request_id,details) VALUES('OWNER_ACCOUNT_CONFIRMED',backend_core.active_subject(),o,p_store_id,p_account_id,body);
 RETURN jsonb_build_object('accountId',a.id,'currency',a.currency,'opening',a.opening_amount::text,'openingAt',a.opening_at);
END $$;
CREATE FUNCTION public.authorize_settlement_actor_v1(p_account_id uuid,p_actor_id uuid,p_operations text[]) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE a backend_core.settlement_accounts%ROWTYPE;op text;BEGIN
 SELECT * INTO a FROM backend_core.settlement_accounts WHERE id=p_account_id FOR UPDATE;
 IF NOT FOUND OR NOT backend_core.settlement_owner_v1(a.organization_id) THEN RAISE EXCEPTION 'ACCOUNT_OWNER_AUTHORIZATION_REQUIRED';END IF;PERFORM public.ensure_my_store_access(a.store_id);
 IF p_operations IS NULL OR cardinality(p_operations)=0 OR EXISTS(SELECT 1 FROM unnest(p_operations) x WHERE x IS NULL OR x NOT IN ('SALE','COLLECTION','EXPENSE','SUPPLIER','REFUND')) THEN RAISE EXCEPTION 'INVALID_ACCOUNT_OPERATIONS';END IF;
 IF NOT EXISTS(SELECT 1 FROM public.org_memberships m WHERE m.organization_id=a.organization_id AND m.user_id=p_actor_id AND coalesce(m.is_active,true) AND (lower(m.role) IN ('owner','admin') OR EXISTS(SELECT 1 FROM public.org_membership_stores ms WHERE ms.membership_id=m.id AND ms.store_id=a.store_id))) THEN RAISE EXCEPTION 'TARGET_ACTOR_STORE_ACCESS_REQUIRED';END IF;
 FOREACH op IN ARRAY p_operations LOOP INSERT INTO backend_core.settlement_account_permissions VALUES(a.id,p_actor_id,op) ON CONFLICT DO NOTHING;END LOOP;
 INSERT INTO backend_core.settlement_audit(event,actor_id,organization_id,store_id,request_id,details) VALUES('ACCOUNT_ACTOR_AUTHORIZED',backend_core.active_subject(),a.organization_id,a.store_id,a.id,jsonb_build_object('actor',p_actor_id,'operations',p_operations));
END $$;
CREATE FUNCTION backend_core.canonical_settlement_fact_v1(k text,sid uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE r jsonb;
BEGIN
 IF k='SALE_PAYMENT' THEN SELECT jsonb_build_object('organization',p.organization_id,'store',p.store_id,'amount',p.paid_amount::text,'method',upper(p.payment_method),'currency',p.currency_context->>'currency','createdAt',p.created_at,'actor',p.created_by,'saleId',p.sale_id) INTO r FROM public.sale_payments p WHERE p.id=sid;
 ELSIF k='COLLECTION' THEN SELECT jsonb_build_object('organization',s.organization_id,'store',p.store_id,'amount',(-p.delta)::text,'method',upper(coalesce(p.method,p.payment_method)),'currency',p.currency_context->>'currency','createdAt',p.created_at,'actor',p.created_by) INTO r FROM public.credit_ledger_v2 p JOIN public.credit_accounts_v2 c ON c.id=p.credit_account_id AND c.store_id=p.store_id JOIN public.stores s ON s.id=p.store_id WHERE p.id=sid AND p.delta<0 AND p.entry_type='PAYMENT';
 ELSIF k='EXPENSE' THEN SELECT jsonb_build_object('organization',p.organization_id,'store',p.store_id,'amount',(-p.amount)::text,'method',upper(p.payment_method),'currency',p.currency_context->>'currency','createdAt',p.created_at,'actor',p.created_by) INTO r FROM public.expenses p WHERE p.id=sid;
 ELSE RAISE EXCEPTION 'UNVERIFIED_CANONICAL_SETTLEMENT_SOURCE';END IF;
 IF r IS NULL OR r->>'currency' IS NULL OR (r->>'amount')::numeric=0 THEN RAISE EXCEPTION 'ORIGINAL_SETTLEMENT_FACT_REQUIRED';END IF;RETURN r;
END $$;
CREATE FUNCTION backend_core.bind_canonical_settlement_v1(k text,id uuid,ac uuid,shift uuid,evidence jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE a backend_core.settlement_accounts%ROWTYPE;r jsonb;i backend_core.settlement_intents%ROWTYPE;cs public.cashier_shifts%ROWTYPE;op text;role text;digits integer;available numeric;other record;
BEGIN
 SELECT * INTO i FROM backend_core.settlement_intents WHERE backend_pid=pg_backend_pid() AND transaction_id=txid_current() AND actor_id=backend_core.active_subject();IF NOT FOUND THEN RAISE EXCEPTION 'ATOMIC_SETTLEMENT_CONTEXT_REQUIRED';END IF;
 r:=backend_core.canonical_settlement_fact_v1(k,id);SELECT * INTO a FROM backend_core.settlement_accounts WHERE settlement_accounts.id=ac FOR UPDATE;
 op:=CASE k WHEN 'SALE_PAYMENT' THEN 'SALE' ELSE k END;
 IF a.id IS NULL OR a.locked OR a.organization_id IS DISTINCT FROM i.organization_id OR a.store_id IS DISTINCT FROM i.store_id OR (r->>'organization')::uuid IS DISTINCT FROM i.organization_id OR (r->>'store')::uuid IS DISTINCT FROM i.store_id OR r->>'currency' IS DISTINCT FROM a.currency OR r->>'method' IS DISTINCT FROM a.kind OR (r->>'actor')::uuid IS DISTINCT FROM i.actor_id OR (r->>'createdAt')::timestamptz<transaction_timestamp() OR (r->>'createdAt')::timestamptz<a.opening_at THEN RAISE EXCEPTION 'SETTLEMENT_ACCOUNT_SOURCE_SCOPE_MISMATCH';END IF;
 SELECT minor_units INTO digits FROM proforma_backend.currency_catalog WHERE code=a.currency;IF (r->>'amount')::numeric<>round((r->>'amount')::numeric,digits) THEN RAISE EXCEPTION 'SETTLEMENT_PRECISION_MISMATCH';END IF;
 IF NOT backend_core.settlement_owner_v1(i.organization_id) AND NOT EXISTS(SELECT 1 FROM backend_core.settlement_account_permissions WHERE account_id=a.id AND actor_id=i.actor_id AND operation=op) THEN RAISE EXCEPTION 'ACCOUNT_OPERATION_NOT_AUTHORIZED';END IF;
 IF length(btrim(coalesce(evidence->>'reference','')))<8 OR evidence->>'source' IS DISTINCT FROM 'OWNER_CONFIRMED' AND a.kind<>'CASH' THEN RAISE EXCEPTION 'SETTLEMENT_CONFIRMATION_REQUIRED';END IF;
 IF a.kind<>'CASH' AND NOT backend_core.settlement_owner_v1(i.organization_id) THEN RAISE EXCEPTION 'TRUSTED_PROVIDER_OR_OWNER_CONFIRMATION_REQUIRED';END IF;
 SELECT lower(m.role) INTO role FROM public.org_memberships m WHERE m.organization_id=i.organization_id AND m.user_id=i.actor_id AND coalesce(m.is_active,true) LIMIT 1;
 IF role='cashier' AND shift IS NULL THEN RAISE EXCEPTION 'CASHIER_SHIFT_REQUIRED';END IF;
 IF shift IS NOT NULL THEN
  SELECT * INTO cs FROM public.cashier_shifts WHERE cashier_shifts.id=shift FOR UPDATE;
  IF cs.id IS NULL OR cs.status<>'OPEN' OR cs.organization_id<>i.organization_id OR cs.store_id<>i.store_id OR cs.currency_context->>'currency' IS DISTINCT FROM a.currency OR NOT EXISTS(SELECT 1 FROM public.org_memberships m WHERE m.id=cs.membership_id AND m.user_id=i.actor_id AND coalesce(m.is_active,true)) THEN RAISE EXCEPTION 'SETTLEMENT_SHIFT_OWNERSHIP_OR_STATE_INVALID';END IF;
  IF (r->>'createdAt')::timestamptz<cs.opened_at THEN RAISE EXCEPTION 'SETTLEMENT_OUTSIDE_SHIFT';END IF;
  IF k='SALE_PAYMENT' AND NOT EXISTS(SELECT 1 FROM public.sales s WHERE s.id=(r->>'saleId')::uuid AND s.cashier_shift_id=shift) THEN RAISE EXCEPTION 'SALE_SHIFT_LINK_MISMATCH';END IF;
 END IF;
 IF (r->>'amount')::numeric<0 THEN
  available:=a.opening_amount;FOR other IN SELECT * FROM backend_core.settlement_bindings WHERE account_id=a.id LOOP available:=available+(backend_core.canonical_settlement_fact_v1(other.source_kind,other.source_id)->>'amount')::numeric;END LOOP;
  IF available+(r->>'amount')::numeric<0 THEN RAISE EXCEPTION 'VERIFIED_ACCOUNT_FUNDS_INSUFFICIENT';END IF;
 END IF;
 INSERT INTO backend_core.settlement_bindings VALUES(k,id,ac,i.organization_id,i.store_id,shift,i.actor_id,i.request_id,evidence->>'reference',CASE WHEN a.kind='CASH' THEN 'AUTHORIZED_CANONICAL_CASH_RECORD' ELSE 'OWNER_CONFIRMED_RECORD_NOT_PROVIDER_VERIFIED' END,clock_timestamp());
 INSERT INTO backend_core.settlement_audit(event,actor_id,organization_id,store_id,request_id,details) VALUES('CANONICAL_SETTLEMENT_BOUND',i.actor_id,i.organization_id,i.store_id,i.request_id,jsonb_build_object('sourceKind',k,'sourceId',id,'accountId',ac,'shiftId',shift));
END $$;
CREATE FUNCTION public.post_bound_financial_v1(p_store_id uuid,p_request_id uuid,p_currency text,p_revision integer,p_operation text,p_payload jsonb,p_accounts jsonb,p_shift_id uuid,p_evidence jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid:=backend_core.active_subject();o uuid:=backend_core.settlement_scope_v1(p_store_id);body jsonb;prior backend_core.settlement_requests%ROWTYPE;result jsonb;rid uuid;row record;
BEGIN
 IF p_request_id IS NULL OR p_operation IS NULL OR p_operation NOT IN ('SALE','COLLECTION','EXPENSE') OR jsonb_typeof(p_payload) IS DISTINCT FROM 'object' OR jsonb_typeof(p_accounts) IS DISTINCT FROM 'object' OR jsonb_typeof(p_evidence) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'INVALID_BOUND_FINANCIAL_REQUEST';END IF;
 body:=jsonb_build_object('currency',p_currency,'revision',p_revision,'operation',p_operation,'payload',p_payload,'accounts',p_accounts,'shift',p_shift_id,'evidence',p_evidence);
 PERFORM pg_advisory_xact_lock(hashtextextended(p_store_id::text||':'||p_request_id::text,0));SELECT * INTO prior FROM backend_core.settlement_requests WHERE store_id=p_store_id AND request_id=p_request_id;
 IF FOUND THEN IF prior.actor_id<>actor OR prior.organization_id<>o OR prior.payload<>body THEN RAISE EXCEPTION 'BOUND_REQUEST_CONFLICT';END IF;RETURN prior.result;END IF;
 IF NOT EXISTS(SELECT 1 FROM backend_core.settlement_rollout WHERE organization_id=o AND enabled) THEN RAISE EXCEPTION 'SETTLEMENT_ROLLOUT_DISABLED';END IF;
 IF p_shift_id IS NOT NULL THEN PERFORM 1 FROM public.cashier_shifts WHERE id=p_shift_id AND organization_id=o AND store_id=p_store_id AND status='OPEN' FOR UPDATE;IF NOT FOUND THEN RAISE EXCEPTION 'SHIFT_NOT_OPEN';END IF;END IF;
 FOR row IN SELECT DISTINCT value::uuid id FROM jsonb_each_text(p_accounts) ORDER BY 1 LOOP PERFORM 1 FROM backend_core.settlement_accounts WHERE id=row.id AND organization_id=o AND store_id=p_store_id AND currency=p_currency AND NOT locked FOR UPDATE;IF NOT FOUND THEN RAISE EXCEPTION 'BOUND_ACCOUNT_REQUIRED';END IF;END LOOP;
 IF EXISTS(SELECT 1 FROM backend_core.native_financial_requests WHERE store_id=p_store_id AND request_id=p_request_id) THEN RAISE EXCEPTION 'UNBOUND_LEGACY_REQUEST_REQUIRES_REVIEW';END IF;
 INSERT INTO backend_core.settlement_intents VALUES(pg_backend_pid(),txid_current(),actor,o,p_store_id,p_request_id,p_operation);
 IF p_operation='SALE' THEN
  IF (p_payload->>'cashier_shift_id')::uuid IS DISTINCT FROM p_shift_id THEN RAISE EXCEPTION 'SALE_SHIFT_LINK_MISMATCH';END IF;
  result:=public.create_native_sale_v1(p_store_id,p_request_id,p_currency,p_revision,p_payload);rid:=(result->>'saleId')::uuid;
  FOR row IN SELECT id,upper(payment_method) method FROM public.sale_payments WHERE sale_id=rid ORDER BY id LOOP PERFORM backend_core.bind_canonical_settlement_v1('SALE_PAYMENT',row.id,(p_accounts->>row.method)::uuid,p_shift_id,p_evidence);END LOOP;
 ELSIF p_operation='COLLECTION' THEN
  result:=public.repay_native_credit_v1(p_store_id,p_request_id,p_currency,p_revision,(p_payload->>'credit_account_id')::uuid,(p_payload->>'amount')::numeric,p_payload->>'method',p_payload->>'reference',p_payload->>'note');
  PERFORM backend_core.bind_canonical_settlement_v1('COLLECTION',(result->>'ledgerId')::uuid,(p_accounts->>(p_payload->>'method'))::uuid,p_shift_id,p_evidence);
 ELSE
  result:=public.create_native_expense_v1(p_store_id,p_request_id,p_currency,p_revision,p_payload);
  PERFORM backend_core.bind_canonical_settlement_v1('EXPENSE',(result->>'expenseId')::uuid,(p_accounts->>(p_payload->>'payment_method'))::uuid,p_shift_id,p_evidence);
 END IF;
 result:=result||jsonb_build_object('canonicalAccountBinding',true,'externalProviderVerified',false);
 INSERT INTO backend_core.settlement_requests VALUES(p_store_id,p_request_id,actor,o,body,result,clock_timestamp());DELETE FROM backend_core.settlement_intents WHERE backend_pid=pg_backend_pid() AND transaction_id=txid_current();RETURN result;
END $$;
CREATE FUNCTION backend_core.enforce_bound_canonical_v1() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE k text;o uuid;s uuid;required boolean;r jsonb:=to_jsonb(NEW);BEGIN
 k:=CASE TG_TABLE_NAME WHEN 'sale_payments' THEN 'SALE_PAYMENT' WHEN 'credit_ledger_v2' THEN 'COLLECTION' WHEN 'expenses' THEN 'EXPENSE' ELSE NULL END;
 IF k IS NULL THEN RAISE EXCEPTION 'INVALID_SETTLEMENT_TRIGGER';END IF;
 IF k='COLLECTION' AND ((r->>'delta')::numeric>=0 OR r->>'entry_type'<>'PAYMENT') THEN RETURN NEW;END IF;
 s:=(r->>'store_id')::uuid;SELECT organization_id INTO o FROM public.stores WHERE id=s;SELECT coalesce(enabled,false) INTO required FROM backend_core.settlement_rollout WHERE organization_id=o;
 IF required IS TRUE AND NOT EXISTS(SELECT 1 FROM backend_core.settlement_bindings WHERE source_kind=k AND source_id=NEW.id AND organization_id=o AND store_id=s) THEN RAISE EXCEPTION 'CANONICAL_SETTLEMENT_BINDING_REQUIRED';END IF;RETURN NEW;
END $$;
CREATE FUNCTION backend_core.freeze_bound_canonical_v1() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE k text;BEGIN k:=CASE TG_TABLE_NAME WHEN 'sale_payments' THEN 'SALE_PAYMENT' WHEN 'credit_ledger_v2' THEN 'COLLECTION' ELSE 'EXPENSE' END;
 IF EXISTS(SELECT 1 FROM backend_core.settlement_bindings WHERE source_kind=k AND source_id=OLD.id) THEN RAISE EXCEPTION 'BOUND_CANONICAL_SOURCE_IMMUTABLE';END IF;IF TG_OP='DELETE' THEN RETURN OLD;END IF;RETURN NEW;END $$;
DO $$DECLARE t text;BEGIN FOREACH t IN ARRAY ARRAY['sale_payments','credit_ledger_v2','expenses'] LOOP
 EXECUTE format('CREATE CONSTRAINT TRIGGER enforce_bound_canonical_v1 AFTER INSERT ON public.%I DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION backend_core.enforce_bound_canonical_v1()',t);
 EXECUTE format('CREATE TRIGGER freeze_bound_canonical_v1 BEFORE UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION backend_core.freeze_bound_canonical_v1()',t);END LOOP;END $$;
CREATE FUNCTION public.read_bound_account_balance_v1(p_account_id uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE a backend_core.settlement_accounts%ROWTYPE;movement numeric:=0;b record;r jsonb;
BEGIN SELECT * INTO a FROM backend_core.settlement_accounts WHERE id=p_account_id;IF NOT FOUND THEN RAISE EXCEPTION 'ACCOUNT_NOT_FOUND';END IF;PERFORM backend_core.settlement_scope_v1(a.store_id);
 IF NOT backend_core.settlement_owner_v1(a.organization_id) THEN RAISE EXCEPTION 'ACCOUNT_OWNER_READ_REQUIRED';END IF;
 FOR b IN SELECT * FROM backend_core.settlement_bindings WHERE account_id=a.id LOOP r:=backend_core.canonical_settlement_fact_v1(b.source_kind,b.source_id);IF r->>'currency' IS DISTINCT FROM a.currency THEN RAISE EXCEPTION 'BOUND_ORIGINAL_CURRENCY_DRIFT';END IF;movement:=movement+(r->>'amount')::numeric;END LOOP;
 RETURN jsonb_build_object('accountId',a.id,'currency',a.currency,'opening',a.opening_amount::text,'openingAt',a.opening_at,'netCanonicalMovements',movement::text,'balance',(a.opening_amount+movement)::text,'source','OWNER_CONFIRMED_OPENING_PLUS_BOUND_CANONICAL_RECORDS','externalProviderVerified',false);
END $$;
CREATE FUNCTION public.read_bound_shift_reconciliation_v1(p_shift_id uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
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
 RETURN jsonb_build_object('shiftId',cs.id,'currency',cs.currency_context->>'currency','openingCash',cs.opening_cash::text,'cashMovements',cash::text,'bankMovements',bank::text,'mobileMovements',mobile::text,'expectedCash',(cs.opening_cash+cash)::text,'drawerCount',cs.drawer_count::text,'discrepancy',CASE WHEN cs.drawer_count IS NULL THEN NULL ELSE (cs.drawer_count-cs.opening_cash-cash)::text END,'canonicalBreakdown',breakdown,'unboundSalePayments',missing,'complete',false,'blockedSources',jsonb_build_array('REFUND_ORIGINAL_TAX_REVERSAL','SUPPLIER_CUSTODY_SETTLEMENT','UNBOUND_LEGACY_COLLECTION_OR_EXPENSE_SHIFT_CONTEXT'),'note','No historical shift/account/tax inference; subtotal only until every required source contract is verified');
END $$;
-- No generic refund, supplier posting or account movement is invented here.
-- Canonical evidence reader tells clients exactly why a reversal must fail closed.
CREATE FUNCTION public.original_refund_readiness_v1(p_sale_id uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE s public.sales%ROWTYPE;items jsonb;
BEGIN SELECT * INTO s FROM public.sales WHERE id=p_sale_id;IF NOT FOUND THEN RAISE EXCEPTION 'SALE_NOT_FOUND';END IF;PERFORM backend_core.settlement_scope_v1(s.store_id);
 IF NOT backend_core.settlement_owner_v1(s.organization_id) THEN RAISE EXCEPTION 'REFUND_OWNER_EVIDENCE_REQUIRED';END IF;
 SELECT jsonb_agg(jsonb_build_object('itemId',i.id,'productId',i.product_id,'quantity',i.qty::text,'unitCost',i.unit_cost::text,'unitPrice',i.unit_price::text)) INTO items FROM public.sale_items i WHERE i.sale_id=s.id;
 RETURN jsonb_build_object('saleId',s.id,'currencyContext',s.currency_context,'savedSubtotal',s.subtotal_amount::text,'savedDiscount',s.discount_amount::text,'savedTotal',s.grand_total::text,'savedPaid',s.paid_amount::text,'items',items,'originalTaxEvidence',NULL,'originalLineDiscountAllocations',NULL,'postingAllowed',false,'blocker','ORIGINAL_VERIFIED_TAX_DISCOUNT_AND_REFUND_SETTLEMENT_EVIDENCE_REQUIRED');
END $$;
DO $$DECLARE t text;p record;r record;BEGIN
 FOREACH t IN ARRAY ARRAY['settlement_rollout','settlement_accounts','settlement_account_permissions','settlement_intents','settlement_requests','settlement_bindings','settlement_audit'] LOOP EXECUTE format('ALTER TABLE backend_core.%I ENABLE ROW LEVEL SECURITY',t);EXECUTE format('ALTER TABLE backend_core.%I FORCE ROW LEVEL SECURITY',t);EXECUTE format('REVOKE ALL ON backend_core.%I FROM PUBLIC,anon,authenticated,service_role',t);END LOOP;
 FOR p IN SELECT oid,proowner FROM pg_proc WHERE pronamespace IN ('public'::regnamespace,'backend_core'::regnamespace) AND proname IN ('immutable_settlement_evidence_v1','settlement_scope_v1','settlement_owner_v1','confirm_settlement_account_v1','authorize_settlement_actor_v1','canonical_settlement_fact_v1','bind_canonical_settlement_v1','post_bound_financial_v1','enforce_bound_canonical_v1','freeze_bound_canonical_v1','read_bound_account_balance_v1','read_bound_shift_reconciliation_v1','original_refund_readiness_v1') LOOP
 EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC',p.oid::regprocedure);
 FOR r IN SELECT DISTINCT pg_get_userbyid(a.grantee) name FROM pg_proc f CROSS JOIN LATERAL aclexplode(coalesce(f.proacl,acldefault('f',f.proowner))) a WHERE f.oid=p.oid AND a.grantee<>p.proowner AND a.grantee<>0 LOOP EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %I',p.oid::regprocedure,r.name);END LOOP;END LOOP;
END $$;
COMMIT;
