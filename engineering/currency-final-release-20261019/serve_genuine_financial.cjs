// Real Supabase Auth, loopback-only synthetic financial acceptance. No Production RPC.
const fs=require('fs'),path=require('path'),http=require('http'),crypto=require('crypto'),{spawn}=require('child_process'),esbuild=require('esbuild'),dotenv=require('dotenv');
const E=__dirname,root=process.cwd(),actor='bb2d6dee-773d-4fa7-8fda-1eb85bbad2cd',env={};
for(const f of ['.env','.env.local'])if(fs.existsSync(f))Object.assign(env,dotenv.parse(fs.readFileSync(f)));
const url=env.EXPO_PUBLIC_SUPABASE_URL,key=env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
if(url!=='https://dcmhqdckzhbuakvcyjit.supabase.co'||!key)throw Error('PUBLIC_TARGET_MISMATCH');
if(key.startsWith('eyJ')&&JSON.parse(Buffer.from(key.split('.')[1],'base64url')).role!=='anon')throw Error('PRIVILEGED_KEY_REJECTED');
if(!key.startsWith('eyJ')&&!key.startsWith('sb_publishable_'))throw Error('INVALID_PUBLIC_KEY');
let running=false,receipt=null;
const entry=`import{createClient}from'@supabase/supabase-js';const auth=createClient(${JSON.stringify(url)},${JSON.stringify(key)},{auth:{storageKey:'zetra-local-financial-acceptance',persistSession:true,detectSessionInUrl:false}});const state=document.getElementById('state'),out=document.getElementById('output'),run=document.getElementById('run');let ready=false;
async function call(route){const {data}=await auth.auth.getSession();const token=data.session?.access_token;if(!token)throw Error('Sign in privately first');const r=await fetch(route,{method:'POST',headers:{Authorization:'Bearer '+token}});const v=await r.json();if(!r.ok)throw Error(v.error||'Acceptance failed');return v}
async function verify(){try{const v=await call('/verify');ready=v.actor===${JSON.stringify(actor)};state.textContent=ready?'GENUINE AUTH VERIFIED — financial target is disposable LOCAL PostgreSQL only.':'Wrong account';run.disabled=!ready;document.getElementById('login').hidden=ready}catch(e){state.textContent=e.message;run.disabled=true}}
document.getElementById('signin').onsubmit=async ev=>{ev.preventDefault();const email=document.getElementById('email').value,p=document.getElementById('password'),password=p.value;p.value='';state.textContent='Signing in securely with Supabase Auth…';const r=await auth.auth.signInWithPassword({email,password});if(r.error){state.textContent=r.error.message;return}await verify()};
run.onclick=async()=>{if(!ready)return;run.disabled=true;state.textContent='Running canonical financial acceptance in LOCAL disposable database…';try{const v=await call('/run');out.textContent=JSON.stringify(v,null,2);state.textContent='Local canonical financial adapter: '+v.status+' — no Production financial writes.'}catch(e){state.textContent=e.message}finally{run.disabled=false}};
document.getElementById('signout').onclick=async()=>{await auth.auth.signOut({scope:'local'});ready=false;run.disabled=true;document.getElementById('login').hidden=false;state.textContent='Signed out locally'};verify();`;
(async()=>{
 const bundle=await esbuild.build({stdin:{contents:entry,resolveDir:root,loader:'js'},bundle:true,write:false,platform:'browser',format:'iife',define:{'process.env.NODE_ENV':'"production"'}});
 const html=`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ZETRA Local Financial Acceptance</title><style>body{font:16px system-ui;max-width:720px;margin:20px auto;padding:18px;background:#eef6f8;color:#122d40}input,button{font:inherit;width:100%;box-sizing:border-box;padding:14px;margin:8px 0}button{background:#08745c;color:white;border:0;border-radius:8px}button:disabled{background:#758886}pre{white-space:pre-wrap;overflow-wrap:anywhere}p{line-height:1.6}</style><h1>ZETRA · Local Financial Acceptance</h1><p>Real Supabase Auth. Synthetic financial records in disposable local PostgreSQL only. No Production sale, payment, organization or stock changes. This adapter does not certify the deployed product UI.</p><p id="state">Checking private session…</p><div id="login"><form id="signin"><label>Email<input id="email" type="email" autocomplete="username" required></label><label>Password<input id="password" type="password" autocomplete="current-password" required></label><button>Sign in privately</button></form></div><button id="run" disabled>Run local financial acceptance</button><button id="signout">Sign out locally</button><pre id="output"></pre><script src="/client.js"></script></html>`;
 const server=http.createServer(async(req,res)=>{
  const origin='http://127.0.0.1:'+server.address().port;
  res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Content-Security-Policy',`default-src 'self';connect-src 'self' ${url};script-src 'self';style-src 'unsafe-inline';frame-ancestors 'none';form-action 'none'`);
  if(req.headers.host!==new URL(origin).host){res.writeHead(403);return res.end()}
  if(req.method==='GET'&&/^\/(?:%E2%81%A0)*\/?$/.test(req.url)){res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(html)}
  if(req.method==='GET'&&req.url==='/client.js'){res.setHeader('Content-Type','application/javascript');return res.end(bundle.outputFiles[0].text)}
  const reply=(status,value)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(value))};
  if(req.method!=='POST'||!['/verify','/run'].includes(req.url))return reply(404,{error:'NOT_FOUND'});
  if(req.headers.origin!==origin)return reply(403,{error:'ORIGIN_DENIED'});
  const authorization=req.headers.authorization;
  if(typeof authorization!=='string'||!/^Bearer [A-Za-z0-9_.-]+$/.test(authorization)||authorization.length>12000)return reply(401,{error:'AUTH_REQUIRED'});
  try{
   const r=await fetch(url+'/auth/v1/user',{headers:{apikey:key,Authorization:authorization},signal:AbortSignal.timeout(12000)});
   if(!r.ok)return reply(401,{error:'AUTH_VERIFICATION_FAILED'});
   const user=await r.json();if(user.id!==actor)return reply(403,{error:'OWNER_APPROVED_ACTOR_REQUIRED'});
   fs.writeFileSync(path.join(E,'GENUINE-FINANCIAL-AUTH-STATUS.json'),JSON.stringify({actor,verifiedAt:new Date().toISOString(),verification:'Real Supabase GET /auth/v1/user',financialTarget:'DISPOSABLE_LOCAL_POSTGRESQL',productionFinancialWrites:false},null,2));
   if(req.url==='/verify')return reply(200,{actor,financialTarget:'DISPOSABLE_LOCAL_POSTGRESQL'});
   if(receipt)return reply(200,receipt);if(running)return reply(409,{error:'ACCEPTANCE_ALREADY_RUNNING'});
   running=true;const request=crypto.randomUUID();
   const child=spawn('C:/Users/ZetraAdmin/AppData/Local/Programs/Python/Python314/python.exe',[path.join(E,'genuine_local_financial.py'),actor,request],{cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe']});
   let output='',error='';child.stdout.on('data',b=>{output+=b});child.stderr.on('data',b=>{error+=b});
   child.on('error',()=>{running=false;reply(500,{error:'LOCAL_RUNNER_UNAVAILABLE'})});
   child.on('close',code=>{running=false;if(code!==0){fs.writeFileSync(path.join(E,'GENUINE-LOCAL-RUNNER-FAILURE.json'),JSON.stringify({at:new Date().toISOString(),exitCode:code,error:'LOCAL_ACCEPTANCE_FAILED',detail:error.replace(/eyJ[\w.-]+/g,'[REDACTED]').slice(-3000)},null,2));return reply(500,{error:'LOCAL_ACCEPTANCE_FAILED_SEE_SANITIZED_RECEIPT'})}try{receipt=JSON.parse(output);receipt.authAcceptance='GENUINE_SUPABASE_AUTH_TO_LOCAL_CANONICAL_SQL_ADAPTER';fs.writeFileSync(path.join(E,'GENUINE-FINANCIAL-ACCEPTANCE.json'),JSON.stringify(receipt,null,2));reply(200,receipt)}catch{reply(500,{error:'LOCAL_RECEIPT_INVALID'})}});
  }catch{return reply(503,{error:'AUTH_NETWORK_UNAVAILABLE_NO_FINANCIAL_REQUEST_SENT'})}
 });
 server.listen(55625,'127.0.0.1',()=>{const info={url:'http://127.0.0.1:55625/',pid:process.pid,scope:'Real Auth; local canonical SQL; no Production financial writes; persistent until Owner completion'};fs.writeFileSync(path.join(E,'FINANCIAL-ACCEPTANCE-SERVER.json'),JSON.stringify(info,null,2));console.log(JSON.stringify(info))});
 server.on('error',e=>{console.error(e.code||'SERVER_FAILURE');process.exitCode=1});
})().catch(()=>{console.error('LOCAL_ACCEPTANCE_BUILD_FAILED');process.exitCode=1});
