/** Inactive until the exact backend, original-evidence and runtime gates pass. */
export const ORIGINAL_WORKFLOW_ACTIVE=false;
export type FinancialPort={rpc:(name:string,args:Record<string,unknown>)=>PromiseLike<{data:unknown;error:unknown}>};
export type PendingStore={getItem:(key:string)=>Promise<string|null>;setItem:(key:string,value:string)=>Promise<void>;removeItem:(key:string)=>Promise<void>};
export type OriginalRefundIntent={actorId:string;organizationId:string;storeId:string;saleId:string;lineId:string;requestId:string;quantity:string;sellable:boolean;shiftId:string|null;reference:string};
const uuid=(s:string)=>/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
export class OriginalRefundRejected extends Error{readonly definitive=true;}
export function originalRefundRequest(i:OriginalRefundIntent){
 for(const id of [i.actorId,i.organizationId,i.storeId,i.saleId,i.lineId,i.requestId])if(!uuid(id))throw Error('INVALID_ORIGINAL_REFUND_REQUEST');
 if(i.shiftId!==null&&!uuid(i.shiftId)||typeof i.sellable!=='boolean'||!/^\d{1,18}(\.\d{1,3})?$/.test(i.quantity)||!/[1-9]/.test(i.quantity)||i.reference.trim().length<8)throw Error('INVALID_ORIGINAL_REFUND_REQUEST');
 return {p_store_id:i.storeId,p_request_id:i.requestId,p_sale_id:i.saleId,p_line_id:i.lineId,p_quantity:i.quantity,p_sellable:i.sellable,p_shift_id:i.shiftId,p_evidence:{source:'OWNER_CONFIRMED',reference:i.reference}};
}
export function refundPendingKey(i:Pick<OriginalRefundIntent,'actorId'|'organizationId'|'storeId'|'saleId'>){
 for(const id of [i.actorId,i.organizationId,i.storeId,i.saleId])if(!uuid(id))throw Error('INVALID_ORIGINAL_REFUND_SCOPE');
 return ['zetra-original-refund-v1',i.actorId,i.organizationId,i.storeId,i.saleId].join(':');
}
export async function readPendingRefund(storage:PendingStore,scope:Pick<OriginalRefundIntent,'actorId'|'organizationId'|'storeId'|'saleId'>){
 const raw=await storage.getItem(refundPendingKey(scope));if(!raw)return null;
 const value=JSON.parse(raw) as OriginalRefundIntent;originalRefundRequest(value);
 for(const k of ['actorId','organizationId','storeId','saleId'] as const)if(value[k]!==scope[k])throw Error('ORIGINAL_REFUND_PENDING_SCOPE_MISMATCH');
 return value;
}
/** Persist before dispatch. Any network/error outcome retains the exact intent;
 * retry always uses the same id and parameters. An explicit atomic PostgreSQL
 * refusal can release the intent; conflicts and uncertain errors cannot.
 * No currency/tax/amount is supplied. */
export async function submitOriginalRefund(port:FinancialPort,storage:PendingStore,intent:OriginalRefundIntent){
 const args=originalRefundRequest(intent),key=refundPendingKey(intent),prior=await readPendingRefund(storage,intent);
 if(prior&&JSON.stringify(originalRefundRequest(prior))!==JSON.stringify(args))throw Error('ORIGINAL_REFUND_PENDING_REVIEW_REQUIRED');
 await storage.setItem(key,JSON.stringify(intent));
 const {data,error}=await port.rpc('refund_original_sale_v1',args);
 if(error){
  const e=error as {code?:string;message?:string};
  if(e.code==='P0001'&&['REFUND_QUANTITY_EXCEEDS_ORIGINAL','COMPLETE_ORIGINAL_PAID_ALLOCATION_REQUIRED','VERIFIED_ORIGINAL_EVIDENCE_REQUIRED','VERIFIED_ACCOUNT_FUNDS_INSUFFICIENT'].includes(e.message??'')){
   await storage.removeItem(key);throw new OriginalRefundRejected(e.message);
  }
  throw error;
 }
 if(!data||typeof data!=='object')throw Error('ORIGINAL_REFUND_RESULT_UNVERIFIED');
 const r=data as Record<string,unknown>;
 if(!uuid(String(r.refundId))||r.saleId!==intent.saleId||r.lineId!==intent.lineId||r.canonicalAccountBinding!==true||typeof r.currency!=='string'||typeof r.amount!=='string'||!/^\d+(\.\d+)?$/.test(r.amount)||r.sellable!==intent.sellable)throw Error('ORIGINAL_REFUND_RESULT_UNVERIFIED');
 // The request is confirmed; failure to clear keeps a harmless idempotent replay.
 await storage.removeItem(key);return r;
}
