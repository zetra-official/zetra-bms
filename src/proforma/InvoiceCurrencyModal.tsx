import React,{useEffect,useRef,useState} from 'react';
import {Modal,View,Text,TextInput,Pressable,ScrollView} from 'react-native';
import {useLanguage} from '../i18n/LanguageProvider';
import {CurrencyPickerAll} from '../components/CurrencyPickerAll';
import {Button} from '../ui/Button';
import {makeId} from '../offline/salesQueue';
import {currencyUx} from './currencyUxCopy';
import {normalText} from './normalCopy';
import {PROFORMA_INVOICE_FX_READY,previewInvoiceFx,type InvoiceFxInput} from './invoiceFx';
import {invoiceFxText} from './invoiceFxCopy';
export function InvoiceCurrencyModal({visible,onClose,from,total,canConfirm,onConfirm}:{visible:boolean;onClose:()=>void;from:string;total:string;canConfirm:boolean;onConfirm:(body:InvoiceFxInput,request:string)=>Promise<void>}){
 const {language}=useLanguage(),[currency,setCurrency]=useState<string|null>(null),[rate,setRate]=useState(''),[source,setSource]=useState(''),[ack,setAck]=useState(false),[busy,setBusy]=useState(false),[failed,setFailed]=useState(false),[uncertain,setUncertain]=useState(false),gate=useRef(false),pending=useRef<{body:InvoiceFxInput;id:string}|null>(null);
 useEffect(()=>{if(visible){setCurrency(null);setRate('');setSource('');setAck(false);setFailed(false);setUncertain(false);pending.current=null}},[visible]);
 const body={currency:currency??'',rate,source,acknowledged:ack};let preview:string|null=null;try{preview=previewInvoiceFx(total,from,body).amount}catch{}
 async function confirm(){if(gate.current||!canConfirm||!PROFORMA_INVOICE_FX_READY||!ack||!preview)return;gate.current=true;setBusy(true);setFailed(false);pending.current??={body,id:makeId()};try{await onConfirm(pending.current.body,pending.current.id);pending.current=null;setUncertain(false);onClose()}catch(e){setFailed(true);const definitive=(e as {definitive?:boolean})?.definitive===true;setUncertain(!definitive);if(definitive)pending.current=null}finally{gate.current=false;setBusy(false)}}
 const input=(label:string,value:string,set:(v:string)=>void)=><View style={{gap:5}}><Text style={{color:'#334155',fontWeight:'700'}}>{label}</Text><TextInput accessibilityLabel={label} value={value} editable={!busy&&!uncertain} onChangeText={set} style={{backgroundColor:'#fff',borderWidth:1,borderColor:'#94A3B8',padding:12,borderRadius:12,color:'#0F172A',minHeight:48}}/></View>;
 return <Modal visible={visible} transparent animationType="slide" onRequestClose={()=>{if(!busy&&!uncertain)onClose()}}><View style={{flex:1,backgroundColor:'rgba(0,0,0,0.5)',justifyContent:'center',padding:16}}><ScrollView accessibilityViewIsModal style={{maxHeight:'90%',maxWidth:520,width:'100%',alignSelf:'center',backgroundColor:'#F8FAFC',borderRadius:18}} contentContainerStyle={{padding:18,gap:14,direction:language==='ar'?'rtl':'ltr'}}>
 <Text style={{fontSize:21,fontWeight:'800',color:'#0F172A'}}>{currencyUx(language,'convert')}</Text><Text style={{color:'#475569',lineHeight:21}}>{invoiceFxText(language,'manual')}</Text>
 <Text style={{color:'#0F172A',fontWeight:'700'}}>{total} {from}</Text><View style={{backgroundColor:'#07131C',borderRadius:18}}><CurrencyPickerAll value={currency} onChange={v=>{setCurrency(v);setAck(false)}} disabled={busy||uncertain} title={currencyUx(language,'convert')}/></View>
 {input(invoiceFxText(language,'rate'),rate,v=>{setRate(v);setAck(false)})}<Text style={{color:'#475569'}}>1 {from} = {rate||'—'} {currency??'—'}</Text>{input(invoiceFxText(language,'source'),source,v=>{setSource(v);setAck(false)})}
 <Text style={{color:'#0F172A',fontWeight:'800'}}>{invoiceFxText(language,'preview')}: {preview??'—'} {currency??''}</Text>
 <Pressable accessibilityRole="checkbox" accessibilityState={{checked:ack}} disabled={busy||uncertain} onPress={()=>setAck(!ack)} style={{minHeight:48,paddingVertical:10}}><Text style={{color:'#334155',lineHeight:21}}>{ack?'☑':'☐'} {invoiceFxText(language,'ack')}</Text></Pressable>
 {!canConfirm?<Text style={{color:'#92400E'}}>{invoiceFxText(language,'ownerDraft')}</Text>:!PROFORMA_INVOICE_FX_READY?<Text style={{color:'#92400E'}}>{currencyUx(language,'blocked')}</Text>:null}{failed&&<Text accessibilityRole="alert" style={{color:'#A52B36'}}>{normalText(language,uncertain?'retry':'failed')}</Text>}
 <Button title={invoiceFxText(language,uncertain?'retry':'confirm')} disabled={busy||!canConfirm||!PROFORMA_INVOICE_FX_READY||!preview||!ack} onPress={()=>void confirm()}/><Button title={currencyUx(language,'close')} variant="secondary" disabled={busy||uncertain} onPress={onClose}/>
 </ScrollView></View></Modal>
}
