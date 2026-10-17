import React from 'react';
import {Screen} from '@/src/ui/Screen';
import {useOrg} from '@/src/context/OrgContext';
import {ProformaEntry} from '@/src/proforma/ProformaEntry';
import {canOpenProforma} from '@/src/proforma/availability';
import {useLocalSearchParams} from 'expo-router';
export default function ProformaRoute() {
 const org=useOrg();const params=useLocalSearchParams<{storeId?:string|string[];mode?:string}>();
 const requested=Array.isArray(params.storeId)?params.storeId[0]:params.storeId;
 const store=org.stores.find(row=>row.store_id===(requested??org.activeStoreId)&&row.organization_id===org.activeOrgId&&row.is_allowed!==false);
 const authorized=!org.loading&&canOpenProforma({organizationId:org.activeOrgId,storeId:store?.store_id??null,storeOrganizationId:store?.organization_id??null,role:org.activeRole});
 return <Screen><ProformaEntry key={`${org.activeOrgId}:${store?.store_id}:${org.activeRole}:${params.mode}`} organizationId={org.activeOrgId} storeId={store?.store_id??null} authorized={authorized} startNew={params.mode==='new'}/></Screen>;
}
