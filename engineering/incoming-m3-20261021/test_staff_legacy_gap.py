from pathlib import Path
import sys,json,uuid
E=Path(__file__).resolve().parent;sys.path.insert(0,str(E.parent/'security-owner-privacy-m2-20261021'));import local_runtime as l
l.db.E=E;l.db.CLUSTER=E/'disposable';l.db.PORT=json.loads((E/'db.private.json').read_text())['port'];sql=l.db.sql;assert Path(sql("SELECT current_setting('data_directory')")[1].strip()).resolve()==(E/'disposable').resolve()
r=sql((E/'2026102103-staff-operational.DRAFT.sql').read_text().replace('CREATE FUNCTION public.','CREATE OR REPLACE FUNCTION public.'),False);assert r[0]==0,r[2]
f=json.loads((E/'staff-fixture.private.json').read_text());checks=[]
for owner in [3,7]:
 actor=f'21000000-0000-4000-8000-{owner:012d}';account=str(uuid.uuid4())
 query=f"BEGIN;INSERT INTO public.credit_accounts_v2(id,store_id,created_by,customer_name) VALUES('{account}','{f['store']}','{actor}','SYNTHETIC CREDIT');INSERT INTO public.credit_ledger_v2(store_id,credit_account_id,delta,created_by,created_at,entry_type,method) VALUES('{f['store']}','{account}',-900,'{actor}','2026-01-01T12:00:00Z','PAYMENT','CASH');SET LOCAL ROLE authenticated;SELECT set_config('request.jwt.claim.sub','21000000-0000-4000-8000-000000000003',true);SELECT public.m3_staff_operational_v1('{f['org']}','{f['store']}','2026-01-01',0);ROLLBACK;"
 r=sql(query,False);assert r[0]==0,r[2];d=json.loads(next(x for x in r[1].splitlines() if x.startswith('{')));ok=(d['money_in'] is None if owner==3 else d['money_in']=='100000');checks.append({'name':'Own legacy collection fails closed pending cross-ledger reconciliation' if owner==3 else 'Colleague legacy collection does not contaminate personal collections','status':'PASS' if ok else 'FAIL'});assert ok
out={'localOnly':True,'checks':checks,'pass':2,'fail':0};(E/'STAFF-LEGACY-GAP-RESULTS.json').write_text(json.dumps(out,indent=2));print(json.dumps(out))
