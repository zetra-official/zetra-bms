import {Platform} from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
/** Expo's Web printToFileAsync opens window.print and returns no URI. Print the
 * generated document itself in an isolated window; native uses actual file sharing. */
export async function shareFinancialPdf(html:string,title:string,onPdfGenerated?:(uri:string)=>Promise<void>){
 if(Platform.OS==='web'){
  const paper=window.open('','_blank');if(!paper)throw Error('DOCUMENT_WINDOW_BLOCKED');
  paper.opener=null;paper.document.open();paper.document.write(html);paper.document.close();paper.document.title=title;
  await paper.document.fonts.ready;paper.focus();paper.print();return 'WEB_PRINT_DIALOG' as const;
 }
 const {uri}=await Print.printToFileAsync({html});if(!uri)throw Error('PDF_FILE_UNAVAILABLE');
 if(onPdfGenerated)await onPdfGenerated(uri);
 if(await Sharing.isAvailableAsync()){await Sharing.shareAsync(uri,{mimeType:'application/pdf',dialogTitle:title});return 'NATIVE_SHARE_DIALOG' as const;}
 await Print.printAsync({uri});return 'NATIVE_PRINT_DIALOG' as const;
}
