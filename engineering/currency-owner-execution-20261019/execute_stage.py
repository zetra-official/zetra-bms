from runtime import *
import argparse
p=argparse.ArgumentParser();p.add_argument('stage',choices=['1902','1903']);stage=p.parse_args().stage
m=artifacts();i=0 if stage=='1902' else 1;a=m['artifactsInOrder'][i]
assert not (E/(stage+'-ATTEMPT.json')).exists(),'NO_AUTOMATIC_RETRY'
pre=json.loads((E/'PREFLIGHT-RESULT.json').read_text());assert pre['status']=='PASS'
assert (datetime.datetime.now(datetime.timezone.utc)-datetime.datetime.fromisoformat(pre['at'])).total_seconds()<1200,'PREFLIGHT_STALE'
if stage=='1903':assert json.loads((E/'1902-RESULT.json').read_text())['state']=='COMMITTED_AND_VERIFIED'
x=query(stage+'-before-metadata',E/'METADATA-READONLY.sql');assert not x['enabled'] and x['enrolled']==0 and all(not a['execute'] for a in x['apiExec'])
f={r['identity']:r for r in x['functions']};expected='a1a33dfe9a5de26fed5c04c42eee1044' if stage=='1902' else '953346c2582e3f4ae047796ec87ff0bf'
assert f['create_org_with_store_currency_tzs_v1(uuid,text,text,text,text,boolean)']['md5']==expected
assert f['create_org_with_store(text,text)']['md5']=='4883dcef2455a74f1938f4bebb03558e'
b=run(stage+'-backups',['backups','list','--project-ref',REF]);assert any(v['status']=='COMPLETED' for v in b['backups'])
r={'stage':stage,'project':REF,'file':a['file'],'sha256':a['sha256'],'state':'ATTEMPT_STARTED_NO_RETRY','startedAt':now()}
with (E/(stage+'-ATTEMPT.json')).open('x') as out:json.dump(r,out,indent=2)
try:run(stage+'-execute-once',['db','query','--linked','--project-ref',REF,'--file',str(R/a['file'])]);r['commandResult']='SUCCESS'
except Exception as err:r['commandError']=type(err).__name__
r['commandEndedAt']=now()
try:
 y=query(stage+'-independent-metadata',E/'METADATA-READONLY.sql');fn={v['identity']:v for v in y['functions']}
 new='953346c2582e3f4ae047796ec87ff0bf' if stage=='1902' else '11b9c5bda14151174dae0822850ca455'
 assert fn['create_org_with_store_currency_tzs_v1(uuid,text,text,text,text,boolean)']['md5']==new
 assert fn['create_org_with_store(text,text)']['md5']==('4883dcef2455a74f1938f4bebb03558e' if stage=='1902' else 'a409ac2199687974e626246dc0c5cb6b')
 assert fn['create_org_with_store_currency_v1(uuid,text,text,text,text,boolean)']['md5']=='c5ce18052f9b2f0a1f1629d46920a97c'
 assert not y['enabled'] and y['enrolled']==0 and y['quotaExists'] and y['permitsExist']==(stage=='1903')
 assert all(not v['execute'] for v in y['apiExec'])
 assert all(t['owner']=='postgres' and t['rls'] and t['force'] and t['nonownerGrants']==0 for t in y['tables'])
 assert all(v['nonownerGrants']==0 and v['definer'] and v['owner']=='postgres' and v['config']==['search_path=pg_catalog'] for v in fn.values() if v['identity']!='create_org_with_store(text,text)')
 old=next(v for v in x['functions'] if v['identity']=='create_org_with_store(text,text)');current=fn['create_org_with_store(text,text)'];assert all(current[k]==old[k] for k in ['owner','acl','config','definer'])
 r.update(state='COMMITTED_AND_VERIFIED',gatewayMd5=new,serverEnabled=False,apiExecuteDenied=True,existingCanonicalAclPreserved=True,privateTablesProtected=True)
except Exception as err:r.update(state='UNKNOWN_OR_VERIFICATION_FAILED_STOP',verificationError=str(err))
r['verifiedAt']=now();(E/(stage+'-RESULT.json')).write_text(json.dumps(r,indent=2));print(json.dumps(r))
assert r['state']=='COMMITTED_AND_VERIFIED','STOP_NO_RETRY'
