import React,{useEffect,useRef,useState} from 'react';
import {View,Text,Pressable,ScrollView,ActivityIndicator} from 'react-native';
import {CashierProformaActions,type Context,type Intent} from '../../cashier-integration-local/ui/CashierProformaActions';
import {ProformaClient,invoiceRevision,type Detail,type PageRow,type Route,type Operation} from './client';
import {label,type Language} from './labels';
import {validateRevision,type ProformaRevision} from '../../../src/proforma/model';
/** Inactive integration surface. Host supplies canonical POS editor/payment UI,
 * trusted identity, and a scoped authenticated adapter. No parallel sale engine.
 * No application router, frozen file or Supabase connection is activated here.
 */
export function ProformaWorkspace({client,language,route,navigate,actorId,draftFromPOS,checkoutFromPOS,exportInvoice,newId}:{client:ProformaClient;language:Language;route:Route;navigate:(r:Route)=>void;actorId:string;draftFromPOS:(existing?:Detail)=>Promise<ProformaRevision>;checkoutFromPOS:(detail:Detail)=>Promise<Record<string,unknown>|null>;exportInvoice:(revision:ProformaRevision,language:Language)=>Promise<void>;newId:()=>string}){
 const [rows,setRows]=useState<PageRow[]>([]),[detail,setDetail]=useState<Detail|null>(null),[loading,setLoading]=useState(true),[failed,setFailed]=useState(false),[busy,setBusy]=useState(false),[reload,setReload]=useState(0),[cursor,setCursor]=useState<string|null>(null);
 const gate=useRef(false),scope=useRef(client),epoch=useRef(0),mounted=useRef(true),creation=useRef<{id:string;draft:ProformaRevision}|null>(null);
 const t=(n:number)=>label(language,n),docId=route.screen==='document'?route.id:null;
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false}},[]);
 useEffect(()=>{scope.current=client;epoch.current++;creation.current=null;setRows([]);setDetail(null)},[client]);
 useEffect(()=>{const a=new AbortController();setLoading(true);setFailed(false);setDetail(null);setRows([]);
  const request=docId?client.detail(docId,a.signal).then(d=>{if(!a.signal.aborted)setDetail(d)}):client.page(a.signal).then(p=>{if(!a.signal.aborted){setRows(p.rows);setCursor(p.nextBefore)}});
  void request.catch(()=>{if(!a.signal.aborted)setFailed(true)}).finally(()=>{if(!a.signal.aborted)setLoading(false)});return()=>a.abort();
 },[client,docId,reload]);
 async function perform(action:()=>Promise<void>,refresh=true){if(gate.current)return;gate.current=true;setBusy(true);setFailed(false);const at=epoch.current;
  try{await action();if(refresh&&mounted.current&&at===epoch.current)setReload(n=>n+1)}catch{if(mounted.current&&at===epoch.current)setFailed(true)}finally{gate.current=false;if(mounted.current)setBusy(false)}
 }
 async function save(){await perform(async()=>{if(!creation.current){const draft=await draftFromPOS(detail??undefined);validateRevision(draft);creation.current={id:detail?.document.id??newId(),draft}}const current=creation.current;await client.run(current.id,detail?.document.revision??null,'SAVE',current.draft as unknown as Record<string,unknown>);creation.current=null;if(scope.current===client)navigate({screen:'document',id:current.id})})}
 async function command(operation:Operation,body:Record<string,unknown>={}){if(!detail)return;const d=detail;await perform(async()=>{await client.run(d.document.id,d.document.revision,operation,body)})}
 async function intent(action:Intent){if(!detail)return;if(action==='HANDOFF')return command('HANDOFF');if(action==='CASHIER_ACCEPT')return command('CASHIER_ACCEPT');const d=detail;await perform(async()=>{const checkout=await checkoutFromPOS(d);if(checkout)await client.run(d.document.id,d.document.revision,'CONVERT',checkout)})}
 const button=(name:string,onPress:()=>void,disabled=false)=><Pressable key={name} accessibilityRole="button" accessibilityState={{disabled:busy||disabled,busy}} disabled={busy||disabled} onPress={onPress} style={{minHeight:48,padding:13,borderWidth:1,borderColor:'#bbc8da',borderRadius:8,opacity:disabled?.5:1}}><Text>{name}</Text></Pressable>;
 let context:Context|null=null;
 if(detail){const h=detail.handoff;context={...detail.context,handoff:h&&['PENDING','ACCEPTED','COMPLETED'].includes(h.status)?{status:h.status as 'PENDING'|'ACCEPTED'|'COMPLETED',assignedToCurrentCashier:h.cashierMembershipId===detail.context.membershipId}:undefined};}
 const terminal=detail&&['CANCELLED','EXPIRED','CONVERTED'].includes(detail.document.status);
 const canCancel=detail?.handoff?.status==='PENDING'&&(['owner','admin'].includes(detail.context.role)||(detail.context.role==='staff'&&detail.handoff.createdBy===actorId));
 const valid=detail&&Date.parse(detail.document.valid_until)>Date.now();
 return <ScrollView style={{direction:language==='ar'?'rtl':'ltr'}} contentContainerStyle={{padding:16,gap:12,maxWidth:1050,width:'100%',alignSelf:'center'}}>
  <Text accessibilityRole="header" style={{fontSize:24,fontWeight:'700'}}>{t(0)}</Text>
  <View style={{flexDirection:'row',flexWrap:'wrap',gap:10}}>{button(t(2),()=>navigate({screen:'list'}))}{button(t(1),()=>navigate({screen:'new'}))}</View>
  {loading?<ActivityIndicator accessibilityLabel={t(11)}/>:failed?<View accessibilityRole="alert"><Text>{t(8)}</Text>{button(t(7),()=>setReload(n=>n+1))}</View>:null}
  {route.screen==='new'?button(t(3),()=>void save()):!docId&&!loading?<View style={{gap:10}}>{rows.length===0?<Text>{t(9)}</Text>:rows.map(row=>button(row.reference+' · '+row.total+' '+row.currency,()=>navigate({screen:'document',id:row.id})))}{cursor&&button(t(7),()=>void perform(async()=>{const a=new AbortController();const p=await client.page(a.signal,cursor);if(scope.current===client){setRows(current=>[...current,...p.rows]);setCursor(p.nextBefore)}},false))}</View>:null}
  {detail&&<View style={{gap:12}}><Text>{String(detail.document.reference)} · {detail.document.currency}</Text><Text>{t(16)}: {detail.accountingCurrency??t(10)}</Text><Text>{t(12)}: {detail.revisions.map(r=>r.revision).join(', ')}</Text>
   {button(t(13),()=>void perform(async()=>exportInvoice(invoiceRevision(detail),language),false))}
   {!terminal&&<View style={{gap:10}}>{!valid&&<Text>{t(17)}</Text>}{!detail.handoff&&button(t(18),()=>void save(),!detail.accountingCurrency)}{!detail.handoff&&button(t(4),()=>void command('RESERVE',{hours:24}),!valid||!detail.accountingCurrency)}{button(t(5),()=>void command('RELEASE'))}{canCancel&&button(t(6),()=>void command('CANCEL'))}
    {context&&valid&&detail.accountingCurrency&&<CashierProformaActions language={language} context={context} onIntent={intent}/>}</View>}
   <Text>{t(15)}</Text></View>}
 </ScrollView>;
}
