/** Products' existing pack/base formula and six-decimal display rule, evaluated without binary floating point. */
const scale=1000000n;
function units(v:string){if(!/^(0|[1-9]\d{0,11})(\.\d{1,6})?$/.test(v))throw Error('INVALID_PACK_VALUE');const [w,f='']=v.split('.');return BigInt(w)*scale+BigInt(f.padEnd(6,'0'))}
function text(v:bigint){return (String(v/scale)+'.'+String(v%scale).padStart(6,'0')).replace(/\.?0+$/,'')||'0'}
function divide(n:bigint,d:bigint){let q=n*scale/d;if(n*scale%d*2n>=d)q++;return text(q)}
export function unitPackPrices(packSize:string,packCost:string,packSelling:string){const size=units(packSize),cost=units(packCost),selling=units(packSelling);if(size<=0n||selling<=0n)throw Error('INVALID_PACK_VALUE');return {cost:divide(cost,size),selling:divide(selling,size)}}
export function baseQuantity(quantity:string,mode:string,packSize?:string){const q=units(quantity);if(q<=0n)throw Error('INVALID_QUANTITY');if(!['UNIT','PACK','BOX','CARTON'].includes(mode))throw Error('INVALID_STOCK_MODE');if(mode==='UNIT')return text(q);const size=units(packSize??'');if(size<=0n)throw Error('INVALID_PACK_VALUE');const product=q*size;if(product%scale!==0n)throw Error('UNSUPPORTED_QUANTITY_PRECISION');return text(product/scale)}
