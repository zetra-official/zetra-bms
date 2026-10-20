"""Local exact static export + fixed official FX proxy. No write endpoints."""
from pathlib import Path
from http.server import SimpleHTTPRequestHandler,ThreadingHTTPServer
from urllib.request import Request,urlopen
from urllib.parse import urlparse
import mimetypes
E=Path(__file__).resolve().parent;ROOT=E/'isolated-web-build'
class Handler(SimpleHTTPRequestHandler):
 def __init__(self,*args,**kwargs):super().__init__(*args,directory=str(ROOT),**kwargs)
 def do_POST(self):self.send_error(405,'No local write endpoints')
 def do_GET(self):
  providers={'/api/reference-fx/bot':'https://bot.go.tz/ExchangeRate/excRates?lang=en','/api/reference-fx/ecb':'https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml'}
  path=urlparse(self.path).path
  if path in providers:
   try:
    with urlopen(Request(providers[path],headers={'User-Agent':'ZETRA-local-dashboard-acceptance'}),timeout=30) as r:
     data=r.read(400001);assert len(data)<=400000;self.send_response(r.status);self.send_header('Content-Type',r.headers.get('Content-Type','text/plain'));self.send_header('Cache-Control','no-store');self.end_headers();self.wfile.write(data)
   except Exception:self.send_error(502,'Reference provider unavailable')
   return
  local=ROOT/path.lstrip('/')
  if not local.exists() and not Path(path).suffix:
   self.path=path+'.html' if (ROOT/(path.lstrip('/')+'.html')).exists() else '/index.html'
  return super().do_GET()
ThreadingHTTPServer(('127.0.0.1',55640),Handler).serve_forever()
