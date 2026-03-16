import * as Notifications from "expo-notifications"
import { supabase } from "@/src/supabase/supabaseClient"

export async function registerPush(userId:string){

 const {data} = await Notifications.getExpoPushTokenAsync()

 await supabase
 .from("user_push_tokens")
 .insert({
   user_id:userId,
   expo_push_token:data
 })

}