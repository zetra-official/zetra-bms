import {currencyPrecision} from './engine';
export type AccountingAuthority=Readonly<{organizationId:string;currency:string;revision:number;source:'OWNER_CONFIRMED';postingReady:false}>;
type Reply=PromiseLike<{data:unknown;error:{message:string}|null}>;
type Port={rpc:(name:string,args:Record<string,unknown>)=>Reply&{abortSignal?:(signal:AbortSignal)=>Reply}};
/** The existing server authority is scoped by its RPC argument and Auth/RLS.
 * Current confirmation is never evidence of a historical record's currency. */
export async function readAccountingAuthority(port:Port,organizationId:string,signal?:AbortSignal):Promise<AccountingAuthority|null>{
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(organizationId))throw Error('CURRENCY_TENANT_MISMATCH');
 if(signal?.aborted)throw Error('ACCOUNTING_AUTHORITY_ABORTED');
 const request=port.rpc('get_org_accounting_currency_v1',{p_organization_id:organizationId});
 const {data,error}=await (signal&&request.abortSignal?request.abortSignal(signal):request);
 if(signal?.aborted)throw Error('ACCOUNTING_AUTHORITY_ABORTED');
 if(error){if(error.message==='ACCOUNTING_CURRENCY_UNCONFIRMED')return null;throw Error('ACCOUNTING_AUTHORITY_UNAVAILABLE')}
 const row=data as Record<string,unknown>|null;
 if(!row||row.source!=='OWNER_CONFIRMED'||typeof row.currency!=='string'||!Number.isSafeInteger(row.revision)||Number(row.revision)<1||row.historicalRestatement!==false||row.postingReady!==false)throw Error('UNVERIFIED_ACCOUNTING_AUTHORITY');
 if(row.minorUnits!==currencyPrecision(row.currency))throw Error('CURRENCY_PRECISION_MISMATCH');
 return Object.freeze({organizationId,currency:row.currency,revision:Number(row.revision),source:'OWNER_CONFIRMED',postingReady:false});
}
/** Existing canonical contracts remain legacy TZS-only until native posting
 * certification. Confirmation/catalog presence is not a capability grant. */
export function assertLegacyPostingCurrency(authority:AccountingAuthority|null){
 if(authority&&authority.currency!=='TZS')throw Error('NATIVE_FINANCIAL_POSTING_NOT_CERTIFIED');
}
