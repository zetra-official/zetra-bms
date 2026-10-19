import {useCallback,useEffect,useRef,useState} from 'react';
import {useFocusEffect} from 'expo-router';
import {supabase} from '../supabase/supabaseClient';
import {readAccountingAuthority,type AccountingAuthority} from './accounting';
/** No disk authority cache or display-preference fallback. Focus/session changes
 * refresh from server; late results cannot leak across organizations or users. */
export function useAccountingAuthority(organizationId:string){
 const [state,setState]=useState<{scope:string;authority:AccountingAuthority|null;loading:boolean;failed:boolean}>({scope:organizationId,authority:null,loading:true,failed:false});
 const generation=useRef(0);
 const pending=useRef<AbortController|null>(null);
 const refresh=useCallback(async()=>{const epoch=++generation.current;
  pending.current?.abort();const controller=new AbortController();pending.current=controller;
  setState(previous=>({scope:organizationId,authority:previous.scope===organizationId?previous.authority:null,loading:!!organizationId,failed:false}));
  if(!organizationId)return;
  const timer=setTimeout(()=>controller.abort(),10000);
  try{const authority=await readAccountingAuthority(supabase,organizationId,controller.signal);if(epoch===generation.current)setState({scope:organizationId,authority,loading:false,failed:false})}
  catch{if(epoch===generation.current)setState(previous=>({...previous,loading:false,failed:true}))}
  finally{clearTimeout(timer)}
 },[organizationId]);
 useFocusEffect(useCallback(()=>{void refresh();return()=>{generation.current++;pending.current?.abort()}},[refresh]));
 useEffect(()=>{let timer:ReturnType<typeof setTimeout>|undefined;
  const {data:{subscription}}=supabase.auth.onAuthStateChange(event=>{
   if(event==='INITIAL_SESSION')return; // Focus already performs the initial read.
   generation.current++;pending.current?.abort();setState({scope:organizationId,authority:null,loading:!!organizationId,failed:false});
   if(timer)clearTimeout(timer);if(event!=='SIGNED_OUT')timer=setTimeout(()=>void refresh(),0);
  });return()=>{generation.current++;if(timer)clearTimeout(timer);subscription.unsubscribe()}
 },[organizationId,refresh]);
 return {...(state.scope===organizationId?state:{scope:organizationId,authority:null,loading:!!organizationId,failed:false}),refresh};
}
