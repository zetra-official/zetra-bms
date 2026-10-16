import {useSystemMessageText} from "@/src/i18n/useSystemMessageText";
import {useCommonText} from "@/src/i18n/useCommonText";
import React, { useState } from "react";
import { Platform, Text, View, useWindowDimensions } from "react-native";
import { useRouter } from "expo-router";
import { useOrg } from "../../src/context/OrgContext";
import { Screen } from "../../src/ui/Screen";
import { Card } from "../../src/ui/Card";
import { Input } from "../../src/ui/Input";
import { Button } from "../../src/ui/Button";
import { searchGuides, type Role } from "../../src/ai/knowledge/guides";
export default function TrainingScreen() {
 const systemText = useSystemMessageText();
 const uiText = useCommonText();
 const { width } = useWindowDimensions();
 const platform = Platform.OS === "android" ? "android" : width < 768 ? "mobile-web" : "desktop-web";
 const { activeRole } = useOrg(); const router = useRouter();
 const [query,setQuery]=useState("");
 const [results,setResults]=useState<ReturnType<typeof searchGuides>>([]);
 const [message,setMessage]=useState("Ask how to use a verified ZETRA workflow.");
 const search=()=>{try{const guides=searchGuides(query,String(activeRole).toLowerCase() as Role,platform);setResults(guides);setMessage(guides.length?"":"No verified guide matches this question and role.")}catch{setResults([]);setMessage("Enter a short question supported by your role.")}};
 return <Screen><View style={{maxWidth:760,width:"100%",alignSelf:"center",padding:16,gap:16}}>
  <Text accessibilityRole="header" style={{fontSize:24,fontWeight:"800",color:"#172033"}}>{uiText("ZETRA AI • Workflow guides")}</Text>
  <Input value={query} onChangeText={setQuery} accessibilityLabel={uiText("Question about ZETRA")} placeholder={uiText("How do I record a sale?")} onSubmitEditing={search}/>
  <Button title={uiText("Find guide")} onPress={search}/>
  {!!message&&<Text accessibilityLiveRegion="polite" style={{color:"#475569"}}>{systemText(message)}</Text>}
  {results.map(guide=><Card key={guide.id}><View style={{gap:10}}><Text style={{fontWeight:"800",fontSize:18,color:"#172033"}}>{uiText(guide.title)}</Text>{guide.steps.map((step,i)=><Text key={i} style={{color:"#334155",lineHeight:24}}>{i+1}. {uiText(step)}</Text>)}<Button title={uiText("Open workflow")} onPress={()=>router.push(guide.route as any)}/></View></Card>)}
  <Text style={{color:"#64748B",lineHeight:20}}>{uiText("These guides explain the application. Live financial answers and data-changing actions remain unavailable until their backend contracts are verified.")}</Text>
 </View></Screen>;
}
