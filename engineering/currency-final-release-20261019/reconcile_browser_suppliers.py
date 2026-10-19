"""Reconcile supplier UI against original receipt/debt and canonical custody."""
from pathlib import Path
from decimal import Decimal as D
import sys,json,hashlib
sys.dont_write_bytecode=True;sys.path.insert(0,str(Path('engineering/currency-onboarding-20261018').resolve()));import local as db
E=Path(__file__).resolve().parent;N=E.parent/'native-financial-contracts-20261019'
saved=json.loads((E/'FIELD-UI-RUNTIME.private.json').read_text());invoices=json.loads((E/'FIELD-UI-SUPPLIERS.private.json').read_text())
db.E=N/saved['runtimeId'];db.CLUSTER=db.E/'cluster';assert db.E.resolve().parent==N.resolve()
db.PORT=int((db.CLUSTER/'postmaster.pid').read_text().splitlines()[3]);assert Path(db.sql("SELECT current_setting('data_directory')")[1]).resolve()==db.CLUSTER.resolve()
events=json.loads((E/'ORIGINAL-WORKFLOW-RUNTIME-EVENTS.json').read_text())['events'];q=lambda s:"'"+str(s).replace("'","''")+"'";checks=[];rows=[]
for s in saved['scenarios']:
 invoice=next(i for i in invoices['scenarios'] if i['storeId']==s['storeId']);code=s['currency'];amount=D(invoice['amount'])
 for suffix,op in [('SUPPLIER-FUND','FUND'),('SUPPLIER','SUPPLIER')]:
  ref='LOCAL-UI-'+code+'-'+suffix
  matched=[e for e in events if e['rpc']=='post_bound_field_custody_v1' and e['args']['p_evidence']['reference']==ref]
  passed=[e for e in matched if e['error'] is None];assert passed,ref
  ids={e['args']['p_request_id'] for e in matched};txs={e['data']['walletTransactionId'] for e in passed};assert len(ids)==len(txs)==1
  e=passed[-1];r=e['data'];assert e['auth']=='Real Supabase GET /auth/v1/user' and e['financialRuntimeId']==saved['runtimeId'] and r['currency']==code and D(r['amount'])==amount and r['inventoryPosted'] is False
  assert db.sql('SELECT count(*) FROM backend_core.field_custody_links WHERE wallet_transaction_id='+q(r['walletTransactionId'])+' AND request_id='+q(next(iter(ids)))+' AND operation='+q(op))[1]=='1'
  checks.extend([ref+' genuine Auth and exact received-invoice currency/amount',ref+' one request and canonical wallet posting'])
  rows.append({'currency':code,'operation':op,'requestId':next(iter(ids)),'walletTransactionId':r['walletTransactionId'],'amount':r['amount'],'priorRefusals':len(matched)-len(passed)})
 state=json.loads(db.sql("SELECT json_build_object('receipts',(SELECT count(*) FROM backend_core.receipt_cost_snapshots WHERE order_id="+q(invoice['orderId'])+"),'supplierBindings',(SELECT count(*) FROM backend_core.supplier_payment_bindings WHERE order_id="+q(invoice['orderId'])+"),'wallet',(SELECT balance::text FROM public.field_wallets WHERE id="+q(s['walletId'])+"),'account',backend_core.project_bound_account_v1((SELECT account_id FROM backend_core.bound_field_wallets WHERE wallet_id="+q(s['walletId'])+"))->>'balance','source',backend_core.project_bound_account_v1("+q(s['sourceAccountId'])+")->>'balance','links',(SELECT count(*) FROM backend_core.field_custody_links WHERE wallet_id="+q(s['walletId'])+"))")[1])
 assert state['receipts']==state['supplierBindings']==1 and state['links']==5 and D(state['wallet'])==D(state['account'])==0 and D(state['source'])==1000-2*amount
 checks.append(code+' receipt once; supplier/debt binding once; wallet/account zero; source conserves expense and supplier payment')
result={'status':'PASS','count':len(checks),'checks':checks,'scenarios':rows,'financialRuntimeId':saved['runtimeId'],'scope':'Genuine Auth / actual FieldCustodyForm supplier UI; dedicated synthetic original invoices and canonical verified receipt setup. Inventory receiving setup is local SQL, not receiving UI or physical Android acceptance.','productionFinancialWrites':False,'eventsSha256':hashlib.sha256((E/'ORIGINAL-WORKFLOW-RUNTIME-EVENTS.json').read_bytes()).hexdigest()}
(E/'BROWSER-SUPPLIER-RECONCILIATION.json').write_text(json.dumps(result,indent=2));print(json.dumps({'status':'PASS','checks':len(checks),'postings':len(rows)}))
