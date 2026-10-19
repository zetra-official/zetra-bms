from common import *
x=query('owner-proposed-test-actor',E/'OWNER-TEST-ACTOR-READONLY.sql')
# Raw aggregate/schema evidence remains private. Never emit emails or customer rows.
summary={'matchedCount':x['matchedCount'],'actorIds':[a['id'] for a in x['actors']],'membershipCount':len(x['memberships']),'storesInMemberOrganizations':x['storesInMemberOrganizations'],'rolloutEnabled':x['rolloutEnabled']}
print(json.dumps(summary))
