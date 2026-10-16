/** Additive candidate; no route imports, database client or financial side effects. */
export type ProformaStatus = 'DRAFT'|'PENDING'|'ACCEPTED'|'CONVERTED'|'EXPIRED'|'CANCELLED';
export type ReservationStatus = 'NONE'|'ACTIVE'|'RELEASED'|'EXPIRED'|'CONSUMED';
export type Decimal = string;
export type Identity = {
 organizationId:string;storeId:string;businessName:string;storeName:string;
 address?:string;phone?:string;email?:string;registrationNo?:string;tin?:string;vrn?:string;
 logoDataUri?:string;bankName?:string;accountName?:string;accountNumber?:string;
 mobileMoneyName?:string;mobileMoneyNumber?:string;paymentInstructions?:string;
};
export type ProformaItem = {
 productId:string;variantId?:string;description:string;sku?:string;unit?:string;
 quantity:Decimal;unitPrice:Decimal;gross:Decimal;discount:Decimal;tax:Decimal;total:Decimal;
};
export type ProformaRevision = {
 id:string;reference:string;revision:number;organizationId:string;storeId:string;
 status:ProformaStatus;reservationStatus:ReservationStatus;reservationExpiresAt?:string;
 issuedAt:string;validUntil:string;timeZone:string;currency:string;
 customer?:{id?:string;name?:string;phone?:string;email?:string;address?:string};
 business:Identity;items:readonly ProformaItem[];
 subtotal:Decimal;discount:Decimal;tax:Decimal;total:Decimal;
 notes?:string;terms?:string;createdBy:string;convertedSaleId?:string;
};
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export class ProformaError extends Error {constructor(public code:string){super(code);this.name='ProformaError'}}
function requireValue(ok:unknown,code:string):asserts ok{if(!ok)throw new ProformaError(code)}
export function decimalUnits(value:Decimal):bigint {
 requireValue(typeof value==='string'&&/^(0|[1-9]\d{0,17})(\.\d{1,6})?$/.test(value),'INVALID_DECIMAL');
 const [whole,fraction='']=value.split('.');return BigInt(whole)*1000000n+BigInt(fraction.padEnd(6,'0'));
}
function instant(value:string):number{requireValue(typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value)&&Number.isFinite(Date.parse(value)),'INVALID_TIMESTAMP');return Date.parse(value)}
export function validateRevision(q:ProformaRevision):void {
 for(const id of [q.id,q.organizationId,q.storeId,q.createdBy])requireValue(UUID.test(id),'INVALID_ID');
 requireValue(q.business.organizationId===q.organizationId&&q.business.storeId===q.storeId,'IDENTITY_SCOPE_MISMATCH');
 requireValue(q.business.businessName.trim()&&q.business.storeName.trim(),'BUSINESS_IDENTITY_REQUIRED');
 requireValue(q.reference.trim()&&Number.isInteger(q.revision)&&q.revision>0,'INVALID_REVISION');
 requireValue(['DRAFT','PENDING','ACCEPTED','CONVERTED','EXPIRED','CANCELLED'].includes(q.status),'INVALID_STATUS');
 requireValue(['NONE','ACTIVE','RELEASED','EXPIRED','CONSUMED'].includes(q.reservationStatus),'INVALID_RESERVATION_STATUS');
 requireValue(/^[A-Z]{3}$/.test(q.currency),'INVALID_CURRENCY');
 try{new Intl.DateTimeFormat('en',{timeZone:q.timeZone}).format(new Date())}catch{throw new ProformaError('INVALID_TIMEZONE')}
 requireValue(instant(q.validUntil)>=instant(q.issuedAt),'INVALID_VALIDITY');
 if(q.customer?.id)requireValue(UUID.test(q.customer.id),'INVALID_CUSTOMER_ID');
 requireValue(q.items.length>0&&q.items.length<=500,'INVALID_ITEMS');
 let gross=0n,discount=0n,tax=0n,total=0n;
 for(const item of q.items){requireValue(UUID.test(item.productId)&&(!item.variantId||UUID.test(item.variantId)),'INVALID_PRODUCT_ID');requireValue(item.description.trim(),'ITEM_DESCRIPTION_REQUIRED');requireValue(decimalUnits(item.quantity)>0n,'INVALID_QUANTITY');decimalUnits(item.unitPrice);const g=decimalUnits(item.gross),d=decimalUnits(item.discount),t=decimalUnits(item.tax),n=decimalUnits(item.total);requireValue(d<=g&&g-d+t===n,'ITEM_TOTAL_MISMATCH');gross+=g;discount+=d;tax+=t;total+=n}
 const documentDiscount=decimalUnits(q.discount);requireValue(gross===decimalUnits(q.subtotal)&&documentDiscount>=discount&&documentDiscount<=gross&&tax===decimalUnits(q.tax)&&gross-documentDiscount+tax===decimalUnits(q.total),'TOTAL_MISMATCH');
 // Validate supplied canonical amounts; never recalculate tax, rounding, FX or historical prices.
 if(q.reservationStatus==='ACTIVE'){requireValue(q.status==='PENDING'||q.status==='ACCEPTED','INVALID_ACTIVE_RESERVATION');requireValue(!!q.reservationExpiresAt,'RESERVATION_EXPIRY_REQUIRED');instant(q.reservationExpiresAt!)}
 requireValue(q.reservationStatus!=='CONSUMED'||q.status==='CONVERTED','INVALID_CONSUMED_RESERVATION');
 requireValue(q.status!=='CONVERTED'||(!!q.convertedSaleId&&UUID.test(q.convertedSaleId)&&q.reservationStatus!=='ACTIVE'),'CONVERSION_LINK_REQUIRED');
 requireValue(!q.convertedSaleId||q.status==='CONVERTED','UNEXPECTED_SALE_LINK');
}
export function reservationIsEffective(q:ProformaRevision,now:string):boolean {validateRevision(q);return q.reservationStatus==='ACTIVE'&&instant(q.reservationExpiresAt!)>instant(now)&&['PENDING','ACCEPTED'].includes(q.status)}
export function freezeRevision(q:ProformaRevision):Readonly<ProformaRevision>{validateRevision(q);const copy=JSON.parse(JSON.stringify(q));function freeze(v:any):void{if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v)}}freeze(copy);return copy}
export type SaveProformaCommand={requestId:string;expectedRevision:number|null;reservationHours:0|24|48|120;revision:Readonly<ProformaRevision>};
export function prepareSave(q:ProformaRevision,requestId:string,expectedRevision:number|null,reservationHours:0|24|48|120,online:boolean):SaveProformaCommand {
 requireValue(online,'ONLINE_REQUIRED');requireValue(UUID.test(requestId),'INVALID_REQUEST_ID');requireValue(expectedRevision===null||(Number.isInteger(expectedRevision)&&expectedRevision>0),'INVALID_EXPECTED_REVISION');requireValue([0,24,48,120].includes(reservationHours),'INVALID_RESERVATION_DURATION');requireValue(q.revision===(expectedRevision===null?1:expectedRevision+1),'REVISION_CONFLICT');requireValue(['DRAFT','PENDING','ACCEPTED'].includes(q.status),'REVISION_REQUIRED');
 return {requestId,expectedRevision,reservationHours,revision:freezeRevision(q)};
}
/** UI eligibility only. Database authorization, locks and idempotency remain mandatory. */
export function conversionEligibility(q:ProformaRevision,now:string,online:boolean):'ONLINE_REQUIRED'|'DOCUMENT_NOT_CONVERTIBLE'|'QUOTE_EXPIRED'|'READY_FOR_SERVER_REVALIDATION'{validateRevision(q);if(!online)return 'ONLINE_REQUIRED';if(!['PENDING','ACCEPTED'].includes(q.status))return 'DOCUMENT_NOT_CONVERTIBLE';if(instant(q.validUntil)<=instant(now))return 'QUOTE_EXPIRED';return 'READY_FOR_SERVER_REVALIDATION'}
