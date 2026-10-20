import {sha256} from '@noble/hashes/sha2.js';
import {bytesToHex,utf8ToBytes} from '@noble/hashes/utils.js';
import {BOT_REFERENCE_URL,ECB_REFERENCE_URL,parseBotReferenceFeed,parseReferenceFeed,type ReferenceRates} from './referenceFx';
/** Each quote uses one dated official snapshot. No cross-provider/date bridges. */
export async function loadCurrentReferenceRates(provider:'BOT_REFERENCE'|'ECB_REFERENCE'='BOT_REFERENCE'):Promise<ReferenceRates>{
 const official=provider==='BOT_REFERENCE'?BOT_REFERENCE_URL:ECB_REFERENCE_URL;
 const url=typeof document!=='undefined'?new URL('/api/reference-fx/'+(provider==='BOT_REFERENCE'?'bot':'ecb'),window.location.origin).href:official;
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
 try{
  const response=await fetch(url,{credentials:'omit',redirect:'error',referrerPolicy:'no-referrer',signal:controller.signal});
  if(!response.ok||response.url!==url)throw Error('REFERENCE_FETCH_FAILED');
  if(Number(response.headers.get('content-length')||0)>400000)throw Error('REFERENCE_FEED_TOO_LARGE');
  const text=await response.text();if(text.length>400000)throw Error('REFERENCE_FEED_TOO_LARGE');
  const retrievedAt=new Date().toISOString(),hash=bytesToHex(sha256(utf8ToBytes(text)));
  return provider==='BOT_REFERENCE'?parseBotReferenceFeed(text,retrievedAt,hash):parseReferenceFeed(text,retrievedAt,hash);
 }finally{clearTimeout(timer)}
}
