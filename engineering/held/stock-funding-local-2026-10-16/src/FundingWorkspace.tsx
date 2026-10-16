import React,{useState} from 'react';
import {View,Text,TextInput,Pressable} from 'react-native';
import {useLanguage} from '../../integration-2026-10-14/src/i18n/LanguageProvider';
import {CurrencyAmount} from '../../integration-2026-10-14/src/currency/CurrencyAmount';
import {text,errorKey,type FundingKey} from './messages';
import {recordMoney,type FundingRecord,type Action} from './contracts';
type Props={records:readonly FundingRecord[];accountingCurrency:string|null;online:boolean;maxReferenceAgeDays:number;integrationVerified?:boolean;busy?:boolean;errorCode?:string;onCommand:(action:Action,fields:Readonly<Record<string,string>>)=>void};
export function FundingWorkspace({records,accountingCurrency,online,maxReferenceAgeDays,integrationVerified=false,busy=false,errorCode,onCommand}:Props){
 const {language}=useLanguage(),t=(key:FundingKey)=>text(language,key),[form,setForm]=useState<Record<string,string>>({});
 const field=(key:FundingKey)=> <View key={key} style={{gap:4,minWidth:0}}><Text>{t(key)}</Text><TextInput accessibilityLabel={t(key)} value={form[key]||''} onChangeText={v=>setForm(s=>({...s,[key]:v}))} style={{borderColor:'#64748b',borderWidth:1,borderRadius:8,padding:10,minHeight:44,textAlign:language==='ar'?'right':'left'}}/></View>;
 const action=(key:FundingKey,op:Action,id?:string)=> <Pressable key={op} accessibilityRole="button" accessibilityState={{disabled:!online||!integrationVerified||busy||!accountingCurrency}} disabled={!online||!integrationVerified||busy||!accountingCurrency} onPress={()=>onCommand(op,Object.freeze({...form,...(id?{advanceId:id}:{})}))} style={{minHeight:44,padding:12,borderRadius:8,backgroundColor:integrationVerified?'#dbeafe':'#e2e8f0',justifyContent:'center'}}><Text>{t(key)}</Text></Pressable>;
 return <View testID="funding-workspace" style={{padding:16,gap:14,direction:language==='ar'?'rtl':'ltr',maxWidth:1100,width:'100%',alignSelf:'center'}}>
 <Text accessibilityRole="header" style={{fontSize:24,fontWeight:'700'}}>{t('title')}</Text><Text>{t('notExpense')}</Text>
 <Text>{t('accountingCurrency')}: {accountingCurrency||t('currencyUnconfirmed')}</Text><Text>{t('sameCurrency')}</Text>
 {!integrationVerified&&<Text accessibilityRole="alert">{t('integrationBlocked')}</Text>}{!online&&<Text accessibilityRole="alert">{t('offline')}</Text>}{errorCode&&<Text accessibilityRole="alert">{t(errorKey(errorCode))}</Text>}
 <View style={{gap:10}}>{(['store','source','responsible','amount','transactionCurrency','purpose','date','expected','supplier','reference'] as FundingKey[]).map(field)}{action('issue','CREATE')}</View>
 <Text accessibilityRole="header" style={{fontSize:20}}>{t('outstanding')}</Text>{records.length===0&&<Text>{t('empty')}</Text>}
 {records.map(record=><View key={record.id} style={{borderWidth:1,borderColor:'#cbd5e1',borderRadius:12,padding:12,gap:8}}>
 <Text>{t(record.status)}</Text><Text>{record.purpose}</Text><Text>{t('responsible')}: {record.responsibleName}</Text><Text>{t('source')}: {record.sourceName}</Text>
 {(['issued','spent','returned','outstanding'] as const).map((key,i)=><View key={key}><Text>{t(key)}</Text><CurrencyAmount organizationId={record.organizationId} value={recordMoney(record,[record.amount,record.spent,record.returned,record.outstanding][i])} maxReferenceAgeDays={maxReferenceAgeDays}/></View>)}
 <View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>{record.status==='DRAFT'&&action('approve','APPROVE',record.id)}{record.status==='APPROVED'&&action('fund','FUND',record.id)}{['DRAFT','APPROVED'].includes(record.status)&&action('cancel','CANCEL',record.id)}{['FUNDED','PARTIALLY_RECONCILED'].includes(record.status)&&<>{action('goods','RECEIPT',record.id)}{action('return','RETURN',record.id)}</>}{record.status==='FUNDED'&&action('reverse','REVERSE',record.id)}</View>
 {['FUNDED','PARTIALLY_RECONCILED'].includes(record.status)&&<View style={{gap:8}}>{field('receipt')}{field('destination')}{field('reason')}</View>}
 </View>)}
 </View>;
}
