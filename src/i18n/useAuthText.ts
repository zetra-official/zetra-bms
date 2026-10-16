import {useCallback,useRef} from 'react';
import {useLanguage} from './LanguageProvider';
import {translateAuth} from './authMessages';
export function useAuthText(){const {language}=useLanguage();const latest=useRef(language);latest.current=language;return useCallback((source:string,values?:Record<string,string>)=>translateAuth(latest.current,source,values),[language]);}
