import {fromCheckout,type ExistingCartItem} from '../../smart-pricing-local-2026-10-16/src/checkoutAdapter';
import {price,parseOrderDiscount,type Context,type Quote} from '../../smart-pricing-local-2026-10-16/src/pricing';
import type {DisplayLine} from '../../smart-pricing-local-2026-10-16/src/PricingSummary';
export interface PricingReadPort{prepare(request:{organizationId:string;storeId:string;requestId:string;raw:Readonly<Record<string,unknown>>}):Promise<{quote:Quote;fingerprint:string}>}
/** Checkout integration state, not another cart/sale engine. No language/display
 * preference in the financial envelope; changing locale never performs an RPC. */
export class CheckoutPricingSession{
 lines:readonly DisplayLine[];context:Context;discount='';note='';prepared:{quote:Quote;fingerprint:string}|null=null;
 constructor(cart:readonly ExistingCartItem[],readonly catalog:ReadonlyMap<string,{unitPrice:string;eligible:boolean}>,context:Context,readonly requestId:string,private port:PricingReadPort){this.lines=fromCheckout(cart,catalog);this.context={...context};}
 private changed(){this.context={...this.context,cartRevision:this.context.cartRevision+1};this.prepared=null;}
 updateLines(lines:readonly DisplayLine[]){this.changed();price(lines,parseOrderDiscount(this.discount),this.context);this.lines=lines.map(l=>({...l,adjustment:l.adjustment?{...l.adjustment}:undefined}));}
 updateCart(cart:readonly ExistingCartItem[]){
  const next=fromCheckout(cart,this.catalog).map(l=>{const old=this.lines.find(o=>o.id===l.id&&o.productId===l.productId);return old&&old.unitPrice===l.unitPrice&&old.sellingUnit===l.sellingUnit?{...l,adjustment:old.adjustment}:l;});
  this.updateLines(next);
 }
 setDiscount(raw:string){this.changed();this.discount=raw;}
 setNote(note:string){this.changed();this.note=note;}
 preview(){return price(this.lines,parseOrderDiscount(this.discount),this.context);}
 async prepare(){
  const revision=this.context.cartRevision;
  const raw={cartRevision:revision,lines:this.lines.map(l=>({id:l.id,productId:l.productId,quantity:l.quantity,adjustment:l.adjustment?{...l.adjustment}:undefined})),order:parseOrderDiscount(this.discount),note:this.note};
  const result=await this.port.prepare({organizationId:this.context.organizationId,storeId:this.context.storeId,requestId:this.requestId,raw});
  if(revision!==this.context.cartRevision)throw Error('STALE_CHECKOUT_PREPARATION');
  if(result.quote.context.organizationId!==this.context.organizationId||result.quote.context.storeId!==this.context.storeId||result.quote.context.cartRevision!==revision||result.quote.context.currency!==this.context.currency||result.quote.context.revision!==this.context.revision||!result.fingerprint)throw Error('INVALID_PRICING_RESPONSE');
  const expected=this.preview();
  if(result.quote.context.catalogRevision!==this.context.catalogRevision||JSON.stringify(result.quote.totals)!==JSON.stringify(expected.totals)||JSON.stringify(result.quote.lines)!==JSON.stringify(expected.lines))throw Error('PRICE_CHANGED_REVIEW_REQUIRED');
  this.prepared=result;return result;
 }
 async dispatch():Promise<never>{throw Error('PRICING_APPLICATION_ACTIVATION_NOT_AUTHORIZED');}
 async enqueue():Promise<never>{throw Error('PRICING_OFFLINE_CONTRACT_NOT_BOUND');}
}
