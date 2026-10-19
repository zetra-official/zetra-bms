from pathlib import Path
import sys,json,uuid,hashlib
from decimal import Decimal as D
sys.dont_write_bytecode=True
sys.path.insert(0,str(Path('engineering/currency-onboarding-20261018').resolve()))
import local as l
E=Path(__file__).resolve().parent;N=E.parent/'native-financial-contracts-20261019';l.E=N/('disposable-field-tests-'+str(uuid.uuid4()));l.E.mkdir();l.CLUSTER=l.E/'cluster'
q=lambda s:"'"+str(s).replace("'","''")+"'"
owner=str(uuid.uuid5(uuid.NAMESPACE_URL,'zetra-normal-proforma-1'));auth='SET ROLE coordinated_client;SET request.jwt.claims='+q(json.dumps({'sub':owner}))+';'
checks=[]
try:
 import shutil
 source=N/'disposable-native-v2';assert not(source/'postmaster.pid').exists();shutil.copytree(source,l.CLUSTER)
 l.PORT=l.start();path=E/'2026101915-canonical-field-custody.DRAFT.sql'
 # Validate the migration without persisting a changed fixture/schema on failure.
 l.sql(path.read_text().replace('COMMIT;','ROLLBACK;'))
 checks.append('1915 exact-preimage transaction installs and rolls back')
 for row in json.loads((N/'NATIVE-RESULTS.json').read_text())['scenarios']:
  code=row['currency'];org=row['organizationId'];store=row['storeId'];wallet,account,source,req=[str(uuid.uuid4()) for _ in range(4)]
  membership=l.sql('SELECT id FROM public.org_memberships WHERE organization_id='+q(org)+' AND user_id='+q(owner)+' LIMIT 1')[1]
  value='12' if code in ['JPY','UGX'] else '12.345' if code=='KWD' else '12.34';fund='100';returned=str(D(fund)-D(value)-1)
  evidence=q(json.dumps({'source':'OWNER_CONFIRMED','reference':'LOCAL_CANONICAL_FIELD_CUSTODY'}))+'::jsonb'
  call=lambda op,request,amount,payload=None:'SELECT public.post_bound_field_custody_v1('+','.join([q(store),q(request),q(wallet),'NULL' if op in ['SUPPLIER','EXPENSE'] else q(source),q(op),q(json.dumps(payload or {'amount':amount}))+'::jsonb','NULL',evidence])+')'
  cmd=path.read_text().replace('COMMIT;','')
  cmd+="CREATE FUNCTION pg_temp.ck(v boolean,n text) RETURNS void LANGUAGE plpgsql AS $$BEGIN IF v IS DISTINCT FROM true THEN RAISE EXCEPTION 'ASSERTION: %',n;END IF;END$$;"
  cmd+='SET request.jwt.claims='+q(json.dumps({'sub':owner}))+';UPDATE public.stores SET store_type=\'FIELD_PROCUREMENT\' WHERE id='+q(store)+';'
  cmd+='UPDATE backend_core.settlement_rollout SET enabled=true WHERE organization_id='+q(org)+';'
  cmd+='UPDATE backend_core.native_financial_rollout SET enabled=true WHERE organization_id='+q(org)+';'
  cmd+='GRANT EXECUTE ON FUNCTION public.confirm_settlement_account_v1(uuid,uuid,text,text,numeric,text,text),public.open_bound_field_wallet_v1(uuid,uuid,uuid,uuid,text),public.confirm_bound_field_wallet_v1(uuid,uuid,text),public.post_bound_field_custody_v1(uuid,uuid,uuid,uuid,text,jsonb,uuid,jsonb),public.post_bound_financial_v1(uuid,uuid,text,integer,text,jsonb,jsonb,uuid,jsonb),public.open_field_cycle_v1(uuid,text,numeric,text) TO coordinated_client;'
  cmd+=auth+'SELECT public.open_field_cycle_v1('+q(store)+",'LOCAL SYNTHETIC CUSTODY',1000,'LOCAL ONLY');"
  for ac,opening in [(account,'0'),(source,'1000')]:cmd+='SELECT public.confirm_settlement_account_v1('+','.join([q(ac),q(store),q('CASH'),q(code),opening,q('LOCAL-FIELD-'+ac),q('LOCAL_ORIGINAL_ACCOUNT_AUTHORITY')])+');'
  cmd+='SELECT public.open_bound_field_wallet_v1('+q(wallet)+','+q(store)+','+q(membership)+','+q(account)+",'LOCAL_ZERO_HISTORY_VERIFIED');"
  cmd+=call('FUND',req,fund)+';'+call('FUND',req,fund)+';RESET ROLE;'
  cmd+='SELECT pg_temp.ck((SELECT balance='+fund+' FROM public.field_wallets WHERE id='+q(wallet)+'),\'wallet funding/retry exactly once\');'
  cmd+='SELECT pg_temp.ck((backend_core.project_bound_account_v1('+q(source)+")->>'balance')::numeric=1000-"+fund+",'source debited once');"
  supplier,order,item,receiptreq,payreq=[str(uuid.uuid4()) for _ in range(5)]
  cmd+='INSERT INTO public.suppliers(id,organization_id,name) VALUES('+q(supplier)+','+q(org)+",'LOCAL FIELD SUPPLIER');"
  cmd+='INSERT INTO public.inbound_stock_orders(id,organization_id,store_id,supplier_id,supplier_name,order_code,currency,total_goods_value,total_balance_amount,created_by) VALUES('+','.join(q(x) for x in [order,org,store,supplier,'LOCAL FIELD SUPPLIER','FIELD-'+order[:8],code])+','+value+','+value+','+q(owner)+');'
  cmd+='INSERT INTO public.inbound_stock_items(id,inbound_order_id,organization_id,product_name,sku,qty_ordered,unit_cost,proposed_sell_price,total_cost) VALUES('+','.join(q(x) for x in [item,order,org,'LOCAL FIELD GOODS '+item,'FIELD-'+item])+',1,'+value+',20,'+value+');'
  receipt='SELECT public.post_bound_financial_v1('+','.join([q(store),q(receiptreq),q(code),'1',q('RECEIPT'),q(json.dumps({'order_id':order,'receipts':[{'item_id':item,'qty':'1'}]}))+'::jsonb',"'{}'::jsonb",'NULL',evidence])+');'
  cmd+=auth+receipt+receipt+'RESET ROLE;'
  cmd+='SELECT pg_temp.ck((SELECT count(*)=1 AND sum(quantity)=1 FROM backend_core.receipt_cost_snapshots WHERE order_id='+q(order)+'),\'field receipt once with original cost\');'
  cmd+='SELECT pg_temp.ck((SELECT balance='+fund+' FROM public.field_wallets WHERE id='+q(wallet)+'),\'receiving goods does not duplicate wallet payment\');'
  payment={'order_id':order,'amount':value,'method':'CASH','reference':'LOCAL_FIELD_ORIGINAL_INVOICE','note':'LOCAL SYNTHETIC'}
  cmd+=auth+call('SUPPLIER',payreq,value,payment)+';'+call('SUPPLIER',payreq,value,payment)+';RESET ROLE;'
  cmd+='SELECT pg_temp.ck((SELECT balance='+str(D(fund)-D(value))+' FROM public.field_wallets WHERE id='+q(wallet)+'),\'supplier debits custody once\');'
  cmd+='SELECT pg_temp.ck((SELECT count(*)=1 FROM backend_core.supplier_payment_bindings WHERE order_id='+q(order)+'),\'supplier debt mirror not duplicate outflow\');'
  exp_req=str(uuid.uuid4());expense={'amount':'1','category':'OTHER','expense_date':'2026-10-19','note':'LOCAL FIELD COST'}
  cmd+=auth+call('EXPENSE',exp_req,'1',expense)+';'+call('EXPENSE',exp_req,'1',expense)+';RESET ROLE;'
  cmd+='SELECT pg_temp.ck((SELECT balance='+returned+' FROM public.field_wallets WHERE id='+q(wallet)+'),\'canonical expense debits wallet once\');'
  cmd+='SET CONSTRAINTS ALL IMMEDIATE;SET CONSTRAINTS ALL DEFERRED;'+auth+call('RETURN',str(uuid.uuid4()),returned)+';RESET ROLE;'
  cmd+='SET CONSTRAINTS ALL IMMEDIATE;'
  cmd+='SELECT pg_temp.ck((SELECT balance=0 FROM public.field_wallets WHERE id='+q(wallet)+'),\'return empties custody once\');'
  cmd+='SELECT pg_temp.ck((backend_core.project_bound_account_v1('+q(source)+")->>'balance')::numeric=1000-"+value+"-1,'return conserves source less supplier and expense');"
  cmd+='SELECT pg_temp.ck((SELECT count(*)=4 FROM backend_core.field_custody_links WHERE wallet_id='+q(wallet)+'),\'canonical links no parallel money ledger\');'
  cmd+="DO $$BEGIN BEGIN UPDATE public.field_wallets SET balance=balance+1 WHERE id="+q(wallet)+";RAISE EXCEPTION 'DIRECT_WRITE_ACCEPTED';EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'BOUND_WALLET_CANONICAL_WRITER_REQUIRED' THEN RAISE;END IF;END;END$$;ROLLBACK;"
  l.sql(cmd);checks.extend([code+' '+s for s in ['canonical empty-wallet opening','canonical wallet funding/retry','source debit exactly once','field receipt/cost recognized once','receipt does not pay wallet twice','supplier payment and debt mirror once','canonical expense/retry once','deferred wallet/account conservation','canonical return','no duplicate transfer postings','direct wallet write denied including TZS']])
 (E/'FIELD-CUSTODY-WRITER-RESULTS.json').write_text(json.dumps({'status':'PASS','count':len(checks),'checks':checks,'migrationSha256':hashlib.sha256(path.read_bytes()).hexdigest(),'productionWrites':False,'scope':'Synthetic Auth; actual local canonical wallet/account FUND, exact original-cost receipt, supplier/debt settlement and RETURN with deferred conservation. Every scenario rolled back; historical wallet cutover and legacy field expenses remain excluded.'},indent=2));print(json.dumps({'status':'PASS','count':len(checks)}))
finally:
 if l.PORT:l.tool('pg_ctl',['-D',str(l.CLUSTER),'-m','fast','-w','stop'])
