import {loadReferenceRates,type ReferenceRates} from '../services/referenceFx';
export type RateState={evidence:ReferenceRates|null;loading:boolean;error:boolean};
/** Public reference data only; no tenant amounts, sessions or financial records.
 * Deduplicates simultaneous requests. Never substitutes 1 or renews stale dates.
 */
export class ReferenceRateStore{
 private state:RateState={evidence:null,loading:false,error:false};
 private pending:Promise<void>|null=null;
 private listeners=new Set<()=>void>();
 constructor(private load:()=>Promise<ReferenceRates>=loadReferenceRates){}
 getSnapshot=()=>this.state;
 subscribe=(listener:()=>void)=>{this.listeners.add(listener);return()=>{this.listeners.delete(listener)}};
 private publish(next:RateState){this.state=next;for(const listener of this.listeners)listener()}
 refresh():Promise<void>{
  if(this.pending)return this.pending;
  this.pending=Promise.resolve().then(this.load).then(evidence=>this.publish({evidence,loading:false,error:false}),()=>this.publish({...this.state,loading:false,error:true})).finally(()=>{this.pending=null});
  this.publish({...this.state,loading:true,error:false});
  return this.pending;
 }
}
export const referenceRateStore=new ReferenceRateStore();
