import React,{useState} from 'react';
import {View,Text,Pressable,TextInput,ScrollView} from 'react-native';
import {useLanguage} from '../../integration-2026-10-14/src/i18n/LanguageProvider';
import {formatExact} from '../../integration-2026-10-14/src/currency/engine';
import {price,parseOrderDiscount,type Line,type Context,type Adjustment} from './pricing';
import {text,type Key} from './messages';
export type DisplayLine=Line&{name:string;sku:string;sellingUnit:string};
/** Replacement Order Summary body for isolated checkout composition. No sale
 * writer, URL or activation capability. Product/user data is rendered verbatim. */
export function PricingSummary({lines,context,onChange,onOrderDiscountChange,onNoteChange,editable=false}:{lines:readonly DisplayLine[];context:Context;onChange:(lines:readonly DisplayLine[])=>void;onOrderDiscountChange:(raw:string)=>void;onNoteChange:(note:string)=>void;editable?:boolean}){
 const {language}=useLanguage(),t=(k:Key)=>text(language,k),[editing,setEditing]=useState<string|null>(null),[direction,setDirection]=useState<Adjustment['direction']>('INCREASE'),[mode,setMode]=useState<Adjustment['mode']>('FIXED'),[scope,setScope]=useState<Adjustment['scope']>('UNIT'),[value,setValue]=useState(''),[order,setOrder]=useState(''),[note,setNote]=useState(''),[invalid,setInvalid]=useState(false);
 const money=(v:string)=>`${formatExact(v,language)} ${context.currency}`;
 let quote:ReturnType<typeof price>|null=null;try{quote=price(lines,parseOrderDiscount(order),context)}catch{}
 let draft:ReturnType<typeof price>|null=null;if(editing)try{draft=price(lines.map(l=>l.id===editing?{...l,adjustment:{direction,mode,scope,value}}:l),parseOrderDiscount(order),context)}catch{}
 const button=(label:Key,fn:()=>void,disabled=false,selected=false)=><Pressable accessibilityRole="button" accessibilityState={{disabled,selected}} disabled={disabled} onPress={fn} style={{minHeight:44,padding:10,borderWidth:1,borderColor:selected?'#2563eb':'#94a3b8',borderRadius:8,justifyContent:'center',opacity:disabled?.5:1}}><Text>{t(label)}</Text></Pressable>;
 const edit=(l:DisplayLine)=>{const a=l.adjustment;setEditing(l.id);setDirection(a?.direction||'INCREASE');setMode(a?.mode||'FIXED');setScope(a?.scope||'UNIT');setValue(a?.value||'');setInvalid(false)};
 const orderMode=(next:'FIXED'|'PERCENT')=>{try{const parsed=parseOrderDiscount(order);const raw=(parsed?.value||'0')+(next==='PERCENT'?'%':'');setOrder(raw);onOrderDiscountChange(raw)}catch{setInvalid(true)}};
 const apply=()=>{try{const next=lines.map(l=>l.id===editing?{...l,adjustment:{direction,mode,scope,value}}:l);price(next,parseOrderDiscount(order),context);onChange(next);setEditing(null);setInvalid(false)}catch{setInvalid(true)}};
 return <ScrollView testID="pricing-summary" keyboardShouldPersistTaps="handled" contentContainerStyle={{padding:16,gap:12,direction:language==='ar'?'rtl':'ltr',maxWidth:1000,width:'100%',alignSelf:'center'}}>
 <Text accessibilityRole="header" style={{fontSize:22,fontWeight:'700'}}>{t('summary')}</Text><Text accessibilityRole="alert">{t('blocked')}</Text>
 {lines.map(l=>{const r=quote?.lines.find(r=>r.id===l.id);return <View key={l.id} style={{padding:12,gap:8,borderColor:'#cbd5e1',borderWidth:1,borderRadius:10,minWidth:0}}>
  <Text style={{fontWeight:'700'}}>{l.name}</Text><Text>{l.sku}</Text><Text>{t('quantity')}: {l.quantity} · {t('unit')}: {l.sellingUnit}</Text><Text>{t('originalUnit')}: {money(l.unitPrice)}</Text>
  {r&&<><Text>{t('originalSubtotal')}: {money(r.originalSubtotal)}</Text>{l.adjustment&&<><Text>{t(l.adjustment.direction==='INCREASE'?'increase':'decrease')}: {money(l.adjustment.direction==='INCREASE'?r.itemMarkup:r.itemDiscount)}</Text><Text>{t('adjustedUnit')}: {r.adjustedUnitPrice===null?t('lineOnly'):money(r.adjustedUnitPrice)}</Text><Text>{t('adjustedSubtotal')}: {money(r.adjustedSubtotal)}</Text></>}</>}
  {button('adjust',()=>edit(l),!editable||!l.eligible)}
  {editing===l.id&&<View style={{gap:8}}><View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>{button('increase',()=>setDirection('INCREASE'),false,direction==='INCREASE')}{button('decrease',()=>setDirection('DECREASE'),false,direction==='DECREASE')}{button('fixed',()=>setMode('FIXED'),false,mode==='FIXED')}{button('percent',()=>setMode('PERCENT'),false,mode==='PERCENT')}{button('unitScope',()=>setScope('UNIT'),false,scope==='UNIT')}{button('lineScope',()=>setScope('LINE'),false,scope==='LINE')}</View>
  <Text>{t(mode==='PERCENT'?'percentHelp':scope==='UNIT'?'unitHelp':'lineHelp')}</Text><TextInput accessibilityLabel={t('value')} keyboardType="decimal-pad" value={value} onChangeText={setValue} style={{borderWidth:1,borderColor:'#94a3b8',padding:10,minHeight:44,textAlign:language==='ar'?'right':'left'}}/>
  {draft?<Text>{t('adjustedSubtotal')}: {money(draft.lines.find(x=>x.id===l.id)!.adjustedSubtotal)}</Text>:<Text accessibilityRole="alert">{t('invalid')}</Text>}
  <View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>{button('apply',apply,!editable)}{button('remove',()=>{onChange(lines.map(x=>x.id===l.id?{...x,adjustment:undefined}:x));setEditing(null)},!editable)}{button('cancel',()=>setEditing(null))}</View></View>}
 </View>})}
 <Text accessibilityRole="header" style={{fontSize:18,fontWeight:'700'}}>{t('orderDiscount')}</Text><View style={{flexDirection:'row',gap:8,flexWrap:'wrap'}}>{button('fixed',()=>orderMode('FIXED'),!editable,!order.endsWith('%'))}{button('percent',()=>orderMode('PERCENT'),!editable,order.endsWith('%'))}</View><TextInput accessibilityLabel={t('orderDiscount')} value={order} onChangeText={v=>{setOrder(v);onOrderDiscountChange(v)}} editable={editable} style={{borderWidth:1,padding:10,minHeight:44,textAlign:language==='ar'?'right':'left'}}/><Text>{t('orderHelp')}</Text>{button('reset',()=>{setOrder('');onOrderDiscountChange('')},!editable)}
 <Text>{t('note')}</Text><TextInput accessibilityLabel={t('note')} value={note} onChangeText={v=>{setNote(v);onNoteChange(v)}} multiline style={{borderWidth:1,padding:10,minHeight:60,textAlign:language==='ar'?'right':'left'}}/>
 {(invalid||!quote)&&<Text accessibilityRole="alert">{t('invalid')}</Text>}
 {quote&&<View style={{gap:8}}>{(['originalSubtotal','itemMarkups','itemDiscounts','adjustedSubtotal','orderDiscount','finalTotal'] as const).map(k=><Text key={k} style={{fontWeight:k==='finalTotal'?'700':'400'}}>{t(k)}: {money(quote!.totals[k])}</Text>)}<Text>{t('noTax')}</Text></View>}
 </ScrollView>;
}
