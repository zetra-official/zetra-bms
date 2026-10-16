import React, {useRef,useState} from 'react';
import {View,Text,Pressable,StyleSheet} from 'react-native';

export type Language='en'|'sw'|'fr'|'pt'|'ar'|'es'|'zh';
export type Context={authorized:boolean;role:string;salesMode:'DIRECT'|'CASHIER'|null;assigned:boolean;
 handoff?:{status:'PENDING'|'ACCEPTED'|'COMPLETED';assignedToCurrentCashier:boolean};openShift:boolean};
export type Intent='HANDOFF'|'CONFIRM'|'CASHIER_ACCEPT'|'CASHIER_COMPLETE';
const messages={
 en:['Send to Cashier','Confirm Sale','Accept Handoff','Complete Sale','Check permissions and sales mode','Open a cashier shift first','Assigned to another cashier','Sale already completed','Unable to continue. Check the order status before retrying.','Payment is completed by the authorized cashier.'],
 sw:['Tuma kwa Cashier','Thibitisha Mauzo','Kubali Oda','Kamilisha Mauzo','Hakiki ruhusa na mfumo wa mauzo','Fungua zamu ya cashier kwanza','Imepewa cashier mwingine','Mauzo yamekamilika','Imeshindikana kuendelea. Hakiki hali ya oda kabla ya kujaribu tena.','Malipo yanakamilishwa na cashier mwenye ruhusa.'],
 fr:['Envoyer au caissier','Confirmer la vente','Accepter la commande','Finaliser la vente','Vérifiez les autorisations et le mode de vente','Ouvrez d’abord une session de caisse','Attribué à un autre caissier','Vente déjà finalisée','Impossible de continuer. Vérifiez le statut de la commande avant de réessayer.','Le paiement est finalisé par le caissier autorisé.'],
 pt:['Enviar ao caixa','Confirmar venda','Aceitar pedido','Concluir venda','Verifique as permissões e o modo de venda','Abra primeiro um turno de caixa','Atribuído a outro caixa','Venda já concluída','Não foi possível continuar. Verifique o estado do pedido antes de tentar novamente.','O pagamento é concluído pelo caixa autorizado.'],
 ar:['إرسال إلى أمين الصندوق','تأكيد البيع','قبول الطلب','إتمام البيع','تحقق من الصلاحيات ووضع البيع','افتح وردية صندوق أولاً','مُسند إلى أمين صندوق آخر','اكتمل البيع بالفعل','تعذر المتابعة. تحقق من حالة الطلب قبل المحاولة مجدداً.','يُتم الدفع أمين الصندوق المخوّل.'],
 es:['Enviar al cajero','Confirmar venta','Aceptar pedido','Completar venta','Verifique los permisos y el modo de venta','Abra primero un turno de caja','Asignado a otro cajero','Venta ya completada','No se puede continuar. Verifique el estado del pedido antes de reintentarlo.','El pago lo completa el cajero autorizado.'],
 zh:['发送至收银员','确认销售','接受订单','完成销售','请检查权限和销售模式','请先开启收银班次','已分配给其他收银员','销售已完成','无法继续。请检查订单状态后再重试。','付款由获授权的收银员完成。'],
} satisfies Record<Language,readonly string[]>;
export function decideAction(c:Context):{intent:Intent|null;label:number;reason?:number}{
 if(!c.authorized||!c.salesMode||!['owner','admin','staff','cashier'].includes(c.role))return{intent:null,label:4};
 if(c.handoff?.status==='COMPLETED')return{intent:null,label:7};
 if(c.role==='cashier'){
  if(!c.assigned||!c.handoff)return{intent:null,label:4};
  if(c.handoff.status==='PENDING')return{intent:'CASHIER_ACCEPT',label:2};
  if(!c.handoff.assignedToCurrentCashier)return{intent:null,label:6};
  if(!c.openShift)return{intent:null,label:5};
  return{intent:'CASHIER_COMPLETE',label:3};
 }
 if(c.handoff)return{intent:null,label:9};
 if(c.salesMode==='CASHIER')return c.assigned?{intent:'HANDOFF',label:0}:{intent:null,label:4};
 return{intent:'CONFIRM',label:1};
}
/** Additive inactive component. Context must be current canonical server state.
 * onIntent enters the existing cashier/checkout UI, never directly takes payment.
 * Server gates remain mandatory; this presentation projection grants no authority.
 */
export function CashierProformaActions({language,context,onIntent}:{language:Language;context:Context;onIntent:(intent:Intent)=>Promise<void>}){
 const busy=useRef(false),[working,setWorking]=useState(false),[failed,setFailed]=useState(false);
 const action=decideAction(context),t=messages[language]??messages.en;
 const press=async()=>{
  if(busy.current||!action.intent)return;
  busy.current=true;setWorking(true);setFailed(false);
  try{await onIntent(action.intent)}catch{setFailed(true)}finally{busy.current=false;setWorking(false)}
 };
 return <View style={[styles.box,language==='ar'&&{direction:'rtl'}]}>
  <Pressable accessibilityRole="button" accessibilityLabel={t[action.label]} disabled={!action.intent||working} onPress={press}
   style={[styles.button,(!action.intent||working)&&styles.disabled]}>
   <Text style={[styles.label,language==='ar'&&{writingDirection:'rtl'}]}>{t[action.label]}</Text>
  </Pressable>
  {action.intent==='HANDOFF'&&<Text style={styles.note}>{t[9]}</Text>}
  {failed&&<Text accessibilityRole="alert" style={styles.error}>{t[8]}</Text>}
 </View>
}
const styles=StyleSheet.create({box:{gap:10,maxWidth:640,width:'100%',padding:16},button:{minHeight:48,borderRadius:12,paddingVertical:14,paddingHorizontal:20,backgroundColor:'#0b6b55',justifyContent:'center'},disabled:{backgroundColor:'#64748b'},label:{color:'#fff',fontSize:16,fontWeight:'700',textAlign:'center',flexShrink:1},note:{fontSize:14,color:'#334155',lineHeight:21},error:{color:'#b91c1c',fontSize:14,lineHeight:21}});
