import {addExact,subtractExact,currencyPrecision} from './engine';
import {identityDisplay} from './historical';
import type {AccountingAuthority} from './accounting';
export const NATIVE_EXPENSE_ACTIVE=false;
export function exactExpenseAmount(raw:string,currency?:string){
 if(!/^\d{1,18}(\.\d{1,12})?$/.test(raw)||subtractExact(raw,'0')==='0')throw Error('INVALID_EXPENSE_AMOUNT');
 const amount=addExact(raw,'0');
 if(currency&&subtractExact(identityDisplay(amount,currencyPrecision(currency)),amount)!=='0')throw Error('INVALID_TENDER_PRECISION');
 return amount;
}
/** Quarantined server counterpart reuses create_expense_v2; never an account
 * balance adjustment or proof that an external bank settlement occurred. */
export function nativeExpenseRequest(authority:AccountingAuthority,storeId:string,requestId:string,input:{amount:string;category:string;paymentMethod:'CASH'|'MOBILE'|'BANK';note:string|null;expenseDate:string}){
 if(!authority.organizationId||authority.source!=='OWNER_CONFIRMED'||authority.revision<1)throw Error('UNVERIFIED_ACCOUNTING_AUTHORITY');
 for(const id of [storeId,requestId])if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))throw Error('INVALID_NATIVE_EXPENSE');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(input.expenseDate)||new Date(input.expenseDate+'T00:00:00Z').toISOString().slice(0,10)!==input.expenseDate)throw Error('INVALID_EFFECTIVE_DATE');
 return {p_store_id:storeId,p_request_id:requestId,p_currency:authority.currency,p_revision:authority.revision,p_expense:{organization_id:authority.organizationId,amount:exactExpenseAmount(input.amount,authority.currency),category:input.category.trim(),payment_method:input.paymentMethod,note:input.note,expense_date:input.expenseDate}};
}
