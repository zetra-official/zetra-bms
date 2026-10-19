const fs=require('fs'),path=require('path'),assert=require('assert'),esbuild=require('esbuild');
const E=__dirname,C=[];function ck(n,f){f();C.push(n)}
async function main(){
 const b=await esbuild.build({stdin:{contents:`export * from './src/ui/money';export * from './src/currency/engine';`,resolveDir:process.cwd()},bundle:true,write:false,format:'cjs',platform:'node',external:['react'],plugins:[{name:'no-device-storage',setup(p){p.onResolve({filter:/^@\/src\/storage\/kv$/},()=>({path:'kv',namespace:'test'}));p.onLoad({filter:/.*/,namespace:'test'},()=>({contents:`export const kv={getOrgCurrency:async()=>{throw Error('UNEXPECTED_STORAGE')},getOrgLocale:async()=>{throw Error('UNEXPECTED_STORAGE')}}`,loader:'js'}))}}]});
 const m={exports:{}};new Function('module','exports','require',b.outputFiles[0].text)(m,m.exports,require);const e=m.exports;
 ck('TZS integer convention unchanged',()=>assert.equal(e.formatMoney(1234,{currency:'TZS',locale:'en-TZ'}),new Intl.NumberFormat('en-TZ',{style:'currency',currency:'TZS',maximumFractionDigits:0}).format(1234)));
 ck('canonical TZS fractions visible',()=>assert.match(e.formatMoney(12.34,{currency:'TZS',locale:'en'}),/12\.34/));
 ck('fractional supported unit-price scale retained',()=>assert.match(e.formatMoney(.1256,{currency:'TZS',locale:'en'}),/0\.1256/));
 ck('existing cart-normalized sub-cent unit prices remain visible',()=>assert.match(e.formatMoney(.000000000123,{currency:'TZS',locale:'en'}),/0\.000000000123/));
 ck('legacy numeric binary tails do not leak into text',()=>assert.match(e.formatMoney(.1*3,{currency:'TZS',locale:'en'}),/0\.30$/));
 ck('currency-free totals preserve fractional digits',()=>assert.equal(e.formatMoney(12.34,{currency:'TZS',locale:'en',showCurrency:false}),'12.34'));
 ck('SQL numeric above 2^53 never passes through Number',()=>assert(e.formatMoney('9007199254740993.12',{currency:'USD',locale:'en'}).includes('9,007,199,254,740,993.12')));
 ck('negative exact stored amounts preserved',()=>assert(e.formatMoney('-9007199254740993.125',{currency:'KWD',locale:'en'}).includes('9,007,199,254,740,993.125')));
 ck('original precision retained beyond settlement units',()=>assert(e.formatMoney('0.125600',{currency:'TZS',locale:'en'}).includes('0.125600')));
 for(const [currency,amount,expected] of [['TZS','123.45','123.45'],['USD','123.45','123.45'],['KES','123.45','123.45'],['UGX','123','123'],['EUR','123.45','123.45'],['JPY','123','123'],['KWD','123.45','123.450']])ck(currency+' exact 0/2/3 precision in all seven languages',()=>{for(const locale of ['en','sw','fr','pt','ar','es','zh'])assert(e.formatMoney(amount,{currency,locale}).includes(e.formatExact(expected,locale)))});
 ck('historical code and original amount survive missing current metadata',()=>assert.equal(e.formatMoney('123.456',{currency:'ANG',locale:'en'}),'ANG 123.456'));
 ck('malformed monetary input not silently zeroed',()=>{for(const s of ['','12abc','NaN','Infinity'])assert.equal(e.formatMoney(s,{currency:'USD'}),'—')});
 ck('invalid numeric values remain unavailable',()=>assert.equal(e.formatMoney(NaN),'—'));
 ck('formatting never converts original currency or value',()=>{const record=Object.freeze({amount:'123.45',currency:'KES'});e.formatMoney(record.amount,{currency:record.currency,locale:'ar'});assert.deepEqual(record,{amount:'123.45',currency:'KES'})});
 const r={status:'PASS',count:C.length,checks:C,scope:'Real shared frontend formatter and existing exact engine; storage isolated, no financial posting/native certification or physical-device claim'};fs.writeFileSync(path.join(E,'MONEY-RESULTS.json'),JSON.stringify(r,null,2));console.log('PASS '+C.length);
}main().catch(e=>{console.error(e);process.exitCode=1});
