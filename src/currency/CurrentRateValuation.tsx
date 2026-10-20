import React,{useEffect,useState,useSyncExternalStore} from 'react';
import {View,Text,Pressable,Linking,ScrollView,Modal} from 'react-native';
import {CurrencyPickerAll} from '../components/CurrencyPickerAll';
import {useLanguage} from '../i18n/LanguageProvider';
import {referenceRateStore,ecbReferenceRateStore} from './rateStore';
import {currentValuation} from './currentValuation';
import {CurrencyPresentation} from './CurrencyAmount';
import type {RecordedMoney} from './engine';
import {UI} from '../ui/theme';
import {shareFinancialPdf} from './shareFinancialPdf';
import {valuationReportHtml} from './valuationReport';
export type ValuationRow={label:string;value:RecordedMoney};
type Props={organizationId:string;rows:readonly ValuationRow[];period:string;compact?:boolean;onPdfGenerated?:(uri:string)=>Promise<void>};
export function CurrentRateValuation(props:Props){
 const [open,setOpen]=useState(false),{displayCurrency,setDisplayCurrency}=useLanguage();
 if(!props.compact)return <CurrentRateDetails {...props}/>;
 return <View style={{backgroundColor:UI.card,borderRadius:10,marginVertical:6}}><View style={{flexDirection:'row',gap:8}}><Pressable accessibilityRole="button" onPress={()=>{setDisplayCurrency('USD');setOpen(true)}} style={{padding:10,minHeight:44}}><Text style={{color:UI.text}}>View in USD</Text></Pressable><Pressable accessibilityRole="button" accessibilityState={{expanded:open}} onPress={()=>setOpen(!open)} style={{padding:10,minHeight:44}}><Text style={{color:UI.text}}>{open?'Close':'Currency'} · {displayCurrency||'Original'}</Text></Pressable></View>{open&&<Modal visible onRequestClose={()=>setOpen(false)} animationType="slide"><View style={{flex:1,backgroundColor:UI.background,paddingTop:44,paddingHorizontal:12}}><Pressable accessibilityRole="button" onPress={()=>setOpen(false)} style={{padding:12,minHeight:44}}><Text style={{color:UI.text}}>Close currency view</Text></Pressable><ScrollView><CurrentRateDetails {...props}/></ScrollView></View></Modal>}</View>;
}
function CurrentRateDetails({organizationId,rows,period,onPdfGenerated}:Props){
 const {language,displayCurrency,setDisplayCurrency}=useLanguage(),sw=language==='sw';
 const tzs=rows.some(r=>r.value.currency==='TZS')||displayCurrency==='TZS';
 const store=tzs?referenceRateStore:ecbReferenceRateStore;
 const state=useSyncExternalStore(store.subscribe,store.getSnapshot,store.getSnapshot),[,setNow]=useState(()=>new Date());
 useEffect(()=>{void store.refresh();const timer=setInterval(()=>{setNow(new Date());void store.refresh()},15*60000);return()=>clearInterval(timer)},[store]);
 useEffect(()=>{const timer=setInterval(()=>setNow(new Date()),60000);return()=>clearInterval(timer)},[]);
 const [sharing,setSharing]=useState(false),[pdfError,setPdfError]=useState(false);
 async function exportPdf(){if(sharing)return;setSharing(true);setPdfError(false);try{const at=new Date(),views=rows.map(row=>({label:row.label,view:currentValuation(row.value,displayCurrency,state.evidence,at,organizationId)}));await shareFinancialPdf(valuationReportHtml(organizationId,period,views,at.toISOString()),'Current-rate valuation',onPdfGenerated)}catch{setPdfError(true)}finally{setSharing(false)}}
 const valuationNow=new Date();
 const text={color:UI.text};
 return <View style={{backgroundColor:UI.card,padding:12,gap:8,borderRadius:12,borderWidth:1,borderColor:'#64748b',marginVertical:8}}>
  <Text style={[text,{fontWeight:'700'}]}>{sw?'Thamani kwa kiwango cha sasa':'Current-rate valuation'} · {period}</Text>
  <CurrencyPickerAll title={sw?'Sarafu ya kuonyesha':'View in currency'} value={displayCurrency} onChange={setDisplayCurrency}/>
  <View style={{flexDirection:'row',gap:12,flexWrap:'wrap'}}>{['USD','KES','UGX','EUR'].map(code=><Pressable key={code} accessibilityRole="button" onPress={()=>setDisplayCurrency(code)} style={{padding:10,minHeight:44}}><Text style={text}>View in {code}</Text></Pressable>)}<Pressable accessibilityRole="button" onPress={()=>setDisplayCurrency(null)} style={{padding:10,minHeight:44}}><Text style={text}>{sw?'Halisi':'Original'}</Text></Pressable></View>
  <Text style={text}>{sw?'Kiwango elekezi cha karibuni; si bei halisi ya benki ya kununua/kuuza. Fedha za asili hazibadiliki.':'Latest reference valuation, not a bank buy/sell execution quote. Original amounts remain unchanged.'}</Text>
  <Text style={text}>{sw?'Sera: tarehe ya kiwango ndani ya siku 4; taarifa ndani ya saa 24.':'Policy: reference date within 4 calendar days; retrieval within 24 hours.'}</Text>
  {state.loading&&<Text style={text}>{sw?'Inapakua viwango…':'Refreshing rates…'}</Text>}
  {state.error&&<Text style={text}>{sw?'Provider haipatikani; evidence iliyopo inakaguliwa kwa freshness.':'Provider unavailable; any retained evidence must still pass freshness.'}</Text>}
  {rows.map((row,index)=>row.value.organizationId===organizationId?<View key={index}><Text style={text}>{row.label}</Text><CurrencyPresentation language={language} view={currentValuation(row.value,displayCurrency,state.evidence,valuationNow,organizationId)}/></View>:<Text key={index} style={text}>Unavailable: report scope changed</Text>)}
  {state.evidence&&<Pressable accessibilityRole="link" onPress={()=>void Linking.openURL(state.evidence!.sourceUrl)}><Text style={text}>{state.evidence.provider} · {sw?'Tarehe':'Effective date'} {state.evidence.referenceDate} · {sw?'Imepokelewa':'Retrieved'} {state.evidence.retrievedAt} · {sw?'Muda wa kuchapishwa haujatolewa':'Publication time not supplied by feed'}</Text></Pressable>}
  <Pressable accessibilityRole="button" disabled={sharing||state.loading} onPress={()=>void exportPdf()} style={{padding:10,minHeight:44}}><Text style={text}>{sw?'PDF ya thamani elekezi':'Print / share valuation PDF'}</Text></Pressable>
  {pdfError&&<Text accessibilityRole="alert" style={text}>{sw?'PDF haikufunguka; jaribu tena.':'The valuation PDF could not be opened; try again.'}</Text>}
  <Pressable accessibilityRole="button" disabled={state.loading} onPress={()=>void store.refresh()} style={{padding:10,minHeight:44}}><Text style={text}>{sw?'Sasisha viwango':'Refresh rates'}</Text></Pressable>
 </View>;
}
