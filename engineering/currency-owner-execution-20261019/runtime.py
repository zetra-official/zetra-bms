from pathlib import Path
import importlib.util,sys,json,hashlib,datetime,subprocess
sys.dont_write_bytecode=True
R=Path.cwd();E=R/'engineering/currency-owner-execution-20261019'
spec=importlib.util.spec_from_file_location('controls_common',R/'engineering/global-currency-final-20261019/controls/common.py');c=importlib.util.module_from_spec(spec);spec.loader.exec_module(c);c.E=E
REF=c.REF;sha=c.sha;now=c.now;run=c.run;query=c.query;normalized=c.normalized;localmeta=c.localmeta
P=R/'engineering/currency-owner-canary-20261019/CONSOLIDATED-APPROVAL.json'
def artifacts():
 m=json.loads(P.read_text());assert m['project']==REF and m['ownerApprovedActor']=='bb2d6dee-773d-4fa7-8fda-1eb85bbad2cd'
 assert (R/'supabase/.temp/project-ref').read_text().strip()==REF
 for a in m['artifactsInOrder']:assert sha(R/a['file'])==a['sha256'],'ARTIFACT_HASH_MISMATCH:'+a['file']
 assert m['artifactsInOrder'][0]['sha256']=='7ce3e81d44b402d53f19f4776647e4953471aef34d51faea69536696aeb13e55'
 for folder in ['engineering/currency-owner-canary-20261019','engineering/currency-canary-quota-20261019']:
  d=R/folder
  for f,h in json.loads((d/'SHA256-MANIFEST.json').read_text()).items():assert sha(d/f)==h,'PACKAGE_CHANGED:'+f
 assert 'ATOMIC_CURRENCY_ONBOARDING_ACTIVE=false' in (R/'src/currency/onboarding.ts').read_text()
 return m
