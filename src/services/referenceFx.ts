// Reference/display-only FX. No posting, historical revaluation or financial RPCs.
export const ECB_REFERENCE_URL='https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml';
export const ECB_HISTORY_URL='https://www.ecb.europa.eu/stats/eurofxref/eurofxref-hist-90d.xml';
export type ReferenceRates={provider:'ECB_REFERENCE';purpose:'DISPLAY_REFERENCE_ONLY';sourceUrl:string;referenceDate:string;retrievedAt:string;sourceSha256:string;rates:Readonly<Record<string,string>>};
export type DisplayQuote={from:string;to:string;numerator:string;denominator:string;evidence:ReferenceRates;transactionAllowed:false};
const trustedSnapshots=new WeakSet<ReferenceRates>(),trustedQuotes=new WeakSet<DisplayQuote>();
function fraction(value:string){
 if(value.length>64||!/^\d+(\.\d{1,18})?$/.test(value))throw new Error('INVALID_DECIMAL_RATE');
 const [integer,decimal='']=value.split('.'),numerator=BigInt(integer+decimal),denominator=10n**BigInt(decimal.length);
 if(numerator<=0n)throw new Error('INVALID_DECIMAL_RATE');return {numerator,denominator};
}
function calendarDate(value:string){if(!/^\d{4}-\d{2}-\d{2}$/.test(value)||new Date(value+'T00:00:00Z').toISOString().slice(0,10)!==value)throw new Error('INVALID_REFERENCE_DATE');}
export function parseReferenceFeed(xml:string,retrievedAt:string,sourceSha256:string,sourceUrl:string=ECB_REFERENCE_URL):ReferenceRates{
 if(![ECB_REFERENCE_URL,ECB_HISTORY_URL].includes(sourceUrl))throw Error('UNTRUSTED_REFERENCE_SOURCE');
 if(xml.length>98304||/<!DOCTYPE|<!ENTITY/i.test(xml)||!xml.includes('http://www.ecb.int/vocabulary/2002-08-01/eurofxref')||!/<gesmes:Envelope\b/.test(xml)||!/<\/gesmes:Envelope>\s*$/.test(xml)||xml.match(/<\/Cube>/g)?.length!==2)throw new Error('INVALID_REFERENCE_FEED');
 if(!/^[a-f0-9]{64}$/.test(sourceSha256)||!Number.isFinite(Date.parse(retrievedAt)))throw new Error('INVALID_REFERENCE_EVIDENCE');
 const dates=[...xml.matchAll(/<Cube\s+time=['"](\d{4}-\d{2}-\d{2})['"]\s*>/g)];if(dates.length!==1)throw new Error('INVALID_REFERENCE_DATE');const referenceDate=dates[0][1];calendarDate(referenceDate);
 const rates:Record<string,string>={EUR:'1'};let count=0;
 for(const match of xml.matchAll(/<Cube\s+currency=['"]([A-Z]{3})['"]\s+rate=['"]([^'"]+)['"]\s*\/>/g)){const [,code,rate]=match;if(code in rates)throw new Error('DUPLICATE_REFERENCE_CURRENCY');fraction(rate);rates[code]=rate;count++;}
 const currencyTags=xml.match(/<Cube\s+currency=/g)?.length||0;if(count<1||count!==currencyTags)throw new Error('INCOMPLETE_REFERENCE_FEED');
 const snapshot:ReferenceRates=Object.freeze({provider:'ECB_REFERENCE',purpose:'DISPLAY_REFERENCE_ONLY',sourceUrl,referenceDate,retrievedAt,sourceSha256,rates:Object.freeze(rates)});trustedSnapshots.add(snapshot);return snapshot;
}
export function makeDisplayQuote(evidence:ReferenceRates,from:string,to:string,now:Date,maxReferenceAgeDays:number,retrievalNow:Date=now):DisplayQuote{
 if(!trustedSnapshots.has(evidence)||![ECB_REFERENCE_URL,ECB_HISTORY_URL].includes(evidence.sourceUrl)||evidence.purpose!=='DISPLAY_REFERENCE_ONLY'||evidence.provider!=='ECB_REFERENCE')throw new Error('UNTRUSTED_REFERENCE_SOURCE');
 if(!Number.isFinite(retrievalNow.getTime())||Date.parse(evidence.retrievedAt)>retrievalNow.getTime())throw Error('FUTURE_RETRIEVAL');
 if(!Number.isFinite(now.getTime())||!Number.isSafeInteger(maxReferenceAgeDays)||maxReferenceAgeDays<0)throw new Error('INVALID_REFERENCE_AGE_POLICY');
 const age=(now.getTime()-Date.parse(evidence.referenceDate+'T00:00:00Z'))/86400000;if(age<0||Math.floor(age)>maxReferenceAgeDays)throw new Error('STALE_OR_FUTURE_REFERENCE');
 if(!/^[A-Z]{3}$/.test(from)||!/^[A-Z]{3}$/.test(to)||!evidence.rates[from]||!evidence.rates[to])throw new Error('REFERENCE_PAIR_UNAVAILABLE');
 const base=fraction(evidence.rates[from]),target=fraction(evidence.rates[to]);const quote:DisplayQuote=Object.freeze({from,to,numerator:String(target.numerator*base.denominator),denominator:String(target.denominator*base.numerator),evidence,transactionAllowed:false});trustedQuotes.add(quote);return quote;
}
/** Every day retains the original history-file hash and URL. No inferred rates. */
export function parseReferenceHistory(xml:string,retrievedAt:string,sourceSha256:string):readonly ReferenceRates[]{
 if(xml.length>262144||/<!DOCTYPE|<!ENTITY/i.test(xml)||!xml.includes('http://www.ecb.int/vocabulary/2002-08-01/eurofxref')||!/<\/gesmes:Envelope>\s*$/.test(xml))throw Error('INVALID_REFERENCE_FEED');
 const days=[...xml.matchAll(/<Cube\s+time=['"](\d{4}-\d{2}-\d{2})['"]\s*>([\s\S]*?)<\/Cube>/g)];
 if(!days.length||days.length>100||days.length!==(xml.match(/<Cube\s+time=/g)||[]).length)throw Error('INCOMPLETE_REFERENCE_FEED');
 if((xml.match(/<\/Cube>/g)||[]).length!==days.length+1||(xml.match(/<Cube\s+currency=/g)||[]).length!==days.reduce((n,d)=>n+(d[2].match(/<Cube\s+currency=/g)||[]).length,0))throw Error('INCOMPLETE_REFERENCE_FEED');
 const seen=new Set<string>();return Object.freeze(days.map(day=>{if(seen.has(day[1]))throw Error('DUPLICATE_REFERENCE_DATE');seen.add(day[1]);return parseReferenceFeed(`<gesmes:Envelope xmlns="http://www.ecb.int/vocabulary/2002-08-01/eurofxref"><Cube><Cube time='${day[1]}'>${day[2]}</Cube></Cube></gesmes:Envelope>`,retrievedAt,sourceSha256,ECB_HISTORY_URL);}));
}
export async function loadReferenceHistory():Promise<readonly ReferenceRates[]>{
 if(!globalThis.crypto?.subtle)throw Error('REFERENCE_HASH_ENGINE_UNAVAILABLE');
 const c=new AbortController(),timer=setTimeout(()=>c.abort(),10000);
 try{const r=await fetch(ECB_HISTORY_URL,{credentials:'omit',redirect:'error',signal:c.signal});if(!r.ok||r.url!==ECB_HISTORY_URL)throw Error('REFERENCE_FETCH_FAILED');const xml=await r.text();if(xml.length>262144)throw Error('REFERENCE_FEED_TOO_LARGE');const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(xml));return parseReferenceHistory(xml,new Date().toISOString(),Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join(''));}finally{clearTimeout(timer)}
}
export function convertDisplayDecimal(amount:string,quote:DisplayQuote,displayPrecision:number):string{
 if(amount.length>64||! /^-?\d+(\.\d{1,18})?$/.test(amount)||!Number.isSafeInteger(displayPrecision)||displayPrecision<0||displayPrecision>6)throw new Error('INVALID_DISPLAY_AMOUNT');
 if(!trustedQuotes.has(quote)||quote.transactionAllowed!==false||quote.evidence.purpose!=='DISPLAY_REFERENCE_ONLY')throw new Error('REFERENCE_CANNOT_POST_TRANSACTION');
 const negative=amount.startsWith('-'),absolute=negative?amount.slice(1):amount,[integer,decimal='']=absolute.split('.');
 const amountUnits=BigInt(integer+decimal),scale=10n**BigInt(displayPrecision),numerator=amountUnits*BigInt(quote.numerator)*scale,denominator=10n**BigInt(decimal.length)*BigInt(quote.denominator);
 if(denominator<=0n)throw new Error('INVALID_QUOTE');let units=numerator/denominator;if((numerator%denominator)*2n>=denominator)units++;
 const whole=units/scale,fractionDigits=(units%scale).toString().padStart(displayPrecision,'0');return (negative&&units>0n?'-':'')+String(whole)+(displayPrecision?'.'+fractionDigits:'');
}
export async function loadReferenceRates():Promise<ReferenceRates>{
 if(!globalThis.crypto?.subtle)throw new Error('REFERENCE_HASH_ENGINE_UNAVAILABLE');
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);
 try{const response=await fetch(ECB_REFERENCE_URL,{credentials:'omit',redirect:'error',signal:controller.signal});if(!response.ok||response.url!==ECB_REFERENCE_URL)throw new Error('REFERENCE_FETCH_FAILED');
  const length=Number(response.headers.get('Content-Length')||0);if(length>98304)throw new Error('REFERENCE_FEED_TOO_LARGE');const xml=await response.text();if(xml.length>98304)throw new Error('REFERENCE_FEED_TOO_LARGE');
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(xml));const sha256=Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('');return parseReferenceFeed(xml,new Date().toISOString(),sha256);
 }finally{clearTimeout(timer)}
}
