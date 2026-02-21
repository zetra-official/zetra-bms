// src/ai/subGate.ts
import { kv } from "../storage/kv";
import type { DetectedLang } from "./lang";
import type { PlayContext } from "./playbook";
import { getProUntilForOrg, isProActiveForOrg } from "./subscription";

type BeginResult = {
  ok: boolean;
  refusal?: string;
  release: () => void;
};

// AI-SUB-GATE-1 approved limits
const LIMITS = {
  textInputChars: 12_000,
  outTokens: 1200, // approximate clamp
  perMinutePerOrg: 10,
  concurrencyPerOrg: 2,
  imagesPerMonthPerOrg: 30,
};

const KEY_IMG_MONTH_PREFIX = "zetra_ai_img_month_v1:";

/** In-memory counters (device-local) */
const inflight = new Map<string, number>();
const windowTs = new Map<string, number[]>(); // timestamps per org for rate window

function now() {
  return Date.now();
}

function isOwnerOrAdmin(role?: string | null) {
  const r = String(role ?? "").toLowerCase();
  return r === "owner" || r === "admin";
}

function mixed(sw: string, en: string) {
  return `🇹🇿 Kiswahili:\n${sw}\n\n🇬🇧 English:\n${en}`;
}

function fmtLocal(ts: number) {
  if (!ts || ts <= 0) return "—";
  try {
    const d = new Date(ts);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    return `${y}-${m}-${dd} ${hh}:${mm}`;
  } catch {
    return "—";
  }
}

function msgNeedPro(lang: DetectedLang) {
  const sw =
    "🔒 ZETRA AI imefungwa kwa sasa.\n\n" +
    "Ili kuitumia kwenye Organization hii, unahitaji **PRO**.\n" +
    "• Owner/Admin pekee wanaweza kutumia\n" +
    "• Staff wame-block (kwa usalama)\n\n" +
    "Nenda: Settings → Subscription.\n";
  const en =
    "🔒 ZETRA AI is locked.\n\n" +
    "To use it for this Organization, you need **PRO**.\n" +
    "• Only Owner/Admin can use\n" +
    "• Staff are blocked (security)\n\n" +
    "Go to: Settings → Subscription.\n";

  if (lang === "SW") return sw;
  if (lang === "EN") return en;
  return mixed(sw, en);
}

function msgProExpired(lang: DetectedLang, untilTs: number) {
  const when = fmtLocal(untilTs);

  const sw =
    "🔒 PRO ime-expire kwa Organization hii.\n\n" +
    `• PRO until: ${when}\n\n` +
    "Tafadhali renew/enable PRO ili kuendelea kutumia ZETRA AI.\n" +
    "Nenda: Settings → Subscription.\n";

  const en =
    "🔒 PRO has expired for this Organization.\n\n" +
    `• PRO until: ${when}\n\n` +
    "Please renew/enable PRO to continue using ZETRA AI.\n" +
    "Go to: Settings → Subscription.\n";

  if (lang === "SW") return sw;
  if (lang === "EN") return en;
  return mixed(sw, en);
}

function msgStaffBlocked(lang: DetectedLang) {
  const sw =
    "🔒 ZETRA AI: Kwa sasa **Staff hawaruhusiwi kutumia AI**.\n" +
    "Owner/Admin pekee (ndani ya Org yenye PRO).";
  const en =
    "🔒 ZETRA AI: **Staff are not allowed** to use AI right now.\n" +
    "Only Owner/Admin (within a PRO org).";

  if (lang === "SW") return sw;
  if (lang === "EN") return en;
  return mixed(sw, en);
}

function msgPickOrg(lang: DetectedLang) {
  const sw = "Tafadhali chagua **Organization** kwanza (active org), kisha jaribu tena.";
  const en = "Please select an **Organization** first (active org), then try again.";
  if (lang === "SW") return sw;
  if (lang === "EN") return en;
  return mixed(sw, en);
}

function msgRateLimited(lang: DetectedLang) {
  const sw = "⏳ Umepiga request nyingi kwa haraka. Jaribu tena baada ya muda mfupi (rate limit).";
  const en = "⏳ Too many requests. Please try again in a moment (rate limit).";
  if (lang === "SW") return sw;
  if (lang === "EN") return en;
  return mixed(sw, en);
}

function msgBusy(lang: DetectedLang) {
  const sw =
    "⏳ AI iko busy kwa sasa (max concurrency imefika).\n" +
    "Subiri kidogo kisha jaribu tena.";
  const en =
    "⏳ AI is busy right now (max concurrency reached).\n" +
    "Wait a moment and try again.";
  if (lang === "SW") return sw;
  if (lang === "EN") return en;
  return mixed(sw, en);
}

function msgTooLong(lang: DetectedLang, maxChars: number) {
  const sw =
    `Ujumbe wako ni mrefu sana.\n` +
    `• Limit: ${maxChars.toLocaleString()} characters\n\n` +
    `Punguza au gawanya message vipande viwili.`;
  const en =
    `Your message is too long.\n` +
    `• Limit: ${maxChars.toLocaleString()} characters\n\n` +
    `Please shorten it or split into two messages.`;

  if (lang === "SW") return sw;
  if (lang === "EN") return en;
  return mixed(sw, en);
}

/** Month key like 2026-02 */
function monthKey(ts: number) {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

async function getMonthImageCount(orgId: string, month: string): Promise<number> {
  try {
    const raw = await kv.getString(`${KEY_IMG_MONTH_PREFIX}${orgId}:${month}`);
    const n = Number(raw ?? 0);
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

async function incMonthImageCount(orgId: string, month: string): Promise<number> {
  const key = `${KEY_IMG_MONTH_PREFIX}${orgId}:${month}`;
  const cur = await getMonthImageCount(orgId, month);
  const next = cur + 1;
  await kv.setString(key, String(next));
  return next;
}

function pruneWindow(orgId: string) {
  const arr = windowTs.get(orgId) ?? [];
  const cutoff = now() - 60_000;
  const pruned = arr.filter((t) => t >= cutoff);
  windowTs.set(orgId, pruned);
  return pruned;
}

export async function beginAiRequest(args: {
  lang: DetectedLang;
  text: string;
  ctx: PlayContext;
  hasImage?: boolean;
}): Promise<BeginResult> {
  const { lang, text, ctx } = args;
  const orgId = String(ctx.activeOrgId ?? "").trim();

  // must have org
  if (!orgId) {
    return { ok: false, refusal: msgPickOrg(lang), release: () => {} };
  }

  // staff blocked always
  if (!isOwnerOrAdmin(ctx.activeRole)) {
    return { ok: false, refusal: msgStaffBlocked(lang), release: () => {} };
  }

  // input cap
  if ((text ?? "").length > LIMITS.textInputChars) {
    return { ok: false, refusal: msgTooLong(lang, LIMITS.textInputChars), release: () => {} };
  }

  // ✅ BILLING-MONTH-2: expiry-aware subscription gate
  // 1) if we have "until" and it's expired -> show EXPIRED message (strong billing UX)
  // 2) else check normal pro-active flag
  let until = 0;
  try {
    until = Number((await getProUntilForOrg(orgId)) ?? 0);
    if (!Number.isFinite(until)) until = 0;
  } catch {
    until = 0;
  }

  if (until > 0 && now() > until) {
    return { ok: false, refusal: msgProExpired(lang, until), release: () => {} };
  }

  const pro = await isProActiveForOrg(orgId);
  if (!pro) {
    return { ok: false, refusal: msgNeedPro(lang), release: () => {} };
  }

  // images per month (only if hasImage=true)
  if (args.hasImage) {
    const mk = monthKey(now());
    const cur = await getMonthImageCount(orgId, mk);
    if (cur >= LIMITS.imagesPerMonthPerOrg) {
      const sw = `🖼️ Umefika limit ya picha ${LIMITS.imagesPerMonthPerOrg}/mwezi kwa Org hii.`;
      const en = `🖼️ You reached the image limit ${LIMITS.imagesPerMonthPerOrg}/month for this org.`;
      const refusal = lang === "SW" ? sw : lang === "EN" ? en : mixed(sw, en);
      return { ok: false, refusal, release: () => {} };
    }
    await incMonthImageCount(orgId, mk);
  }

  // concurrency gate
  const curIn = inflight.get(orgId) ?? 0;
  if (curIn >= LIMITS.concurrencyPerOrg) {
    return { ok: false, refusal: msgBusy(lang), release: () => {} };
  }

  // rate window gate (10/min/org)
  const arr = pruneWindow(orgId);
  if (arr.length >= LIMITS.perMinutePerOrg) {
    return { ok: false, refusal: msgRateLimited(lang), release: () => {} };
  }

  // consume slot
  arr.push(now());
  windowTs.set(orgId, arr);
  inflight.set(orgId, curIn + 1);

  const release = () => {
    const current = inflight.get(orgId) ?? 0;
    const next = Math.max(0, current - 1);
    inflight.set(orgId, next);
  };

  return { ok: true, release };
}

/**
 * Output clamp: 1200 tokens approx.
 * We approximate tokens by words; clamp by characters as a safe fallback.
 */
export function clampAiOutput(text: string): string {
  const s = String(text ?? "");
  if (!s) return s;

  // Approx: 1 token ~ 4 chars (very rough). 1200 tokens ~ 4800 chars.
  const maxChars = 4800;
  if (s.length <= maxChars) return s;

  return s.slice(0, maxChars).trimEnd() + "\n\n…";
}