from pathlib import Path
import sys,json
sys.dont_write_bytecode=True;sys.path.insert(0,str(Path('engineering/currency-onboarding-20261018').resolve()));import local as l
sys.path.insert(0,str(Path('engineering/currency-owner-execution-20261019').resolve()));from runtime import localmeta
E=Path(__file__).resolve().parent;l.E=E;l.CLUSTER=E/'disposable-currency-context-v2'
try:
 l.PORT=l.start();local=json.loads(l.sql((E/'PRODUCTION-COMPATIBILITY-READONLY.sql').read_text(encoding='utf-8-sig'))[1]);remote=localmeta(E/'production-context-compatibility.private.json')
 clean=lambda rows,key:sorted([x for x in rows if x.get('column')!='currency_context' and x.get('name')!='financial_currency_context_v1' and not x.get('identity','').startswith('backend_core.capture_financial_currency_v1')],key=lambda x:str(x[key]))
 result={'columns':clean(local['columns'],'column')==clean(remote['columns'],'column'),'authorityColumns':local['authorityColumns']==remote['authorityColumns'],'rpcDefinitions':clean(local['functions'],'identity')==clean(remote['functions'],'identity'),'existingTriggers':clean(local['triggers'],'name')==clean(remote['triggers'],'name'),'existingRlsFlags':local['rls']==remote['rls'],'productionWrites':False,'scope':'Exact touched catalog objects; customer rows not inspected'}
 (E/'SCHEMA-COMPARISON.json').write_text(json.dumps(result,indent=2));print(json.dumps(result))
finally:
 if l.PORT:l.tool('pg_ctl',['-D',str(l.CLUSTER),'-m','fast','-w','stop'])
