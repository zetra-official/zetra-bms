from common import *
x=query('test-actor-markers',E/'TEST-ACTOR-READONLY.sql')
r={'project':REF,'at':now(),'scope':'Explicit administrator-controlled test markers only; no emails/customer records selected','result':x,'decision':'Owner approval of a verified UUID is required even if a candidate exists'}
(E/'TEST-ACTOR-RESULT.json').write_text(json.dumps(r,indent=2));print(json.dumps(r))
