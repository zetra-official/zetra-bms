import {currencyPrecision} from '../../integration-2026-10-14/src/currency/engine';
export type Adjustment={direction:'INCREASE'|'DECREASE';mode:'FIXED'|'PERCENT';scope:'UNIT'|'LINE';value:string};
export type Line={id:string;productId:string;quantity:string;unitPrice:string;eligible:boolean;adjustment?:Adjustment};
export type Discount={mode:'FIXED'|'PERCENT';value:string};
export type Context={organizationId:string;storeId:string;currency:string;revision:number;cartRevision:number;catalogRevision:string;rounding:'HALF_UP_LINE';taxContract:'VERIFIED_NO_ADDITIONAL_TAX';storeType:'STANDARD'|'PRECISION_RETAIL'};
type Fraction={n:bigint;d:bigint};
const max=10n**30n;
function fail(code:string):never{throw Error(code)}
function decimal(s:string):Fraction{
 if(typeof s!=='string'||!/^\d{1,24}(\.\d{1,12})?$/.test(s))return fail('INVALID_NUMBER');
 const [a,b='']=s.split('.');const n=BigInt(a+b),d=10n**BigInt(b.length);if(n>=max*d)return fail('AMOUNT_TOO_LARGE');return {n,d};
}
function round(n:bigint,d:bigint){return (n*2n+d)/(2n*d)}
function minor(s:string,digits:number){const f=decimal(s),scl=10n**BigInt(digits);if(f.n*scl%f.d!==0n)fail('CURRENCY_PRECISION');return f.n*scl/f.d}
function text(n:bigint,digits:number){const s=n.toString().padStart(digits+1,'0');return digits?s.slice(0,-digits)+'.'+s.slice(-digits):s}
function exactUnit(amount:bigint,qty:Fraction,digits:number):string|null{
 let numerator=amount*qty.d,denominator=qty.n*10n**BigInt(digits);
 for(let places=0;places<=12;places++){if(numerator%denominator===0n)return text(numerator/denominator,places);numerator*=10n;}return null;
}
function percent(base:bigint,value:string,discount:boolean){const p=decimal(value);if(discount&&p.n>100n*p.d)fail('INVALID_PERCENT');return round(base*p.n,100n*p.d)}
/** New input is strict: legacy malformed expressions are not silently reinterpreted. */
export function parseOrderDiscount(raw:string):Discount|undefined{
 const s=raw.trim().toLowerCase();if(!s)return undefined;
 if(/^\d+(\.\d+)?\s*%$/.test(s))return {mode:'PERCENT',value:s.replace(/\s*%$/,'')};
 const m=s.match(/^(\d+(?:\.\d+)?)([km])?$/);if(!m)fail('INVALID_DISCOUNT');
 const f=decimal(m[1]),factor=m[2]==='k'?1000n:m[2]==='m'?1000000n:1n;
 const scale=(m[1].split('.')[1]||'').length;return {mode:'FIXED',value:text(f.n*factor,scale)};
}
export function price(lines:readonly Line[],order:Discount|undefined,context:Context){
 if(!context.organizationId||!context.storeId||!context.catalogRevision||!Number.isSafeInteger(context.revision)||context.revision<1||!Number.isSafeInteger(context.cartRevision)||context.cartRevision<1)fail('INVALID_CONTEXT');
 if(context.taxContract!=='VERIFIED_NO_ADDITIONAL_TAX'||context.rounding!=='HALF_UP_LINE')fail('TAX_OR_ROUNDING_CONTRACT_REQUIRED');
 if(!['STANDARD','PRECISION_RETAIL'].includes(context.storeType))fail('STORE_CONTRACT_REQUIRED');
 if(!lines.length||lines.length>500)fail('INVALID_CART');
 const digits=currencyPrecision(context.currency),seen=new Set<string>();
 const rows=lines.map(l=>{
  if(typeof l.id!=='string'||!l.id||typeof l.productId!=='string'||!l.productId||seen.has(l.id)||typeof l.eligible!=='boolean')fail('INVALID_LINE');seen.add(l.id);
  const qty=decimal(l.quantity);if(qty.n===0n||qty.d>1000000n)fail('INVALID_QUANTITY');
  if(context.storeType==='STANDARD'&&qty.n%qty.d!==0n)fail('STORE_QUANTITY_CONTRACT');
  const unit=minor(l.unitPrice,digits),original=round(unit*qty.n,qty.d);let up=0n,down=0n;
  const a=l.adjustment;
  if(a){
   if(!l.eligible)fail('INELIGIBLE_LINE');if(!['INCREASE','DECREASE'].includes(a.direction)||!['FIXED','PERCENT'].includes(a.mode)||!['UNIT','LINE'].includes(a.scope))fail('INVALID_ADJUSTMENT');
   let delta:bigint;
   if(a.mode==='PERCENT')delta=percent(original,a.value,a.direction==='DECREASE');
   else{const fixed=minor(a.value,digits);delta=a.scope==='UNIT'?round(fixed*qty.n,qty.d):fixed;}
   if(a.direction==='DECREASE'){if(delta>original)fail('DISCOUNT_EXCEEDS_LINE');down=delta}else up=delta;
  }
  const adjusted=original+up-down;if(adjusted>=max)fail('AMOUNT_TOO_LARGE');
  return {id:l.id,productId:l.productId,quantity:l.quantity,originalUnitPrice:text(unit,digits),adjustedUnitPrice:exactUnit(adjusted,qty,digits),eligible:l.eligible,original,up,down,adjusted};
 });
 const sum=(k:'original'|'up'|'down'|'adjusted')=>rows.reduce((n,r)=>n+r[k],0n);
 const eligible=rows.filter(r=>r.eligible).reduce((n,r)=>n+r.adjusted,0n);
 let od=0n;if(order){if(!['FIXED','PERCENT'].includes(order.mode))fail('INVALID_DISCOUNT');od=order.mode==='PERCENT'?percent(eligible,order.value,true):minor(order.value,digits);if(od>eligible)fail('DISCOUNT_EXCEEDS_ELIGIBLE');}
 // Largest remainder, stable line-id tie break; never allocate to ineligible rows.
 const parts=rows.map(r=>({id:r.id,n:r.eligible&&eligible>0n?od*r.adjusted/eligible:0n,remainder:r.eligible&&eligible>0n?od*r.adjusted%eligible:0n,eligible:r.eligible}));
 let left=od-parts.reduce((n,r)=>n+r.n,0n);
 const sorted=parts.filter(r=>r.eligible).sort((a,b)=>a.remainder===b.remainder?(a.id<b.id?-1:a.id>b.id?1:0):a.remainder>b.remainder?-1:1);
 for(const p of sorted){if(!left)break;p.n++;left--;}if(left!==0n)fail('ALLOCATION_FAILED');
 const totals={originalSubtotal:text(sum('original'),digits),itemMarkups:text(sum('up'),digits),itemDiscounts:text(sum('down'),digits),adjustedSubtotal:text(sum('adjusted'),digits),orderDiscount:text(od,digits),finalTotal:text(sum('adjusted')-od,digits)};
 return Object.freeze({context:Object.freeze({...context}),totals:Object.freeze(totals),lines:Object.freeze(rows.map(r=>Object.freeze({id:r.id,productId:r.productId,quantity:r.quantity,originalUnitPrice:r.originalUnitPrice,adjustedUnitPrice:r.adjustedUnitPrice,originalSubtotal:text(r.original,digits),itemMarkup:text(r.up,digits),itemDiscount:text(r.down,digits),adjustedSubtotal:text(r.adjusted,digits),allocatedOrderDiscount:text(parts.find(p=>p.id===r.id)!.n,digits),netRevenue:text(r.adjusted-parts.find(p=>p.id===r.id)!.n,digits)}))),postingActivated:false as const});
}
export type Quote=ReturnType<typeof price>;
/** Shape actually accepted by captured v6 -> v4 -> create_sale; preparation
 * only. Whole-unit header rounding and nonterminating unit prices fail closed. */
export function canonicalCandidate(q:Quote){
 const d=currencyPrecision(q.context.currency),od=minor(q.totals.orderDiscount,d);
 if(od%10n**BigInt(d)!==0n)fail('LEGACY_DISCOUNT_PRECISION_INCOMPATIBLE');
 if(minor(q.totals.finalTotal,d)===0n)fail('LEGACY_ZERO_TOTAL_UNSUPPORTED');
 const items=q.lines.map(l=>{if(l.adjustedUnitPrice===null)fail('LINE_PRICE_NOT_EXACTLY_REPRESENTABLE');
  const original=decimal(l.originalUnitPrice),adjusted=decimal(l.adjustedUnitPrice);
  if(minor(l.itemMarkup,d)===0n&&minor(l.itemDiscount,d)===0n&&original.n*adjusted.d!==adjusted.n*original.d)fail('LEGACY_BASE_ROUNDING_INCOMPATIBLE');
  return {product_id:l.productId,qty:l.quantity,unit_price:l.adjustedUnitPrice};});
 return {p_items:items,p_discount_type:'FIXED' as const,p_discount_value:q.totals.orderDiscount,financialPostingActivated:false as const};
}
/** Aggregate discounts BEFORE markup offsets; prevents item/order splitting bypass. */
export function enforceLimits(quote:Quote,policy:{itemIncrease:boolean;itemDecrease:boolean;orderDiscount:boolean;maxDiscountAmount:string;maxDiscountPercent:string;maxMarkupAmount:string}){
 if(['itemIncrease','itemDecrease','orderDiscount'].some(k=>typeof policy[k as 'itemIncrease']!=='boolean'))fail('INVALID_POLICY');
 const d=currencyPrecision(quote.context.currency),down=minor(quote.totals.itemDiscounts,d)+minor(quote.totals.orderDiscount,d),up=minor(quote.totals.itemMarkups,d),base=minor(quote.totals.originalSubtotal,d);
 if(up&&!policy.itemIncrease||minor(quote.totals.itemDiscounts,d)&&!policy.itemDecrease||minor(quote.totals.orderDiscount,d)&&!policy.orderDiscount)fail('PRICING_FORBIDDEN');
 const p=decimal(policy.maxDiscountPercent);if(p.n>100n*p.d)fail('INVALID_POLICY');
 if(down>minor(policy.maxDiscountAmount,d)||down*100n*p.d>base*p.n||up>minor(policy.maxMarkupAmount,d))fail('PRICING_LIMIT_EXCEEDED');
}
