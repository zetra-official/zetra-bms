import React,{useEffect,useState} from 'react';
import {Text} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {useLocalSearchParams} from 'expo-router';
import {useOrg} from '../../src/context/OrgContext';
import {useLanguage} from '../../src/i18n/LanguageProvider';
import {supabase} from '../../src/supabase/supabaseClient';
import {Screen} from '../../src/ui/Screen';
import {OriginalRefundForm} from '../../src/currency/OriginalRefundForm';
import {ORIGINAL_WORKFLOW_ACTIVE} from '../../src/currency/originalWorkflow';
import {makeId} from '../../src/offline/salesQueue';
export default function OriginalRefundScreen(){
 const {activeOrgId,activeStoreId,activeRole}=useOrg();const {language}=useLanguage();const {saleId}=useLocalSearchParams<{saleId:string}>();const [actor,setActor]=useState<string|null>(null);
 useEffect(()=>{let live=true;void supabase.auth.getUser().then(({data})=>{if(live)setActor(data.user?.id??null)});return()=>{live=false}},[]);
 if(!ORIGINAL_WORKFLOW_ACTIVE||!actor||!activeOrgId||!activeStoreId||activeRole?.toLowerCase()!=='owner'||typeof saleId!=='string')return <Screen><Text>{language==='sw'?'Refund ya mauzo haya haipatikani kwa sasa.':'Original refund is unavailable.'}</Text></Screen>;
 return <Screen scroll><OriginalRefundForm key={[actor,activeOrgId,activeStoreId,saleId].join(':')} port={supabase} storage={AsyncStorage} actorId={actor} organizationId={activeOrgId} storeId={activeStoreId} saleId={saleId} shiftId={null} language={language} makeRequestId={makeId}/></Screen>;
}
