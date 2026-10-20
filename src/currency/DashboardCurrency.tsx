import React,{useCallback,useEffect,useState} from 'react';
import {Modal,Pressable,ScrollView,Text,View} from 'react-native';
import {useFocusEffect} from 'expo-router';
import {useOrg} from '../context/OrgContext';
import {useLanguage} from '../i18n/LanguageProvider';
import {supabase} from '../supabase/supabaseClient';
import {CurrentRateValuation} from './CurrentRateValuation';
import {useAccountingAuthority} from './useAccountingAuthority';
import {dashboardScopeKey,loadDashboardTotals,type DashboardTotal} from './dashboardValuation';
import {UI} from '../ui/theme';
export function DashboardCurrency(){
 const org=useOrg(),{displayCurrency,language}=useLanguage(),sw=language==='sw';
 const [open,setOpen]=useState(false),[retry,setRetry]=useState(0);
 const scope={organizationId:String(org.activeOrgId??''),storeId:org.activeStoreId,role:String(org.activeRole??''),stores:org.stores};
 const date=new Date(),ymd=[date.getFullYear(),date.getMonth()+1,date.getDate()].join('-'),key=dashboardScopeKey(scope,ymd);
 const [state,setState]=useState<{key:string;rows:DashboardTotal[];status:'loading'|'ready'|'error'}>({key:'',rows:[],status:'loading'});
 const accounting=useAccountingAuthority(scope.organizationId);
 useFocusEffect(useCallback(()=>{if(open)setRetry(n=>n+1)},[open]));
 useEffect(()=>{
  if(!open||!scope.organizationId||org.loading)return;
  let current=true;setState({key,rows:[],status:'loading'});
  void loadDashboardTotals(supabase,scope,new Date()).then(rows=>{if(current)setState({key,rows,status:'ready'})}).catch(()=>{if(current)setState({key,rows:[],status:'error'})});
  return()=>{current=false};
 },[open,key,retry,org.loading]);
 if(!scope.organizationId||!scope.role)return null;
 const ready=!org.loading&&state.key===key&&state.status==='ready',unsupported=accounting.authority&&accounting.authority.currency!=='TZS';
 return <View testID="dashboard-currency-entry" style={{marginVertical:6,flexShrink:0}}>
  <Pressable accessibilityRole="button" accessibilityLabel="Dashboard currency" onPress={()=>setOpen(true)} style={{minHeight:44,padding:12,borderRadius:12,backgroundColor:UI.card,borderWidth:1,borderColor:'#64748b'}}><Text style={{color:UI.text,fontWeight:'700'}}>{sw?'Sarafu ya Dashboard':'Dashboard currency'} · {displayCurrency||'Original'} ▾</Text></Pressable>
  {open&&<Modal visible animationType="slide" onRequestClose={()=>setOpen(false)}><View style={{flex:1,backgroundColor:UI.background,paddingTop:44,paddingHorizontal:12}}>
   <Pressable accessibilityRole="button" onPress={()=>setOpen(false)} style={{minHeight:44,padding:12}}><Text style={{color:UI.text}}>Close dashboard currency</Text></Pressable>
   <ScrollView contentContainerStyle={{paddingBottom:30}}><Text style={{color:UI.text,fontWeight:'700'}}>Dashboard · {scope.storeId?org.activeStoreName:'All authorized stores'} · Today</Text>
    {unsupported?<Text style={{color:UI.text}}>Conversion unavailable: this summary reader is legacy TZS only.</Text>:ready?<CurrentRateValuation key={key} organizationId={scope.organizationId} period="Dashboard · Today · latest reference rate" rows={state.rows.map(row=>({label:row.label,value:{amount:row.amount,currency:'TZS',organizationId:scope.organizationId,contextRevision:null,source:'TRANSACTION_RECORD'}}))}/>:<Text accessibilityRole="alert" style={{color:UI.text}}>{state.key===key&&state.status==='error'?'Dashboard totals unavailable; original records unchanged.':'Loading authorized Dashboard totals…'}</Text>}
    <Pressable accessibilityRole="button" onPress={()=>setRetry(n=>n+1)} style={{minHeight:44,padding:12}}><Text style={{color:UI.text}}>Refresh dashboard totals</Text></Pressable>
   </ScrollView></View></Modal>}
 </View>;
}
