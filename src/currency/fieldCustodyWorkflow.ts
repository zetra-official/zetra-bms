import {subtractExact} from './engine';
import {exactExpenseAmount} from './nativeExpense';
import type {FinancialPort,PendingStore} from './originalWorkflow';
export type CustodyIntent={actorId:string;organizationId:string;storeId:string;walletId:string;requestId:string;currency:string;sourceAccountId:string|null;shiftId:string|null;operation:'FUND'|'RETURN'|'SUPPLIER'|'EXPENSE';amount:string;reference:string;orderId?:string;expenseDate?:string;note?:string};
const uuid=(s:unknown)=>typeof s==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
export class CustodyRejected extends Error{readonly definitive=true;}
export function custodyRequest(i:CustodyIntent){
 for(const id of [i.actorId,i.organizationId,i.storeId,i.walletId,i.requestId])if(!uuid(id))throw Error('INVALID_CUSTODY_REQUEST');
 if(!['FUND','RETURN','SUPPLIER','EXPENSE'].includes(i.operation)||i.shiftId!==null&&!uuid(i.shiftId)||typeof i.reference!=='string'||i.reference.trim().length<8)throw Error('INVALID_CUSTODY_REQUEST');
 const amount=exactExpenseAmount(i.amount,i.currency),internal=['SUPPLIER','EXPENSE'].includes(i.operation);
 if(internal?i.sourceAccountId!==null:!uuid(i.sourceAccountId))throw Error('CUSTODY_SOURCE_ACCOUNT_REQUIRED');
 const payload:Record<string,unknown>={amount};
 if(i.operation==='SUPPLIER'){if(!uuid(i.orderId))throw Error('ORIGINAL_INVOICE_REQUIRED');Object.assign(payload,{order_id:i.orderId,method:'CASH',reference:i.reference,note:i.note??null})}
 if(i.operation==='EXPENSE'){
  if(!i.expenseDate||!/^\d{4}-\d{2}-\d{2}$/.test(i.expenseDate)||new Date(i.expenseDate+'T00:00:00Z').toISOString().slice(0,10)!==i.expenseDate)throw Error('INVALID_EFFECTIVE_DATE');
  Object.assign(payload,{expense_date:i.expenseDate,category:'OTHER',note:i.note??null});
 }
 return {p_store_id:i.storeId,p_request_id:i.requestId,p_wallet_id:i.walletId,p_source_account_id:i.sourceAccountId,p_operation:i.operation,p_payload:payload,p_shift_id:i.shiftId,p_evidence:{source:'OWNER_CONFIRMED',reference:i.reference}};
}
export function custodyPendingKey(i:Pick<CustodyIntent,'actorId'|'organizationId'|'storeId'>){for(const id of [i.actorId,i.organizationId,i.storeId])if(!uuid(id))throw Error('INVALID_CUSTODY_SCOPE');return ['zetra-field-custody-v1',i.actorId,i.organizationId,i.storeId].join(':')}
export async function readPendingCustody(storage:PendingStore,scope:Pick<CustodyIntent,'actorId'|'organizationId'|'storeId'>){const raw=await storage.getItem(custodyPendingKey(scope));if(!raw)return null;const i=JSON.parse(raw) as CustodyIntent;custodyRequest(i);for(const k of ['actorId','organizationId','storeId'] as const)if(i[k]!==scope[k])throw Error('PENDING_CUSTODY_SCOPE_MISMATCH');return i;}
export async function submitCustody(port:FinancialPort,storage:PendingStore,i:CustodyIntent){
 const args=custodyRequest(i),key=custodyPendingKey(i),prior=await readPendingCustody(storage,i);
 if(prior&&JSON.stringify(custodyRequest(prior))!==JSON.stringify(args))throw Error('PENDING_CUSTODY_REVIEW_REQUIRED');
 await storage.setItem(key,JSON.stringify(i));const {data,error}=await port.rpc('post_bound_field_custody_v1',args);
 if(error){const e=error as {code?:string;message?:string};if(e.code==='P0001'&&['WALLET_FUNDS_INSUFFICIENT','VERIFIED_ACCOUNT_FUNDS_INSUFFICIENT','SUPPLIER_AMOUNT_PRECISION_OR_BALANCE_INVALID','COMPLETE_RECEIPT_ORIGINAL_DEBT_BINDING_REQUIRED','OPEN_FIELD_CYCLE_REQUIRED','ORIGINAL_CUSTODY_CURRENCY_REQUIRED'].includes(e.message??'')){await storage.removeItem(key);throw new CustodyRejected(e.message)}throw error;}
 const r=data as Record<string,unknown>;
 if(!r||!uuid(r.walletTransactionId)||r.walletId!==i.walletId||r.currency!==i.currency||r.operation!==i.operation||typeof r.amount!=='string'||subtractExact(r.amount,i.amount)!=='0'||typeof r.accountBalance!=='string'||!/^\d+(\.\d+)?$/.test(r.accountBalance)||r.canonicalAccountBinding!==true||r.inventoryPosted!==false)throw Error('CUSTODY_RESULT_UNVERIFIED');
 await storage.removeItem(key);return r;
}
