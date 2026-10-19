"""Private loopback worker. Whitelisted synthetic fixture operations only.
The HTTP caller must validate real Supabase Auth before sending each request.
No Supabase database credentials, URLs or network calls are used here.
"""
from pathlib import Path
import sys,json,uuid,shutil,re
import field_ui_runtime as field_ui
sys.dont_write_bytecode=True;sys.path.insert(0,str(Path('engineering/currency-onboarding-20261018').resolve()));import local as l
E=Path(__file__).resolve().parent;N=E.parent/'native-financial-contracts-20261019'
actor='bb2d6dee-773d-4fa7-8fda-1eb85bbad2cd'
q=lambda s:"'"+str(s).replace("'","''")+"'"
auth='SET ROLE coordinated_client;SET request.jwt.claims='+q(json.dumps({'sub':actor}))+';'
def emit(v):print(json.dumps(v),flush=True)
resume_id=sys.argv[2] if len(sys.argv)==3 and sys.argv[1]=='--resume' else None
if resume_id:
 assert re.fullmatch(r'disposable-original-product-[0-9a-f-]{36}',resume_id)
 l.E=N/resume_id;assert l.E.resolve().parent==N.resolve() and l.E.is_dir()
else:
 l.E=N/('disposable-original-product-'+str(uuid.uuid4()));l.E.mkdir()
l.CLUSTER=l.E/'cluster'
source=N/'disposable-native-v2'
try:
 if not resume_id:
  assert not (source/'postmaster.pid').exists() and not list((source/'pg_tblspc').iterdir())
  assert not any(p.is_symlink() for p in source.rglob('*'))
  shutil.copytree(source,l.CLUSTER)
 else:
  assert (l.CLUSTER/'PG_VERSION').read_text().strip()=='17'
  assert not(l.CLUSTER/'postmaster.pid').exists() and not list((l.CLUSTER/'pg_tblspc').iterdir())
 l.PORT=l.start()
 assert Path(l.sql("SELECT current_setting('data_directory')")[1]).resolve()==l.CLUSTER.resolve()
 if not resume_id:
  l.sql((E/'2026101915-canonical-field-custody.DRAFT.sql').read_text())
  l.sql((E/'2026101916-original-workflow-readers.DRAFT.sql').read_text())
 else:
  verified=[]
  for name in ['2026101915-canonical-field-custody.DRAFT.sql','2026101916-original-workflow-readers.DRAFT.sql']:
   sql=(E/name).read_text()
   for fn in re.finditer(r'CREATE(?: OR REPLACE)? FUNCTION\s+([\w.]+)\s*\(.*?\bAS\s+(\$[A-Za-z_]*\$)(.*?)\2\s*;',sql,re.S):
    schema,proc=fn[1].split('.')
    bodies=json.loads(l.sql("SELECT coalesce(json_agg(prosrc),'[]') FROM pg_proc WHERE pronamespace="+q(schema)+"::regnamespace AND proname="+q(proc))[1])
    assert len(bodies)==1 and bodies[0].replace('\r','')==fn[3].replace('\r',''),'SAVED_RUNTIME_SOURCE_DRIFT: '+fn[1]
    verified.append(fn[1])
  (E/('SAVED-RUNTIME-RESUME-'+str(uuid.uuid4())+'.json')).write_text(json.dumps({'status':'PASS','runtimeId':resume_id,'verifiedFunctionBodies':verified,'migrationsRepeated':False,'productionWrites':False},indent=2))
 for sig in ['public.get_bound_financial_result_v1(uuid,uuid)','public.get_original_refund_sale_v1(uuid,uuid)','public.refund_original_sale_v1(uuid,uuid,uuid,uuid,numeric,boolean,uuid,jsonb)']:
  l.sql('GRANT EXECUTE ON FUNCTION '+sig+' TO coordinated_client')
 scenarios=[]
 for s in json.loads((E/'ORIGINAL-REFUND-EVIDENCE-RESULTS.json').read_text())['scenarios']:
  meta=json.loads(l.sql("SELECT json_build_object('organizationId',s.organization_id,'storeId',s.store_id,'saleId',s.id,'lineId',i.id,'currency',s.currency_context->>'currency') FROM public.sales s JOIN public.sale_items i ON i.sale_id=s.id WHERE s.id="+q(s['saleId']))[1])
  assert l.sql('SELECT EXISTS(SELECT 1 FROM public.org_memberships WHERE user_id='+q(actor)+' AND organization_id='+q(meta['organizationId'])+" AND role='owner' AND is_active)")[1]=='t'
  l.sql('UPDATE backend_core.settlement_rollout SET enabled=true WHERE organization_id='+q(meta['organizationId']))
  scenarios.append(meta)
 custody=field_ui.start()
 emit({'ready':True,'runtimeId':l.E.name,'scenarios':scenarios,'custodyScenarios':custody,'custodyRuntimeId':field_ui.db.E.name,'scope':'Actual source UI / genuine upstream Auth / disposable synthetic financial database'})
 for raw in sys.stdin:
  m={}
  try:
   m=json.loads(raw);assert m['actor']==actor
   name=m['name'];a=m['args']
   if name in ['get_bound_field_custody_v1','post_bound_field_custody_v1']:
    data=field_ui.handle(name,a);emit({'id':m['id'],'data':data,'error':None});continue
   if name=='get_bound_financial_result_v1':
    assert set(a)=={'p_store_id','p_request_id'}
    s=next(x for x in scenarios if x['storeId']==a['p_store_id']);request=str(uuid.UUID(a['p_request_id']))
    data=json.loads(l.sql(auth+'SELECT coalesce(public.get_bound_financial_result_v1('+q(s['storeId'])+','+q(request)+"),'null'::jsonb)")[1])
    assert data is None or (data.get('saleId')==s['saleId'] and data.get('refundId'))
    emit({'id':m['id'],'data':data,'error':None});continue
   s=next(x for x in scenarios if x['storeId']==a['p_store_id'] and x['saleId']==a['p_sale_id'])
   if name=='get_original_refund_sale_v1':
    assert set(a)=={'p_store_id','p_sale_id'}
    sql='SELECT public.get_original_refund_sale_v1('+q(s['storeId'])+','+q(s['saleId'])+')'
   elif name=='refund_original_sale_v1':
    assert set(a)=={'p_store_id','p_request_id','p_sale_id','p_line_id','p_quantity','p_sellable','p_shift_id','p_evidence'}
    assert a['p_line_id']==s['lineId'] and a['p_shift_id'] is None and type(a['p_sellable']) is bool
    request=str(uuid.UUID(a['p_request_id']));quantity=str(a['p_quantity']);assert re.fullmatch(r'\d{1,18}(\.\d{1,3})?',quantity)
    ev=a['p_evidence'];assert set(ev)=={'source','reference'} and ev['source']=='OWNER_CONFIRMED' and 8<=len(ev['reference'])<=256
    sql='SELECT public.refund_original_sale_v1('+','.join([q(s['storeId']),q(request),q(s['saleId']),q(s['lineId']),quantity,str(a['p_sellable']).lower(),'NULL',q(json.dumps(ev))+'::jsonb'])+')'
   else:raise ValueError('RPC_NOT_ALLOWED')
   data=json.loads(l.sql(auth+sql)[1]);emit({'id':m['id'],'data':data,'error':None})
  except Exception as ex:
   detail=str(ex)
   reason=next((code for code in ['REFUND_QUANTITY_EXCEEDS_ORIGINAL','COMPLETE_ORIGINAL_PAID_ALLOCATION_REQUIRED','VERIFIED_ORIGINAL_EVIDENCE_REQUIRED','BOUND_REQUEST_CONFLICT','VERIFIED_ACCOUNT_FUNDS_INSUFFICIENT','WALLET_FUNDS_INSUFFICIENT','OPEN_FIELD_CYCLE_REQUIRED','ORIGINAL_CUSTODY_CURRENCY_REQUIRED'] if code in detail),'LOCAL_WORKFLOW_REQUEST_DENIED')
   emit({'id':m.get('id') if isinstance(m,dict) else None,'data':None,'error':{'message':reason,'code':'P0001' if reason!='LOCAL_WORKFLOW_REQUEST_DENIED' else 'LOCAL_DENIED'}})
finally:
 field_ui.stop()
 if l.PORT:
  l.sql('UPDATE backend_core.settlement_rollout SET enabled=false',False)
  l.tool('pg_ctl',['-D',str(l.CLUSTER),'-m','fast','-w','stop'])
