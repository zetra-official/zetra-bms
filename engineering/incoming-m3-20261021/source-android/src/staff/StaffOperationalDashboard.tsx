import React,{useCallback,useEffect,useRef,useState,useSyncExternalStore} from 'react';
import {View,Text,TextInput,Pressable,useWindowDimensions} from 'react-native';
import {useFocusEffect} from 'expo-router';
import {useOrg} from '../context/OrgContext';
import {useLanguage} from '../i18n/LanguageProvider';
import {supabase} from '../supabase/supabaseClient';
import {connectionDeadline} from '../supabase/sessionRecovery';
import {referenceRateStore} from '../currency/rateStore';
import {PreferredRateNote} from '../currency/PreferredDisplay';
import {CurrencyPickerAll} from '../components/CurrencyPickerAll';
import {readSummary,displayOwnMoney,type Summary} from './model';
import {staffCopy} from './copy';
import {UI} from '../ui/theme';
// Only a non-sensitive date preference survives a focus-driven StoreGuard remount.
// No balances, response data, credentials or cost evidence are retained here.
const selectedDays=new Map<string,string|null>();
/** Staff-only server projection. Never calls Owner finance or store-wide summary readers. */
export function StaffOperationalDashboard(){
 const org=useOrg(),prefs=useLanguage(),{width}=useWindowDimensions(),t=staffCopy[prefs.language],rtl=prefs.language==='ar';
 const organization=String(org.activeOrgId??''),store=String(org.activeStoreId??''),role=String(org.activeRole??'');
 const [actor,setActor]=useState(''),[epoch,setEpoch]=useState(0),[day,setDay]=useState<string|null>(null),[entry,setEntry]=useState(''),[offset,setOffset]=useState(0);
 const key=JSON.stringify([actor,organization,store,role,day,offset,epoch]);
 const [state,setState]=useState<{key:string;status:'loading'|'ready'|'error'|'denied';data?:Summary}>({key:'',status:'loading'});
 const generation=useRef(0),[tick,setTick]=useState(0);
 const rates=useSyncExternalStore(referenceRateStore.subscribe,referenceRateStore.getSnapshot,referenceRateStore.getSnapshot);
 useEffect(()=>{let alive=true;void connectionDeadline(supabase.auth.getUser(),10000).then(r=>{if(alive){setActor(r.error?'':r.data.user?.id??'');if(r.error||!r.data.user)setState({key:'',status:r.error?'error':'denied'})}}).catch(()=>{if(alive)setState({key:'',status:'error'})});const {data:{subscription}}=supabase.auth.onAuthStateChange((_event,session)=>{if(alive){setActor(session?.user.id??'');setState({key:'',status:'loading'});setEpoch(e=>e+1)}});return()=>{alive=false;generation.current++;subscription.unsubscribe()}},[]);
 useFocusEffect(useCallback(()=>{setEpoch(e=>e+1)},[]));
 useEffect(()=>{if(!prefs.displayCurrency||prefs.displayCurrency==='TZS')return;void referenceRateStore.refresh();const timer=setInterval(()=>{setTick(n=>n+1);void referenceRateStore.refresh()},60000);return()=>clearInterval(timer)},[prefs.displayCurrency]);
 useEffect(()=>{const restored=actor&&organization&&store?selectedDays.get(JSON.stringify([actor,organization,store]))??null:null;setOffset(0);setDay(restored);setEntry(restored??'')},[actor,organization,store]);
 useEffect(()=>{const n=++generation.current;setState({key,status:'loading'});if(!actor||!organization||!store||role!=='staff'||org.loading)return;
  void connectionDeadline(supabase.rpc('m3_staff_operational_v1',{p_org_id:organization,p_store_id:store,p_day:day,p_offset:offset}),12000).then(r=>{
   if(n!==generation.current)return;if(r.error){setState({key,status:r.error.code==='42501'?'denied':'error'});return}
   const data=readSummary(r.data,{actor,organization,store});if(day&&data.day!==day)throw Error('PERIOD');setState({key,status:'ready',data});
  }).catch(()=>{if(n===generation.current)setState({key,status:'error'})});return()=>{generation.current++};
 },[key,org.loading]);
 const data=!org.loading&&role==='staff'&&state.key===key&&state.status==='ready'?state.data:undefined;
 const readyPreference=prefs.currencyOrganization===organization;
 function money(amount:string|null){if(amount===null||!readyPreference)return t.unavailable;const v=displayOwnMoney(amount,prefs.displayCurrency,rates.evidence,new Date(),organization,prefs.language);return v.status==='UNAVAILABLE'?`${v.text} · ${t.fx}`:v.text}
 const label={color:UI.text,textAlign:rtl?'right' as const:'left' as const},button={padding:12,minHeight:44,borderRadius:10,backgroundColor:UI.card};
 return <View testID="staff-operational-dashboard" style={{padding:12,gap:12,direction:rtl?'rtl':'ltr'}}>
  <Text style={[label,{fontSize:22,fontWeight:'700'}]}>{t.title}</Text>
  <Text style={label}>{org.activeStoreName}</Text><Text style={label}>{t.readonly}</Text>
  <CurrencyPickerAll title={t.title} value={prefs.displayCurrency} onChange={prefs.setDisplayCurrency}/><PreferredRateNote/>
  <TextInput accessibilityLabel={t.period} placeholder={t.period} value={entry} onChangeText={setEntry} style={{...label,padding:12,minHeight:44,fontSize:16,backgroundColor:UI.card}}/>
  <View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}><Pressable accessibilityRole="button" disabled={!actor||!/^\d{4}-\d{2}-\d{2}$/.test(entry)} onPress={()=>{selectedDays.set(JSON.stringify([actor,organization,store]),entry);setDay(entry);setOffset(0)}} style={button}><Text style={label}>{t.apply}</Text></Pressable><Pressable accessibilityRole="button" onPress={()=>{if(actor)selectedDays.set(JSON.stringify([actor,organization,store]),null);setDay(null);setEntry('');setOffset(0);setEpoch(e=>e+1)}} style={button}><Text style={label}>{t.today}</Text></Pressable><Pressable accessibilityRole="button" onPress={()=>setEpoch(e=>e+1)} style={button}><Text style={label}>{t.retry}</Text></Pressable></View>
  {!data?<Text accessibilityRole="alert" style={label}>{state.status==='denied'?t.denied:state.status==='error'?t.unavailable:t.loading}</Text>:<>
   <Text style={label}>{data.day} · {data.timezone} · {t.orders}: {data.orders}</Text>
   <View style={{flexDirection:'row',flexWrap:'wrap',gap:12}}>{[[t.sales,data.sales],[t.money,data.money_in],[t.expenses,data.expenses],[t.average,data.average]].map(([name,amount])=><View key={name} style={{padding:16,borderRadius:14,backgroundColor:UI.card,width:width<600?'100%':'47%',minWidth:0}}><Text style={label}>{name}</Text><Text style={[label,{fontSize:21,fontWeight:'700',flexShrink:1}]}>{money(amount)}</Text></View>)}</View>
   <Text style={label}>{t.gross}</Text><Text style={[label,{fontSize:18,fontWeight:'700'}]}>{t.history}</Text>
   {data.history.map(h=><View key={h.kind+h.id} style={{padding:12,backgroundColor:UI.card,gap:4}}><Text style={label}>{h.kind==='SALE'?t.sales:h.kind==='PAYMENT'?t.money:t.expenses} · {new Date(h.at).toLocaleString(prefs.language,{timeZone:data.timezone})}</Text><Text style={label}>{money(h.amount)}</Text></View>)}
   <View style={{flexDirection:'row',gap:12}}><Pressable accessibilityRole="button" disabled={offset===0} onPress={()=>setOffset(n=>Math.max(0,n-50))} style={button}><Text style={label}>{t.previous}</Text></Pressable><Pressable accessibilityRole="button" disabled={offset+50>=data.history_total} onPress={()=>setOffset(n=>n+50)} style={button}><Text style={label}>{t.next}</Text></Pressable></View>
  </>}
 </View>;
}
