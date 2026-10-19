// Certification of existing helpers, not a replacement calculation/posting engine.
const fs=require('fs'),path=require('path'),assert=require('assert'),esbuild=require('esbuild'),crypto=require('crypto');
const root=process.cwd(),dir=__dirname,checks=[],blocked=[];
const code=esbuild.buildSync({stdin:{contents:`export * from './src/currency/engine';export * from './src/currency/historical';export * from './src/currency/metadata';export * from './src/currency/offlineContext';export * from './src/services/referenceFx';export * from './src/utils/discount';export * from './src/pos/itemAdjustment';`,resolveDir:root},bundle:true,write:false,platform:'node',format:'cjs',target:'es2022'}).outputFiles[0].text;
const m={exports:{}};new Function('module','exports','require',code)(m,m.exports,require);const e=m.exports;
function ck(name,fn){fn();checks.push(name)}
const langs=['en','sw','fr','pt','ar','es','zh'],representatives={TZS:2,USD:2,KES:2,UGX:0,EUR:2,AED:2,CNY:2,JPY:0,KWD:3},org='synthetic-local',now=new Date('2026-10-19T06:00:00Z');
const active=e.currentCurrencyMetadata.filter(c=>c.status==='ACTIVE');
ck('unique active catalog codes',()=>assert.equal(new Set(active.map(c=>c.code)).size,active.length));
for(const c of active){
 ck(`${c.code}: metadata and ISO accounting precision`,()=>{assert.match(c.code,/^[A-Z]{3}$/);assert.match(c.numericCode,/^\d{3}$/);assert.equal(e.currencyPrecision(c.code),c.decimals)});
 const amount='9007199254740993'+(c.decimals?'.'+'123456'.slice(0,c.decimals):'');
 for(const lang of langs)ck(`${c.code}/${lang}: exact large amount formatting roundtrip`,()=>assert.equal(e.parseLocalizedAmount(e.formatExact(amount,lang),lang),amount));
 ck(`${c.code}: immutable identity and no inferred FX`,()=>{const record=Object.freeze({amount,currency:c.code,organizationId:org,contextRevision:1,source:'TRANSACTION_RECORD'});const v=e.presentMoney(record,c.code,null,now,3,org);assert.equal(v.displayAmount,amount);assert.equal(v.postingAllowed,false);assert.deepEqual(v.original,record);const other=c.code==='USD'?'EUR':'USD';assert.equal(e.presentMoney(record,other,null,now,3,org).status,'RATE_UNAVAILABLE')});
}
for(const [currency,scale] of Object.entries(representatives)){
 ck(`${currency}: representative scale`,()=>assert.equal(e.currencyPrecision(currency),scale));
 const amount=scale?'123.'+'0'.repeat(scale-1)+'1':'123',half=scale?'1.'+'0'.repeat(scale)+'5':'1.5',rounded=scale?'1.'+'0'.repeat(scale-1)+'1':'2';
 ck(`${currency}: positive/negative rounding boundary`,()=>{assert.equal(e.identityDisplay(half,scale),rounded);assert.equal(e.identityDisplay('-'+half,scale),'-'+rounded)});
 ck(`${currency}: frozen offline helper snapshot and revision/tenant rejection`,()=>{const payload={items:[{quantity:'2.5',price:amount}]},before=JSON.stringify(payload),a={organizationId:org,currency,revision:1},q=e.captureOfflineCurrency(payload,'11111111-1111-4111-8111-111111111111',amount,a);payload.items[0].price='999';assert.equal(JSON.stringify(q.payload),before);assert.equal(e.validateOfflineCurrency(q,a).amount,amount);assert.throws(()=>e.validateOfflineCurrency(q,{...a,revision:2}),/REVIEW/);assert.throws(()=>e.validateOfflineCurrency(q,{...a,organizationId:'other'}),/TENANT/);assert.equal(q.currency.exchangeRate,'1');assert.equal(q.currency.displayRateUsed,false)});
 ck(`${currency}: display currency cannot authorize cross-currency posting`,()=>assert.throws(()=>e.transactionContext(amount,currency,{organizationId:org,currency:currency==='USD'?'EUR':'USD',revision:1},org),/SEPARATE_CONTRACT/));
 // Exercise the actual legacy discount helper. Report its capability, not a synthetic replacement.
 const observed=e.parseDiscountInput('10%',12.34).amount;
 const expected=e.identityDisplay('1.234',scale);
 if(scale>0&&String(observed)!==expected)blocked.push({currency,contract:'src/utils/discount.ts:parseDiscountInput',case:'10% of 12.34 at ISO precision',observed,expected,requiredBeforeNativeCertification:'Currency-aware discount/rounding contract must be reconciled with canonical server rules; no live calculation changed'});
}
const xml=fs.readFileSync(path.join(root,'engineering/global-currency-20261018/reference/ecb-daily.xml'),'utf8'),hash=crypto.createHash('sha256').update(xml).digest('hex'),feed=e.parseReferenceFeed(xml,'2026-10-18T17:00:00Z',hash);
const rateMatrix=[];
for(const currency of Object.keys(representatives)){
 const record=Object.freeze({amount:'123.45',currency,organizationId:org,contextRevision:1,source:'TRANSACTION_RECORD'}),v=e.presentMoney(record,'EUR',feed,now,5,org);
 ck(`${currency}: official saved reference provenance or explicit missing pair`,()=>{assert.equal(v.status,currency==='EUR'?'ORIGINAL':feed.rates[currency]?'CONVERTED':'RATE_UNAVAILABLE');assert.equal(record.amount,'123.45');if(v.rate)assert.equal(v.rate.sourceSha256,hash);assert.equal(v.postingAllowed,false)});
 rateMatrix.push({currency,status:v.status,source:feed.sourceUrl,referenceDate:feed.referenceDate,postingAllowed:false});
}
const r={status:'PASS — HELPER/CATALOG CERTIFICATION ONLY',at:new Date().toISOString(),count:checks.length,activeCurrencies:active.length,languages:langs,representatives,checks,rateMatrix,nativeCertification:'BLOCKED — no accepted module-wide immutable transaction/tender currency contracts',blockedNativeProbes:blocked,scope:'Node execution of real production helpers. Official previously captured ECB evidence. No market rates fabricated. No Auth E2E, posting, device, PDF, or module financial certification claimed.'};
fs.writeFileSync(path.join(dir,'CERTIFICATION-RESULT.json'),JSON.stringify(r,null,2));console.log(JSON.stringify({status:r.status,count:r.count,active:r.activeCurrencies,nativeBlockerProbes:blocked.length}));
