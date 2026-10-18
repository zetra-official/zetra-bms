import React,{useState} from 'react';
import {View,Text} from 'react-native';
import {useRouter} from 'expo-router';
import {CurrencyPickerAll} from '../components/CurrencyPickerAll';
import {useLanguage} from '../i18n/LanguageProvider';
import {Button} from '../ui/Button';
import {useMasterText} from './masterMessages';
/** No report amount is relabelled when its historical denomination is unknown. */
export function ReportCurrencySelector(){const {displayCurrency}=useLanguage(),[override,setOverride]=useState(displayCurrency),t=useMasterText(),router=useRouter();return <View style={{gap:8,padding:12,borderWidth:1,borderColor:'#94A3B8',borderRadius:12}}><CurrencyPickerAll title={t('report')} value={override} onChange={setOverride}/>{override&&<Text style={{color:'#475569'}}>{t('legacy')}</Text>}<Button title={t('title')} onPress={()=>router.push('/finance/exchange-rates' as any)} variant="secondary"/></View>;}
export function CurrencyToolsLink(){const t=useMasterText(),router=useRouter();return <View style={{marginBottom:8}}><Button title={t('title')} variant="secondary" onPress={()=>router.push('/finance/exchange-rates' as any)}/></View>;}
