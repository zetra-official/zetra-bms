import {parseSaleAttempt,saleAttemptKey,type SaleAttempt} from './saleAttempt';
import type {CartScope} from './cartLifecycle';
type Sale={id:string;organization_id:string;store_id:string;client_sale_id:string;status:string;total_amount:unknown;balance_amount:unknown;payment_method?:string;customer_id?:string|null};
type Credit={store_id:string;reference:string;entry_type:string;delta:unknown};
export function exactAmount(v:unknown){const s=String(v??'');if(!/^\d+(\.\d+)?$/.test(s))return null;const [a,b='']=s.split('.');return a.replace(/^0+(?=\d)/,'')+(b.replace(/0+$/,'')?'.'+b.replace(/0+$/,''):'');}
/** Read evidence only. A missing row is UNKNOWN, never proof of non-commit. PARTIAL is not an error. */
export function assessSaleRecovery(a:SaleAttempt,scope:CartScope,s:Sale|null,credits:readonly Credit[]=[]){
 if(!s||s.store_id!==scope.storeId||s.organization_id!==scope.organizationId||s.client_sale_id!==a.id||(a.saleId&&a.saleId!==s.id)||s.status!=='COMPLETED')return {verified:false,reason:'SALE_UNVERIFIED'};
 if(a.expectedTotal!==undefined&&(exactAmount(a.expectedTotal)===null||exactAmount(a.expectedTotal)!==exactAmount(s.total_amount)))return {verified:false,reason:'TOTAL_MISMATCH'};
 if(a.requiresFollowUp&&a.phase!=='COMPLETE'){
  if((a.followUp?.customer??true)&&!s.customer_id)return {verified:false,reason:'CUSTOMER_UNVERIFIED'};
  const amount=a.followUp?a.followUp.creditAmount:exactAmount(s.balance_amount);
  if(amount===null&&!a.followUp)return {verified:false,reason:'FOLLOW_UP_UNVERIFIED'};
  // A legacy marker did not record original credit intent. Current zero balance alone is insufficient.
  if(!a.followUp&&exactAmount(amount)==='0'&&!['CASH','MOBILE','BANK'].includes(s.payment_method??''))return {verified:false,reason:'ORIGINAL_CREDIT_UNVERIFIED'};
  if(amount!==null&&exactAmount(amount)!=='0'){
   const required=exactAmount(amount);if(required===null)return {verified:false,reason:'CREDIT_UNVERIFIED'};
   const rows=credits.filter(x=>x.store_id===scope.storeId&&x.reference===s.id&&x.entry_type==='SALE');
   if(rows.length!==1||exactAmount(rows[0].delta)!==required)return {verified:false,reason:'CREDIT_UNVERIFIED'};
  }
 }
 return {verified:true,reason:'COMMITTED_EVIDENCE_VERIFIED',saleId:s.id};
}
type Storage={getItem(k:string):Promise<string|null>;setItem(k:string,v:string):Promise<void>;removeItem(k:string):Promise<void>};
const tails=new Map<string,Promise<unknown>>();
function locked<T>(key:string,task:()=>Promise<T>):Promise<T>{const previous=tails.get(key)??Promise.resolve();const run=previous.catch(()=>{}).then(async():Promise<T>=>{const locks=typeof navigator!=='undefined'?navigator.locks:undefined;return locks?await locks.request(key,task):await task()});tails.set(key,run);void run.finally(()=>{if(tails.get(key)===run)tails.delete(key)}).catch(()=>{});return run;}
export function persistSaleAttempt(storage:Storage,scope:CartScope,a:SaleAttempt){return locked(saleAttemptKey(scope),()=>storage.setItem(saleAttemptKey(scope),JSON.stringify(a)));}
/** Archive before removal; compare identity again after every awaited cleanup. Never erase another attempt. */
export function releaseVerifiedAttempt(storage:Storage,scope:CartScope,a:SaleAttempt,saleId:string,cleanup:()=>Promise<void>){const key=saleAttemptKey(scope);return locked(key,async()=>{const raw=await storage.getItem(key);if(!raw||JSON.stringify(parseSaleAttempt(raw))!==JSON.stringify(a))return false;await storage.setItem(key+':verified:'+a.id,JSON.stringify({attempt:a,saleId,resolution:'COMMITTED_EVIDENCE_VERIFIED',nonIdempotentFollowUpsReplayed:false}));if(await storage.getItem(key)!==raw)return false;await cleanup();if(await storage.getItem(key)!==raw)return false;await storage.removeItem(key);return true;});}
