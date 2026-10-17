"""One owner-authorized attempt; explicit target, hashes, private receipts, no retry."""
from pathlib import Path
import json,hashlib,subprocess,sys
ROOT=Path(__file__).resolve().parents[2]
CLI=Path(r'C:\Users\ZetraAdmin\AppData\Local\npm-cache\_npx\aa8e5c70f9d8d161\node_modules\@supabase\cli-windows-x64\bin\supabase.exe')
REF='dcmhqdckzhbuakvcyjit';D=ROOT/'supabase/backend-review/20261017'
M=json.loads((D/'GLOBAL-CURRENCY-PROFORMA-APPROVAL.json').read_text())
E=Path(M['evidence'])/'production';E.mkdir(exist_ok=True)
sha=lambda b:hashlib.sha256(b).hexdigest()
def run(name,args):
 r=subprocess.run([str(CLI),*args,'-o','json'],cwd=ROOT,capture_output=True,text=True,encoding='utf-8',timeout=120)
 (E/(name+'.private.json')).write_text(r.stdout,encoding='utf-8');(E/(name+'.stderr.private.log')).write_text(r.stderr,encoding='utf-8')
 if r.returncode:raise RuntimeError(name+'_FAILED_INSPECT_PRIVATE_EVIDENCE_NO_RETRY')
 return json.loads(r.stdout)
def query(name,path):return run(name,['db','query','--linked','--project-ref',REF,'--file',str(path)])
mode=sys.argv[1]
if mode=='execute':
 assert M['project']==REF and M['migrationSha256']=='5e008fef97adc78190ccbb1fb28f44bd8b03d1eda117ef97e7887305c722cb7d'
 for f,h in M['files'].items():assert sha((ROOT/f).read_bytes())==h,'ARTIFACT_MISMATCH:'+f
 assert not (E/'attempt-once.json').exists(),'ATTEMPT_ALREADY_RECORDED_NO_RETRY'
 projects=run('projects',['projects','list']);assert any(p.get('id',p.get('ref'))==REF and p.get('status')=='ACTIVE_HEALTHY' for p in projects),'TARGET_NOT_HEALTHY'
 backups=run('backups',['backups','list','--project-ref',REF])
 # Preserve real availability separately from untested restore capability.
 entries=backups.get('backups',[]) if isinstance(backups,dict) else backups
 assert any(b.get('status')=='COMPLETED' for b in entries),'NO_COMPLETED_BACKUP'
 pre=E/'preflight.sql';pre.write_text("BEGIN READ ONLY; SET LOCAL statement_timeout='15s'; SELECT current_database() db,current_user actor,current_setting('transaction_read_only') ro,EXISTS(SELECT 1 FROM backend_core.release_receipts WHERE version='2026101704') baseline,NOT EXISTS(SELECT 1 FROM backend_core.release_receipts WHERE version='2026101705') absent,to_regprocedure('public.proforma_document_fx_v1(uuid,uuid,uuid,uuid,integer,jsonb)') IS NULL api_absent;ROLLBACK;")
 baseline=query('1704-compatibility',D/'2026101704-proforma-VERIFY.sql');assert baseline['rows'][0]['jsonb_build_object']['status']=='COMMITTED_SECURITY_PASS','BASELINE_CHANGED_STOP';result=query('preflight',pre);row=result['rows'][0]
 assert row=={'db':'postgres','actor':'postgres','ro':'on','baseline':True,'absent':True,'api_absent':True},'PREFLIGHT_FAILED'
 with (E/'attempt-once.json').open('x') as receipt:json.dump({'target':REF,'migration':M['migration'],'sha256':M['migrationSha256'],'state':'STARTED_NO_AUTOMATIC_RETRY'},receipt)
 try:query('migration',D/'2026101705-proforma-fx.CANDIDATE.sql')
 except Exception:
  query('failure-postflight',D/'2026101705-proforma-fx-VERIFY.sql')
  raise
 result=query('postflight',D/'2026101705-proforma-fx-VERIFY.sql')
 values=result['rows'][0];value=next(iter(values.values()));value=json.loads(value) if isinstance(value,str) else value
 assert value['status']=='COMMITTED_QUOTE_ONLY_API_PASS','POSTFLIGHT_FAILED_NO_ACTIVATION'
 (E/'verified.json').write_text(json.dumps(value,indent=2));print(json.dumps(value))
elif mode=='activate':
 assert json.loads((E/'verified.json').read_text())['status']=='COMMITTED_QUOTE_ONLY_API_PASS'
 f=ROOT/M['activation']['file'];b=f.read_bytes();assert sha(b)==M['activation']['preimageSha256']
 b=b.replace(b'PROFORMA_INVOICE_FX_READY=false;',b'PROFORMA_INVOICE_FX_READY=true;')
 assert sha(b)==M['activation']['postimageSha256'];f.write_bytes(b);print('EXACT_FRONTEND_ACTIVATION_APPLIED')
else:raise ValueError('Unsupported mode')
