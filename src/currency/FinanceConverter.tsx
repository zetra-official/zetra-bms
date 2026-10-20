import React,{useState} from 'react';
import {Text,TextInput,View} from 'react-native';
import {CurrencyPickerAll} from '../components/CurrencyPickerAll';
import {useLanguage} from '../i18n/LanguageProvider';
import {parseLocalizedAmount} from './engine';
import {CurrentRateValuation} from './CurrentRateValuation';
/** Optional reference calculator; actual business screens provide their own totals. */
export function FinanceConverter(){
 const {language}=useLanguage(),[amount,setAmount]=useState('250000'),[from,setFrom]=useState<string|null>('TZS');
 let decimal:string|null=null;try{decimal=parseLocalizedAmount(amount,language)}catch{}
 return <View style={{gap:12}}>
  <Text style={{fontSize:24,fontWeight:'700'}}>Current-rate display conversion</Text>
  <CurrencyPickerAll title="Original currency" value={from} onChange={setFrom}/>
  <TextInput accessibilityLabel="Original amount" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" style={{padding:14,borderWidth:1,borderColor:'#64748b',borderRadius:12}}/>
  {decimal!==null&&from?<CurrentRateValuation organizationId="reference-calculator" period="Reference calculator · no financial posting" rows={[{label:"Original amount",value:{amount:decimal,currency:from,organizationId:'reference-calculator',contextRevision:null,source:'TRANSACTION_RECORD'}}]}/>:<Text>Enter a valid original amount and currency.</Text>}
 </View>;
}
