import {currencyMetadata} from '../currency/metadata';
export const BOT_REFERENCE_URL='https://www.bot.go.tz/exchangerate/excrates?lang=en';
export const BOT_PROVIDER_LIMITATIONS={excludedInstruments:['GOLD: metal unit convention not verified'],aliasesNotMapped:['SDR'],historicalApiVerified:false,commercialDeliveryActivated:false} as const;
/** Offline provider preparation. Public HTML is not a contracted historical API.
 * No loader/activation until unit convention, reuse and browser delivery reviewed. */
export function parseBotObservations(html:string,retrievedAt:string,sha256:string){
 if(html.length>524288||!Number.isFinite(Date.parse(retrievedAt))||! /^[a-f0-9]{64}$/.test(sha256))throw Error('INVALID_BOT_EVIDENCE');
 const rows=[...html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map(row=>[...row[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(cell=>cell[1].replace(/<[^>]*>/g,'').replace(/&nbsp;|&#160;/g,' ').trim()));
 const header=rows.findIndex(r=>r.join('|')==='S/NO|Currency|Buying|Selling|Mean|Transaction Date');if(header<0)throw Error('BOT_TABLE_LAYOUT_CHANGED');
 const month=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];const seen=new Set<string>();
 const observations=rows.slice(header+1).filter(r=>r.length===6&&r.join('|')!==rows[header].join('|')&&r[1]!=='GOLD').map(r=>{
  const [,code,buy,sell,mean,day]=r;if(!/^[A-Z]{3}$/.test(code)||seen.has(code))throw Error('INVALID_BOT_CURRENCY');seen.add(code);
  for(const rate of [buy,sell,mean])if(!/^\d{1,12}(\.\d{1,8})?$/.test(rate)||BigInt(rate.replace('.',''))<=0n)throw Error('INVALID_BOT_RATE');
  const parts=/^(\d\d)-([A-Z][a-z]{2})-(\d\d)$/.exec(day);if(!parts||!month.includes(parts[2]))throw Error('INVALID_BOT_DATE');
  // Explicitly bounded to the versioned current provider observation epoch.
  const date=`20${parts[3]}-${String(month.indexOf(parts[2])+1).padStart(2,'0')}-${parts[1]}`;
  if(new Date(date+'T00:00:00Z').toISOString().slice(0,10)!==date||date>retrievedAt.slice(0,10))throw Error('INVALID_BOT_DATE');
  return Object.freeze({base:code,quote:'TZS',rate:mean,buying:buy,selling:sell,kind:'REFERENCE_MEAN',referenceDate:date,sourceUrl:BOT_REFERENCE_URL,sourceSha256:sha256,retrievedAt,eligibleCurrency:currencyMetadata(code)?.status==='ACTIVE',activation:'BLOCKED_PENDING_PROVIDER_REVIEW',transactionAllowed:false});
 });
 if(!observations.length)throw Error('BOT_TABLE_EMPTY');return Object.freeze(observations);
}
