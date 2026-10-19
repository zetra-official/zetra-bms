import React,{useEffect,useState} from 'react';
import {Text} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {useLocalSearchParams} from 'expo-router';
import {useOrg} from '../../src/context/OrgContext';
import {useLanguage} from '../../src/i18n/LanguageProvider';
import {supabase} from '../../src/supabase/supabaseClient';
import {Screen} from '../../src/ui/Screen';
import {FieldCustodyForm} from '../../src/currency/FieldCustodyForm';
import {ORIGINAL_WORKFLOW_ACTIVE} from '../../src/currency/originalWorkflow';
import {makeId} from '../../src/offline/salesQueue';
export default function FieldCustodyScreen(){const {activeOrgId,activeStoreId,activeRole}=useOrg();const {language}=useLanguage();const {orderId}=useLocalSearchParams<{orderId?:string}>();const [actor,setActor]=useState<string|null>(null);
 useEffect(()=>{let live=true;void supabase.auth.getUser().then(({data})=>{if(live)setActor(data.user?.id??null)});return()=>{live=false}},[]);
 if(!ORIGINAL_WORKFLOW_ACTIVE||!actor||!activeOrgId||!activeStoreId||activeRole?.toLowerCase()!=='owner')return <Screen><Text>{language==='sw'?'Huduma ya fedha haipatikani kwa sasa.':'Custody posting is unavailable.'}</Text></Screen>;
 return <Screen scroll><FieldCustodyForm key={[actor,activeOrgId,activeStoreId].join(':')} port={supabase} storage={AsyncStorage} actorId={actor} organizationId={activeOrgId} storeId={activeStoreId} language={language} shiftId={null} makeRequestId={makeId} orderId={typeof orderId==='string'?orderId:undefined}/></Screen>;
}
