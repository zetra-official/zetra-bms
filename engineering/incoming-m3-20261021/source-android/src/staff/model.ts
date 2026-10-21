import {displayDecimal,currentValuation} from '../currency/currentValuation';
import {formatCurrencyExact,formatExact} from '../currency/engine';
import type {ReferenceRates} from '../services/referenceFx';
export type Scope={actor:string;organization:string;store:string};
export type Summary=Scope&{day:string;timezone:string;sales:string|null;orders:number|null;expenses:string|null;average:string|null;money_in:string|null;money_status:'VERIFIED_GROSS_COLLECTIONS'|'ATTRIBUTION_UNAVAILABLE';history_total:number;history:{id:string;kind:'SALE'|'PAYMENT'|'EXPENSE';at:string;amount:string}[]};
const id=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export function scopeKey(s:Scope){if(![s.actor,s.organization,s.store].every(v=>id.test(v)))throw Error('SCOPE');return JSON.stringify([s.actor,s.organization,s.store])}
function decimal(v:unknown){if(typeof v!=='string'||displayDecimal(v)===null||v.startsWith('-'))throw Error('INVALID_ORIGINAL');return v}
/** Explicit response allowlist; protected fields are never copied to UI state. */
export function readSummary(value:unknown,s:Scope):Summary{
 scopeKey(s);const r=value as Record<string,any>;
 if(!r||r.version!==1||r.actor_id!==s.actor||r.organization_id!==s.organization||r.store_id!==s.store||r.currency!=='TZS')throw Error('RESPONSE_SCOPE');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(r.day)||typeof r.timezone!=='string'||!r.timezone)throw Error('PERIOD');
 try{new Intl.DateTimeFormat('en',{timeZone:r.timezone}).format(new Date(0))}catch{throw Error('PERIOD')}
 if(r.orders!==null&&(!Number.isSafeInteger(r.orders)||r.orders<0)||!Number.isSafeInteger(r.history_total)||r.history_total<0||!Array.isArray(r.history)||r.history.length>50)throw Error('COUNTS');
 for(const [status,values] of [[r.sales_status,[r.sales,r.average,r.orders]],[r.expenses_status,[r.expenses]]] as const){
  if(!['VERIFIED','ATTRIBUTION_UNAVAILABLE'].includes(status)||values.some(v=>(status==='VERIFIED')!==(v!==null)))throw Error('ATTRIBUTION_STATUS');
 }
 if(!['VERIFIED_GROSS_COLLECTIONS','ATTRIBUTION_UNAVAILABLE'].includes(r.money_status)||(r.money_status==='VERIFIED_GROSS_COLLECTIONS')!==(r.money_in!==null))throw Error('PAYMENT_STATUS');
 const seen=new Set<string>();const history=r.history.map((h:Record<string,unknown>)=>{const key=h.kind+':'+h.id;
  if(!['SALE','PAYMENT','EXPENSE'].includes(String(h.kind))||typeof h.id!=='string'||!id.test(h.id)||typeof h.at!=='string'||!Number.isFinite(Date.parse(h.at))||seen.has(key))throw Error('HISTORY');seen.add(key);
  return {id:h.id,kind:h.kind as 'SALE'|'PAYMENT'|'EXPENSE',at:h.at,amount:decimal(h.amount)};
 });
 return {...s,day:r.day,timezone:r.timezone,sales:r.sales===null?null:decimal(r.sales),orders:r.orders,expenses:r.expenses===null?null:decimal(r.expenses),average:r.average===null?null:decimal(r.average),money_in:r.money_in===null?null:decimal(r.money_in),money_status:r.money_status,history_total:r.history_total,history};
}
/** TZS-to-TZS is formatting, independent of external rates; cross currency reuses approved engine. */
export function displayOwnMoney(amount:string,target:string|null,evidence:ReferenceRates|null,now:Date,org:string,language:string){
 decimal(amount);if(!target||target==='TZS')return {status:'ORIGINAL' as const,text:formatCurrencyExact(amount,'TZS',language,0)};
 const view=currentValuation({amount,currency:'TZS',organizationId:org,contextRevision:null,source:'TRANSACTION_RECORD'},target,evidence,now,org);
 return view.status==='CONVERTED'?{status:'CONVERTED' as const,text:formatExact(view.displayAmount,language)+' '+view.displayCurrency}:{status:'UNAVAILABLE' as const,text:formatCurrencyExact(amount,'TZS',language,0)};
}
