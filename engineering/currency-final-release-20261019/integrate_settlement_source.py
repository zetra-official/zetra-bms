from pathlib import Path
import shutil
R=Path.cwd();E=Path(__file__).resolve().parent;before=E/'before-1910'
for rel in ['src/offline/salesQueue.ts','src/offline/salesSync.ts']:
 p=R/rel;dest=before/rel;dest.parent.mkdir(parents=True,exist_ok=True);assert not dest.exists(),'PRESERVE_SOURCE_PREIMAGE';shutil.copy2(p,dest)
p=R/'src/offline/salesQueue.ts';s=p.read_text(encoding='utf-8');s="import {boundSaleRequest,type SettlementContext} from '../currency/settlementBindings';\n"+s
s=s.replace('  native_payload?:','  settlement_context?: SettlementContext;\n  native_payload?:',1)
s=s.replace('  if(item.native_payload)nativeSaleRequest(item as SaleQueueItem);','  if(item.native_payload)nativeSaleRequest(item as SaleQueueItem);\n  if(item.settlement_context)boundSaleRequest(item as SaleQueueItem);',1)
s=s.replace('stableJson(existing.native_payload)!==stableJson(item.native_payload))','stableJson(existing.native_payload)!==stableJson(item.native_payload)||stableJson(existing.settlement_context)!==stableJson(item.settlement_context))',1)
mark="  const next = q.map((x) => (x.id === id ? { ...x, ...patch } : x));";assert mark in s;s=s.replace(mark,"  if(existing&&Object.prototype.hasOwnProperty.call(patch,'settlement_context')&&stableJson(patch.settlement_context)!==stableJson(existing.settlement_context))throw Error('Queued settlement context cannot be changed');\n"+mark,1);p.write_text(s,encoding='utf-8')
p=R/'src/offline/salesSync.ts';s=p.read_text(encoding='utf-8');s="import {BOUND_SETTLEMENT_ACTIVE,boundSaleRequest,verifyBoundSaleOutcome} from '../currency/settlementBindings';\n"+s
a="          const args=nativeSaleRequest(item);rpcStarted=true;\n          const result=await supabase.rpc('create_native_sale_v1',args);\n          if(result.error)throw result.error;\n          const saleId=verifyNativeSaleOutcome(item,result.data);";assert a in s
b="          const args=BOUND_SETTLEMENT_ACTIVE?boundSaleRequest(item):nativeSaleRequest(item);rpcStarted=true;\n          const result=BOUND_SETTLEMENT_ACTIVE?await supabase.rpc('post_bound_financial_v1',args):await supabase.rpc('create_native_sale_v1',args);\n          if(result.error)throw result.error;\n          const saleId=BOUND_SETTLEMENT_ACTIVE?verifyBoundSaleOutcome(item,result.data):verifyNativeSaleOutcome(item,result.data);";s=s.replace(a,b,1);p.write_text(s,encoding='utf-8')
