import {createHash} from 'node:crypto';
import {price,enforceLimits,type Context,type Line,type Discount,type Quote} from '../src/pricing';
export type Policy=Parameters<typeof enforceLimits>[1];
export type Request={organizationId:string;storeId:string;cartRevision:number;requestId:string;lines:readonly Omit<Line,'unitPrice'|'eligible'>[];order?:Discount;note:string};
export interface Authority{
 /** Must use one locked DB snapshot, real session identity, active membership,
  * store assignment, confirmed accounting context and Owner policy. NOT a client port. */
 snapshot(session:string,request:Request):Promise<{actorId:string;active:boolean;organizationId:string;storeId:string;policyRevision:number;policy:Policy;context:Context;catalog:readonly {productId:string;unitPrice:string;eligible:boolean}[]}>;
 approval(session:string,id:string):Promise<Approval|null>;
}
export type Approval={actorId:string;organizationId:string;storeId:string;fingerprint:string;policyRevision:number;expiresAt:string;approved:boolean};
export function pricingService(authority:Authority){
 return {
  async validate(session:string,request:Request,approvalId?:string,now=new Date()){
   if(!request.requestId||typeof request.note!=='string'||request.note.length>2000)throw Error('INVALID_REQUEST');
   const snapshot=await authority.snapshot(session,request);
   if(snapshot.active!==true||!snapshot.actorId||snapshot.organizationId!==request.organizationId||snapshot.storeId!==request.storeId||snapshot.context.organizationId!==request.organizationId||snapshot.context.storeId!==request.storeId||snapshot.context.cartRevision!==request.cartRevision||!Number.isSafeInteger(snapshot.policyRevision)||snapshot.policyRevision<1)throw Error('PRICING_FORBIDDEN');
   const catalog=new Map(snapshot.catalog.map(p=>[p.productId,p]));if(catalog.size!==snapshot.catalog.length)throw Error('AMBIGUOUS_CATALOG');
   const lines=request.lines.map(l=>{if('unitPrice' in l||'eligible' in l||'finalPrice' in l||'displayCurrency' in l)throw Error('FORGED_PRICE');const p=catalog.get(l.productId);if(!p)throw Error('PRODUCT_UNAVAILABLE');return {...l,unitPrice:p.unitPrice,eligible:p.eligible};});
   const quote=price(lines,request.order,snapshot.context);enforceLimits(quote,snapshot.policy);
   // Explicit normalized projection binds every pricing/approval input, not user keys.
   const envelope={actorId:snapshot.actorId,organizationId:request.organizationId,storeId:request.storeId,requestId:request.requestId,cartRevision:request.cartRevision,policyRevision:snapshot.policyRevision,context:quote.context,lines:lines.map(l=>({id:l.id,productId:l.productId,quantity:l.quantity,unitPrice:l.unitPrice,eligible:l.eligible,adjustment:l.adjustment?{direction:l.adjustment.direction,mode:l.adjustment.mode,scope:l.adjustment.scope,value:l.adjustment.value}:null})),order:request.order?{mode:request.order.mode,value:request.order.value}:null,note:request.note,totals:quote.totals};
   const fingerprint=createHash('sha256').update(JSON.stringify(envelope)).digest('hex');
   if(approvalId){const approval=await authority.approval(session,approvalId);const expiry=approval?Date.parse(approval.expiresAt):NaN;if(!approval||approval.approved!==true||approval.actorId!==snapshot.actorId||approval.organizationId!==request.organizationId||approval.storeId!==request.storeId||approval.fingerprint!==fingerprint||approval.policyRevision!==snapshot.policyRevision||!Number.isFinite(expiry)||!Number.isFinite(now.getTime())||expiry<=now.getTime())throw Error('STALE_APPROVAL');}
   return Object.freeze({quote,fingerprint,policyRevision:snapshot.policyRevision,actorId:snapshot.actorId,approvalVerified:!!approvalId,financialPostingActivated:false as const});
  },
  /** No sale engine, retry, payment/credit/stock writer or secret connection here. */
  async commit(_session:string,_request:Request):Promise<never>{throw Error('CANONICAL_PRICING_PERSISTENCE_NOT_BOUND');}
 };
}
/** Offline/display state is never approval. Caller must revalidate after every edit. */
export function invalidateApproval<T extends {cartRevision:number}>(cart:T):T&{approval:null}{return {...cart,cartRevision:cart.cartRevision+1,approval:null};}
/** Receipts/refunds consume finalized immutable snapshots, never current catalog. */
export function receiptProjection(quote:Quote){return {currency:quote.context.currency,lines:quote.lines,totals:quote.totals,financialPostingActivated:false as const};}
