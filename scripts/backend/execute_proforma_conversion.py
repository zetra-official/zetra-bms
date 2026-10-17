"""Exact-manifest Production attempt. Run ONLY after explicit Owner approval of its SHA-256."""
from pathlib import Path
import argparse,json,hashlib,subprocess
ROOT=Path(__file__).resolve().parents[2];D=ROOT/'supabase/backend-review/20261017';REF='dcmhqdckzhbuakvcyjit'
CLI=Path(r'C:\Users\ZetraAdmin\AppData\Local\npm-cache\_npx\aa8e5c70f9d8d161\node_modules\@supabase\cli-windows-x64\bin\supabase.exe')
parser=argparse.ArgumentParser();parser.add_argument('--approval-sha256',required=True);args=parser.parse_args()
approval=D/'PROFORMA-CONVERSION-APPROVAL.json';sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
assert sha(approval)==args.approval_sha256,'APPROVAL_IDENTITY_MISMATCH_STOP'
M=json.loads(approval.read_text(encoding='utf-8'));assert M['project']==REF and M['migration']=='2026101706'
for file,digest in M['files'].items():assert sha(ROOT/file)==digest,'ARTIFACT_CHANGED_STOP:'+file
E=ROOT/'engineering/release/proforma-conversion/production';E.mkdir(exist_ok=True)
assert not (E/'attempt-once.json').exists(),'PRIOR_ATTEMPT_STOP_NO_RETRY'
linked=ROOT/'supabase/.temp/project-ref'
if linked.exists():assert linked.read_text().strip()==REF,'LINKED_TARGET_MISMATCH'
def run(name,command):
 r=subprocess.run([str(CLI),*command,'-o','json'],cwd=ROOT,capture_output=True,text=True,encoding='utf-8',timeout=120)
 (E/(name+'.private.json')).write_text(r.stdout,encoding='utf-8');(E/(name+'.stderr.private.log')).write_text(r.stderr,encoding='utf-8')
 if r.returncode:raise RuntimeError(name+'_FAILED_NO_RETRY_INSPECT_PRIVATE_EVIDENCE')
 return json.loads(r.stdout)
def query(name,suffix):return run(name,['db','query','--linked','--project-ref',REF,'--file',str(D/('2026101706-proforma-conversion-'+suffix+'.sql'))])
def value(result):
 row=result['rows'][0];v=next(iter(row.values()));return json.loads(v) if isinstance(v,str) else v
projects=run('project-identity',['projects','list']);assert any(p.get('id',p.get('ref'))==REF and p.get('status')=='ACTIVE_HEALTHY' for p in projects),'TARGET_NOT_HEALTHY'
backups=run('backup-inventory',['backups','list','--project-ref',REF]);entries=backups.get('backups',[]) if isinstance(backups,dict) else backups
assert any(b.get('status')=='COMPLETED' for b in entries),'NO_COMPLETED_BACKUP_STOP'
pre=value(query('preflight','PREFLIGHT'));assert pre=={'db':'postgres','actor':'postgres','readOnly':'on','baseline':True,'absent':True,'untrustedCreate':False,'definitionMismatches':0},'PREFLIGHT_FAILED_STOP'
# Recheck exact bytes immediately before the ONE write attempt.
for file,digest in M['files'].items():assert sha(ROOT/file)==digest,'ARTIFACT_CHANGED_BEFORE_WRITE'
with (E/'attempt-once.json').open('x',encoding='utf-8') as f:json.dump({'target':REF,'migration':M['migration'],'migrationSha256':M['migrationSha256'],'state':'STARTED_NO_AUTOMATIC_RETRY'},f)
error=None
try:query('migration','CANDIDATE')
except Exception as e:error=type(e).__name__
# Always attempt independent read-only diagnosis; never repeat a write or guess COMMIT.
try:
 verified=value(query('independent-verification','VERIFY'))
 assert verified['status']=='COMMITTED_SECURITY_PASS','POSTFLIGHT_FAILED_NO_CLIENT_RELEASE'
 (E/'verified.json').write_text(json.dumps(verified,indent=2),encoding='utf-8')
 print(json.dumps({'status':'COMMITTED_SECURITY_PASS','target':REF,'migration':M['migration'],'priorCommandError':error,'backupRestoreTested':False,'clientRelease':'Eligible only from exact reviewed source; no financial smoke transactions authorized'}))
except Exception:
 (E/'uncertain-or-failed.json').write_text(json.dumps({'status':'STOP_NO_RETRY','target':REF,'commandError':error,'action':'Inspect private evidence; determine persisted state read-only before any rollback/write.'}),encoding='utf-8')
 raise RuntimeError('FAILED_OR_UNCERTAIN_STOP_NO_RETRY_NO_CLIENT_RELEASE') from None
