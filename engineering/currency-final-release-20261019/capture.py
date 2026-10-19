from pathlib import Path
import sys,json,hashlib
sys.dont_write_bytecode=True;sys.path.insert(0,str(Path('engineering/currency-onboarding-20261018').resolve()));import local as l
E=Path(__file__).resolve().parent;l.E=E;l.CLUSTER=E.parent/'native-financial-contracts-20261019/disposable-native-v2'
# start() requires the cluster parent be its working evidence directory.
l.E=l.CLUSTER.parent
try:
 l.PORT=l.start()
 rows=json.loads(l.sql("SELECT json_agg(json_build_object('identity',p.oid::regprocedure::text,'definition',pg_get_functiondef(p.oid))) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prokind='f' AND p.proname ~ '(purchase|receive|stock_in|field_|supplier|tax|refund|return|cashier_closing|expense)' ")[1]);(E/'CANONICAL-CONTRACTS.json').write_text(json.dumps(rows,indent=2))
 print('\n'.join(r['identity'] for r in rows))
except Exception:raise
finally:
 if l.PORT:l.tool('pg_ctl',['-D',str(l.CLUSTER),'-m','fast','-w','stop'])
