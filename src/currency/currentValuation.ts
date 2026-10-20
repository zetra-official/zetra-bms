import {presentMoney,type RecordedMoney,type CurrencyView} from './engine';
import type {ReferenceRates} from '../services/referenceFx';
export const CURRENT_RATE_POLICY=Object.freeze({maxReferenceAgeDays:4,maxRetrievalAgeHours:24});
/** Period of the original transaction never changes the date of this valuation. */
export function currentValuation(value:RecordedMoney,target:string|null,evidence:ReferenceRates|null,now:Date,org:string):CurrencyView{
 const fresh=evidence&&Number.isFinite(now.getTime())&&now.getTime()-Date.parse(evidence.retrievedAt)<=CURRENT_RATE_POLICY.maxRetrievalAgeHours*3600000;
 const provider=value.currency==='TZS'||target==='TZS'?'BOT_REFERENCE':'ECB_REFERENCE';
 return presentMoney(value,target,fresh&&evidence?.provider===provider?evidence:null,now,CURRENT_RATE_POLICY.maxReferenceAgeDays,org);
}
/** Boundary for legacy numeric readers; reject unsafe or exponent notation. */
export function displayDecimal(value:unknown):string|null{
 if(typeof value==='number'&&(!Number.isFinite(value)||Math.abs(value)>Number.MAX_SAFE_INTEGER))return null;
 if(typeof value!=='string'&&typeof value!=='number')return null;
 const text=String(value);
 // Arithmetic tails from legacy Number aggregations are not original decimals.
 if(typeof value==='number'&&!Number.isSafeInteger(value)&&text.replace(/[^0-9]/g,'').replace(/^0+|0+$/g,'').length>15)return null;
 return /^-?\d{1,30}(\.\d{1,18})?$/.test(text)?text:null;
}

/** Presentation never widens access to totals hidden by the original product. */
export function authorizedValuationRows<T extends {ownerOnly?:boolean}>(rows:readonly T[],isOwner:boolean):readonly T[]{return rows.filter(row=>!row.ownerOnly||isOwner)}
