import {useCallback,useRef} from 'react';
import {useLanguage} from './LanguageProvider';
import {translateCommon} from './commonMessages';
export function useCommonText(){const {language}=useLanguage();const latest=useRef(language);latest.current=language;return useCallback((source:string,params?:Readonly<Record<string,string|number>>)=>translateCommon(latest.current,source,params),[language])}
