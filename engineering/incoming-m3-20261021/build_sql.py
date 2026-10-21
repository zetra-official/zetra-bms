from pathlib import Path
E=Path('engineering/incoming-m3-20261021')
sql=r'''-- M3 LOCAL CANDIDATE ONLY. Requires the sealed M2 draft. No hosted execution approved.
BEGIN;
CREATE SCHEMA incoming_m3;
REVOKE ALL ON SCHEMA incoming_m3 FROM PUBLIC,anon,authenticated;
CREATE TABLE incoming_m3.batches(
 request_id uuid PRIMARY KEY,organization_id uuid NOT NULL REFERENCES public.organizations(id),store_id uuid NOT NULL REFERENCES public.stores(id),actor_id uuid NOT NULL,
 payload_hash text NOT NULL,payload jsonb NOT NULL,order_id uuid REFERENCES public.inbound_stock_orders(id),event_id uuid UNIQUE,
 state text NOT NULL CHECK(state IN ('PROCESSING','SAVED','RECEIVED')),transaction_id bigint NOT NULL,receipt jsonb,created_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE incoming_m3.batches ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON incoming_m3.batches FROM PUBLIC,anon,authenticated;
CREATE FUNCTION incoming_m3.active_batch(o uuid,s uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT EXISTS(SELECT 1 FROM incoming_m3.batches b WHERE b.organization_id=o AND b.store_id=s AND b.actor_id=auth.uid() AND b.transaction_id=txid_current() AND b.state='PROCESSING' AND b.payload->>'mode'='RECEIVE_NOW') $$;
CREATE FUNCTION incoming_m3.current_event(o uuid,s uuid) RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT b.event_id FROM incoming_m3.batches b WHERE b.organization_id=o AND b.store_id=s AND b.actor_id=auth.uid() AND b.transaction_id=txid_current() AND b.state='PROCESSING' AND b.payload->>'mode'='RECEIVE_NOW' $$;
CREATE FUNCTION incoming_m3.current_supplier(o uuid,s uuid) RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT nullif(b.payload->>'supplier_id','')::uuid FROM incoming_m3.batches b WHERE b.organization_id=o AND b.store_id=s AND b.actor_id=auth.uid() AND b.transaction_id=txid_current() AND b.state='PROCESSING' AND b.payload->>'mode'='RECEIVE_NOW' $$;
REVOKE ALL ON FUNCTION incoming_m3.active_batch(uuid,uuid),incoming_m3.current_event(uuid,uuid),incoming_m3.current_supplier(uuid,uuid) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.m3_incoming_catalog_v1(p_org_id uuid,p_store_id uuid,p_kind text,p_query text DEFAULT '') RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE result jsonb;
BEGIN
 PERFORM security_m2.require_owner(p_org_id,p_store_id);PERFORM security_m2.require_store(p_org_id,p_store_id);
 IF length(coalesce(p_query,''))>100 THEN RAISE EXCEPTION 'INVALID_SEARCH';END IF;
 IF p_kind='PRODUCT' THEN
  SELECT coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) INTO result FROM(SELECT p.id,p.name,p.sku,p.barcode,p.unit,p.category,p.cost_price::text,p.selling_price::text FROM public.products p WHERE p.organization_id=p_org_id AND p.store_id=p_store_id AND (strpos(lower(p.name),lower(coalesce(p_query,'')))>0 OR strpos(lower(coalesce(p.sku,'')),lower(coalesce(p_query,'')))>0 OR strpos(lower(coalesce(p.barcode,'')),lower(coalesce(p_query,'')))>0) ORDER BY p.name,p.id LIMIT 50)t;
 ELSIF p_kind='SUPPLIER' THEN
  SELECT coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) INTO result FROM(SELECT s.id,s.name,s.phone,s.email,s.address FROM public.suppliers s WHERE s.organization_id=p_org_id AND s.is_active IS TRUE AND (strpos(lower(s.name),lower(coalesce(p_query,'')))>0 OR strpos(lower(coalesce(s.phone,'')),lower(coalesce(p_query,'')))>0 OR strpos(lower(coalesce(s.email,'')),lower(coalesce(p_query,'')))>0) ORDER BY s.name,s.id LIMIT 50)t;
 ELSE RAISE EXCEPTION 'INVALID_SEARCH';END IF;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.m3_incoming_catalog_v1(uuid,uuid,text,text) FROM PUBLIC,anon;GRANT EXECUTE ON FUNCTION public.m3_incoming_catalog_v1(uuid,uuid,text,text) TO authenticated;

CREATE FUNCTION public.m3_incoming_receipt_v1(p_event_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE b incoming_m3.batches; result jsonb;
BEGIN
 SELECT * INTO b FROM incoming_m3.batches WHERE event_id=p_event_id AND state='RECEIVED';
 IF b.request_id IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='RECEIPT_ACCESS_REQUIRED'; END IF;
 IF security_m2.owner_of(b.organization_id) THEN PERFORM security_m2.require_owner(b.organization_id,b.store_id);ELSE PERFORM security_m2.require_store(b.organization_id,b.store_id);END IF;
 result:=b.receipt;
 IF NOT security_m2.owner_of(b.organization_id) THEN
  result:=result-'total_cost'-'note';
  SELECT jsonb_set(result,'{lines}',jsonb_agg(value-'unit_cost'-'total_cost'-'note' ORDER BY ord)) INTO result FROM jsonb_array_elements(result->'lines') WITH ORDINALITY a(value,ord);
 END IF;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.m3_incoming_receipt_v1(uuid) FROM PUBLIC,anon;GRANT EXECUTE ON FUNCTION public.m3_incoming_receipt_v1(uuid) TO authenticated;

CREATE FUNCTION public.m3_submit_incoming_v1(p_org_id uuid,p_store_id uuid,p_request_id uuid,p_payload jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE b incoming_m3.batches;h text;v_mode text;v_supplier public.suppliers;v_order uuid;v_item uuid;line jsonb;v_product public.products;v_count integer;v_qty numeric;v_cost numeric;v_sell numeric;v_event uuid;v_code text;v_lines jsonb;v_total numeric;v_currency text;v_operator text;v_notifications integer;
BEGIN
 PERFORM security_m2.require_owner(p_org_id,p_store_id);
 IF p_request_id IS NULL OR p_payload IS NULL OR pg_column_size(p_payload)>2000000 OR jsonb_typeof(p_payload)<>'object' THEN RAISE EXCEPTION 'INVALID_DRAFT'; END IF;
 h:=encode(sha256(convert_to(p_payload::text,'UTF8')),'hex');PERFORM pg_advisory_xact_lock(hashtextextended('incoming-m3:'||p_request_id::text,0));
 SELECT * INTO b FROM incoming_m3.batches WHERE request_id=p_request_id FOR UPDATE;
 IF FOUND THEN
  IF b.organization_id<>p_org_id OR b.store_id<>p_store_id OR b.actor_id<>auth.uid() OR b.payload_hash<>h THEN RAISE EXCEPTION 'REQUEST_CONFLICT';END IF;
  IF b.state NOT IN ('SAVED','RECEIVED') THEN RAISE EXCEPTION 'SUBMISSION_UNCERTAIN';END IF;
  RETURN jsonb_build_object('orderId',b.order_id,'eventId',b.event_id,'status',b.state);
 END IF;
 PERFORM security_m2.require_store(p_org_id,p_store_id);
 IF NOT EXISTS(SELECT 1 FROM public.stores s WHERE s.id=p_store_id AND s.organization_id=p_org_id AND s.is_active IS TRUE AND s.store_type='STANDARD') THEN RAISE EXCEPTION 'STORE_TYPE_NOT_CERTIFIED'; END IF;
 -- Currency is verified from canonical authority. Unconfirmed legacy organizations remain TZS; authority failures do not become a fabricated confirmation.
 BEGIN
  SELECT public.get_org_accounting_currency_v1(p_org_id)->>'currency' INTO v_currency;
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM='ACCOUNTING_CURRENCY_UNCONFIRMED' THEN v_currency:='TZS';ELSE RAISE EXCEPTION 'ACCOUNTING_AUTHORITY_UNAVAILABLE';END IF;
 END;
 IF v_currency IS DISTINCT FROM 'TZS' OR p_payload->>'currency' IS DISTINCT FROM 'TZS' THEN RAISE EXCEPTION 'NATIVE_FINANCIAL_POSTING_NOT_CERTIFIED'; END IF;
 v_mode:=p_payload->>'mode';IF v_mode NOT IN ('SAVE_ORDER','RECEIVE_NOW') OR v_mode IS NULL THEN RAISE EXCEPTION 'INVALID_DRAFT';END IF;
 IF p_payload ?| ARRAY['payment','payments','paid_amount','payable','settlement','funding','payment_channel'] THEN RAISE EXCEPTION 'FINANCIAL_INTEGRATION_BLOCKED';END IF;
 IF v_mode='RECEIVE_NOW' AND (p_payload->>'purpose' IS DISTINCT FROM 'EXISTING_NON_CREDIT_STOCK' OR p_payload->>'non_credit_confirmed' IS DISTINCT FROM 'true') THEN RAISE EXCEPTION 'NON_CREDIT_REQUIRED';END IF;
 IF jsonb_typeof(p_payload->'lines') IS DISTINCT FROM 'array' OR jsonb_array_length(p_payload->'lines') NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'LINE_LIMIT';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('incoming-store:'||p_store_id::text,0));
 IF nullif(p_payload->>'supplier_id','') IS NOT NULL THEN
  SELECT * INTO v_supplier FROM public.suppliers s WHERE s.id=(p_payload->>'supplier_id')::uuid AND s.organization_id=p_org_id AND s.is_active IS TRUE FOR SHARE;
  IF v_supplier.id IS NULL THEN RAISE EXCEPTION 'SUPPLIER_REQUIRED';END IF;
  IF (SELECT count(*) FROM public.suppliers s WHERE s.organization_id=p_org_id AND s.is_active IS TRUE AND lower(btrim(s.name))=lower(btrim(v_supplier.name)))<>1 THEN RAISE EXCEPTION 'AMBIGUOUS_SUPPLIER';END IF;
 ELSIF v_mode='SAVE_ORDER' THEN RAISE EXCEPTION 'SUPPLIER_REQUIRED';END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_payload->'lines') a GROUP BY a->>'product_id' HAVING nullif(a->>'product_id','') IS NOT NULL AND count(*)>1) THEN RAISE EXCEPTION 'DUPLICATE_PRODUCT';END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_payload->'lines') a CROSS JOIN LATERAL(VALUES('sku:'||nullif(btrim(a->>'sku'),'')),('barcode:'||nullif(btrim(a->>'barcode'),''))) k(v) WHERE k.v IS NOT NULL GROUP BY k.v HAVING count(*)>1) THEN RAISE EXCEPTION 'DUPLICATE_PRODUCT';END IF;
 -- Validate every line before creating canonical records. New immediate receipts must reference registered product identities.
 FOR line IN SELECT * FROM jsonb_array_elements(p_payload->'lines') LOOP
  IF nullif(btrim(line->>'product_name'),'') IS NULL OR length(line->>'product_name')>500 OR nullif(btrim(line->>'unit'),'') IS NULL THEN RAISE EXCEPTION 'PRODUCT_REQUIRED';END IF;
  IF coalesce(line->>'quantity','')!~'^[1-9][0-9]{0,8}$' THEN RAISE EXCEPTION 'WHOLE_QUANTITY_REQUIRED';END IF;
  IF coalesce(line->>'unit_cost','')!~'^(0|[1-9][0-9]{0,11})(\.[0-9]{1,6})?$' OR coalesce(line->>'selling_price','')!~'^(0|[1-9][0-9]{0,11})(\.[0-9]{1,6})?$' THEN RAISE EXCEPTION 'INVALID_AMOUNT';END IF;
  IF v_mode='SAVE_ORDER' AND (scale((line->>'unit_cost')::numeric)>2 OR scale((line->>'selling_price')::numeric)>2) THEN RAISE EXCEPTION 'CANONICAL_PRECISION_REQUIRED';END IF;
  v_qty:=(line->>'quantity')::numeric;v_cost:=(line->>'unit_cost')::numeric;v_sell:=(line->>'selling_price')::numeric;IF v_cost<=0 THEN RAISE EXCEPTION 'INVALID_AMOUNT';END IF;
  v_product:=NULL;
  IF nullif(line->>'product_id','') IS NOT NULL THEN
   SELECT * INTO v_product FROM public.products p WHERE p.id=(line->>'product_id')::uuid AND p.organization_id=p_org_id AND p.store_id=p_store_id;
   IF v_product.id IS NULL THEN RAISE EXCEPTION 'PRODUCT_SCOPE_REQUIRED';END IF;
   IF v_mode='RECEIVE_NOW' AND ((line->>'unit_cost')::numeric IS DISTINCT FROM v_product.cost_price OR (line->>'selling_price')::numeric IS DISTINCT FROM v_product.selling_price) THEN RAISE EXCEPTION 'REGISTER_PRICE_CHANGE_FIRST';END IF;
   IF coalesce(nullif(v_product.unit,''),'pcs') IS DISTINCT FROM line->>'unit' THEN RAISE EXCEPTION 'PRODUCT_UNIT_CHANGED';END IF;
   IF coalesce(v_product.sku,'')<>coalesce(line->>'sku','') OR coalesce(v_product.barcode,'')<>coalesce(line->>'barcode','') OR v_product.name<>line->>'product_name' THEN RAISE EXCEPTION 'PRODUCT_IDENTITY_CHANGED';END IF;
  ELSIF v_mode='RECEIVE_NOW' THEN RAISE EXCEPTION 'REGISTER_PRODUCT_FIRST';
  ELSIF nullif(btrim(line->>'sku'),'') IS NULL AND nullif(btrim(line->>'barcode'),'') IS NULL THEN RAISE EXCEPTION 'PRODUCT_REQUIRED';
  END IF;
 END LOOP;
 INSERT INTO incoming_m3.batches(request_id,organization_id,store_id,actor_id,payload_hash,payload,state,transaction_id,event_id) VALUES(p_request_id,p_org_id,p_store_id,auth.uid(),h,p_payload,'PROCESSING',txid_current(),CASE WHEN v_mode='RECEIVE_NOW' THEN gen_random_uuid() ELSE NULL END) RETURNING event_id INTO v_event;
 IF v_mode='SAVE_ORDER' THEN
  v_order:=public.create_inbound_stock_order_v1(p_org_id,p_store_id,v_supplier.name,p_payload->>'source_country',p_payload->>'source_city',p_payload->>'destination_name',p_payload->>'invoice_number',p_payload->>'tracking_number',nullif(p_payload->>'expected_arrival_date','')::date,p_payload->>'note');
  IF (SELECT supplier_id FROM public.inbound_stock_orders WHERE id=v_order)<>v_supplier.id THEN RAISE EXCEPTION 'SUPPLIER_IDENTITY_CHANGED';END IF;
  FOR line IN SELECT * FROM jsonb_array_elements(p_payload->'lines') LOOP
   v_item:=public.add_inbound_stock_item_v1(v_order,line->>'product_name',line->>'sku',line->>'unit',line->>'category',line->>'barcode',(line->>'quantity')::numeric,(line->>'unit_cost')::numeric,(line->>'selling_price')::numeric,line->>'note');
   IF nullif(line->>'product_id','') IS NOT NULL THEN UPDATE public.inbound_stock_items SET product_id=(line->>'product_id')::uuid,is_new_product=false WHERE id=v_item;END IF;
  END LOOP;
  UPDATE incoming_m3.batches SET state='SAVED',order_id=v_order WHERE request_id=p_request_id;
  RETURN jsonb_build_object('orderId',v_order,'eventId',NULL,'status','SAVED');
 END IF;
 -- Acquire inventory then product locks, matching the canonical adjustment engine.
 FOR line IN SELECT v FROM jsonb_array_elements(p_payload->'lines') v ORDER BY v->>'product_id' LOOP
  INSERT INTO public.inventory(organization_id,store_id,product_id,qty) VALUES(p_org_id,p_store_id,(line->>'product_id')::uuid,0) ON CONFLICT(store_id,product_id) DO NOTHING;
  PERFORM 1 FROM public.inventory WHERE store_id=p_store_id AND product_id=(line->>'product_id')::uuid FOR UPDATE;
  SELECT * INTO v_product FROM public.products p WHERE p.id=(line->>'product_id')::uuid AND p.organization_id=p_org_id AND p.store_id=p_store_id FOR UPDATE;
  IF v_product.id IS NULL OR (line->>'unit_cost')::numeric IS DISTINCT FROM v_product.cost_price OR (line->>'selling_price')::numeric IS DISTINCT FROM v_product.selling_price THEN RAISE EXCEPTION 'REGISTER_PRICE_CHANGE_FIRST';END IF;
  IF coalesce(v_product.is_precision_product,false) OR EXISTS(SELECT 1 FROM public.inventory i WHERE i.store_id=p_store_id AND i.product_id=v_product.id AND (i.qty<>trunc(i.qty) OR i.qty+(line->>'quantity')::numeric>999999999)) THEN RAISE EXCEPTION 'WHOLE_QUANTITY_REQUIRED';END IF;
 END LOOP;
 IF (SELECT sum((v->>'quantity')::numeric) FROM jsonb_array_elements(p_payload->'lines') v)>2147483647 THEN RAISE EXCEPTION 'WHOLE_QUANTITY_REQUIRED';END IF;
 FOR line IN SELECT * FROM jsonb_array_elements(p_payload->'lines') LOOP
  PERFORM public.adjust_stock(p_store_id,(line->>'product_id')::uuid,(line->>'quantity')::numeric,'ADD','M3 non-credit receipt '||p_request_id::text,NULL::date,v_supplier.name,p_payload->>'invoice_number',30,'UNIT');
 END LOOP;
 SELECT count(*) INTO v_count FROM public.stock_movements m WHERE m.event_id=v_event AND m.organization_id=p_org_id AND m.store_id=p_store_id AND m.supplier_id IS NOT DISTINCT FROM v_supplier.id;
 IF v_count<>jsonb_array_length(p_payload->'lines') THEN RAISE EXCEPTION 'RECEIVING_EVENT_MISMATCH';END IF;
 SELECT jsonb_agg(jsonb_build_object('product_id',v->>'product_id','product_name',v->>'product_name','sku',v->>'sku','barcode',v->>'barcode','unit',v->>'unit','qty',v->>'quantity','selling_price',v->>'selling_price','unit_cost',v->>'unit_cost','total_cost',((v->>'quantity')::numeric*(v->>'unit_cost')::numeric)::text,'note',v->>'note') ORDER BY ord),sum((v->>'quantity')::numeric*(v->>'unit_cost')::numeric) INTO v_lines,v_total FROM jsonb_array_elements(p_payload->'lines') WITH ORDINALITY z(v,ord);
 v_code:='RCV-'||upper(replace(p_request_id::text,'-',''));v_operator:=auth.uid()::text;
 UPDATE incoming_m3.batches SET state='RECEIVED',receipt=jsonb_build_object('event_id',v_event,'receipt_reference',v_code,'organization_id',p_org_id,'organization_name',(SELECT name FROM public.organizations WHERE id=p_org_id),'store_id',p_store_id,'store_name',(SELECT name FROM public.stores WHERE id=p_store_id),'supplier_id',v_supplier.id,'supplier_name',v_supplier.name,'operator_id',auth.uid(),'operator',v_operator,'created_at',now(),'currency','TZS','line_count',jsonb_array_length(v_lines),'lines',v_lines,'total_cost',v_total::text,'purpose','EXISTING_NON_CREDIT_STOCK','note',p_payload->>'note') WHERE request_id=p_request_id;
 INSERT INTO public.notifications(organization_id,store_id,event_id,event_type,title,body,items,total_units,total_skus,actor_user_id,actor_name,created_by)
 VALUES(p_org_id,p_store_id,v_event,'STOCK_IN',v_code,jsonb_build_object('source','incoming_m3','event_id',v_event),
 (SELECT jsonb_agg(jsonb_build_object('product_id',x->'product_id','product_name',x->'product_name','sku',x->'sku','unit',x->'unit','qty',x->'qty')) FROM jsonb_array_elements(v_lines) x),
 (SELECT sum((x->>'qty')::numeric)::integer FROM jsonb_array_elements(v_lines) x),jsonb_array_length(v_lines),auth.uid(),v_operator,auth.uid());
 RETURN jsonb_build_object('orderId',NULL,'eventId',v_event,'status','RECEIVED');
END $$;
REVOKE ALL ON FUNCTION public.m3_submit_incoming_v1(uuid,uuid,uuid,jsonb) FROM PUBLIC,anon;GRANT EXECUTE ON FUNCTION public.m3_submit_incoming_v1(uuid,uuid,uuid,jsonb) TO authenticated;
'''
# Narrow event/serialization hooks; inventory arithmetic and financial contracts are unchanged.
import re
s=(E/'adjust_stock.private.sql').read_text(encoding='utf-8').replace('\r','')
s,n=re.subn(r'(if v_org_id is null then\s*raise exception \'Store not found\';\s*end if;)',r"\1\n PERFORM pg_advisory_xact_lock(hashtextextended('incoming-store:'||p_store_id::text,0));",s,count=1,flags=re.I);assert n==1
s,n=re.subn(r'(supplier_invoice_no,\s*created_by,\s*created_at)\s*\)',r'\1, event_id)',s,count=1,flags=re.I);assert n==1
s,n=re.subn(r'(v_supplier_invoice_no,\s*auth.uid\(\),\s*now\(\))\s*\)',r'\1, coalesce(incoming_m3.current_event(v_org_id,p_store_id),gen_random_uuid()))',s,count=1,flags=re.I);assert n==1
# Inside the existing adjustment engine, M3 binds the verified master ID instead of name upsert.
s,n=re.subn(r"(if v_mode = 'IN'\s+and v_supplier_name is not null then)","IF incoming_m3.active_batch(v_org_id,p_store_id) THEN\n v_supplier_id:=incoming_m3.current_supplier(v_org_id,p_store_id);\n IF v_supplier_id IS NOT NULL THEN\n  SELECT name INTO v_supplier_name FROM public.suppliers WHERE id=v_supplier_id AND organization_id=v_org_id AND is_active IS TRUE;\n  IF v_supplier_name IS NULL THEN RAISE EXCEPTION 'SUPPLIER_REQUIRED';END IF;\n END IF;\nELSIF v_mode='IN' AND v_supplier_name IS NOT NULL THEN",s,count=1,flags=re.I);assert n==1
sql+='\n'+s.rstrip().rstrip(';')+';\n'
s=(E/'receive_inbound_stock_partial_v1.m2.private.sql').read_text(encoding='utf-8')
s,n=re.subn(r'(if v_supplier_id is null then)',r"PERFORM pg_advisory_xact_lock(hashtextextended('incoming-store:'||v_store_id::text,0));\n \1",s,count=1,flags=re.I);assert n==1
sql+='\n'+s.rstrip().rstrip(';')+';\n'
for name in ['create_stock_movement_notification','create_notification_from_stock_movement']:
 s=(E/(name+'.m2.private.sql')).read_text(encoding='utf-8');s,n=re.subn(r'\bbegin\b',"BEGIN\n IF incoming_m3.active_batch(NEW.organization_id,NEW.store_id) THEN RETURN NEW; END IF;",s,count=1,flags=re.I);assert n==1;sql+=s.rstrip().rstrip(';')+';\n'
sql+="ALTER FUNCTION public.adjust_stock(uuid,uuid,numeric,text,text,date,text,text,integer,text) SET search_path=pg_catalog,public,pg_temp;\nALTER FUNCTION public.create_stock_movement_notification() SET search_path=pg_catalog,public,pg_temp;\nALTER FUNCTION public.create_notification_from_stock_movement() SET search_path=pg_catalog,public,pg_temp;\nNOTIFY pgrst,'reload schema';\nCOMMIT;\n";(E/'2026102102-incoming-m3.DRAFT.sql').write_text(sql,encoding='utf-8');print('M3 draft: direct canonical stock adjustment for non-credit receipts; original purchase receiving preserved except shared store lock')
