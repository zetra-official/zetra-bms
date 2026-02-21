// src/ai/subscription.ts
import { kv } from "../storage/kv";

const KEY_PRO_ORG_IDS = "zetra_ai_pro_org_ids_v1";
const KEY_PRO_UNTIL_PREFIX = "zetra_ai_pro_until_v1:"; // per-org timestamp (ms)

function now() {
  return Date.now();
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

export async function isProActiveForOrg(orgId: string): Promise<boolean> {
  if (!orgId) return false;

  const bypass = String(process.env.EXPO_PUBLIC_AI_DEV_BYPASS ?? "").trim();
  if (bypass === "1" || bypass.toLowerCase() === "true") return true;

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

export async function setProForOrg(orgId: string, isPro: boolean, planMonths: 1 | 3 | 6 | 12 = 1) {
  if (!orgId) return;

  let arr = await getProOrgIds();
  const has = arr.includes(orgId);

  if (isPro) {
    const months = isValidMonths(planMonths) ? planMonths : 1;
    if (!has) arr.push(orgId);

    const currentUntil = await getProUntilForOrg(orgId);
    const nextUntil = computeUntilTs(currentUntil, months);
    await setProUntilForOrg(orgId, nextUntil);
  } else {
    if (has) arr = arr.filter((x) => x !== orgId);
    await clearProUntilForOrg(orgId);
  }

  await setProOrgIds(arr);
}