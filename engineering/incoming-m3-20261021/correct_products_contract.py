"""Minimal Owner-authorized current organization product-price compatibility patch."""
from pathlib import Path
import re
E=Path(__file__).resolve().parent
four=(E/'2026102104-precision-price.DRAFT.sql').read_text(encoding='utf-8');five=(E/'2026102105-unified-price.DRAFT.sql').read_text(encoding='utf-8')
def function(s,name):
 pattern=r'CREATE (?:OR REPLACE )?FUNCTION '+re.escape(name)+r'\(.*?\sAS\s+(\$[A-Za-z_]*\$).*?\1;'
 match=re.search(pattern,s,re.S);assert match,name
 return match.group(0).replace('CREATE FUNCTION','CREATE OR REPLACE FUNCTION',1)
validate=function(four,'incoming_m3.validate_product_line')
old="IF (l->>'unit_cost')::numeric IS DISTINCT FROM p.cost_price THEN RAISE EXCEPTION 'COST_BASIS_POLICY_REQUIRED';END IF;"
new="""IF (l->>'unit_cost')::numeric IS DISTINCT FROM p.cost_price THEN
  IF l->>'expected_cost_price' IS NULL THEN RAISE EXCEPTION 'PRICE_CONFIRMATION_REQUIRED';END IF;
  IF (l->>'expected_cost_price')::numeric IS DISTINCT FROM p.cost_price THEN RAISE EXCEPTION 'PRICE_CONFLICT';END IF;
 END IF;"""
assert old in validate;validate=validate.replace(old,new)
validate=validate.replace("  IF EXISTS(SELECT 1 FROM public.inventory i WHERE i.product_id=p.id AND i.store_id<>p.store_id) THEN RAISE EXCEPTION 'SHARED_PRODUCT_PRICE_POLICY_REQUIRED';END IF;",'')
header=r'''-- Owner-authorized Products price compatibility. No new costing/stock ledger.
BEGIN;
ALTER TABLE incoming_m3.price_changes ALTER COLUMN store_id DROP NOT NULL;
ALTER TABLE incoming_m3.price_changes ADD COLUMN IF NOT EXISTS previous_cost numeric, ADD COLUMN IF NOT EXISTS new_cost numeric;
CREATE OR REPLACE FUNCTION incoming_m3.guard_price_change() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE ev uuid;destination uuid;
BEGIN
 IF OLD.selling_price IS NOT DISTINCT FROM NEW.selling_price AND OLD.cost_price IS NOT DISTINCT FROM NEW.cost_price THEN RETURN NEW;END IF;
 -- Authority remains in the existing Products writer and receiving contracts.
 -- This audit trigger does not revoke legacy operational receiving permissions.
 IF NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN RAISE EXCEPTION 'PRODUCT_SCOPE_REQUIRED';END IF;
 SELECT b.event_id,b.store_id INTO ev,destination FROM incoming_m3.batches b WHERE b.actor_id=auth.uid() AND b.organization_id=NEW.organization_id AND b.transaction_id=txid_current() AND b.state='PROCESSING' AND EXISTS(SELECT 1 FROM jsonb_array_elements(b.payload->'lines') l WHERE l->>'product_id'=NEW.id::text);
 INSERT INTO incoming_m3.price_changes(organization_id,store_id,product_id,previous_price,new_price,previous_cost,new_cost,actor_id,event_id)
 VALUES(NEW.organization_id,coalesce(destination,NEW.store_id),NEW.id,OLD.selling_price,NEW.selling_price,OLD.cost_price,NEW.cost_price,auth.uid(),ev);
 RETURN NEW;
END $$;
DROP TRIGGER m3_unified_selling_price ON public.products;
CREATE TRIGGER m3_unified_selling_price BEFORE UPDATE OF selling_price,cost_price ON public.products FOR EACH ROW EXECUTE FUNCTION incoming_m3.guard_price_change();
CREATE OR REPLACE FUNCTION incoming_m3.apply_product_prices(o uuid,s uuid,pid uuid,cost numeric,selling numeric) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE p public.products;after_row public.products;
BEGIN
 PERFORM security_m2.require_owner(o,s);PERFORM security_m2.require_store(o,s);
 SELECT * INTO p FROM public.products WHERE id=pid AND organization_id=o FOR UPDATE;
 IF p.id IS NULL THEN RAISE EXCEPTION 'PRODUCT_SCOPE_REQUIRED';END IF;
 IF p.cost_price IS NOT DISTINCT FROM cost AND p.selling_price IS NOT DISTINCT FROM selling THEN RETURN;END IF;
 -- Call the actual Products writer, retaining the product's organization/store
 -- identity and every metadata parameter. Receiving changes destination stock only.
 PERFORM public.upsert_product(p.organization_id,p.id,p.name,p.sku,p.unit,p.category,p.is_active,selling,cost,p.barcode,p.store_id,p.is_precision_product,p.precision_pack_size,p.precision_base_unit,p.precision_sell_mode,p.precision_allow_box_sales,p.precision_allow_unit_sales,p.image_url);
 SELECT * INTO after_row FROM public.products WHERE id=pid AND organization_id=o;
 IF (to_jsonb(p)-'cost_price'-'selling_price'-'updated_at') IS DISTINCT FROM (to_jsonb(after_row)-'cost_price'-'selling_price'-'updated_at') THEN RAISE EXCEPTION 'PRODUCT_IDENTITY_CHANGED';END IF;
 IF after_row.cost_price IS DISTINCT FROM cost OR after_row.selling_price IS DISTINCT FROM selling THEN RAISE EXCEPTION 'CANONICAL_PRECISION_REQUIRED';END IF;
END $$;
REVOKE ALL ON FUNCTION incoming_m3.apply_product_prices(uuid,uuid,uuid,numeric,numeric),incoming_m3.guard_price_change() FROM PUBLIC,anon,authenticated;
'''
submit=function(five,'public.m3_submit_incoming_v1')
submit=submit.replace(' AND p.store_id=p_store_id','')
needle="IF v_mode='SAVE_ORDER' THEN PERFORM 1 FROM public.products WHERE id=v_product.id FOR SHARE;"
assert needle in submit
submit=submit.replace(needle,needle+"IF (line->>'unit_cost')::numeric IS DISTINCT FROM (SELECT cost_price FROM public.products WHERE id=v_product.id) AND (line->>'expected_cost_price') IS NULL THEN RAISE EXCEPTION 'PRICE_CONFIRMATION_REQUIRED';END IF;IF (line->>'expected_cost_price') IS NOT NULL AND (line->>'expected_cost_price')::numeric IS DISTINCT FROM (SELECT cost_price FROM public.products WHERE id=v_product.id) THEN RAISE EXCEPTION 'PRICE_CONFLICT';END IF;")
old="UPDATE public.products SET selling_price=(line->>'selling_price')::numeric,updated_at=now() WHERE id=(line->>'product_id')::uuid AND organization_id=p_org_id AND store_id=p_store_id AND selling_price IS DISTINCT FROM (line->>'selling_price')::numeric;"
assert old in submit;submit=submit.replace(old,"PERFORM incoming_m3.apply_product_prices(p_org_id,p_store_id,(line->>'product_id')::uuid,(line->>'unit_cost')::numeric,(line->>'selling_price')::numeric);")
partial=function(five,'public.receive_inbound_stock_partial_v1')
old='UPDATE public.products SET qty_on_hand=v_next_qty,selling_price=r.proposed_sell_price,updated_at=now() WHERE id=v_product_id;'
assert old in partial;partial=partial.replace(old,'UPDATE public.products SET qty_on_hand=v_next_qty,updated_at=now() WHERE id=v_product_id;\n      PERFORM incoming_m3.apply_product_prices(v_org_id,v_store_id,v_product_id,r.unit_cost,r.proposed_sell_price);')
saved=function(five,'public.m3_receive_saved_v1').replace('expected numeric;q numeric;','expected numeric;expected_cost numeric;q numeric;').replace(' AND store_id=o.store_id FOR UPDATE',' FOR UPDATE')
saved=saved.replace("FOR x IN SELECT value FROM jsonb_array_elements(rows) ORDER BY value->>'item_id' LOOP", "FOR x IN SELECT rr.value FROM jsonb_array_elements(rows) rr(value) LEFT JOIN public.inbound_stock_items ii ON ii.id=(rr.value->>'item_id')::uuid AND ii.inbound_order_id=p_order_id ORDER BY ii.product_id,ii.id LOOP")
needle="IF p.selling_price IS DISTINCT FROM expected THEN RAISE EXCEPTION 'PRICE_CONFLICT';END IF;"
assert needle in saved
saved=saved.replace(needle,needle+"""
  expected_cost:=nullif(l->>'expected_cost_price','')::numeric;
  IF it.qty_received>0 AND EXISTS(SELECT 1 FROM incoming_m3.price_changes pc JOIN incoming_m3.saved_receives sr ON sr.event_id=pc.event_id WHERE sr.order_id=p_order_id AND pc.product_id=p.id AND pc.new_cost=it.unit_cost) THEN expected_cost:=it.unit_cost;END IF;
  IF expected_cost IS NOT NULL AND p.cost_price IS DISTINCT FROM expected_cost THEN RAISE EXCEPTION 'PRICE_CONFLICT';END IF;
  IF expected_cost IS NULL AND p.cost_price IS DISTINCT FROM it.unit_cost THEN RAISE EXCEPTION 'PRICE_CONFIRMATION_REQUIRED';END IF;
""")
cat=function(four,'public.m3_incoming_catalog_v1').replace(' AND p.store_id=p_store_id','')
(E/'2026102106-products-price-compatibility.sql').write_text(header+'\n'+validate+'\n'+submit+'\n'+partial+'\n'+saved+'\n'+cat+"\nNOTIFY pgrst,'reload schema';COMMIT;\n",encoding='utf-8')
for platform in ['web','android']:
 root=E/f'source-{platform}'
 p=root/'src/incoming/model.ts';s=p.read_text(encoding='utf-8')
 if 'expectedCost?:string' not in s:s=s.replace('expectedSelling?:string','expectedSelling?:string;expectedCost?:string')
 if 'expected_cost_price:' not in s:s=s.replace('expected_selling_price:l.expectedSelling??l.selling,','expected_selling_price:l.expectedSelling??l.selling,expected_cost_price:l.expectedCost??null,')
 p.write_text(s,encoding='utf-8')
 p=root/'src/incoming/BulkScreen.tsx';s=p.read_text(encoding='utf-8')
 if 'expectedCost:String' not in s:s=s.replace("expectedSelling:String(p.selling_price??'0'),", "expectedSelling:String(p.selling_price??'0'),expectedCost:String(p.cost_price??'0'),")
 p.write_text(s,encoding='utf-8')
print('Generated Products-contract correction with atomic canonical writer and dual-price conflict checks')
