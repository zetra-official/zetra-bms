// src/ai/snapshot.ts
import { kv } from "../storage/kv";

export type BizSnapshot = {
  businessType?: string; // retail/wholesale/service/restaurant etc
  currency?: string; // TZS by default
  targetMarginPct?: number; // e.g. 20
  monthlyFixedCosts?: number; // e.g. rent + salaries
  typicalDailySales?: string; // e.g. "200k-500k"
  notes?: string; // free text
  updatedAt?: number;
};

const KEY_PREFIX = "zetra_ai_snapshot_v1:";

function key(orgId: string) {
  return `${KEY_PREFIX}${orgId}`;
}

export async function getSnapshot(orgId: string): Promise<BizSnapshot | null> {
  try {
    const raw = await kv.getString(key(orgId));
    if (!raw) return null;
    const obj = JSON.parse(raw);
    if (!obj || typeof obj !== "object") return null;
    return obj as BizSnapshot;
  } catch {
    return null;
  }
}

export async function setSnapshot(orgId: string, snap: BizSnapshot): Promise<void> {
  const next: BizSnapshot = {
    ...snap,
    updatedAt: Date.now(),
  };
  await kv.setString(key(orgId), JSON.stringify(next));
}

export async function clearSnapshot(orgId: string): Promise<void> {
  await kv.setString(key(orgId), "");
}