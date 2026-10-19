BEGIN;SET LOCAL lock_timeout='3s';SET LOCAL statement_timeout='45s';
DO $$BEGIN IF md5(replace(pg_get_functiondef('backend_core.canonical_settlement_fact_v1(text,uuid)'::regprocedure),chr(13),''))<>'58a7a9529ff9a7137c934c7f39f23d06' THEN RAISE EXCEPTION '1915_EXACT_DEPENDENCY_MISMATCH';END IF;END$$;
DO $$BEGIN IF md5(replace(pg_get_functiondef('backend_core.native_unverified_writer_guard_v1()'::regprocedure),chr(13),''))<>'4a0c897c9f0bc7618e817a73a458dcf4' THEN RAISE EXCEPTION '1915_EXACT_DEPENDENCY_MISMATCH';END IF;END$$;
-- LOCAL DRAFT: canonical wallet transactions and settlement projections only.
-- Historical wallets require a separately verified cutover; no balance inference.
CREATE TABLE backend_core.bound_field_wallets(
 wallet_id uuid PRIMARY KEY REFERENCES public.field_wallets(id),
 account_id uuid NOT NULL UNIQUE REFERENCES backend_core.settlement_accounts(id),
 organization_id uuid NOT NULL,store_id uuid NOT NULL,currency text NOT NULL,currency_revision integer NOT NULL,
 confirmed_by uuid NOT NULL,confirmation_reference text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE backend_core.field_custody_links(
 wallet_transaction_id uuid PRIMARY KEY REFERENCES public.field_wallet_transactions(id),
 wallet_id uuid NOT NULL REFERENCES backend_core.bound_field_wallets(wallet_id),
 source_account_id uuid REFERENCES backend_core.settlement_accounts(id),
 operation text NOT NULL CHECK(operation IN('FUND','RETURN','SUPPLIER','EXPENSE')),
 inbound_payment_id uuid UNIQUE REFERENCES public.inbound_stock_payments(id),
 expense_id uuid UNIQUE REFERENCES public.expenses(id),
 request_id uuid NOT NULL,actor_id uuid NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK((operation='SUPPLIER')=(inbound_payment_id IS NOT NULL)),
 CHECK((operation='EXPENSE')=(expense_id IS NOT NULL)),
 CHECK((operation IN('FUND','RETURN'))=(source_account_id IS NOT NULL)),UNIQUE(wallet_id,request_id)
);
CREATE TABLE backend_core.field_custody_intents(
 backend_pid integer NOT NULL,transaction_id bigint NOT NULL,actor_id uuid NOT NULL,
 wallet_id uuid NOT NULL,organization_id uuid NOT NULL,store_id uuid NOT NULL,
 PRIMARY KEY(backend_pid,transaction_id)
);
CREATE TRIGGER immutable_bound_field_wallet BEFORE UPDATE OR DELETE ON backend_core.bound_field_wallets FOR EACH ROW EXECUTE FUNCTION backend_core.immutable_settlement_evidence_v1();
CREATE TRIGGER immutable_field_custody_link BEFORE UPDATE OR DELETE ON backend_core.field_custody_links FOR EACH ROW EXECUTE FUNCTION backend_core.immutable_settlement_evidence_v1();
ALTER TABLE public.field_wallets ALTER COLUMN balance TYPE numeric;
ALTER TABLE public.field_wallet_transactions ALTER COLUMN amount TYPE numeric;
ALTER TABLE public.field_wallet_transactions ALTER COLUMN balance_before TYPE numeric;
ALTER TABLE public.field_wallet_transactions ALTER COLUMN balance_after TYPE numeric;
ALTER TABLE backend_core.settlement_bindings DROP CONSTRAINT settlement_bindings_source_kind_check;
ALTER TABLE backend_core.settlement_bindings ADD CONSTRAINT settlement_bindings_source_kind_check CHECK(source_kind IN('SALE_PAYMENT','COLLECTION','EXPENSE','SUPPLIER_PAYMENT','REFUND','CUSTODY_IN','CUSTODY_OUT'));
CREATE FUNCTION public.confirm_bound_field_wallet_v1(p_wallet_id uuid,p_account_id uuid,p_reference text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE w public.field_wallets%ROWTYPE;a backend_core.settlement_accounts%ROWTYPE;b backend_core.bound_field_wallets%ROWTYPE;
BEGIN
 SELECT * INTO w FROM public.field_wallets WHERE id=p_wallet_id FOR UPDATE;
 IF w.id IS NULL OR NOT w.is_active OR NOT backend_core.settlement_owner_v1(w.organization_id) THEN RAISE EXCEPTION 'OWNER_FIELD_WALLET_REQUIRED';END IF;
 PERFORM backend_core.settlement_scope_v1(w.store_id);
 IF NOT EXISTS(SELECT 1 FROM public.stores WHERE id=w.store_id AND organization_id=w.organization_id AND store_type='FIELD_PROCUREMENT' AND is_active) OR length(trim(coalesce(p_reference,'')))<8 THEN RAISE EXCEPTION 'VERIFIED_FIELD_WALLET_REQUIRED';END IF;
 SELECT * INTO b FROM backend_core.bound_field_wallets WHERE wallet_id=w.id;
 IF FOUND THEN IF b.account_id<>p_account_id OR b.confirmation_reference<>p_reference THEN RAISE EXCEPTION 'FIELD_CUTOVER_CONFLICT';END IF;RETURN jsonb_build_object('walletId',w.id,'accountId',b.account_id,'currency',b.currency);END IF;
 SELECT * INTO a FROM backend_core.settlement_accounts WHERE id=p_account_id FOR UPDATE;
 IF a.id IS NULL OR a.kind<>'CASH' OR a.organization_id<>w.organization_id OR a.store_id<>w.store_id OR a.locked OR a.opening_amount<>0 OR w.balance<>0
 OR EXISTS(SELECT 1 FROM public.field_wallet_transactions WHERE wallet_id=w.id)
 OR EXISTS(SELECT 1 FROM backend_core.settlement_bindings WHERE account_id=a.id)
 OR EXISTS(SELECT 1 FROM backend_core.shift_account_bindings WHERE account_id=a.id)
 OR NOT EXISTS(SELECT 1 FROM proforma_backend.accounting_currency WHERE organization_id=w.organization_id AND currency=a.currency) THEN RAISE EXCEPTION 'EMPTY_VERIFIED_WALLET_CUTOVER_REQUIRED';END IF;
 INSERT INTO backend_core.bound_field_wallets SELECT w.id,a.id,w.organization_id,w.store_id,a.currency,revision,backend_core.active_subject(),p_reference,clock_timestamp() FROM proforma_backend.accounting_currency WHERE organization_id=w.organization_id AND currency=a.currency;
 RETURN jsonb_build_object('walletId',w.id,'accountId',a.id,'currency',a.currency);
END $$;
CREATE FUNCTION backend_core.guard_bound_wallet_v1() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE w uuid;r jsonb;BEGIN
 r:=CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
 w:=CASE WHEN TG_TABLE_NAME='field_wallets' THEN (r->>'id')::uuid ELSE (r->>'wallet_id')::uuid END;
 IF EXISTS(SELECT 1 FROM backend_core.bound_field_wallets WHERE wallet_id=w) THEN
  IF TG_OP='DELETE' OR TG_TABLE_NAME='field_wallet_transactions' AND TG_OP='UPDATE' OR NOT EXISTS(SELECT 1 FROM backend_core.field_custody_intents i WHERE i.backend_pid=pg_backend_pid() AND i.transaction_id=txid_current() AND i.actor_id=backend_core.active_subject() AND i.wallet_id=w) THEN RAISE EXCEPTION 'BOUND_WALLET_CANONICAL_WRITER_REQUIRED';END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD;END IF;RETURN NEW;
END $$;
CREATE FUNCTION public.open_bound_field_wallet_v1(p_wallet_id uuid,p_store_id uuid,p_membership_id uuid,p_account_id uuid,p_reference text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE o uuid:=backend_core.settlement_scope_v1(p_store_id);actor uuid:=backend_core.active_subject();w public.field_wallets%ROWTYPE;r jsonb;
BEGIN
 IF p_wallet_id IS NULL OR NOT backend_core.settlement_owner_v1(o) OR NOT EXISTS(SELECT 1 FROM backend_core.settlement_rollout WHERE organization_id=o AND enabled) THEN RAISE EXCEPTION 'OWNER_WALLET_ROLLOUT_REQUIRED';END IF;
 IF NOT EXISTS(SELECT 1 FROM public.org_memberships m JOIN public.org_membership_stores ms ON ms.membership_id=m.id WHERE m.id=p_membership_id AND m.organization_id=o AND coalesce(m.is_active,true) AND ms.store_id=p_store_id) THEN RAISE EXCEPTION 'ACTIVE_ASSIGNED_CUSTODIAN_REQUIRED';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('settlement-store:'||p_store_id::text,0));
 SELECT * INTO w FROM public.field_wallets WHERE store_id=p_store_id AND membership_id=p_membership_id FOR UPDATE;
 IF FOUND AND w.id<>p_wallet_id THEN RAISE EXCEPTION 'EXISTING_WALLET_ID_REQUIRED';END IF;
 IF NOT FOUND THEN
  INSERT INTO backend_core.field_custody_intents VALUES(pg_backend_pid(),txid_current(),actor,p_wallet_id,o,p_store_id);
  INSERT INTO public.field_wallets(id,organization_id,store_id,membership_id,balance,created_by) VALUES(p_wallet_id,o,p_store_id,p_membership_id,0,actor);
  DELETE FROM backend_core.field_custody_intents WHERE backend_pid=pg_backend_pid() AND transaction_id=txid_current();
 END IF;
 RETURN public.confirm_bound_field_wallet_v1(p_wallet_id,p_account_id,p_reference);
END $$;
CREATE TRIGGER bound_wallet_guard BEFORE UPDATE OR DELETE ON public.field_wallets FOR EACH ROW EXECUTE FUNCTION backend_core.guard_bound_wallet_v1();
CREATE TRIGGER bound_wallet_guard BEFORE INSERT OR UPDATE OR DELETE ON public.field_wallet_transactions FOR EACH ROW EXECUTE FUNCTION backend_core.guard_bound_wallet_v1();
CREATE FUNCTION backend_core.stamp_bound_wallet_transaction_v1() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM backend_core.field_custody_intents i WHERE i.backend_pid=pg_backend_pid() AND i.transaction_id=txid_current() AND i.actor_id=backend_core.active_subject() AND i.wallet_id=NEW.wallet_id) THEN NEW.created_at:=clock_timestamp();END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER bound_wallet_created_at BEFORE INSERT ON public.field_wallet_transactions FOR EACH ROW EXECUTE FUNCTION backend_core.stamp_bound_wallet_transaction_v1();
CREATE FUNCTION backend_core.stamp_bound_field_supplier_v1() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM backend_core.field_custody_intents i JOIN public.inbound_stock_orders o ON o.id=NEW.inbound_order_id AND o.store_id=i.store_id AND o.organization_id=i.organization_id WHERE i.backend_pid=pg_backend_pid() AND i.transaction_id=txid_current() AND i.actor_id=backend_core.active_subject() AND i.organization_id=NEW.organization_id) THEN NEW.created_at:=clock_timestamp();END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER bound_field_supplier_created_at BEFORE INSERT ON public.inbound_stock_payments FOR EACH ROW EXECUTE FUNCTION backend_core.stamp_bound_field_supplier_v1();
CREATE FUNCTION backend_core.stamp_bound_field_expense_v1() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM backend_core.field_custody_intents i WHERE i.backend_pid=pg_backend_pid() AND i.transaction_id=txid_current() AND i.actor_id=backend_core.active_subject() AND i.organization_id=NEW.organization_id AND i.store_id=NEW.store_id) THEN NEW.created_at:=clock_timestamp();END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER bound_field_expense_created_at BEFORE INSERT ON public.expenses FOR EACH ROW EXECUTE FUNCTION backend_core.stamp_bound_field_expense_v1();
CREATE FUNCTION backend_core.check_bound_wallet_v1() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE b backend_core.bound_field_wallets%ROWTYPE;w public.field_wallets%ROWTYPE;proj jsonb;tx public.field_wallet_transactions%ROWTYPE;l backend_core.field_custody_links%ROWTYPE;v numeric;
BEGIN
 IF TG_TABLE_NAME='settlement_bindings' THEN SELECT * INTO b FROM backend_core.bound_field_wallets WHERE account_id=NEW.account_id;
 ELSE SELECT * INTO b FROM backend_core.bound_field_wallets WHERE wallet_id=NEW.wallet_id;END IF;
 IF b.wallet_id IS NULL THEN RETURN NEW;END IF;
 IF TG_TABLE_NAME='settlement_bindings' THEN
  IF NEW.source_kind NOT IN('SUPPLIER_PAYMENT','EXPENSE','CUSTODY_IN','CUSTODY_OUT') THEN RAISE EXCEPTION 'UNSUPPORTED_CUSTODY_ACCOUNT_SOURCE';END IF;
 END IF;
 SELECT * INTO w FROM public.field_wallets WHERE id=b.wallet_id;proj:=backend_core.project_bound_account_v1(b.account_id);
 IF w.balance IS DISTINCT FROM (proj->>'balance')::numeric THEN RAISE EXCEPTION 'WALLET_ACCOUNT_CONSERVATION_FAILED';END IF;
 FOR tx IN SELECT * FROM public.field_wallet_transactions WHERE wallet_id=w.id LOOP
  SELECT * INTO l FROM backend_core.field_custody_links WHERE wallet_transaction_id=tx.id;
  IF NOT FOUND OR l.wallet_id<>w.id OR tx.organization_id<>b.organization_id OR tx.store_id<>b.store_id OR tx.membership_id<>w.membership_id OR tx.created_by<>l.actor_id THEN RAISE EXCEPTION 'CANONICAL_WALLET_LINK_REQUIRED';END IF;
  IF l.operation='SUPPLIER' THEN
   SELECT p.amount INTO v FROM public.inbound_stock_payments p JOIN backend_core.settlement_bindings sb ON sb.source_kind='SUPPLIER_PAYMENT' AND sb.source_id=p.id AND sb.account_id=b.account_id WHERE p.id=l.inbound_payment_id;
   IF v IS NULL OR v<>tx.amount OR tx.balance_before-tx.balance_after<>v OR tx.type<>'PURCHASE' THEN RAISE EXCEPTION 'WALLET_SUPPLIER_SETTLEMENT_MISMATCH';END IF;
  ELSIF l.operation='EXPENSE' THEN
   SELECT e.amount INTO v FROM public.expenses e JOIN backend_core.settlement_bindings sb ON sb.source_kind='EXPENSE' AND sb.source_id=e.id AND sb.account_id=b.account_id WHERE e.id=l.expense_id;
   IF v IS NULL OR v<>tx.amount OR tx.balance_before-tx.balance_after<>v OR tx.type<>'EXPENSE' THEN RAISE EXCEPTION 'WALLET_EXPENSE_SETTLEMENT_MISMATCH';END IF;
  ELSIF tx.amount<=0 OR tx.balance_after-tx.balance_before IS DISTINCT FROM (CASE WHEN l.operation='FUND' THEN tx.amount ELSE -tx.amount END)
   OR (SELECT count(*) FROM backend_core.settlement_bindings sb WHERE sb.source_id=tx.id AND sb.source_kind IN('CUSTODY_IN','CUSTODY_OUT'))<>2 THEN RAISE EXCEPTION 'WALLET_TRANSFER_BINDING_REQUIRED';END IF;
 END LOOP;
 RETURN NEW;
END $$;
CREATE CONSTRAINT TRIGGER check_bound_wallet AFTER INSERT ON public.field_wallet_transactions DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION backend_core.check_bound_wallet_v1();
CREATE CONSTRAINT TRIGGER check_bound_wallet AFTER INSERT ON backend_core.settlement_bindings DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION backend_core.check_bound_wallet_v1();
CREATE FUNCTION public.post_bound_field_custody_v1(p_store_id uuid,p_request_id uuid,p_wallet_id uuid,p_source_account_id uuid,p_operation text,p_payload jsonb,p_shift_id uuid,p_evidence jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE o uuid:=backend_core.settlement_scope_v1(p_store_id);actor uuid:=backend_core.active_subject();b backend_core.bound_field_wallets%ROWTYPE;w public.field_wallets%ROWTYPE;body jsonb;prior backend_core.settlement_requests%ROWTYPE;r jsonb;tx uuid;amt numeric;digits integer;cycle uuid;row record;revision integer;subrequest uuid;
BEGIN
 IF NOT backend_core.settlement_owner_v1(o) OR p_request_id IS NULL OR p_operation IS NULL OR p_operation NOT IN('FUND','RETURN','SUPPLIER','EXPENSE') OR jsonb_typeof(p_payload) IS DISTINCT FROM 'object' OR jsonb_typeof(p_evidence) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'OWNER_CUSTODY_REQUEST_REQUIRED';END IF;
 body:=jsonb_build_object('operation','FIELD_'||p_operation,'wallet',p_wallet_id,'sourceAccount',p_source_account_id,'payload',p_payload,'shift',p_shift_id,'evidence',p_evidence);
 PERFORM pg_advisory_xact_lock(hashtextextended('settlement-store:'||p_store_id::text,0));
 PERFORM pg_advisory_xact_lock(hashtextextended(p_store_id::text||':'||p_request_id::text,0));
 SELECT * INTO prior FROM backend_core.settlement_requests WHERE store_id=p_store_id AND request_id=p_request_id;
 IF FOUND THEN IF prior.actor_id<>actor OR prior.organization_id<>o OR prior.payload<>body THEN RAISE EXCEPTION 'BOUND_REQUEST_CONFLICT';END IF;RETURN prior.result;END IF;
 SELECT * INTO b FROM backend_core.bound_field_wallets WHERE wallet_id=p_wallet_id AND organization_id=o AND store_id=p_store_id;
 IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM backend_core.settlement_rollout WHERE organization_id=o AND enabled) THEN RAISE EXCEPTION 'VERIFIED_WALLET_ROLLOUT_REQUIRED';END IF;
 SELECT minor_units,ac.revision INTO digits,revision FROM proforma_backend.currency_catalog c JOIN proforma_backend.accounting_currency ac ON ac.currency=c.code WHERE ac.organization_id=o AND c.code=b.currency;
 IF digits IS NULL OR revision<>b.currency_revision OR coalesce(p_payload->>'amount','')!~'^\d{1,18}(\.\d{1,12})?$' THEN RAISE EXCEPTION 'ORIGINAL_CUSTODY_CURRENCY_REQUIRED';END IF;
 amt:=(p_payload->>'amount')::numeric;IF amt<=0 OR amt<>round(amt,digits) THEN RAISE EXCEPTION 'INVALID_CUSTODY_AMOUNT';END IF;
 IF p_operation IN('SUPPLIER','EXPENSE') AND p_source_account_id IS NOT NULL OR p_operation IN('FUND','RETURN') AND (p_source_account_id IS NULL OR p_source_account_id=b.account_id OR EXISTS(SELECT 1 FROM backend_core.bound_field_wallets WHERE account_id=p_source_account_id)) THEN RAISE EXCEPTION 'CUSTODY_SOURCE_ACCOUNT_REQUIRED';END IF;
 FOR row IN SELECT id FROM backend_core.settlement_accounts WHERE id IN(b.account_id,p_source_account_id) ORDER BY id LOOP PERFORM 1 FROM backend_core.settlement_accounts WHERE id=row.id FOR UPDATE;END LOOP;
 SELECT * INTO w FROM public.field_wallets WHERE id=b.wallet_id AND is_active FOR UPDATE;
 IF NOT FOUND OR w.balance IS DISTINCT FROM (backend_core.project_bound_account_v1(b.account_id)->>'balance')::numeric THEN RAISE EXCEPTION 'WALLET_ACCOUNT_CONSERVATION_FAILED';END IF;
 IF NOT EXISTS(SELECT 1 FROM public.org_memberships m JOIN public.org_membership_stores ms ON ms.membership_id=m.id WHERE m.id=w.membership_id AND m.organization_id=o AND coalesce(m.is_active,true) AND ms.store_id=p_store_id) THEN RAISE EXCEPTION 'ACTIVE_ASSIGNED_CUSTODIAN_REQUIRED';END IF;
 IF p_operation<>'FUND' AND amt>w.balance THEN RAISE EXCEPTION 'WALLET_FUNDS_INSUFFICIENT';END IF;
 SELECT id INTO cycle FROM public.field_cycles WHERE store_id=p_store_id AND status='OPEN' ORDER BY opened_at DESC LIMIT 1;
 IF cycle IS NULL THEN RAISE EXCEPTION 'OPEN_FIELD_CYCLE_REQUIRED';END IF;
 INSERT INTO backend_core.field_custody_intents VALUES(pg_backend_pid(),txid_current(),actor,w.id,o,p_store_id);
 IF p_operation='FUND' THEN
  PERFORM public.allocate_field_wallet_v1(p_store_id,w.membership_id,amt,'Verified custody '||p_request_id::text);
  SELECT id INTO tx FROM public.field_wallet_transactions WHERE wallet_id=w.id AND xmin=pg_current_xact_id()::text::xid AND type='ALLOCATE' AND created_by=actor AND amount=amt;
 ELSE
  IF p_operation='SUPPLIER' THEN
   IF p_payload->>'method' IS DISTINCT FROM 'CASH' THEN RAISE EXCEPTION 'WALLET_CASH_SUPPLIER_METHOD_REQUIRED';END IF;
   subrequest:=md5('FIELD-SUPPLIER:'||p_store_id::text||p_request_id::text)::uuid;
   r:=public.post_bound_financial_v1(p_store_id,subrequest,b.currency,revision,'SUPPLIER',p_payload,jsonb_build_object('CASH',b.account_id),NULL,p_evidence);
   IF (r->>'amount')::numeric IS DISTINCT FROM amt THEN RAISE EXCEPTION 'WALLET_SUPPLIER_AMOUNT_MISMATCH';END IF;
  ELSIF p_operation='EXPENSE' THEN
   subrequest:=md5('FIELD-EXPENSE:'||p_store_id::text||p_request_id::text)::uuid;
   r:=public.post_bound_financial_v1(p_store_id,subrequest,b.currency,revision,'EXPENSE',p_payload||jsonb_build_object('organization_id',o,'payment_method','CASH'),jsonb_build_object('CASH',b.account_id),NULL,p_evidence);
   IF (r->>'amount')::numeric IS DISTINCT FROM amt THEN RAISE EXCEPTION 'WALLET_EXPENSE_AMOUNT_MISMATCH';END IF;
  END IF;
  tx:=gen_random_uuid();UPDATE public.field_wallets SET balance=balance-amt,updated_at=clock_timestamp() WHERE id=w.id;
  INSERT INTO public.field_wallet_transactions(id,wallet_id,organization_id,store_id,membership_id,field_cycle_id,type,txn_type,amount,balance_before,balance_after,created_by,note)
   VALUES(tx,w.id,o,p_store_id,w.membership_id,cycle,CASE WHEN p_operation='SUPPLIER' THEN 'PURCHASE' WHEN p_operation='EXPENSE' THEN 'EXPENSE' ELSE 'ADJUST' END,p_operation,amt,w.balance,w.balance-amt,actor,'Verified custody '||p_request_id::text);
 END IF;
 IF tx IS NULL THEN RAISE EXCEPTION 'CANONICAL_WALLET_TRANSACTION_REQUIRED';END IF;
 INSERT INTO backend_core.field_custody_links VALUES(tx,w.id,p_source_account_id,p_operation,CASE WHEN p_operation='SUPPLIER' THEN (r->>'inboundPaymentId')::uuid END,CASE WHEN p_operation='EXPENSE' THEN (r->>'expenseId')::uuid END,p_request_id,actor,clock_timestamp());
 IF p_operation IN('FUND','RETURN') THEN
  INSERT INTO backend_core.settlement_intents VALUES(pg_backend_pid(),txid_current(),actor,o,p_store_id,p_request_id,'CUSTODY',w.id);
  PERFORM backend_core.bind_canonical_settlement_v1('CUSTODY_OUT',tx,CASE WHEN p_operation='FUND' THEN p_source_account_id ELSE b.account_id END,CASE WHEN p_operation='FUND' THEN p_shift_id END,p_evidence);
  PERFORM backend_core.bind_canonical_settlement_v1('CUSTODY_IN',tx,CASE WHEN p_operation='FUND' THEN b.account_id ELSE p_source_account_id END,CASE WHEN p_operation='RETURN' THEN p_shift_id END,p_evidence);
  DELETE FROM backend_core.settlement_intents WHERE backend_pid=pg_backend_pid() AND transaction_id=txid_current();
 END IF;
 r:=coalesce(r,'{}')||jsonb_build_object('walletId',w.id,'walletTransactionId',tx,'operation',p_operation,'amount',amt::text,'currency',b.currency,'accountBalance',(backend_core.project_bound_account_v1(b.account_id)->>'balance'),'inventoryPosted',false,'canonicalAccountBinding',true);
 INSERT INTO backend_core.settlement_requests VALUES(p_store_id,p_request_id,actor,o,body,r,clock_timestamp());
 DELETE FROM backend_core.field_custody_intents WHERE backend_pid=pg_backend_pid() AND transaction_id=txid_current();RETURN r;
END $$;
DO $$DECLARE t text;BEGIN FOREACH t IN ARRAY ARRAY['bound_field_wallets','field_custody_links','field_custody_intents'] LOOP EXECUTE format('ALTER TABLE backend_core.%I ENABLE ROW LEVEL SECURITY',t);EXECUTE format('ALTER TABLE backend_core.%I FORCE ROW LEVEL SECURITY',t);EXECUTE format('REVOKE ALL ON backend_core.%I FROM PUBLIC,anon,authenticated,service_role',t);END LOOP;END $$;
REVOKE ALL ON FUNCTION public.confirm_bound_field_wallet_v1(uuid,uuid,text),public.open_bound_field_wallet_v1(uuid,uuid,uuid,uuid,text),public.post_bound_field_custody_v1(uuid,uuid,uuid,uuid,text,jsonb,uuid,jsonb),backend_core.guard_bound_wallet_v1(),backend_core.check_bound_wallet_v1(),backend_core.stamp_bound_wallet_transaction_v1(),backend_core.stamp_bound_field_supplier_v1(),backend_core.stamp_bound_field_expense_v1() FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION backend_core.canonical_settlement_fact_v1(k text, sid uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$

DECLARE r jsonb;

BEGIN

 IF k='SALE_PAYMENT' THEN SELECT jsonb_build_object('organization',p.organization_id,'store',p.store_id,'amount',p.paid_amount::text,'method',upper(p.payment_method),'currency',p.currency_context->>'currency','createdAt',p.created_at,'actor',p.created_by,'saleId',p.sale_id) INTO r FROM public.sale_payments p WHERE p.id=sid;

 ELSIF k='COLLECTION' THEN SELECT jsonb_build_object('organization',s.organization_id,'store',p.store_id,'amount',(-p.delta)::text,'method',upper(coalesce(p.method,p.payment_method)),'currency',p.currency_context->>'currency','createdAt',p.created_at,'actor',p.created_by) INTO r FROM public.credit_ledger_v2 p JOIN public.credit_accounts_v2 c ON c.id=p.credit_account_id AND c.store_id=p.store_id JOIN public.stores s ON s.id=p.store_id WHERE p.id=sid AND p.delta<0 AND p.entry_type='PAYMENT';

 ELSIF k='EXPENSE' THEN SELECT jsonb_build_object('organization',p.organization_id,'store',p.store_id,'amount',(-p.amount)::text,'method',upper(p.payment_method),'currency',p.currency_context->>'currency','createdAt',p.created_at,'actor',p.created_by) INTO r FROM public.expenses p WHERE p.id=sid;

 ELSIF k='SUPPLIER_PAYMENT' THEN SELECT jsonb_build_object('organization',p.organization_id,'store',o.store_id,'amount',(-p.amount)::text,'method',upper(p.payment_method),'currency',b.currency,'createdAt',p.created_at,'actor',p.created_by) INTO r FROM public.inbound_stock_payments p JOIN public.inbound_stock_orders o ON o.id=p.inbound_order_id JOIN backend_core.receipt_debt_bindings b ON b.order_id=o.id JOIN backend_core.supplier_payment_bindings z ON z.inbound_payment_id=p.id WHERE p.id=sid;

 ELSIF k='REFUND' THEN SELECT jsonb_build_object('organization',f.organization_id,'store',f.store_id,'amount',(-p.amount)::text,'method',upper(op.payment_method),'currency',s.currency_context->>'currency','createdAt',f.created_at,'actor',f.actor_id,'saleId',f.sale_id) INTO r FROM backend_core.original_refund_payments p JOIN backend_core.original_refunds f ON f.id=p.refund_id JOIN public.sale_payments op ON op.id=p.original_payment_id AND op.sale_id=f.sale_id JOIN public.sales s ON s.id=f.sale_id WHERE p.id=sid;
 ELSIF k IN ('CUSTODY_IN','CUSTODY_OUT') THEN SELECT jsonb_build_object('organization',w.organization_id,'store',w.store_id,'amount',(CASE WHEN k='CUSTODY_IN' THEN w.amount ELSE -w.amount END)::text,'method',a.kind,'currency',a.currency,'createdAt',w.created_at,'actor',w.created_by) INTO r FROM public.field_wallet_transactions w JOIN backend_core.field_custody_links l ON l.wallet_transaction_id=w.id JOIN backend_core.bound_field_wallets b ON b.wallet_id=w.wallet_id JOIN backend_core.settlement_accounts a ON a.id=CASE WHEN (l.operation='FUND')=(k='CUSTODY_IN') THEN b.account_id ELSE l.source_account_id END WHERE w.id=sid AND l.operation IN('FUND','RETURN');
 ELSE RAISE EXCEPTION 'UNVERIFIED_CANONICAL_SETTLEMENT_SOURCE';END IF;

 IF r IS NULL OR r->>'currency' IS NULL OR (r->>'amount')::numeric=0 THEN RAISE EXCEPTION 'ORIGINAL_SETTLEMENT_FACT_REQUIRED';END IF;RETURN r;

END $function$;
CREATE OR REPLACE FUNCTION backend_core.native_unverified_writer_guard_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$

DECLARE r jsonb;oldr jsonb;o uuid;s uuid;old_o uuid;old_s uuid;currency text;old_currency text;record_currency text;actor uuid:=backend_core.active_subject();admitted boolean:=false;

BEGIN

 r:=CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;

 IF TG_OP='UPDATE' THEN oldr:=to_jsonb(OLD);END IF;

 o:=nullif(r->>'organization_id','')::uuid;s:=nullif(r->>'store_id','')::uuid;

 IF TG_TABLE_NAME='sale_items' THEN

  SELECT organization_id,store_id,currency_context->>'currency' INTO o,s,record_currency FROM public.sales WHERE id=(r->>'sale_id')::uuid;

 END IF;

 IF o IS NULL AND s IS NOT NULL THEN SELECT organization_id INTO o FROM public.stores WHERE id=s;END IF;

 SELECT a.currency INTO currency FROM proforma_backend.accounting_currency a WHERE a.organization_id=o;

 IF TG_OP='UPDATE' THEN

  old_o:=nullif(oldr->>'organization_id','')::uuid;old_s:=nullif(oldr->>'store_id','')::uuid;

  IF TG_TABLE_NAME='sale_items' THEN SELECT organization_id,store_id,currency_context->>'currency' INTO old_o,old_s,old_currency FROM public.sales WHERE id=(oldr->>'sale_id')::uuid;END IF;

  IF old_o IS NULL AND old_s IS NOT NULL THEN SELECT organization_id INTO old_o FROM public.stores WHERE id=old_s;END IF;

  IF old_currency IS NULL THEN SELECT a.currency INTO old_currency FROM proforma_backend.accounting_currency a WHERE a.organization_id=old_o;END IF;

 END IF;

 record_currency:=coalesce(record_currency,r->'currency_context'->>'currency');

 IF coalesce(currency,'TZS')='TZS' AND coalesce(record_currency,'TZS')='TZS' AND coalesce(old_currency,'TZS')='TZS' THEN IF TG_OP='DELETE' THEN RETURN OLD;END IF;RETURN NEW;END IF;

 IF TG_OP='UPDATE' AND ((oldr->>'organization_id') IS DISTINCT FROM (r->>'organization_id') OR (oldr->>'store_id') IS DISTINCT FROM (r->>'store_id') OR (oldr->>'sale_id') IS DISTINCT FROM (r->>'sale_id')) THEN RAISE EXCEPTION 'NATIVE_FINANCIAL_SCOPE_IMMUTABLE';END IF;

 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'NATIVE_REVERSAL_CONTRACT_REQUIRED';END IF;

 -- Nonmonetary presentation edits retain existing RLS permissions.

 IF TG_TABLE_NAME='products' AND TG_OP='UPDATE' AND r-ARRAY['name','description','image_url','updated_at','updated_by','is_active']=oldr-ARRAY['name','description','image_url','updated_at','updated_by','is_active'] THEN RETURN NEW;END IF;

 IF TG_TABLE_NAME='credit_accounts_v2' AND (TG_OP='INSERT' OR (TG_OP='UPDATE' AND r-ARRAY['name','full_name','phone','note','updated_at','updated_by']=oldr-ARRAY['name','full_name','phone','note','updated_at','updated_by'])) THEN RETURN NEW;END IF;

 IF TG_TABLE_NAME IN ('field_wallets','field_wallet_transactions') AND TG_OP IN ('INSERT','UPDATE') AND EXISTS(SELECT 1 FROM backend_core.field_custody_intents i WHERE i.backend_pid=pg_backend_pid() AND i.transaction_id=txid_current() AND i.actor_id=actor AND i.organization_id=o AND i.store_id=s AND (i.wallet_id=CASE WHEN TG_TABLE_NAME='field_wallets' THEN (r->>'id')::uuid ELSE (r->>'wallet_id')::uuid END OR TG_TABLE_NAME='field_wallets' AND TG_OP='INSERT' AND EXISTS(SELECT 1 FROM public.field_wallets w WHERE w.id=i.wallet_id AND w.store_id=s AND w.organization_id=o AND w.membership_id=(r->>'membership_id')::uuid))) THEN RETURN NEW;END IF;
 -- A private, same-transaction refund permit is scoped to the returned product.
 IF TG_TABLE_NAME IN ('inventory','stock_movements') AND TG_OP IN ('INSERT','UPDATE') AND EXISTS(
 SELECT 1 FROM backend_core.refund_stock_intents i WHERE i.backend_pid=pg_backend_pid() AND i.transaction_id=txid_current() AND i.actor_id=actor AND i.organization_id=o AND i.store_id=s AND i.product_id=(r->>'product_id')::uuid) THEN RETURN NEW;END IF;
 -- Only the already-validated canonical sale transaction may write stock.

 IF TG_TABLE_NAME IN ('inventory','stock_movements','products','sale_items') THEN

  SELECT EXISTS(SELECT 1 FROM backend_core.native_financial_intents i WHERE (i.operation='SALE' OR i.operation='RECEIPT' AND TG_TABLE_NAME<>'sale_items') AND i.backend_pid=pg_backend_pid() AND i.transaction_id=txid_current() AND i.actor_id=actor AND i.organization_id=o AND (s IS NULL OR i.store_id=s)) INTO admitted;

 ELSIF TG_TABLE_NAME='credit_ledger_v2' AND TG_OP='INSERT' THEN

  SELECT EXISTS(SELECT 1 FROM backend_core.native_financial_intents i WHERE i.operation IN ('SALE','REPAYMENT') AND i.backend_pid=pg_backend_pid() AND i.transaction_id=txid_current() AND i.actor_id=actor AND i.organization_id=o AND i.store_id=s) INTO admitted;

 END IF;

 IF TG_TABLE_NAME='business_debts' THEN SELECT EXISTS(SELECT 1 FROM backend_core.settlement_intents i WHERE i.backend_pid=pg_backend_pid() AND i.transaction_id=txid_current() AND i.actor_id=actor AND i.organization_id=o AND i.store_id=s AND (i.operation='RECEIPT' AND TG_OP='INSERT' OR i.operation='SUPPLIER' AND TG_OP='UPDATE' AND EXISTS(SELECT 1 FROM backend_core.receipt_debt_bindings b WHERE b.order_id=i.source_id AND b.debt_id=(r->>'id')::uuid))) INTO admitted;END IF;

 IF NOT admitted THEN RAISE EXCEPTION 'NATIVE_WRITER_CONTRACT_NOT_CERTIFIED';END IF;

 IF TG_OP='DELETE' THEN RETURN OLD;END IF;RETURN NEW;

END $function$;
COMMIT;
