// Server-only orchestration contract. No SDK, credentials, network or client activation.
// A production repository must persist jobs/audit and serialize access by subject UUID.
export type Action='DEACTIVATE'|'REACTIVATE'|'DELETE';
export type State='ACTIVE'|'SUSPENDED'|'DELETE_PENDING'|'AUTH_UNKNOWN'|'DELETED';
export type Job={id:string;subject:string;action:Action;status:'PENDING'|'COMPLETE'};
export type Assessment={scopeVersion:string;blockers:string[];accessGateVerified:boolean;storage:{bucket:string;path:string;classification:'PERSONAL'|'BUSINESS'|'UNKNOWN'}[]};
export interface Ports {
 // This must lock the same subject that membership/ownership/status writers lock.
 lock<T>(subject:string,work:()=>Promise<T>):Promise<T>;
 reverify(proof:string,action:Action):Promise<{subject:string}>;
 state(subject:string):Promise<State>;
 suspensionReason(subject:string):Promise<'VOLUNTARY'|'ADMIN'|'UNKNOWN'>;
 job(id:string):Promise<Job|null>;
 pendingJob(subject:string):Promise<string|null>;
 assess(subject:string,action:Action):Promise<Assessment>;
 // Atomically append audit/job + deny all data access before any external effect.
 begin(job:Job,next:State,scopeVersion:string):Promise<void>;
 finish(job:Job,next:State):Promise<void>;
 uncertain(job:Job):Promise<void>;
 revokeSessions(subject:string):Promise<void>;
 authIdentity(subject:string):Promise<'PRESENT'|'ABSENT'|'UNKNOWN'>;
 removePersonalObject(subject:string,bucket:string,path:string):Promise<void>;
 verifyPersonalObjectsRemoved(subject:string):Promise<boolean>;
 deleteAuthIdentity(subject:string):Promise<void>;
 // Reactivation changes only subject status; it never recreates former memberships.
}
export class LifecycleWorker {
 constructor(private p:Ports){}
 async request(id:string,action:Action,proof:string){
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))throw Error('INVALID_REQUEST_ID');
  const {subject}=await this.p.reverify(proof,action); // fresh action-bound challenge, not decoded JWT/iAT alone
  if(!subject)throw Error('REVERIFICATION_REQUIRED');
  return this.p.lock(subject,async()=>{
   const old=await this.p.job(id);
   if(old&&(old.subject!==subject||old.action!==action))throw Error('IDEMPOTENCY_CONFLICT');
   if(old?.status==='COMPLETE')return old;
   if(old)throw Error('RESUME_WITH_SERVER_JOB');
   if(await this.p.pendingJob(subject))throw Error('PENDING_OPERATION');
   const state=await this.p.state(subject);
   if(state==='DELETED'||state==='DELETE_PENDING'||state==='AUTH_UNKNOWN')throw Error('ACCOUNT_NOT_ACTIVE');
   if(action==='REACTIVATE'&&state!=='SUSPENDED')throw Error('NOT_SUSPENDED');
   if(action==='REACTIVATE'&&await this.p.suspensionReason(subject)!=='VOLUNTARY')throw Error('NOT_VOLUNTARY');
   if(action==='DEACTIVATE'&&state!=='ACTIVE')throw Error('NOT_ACTIVE');
   const assessment=await this.p.assess(subject,action);
   if(!assessment.accessGateVerified)throw Error('ACCESS_ENFORCEMENT_NOT_VERIFIED');
   if(assessment.blockers.length)throw Error('ACCOUNT_REVIEW_REQUIRED:'+assessment.blockers.join(','));
   if(action==='DELETE'&&assessment.storage.some(x=>x.classification!=='PERSONAL'))throw Error('STORAGE_RETENTION_REQUIRED');
   const job:Job={id,subject,action,status:'PENDING'};
   await this.p.begin(job,action==='DELETE'?'DELETE_PENDING':'SUSPENDED',assessment.scopeVersion);
   // Repository begins must conditionally verify scopeVersion and bind plan to audit.
   if(action==='REACTIVATE'){
    // Old sessions must be revoked before reinstatement, and renewed verified login required.
    await this.p.revokeSessions(subject);await this.p.finish(job,'ACTIVE');return {...job,status:'COMPLETE'};
   }
   await this.p.revokeSessions(subject);
   if(action==='DEACTIVATE'){await this.p.finish(job,'SUSPENDED');return {...job,status:'COMPLETE'};}
   return this.completeDeletion(job,assessment);
  });
 }
 // Private worker entry only, not a user-requested arbitrary subject/email endpoint.
 async resume(jobId:string){
  const record=await this.p.job(jobId);if(!record)throw Error('UNKNOWN_JOB');
  return this.p.lock(record.subject,async()=>{
   const job=await this.p.job(jobId);if(!job)throw Error('UNKNOWN_JOB');
   if(job.status==='COMPLETE')return job;
   if(await this.p.pendingJob(job.subject)!==job.id)throw Error('JOB_NOT_CURRENT');
   const state=await this.p.state(job.subject);
   const allowed=job.action==='DELETE'?['DELETE_PENDING','AUTH_UNKNOWN']:['SUSPENDED'];
   if(!allowed.includes(state))throw Error('INVALID_JOB_STATE');
   if(job.action==='REACTIVATE'&&await this.p.suspensionReason(job.subject)!=='VOLUNTARY')throw Error('NOT_VOLUNTARY');
   const assessment=await this.p.assess(job.subject,job.action);
   if(!assessment.accessGateVerified||assessment.blockers.length)throw Error('ACCOUNT_REVIEW_REQUIRED');
   await this.p.revokeSessions(job.subject);
   if(job.action!=='DELETE'){await this.p.finish(job,job.action==='REACTIVATE'?'ACTIVE':'SUSPENDED');return {...job,status:'COMPLETE'};}
   return this.completeDeletion(job,assessment);
  });
 }
 private async completeDeletion(job:Job,assessment:Assessment){
  if(assessment.storage.some(x=>x.classification!=='PERSONAL'))throw Error('STORAGE_RETENTION_REQUIRED');
  let identity=await this.p.authIdentity(job.subject);
  if(identity==='UNKNOWN')throw Error('AUTH_STATE_UNCERTAIN');
  if(identity==='PRESENT'){
   for(const object of assessment.storage)await this.p.removePersonalObject(job.subject,object.bucket,object.path);
   if(!await this.p.verifyPersonalObjectsRemoved(job.subject))throw Error('STORAGE_CLEANUP_INCOMPLETE');
   // Never automatically repeat a delete after uncertain completion. Resume probes first.
   await this.p.uncertain(job);
   await this.p.deleteAuthIdentity(job.subject);
   identity=await this.p.authIdentity(job.subject);
  }
  if(identity!=='ABSENT')throw Error('AUTH_DELETION_NOT_VERIFIED');
  if(!await this.p.verifyPersonalObjectsRemoved(job.subject))throw Error('STORAGE_CLEANUP_INCOMPLETE');
  await this.p.finish(job,'DELETED');return {...job,status:'COMPLETE'};
 }
}
