import React,{useCallback,useState} from 'react';
import {useRouter,useFocusEffect} from 'expo-router';
import {useLanguage} from '../i18n/LanguageProvider';
import {Button} from '../ui/Button';
import {ordersText} from './ordersCopy';
import {proformaText} from './labels';
import {createDocumentService} from './documentsApi';
import {supabase} from '../supabase/supabaseClient';
import {makeId} from '../offline/salesQueue';
import {pendingCount} from './pendingCount';
/** History API remains the authority for permissions and records; no fabricated pending count. */
export function ProformaOrdersAction({organizationId,storeId}:{organizationId:string;storeId:string|null}){
 const router=useRouter(),{language}=useLanguage();
 const [count,setCount]=useState<number|null>(null);
 useFocusEffect(useCallback(()=>{const controller=new AbortController();setCount(null);if(organizationId&&storeId){const service=createDocumentService({organizationId,storeId},supabase,makeId);void pendingCount((signal,before)=>service.client.page(signal,before),controller.signal).then(value=>{if(!controller.signal.aborted)setCount(value)}).catch(()=>{})}return()=>controller.abort()},[organizationId,storeId]));
 return <Button title={ordersText(language,'orders')+(count?` · ${proformaText(language,'pending')} ${count}`:'')} variant="secondary" disabled={!storeId} onPress={()=>router.push({pathname:'/sales/proforma',params:{storeId:storeId!}} as any)}/>;
}
