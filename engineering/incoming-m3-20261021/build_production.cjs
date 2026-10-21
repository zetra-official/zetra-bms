const fs=require('fs'),path=require('path'),cp=require('child_process'),crypto=require('crypto');
const E=__dirname,R=path.resolve(E,'../..'),platform=process.argv[2],P=path.join(E,'production-20261021');if(!['web','android'].includes(platform))throw Error('platform');
require(path.join(R,'node_modules/@expo/env')).load(R,{silent:true});
const source=path.join(E,'source-'+platform),cache=path.join(P,'cache-'+platform);fs.mkdirSync(cache,{recursive:true});
const env={...process.env,CI:'1',EXPO_NO_TELEMETRY:'1',TEMP:cache,TMP:cache};
if(new URL(env.EXPO_PUBLIC_SUPABASE_URL).origin!=='https://dcmhqdckzhbuakvcyjit.supabase.co')throw Error('Production URL mismatch');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
function files(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(d=>d.isDirectory()?files(path.join(dir,d.name)):[path.join(dir,d.name)])}
function snapshot(){return Object.fromEntries(['app','src','components','hooks','constants','assets','scripts'].flatMap(d=>fs.existsSync(path.join(source,d))?files(path.join(source,d)):[]).map(p=>[path.relative(source,p).replaceAll('\\','/'),hash(fs.readFileSync(p))]))}
const inputs=snapshot(),build=path.join(P,'export-'+platform+'-'+Date.now()),artifact=platform==='web'?build+'-wrapped':build,log=fs.openSync(path.join(P,'build-'+platform+'.private.log'),'w');
for(const args of [[path.join(R,'node_modules/typescript/bin/tsc'),'--noEmit','-p',path.join(source,'tsconfig.json')],[path.join(source,'scripts/release-guard.cjs')],[path.join(R,'node_modules/expo/bin/cli'),'export','--max-workers','2','--platform',platform,'--output-dir',build]]){const r=cp.spawnSync(process.execPath,args,{cwd:source,env,stdio:['ignore',log,log]});if(r.status!==0){fs.closeSync(log);throw Error(platform+' guarded build failed; inspect private log')}}
if(platform==='web'){const r=cp.spawnSync('python',[path.join(source,'scripts/package-web-bootstrap.py'),build,artifact],{cwd:source,env,stdio:['ignore',log,log]});if(r.status!==0)throw Error('verified delivery packaging failed')}
fs.closeSync(log);if(JSON.stringify(inputs)!==JSON.stringify(snapshot()))throw Error('Source drift during build');
const manifest=Object.fromEntries(files(artifact).map(p=>[path.relative(artifact,p).replaceAll('\\','/'),hash(fs.readFileSync(p))]));
fs.writeFileSync(path.join(P,'BUILD-'+platform+'.json'),JSON.stringify({platform,status:'PASS',productionProject:'dcmhqdckzhbuakvcyjit',artifact,sourceInputs:inputs,files:manifest},null,2));console.log(platform+' Production build/source integrity PASS; publication not performed');
