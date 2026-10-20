"""Synthetic read-only UI adapter, loopback only. No database connection or financial writers."""
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from pathlib import Path
from urllib.parse import urlparse,parse_qs
from urllib.request import Request,urlopen
import json,time,base64,uuid,threading
E=Path(__file__).resolve().parent
ID=lambda x:str(uuid.uuid5(uuid.NAMESPACE_URL,'zetra-ui-refinement-'+x))
U=ID('user');O=[ID('org-a'),ID('org-b')];S=[ID('store-a'),ID('store-b')];P=ID('product')
user={'id':U,'email':'synthetic@example.invalid','aud':'authenticated','role':'authenticated','email_confirmed_at':'2026-01-01T00:00:00Z','confirmed_at':'2026-01-01T00:00:00Z','user_metadata':{},'app_metadata':{'provider':'email'}}
log=[];lock=threading.Lock()
def session():
 exp=int(time.time())+86400;b=lambda v:base64.urlsafe_b64encode(json.dumps(v).encode()).decode().rstrip('=')
 return {'access_token':b({'alg':'HS256'})+'.'+b({'sub':U,'exp':exp,'role':'authenticated','aud':'authenticated'})+'.SYNTHETIC','refresh_token':'SYNTHETIC-LOCAL','token_type':'bearer','expires_at':exp,'expires_in':86400,'user':user}
class H(SimpleHTTPRequestHandler):
 def __init__(self,*a,**k):super().__init__(*a,directory=str(E/'local-web-build'),**k)
 def log_message(self,*a):pass
 def list_directory(self,p):self.send_error(403);return None
 def send(self,data,status=200,ctype='application/json'):
  b=json.dumps(data).encode() if ctype=='application/json' else data;self.send_response(status);self.send_header('Content-Type',ctype);self.send_header('Access-Control-Allow-Origin','*');self.send_header('Access-Control-Allow-Headers','*');self.send_header('Cache-Control','no-store');self.end_headers();self.wfile.write(b)
 def do_OPTIONS(self):self.send_response(204);self.send_header('Access-Control-Allow-Origin','*');self.send_header('Access-Control-Allow-Headers','*');self.send_header('Access-Control-Allow-Methods','GET,POST,OPTIONS');self.end_headers()
 def do_POST(self):
  p=urlparse(self.path).path;body=json.loads(self.rfile.read(int(self.headers.get('Content-Length','0'))) or b'{}')
  if p.startswith('/auth/v1/token'):return self.send(session())
  if p.startswith('/rest/v1/rpc/'):return self.rpc(p.rsplit('/',1)[-1],body)
  self.send({'message':'LOCAL_WRITES_DENIED'},405)
 def rpc(self,n,b):
  with lock:log.append({'name':n,'args':b});(E/'synthetic-rpc-log.json').write_text(json.dumps(log,indent=2))
  if n not in ['ensure_my_store_access','proforma_document_page_v1'] and not n.startswith(('get_','is_','has_','list_')):return self.send({'message':'LOCAL_FINANCIAL_WRITES_DENIED'},405)
  idx=1 if b.get('p_org_id')==O[1] or b.get('p_organization_id')==O[1] or b.get('p_store_id')==S[1] else 0
  amount=250000 if idx==0 else 500000
  product={'id':P,'product_id':P,'name':'Synthetic Display Item','sku':'SYNTHETIC','unit':'piece','selling_price':250000,'cost_price':100000,'qty':100,'is_active':True}
  data=[]
  if n=='proforma_document_page_v1':data={'organizationId':b['p_org'],'storeId':b['p_store'],'rows':[{'id':ID(b['p_store']+str(i)),'reference':'SYNTHETIC-UI-00'+str(i+1),'revision':1,'status':status,'currency':'TZS','total':'250000'} for i,status in enumerate(['PENDING','ACCEPTED'])],'nextBefore':None}
  elif n=='get_my_orgs':data=[{'organization_id':o,'organization_name':'SYNTHETIC ORG '+str(i+1),'role':'owner'} for i,o in enumerate(O)]
  elif n.startswith('get_my_stores'):data=[{'store_id':s,'store_name':'Synthetic Store '+str(i+1),'organization_id':O[i],'store_type':'STANDARD','is_allowed':True} for i,s in enumerate(S)]
  elif n=='get_org_accounting_currency_v1':return self.send({'message':'ACCOUNTING_CURRENCY_UNCONFIRMED','code':'P0001'},400)
  elif n in ['get_sales','get_sales_v2','get_sales_v3']:data=[{'id':ID('sale-'+str(idx)),'sale_id':ID('sale-'+str(idx)),'store_id':S[idx],'organization_id':O[idx],'total_amount':str(amount),'paid_amount':str(amount),'currency':'TZS','status':'completed','created_at':time.strftime('%Y-%m-%dT09:00:00Z'),'payment_method':'CASH','total_cogs':'100000','balance':0}]
  elif n=='get_sales_payment_summary_v1':data=[{'cash_total':amount,'grand_paid_total':amount,'total_balance':0}]
  elif n.startswith('get_expense_summary'):data=[{'total':10000,'count':1}]
  elif n=='get_store_net_profit_v2':data=[{'net_profit':140000,'sales_total':amount,'expenses_total':10000}]
  elif n=='get_stock_on_hand_value_v1':data=[{'stock_value':1000000}]
  elif n=='get_sales_channel_summary_v3':data=[{'channel':'CASH','revenue':amount,'orders':1}]
  elif n.startswith('get_credit_collections_summary'):data=[{'total':0,'cash':0,'bank':0,'mobile':0,'other':0}]
  elif n.startswith('get_expense_channel_summary'):data=[{'channel':'CASH','amount':10000}]
  elif n in ['get_store_sale_items','get_products_manage','get_products']:data=[product]
  return self.send(data)
 def do_GET(self):
  p=urlparse(self.path).path
  if p=='/auth/v1/user':return self.send(user)
  if p.startswith('/rest/v1/rpc/'):return self.rpc(p.rsplit('/',1)[-1],{})
  if p.startswith('/rest/v1/'):
   table=p.rsplit('/',1)[-1];data=[]
   if table=='profiles':data={'id':U,'is_disabled':False,'full_name':'Synthetic Owner'}
   elif table=='stores':data={'id':S[0],'sales_mode':'DIRECT','store_type':'STANDARD','organization_id':O[0]}
   elif table=='inventory':data=[{'product_id':P,'qty':100}]
   return self.send(data)
  providers={'/api/reference-fx/bot':'https://bot.go.tz/ExchangeRate/excRates?lang=en','/api/reference-fx/ecb':'https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml'}
  if p in providers:
   try:
    with urlopen(Request(providers[p],headers={'User-Agent':'ZETRA-local-display-acceptance'}),timeout=20) as r:
     raw=r.read(400001);assert len(raw)<=400000;return self.send(raw,200,r.headers.get('Content-Type','text/plain'))
   except Exception:return self.send({'message':'VERIFIED_RATE_UNAVAILABLE'},502)
  target=E/'local-web-build'/p.lstrip('/')
  if not target.exists() and not Path(p).suffix:self.path=p+'.html' if (E/'local-web-build'/(p.lstrip('/')+'.html')).exists() else '/index.html'
  super().do_GET()
(E/'LOCAL-ENVIRONMENT.json').write_text(json.dumps({'url':'http://127.0.0.1:55650','auth':'synthetic adapter, not genuine Supabase Auth','organizationIds':O,'storeIds':S,'financialWriters':False,'remoteDatabase':False},indent=2))
ThreadingHTTPServer(('127.0.0.1',55650),H).serve_forever()
