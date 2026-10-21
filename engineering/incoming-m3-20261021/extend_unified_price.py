"""Local-only shared price guard/audit and guarded canonical saved-order receiver."""
from pathlib import Path
import re
E=Path(__file__).resolve().parent
base=(E/'2026102104-precision-price.DRAFT.sql').read_text()
original=(E/'receive_inbound_stock_partial_v1.m2.private.sql').read_text().rstrip().rstrip(';')+';\n'
# Reuse the canonical receiving implementation, including its supplier liability behavior.
# Do not introduce another stock or payable ledger.
helper=original.replace('  v_org_id uuid;','  v_org_id uuid;\n  v_m3 boolean := false;')
guard="""PERFORM pg_advisory_xact_lock(hashtextextended('incoming-store:'||(SELECT store_id FROM public.inbound_stock_orders WHERE id=p_order_id)::text,0));
SELECT EXISTS(SELECT 1 FROM incoming_m3.batches WHERE order_id=p_order_id AND state='SAVED') INTO v_m3;
IF v_m3 THEN
 PERFORM security_m2.require_owner((SELECT organization_id FROM public.inbound_stock_orders WHERE id=p_order_id),(SELECT store_id FROM public.inbound_stock_orders WHERE id=p_order_id));
 SELECT event_id INTO v_receive_event_id FROM incoming_m3.batches WHERE actor_id=auth.uid() AND transaction_id=txid_current() AND state='PROCESSING' AND payload->>'saved_order_id'=p_order_id::text;
 IF v_receive_event_id IS NULL THEN RAISE EXCEPTION 'M3_ORDER_RECEIVING_CONTRACT_REQUIRED';END IF;
END IF;
"""
helper=helper.replace('PERFORM 1 FROM public.inbound_stock_orders o WHERE o.id=p_order_id FOR UPDATE;',guard+'PERFORM 1 FROM public.inbound_stock_orders o WHERE o.id=p_order_id FOR UPDATE;',1)
start=helper.index('    v_product_id := null;');end=helper.index('    insert into public.inventory',start)
helper=helper[:start]+'''    IF v_m3 THEN
    v_product_id := r.product_id;
    IF v_product_id IS NULL THEN RAISE EXCEPTION 'REGISTER_PRODUCT_FIRST'; END IF;
    ELSE
'''+helper[start:end]+'''    END IF;
'''+helper[end:]
start=helper.index('    update public.products\n');end=helper.index('    -- ========================================================',start)
helper=helper[:start]+'''    IF v_m3 THEN
      UPDATE public.products SET qty_on_hand=v_next_qty,selling_price=r.proposed_sell_price,updated_at=now() WHERE id=v_product_id;
    ELSE
'''+helper[start:end]+'''    END IF;
'''+helper[end:]
helper=helper.replace('      event_id\n','      event_id, unit_cost, total_cost\n').replace('      v_receive_event_id\n','      v_receive_event_id, CASE WHEN v_m3 THEN r.unit_cost ELSE 0 END, CASE WHEN v_m3 THEN r.unit_cost*v_receive_qty ELSE 0 END\n')
header=r'''-- UNIFIED PRICE LOCAL DRAFT ONLY. Apply after M2, M3 02,03,04. No hosted execution.
BEGIN;
CREATE TABLE incoming_m3.price_changes(
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, organization_id uuid NOT NULL,
 store_id uuid NOT NULL,product_id uuid NOT NULL,previous_price numeric,new_price numeric,
 actor_id uuid NOT NULL,changed_at timestamptz NOT NULL DEFAULT now(),event_id uuid);
ALTER TABLE incoming_m3.price_changes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON incoming_m3.price_changes FROM PUBLIC,anon,authenticated;
CREATE FUNCTION incoming_m3.guard_price_change() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF OLD.selling_price IS NOT DISTINCT FROM NEW.selling_price THEN RETURN NEW;END IF;
 PERFORM security_m2.require_owner(OLD.organization_id,OLD.store_id);
 IF NEW.organization_id IS DISTINCT FROM OLD.organization_id OR NEW.store_id IS DISTINCT FROM OLD.store_id OR OLD.store_id IS NULL OR EXISTS(SELECT 1 FROM public.inventory i WHERE i.product_id=OLD.id AND i.store_id<>OLD.store_id) THEN RAISE EXCEPTION 'SHARED_PRODUCT_PRICE_POLICY_REQUIRED';END IF;
 IF NEW.selling_price IS NULL OR NEW.selling_price<=0 THEN RAISE EXCEPTION 'INVALID_AMOUNT';END IF;
 INSERT INTO incoming_m3.price_changes(organization_id,store_id,product_id,previous_price,new_price,actor_id,event_id)
 VALUES(OLD.organization_id,OLD.store_id,OLD.id,OLD.selling_price,NEW.selling_price,auth.uid(),incoming_m3.current_event(OLD.organization_id,OLD.store_id));
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION incoming_m3.guard_price_change() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER m3_unified_selling_price BEFORE UPDATE OF selling_price ON public.products FOR EACH ROW EXECUTE FUNCTION incoming_m3.guard_price_change();
CREATE TABLE incoming_m3.saved_receives(request_id uuid PRIMARY KEY,order_id uuid NOT NULL,actor_id uuid NOT NULL,payload_hash text NOT NULL,event_id uuid NOT NULL UNIQUE,created_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE incoming_m3.saved_receives ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON incoming_m3.saved_receives FROM PUBLIC,anon,authenticated;
'''
wrapper=r'''
CREATE FUNCTION public.m3_saved_order_context_v1(p_order_id uuid) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE o public.inbound_stock_orders;
BEGIN
 SELECT * INTO o FROM public.inbound_stock_orders WHERE id=p_order_id;
 PERFORM security_m2.require_store(o.organization_id,o.store_id);
 RETURN EXISTS(SELECT 1 FROM incoming_m3.batches WHERE order_id=p_order_id AND state='SAVED');
END $$;
REVOKE ALL ON FUNCTION public.m3_saved_order_context_v1(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.m3_saved_order_context_v1(uuid) TO authenticated;
CREATE FUNCTION public.m3_receive_saved_v1(p_order_id uuid,p_request_id uuid,p_receipts jsonb DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE b incoming_m3.batches;o public.inbound_stock_orders;old incoming_m3.saved_receives;
 h text;ev uuid:=gen_random_uuid();rows jsonb;v_lines jsonb;total numeric;it public.inbound_stock_items;p public.products;l jsonb;x jsonb;expected numeric;q numeric;currency text;
BEGIN
 SELECT * INTO o FROM public.inbound_stock_orders WHERE id=p_order_id;
 PERFORM security_m2.require_owner(o.organization_id,o.store_id);PERFORM security_m2.require_store(o.organization_id,o.store_id);
 IF p_request_id IS NULL THEN RAISE EXCEPTION 'REQUEST_ID_REQUIRED';END IF;
 IF p_receipts IS NOT NULL AND (jsonb_typeof(p_receipts)<>'array' OR jsonb_array_length(p_receipts) NOT BETWEEN 1 AND 500 OR pg_column_size(p_receipts)>2000000) THEN RAISE EXCEPTION 'INVALID_DRAFT';END IF;
 h:=encode(sha256(convert_to(jsonb_build_object('order',p_order_id,'receipts',p_receipts)::text,'UTF8')),'hex');
 PERFORM pg_advisory_xact_lock(hashtextextended('incoming-m3:'||p_request_id::text,0));
 SELECT * INTO old FROM incoming_m3.saved_receives WHERE request_id=p_request_id;
 IF FOUND THEN
  IF old.order_id<>p_order_id OR old.actor_id<>auth.uid() OR old.payload_hash<>h THEN RAISE EXCEPTION 'REQUEST_CONFLICT';END IF;
  RETURN jsonb_build_object('orderId',p_order_id,'eventId',old.event_id,'status','RECEIVED');
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('incoming-store:'||o.store_id::text,0));
 SELECT * INTO o FROM public.inbound_stock_orders WHERE id=p_order_id FOR UPDATE;
 SELECT * INTO b FROM incoming_m3.batches WHERE order_id=p_order_id AND state='SAVED';
 IF b.request_id IS NULL THEN RAISE EXCEPTION 'M3_SAVED_ORDER_REQUIRED';END IF;
 BEGIN SELECT public.get_org_accounting_currency_v1(o.organization_id)->>'currency' INTO currency;
 EXCEPTION WHEN OTHERS THEN IF SQLERRM='ACCOUNTING_CURRENCY_UNCONFIRMED' THEN currency:='TZS';ELSE RAISE EXCEPTION 'ACCOUNTING_AUTHORITY_UNAVAILABLE';END IF;END;
 IF currency IS DISTINCT FROM 'TZS' OR b.payload->>'currency' IS DISTINCT FROM 'TZS' THEN RAISE EXCEPTION 'NATIVE_FINANCIAL_POSTING_NOT_CERTIFIED';END IF;
 IF o.deleted_at IS NOT NULL OR o.status IN ('CANCELLED','RECEIVED') THEN RAISE EXCEPTION 'INBOUND_ORDER_CLOSED';END IF;
 IF EXISTS(SELECT 1 FROM public.suppliers s WHERE s.id=o.supplier_id AND s.organization_id=o.organization_id AND s.is_active IS TRUE) IS NOT TRUE THEN RAISE EXCEPTION 'SUPPLIER_REQUIRED';END IF;
 rows:=p_receipts;
 IF rows IS NULL THEN SELECT jsonb_agg(jsonb_build_object('item_id',id,'qty',(qty_ordered-qty_received)::text) ORDER BY id) INTO rows FROM public.inbound_stock_items WHERE inbound_order_id=p_order_id AND qty_ordered>qty_received;END IF;
 IF rows IS NULL OR EXISTS(SELECT 1 FROM jsonb_array_elements(rows) a GROUP BY a->>'item_id' HAVING count(*)>1) THEN RAISE EXCEPTION 'DUPLICATE_PRODUCT';END IF;
 IF (SELECT sum((value->>'qty')::numeric) FROM jsonb_array_elements(rows))>2147483647 THEN RAISE EXCEPTION 'INVALID_AMOUNT';END IF;
 -- Lock inventory and canonical products in the same deterministic order as Receive Now.
 FOR x IN SELECT value FROM jsonb_array_elements(rows) ORDER BY value->>'item_id' LOOP
  SELECT * INTO it FROM public.inbound_stock_items WHERE id=(x->>'item_id')::uuid AND inbound_order_id=p_order_id FOR UPDATE;
  IF it.id IS NULL OR it.organization_id<>o.organization_id OR it.product_id IS NULL THEN RAISE EXCEPTION 'PRODUCT_SCOPE_REQUIRED';END IF;
  SELECT value INTO l FROM jsonb_array_elements(b.payload->'lines') WHERE value->>'product_id'=it.product_id::text;
  IF l IS NULL OR it.unit_cost IS DISTINCT FROM (l->>'unit_cost')::numeric OR it.proposed_sell_price IS DISTINCT FROM (l->>'selling_price')::numeric OR it.qty_ordered IS DISTINCT FROM (l->>'quantity')::numeric OR it.product_name IS DISTINCT FROM l->>'product_name' OR coalesce(it.sku,'') IS DISTINCT FROM coalesce(l->>'sku','') OR coalesce(it.barcode,'') IS DISTINCT FROM coalesce(l->>'barcode','') THEN RAISE EXCEPTION 'SAVED_ORDER_CHANGED';END IF;
  q:=(x->>'qty')::numeric;
  IF q IS NULL OR q<=0 OR q<>trunc(q) OR q>it.qty_ordered-it.qty_received THEN RAISE EXCEPTION 'INVALID_AMOUNT';END IF;
  INSERT INTO public.inventory(organization_id,store_id,product_id,qty) VALUES(o.organization_id,o.store_id,it.product_id,0) ON CONFLICT(store_id,product_id) DO NOTHING;
  PERFORM 1 FROM public.inventory WHERE store_id=o.store_id AND product_id=it.product_id FOR UPDATE;
  SELECT * INTO p FROM public.products WHERE id=it.product_id AND organization_id=o.organization_id AND store_id=o.store_id FOR UPDATE;
  IF p.id IS NULL THEN RAISE EXCEPTION 'PRODUCT_SCOPE_REQUIRED';END IF;
  expected:=nullif(l->>'expected_selling_price','')::numeric;
  -- Once this order has actually applied its intended price, subsequent partials
  -- may retain it; an unrelated newer price must never be overwritten.
  IF it.qty_received>0 AND EXISTS(SELECT 1 FROM incoming_m3.price_changes pc JOIN incoming_m3.saved_receives sr ON sr.event_id=pc.event_id WHERE sr.order_id=p_order_id AND pc.product_id=p.id AND pc.new_price=it.proposed_sell_price) THEN expected:=it.proposed_sell_price;END IF;
  IF expected IS NULL THEN RAISE EXCEPTION 'PRICE_CONFIRMATION_REQUIRED';END IF;
  IF p.selling_price IS DISTINCT FROM expected THEN RAISE EXCEPTION 'PRICE_CONFLICT';END IF;
  PERFORM incoming_m3.validate_product_line(p,l);
  IF (SELECT qty FROM public.inventory WHERE store_id=o.store_id AND product_id=p.id)+q>999999999 THEN RAISE EXCEPTION 'INVALID_AMOUNT';END IF;
 END LOOP;
 -- A transaction-bound batch context reuses existing movement notification suppression.
 INSERT INTO incoming_m3.batches(request_id,organization_id,store_id,actor_id,payload_hash,payload,state,transaction_id,event_id)
 VALUES(p_request_id,o.organization_id,o.store_id,auth.uid(),h,jsonb_set(jsonb_set(b.payload,'{mode}','"RECEIVE_NOW"'),'{saved_order_id}',to_jsonb(p_order_id::text)),'PROCESSING',txid_current(),ev);
 PERFORM public.receive_inbound_stock_partial_v1(p_order_id,rows);
 SELECT jsonb_agg(jsonb_build_object('product_id',i.product_id,'product_name',i.product_name,'sku',i.sku,'barcode',i.barcode,'unit',CASE WHEN pr.is_precision_product THEN pr.precision_base_unit ELSE i.unit END,'package_unit',i.unit,'pack_size',pr.precision_pack_size::text,'stock_mode','UNIT','entered_quantity',rr.value->>'qty','qty',rr.value->>'qty','unit_cost',i.unit_cost::text,'total_cost',(i.unit_cost*(rr.value->>'qty')::numeric)::text,'selling_price',i.proposed_sell_price::text,'previous_selling_price',coalesce((SELECT pc.previous_price::text FROM incoming_m3.price_changes pc WHERE pc.product_id=i.product_id AND pc.event_id=ev LIMIT 1),i.proposed_sell_price::text)) ORDER BY i.id),sum(i.unit_cost*(rr.value->>'qty')::numeric)
 INTO v_lines,total FROM jsonb_array_elements(rows) rr(value) JOIN public.inbound_stock_items i ON i.id=(rr.value->>'item_id')::uuid JOIN public.products pr ON pr.id=i.product_id;
 UPDATE incoming_m3.batches SET state='RECEIVED',receipt=jsonb_build_object('event_id',ev,'receipt_reference','RCV-'||upper(replace(p_request_id::text,'-','')),'organization_id',o.organization_id,'organization_name',(SELECT name FROM public.organizations WHERE id=o.organization_id),'store_id',o.store_id,'store_name',(SELECT name FROM public.stores WHERE id=o.store_id),'supplier_id',o.supplier_id,'supplier_name',o.supplier_name,'operator_id',auth.uid(),'operator',auth.uid()::text,'created_at',now(),'currency','TZS','line_count',jsonb_array_length(v_lines),'lines',v_lines,'total_cost',total::text,'purpose','SAVED_ORDER_RECEIVING') WHERE request_id=p_request_id;
 INSERT INTO public.notifications(organization_id,store_id,event_id,event_type,title,body,items,total_units,total_skus,actor_user_id,actor_name,created_by)
 VALUES(o.organization_id,o.store_id,ev,'STOCK_IN','RCV-'||p_request_id::text,jsonb_build_object('source','incoming_m3','event_id',ev),(SELECT jsonb_agg(value-'unit_cost'-'total_cost') FROM jsonb_array_elements(v_lines)),(SELECT sum((value->>'qty')::numeric)::integer FROM jsonb_array_elements(v_lines)),jsonb_array_length(v_lines),auth.uid(),auth.uid()::text,auth.uid());
 INSERT INTO incoming_m3.saved_receives VALUES(p_request_id,p_order_id,auth.uid(),h,ev,now());
 RETURN jsonb_build_object('orderId',p_order_id,'eventId',ev,'status','RECEIVED');
END $$;
REVOKE ALL ON FUNCTION public.m3_receive_saved_v1(uuid,uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.m3_receive_saved_v1(uuid,uuid,jsonb) TO authenticated;
'''
start=base.index('CREATE OR REPLACE FUNCTION public.m3_submit_incoming_v1(')
submit=base[start:base.index('END $$;',start)+len('END $$;')]
needle="IF v_product.id IS NULL THEN RAISE EXCEPTION 'PRODUCT_SCOPE_REQUIRED';END IF;"
submit=submit.replace(needle,needle+"\n IF v_mode='SAVE_ORDER' THEN PERFORM 1 FROM public.products WHERE id=v_product.id FOR SHARE;IF nullif(line->>'expected_selling_price','') IS NULL OR (line->>'expected_selling_price')::numeric IS DISTINCT FROM (SELECT selling_price FROM public.products WHERE id=v_product.id) THEN RAISE EXCEPTION 'PRICE_CONFLICT';END IF;END IF;",1)
(E/'2026102105-unified-price.DRAFT.sql').write_text(header+helper+'\n'+wrapper+'\n'+submit+"\nDROP FUNCTION IF EXISTS incoming_m3.receive_saved_canonical(uuid,jsonb,uuid);\nNOTIFY pgrst,'reload schema';\nCOMMIT;\n",encoding='utf-8')
print('Generated local shared-price/saved receiving contract; canonical costing unchanged')
