import React,{useEffect,useRef,useState} from 'react';
import {View,Text,TextInput,ActivityIndicator} from 'react-native';
import {Button} from '../ui/Button';
import {formatCurrencyExact} from './engine';
import type {FinancialPort,PendingStore} from './originalWorkflow';
import {CustodyRejected,custodyRequest,readPendingCustody,submitCustody,type CustodyIntent} from './fieldCustodyWorkflow';
type Wallet={id:string;name:string;currency:string;balance:string};
type Account={id:string;name:string;currency:string;balance:string};
type Props={port:FinancialPort;storage:PendingStore;actorId:string;organizationId:string;storeId:string;language:string;shiftId:string|null;makeRequestId:()=>string;orderId?:string};
export function FieldCustodyForm(p:Props){
 const sw=p.language==='sw',epoch=useRef(0),[wallets,setWallets]=useState<Wallet[]>([]),[accounts,setAccounts]=useState<Account[]>([]),[wallet,setWallet]=useState(''),[account,setAccount]=useState(''),[operation,setOperation]=useState<CustodyIntent['operation']>('FUND'),[amount,setAmount]=useState(''),[reference,setReference]=useState(''),[pending,setPending]=useState<CustodyIntent|null>(null),[busy,setBusy]=useState(true),[message,setMessage]=useState('');
 const scope=[p.actorId,p.organizationId,p.storeId].join(':');
 const load=async(id:number)=>{const saved=await readPendingCustody(p.storage,p);const {data,error}=await p.port.rpc('get_bound_field_custody_v1',{p_store_id:p.storeId});if(error)throw error;const d=data as {organizationId:string;storeId:string;wallets:Wallet[];accounts:Account[]};if(d.organizationId!==p.organizationId||d.storeId!==p.storeId||!Array.isArray(d.wallets)||!Array.isArray(d.accounts))throw Error('CUSTODY_SCOPE_MISMATCH');if(id!==epoch.current)return;setWallets(d.wallets);setAccounts(d.accounts);setPending(saved);setWallet(saved?.walletId??d.wallets[0]?.id??'');setAccount(saved?.sourceAccountId??d.accounts[0]?.id??'');if(saved){setOperation(saved.operation);setAmount(saved.amount);setReference(saved.reference)}};
 useEffect(()=>{const id=++epoch.current;setBusy(true);setWallets([]);setAccounts([]);setPending(null);setMessage('');void load(id).catch(()=>{if(id===epoch.current)setMessage(sw?'Taarifa za fedha hazipatikani. Jaribu tena.':'Custody records are unavailable. Try again.')}).finally(()=>{if(id===epoch.current)setBusy(false)});return()=>{epoch.current++}},[scope]);
 const selected=wallets.find(w=>w.id===wallet),locked=busy||pending!==null;
 const submit=async()=>{if(!selected)return;const id=epoch.current;const i=pending??{actorId:p.actorId,organizationId:p.organizationId,storeId:p.storeId,walletId:wallet,requestId:p.makeRequestId(),currency:selected.currency,sourceAccountId:['SUPPLIER','EXPENSE'].includes(operation)?null:account,shiftId:p.shiftId,operation,amount,reference,orderId:p.orderId,expenseDate:new Date().toISOString().slice(0,10)};setBusy(true);setMessage('');try{custodyRequest(i);setPending(i);const r=await submitCustody(p.port,p.storage,i);if(id!==epoch.current)return;setPending(null);setMessage((sw?'Imerekodiwa · ':'Recorded · ')+formatCurrencyExact(String(r.amount),String(r.currency),p.language));await load(id)}catch(e){if(id===epoch.current){if(e instanceof CustodyRejected)setPending(null);setMessage(sw?'Matokeo hayajathibitishwa. Hakiki kiasi na salio; jaribu tena.':'The outcome is unconfirmed. Check the amount and balance, then retry.')}}finally{if(id===epoch.current)setBusy(false)}};
 const actions:[CustodyIntent['operation'],string][]=[['FUND',sw?'Kabidhi fedha':'Fund custody'],['RETURN',sw?'Rejesha fedha':'Return funds'],['EXPENSE',sw?'Rekodi gharama':'Record expense'],...(p.orderId?[['SUPPLIER',sw?'Lipa ankara iliyopokelewa':'Pay received invoice'] as [CustodyIntent['operation'],string]]:[])];
 return <View style={{padding:16,gap:12,direction:p.language==='ar'?'rtl':'ltr'}}>
  <Text style={{fontSize:22,fontWeight:'800'}}>{sw?'Fedha za Field Procurement':'Field Procurement custody'}</Text>{busy&&<ActivityIndicator/>}
  {wallets.map(w=><Button key={w.id} title={w.name+' · '+formatCurrencyExact(w.balance,w.currency,p.language)} variant={wallet===w.id?'primary':'secondary'} onPress={()=>setWallet(w.id)} disabled={locked}/>)}
  {!busy&&!wallets.length&&<Text>{sw?'Hakuna wallet iliyothibitishwa. Wallet yenye historia inahitaji uthibitisho wa sarafu na salio.':'No verified wallet is available. Historical wallets require verified currency and balance evidence.'}</Text>}
  {selected&&<>{actions.map(([op,label])=><Button key={op} title={label} variant={operation===op?'primary':'secondary'} onPress={()=>setOperation(op)} disabled={locked}/>)}
   {['FUND','RETURN'].includes(operation)&&accounts.filter(a=>a.currency===selected.currency).map(a=><Button key={a.id} title={a.name+' · '+formatCurrencyExact(a.balance,a.currency,p.language)} variant={account===a.id?'primary':'secondary'} onPress={()=>setAccount(a.id)} disabled={locked}/>)}
   <TextInput accessibilityLabel={sw?'Kiasi':'Amount'} placeholder={sw?'Kiasi':'Amount'} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" editable={!locked} style={{borderWidth:1,padding:12}}/>
   <TextInput accessibilityLabel={sw?'Rejea ya uthibitisho':'Confirmation reference'} placeholder={sw?'Rejea ya uthibitisho':'Confirmation reference'} value={reference} onChangeText={setReference} editable={!locked} style={{borderWidth:1,padding:12}}/>
   <Button title={pending?(sw?'Jaribu tena ombi lililohifadhiwa':'Retry saved request'):(sw?'Thibitisha':'Confirm custody')} onPress={()=>void submit()} disabled={busy||!amount||reference.trim().length<8}/>
  </>}{!!message&&<Text accessibilityRole="alert">{message}</Text>}
 </View>;
}
