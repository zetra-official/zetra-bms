import type {ProformaRevision} from './model';
/** Receipt's existing organization_profiles.logo_url, scoped by RLS. No independent profile. */
export async function withReceiptLogo(q:ProformaRevision,port:{from:(table:string)=>any},storageOrigin:string):Promise<ProformaRevision>{
 const {data,error}=await port.from('organization_profiles').select('organization_id,logo_url').eq('organization_id',q.organizationId).maybeSingle();
 if(error)throw Error('RECEIPT_BRANDING_UNAVAILABLE');
 if(!data?.logo_url)return q;
 if(data.organization_id!==q.organizationId)throw Error('BRANDING_SCOPE_MISMATCH');
 const url=new URL(data.logo_url),origin=new URL(storageOrigin);
 if(url.origin!==origin.origin||url.protocol!=='https:'||!url.pathname.startsWith('/storage/v1/object/public/')||url.username||url.password)throw Error('UNSUPPORTED_RECEIPT_LOGO_URL');
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
 try{
  const response=await fetch(url.toString(),{signal:controller.signal,credentials:'omit'});
  if(!response.ok||!/^image\/(png|jpeg)(;|$)/i.test(response.headers.get('content-type')??'')||Number(response.headers.get('content-length')??0)>1400000)throw Error('INVALID_RECEIPT_LOGO');
  const blob=await response.blob();if(blob.size>1400000)throw Error('LOGO_TOO_LARGE');
  const logoDataUri=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(Error('LOGO_READ_FAILED'));reader.readAsDataURL(blob)});
  return {...q,business:{...q.business,logoDataUri}};
 }finally{clearTimeout(timer)}
}
