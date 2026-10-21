from pathlib import Path
import re
E=Path(__file__).resolve().parent;base=(E/'2026102102-incoming-m3.DRAFT.sql').read_text(encoding='utf-8')
def function(name):
 start=base.index('CREATE FUNCTION public.'+name+'(') if 'CREATE FUNCTION public.'+name+'(' in base else base.index('CREATE OR REPLACE FUNCTION public.'+name+'(')
 end=base.index('END $$;',start)+len('END $$;') if name.startswith('m3_') else base.index('$function$',base.index('AS $function$',start)+len('AS $function$'))+len('$function$;')
 return base[start:end].replace('CREATE FUNCTION ','CREATE OR REPLACE FUNCTION ',1)
helper=r'''CREATE OR REPLACE FUNCTION incoming_m3.validate_product_line(p public.products,l jsonb) RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE mode text:=coalesce(l->>'stock_mode','UNIT');entered numeric:=coalesce(l->>'entered_quantity',l->>'quantity')::numeric;computed numeric;
BEGIN
 IF p.name IS DISTINCT FROM l->>'product_name' OR coalesce(p.sku,'') IS DISTINCT FROM coalesce(l->>'sku','') OR coalesce(p.barcode,'') IS DISTINCT FROM coalesce(l->>'barcode','') OR coalesce(nullif(p.unit,''),'pcs') IS DISTINCT FROM l->>'unit' THEN RAISE EXCEPTION 'PRODUCT_IDENTITY_CHANGED';END IF;
 IF coalesce(p.is_precision_product,false) IS DISTINCT FROM coalesce((l->>'is_precision')::boolean,false) THEN RAISE EXCEPTION 'PRECISION_METADATA_CHANGED';END IF;
 IF mode NOT IN ('UNIT','PACK','BOX','CARTON') OR entered<=0 THEN RAISE EXCEPTION 'INVALID_AMOUNT';END IF;
 IF coalesce(p.is_precision_product,false) THEN
  IF p.precision_pack_size IS NULL OR p.precision_pack_size<=0 OR (l->>'pack_size')::numeric IS DISTINCT FROM p.precision_pack_size OR l->>'base_unit' IS DISTINCT FROM p.precision_base_unit THEN RAISE EXCEPTION 'PRECISION_METADATA_CHANGED';END IF;
  IF mode='UNIT' AND NOT p.precision_allow_unit_sales OR mode<>'UNIT' AND NOT p.precision_allow_box_sales THEN RAISE EXCEPTION 'PRECISION_METADATA_CHANGED';END IF;
 ELSIF mode<>'UNIT' THEN RAISE EXCEPTION 'PRECISION_METADATA_CHANGED';END IF;
 computed:=entered*CASE WHEN mode='UNIT' THEN 1 ELSE p.precision_pack_size END;
 IF computed<>(l->>'quantity')::numeric OR computed<>trunc(computed) OR computed>999999999 THEN RAISE EXCEPTION 'UNSUPPORTED_QUANTITY_PRECISION';END IF;
 IF (l->>'unit_cost')::numeric IS DISTINCT FROM p.cost_price THEN RAISE EXCEPTION 'COST_BASIS_POLICY_REQUIRED';END IF;
 IF (l->>'selling_price')::numeric IS DISTINCT FROM p.selling_price THEN
  IF l->>'expected_selling_price' IS NULL THEN RAISE EXCEPTION 'PRICE_CONFIRMATION_REQUIRED';END IF;
  IF (l->>'expected_selling_price')::numeric IS DISTINCT FROM p.selling_price THEN RAISE EXCEPTION 'PRICE_CONFLICT';END IF;
  IF EXISTS(SELECT 1 FROM public.inventory i WHERE i.product_id=p.id AND i.store_id<>p.store_id) THEN RAISE EXCEPTION 'SHARED_PRODUCT_PRICE_POLICY_REQUIRED';END IF;
 END IF;
END $$;
REVOKE ALL ON FUNCTION incoming_m3.validate_product_line(public.products,jsonb) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION incoming_m3.current_cost(o uuid,s uuid,p uuid) RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT (v->>'unit_cost')::numeric FROM incoming_m3.batches b CROSS JOIN LATERAL jsonb_array_elements(b.payload->'lines') v WHERE b.organization_id=o AND b.store_id=s AND b.actor_id=auth.uid() AND b.transaction_id=txid_current() AND b.state='PROCESSING' AND b.payload->>'mode'='RECEIVE_NOW' AND v->>'product_id'=p::text $$;
REVOKE ALL ON FUNCTION incoming_m3.current_cost(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;
'''
cat=function('m3_incoming_catalog_v1').replace('p.cost_price::text,p.selling_price::text','p.cost_price::text,p.selling_price::text,p.is_precision_product,p.precision_pack_size::text,p.precision_base_unit,p.precision_sell_mode,p.precision_allow_box_sales,p.precision_allow_unit_sales')
cat=cat.replace("IF p_kind='PRODUCT' THEN","IF p_kind='CONTEXT' THEN SELECT jsonb_build_object('organization_id',p_org_id,'store_id',s.id,'store_type',s.store_type) INTO result FROM public.stores s WHERE s.id=p_store_id AND s.organization_id=p_org_id AND s.is_active IS TRUE;\n ELSIF p_kind='PRODUCT' THEN",1)
submit=function('m3_submit_incoming_v1').replace("s.store_type='STANDARD'","s.store_type IN ('STANDARD','PRECISION_RETAIL')")
submit=submit.replace("THEN RAISE EXCEPTION 'REGISTER_PRICE_CHANGE_FIRST';END IF;","THEN PERFORM incoming_m3.validate_product_line(v_product,line);END IF;",1)
# All registered lines are validated even when price is unchanged (metadata/quantity authority).
submit=submit.replace("IF coalesce(nullif(v_product.unit,''),'pcs')", "IF v_mode='RECEIVE_NOW' THEN PERFORM incoming_m3.validate_product_line(v_product,line);END IF;\n   IF coalesce(nullif(v_product.unit,''),'pcs')",1)
old="IF v_product.id IS NULL OR (line->>'unit_cost')::numeric IS DISTINCT FROM v_product.cost_price OR (line->>'selling_price')::numeric IS DISTINCT FROM v_product.selling_price THEN RAISE EXCEPTION 'REGISTER_PRICE_CHANGE_FIRST';END IF;"
assert old in submit;submit=submit.replace(old,"IF v_product.id IS NULL THEN RAISE EXCEPTION 'PRODUCT_SCOPE_REQUIRED';END IF;\n  PERFORM incoming_m3.validate_product_line(v_product,line);")
submit=submit.replace('IF coalesce(v_product.is_precision_product,false) OR EXISTS','IF EXISTS')
needle="PERFORM public.adjust_stock(p_store_id,(line->>'product_id')::uuid,(line->>'quantity')::numeric,'ADD'"
assert needle in submit
submit=submit.replace(needle,"PERFORM public.adjust_stock(p_store_id,(line->>'product_id')::uuid,(line->>'quantity')::numeric,'ADD'")
needle=" END LOOP;\n SELECT count(*) INTO v_count FROM public.stock_movements"
assert needle in submit
submit=submit.replace(needle,"  UPDATE public.products SET selling_price=(line->>'selling_price')::numeric,updated_at=now() WHERE id=(line->>'product_id')::uuid AND organization_id=p_org_id AND store_id=p_store_id AND selling_price IS DISTINCT FROM (line->>'selling_price')::numeric;\n END LOOP;\n SELECT count(*) INTO v_count FROM public.stock_movements",1)
submit=submit.replace("'unit',v->>'unit','qty'","'unit',CASE WHEN (v->>'is_precision')::boolean THEN v->>'base_unit' ELSE v->>'unit' END,'package_unit',v->>'unit','pack_size',v->>'pack_size','entered_quantity',coalesce(v->>'entered_quantity',v->>'quantity'),'stock_mode',coalesce(v->>'stock_mode','UNIT'),'previous_selling_price',coalesce(v->>'expected_selling_price',v->>'selling_price'),'qty'",1)
adjust=function('adjust_stock')
adjust,n=re.subn(r'(supplier_invoice_no,\s*created_by,\s*created_at, event_id)\)',r'\1,unit_cost,total_cost)',adjust,count=1);assert n==1
adjust,n=re.subn(r'(coalesce\(incoming_m3.current_event\(v_org_id,p_store_id\),gen_random_uuid\(\)\))\)',r'\1,coalesce(incoming_m3.current_cost(v_org_id,p_store_id,p_product_id),0),coalesce(incoming_m3.current_cost(v_org_id,p_store_id,p_product_id),0)*v_effective_amount)',adjust,count=1);assert n==1
# New saved intended-price/precision orders must not enter a legacy writer which silently reprices or changes cost basis.
partial=base[base.index('CREATE OR REPLACE FUNCTION public.receive_inbound_stock_partial_v1('):];partial=partial[:partial.index('$function$',partial.index('AS $function$')+len('AS $function$'))+len('$function$;')]
guard="IF EXISTS(SELECT 1 FROM incoming_m3.batches b WHERE b.order_id=p_order_id AND EXISTS(SELECT 1 FROM jsonb_array_elements(b.payload->'lines') l WHERE (l->>'is_precision')::boolean IS TRUE OR l->>'expected_selling_price' IS NOT NULL AND (l->>'expected_selling_price')::numeric IS DISTINCT FROM (l->>'selling_price')::numeric)) THEN RAISE EXCEPTION 'M3_ORDER_RECEIVING_CONTRACT_REQUIRED';END IF;\n"
guard+="IF EXISTS(SELECT 1 FROM incoming_m3.batches b WHERE b.order_id=p_order_id AND (EXISTS(SELECT 1 FROM public.stores st WHERE st.id=b.store_id AND st.store_type='PRECISION_RETAIL') OR EXISTS(SELECT 1 FROM jsonb_array_elements(b.payload->'lines') l JOIN public.products pp ON pp.id=(l->>'product_id')::uuid WHERE pp.cost_price IS DISTINCT FROM (l->>'unit_cost')::numeric))) THEN RAISE EXCEPTION 'M3_ORDER_RECEIVING_CONTRACT_REQUIRED';END IF;\n"
partial=partial.replace('PERFORM 1 FROM public.inbound_stock_orders o WHERE o.id=p_order_id FOR UPDATE;', 'PERFORM 1 FROM public.inbound_stock_orders o WHERE o.id=p_order_id FOR UPDATE;\n'+guard,1)
out='-- MASTER M3 LOCAL EXTENSION ONLY. Requires 2026102102 and M2; no hosted execution.\nBEGIN;\n'+helper+cat+'\n'+submit+'\n'+adjust+'\n'+partial+"\nNOTIFY pgrst,'reload schema';\nCOMMIT;\n"
(E/'2026102104-precision-price.DRAFT.sql').write_text(out,encoding='utf-8');print('Precision/price extension generated; acquisition-cost policy remains fail-closed')
