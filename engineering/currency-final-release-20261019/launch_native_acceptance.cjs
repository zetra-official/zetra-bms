// Local Expo Go fixture only. No EAS project, install, publish or production RPC.
const path=require('path'),fs=require('fs'),{spawn}=require('child_process'),dotenv=require('dotenv');
const root=path.resolve(__dirname,'../..'),project=path.join(__dirname,'native-acceptance');
const config={};for(const name of ['.env','.env.local']){const p=path.join(root,name);if(fs.existsSync(p))Object.assign(config,dotenv.parse(fs.readFileSync(p)));}
if(config.EXPO_PUBLIC_SUPABASE_URL!=='https://dcmhqdckzhbuakvcyjit.supabase.co')throw Error('AUTH_TARGET_MISMATCH');
const key=config.EXPO_PUBLIC_SUPABASE_ANON_KEY;if(!key)throw Error('PUBLIC_AUTH_KEY_REQUIRED');
if(key.startsWith('eyJ')&&JSON.parse(Buffer.from(key.split('.')[1],'base64url')).role!=='anon')throw Error('PRIVILEGED_KEY_REJECTED');
if(!key.startsWith('eyJ')&&!key.startsWith('sb_publishable_'))throw Error('INVALID_PUBLIC_KEY');
const env={...process.env,CI:'1',EXPO_OFFLINE:'1',EXPO_NO_TELEMETRY:'1',REACT_NATIVE_PACKAGER_HOSTNAME:'127.0.0.1',EXPO_PUBLIC_SUPABASE_URL:config.EXPO_PUBLIC_SUPABASE_URL,EXPO_PUBLIC_SUPABASE_ANON_KEY:key};
const args=process.argv.includes('--export')?['export','--platform','android','--max-workers','2','--output-dir','../native-device-export-1917-complete']:['start','--go','--localhost','--port','55627','--max-workers','2'];
if(!process.argv.includes('--export')&&process.argv.includes('--clear'))args.push('--clear');
const child=spawn(process.execPath,[path.join(root,'node_modules/expo/bin/cli'),...args],{cwd:project,env,stdio:'inherit',windowsHide:true});
if(!process.argv.includes('--export')){
 const sources=['src/currency/OriginalRefundForm.tsx','src/currency/originalWorkflow.ts','src/currency/originalRefundReceipt.ts','src/currency/shareFinancialPdf.ts','src/currency/FieldCustodyForm.tsx','src/currency/fieldCustodyWorkflow.ts','engineering/currency-final-release-20261019/native-acceptance/index.tsx'];
 fs.writeFileSync(path.join(__dirname,'NATIVE-DEVICE-RUNTIME.json'),JSON.stringify({startedAt:new Date().toISOString(),pid:child.pid,url:'exp://127.0.0.1:55627',scope:'Local Expo Go actual-source acceptance; no product deployment',sourceHashes:Object.fromEntries(sources.map(p=>[p,require('crypto').createHash('sha256').update(fs.readFileSync(path.join(root,p))).digest('hex')]))},null,2));
}
child.on('exit',code=>process.exitCode=code??1);
child.on('error',()=>{console.error('LOCAL_EXPO_START_FAILED');process.exitCode=1});
