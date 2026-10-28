import {connectionDeadline} from '../supabase/sessionRecovery';
import {readSummary} from '../staff/model';
type Port={auth:{getUser:()=>PromiseLike<{data:{user:{id:string}|null};error:unknown}>};rpc:(name:string,args:Record<string,unknown>)=>PromiseLike<{data:unknown;error:unknown}>};
/** Existing server projection selects auth.uid() and enforces assigned-store access.
 * Never substitute store-wide readers when personal attribution is unavailable. */
export async function loadStaffFinance(port:Port,organization:string,store:string,storeName:string){
 const user=await connectionDeadline(port.auth.getUser(),10000);if(user.error||!user.data.user)throw Error('AUTH_REQUIRED');
 const reply=await connectionDeadline(port.rpc('m3_staff_operational_v1',{p_org_id:organization,p_store_id:store,p_day:null,p_offset:0}),12000);
 if(reply.error)throw reply.error;
 const own=readSummary(reply.data,{actor:user.data.user.id,organization,store});
 if(own.sales===null||own.money_in===null||own.expenses===null||own.orders===null)throw Error('DASHBOARD_ATTRIBUTION_UNAVAILABLE');
 return {storeId:store,storeName,sales:Number(own.sales),moneyIn:Number(own.money_in),expenses:Number(own.expenses),orders:own.orders,stockValue:NaN,profit:null};
}
