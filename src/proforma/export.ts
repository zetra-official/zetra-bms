import type {Language} from '../i18n/catalog';
import type {ProformaRevision} from './model';
import {buildProformaHtml} from './document';
import {proformaText} from './labels';
/** Same expo-print/expo-sharing conventions as existing receipts; no sale or database calls. */
export async function exportProformaNative(q:ProformaRevision,language:Language):Promise<{uri:string;shared:boolean}> {
 const html=buildProformaHtml(q,language);
 const Print=await import('expo-print');const Sharing=await import('expo-sharing');
 const {uri}=await Print.printToFileAsync({html});
 if(await Sharing.isAvailableAsync()){await Sharing.shareAsync(uri,{mimeType:'application/pdf',dialogTitle:proformaText(language,'share'),UTI:'com.adobe.pdf'});return {uri,shared:true}}
 return {uri,shared:false};
}
/** Real browser print-to-PDF dialog. A returned handle does not prove the user saved a file. */
export async function printProformaWeb(q:ProformaRevision,language:Language,prepare?:(revision:ProformaRevision)=>Promise<ProformaRevision>):Promise<void>{
 if(typeof window==='undefined')throw Error('WEB_UNAVAILABLE');
 const preview=window.open('','_blank');if(!preview)throw Error('POPUP_BLOCKED');
 try{preview.opener=null;const html=buildProformaHtml(prepare?await prepare(q):q,language);preview.document.open();preview.document.write(html);preview.document.close();await preview.document.fonts.ready;await Promise.all(Array.from(preview.document.images).map(img=>img.decode().catch(()=>undefined)));preview.focus();preview.print()}catch(error){preview.close();throw error}
}
