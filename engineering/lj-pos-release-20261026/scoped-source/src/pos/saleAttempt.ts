import {scopedCartKey,type CartScope} from './cartLifecycle';
export type SaleAttempt={id:string;intent:string;phase:'DISPATCHED'|'BASE_COMMITTED'|'COMPLETE'|'QUEUED';requiresFollowUp:boolean;saleId?:string;expectedTotal?:string;followUp?:{customer:boolean;creditAmount:string|null}};
export const saleAttemptKey=(scope:CartScope)=>'pos_attempt_'+scopedCartKey(scope);
export function blocksSale(attempt:SaleAttempt|null,intent:string){return !!attempt&&(attempt.phase==='DISPATCHED'||attempt.phase==='BASE_COMMITTED'||attempt.intent===intent)}
export function parseSaleAttempt(raw:string|null):SaleAttempt|null{
 if(!raw)return null;const a=JSON.parse(raw);
 if(!a||typeof a.id!=='string'||!a.id||typeof a.intent!=='string'||!['DISPATCHED','BASE_COMMITTED','COMPLETE','QUEUED'].includes(a.phase)||typeof a.requiresFollowUp!=='boolean')throw Error('INVALID_SALE_ATTEMPT');return a;
}
// A structured PostgreSQL error confirms rejection of the atomic RPC. Transport errors do not.
export const definitiveSaleRejection=(code:unknown)=>typeof code==='string'&&/^(P0001|22...|23...|42501|40001|40P01)$/.test(code);
