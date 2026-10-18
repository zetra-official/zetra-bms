import {makeDisplayQuote,convertDisplayDecimal,type ReferenceRates} from '../services/referenceFx';
import {currencyPrecision,validateMoney,type RecordedMoney} from './engine';
export type HistoricalMoney=RecordedMoney&{effectiveAt:string};
function dateOnly(value:string){if(!/^\d{4}-\d{2}-\d{2}$/.test(value)||new Date(value+'T00:00:00Z').toISOString().slice(0,10)!==value)throw Error('INVALID_EFFECTIVE_DATE');return value;}
export function businessDate(instant:string,timezone:string):string{
 if(!/(Z|[+-]\d\d:\d\d)$/.test(instant)||!Number.isFinite(Date.parse(instant)))throw Error('TIMESTAMP_OFFSET_REQUIRED');
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(instant));const get=(key:string)=>parts.find(p=>p.type===key)!.value;
 return dateOnly(`${get('year')}-${get('month')}-${get('day')}`);
}
export function historicalSnapshot(snapshots:readonly ReferenceRates[],date:string,maxPriorDays:number){
 dateOnly(date);if(!Number.isSafeInteger(maxPriorDays)||maxPriorDays<0||maxPriorDays>7)throw Error('INVALID_HISTORICAL_POLICY');
 const usable=snapshots.filter(s=>s.referenceDate<=date).sort((a,b)=>b.referenceDate.localeCompare(a.referenceDate));const s=usable[0];
 if(!s||((Date.parse(date+'T00:00:00Z')-Date.parse(s.referenceDate+'T00:00:00Z'))/86400000)>maxPriorDays)throw Error('HISTORICAL_RATE_UNAVAILABLE');return s;
}
/** Convert components before summing. Each line rounds HALF_AWAY_FROM_ZERO at
 * target ISO scale. This is an informational estimate, never a booked statement. */
export function historicalReport(rows:readonly HistoricalMoney[],target:string,organizationId:string,snapshots:readonly ReferenceRates[],timezone:string,maxPriorDays:number,now:Date){
 const scale=currencyPrecision(target);let total=0n;const components=rows.map(row=>{
  validateMoney(row);if(row.organizationId!==organizationId)throw Error('CURRENCY_TENANT_MISMATCH');
  if(row.source!=='TRANSACTION_RECORD'||!row.currency)throw Error('HISTORICAL_CURRENCY_UNVERIFIED');
  const date=businessDate(row.effectiveAt,timezone);
  if(Date.parse(row.effectiveAt)>now.getTime())throw Error('FUTURE_TRANSACTION');
  let amount:string,reference:ReferenceRates|null=null;
  if(row.currency===target){amount=identityDisplay(row.amount,scale);}else{reference=historicalSnapshot(snapshots,date,maxPriorDays);const q=makeDisplayQuote(reference,row.currency,target,new Date(date+'T23:59:59.999Z'),maxPriorDays,now);amount=convertDisplayDecimal(row.amount,q,scale);}
  total+=BigInt(amount.replace('.',''));return Object.freeze({original:Object.freeze({...row}),amount,currency:target,businessDate:date,reference});
 });
 const negative=total<0n,abs=negative?-total:total,padded=abs.toString().padStart(scale+1,'0');
 return Object.freeze({amount:(negative?'-':'')+(scale?padded.slice(0,-scale)+'.'+padded.slice(-scale):padded),currency:target,components:Object.freeze(components),postingAllowed:false,reportType:'INFORMATIONAL_HISTORICAL_ESTIMATE',rounding:'PER_LINE_HALF_AWAY_FROM_ZERO'});
}
export function identityDisplay(amount:string,scale:number):string{
 if(!/^-?\d{1,30}(\.\d{1,18})?$/.test(amount)||!Number.isInteger(scale)||scale<0||scale>6)throw Error('INVALID_DISPLAY_AMOUNT');
 const neg=amount.startsWith('-'),[whole,frac='']=(neg?amount.slice(1):amount).split('.');let units=BigInt(whole)*10n**BigInt(scale)+BigInt((frac+'0'.repeat(scale)).slice(0,scale)||'0');
 if(frac.length>scale&&Number(frac[scale])>=5)units++;const out=units.toString().padStart(scale+1,'0');return (neg&&units>0n?'-':'')+(scale?out.slice(0,-scale)+'.'+out.slice(-scale):out);
}
export function cashRoundingPreview(amount:string,currency:string,cashDigits:number,cashIncrement:number){
 if(!currency||!Number.isInteger(cashDigits)||cashDigits<0||cashDigits>6||!Number.isInteger(cashIncrement)||cashIncrement<0)throw Error('INVALID_CASH_RULE');
 if(!cashIncrement)return identityDisplay(amount,cashDigits);
 if(!/^-?\d{1,30}(\.\d{1,18})?$/.test(amount))throw Error('INVALID_DISPLAY_AMOUNT');
 const neg=amount.startsWith('-'),[whole,frac='']=(neg?amount.slice(1):amount).split('.'),step=BigInt(cashIncrement);
 const numerator=BigInt(whole+frac)*10n**BigInt(cashDigits),denominator=10n**BigInt(frac.length)*step;
 let units=numerator/denominator;if(numerator%denominator*2n>=denominator)units++;
 const value=(units*step).toString().padStart(cashDigits+1,'0');return (neg&&units>0n?'-':'')+(cashDigits?value.slice(0,-cashDigits)+'.'+value.slice(-cashDigits):value);
}
