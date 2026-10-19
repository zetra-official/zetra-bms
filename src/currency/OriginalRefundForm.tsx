import React,{useEffect,useRef,useState} from 'react';
import {View,Text,TextInput,Switch,ActivityIndicator} from 'react-native';
import {Button} from '../ui/Button';
import {shareFinancialPdf} from './shareFinancialPdf';
import {originalRefundReceiptHtml} from './originalRefundReceipt';
import {formatCurrencyExact,subtractExact} from './engine';
import {OriginalRefundRejected,originalRefundRequest,readPendingRefund,readConfirmedRefund,submitOriginalRefund,type FinancialPort,type PendingStore,type OriginalRefundIntent} from './originalWorkflow';
type Props={port:FinancialPort;storage:PendingStore;actorId:string;organizationId:string;storeId:string;saleId:string;shiftId:string|null;language:string;makeRequestId:()=>string;onPosted?:(receipt:Record<string,unknown>)=>void;onPdfGenerated?:(uri:string,receipt:Record<string,unknown>)=>Promise<void>};
type Line={id:string;name:string;originalQuantity:string;refundedQuantity:string};
const words={en:['Original sale refund','Quantity','Sellable returned goods','Refund reference','Refund original payment','Retry saved refund','Refund recorded','Original evidence is unavailable; this sale cannot be refunded.'],sw:['Refund ya mauzo halisi','Idadi','Bidhaa iliyorejeshwa inaweza kuuzwa','Rejea ya refund','Rudisha malipo halisi','Jaribu tena refund iliyohifadhiwa','Refund imerekodiwa','Ushahidi halisi haupo; mauzo haya hayawezi kufanyiwa refund.'],fr:['Remboursement original','Quantité','Articles retournés revendables','Référence','Rembourser le paiement original','Réessayer','Remboursement enregistré','Preuve originale indisponible.'],pt:['Reembolso original','Quantidade','Devoluções vendáveis','Referência','Reembolsar pagamento original','Tentar novamente','Reembolso registado','Prova original indisponível.'],ar:['استرداد البيع الأصلي','الكمية','بضاعة مرتجعة صالحة للبيع','مرجع الاسترداد','استرداد الدفعة الأصلية','إعادة المحاولة','تم تسجيل الاسترداد','الدليل الأصلي غير متاح.'],es:['Reembolso original','Cantidad','Devoluciones vendibles','Referencia','Reembolsar pago original','Reintentar','Reembolso registrado','Evidencia original no disponible.'],zh:['原始销售退款','数量','可再次销售的退货','退款参考','退回原始付款','重试已保存的退款','退款已记录','原始凭证不可用。']};
export function OriginalRefundForm(p:Props){
 const t=words[p.language as keyof typeof words]??words.en;
 const [lines,setLines]=useState<Line[]>([]),[currency,setCurrency]=useState(''),[line,setLine]=useState(''),[quantity,setQuantity]=useState('1'),[sellable,setSellable]=useState(false),[reference,setReference]=useState(''),[pending,setPending]=useState<OriginalRefundIntent|null>(null),[busy,setBusy]=useState(true),[message,setMessage]=useState(''),[eligible,setEligible]=useState(false);const epoch=useRef(0);
 const [posted,setPosted]=useState<Record<string,unknown>|null>(null),[sharing,setSharing]=useState(false);
 const scope=[p.actorId,p.organizationId,p.storeId,p.saleId].join(':');
 const load=async(id:number)=>{const saved=await readPendingRefund(p.storage,p);const {data,error}=await p.port.rpc('get_original_refund_sale_v1',{p_store_id:p.storeId,p_sale_id:p.saleId});if(error)throw error;
  if(id!==epoch.current)return;const d=data as {organizationId?:string;storeId?:string;currency?:string;eligible?:boolean;lines?:Line[]};
  if(d.eligible&&(d.organizationId!==p.organizationId||d.storeId!==p.storeId||!Array.isArray(d.lines)||typeof d.currency!=='string'))throw Error('ORIGINAL_REFUND_SCOPE_MISMATCH');
  const confirmed=saved?null:await readConfirmedRefund(p.port,p.storage,p);if(id!==epoch.current)return;if(confirmed)setPosted(confirmed);
  setPending(saved);setEligible(d.eligible===true);setLines(d.lines??[]);setCurrency(d.currency??'');setLine(saved?.lineId??d.lines?.[0]?.id??'');if(saved){setQuantity(saved.quantity);setSellable(saved.sellable);setReference(saved.reference)};
 };
 useEffect(()=>{const id=++epoch.current;setBusy(true);setLines([]);setEligible(false);setPending(null);setPosted(null);setMessage('');void load(id).catch(e=>{if(id===epoch.current)setMessage(e.message??String(e))}).finally(()=>{if(id===epoch.current)setBusy(false)});return()=>{epoch.current++}},[scope]);
 const submit=async()=>{const id=epoch.current;setBusy(true);setMessage('');const intent=pending??{actorId:p.actorId,organizationId:p.organizationId,storeId:p.storeId,saleId:p.saleId,lineId:line,requestId:p.makeRequestId(),quantity,sellable,shiftId:p.shiftId,reference};
  try{originalRefundRequest(intent);setPending(intent);const r=await submitOriginalRefund(p.port,p.storage,intent);if(id!==epoch.current)return;setPending(null);setPosted(r);setMessage(t[6]+' · '+formatCurrencyExact(String(r.amount),String(r.currency),p.language));try{await load(id)}catch{if(id===epoch.current)setMessage(t[6]+' · '+formatCurrencyExact(String(r.amount),String(r.currency),p.language)+' · '+(p.language==='sw'?'Pakua taarifa tena.':'Refresh details again.'))}p.onPosted?.(r)}catch(e){if(id===epoch.current){if(e instanceof OriginalRefundRejected)setPending(null);setMessage(p.language==='sw'?'Refund haijathibitishwa. Hakiki idadi, ushahidi wa mauzo na salio la akaunti; jaribu tena.':'Refund was not confirmed. Check the quantity, original evidence and account balance, then retry.')}}finally{if(id===epoch.current)setBusy(false)};
 };
 const locked=busy||pending!==null;
 const share=async()=>{if(!posted||sharing)return;const id=epoch.current;setSharing(true);try{await shareFinancialPdf(originalRefundReceiptHtml(posted,p.language),t[0],p.onPdfGenerated?uri=>p.onPdfGenerated!(uri,posted):undefined)}catch{if(id===epoch.current)setMessage(p.language==='sw'?'Risiti haikufunguka. Jaribu tena.':'The receipt could not be opened. Try again.')}finally{if(id===epoch.current)setSharing(false)}};
 return <View style={{padding:16,gap:12,direction:p.language==='ar'?'rtl':'ltr'}}>
  <Text style={{fontSize:22,fontWeight:'800'}}>{t[0]}</Text>
  {busy&&<ActivityIndicator/>}
  {!busy&&!eligible&&<Text>{t[7]}</Text>}
  {lines.map(x=><Button key={x.id} title={x.name+' · '+subtractExact(x.originalQuantity,x.refundedQuantity)} variant={line===x.id?'primary':'secondary'} onPress={()=>setLine(x.id)} disabled={locked}/>)}
  {eligible&&<>
   <Text>{t[1]}</Text>
   <TextInput accessibilityLabel={t[1]} value={quantity} onChangeText={setQuantity} editable={!locked} keyboardType="decimal-pad" style={{borderWidth:1,borderColor:'#94a3b8',padding:12}}/>
   <View style={{flexDirection:'row',alignItems:'center',gap:10}}><Switch accessibilityLabel={t[2]} value={sellable} onValueChange={setSellable} disabled={locked}/><Text>{t[2]}</Text></View>
   <TextInput accessibilityLabel={t[3]} placeholder={t[3]} value={reference} onChangeText={setReference} editable={!locked} style={{borderWidth:1,borderColor:'#94a3b8',padding:12}}/>
   <Text>{currency}</Text>
   <Button title={pending?t[5]:t[4]} onPress={()=>void submit()} disabled={busy||!line||reference.trim().length<8}/>
  </>}
  {posted&&<Button title={p.language==='sw'?'Shiriki risiti ya PDF':'Share refund PDF'} onPress={()=>void share()} disabled={sharing}/>}
  {!!message&&<Text accessibilityRole="alert">{message}</Text>}
 </View>;
}
