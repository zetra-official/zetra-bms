from pathlib import Path
import sys,json,datetime
sys.dont_write_bytecode=True;sys.path.insert(0,str(Path('engineering/global-currency-final-20261019/controls').resolve()))
import common as c
c.E=Path(__file__).resolve().parent
x=c.query('actor-current-readonly',c.E/'ACTOR-READONLY.sql')
x.pop('planDefinition',None)
x.update(at=datetime.datetime.now(datetime.timezone.utc).isoformat(),genuineAuthAcceptance=False,canaryActivated=False,scope='Read-only administrative diagnostic with actor claims; not signed JWT proof')
(c.E/'ACTOR-RESULT.json').write_text(json.dumps(x,indent=2));print(json.dumps(x))
