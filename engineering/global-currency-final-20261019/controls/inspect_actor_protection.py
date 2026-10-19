from common import *
x=localmeta(E/'owner-proposed-test-actor.private.json')
assert x['matchedCount']==1,'AMBIGUOUS_ACTOR'
actor=x['actors'][0]
assert actor['id']=='bb2d6dee-773d-4fa7-8fda-1eb85bbad2cd'
tables=['sales','sale_payments','inventory','stock_movements','expenses','cashier_shifts','field_wallets']
for table in tables:assert any(c['schema']=='public' and c['table']==table and c['column']=='organization_id' for c in x['relatedColumns'])
fields=','.join("'%s',EXISTS(SELECT 1 FROM public.%s r WHERE r.organization_id IN(SELECT organization_id FROM member_orgs))"%(t,t) for t in tables)
sql="BEGIN READ ONLY;SET LOCAL statement_timeout='10s';WITH actor AS(SELECT id FROM auth.users WHERE lower(email)=lower('majaribiopro@gmail.com') AND id='bb2d6dee-773d-4fa7-8fda-1eb85bbad2cd'::uuid),member_orgs AS(SELECT organization_id FROM public.org_memberships m JOIN actor a ON m.user_id=a.id) SELECT jsonb_build_object("+fields+") metadata;ROLLBACK;"
f=E/'ACTOR-PROTECTION-READONLY.sql';f.write_text(sql,encoding='utf-8')
protection=query('actor-protected-record-presence',f)
roles={}
for membership in x['memberships']:
 key=membership['role']+(' (active)' if membership['active'] else ' (inactive)');roles[key]=roles.get(key,0)+1
summary={'actorId':actor['id'],'auth':{k:actor[k] for k in ['email_confirmed','deleted','banned','is_anonymous','role','providers']},'membershipCount':len(x['memberships']),'roles':roles,'storesInMemberOrganizations':x['storesInMemberOrganizations'],'protectedRecordPresence':protection,'trainingOnlyVerified':False,'canaryActivated':False,'status':'IDENTITY VERIFIED — ELIGIBILITY BLOCKED PENDING TRAINING-SCOPE CONFIRMATION'}
(E/'OWNER-TEST-ACTOR-RESULT.json').write_text(json.dumps(summary,indent=2));print(json.dumps(summary))
