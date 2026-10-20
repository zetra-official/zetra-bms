import React from 'react';
import {Text,View} from 'react-native';
import {UI} from '../ui/theme';
import {useAccountingAuthority} from './useAccountingAuthority';
import {useOrg} from '../context/OrgContext';
import {displayDecimal,authorizedValuationRows} from './currentValuation';
import {CurrentRateValuation} from './CurrentRateValuation';
/** Legacy summaries have no transaction-currency column. Require an explicit
 * legacy TZS reader contract; never assign a personal display preference. */
export function LegacyTzsValuation({organizationId,rows,period}:{organizationId:string;rows:readonly {label:string;amount:unknown;ownerOnly?:boolean}[];period:string}){
 const context=useOrg(),accounting=useAccountingAuthority(organizationId);
 const sameOrg=String(context.activeOrgId??'')===organizationId;
 const visible=authorizedValuationRows(rows,sameOrg&&String(context.activeRole??'').toLowerCase()==='owner');
 if(!organizationId||!sameOrg)return null;
 // A native accounting organization must not reinterpret legacy aggregate RPCs.
 if(accounting.authority&&accounting.authority.currency!=='TZS')return <Text style={{color:UI.text}}>Conversion unavailable: this legacy reader does not provide original transaction currency.</Text>;
 const unavailable=visible.filter(row=>displayDecimal(row.amount)===null);
 const values=visible.flatMap(row=>{const amount=displayDecimal(row.amount);return amount===null?[]:[{label:row.label,value:{amount,currency:'TZS',organizationId,contextRevision:null,source:'TRANSACTION_RECORD' as const}}]});
 return <View>{unavailable.map((row,index)=><Text key={index} style={{color:UI.text}}>{row.label}: conversion unavailable; original reader does not provide a safe decimal amount.</Text>)}<CurrentRateValuation compact key={organizationId} organizationId={organizationId} rows={values} period={period}/></View>;
}
