import AsyncStorage from "@react-native-async-storage/async-storage";
import { readBrowserQueue, updateBrowserQueue } from "./browserQueueStore";
import type {transactionContext} from '../currency/engine';
import {nativeSaleRequest} from './nativeSaleTransport';

export type PayMethod = "CASH" | "MOBILE" | "BANK" | "CREDIT";

// âœ… Rich queued item (for offline receipt names)
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
  status: "PENDING" | "SENDING" | "SYNCED" | "FAILED" | "NEEDS_REVIEW";
  last_error?: string | null;
  server_sale_id?: string | null;
  // New captures only. Never infer or backfill old queue denomination.
  currency_context?: ReturnType<typeof transactionContext>;
  // Original decimal strings for the new atomic contract. Numeric legacy
  // queue fields are retained for compatibility, never silently upgraded.
  native_payload?: {items:{product_id:string;qty:string;unit_price:string}[];paid_amount:string;discount_value:string|null};

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

    // staff attribution (optional)
    sold_by_membership_id?: string | null;
  };
};

function key(storeId: string) {
  // âœ… A1 FIX: must be template string
  return `zetra_sales_queue_v1:${storeId}`;
}

// Serialize every mutation, including enqueues occurring during synchronization.
const mutationTails = new Map<string, Promise<void>>();
function isBrowser() {
  return typeof window !== "undefined" && typeof window.document !== "undefined";
}

type QueueMutation<T> = { items: SaleQueueItem[]; result: T };

async function mutateQueue<T>(storeId: string, mutation: (items: SaleQueueItem[]) => QueueMutation<T>): Promise<T> {
  if (!storeId.trim()) throw new Error("Queue store id is required");
  const previous = mutationTails.get(storeId) ?? Promise.resolve();
  const operation = previous.then(async () => {
    if (isBrowser()) {
      const legacy = await AsyncStorage.getItem(key(storeId));
      return updateBrowserQueue(key(storeId), legacy, raw => {
        const next = mutation(parseQueue(raw));
        return { value: JSON.stringify(next.items), result: next.result };
      });
    }
    const next = mutation(await listQueue(storeId));
    await AsyncStorage.setItem(key(storeId), JSON.stringify(next.items));
    return next.result;
  });
  const tail = operation.then(() => {}, () => {});
  mutationTails.set(storeId, tail);
  try {
    return await operation;
  } finally {
    if (mutationTails.get(storeId) === tail) mutationTails.delete(storeId);
  }
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object).filter(k => object[k] !== undefined).sort()
      .map(k => `${JSON.stringify(k)}:${stableJson(object[k])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

// âœ… Always return UUID v4-like string (safe for DB uuid columns)
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
  const legacy = await AsyncStorage.getItem(key(storeId));
  const raw = isBrowser() ? await readBrowserQueue(key(storeId), legacy) : legacy;
  return parseQueue(raw);
}

function parseQueue(raw: string | null): SaleQueueItem[] {
  const arr = raw === null ? [] : JSON.parse(raw);
  if (!Array.isArray(arr) || arr.some(x => !x || typeof x !== "object" || Array.isArray(x))) {
    throw new Error("Invalid sales queue data; existing storage was preserved");
  }
  return arr;
}

export async function enqueueSale(
  storeId: string,
  item: Omit<SaleQueueItem, "id" | "status" | "created_at">
) {
  if(item.native_payload)nativeSaleRequest(item as SaleQueueItem);
  if (!Array.isArray(item.payload.items) || item.payload.items.length === 0 ||
      item.payload.items.some(it => !it.product_id || !Number.isFinite(it.qty) || it.qty <= 0 ||
        !Number.isFinite(it.unit_price) || it.unit_price < 0) ||
      !Number.isFinite(item.payload.paid_amount) || item.payload.paid_amount < 0 ||
      !Number.isFinite(item.payload.credit_balance) || item.payload.credit_balance < 0) {
    throw new Error("Invalid queued sale quantities or amounts; nothing was saved");
  }
  return mutateQueue(storeId, q => {
  if (item.store_id !== storeId || !item.client_sale_id.trim()) {
    throw new Error("Queue operation identity does not match its store");
  }
  const existing = q.find(x => x.client_sale_id === item.client_sale_id);
  if (existing) {
    if (existing.store_id !== item.store_id || stableJson(existing.payload) !== stableJson(item.payload)||stableJson(existing.currency_context)!==stableJson(item.currency_context)||stableJson(existing.native_payload)!==stableJson(item.native_payload)) {
      throw new Error("Queued sale identifier already belongs to a different payload");
    }
    return { items: q, result: existing };
  }
  const next: SaleQueueItem = {
    ...item,
    id: makeId(),
    status: "PENDING",
    created_at: new Date().toISOString(),
    last_error: null,
  };
  q.unshift(next);
  return { items: q, result: next };
  });
}

export async function markStatus(
  storeId: string,
  id: string,
  patch: Partial<SaleQueueItem>
) {
  return mutateQueue(storeId, q => {
  const existing = q.find(x => x.id === id);
  if (existing && ((patch.id !== undefined && patch.id !== existing.id) ||
    (patch.client_sale_id !== undefined && patch.client_sale_id !== existing.client_sale_id) ||
    (patch.store_id !== undefined && patch.store_id !== existing.store_id))) {
    throw new Error("Queued sale identifiers cannot be changed");
  }
  if (existing && patch.payload !== undefined && stableJson(patch.payload) !== stableJson(existing.payload)) {
    throw new Error("Queued sale financial payload cannot be changed by a status update");
  }
  if(existing&&Object.prototype.hasOwnProperty.call(patch,'currency_context')&&stableJson(patch.currency_context)!==stableJson(existing.currency_context))throw Error('Queued sale currency snapshot cannot be changed');
  if(existing&&Object.prototype.hasOwnProperty.call(patch,'native_payload')&&stableJson(patch.native_payload)!==stableJson(existing.native_payload))throw Error('Queued exact native amounts cannot be changed');
  const next = q.map((x) => (x.id === id ? { ...x, ...patch } : x));
  return { items: next, result: undefined };
  });
}

export async function removeFromQueue(storeId: string, id: string) {
  return mutateQueue(storeId, q => {
  return { items: q.filter((x) => x.id !== id), result: undefined };
  });
}

// âœ… USED by history.tsx
export async function listPending(storeId: string): Promise<SaleQueueItem[]> {
  const q = await listQueue(storeId);
  return q.filter((x) => x.status !== "SYNCED");
}

export async function countPending(storeId: string) {
  const q = await listQueue(storeId);
  return q.filter((x) => x.status !== "SYNCED").length;
}

// âœ… NEW: used by offline-receipt.tsx
export async function getQueuedSaleByClientId(storeId: string, clientSaleId: string) {
  const cid = String(clientSaleId ?? "").trim();
  if (!storeId || !cid) return null;

  const q = await listQueue(storeId);
  const found = q.find((x) => String(x?.client_sale_id ?? "").trim() === cid);
  return found ?? null;
}

// Claim inside the same storage transaction used by enqueue/status mutations.
// Interrupted SENDING records stay pending for review; no unverified RPC replay.
export async function claimQueuedSale(storeId: string, id: string): Promise<SaleQueueItem | null> {
  return mutateQueue(storeId, items => {
    const index = items.findIndex(item => item.id === id);
    if (index < 0 || !["PENDING", "FAILED"].includes(items[index].status)) {
      return { items, result: null };
    }
    const claimed = { ...items[index], status: "SENDING" as const, last_error: null };
    const next = [...items]; next[index] = claimed;
    return { items: next, result: claimed };
  });
}
