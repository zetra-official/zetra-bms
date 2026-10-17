import React,{useEffect,useMemo,useState} from 'react';
import {View,Text} from 'react-native';
import {useRouter} from 'expo-router';
import {useLanguage} from '../i18n/LanguageProvider';
import {Button} from '../ui/Button';
import {supabase} from '../supabase/supabaseClient';
import {conversionService,conversionCheckoutParams,type ConversionPreview} from './conversion';
import {conversionText} from './conversionCopy';
import {displayDecimal} from './document';
export function ProformaConversionAction({organizationId,storeId,documentId,revision}:{organizationId:string;storeId:string;documentId:string;revision:number}){
 const router=useRouter(),{language}=useLanguage(),[preview,setPreview]=useState<ConversionPreview|null>(null),[review,setReview]=useState(false),[busy,setBusy]=useState(false),[failed,setFailed]=useState(false);
 const service=useMemo(()=>conversionService(supabase,organizationId,storeId),[organizationId,storeId]);
 useEffect(()=>{let live=true;setPreview(null);setReview(false);void service.preview(documentId).then(p=>{if(live)setPreview(p)}).catch(()=>{if(live)setFailed(true)});return()=>{live=false}},[service,documentId,revision]);
 function open(p:ConversionPreview){router.push({pathname:'/sales/checkout',params:conversionCheckoutParams(p)} as any)}
 async function begin(){if(busy)return;setBusy(true);setFailed(false);try{const p=await service.preview(documentId);setPreview(p);if(p.converted)return;if(p.changed)setReview(true);else open(p)}catch{setFailed(true)}finally{setBusy(false)}}
 if(preview?.converted&&preview.saleId)return <Button title={conversionText(language,'receipt')} onPress={()=>router.push({pathname:'/sales/receipt',params:{saleId:preview.saleId}} as any)}/>;
 return <View style={{gap:10}}><Button title={conversionText(language,'confirm')} disabled={!preview||busy} onPress={()=>void begin()}/>{(!preview||failed)&&<Text style={{color:'#92400e'}}>{conversionText(language,'blocked')}</Text>}{review&&preview?.quote&&<View style={{padding:14,gap:10,backgroundColor:'#FFF7ED',borderRadius:12}}><Text>{conversionText(language,'review')}</Text><Text>{displayDecimal(preview.originalTotal!,language)} → {displayDecimal(preview.quote.total,language)} {preview.quote.currency}</Text>{preview.quote.items.map(i=><Text key={i.product_id}>{i.name} · {displayDecimal(String(i.qty),language)} × {displayDecimal(String(i.unit_price),language)} {preview.quote!.currency}</Text>)}<Text>{preview.quote.customer?.name} {preview.quote.customer?.phone}</Text><Button title={conversionText(language,'continue')} onPress={()=>open(preview)}/><Button title={conversionText(language,'cancel')} variant="secondary" onPress={()=>setReview(false)}/></View>}</View>;
}
