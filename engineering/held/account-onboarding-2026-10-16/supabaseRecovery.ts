import type {Verified} from './recovery';
type User={id:string;email?:string;email_confirmed_at?:string|null};
interface RecoveryAuth {
 resetPasswordForEmail(email:string,options:{redirectTo:string}):Promise<{error:unknown}>;
 verifyOtp(input:{token_hash:string;type:'recovery'}):Promise<{data:{user:User|null;session:{access_token:string}|null};error:unknown}>;
 getUser(token:string):Promise<{data:{user:User|null};error:unknown}>;
}
// Local preparation only. Factory must enforce loopback transport AND per-request SDK
// persistSession:false/autoRefreshToken:false/detectSessionInUrl:false before binding.
// Constructor URLs alone cannot establish which transport an injected SDK actually uses.
export function localRecoveryPrimitives(auth:RecoveryAuth,redirect:string){
 const u=new URL(redirect);
 if(u.protocol!=='http:'||u.hostname!=='127.0.0.1'||!u.port||u.username||u.password||u.search||u.hash||u.pathname!=='/account-recovery')throw Error('LOCAL_CALLBACK_REQUIRED');
 return {
  async sendRecovery(email:string){
   const r=await auth.resetPasswordForEmail(email,{redirectTo:u.href});
   if(r.error)throw Error('RECOVERY_SEND_FAILED');
  },
  async verifyRecovery(tokenHash:string):Promise<Verified>{
   const r=await auth.verifyOtp({token_hash:tokenHash,type:'recovery'});
   if(r.error||!r.data.user||!r.data.session?.access_token)throw Error('RECOVERY_VERIFICATION_FAILED');
   const verified=await auth.getUser(r.data.session.access_token);
   const user=verified.data.user;
   if(verified.error||!user||user.id!==r.data.user.id||!user.email_confirmed_at||!user.email||user.email!==r.data.user.email)throw Error('RECOVERY_VERIFICATION_FAILED');
   // Never hand a newly created recovery session or refresh token to a suspended client.
   return {subject:user.id,email:user.email,confirmed:true};
  }
 };
}
