/** Ephemeral POS handover only; never persists a document, sale or payment. */
type Cart = {product_id:string;name:string;qty:number;unit_price:number}[];
type Metadata={customerName:string;customerPhone:string;notes:string;discountType:'fixed'|'percent';discountValue:string};
type Intent = {organizationId:string;storeId:string;actorId:string;expires:number;items:Cart;metadata?:Metadata};
let intent:Intent|null=null;
export function stageProformaCart(scope:{organizationId:string;storeId:string;actorId:string},items:Cart,metadata?:Metadata) {
  intent={...scope,expires:Date.now()+15*60_000,items:items.map(item=>({...item})),metadata:metadata?{...metadata}:undefined};
}
export function takeProformaCart(scope:{organizationId:string;storeId:string;actorId:string}):{items:Cart;metadata?:Metadata}|null {
  const current=intent;intent=null;
  if(!current||current.expires<Date.now()||current.organizationId!==scope.organizationId||current.storeId!==scope.storeId||current.actorId!==scope.actorId)return null;
  return {items:current.items.map(item=>({...item})),metadata:current.metadata?{...current.metadata}:undefined};
}
