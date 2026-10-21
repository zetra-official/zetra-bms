from local_env import *
cfg=json.loads((E/'runtime.private.json').read_text());checks=[]
for role in ['owner','admin','staff','cashier','other_org','no_membership']:
 a=cfg['actors'][role];s,r=request('http://127.0.0.1:55772/token?grant_type=password',{'email':a['email'],'password':cfg['password']});assert s==200
 s,ref=request('http://127.0.0.1:55772/token?grant_type=refresh_token',{'refresh_token':r['refresh_token']});assert s==200 and ref['user']['id']==a['id']
 s,org=request('http://127.0.0.1:55773/rpc/get_my_orgs',{},ref['access_token']);assert s==200
 target='21000000-0000-4000-8000-'+('000000000101' if role=='other_org' else '000000000100')
 ok=(org==[] if role=='no_membership' else any(x['organization_id']==target for x in org));assert ok
 checks.append({'role':role,'passwordLogin':'PASS','actualRefreshGrant':'PASS','postRefreshWorkspaceScope':'PASS'})
(E/'SESSION-LIFECYCLE.json').write_text(json.dumps({'checks':checks,'pass':18,'fail':0,'localOnly':True},indent=2));print('18 PASS: fresh synthetic login, real refresh grant and post-refresh workspace scope')
