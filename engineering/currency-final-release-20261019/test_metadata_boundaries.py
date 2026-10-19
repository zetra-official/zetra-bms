from pathlib import Path
import sys,json,uuid,re
sys.dont_write_bytecode=True;sys.path.insert(0,str(Path('engineering/currency-onboarding-20261018').resolve()));import local as l
E=Path(__file__).resolve().parent;N=E.parent/'native-financial-contracts-20261019';l.E=N;l.CLUSTER=N/'disposable-native-v2';read=lambda s:l.sql(s)[1];q=lambda s:"'"+str(s).replace("'","''")+"'";checks=[]
def ck(n,v):assert v,n;checks.append(n)
try:
 l.PORT=l.start();s=(E/'1908-boundaries.sql').read_text();definition=re.search(r'CREATE FUNCTION backend_core.native_unverified_writer_guard_v1\(\).*?END \$\$;',s,re.S).group().replace('CREATE FUNCTION','CREATE OR REPLACE FUNCTION',1);l.sql(definition)
 l.sql('CREATE TRIGGER native_unverified_writer_guard_v1 BEFORE INSERT OR UPDATE OR DELETE ON public.credit_accounts_v2 FOR EACH ROW EXECUTE FUNCTION backend_core.native_unverified_writer_guard_v1()')
 rows=json.loads((N/'NATIVE-RESULTS.json').read_text())['scenarios'];row=next(r for r in rows if r['currency']=='KWD');tzs=next(r for r in rows if r['currency']=='TZS')
 ck('native product nonfinancial name edit preserved',l.sql('UPDATE public.products SET name=name WHERE id='+q(row['productId']),False)[0]==0)
 ck('native product financial edit denied',l.sql('UPDATE public.products SET cost_price=1 WHERE id='+q(row['productId']),False)[0]!=0)
 account=read('SELECT id FROM public.credit_accounts_v2 WHERE store_id='+q(row['storeId'])+' LIMIT 1')
 ck('native account cannot move to legacy TZS store',l.sql('UPDATE public.credit_accounts_v2 SET store_id='+q(tzs['storeId'])+' WHERE id='+q(account),False)[0]!=0)
 ck('native ledger cannot mutate old debt delta',l.sql('UPDATE public.credit_ledger_v2 SET delta=1 WHERE credit_account_id='+q(account),False)[0]!=0)
 ck('native account deletion cannot orphan history',l.sql('DELETE FROM public.credit_accounts_v2 WHERE id='+q(account),False)[0]!=0)
 (E/'METADATA-BOUNDARY-RESULTS.json').write_text(json.dumps({'status':'PASS','count':len(checks),'checks':checks},indent=2));print('PASS '+str(len(checks)))
finally:
 if l.PORT:l.tool('pg_ctl',['-D',str(l.CLUSTER),'-m','fast','-w','stop'])
