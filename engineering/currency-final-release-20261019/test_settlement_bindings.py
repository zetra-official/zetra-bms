from pathlib import Path
import sys,json,uuid,hashlib,concurrent.futures,re
from decimal import Decimal as D
sys.dont_write_bytecode=True;sys.path.insert(0,str(Path('engineering/currency-onboarding-20261018').resolve()));import local as l
E=Path(__file__).resolve().parent;N=E.parent/'native-financial-contracts-20261019';l.E=N;l.CLUSTER=N/'disposable-native-v2';q=lambda s:"'"+str(s).replace("'","''")+"'";read=lambda s:l.sql(s)[1];checks=[];scenarios=[]
owner=str(uuid.uuid5(uuid.NAMESPACE_URL,'zetra-normal-proforma-1'))
def ck(n,v):assert v,n;checks.append(n)
def auth(actor=owner):return 'SET ROLE coordinated_client;SET request.jwt.claims='+q(json.dumps({'sub':actor} if actor else {}))+';'
def post(row,op,payload,accounts,request=None,shift=None,evidence=None):return auth()+'SELECT public.post_bound_financial_v1('+','.join([q(row['storeId']),q(request or str(uuid.uuid4())),q(row['currency']),'1',q(op),q(json.dumps(payload))+'::jsonb',q(json.dumps(accounts))+'::jsonb','NULL' if shift is None else q(shift),q(json.dumps(evidence or {'source':'OWNER_CONFIRMED','reference':'LOCAL_SYNTHETIC_MANUAL_CONFIRMATION'}))+'::jsonb'])+')'
try:
 l.PORT=l.start();template=(E/'1910-settlement-bindings.sql').read_text();p=E/'2026101910-private-settlement-bindings.DRAFT.sql'
 if read("SELECT to_regclass('backend_core.settlement_accounts') IS NULL")=='t':
  defs=json.loads(read("SELECT json_agg(json_build_object('identity',oid::regprocedure::text,'md5',md5(replace(pg_get_functiondef(oid),chr(13),'')))) FROM pg_proc WHERE proname IN ('create_native_sale_v1','repay_native_credit_v1','create_native_expense_v1','native_unverified_writer_guard_v1','unverified_supplier_payment_guard_v1')"));guards='DO $$BEGIN '+''.join("IF md5(replace(pg_get_functiondef('"+x['identity']+"'::regprocedure),chr(13),''))<>'"+x['md5']+"' THEN RAISE EXCEPTION 'SETTLEMENT_DEPENDENCY_PREIMAGE_MISMATCH';END IF;" for x in defs)+' END$$;\n';sql=template.replace("SET LOCAL lock_timeout='2s';SET LOCAL statement_timeout='45s';","SET LOCAL lock_timeout='2s';SET LOCAL statement_timeout='45s';\n"+guards);p.write_text(sql,encoding='utf-8');l.sql(sql)
 else:
  # Local correction loop only; final exact SQL is independently installed later.
  for fn in re.findall(r'CREATE FUNCTION.*?AS \$\$.*?\$\$;',template,re.S):l.sql(fn.replace('CREATE FUNCTION','CREATE OR REPLACE FUNCTION',1))
  old=p.read_text();start=old.index('DO $$BEGIN IF md5');end=old.index(' END$$;',start)+len(' END$$;');guards=old[start:end];p.write_text(template.replace("SET LOCAL lock_timeout='2s';SET LOCAL statement_timeout='45s';","SET LOCAL lock_timeout='2s';SET LOCAL statement_timeout='45s';\n"+guards),encoding='utf-8')
 ck('exact extension migration installed locally',read("SELECT to_regclass('backend_core.settlement_bindings') IS NOT NULL")=='t')
 names=['confirm_settlement_account_v1','authorize_settlement_actor_v1','post_bound_financial_v1','read_bound_account_balance_v1','read_bound_shift_reconciliation_v1','original_refund_readiness_v1']
 for name in names:
  ck(name+' no nonowner grants',read("SELECT count(*)=0 FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.proname="+q(name)+' AND a.grantee<>p.proowner')=='t')
  for oid in read('SELECT oid::regprocedure FROM pg_proc WHERE proname='+q(name)).splitlines():l.sql('GRANT EXECUTE ON FUNCTION '+oid+' TO coordinated_client')
 rows=json.loads((N/'NATIVE-RESULTS.json').read_text())['scenarios']
 for row in rows:
  code=row['currency'];org=row['organizationId'];store=row['storeId'];scale=0 if code in ['JPY','UGX'] else 3 if code=='KWD' else 2;price='12' if scale==0 else '12.345' if scale==3 else '12.34';accounts={}
  for kind in ['CASH','BANK','MOBILE']:
   aid=str(uuid.uuid4());accounts[kind]=aid;command=auth()+'SELECT public.confirm_settlement_account_v1('+','.join([q(aid),q(store),q(kind),q(code),'1000',q('SYNTHETIC-'+aid),q('OWNER_LOCAL_TEST_OPENING_CONFIRMATION')])+')';a=json.loads(read(command));ck(code+' '+kind+' Owner opening confirmed',D(a['opening'])==1000);ck(code+' '+kind+' account confirmation retry stable',json.loads(read(command))==a)
  sale={'organization_id':org,'items':[{'product_id':row['productId'],'qty':'1','unit_price':price}],'payment_method':'CASH','paid_amount':price,'is_credit':False};req=str(uuid.uuid4())
  ck(code+' settlement rollout denies before posting',l.sql(post(row,'SALE',sale,accounts,req),False)[0]!=0)
  l.sql('INSERT INTO backend_core.settlement_rollout VALUES('+q(org)+",true,'LOCAL_SYNTHETIC_ONLY') ON CONFLICT(organization_id) DO UPDATE SET enabled=true");l.sql('UPDATE backend_core.native_financial_rollout SET enabled=true WHERE organization_id='+q(org))
  v=json.loads(read(post(row,'SALE',sale,accounts,req)));ck(code+' canonical sale and binding atomic',v['canonicalAccountBinding'] and v['currency']==code)
  ck(code+' replay exactly once',json.loads(read(post(row,'SALE',sale,accounts,req)))==v)
  bad={**accounts,'CASH':accounts['BANK']};counts=read('SELECT json_build_array((SELECT count(*) FROM public.sales),(SELECT count(*) FROM backend_core.settlement_bindings))')
  ck(code+' changed account on retry rejected',l.sql(post(row,'SALE',sale,bad,req),False)[0]!=0)
  ck(code+' account-method mismatch rolls back sale and stock',l.sql(post(row,'SALE',sale,bad),False)[0]!=0 and read('SELECT json_build_array((SELECT count(*) FROM public.sales),(SELECT count(*) FROM backend_core.settlement_bindings))')==counts)
  credit={**sale,'paid_amount':'0','payment_method':'CREDIT','is_credit':True,'customer_name':'SYNTHETIC BOUND '+code};c=json.loads(read(post(row,'SALE',credit,{},str(uuid.uuid4()))));collection={'credit_account_id':c['creditAccountId'],'amount':price,'method':'CASH'};rv=json.loads(read(post(row,'COLLECTION',collection,accounts)));ck(code+' debt collection bound to same account currency',D(rv['balance'])==0)
  expense={'organization_id':org,'amount':'1' if scale==0 else '1.001' if scale==3 else '1.01','category':'OTHER','payment_method':'CASH','note':'LOCAL SYNTHETIC','expense_date':'2026-10-19'};ev=json.loads(read(post(row,'EXPENSE',expense,accounts)));ck(code+' canonical expense binds an outflow',ev['canonicalAccountBinding'])
  balance=json.loads(read(auth()+'SELECT public.read_bound_account_balance_v1('+q(accounts['CASH'])+')'));expected=D('1000')+D(price)*2-D(expense['amount']);ck(code+' exact account conservation',D(balance['balance'])==expected)
  bank={**sale,'payment_method':'BANK'};bv=json.loads(read(post(row,'SALE',bank,accounts)));mobile={**sale,'payment_method':'MOBILE'};mv=json.loads(read(post(row,'SALE',mobile,accounts)));ck(code+' bank/mobile remain Owner-confirmed not fake provider-verified',bv['externalProviderVerified'] is False and mv['externalProviderVerified'] is False)
  rr=json.loads(read(auth()+'SELECT public.original_refund_readiness_v1('+q(v['saleId'])+')'));ck(code+' original tax-less refund remains denied without fabricated zero',rr['postingAllowed'] is False and rr['originalTaxEvidence'] is None)
  scenarios.append({'currency':code,'accountId':accounts['CASH'],'saleId':v['saleId'],'expenseId':ev['expenseId'],'balance':str(expected),'storeId':store,'organizationId':org})
 # Audit and binding records cannot be edited, even by application commands.
 ck('settlement audit immutable',l.sql("UPDATE backend_core.settlement_audit SET event='CHANGED'",False)[0]!=0)
 ck('bindings immutable',l.sql("DELETE FROM backend_core.settlement_bindings",False)[0]!=0)
 ck('no orphan settlement intents',read('SELECT count(*)=0 FROM backend_core.settlement_intents')=='t')
 (E/'SETTLEMENT-BINDING-RESULTS.json').write_text(json.dumps({'status':'PASS','count':len(checks),'checks':checks,'scenarios':scenarios,'migrationSha256':hashlib.sha256(p.read_bytes()).hexdigest(),'auth':'Synthetic local JWT only; no genuine Supabase financial acceptance','productionWrites':False,'fullRefundSupplierCashierCertification':False},indent=2));print('PASS '+str(len(checks)))
finally:
 if l.PORT:
  l.sql("UPDATE backend_core.settlement_rollout SET enabled=false",False);l.sql('UPDATE backend_core.native_financial_rollout SET enabled=false',False)
  l.sql("DO $$DECLARE p record;BEGIN FOR p IN SELECT oid FROM pg_proc WHERE proname IN ('confirm_settlement_account_v1','authorize_settlement_actor_v1','post_bound_financial_v1','read_bound_account_balance_v1','read_bound_shift_reconciliation_v1','original_refund_readiness_v1') LOOP EXECUTE format('REVOKE ALL ON FUNCTION %s FROM coordinated_client',p.oid::regprocedure);END LOOP;END$$",False);l.tool('pg_ctl',['-D',str(l.CLUSTER),'-m','fast','-w','stop'])
