import type {SaleQueueItem} from './salesQueue';
import {validateMoney,subtractExact} from '../currency/engine';
import {settlementPreview} from '../currency/settlement';
/** Exact server counterpart is quarantined until separately approved. A client
 * flag is only rollout UX; server grants, per-org admission and transaction
 * permits are the actual security boundary. Never auto-enable via env vars. */
export const NATIVE_SALE_PERSISTENCE_ACTIVE=false;
function structuredSplit(note:string|null){
 const raw=note??'';if(!/SPLIT_PAYMENT:/i.test(raw))return {note};
 const pattern=/^SPLIT_PAYMENT: CASH=(\d+(?:\.\d+)?) \| MOBILE=(\d+(?:\.\d+)?) \| BANK=(\d+(?:\.\d+)?)(?:\r?\n|$)/gm;
 const lines=[...raw.matchAll(pattern)];if(lines.length!==1||raw.replace(pattern,'').match(/SPLIT_PAYMENT:/i))throw Error('INVALID_NATIVE_SPLIT');
 return {note:raw.replace(pattern,'').trim()||null,split:{cash:lines[0][1],mobile:lines[0][2],bank:lines[0][3]}};
}
export function verifyNativeSaleOutcome(item:SaleQueueItem,value:unknown){
 const c=item.currency_context,row=value as Record<string,unknown>|null;
 if(!c||!row||typeof row.saleId!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(row.saleId)||row.organizationId!==c.organizationId||row.storeId!==item.store_id||row.currency!==c.currency||row.revision!==c.contextRevision||typeof row.total!=='string'||subtractExact(row.total,c.amount)!=='0')throw Error('NATIVE_SALE_OUTCOME_REVIEW_REQUIRED');
 return row.saleId;
}
export function nativeSaleRequest(item:SaleQueueItem){
 const c=item.currency_context;if(!c)throw Error('OFFLINE_CURRENCY_REVIEW_REQUIRED');validateMoney(c);
 if(c.source!=='TRANSACTION_RECORD'||!c.currency||!c.contextRevision||c.accountingCurrency!==c.currency||c.exchangeRate!=='1'||c.rateSource!=='SAME_CURRENCY_IDENTITY'||c.displayRateUsed!==false)throw Error('INVALID_OFFLINE_CURRENCY_CONTEXT');
 const p=item.payload;
 const exact=item.native_payload;if(!exact||exact.items.length!==p.items.length||exact.items.some((line,i)=>line.product_id!==p.items[i].product_id))throw Error('EXACT_NATIVE_PAYLOAD_REQUIRED');
 const split=structuredSplit(p.note);
 const preview=settlementPreview({currency:c.currency,items:exact.items.map(i=>({quantity:i.qty,unitPrice:i.unit_price})),discountType:p.discount_type,discountValue:exact.discount_value??'0',paid:exact.paid_amount,credit:p.is_credit,split:split.split});
 if(subtractExact(preview.total,c.amount)!=='0')throw Error('OFFLINE_CURRENCY_REVIEW_REQUIRED');
 return {p_store_id:item.store_id,p_request_id:item.client_sale_id,p_currency:c.currency,p_revision:c.contextRevision,p_sale:{organization_id:c.organizationId,items:exact.items.map(i=>({...i})),...split,payment_method:p.payment_method,paid_amount:exact.paid_amount,payment_channel:p.payment_channel,reference:p.reference,discount_type:p.discount_type,discount_value:exact.discount_value,discount_note:p.discount_note,is_credit:p.is_credit,customer_name:p.customer_name,customer_phone:p.customer_phone,sold_by_membership_id:p.sold_by_membership_id??null}};
}
