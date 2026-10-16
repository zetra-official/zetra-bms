import type {Language} from './catalog';
import {translateCommon} from './commonMessages';
import type {FinancialOverviewResult} from '../components/home/business-financial-overview/financialDataEngine';
/** Sales-payment display metadata only; never use the returned label in an RPC. */
export function paymentMethodKey(value:string):string{
 if(value==='MOBILE'||value==='Mobile')return 'Mobile Money';
 if(value==='CREDIT')return 'Credit';
 if(value==='SPLIT')return 'Split';
 return value;
}
export type SearchPresentation={titleKey?:'Product'|'Customer';subtitleKey?:'Product'|'Customer record';category?:string;stock?:number|null;orders?:number};
export function localizedSearchResult(language:Language,result:{title:string;subtitle:string;meta?:string;presentation?:SearchPresentation}){
 const p=result.presentation;
 if(!p)return result;
 const title=p.titleKey?translateCommon(language,p.titleKey):result.title;
 const subtitle=p.subtitleKey?translateCommon(language,p.subtitleKey):result.subtitle;
 const meta=p.orders!==undefined?(p.orders>0?translateCommon(language,p.orders===1?'{p0} order':'{p0} orders',{p0:new Intl.NumberFormat(language).format(p.orders)}):undefined):[p.category,p.stock!==null&&p.stock!==undefined?translateCommon(language,'Stock: {p0}',{p0:String(p.stock)}):null].filter(Boolean).join(' · ')||undefined;
 return {...result,title,subtitle,meta};
}
/** Date-only presentation; original ranges, keys, metrics and ordering retained. */
export function localizedFinancialResult(language:Language,result:FinancialOverviewResult):FinancialOverviewResult{
 const locale=language==='en'?'en-GB':language;
 const date=(value:string)=>{const [y,m,d]=value.split('-').map(Number);return new Date(Date.UTC(y,m-1,d))};
 const format=(value:string,options:Intl.DateTimeFormatOptions)=>new Intl.DateTimeFormat(locale,{...options,timeZone:'UTC'}).format(date(value));
 return {...result,buckets:result.buckets.map(bucket=>({...bucket,label:/^\d{4}-\d{2}$/.test(bucket.key)?format(bucket.fromYMD,{month:'long',year:'numeric'}):format(bucket.fromYMD,{day:'numeric',month:'short'})+' - '+format(bucket.toYMD,{day:'numeric',month:'short'}),shortLabel:format(/^\d{4}-\d{2}$/.test(bucket.key)?bucket.fromYMD:bucket.toYMD,/^\d{4}-\d{2}$/.test(bucket.key)?{month:'short'}:{day:'numeric'})}))};
}
// Only complete, reviewed assistant alert templates. Never parse arbitrary names,
// prompts, saved business prose, model replies, amounts or technical identifiers.
const ownedTemplates=[
 '{p0} task(s) zimechelewa.','{p0} task(s) zinahitaji kufuatiliwa leo.',
 '{p0} bidhaa zinahitaji uangalizi wa stock.','{p0} bidhaa zina cash iliyokwama.',
 '{p0} bidhaa zinaonekana kuwa low stock.','{p0} bidhaa zina mwendo mdogo au hazijauza.',
 'Margin ya sasa iko {p0}%.','Expenses za snapshot hii ni {p0}.',
];
const ownedAlertTitles=new Set(['Overdue Tasks','Due Today','Restock Risk','Dead Stock Attention','Low Stock Detected','Slow / Dead Stock','Low Margin','Expenses Included','Declining Trend','Increasing Trend']);
const ownedAlertMessages=new Set(['Forecast inaonyesha trend ya kushuka.','Forecast inaonyesha trend ya kupanda.']);
export function translateOwnedAlertTitle(language:Language,value:string):string{
 return ownedAlertTitles.has(value)?translateCommon(language,value):value;
}
export function translateOwnedAlert(language:Language,value:string):string{
 for(const template of ownedTemplates){const escaped=template.split('{p0}').map(part=>part.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'));const match=new RegExp('^'+escaped[0]+'([+-]?(?:[0-9]+|[0-9]{1,3}(?:,[0-9]{3})+)(?:\\.[0-9]+)?)'+escaped[1]+'$').exec(value);if(match)return translateCommon(language,template,{p0:match[1]})}
 return ownedAlertMessages.has(value)?translateCommon(language,value):value;
}
