import {CurrencyOnboardingInput,persistentScopedOnboardingIntent,verifyCurrencyOnboardingResult,SCOPED_CURRENCY_ONBOARDING_RPC} from './onboarding';

type Session={user:{id:string};expires_at?:number};
type Dependencies={storage:Parameters<typeof persistentScopedOnboardingIntent>[0];makeId:()=>string;rpc:(name:string,payload:Record<string,unknown>)=>PromiseLike<{data:unknown;error:{message:string}|null}>};
type Result=ReturnType<typeof verifyCurrencyOnboardingResult>;
const pending=new Map<string,{fingerprint:string;promise:Promise<Result>}>();

/** Session checks improve feedback only; verified JWT + rollout/Owner checks on the server are authoritative.
 * No fallback RPC or automatic retry after a failed/uncertain call. Persisted request survives restart. */
export async function submitScopedCurrencyOnboarding(session:Session|null,input:CurrencyOnboardingInput,deps:Dependencies,nowSeconds=Date.now()/1000):Promise<Result>{
 if(!session?.user?.id)throw Error('AUTHENTICATION_REQUIRED');
 if(typeof session.expires_at!=='number'||!Number.isFinite(session.expires_at)||session.expires_at<=nowSeconds)throw Error('AUTH_SESSION_EXPIRED');
 const actor=session.user.id,fingerprint=JSON.stringify(input),existing=pending.get(actor);
 if(existing){if(existing.fingerprint!==fingerprint)throw Error('ONBOARDING_INTENT_REVIEW_REQUIRED');return existing.promise;}
 const promise=(async()=>{
  const payload=await persistentScopedOnboardingIntent(deps.storage,actor,input,deps.makeId);
  const response=await deps.rpc(SCOPED_CURRENCY_ONBOARDING_RPC,payload);
  if(response.error)throw Error(response.error.message);
  return verifyCurrencyOnboardingResult(response.data,'TZS');
 })();
 pending.set(actor,{fingerprint,promise});
 try{return await promise;}finally{if(pending.get(actor)?.promise===promise)pending.delete(actor);}
}
