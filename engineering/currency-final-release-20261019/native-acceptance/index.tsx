import 'react-native-url-polyfill/auto';
import React,{useState,useEffect} from 'react';
import {Platform,SafeAreaView,StatusBar,ScrollView,Text,TextInput,View} from 'react-native';
import {registerRootComponent} from 'expo';
import {File} from 'expo-file-system';
import * as Print from 'expo-print';
import * as SplashScreen from 'expo-splash-screen';
import {makeId} from '../../../src/offline/salesQueue';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {createClient} from '@supabase/supabase-js';
import {OriginalRefundForm} from '../../../src/currency/OriginalRefundForm';
import {FieldCustodyForm} from '../../../src/currency/FieldCustodyForm';
import {Button} from '../../../src/ui/Button';
import {readConfirmedRefund} from '../../../src/currency/originalWorkflow';
import {originalRefundReceiptHtml} from '../../../src/currency/originalRefundReceipt';

const actor='bb2d6dee-773d-4fa7-8fda-1eb85bbad2cd';
const url=process.env.EXPO_PUBLIC_SUPABASE_URL!;
const key=process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;
if(url!=='https://dcmhqdckzhbuakvcyjit.supabase.co')throw Error('AUTH_TARGET_MISMATCH');
const auth=createClient(url,key,{auth:{storage:AsyncStorage,storageKey:'zetra-native-local-financial-acceptance',persistSession:true,detectSessionInUrl:false}});
const origin='http://127.0.0.1:55625';
type Scene={currency:string;organizationId:string;storeId:string;saleId:string;custody:{organizationId:string;storeId:string}};
async function request(route:string,body:unknown={}){
 const {data}=await auth.auth.getSession();if(!data.session)throw Error('PRIVATE_SIGN_IN_REQUIRED');
 const response=await fetch(origin+route,{method:'POST',headers:{Origin:origin,Authorization:'Bearer '+data.session.access_token,'Content-Type':'application/json'},body:JSON.stringify(body)});
 const value=await response.json();if(!response.ok)throw Error(value.error??'LOCAL_ACCEPTANCE_UNAVAILABLE');return value;
}
const port={rpc:(name:string,args:Record<string,unknown>)=>{
 if(!['get_original_refund_sale_v1','get_bound_financial_result_v1','get_bound_field_custody_v1'].includes(name))throw Error('OWNER_FREEZE_NO_NEW_FINANCIAL_POSTINGS');
 return request('/rpc',{name,args});
}};
async function savePdf(uri:string,receipt:Record<string,unknown>){
 const base64=await new File(uri).base64();
 return request('/native-pdf-evidence',{refundId:receipt.refundId,currency:receipt.currency,base64});
}
function App(){
 const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[state,setState]=useState('Local synthetic finance only. Sign in privately.'),[scenes,setScenes]=useState<Scene[]>([]),[selected,setSelected]=useState(0),[flow,setFlow]=useState('refund'),[busy,setBusy]=useState(false);
 const [ownerVerified,setOwnerVerified]=useState(false);
 const connect=async()=>{setBusy(true);try{const {data,error}=await auth.auth.getUser();if(error||data.user?.id!==actor)throw Error('APPROVED_OWNER_REQUIRED');setOwnerVerified(true);const v=await request('/scenarios');setScenes(v.scenarios.map((s:Scene)=>({...s,custody:v.custodyScenarios.find((c:Scene)=>c.currency===s.currency)})));setState('GENUINE AUTH VERIFIED · '+Platform.OS+' · disposable local database. No Production financial writes.')}catch(e){setState(e instanceof Error?e.message:'LOCAL_UNAVAILABLE')}finally{setBusy(false)}};
 const login=async()=>{setBusy(true);const secret=password;setPassword('');try{const {error}=await auth.auth.signInWithPassword({email,password:secret});if(error)throw error;await connect()}catch(e){setState(e instanceof Error?e.message:'SIGN_IN_FAILED')}finally{setBusy(false)}};
 useEffect(()=>{void SplashScreen.hideAsync();void connect()},[]);
 const s=scenes[selected];
 const reprintAll=async()=>{setBusy(true);try{
  if(scenes.length!==8)throw Error('EIGHT_VERIFIED_SCENARIOS_REQUIRED');
  for(const scene of scenes){
   const receipt=await readConfirmedRefund(port,AsyncStorage,{actorId:actor,organizationId:scene.organizationId,storeId:scene.storeId,saleId:scene.saleId});
   if(!receipt||receipt.currency!==scene.currency)throw Error('CONFIRMED_ORIGINAL_RECEIPT_REQUIRED');
   const file=await Print.printToFileAsync({html:originalRefundReceiptHtml(receipt,'en')});
   await savePdf(file.uri,receipt);
   setState('Native verified reprint saved: '+scene.currency+'; no financial posting.');
  }
  setState('NATIVE VERIFIED REPRINTS COMPLETE: 8 currencies. Canonical original receipts only; no financial posting or external sharing.');
 }catch(e){setState(e instanceof Error?e.message:'REPRINT_UNAVAILABLE')}finally{setBusy(false)}};
 return <SafeAreaView style={{flex:1,backgroundColor:'#f1f5f9',paddingTop:Platform.OS==='android'?StatusBar.currentHeight??0:0}}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{padding:20,paddingBottom:100,gap:12}}><Text style={{fontSize:24,fontWeight:'800'}}>ZETRA · Native local acceptance</Text><Text>{state}</Text><Text>Actual source forms and native Expo Print/Sharing. Synthetic original-tax documents. This does not certify a Production tax provider or deployed product navigation.</Text>{!s&&ownerVerified?<Button title="Retry local connection" onPress={()=>void connect()} disabled={busy}/>:!s?<><TextInput accessibilityLabel="Owner email" placeholder="Owner email" autoCapitalize="none" keyboardType="email-address" autoComplete="email" value={email} onChangeText={setEmail}/><TextInput accessibilityLabel="Password" placeholder="Password" secureTextEntry autoComplete="current-password" value={password} onChangeText={setPassword}/><Button title="Sign in privately" onPress={()=>void login()} disabled={busy}/><Button title="Resume private session" onPress={()=>void connect()} disabled={busy}/></>:<><Button title="Reprint verified receipts" onPress={()=>void reprintAll()} disabled={busy}/><View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>{scenes.map((v,i)=><Button key={v.currency} title={v.currency} onPress={()=>setSelected(i)} variant={selected===i?'primary':'secondary'}/>)}</View><Button title="Original refund" onPress={()=>setFlow('refund')}/><Button title="Field custody" onPress={()=>setFlow('custody')}/>{flow==='refund'?<OriginalRefundForm key={s.saleId} port={port} storage={AsyncStorage} actorId={actor} organizationId={s.organizationId} storeId={s.storeId} saleId={s.saleId} shiftId={null} language="en" makeRequestId={makeId} onPdfGenerated={async(uri,receipt)=>{const base64=await new File(uri).base64();const result=await request('/native-pdf-evidence',{refundId:receipt.refundId,currency:receipt.currency,base64});setState('Native PDF generated and saved locally · '+result.sha256)}}/>:<FieldCustodyForm key={s.custody.storeId} port={port} storage={AsyncStorage} actorId={actor} organizationId={s.custody.organizationId} storeId={s.custody.storeId} shiftId={null} language="en" makeRequestId={makeId}/>}</>}</ScrollView></SafeAreaView>;
}
registerRootComponent(App);
