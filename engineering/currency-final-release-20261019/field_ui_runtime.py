"""Isolated synthetic custody fixture for actual component browser acceptance.
No production connection. Existing refund database is never modified here.
"""
from pathlib import Path
import importlib.util,json,uuid,shutil,hashlib,re
E=Path(__file__).resolve().parent;N=E.parent/'native-financial-contracts-20261019'
spec=importlib.util.spec_from_file_location('custody_local',E.parent/'currency-onboarding-20261018/local.py')
db=importlib.util.module_from_spec(spec);spec.loader.exec_module(db)
actor='bb2d6dee-773d-4fa7-8fda-1eb85bbad2cd'
q=lambda s:"'"+str(s).replace("'","''")+"'"
auth='SET ROLE coordinated_client;SET request.jwt.claims='+q(json.dumps({'sub':actor}))+';'
scenarios=[]

def start():
 global scenarios
 receipt=E/'FIELD-UI-RUNTIME.private.json'
 hashes={n:hashlib.sha256((E/n).read_bytes()).hexdigest() for n in ['2026101915-canonical-field-custody.DRAFT.sql','2026101916-original-workflow-readers.DRAFT.sql']}
 if receipt.exists():
  saved=json.loads(receipt.read_text());assert saved['migrationHashes']==hashes,'CUSTODY_FIXTURE_MIGRATION_DRIFT'
  assert re.fullmatch('disposable-field-ui-[0-9a-f-]{36}',saved['runtimeId'])
  db.E=N/saved['runtimeId'];scenarios=saved['scenarios'];fresh=False
 else:
  db.E=N/('disposable-field-ui-'+str(uuid.uuid4()));db.E.mkdir();fresh=True
 db.CLUSTER=db.E/'cluster'
 assert db.E.resolve().parent==N.resolve()
 if fresh:
  source=N/'disposable-native-v2';assert not(source/'postmaster.pid').exists() and not list((source/'pg_tblspc').iterdir())
  assert not any(p.is_symlink() for p in source.rglob('*'));shutil.copytree(source,db.CLUSTER)
 db.PORT=db.start()
 assert Path(db.sql("SELECT current_setting('data_directory')")[1]).resolve()==db.CLUSTER.resolve()
 if fresh:
  for name in hashes:db.sql((E/name).read_text())
  for s in json.loads((N/'NATIVE-RESULTS.json').read_text())['scenarios']:
   org,store,code=s['organizationId'],s['storeId'],s['currency']
   membership=db.sql('SELECT id FROM public.org_memberships WHERE organization_id='+q(org)+' AND user_id='+q(actor)+" AND role='owner' AND is_active LIMIT 1")[1]
   assert membership,'GENUINE_ACTOR_LOCAL_MEMBERSHIP_REQUIRED'
   wallet,account,source=[str(uuid.uuid4()) for _ in range(3)]
   # Dedicated clone only: synthetic preconditions, never historical wallet cutover.
   db.sql('BEGIN;SET request.jwt.claims='+q(json.dumps({'sub':actor}))+';UPDATE public.stores SET store_type=\'FIELD_PROCUREMENT\' WHERE id='+q(store)+';UPDATE backend_core.settlement_rollout SET enabled=true WHERE organization_id='+q(org)+';UPDATE backend_core.native_financial_rollout SET enabled=true WHERE organization_id='+q(org)+';COMMIT;')
   db.sql('GRANT EXECUTE ON FUNCTION public.confirm_settlement_account_v1(uuid,uuid,text,text,numeric,text,text),public.open_bound_field_wallet_v1(uuid,uuid,uuid,uuid,text),public.open_field_cycle_v1(uuid,text,numeric,text) TO coordinated_client;')
   cmd='BEGIN;'+auth+'SELECT public.open_field_cycle_v1('+q(store)+",'LOCAL UI SYNTHETIC CYCLE',1000,'LOCAL ONLY');"
   for ac,opening in [(account,'0'),(source,'1000')]:
    cmd+='SELECT public.confirm_settlement_account_v1('+','.join([q(ac),q(store),q('CASH'),q(code),opening,q('LOCAL-UI-'+ac),q('LOCAL_SYNTHETIC_ACCOUNT_AUTHORITY')])+');'
   cmd+='SELECT public.open_bound_field_wallet_v1('+q(wallet)+','+q(store)+','+q(membership)+','+q(account)+",'LOCAL_ZERO_HISTORY_UI_FIXTURE');COMMIT;"
   db.sql(cmd);scenarios.append({'organizationId':org,'storeId':store,'currency':code,'walletId':wallet,'sourceAccountId':source})
  receipt.write_text(json.dumps({'runtimeId':db.E.name,'migrationHashes':hashes,'scenarios':scenarios,'scope':'Disposable synthetic fixture setup; no UI posting acceptance implied'},indent=2))
 for s in scenarios:
  db.sql('UPDATE backend_core.settlement_rollout SET enabled=true WHERE organization_id='+q(s['organizationId']))
  db.sql('UPDATE backend_core.native_financial_rollout SET enabled=true WHERE organization_id='+q(s['organizationId']))
 if (E/'FIELD-UI-SUPPLIERS.private.json').exists():
  invoices=json.loads((E/'FIELD-UI-SUPPLIERS.private.json').read_text())
  assert invoices['runtimeId']==db.E.name
  for s in scenarios:s.update(next(i for i in invoices['scenarios'] if i['storeId']==s['storeId']))
 db.sql('GRANT EXECUTE ON FUNCTION public.get_bound_field_custody_v1(uuid),public.post_bound_field_custody_v1(uuid,uuid,uuid,uuid,text,jsonb,uuid,jsonb) TO coordinated_client')
 return scenarios

def handle(name,a):
 s=next(s for s in scenarios if s['storeId']==a['p_store_id'])
 if name=='get_bound_field_custody_v1':
  assert set(a)=={'p_store_id'};sql='SELECT public.get_bound_field_custody_v1('+q(s['storeId'])+')'
 elif name=='post_bound_field_custody_v1':
  assert set(a)=={'p_store_id','p_request_id','p_wallet_id','p_source_account_id','p_operation','p_payload','p_shift_id','p_evidence'}
  assert a['p_wallet_id']==s['walletId'] and a['p_shift_id'] is None
  op=a['p_operation'];assert op in ['FUND','RETURN','EXPENSE','SUPPLIER']
  assert a['p_source_account_id']==(None if op in ['EXPENSE','SUPPLIER'] else s['sourceAccountId'])
  payload=a['p_payload'];assert set(payload)==({'amount','category','expense_date','note'} if op=='EXPENSE' else {'amount','order_id','method','reference','note'} if op=='SUPPLIER' else {'amount'})
  if op=='SUPPLIER':assert payload['order_id']==s['orderId'] and payload['method']=='CASH'
  assert re.fullmatch(r'\d{1,18}(\.\d{1,3})?',str(payload['amount']))
  ev=a['p_evidence'];assert set(ev)=={'source','reference'} and ev['source']=='OWNER_CONFIRMED' and 8<=len(ev['reference'])<=256
  request=str(uuid.UUID(a['p_request_id']))
  sql='SELECT public.post_bound_field_custody_v1('+','.join([q(s['storeId']),q(request),q(s['walletId']),'NULL' if op in ['EXPENSE','SUPPLIER'] else q(s['sourceAccountId']),q(op),q(json.dumps(payload))+'::jsonb','NULL',q(json.dumps(ev))+'::jsonb'])+')'
 else:raise ValueError('CUSTODY_RPC_DENIED')
 return json.loads(db.sql(auth+sql)[1])

def stop():
 if db.PORT:
  try:db.sql('UPDATE backend_core.settlement_rollout SET enabled=false;UPDATE backend_core.native_financial_rollout SET enabled=false')
  finally:db.tool('pg_ctl',['-D',str(db.CLUSTER),'-m','fast','-w','stop'])
