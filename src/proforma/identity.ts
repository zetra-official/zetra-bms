import {Identity,ProformaError} from './model';
// Same configured fields used by sales/receipt.tsx. No fabricated banking or tax identity.
export type OrganizationReceiptProfile={business_name?:string|null;logo_url?:string|null;tin?:string|null;vrn?:string|null;registration_no?:string|null;email?:string|null};
export type StoreReceiptProfile={store_display_name?:string|null;phone?:string|null;email?:string|null;region?:string|null;city?:string|null;address?:string|null;bank_name?:string|null;account_name?:string|null;account_number?:string|null;mobile_money_name?:string|null;mobile_money_number?:string|null;payment_instructions?:string|null};
const value=(v:string|null|undefined)=>v?.trim()||undefined;
export function receiptIdentity(input:{organizationId:string;storeId:string;activeOrgName:string;activeStoreName:string;organization:OrganizationReceiptProfile;store:StoreReceiptProfile;logoDataUri?:string}):Identity {
 const o=input.organization,s=input.store,businessName=value(o.business_name)||value(input.activeOrgName),storeName=value(s.store_display_name)||value(input.activeStoreName);
 if(!businessName||!storeName)throw new ProformaError('BUSINESS_IDENTITY_REQUIRED');
 // Logo loading belongs to an approved asset adapter; document rendering cannot fetch a remote URL.
 if(input.logoDataUri&&!/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(input.logoDataUri))throw new ProformaError('INVALID_LOGO');
 if(input.logoDataUri&&input.logoDataUri.length>2000000)throw new ProformaError('LOGO_TOO_LARGE');
 return {organizationId:input.organizationId,storeId:input.storeId,businessName,storeName,address:[s.address,s.city,s.region].map(value).filter(Boolean).join(', ')||undefined,phone:value(s.phone),email:value(s.email)||value(o.email),registrationNo:value(o.registration_no),tin:value(o.tin),vrn:value(o.vrn),logoDataUri:input.logoDataUri,bankName:value(s.bank_name),accountName:value(s.account_name),accountNumber:value(s.account_number),mobileMoneyName:value(s.mobile_money_name),mobileMoneyNumber:value(s.mobile_money_number),paymentInstructions:value(s.payment_instructions)};
}
