// Server-only, unmounted preparation. Uses Supabase recovery; does not issue Auth identities.
// No transport is constructed here. Ports must be bound only after access/retention gates pass.
export type Choice = 'REACTIVATE' | 'FRESH';
export type Verified = {subject:string; email:string; confirmed:boolean};
export interface RecoveryPorts {
  // Server-derived network/session key, not a request body field. Durable distributed limiter.
  allowAttempt(context:string, operation:'SEND'|'VERIFY'):Promise<boolean>;
  // Existing resetPasswordForEmail primitive. Fixed allowlisted redirect, never caller supplied.
  sendRecovery(email:string):Promise<void>;
  // Existing verifyOtp({token_hash,type:'recovery'}) followed by getUser(access_token).
  // The Auth session is server-only: never return it to a disabled client.
  verifyRecovery(tokenHash:string):Promise<Verified>;
  // Durable single-use capability, hash at rest, random >=256 bits, short TTL.
  // Atomic store binds verified subject + browser context. No client verified flag.
  issueProof(subject:string,context:string):Promise<string>;
  // Atomic reservation consumes proof for exactly one job/action. Same job may resume,
  // but cannot switch subject/action. Job persistence and proof use must be one transaction.
  reserveProof(proof:string,context:string,job:string,choice:Choice):Promise<{subject:string;jobStatus:'NEW'|'PENDING'|'COMPLETE'}>;
  inspect(subject:string):Promise<{
    voluntary:boolean; state:'SUSPENDED'|'ACTIVE'|'PENDING'|'RETIRED';
    gateVerified:boolean; retentionVerified:boolean; emailPrivilegesRemoved:boolean;
    ownershipBlockers:string[];
  }>;
  // Bind to the reviewed LifecycleWorker and durable repository, not an alternate engine.
  // Its assess/begin MUST repeat all inspect gates under its subject lock and scopeVersion
  // compare-and-swap. The preliminary inspect below is not authorization for a write.
  runExistingLifecycle(subject:string,job:string,action:'REACTIVATE'|'DELETE'):Promise<'COMPLETE'|'PENDING'>;
}
const generic = Object.freeze({message:'RECOVERY_REQUEST_RECEIVED'});
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export class RecoveryCoordinator {
  constructor(private p:RecoveryPorts){}
  async request(email:string,context:string){
    // Uniform body; HTTP adapter must also normalize timing/status and redact token URLs.
    try {
      if(await this.p.allowAttempt(context,'SEND') && email.length<=254 && /^[^\s@]+@[^\s@]+$/.test(email))
        await this.p.sendRecovery(email.trim());
    } catch { /* no Auth/provider errors or existence information returned */ }
    return generic;
  }
  async verify(tokenHash:string,context:string){
    try {
      if(!await this.p.allowAttempt(context,'VERIFY') || !tokenHash || tokenHash.length>2048)throw Error();
      const v=await this.p.verifyRecovery(tokenHash);
      if(!uuid.test(v.subject)||!v.confirmed||!v.email)throw Error();
      return {proof:await this.p.issueProof(v.subject,context)};
    } catch {throw Error('RECOVERY_VERIFICATION_FAILED');}
  }
  async choose(proof:string,context:string,job:string,choice:Choice){
    if(!uuid.test(job)||!['REACTIVATE','FRESH'].includes(choice))throw Error('INVALID_REQUEST');
    const {subject,jobStatus}=await this.p.reserveProof(proof,context,job,choice);
    if(!uuid.test(subject))throw Error('RECOVERY_VERIFICATION_FAILED');
    // Resume runs only in the trusted durable worker, never repeat an uncertain Auth delete.
    if(jobStatus==='PENDING')return {status:'PENDING' as const};
    if(jobStatus==='COMPLETE')return {status:'COMPLETE' as const,route:choice==='FRESH'?'/(auth)/register':'/(auth)/login'};
    if(jobStatus!=='NEW')throw Error('INVALID_JOB_STATE');
      const s=await this.p.inspect(subject);
      // Do not reactivate admin/security bans or infer voluntary intent from is_disabled alone.
      if(!s.voluntary||!s.gateVerified||s.state!=='SUSPENDED')throw Error('ACCOUNT_REVIEW_REQUIRED');
      if(s.ownershipBlockers.length)throw Error('ACCOUNT_REVIEW_REQUIRED');
      if(choice==='FRESH'&&(!s.retentionVerified||!s.emailPrivilegesRemoved))throw Error('RETIREMENT_BLOCKED');
      const result=await this.p.runExistingLifecycle(subject,job,choice==='FRESH'?'DELETE':'REACTIVATE');
      if(result!=='COMPLETE')return {status:'PENDING' as const};
      // Never create orgs, copy memberships, or return application access here.
      return {status:'COMPLETE' as const,route:choice==='FRESH'?'/(auth)/register':'/(auth)/login'};
  }
}

// Must be evaluated server-side after canonical signUp/confirmation and before onboarding.
// Original subject comes from durable retirement receipt, never client input.
export function assertFreshIdentity(oldSubject:string,newSubject:string,hasOldAccess:boolean,emailAuthority:boolean){
  if(!uuid.test(oldSubject)||!uuid.test(newSubject)||oldSubject===newSubject||hasOldAccess||emailAuthority)
    throw Error('FRESH_IDENTITY_ISOLATION_FAILED');
  return '/(onboarding)/referral' as const;
}
