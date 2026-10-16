import {useCallback,useRef} from 'react';
import {useLanguage} from './LanguageProvider';
import {translateSystemMessage} from './systemMessages';
export function useSystemMessageText(){
  const {language}=useLanguage();
  const latest=useRef(language);latest.current=language;
  return useCallback((value:string|null|undefined)=>translateSystemMessage(latest.current,value),[language]);
}
