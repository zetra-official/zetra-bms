import React from 'react';
import {Screen} from '@/src/ui/Screen';
import {useOrg} from '@/src/context/OrgContext';
import {ProformaEntry} from '@/src/proforma/ProformaEntry';
import {canOpenProforma} from '@/src/proforma/availability';
export default function ProformaRoute() {
 const org=useOrg();const store=org.stores.find(row=>row.store_id===org.activeStoreId&&row.organization_id===org.activeOrgId&&row.is_allowed!==false);
 const authorized=!org.loading&&canOpenProforma({organizationId:org.activeOrgId,storeId:store?.store_id??null,storeOrganizationId:store?.organization_id??null,role:org.activeRole});
 return <Screen><ProformaEntry organizationId={org.activeOrgId} storeId={org.activeStoreId} authorized={authorized}/></Screen>;
}
