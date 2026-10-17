"""Focused read-only inspection of preserved disposable schema, never remote credentials."""
from pathlib import Path
import sys,socket,json
sys.dont_write_bytecode=True
sys.path.insert(0,str(Path(__file__).parent))
import test_local as t
base=t.BASE/'main-project-release/proforma-normal'
cluster=max((p for p in base.glob('clone-*') if p.is_dir() and not(p/'postmaster.pid').exists()),key=lambda p:p.stat().st_ctime)
with socket.socket() as s:s.bind(('127.0.0.1',0));t.PORT=s.getsockname()[1]
try:
 r=t.pg.tool('pg_ctl',['-D',str(cluster),'-l',str(cluster.with_suffix('.posting-inspect.log')),'-o',f'-h 127.0.0.1 -p {t.PORT} -c archive_mode=off -c shared_preload_libraries=','-w','start']);assert r.returncode==0
 assert Path(t.read("SELECT current_setting('data_directory')")).resolve()==cluster.resolve()
 result=json.loads(t.read("SELECT jsonb_agg(jsonb_build_object('identity',p.oid::regprocedure::text,'result',pg_get_function_result(p.oid),'definition',pg_get_functiondef(p.oid))) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('create_sale_with_payment_v6','attach_customer_to_sale','create_credit_account_v2','record_credit_sale_v2','create_sale_with_payment_v4','get_store_sale_items','create_sale')"))
 (t.ROOT/'engineering/release/proforma-orders/posting-contracts.private.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
 print(json.dumps([{'identity':r['identity'],'result':r['result']} for r in result]))
finally:t.pg.tool('pg_ctl',['-D',str(cluster),'-m','fast','-w','stop'])
