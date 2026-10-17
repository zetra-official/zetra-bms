import React,{useState} from 'react';
import {View,Text,Pressable} from 'react-native';
import {useLanguage} from '../i18n/LanguageProvider';
import {proformaText} from './labels';
import {proformaAvailability,PROFORMA_PERSISTENCE_READY} from './availability';
import {ProformaOrdersPanel,ProformaExportButton,type ProformaReader} from './ProformaOrdersPanel';
import type {ProformaRevision} from './model';
import {ProformaDocuments} from './ProformaDocuments';
import {ProformaBoundary} from './ProformaBoundary';
// Safe presentation integration only. A reader cannot be enabled by a route,
// preference, persisted device value, or a supplied client-side role.
export function ProformaEntry({organizationId,storeId,authorized,reader,startNew=false,draftId,onStartCheckout}:{organizationId:string|null;storeId:string|null;authorized:boolean;reader?:ProformaReader;startNew?:boolean;draftId?:string;onStartCheckout?:()=>void}) {
 const {language}=useLanguage();const copy=proformaAvailability[language];
 const [selected,setSelected]=useState<ProformaRevision|null>(null);
 if(!authorized||!organizationId||!storeId)return <Text accessibilityRole="alert" style={{color:'#334155',padding:16}}>{copy.denied}</Text>;
 if(!PROFORMA_PERSISTENCE_READY)return <View style={{padding:20,gap:16,direction:language==='ar'?'rtl':'ltr'}}>
  <Text accessibilityRole="header" style={{fontSize:24,fontWeight:'800',color:'#0f172a'}}>{proformaText(language,'invoice')}</Text>
  <Text accessibilityRole="alert" style={{fontSize:18,fontWeight:'700',color:'#92400e'}}>{copy.setup}</Text>
  <Text style={{fontSize:16,lineHeight:24,color:'#334155'}}>{copy.blocked}</Text>
  <Text style={{fontSize:15,lineHeight:23,color:'#334155'}}>{copy.noEffects}</Text>
  {[copy.create,copy.history,proformaText(language,'share')].map(label=><Pressable key={label} accessibilityRole="button" accessibilityState={{disabled:true}} disabled style={{minHeight:48,padding:14,borderRadius:10,backgroundColor:'#e2e8f0'}}><Text style={{color:'#475569',fontWeight:'700'}}>{label}</Text></Pressable>)}
 </View>;
 if(!reader)return <View style={{flex:1,minHeight:0,backgroundColor:'#fff'}}><ProformaBoundary failed={proformaText(language,'loadFailed')} retry={proformaText(language,'retry')}><ProformaDocuments key={`${organizationId}:${storeId}:${draftId??''}`} organizationId={organizationId} storeId={storeId} startNew={startNew} draftId={draftId} onStartCheckout={onStartCheckout}/></ProformaBoundary></View>;

 // No financial commands are exposed here. Reader rows retain their trusted
 // amounts, identities and currencies and are checked by the existing panel.
 return <View><ProformaOrdersPanel organizationId={organizationId} storeId={storeId} reader={reader} onSelect={setSelected}/>{selected&&selected.organizationId===organizationId&&selected.storeId===storeId&&<ProformaExportButton revision={selected}/>}</View>;
}
