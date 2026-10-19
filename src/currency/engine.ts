import {isoMinorUnits} from './metadata';
import {convertDisplayDecimal,makeDisplayQuote,type ReferenceRates} from '../services/referenceFx';
/** Explicit manual invoice quotation only. Never a posting/FX provider rate. */
export function manualInvoiceAmount(amount:string,rate:string,precision:number):string {
 if(!/^\d{1,18}(\.\d{1,6})?$/.test(amount)||!/^\d{1,12}(\.\d{1,12})?$/.test(rate)||!Number.isInteger(precision)||precision<0||precision>6)throw Error('INVALID_INVOICE_FX');
 const [a,af='']=amount.split('.'),[r,rf='']=rate.split('.');const numerator=BigInt(a+af)*BigInt(r+rf)*10n**BigInt(precision),denominator=10n**BigInt(af.length+rf.length);
 if(BigInt(r+rf)<=0n)throw Error('INVALID_INVOICE_FX');let units=numerator/denominator;if(numerator%denominator*2n>=denominator)units++;
 const scale=10n**BigInt(precision);if(units/scale>=1000000000000000000n)throw Error('INVOICE_FX_OUT_OF_RANGE');
 return String(units/scale)+(precision?'.'+String(units%scale).padStart(precision,'0'):'');
}
export type CurrencyStatus='ORIGINAL'|'CONVERTED'|'UNVERIFIED_CURRENCY'|'RATE_UNAVAILABLE';
export type RecordedMoney={amount:string;currency:string|null;organizationId:string;contextRevision:number|null;source:'TRANSACTION_RECORD'|'OWNER_CONFIRMED_CURRENT'|'LEGACY_UNVERIFIED'};
export type CurrencyView={status:CurrencyStatus;original:Readonly<RecordedMoney>;displayAmount:string;displayCurrency:string|null;rate?:{provider:string;referenceDate:string;retrievedAt:string;sourceSha256:string;numerator:string;denominator:string};rounding:'HALF_AWAY_FROM_ZERO_DISPLAY_ONLY';postingAllowed:false};
const decimal=/^-?\d{1,30}(\.\d{1,18})?$/;
export function validateMoney(value:RecordedMoney):void{
 if(!decimal.test(value.amount)||!value.organizationId||!['TRANSACTION_RECORD','OWNER_CONFIRMED_CURRENT','LEGACY_UNVERIFIED'].includes(value.source))throw Error('INVALID_MONEY');
 if(value.currency!==null&&!/^[A-Z]{3}$/.test(value.currency))throw Error('INVALID_CURRENCY');
 if(value.contextRevision!==null&&(!Number.isSafeInteger(value.contextRevision)||value.contextRevision<1))throw Error('INVALID_CURRENCY_REVISION');
}
export function currencyPrecision(code:string,policy:'ISO_ACCOUNTING'|'LEGACY_PROFORMA'='ISO_ACCOUNTING'):number{
 if(!/^[A-Z]{3}$/.test(code))throw Error('INVALID_CURRENCY');
 // Preserve the existing 1705 Proforma preview contract until server precision is reconciled.
 if(policy==='LEGACY_PROFORMA'){
 const supported=(Intl as typeof Intl&{supportedValuesOf?:(key:string)=>string[]}).supportedValuesOf;
 if(!supported||!supported('currency').includes(code))throw Error('CURRENCY_METADATA_UNAVAILABLE');
 const digits=new Intl.NumberFormat('en',{style:'currency',currency:code}).resolvedOptions().maximumFractionDigits;
 if(typeof digits!=='number'||!Number.isSafeInteger(digits)||digits<0||digits>6)throw Error('CURRENCY_METADATA_UNAVAILABLE');
 return digits;
 }
 return isoMinorUnits(code);
}
/** Locale parsing without Number(amount). Accept ASCII decimals or correctly
 * grouped locale digits; malformed grouping is never silently stripped. */
export function parseLocalizedAmount(input:string,locale:string):string{
 if(input.length>100)throw Error('INVALID_AMOUNT');
 const inputLocale=locale.startsWith('ar')&&/[٠-٩]/.test(input)?'ar-u-nu-arab':locale;
 const nf=new Intl.NumberFormat(inputLocale),parts=nf.formatToParts(1234567890123.4),separator=parts.find(p=>p.type==='decimal')?.value||'.',group=parts.find(p=>p.type==='group')?.value;
 if(decimal.test(input.trim())&&(separator==='.'||group!=='.'||!input.includes('.')))return input.trim();
 let value=input.trim().replace(/[\u061c\u200e\u200f]/g,'');
 for(let digit=0;digit<=9;digit++){const local=new Intl.NumberFormat(inputLocale,{useGrouping:false}).format(digit);value=value.split(local).join(String(digit));}
 const minus=nf.formatToParts(-1).find(p=>p.type==='minusSign')?.value||'-';value=value.replace(minus,'-');
 const negative=value.startsWith('-');if(negative)value=value.slice(1);const chunks=value.split(separator);if(chunks.length>2)throw Error('INVALID_AMOUNT');
 let whole=chunks[0];if(group&&whole.includes(group)){const groups=whole.split(group),sample=parts.filter(p=>p.type==='integer'),primary=sample[sample.length-1].value.length,secondary=sample[sample.length-2]?.value.length||primary;
  if(groups[0].length<1||groups[0].length>secondary||groups[groups.length-1].length!==primary||groups.slice(1,-1).some(x=>x.length!==secondary)||groups.some(x=>!/^\d+$/.test(x)))throw Error('INVALID_AMOUNT');whole=groups.join('');}
 const result=(negative?'-':'')+whole+(chunks.length===2?'.'+chunks[1]:'');if(!decimal.test(result))throw Error('INVALID_AMOUNT');return result;
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
 // Hermes Intl may reject BigInt. Infer grouping from a safe integer and
 // group the original digit string; never coerce a business amount to Number.
 const sample=nf.formatToParts(1234567890123),groups=sample.filter(p=>p.type==='integer'),group=sample.find(p=>p.type==='group')?.value;
 const primary=groups[groups.length-1]?.value.length||3,secondary=groups[groups.length-2]?.value.length||primary;
 const digits=whole.replace(/^0+(?=\d)/,''),parts:string[]=[];
 let end=digits.length,size=primary;
 const shouldGroup=!!group&&(digits.length>4||nf.formatToParts(1234).some(p=>p.type==='group'));
 if(shouldGroup){while(end>0){parts.unshift(digits.slice(Math.max(0,end-size),end));end-=size;size=secondary}}else parts.push(digits);
 const localized=parts.map(part=>[...part].map(d=>nf.format(Number(d))).join('')).join(group??'');
 return sign+localized+(fraction?separator+[...fraction].map(d=>nf.format(Number(d))).join(''):'');
 }catch{return value}
}
/** Original recorded amount only. Currency placement comes from Intl, while
 * digits never pass through Number. Extra unit-price precision is retained;
 * this formatter does not validate or round a settlement/posting instruction. */
export function formatCurrencyExact(value:string,currency:string,locale:string,minimumFractionDigits=currencyPrecision(currency)):string{
 if(!decimal.test(value)||!Number.isInteger(minimumFractionDigits)||minimumFractionDigits<0||minimumFractionDigits>6)throw Error('INVALID_AMOUNT');
 currencyPrecision(currency);
 const negative=value.startsWith('-'),[whole,fraction='']=(negative?value.slice(1):value).split('.');
 const padded=whole+(fraction.length||minimumFractionDigits?'.'+fraction.padEnd(minimumFractionDigits,'0'):'');
 const digits=formatExact(padded,locale),parts=new Intl.NumberFormat(locale,{style:'currency',currency}).formatToParts(negative?-1:1);
 let inserted=false;
 return parts.map(part=>{if(['integer','group','decimal','fraction'].includes(part.type)){if(inserted)return '';inserted=true;return digits}return part.value}).join('');
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
