from pathlib import Path
import json,hashlib,subprocess,datetime
R=Path.cwd();E=R/'engineering/global-currency-final-20261019/controls';D=R/'engineering/currency-tzs-acceptance-20261019';REF='dcmhqdckzhbuakvcyjit'
CLI=Path(r'C:\Users\ZetraAdmin\AppData\Local\npm-cache\_npx\aa8e5c70f9d8d161\node_modules\@supabase\cli-windows-x64\bin\supabase.exe')
M=D/'2026101901-tzs-rollout-controls.DRAFT.sql';EXPECTED='4cd1c6e61626cd00b0e98b4c01ebfc26e66fbbb1d3a29ddf0cbf820ddee29b15'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();now=lambda:datetime.datetime.now(datetime.timezone.utc).isoformat()
def run(name,args):
 p=subprocess.run([str(CLI),*args,'-o','json'],capture_output=True,text=True,encoding='utf-8',timeout=110)
 (E/(name+'.private.json')).write_text(p.stdout,encoding='utf-8');(E/(name+'.private.stderr')).write_text(p.stderr,encoding='utf-8');(E/(name+'-exit.json')).write_text(json.dumps({'exitCode':p.returncode,'at':now()}))
 if p.returncode:raise RuntimeError(name+'_FAILED_INSPECT_PRIVATE_DIAGNOSTICS')
 return json.loads(p.stdout)
def metadata(x):
 v=x['rows'][0]['metadata'];return json.loads(v) if isinstance(v,str) else v
def query(n,f):return metadata(run(n,['db','query','--linked','--project-ref',REF,'--file',str(f)]))
def localmeta(p):return metadata(json.loads(p.read_text(encoding='utf-8')))
def normalized(x):
 x=json.loads(json.dumps(x))
 for key,sortkey in [('functions','identity'),('roles','name')]:
  if key in x and x[key] is not None:x[key]=sorted(x[key],key=lambda r:r[sortkey])
 if 'memberships' in x and x['memberships'] is not None:x['memberships']=sorted(x['memberships'],key=lambda r:(r['role'],r['member']))
 return x
def artifacts():
 assert sha(M)==EXPECTED,'MIGRATION_HASH_MISMATCH'
 assert (R/'supabase/.temp/project-ref').read_text().strip()==REF,'LINKED_TARGET_MISMATCH'
 assert subprocess.check_output(['git','rev-parse','--short','HEAD'],text=True).strip()=='7736018','CHECKPOINT_CHANGED'
 for f,h in json.loads((D/'SHA256-MANIFEST.json').read_text()).items():assert sha(D/f)==h,'ARTIFACT_CHANGED:'+f
 assert 'ATOMIC_CURRENCY_ONBOARDING_ACTIVE=false' in (R/'src/currency/onboarding.ts').read_text()
