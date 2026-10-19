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
