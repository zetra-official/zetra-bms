import json,hashlib,urllib.request,email.parser,email.policy
from pathlib import Path
D=Path(__file__).resolve().parent;E=D.parent
expected=json.loads((D/'android-channel-after.json').read_text())['latestAndroid'][0]
op=urllib.request.build_opener()
req=urllib.request.Request('https://u.expo.dev/a8536709-2bea-40f4-8dd7-01563bd08c70',headers={'expo-platform':'android','expo-runtime-version':'1.0.0','expo-channel-name':'production','expo-protocol-version':'1','User-Agent':'okhttp/4.12.0'})
with op.open(req,timeout=90) as r:raw=r.read();ctype=r.headers['Content-Type']
if raw.startswith(b'--') and b'Content-Disposition:' in raw[:200]:
 ctype='multipart/mixed; boundary="'+raw.split(b'\r\n',1)[0][2:].decode('ascii')+'"'
if 'multipart' in ctype:
 msg=email.parser.BytesParser(policy=email.policy.default).parsebytes(('Content-Type: '+ctype+'\r\nMIME-Version: 1.0\r\n\r\n').encode()+raw)
 candidates=[];extensions={}
 for part in msg.walk():
  if part.is_multipart():continue
  try:v=json.loads(part.get_payload(decode=True))
  except Exception:continue
  if isinstance(v,dict) and 'launchAsset' in v:candidates.append(v)
  elif isinstance(v,dict) and 'assetRequestHeaders' in v:extensions=v
 assert len(candidates)==1;m=candidates[0]
else:m=json.loads(raw)
assert m['id']==expected['id'] and m['runtimeVersion']=='1.0.0'
(D/'ota-manifest.private.json').write_text(json.dumps(m,indent=2))
meta=json.loads((E/'release-artifact-android/metadata.json').read_text())['fileMetadata']['android']
local=E/'release-artifact-android'/meta['bundle'];want=hashlib.sha256(local.read_bytes()).hexdigest()
assert m['launchAsset']['url'].startswith('https://')
headers=extensions.get('assetRequestHeaders',{}).get(m['launchAsset']['key'],{})
assert isinstance(headers,dict)
request=urllib.request.Request(m['launchAsset']['url'],headers={'User-Agent':'okhttp/4.12.0',**headers})
with op.open(request,timeout=120) as r:got=hashlib.sha256(r.read()).hexdigest()
assert want==got,'DELIVERED_BUNDLE_MISMATCH'
localAssets={hashlib.sha256((E/'release-artifact-android'/a['path']).read_bytes()).digest() for a in meta['assets']}
import base64
remoteAssets={base64.urlsafe_b64decode(a['hash']+'='*((4-len(a['hash'])%4)%4)) for a in m['assets']}
assert localAssets==remoteAssets,'ASSET_SET_MISMATCH'
result={'status':'PASS','updateId':m['id'],'group':expected['group'],'runtimeVersion':'1.0.0','channel':'production','project':'a8536709-2bea-40f4-8dd7-01563bd08c70','expectedBundleSha256':want,'deliveredBundleSha256':got,'uniqueAssetsVerified':len(localAssets),'financialWrites':False}
(D/'ota-network-proof.json').write_text(json.dumps(result,indent=2));print(json.dumps(result))
