from pathlib import Path
import sys,json,datetime
sys.dont_write_bytecode=True
sys.path.insert(0,str(Path('engineering/global-currency-final-20261019/controls').resolve()))
import common as c
c.E=Path(__file__).resolve().parent
x=c.query('dedicated-actor-readonly',c.E/'DEDICATED-ACTOR-READONLY.sql')
r={'project':c.REF,'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'result':x,'rejectedActorExcluded':True,'ownerApprovedActor':None,'productionWrites':False}
(c.E/'DEDICATED-ACTOR-RESULT.json').write_text(json.dumps(r,indent=2));print(json.dumps(r))
