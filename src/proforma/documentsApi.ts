import { ProformaClient, type Scope, type Transport } from './client';
import { ProformaError, validateRevision, type ProformaRevision } from './model';
import type { RpcPort } from './supabaseTransport';
export const DOCUMENT_CONTRACT = '2026101704';
export type Product = {productId:string;description:string;sku:string|null;unit:string|null;unitPrice:string;precision:boolean};
export type DocumentInput = {currency:string;validDate:string;items:{productId:string;quantity:string;unitPrice:string}[];discountType:'fixed'|'percent';discountValue:string;customer:{id?:string;name?:string;phone?:string};notes:string;terms:string};
export type DocumentContext = Scope & {version:string;documentReady:boolean;conversionReady:false;reservationReady:false;canCreate:boolean;role:string;actorId:string;membershipId:string;timeZone:string;currency:string|null;currencies:string[];validDate:string;products:Product[];customers:{id:string;name:string;phone:string}[]};
export type DocumentDetail = Scope & {document:{id:string;organization_id:string;store_id:string;status?:ProformaRevision['status'];sale_id?:string};revision:ProformaRevision & {editInput:DocumentInput};canEdit:boolean;conversionReady:false};
export function createDocumentService(scope:Scope,port:RpcPort,id:()=>string) {
  async function call(name:string,args:Record<string,unknown>,signal?:AbortSignal) {
    if(signal?.aborted)throw new ProformaError('REQUEST_ABORTED');
    const {data,error}=await port.rpc(name,{p_org:scope.organizationId,p_store:scope.storeId,...args});
    if(signal?.aborted)throw new ProformaError('REQUEST_ABORTED');if(error){const rejected=new Error(error.message);if(/^(P0001|23...|22...|42501|40001|40P01)$/.test(error.code??''))Object.assign(rejected,{definitive:true});throw rejected}
    const value=data as Record<string,unknown>|null;
    if(!value||value.organizationId!==scope.organizationId||value.storeId!==scope.storeId)throw new ProformaError('RESPONSE_SCOPE_MISMATCH');return value;
  }
  function checkedDetail(value:Record<string,unknown>):DocumentDetail {
    const d=value as unknown as DocumentDetail;validateRevision(d.revision);
    if(d.document.id!==d.revision.id||d.revision.organizationId!==scope.organizationId||d.revision.storeId!==scope.storeId||d.document.organization_id!==scope.organizationId||d.document.store_id!==scope.storeId||d.revision.reservationStatus!=='NONE'||d.revision.convertedSaleId||d.conversionReady!==false)throw new ProformaError('RESPONSE_SCOPE_MISMATCH');return d;
  }
  const transport:Transport<DocumentDetail>={
    async page(input){const p=await call('proforma_document_page_v1',{p_before:input.before,p_limit:25},input.signal);if(!Array.isArray(p.rows)||p.rows.length>25||(p.nextBefore!=null&&(typeof p.nextBefore!=='string'||!/^\d+$/.test(p.nextBefore))))throw new ProformaError('INVALID_PAGE');return {rows:p.rows,nextBefore:(p.nextBefore??null) as string|null}},
    async detail(input){return checkedDetail(await call('proforma_document_get_v1',{p_document:input.documentId},input.signal))},
    async command(input){if(input.operation!=='SAVE'&&input.operation!=='ISSUE')throw new ProformaError('CONVERSION_DISABLED');return checkedDetail(await call('proforma_document_save_v1',{p_request:input.requestId,p_document:input.documentId,p_expected:input.expectedRevision,p_operation:input.operation,p_body:input.body}))},
  };
  const client=new ProformaClient(scope,transport,id);
  return {client,
    async invoiceFx(detail:DocumentDetail,body:Record<string,unknown>,request:string){const d=checkedDetail(await call('proforma_document_fx_v1',{p_request:request,p_document:detail.document.id,p_expected:detail.revision.revision,p_body:body}));if(d.revision.invoiceFx?.to!==body.currency||d.revision.invoiceFx?.source!==String(body.source).trim())throw new ProformaError('FX_RESPONSE_MISMATCH');return d},
    async context(search='',productIds?:string[],signal?:AbortSignal){const c=await call('proforma_document_context_v1',{p_search:search,p_product_ids:productIds??null},signal) as unknown as DocumentContext;if(c.version!==DOCUMENT_CONTRACT||c.documentReady!==true||c.conversionReady!==false||c.reservationReady!==false||!Array.isArray(c.products)||!Array.isArray(c.customers))throw new ProformaError('BACKEND_CONTRACT_MISMATCH');new Intl.DateTimeFormat('en',{timeZone:c.timeZone}).format(new Date());return c},
    async save(documentId:string,expected:number|null,input:DocumentInput){return await client.run(documentId,expected,'SAVE',input as unknown as Record<string,unknown>) as DocumentDetail},
    async issue(detail:DocumentDetail){return await client.run(detail.document.id,detail.revision.revision,'ISSUE',{}) as DocumentDetail},
  };
}
