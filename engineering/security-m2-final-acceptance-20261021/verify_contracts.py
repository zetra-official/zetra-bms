from local_env import *
cfg=json.loads((E/'runtime.private.json').read_text());db.PORT=cfg['port']
rows=json.loads(sql("SELECT json_agg(json_build_object('schema',n.nspname,'identity',p.oid::regprocedure::text,'definition',pg_get_functiondef(p.oid))) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prokind='f'")[1]);source={f['identity']:f['definition'] for f in rows}
# Compare every protected function against the untouched stopped source by dumping its sealed SQL definition contract shape; preserve exact draft source hashes as authority.
changed=json.loads((B/'FUNCTION-CHANGE-MANIFEST.json').read_text());checks=[]
for f in changed:
 key=f['identity'];definition=source.get(key,source.get('public.'+key,''));checks.append({'identity':key,'present':bool(definition),'exactProtectedDefinition':hashlib.sha256(definition.replace('\r','').encode()).hexdigest()==f['resultSha256'],'containsM2Guard':('security_m2.' in definition or 'm2_owner' in definition or 'jsonb_build_object' in definition)})
(E/'PROTECTED-FUNCTION-PRESERVATION.json').write_text(json.dumps({'localOnly':True,'draftSha256':hashlib.sha256((B/'2026102101-owner-privacy.DRAFT.sql').read_bytes()).hexdigest(),'functions':checks},indent=2));print('Protected definitions:',sum(x['present'] for x in checks),'present;',sum(x['exactProtectedDefinition'] for x in checks),'exact hashes; mismatches:',[x['identity'] for x in checks if not x['exactProtectedDefinition']])
