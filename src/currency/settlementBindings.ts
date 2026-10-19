import type {SaleQueueItem} from '../offline/salesQueue';
import {nativeSaleRequest,verifyNativeSaleOutcome} from '../offline/nativeSaleTransport';
import {subtractExact} from './engine';
export const BOUND_SETTLEMENT_ACTIVE=false;
export type SettlementContext={organizationId:string;currency:string;revision:number;accounts:Partial<Record<'CASH'|'BANK'|'MOBILE',string>>;shiftId:string|null;evidence:{source:'OWNER_CONFIRMED'|'AUTHORIZED_CASH_RECORD'|'AUTHORIZED_OPERATOR_CONFIRMATION';reference:string}};
const uuid=(v:unknown)=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
/** An immutable offline instruction, never proof of bank settlement or permissions.
 * Backend revalidates actual account/actor/shift/current currency in one transaction. */
export function boundSaleRequest(item:SaleQueueItem){
 const args=nativeSaleRequest(item),c=item.settlement_context,original=item.currency_context;
 if(!c||!original||c.organizationId!==original.organizationId||c.currency!==original.currency||c.revision!==original.contextRevision||!Number.isInteger(c.revision)||!uuid(c.organizationId)||c.shiftId!==null&&!uuid(c.shiftId)||!c.evidence||!['OWNER_CONFIRMED','AUTHORIZED_CASH_RECORD','AUTHORIZED_OPERATOR_CONFIRMATION'].includes(c.evidence.source)||typeof c.evidence.reference!=='string'||c.evidence.reference.trim().length<8)throw Error('ORIGINAL_SETTLEMENT_CONTEXT_REQUIRED');
 for(const [kind,id] of Object.entries(c.accounts)){if(!['CASH','BANK','MOBILE'].includes(kind)||!uuid(id))throw Error('INVALID_SETTLEMENT_ACCOUNT')}
 const sale=args.p_sale as Record<string,unknown>,split=sale.split as Record<string,string>|undefined;
 const methods=split?Object.entries(split).filter(([,amount])=>subtractExact(amount,'0')!=='0').map(([method])=>method.toUpperCase()):sale.payment_method==='CREDIT'&&subtractExact(String(sale.paid_amount),'0')==='0'?[]:[String(sale.payment_method)];
 for(const method of methods){if(!c.accounts[method as keyof typeof c.accounts])throw Error('VERIFIED_SOURCE_ACCOUNT_REQUIRED')}
 return {p_store_id:args.p_store_id,p_request_id:args.p_request_id,p_currency:args.p_currency,p_revision:args.p_revision,p_operation:'SALE',p_payload:{...args.p_sale,cashier_shift_id:c.shiftId},p_accounts:{...c.accounts},p_shift_id:c.shiftId,p_evidence:{...c.evidence}};
}
export function verifyBoundSaleOutcome(item:SaleQueueItem,result:unknown){
 if(!result||typeof result!=='object'||(result as Record<string,unknown>).canonicalAccountBinding!==true)throw Error('BOUND_SALE_OUTCOME_REVIEW_REQUIRED');
 return verifyNativeSaleOutcome(item,result);
}
