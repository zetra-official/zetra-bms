import type {Store,Scope} from './model';
import {scopeKey} from './model';
const enc=new TextEncoder(),dec=new TextDecoder();const hex=(a:Uint8Array)=>Array.from(a,x=>x.toString(16).padStart(2,'0')).join('');const bytes=(s:string)=>new Uint8Array(s.match(/../g)!.map(x=>parseInt(x,16)));
/** Ciphertext only at rest. Recovery phrase is never persisted; required after reload. */
export async function unlockVault(scope:Scope,phrase:string):Promise<Store>{
 const keyName=scopeKey(scope);if(phrase.length<12)throw Error('RECOVERY_PHRASE_REQUIRED');if(!globalThis.crypto?.subtle)throw Error('SECURE_STORAGE_UNAVAILABLE');
 const saltKey=keyName+'_salt',prior=localStorage.getItem(saltKey),salt=prior?bytes(prior):crypto.getRandomValues(new Uint8Array(16));const material=await crypto.subtle.importKey('raw',enc.encode(phrase),'PBKDF2',false,['deriveKey']);const key=await crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:310000,hash:'SHA-256'},material,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
 const store:Store={async read(k){if(k!==keyName)throw Error('DRAFT_SCOPE');const raw=localStorage.getItem(k);if(!raw)return null;const v=JSON.parse(raw);if(v.version!==1)throw Error('INVALID_DRAFT');return dec.decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes(v.iv),additionalData:enc.encode(k)},key,bytes(v.cipher)))},async write(k,value){if(k!==keyName)throw Error('DRAFT_SCOPE');const iv=crypto.getRandomValues(new Uint8Array(12)),cipher=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:enc.encode(k)},key,enc.encode(value));localStorage.setItem(saltKey,hex(salt));localStorage.setItem(k,JSON.stringify({version:1,iv:hex(iv),cipher:hex(new Uint8Array(cipher))}))},async remove(k){if(k!==keyName)throw Error('DRAFT_SCOPE');localStorage.removeItem(k)}};
 // Verify an existing encrypted draft before accepting a new key. Never overwrite on bad unlock.
 if(localStorage.getItem(keyName))await store.read(keyName);return store;
}
