import React from 'react';
import {View,Text} from 'react-native';
import {CurrencyPickerAll} from '../components/CurrencyPickerAll';
import {Language} from './catalog';
import {useLanguage} from './LanguageProvider';
import {ExchangeRateStatus} from '../currency/CurrencyAmount';
const currencyCopy:Record<Language,[string,string]>={
 en:['Preferred display currency','Preference only. Business amounts remain in their original currency until a verified conversion rate is available.'],
 sw:['Sarafu ya kuonyesha unayopendelea','Chaguo pekee. Kiasi cha biashara kinabaki katika sarafu yake halisi hadi kiwango cha ubadilishaji kilichothibitishwa kipatikane.'],
 fr:['Devise d’affichage préférée','Préférence uniquement. Les montants restent dans leur devise d’origine jusqu’à la disponibilité d’un taux vérifié.'],
 pt:['Moeda de apresentação preferida','Apenas uma preferência. Os valores permanecem na moeda original até estar disponível uma taxa verificada.'],
 ar:['عملة العرض المفضلة','تفضيل فقط. تبقى المبالغ بعملتها الأصلية حتى يتوفر سعر صرف موثّق.'],
 es:['Moneda de visualización preferida','Solo una preferencia. Los importes permanecen en su moneda original hasta disponer de un tipo de cambio verificado.'],
 zh:['首选显示货币','仅为偏好设置。在获得经验证的汇率之前，业务金额保持原始货币。'],
};
export function PersonalCurrencyPicker({businessCurrency}:{businessCurrency:string}){const {language,displayCurrency,setDisplayCurrency}=useLanguage();return <View style={{marginTop:16}}><CurrencyPickerAll value={displayCurrency||businessCurrency} disabled={false} onChange={setDisplayCurrency} title={currencyCopy[language][0]}/><Text style={{color:'#94a3b8',marginTop:8,textAlign:language==='ar'?'right':'left'}}>{currencyCopy[language][1]}</Text><ExchangeRateStatus/></View>}
