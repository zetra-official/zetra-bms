import {addExact,subtractExact,multiplyExact,currencyPrecision} from './engine';
import {identityDisplay} from './historical';
/** Mirrors canonical 1905 preview only. Server authority, permissions, current
 * product binding and final transaction remain mandatory; no posting here. */
export function settlementPreview(input:{currency:string;items:readonly {quantity:string;unitPrice:string}[];discountType:'PERCENT'|'FIXED'|null;discountValue:string;paid:string;credit:boolean;split?:{cash:string;mobile:string;bank:string}}){
 const digits=currencyPrecision(input.currency),legacy=input.currency==='TZS';let subtotal='0';
 const positive=(s:string)=>{if(!/^\d{1,18}(\.\d{1,12})?$/.test(s)||subtractExact(s,'0').startsWith('-'))throw Error('INVALID_SETTLEMENT_AMOUNT');return s};
 if(!input.items.length)throw Error('INVALID_SETTLEMENT_ITEMS');
 for(const item of input.items){if(!/^\d{1,18}(\.\d{1,3})?$/.test(item.quantity)||subtractExact(item.quantity,'0')==='0'||subtractExact(positive(item.unitPrice),'0')==='0')throw Error('INVALID_SETTLEMENT_ITEMS');subtotal=addExact(subtotal,multiplyExact(item.quantity,item.unitPrice))}
 const value=positive(input.discountValue);let discount='0';
 if(input.discountType==='PERCENT'){
  if(subtractExact(value,'100').startsWith('-')||subtractExact(value,'100')==='0')discount=identityDisplay(multiplyExact(multiplyExact(subtotal,value),'0.01'),legacy?0:digits);
  else discount=identityDisplay(subtotal,legacy?0:digits);
 }else if(input.discountType==='FIXED')discount=identityDisplay(value,legacy?0:digits);
 if(subtractExact(subtotal,discount).startsWith('-'))discount=subtotal;
 const raw=subtractExact(subtotal,discount),total=legacy?raw:identityDisplay(raw,digits),rounding=subtractExact(total,raw),paid=positive(input.paid);
 if(subtractExact(total,'0')==='0'||subtractExact(total,paid).startsWith('-'))throw Error('INVALID_SETTLEMENT_PAYMENT');
 if(!legacy&&subtractExact(identityDisplay(paid,digits),paid)!=='0')throw Error('INVALID_TENDER_PRECISION');
 if(input.split){let allocated='0';for(const amount of Object.values(input.split)){positive(amount);if(!legacy&&subtractExact(identityDisplay(amount,digits),amount)!=='0')throw Error('INVALID_TENDER_PRECISION');allocated=addExact(allocated,amount)}if(subtractExact(allocated,paid)!=='0')throw Error('PAYMENT_RECONCILIATION_FAILED')}
 const balance=subtractExact(total,paid);if(balance!=='0'&&!input.credit)throw Error('EXPLICIT_CREDIT_AUTHORIZATION_REQUIRED');
 return Object.freeze({currency:input.currency,subtotal,discount,rounding,total,paid,balance,postingAllowed:false as const,policy:legacy?'LEGACY_TZS':'ISO_NATIVE_HALF_AWAY_FROM_ZERO'});
}
