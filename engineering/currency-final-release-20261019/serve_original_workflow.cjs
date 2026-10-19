// Real upstream Auth -> actual product source component -> whitelisted local SQL.
const fs=require('fs'),path=require('path'),http=require('http'),{spawn}=require('child_process'),esbuild=require('esbuild'),dotenv=require('dotenv');
const E=__dirname,root=process.cwd(),env={},actor='bb2d6dee-773d-4fa7-8fda-1eb85bbad2cd';
for(const f of ['.env','.env.local'])if(fs.existsSync(f))Object.assign(env,dotenv.parse(fs.readFileSync(f)));
const url=env.EXPO_PUBLIC_SUPABASE_URL,key=env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
if(url!=='https://dcmhqdckzhbuakvcyjit.supabase.co'||!key)throw Error('PUBLIC_AUTH_TARGET_MISMATCH');
if(key.startsWith('eyJ')&&JSON.parse(Buffer.from(key.split('.')[1],'base64url')).role!=='anon')throw Error('PRIVILEGED_KEY_REJECTED');
if(!key.startsWith('eyJ')&&!key.startsWith('sb_publishable_'))throw Error('INVALID_PUBLIC_KEY');
const events=fs.existsSync(path.join(E,'ORIGINAL-WORKFLOW-RUNTIME-EVENTS.json'))?JSON.parse(fs.readFileSync(path.join(E,'ORIGINAL-WORKFLOW-RUNTIME-EVENTS.json'))).events:[],pending=new Map();let serial=0,ready,child,server;
const sourceHashes=Object.fromEntries(['src/currency/OriginalRefundForm.tsx','src/currency/originalWorkflow.ts'].map(p=>[p,require('crypto').createHash('sha256').update(fs.readFileSync(path.join(root,p))).digest('hex')]));
const entry=`import React from'react';import{createRoot}from'react-dom/client';import{createClient}from'@supabase/supabase-js';import{OriginalRefundForm}from'./src/currency/OriginalRefundForm';
const auth=createClient(${JSON.stringify(url)},${JSON.stringify(key)},{auth:{storageKey:'zetra-local-financial-acceptance',persistSession:true,detectSessionInUrl:false}});
async function request(route,body={}){const{data}=await auth.auth.getSession();if(!data.session)throw Error('Sign in privately using the existing local acceptance session');const r=await fetch(route,{method:'POST',headers:{Authorization:'Bearer '+data.session.access_token,'Content-Type':'application/json'},body:JSON.stringify(body)});const value=await r.json();if(!r.ok)throw Error(value.error||'Local acceptance unavailable');return value}
const storage={getItem:async k=>localStorage.getItem(k),setItem:async(k,v)=>localStorage.setItem(k,v),removeItem:async k=>localStorage.removeItem(k)};
const port={rpc:(name,args)=>request('/rpc',{name,args})};
function App(){const[scenes,setScenes]=React.useState([]),[selected,setSelected]=React.useState(0),[state,setState]=React.useState('Verifying genuine Auth…'),[receipt,setReceipt]=React.useState(null);
 React.useEffect(()=>{request('/scenarios').then(v=>{setScenes(v.scenarios);setState('GENUINE AUTH VERIFIED — actual OriginalRefundForm source; disposable synthetic financial records only.')}).catch(e=>setState(e.message))},[]);
 const s=scenes[selected];return <main><h1>ZETRA · Original refund acceptance</h1><p>Actual product source component. Local financial transport and synthetic saved tax evidence. This does not certify deployed navigation, a Production tax provider or physical Android sharing.</p><p role="status">{state}</p>{s&&<><label>Currency<select aria-label="Currency" value={selected} onChange={e=>{setSelected(Number(e.target.value));setReceipt(null)}}>{scenes.map((v,i)=><option key={v.currency} value={i}>{v.currency}</option>)}</select></label><OriginalRefundForm key={s.saleId} port={port} storage={storage} actorId=${JSON.stringify(actor)} organizationId={s.organizationId} storeId={s.storeId} saleId={s.saleId} shiftId={null} language="en" makeRequestId={()=>crypto.randomUUID()} onPosted={r=>setReceipt(r)}/></>}{receipt&&<pre aria-label="Refund receipt">{JSON.stringify(receipt,null,2)}</pre>}</main>};createRoot(document.getElementById('root')).render(<App/>);`;
(async()=>{
 const compiled=await esbuild.build({stdin:{contents:entry,resolveDir:root,loader:'tsx'},bundle:true,write:false,platform:'browser',format:'iife',resolveExtensions:['.web.tsx','.web.ts','.web.jsx','.web.js','.tsx','.ts','.jsx','.js','.json'],alias:{'react-native':'react-native-web'},define:{'process.env.NODE_ENV':'"production"'}});
 if(process.argv.includes('--build-only')){console.log(JSON.stringify({status:'PASS',bundleBytes:compiled.outputFiles[0].contents.length,sourceHashes}));return;}
 child=spawn('C:/Users/ZetraAdmin/AppData/Local/Programs/Python/Python314/python.exe',[path.join(E,'original_workflow_runtime.py')],{cwd:root,windowsHide:true,stdio:['pipe','pipe','pipe']});
 let buffer='';const prepared=new Promise((resolve,reject)=>{child.stdout.on('data',bytes=>{buffer+=bytes;let n;while((n=buffer.indexOf('\n'))>=0){const raw=buffer.slice(0,n);buffer=buffer.slice(n+1);try{const v=JSON.parse(raw);if(v.ready){ready=v;resolve(v)}else{const task=pending.get(v.id);if(task){pending.delete(v.id);task.resolve(v)}}}catch{reject(Error('LOCAL_WORKER_PROTOCOL_FAILURE'))}}});child.on('error',reject);child.on('exit',code=>{reject(Error('LOCAL_WORKER_EXIT_'+code));for(const p of pending.values())p.reject(Error('LOCAL_WORKER_EXIT'));pending.clear()})});
 child.stderr.on('data',b=>fs.appendFileSync(path.join(E,'workflow-server.stderr.log'),b));
 await prepared;
 const html='<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ZETRA Original Refund Acceptance</title><style>body{font:16px system-ui;background:#f1f5f9;color:#102d40}main{max-width:840px;margin:20px auto;padding:16px}select{font:inherit;padding:12px;margin:8px}pre{white-space:pre-wrap;overflow-wrap:anywhere}p{line-height:1.5}</style><div id="root"></div><script src="/client.js"></script></html>';
 const rpc=(name,args)=>new Promise((resolve,reject)=>{const id=++serial;pending.set(id,{resolve,reject});child.stdin.write(JSON.stringify({id,actor,name,args})+'\n')});
 server=http.createServer(async(req,res)=>{
  const origin='http://127.0.0.1:'+server.address().port;
  res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Content-Security-Policy',`default-src 'self';connect-src 'self' ${url};script-src 'self';style-src 'self' 'unsafe-inline';frame-ancestors 'none';form-action 'none'`);
  const reply=(status,value)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(value))};
  if(req.headers.host!==new URL(origin).host)return reply(403,{error:'HOST_DENIED'});
  if(req.method==='GET'&&req.url==='/'){res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(html)}
  if(req.method==='GET'&&req.url==='/client.js'){res.setHeader('Content-Type','application/javascript');return res.end(compiled.outputFiles[0].text)}
  if(req.method!=='POST'||!['/scenarios','/rpc'].includes(req.url))return reply(404,{error:'NOT_FOUND'});
  if(req.headers.origin!==origin)return reply(403,{error:'ORIGIN_DENIED'});
  const authorization=req.headers.authorization;if(typeof authorization!=='string'||!/^Bearer [A-Za-z0-9_.-]+$/.test(authorization)||authorization.length>12000)return reply(401,{error:'AUTH_REQUIRED'});
  try{
   const verified=await fetch(url+'/auth/v1/user',{headers:{apikey:key,Authorization:authorization},signal:AbortSignal.timeout(12000)});
   if(!verified.ok)return reply(401,{error:'AUTH_VERIFICATION_FAILED'});
   if((await verified.json()).id!==actor)return reply(403,{error:'APPROVED_ACTOR_REQUIRED'});
   if(req.url==='/scenarios')return reply(200,{actor,scenarios:ready.scenarios});
   let body='';for await(const chunk of req){body+=chunk;if(body.length>12000)return reply(413,{error:'REQUEST_TOO_LARGE'})}
   const input=JSON.parse(body);if(!['get_original_refund_sale_v1','refund_original_sale_v1'].includes(input.name))return reply(403,{error:'RPC_NOT_ALLOWED'});
   const value=await rpc(input.name,input.args);events.push({at:new Date().toISOString(),runtimeId:ready.runtimeId,sourceHashes,actor,rpc:input.name,args:input.args,data:value.data,error:value.error,auth:'Real Supabase GET /auth/v1/user',financialTarget:'DISPOSABLE_LOCAL_POSTGRESQL'});
   fs.writeFileSync(path.join(E,'ORIGINAL-WORKFLOW-RUNTIME-EVENTS.json'),JSON.stringify({scope:'Actual component / real Auth / synthetic local financial fixtures',events,productionFinancialWrites:false},null,2));
   return reply(200,{data:value.data,error:value.error});
  }catch{return reply(503,{error:'LOCAL_WORKFLOW_UNAVAILABLE_NO_PRODUCTION_FINANCIAL_REQUEST_SENT'})}
 });
 server.listen(55625,'127.0.0.1',()=>{const v={url:'http://127.0.0.1:55625/',pid:process.pid,workerPid:child.pid,runtimeId:ready.runtimeId,sourceHashes,scope:'Real Auth, actual OriginalRefundForm source, disposable synthetic finance only'};fs.writeFileSync(path.join(E,'ORIGINAL-WORKFLOW-SERVER.json'),JSON.stringify(v,null,2));console.log(JSON.stringify(v))});
 server.on('error',()=>{child.stdin.end();process.exitCode=1});
 process.on('SIGINT',()=>{server.close();child.stdin.end()});
})().catch(e=>{if(child)child.stdin.end();console.error(e.message);process.exitCode=1});
