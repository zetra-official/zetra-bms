import AsyncStorage from "@react-native-async-storage/async-storage";

export type PayMethod = "CASH" | "MOBILE" | "BANK" | "CREDIT";

// ✅ Rich queued item (for offline receipt names)
// NOTE: sync will still send SAFE subset to DB (handled in salesSync)
export type QueuedItem = {
  product_id: string;
  qty: number;
  unit_price: number;

  // optional metadata for offline receipt display
  name?: string | null;
  sku?: string | null;
  unit?: string | null;
};

export type SaleQueueItem = {
  id: string; // local queue id
  client_sale_id: string; // idempotency key -> goes to DB (UUID string)
  store_id: string;
  created_at: string; // ISO
  status: "PENDING" | "SENDING" | "SYNCED" | "FAILED";
  last_error?: string | null;

  payload: {
    items: QueuedItem[];
    note: string | null;

    payment_method: PayMethod;
    paid_amount: number;
    payment_channel: string | null;
    reference: string | null;

    discount_type: "PERCENT" | "FIXED" | null;
    discount_value: number | null;
    discount_note: string | null;

    // customer/credit
    is_credit: boolean;
    customer_name: string | null;
    customer_phone: string | null;
    credit_balance: number; // 0 if none
  };
};

function key(storeId: string) {
  // ✅ A1 FIX: must be template string
  return `zetra_sales_queue_v1:${storeId}`;
}

// ✅ Always return UUID v4-like string (safe for DB uuid columns)
export function makeId() {
  const g: any = globalThis as any;
  if (g?.crypto?.randomUUID) return g.crypto.randomUUID();

  // fallback UUID v4-like generator
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export async function listQueue(storeId: string): Promise<SaleQueueItem[]> {
  const raw = await AsyncStorage.getItem(key(storeId));
  const arr = raw ? JSON.parse(raw) : [];
  return Array.isArray(arr) ? arr : [];
}

async function writeQueue(storeId: string, items: SaleQueueItem[]) {
  await AsyncStorage.setItem(key(storeId), JSON.stringify(items ?? []));
}

export async function enqueueSale(
  storeId: string,
  item: Omit<SaleQueueItem, "id" | "status" | "created_at">
) {
  const q = await listQueue(storeId);
  const next: SaleQueueItem = {
    ...item,
    id: makeId(),
    status: "PENDING",
    created_at: new Date().toISOString(),
    last_error: null,
  };
  q.unshift(next);
  await writeQueue(storeId, q);
  return next;
}

export async function markStatus(
  storeId: string,
  id: string,
  patch: Partial<SaleQueueItem>
) {
  const q = await listQueue(storeId);
  const next = q.map((x) => (x.id === id ? { ...x, ...patch } : x));
  await writeQueue(storeId, next);
}

export async function removeFromQueue(storeId: string, id: string) {
  const q = await listQueue(storeId);
  await writeQueue(storeId, q.filter((x) => x.id !== id));
}

// ✅ USED by history.tsx
export async function listPending(storeId: string): Promise<SaleQueueItem[]> {
  const q = await listQueue(storeId);
  return q.filter((x) => x.status !== "SYNCED");
}

export async function countPending(storeId: string) {
  const q = await listQueue(storeId);
  return q.filter((x) => x.status !== "SYNCED").length;
}

// ✅ NEW: used by offline-receipt.tsx
export async function getQueuedSaleByClientId(storeId: string, clientSaleId: string) {
  const cid = String(clientSaleId ?? "").trim();
  if (!storeId || !cid) return null;

  const q = await listQueue(storeId);
  const found = q.find((x) => String(x?.client_sale_id ?? "").trim() === cid);
  return found ?? null;
}