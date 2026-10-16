import React from 'react';
import {View,Text,Pressable} from 'react-native';
import {recoveryCopy} from './recoveryCopy';
// Unmounted presentation component. language comes from existing useLanguage().
// View state is presentation only; every callback still requires server proof/gates.
export function RecoveryChoices({language,view,busy,onChoose}:{language:keyof typeof recoveryCopy;view:'verify'|'choices'|'pending';busy:boolean;onChoose:(choice:'REACTIVATE'|'FRESH')=>void}){
 const c=recoveryCopy[language]||recoveryCopy.en;
 const text={color:'#ffffff',textAlign:language==='ar'?'right' as const:'left' as const};
 return <View style={{direction:language==='ar'?'rtl':'ltr',padding:20,gap:16,maxWidth:600,width:'100%',backgroundColor:'#0f172a'}}>
  <Text accessibilityRole="header" style={{...text,fontSize:24}}>{c.title}</Text>
  <Text style={text}>{view==='verify'?c.verify:view==='pending'?c.pending:c.warning}</Text>
  {view==='choices'&&(['REACTIVATE','FRESH'] as const).map(choice=><Pressable key={choice} accessibilityRole="button" accessibilityState={{disabled:busy}} disabled={busy} onPress={()=>onChoose(choice)} style={{padding:16,minHeight:48,borderRadius:8,backgroundColor:'#166534',opacity:busy?.6:1}}><Text style={text}>{choice==='REACTIVATE'?c.reactivate:c.fresh}</Text></Pressable>)}
 </View>;
}
