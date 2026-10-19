from common import *
r=json.loads((E/'EXECUTION-RESULT.json').read_text())
try:
 post=query('independent-gateway',E/'GATEWAY-READONLY.sql');f=post['gateway']
 assert post['gatewayOverloads']==1 and post['staticOtherWrappers']==0
 assert f['md5']=='a1a33dfe9a5de26fed5c04c42eee1044' and f['owner']=='postgres' and f['definer'] and f['config']==['search_path=pg_catalog']
 assert f['acl']==['postgres=X/postgres'] and f['nonownerGrants']==0 and f['publicGrants']==0
 assert all(not x['execute'] for x in post['roles'] if x['name']!='postgres')
 controls=query('independent-controls',E/'CONTROLS-READONLY.sql')
 assert len(controls['tables'])==3
 for t in controls['tables']:
  assert t['owner']=='postgres' and t['rls'] and t['force'] and t['acl']==['postgres=arwdDxtm/postgres']
 state=query('independent-state',E/'STATE-READONLY.sql')
 assert state['enabled'] is False and state['configRows']==1 and state['allowlistRows']==0 and state['auditRows']==0
 for name,file in [('core','CORE-READONLY.sql'),('catalog','catalog.sql'),('roles','ROLES-READONLY.sql')]:
  x=query('independent-'+name,E/file)
  assert normalized(x)==normalized(localmeta(E/('preflight-'+name+'.private.json'))),'DRIFT:'+name
 if 'verificationError' in r:r['resolvedReadOnlyAttemptError']=r.pop('verificationError')
 r.update(state='PASS — COMMITTED AND VERIFIED',rpcPermissions=post['roles'],controls=controls['tables'],rollout=state,existingContractsUnchanged=True,financialPostingActivated=False,clientActivated=False)
except Exception as x:
 r.update(state='VERIFICATION INCOMPLETE — NO RETRY',verificationError=str(x))
r['verifiedAt']=now()
(E/'EXECUTION-RESULT.json').write_text(json.dumps(r,indent=2));print(json.dumps(r))
