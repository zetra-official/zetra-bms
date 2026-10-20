import {isSelectableCurrency} from '../currency/metadata';
import React, {createContext,useContext,useEffect,useMemo,useRef,useState} from 'react';
import {Pressable,Text,View} from 'react-native';
import {kv} from '../storage/kv';
import {Language,MessageKey,direction,languages,languageNames,resolveLanguage,translate} from './catalog';
const KEY='zetra_user_language_v1';
const DISPLAY_KEY='zetra_user_display_currency_v1';
type State={language:Language;displayCurrency:string|null;t:(key:MessageKey)=>string;setLanguage:(language:Language)=>void;setDisplayCurrency:(currency:string|null)=>void};
const Context=createContext<State>({language:'en',displayCurrency:null,t:key=>translate('en',key),setLanguage:()=>{},setDisplayCurrency:()=>{}});
export function LanguageProvider({children}:{children:React.ReactNode}) {
 const [language,setValue]=useState<Language>('en');const changed=useRef(false);
 const [displayCurrency,setDisplayValue]=useState<string|null>(null);const currencyChanged=useRef(false);
 useEffect(()=>{let alive=true;void kv.getString(KEY).then(value=>{if(alive&&!changed.current)setValue(resolveLanguage(value))});return()=>{alive=false}},[]);
 useEffect(()=>{let alive=true;void kv.getString(DISPLAY_KEY).then(value=>{if(alive&&!currencyChanged.current&&value&&isSelectableCurrency(value))setDisplayValue(value)});return()=>{alive=false}},[]);
 const state=useMemo<State>(()=>({language,displayCurrency,t:key=>translate(language,key),setLanguage:next=>{changed.current=true;const validated=resolveLanguage(next);setValue(validated);void kv.setString(KEY,validated)},setDisplayCurrency:next=>{const validated=next?.trim().toUpperCase()||null;if(validated&&!isSelectableCurrency(validated))return;currencyChanged.current=true;setDisplayValue(validated);void kv.setString(DISPLAY_KEY,validated)}}),[language,displayCurrency]);
 return <Context.Provider value={state}><View style={{flex:1,direction:direction(language)}}>{children}</View></Context.Provider>;
}
export function useLanguage(){return useContext(Context)}
export const languageButtonColors = {
 light: {text:'#0f172a',background:'#ffffff',selectedText:'#14532d',selectedBackground:'#dcfce7',border:'#64748b',selectedBorder:'#15803d'},
 dark: {text:'#f8fafc',background:'#0f172a',selectedText:'#dcfce7',selectedBackground:'#14532d',border:'#94a3b8',selectedBorder:'#4ade80'},
} as const;
export function UserLanguagePicker({appearance='light'}:{appearance?:'light'|'dark'}={}) {
 const {language,setLanguage}=useLanguage();const colors=languageButtonColors[appearance];
 return <View style={{flexDirection:'row',flexWrap:'wrap',gap:8,maxWidth:'100%'}}>{languages.map(code=>{
  const selected=language===code;
  return <Pressable key={code} accessibilityRole="button" accessibilityLabel={languageNames[code]} accessibilityState={{selected}} onPress={()=>setLanguage(code)} style={{minHeight:44,maxWidth:'100%',flexShrink:1,padding:12,borderWidth:1,borderColor:selected?colors.selectedBorder:colors.border,borderRadius:8,backgroundColor:selected?colors.selectedBackground:colors.background}}><Text style={{color:selected?colors.selectedText:colors.text,fontWeight:selected?'700':'500',textAlign:code==='ar'?'right':'left'}}>{languageNames[code]}</Text></Pressable>;
 })}</View>;
}
