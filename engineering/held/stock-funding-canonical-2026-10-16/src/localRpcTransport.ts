import type {AuthenticatedDatabase} from './service';
type Client={supabaseUrl:string;schema(name:'funding_canonical'):{rpc(name:string,args:Readonly<Record<string,unknown>>):Promise<{data:unknown;error:null|{message?:string}}>}};
const operations=new Set(['read','command','positions','custody_read','receipt_capability']);
function localOrigin(value:string){const url=new URL(value);if(url.protocol!=='http:'||!['127.0.0.1','localhost'].includes(url.hostname)||!url.port||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw Error('LOCAL_API_REQUIRED');return url.origin}
/** Local-only composition. No client is constructed here; caller supplies a lazy per-user factory, never the shared Production client/service-role key. No endpoint is enabled by default. */
export function localRpcTransport(origin:string,factory:(session:string)=>Promise<Client>):AuthenticatedDatabase{
 const allowed=localOrigin(origin);
 return {async callForSession(session,name,args){
  if(typeof session!=='string'||!session)throw Error('AUTHENTICATION_REQUIRED');
  const [schema,operation,...rest]=name.split('.');if(schema!=='funding_canonical'||!operations.has(operation)||rest.length)throw Error('RPC_NOT_ALLOWED');
  const client=await factory(session);if(localOrigin(client.supabaseUrl)!==allowed)throw Error('LOCAL_API_IDENTITY_MISMATCH');
  const reply=await client.schema('funding_canonical').rpc(operation,args);
  if(reply.error){const message=reply.error.message||'';throw Error(/^[A-Z_]{3,64}$/.test(message)?message:'DATABASE_REQUEST_FAILED')}
  return reply.data;
 }};
}
