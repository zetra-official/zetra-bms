import {transactionContext,currencyPrecision,type RecordedMoney} from '../../integration-2026-10-14/src/currency/engine';
export type Action='CREATE'|'APPROVE'|'FUND'|'RECEIPT'|'RETURN'|'CANCEL'|'REVERSE';
export type Status='DRAFT'|'APPROVED'|'FUNDED'|'PARTIALLY_RECONCILED'|'RECONCILED'|'CANCELLED'|'REVERSED';
export type Accounting={organizationId:string;currency:string;revision:number;confirmedBy:string;confirmedAt:string};
export type FundingRecord={id:string;organizationId:string;storeId:string;currency:string;currencyRevision:number;amount:string;spent:string;returned:string;outstanding:string;status:Status;revision:number;responsibleName:string;purpose:string;sourceName:string;occurredAt:string};
export type Envelope=Readonly<{organizationId:string;storeId:string;requestId:string;advanceId:string;action:Action;revision:number|null;body:Readonly<Record<string,string>>}>;
export function prepareAmount(amount:string,currency:string,accounting:Accounting|null,organizationId:string){
 if(!accounting||!accounting.confirmedBy||!Number.isFinite(Date.parse(accounting.confirmedAt)))throw Error('ACCOUNTING_CURRENCY_UNCONFIRMED');
 const result=transactionContext(amount,currency,accounting,organizationId),digits=currencyPrecision(currency);
 if(!/^\d{1,24}(\.\d+)?$/.test(amount)||BigInt(amount.replace('.',''))===0n||(amount.split('.')[1]?.length||0)>digits)throw Error('INVALID_AMOUNT');
 return result;
}
export function recordMoney(record:FundingRecord,amount:string):RecordedMoney{return{amount,currency:record.currency,organizationId:record.organizationId,contextRevision:record.currencyRevision,source:'TRANSACTION_RECORD'}}
/** Offline/unknown delivery retains EXACT request ID/body; never declares a financial operation posted. No persistent queue is invented here. */
export class PendingFundingCommand{
 readonly envelope:Envelope;state:'PENDING'|'SENDING'|'CONFIRMED'|'REJECTED'='PENDING';result:unknown;private sending=false;
 constructor(envelope:Envelope){this.envelope=Object.freeze({...envelope,body:Object.freeze({...envelope.body})})}
 async attempt(online:boolean,send:(envelope:Envelope)=>Promise<{kind:'CONFIRMED';result:unknown}|{kind:'REJECTED';code:string}>){
  if(!online||this.sending||this.state==='CONFIRMED'||this.state==='REJECTED')return this.state;
  this.sending=true;this.state='SENDING';
  try{const reply=await send(this.envelope);this.result=reply;this.state=reply.kind==='CONFIRMED'?'CONFIRMED':'REJECTED'}catch{this.state='PENDING'}finally{this.sending=false}
  return this.state;
 }
}
