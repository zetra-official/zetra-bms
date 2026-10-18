import React,{useRef,useState} from 'react';
import {ActivityIndicator,Text,TextInput,View} from 'react-native';
import {CurrencyPickerAll} from '../components/CurrencyPickerAll';
import {Button} from '../ui/Button';
import {useLanguage} from '../i18n/LanguageProvider';
import {formatExact,currencyPrecision,parseLocalizedAmount} from './engine';
import {historicalSnapshot,identityDisplay} from './historical';
import {loadReferenceRates,loadReferenceHistory,makeDisplayQuote,convertDisplayDecimal,type ReferenceRates} from '../services/referenceFx';
import {useMasterText} from './masterMessages';
/** Separate explicit input estimate. Never inferred from a financial balance. */
export function FinanceConverter(){
 const t=useMasterText(),{language}=useLanguage(),[amount,setAmount]=useState(''),[from,setFrom]=useState<string|null>(null),[to,setTo]=useState<string|null>(null),[date,setDate]=useState(new Date().toISOString().slice(0,10)),[busy,setBusy]=useState(false),[failed,setFailed]=useState(false),lock=useRef(false);
 const [result,setResult]=useState<{amount:string;source:string;original:string}|null>(null),[invalid,setInvalid]=useState(false);
 function reset(){setResult(null);setFailed(false);setInvalid(false);}
 async function convert(){if(lock.current)return;lock.current=true;setBusy(true);setFailed(false);setResult(null);
  try{const original=parseLocalizedAmount(amount,language);if(!from||!to||!/^\d{4}-\d{2}-\d{2}$/.test(date)||new Date(date+'T00:00:00Z').toISOString().slice(0,10)!==date||date>new Date().toISOString().slice(0,10))throw Error('INVALID');
   if(from===to){setResult({amount:identityDisplay(original,currencyPrecision(to)),source:'1 : 1 · SAME_CURRENCY_IDENTITY',original});return;}
   const historical=date!==new Date().toISOString().slice(0,10);const snapshots=historical?await loadReferenceHistory():[await loadReferenceRates()];
   const evidence=historicalSnapshot(snapshots,date,3),quote=makeDisplayQuote(evidence,from,to,new Date(date+'T23:59:59.999Z'),3,new Date());
   setResult({amount:convertDisplayDecimal(original,quote,currencyPrecision(to)),original,source:`${evidence.provider} · ${evidence.referenceDate} · ${evidence.retrievedAt} · 1 ${from} = ${convertDisplayDecimal('1',quote,6)} ${to} · SHA256 ${evidence.sourceSha256.slice(0,16)}…`});
  }catch(error){setInvalid(String((error as Error).message).includes('INVALID'));setFailed(true);}finally{lock.current=false;setBusy(false);}
 }
 return <View style={{gap:12,direction:language==='ar'?'rtl':'ltr'}}>
  <Text style={{fontSize:24,fontWeight:'800',color:'#0F172A'}}>{t('title')}</Text><Text style={{color:'#475569'}}>{t('estimate')}</Text>
  <Text style={{color:'#0F172A'}}>{t('amount')}</Text><TextInput accessibilityLabel={t('amount')} value={amount} onChangeText={v=>{setAmount(v);reset();}} editable={!busy} keyboardType="decimal-pad" placeholder={new Intl.NumberFormat(language,{minimumFractionDigits:2}).format(0)} style={{padding:14,borderWidth:1,borderColor:'#64748B',borderRadius:12,color:'#0F172A'}}/>
  <CurrencyPickerAll title={t('from')} value={from} onChange={v=>{setFrom(v);reset();}} disabled={busy}/><CurrencyPickerAll title={t('to')} value={to} onChange={v=>{setTo(v);reset();}} disabled={busy}/>
  <Text style={{color:'#0F172A'}}>{t('date')}</Text><TextInput accessibilityLabel={t('date')} value={date} onChangeText={v=>{setDate(v);reset();}} editable={!busy} placeholder="YYYY-MM-DD" style={{padding:14,borderWidth:1,borderColor:'#64748B',borderRadius:12,color:'#0F172A'}}/>
  <Text style={{color:'#475569'}}>{t('history')}</Text><Button title={t('refresh')} onPress={()=>void convert()} disabled={busy||!from||!to||!amount}/>{busy&&<ActivityIndicator/>}
  {failed&&<Text accessibilityRole="alert" style={{color:'#991B1B'}}>{invalid?t('invalid'):t('unavailable')}</Text>}
  {result&&<View accessibilityLiveRegion="polite" style={{gap:8,padding:14,borderWidth:1,borderColor:'#059669',borderRadius:12}}><Text style={{color:'#0F172A',fontSize:22}}>{formatExact(result.amount,language)} {to}</Text><Text style={{color:'#475569'}}>{formatExact(result.original,language)} {from}</Text><Text style={{color:'#475569',flexShrink:1}}>{t('source')}: {result.source}</Text><Text style={{color:'#475569'}}>{t('estimate')}</Text></View>}
 </View>;
}
