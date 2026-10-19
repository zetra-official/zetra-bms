"""Read-only reconciliation of genuine Auth / actual custody component postings."""
from pathlib import Path
from decimal import Decimal as D
import sys,json,hashlib
sys.dont_write_bytecode=True
sys.path.insert(0,str(Path('engineering/currency-onboarding-20261018').resolve()));import local as db
E=Path(__file__).resolve().parent;N=E.parent/'native-financial-contracts-20261019'
saved=json.loads((E/'FIELD-UI-RUNTIME.private.json').read_text());db.E=N/saved['runtimeId'];db.CLUSTER=db.E/'cluster'
assert db.E.resolve().parent==N.resolve()
db.PORT=int((db.CLUSTER/'postmaster.pid').read_text().splitlines()[3]);assert Path(db.sql("SELECT current_setting('data_directory')")[1]).resolve()==db.CLUSTER.resolve()
events=json.loads((E/'ORIGINAL-WORKFLOW-RUNTIME-EVENTS.json').read_text())['events'];q=lambda s:"'"+str(s).replace("'","''")+"'"
checks=[];rows=[]
for s in saved['scenarios']:
 code=s['currency'];expense=D('12' if code in ['JPY','UGX'] else '12.345' if code=='KWD' else '12.34')
 for op,amount in [('FUND',D(100)),('EXPENSE',expense),('RETURN',100-expense)]:
  ref='LOCAL-UI-'+code+'-'+op
  matched=[e for e in events if e['rpc']=='post_bound_field_custody_v1' and e['args']['p_evidence']['reference']==ref]
  assert matched and all(e['error'] is None for e in matched),ref
  ids={e['args']['p_request_id'] for e in matched};txs={e['data']['walletTransactionId'] for e in matched}
  assert len(ids)==len(txs)==1,ref+' duplicate request or source'
  e=matched[-1];r=e['data'];a=e['args'];tx=q(r['walletTransactionId'])
  assert e['auth']=='Real Supabase GET /auth/v1/user' and r['currency']==code and D(r['amount'])==amount and r['inventoryPosted'] is False and r['canonicalAccountBinding'] is True
  assert a['p_wallet_id']==s['walletId'] and a['p_source_account_id']==(None if op=='EXPENSE' else s['sourceAccountId'])
  count=db.sql('SELECT count(*) FROM backend_core.field_custody_links l JOIN public.field_wallet_transactions t ON t.id=l.wallet_transaction_id WHERE l.wallet_transaction_id='+tx+' AND l.request_id='+q(next(iter(ids)))+' AND l.operation='+q(op))[1]
  assert count=='1'
  if op=='EXPENSE':
   assert db.sql('SELECT count(*) FROM public.expenses e JOIN backend_core.field_custody_links l ON l.expense_id=e.id JOIN backend_core.settlement_bindings b ON b.source_kind=\'EXPENSE\' AND b.source_id=e.id WHERE l.wallet_transaction_id='+tx)[1]=='1'
  checks.extend([ref+' genuine Auth exact amount/currency',ref+' one canonical wallet/source link'])
  rows.append({'currency':code,'operation':op,'amount':str(amount),'walletTransactionId':r['walletTransactionId'],'requestId':next(iter(ids)),'observedResponses':len(matched)})
 state=json.loads(db.sql("SELECT json_build_object('wallet',(SELECT balance::text FROM public.field_wallets WHERE id="+q(s['walletId'])+"),'account',backend_core.project_bound_account_v1((SELECT account_id FROM backend_core.bound_field_wallets WHERE wallet_id="+q(s['walletId'])+"))->>'balance','source',backend_core.project_bound_account_v1("+q(s['sourceAccountId'])+")->>'balance','links',(SELECT count(*) FROM backend_core.field_custody_links WHERE wallet_id="+q(s['walletId'])+"))")[1])
 assert D(state['wallet'])==D(state['account'])==0 and D(state['source'])==1000-expense and state['links']==3
 checks.append(code+' wallet/account zero and original source less exact expense; three links only')
result={'status':'PASS','count':len(checks),'checks':checks,'scenarios':rows,'financialRuntimeId':saved['runtimeId'],'scope':'Genuine upstream Auth, actual FieldCustodyForm, mobile-width browser, disposable synthetic custody FUND/EXPENSE/RETURN. Supplier/receipt lifecycle has separate local SQL evidence; physical Android and full deployed navigation remain unverified.','productionFinancialWrites':False,'eventsSha256':hashlib.sha256((E/'ORIGINAL-WORKFLOW-RUNTIME-EVENTS.json').read_bytes()).hexdigest()}
(E/'BROWSER-CUSTODY-RECONCILIATION.json').write_text(json.dumps(result,indent=2));print(json.dumps({'status':'PASS','checks':len(checks),'postings':len(rows)}))
