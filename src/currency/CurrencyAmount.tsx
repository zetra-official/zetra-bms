import React,{useEffect,useState,useSyncExternalStore} from 'react';
import {View,Text,Pressable} from 'react-native';
import {useLanguage} from '../i18n/LanguageProvider';
import type {Language} from '../i18n/catalog';
import {presentMoney,formatExact,type RecordedMoney,type CurrencyView} from './engine';
import {referenceRateStore,type ReferenceRateStore} from './rateStore';
import {UI} from '../ui/theme';
const copy:Record<Language,readonly string[]>={
 en:['Original','Indicative display conversion','Conversion unavailable; original currency retained','Currency unverified; conversion blocked','Refresh reference rates','Loading reference rates…','Reference rates unavailable','Reference date'],
 sw:['Halisi','Ubadilishaji elekezi wa kuonyesha','Ubadilishaji haupatikani; sarafu halisi imehifadhiwa','Sarafu haijathibitishwa; ubadilishaji umezuiwa','Sasisha viwango elekezi','Inapakia viwango elekezi…','Viwango elekezi havipatikani','Tarehe ya kiwango'],
 fr:['Original','Conversion indicative d’affichage','Conversion indisponible ; devise d’origine conservée','Devise non vérifiée ; conversion bloquée','Actualiser les taux de référence','Chargement des taux de référence…','Taux de référence indisponibles','Date de référence'],
 pt:['Original','Conversão indicativa de apresentação','Conversão indisponível; moeda original mantida','Moeda não verificada; conversão bloqueada','Atualizar taxas de referência','A carregar taxas de referência…','Taxas de referência indisponíveis','Data de referência'],
 ar:['الأصل','تحويل عرض استرشادي','التحويل غير متاح؛ تم الاحتفاظ بالعملة الأصلية','العملة غير مؤكدة؛ التحويل محظور','تحديث الأسعار المرجعية','جارٍ تحميل الأسعار المرجعية…','الأسعار المرجعية غير متاحة','تاريخ السعر المرجعي'],
 es:['Original','Conversión indicativa de visualización','Conversión no disponible; se conserva la moneda original','Moneda no verificada; conversión bloqueada','Actualizar tipos de referencia','Cargando tipos de referencia…','Tipos de referencia no disponibles','Fecha de referencia'],
 zh:['原始金额','参考显示换算','无法换算；保留原始币种','币种未经确认；已阻止换算','刷新参考汇率','正在加载参考汇率…','参考汇率不可用','参考日期'],
};
export function CurrencyPresentation({view,language}:{view:CurrencyView;language:Language}){
 const t=copy[language],text=(amount:string,code:string|null)=>formatExact(amount,language)+(code?' '+code:'');
 const style={color:UI.text,textAlign:language==='ar'?'right' as const:'left' as const};
 return <View style={{direction:language==='ar'?'rtl':'ltr',gap:4,backgroundColor:UI.card,padding:10,borderRadius:8}}><Text style={style}>{text(view.displayAmount,view.displayCurrency)}</Text>
  {view.status==='CONVERTED'?<><Text style={style}>{t[0]}: {text(view.original.amount,view.original.currency)}</Text><Text style={style}>{t[1]} · {view.rate!.provider} · {t[7]}: {view.rate!.referenceDate}</Text></>:view.status==='RATE_UNAVAILABLE'?<Text style={style}>{t[2]}</Text>:view.status==='UNVERIFIED_CURRENCY'?<Text style={style}>{t[3]}</Text>:null}
 </View>;
}
/** Explicit record currency required: never infer historical units from KV.
 * The host supplies approved freshness policy, separate from user preference.
 */
export function CurrencyAmount({value,organizationId,maxReferenceAgeDays,store=referenceRateStore}:{value:RecordedMoney;organizationId:string;maxReferenceAgeDays:number;store?:ReferenceRateStore}){
 const {language,displayCurrency}=useLanguage(),state=useSyncExternalStore(store.subscribe,store.getSnapshot,store.getSnapshot),[now,setNow]=useState(()=>new Date());
 useEffect(()=>{const timer=setInterval(()=>setNow(new Date()),60000);return()=>clearInterval(timer)},[]);
 return <CurrencyPresentation language={language} view={presentMoney(value,displayCurrency,state.evidence,now,maxReferenceAgeDays,organizationId)}/>;
}
export function ExchangeRateStatus({store=referenceRateStore}:{store?:ReferenceRateStore}){
 const {language}=useLanguage(),state=useSyncExternalStore(store.subscribe,store.getSnapshot,store.getSnapshot),t=copy[language];
 return <View style={{gap:6,marginTop:10,direction:language==='ar'?'rtl':'ltr'}}><Pressable accessibilityRole="button" accessibilityState={{disabled:state.loading,busy:state.loading}} disabled={state.loading} onPress={()=>void store.refresh()} style={{minHeight:44,padding:10,borderWidth:1,borderColor:'#64748b',borderRadius:8}}><Text style={{color:'#94a3b8'}}>{state.loading?t[5]:t[4]}</Text></Pressable>{state.error&&<Text accessibilityRole="alert" style={{color:'#94a3b8'}}>{t[6]}</Text>}{state.evidence&&<Text style={{color:'#94a3b8'}}>{state.evidence.provider} · {t[7]}: {state.evidence.referenceDate}</Text>}</View>;
}
