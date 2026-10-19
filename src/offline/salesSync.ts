import {BOUND_SETTLEMENT_ACTIVE,boundSaleRequest,verifyBoundSaleOutcome} from '../currency/settlementBindings';
import { supabase } from "../supabase/supabaseClient";
import { listQueue, markStatus, removeFromQueue, claimQueuedSale } from "./salesQueue";
import {readAccountingAuthority,assertLegacyPostingCurrency} from '../currency/accounting';
import {transactionContext} from '../currency/engine';
import {NATIVE_SALE_PERSISTENCE_ACTIVE,nativeSaleRequest,verifyNativeSaleOutcome} from './nativeSaleTransport';

// ✅ A2: Per-store mutex lock to prevent double-sync (history + sales screen effects)
const inflightByStore = new Map<string, Promise<void>>();

export async function syncSalesQueueOnce(storeId: string) {
  if (!storeId) return;

  // If a sync is already running for this store, await it (no duplicate work)
  const existing = inflightByStore.get(storeId);
  if (existing) {
    await existing;
    return;
  }

  const job = (async () => {
    const q = await listQueue(storeId);
    const pending = q.filter((x) => x.status === "PENDING" || x.status === "FAILED" || (NATIVE_SALE_PERSISTENCE_ACTIVE&&!!x.currency_context&&x.status==='NEEDS_REVIEW'));

    for (const candidate of pending) {
      if(NATIVE_SALE_PERSISTENCE_ACTIVE&&candidate.currency_context&&candidate.status==='NEEDS_REVIEW'){
        // Recover a committed response through an actor-scoped read, not by
        // blindly submitting another sale or replaying credit side effects.
        try{const receipt=await supabase.rpc(BOUND_SETTLEMENT_ACTIVE?'get_bound_financial_result_v1':'get_native_sale_result_v1',{p_store_id:storeId,p_request_id:candidate.client_sale_id});
          if(!receipt.error&&receipt.data){const saleId=BOUND_SETTLEMENT_ACTIVE?verifyBoundSaleOutcome(candidate,receipt.data):verifyNativeSaleOutcome(candidate,receipt.data);await markStatus(storeId,candidate.id,{server_sale_id:saleId,status:'SYNCED',last_error:null});await removeFromQueue(storeId,candidate.id)}
        }catch{/* Keep uncertain items intact for explicit reconciliation. */}
        continue;
      }
      const item = await claimQueuedSale(storeId, candidate.id);
      if (!item) continue;
      let rpcStarted = false;

      try {
        const p = item.payload;
        if(item.currency_context){
          const original=item.currency_context;
          const scope=await supabase.from('stores').select('organization_id').eq('id',item.store_id).single();
          if(scope.error||scope.data?.organization_id!==original.organizationId)throw Error('CURRENCY_TENANT_MISMATCH');
          const current=await readAccountingAuthority(supabase,original.organizationId);
          if(!current||current.currency!==original.currency||current.revision!==original.contextRevision)throw Error('OFFLINE_CURRENCY_REVIEW_REQUIRED');
          if(!NATIVE_SALE_PERSISTENCE_ACTIVE)assertLegacyPostingCurrency(current);
          const expected=transactionContext(original.amount,current.currency,current,current.organizationId);
          if(original.source!=='TRANSACTION_RECORD'||original.accountingCurrency!==expected.accountingCurrency||original.exchangeRate!=='1'||original.rateSource!==expected.rateSource||original.displayRateUsed!==false)throw Error('INVALID_OFFLINE_CURRENCY_CONTEXT');
        }
        if(NATIVE_SALE_PERSISTENCE_ACTIVE){
          const args=BOUND_SETTLEMENT_ACTIVE?boundSaleRequest(item):nativeSaleRequest(item);rpcStarted=true;
          const result=BOUND_SETTLEMENT_ACTIVE?await supabase.rpc('post_bound_financial_v1',args):await supabase.rpc('create_native_sale_v1',args);
          if(result.error)throw result.error;
          const saleId=BOUND_SETTLEMENT_ACTIVE?verifyBoundSaleOutcome(item,result.data):verifyNativeSaleOutcome(item,result.data);
          // Server transaction already includes credit. Never replay separate
          // client credit/account writes after this atomic outcome.
          await markStatus(storeId,item.id,{server_sale_id:saleId,status:'SYNCED',last_error:null});
          await removeFromQueue(storeId,item.id);continue;
        }

        // ✅ IMPORTANT: send SAFE items only -> RPC stability
        const safeItems = (Array.isArray(p?.items) ? p.items : []).map((it: any) => ({
          product_id: String(it?.product_id ?? ""),
          qty: Number(Number(it?.qty ?? 0).toFixed(3)),
          unit_price: Number(it?.unit_price ?? 0),
        }));

        rpcStarted = true;
        const res = await supabase.rpc("create_sale_with_payment_v6", {
          p_store_id: item.store_id,
          p_items: safeItems,
          p_note: p.note,

          p_payment_method: p.payment_method,
          p_paid_amount: p.paid_amount,
          p_payment_channel: p.payment_channel,
          p_reference: p.reference,

          p_customer_id: null,
          p_customer_phone: p.customer_phone ?? null,
p_customer_full_name: p.customer_name ?? null,

          p_discount_type: p.discount_type,
          p_discount_value: p.discount_value,
          p_discount_note: p.discount_note,

          p_client_sale_id: item.client_sale_id, // must be UUID string
          p_sold_by_membership_id: p.sold_by_membership_id ?? null,
        } as any);

        if (res.error) throw res.error;

        const row = Array.isArray(res.data) ? (res.data[0] ?? null) : res.data;
        const saleId: string | null = row?.sale_id ? String(row.sale_id) : null;

        if (!saleId) throw new Error("Sale outcome unconfirmed; verify history before retrying");
        await markStatus(storeId, item.id, { server_sale_id: saleId });

        // Credit remains a separate, unverified transaction; never blindly replay it.
        if (p.is_credit && p.credit_balance > 0) {
          const acc = await supabase.rpc("create_credit_account_v2", {
            p_store_id: item.store_id,
            p_customer_name: p.customer_name,
            p_phone: p.customer_phone,
          } as any);
          if (acc.error) throw acc.error;

          const d: any = acc.data;
          const accountId =
            typeof d === "string"
              ? d
              : Array.isArray(d)
              ? d?.[0]?.id ?? d?.[0]?.credit_account_id
              : d?.id ?? d?.credit_account_id;

          if (!accountId) throw new Error("credit account id missing");

          const credit = await supabase.rpc("record_credit_sale_v2", {
            p_store_id: item.store_id,
            p_credit_account_id: String(accountId),
            p_amount: Number(p.credit_balance),
            p_note: p.note ?? null,
            p_reference: saleId ?? null,
          } as any);
          if (credit.error) throw credit.error;
        }

        await markStatus(storeId, item.id, { status: "SYNCED", last_error: null });
        await removeFromQueue(storeId, item.id);
      } catch (e: any) {
        await markStatus(storeId, item.id, {
          status: rpcStarted ? "NEEDS_REVIEW" : "FAILED",
          last_error: e?.message ?? "Sync failed",
        });

        // stop early to avoid spamming when server down
        break;
      }
    }
  })();

  inflightByStore.set(storeId, job);

  try {
    await job;
  } finally {
    // Always release lock
    if (inflightByStore.get(storeId) === job) inflightByStore.delete(storeId);
  }
}
