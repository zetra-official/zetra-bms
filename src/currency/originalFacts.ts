import {recordedTotals,subtractExact,formatExact,formatCurrencyExact,type RecordedMoney,validateMoney} from './engine';
export type FactKind='SALE'|'PAYMENT'|'EXPENSE'|'CREDIT'|'COGS'|'STOCK';
export type OriginalFact=Readonly<{id:string;at:string;parentId?:string;context:Omit<RecordedMoney,'amount'>|null;values:Readonly<Record<string,string|null>>;method?:string}>;
export const ORIGINAL_FACT_READERS_ACTIVE=false;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
/** Existing server record context only. No use of device/current preferences. */
export function decodeOriginalFacts(data:unknown,organizationId:string,storeId:string,kind:FactKind):readonly OriginalFact[]{
 const page=data as Record<string,unknown>;
 if(!page||page.organizationId!==organizationId||page.storeId!==storeId||page.kind!==kind||page.postingAllowed!==false||!Array.isArray(page.rows))throw Error('CURRENCY_TENANT_MISMATCH');
 const seen=new Set<string>();return Object.freeze(page.rows.map((raw:unknown)=>{
  const row=raw as Record<string,any>;
  if(!row||typeof row.id!=='string'||!(uuid.test(row.id)||(kind==='STOCK'&&/^stock-[a-f0-9]{32}$/.test(row.id)))||seen.has(row.id)||typeof row.at!=='string'||!row.values||typeof row.values!=='object'||Array.isArray(row.values))throw Error('INVALID_ORIGINAL_FACT');seen.add(row.id);
  for(const amount of Object.values(row.values)){if(amount!==null&&(typeof amount!=='string'||!/^\-?\d{1,30}(\.\d{1,18})?$/.test(amount)))throw Error('INEXACT_ORIGINAL_AMOUNT')}
  const c=row.context;let context:OriginalFact['context']=null;
  if(c!==null&&c!==undefined){if(c.organizationId!==organizationId||c.source!=='TRANSACTION_RECORD'||c.accountingCurrency!==c.currency||c.exchangeRate!=='1'||c.rateSource!=='SAME_CURRENCY_IDENTITY'||c.displayRateUsed!==false)throw Error('UNVERIFIED_ORIGINAL_CONTEXT');validateMoney({...c,amount:'0'});context=Object.freeze({...c})}
  return Object.freeze({id:row.id,at:row.at,context,values:Object.freeze({...row.values}),...(typeof row.parentId==='string'?{parentId:row.parentId}:{}),...(typeof row.method==='string'?{method:row.method}:{})});
 }));
}
export function originalFactTotals(rows:readonly OriginalFact[],key:string,organizationId:string){
 return recordedTotals(rows.map(row=>{if(!row.context||row.values[key]===null||row.values[key]===undefined)throw Error('HISTORICAL_CURRENCY_UNVERIFIED');return {...row.context,amount:row.values[key]!}}),organizationId);
}
export function originalGrossProfit(sales:readonly OriginalFact[],costs:readonly OriginalFact[],organizationId:string){
 const saleMap=new Map(sales.map(s=>[s.id,s]));
 for(const cost of costs){const sale=cost.parentId?saleMap.get(cost.parentId):undefined;if(!sale||cost.context?.currency!==sale.context?.currency||cost.values.unitCost===null)throw Error('INCOMPLETE_ORIGINAL_COSTS')}
 for(const sale of sales){if(!sale.values.itemCount||BigInt(sale.values.itemCount)!==BigInt(costs.filter(c=>c.parentId===sale.id).length))throw Error('INCOMPLETE_ORIGINAL_COSTS')}
 const revenue=originalFactTotals(sales,'total',organizationId),cogs=originalFactTotals(costs,'amount',organizationId),result:Record<string,string>={};
 for(const currency of new Set([...Object.keys(revenue),...Object.keys(cogs)]))result[currency]=subtractExact(revenue[currency]??'0',cogs[currency]??'0');
 return Object.freeze(result); // Gross only: never claim tax/refund-adjusted net income.
}
export async function readOriginalFacts(port:{rpc:(name:string,args:Record<string,unknown>)=>PromiseLike<{data:unknown;error:unknown}>},input:{organizationId:string;storeId:string;kind:FactKind;from:string;to:string;snapshot?:string}){
 const result:OriginalFact[]=[];const ids=new Set<string>();let snapshot:string|null=input.snapshot??null;
 for(let offset=0;offset<=100000;offset+=200){const {data,error}=await port.rpc('read_original_financial_facts_v1',{p_store_id:input.storeId,p_kind:input.kind,p_from:input.from,p_to:input.to,p_limit:200,p_offset:offset,p_snapshot:snapshot});if(error)throw error;
  const stamp=(data as Record<string,unknown>)?.snapshot;if(typeof stamp!=='string'||!Number.isFinite(Date.parse(stamp))||(snapshot&&stamp!==snapshot))throw Error('UNSTABLE_REPORT_SNAPSHOT');snapshot=stamp;
  const page=decodeOriginalFacts(data,input.organizationId,input.storeId,input.kind);for(const row of page){if(ids.has(row.id))throw Error('REPEATED_FINANCIAL_PAGE');ids.add(row.id);result.push(row)}if(page.length<200)return Object.freeze({rows:Object.freeze(result),snapshot});if(input.kind==='STOCK')throw Error('STOCK_SNAPSHOT_TOO_LARGE');
 }throw Error('FINANCIAL_REPORT_TOO_LARGE');
}
/** Shared document/display boundary; unknown original currency is never relabelled. */
export function originalFactText(row:OriginalFact,key:string,locale:string){const amount=row.values[key];if(amount===null||amount===undefined)throw Error('INCOMPLETE_ORIGINAL_FACT');return row.context?.currency?formatCurrencyExact(amount,row.context.currency,locale):formatExact(amount,locale);}
