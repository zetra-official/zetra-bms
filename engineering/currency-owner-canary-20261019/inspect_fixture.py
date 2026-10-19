from pathlib import Path
import sys,json
sys.dont_write_bytecode=True;sys.path.insert(0,str(Path('engineering/currency-onboarding-20261018').resolve()))
import local as l
E=Path(__file__).resolve().parent;l.E=E;l.CLUSTER=max(E.glob('disposable-*'),key=lambda p:p.stat().st_ctime)
try:
 l.PORT=l.start();x=json.loads(l.sql("SELECT json_agg(json_build_object('table',table_name,'column',column_name,'type',data_type,'nullable',is_nullable,'default',column_default)) FROM information_schema.columns WHERE table_schema='public' AND table_name IN('plans','organization_subscriptions')")[1]);(E/'FIXTURE-COLUMNS.json').write_text(json.dumps(x,indent=2));print(json.dumps([r for r in x if r['nullable']=='NO' and r['default'] is None]))
finally:
 if l.PORT:assert l.tool('pg_ctl',['-D',str(l.CLUSTER),'-m','fast','-w','stop'])[0]==0
