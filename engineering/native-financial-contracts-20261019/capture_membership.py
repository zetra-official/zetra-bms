from pathlib import Path
import sys
sys.dont_write_bytecode=True;sys.path.insert(0,str(Path('engineering/currency-onboarding-20261018').resolve()));import local as l
E=Path(__file__).resolve().parent;l.E=E;l.CLUSTER=E/'disposable-native-v1'
try:
 l.PORT=l.start();print(l.sql("SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname='trg_sales_set_sold_by'")[1]);print(l.sql("SELECT table_name,column_name FROM information_schema.columns WHERE table_schema='public' AND table_name LIKE '%member%' AND column_name IN ('id','store_id','organization_id','user_id','membership_id','org_membership_id')")[1])
finally:
 if l.PORT:l.tool('pg_ctl',['-D',str(l.CLUSTER),'-m','fast','-w','stop'])
