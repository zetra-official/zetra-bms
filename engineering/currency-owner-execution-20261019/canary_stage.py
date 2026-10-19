from runtime import *
import argparse,tempfile
p=argparse.ArgumentParser();p.add_argument('action',choices=['activate','disable']);action=p.parse_args().action
m=artifacts();index=2 if action=='activate' else 3;a=m['artifactsInOrder'][index]
assert json.loads((E/'1903-RESULT.json').read_text())['state']=='COMMITTED_AND_VERIFIED'
assert not (E/(action+'-ATTEMPT.json')).exists(),'NO_AUTOMATIC_RETRY'
if action=='activate':
 projects=run('activation-projects',['projects','list']);target=next(v for v in projects if v.get('id',v.get('ref'))==REF);assert target['status']=='ACTIVE_HEALTHY' and target['organization_id']=='rbjskijjgltrcegmgjps'
 events=[json.loads(x) for x in (E/'BROWSER-EVENTS.jsonl').read_text().splitlines()]
 auth=next(x for x in reversed(events) if x['event']=='GENUINE_AUTH_VERIFIED' and x['actor']==m['ownerApprovedActor'])
 assert (datetime.datetime.now(datetime.timezone.utc)-datetime.datetime.fromisoformat(auth['at'].replace('Z','+00:00'))).total_seconds()<900,'OWNER_SESSION_EVIDENCE_STALE'
 b=run('activation-backups',['backups','list','--project-ref',REF]);assert any(x['status']=='COMPLETED' for x in b['backups'])
meta=query(action+'-before-metadata',E/'METADATA-READONLY.sql');assert next(v for v in meta['functions'] if v['identity'].startswith('create_org_with_store_currency_tzs'))['md5']=='11b9c5bda14151174dae0822850ca455'
if action=='activate':
 assert not meta['enabled'] and all(not v['execute'] for v in meta['apiExec'])
 baseline=localmeta(E/'1903-independent-metadata.private.json')
 assert sorted(meta['functions'],key=lambda v:v['identity'])==sorted(baseline['functions'],key=lambda v:v['identity']),'FUNCTION_DRIFT'
 assert sorted(meta['tables'],key=lambda v:v['name'])==sorted(baseline['tables'],key=lambda v:v['name']),'PRIVATE_ACL_DRIFT'
 roles=query('activation-roles',R/'engineering/global-currency-final-20261019/controls/ROLES-READONLY.sql');assert normalized(roles)==normalized(localmeta(E/'preflight-roles.private.json')),'ADMIN_ROLE_DRIFT'
r={'action':action,'project':REF,'file':a['file'],'sha256':a['sha256'],'startedAt':now(),'state':'ATTEMPT_STARTED_NO_RETRY'}
with (E/(action+'-ATTEMPT.json')).open('x') as out:json.dump(r,out,indent=2)
file=R/a['file'];tmp=None
try:
 if action=='activate':
  quote=lambda s:"'"+s.replace("'","''")+"'"
  settings={'zetra.tzs_canary_actor':m['ownerApprovedActor'],'zetra.tzs_canary_request':m['requestId'],'zetra.tzs_approval':m['approvalReference'],'zetra.tzs_canary_org':m['organizationName'],'zetra.tzs_canary_store':m['storeName'],'zetra.tzs_canary_timezone':m['timezone']}
  prefix=''.join('SET '+k+'='+quote(v)+';\n' for k,v in settings.items());body=file.read_bytes()
  payload=prefix.encode()+body;assert hashlib.sha256(payload[len(prefix.encode()):]).hexdigest()==a['sha256']
  tmp=tempfile.NamedTemporaryFile(dir=E,suffix='.private.sql',delete=False);tmp.write(payload);tmp.close();file=Path(tmp.name)
 run(action+'-once',['db','query','--linked','--project-ref',REF,'--file',str(file)]);r['commandResult']='SUCCESS'
except Exception as err:r['commandError']=type(err).__name__
finally:
 if tmp:Path(tmp.name).unlink(missing_ok=True)
try:
 state=query(action+'-independent-state',E/'CANARY-STATE-READONLY.sql');meta=query(action+'-independent-metadata',E/'METADATA-READONLY.sql')
 if action=='activate':
  assert state['enabled'] and len(state['allowlist'])==1 and state['allowlist'][0]['actor']==m['ownerApprovedActor'] and state['quota']['request_id']==m['requestId'] and state['permits']==0
  assert state['quota']['result'] is None and state['orgCount']==0
  expires=state['allowlist'][0]['expiresAt'];at=state['quota']['approved_at'];assert (datetime.datetime.fromisoformat(expires)-datetime.datetime.fromisoformat(at)).total_seconds()==3600
  assert all(v['execute']==(v['role']=='authenticated' and v['function'].startswith('create_org_with_store_currency_tzs')) for v in meta['apiExec'])
  (E/'ACTIVATION-VERIFIED.json').write_text(json.dumps({'enabled':True,'expiresAt':expires,'actor':m['ownerApprovedActor'],'request':m['requestId']}))
 else:
  assert not state['enabled'] and all(not v['execute'] for v in meta['apiExec']) and state['permits']==0
  (E/'ACTIVATION-VERIFIED.json').write_text(json.dumps({'enabled':False}))
 r.update(state='COMMITTED_AND_VERIFIED',serverEnabled=state['enabled'],quotaResult=state['quota']['result'] if state['quota'] else None,permissions=meta['apiExec'],audit=state['audit'])
except Exception as err:r.update(state='UNKNOWN_OR_VERIFICATION_FAILED_STOP',verificationError=str(err))
r['verifiedAt']=now();(E/(action+'-RESULT.json')).write_text(json.dumps(r,indent=2));print(json.dumps(r));assert r['state']=='COMMITTED_AND_VERIFIED','STOP_NO_RETRY'
