import {transactionContext} from './engine';
export type OfflineCurrencyEnvelope<T>={version:1;organizationId:string;clientSaleId:string;payload:T;currency:ReturnType<typeof transactionContext>};
/** Additive contract; does not mutate the existing queue or synchronize a sale.
 * Enqueue/sync activation requires a matching atomic server persistence adapter.
 */
export function captureOfflineCurrency<T>(payload:T,clientSaleId:string,amount:string,accounting:{organizationId:string;currency:string;revision:number}):OfflineCurrencyEnvelope<T>{
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(clientSaleId))throw Error('INVALID_CLIENT_SALE_ID');
 return Object.freeze({version:1,organizationId:accounting.organizationId,clientSaleId,payload:JSON.parse(JSON.stringify(payload)),currency:transactionContext(amount,accounting.currency,accounting,accounting.organizationId)});
}
export function validateOfflineCurrency<T>(envelope:OfflineCurrencyEnvelope<T>,current:{organizationId:string;currency:string;revision:number}){
 if(envelope.version!==1||envelope.organizationId!==current.organizationId)throw Error('CURRENCY_TENANT_MISMATCH');
 if(envelope.currency.currency!==current.currency||envelope.currency.contextRevision!==current.revision)throw Error('OFFLINE_CURRENCY_REVIEW_REQUIRED');
 const context=transactionContext(envelope.currency.amount,envelope.currency.currency!,current,current.organizationId);
 if(envelope.currency.organizationId!==current.organizationId||envelope.currency.source!=='TRANSACTION_RECORD'||envelope.currency.accountingCurrency!==current.currency||envelope.currency.exchangeRate!==context.exchangeRate||envelope.currency.displayRateUsed!==false||envelope.currency.rateSource!==context.rateSource)throw Error('INVALID_OFFLINE_CURRENCY_CONTEXT');
 return context;
}
