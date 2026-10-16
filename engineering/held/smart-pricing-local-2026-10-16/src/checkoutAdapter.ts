import {price,parseOrderDiscount,type Context} from './pricing';
import type {DisplayLine} from './PricingSummary';
export type ExistingCartItem={product_id:string;name:string;sku:string|null;qty:number;unit:string|null;unit_price:number;line_total:number;extra_per_qty?:number};
/** Actual checkout cart shape. Catalog prices come from a trusted snapshot,
 * never the display preference, cached line_total or arbitrary unit_price.
 * Legacy markup is preserved as one per-unit increase, not applied twice. */
export function fromCheckout(cart:readonly ExistingCartItem[],catalog:ReadonlyMap<string,{unitPrice:string;eligible:boolean}>):readonly DisplayLine[]{
 return cart.map((c,i)=>{
  const p=catalog.get(c.product_id);if(!p)throw Error('PRODUCT_UNAVAILABLE');
  if(!Number.isFinite(c.qty)||Math.abs(c.qty)>Number.MAX_SAFE_INTEGER)throw Error('INVALID_QUANTITY');
  const extra=c.extra_per_qty??0;if(!Number.isSafeInteger(extra)||extra<0)throw Error('INVALID_LEGACY_MARKUP');
  return {id:c.product_id+':'+i,productId:c.product_id,name:c.name,sku:c.sku??'',sellingUnit:c.unit??'',quantity:String(c.qty),unitPrice:p.unitPrice,eligible:p.eligible,adjustment:extra?{direction:'INCREASE' as const,mode:'FIXED' as const,scope:'UNIT' as const,value:String(extra)}:undefined};
 });
}
export function checkoutPreview(lines:readonly DisplayLine[],discountText:string,context:Context){
 return {quote:price(lines,parseOrderDiscount(discountText),context),canDispatch:false as const,canEnqueue:false as const,requiredContract:'CANONICAL_PRICING_PERSISTENCE_AND_AUTHORIZATION'};
}
