// Versioned SIX + Unicode CLDR metadata. No unverified catalog downloads at runtime.
import {currentCurrencyMetadata,currencyMetadata,currencyDataVersion} from '../currency/metadata';
export type CurrencyMeta={code:string;name:string;symbol?:string;symbolNative?:string;decimals?:number;countries?:readonly string[];numericCode?:string|null;cashDigits?:number;cashRounding?:number};
const currencyNames=new Map<string,Intl.DisplayNames>();
const clean=(v:any)=>String(v??'').trim();const upper=(v:any)=>clean(v).toUpperCase();
export function localizedCurrencyName(code:string,locale:string,fallback:string=code){try{if(typeof Intl.DisplayNames!=='function')return fallback;let names=currencyNames.get(locale);if(!names){if(currencyNames.size>=8)currencyNames.clear();names=new Intl.DisplayNames([locale],{type:'currency',fallback:'code'});currencyNames.set(locale,names);}const name=names.of(upper(code));return name&&name!==code?name:fallback;}catch{return fallback;}}
export function getRuntimeCurrencyCatalog():CurrencyMeta[]{return currentCurrencyMetadata.filter(c=>c.status==='ACTIVE').map(c=>({...c,decimals:c.decimals??undefined,symbol:c.code}));}
export const FALLBACK_CURRENCIES:CurrencyMeta[]=getRuntimeCurrencyCatalog();
export async function getCachedCurrencyCatalog(){return getRuntimeCurrencyCatalog();}
export async function loadCurrencyCatalogFast(){return getRuntimeCurrencyCatalog();}
export async function refreshCurrencyCatalog(){return getRuntimeCurrencyCatalog();}
/** Metadata refresh is a reviewed source-data update, not an arbitrary remote JSON override. */
export async function fetchRemoteCurrencyCatalog():Promise<CurrencyMeta[]>{return getRuntimeCurrencyCatalog();}
export {currencyDataVersion,currencyMetadata};
