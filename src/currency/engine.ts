import {convertDisplayDecimal,makeDisplayQuote,type ReferenceRates} from '../services/referenceFx';
export type CurrencyStatus='ORIGINAL'|'CONVERTED'|'UNVERIFIED_CURRENCY'|'RATE_UNAVAILABLE';
export type RecordedMoney={amount:string;currency:string|null;organizationId:string;contextRevision:number|null;source:'TRANSACTION_RECORD'|'OWNER_CONFIRMED_CURRENT'|'LEGACY_UNVERIFIED'};
export type CurrencyView={status:CurrencyStatus;original:Readonly<RecordedMoney>;displayAmount:string;displayCurrency:string|null;rate?:{provider:string;referenceDate:string;retrievedAt:string;sourceSha256:string;numerator:string;denominator:string};rounding:'HALF_AWAY_FROM_ZERO_DISPLAY_ONLY';postingAllowed:false};
const decimal=/^-?\d{1,30}(\.\d{1,18})?$/;
export function validateMoney(value:RecordedMoney):void{
 if(!decimal.test(value.amount)||!value.organizationId||!['TRANSACTION_RECORD','OWNER_CONFIRMED_CURRENT','LEGACY_UNVERIFIED'].includes(value.source))throw Error('INVALID_MONEY');
 if(value.currency!==null&&!/^[A-Z]{3}$/.test(value.currency))throw Error('INVALID_CURRENCY');
 if(value.contextRevision!==null&&(!Number.isSafeInteger(value.contextRevision)||value.contextRevision<1))throw Error('INVALID_CURRENCY_REVISION');
}
export function currencyPrecision(code:string):number{
 if(!/^[A-Z]{3}$/.test(code))throw Error('INVALID_CURRENCY');
 const supported=(Intl as typeof Intl&{supportedValuesOf?:(key:string)=>string[]}).supportedValuesOf;
 if(!supported||!supported('currency').includes(code))throw Error('CURRENCY_METADATA_UNAVAILABLE');
 const digits=new Intl.NumberFormat('en',{style:'currency',currency:code}).resolvedOptions().maximumFractionDigits;
 if(typeof digits!=='number'||!Number.isSafeInteger(digits)||digits<0||digits>6)throw Error('CURRENCY_METADATA_UNAVAILABLE');
 return digits;
}
/** No binary-float conversion of amounts, including values beyond 2^53.
 * Original accounting digits are preserved; only converted display is rounded.
 */
export function formatExact(value:string,language:string):string{
 if(!decimal.test(value))throw Error('INVALID_AMOUNT');
 try{
 const negative=value.startsWith('-'),[whole,fraction='']=(negative?value.slice(1):value).split('.');
 const nf=new Intl.NumberFormat(language,{maximumFractionDigits:0});
 const separator=new Intl.NumberFormat(language,{minimumFractionDigits:1}).formatToParts(1.1).find(p=>p.type==='decimal')!.value;
 const sign=negative?new Intl.NumberFormat(language).formatToParts(-1).find(p=>p.type==='minusSign')?.value||'-':'';
 return sign+nf.format(BigInt(whole))+(fraction?separator+[...fraction].map(d=>nf.format(Number(d))).join(''):'');
 }catch{return value}
}
export function presentMoney(input:RecordedMoney,displayCurrency:string|null,evidence:ReferenceRates|null,now:Date,maxAgeDays:number,organizationId:string):CurrencyView{
 validateMoney(input);if(input.organizationId!==organizationId)throw Error('CURRENCY_TENANT_MISMATCH');
 if(displayCurrency!==null&&!/^[A-Z]{3}$/.test(displayCurrency))throw Error('INVALID_DISPLAY_CURRENCY');
 const original=Object.freeze({...input});
 const base={original,displayAmount:input.amount,displayCurrency:input.currency,rounding:'HALF_AWAY_FROM_ZERO_DISPLAY_ONLY' as const,postingAllowed:false as const};
 if(input.source==='LEGACY_UNVERIFIED'||!input.currency||(input.source==='OWNER_CONFIRMED_CURRENT'&&input.contextRevision===null))return Object.freeze({...base,displayCurrency:null,status:'UNVERIFIED_CURRENCY'});
 if(!displayCurrency||input.currency===displayCurrency)return Object.freeze({...base,status:'ORIGINAL'});
 try{
  if(!evidence)throw Error('MISSING_REFERENCE');
  const retrieved=Date.parse(evidence.retrievedAt);
  if(!Number.isFinite(retrieved)||retrieved>now.getTime())throw Error('FUTURE_RETRIEVAL');
  const quote=makeDisplayQuote(evidence,input.currency,displayCurrency,now,maxAgeDays);
  const displayAmount=convertDisplayDecimal(input.amount,quote,currencyPrecision(displayCurrency));
  return Object.freeze({...base,status:'CONVERTED',displayAmount,displayCurrency,rate:Object.freeze({provider:evidence.provider,referenceDate:evidence.referenceDate,retrievedAt:evidence.retrievedAt,sourceSha256:evidence.sourceSha256,numerator:quote.numerator,denominator:quote.denominator})});
 }catch{return Object.freeze({...base,status:'RATE_UNAVAILABLE'})}
}
/** No display preference/quote can become a posting instruction. */
export function transactionContext(amount:string,currency:string,accounting:{organizationId:string;currency:string;revision:number},organizationId:string){
 const input:RecordedMoney={amount,currency,organizationId,contextRevision:accounting.revision,source:'TRANSACTION_RECORD'};validateMoney(input);
 if(accounting.organizationId!==organizationId)throw Error('CURRENCY_TENANT_MISMATCH');
 if(currency!==accounting.currency)throw Error('MULTI_CURRENCY_POSTING_REQUIRES_SEPARATE_CONTRACT');
 return Object.freeze({...input,accountingCurrency:accounting.currency,exchangeRate:'1',rateSource:'SAME_CURRENCY_IDENTITY',displayRateUsed:false});
}
