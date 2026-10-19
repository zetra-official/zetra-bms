"""Stop only recorded disposable local acceptance databases; preserve all data."""
from pathlib import Path
import json,sys
sys.dont_write_bytecode=True
sys.path.insert(0,str(Path('engineering/currency-onboarding-20261018').resolve()))
import local as db
E=Path(__file__).resolve().parent;N=E.parent/'native-financial-contracts-20261019'
for receipt in ['ORIGINAL-WORKFLOW-SERVER.json','FIELD-UI-RUNTIME.private.json']:
 if not(E/receipt).exists():continue
 name=json.loads((E/receipt).read_text())['runtimeId']
 assert name.startswith(('disposable-original-product-','disposable-field-ui-'))
 db.E=N/name;db.CLUSTER=db.E/'cluster'
 assert db.E.resolve().parent==N.resolve() and db.CLUSTER.resolve().parent==db.E.resolve()
 if not(db.CLUSTER/'postmaster.pid').exists():continue
 db.PORT=int((db.CLUSTER/'postmaster.pid').read_text().splitlines()[3])
 assert Path(db.sql("SELECT current_setting('data_directory')")[1]).resolve()==db.CLUSTER.resolve()
 db.sql('UPDATE backend_core.settlement_rollout SET enabled=false;UPDATE backend_core.native_financial_rollout SET enabled=false')
 assert db.tool('pg_ctl',['-D',str(db.CLUSTER),'-m','fast','-w','-t','30','stop'])[0]==0
 print('Stopped saved local runtime: '+name)
