import {addExact,multiplyExact,subtractExact} from '../currency/engine';
import {identityDisplay} from '../currency/historical';
import {plainPriceAmount} from '../pos/itemAdjustment';
/** Reproduce the existing canonical legacy discount rule (whole-unit discount),
 * retaining fractional quantities and line totals. Not native posting approval. */
export function offlineReceiptTotals(payload:{items:{qty:number;unit_price:number}[];discount_type:string|null;discount_value:number|null}){
 let subtotal='0',quantity='0';
 for(const item of payload.items){if(!Number.isFinite(item.qty)||item.qty<=0||!Number.isFinite(item.unit_price)||item.unit_price<0)throw Error('INVALID_OFFLINE_RECEIPT');
  subtotal=addExact(subtotal,multiplyExact(plainPriceAmount(item.qty),plainPriceAmount(item.unit_price)));
  quantity=addExact(quantity,plainPriceAmount(item.qty));
 }
 const requested=payload.discount_value??0;if(!Number.isFinite(requested)||requested<0)throw Error('INVALID_OFFLINE_RECEIPT');
 let discount='0';
 if(payload.discount_type==='PERCENT')discount=identityDisplay(multiplyExact(multiplyExact(subtotal,plainPriceAmount(Math.min(100,requested))),'0.01'),0);
 else if(payload.discount_type==='FIXED')discount=identityDisplay(plainPriceAmount(requested),0);
 // Compare exact nonnegative decimal values without Number coercion.
 if(subtractExact(subtotal,discount).startsWith('-'))discount=subtotal;
 return Object.freeze({subtotal,discount,total:subtractExact(subtotal,discount),quantity});
}
