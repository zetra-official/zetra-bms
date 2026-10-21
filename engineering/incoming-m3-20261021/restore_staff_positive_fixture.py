"""Restore the payment deliberately removed by the negative acceptance case; synthetic disposable data only."""
from pathlib import Path
import sys,json
E=Path(__file__).resolve().parent;sys.path.insert(0,str(E.parent/'security-owner-privacy-m2-20261021'));import local_runtime as l
l.db.E=E;l.db.CLUSTER=E/'disposable';l.db.PORT=json.loads((E/'db.private.json').read_text())['port'];assert Path(l.db.sql("SELECT current_setting('data_directory')")[1].strip()).resolve()==(E/'disposable').resolve()
f=json.loads((E/'staff-fixture.private.json').read_text());U=lambda n:f"{f['prefix']}-2222-4000-8000-{n:012d}";actor='21000000-0000-4000-8000-000000000003'
l.db.sql(f"INSERT INTO public.sale_payments(id,organization_id,store_id,sale_id,received_by_membership_id,created_by,created_at,payment_method,paid_amount) VALUES('{U(301)}','{f['org']}','{f['store']}','{U(201)}','{U(103)}','{actor}','2026-01-01T11:00:00Z','CASH',100000) ON CONFLICT(id) DO NOTHING;")
print('Original synthetic positive-payment fixture restored after recorded unavailable-evidence test; no hosted/customer records')
