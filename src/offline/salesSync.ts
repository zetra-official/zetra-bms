import { supabase } from "../supabase/supabaseClient";
import { listQueue, markStatus, removeFromQueue } from "./salesQueue";

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
    const pending = q.filter((x) => x.status === "PENDING" || x.status === "FAILED");

    for (const item of pending) {
      await markStatus(storeId, item.id, { status: "SENDING", last_error: null });

      try {
        const p = item.payload;

        // ✅ IMPORTANT: send SAFE items only -> RPC stability
        const safeItems = (Array.isArray(p?.items) ? p.items : []).map((it: any) => ({
          product_id: String(it?.product_id ?? ""),
          qty: Math.trunc(Number(it?.qty ?? 0)),
          unit_price: Number(it?.unit_price ?? 0),
        }));

        const res = await supabase.rpc("create_sale_with_payment_v3", {
          p_store_id: item.store_id,
          p_items: safeItems,
          p_note: p.note,

          p_payment_method: p.payment_method,
          p_paid_amount: p.paid_amount,
          p_payment_channel: p.payment_channel,
          p_reference: p.reference,

          p_customer_id: null,
          p_customer_phone: null,
          p_customer_full_name: null,

          p_discount_type: p.discount_type,
          p_discount_value: p.discount_value,
          p_discount_note: p.discount_note,

          p_client_sale_id: item.client_sale_id, // must be UUID string
        } as any);

        if (res.error) throw res.error;

        const row = Array.isArray(res.data) ? (res.data[0] ?? null) : res.data;
        const saleId: string | null = row?.sale_id ? String(row.sale_id) : null;

        // credit sync (best-effort)
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
          status: "FAILED",
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