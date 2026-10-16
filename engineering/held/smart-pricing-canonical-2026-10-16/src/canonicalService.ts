import {price,currencyPrecision,type Context,type Line,type Discount} from './shared';
import type {PricingReadPort} from './checkoutSession';
export interface LocalTransaction{
 scope(organizationId:string,storeId:string):Promise<boolean>;
 context(organizationId:string,storeId:string):Promise<Context&{minorUnits:number}>;
 catalog(organizationId:string,storeId:string,productId:string,customerId:string|null):Promise<{unitPrice:string;eligible:boolean}>;
 checkQuote(organizationId:string,storeId:string,raw:Readonly<Record<string,unknown>>,quote:ReturnType<typeof price>):Promise<{fingerprint:string}>;
 receipt(saleId:string):Promise<unknown>;
}
export interface LocalDatabasePort{
 readonly host:string;readonly port:number;readonly disposable:boolean;
 /** Implementation must verify data_directory, synthetic-only fixture and real
  * session identity, then keep catalog/policy locks through the callback. */
 transaction<T>(session:string,work:(tx:LocalTransaction)=>Promise<T>):Promise<T>;
}
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Trusted SERVER composition. No DB secret, URL, write API or browser DB client. */
export function canonicalPricingReads(database:LocalDatabasePort,session:string):PricingReadPort&{receipt(saleId:string):Promise<unknown>;submit():Promise<never>}{
 if(database.host!=='127.0.0.1'||!Number.isInteger(database.port)||database.port<1||database.port>65535||database.disposable!==true)throw Error('DISPOSABLE_LOCAL_DATABASE_REQUIRED');
 return {
  async prepare(request){
   const {organizationId:o,storeId:s,requestId,raw}=request;
   if(!uuid.test(o)||!uuid.test(s)||!uuid.test(requestId)||!Array.isArray(raw.lines)||raw.lines.length<1||raw.lines.length>500||!Number.isSafeInteger(raw.cartRevision)||(raw.cartRevision as number)<1)throw Error('INVALID_PRICING_REQUEST');
   return database.transaction(session,async tx=>{
    if(await tx.scope(o,s)!==true)throw Error('PRICING_FORBIDDEN');
    const context=await tx.context(o,s);
    if(context.organizationId!==o||context.storeId!==s||context.minorUnits!==currencyPrecision(context.currency))throw Error('ACCOUNTING_CONTEXT_INVALID');
    const lines:Line[]=[];
    for(const value of raw.lines as Record<string,unknown>[]){
     if(!value||!uuid.test(String(value.productId))||['unitPrice','finalPrice','eligible','displayCurrency'].some(k=>k in value))throw Error('FORGED_PRICE');
     const p=await tx.catalog(o,s,String(value.productId),typeof raw.customerId==='string'?raw.customerId:null);
     lines.push({id:value.id as string,productId:value.productId as string,quantity:value.quantity as string,adjustment:value.adjustment as Line['adjustment'],unitPrice:p.unitPrice,eligible:p.eligible});
    }
    const quote=price(lines,raw.order as Discount|undefined,{...context,cartRevision:raw.cartRevision as number});
    const validated=await tx.checkQuote(o,s,raw,quote);
    if(!/^[a-f0-9]{64}$/.test(validated.fingerprint))throw Error('INVALID_DATABASE_PRICING_PROOF');
    return {quote,fingerprint:validated.fingerprint};
   });
  },
  async receipt(saleId){if(!uuid.test(saleId))throw Error('INVALID_SALE');return database.transaction(session,tx=>tx.receipt(saleId));},
  async submit():Promise<never>{throw Error('PRICING_APPLICATION_ACTIVATION_NOT_AUTHORIZED');}
 };
}
