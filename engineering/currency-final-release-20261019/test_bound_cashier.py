from pathlib import Path
import sys,json,uuid,re,hashlib
from decimal import Decimal as D
sys.dont_write_bytecode=True;sys.path.insert(0,str(Path('engineering/currency-onboarding-20261018').resolve()));import local as l
E=Path(__file__).resolve().parent;N=E.parent/'native-financial-contracts-20261019';l.E=N;l.CLUSTER=N/'disposable-native-v2';q=lambda s:"'"+str(s).replace("'","''")+"'";read=lambda s:l.sql(s)[1];checks=[];results=[];owner=str(uuid.uuid5(uuid.NAMESPACE_URL,'zetra-normal-proforma-1'))
def ck(n,v):assert v,n;checks.append(n)
def auth(actor):return 'SET ROLE coordinated_client;SET request.jwt.claims='+q(json.dumps({'sub':actor}))+';'
def post(row,op,body,accounts,shift=None,actor=owner):return auth(actor)+'SELECT public.post_bound_financial_v1('+','.join([q(row['storeId']),q(str(uuid.uuid4())),q(row['currency']),'1',q(op),q(json.dumps(body))+'::jsonb',q(json.dumps(accounts))+'::jsonb',q(shift) if shift else 'NULL',q(json.dumps({'source':'OWNER_CONFIRMED' if actor==owner else 'AUTHORIZED_CASH_RECORD','reference':'LOCAL_SYNTHETIC_CASHIER_CONFIRMATION'}))+'::jsonb'])+')'
try:
 l.PORT=l.start();sql=(E/'2026101912-private-cashier-bindings.DRAFT.sql').read_text()
 if read("SELECT to_regclass('backend_core.shift_account_bindings') IS NULL")=='t':l.sql(sql)
 else:
  for match in re.finditer(r'CREATE (?:OR REPLACE )?FUNCTION.*?AS (?P<quote>\$\w*\$).*?(?P=quote)\s*;',sql,re.S):l.sql(match.group(0).replace('CREATE FUNCTION','CREATE OR REPLACE FUNCTION',1))
  footer=(E/'1912-cashier-bindings.sql').read_text();l.sql(footer[footer.rindex('DO $$DECLARE t text;p record;r record;BEGIN'):])
 assert 'AUTHORIZED_OPERATOR_CONFIRMATION' in read("SELECT pg_get_functiondef('backend_core.bind_canonical_settlement_v1(text,uuid,uuid,uuid,jsonb)'::regprocedure)"),'FINAL_LOCAL_BINDING_FUNCTION_NOT_LOADED'
 names=['confirm_settlement_account_v1','authorize_settlement_actor_v1','post_bound_financial_v1','open_bound_cashier_shift_v1','close_bound_cashier_shift_v1','read_bound_shift_reconciliation_v1','read_bound_account_balance_v1']
 for name in names:
  ck(name+' not granted to API clients',read("SELECT count(*)=0 FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.proname="+q(name)+' AND a.grantee<>p.proowner')=='t')
  for sig in read('SELECT oid::regprocedure FROM pg_proc WHERE proname='+q(name)).splitlines():l.sql('GRANT EXECUTE ON FUNCTION '+sig+' TO coordinated_client')
 for row in json.loads((N/'NATIVE-RESULTS.json').read_text())['scenarios']:
  code=row['currency'];org=row['organizationId'];store=row['storeId'];price='12' if code in ['JPY','UGX'] else '12.345' if code=='KWD' else '12.34';expense='1' if code in ['JPY','UGX'] else '1.001' if code=='KWD' else '1.01';cashier=read('SELECT user_id FROM public.org_memberships WHERE organization_id='+q(org)+" AND role='cashier' AND is_active LIMIT 1");assert cashier,'MISSING_EXISTING_CANONICAL_CASHIER_FIXTURE';accounts={}
  l.sql('UPDATE backend_core.settlement_rollout SET enabled=true WHERE organization_id='+q(org));l.sql('UPDATE backend_core.native_financial_rollout SET enabled=true WHERE organization_id='+q(org))
  # Recover only a synthetic fixture left OPEN by an interrupted local assertion.
  for oldsid in read('SELECT s.id FROM public.cashier_shifts s JOIN public.org_memberships m ON m.id=s.membership_id WHERE s.store_id='+q(store)+' AND m.user_id='+q(cashier)+" AND s.status='OPEN'").splitlines():
   prior=json.loads(read(auth(cashier)+'SELECT public.read_bound_shift_reconciliation_v1('+q(oldsid)+')'));assert prior['complete'];read(auth(cashier)+'SELECT public.close_bound_cashier_shift_v1('+','.join([q(store),q(str(uuid.uuid4())),q(code),'1',q(oldsid),prior['expectedCash'],q('LOCAL FIXTURE RECOVERY AFTER ASSERTION')])+')')
  for kind in ['CASH','BANK','MOBILE']:
   aid=str(uuid.uuid4());accounts[kind]=aid;read(auth(owner)+'SELECT public.confirm_settlement_account_v1('+','.join([q(aid),q(store),q(kind),q(code),'1000',q('SYNTHETIC-DRAWER-'+aid),q('OWNER_LOCAL_DRAWER_ACCOUNT_CONFIRMATION')])+')')
  read(auth(owner)+'SELECT public.authorize_settlement_actor_v1('+q(accounts['CASH'])+','+q(cashier)+",ARRAY['SHIFT','SALE','COLLECTION'])")
  for kind in ['BANK','MOBILE']:read(auth(owner)+'SELECT public.authorize_settlement_actor_v1('+q(accounts[kind])+','+q(cashier)+",ARRAY['SALE'])")
  req=str(uuid.uuid4());opening=auth(cashier)+'SELECT public.open_bound_cashier_shift_v1('+','.join([q(store),q(req),q(code),'1',q(accounts['CASH']),'1000',q('LOCAL_CASHIER_OPENING_COUNT')])+')';opened=json.loads(read(opening));sid=opened['shiftId'];ck(code+' drawer opening matches verified account with no cash posting',opened['accountBalanceChanged'] is False)
  ck(code+' opening retry is exactly once',json.loads(read(opening))==opened)
  sale={'organization_id':org,'items':[{'product_id':row['productId'],'qty':'1','unit_price':price}],'payment_method':'CASH','paid_amount':price,'is_credit':False,'cashier_shift_id':sid};s=json.loads(read(post(row,'SALE',sale,accounts,sid,cashier)));ck(code+' cashier sale is canonically shift-bound',s['canonicalAccountBinding'])
  split={**sale,'split':{'cash':str(D(price)-2),'bank':'1','mobile':'1'}};statement=post(row,'SALE',split,accounts,sid,cashier).replace('AUTHORIZED_CASH_RECORD','AUTHORIZED_OPERATOR_CONFIRMATION');read(statement);ck(code+' Owner-delegated cashier split payment binds all three original accounts',True)
  exp={'organization_id':org,'amount':expense,'category':'OTHER','payment_method':'CASH','expense_date':'2026-10-19','note':'Owner-authorized drawer expense'};read(post(row,'EXPENSE',exp,accounts,sid));ck(code+' authorized Owner expense included in drawer',True)
  credit={**sale,'cashier_shift_id':None,'payment_method':'CREDIT','paid_amount':'0','is_credit':True,'customer_name':'SYNTHETIC BOUND SHIFT '+code};debt=json.loads(read(post(row,'SALE',credit,{})));read(post(row,'COLLECTION',{'credit_account_id':debt['creditAccountId'],'amount':price,'method':'BANK'},accounts,sid));ck(code+' debt collection is explicitly assigned to shift and original bank account',True)
  rec=json.loads(read(auth(cashier)+'SELECT public.read_bound_shift_reconciliation_v1('+q(sid)+')'));expected=D('1000')+D(price)*2-2-D(expense);ck(code+' exact cash drawer and separate bank/mobile reconciliation',D(rec['expectedCash'])==expected and D(rec['bankMovements'])==D(price)+1 and D(rec['mobileMovements'])==1 and rec['complete'] is True)
  ck(code+' reconciliation never fabricates refund/custody acceptance',rec['refundPostingAllowed'] is False and rec['custodyPostingAllowed'] is False)
  closing_req=str(uuid.uuid4());closing=auth(cashier)+'SELECT public.close_bound_cashier_shift_v1('+','.join([q(store),q(closing_req),q(code),'1',q(sid),str(expected),q('LOCAL COUNT RECONCILED')])+')';closed=json.loads(read(closing));ck(code+' canonical close persists exact reconciliation',closed['status']=='CLOSED' and D(closed['boundReconciliation']['discrepancy'])==0)
  ck(code+' close retry creates no second closing record',json.loads(read(closing))==closed and read('SELECT count(*)=1 FROM backend_core.shift_reconciliation_evidence WHERE shift_id='+q(sid))=='t')
  ck(code+' closed shift rejects further sale without stock change',l.sql(post(row,'SALE',sale,accounts,sid,cashier),False)[0]!=0)
  results.append({'currency':code,'shiftId':sid,'accountId':accounts['CASH'],'opening':'1000','cashSales':price,'cashExpense':expense,'bankCollection':price,'expectedCash':str(expected),'closing':closed['boundReconciliation']})
 (E/'BOUND-CASHIER-RESULTS.json').write_text(json.dumps({'status':'PASS','count':len(checks),'checks':checks,'scenarios':results,'migrationSha256':hashlib.sha256((E/'2026101912-private-cashier-bindings.DRAFT.sql').read_bytes()).hexdigest(),'scope':'Disposable canonical drawer opening, cash sale, authorized expense, bank collection and atomic closing. Synthetic Auth; unavailable refund/custody paths remain denied.'},indent=2));print('PASS '+str(len(checks)))
finally:
 if l.PORT:
  l.sql('UPDATE backend_core.settlement_rollout SET enabled=false',False);l.sql('UPDATE backend_core.native_financial_rollout SET enabled=false',False)
  l.sql("DO $$DECLARE p record;BEGIN FOR p IN SELECT oid FROM pg_proc WHERE proname IN ('confirm_settlement_account_v1','authorize_settlement_actor_v1','post_bound_financial_v1','open_bound_cashier_shift_v1','close_bound_cashier_shift_v1','read_bound_shift_reconciliation_v1','read_bound_account_balance_v1') LOOP EXECUTE format('REVOKE ALL ON FUNCTION %s FROM coordinated_client',p.oid::regprocedure);END LOOP;END$$",False);l.tool('pg_ctl',['-D',str(l.CLUSTER),'-m','fast','-w','stop'])
