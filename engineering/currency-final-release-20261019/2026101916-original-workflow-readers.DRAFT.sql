BEGIN;SET LOCAL lock_timeout='3s';SET LOCAL statement_timeout='45s';
DO $$BEGIN IF to_regclass('backend_core.field_custody_links') IS NULL OR to_regprocedure('public.refund_original_sale_v1(uuid,uuid,uuid,uuid,numeric,boolean,uuid,jsonb)') IS NULL THEN RAISE EXCEPTION '1914_1915_REQUIRED';END IF;END$$;
DO $$BEGIN IF md5(replace(pg_get_functiondef('backend_core.bound_shift_coverage_v1(uuid)'::regprocedure),chr(13),''))<>'6d1f02385d83f4647ad984a273694af0' THEN RAISE EXCEPTION '1916_COVERAGE_PREIMAGE_MISMATCH';END IF;END$$;
-- Local additive workflow readers and immutable original-return references.
CREATE FUNCTION backend_core.freeze_original_return_sources_v1() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF TG_TABLE_NAME='sale_items' AND EXISTS(SELECT 1 FROM backend_core.original_sale_evidence WHERE sale_id=(to_jsonb(OLD)->>'sale_id')::uuid)
 OR TG_TABLE_NAME='stock_movements' AND EXISTS(SELECT 1 FROM backend_core.original_refunds WHERE movement_id=OLD.id) THEN RAISE EXCEPTION 'ORIGINAL_RETURN_SOURCE_IMMUTABLE';END IF;
 IF TG_OP='DELETE' THEN RETURN OLD;END IF;RETURN NEW;
END $$;
CREATE TRIGGER freeze_original_return_source BEFORE UPDATE OR DELETE ON public.sale_items FOR EACH ROW EXECUTE FUNCTION backend_core.freeze_original_return_sources_v1();
CREATE TRIGGER freeze_original_return_source BEFORE UPDATE OR DELETE ON public.stock_movements FOR EACH ROW EXECUTE FUNCTION backend_core.freeze_original_return_sources_v1();
CREATE FUNCTION public.get_original_refund_sale_v1(p_store_id uuid,p_sale_id uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE o uuid:=backend_core.settlement_scope_v1(p_store_id);e backend_core.original_sale_evidence%ROWTYPE;r jsonb;
BEGIN
 IF NOT backend_core.settlement_owner_v1(o) THEN RAISE EXCEPTION 'REFUND_OWNER_REVIEW_REQUIRED';END IF;
 IF NOT EXISTS(SELECT 1 FROM public.sales WHERE id=p_sale_id AND store_id=p_store_id AND organization_id=o) THEN RAISE EXCEPTION 'ORIGINAL_SALE_SCOPE_REQUIRED';END IF;
 SELECT * INTO e FROM backend_core.original_sale_evidence WHERE sale_id=p_sale_id AND store_id=p_store_id AND organization_id=o;
 IF NOT FOUND THEN RETURN jsonb_build_object('saleId',p_sale_id,'eligible',false,'reason','VERIFIED_ORIGINAL_EVIDENCE_REQUIRED','lines','[]'::jsonb);END IF;
 SELECT jsonb_agg(jsonb_build_object('id',i.id,'name',coalesce(p.name,'Sold item'),'originalQuantity',x->>'quantity','refundedQuantity',coalesce((SELECT sum(quantity) FROM backend_core.original_refunds WHERE line_id=i.id),0)::text,'originalTax',x->>'tax','originalNet',x->>'net','originalCogs',x->>'cogs') ORDER BY i.id) INTO r
 FROM jsonb_array_elements(e.snapshot->'lines') x JOIN public.sale_items i ON i.id=(x->>'lineId')::uuid AND i.sale_id=e.sale_id LEFT JOIN public.products p ON p.id=i.product_id;
 RETURN jsonb_build_object('saleId',e.sale_id,'organizationId',o,'storeId',p_store_id,'currency',e.currency,'eligible',true,'lines',r,'sourceReference',e.source_reference);
END $$;
CREATE FUNCTION public.get_bound_field_custody_v1(p_store_id uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE o uuid:=backend_core.settlement_scope_v1(p_store_id);wallets jsonb;accounts jsonb;
BEGIN
 IF NOT backend_core.settlement_owner_v1(o) THEN RAISE EXCEPTION 'CUSTODY_OWNER_REVIEW_REQUIRED';END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',w.id,'accountId',b.account_id,'name',coalesce(u.email,'Field custodian'),'balance',w.balance::text,'currency',b.currency) ORDER BY w.id),'[]') INTO wallets FROM backend_core.bound_field_wallets b JOIN public.field_wallets w ON w.id=b.wallet_id JOIN public.org_memberships m ON m.id=w.membership_id LEFT JOIN auth.users u ON u.id=m.user_id WHERE b.store_id=p_store_id AND b.organization_id=o AND w.is_active;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',a.id,'name',a.source_reference,'kind',a.kind,'currency',a.currency,'balance',backend_core.project_bound_account_v1(a.id)->>'balance') ORDER BY a.id),'[]') INTO accounts FROM backend_core.settlement_accounts a WHERE a.store_id=p_store_id AND a.organization_id=o AND NOT a.locked AND NOT EXISTS(SELECT 1 FROM backend_core.bound_field_wallets WHERE account_id=a.id);
 RETURN jsonb_build_object('organizationId',o,'storeId',p_store_id,'wallets',wallets,'accounts',accounts);
END $$;
REVOKE ALL ON FUNCTION backend_core.freeze_original_return_sources_v1(),public.get_original_refund_sale_v1(uuid,uuid),public.get_bound_field_custody_v1(uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION backend_core.bound_shift_coverage_v1(sid uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE s public.cashier_shifts%ROWTYPE;unknown_count bigint:=0;n bigint;last_time timestamptz:=statement_timestamp();
BEGIN SELECT * INTO s FROM public.cashier_shifts WHERE id=sid;IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM backend_core.shift_account_bindings WHERE shift_id=s.id) THEN RETURN jsonb_build_object('complete',false,'unknownSources',NULL,'reason','VERIFIED_DRAWER_BINDING_REQUIRED');END IF;
 last_time:=coalesce(s.closed_at,last_time);
 SELECT count(*) INTO n FROM public.sale_payments p JOIN public.sales sale ON sale.id=p.sale_id WHERE sale.cashier_shift_id=s.id AND NOT EXISTS(SELECT 1 FROM backend_core.settlement_bindings b WHERE b.source_kind='SALE_PAYMENT' AND b.source_id=p.id AND b.shift_id=s.id);unknown_count:=unknown_count+n;
 SELECT count(*) INTO n FROM public.credit_ledger_v2 p WHERE p.store_id=s.store_id AND p.delta<0 AND p.created_at>=s.opened_at AND p.created_at<=last_time AND NOT EXISTS(SELECT 1 FROM backend_core.settlement_bindings b WHERE b.source_kind='COLLECTION' AND b.source_id=p.id);unknown_count:=unknown_count+n;
 SELECT count(*) INTO n FROM public.expenses p WHERE p.store_id=s.store_id AND p.created_at>=s.opened_at AND p.created_at<=last_time AND NOT EXISTS(SELECT 1 FROM backend_core.settlement_bindings b WHERE b.source_kind='EXPENSE' AND b.source_id=p.id);unknown_count:=unknown_count+n;
 SELECT count(*) INTO n FROM public.inbound_stock_payments p JOIN public.inbound_stock_orders o ON o.id=p.inbound_order_id WHERE o.store_id=s.store_id AND p.created_at>=s.opened_at AND p.created_at<=last_time AND NOT EXISTS(SELECT 1 FROM backend_core.settlement_bindings b WHERE b.source_kind='SUPPLIER_PAYMENT' AND b.source_id=p.id);unknown_count:=unknown_count+n;
 SELECT count(*) INTO n FROM public.business_debt_payments p WHERE p.store_id=s.store_id AND p.created_at>=s.opened_at AND p.created_at<=last_time AND NOT EXISTS(SELECT 1 FROM backend_core.supplier_payment_bindings b WHERE b.debt_payment_id=p.id);unknown_count:=unknown_count+n;
 SELECT count(*) INTO n FROM public.business_loan_payments p WHERE p.store_id=s.store_id AND p.created_at>=s.opened_at AND p.created_at<=last_time;unknown_count:=unknown_count+n;
 SELECT count(*) INTO n FROM public.field_wallet_transactions p WHERE p.store_id=s.store_id AND p.created_at>=s.opened_at AND p.created_at<=last_time AND NOT EXISTS(SELECT 1 FROM backend_core.field_custody_links l WHERE l.wallet_transaction_id=p.id);unknown_count:=unknown_count+n;
 SELECT count(*) INTO n FROM funding_control.movements p WHERE p.shift_id=s.id;unknown_count:=unknown_count+n;
 RETURN jsonb_build_object('complete',unknown_count=0,'unknownSources',unknown_count,'scope','BOUND_CANONICAL_SOURCE_COVERAGE','historicalAllocationInferred',false,'refundPostingAllowed',false,'custodyPostingAllowed',false);
END $$;
COMMIT;
