import {withReceiptLogo} from './receiptBranding';
import {supabase} from '../supabase/supabaseClient';
import React,{useEffect,useRef,useState} from 'react';
import {ActivityIndicator,Platform,Pressable,Text,TextInput,View} from 'react-native';
import {useLanguage} from '../i18n/LanguageProvider';
import {proformaText} from './labels';
import {ProformaRevision,validateRevision} from './model';
import {displayDecimal} from './document';
import {exportProformaNative,printProformaWeb} from './export';
/** A real authorized persistence adapter must be supplied. No fallback mock/local queue. */
export interface ProformaReader {list(input:{organizationId:string;storeId:string;search:string;signal:AbortSignal}):Promise<readonly ProformaRevision[]>}
export function ProformaOrdersPanel({organizationId,storeId,reader,onSelect}:{organizationId:string;storeId:string;reader:ProformaReader;onSelect:(revision:ProformaRevision)=>void}){
 const {language}=useLanguage(),[search,setSearch]=useState(''),[rows,setRows]=useState<readonly ProformaRevision[]>([]),[loading,setLoading]=useState(true),[failed,setFailed]=useState(false),[retry,setRetry]=useState(0);
 useEffect(()=>{const controller=new AbortController();setRows([]);setLoading(true);setFailed(false);const timer=setTimeout(()=>{void reader.list({organizationId,storeId,search,signal:controller.signal}).then(result=>{if(controller.signal.aborted)return;for(const row of result){validateRevision(row);if(row.organizationId!==organizationId||row.storeId!==storeId)throw Error('RESPONSE_SCOPE_MISMATCH')}setRows(result);setLoading(false)}).catch(()=>{if(!controller.signal.aborted){setRows([]);setFailed(true);setLoading(false)}})},250);return()=>{controller.abort();clearTimeout(timer)}},[organizationId,storeId,reader,search,retry]);
 const visibleRows=rows.filter(row=>row.organizationId===organizationId&&row.storeId===storeId);
 const t=(key:Parameters<typeof proformaText>[1])=>proformaText(language,key);
 return <View style={{padding:16,gap:14,direction:language==='ar'?'rtl':'ltr'}}><Text accessibilityRole="header" style={{fontSize:24,fontWeight:'700',color:'#111827'}}>{t('orders')}</Text><TextInput value={search} onChangeText={setSearch} accessibilityLabel={t('search')} placeholder={t('search')} style={{minHeight:48,borderWidth:1,borderColor:'#b8c4d3',borderRadius:8,padding:12}}/>{loading?<View accessibilityLabel={t('loading')}><ActivityIndicator/><Text>{t('loading')}</Text></View>:failed?<View><Text accessibilityRole="alert">{t('loadFailed')}</Text><Pressable accessibilityRole="button" onPress={()=>setRetry(n=>n+1)} style={{padding:12,minHeight:48}}><Text>{t('retry')}</Text></Pressable></View>:visibleRows.length===0?<Text>{t('empty')}</Text>:visibleRows.map(row=><Pressable key={row.id} accessibilityRole="button" accessibilityLabel={`${t('view')} ${row.reference}`} onPress={()=>onSelect(row)} style={{padding:16,borderWidth:1,borderColor:'#d7dee8',borderRadius:10,backgroundColor:'#fff',gap:6}}><Text style={{fontWeight:'700'}}>{row.reference}</Text>{!!row.customer?.name&&<Text>{row.customer.name}</Text>}<Text>{t(row.status.toLowerCase() as 'draft'|'pending'|'accepted'|'converted'|'expired'|'cancelled')}</Text><Text>{displayDecimal(row.total,language)} {row.currency}</Text></Pressable>)}</View>;
}
export function ProformaExportButton({revision}:{revision:ProformaRevision}){
 const {language}=useLanguage(),[busy,setBusy]=useState(false),[failed,setFailed]=useState(false),gate=useRef(false);
 async function run(){if(gate.current)return;gate.current=true;setBusy(true);setFailed(false);try{const prepare=(q:ProformaRevision)=>withReceiptLogo(q,supabase,process.env.EXPO_PUBLIC_SUPABASE_URL??'');if(Platform.OS==='web')await printProformaWeb(revision,language,prepare);else {const result=await exportProformaNative(await prepare(revision),language);if(!result.shared)throw Error('SHARING_UNAVAILABLE')}}catch{setFailed(true)}finally{gate.current=false;setBusy(false)}}
 return <View><Pressable accessibilityRole="button" disabled={busy} accessibilityState={{disabled:busy,busy}} onPress={()=>void run()} style={{minHeight:48,padding:14,borderRadius:9,backgroundColor:'#005bbb'}}>{busy?<ActivityIndicator color="#fff"/>:<Text style={{color:'#fff',fontWeight:'700',textAlign:'center'}}>{proformaText(language,'share')}</Text>}</Pressable>{failed&&<Text accessibilityRole="alert">{proformaText(language,'exportFailed')}</Text>}</View>;
}
