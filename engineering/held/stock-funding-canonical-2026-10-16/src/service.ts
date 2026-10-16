import {currencyService,type CurrencyServices} from '../../integration-2026-10-14/server/currency/service';
import {prepareAmount,type Envelope,type FundingRecord,type Action} from '../../stock-funding-local-2026-10-16/src/contracts';
type Rpc='funding_canonical.read'|'funding_canonical.command'|'funding_canonical.positions'|'funding_canonical.custody_read'|'funding_canonical.receipt_capability';
export interface AuthenticatedDatabase{callForSession(session:string,name:Rpc,args:Readonly<Record<string,unknown>>):Promise<unknown>}
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function id(value:string){if(!uuid.test(value))throw Error('INVALID_IDENTIFIER');return value}
const statuses=new Set(['DRAFT','APPROVED','FUNDED','PARTIALLY_RECONCILED','RECONCILED','CANCELLED','REVERSED']);
function records(value:unknown,org:string,store:string):FundingRecord[]{
 if(!Array.isArray(value))throw Error('INVALID_READER_CONTRACT');
 return value.map(raw=>{if(!raw||typeof raw!=='object')throw Error('INVALID_READER_CONTRACT');const r=raw as FundingRecord;
  if(r.organizationId!==org||r.storeId!==store||!uuid.test(r.id)||!statuses.has(r.status)||!Number.isSafeInteger(r.revision)||r.revision<1||!Number.isSafeInteger(r.currencyRevision)||r.currencyRevision<1||!/^[A-Z]{3}$/.test(r.currency))throw Error('INVALID_READER_CONTRACT');
  for(const k of ['amount','spent','returned','outstanding'] as const)if(typeof r[k]!=='string'||!/^\d+(\.\d+)?$/.test(r[k]))throw Error('INVALID_READER_CONTRACT');
  for(const k of ['purpose','responsibleName','sourceName','occurredAt'] as const)if(typeof r[k]!=='string')throw Error('INVALID_READER_CONTRACT');
  return Object.freeze({...r});
 });
}
/** Server composition only: session-bound DB authority must be the same principal as currencyService. No URL, credential or deployment configuration is embedded. */
export function fundingIntegration(database:AuthenticatedDatabase,currencyDependencies:CurrencyServices){
 const currency=currencyService(currencyDependencies);
 return {
  async read(session:string,org:string,store:string){
   id(org);id(store);const accounting=await currency.read(session,org);
   const raw=await database.callForSession(session,'funding_canonical.read',{o:org,s:store});
   return Object.freeze({records:records(raw,org,store),accounting,financialPostingActivated:false as const});
  },
  async command(session:string,envelope:Envelope){
   const {organizationId:org,storeId:store,requestId,advanceId,action,body,revision}=envelope;
   for(const key of [org,store,requestId,advanceId])id(key);
   if(!['CREATE','APPROVE','FUND','RECEIPT','RETURN','CANCEL','REVERSE'].includes(action))throw Error('INVALID_ACTION');
   if(['displayCurrency','exchangeRate','role','balance','actorId','currencyConfirmed'].some(key=>key in body))throw Error('UNTRUSTED_POSTING_CONTEXT');
   const context=await currency.read(session,org);
   if(!context)throw Error('ACCOUNTING_CURRENCY_UNCONFIRMED');
   if(['CREATE','RETURN','RECEIPT'].includes(action))prepareAmount(body.amount,body.currency,context,org);
   if(action!=='CREATE'&&(!Number.isSafeInteger(revision)||revision===null||revision<1))throw Error('STALE_REVISION');
   // No automatic retry. SQL is the final identity/permission/currency/atomicity boundary.
   return database.callForSession(session,'funding_canonical.command',{o:org,s:store,req:requestId,adv:advanceId,op:action,body:{...body},revision});
  },
  async positions(session:string,org:string,store:string){id(org);id(store);await currency.read(session,org);return database.callForSession(session,'funding_canonical.positions',{o:org,s:store})},
  async custody(session:string,org:string,store:string,person:string){for(const v of [org,store,person])id(v);await currency.read(session,org);return database.callForSession(session,'funding_canonical.custody_read',{o:org,s:store,person})},
  async receiptCapability(session:string,org:string,store:string){id(org);id(store);await currency.read(session,org);return database.callForSession(session,'funding_canonical.receipt_capability',{o:org,s:store})}
 };
}
/** Presentation boundary for the accepted component. IDs/enums/business data never translated. */
export function mapWorkspaceCommand(action:Action,fields:Readonly<Record<string,string>>,scope:{organizationId:string;storeId:string;requestId:string;advanceId:string;accountingCurrency:string},current?:FundingRecord):Envelope{
 const date=fields.date;if(!date||!/(Z|[+-]\d{2}:\d{2})$/.test(date)||!Number.isFinite(Date.parse(date)))throw Error('DATE_REQUIRED');
 if(fields.store&&fields.store!==scope.storeId)throw Error('FORBIDDEN');
 const currency=action==='CREATE'?fields.transactionCurrency:current?.currency;
 if(!currency||fields.transactionCurrency&&fields.transactionCurrency!==currency)throw Error('CROSS_CURRENCY_BLOCKED');
 const body:Record<string,string>={currency,occurredAt:date};
 if(action==='CREATE'){body.amount=fields.amount;body.sourceAccountId=id(fields.source);body.responsibleId=id(fields.responsible);body.purpose=fields.purpose; if(fields.expected){if(!/(Z|[+-]\d{2}:\d{2})$/.test(fields.expected)||!Number.isFinite(Date.parse(fields.expected)))throw Error('DATE_REQUIRED');body.expectedAt=fields.expected};if(fields.supplier)body.supplierReference=fields.supplier;if(fields.reference)body.supportingReference=fields.reference}
 if(action==='RETURN'){body.amount=fields.amount;body.destinationAccountId=id(fields.destination);body.returningPersonId=id(fields.responsible)}
 if(action==='RECEIPT'){body.amount=fields.amount;body.receiptId=id(fields.receipt)}
 if(action==='REVERSE')body.reason=fields.reason;
 if(action!=='CREATE'&&(!current||current.organizationId!==scope.organizationId||current.storeId!==scope.storeId||current.id!==scope.advanceId))throw Error('FORBIDDEN');
 return Object.freeze({organizationId:id(scope.organizationId),storeId:id(scope.storeId),requestId:id(scope.requestId),advanceId:id(scope.advanceId),action,body:Object.freeze(body),revision:action==='CREATE'?null:current!.revision});
}
