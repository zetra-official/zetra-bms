from pathlib import Path
import sys,json,socket,uuid,hashlib,concurrent.futures
sys.dont_write_bytecode=True;sys.path.insert(0,str(Path(__file__).parent));import test_local as t
E=t.BASE/'main-project-release/proforma-normal';O=t.ROOT/'engineering/release/proforma-currency-final';O.mkdir(exist_ok=True)
cluster=max((p for p in E.glob('clone-*') if p.is_dir() and not (p/'postmaster.pid').exists()),key=lambda p:p.stat().st_ctime)
with socket.socket() as s:s.bind(('127.0.0.1',0));t.PORT=s.getsockname()[1]
q=t.lit;I=lambda n:str(uuid.uuid5(uuid.NAMESPACE_URL,'zetra-normal-proforma-'+str(n)));actor=I(1);org=I(100);store=I(200);checks=[];started=False
read=t.read
check=lambda n,ok: checks.append(n) if ok else (_ for _ in ()).throw(AssertionError(n))
def reject(sql,who,code):
 r=t.sql(sql,who,False);check(code,r.returncode!=0 and code in r.stderr)
def call(name,args,who=actor):return json.loads(read('SELECT public.'+name+'('+','.join(args)+')',who))
report={'status':'FAIL','remoteConnections':0}
try:
 r=t.pg.tool('pg_ctl',['-D',str(cluster),'-l',str(cluster.with_suffix('.fx.log')),'-o',f'-h 127.0.0.1 -p {t.PORT} -c archive_mode=off -c shared_preload_libraries=','-w','start']);assert r.returncode==0,r.stderr;started=True
 path=t.ROOT/'supabase/backend-review/20261017/2026101705-proforma-fx.CANDIDATE.sql';raw=path.read_bytes();sql=raw.decode();report['sha256']=hashlib.sha256(raw).hexdigest()
 assert read("SELECT to_regprocedure('public.proforma_document_fx_v1(uuid,uuid,uuid,uuid,integer,jsonb)') IS NULL")=='t','NO_AUTOMATIC_RETRY'
 r=t.sql(sql.rsplit('COMMIT;',1)[0]+"DO $$BEGIN RAISE EXCEPTION 'INJECTED';END$$;COMMIT;",ok=False);check('migrationRollback',r.returncode!=0 and read("SELECT to_regprocedure('public.proforma_document_fx_v1(uuid,uuid,uuid,uuid,integer,jsonb)') IS NULL")=='t');t.sql(sql)
 before=t.financial();scope=[q(org),q(store)];ctx=call('proforma_document_context_v1',scope);p=ctx['products'][0];doc=str(uuid.uuid4());body={'currency':ctx['currency'],'validDate':ctx['validDate'],'items':[{'productId':p['productId'],'quantity':'2','unitPrice':p['unitPrice']}],'discountType':'fixed','discountValue':'0','customer':{'name':'Synthetic FX only'},'notes':''};saved=call('proforma_document_save_v1',scope+[q(str(uuid.uuid4())),q(doc),'NULL',"'SAVE'",q(json.dumps(body))+'::jsonb']);rev=saved['revision']['revision']
 fx={'currency':'TZS','rate':'2500.125','source':'Owner synthetic bank quote reference','acknowledged':True};req=str(uuid.uuid4())
 def command(payload=fx,who=actor,request=req,expected=rev):return 'SELECT public.proforma_document_fx_v1('+','.join(scope+[q(request),q(doc),str(expected),q(json.dumps(payload))+'::jsonb'])+')'
 reject(command(),I(2),'OWNER_REQUIRED');reject(command(),I(3),'OWNER_REQUIRED');reject(command(),I(6),'FORBIDDEN');reject(command({**fx,'acknowledged':False}),'%s'%actor,'INVALID_FX');reject(command({**fx,'rate':'0'}),actor,'INVALID_FX');reject(command({**fx,'rate':'NaN'}),actor,'INVALID_FX')
 with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:values=list(pool.map(lambda _:json.loads(read(command(),actor)),range(2)))
 check('concurrentSameRequestOneRevision',values[0]==values[1]);result=values[0];f=result['revision']['invoiceFx'];check('exactManualAmount',f['convertedTotal']=='50002.50' and f['from']=='USD' and f['to']=='TZS' and f['mode']=='OWNER_CONFIRMED_MANUAL');check('baseAmountsUnchanged',all(result['revision'][k]==saved['revision'][k] for k in ['currency','total','subtotal','discount','tax','items']));check('reopenPersistence',call('proforma_document_get_v1',scope+[q(doc)])['revision']['invoiceFx']==f)
 reject(command({**fx,'rate':'2'}),actor,'IDEMPOTENCY_CONFLICT');reject(command(request=str(uuid.uuid4())),actor,'DRAFT_REVISION_CONFLICT')
 updated=call('proforma_document_save_v1',scope+[q(str(uuid.uuid4())),q(doc),str(result['revision']['revision']),"'SAVE'",q(json.dumps(body))+'::jsonb']);check('editInvalidatesOldFx','invoiceFx' not in updated['revision']);check('accountingUnitUnchanged',call('get_org_accounting_currency_v1',[q(org)])['currency']=='USD');check('financialFingerprintUnchanged',before==t.financial());check('anonDenied',read("SELECT has_function_privilege('anon','public.proforma_document_fx_v1(uuid,uuid,uuid,uuid,integer,jsonb)','EXECUTE')")=='f');check('serviceRoleDenied',read("SELECT has_function_privilege('service_role','public.proforma_document_fx_v1(uuid,uuid,uuid,uuid,integer,jsonb)','EXECUTE')")=='f')
 report.update(status='PASS',checks=checks,fixture=result)
finally:
 if started:t.pg.tool('pg_ctl',['-D',str(cluster),'-m','fast','-w','stop'])
 report['stopped']=not(cluster/'postmaster.pid').exists();(O/'postgres-result.json').write_text(json.dumps(report,indent=2));print(json.dumps({k:v for k,v in report.items() if k!='fixture'}))
