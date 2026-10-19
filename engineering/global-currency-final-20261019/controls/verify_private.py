from common import *
x=query('independent-private-access',E/'PRIVATE-ACCESS-READONLY.sql')
assert x=={'nonownerObjectGrants':0,'clientEffectivePrivileges':0,'sequenceCount':1},'PRIVATE_ACCESS_FAILED'
r=json.loads((E/'EXECUTION-RESULT.json').read_text())
if 'verificationError' in r:r['resolvedReadOnlyAttemptError']=r.pop('verificationError')
r.update(privateAccess=x,finalVerifiedAt=now())
(E/'EXECUTION-RESULT.json').write_text(json.dumps(r,indent=2));print(json.dumps({'status':'PASS','privateAccess':x}))
