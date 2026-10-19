"""Read-only verification of actual browser postings in the exact saved local DB."""
from pathlib import Path
from decimal import Decimal as D
import json,sys,hashlib
sys.dont_write_bytecode=True
sys.path.insert(0,str(Path('engineering/currency-onboarding-20261018').resolve()))
import local as l
E=Path(__file__).resolve().parent
server=json.loads((E/'ORIGINAL-WORKFLOW-SERVER.json').read_text())
l.E=E.parent/'native-financial-contracts-20261019'/server['runtimeId'];l.CLUSTER=l.E/'cluster'
assert l.E.resolve().parent==(E.parent/'native-financial-contracts-20261019').resolve()
l.PORT=int((l.CLUSTER/'postmaster.pid').read_text().splitlines()[3])
assert Path(l.sql("SELECT current_setting('data_directory')")[1]).resolve()==l.CLUSTER.resolve()
events=json.loads((E/'ORIGINAL-WORKFLOW-RUNTIME-EVENTS.json').read_text())['events']
codes=['TZS','USD','KES','UGX','EUR','AED','JPY','KWD'];checks=[];rows=[]
q=lambda s:"'"+str(s).replace("'","''")+"'"
for mode in ['RESUMED','MOBILE']:
 for code in codes:
  reference='LOCAL-'+mode+'-'+code+'-ACCEPTANCE'
  matched=[e for e in events if e.get('runtimeId')==server['runtimeId'] and e['rpc']=='refund_original_sale_v1' and e['args']['p_evidence']['reference']==reference]
  assert len(matched)==1 and matched[0]['error'] is None,reference
  e=matched[0];r=e['data'];a=e['args'];slice=r['originalSlice'];rid=q(r['refundId'])
  assert e['auth']=='Real Supabase GET /auth/v1/user' and e['financialTarget']=='DISPOSABLE_LOCAL_POSTGRESQL'
  assert r['currency']==code and D(r['amount'])==D(slice['net'])+D(slice['tax']) and r['quantity']=='1'
  assert r['externalProviderVerified'] is False
  query="""SELECT json_build_object(
   'headers',(SELECT count(*) FROM backend_core.original_refunds WHERE id=RID AND request_id=REQUEST),
   'requests',(SELECT count(*) FROM backend_core.settlement_requests WHERE request_id=REQUEST AND result->>'refundId'=RID::text),
   'paid',(SELECT sum(amount)::text FROM backend_core.original_refund_payments WHERE refund_id=RID),
   'bound',(SELECT bool_and(b.account_id=original.account_id) FROM backend_core.original_refund_payments p JOIN backend_core.settlement_bindings b ON b.source_kind='REFUND' AND b.source_id=p.id JOIN backend_core.settlement_bindings original ON original.source_kind='SALE_PAYMENT' AND original.source_id=p.original_payment_id WHERE p.refund_id=RID),
   'stock',(SELECT count(*) FROM public.stock_movements WHERE id=RID),
   'stockQuantity',(SELECT amount::text FROM public.stock_movements WHERE id=RID),
   'stockCost',(SELECT total_cost::text FROM public.stock_movements WHERE id=RID))""".replace('RID',rid).replace('REQUEST',q(a['p_request_id']))
  db=json.loads(l.sql(query)[1]);assert db['headers']==1 and db['requests']==1 and db['bound'] is True and D(db['paid'])==D(r['amount'])
  assert db['stock']==int(r['sellable'])
  if r['sellable']:assert D(db['stockQuantity'])==1 and D(db['stockCost'])==D(slice['cogs'])
  rows.append({'mode':'default desktop browser; viewport dimensions not recorded' if mode=='RESUMED' else '390x844 browser viewport','currency':code,'refundId':r['refundId'],'amount':r['amount'],'net':slice['net'],'tax':slice['tax'],'sellable':r['sellable'],'verifiedAt':e['at']})
  checks.extend([reference+' real Auth and original-currency net/tax equality',reference+' one header/request/payment allocation with original accounts',reference+' sellable-only stock with original COGS'])
refused=[e for e in events if e.get('runtimeId')==server['runtimeId'] and e['rpc']=='refund_original_sale_v1' and e['error'] and e['args']['p_quantity']=='12']
assert refused and refused[-1]['error']['message']=='REFUND_QUANTITY_EXCEEDS_ORIGINAL'
assert l.sql('SELECT count(*) FROM backend_core.settlement_requests WHERE request_id='+q(refused[-1]['args']['p_request_id']))[1]=='0'
checks.append('saved over-quantity request refused atomically without durable financial request')
result={'status':'PASS','count':len(checks),'checks':checks,'scenarios':rows,'runtimeId':server['runtimeId'],'sourceHashes':server['sourceHashes'],'eventsSha256':hashlib.sha256((E/'ORIGINAL-WORKFLOW-RUNTIME-EVENTS.json').read_bytes()).hexdigest(),'scope':'Genuine upstream Auth; actual product refund component; local transport and synthetic original-tax fixture; desktop plus mobile viewport, not physical Android or deployed navigation','productionFinancialWrites':False,'productionTaxProviderCertified':False,'pdfPrintShareCertified':False}
(E/'BROWSER-REFUND-RECONCILIATION.json').write_text(json.dumps(result,indent=2))
print(json.dumps({'status':'PASS','checks':len(checks),'browserPostings':len(rows)}))
