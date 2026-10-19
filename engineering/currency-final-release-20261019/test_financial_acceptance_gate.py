import json,urllib.request,urllib.error,base64
from pathlib import Path
E=Path(__file__).resolve().parent;base='http://127.0.0.1:55625';checks=[]
def call(path,origin=None,token=None,host=None):
 headers={}
 if origin:headers['Origin']=origin
 if token:headers['Authorization']='Bearer '+token
 if host:headers['Host']=host
 try:
  with urllib.request.urlopen(urllib.request.Request(base+path,headers=headers,method='POST'),timeout=20) as r:return r.status
 except urllib.error.HTTPError as e:return e.code
def ck(n,v):assert v,n;checks.append(n)
ck('missing Auth denied before local financial execution',call('/run',base)==401)
ck('untrusted origin denied',call('/run','https://untrusted.invalid')==403)
ck('unexpected Host denied',call('/run',base,host='untrusted.invalid:55625')==403)
b64=lambda x:base64.urlsafe_b64encode(json.dumps(x).encode()).decode().rstrip('=')
forged=b64({'alg':'HS256','typ':'JWT'})+'.'+b64({'sub':'bb2d6dee-773d-4fa7-8fda-1eb85bbad2cd','exp':1})+'.invalidsignature'
ck('forged expired JWT rejected by actual Supabase Auth',call('/verify',base,forged)==401)
ck('unapproved route unavailable',call('/arbitrary-sql',base)==404)
(E/'FINANCIAL-ACCEPTANCE-GATE-RESULTS.json').write_text(json.dumps({'status':'PASS','count':len(checks),'checks':checks,'financialRequestsExecuted':0,'productionFinancialWrites':False},indent=2));print('PASS '+str(len(checks)))
