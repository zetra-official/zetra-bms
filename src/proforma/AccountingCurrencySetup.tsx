import React,{useEffect,useRef,useState} from 'react';
import {View,Text,Pressable} from 'react-native';
import {CurrencyPickerAll} from '../components/CurrencyPickerAll';
import {useLanguage} from '../i18n/LanguageProvider';
import {supabase} from '../supabase/supabaseClient';
import {makeId} from '../offline/salesQueue';
import {Button} from '../ui/Button';
import {normalText} from './normalCopy';
import {currencyUx} from './currencyUxCopy';
export function AccountingCurrencySetup({organizationId,role,current,onConfirmed}:{organizationId:string;role:string;current:string|null;onConfirmed:()=>Promise<void>}){
 const {language}=useLanguage(),[expanded,setExpanded]=useState(false),[code,setCode]=useState<string|null>(null),[ack,setAck]=useState(false),[busy,setBusy]=useState(false),[failed,setFailed]=useState(false),lock=useRef(false),intent=useRef<{code:string;id:string}|null>(null);
 useEffect(()=>{setExpanded(false);setCode(null);setAck(false);setFailed(false);intent.current=null},[organizationId,current]);
 async function confirm(){if(lock.current||role!=='owner'||!code||!ack)return;lock.current=true;setBusy(true);setFailed(false);const org=organizationId;try{if(intent.current?.code!==code)intent.current={code,id:makeId()};const {data,error}=await supabase.rpc('owner_confirm_org_accounting_currency_v1',{p_organization_id:org,p_request_id:intent.current.id,p_currency:code,p_operation:'CONFIRM',p_origin:'EXISTING_BUSINESS',p_acknowledged:true,p_reason:null});if(error||data?.status!=='CONFIRMED'||data?.currency!==code)throw Error('CONFIRMATION_NOT_VERIFIED');await onConfirmed();setExpanded(false)}catch{setFailed(true)}finally{lock.current=false;setBusy(false)}}
 return <View style={{gap:10,padding:14,borderWidth:1,borderColor:'#CBD5E1',borderRadius:14,backgroundColor:'#F8FAFC',direction:language==='ar'?'rtl':'ltr'}}>
 <Text style={{color:'#0F172A',fontWeight:'800'}}>{currencyUx(language,'accounting')}: {current??'—'}</Text>
 {!current&&(role==='owner'?<><Text style={{color:'#475569',lineHeight:21}}>{currencyUx(language,'explain')}</Text><Button title={currencyUx(language,'configure')} variant="secondary" disabled={busy} onPress={()=>setExpanded(!expanded)}/>{expanded&&<><View style={{backgroundColor:'#07131C',borderRadius:18}}><CurrencyPickerAll value={code} onChange={v=>{if(!busy){setCode(v);setAck(false)}}} disabled={busy} title={currencyUx(language,'accounting')}/></View><Pressable accessibilityRole="checkbox" accessibilityState={{checked:ack,disabled:busy}} disabled={busy||!code} onPress={()=>setAck(!ack)} style={{paddingVertical:12,minHeight:48}}><Text style={{color:'#0F172A',lineHeight:21}}>{ack?'☑':'☐'} {normalText(language,'ack')}</Text></Pressable><Button title={normalText(language,'confirm')} disabled={!code||!ack||busy} onPress={()=>void confirm()}/></>}</>:<Text style={{color:'#475569',lineHeight:21}}>{currencyUx(language,'owner')}</Text>)}
 {failed&&<Text accessibilityRole="alert" style={{color:'#A52B36'}}>{normalText(language,'failed')}</Text>}
 </View>
}
