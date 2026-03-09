// src/ai/subscription.ts
import { supabase } from "../supabase/supabaseClient";
import { kv } from "../storage/kv";

const KEY_PRO_ORG_IDS = "zetra_ai_pro_org_ids_v1";
const KEY_PRO_UNTIL_PREFIX = "zetra_ai_pro_until_v1:"; // legacy local override per-org timestamp (ms)

// ✅ small cache for DB subscription snapshot (fast + stable)
const KEY_AI_PLAN_SNAPSHOT_PREFIX = "zetra_ai_plan_snapshot_v2:"; // per-org JSON
const SNAPSHOT_TTL_MS = 60 * 1000; // 1 minute

type DbSubRow = {
  plan_code?: string | null;
  code?: string | null;

  plan_name?: string | null;
  name?: string | null;

  status?: string | null;
  expires_at?: string | null;
  started_at?: string | null;
  end_at?: string | null;
  start_at?: string | null;

  ai_enabled?: boolean | null;
  ai_credits_monthly?: number | null;

  max_organizations?: number | null;
  max_stores?: number | null;
  max_staff?: number | null;
  business_club_posts_per_store_month?: number | null;

  [k: string]: any;
};

export type AiSubscriptionSnapshot = {
  orgId: string;
  planCode: string;
  planName: string;
  status: string;
  aiEnabled: boolean;
  aiCreditsMonthly: number;
  maxOrganizations: number | null;
  maxStores: number | null;
  maxStaff: number | null;
  businessClubPostsPerStoreMonth: number | null;
  startedAt: string;
  expiresAt: string;
  fetchedAt: number;
};

function now() {
  return Date.now();
}

function clean(v: any) {
  return String(v ?? "").trim();
}

function upper(v: any) {
  return clean(v).toUpperCase();
}

function toNum(v: any): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function toBool(v: any): boolean {
  return v === true || v === "true" || v === 1 || v === "1";
}

function isValidMonths(n: number) {
  return n === 1 || n === 3 || n === 6 || n === 12;
}

/**
 * Last moment of a given month (23:59 local time).
 * monthIndex is JS Date month index (0..11).
 */
function monthEndLocal2359(year: number, monthIndex: number) {
  return new Date(year, monthIndex + 1, 0, 23, 59, 0, 0).getTime();
}

function computeUntilTs(existingUntil: number, planMonths: number) {
  const tNow = now();
  const extending = Number(existingUntil) > tNow;

  const anchor = new Date(extending ? existingUntil : tNow);
  const y = anchor.getFullYear();
  const m = anchor.getMonth();

  const add = extending ? planMonths : planMonths - 1;

  const target = new Date(y, m + add, 1);
  return monthEndLocal2359(target.getFullYear(), target.getMonth());
}

/* =========================================================
   LEGACY LOCAL OVERRIDE SUPPORT
   - kept to avoid breaking older payment/activation flows
   ========================================================= */

async function getProOrgIds(): Promise<string[]> {
  try {
    const raw = await kv.getString(KEY_PRO_ORG_IDS);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.filter((x) => typeof x === "string");
  } catch {
    return [];
  }
}

async function setProOrgIds(arr: string[]): Promise<void> {
  await kv.setString(KEY_PRO_ORG_IDS, JSON.stringify(arr));
}

export async function getProUntilForOrg(orgId: string): Promise<number> {
  if (!orgId) return 0;
  try {
    const raw = await kv.getString(`${KEY_PRO_UNTIL_PREFIX}${orgId}`);
    const n = Number(raw ?? 0);
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

async function setProUntilForOrg(orgId: string, untilTs: number): Promise<void> {
  if (!orgId) return;
  const n = Number(untilTs ?? 0);
  const safe = Number.isFinite(n) ? n : 0;
  await kv.setString(`${KEY_PRO_UNTIL_PREFIX}${orgId}`, String(safe));
}

async function clearProUntilForOrg(orgId: string): Promise<void> {
  if (!orgId) return;
  await kv.setString(`${KEY_PRO_UNTIL_PREFIX}${orgId}`, "0");
}

async function isLegacyOverrideActive(orgId: string): Promise<boolean> {
  if (!orgId) return false;

  const arr = await getProOrgIds();
  const has = arr.includes(orgId);
  if (!has) return false;

  const until = await getProUntilForOrg(orgId);

  if (until > 0 && now() > until) {
    await setProForOrg(orgId, false);
    return false;
  }

  if (until <= 0) {
    const fixed = computeUntilTs(0, 1);
    await setProUntilForOrg(orgId, fixed);
  }

  return true;
}

/* =========================================================
   DB SNAPSHOT CACHE
   ========================================================= */

function snapshotKey(orgId: string) {
  return `${KEY_AI_PLAN_SNAPSHOT_PREFIX}${orgId}`;
}

async function readSnapshot(orgId: string): Promise<AiSubscriptionSnapshot | null> {
  if (!orgId) return null;
  try {
    const raw = await kv.getString(snapshotKey(orgId));
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;

    const snap: AiSubscriptionSnapshot = {
      orgId: clean(parsed.orgId || orgId),
      planCode: upper(parsed.planCode),
      planName: clean(parsed.planName),
      status: upper(parsed.status),
      aiEnabled: !!parsed.aiEnabled,
      aiCreditsMonthly: Math.max(0, Number(parsed.aiCreditsMonthly ?? 0) || 0),
      maxOrganizations: toNum(parsed.maxOrganizations),
      maxStores: toNum(parsed.maxStores),
      maxStaff: toNum(parsed.maxStaff),
      businessClubPostsPerStoreMonth: toNum(parsed.businessClubPostsPerStoreMonth),
      startedAt: clean(parsed.startedAt),
      expiresAt: clean(parsed.expiresAt),
      fetchedAt: Number(parsed.fetchedAt ?? 0) || 0,
    };

    return snap;
  } catch {
    return null;
  }
}

async function writeSnapshot(orgId: string, snap: AiSubscriptionSnapshot): Promise<void> {
  if (!orgId) return;
  await kv.setString(snapshotKey(orgId), JSON.stringify(snap));
}

function isFreshSnapshot(snap: AiSubscriptionSnapshot | null) {
  if (!snap) return false;
  return now() - Number(snap.fetchedAt || 0) <= SNAPSHOT_TTL_MS;
}

function normalizeDbSubRow(orgId: string, row: DbSubRow | null): AiSubscriptionSnapshot | null {
  if (!row) return null;

  const planCode = upper(row.plan_code ?? row.code);
  const planName = clean(row.plan_name ?? row.name ?? planCode);
  const status = upper(row.status);
  const aiEnabled = toBool(row.ai_enabled);
  const aiCreditsMonthly = Math.max(0, Number(row.ai_credits_monthly ?? 0) || 0);

  return {
    orgId: clean(orgId),
    planCode: planCode || "FREE",
    planName: planName || "FREE",
    status: status || "INACTIVE",
    aiEnabled,
    aiCreditsMonthly,
    maxOrganizations: toNum(row.max_organizations),
    maxStores: toNum(row.max_stores),
    maxStaff: toNum(row.max_staff),
    businessClubPostsPerStoreMonth: toNum(row.business_club_posts_per_store_month),
    startedAt: clean(row.started_at ?? row.start_at),
    expiresAt: clean(row.expires_at ?? row.end_at),
    fetchedAt: now(),
  };
}

/* =========================================================
   DB READ
   ========================================================= */

async function fetchSubscriptionFromDb(orgId: string): Promise<AiSubscriptionSnapshot | null> {
  if (!orgId) return null;

  // 1) primary RPC
  try {
    const { data, error } = await supabase.rpc("get_my_subscription", {
      p_org_id: orgId,
    } as any);

    if (!error) {
      const row = (Array.isArray(data) ? data?.[0] : data) as DbSubRow | null;
      const snap = normalizeDbSubRow(orgId, row);
      if (snap) {
        await writeSnapshot(orgId, snap);
        return snap;
      }
    }
  } catch {}

  // 2) fallback RPC
  try {
    const { data, error } = await supabase.rpc("get_org_subscription", {
      p_org_id: orgId,
    } as any);

    if (!error) {
      const row = (Array.isArray(data) ? data?.[0] : data) as DbSubRow | null;
      const snap = normalizeDbSubRow(orgId, row);
      if (snap) {
        await writeSnapshot(orgId, snap);
        return snap;
      }
    }
  } catch {}

  return null;
}

/* =========================================================
   PUBLIC HELPERS
   ========================================================= */

export async function getAiSubscriptionSnapshotForOrg(
  orgId: string,
  opts?: { forceRefresh?: boolean }
): Promise<AiSubscriptionSnapshot | null> {
  const safeOrgId = clean(orgId);
  if (!safeOrgId) return null;

  const forceRefresh = !!opts?.forceRefresh;

  if (!forceRefresh) {
    const cached = await readSnapshot(safeOrgId);
    if (isFreshSnapshot(cached)) return cached;
  }

  const dbSnap = await fetchSubscriptionFromDb(safeOrgId);
  if (dbSnap) return dbSnap;

  // final fallback: stale cache is better than nothing
  const stale = await readSnapshot(safeOrgId);
  return stale;
}

export async function getPlanCodeForOrg(orgId: string): Promise<string> {
  const snap = await getAiSubscriptionSnapshotForOrg(orgId);
  return upper(snap?.planCode || "FREE");
}

export async function getPlanNameForOrg(orgId: string): Promise<string> {
  const snap = await getAiSubscriptionSnapshotForOrg(orgId);
  return clean(snap?.planName || snap?.planCode || "FREE");
}

export async function getAiCreditsMonthlyForOrg(orgId: string): Promise<number> {
  const snap = await getAiSubscriptionSnapshotForOrg(orgId);
  if (!snap) return 0;
  if (!snap.aiEnabled) return 0;
  return Math.max(0, Number(snap.aiCreditsMonthly ?? 0) || 0);
}

/**
 * IMPORTANT:
 * We keep the old exported name `isProActiveForOrg`
 * so app code does NOT break.
 *
 * New meaning:
 * - returns TRUE when AI is enabled for the org's active plan
 * - OR when legacy local override is active
 * - OR when dev bypass is enabled
 */
export async function isProActiveForOrg(orgId: string): Promise<boolean> {
  const safeOrgId = clean(orgId);
  if (!safeOrgId) return false;

  const bypass = clean(process.env.EXPO_PUBLIC_AI_DEV_BYPASS).toLowerCase();
  if (bypass === "1" || bypass === "true") return true;

  // legacy local override still supported
  if (await isLegacyOverrideActive(safeOrgId)) return true;

  const snap = await getAiSubscriptionSnapshotForOrg(safeOrgId);
  if (!snap) return false;

  const status = upper(snap.status);
  const activeStatus =
    status === "ACTIVE" ||
    status === "PAID" ||
    status === "TRIAL" ||
    status === "CURRENT";

  return activeStatus && !!snap.aiEnabled;
}

/**
 * Legacy compatibility:
 * Existing flows may still call this after payment.
 * We keep it alive as a temporary local override layer.
 *
 * NOTE:
 * DB subscription remains source of truth.
 * This is only a safe compatibility fallback.
 */
export async function setProForOrg(
  orgId: string,
  isPro: boolean,
  planMonths: 1 | 3 | 6 | 12 = 1
) {
  const safeOrgId = clean(orgId);
  if (!safeOrgId) return;

  let arr = await getProOrgIds();
  const has = arr.includes(safeOrgId);

  if (isPro) {
    const months = isValidMonths(planMonths) ? planMonths : 1;
    if (!has) arr.push(safeOrgId);

    const currentUntil = await getProUntilForOrg(safeOrgId);
    const nextUntil = computeUntilTs(currentUntil, months);
    await setProUntilForOrg(safeOrgId, nextUntil);
  } else {
    if (has) arr = arr.filter((x) => x !== safeOrgId);
    await clearProUntilForOrg(safeOrgId);
  }

  await setProOrgIds(arr);
}

/**
 * Optional utility:
 * clear cached DB snapshot for an org
 */
export async function clearAiSubscriptionSnapshotForOrg(orgId: string): Promise<void> {
  const safeOrgId = clean(orgId);
  if (!safeOrgId) return;
  await kv.setString(snapshotKey(safeOrgId), "");
}