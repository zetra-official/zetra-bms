// One negative endpoint check using only the existing public anonymous key.
const fs=require('fs'),path=require('path'),dotenv=require('dotenv');
const E=__dirname,env={};for(const f of ['.env','.env.local'])if(fs.existsSync(f))Object.assign(env,dotenv.parse(fs.readFileSync(f)));
const url=env.EXPO_PUBLIC_SUPABASE_URL,key=env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
if(url!=='https://dcmhqdckzhbuakvcyjit.supabase.co'||!key)throw Error('TARGET_MISMATCH');
if(key.startsWith('eyJ')&&JSON.parse(Buffer.from(key.split('.')[1],'base64url')).role!=='anon')throw Error('NON_ANON_KEY');
const m=JSON.parse(fs.readFileSync('engineering/currency-owner-canary-20261019/CONSOLIDATED-APPROVAL.json'));
const payload={p_request_id:m.requestId,p_org_name:m.organizationName,p_first_store_name:m.storeName,p_currency:'TZS',p_timezone:m.timezone,p_acknowledged:true};
fetch(url+'/rest/v1/rpc/create_org_with_store_currency_tzs_v1',{method:'POST',headers:{apikey:key,...(key.startsWith('eyJ')?{Authorization:'Bearer '+key}:{}),'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(20000)}).then(async r=>{const body=await r.json();const result={at:new Date().toISOString(),httpStatus:r.status,code:body.code||null,status:!r.ok&&['42501','PGRST301','PGRST302'].includes(body.code)?'DENIED':'UNEXPECTED_RESPONSE',scope:'Real anonymous PostgREST permission check; no Owner session or financial operation'};fs.writeFileSync(path.join(E,'ANON-RPC-RESULT.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));if(result.status!=='DENIED')process.exitCode=1}).catch(e=>{console.error(e.name);process.exitCode=1});
