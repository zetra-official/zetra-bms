import type {ProformaRevision} from './model';
import {validateRevision} from './model';
export type Scope={organizationId:string;storeId:string};
export type Operation='SAVE'|'ISSUE'|'RESERVE'|'RELEASE'|'CANCEL'|'EXPIRE'|'HANDOFF'|'CASHIER_ACCEPT'|'CONVERT';
export type PageRow={id:string;reference:string;revision:number;status:ProformaRevision['status'];currency:string;total:string;handoffStatus?:string};
export type Detail={document:{id:string;organization_id:string;store_id:string;reference:string|number;revision:number;status:ProformaRevision['status'];currency:string;valid_until:string;created_at:string;created_by:string;sale_id?:string};snapshot:Record<string,unknown>;revisions:readonly {revision:number;snapshot:Record<string,unknown>}[];holds:readonly {status:string;expires_at:string}[];handoff?:{id:string;status:string;createdBy:string;cashierMembershipId?:string}|null;accountingCurrency:string|null;context:{authorized:boolean;role:string;salesMode:'DIRECT'|'CASHIER';membershipId:string;assigned:boolean;openShift:boolean}};
export interface Transport<D extends {document:{id:string;organization_id:string;store_id:string}}=Detail>{
 page(input:Scope&{before:string|null;limit:25;signal:AbortSignal}):Promise<{rows:PageRow[];nextBefore:string|null}>;
 detail(input:Scope&{documentId:string;signal:AbortSignal}):Promise<D>;
 command(input:Scope&{requestId:string;documentId:string;expectedRevision:number|null;operation:Operation;body:Record<string,unknown>}):Promise<unknown>;
}
/** Scope-owned controller. No database credentials/configuration or hidden retries.
 * An ambiguous failure retains the SAME request/payload for an explicit retry.
 * It prevents a second intent until that uncertainty is resolved by retry.
 */
export class ProformaClient<D extends {document:{id:string;organization_id:string;store_id:string}}=Detail>{
 private pending:{key:string;input:Parameters<Transport['command']>[0]}|null=null;
 private busy=false;
 constructor(readonly scope:Scope,readonly transport:Transport<D>,private id:()=>string){}
 get hasPending(){return this.pending!==null}
 page(signal:AbortSignal,before:string|null=null){return this.transport.page({...this.scope,before,limit:25,signal})}
 async detail(documentId:string,signal:AbortSignal){const d=await this.transport.detail({...this.scope,documentId,signal});if(d.document.organization_id!==this.scope.organizationId||d.document.store_id!==this.scope.storeId)throw Error('SCOPE_MISMATCH');return d}
 async run(documentId:string,expectedRevision:number|null,operation:Operation,body:Record<string,unknown>={}){
  if(this.busy)throw Error('COMMAND_BUSY');
  const key=JSON.stringify([documentId,expectedRevision,operation,body]);
  if(this.pending&&this.pending.key!==key)throw Error('RESOLVE_PREVIOUS_REQUEST');
  if(!this.pending)this.pending={key,input:{...this.scope,requestId:this.id(),documentId,expectedRevision,operation,body:JSON.parse(JSON.stringify(body))}};
  this.busy=true;
  try{const result=await this.transport.command(this.pending.input);this.pending=null;return result}catch(error){if(error&&typeof error==='object'&&'definitive' in error&&error.definitive===true)this.pending=null;throw error}finally{this.busy=false}
 }
}
/** Only presentation mapping; all authoritative amounts remain exact strings.
 * Missing trusted identity/timezone cannot silently fabricate invoice details.
 */
export function invoiceRevision(detail:Detail):ProformaRevision{
 const d=detail.document,s=detail.snapshot;
 const active=detail.holds.filter(h=>h.status==='ACTIVE');
 const status:ProformaRevision['reservationStatus']=active.length?'ACTIVE':detail.holds.some(h=>h.status==='CONSUMED')?'CONSUMED':detail.holds.some(h=>h.status==='RELEASED')?'RELEASED':detail.holds.length?'EXPIRED':'NONE';
 const q={...s,id:d.id,organizationId:d.organization_id,storeId:d.store_id,reference:String(d.reference),revision:d.revision,status:d.status,currency:d.currency,validUntil:d.valid_until,issuedAt:d.created_at,createdBy:d.created_by,convertedSaleId:d.sale_id||undefined,reservationStatus:status,reservationExpiresAt:active[0]?.expires_at} as ProformaRevision;
 validateRevision(q);return q;
}
export type Route={screen:'list'}|{screen:'new'}|{screen:'document';id:string};
export function parseRoute(hash:string):Route{
 if(hash==='#proforma/new')return{screen:'new'};
 const match=/^#proforma\/([0-9a-f-]{36})$/i.exec(hash);
 return match?{screen:'document',id:match[1]}:{screen:'list'};
}
export function routeFor(route:Route):string{return route.screen==='list'?'#proforma':route.screen==='new'?'#proforma/new':'#proforma/'+route.id}
