import React,{useCallback,useRef,useState} from 'react';
import {View,Text,TextInput,ActivityIndicator} from 'react-native';
import {useFocusEffect} from 'expo-router';
import {shareFinancialPdf} from '../currency/shareFinancialPdf';
import {useOrg} from '../context/OrgContext';
import {useLanguage} from '../i18n/LanguageProvider';
import {useCommonText} from '../i18n/useCommonText';
import {useSystemMessageText} from '../i18n/useSystemMessageText';
import {supabase} from '../supabase/supabaseClient';
import {Screen} from '../ui/Screen';
import {Card} from '../ui/Card';
import {Button} from '../ui/Button';
import {theme} from '../ui/theme';
import {readOriginalFacts,type FactKind} from '../currency/originalFacts';
import {originalReportHtml,originalReportSections,originalReportText,type OriginalReportInput} from '../currency/originalReport';
import {formatCurrencyExact} from '../currency/engine';
import {CurrencyToolsLink} from '../currency/ReportCurrencySelector';
/** Uses the existing Auth layout, scoped server reader and Print/Share services.
 * Entry is compile-time disabled until exact backend/client rollout approval. */
export function OriginalFinancialStatement(){
 const {activeOrgId,activeStoreId,activeStoreName,activeRole}=useOrg();const {language}=useLanguage();const t=useCommonText(),system=useSystemMessageText();
 const [from,setFrom]=useState(()=>new Date().toISOString().slice(0,7)+'-01');const [to,setTo]=useState(()=>new Date(Date.UTC(new Date().getUTCFullYear(),new Date().getUTCMonth()+1,1)).toISOString().slice(0,10));
 const [state,setState]=useState<{scope:string;data:OriginalReportInput|null;loading:boolean;error:string|null}>({scope:'',data:null,loading:false,error:null});const [printing,setPrinting]=useState(false);const epoch=useRef(0);const scope=String(activeOrgId)+':'+String(activeStoreId);
 const load=useCallback(async()=>{const id=++epoch.current;setState({scope,data:null,loading:true,error:null});let timer:ReturnType<typeof setTimeout>|undefined;
  try{
   if(!activeOrgId||!activeStoreId)throw Error('CURRENCY_TENANT_MISMATCH');
   const dates=[from,to].map(s=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(s)||new Date(s+'T00:00:00Z').toISOString().slice(0,10)!==s)throw Error('INVALID_EFFECTIVE_DATE');return s+'T00:00:00Z'});
   const base={organizationId:activeOrgId,storeId:activeStoreId,from:dates[0],to:dates[1]};
   const work=(async()=>{const sales=await readOriginalFacts(supabase,{...base,kind:'SALE'});const kinds:FactKind[]=['PAYMENT','EXPENSE','CREDIT',...(String(activeRole).toLowerCase()==='owner'?['COGS','STOCK'] as FactKind[]:[])];const rest=await Promise.all(kinds.map(async kind=>[kind,(await readOriginalFacts(supabase,{...base,kind,snapshot:sales.snapshot!})).rows] as const));return {organizationId:activeOrgId,storeId:activeStoreId,storeName:activeStoreName??activeStoreId,language,from,to,facts:{SALE:sales.rows,...Object.fromEntries(rest)}}})();
   const data=await Promise.race([work,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error('FINANCIAL_READER_UNAVAILABLE')),12000)})]);if(id===epoch.current)setState({scope,data,loading:false,error:null});
  }catch(error){if(id===epoch.current)setState({scope,data:null,loading:false,error:error instanceof Error?error.message:String(error)})}finally{if(timer)clearTimeout(timer)}
 },[activeOrgId,activeStoreId,activeStoreName,activeRole,scope,from,to,language]);
 useFocusEffect(useCallback(()=>{void load();return()=>{epoch.current++}},[load]));
 const data=state.scope===scope?state.data:null;const report=data?originalReportSections(data):null;
 const exportPdf=async()=>{if(!data||printing)return;setPrinting(true);try{await shareFinancialPdf(originalReportHtml(data),originalReportText(language,'title'))}catch(error){setState(s=>({...s,error:error instanceof Error?error.message:String(error)}))}finally{setPrinting(false)}};
 return <Screen scroll><View style={{padding:16,gap:12,direction:language==='ar'?'rtl':'ltr'}}><Text style={{fontSize:24,fontWeight:'900',color:theme.colors.text}}>{originalReportText(language,'title')}</Text><Text style={{color:theme.colors.muted}}>{activeStoreName}</Text><Text style={{color:theme.colors.muted}}>{originalReportText(language,'note')}</Text><View style={{flexDirection:'row',flexWrap:'wrap',gap:12}}><TextInput accessibilityLabel={originalReportText(language,'from')} value={from} onChangeText={setFrom} style={{padding:12,borderWidth:1,borderColor:theme.colors.border,color:theme.colors.text}}/><TextInput accessibilityLabel={originalReportText(language,'to')} value={to} onChangeText={setTo} style={{padding:12,borderWidth:1,borderColor:theme.colors.border,color:theme.colors.text}}/><Button title={originalReportText(language,'retry')} onPress={()=>void load()} disabled={state.loading}/></View>{state.loading&&<ActivityIndicator/>}{state.error&&<Text accessibilityRole="alert" style={{color:theme.colors.danger}}>{system(state.error)}</Text>}{report?.sections.map(s=><Card key={s.kind} style={{padding:16,gap:8}}><Text style={{fontWeight:'900',color:theme.colors.text}}>{s.title}</Text>{s.totals?Object.entries(s.totals).map(([c,a])=><Text key={c} style={{color:theme.colors.text,fontSize:20,fontWeight:'800'}}>{formatCurrencyExact(a,c,language)}</Text>):<Text style={{color:theme.colors.danger}}>{originalReportText(language,'incomplete')}</Text>}</Card>)}{data?.facts.COGS&&<Card style={{padding:16,gap:8}}><Text style={{fontWeight:'900',color:theme.colors.text}}>{originalReportText(language,'gross')}</Text>{report?.gross?Object.entries(report.gross).map(([c,a])=><Text key={c} style={{color:theme.colors.text}}>{formatCurrencyExact(a,c,language)}</Text>):<Text style={{color:theme.colors.danger}}>{originalReportText(language,'incomplete')}</Text>}</Card>}<Button title={originalReportText(language,'share')} onPress={()=>void exportPdf()} disabled={!data||printing}/><CurrencyToolsLink/></View></Screen>;
}
