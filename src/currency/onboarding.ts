import {isSelectableCurrency} from './metadata';
/** Deliberately not environment-controlled. Requires a reviewed backend release
 * and native financial-contract acceptance before activation. */
export const ATOMIC_CURRENCY_ONBOARDING_ACTIVE=false;
/** Native non-TZS posting is not accepted. This capability is separate from display FX. */
export const SCOPED_CURRENCY_ONBOARDING_RPC='create_org_with_store_currency_tzs_v1' as const;
export function isSupportedNativeOnboardingCurrency(currency:unknown):currency is 'TZS'{return currency==='TZS';}
export type CurrencyOnboardingInput={businessName:string;storeName:string;currency:string;timezone:string;acknowledged:boolean};
export function currencyOnboardingPayload(input:CurrencyOnboardingInput,requestId:string){
 if(!input.businessName.trim()||!input.storeName.trim()||input.businessName.length>200||input.storeName.length>200)throw Error('INVALID_ORGANIZATION_INPUT');
 if(!isSelectableCurrency(input.currency)||!input.acknowledged)throw Error('CURRENCY_ACKNOWLEDGEMENT_REQUIRED');
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId))throw Error('INVALID_REQUEST_ID');
 new Intl.DateTimeFormat('en',{timeZone:input.timezone}).format();
 return Object.freeze({p_request_id:requestId,p_org_name:input.businessName.trim(),p_first_store_name:input.storeName.trim(),p_currency:input.currency,p_timezone:input.timezone,p_acknowledged:true});
}
/** Only prepare intent; never create an organization or confirm accounting here. */
export async function persistentOnboardingIntent(storage:{getString:(key:string)=>Promise<string|null>;setString:(key:string,value:string)=>Promise<unknown>},actorId:string,input:CurrencyOnboardingInput,makeId:()=>string){
 if(!actorId)throw Error('AUTHENTICATION_REQUIRED');const key='zetra_currency_onboarding_intent_v1:'+actorId,fingerprint=JSON.stringify(input),raw=await storage.getString(key);
 if(raw){const saved=JSON.parse(raw);if(saved.fingerprint!==fingerprint)throw Error('ONBOARDING_INTENT_REVIEW_REQUIRED');return currencyOnboardingPayload(input,saved.requestId);}
 const requestId=makeId(),payload=currencyOnboardingPayload(input,requestId);await storage.setString(key,JSON.stringify({fingerprint,requestId}));return payload;
}
export async function persistentScopedOnboardingIntent(storage:Parameters<typeof persistentOnboardingIntent>[0],actorId:string,input:CurrencyOnboardingInput,makeId:()=>string){
 if(!isSupportedNativeOnboardingCurrency(input.currency))throw Error('NATIVE_ACCOUNTING_CURRENCY_UNSUPPORTED');
 return persistentOnboardingIntent(storage,actorId,input,makeId);
}

/** Treat a committed backend response mismatch as uncertain; never auto-create again. */
export function verifyCurrencyOnboardingResult(value:unknown,expectedCurrency:string){
 const row=value as Record<string,unknown>|null;
 const id=(v:unknown)=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
 if(!row||!id(row.organizationId)||!id(row.storeId)||!id(row.membershipId)||row.currency!==expectedCurrency||row.status!=='CONFIRMED'||row.postingActivated!==false)throw Error('ONBOARDING_RESULT_REVIEW_REQUIRED');
 return row as {organizationId:string;storeId:string;membershipId:string;currency:string;status:'CONFIRMED';postingActivated:false};
}
