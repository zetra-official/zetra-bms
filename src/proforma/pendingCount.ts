import type {PageRow} from './client';
/** Bounded existing authorized history API. Never report a partial page count as a total. */
export async function pendingCount(page:(signal:AbortSignal,before:string|null)=>Promise<{rows:PageRow[];nextBefore:string|null}>,signal:AbortSignal):Promise<number|null>{
 let before:string|null=null,count=0;const seen=new Set<string>();
 for(let n=0;n<4;n++){
  const result=await page(signal,before);if(signal.aborted)return null;
  for(const row of result.rows){if(seen.has(row.id))return null;seen.add(row.id);if(row.status==='DRAFT'||row.status==='PENDING'||row.status==='ACCEPTED')count++}
  if(!result.nextBefore)return count;
  if(result.nextBefore===before)return null;before=result.nextBefore;
 }return null;
}
