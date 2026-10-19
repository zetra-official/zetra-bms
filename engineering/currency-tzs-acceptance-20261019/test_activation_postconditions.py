from pathlib import Path
import sys,json
sys.dont_write_bytecode=True;sys.path.insert(0,str(Path('engineering/currency-onboarding-20261018').resolve()))
import local as l
E=Path('engineering/currency-tzs-acceptance-20261019').resolve();l.E=E;l.CLUSTER=E/'disposable'
try:
 l.PORT=l.start()
 actor=l.sql("SELECT a.actor_id FROM backend_core.tzs_onboarding_allowlist a JOIN auth.users u ON u.id=a.actor_id WHERE u.deleted_at IS NULL AND (u.banned_until IS NULL OR u.banned_until<clock_timestamp()) ORDER BY a.actor_id LIMIT 1")[1]
 assert actor
 l.sql("SET zetra.tzs_canary_actor='"+actor+"';SET zetra.tzs_approval='LOCAL_POSTCONDITION_TEST';"+(E/'ACTIVATE-CANARY.DRAFT.sql').read_text())
 assert l.sql("SELECT has_function_privilege('authenticated','public.create_org_with_store_currency_tzs_v1(uuid,text,text,text,text,boolean)','EXECUTE') AND NOT has_function_privilege('anon','public.create_org_with_store_currency_tzs_v1(uuid,text,text,text,text,boolean)','EXECUTE')")[1]=='t'
 l.sql((E/'DISABLE-ROLLBACK.sql').read_text())
 assert l.sql('SELECT NOT enabled FROM backend_core.tzs_onboarding_rollout')[1]=='t'
 (E/'ACTIVATION-POSTCONDITION-RESULTS.json').write_text(json.dumps({'status':'PASS','count':2,'checks':['Exact final activation draft including postconditions passes locally','Exact final disable restores disabled state'],'remoteWrites':False},indent=2));print('PASS 2 postcondition checks')
finally:
 if l.PORT:assert l.tool('pg_ctl',['-D',str(l.CLUSTER),'-m','fast','-w','stop'])[0]==0
