// Reference/display-only FX. No posting, historical revaluation or financial RPCs.
export const ECB_REFERENCE_URL='https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml';
export type ReferenceRates={provider:'ECB_REFERENCE';purpose:'DISPLAY_REFERENCE_ONLY';sourceUrl:string;referenceDate:string;retrievedAt:string;sourceSha256:string;rates:Readonly<Record<string,string>>};
export type DisplayQuote={from:string;to:string;numerator:string;denominator:string;evidence:ReferenceRates;transactionAllowed:false};
const trustedSnapshots=new WeakSet<ReferenceRates>(),trustedQuotes=new WeakSet<DisplayQuote>();
function fraction(value:string){
 if(value.length>64||!/^\d+(\.\d{1,18})?$/.test(value))throw new Error('INVALID_DECIMAL_RATE');
 const [integer,decimal='']=value.split('.'),numerator=BigInt(integer+decimal),denominator=10n**BigInt(decimal.length);
 if(numerator<=0n)throw new Error('INVALID_DECIMAL_RATE');return {numerator,denominator};
}
function calendarDate(value:string){if(!/^\d{4}-\d{2}-\d{2}$/.test(value)||new Date(value+'T00:00:00Z').toISOString().slice(0,10)!==value)throw new Error('INVALID_REFERENCE_DATE');}
export function parseReferenceFeed(xml:string,retrievedAt:string,sourceSha256:string):ReferenceRates{
 if(xml.length>98304||/<!DOCTYPE|<!ENTITY/i.test(xml)||!xml.includes('http://www.ecb.int/vocabulary/2002-08-01/eurofxref')||!/<gesmes:Envelope\b/.test(xml)||!/<\/gesmes:Envelope>\s*$/.test(xml)||xml.match(/<\/Cube>/g)?.length!==2)throw new Error('INVALID_REFERENCE_FEED');
 if(!/^[a-f0-9]{64}$/.test(sourceSha256)||!Number.isFinite(Date.parse(retrievedAt)))throw new Error('INVALID_REFERENCE_EVIDENCE');
 const dates=[...xml.matchAll(/<Cube\s+time=['"](\d{4}-\d{2}-\d{2})['"]\s*>/g)];if(dates.length!==1)throw new Error('INVALID_REFERENCE_DATE');const referenceDate=dates[0][1];calendarDate(referenceDate);
 const rates:Record<string,string>={EUR:'1'};let count=0;
 for(const match of xml.matchAll(/<Cube\s+currency=['"]([A-Z]{3})['"]\s+rate=['"]([^'"]+)['"]\s*\/>/g)){const [,code,rate]=match;if(code in rates)throw new Error('DUPLICATE_REFERENCE_CURRENCY');fraction(rate);rates[code]=rate;count++;}
 const currencyTags=xml.match(/<Cube\s+currency=/g)?.length||0;if(count<1||count!==currencyTags)throw new Error('INCOMPLETE_REFERENCE_FEED');
 const snapshot:ReferenceRates=Object.freeze({provider:'ECB_REFERENCE',purpose:'DISPLAY_REFERENCE_ONLY',sourceUrl:ECB_REFERENCE_URL,referenceDate,retrievedAt,sourceSha256,rates:Object.freeze(rates)});trustedSnapshots.add(snapshot);return snapshot;
}
export function makeDisplayQuote(evidence:ReferenceRates,from:string,to:string,now:Date,maxReferenceAgeDays:number):DisplayQuote{
 if(!trustedSnapshots.has(evidence)||evidence.sourceUrl!==ECB_REFERENCE_URL||evidence.purpose!=='DISPLAY_REFERENCE_ONLY'||evidence.provider!=='ECB_REFERENCE')throw new Error('UNTRUSTED_REFERENCE_SOURCE');
 if(!Number.isFinite(now.getTime())||!Number.isSafeInteger(maxReferenceAgeDays)||maxReferenceAgeDays<0)throw new Error('INVALID_REFERENCE_AGE_POLICY');
 const age=(now.getTime()-Date.parse(evidence.referenceDate+'T00:00:00Z'))/86400000;if(age<0||Math.floor(age)>maxReferenceAgeDays)throw new Error('STALE_OR_FUTURE_REFERENCE');
 if(!/^[A-Z]{3}$/.test(from)||!/^[A-Z]{3}$/.test(to)||!evidence.rates[from]||!evidence.rates[to])throw new Error('REFERENCE_PAIR_UNAVAILABLE');
 const base=fraction(evidence.rates[from]),target=fraction(evidence.rates[to]);const quote:DisplayQuote=Object.freeze({from,to,numerator:String(target.numerator*base.denominator),denominator:String(target.denominator*base.numerator),evidence,transactionAllowed:false});trustedQuotes.add(quote);return quote;
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
