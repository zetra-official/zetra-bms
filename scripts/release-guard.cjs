const fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
require('@expo/env').load(root,{silent:true});
const app=JSON.parse(fs.readFileSync(path.join(root,'app.json'),'utf8')).expo;
const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
assert.equal(pkg.main,'expo-router/entry','Do not publish the quarantined Staging entry point');
const url=new URL(process.env.EXPO_PUBLIC_SUPABASE_URL||'https://missing.invalid');
assert.equal(url.origin,'https://dcmhqdckzhbuakvcyjit.supabase.co','Wrong database environment');
const key=process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY||'';
if(!key.startsWith('sb_publishable_')){
 let payload;try{payload=JSON.parse(Buffer.from(key.split('.')[1],'base64url').toString())}catch{throw Error('Public client key missing/invalid')}
 assert.equal(payload.role,'anon','Privileged credential must never enter a client build');
}
assert.equal(app.android.package,'com.anonymous.zetrabmsclean','Android identity mismatch');
assert.equal(app.extra.eas.projectId,'a8536709-2bea-40f4-8dd7-01563bd08c70','EAS target mismatch');
assert.equal(app.version,'1.0.0','Runtime compatibility requires explicit review if app version changes');
assert.equal(app.updates.url,'https://u.expo.dev/a8536709-2bea-40f4-8dd7-01563bd08c70');
assert(!process.env.EXPO_PUBLIC_OPENAI_API_KEY,'Client-side privileged AI key is prohibited');
console.log('Release guard PASS: fixed Production project, public client key, original Android/EAS identity. No connection made.');
