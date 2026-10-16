import {useCallback,useRef} from 'react';
import {useLanguage} from './LanguageProvider';
import {translateCommon} from './commonMessages';
export function escapeDocumentHtml(value:string):string {
  return value.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
export function useDocumentText(){
  const context=useLanguage();
  const current=useRef(context);
  current.current=context;
  const documentText=useCallback((source:string)=>escapeDocumentHtml(translateCommon(current.current.language,source)),[]);
  const documentLocale=useCallback(()=>({language:current.current.language,direction:current.current.language==='ar'?'rtl':'ltr'}),[]);
  return {documentText,documentLocale};
}
