from pathlib import Path
import sys,socket,json,threading,http.server,uuid,subprocess
sys.dont_write_bytecode=True;sys.path.insert(0,str(Path(__file__).parent));import test_local as t
E=t.ROOT/'engineering/release/proforma-workflow';E.mkdir(exist_ok=True);base=t.BASE/'main-project-release/proforma-normal';cluster=max((p for p in base.glob('clone-*') if p.is_dir() and not(p/'postmaster.pid').exists()),key=lambda p:p.stat().st_ctime)
with socket.socket() as s:s.bind(('127.0.0.1',0));t.PORT=s.getsockname()[1]
I=lambda n:str(uuid.uuid5(uuid.NAMESPACE_URL,'zetra-normal-proforma-'+str(n)));actor=I(1);q=t.lit;started=False;report={'status':'FAIL','remoteConnections':0}
try:
 r=t.pg.tool('pg_ctl',['-D',str(cluster),'-l',str(cluster.with_suffix('.workflow.log')),'-o',f'-h 127.0.0.1 -p {t.PORT} -c archive_mode=off -c shared_preload_libraries=','-w','start']);assert r.returncode==0;started=True;before=t.financial();ctx=json.loads(t.read('SELECT public.proforma_document_context_v1('+q(I(100))+','+q(I(200))+')',actor));ctx['evidence']=str(E);f=E/'connected-context.json';f.write_text(json.dumps(ctx))
 class Bridge(http.server.BaseHTTPRequestHandler):
  def log_message(self,*args):pass
  def do_POST(self):
   body=json.loads(self.rfile.read(min(int(self.headers.get('Content-Length','0')),131072)));name=body['name'];args=body['args'];names={'proforma_document_context_v1':['p_org','p_store','p_search','p_product_ids'],'proforma_document_page_v1':['p_org','p_store','p_before','p_limit'],'proforma_document_get_v1':['p_org','p_store','p_document'],'proforma_document_save_v1':['p_org','p_store','p_request','p_document','p_expected','p_operation','p_body']}
   if name not in names:self.send_response(403);self.end_headers();return
   def value(v):
    if v is None:return 'NULL'
    if isinstance(v,dict):return q(json.dumps(v))+'::jsonb'
    if isinstance(v,list):return 'ARRAY['+','.join(q(x) for x in v)+']::uuid[]'
    return q(v)
   r=t.sql('SELECT public.'+name+'('+','.join(value(args.get(k)) for k in names[name])+')',actor,False);result={'data':json.loads(r.stdout.strip()),'error':None} if not r.returncode else {'data':None,'error':{'message':r.stderr[-1200:],'code':'P0001'}};self.send_response(200);self.send_header('Content-Type','application/json');self.send_header('Access-Control-Allow-Origin','*');self.end_headers()
   try:self.wfile.write(json.dumps(result).encode())
   except (BrokenPipeError,ConnectionAbortedError):pass
 server=http.server.ThreadingHTTPServer(('127.0.0.1',0),Bridge);threading.Thread(target=server.serve_forever,daemon=True).start()
 try:
  r=subprocess.run(['node','tests/release/proforma-workflow-render.cjs',str(f),'http://127.0.0.1:'+str(server.server_address[1])],cwd=t.ROOT,capture_output=True,text=True,encoding='utf-8',timeout=150);(E/'render.private.log').write_text(r.stdout+r.stderr,encoding='utf-8');assert r.returncode==0,r.stderr[-2400:];assert before==t.financial(),'FINANCIAL_FINGERPRINT_CHANGED';report.update(status='PASS',financialFingerprintUnchanged=True,actualDatabase=True)
 finally:server.shutdown();server.server_close()
finally:
 if started:t.pg.tool('pg_ctl',['-D',str(cluster),'-m','fast','-w','stop'])
 report['stopped']=not(cluster/'postmaster.pid').exists();(E/'workflow-postgres-result.json').write_text(json.dumps(report,indent=2));print(json.dumps(report))
