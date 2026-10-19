from common import *
artifacts();assert not (E/'ATTEMPT-ONCE.json').exists()
p=next(p for p in run('projects',['projects','list']) if p.get('id',p.get('ref'))==REF);assert p['status']=='ACTIVE_HEALTHY' and p['organization_id']=='rbjskijjgltrcegmgjps'
b=run('backups',['backups','list','--project-ref',REF]);rows=[r for r in b['backups'] if r['status']=='COMPLETED'];latest=max(rows,key=lambda r:r['inserted_at'])
base=R/'engineering/currency-1803-production-execution-20261019'
for name,file in [('catalog','catalog.sql'),('core','CORE-READONLY.sql'),('gateway','GATEWAY-READONLY.sql'),('roles','ROLES-READONLY.sql')]:
 x=query('preflight-'+name,E/file);assert normalized(x)==normalized(localmeta(base/('independent-'+name+'.private.json'))),'CONTRACT_DRIFT:'+name
x=query('preflight-controls',E/'CONTROLS-READONLY.sql');assert x['tables']==[] and x['ownerBypassesRls'] and x['role']=='postgres' and x['db']=='postgres' and x['readOnly']=='on'
r={'status':'PASS','project':REF,'sha256':sha(M),'at':now(),'backupCount':len(rows),'latestBackup':{k:latest[k] for k in ['id','inserted_at','status']},'restoreTested':False,'migrationExecuted':False}
(E/'PREFLIGHT-RESULT.json').write_text(json.dumps(r,indent=2));print(json.dumps(r))
