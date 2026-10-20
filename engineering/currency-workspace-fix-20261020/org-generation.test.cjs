const fs=require('fs'),path=require('path'),ts=require('typescript'),assert=require('node:assert/strict');
const D=__dirname, checks=[];
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve}};
function setup(platform,{sessionPending=false}={}){
 const src=fs.readFileSync(path.join(D,'source-'+platform,'src/context/OrgContext.tsx'),'utf8');
 const a=src.indexOf('    async (mode: "boot" | "refresh") =>',src.indexOf('  const runLoadAll ='));
 const b=src.indexOf('\n    [hydrateSelectionOnce]',a);
 const expression=src.slice(a,b).trim().replace(/,$/,'');
 const code=ts.transpileModule('const run = '+expression+';', {compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
 const pending=deferred(), session=deferred(), state={events:[],signouts:0};
 const ref=v=>({current:v});
 const ctx={authGenerationRef:ref(0),currentUserIdRef:ref('A'),activeOrgIdRef:ref(null),activeStoreIdRef:ref(null),hydratedUserRef:ref(null),
  connectionDeadline:async p=>p, supabase:{auth:{getSession:()=>sessionPending?session.promise:Promise.resolve({data:{session:{user:{id:'A',email:'fixture@example.invalid'}}},error:null}),signOut:async()=>state.signouts++},rpc:()=>pending.promise},
  hydrateSelectionOnce:async()=>{}, clean:v=>String(v??'').trim(),INTERNAL_BILLING_EMAIL:'office@example.invalid',
  isDisabledAccountMessage:v=>String(v).includes('disabled'), rpcFirstWorkingStores:async()=>[{store_id:'store-A',organization_id:'org-A'}],
  resolveConsistentSelection:()=>({orgId:'org-A',storeId:'store-A'}),activeOrgKeyForUser:v=>'org:'+v,activeStoreKeyForUser:v=>'store:'+v,
  KV_KEYS:{activeOrgId:'org',activeStoreId:'store'},kv:{setString:async(...args)=>state.events.push(['persist',...args]),setLastWorkspaceForUser:async(...args)=>state.events.push(['workspace',...args]),clearActiveSelection:async()=>state.events.push(['clear'])}};
 for(const key of ['setError','setLoading','setRefreshing','setOrgs','setStores','_setActiveOrgId','_setActiveStoreId'])ctx[key]=v=>state.events.push([key,v]);
 const run=new Function(...Object.keys(ctx),code+'return run;')(...Object.values(ctx));
 return {run,pending,session,state,ctx};
}
(async()=>{for(const platform of ['web','android']){
 for(const response of [{data:null,error:{message:'account disabled'}},{data:[{organization_id:'org-A'}],error:null}]){
  const t=setup(platform), task=t.run('boot'); await new Promise(setImmediate);
  t.ctx.authGenerationRef.current++;t.ctx.currentUserIdRef.current='B';t.state.events=[];t.pending.resolve(response);await task;
  assert.equal(t.state.signouts,0);assert.deepEqual(t.state.events,[]);checks.push(platform+':stale_'+(response.error?'disabled_error':'membership_success')+'_cannot_affect_new_identity');
 }
 const late=setup(platform,{sessionPending:true}),task=late.run('boot');late.ctx.authGenerationRef.current++;late.state.events=[];late.session.resolve({data:{session:{user:{id:'A'}}},error:null});await task;assert.deepEqual(late.state.events,[]);checks.push(platform+':late_session_ignored');
 const current=setup(platform),ok=current.run('boot');await new Promise(setImmediate);current.pending.resolve({data:[{organization_id:'org-A'}],error:null});await ok;
 assert.equal(current.state.signouts,0);assert(current.state.events.some(e=>e[0]==='setOrgs'&&e[1][0].organization_id==='org-A'));assert(current.state.events.some(e=>e[0]==='setLoading'&&e[1]===false));checks.push(platform+':current_canonical_load_commits_and_settles');
}
fs.writeFileSync(path.join(D,'org-generation-results.json'),JSON.stringify({status:'PASS',count:checks.length,checks,scope:'Actual runLoadAll extracted from each platform; deferred SDK/RPC doubles, no production writes'},null,2));console.log(JSON.stringify({status:'PASS',count:checks.length}));})().catch(e=>{console.error(e);process.exitCode=1});
