/** Cart-only signed adjustment. Never changes a catalog price or posts money. */
export type AdjustableItem={unit_price:number;qty:number;extra_per_qty?:number};
export function getExtraPerQty(item:AdjustableItem){const n=Number(item.extra_per_qty??0);return Number.isFinite(n)?n:NaN;}
export function getAdjustedUnitPrice(item:AdjustableItem){
 const base=Number(item.unit_price),delta=getExtraPerQty(item);
 if(!Number.isFinite(base)||!Number.isFinite(delta))return NaN;
 // Stabilize decimal addition, retaining the same decimal scale as the operands.
 const places=(n:number)=>{const [a,e='0']=String(n).toLowerCase().split('e');return Math.max(0,(a.split('.')[1]?.length??0)-Number(e));};
 const scale=Math.max(places(base),places(delta));
 const value=base+delta;return scale<=12?Number(value.toFixed(scale)):value;
}
export function getAdjustedLineTotal(item:AdjustableItem){return getAdjustedUnitPrice(item)*Number(item.qty);}
export function parseAdjustment(raw:string,direction:1|-1){
 const s=raw.trim();if(!s)return 0;
 if(!/^\d+(?:\.\d+)?$/.test(s))throw Error('INVALID_ADJUSTMENT');
 const n=Number(s);if(!Number.isFinite(n)||!Number.isSafeInteger(Math.trunc(n)))throw Error('INVALID_ADJUSTMENT');return n*direction;
}
export function applyItemAdjustment<T extends AdjustableItem>(items:readonly T[],index:number,all:boolean,delta:number):T[]{
 if(!Number.isInteger(index)||index<0||index>=items.length||!Number.isFinite(delta))throw Error('INVALID_ADJUSTMENT');
 // Validate the full target set before returning any mutation.
 for(const [i,item] of items.entries())if(all||i===index){const price=getAdjustedUnitPrice({...item,extra_per_qty:delta});if(!Number.isFinite(item.qty)||item.qty<=0||!Number.isFinite(item.unit_price)||item.unit_price<=0||!Number.isFinite(price)||price<=0||!Number.isSafeInteger(Math.trunc(price)))throw Error('INVALID_ADJUSTMENT');}
 return items.map((item,i)=>all||i===index?{...item,extra_per_qty:delta}:item);
}

/** Serialize an existing Number as a plain decimal for canonical legacy note parsers. No rounding. */
export function plainPriceAmount(n:number):string{
 if(!Number.isFinite(n))throw Error('INVALID_ADJUSTMENT');
 const text=String(n);if(!/[eE]/.test(text))return text;
 const [mantissa,exp]=text.toLowerCase().split('e');const sign=mantissa.startsWith('-')?'-':'';const unsigned=mantissa.replace('-','');const digits=unsigned.replace('.','');const point=(unsigned.includes('.')?unsigned.indexOf('.'):unsigned.length)+Number(exp);
 return sign+(point<=0?'0.'+'0'.repeat(-point)+digits:point>=digits.length?digits+'0'.repeat(point-digits.length):digits.slice(0,point)+'.'+digits.slice(point));
}
