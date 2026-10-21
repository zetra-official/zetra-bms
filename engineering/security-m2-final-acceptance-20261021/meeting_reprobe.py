from local_env import *
cfg=json.loads((E/'runtime.private.json').read_text());p=E/'PUBLIC-FILE-DISCOVERY-REPRO.json';result=json.loads(p.read_text());results=[result['results'][0]]
for actor in ['other_org','no_membership']:
 a=cfg['actors'][actor];s,r=request('http://127.0.0.1:55772/token?grant_type=password',{'email':a['email'],'password':cfg['password']});assert s==200;a['session']=r
 s,r=request('http://127.0.0.1:55773/rpc/get_meeting_room_messages_v7',{'p_room_id':'21000000-0000-4000-8000-000000001200'},a['session']['access_token']);results.append({'actor':actor,'http':s,'syntheticPrivateMessageAndAttachmentExposed':s==200 and any(x.get('id')=='21000000-0000-4000-8000-000000001201' for x in r),'freshRealAuth':True})
result['results']=results;result['expiredTokenProbeExcluded']=True;p.write_text(json.dumps(result,indent=2));(E/'runtime.private.json').write_text(json.dumps(cfg,indent=2));print(json.dumps(results))
