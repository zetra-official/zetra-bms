/** A deadline never cancels or retries a financial request. Caller retains its durable attempt marker. */
export async function withCheckoutDeadline<T>(task:PromiseLike<T>,message:string,milliseconds=30000):Promise<T>{
 let timer:ReturnType<typeof setTimeout>|undefined;
 try{return await Promise.race([Promise.resolve(task),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error(message)),milliseconds)})]);}
 finally{if(timer!==undefined)clearTimeout(timer)}
}
export function permitsPriceAdjustment(storeType:unknown){return storeType==='STANDARD'||storeType==='PRECISION_RETAIL'}
