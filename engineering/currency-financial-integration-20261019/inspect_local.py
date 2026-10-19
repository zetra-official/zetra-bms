from pathlib import Path
import sys,json,uuid
sys.dont_write_bytecode=True;sys.path.insert(0,str(Path('engineering/currency-onboarding-20261018').resolve()));import local as l
E=Path(__file__).resolve().parent;l.E=E;l.CLUSTER=E/'disposable-cbf0f9d4';l.env.update(PGPASSFILE=str(E/'NO-CREDENTIALS'),PGSERVICEFILE=str(E/'NO-SERVICES'))
try:
 l.PORT=l.start();print(l.sql('SELECT organization_id,currency FROM proforma_backend.accounting_currency')[1]);(E/'LOCAL-CLUSTER.json').write_text(json.dumps({'directory':str(l.CLUSTER),'port':l.PORT}));
finally:
 if l.PORT:l.tool('pg_ctl',['-D',str(l.CLUSTER),'-m','fast','-w','stop'])
