"""Read-only reconciliation of all saved genuine-Auth UI postings, including native."""
from pathlib import Path
from decimal import Decimal as D
import json,sys,hashlib
sys.dont_write_bytecode=True
sys.path.insert(0,str(Path('engineering/currency-onboarding-20261018').resolve()))
import local as db
E=Path(__file__).resolve().parent;N=E.parent/'native-financial-contracts-20261019'
events=json.loads((E/'ORIGINAL-WORKFLOW-RUNTIME-EVENTS.json').read_text(encoding='utf-8'))['events']
q=lambda value:"'"+str(value).replace("'","''")+"'"
checks=[];postings=[]
def connect(runtime):
 db.E=N/runtime;db.CLUSTER=db.E/'cluster';assert db.E.resolve().parent==N.resolve()
 db.PORT=int((db.CLUSTER/'postmaster.pid').read_text().splitlines()[3])
 assert Path(db.sql("SELECT current_setting('data_directory')")[1]).resolve()==db.CLUSTER.resolve()
def unique(rpc):
 out={}
 for event in events:
  if event['rpc']!=rpc or event['error'] is not None:continue
  assert event['auth']=='Real Supabase GET /auth/v1/user' and event['financialTarget']=='DISPOSABLE_LOCAL_POSTGRESQL'
  rid=event['args']['p_request_id']
  if rid in out:assert out[rid]['data']==event['data'],'IDEMPOTENCY_RESULT_CHANGED'
  out[rid]=event
 return list(out.values())
custody=json.loads((E/'FIELD-UI-RUNTIME.private.json').read_text(encoding='utf-8'));connect(custody['runtimeId'])
funding=unique('post_bound_field_custody_v1')
for scene in custody['scenarios']:
 rows=[e for e in funding if e['args']['p_wallet_id']==scene['walletId']]
 wallet=D(0);source=D(1000)
 for event in rows:
  a=event['args'];r=event['data'];amount=D(r['amount']);op=a['p_operation']
  assert r['currency']==scene['currency'] and r['inventoryPosted'] is False and r['canonicalAccountBinding'] is True
  assert a['p_source_account_id']==(scene['sourceAccountId'] if op in ['FUND','RETURN'] else None)
  if op=='FUND':wallet+=amount;source-=amount
  elif op=='RETURN':wallet-=amount;source+=amount
  else:assert op in ['EXPENSE','SUPPLIER'];wallet-=amount
  assert db.sql('SELECT count(*) FROM backend_core.field_custody_links WHERE wallet_transaction_id='+q(r['walletTransactionId'])+' AND request_id='+q(a['p_request_id']))[1]=='1'
  checks.append(scene['currency']+' '+op+' exact one canonical source link '+a['p_request_id'])
  postings.append({'currency':scene['currency'],'operation':op,'requestId':a['p_request_id'],'amount':str(amount)})
 state=json.loads(db.sql("SELECT json_build_object('wallet',(SELECT balance::text FROM public.field_wallets WHERE id="+q(scene['walletId'])+"),'account',backend_core.project_bound_account_v1((SELECT account_id FROM backend_core.bound_field_wallets WHERE wallet_id="+q(scene['walletId'])+"))->>'balance','source',backend_core.project_bound_account_v1("+q(scene['sourceAccountId'])+")->>'balance','links',(SELECT count(*) FROM backend_core.field_custody_links WHERE wallet_id="+q(scene['walletId'])+"))")[1])
 assert D(state['wallet'])==D(state['account'])==wallet and D(state['source'])==source and state['links']==len(rows)
 checks.append(scene['currency']+' wallet/account/source conservation and no extra financial links')
server=json.loads((E/'ORIGINAL-WORKFLOW-SERVER.json').read_text(encoding='utf-8'));connect(server['runtimeId'])
for event in unique('refund_original_sale_v1'):
 if event.get('financialRuntimeId',event.get('runtimeId'))!=server['runtimeId']:continue
 r=event['data'];a=event['args'];rid=q(r['refundId']);original=r['originalSlice']
 assert D(r['amount'])==D(original['net'])+D(original['tax']) and r['currency']==original['currency']
 state=json.loads(db.sql("SELECT json_build_object('headers',(SELECT count(*) FROM backend_core.original_refunds WHERE id="+rid+" AND request_id="+q(a['p_request_id'])+"),'payments',(SELECT sum(amount)::text FROM backend_core.original_refund_payments WHERE refund_id="+rid+"),'stock',(SELECT count(*) FROM public.stock_movements WHERE id="+rid+"),'bound',(SELECT bool_and(b.account_id=o.account_id) FROM backend_core.original_refund_payments p JOIN backend_core.settlement_bindings b ON b.source_kind='REFUND' AND b.source_id=p.id JOIN backend_core.settlement_bindings o ON o.source_kind='SALE_PAYMENT' AND o.source_id=p.original_payment_id WHERE p.refund_id="+rid+"))")[1])
 assert state['headers']==1 and D(state['payments'])==D(r['amount']) and state['stock']==int(r['sellable']) and state['bound'] is True,(r['refundId'],state)
 checks.append(r['currency']+' original tax/payment/account and sellable inventory reversal '+a['p_request_id'])
 postings.append({'currency':r['currency'],'operation':'ORIGINAL_REFUND','requestId':a['p_request_id'],'refundId':r['refundId'],'amount':r['amount']})
result={'status':'PASS','count':len(checks),'checks':checks,'postings':postings,'scope':'Read-only reconciliation of all genuine-Auth component UI events in saved disposable databases; UI/device provenance recorded separately','eventsSha256':hashlib.sha256((E/'ORIGINAL-WORKFLOW-RUNTIME-EVENTS.json').read_bytes()).hexdigest(),'productionFinancialWrites':False}
(E/'CURRENT-ACCEPTANCE-RECONCILIATION.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
print(json.dumps({'status':'PASS','checks':len(checks),'postings':len(postings)}))
