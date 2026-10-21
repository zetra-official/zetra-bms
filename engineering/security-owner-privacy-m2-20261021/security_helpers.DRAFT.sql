-- LOCAL M2 DRAFT ONLY. Not approved for hosted execution.
CREATE SCHEMA IF NOT EXISTS security_m2;
REVOKE ALL ON SCHEMA security_m2 FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA security_m2 TO authenticated;

CREATE OR REPLACE FUNCTION security_m2.owner_of(p_org uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT auth.uid() IS NOT NULL AND EXISTS (
 SELECT 1 FROM public.org_memberships m JOIN public.organizations o ON o.id=m.organization_id
 WHERE m.organization_id=p_org AND m.user_id=auth.uid()
 AND m.role='owner' AND m.is_active IS TRUE AND o.is_active IS TRUE);
$$;
CREATE OR REPLACE FUNCTION security_m2.store_allowed(p_org uuid,p_store uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT auth.uid() IS NOT NULL AND EXISTS (
 SELECT 1 FROM public.org_memberships m JOIN public.organizations o ON o.id=m.organization_id
 WHERE m.organization_id=p_org AND m.user_id=auth.uid() AND m.is_active IS TRUE
 AND o.is_active IS TRUE AND m.role IN ('owner','admin','staff','cashier')
 AND (p_store IS NULL AND m.role IN ('owner','admin') OR EXISTS (
 SELECT 1 FROM public.stores s WHERE s.id=p_store AND s.organization_id=p_org AND s.is_active IS TRUE
 AND (m.role IN ('owner','admin') OR EXISTS (
 SELECT 1 FROM public.org_membership_stores ms WHERE ms.membership_id=m.id AND ms.store_id=s.id)))));
$$;
CREATE OR REPLACE FUNCTION security_m2.require_owner(p_org uuid,p_store uuid DEFAULT NULL) RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 BEGIN
 IF NOT security_m2.owner_of(p_org) OR (p_store IS NOT NULL AND NOT EXISTS (
 SELECT 1 FROM public.stores s WHERE s.id=p_store AND s.organization_id=p_org)) THEN
 RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='OWNER_FINANCIAL_ACCESS_REQUIRED'; END IF;
 END;
$$;
CREATE OR REPLACE FUNCTION security_m2.require_store(p_org uuid,p_store uuid) RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 BEGIN IF NOT security_m2.store_allowed(p_org,p_store) THEN
 RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='WORKSPACE_ACCESS_REQUIRED'; END IF; END;
$$;
CREATE OR REPLACE FUNCTION security_m2.inbound_integrity() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE parent_org uuid; parent_store uuid;
BEGIN
 IF TG_TABLE_NAME='inbound_stock_orders' THEN
  IF TG_OP='UPDATE' AND (NEW.organization_id IS DISTINCT FROM OLD.organization_id OR NEW.store_id IS DISTINCT FROM OLD.store_id) THEN
   RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='INBOUND_SCOPE_IMMUTABLE'; END IF;
  IF NEW.store_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.stores s WHERE s.id=NEW.store_id AND s.organization_id=NEW.organization_id)
  OR NEW.supplier_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.suppliers s WHERE s.id=NEW.supplier_id AND s.organization_id=NEW.organization_id) THEN
   RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='INBOUND_SCOPE_MISMATCH'; END IF;
 ELSE
  IF TG_OP='UPDATE' AND (NEW.organization_id IS DISTINCT FROM OLD.organization_id OR NEW.inbound_order_id IS DISTINCT FROM OLD.inbound_order_id) THEN
   RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='INBOUND_PARENT_SCOPE_IMMUTABLE'; END IF;
  SELECT o.organization_id,o.store_id INTO parent_org,parent_store FROM public.inbound_stock_orders o WHERE o.id=NEW.inbound_order_id FOR KEY SHARE;
  IF parent_org IS NULL OR parent_org IS DISTINCT FROM NEW.organization_id THEN
   RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='INBOUND_PARENT_SCOPE_MISMATCH'; END IF;
  IF TG_TABLE_NAME='inbound_stock_items' THEN
   IF NEW.product_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.products p WHERE p.id=NEW.product_id AND p.organization_id=parent_org) THEN
   RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='INBOUND_PRODUCT_SCOPE_MISMATCH'; END IF;
  END IF;
 END IF;
 RETURN NEW;
END;
$$;
-- All callers of protected JSON receive an allowlist, never a keyword blacklist.
-- User-entered names/SKUs are copied verbatim; arbitrary free-text evidence is Owner-only.
CREATE OR REPLACE FUNCTION security_m2.operational_json(p jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT CASE jsonb_typeof(p) WHEN 'array' THEN
 (SELECT coalesce(jsonb_agg(security_m2.operational_json(v)),'[]'::jsonb) FROM jsonb_array_elements(p) v)
 WHEN 'object' THEN (SELECT coalesce(jsonb_object_agg(k,v),'{}'::jsonb) FROM jsonb_each(p) e(k,v)
 WHERE k IN ('product_id','product_name','name','sku','barcode','unit','category','qty','quantity','mode','source','movement_id','event_id')
 AND jsonb_typeof(v) IN ('string','number','boolean','null'))
 ELSE '{}'::jsonb END;
$$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA security_m2 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION security_m2.owner_of(uuid),security_m2.store_allowed(uuid,uuid),
 security_m2.require_owner(uuid,uuid),security_m2.require_store(uuid,uuid),security_m2.operational_json(jsonb) TO authenticated;
