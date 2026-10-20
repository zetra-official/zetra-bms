import {isSelectableCurrency} from '../currency/metadata';
// Reference/display-only FX. No posting, historical revaluation or financial RPCs.
export const ECB_REFERENCE_URL='https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml';
export const ECB_HISTORY_URL='https://www.ecb.europa.eu/stats/eurofxref/eurofxref-hist-90d.xml';
export const BOT_REFERENCE_URL='https://bot.go.tz/ExchangeRate/excRates?lang=en';
export type ReferenceRates={provider:'ECB_REFERENCE'|'BOT_REFERENCE';purpose:'DISPLAY_REFERENCE_ONLY';sourceUrl:string;referenceDate:string;retrievedAt:string;sourceSha256:string;rates:Readonly<Record<string,string>>;direction?:'BASE_PER_UNIT';referenceTimezone?:'Africa/Dar_es_Salaam'};
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
 if(!trustedSnapshots.has(evidence)||![ECB_REFERENCE_URL,ECB_HISTORY_URL,BOT_REFERENCE_URL].includes(evidence.sourceUrl)||evidence.purpose!=='DISPLAY_REFERENCE_ONLY'||!['ECB_REFERENCE','BOT_REFERENCE'].includes(evidence.provider))throw new Error('UNTRUSTED_REFERENCE_SOURCE');
 if(!Number.isFinite(retrievalNow.getTime())||Date.parse(evidence.retrievedAt)>retrievalNow.getTime())throw Error('FUTURE_RETRIEVAL');
 if(!Number.isFinite(now.getTime())||!Number.isSafeInteger(maxReferenceAgeDays)||maxReferenceAgeDays<0)throw new Error('INVALID_REFERENCE_AGE_POLICY');
 const dateNow=evidence.referenceTimezone?new Date(now.getTime()+3*3600000).toISOString().slice(0,10):now.toISOString().slice(0,10);
 const age=(Date.parse(dateNow+'T00:00:00Z')-Date.parse(evidence.referenceDate+'T00:00:00Z'))/86400000;if(age<0||age>maxReferenceAgeDays)throw new Error('STALE_OR_FUTURE_REFERENCE');
 if(!/^[A-Z]{3}$/.test(from)||!/^[A-Z]{3}$/.test(to)||!evidence.rates[from]||!evidence.rates[to])throw new Error('REFERENCE_PAIR_UNAVAILABLE');
 const base=fraction(evidence.rates[from]),target=fraction(evidence.rates[to]);const reverse=evidence.direction==='BASE_PER_UNIT';const quote:DisplayQuote=Object.freeze({from,to,numerator:String(reverse?base.numerator*target.denominator:target.numerator*base.denominator),denominator:String(reverse?base.denominator*target.numerator:target.denominator*base.numerator),evidence,transactionAllowed:false});trustedQuotes.add(quote);return quote;
}
/** Official BoT mean: TZS per unit of foreign currency. Never a buy/sell execution quote.
 * Publication exposes a calendar date, not an intraday timestamp. */
export function parseBotReferenceFeed(html:string,retrievedAt:string,sourceSha256:string):ReferenceRates{
 if(html.length>400000||!/^[a-f0-9]{64}$/.test(sourceSha256)||!Number.isFinite(Date.parse(retrievedAt)))throw Error('INVALID_REFERENCE_EVIDENCE');
 const tables=[...html.matchAll(/<table\b[^>]*\bid=["']table1["'][^>]*>([\s\S]*?)<\/table>/gi)];
 if(tables.length!==1||!['Currency','Buying','Selling','Mean','Transaction Date'].every(h=>tables[0][1].includes('>'+h+'<')))throw Error('INVALID_BOT_REFERENCE_FEED');
 const months=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];const rates:Record<string,string>={TZS:'1'};let date:string|null=null,count=0;const seen=new Set<string>(['TZS']);
 for(const row of tables[0][1].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)){
  const cells=[...row[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(c=>c[1].trim());if(!cells.length)continue;
  if(cells.length!==6||!/^\d+$/.test(cells[0])||!/^([A-Z]{3}|GOLD)$/.test(cells[1]))throw Error('INVALID_BOT_REFERENCE_ROW');
  const match=/^(\d{2})-([A-Z][a-z]{2})-(\d{2})$/.exec(cells[5]);if(!match||!months.includes(match[2]))throw Error('INVALID_REFERENCE_DATE');
  const day='20'+match[3]+'-'+String(months.indexOf(match[2])+1).padStart(2,'0')+'-'+match[1];calendarDate(day);if(date&&date!==day)throw Error('MIXED_REFERENCE_DATES');date=day;
  const buy=fraction(cells[2]),sell=fraction(cells[3]),mean=fraction(cells[4]);
  if(buy.numerator*sell.denominator>sell.numerator*buy.denominator||mean.numerator*buy.denominator<buy.numerator*mean.denominator||mean.numerator*sell.denominator>sell.numerator*mean.denominator)throw Error('INVALID_BOT_REFERENCE_SPREAD');
  if(seen.has(cells[1]))throw Error('DUPLICATE_REFERENCE_CURRENCY');seen.add(cells[1]);if(isSelectableCurrency(cells[1]))rates[cells[1]]=cells[4];count++;
 }
 if(!date||count<10||!rates.USD)throw Error('INCOMPLETE_REFERENCE_FEED');
 const snapshot:ReferenceRates=Object.freeze({provider:'BOT_REFERENCE',purpose:'DISPLAY_REFERENCE_ONLY',sourceUrl:BOT_REFERENCE_URL,referenceDate:date,retrievedAt,sourceSha256,rates:Object.freeze(rates),direction:'BASE_PER_UNIT',referenceTimezone:'Africa/Dar_es_Salaam'});trustedSnapshots.add(snapshot);return snapshot;
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
