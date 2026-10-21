"""Reuse existing sanitized synthetic full-schema snapshot, loopback only."""
from pathlib import Path
import sys
sys.dont_write_bytecode=True
sys.path.insert(0,str(Path('engineering/currency-onboarding-20261018').resolve()))
import local as db
E=Path(__file__).resolve().parent
db.E=E;db.CLUSTER=E/'disposable'
db.SOURCE=Path('engineering/currency-onboarding-20261018/disposable-full-schema').resolve()
def start():
    db.PORT=db.start()
    assert Path(db.sql("SELECT current_setting('data_directory')")[1]).resolve()==db.CLUSTER.resolve()
    return db
def stop():
    if db.PORT:
        assert db.tool('pg_ctl',['-D',str(db.CLUSTER),'-m','fast','-w','stop'])[0]==0
        db.PORT=None
if __name__=='__main__':
    import json
    try:
        start()
        info=db.sql("SELECT json_build_object('publicTables',(SELECT count(*) FROM pg_tables WHERE schemaname='public'),'tables',(SELECT json_agg(json_build_object('table',table_name,'column',column_name,'type',data_type,'default',column_default,'nullable',is_nullable)) FROM information_schema.columns WHERE table_schema='public' AND table_name IN ('organizations','stores','org_memberships','org_membership_stores','products','inventory_movements','stock_movements','field_wallets','field_wallet_transactions','field_cycles','inbound_stock_orders','inbound_stock_items','inbound_stock_payments','notifications')))")[1]
        (E/'local-schema.private.json').write_text(info,encoding='utf-8')
        print('Disposable local schema inspected; '+str(json.loads(info)['publicTables'])+' public tables')
    finally:stop()
