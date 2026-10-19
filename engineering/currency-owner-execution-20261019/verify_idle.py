from runtime import *
m=artifacts();state=query('final-disabled-state',E/'CANARY-STATE-READONLY.sql');meta=query('final-disabled-metadata',E/'METADATA-READONLY.sql')
assert not state['enabled'] and not state['allowlist'] and state['quota'] is None and state['permits']==0
assert state['orgCount']==state['storeCount']==state['financialRows']==0
assert all(not x['execute'] for x in meta['apiExec'])
assert all(t['owner']=='postgres' and t['rls'] and t['force'] and t['nonownerGrants']==0 for t in meta['tables'])
r={'status':'PASS','at':now(),'serverEnabled':False,'canaryActivated':False,'apiExecuteDenied':True,'coreQuarantined':True,'privateTablesProtected':True,'createdCanaryOrganizations':0,'createdCanaryStores':0,'financialRows':0,'genuineAuthAcceptance':'NOT TESTED — OWNER SESSION NOT AVAILABLE','audit':state['audit']}
(E/'FINAL-DISABLED-RESULT.json').write_text(json.dumps(r,indent=2));print(json.dumps(r))
