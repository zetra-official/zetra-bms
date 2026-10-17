/** A document receipt clears only the originating, unchanged device cart. Never financial state. */
type Item={product_id:string;qty:number;unit_price:number;cart_key?:string};
type Storage={getItem:(key:string)=>Promise<string|null>;removeItem:(key:string)=>Promise<void>};
export function cartSignature(items:Item[]):string {
 return JSON.stringify(items.map(i=>[i.product_id,i.cart_key??'',i.qty,i.unit_price]));
}
type Receipt={organizationId:string;storeId:string;actorId:string;source:string;documentId:string;draftId?:string};
const receipts=new Map<string,Receipt>();
const completed=new Set<string>();
export function recordSavedCart(receipt:Receipt){receipts.set(receipt.storeId,{...receipt});if(receipt.draftId)completed.add(receipt.draftId)}
export function takeCompletedDraft(id:string){const found=completed.has(id);completed.delete(id);return found}
export async function consumeSavedCart(storage:Storage,scope:{organizationId:string;storeId:string;actorId:string}) {
 const receipt=receipts.get(scope.storeId);
 if(!receipt||receipt.organizationId!==scope.organizationId||receipt.actorId!==scope.actorId)return false;
 const key=`sales_cart_${scope.storeId}`,raw=await storage.getItem(key);
 const current=raw?JSON.parse(raw):[];
 if(!Array.isArray(current)||cartSignature(current)!==receipt.source){receipts.delete(scope.storeId);return false}
 await storage.removeItem(key);
 receipts.delete(scope.storeId);return true;
}
