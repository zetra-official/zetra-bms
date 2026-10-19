import {addExact,multiplyExact,subtractExact} from '../currency/engine';
import {identityDisplay} from '../currency/historical';
import {plainPriceAmount} from '../pos/itemAdjustment';
import {settlementPreview} from '../currency/settlement';
export function receiptDecimal(value:number|string):string{
 const amount=typeof value==='number'?plainPriceAmount(value):value;
 return addExact(amount,'0');
}
/** Reproduce the existing canonical legacy discount rule (whole-unit discount),
 * retaining fractional quantities and line totals. Not native posting approval. */
export function offlineReceiptTotals(payload:{items:{qty:number|string;unit_price:number|string}[];discount_type:string|null;discount_value:number|string|null},currency?:string){
 let subtotal='0',quantity='0';
 for(const item of payload.items){const qty=receiptDecimal(item.qty),price=receiptDecimal(item.unit_price);if(qty==='0'||qty.startsWith('-')||price.startsWith('-'))throw Error('INVALID_OFFLINE_RECEIPT');
  subtotal=addExact(subtotal,multiplyExact(qty,price));
  quantity=addExact(quantity,qty);
 }
 if(currency){
  if(payload.discount_type!==null&&payload.discount_type!=='PERCENT'&&payload.discount_type!=='FIXED')throw Error('INVALID_OFFLINE_RECEIPT');
  const preview=settlementPreview({currency,items:payload.items.map(i=>({quantity:receiptDecimal(i.qty),unitPrice:receiptDecimal(i.unit_price)})),discountType:payload.discount_type,discountValue:receiptDecimal(payload.discount_value??0),paid:'0',credit:true});
  return Object.freeze({subtotal:preview.subtotal,discount:preview.discount,total:preview.total,quantity});
 }
 const requested=receiptDecimal(payload.discount_value??0);if(requested.startsWith('-'))throw Error('INVALID_OFFLINE_RECEIPT');
 let discount='0';
 if(payload.discount_type==='PERCENT')discount=identityDisplay(multiplyExact(multiplyExact(subtotal,subtractExact('100',requested).startsWith('-')?'100':requested),'0.01'),0);
 else if(payload.discount_type==='FIXED')discount=identityDisplay(requested,0);
 // Compare exact nonnegative decimal values without Number coercion.
 if(subtractExact(subtotal,discount).startsWith('-'))discount=subtotal;
 return Object.freeze({subtotal,discount,total:subtractExact(subtotal,discount),quantity});
}
