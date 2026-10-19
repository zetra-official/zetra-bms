import sys,json
from pathlib import Path
sys.path.insert(0,str(Path('engineering/currency-1803-production-execution-20261019').resolve()))
import common as c
c.E=Path('engineering/currency-tzs-acceptance-20261019').resolve()
x=c.query('auth-contract',c.E/'AUTH-CONTRACT-READONLY.sql');(c.E/'AUTH-CONTRACT-EVIDENCE.json').write_text(json.dumps(x,indent=2));print(json.dumps(x))
