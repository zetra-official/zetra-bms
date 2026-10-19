from pathlib import Path
import sys,json
sys.dont_write_bytecode=True;sys.path.insert(0,str(Path('engineering/currency-owner-execution-20261019').resolve()));import runtime as r
E=Path(__file__).resolve().parent;r.c.E=E
assert (Path('supabase/.temp/project-ref').read_text().strip())=='dcmhqdckzhbuakvcyjit'
v=r.query('production-context-compatibility',E/'PRODUCTION-COMPATIBILITY-READONLY.sql')
assert not any(x['column']=='currency_context' for x in v['columns'])
assert not any(x['identity'].startswith('backend_core.capture_financial_currency_v1') for x in v['functions'])
assert all(x['enabled'] for x in v['rls'])
(E/'PRODUCTION-COMPATIBILITY-RESULT.json').write_text(json.dumps({'at':r.now(),'project':'dcmhqdckzhbuakvcyjit','status':'ADDITIVE_COLUMN_AND_TRIGGER_NAMES_AVAILABLE','metadataOnly':True,'customerRowsRead':False,'productionWrites':False,'nativePostingActivation':'NOT AUTHORIZED','limitations':'Catalog compatibility only, not release approval or financial certification','functions':v['functions'],'rls':v['rls']},indent=2));print('Production metadata-only compatibility PASS; no writes')
