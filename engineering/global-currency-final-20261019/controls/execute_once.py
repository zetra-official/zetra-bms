from common import *
artifacts()
assert not (E/'ATTEMPT-ONCE.json').exists(),'PRIOR_ATTEMPT_NO_RETRY'
pre=json.loads((E/'PREFLIGHT-RESULT.json').read_text())
assert pre['status']=='PASS' and pre['sha256']==EXPECTED
assert (datetime.datetime.now(datetime.timezone.utc)-datetime.datetime.fromisoformat(pre['at'])).total_seconds()<900,'PREFLIGHT_STALE'
assert json.loads((E/'RECOVERY-CONTROLS.json').read_text())['restoreControlObserved']
gate=query('final-controls-absence',E/'CONTROLS-READONLY.sql')
assert gate['tables']==[] and gate['ownerBypassesRls']
assert sha(M)==EXPECTED
r={'state':'ATTEMPT_STARTED_NO_RETRY','project':REF,'migration':M.name,'sha256':EXPECTED,'gitCheckpoint':'7736018','backup':pre['latestBackup'],'restoreTested':False,'startedAt':now()}
with (E/'ATTEMPT-ONCE.json').open('x',encoding='utf-8') as f:json.dump(r,f,indent=2)
try:
 run('migration-once',['db','query','--linked','--project-ref',REF,'--file',str(M)])
 r['commandResult']='SUCCESS'
except Exception as x:r['commandError']=type(x).__name__
r['executionEndedAt']=now()
(E/'EXECUTION-RESULT.json').write_text(json.dumps(r,indent=2))
print(json.dumps(r))
