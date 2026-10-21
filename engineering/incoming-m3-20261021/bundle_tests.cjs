(async()=>{
const fs=require('fs'),path=require('path'),esbuild=require('esbuild');const E=__dirname,S=path.join(E,'source-web/src/incoming');
for(const name of ['model','copy','receipt','vault.web'])await esbuild.build({entryPoints:[path.join(S,name+'.ts')],bundle:true,platform:'node',format:'cjs',outfile:path.join(E,name+'.test.cjs')});
await esbuild.build({entryPoints:[path.join(S,'vault.ts')],bundle:true,platform:'node',format:'cjs',outfile:path.join(E,'vault.native.test.cjs'),plugins:[{name:'secure-store-disposable-stub',setup(b){b.onResolve({filter:/^expo-secure-store$/},()=>({path:'secure-test',namespace:'test'}));b.onLoad({filter:/.*/,namespace:'test'},()=>({contents:`export const WHEN_UNLOCKED_THIS_DEVICE_ONLY=1;export async function isAvailableAsync(){return true};export async function getItemAsync(k){return globalThis.__m3Secure.map.get(k)??null};export async function setItemAsync(k,v){if(globalThis.__m3Secure.failAt===++globalThis.__m3Secure.writes)throw Error('QUOTA');globalThis.__m3Secure.map.set(k,v)};export async function deleteItemAsync(k){globalThis.__m3Secure.map.delete(k)}` ,loader:'js'}))}}]});
console.log('M3 test modules bundled from actual candidate source')

})().catch(e=>{console.error(e);process.exit(1)});
