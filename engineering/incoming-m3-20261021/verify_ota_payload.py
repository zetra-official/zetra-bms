import json,hashlib,urllib.request,email.parser,email.policy,base64
from pathlib import Path
E=Path(__file__).resolve().parent;D=E/'production-20261021';root=Path(json.loads((D/'BUILD-android.json').read_text())['artifact']);expected=json.loads((D/'ANDROID-AFTER.json').read_text())['latestAndroid'][0]
op=urllib.request.build_opener()
req=urllib.request.Request('https://u.expo.dev/a8536709-2bea-40f4-8dd7-01563bd08c70',headers={'expo-platform':'android','expo-runtime-version':'1.0.0','expo-channel-name':'production','expo-protocol-version':'1','User-Agent':'okhttp/4.12.0'})
with op.open(req,timeout=90) as r:raw=r.read();ctype=r.headers['Content-Type']
extensions={}
if raw.startswith(b'--') and b'Content-Disposition:' in raw[:200]:ctype='multipart/mixed; boundary="'+raw.split(b'\r\n',1)[0][2:].decode('ascii')+'"'
if 'multipart' in ctype:
 msg=email.parser.BytesParser(policy=email.policy.default).parsebytes(('Content-Type: '+ctype+'\r\nMIME-Version: 1.0\r\n\r\n').encode()+raw);candidates=[]
 for part in msg.walk():
  if part.is_multipart():continue
  try:v=json.loads(part.get_payload(decode=True))
  except Exception:continue
  if isinstance(v,dict) and 'launchAsset' in v:candidates.append(v)
  elif isinstance(v,dict) and 'assetRequestHeaders' in v:extensions=v
 assert len(candidates)==1;m=candidates[0]
else:m=json.loads(raw)
assert m['id']==expected['id'] and m['runtimeVersion']=='1.0.0'
(D/'ota-manifest.private.json').write_text(json.dumps(m,indent=2),encoding='utf-8')
meta=json.loads((root/'metadata.json').read_text())['fileMetadata']['android'];want=hashlib.sha256((root/meta['bundle']).read_bytes()).hexdigest();assert m['launchAsset']['url'].startswith('https://')
headers=extensions.get('assetRequestHeaders',{}).get(m['launchAsset']['key'],{});assert isinstance(headers,dict)
with op.open(urllib.request.Request(m['launchAsset']['url'],headers={'User-Agent':'okhttp/4.12.0',**headers}),timeout=120) as r:got=hashlib.sha256(r.read()).hexdigest()
assert want==got,'Delivered bundle mismatch'
localAssets={hashlib.sha256((root/a['path']).read_bytes()).digest() for a in meta['assets']};remoteAssets={base64.urlsafe_b64decode(a['hash']+'='*((4-len(a['hash'])%4)%4)) for a in m['assets']};assert localAssets==remoteAssets,'Asset set mismatch'
result={'status':'PASS','updateId':m['id'],'group':expected['group'],'runtimeVersion':'1.0.0','channel':'production','expectedBundleSha256':want,'deliveredBundleSha256':got,'uniqueAssetsVerified':len(localAssets),'financialWrites':False,'physicalDevice':'NOT TESTED'}
(D/'OTA-NETWORK-PROOF.json').write_text(json.dumps(result,indent=2),encoding='utf-8');print(json.dumps(result))
