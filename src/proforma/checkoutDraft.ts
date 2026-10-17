/** Ephemeral POS handover only; never persists a document, sale or payment. */
type Cart = {product_id:string;name:string;qty:number;unit_price:number}[];
type Metadata={customerName:string;customerPhone:string;notes:string;discountType:'fixed'|'percent';discountValue:string;subtotal?:string;discountAmount?:string;total?:string;sourceCart?:string};
type Intent = {organizationId:string;storeId:string;actorId:string;expires:number;items:Cart;metadata?:Metadata;id:string};
let intent:Intent|null=null;
let sequence=0;
export function stageProformaCart(scope:{organizationId:string;storeId:string;actorId:string},items:Cart,metadata?:Metadata) {
  const id=`${Date.now().toString(36)}-${++sequence}`;
  intent={...scope,id,expires:Date.now()+15*60_000,items:items.map(item=>({...item})),metadata:metadata?{...metadata}:undefined};return id;
}
export function readProformaCart(scope:{organizationId:string;storeId:string;actorId:string},id?:string):{id:string;items:Cart;metadata?:Metadata}|null {
  const current=intent;
  if(!current||current.expires<Date.now()||current.organizationId!==scope.organizationId||current.storeId!==scope.storeId||current.actorId!==scope.actorId||(id&&current.id!==id))return null;
  return {id:current.id,items:current.items.map(item=>({...item})),metadata:current.metadata?{...current.metadata}:undefined};
}
export function acknowledgeProformaCart(id:string){if(intent?.id===id)intent=null}
export function takeProformaCart(scope:{organizationId:string;storeId:string;actorId:string}){const value=readProformaCart(scope);if(value)acknowledgeProformaCart(value.id);return value}
