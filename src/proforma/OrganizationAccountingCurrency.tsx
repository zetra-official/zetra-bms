import React,{useCallback,useEffect,useState} from 'react';
import {ActivityIndicator,Text,View} from 'react-native';
import {supabase} from '../supabase/supabaseClient';
import {useLanguage} from '../i18n/LanguageProvider';
import {normalText} from './normalCopy';
import {Button} from '../ui/Button';
import {AccountingCurrencySetup} from './AccountingCurrencySetup';
import {currencyUx} from './currencyUxCopy';
export function OrganizationAccountingCurrency({organizationId,role}:{organizationId:string;role:string}){
 const {language}=useLanguage(),[current,setCurrent]=useState<string|null>(null),[loading,setLoading]=useState(true),[failed,setFailed]=useState(false);
 const refresh=useCallback(async()=>{setLoading(true);setFailed(false);try{const {data,error}=await supabase.rpc('get_org_accounting_currency_v1',{p_organization_id:organizationId});if(error){if(error.message.includes('ACCOUNTING_CURRENCY_UNCONFIRMED')){setCurrent(null);return}throw error}if(data?.source!=='OWNER_CONFIRMED'||!data.currency)throw Error('UNVERIFIED_AUTHORITY');setCurrent(data.currency)}catch{setFailed(true)}finally{setLoading(false)}},[organizationId]);
 useEffect(()=>{void refresh()},[refresh]);
 return <View style={{gap:10}}>{loading?<ActivityIndicator/>:failed?<Text accessibilityRole="alert">{normalText(language,'failed')}</Text>:<AccountingCurrencySetup organizationId={organizationId} role={role} current={current} onConfirmed={refresh}/>}<Button title={currencyUx(language,'retry')} variant="secondary" disabled={loading} onPress={()=>void refresh()}/></View>
}
