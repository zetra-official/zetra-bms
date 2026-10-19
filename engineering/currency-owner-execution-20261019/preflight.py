from runtime import *
m=artifacts();assert not (E/'1902-ATTEMPT.json').exists(),'PRIOR_ATTEMPT_STOP'
p=next(p for p in run('projects',['projects','list']) if p.get('id',p.get('ref'))==REF);assert p['status']=='ACTIVE_HEALTHY' and p['organization_id']=='rbjskijjgltrcegmgjps'
b=run('backups',['backups','list','--project-ref',REF]);rows=[r for r in b['backups'] if r['status']=='COMPLETED'];latest=max(rows,key=lambda r:r['inserted_at']);assert (datetime.datetime.now(datetime.timezone.utc)-datetime.datetime.fromisoformat(latest['inserted_at'].replace('Z','+00:00'))).total_seconds()<48*3600
base=R/'engineering/global-currency-final-20261019/controls'
for name,file in [('catalog','catalog.sql'),('roles','ROLES-READONLY.sql'),('core','CORE-READONLY.sql')]:
 x=query('preflight-'+name,base/file);assert normalized(x)==normalized(localmeta(base/('independent-'+name+'.private.json'))),'DRIFT:'+name
x=query('preflight-metadata',E/'METADATA-READONLY.sql')
assert x['db']=='postgres' and x['role']=='postgres' and x['readOnly']=='on' and x['ownerBypassRls']
assert not x['enabled'] and x['enrolled']==0 and not x['quotaExists'] and not x['permitsExist']
f={r['identity']:r for r in x['functions']}
assert f['create_org_with_store_currency_tzs_v1(uuid,text,text,text,text,boolean)']['md5']=='a1a33dfe9a5de26fed5c04c42eee1044'
assert f['create_org_with_store(text,text)']['md5']=='4883dcef2455a74f1938f4bebb03558e'
assert all(not a['execute'] for a in x['apiExec'])
assert all(t['owner']=='postgres' and t['rls'] and t['force'] and t['nonownerGrants']==0 for t in x['tables'])
r={'status':'PASS','at':now(),'project':REF,'backupCount':len(rows),'latestBackup':{k:latest[k] for k in ['id','inserted_at','status']},'restoreTested':False,'artifacts':m['artifactsInOrder'],'sqlExecuted':False}
(E/'PREFLIGHT-RESULT.json').write_text(json.dumps(r,indent=2));print(json.dumps(r))
