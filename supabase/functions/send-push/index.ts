import { serve } from "https://deno.land/std/http/server.ts"

serve(async () => {

 const res = await fetch(
   `${Deno.env.get("SUPABASE_URL")}/rest/v1/push_notification_queue?sent=eq.false`,
   {
     headers:{
       apikey:Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
     }
   }
 )

 const rows = await res.json()

 for(const r of rows){

   const tokens = await fetch(
     `${Deno.env.get("SUPABASE_URL")}/rest/v1/user_push_tokens?user_id=eq.${r.user_id}`,
     {
       headers:{
         apikey:Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
       }
     }
   )

   const t = await tokens.json()

   for(const tok of t){

     await fetch("https://exp.host/--/api/v2/push/send",{
       method:"POST",
       headers:{
         "Content-Type":"application/json"
       },
       body:JSON.stringify({
         to:tok.expo_push_token,
         title:r.title,
         body:r.body,
         data:r.data
       })
     })

   }

   await fetch(
     `${Deno.env.get("SUPABASE_URL")}/rest/v1/push_notification_queue?id=eq.${r.id}`,
     {
       method:"PATCH",
       headers:{
         apikey:Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
         "Content-Type":"application/json"
       },
       body:JSON.stringify({sent:true})
     }
   )

 }

 return new Response("done")

})