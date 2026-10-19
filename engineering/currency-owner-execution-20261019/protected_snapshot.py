from runtime import *
import argparse
p=argparse.ArgumentParser();p.add_argument('phase',choices=['before','after']);phase=p.parse_args().phase
x=query('protected-'+phase,E/'PROTECTED-RECORDS-READONLY.sql')
(E/('PROTECTED-'+phase.upper()+'.json')).write_text(json.dumps(x,indent=2))
r={'phase':phase,'tables':len(x['checks']),'oldOrganizations':x['oldOrganizationCount'],'at':now()}
if phase=='after':r['unchanged']=x==json.loads((E/'PROTECTED-BEFORE.json').read_text())
(E/('PROTECTED-'+phase.upper()+'-RESULT.json')).write_text(json.dumps(r,indent=2));print(json.dumps(r))
