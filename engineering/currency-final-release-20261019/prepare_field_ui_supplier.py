"""Add synthetic original invoices/receipts to the isolated UI fixture only."""
from pathlib import Path
import sys,json,uuid
sys.dont_write_bytecode=True;sys.path.insert(0,str(Path(__file__).resolve().parent))
import field_ui_runtime as f
saved=json.loads((f.E/'FIELD-UI-RUNTIME.private.json').read_text());f.db.E=f.N/saved['runtimeId'];f.db.CLUSTER=f.db.E/'cluster'
assert f.db.E.resolve().parent==f.N.resolve()
f.db.PORT=int((f.db.CLUSTER/'postmaster.pid').read_text().splitlines()[3]);assert Path(f.db.sql("SELECT current_setting('data_directory')")[1]).resolve()==f.db.CLUSTER.resolve()
out=f.E/'FIELD-UI-SUPPLIERS.private.json';assert not out.exists(),'ALREADY_PREPARED_DO_NOT_REPEAT'
scenarios=[]
for s in saved['scenarios']:
 code,org,store=s['currency'],s['organizationId'],s['storeId'];value='12' if code in ['JPY','UGX'] else '12.345' if code=='KWD' else '12.34'
 supplier,order,item,request=[str(uuid.uuid4()) for _ in range(4)]
 cmd='BEGIN;SET request.jwt.claims='+f.q(json.dumps({'sub':f.actor}))+';'
 cmd+='UPDATE backend_core.native_financial_rollout SET enabled=true WHERE organization_id='+f.q(org)+';'
 cmd+='GRANT EXECUTE ON FUNCTION public.post_bound_financial_v1(uuid,uuid,text,integer,text,jsonb,jsonb,uuid,jsonb) TO coordinated_client;'
 cmd+='INSERT INTO public.suppliers(id,organization_id,name) VALUES('+f.q(supplier)+','+f.q(org)+",'LOCAL UI SYNTHETIC SUPPLIER');"
 cmd+='INSERT INTO public.inbound_stock_orders(id,organization_id,store_id,supplier_id,supplier_name,order_code,currency,total_goods_value,total_balance_amount,created_by) VALUES('+','.join(f.q(x) for x in [order,org,store,supplier,'LOCAL UI SYNTHETIC SUPPLIER','UI-'+order[:8],code])+','+value+','+value+','+f.q(f.actor)+');'
 cmd+='INSERT INTO public.inbound_stock_items(id,inbound_order_id,organization_id,product_name,sku,qty_ordered,unit_cost,proposed_sell_price,total_cost) VALUES('+','.join(f.q(x) for x in [item,order,org,'LOCAL UI SYNTHETIC GOODS '+item,'UI-'+item])+',1,'+value+',20,'+value+');'
 receipt='SELECT public.post_bound_financial_v1('+','.join([f.q(store),f.q(request),f.q(code),'1',f.q('RECEIPT'),f.q(json.dumps({'order_id':order,'receipts':[{'item_id':item,'qty':'1'}]}))+'::jsonb',"'{}'::jsonb",'NULL',f.q(json.dumps({'source':'OWNER_CONFIRMED','reference':'LOCAL_UI_SYNTHETIC_VERIFIED_RECEIPT'}))+'::jsonb'])+');'
 cmd+=f.auth+receipt+receipt+'COMMIT;';f.db.sql(cmd)
 assert f.db.sql('SELECT count(*) FROM backend_core.receipt_cost_snapshots WHERE order_id='+f.q(order))[1]=='1'
 scenarios.append({'currency':code,'storeId':store,'orderId':order,'itemId':item,'amount':value,'receiptRequestId':request})
out.write_text(json.dumps({'runtimeId':saved['runtimeId'],'scenarios':scenarios,'scope':'Synthetic original invoice and canonical receipt setup; receipt replay exactly once. This is not genuine receipt product UI acceptance.'},indent=2));print('Prepared eight synthetic invoice/receipt fixtures in isolated UI database')
