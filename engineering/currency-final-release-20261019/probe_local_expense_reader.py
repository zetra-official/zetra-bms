from pathlib import Path
import sys,json,uuid
sys.dont_write_bytecode=True;sys.path.insert(0,str(Path('engineering/currency-onboarding-20261018').resolve()));import local as l
E=Path(__file__).resolve().parent;N=E.parent/'native-financial-contracts-20261019';l.E=N;l.CLUSTER=N/'disposable-native-v2'
try:
 l.PORT=l.start();r=json.loads((E/'GENUINE-FINANCIAL-ACCEPTANCE.json').read_text());req=str(uuid.uuid5(uuid.NAMESPACE_URL,r['request']+'TZSexpense'))
 sql="SELECT jsonb_build_object('now',clock_timestamp(),'expense',to_jsonb(e),'requestResult',n.result) FROM backend_core.native_financial_requests n JOIN public.expenses e ON e.id=(n.result->>'expenseId')::uuid WHERE n.request_id='"+req+"'"
 out=json.loads(l.sql(sql)[1]);safe={'now':out['now'],'expenseDate':out['expense']['expense_date'],'createdAt':out['expense']['created_at'],'requestDate':out['requestResult']['expenseDate'],'expenseDateColumnType':l.sql("SELECT data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='expenses' AND column_name='expense_date'")[1]};(E/'LOCAL-EXPENSE-READER-PROBE.json').write_text(json.dumps(safe,indent=2));print(json.dumps(safe))
finally:
 if l.PORT:l.tool('pg_ctl',['-D',str(l.CLUSTER),'-m','fast','-w','stop'])
