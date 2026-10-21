import {sha256} from '@noble/hashes/sha2.js';
import {bytesToHex,utf8ToBytes} from '@noble/hashes/utils.js';
import {supabase} from '../supabase/supabaseClient';
/** No financial information is persisted. The request binds the visible receiving
 * snapshot; a failed request is retried against that same snapshot until refreshed. */
export function savedRequestId(actor:string,order:string,receipts:any[]|null,items:any[]):string{
 const snapshot=receipts===null?'FULL':receipts.map(r=>({item_id:r.item_id,qty:String(r.qty),received:String(items.find(i=>i.id===r.item_id)?.qty_received??'')})).sort((a,b)=>a.item_id.localeCompare(b.item_id));
 const h=bytesToHex(sha256(utf8ToBytes(JSON.stringify(['m3-saved-receiving-v1',actor,order,snapshot])))).slice(0,32);
 return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
}
export async function receiveSavedOrLegacy(order:string,receipts:any[]|null,items:any[]){
 const context=await supabase.rpc('m3_saved_order_context_v1',{p_order_id:order});
 if(context.error)throw context.error;
 if(context.data!==true){const result=receipts===null?await supabase.rpc('receive_inbound_stock_v1',{p_order_id:order}):await supabase.rpc('receive_inbound_stock_partial_v1',{p_order_id:order,p_receipts:receipts});if(result.error)throw result.error;return null;}
 const {data,error}=await supabase.auth.getSession();if(error||!data.session)throw Error('AUTH_REQUIRED');
 const result=await supabase.rpc('m3_receive_saved_v1',{p_order_id:order,p_request_id:savedRequestId(data.session.user.id,order,receipts,items),p_receipts:receipts});
 if(result.error)throw result.error;return result.data;
}
