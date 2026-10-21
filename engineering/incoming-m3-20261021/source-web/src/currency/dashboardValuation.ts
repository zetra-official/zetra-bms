import {uniqueRecords,readStockValue} from '../business/recordIntegrity';
import {addExact} from './engine';
import {displayDecimal} from './currentValuation';
import {readSummary} from '../staff/model';
export type DashboardScope={organizationId:string;storeId:string|null;role:string;stores:readonly {store_id:string;organization_id:string;is_allowed?:boolean}[]};
export type DashboardTotal={label:string;amount:string;ownerOnly?:boolean};
type Port={rpc:(name:string,args:Record<string,unknown>)=>PromiseLike<{data:unknown;error:unknown}>};
export function dashboardStoreIds(scope:DashboardScope):string[]{
 const ids=[...new Set(scope.stores.filter(s=>s.organization_id===scope.organizationId&&s.is_allowed!==false).map(s=>s.store_id))].sort();
 if(!scope.organizationId||!scope.role)return [];
 if(scope.storeId)return ids.includes(scope.storeId)?[scope.storeId]:[];
 return scope.role==='owner'||scope.role==='admin'?ids:[];
}
export function dashboardScopeKey(scope:DashboardScope,date:string){return JSON.stringify([scope.organizationId,scope.storeId,scope.role,dashboardStoreIds(scope),date])}
function decimal(value:unknown){const amount=displayDecimal(value);if(amount===null)throw Error('DASHBOARD_ORIGINAL_DECIMAL_UNAVAILABLE');return amount}
function first(data:unknown):Record<string,unknown>{const row=Array.isArray(data)?(data.length===1?data[0]:null):data;if(!row||typeof row!=='object')throw Error('DASHBOARD_SUMMARY_UNAVAILABLE');return row as Record<string,unknown>}
function amount(row:Record<string,unknown>,keys:string[]){return decimal(keys.map(k=>row[k]).find(v=>v!=null&&String(v).trim()!==''))}
/** Display reader only. Same get_sales identity/aliases/status and summary RPCs
 * as Finance; existing exact decimal helpers aggregate without posting anything. */
export async function loadDashboardTotals(port:Port,scope:DashboardScope,now:Date):Promise<DashboardTotal[]>{
 const ids=dashboardStoreIds(scope);if(!ids.length)throw Error('DASHBOARD_SCOPE_UNAVAILABLE');
 if(scope.role==='staff'){
  if(ids.length!==1)throw Error('DASHBOARD_SCOPE_UNAVAILABLE');
  const {data,error}=await port.rpc('m3_staff_operational_v1',{p_org_id:scope.organizationId,p_store_id:ids[0],p_day:null,p_offset:0});
  if(error)throw Error('DASHBOARD_SUMMARY_UNAVAILABLE');
  const row=readSummary(data,{actor:String((data as Record<string,unknown>)?.actor_id??''),organization:scope.organizationId,store:ids[0]});
  // Actor is selected exclusively by auth.uid() in this read-only RPC, never supplied as a query argument.
  if(row.sales===null||row.expenses===null||row.average===null||row.money_in===null)throw Error('DASHBOARD_ATTRIBUTION_UNAVAILABLE');
  return [{label:'Sales',amount:row.sales},{label:'Expenses',amount:row.expenses},{label:'Avg / Order',amount:row.average},{label:'Money In',amount:row.money_in}];
 }
 const start=new Date(now.getFullYear(),now.getMonth(),now.getDate()),end=new Date(now.getFullYear(),now.getMonth(),now.getDate()+1);
 const ymd=[now.getFullYear(),String(now.getMonth()+1).padStart(2,'0'),String(now.getDate()).padStart(2,'0')].join('-');
 const owner=scope.role==='owner';
 async function read(name:string,args:Record<string,unknown>){const reply=await port.rpc(name,args);if(reply.error)throw Error('DASHBOARD_SUMMARY_UNAVAILABLE');return reply.data}
 const totals=await Promise.all(ids.map(async id=>{
  const sales=await read('get_sales',{p_store_id:id,p_from:start.toISOString(),p_to:end.toISOString()});if(!Array.isArray(sales))throw Error('DASHBOARD_SALES_UNAVAILABLE');
  let salesTotal='0';for(const row of uniqueRecords(sales,'sale_id')){
   if((row.store_id&&String(row.store_id)!==id)||(row.organization_id&&String(row.organization_id)!==scope.organizationId))throw Error('DASHBOARD_RESPONSE_SCOPE_MISMATCH');
   if(['cancelled','canceled','void'].includes(String(row.status??'').trim().toLowerCase()))continue;
   if(row.currency&&String(row.currency).trim().toUpperCase()!=='TZS')throw Error('DASHBOARD_NON_TZS_LEGACY_READER');
   salesTotal=addExact(salesTotal,amount(row,['total_amount','total','amount','grand_total','paid_amount','revenue']));
  }
  if(!owner)return {sales:salesTotal,expenses:'0',profit:'0',stock:'0'};
  const [expense,profit,stock]=await Promise.all([
   read('get_expense_summary',{p_store_id:id,p_from:ymd,p_to:ymd}),
   read('get_store_net_profit_v2',{p_store_id:id,p_from:start.toISOString(),p_to:end.toISOString()}),
   read('get_stock_on_hand_value_v1',{p_org_id:scope.organizationId,p_store_id:id})]);
  readStockValue(stock);const rawStock=Array.isArray(stock)?stock[0]:stock;
  return {sales:salesTotal,expenses:amount(first(expense),['total','amount','sum']),profit:amount(first(profit),['net_profit','net']),stock:rawStock&&typeof rawStock==='object'?amount(rawStock as Record<string,unknown>,['value','amount','total','sum','stock_value','stock_on_hand_value','on_hand_value','stock_in_value','stock_in','in_value','received_value']):decimal(rawStock)};
 }));
 const sum=(key:'sales'|'expenses'|'profit'|'stock')=>totals.reduce((a,t)=>addExact(a,t[key]),'0');
 return [{label:'Sales',amount:sum('sales')},...(owner?[{label:'Expenses',amount:sum('expenses'),ownerOnly:true},{label:'Profit',amount:sum('profit'),ownerOnly:true},{label:'Stock Value',amount:sum('stock'),ownerOnly:true}]:[])];
}
