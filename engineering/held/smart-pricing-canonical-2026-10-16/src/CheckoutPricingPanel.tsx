import React,{useState} from 'react';
import {PricingSummary} from '../../smart-pricing-local-2026-10-16/src/PricingSummary';
import {CheckoutPricingSession} from './checkoutSession';
/** Slots into the current Order Summary / Discount & Note composition.
 * Existing routes/payment handlers remain untouched until separate activation. */
export function CheckoutPricingPanel({session,editable,onDraft}:{session:CheckoutPricingSession;editable:boolean;onDraft:(session:CheckoutPricingSession)=>void}){
 const [,refresh]=useState(0);const changed=(fn:()=>void)=>{fn();refresh(n=>n+1);onDraft(session)};
 return <PricingSummary lines={session.lines} context={session.context} editable={editable}
 onChange={lines=>changed(()=>session.updateLines(lines))}
 onOrderDiscountChange={raw=>changed(()=>session.setDiscount(raw))}
 onNoteChange={note=>changed(()=>session.setNote(note))}/>;
}
