from runtime import *
s=query('acceptance-persisted',E/'CANARY-STATE-READONLY.sql')
p=query('acceptance-protected',E/'PROTECTED-RECORDS-READONLY.sql')
b=json.loads((E/'PROTECTED-BEFORE.json').read_text())
events=[json.loads(v) for v in (E/'BROWSER-EVENTS.jsonl').read_text().splitlines()]
results=[v['result'] for v in events if v['event']=='GENUINE_ONBOARDING_RESULT']
r={'at':now(),'genuineAuth':any(v['event']=='GENUINE_AUTH_VERIFIED' for v in events),'successfulCalls':len(results),'sameResult':len(results)>=2 and all(x==results[0] for x in results),'persistedQuotaResultMatches':bool(results) and s['quota']['result']==results[0],'organizations':s['orgCount'],'stores':s['storeCount'],'financialRows':s['financialRows'],'serverEnabled':s['enabled'],'unusedPermits':s['permits'],'existingProtectedRecordsUnchanged':p==b,'audit':s['audit'],'liveConcurrency':'NOT TESTED; accepted local concurrency evidence retained','physicalAndroid':'NOT TESTED','pdf':'NOT TESTED'}
(E/'GENUINE-ACCEPTANCE-RESULT.json').write_text(json.dumps(r,indent=2));print(json.dumps(r));assert r['genuineAuth'] and r['sameResult'] and r['persistedQuotaResultMatches'] and r['organizations']==1 and r['stores']==1 and r['financialRows']==0 and not r['serverEnabled'] and r['unusedPermits']==0 and r['existingProtectedRecordsUnchanged']
