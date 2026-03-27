// app/ai/index.tsx

import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  FlatList,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  Pressable,
  RefreshControl,
  Share,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as MediaLibrary from "expo-media-library";
import * as Sharing from "expo-sharing";
import * as Clipboard from "expo-clipboard";
import { Audio } from "expo-av";

import { useOrg } from "@/src/context/OrgContext";
import { Card } from "@/src/ui/Card";
import { Screen } from "@/src/ui/Screen";
import { UI } from "@/src/ui/theme";

import {
  getAiSubscriptionSnapshotForOrg,
  isProActiveForOrg,
} from "@/src/ai/subscription";
import { AiMessageBubble } from "@/src/components/AiMessageBubble";
import { supabase } from "@/src/supabase/supabaseClient";

type AiMode = "AUTO" | "SW" | "EN";
type ChatRole = "user" | "assistant";

type AttachedImage = {
  id: string;
  uri: string;
  dataUrl: string;
};

type ChatMsg = {
  id: string;
  role: ChatRole;
  text: string;
  ts: number;
  images?: Array<{ id: string; uri: string }> | null;
  generatedImageUri?: string | null;
  imagePrompt?: string | null;
  autopilotAlerts?: AutopilotAlert[] | null;
  analysisIntent?: "ANALYSIS" | "FORECAST" | "COACH" | null;
};

type ReqMsg = { role: "user" | "assistant"; text: string };

type ActionItem = {
  title: string;
  steps?: string[];
  priority?: "LOW" | "MEDIUM" | "HIGH";
  eta?: string;
};

type ToolKey = "ANALYZE" | "IMAGE" | "RESEARCH" | "AGENT" | null;

type RetryPayload =
  | { kind: "chat"; text: string; history: ReqMsg[] }
  | { kind: "vision"; text: string; history: ReqMsg[]; images: AttachedImage[] }
  | { kind: "image"; prompt: string };

type TaskRow = {
  id: string;
  organization_id: string;
  store_id: string | null;
  title: string;
  steps: string[] | null;
  priority: "LOW" | "MEDIUM" | "HIGH" | null;
  eta: string | null;
  status: string | null;
  created_at: string;
};

type TaskFollowupSummary = {
  open_count: number;
  overdue_count: number;
  due_today_count: number;
  high_priority_open_count: number;
  medium_priority_open_count: number;
  low_priority_open_count: number;
  latest_open_titles: string[];
};

type AiBalanceRow = {
  plan_code?: string | null;
  ai_enabled?: boolean | null;
  credits_monthly?: number | null;
  credits_used?: number | null;
  credits_remaining?: number | null;
  period_start?: string | null;
  [k: string]: any;
};
type AutopilotAlert = {
  level: "info" | "warning" | "critical";
  title: string;
  message: string;
};

type WorkerMeta = {
  role?: string;
  roleMeta?: any;
  analysisIntent?: "ANALYSIS" | "FORECAST" | "COACH";
  autopilotAlerts?: AutopilotAlert[];
  [k: string]: any;
};
type InjectedMetricCard = {
  label: string;
  value: string | number;
};

type InjectedInventoryRisk = {
  product_id?: string | null;
  product_name: string;
  sku?: string | null;
  stock_qty?: number | null;
  threshold_qty?: number | null;
  stock_status?: "LOW" | "OUT" | "OK" | null;
};

type InjectedDeadStockRow = {
  product_id?: string | null;
  product_name: string;
  sku?: string | null;
  stock_qty?: number | null;
  days_without_sale?: number | null;
};

type InjectedTopProductRow = {
  product_id?: string | null;
  product_name: string;
  sku?: string | null;
  qty_sold?: number | null;
  sales_amount?: number | null;
  profit_amount?: number | null;
};

type ForecastLite = {
  scope_used?: "STORE" | "ALL";
  forecast_days?: number;
  period_sales?: number;
  period_orders?: number;
  avg_daily_sales?: number;
  avg_daily_orders?: number;
  projected_sales_next_period?: number;
  projected_orders_next_period?: number;
  trend_label?: "INCREASING" | "STABLE" | "DECLINING";
  trend_pct?: number;
  stockout_risk_count?: number;
  urgent_restock_count?: number;
};

type CashflowLite = {
  scope_used?: "STORE" | "ALL";
  forecast_days?: number;
  projected_cash_in?: number;
  projected_cash_orders?: number;
  avg_daily_cash?: number;
  avg_daily_orders?: number;
  confidence?: "HIGH" | "MEDIUM" | "LOW";
};

type BusinessInjectionSnapshot = {
  org_id: string | null;
  org_name: string | null;
  store_id: string | null;
  store_name: string | null;
  role: string | null;

  range_label: string;
  generated_at: string;

  sales_total: number;
  expenses_total: number;
  cogs_total: number;
  profit_total: number;
  orders_count: number;
  avg_order_value: number;
  margin_pct: number;

  inventory_total_items: number;
  inventory_low_count: number;
  inventory_out_count: number;

  top_products: InjectedTopProductRow[];
  low_stock_items: InjectedInventoryRisk[];
  dead_stock_items: InjectedDeadStockRow[];

  forecast?: ForecastLite | null;
  cashflow?: CashflowLite | null;

  cards: InjectedMetricCard[];
};
function clean(s: any) {
  return String(s ?? "").trim();
}
function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function toIsoDateLocal(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function upper(s: any) {
  return clean(s).toUpperCase();
}

function uid() {
  return `${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

function fmtNum(v: any) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "0";
  return Math.round(n).toLocaleString("en-US");
}

function fmtMoney(v: any) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "0";
  return Math.round(n).toLocaleString("en-US");
}

function fmtChatTime(ts: number) {
  try {
    return new Date(ts).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

function buildAiContext(org: ReturnType<typeof useOrg>) {
  return {
    orgId: org.activeOrgId ?? null,
    activeOrgId: org.activeOrgId ?? null,
    orgName: org.activeOrgName ?? null,
    activeOrgName: org.activeOrgName ?? null,
    storeId: org.activeStoreId ?? null,
    activeStoreId: org.activeStoreId ?? null,
    storeName: org.activeStoreName ?? null,
    activeStoreName: org.activeStoreName ?? null,
    role: org.activeRole ?? null,
    activeRole: org.activeRole ?? null,
  };
}
const INPUT_MAX = 12_000;
const C: any = (UI as any)?.colors ?? UI;

const TYPEWRITER_MIN_CHUNK = 2;
const TYPEWRITER_MAX_CHUNK = 8;
const TYPEWRITER_BASE_DELAY = 18;
const TYPEWRITER_PUNCT_DELAY = 55;
const TYPEWRITER_LINE_DELAY = 80;
const AUTO_SCROLL_THROTTLE_MS = 120;

function normalizeWorkerBaseUrl(raw: any) {
  let u = clean(raw);
  if (!u) return "";
  u = u.replace(/\s+/g, "");
  u = u.replace(/\/+$/g, "");

  u = u.replace(/\/v1\/chat$/i, "");
  u = u.replace(/\/health$/i, "");
  u = u.replace(/\/vision$/i, "");
  u = u.replace(/\/image$/i, "");
  u = u.replace(/\/transcribe$/i, "");

  u = u.replace(/\/+$/g, "");
  return u;
}
const AI_WORKER_URL = normalizeWorkerBaseUrl(process.env.EXPO_PUBLIC_AI_WORKER_URL ?? "");

function isDataImageUrl(u: string) {
  const t = clean(u).toLowerCase();
  return t.startsWith("data:image/");
}
function normalizeImageUrl(raw: string) {
  const u = clean(raw);
  if (!u) return "";
  if (isDataImageUrl(u)) return u.replace(/\s+/g, "");
  return u;
}

function getImageExtensionFromUri(uri: string) {
  const u = normalizeImageUrl(uri).toLowerCase();

  if (u.startsWith("data:image/png")) return "png";
  if (u.startsWith("data:image/jpeg") || u.startsWith("data:image/jpg")) return "jpg";
  if (u.startsWith("data:image/webp")) return "webp";

  if (u.includes(".png")) return "png";
  if (u.includes(".jpg") || u.includes(".jpeg")) return "jpg";
  if (u.includes(".webp")) return "webp";

  return "png";
}

async function ensureLocalImageFile(uri: string) {
  const normalized = normalizeImageUrl(uri);
  if (!normalized) throw new Error("Image URI missing");

  const baseDir = FileSystem.cacheDirectory || FileSystem.documentDirectory;
  if (!baseDir) throw new Error("No writable directory found");

  const ext = getImageExtensionFromUri(normalized);
  const target = `${baseDir}zetra_ai_${Date.now()}.${ext}`;

  if (normalized.startsWith("file://")) {
    return normalized;
  }

  if (normalized.startsWith("data:image/")) {
    const m = normalized.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.*)$/i);
    const b64 = clean(m?.[2]);
    if (!b64) throw new Error("Invalid base64 image data");

    await FileSystem.writeAsStringAsync(target, b64, {
      encoding: FileSystem.EncodingType.Base64,
    });

    return target;
  }

  if (/^https?:\/\//i.test(normalized)) {
    const out = await FileSystem.downloadAsync(normalized, target);
    return out.uri;
  }

  throw new Error("Unsupported image URI format");
}

function extractMarkdownImageUrl(raw: string) {
  const t = String(raw ?? "");
  const m = t.match(/!\[[^\]]*\]\((data:image\/[a-zA-Z0-9.+-]+;base64,[^)]+|https?:\/\/[^)\s]+)\)/i);
  return clean(m?.[1]);
}

function stripMarkdownImageTag(raw: string) {
  const t = String(raw ?? "");
  return t
    .replace(/!\[[^\]]*\]\((data:image\/[a-zA-Z0-9.+-]+;base64,[^)]+|https?:\/\/[^)\s]+)\)/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);
const DEFAULT_TIMEOUT_MS = 25_000;
const DEFAULT_RETRIES = 2;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
function safeClip(s: string, max = 900) {
  const t = clean(s);
  if (!t) return "";
  return t.length > max ? t.slice(0, max) + "…" : t;
}
function isPunct(ch: string) {
  return ch === "." || ch === "!" || ch === "?" || ch === "," || ch === ";" || ch === ":";
}

async function readJsonOrText(res: Response): Promise<{ json: any | null; text: string }> {
  try {
    const ct = (res.headers.get("content-type") || "").toLowerCase();
    if (ct.includes("application/json")) {
      const j = await res.json().catch(() => null);
      return { json: j, text: clean(j) ? JSON.stringify(j) : "" };
    }
  } catch {}
  const txt = await res.text().catch(() => "");
  return { json: null, text: txt };
}

async function fetchJsonWithRetry(
  url: string,
  init: RequestInit,
  opts?: { timeoutMs?: number; retries?: number; tag?: string }
): Promise<{ status: number; ok: boolean; data: any | null; textBody: string }> {
  const timeoutMs = Math.max(2_000, Number(opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS));
  const retries = Math.max(0, Math.min(5, Number(opts?.retries ?? DEFAULT_RETRIES)));
  const tag = clean(opts?.tag) || "request";

  let lastErr: any = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeoutMs);

    const ext = init?.signal;
    const onExtAbort = () => controller.abort();
    try {
      if (ext) {
        if ((ext as any).aborted) controller.abort();
        else (ext as any).addEventListener?.("abort", onExtAbort);
      }
    } catch {}

    try {
      const res = await fetch(url, { ...init, signal: controller.signal });
      clearTimeout(t);

      try {
        if (ext) (ext as any).removeEventListener?.("abort", onExtAbort);
      } catch {}

      const { json, text } = await readJsonOrText(res);

      if (res.ok) {
        return {
          status: res.status,
          ok: true,
          data: json ?? (clean(text) ? { raw: text } : null),
          textBody: text,
        };
      }

      const bodyStr = clean((json as any)?.error) || clean((json as any)?.message) || safeClip(text);
      const shouldRetry = RETRYABLE_STATUS.has(res.status);

      if (!shouldRetry || attempt >= retries) {
        return { status: res.status, ok: false, data: json, textBody: bodyStr || text };
      }

      const backoff = 350 * (attempt + 1);
      await sleep(backoff);
      continue;
    } catch (e: any) {
      clearTimeout(t);

      try {
        if (ext) (ext as any).removeEventListener?.("abort", onExtAbort);
      } catch {}

      lastErr = e;

      const isAbort =
        e?.name === "AbortError" ||
        clean(e?.message).toLowerCase().includes("aborted") ||
        clean(e?.message).toLowerCase().includes("abort");
      const isNetwork =
        clean(e?.message).toLowerCase().includes("network request failed") ||
        clean(e?.message).toLowerCase().includes("failed to fetch");

      const shouldRetry = isAbort || isNetwork;

      if (!shouldRetry || attempt >= retries) {
        const msg = isAbort
          ? `${tag} aborted/timeout after ${Math.round(timeoutMs / 1000)}s`
          : clean(e?.message) || `${tag} failed`;
        return { status: 0, ok: false, data: null, textBody: msg };
      }

      const backoff = 350 * (attempt + 1);
      await sleep(backoff);
      continue;
    }
  }

  const fallback = clean(lastErr?.message) || `${opts?.tag || "request"} failed`;
  return { status: 0, ok: false, data: null, textBody: fallback };
}


function stripNextActionLines(raw: string) {
  const t = String(raw ?? "");
  if (!t.trim()) return "";
  const lines = t.split(/\r?\n/);

  const out: string[] = [];
  for (const line of lines) {
    const l = line ?? "";
    const tl = l.trim().toLowerCase();

    const isNextAction =
      tl.startsWith("next action:") ||
      tl.startsWith("next move:") ||
      tl.startsWith("next_action:") ||
      tl.startsWith("next_move:") ||
      tl.startsWith("next action :") ||
      tl.startsWith("next move :");

    if (isNextAction) continue;
    out.push(l);
  }

  while (out.length && !out[out.length - 1].trim()) out.pop();
  return out.join("\n").trim();
}

function sanitizeAssistantText(raw: string) {
  return stripNextActionLines(raw);
}

function prettifyAssistantSections(raw: string) {
  let t = String(raw ?? "").replace(/\r\n/g, "\n").trim();
  if (!t) return "";

  const sectionRules: Array<[RegExp, string]> = [
    [/^#{1,6}\s*✅?\s*ACTIONS\s*:?\s*$/gim, "🚀 Actions"],
    [/^#{1,6}\s*💡?\s*IDEAS\s*:?\s*$/gim, "💡 Ideas"],
    [/^#{1,6}\s*🔎?\s*INSIGHTS\s*:?\s*$/gim, "🔎 Insights"],
    [/^#{1,6}\s*🔮?\s*FORECAST\s*:?\s*$/gim, "🔮 Forecast"],
    [/^#{1,6}\s*⚠️?\s*PREDICTION RISKS\s*:?\s*$/gim, "⚠️ Prediction Risks"],
    [/^#{1,6}\s*🧠?\s*SMART PREDICTIONS\s*:?\s*$/gim, "🧠 Smart Predictions"],
    [/^#{1,6}\s*🏆?\s*TOP PRODUCTS\s*:?\s*$/gim, "🏆 Top Products"],
    [/^#{1,6}\s*📦?\s*LOW STOCK\s*:?\s*$/gim, "📦 Low Stock"],
    [/^#{1,6}\s*🐢?\s*SLOW\s*\/\s*DEAD STOCK\s*:?\s*$/gim, "🐢 Slow / Dead Stock"],
    [/^#{1,6}\s*💡?\s*MAONI\s*:?\s*$/gim, "💡 Maoni"],
    [/^#{1,6}\s*💡?\s*HATUA ZINAZOSHAURIWA\s*:?\s*$/gim, "✅ Hatua Zinazoshauriwa"],
    [/^#{1,6}\s*🚀?\s*MAPENDEKEZO\s*:?\s*$/gim, "🚀 Mapendekezo"],
  ];

  for (const [re, replacement] of sectionRules) {
    t = t.replace(re, replacement);
  }

  t = t.replace(/^[-•●▪]\s+/gm, "• ");

  t = t.replace(
    /^\s*(\d+)\.\s*\*\*(.+?)\*\*\s*:?\s*$/gm,
    (_m, n, title) => `${n}. ${String(title).trim()}`
  );

  t = t.replace(
    /^\s*[-•]\s*\*\*(.+?)\*\*\s*:?\s*$/gm,
    (_m, title) => `• ${String(title).trim()}`
  );

  t = t.replace(/\*\*(.+?)\*\*/g, "$1");
  t = t.replace(/__(.+?)__/g, "$1");
  t = t.replace(/`(.+?)`/g, "$1");
  t = t.replace(/^#{1,6}\s*/gm, "");

  t = t.replace(/^\s*(🚀 Actions|💡 Ideas|🔎 Insights|🔮 Forecast|⚠️ Prediction Risks|🧠 Smart Predictions|🏆 Top Products|📦 Low Stock|🐢 Slow \/ Dead Stock|💡 Maoni|✅ Hatua Zinazoshauriwa|🚀 Mapendekezo)\s*$/gm, "\n$1");
  t = t.replace(/\n{3,}/g, "\n\n");

  return t.trim();
}
function formatActions(actions: Array<{ title: string; steps?: string[]; priority?: string; eta?: string }>) {
  if (!Array.isArray(actions) || actions.length === 0) return "";

  const lines: string[] = [];
  lines.push("🚀 Actions");

  actions.forEach((a, idx) => {
    const title = clean(a?.title);
    if (!title) return;

    const metaBits: string[] = [];
    if (clean(a?.priority)) metaBits.push(`priority: ${clean(a.priority)}`);
    if (clean(a?.eta)) metaBits.push(`eta: ${clean(a.eta)}`);
    const meta = metaBits.length ? ` (${metaBits.join(" • ")})` : "";

    lines.push(`${idx + 1}. ${title}${meta}`);

    if (Array.isArray(a?.steps) && a.steps.length) {
      for (const step of a.steps) {
        const st = clean(step);
        if (st) lines.push(`• ${st}`);
      }
    }

    lines.push("");
  });

  return lines.join("\n").trim();
}
function packAssistantText(meta: { text: string; actions: any[]; footerNote?: string; hideActionsBlock?: boolean }) {
  const main = prettifyAssistantSections(sanitizeAssistantText(clean(meta?.text)));
  const actionsBlock = meta?.hideActionsBlock ? "" : prettifyAssistantSections(formatActions(meta?.actions ?? []));
  const footerNote = prettifyAssistantSections(clean(meta?.footerNote));

  const parts: string[] = [];
  if (main) parts.push(main);

  if (actionsBlock) {
    parts.push("");
    parts.push(actionsBlock);
  }

  if (footerNote) {
    parts.push("");
    parts.push(footerNote);
  }

  return clean(parts.join("\n")).replace(/\n{3,}/g, "\n\n").trim();
}

async function createTasksFromAiActions(args: {
  orgId: string;
  storeId?: string | null;
  actions: ActionItem[];
}): Promise<{ created: number; failed: number; errors: string[] }> {
  const orgId = clean(args.orgId);
  const storeId = clean(args.storeId ?? "") || null;
  const actions = Array.isArray(args.actions) ? args.actions : [];

  if (!orgId || actions.length === 0) return { created: 0, failed: 0, errors: [] };

  let created = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const a of actions) {
    const title = clean(a?.title);
    if (!title) continue;

    const steps = Array.isArray(a?.steps) ? a.steps.map((s) => clean(s)).filter(Boolean) : [];
    const priority =
      a?.priority === "HIGH" || a?.priority === "MEDIUM" || a?.priority === "LOW" ? a.priority : null;
    const eta = clean(a?.eta) || null;

    const { error } = await supabase.rpc("create_task_from_ai", {
      p_org_id: orgId,
      p_title: title,
      p_store_id: storeId,
      p_steps: steps,
      p_priority: priority,
      p_eta: eta,
    });

    if (error) {
      failed++;
      errors.push(clean(error.message) || "Unknown task error");
    } else {
      created++;
    }
  }

  return { created, failed, errors };
}

function detectImageIntent(rawText: string): { isImage: boolean; prompt: string } {
  const t = clean(rawText);
  const loose = normalizeLooseText(rawText);

  if (!t) return { isImage: false, prompt: "" };

  const patterns: Array<{ re: RegExp; strip: (m: RegExpMatchArray) => string }> = [
    { re: /^\s*\[\s*create\s+image\s*\]\s*(.+)$/i, strip: (m) => clean(m[1]) },
    { re: /^\s*create\s+image\s*:\s*(.+)$/i, strip: (m) => clean(m[1]) },
    { re: /^\s*create\s+an\s+image\s*:\s*(.+)$/i, strip: (m) => clean(m[1]) },
    { re: /^\s*generate\s+image\s*:\s*(.+)$/i, strip: (m) => clean(m[1]) },
    { re: /^\s*image\s*:\s*(.+)$/i, strip: (m) => clean(m[1]) },
    { re: /^\s*draw\s*:\s*(.+)$/i, strip: (m) => clean(m[1]) },
    { re: /^\s*tengeneza\s+picha\s*:\s*(.+)$/i, strip: (m) => clean(m[1]) },
    { re: /^\s*chora\s*:\s*(.+)$/i, strip: (m) => clean(m[1]) },
  ];

  for (const p of patterns) {
    const m = t.match(p.re);
    if (m) {
      const prompt = p.strip(m);
      return { isImage: true, prompt: prompt || t };
    }
  }

  const looksLikeImageCommand =
    hasLooseKeyword(loose, [
      "create image",
      "generate image",
      "draw image",
      "tengeneza picha",
      "chora picha",
      "create an image",
    ]) ||
    (
      hasLooseKeyword(loose, ["image", "picha"]) &&
      looksLikeAskIntent(loose)
    );

  if (looksLikeImageCommand) {
    return { isImage: true, prompt: t };
  }

  return { isImage: false, prompt: "" };
}
function nextTypingText(step: number) {
  const dots = step % 4;
  return `AI inaandika${".".repeat(dots)}`;
}

function appendAtEnd(base: string, extra: string) {
  const a = String(base ?? "");
  const b = String(extra ?? "");
  if (!a.trim()) return b;
  if (!b.trim()) return a;
  return `${a}${b}`;
}

function getIntentLabel(intent?: "ANALYSIS" | "FORECAST" | "COACH" | null) {
  if (intent === "FORECAST") return "Forecast";
  if (intent === "COACH") return "Profit Coach";
  if (intent === "ANALYSIS") return "Analysis";
  return "Assistant";
}

function normalizeAutopilotAlerts(meta: any): AutopilotAlert[] {
  const arr = Array.isArray(meta?.autopilotAlerts) ? meta.autopilotAlerts : [];
  return arr
    .map((a: any) => ({
      level: a?.level === "critical" || a?.level === "warning" ? a.level : "info",
      title: clean(a?.title),
      message: clean(a?.message),
    }))
    .filter((a: AutopilotAlert) => a.title || a.message);
}
function num(v: any) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function pct(part: number, whole: number) {
  if (!Number.isFinite(part) || !Number.isFinite(whole) || whole <= 0) return 0;
  return (part / whole) * 100;
}

function startOfTodayIso() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function endExclusiveTomorrowIso() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 1);
  return d.toISOString();
}

function safeArray<T = any>(v: any): T[] {
  return Array.isArray(v) ? v : [];
}

async function waitForActiveSession(timeoutMs = 4000, stepMs = 250) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const { data, error } = await supabase.auth.getSession();
      if (!error && data?.session?.access_token) {
        return {
          ok: true,
          session: data.session,
          error: "",
        };
      }
    } catch {}

    await sleep(stepMs);
  }

  return {
    ok: false,
    session: null,
    error: "Not authenticated",
  };
}

async function safeRpcOne(name: string, args: Record<string, any>) {
  try {
    const auth = await waitForActiveSession();

    if (!auth.ok) {
      return {
        ok: false,
        data: null,
        error: auth.error || "Not authenticated",
      };
    }

    const { data, error } = await supabase.rpc(name, args);

    if (error) {
      return {
        ok: false,
        data: null,
        error: clean(error.message) || `${name} failed`,
      };
    }

    return { ok: true, data, error: "" };
  } catch (e: any) {
    return {
      ok: false,
      data: null,
      error: clean(e?.message) || `${name} failed`,
    };
  }
}
function firstNumFromRow(row: any, keys: string[]) {
  for (const k of keys) {
    const n = Number(row?.[k]);
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

function firstTextFromRow(row: any, keys: string[]) {
  for (const k of keys) {
    const v = clean(row?.[k]);
    if (v) return v;
  }
  return "";
}

function sumRowsByKeys(rows: any[], keys: string[]) {
  return safeArray<any>(rows).reduce((acc, row) => acc + firstNumFromRow(row, keys), 0);
}

function normalizeLooseText(raw: any) {
  return clean(raw)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function squashLooseText(raw: any) {
  return normalizeLooseText(raw).replace(/\s+/g, "");
}

function levenshteinDistance(a: string, b: string, maxLimit = 2) {
  const x = clean(a);
  const y = clean(b);

  if (x === y) return 0;
  if (!x.length) return y.length;
  if (!y.length) return x.length;
  if (Math.abs(x.length - y.length) > maxLimit) return maxLimit + 1;

  const dp = Array.from({ length: x.length + 1 }, () => new Array(y.length + 1).fill(0));

  for (let i = 0; i <= x.length; i++) dp[i][0] = i;
  for (let j = 0; j <= y.length; j++) dp[0][j] = j;

  for (let i = 1; i <= x.length; i++) {
    let rowMin = Number.MAX_SAFE_INTEGER;

    for (let j = 1; j <= y.length; j++) {
      const cost = x[i - 1] === y[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
      rowMin = Math.min(rowMin, dp[i][j]);
    }

    if (rowMin > maxLimit) return maxLimit + 1;
  }

  return dp[x.length][y.length];
}

function fuzzyWordMatch(word: string, target: string) {
  const a = normalizeLooseText(word);
  const b = normalizeLooseText(target);

  if (!a || !b) return false;
  if (a === b) return true;
  if (a.includes(b) || b.includes(a)) return true;

  const max =
    b.length >= 8 ? 2 :
    b.length >= 5 ? 1 :
    0;

  if (max === 0) return false;
  return levenshteinDistance(a, b, max) <= max;
}

function hasLooseKeyword(rawText: string, keywords: string[]) {
  const normalized = normalizeLooseText(rawText);
  const squashed = squashLooseText(rawText);
  const tokens = normalized.split(" ").filter(Boolean);

  for (const key of keywords) {
    const k = normalizeLooseText(key);
    const ks = squashLooseText(key);

    if (!k) continue;
    if (normalized.includes(k)) return true;
    if (ks && squashed.includes(ks)) return true;

    const keyTokens = k.split(" ").filter(Boolean);

    if (keyTokens.length === 1) {
      if (tokens.some((t) => fuzzyWordMatch(t, keyTokens[0]))) return true;
    } else {
      for (let i = 0; i <= tokens.length - keyTokens.length; i++) {
        let ok = true;
        for (let j = 0; j < keyTokens.length; j++) {
          if (!fuzzyWordMatch(tokens[i + j], keyTokens[j])) {
            ok = false;
            break;
          }
        }
        if (ok) return true;
      }
    }
  }

  return false;
}

function hasLooseAll(rawText: string, keywords: string[]) {
  return keywords.every((k) => hasLooseKeyword(rawText, [k]));
}

function looksLikeAskIntent(rawText: string) {
  return hasLooseKeyword(rawText, [
    "nipe",
    "nipa",
    "naomba",
    "niandikie",
    "nifanyie",
    "onyesha",
    "leta",
    "toa",
    "give me",
    "show me",
    "tell me",
    "nataka",
    "ninataka",
    "nitaka",
    "ninatak",
    "ntaka",
  ]);
}

function detectBusinessIntent(rawText: string): "SALES" | "PROFIT" | "INVENTORY" | "PRODUCT" | "GENERAL" {
  const t = normalizeLooseText(rawText);
  if (!t) return "GENERAL";

  if (
    hasLooseKeyword(t, [
      "profit",
      "faida",
      "margin",
      "leak",
      "loss",
      "hasara",
      "cogs",
      "expense",
      "expenses",
      "gharama",
      "net profit",
      "faida halisi",
      "profit leak",
      "leak ya profit",
      "leak ya faida",
      "expense haitoki",
      "gharama haitoki",
      "faida inapotea",
      "kwa nini profit",
      "kwa nini faida",
    ])
  ) {
    return "PROFIT";
  }

  if (
    hasLooseKeyword(t, [
      "low stock",
      "stock out",
      "out of stock",
      "inventory",
      "stock",
      "restock",
      "sku",
      "hisa",
      "imeisha stock",
      "karibia kuisha",
      "kuisha stock",
    ])
  ) {
    return "INVENTORY";
  }

  if (
    hasLooseKeyword(t, [
      "top product",
      "top bidhaa",
      "best seller",
      "best sellers",
      "fast moving",
      "slow moving",
      "dead stock",
      "hazitembei",
      "hazikauzwi",
      "zinaouza zaidi",
      "zinazouza zaidi",
      "bidhaa",
    ])
  ) {
    return "PRODUCT";
  }

  if (
    hasLooseKeyword(t, [
      "sales",
      "mauzo",
      "orders",
      "order",
      "revenue",
      "money in",
      "forecast",
      "utabiri",
      "cashflow",
    ])
  ) {
    return "SALES";
  }

  return "GENERAL";
}

function detectAnalysisFollowupIntent(rawText: string) {
  const t = normalizeLooseText(rawText);
  if (!t) return false;

  const asksAnalysis =
    hasLooseKeyword(t, [
      "analysis",
      "analysis ya",
      "business analysis",
      "uchambuzi",
      "uchambuzi wa biashara",
      "analysis nzuri",
      "good analysis",
      "nice analysis",
    ]) &&
    (
      looksLikeAskIntent(t) ||
      hasLooseKeyword(t, [
        "analysis",
        "business analysis",
        "uchambuzi mzuri",
        "analysis nzuri",
        "good analysis",
        "nice analysis",
      ])
    );

  const asksContinuation = hasLooseKeyword(t, [
    "endelea",
    "endelea hapo",
    "sawa",
    "ok",
    "okay",
    "poa",
    "good",
    "vizuri",
    "nimeelewa",
    "sasa je",
    "then what",
    "what next",
    "next",
    "next step",
    "nifanye nini sasa",
    "what should i do now",
    "kwa hiyo nifanye nini",
    "based on that",
    "kutokana na hayo",
    "hapo sasa",
    "na sasa",
    "basi nifanye nini",
  ]);

  return asksAnalysis || asksContinuation;
}


function detectPureDecisionMode(rawText: string) {
  const t = normalizeLooseText(rawText);
  if (!t) return false;

  return hasLooseKeyword(t, [
    "pure decision",
    "direct decision",
    "decision mode",
    "ranking",
    "rank",
    "top 3",
    "3 za kwanza",
    "3 za juu",
    "nipa 3",
    "nipe 3",
    "tatu za kwanza",
    "usielezee",
    "usi elezee",
    "usi nielezee",
    "bila explanation",
    "no explanation",
    "not explanation",
    "action ya kila",
  ]);
}

function extractLooseNumericTokens(rawText: string): number[] {
  const tokens = clean(rawText).match(/[-+]?\d[\d, _]*(?:\.\d+)?\s*[km]?/gi) ?? [];
  const out: number[] = [];

  for (const t of tokens) {
    const raw = clean(t).toLowerCase();
    if (!raw) continue;

    let mul = 1;
    if (raw.endsWith("k")) mul = 1_000;
    if (raw.endsWith("m")) mul = 1_000_000;

    const normalized = raw.replace(/[km]$/i, "").replace(/[, _]/g, "");
    const n = Number(normalized);

    if (!Number.isFinite(n)) continue;
    out.push(n * mul);

    if (out.length >= 8) break;
  }

  return out;
}

function detectBusinessCalcBypass(rawText: string) {
  const t = normalizeLooseText(rawText);
  if (!t) return false;

  const nums = extractLooseNumericTokens(rawText);
  const hasTwoNums = nums.length >= 2;

  const hasCalcWord = hasLooseKeyword(t, [
    "sales",
    "salse",
    "sale",
    "mauzo",
    "mauz",
    "revenue",
    "mapato",
    "cost",
    "cogs",
    "gharama",
    "gharma",
    "margin",
    "margn",
    "markup",
    "markp",
    "profit",
    "faida",
    "loss",
    "hasara",
    "breakeven",
    "break even",
    "breakevn",
    "fixed",
    "roi",
    "return on investment",
    "investment",
    "investmnt",
    "mtaji",
    "uwekezaji",
    "other",
    "expense",
    "expenses",
    "overhead",
  ]);

  const salesLike = hasLooseKeyword(t, ["sales", "salse", "sale", "mauzo", "mauz", "revenue", "mapato"]);
  const costLike = hasLooseKeyword(t, ["cost", "cogs", "gharama", "gharma", "buying", "purchase"]);
  const calcIntentLike = hasLooseKeyword(t, [
    "margin",
    "margn",
    "markup",
    "markp",
    "breakeven",
    "break even",
    "breakevn",
    "roi",
    "return on investment",
    "investment",
    "investmnt",
    "mtaji",
    "uwekezaji",
    "profit",
    "faida",
    "loss",
    "hasara",
  ]);

  if (calcIntentLike && hasTwoNums) return true;
  if (salesLike && costLike && hasTwoNums) return true;
  if (costLike && hasTwoNums) return true;
  if (hasCalcWord && hasTwoNums) return true;

  return false;
}




function getLowestProfitEfficiencyProducts(rows: InjectedTopProductRow[]) {
  return safeArray<InjectedTopProductRow>(rows)
    .filter((p) => num(p.sales_amount) > 0)
    .map((p) => {
      const sales = num(p.sales_amount);
      const profit = num(p.profit_amount);
      const efficiencyPct = sales > 0 ? (profit / sales) * 100 : 0;

      return {
        ...p,
        efficiency_pct: Number(efficiencyPct.toFixed(1)),
      };
    })
    .sort((a, b) => {
      const byEfficiency = num(a.efficiency_pct) - num(b.efficiency_pct);
      if (byEfficiency !== 0) return byEfficiency;

      const byProfit = num(a.profit_amount) - num(b.profit_amount);
      if (byProfit !== 0) return byProfit;

      return num(b.sales_amount) - num(a.sales_amount);
    });
}

function buildPureDecisionReply(snapshot: BusinessInjectionSnapshot | null, rawText: string) {
  if (!snapshot) return "Sina snapshot ya biashara kwa sasa.";

  const t = clean(rawText).toLowerCase();
  const wantsTop3 =
    t.includes("top 3") ||
    t.includes("3 za kwanza") ||
    t.includes("3 za juu") ||
    t.includes("nipa 3") ||
    t.includes("tatu za kwanza");

  const weakest = getLowestProfitEfficiencyProducts(snapshot.top_products);
  const low = safeArray(snapshot.low_stock_items);
  const dead = safeArray(snapshot.dead_stock_items);

  const picked = new Set<string>();
  const decisions: Array<{
    product_name: string;
    reason: string;
    action: string;
    score: number;
  }> = [];

  for (const p of weakest) {
    const name = clean(p.product_name);
    if (!name || picked.has(name.toLowerCase())) continue;

    decisions.push({
      product_name: name,
      reason: `profit efficiency ndogo (${num((p as any).efficiency_pct)}%)`,
      action: "Kagua buying price / markup / selling price sasa",
      score: 100 - num((p as any).efficiency_pct),
    });
    picked.add(name.toLowerCase());
  }

  for (const p of low) {
    const name = clean(p.product_name);
    if (!name || picked.has(name.toLowerCase())) continue;

    const stockQty = num(p.stock_qty);
    const thresholdQty = num(p.threshold_qty);

    decisions.push({
      product_name: name,
      reason: `low stock (${stockQty} vs threshold ${thresholdQty})`,
      action: "Restock leo kabla momentum haijakatika",
      score: 80 + Math.max(0, thresholdQty - stockQty),
    });
    picked.add(name.toLowerCase());
  }

  for (const p of dead) {
    const name = clean(p.product_name);
    if (!name || picked.has(name.toLowerCase())) continue;

    decisions.push({
      product_name: name,
      reason: `dead stock / slow moving (${num(p.days_without_sale)} days no sale)`,
      action: "Fanya promo / markdown / bundle wiki hii",
      score: 70 + num(p.days_without_sale),
    });
    picked.add(name.toLowerCase());
  }

  const ranked = decisions
    .sort((a, b) => b.score - a.score)
    .slice(0, wantsTop3 ? 3 : 1);

  if (!ranked.length) {
    return "Sina ranking ya kutosha kufanya pure decision kwa sasa.";
  }

  const lines: string[] = [];
  lines.push("🎯 Pure Decision Mode");
  lines.push("");

  ranked.forEach((x, idx) => {
    lines.push(`${idx + 1}. ${x.product_name}`);
    lines.push(`• Sababu: ${x.reason}`);
    lines.push(`• Action: ${x.action}`);
    if (idx < ranked.length - 1) lines.push("");
  });

  return prettifyAssistantSections(lines.join("\n"));
}

function buildBusinessContextBlock(
  snapshot: BusinessInjectionSnapshot | null,
  intent: "SALES" | "PROFIT" | "INVENTORY" | "PRODUCT" | "GENERAL"
) {
  if (!snapshot) return "";

  const lines: string[] = [];
  lines.push("LIVE BUSINESS SNAPSHOT:");
  lines.push(`- Intent: ${intent}`);
  lines.push(`- Range: ${snapshot.range_label}`);
  lines.push(`- Sales: ${snapshot.sales_total}`);
  lines.push(`- Expenses: ${snapshot.expenses_total}`);
  lines.push(`- COGS: ${snapshot.cogs_total}`);
  lines.push(`- Profit: ${snapshot.profit_total}`);
  lines.push(`- Orders: ${snapshot.orders_count}`);
  lines.push(`- Avg Order Value: ${Math.round(snapshot.avg_order_value || 0)}`);
  lines.push(`- Margin %: ${snapshot.margin_pct}`);
  lines.push(`- Inventory Items: ${snapshot.inventory_total_items}`);
  lines.push(`- Low Stock Count: ${snapshot.inventory_low_count}`);
  lines.push(`- Out of Stock Count: ${snapshot.inventory_out_count}`);

  if (snapshot.forecast) {
    lines.push("- Forecast:");
    lines.push(`  • Trend: ${clean(snapshot.forecast.trend_label || "STABLE")}`);
    lines.push(`  • Trend %: ${num(snapshot.forecast.trend_pct)}`);
    lines.push(`  • Forecast Days: ${num(snapshot.forecast.forecast_days)}`);
    lines.push(`  • Projected Sales: ${num(snapshot.forecast.projected_sales_next_period)}`);
    lines.push(`  • Projected Orders: ${num(snapshot.forecast.projected_orders_next_period)}`);
    lines.push(`  • Stockout Risk Count: ${num(snapshot.forecast.stockout_risk_count)}`);
    lines.push(`  • Urgent Restock Count: ${num(snapshot.forecast.urgent_restock_count)}`);
  }

  if (snapshot.cashflow) {
    lines.push("- Cashflow:");
    lines.push(`  • Forecast Days: ${num(snapshot.cashflow.forecast_days)}`);
    lines.push(`  • Projected Cash In: ${num(snapshot.cashflow.projected_cash_in)}`);
    lines.push(`  • Projected Cash Orders: ${num(snapshot.cashflow.projected_cash_orders)}`);
    lines.push(`  • Avg Daily Cash: ${num(snapshot.cashflow.avg_daily_cash)}`);
    lines.push(`  • Confidence: ${clean(snapshot.cashflow.confidence || "MEDIUM")}`);
  }

  if (snapshot.top_products?.length) {
    lines.push("- Top Products:");
    for (const p of snapshot.top_products.slice(0, 5)) {
      lines.push(
        `  • ${clean(p.product_name)} | qty=${num(p.qty_sold)} | sales=${num(p.sales_amount)} | profit=${num(
          p.profit_amount
        )}`
      );
    }
  }

  if (snapshot.low_stock_items?.length) {
    lines.push("- Low Stock Items:");
    for (const p of snapshot.low_stock_items.slice(0, 5)) {
      lines.push(
        `  • ${clean(p.product_name)} | stock=${num(p.stock_qty)} | threshold=${num(p.threshold_qty)} | status=${clean(
          p.stock_status || "LOW"
        )}`
      );
    }
  }

  if (snapshot.dead_stock_items?.length) {
    lines.push("- Slow / Dead Stock Items:");
    for (const p of snapshot.dead_stock_items.slice(0, 5)) {
      lines.push(
        `  • ${clean(p.product_name)} | stock=${num(p.stock_qty)} | days_without_sale=${num(p.days_without_sale)}`
      );
    }
  }

  lines.push("MANDATORY RESPONSE RULES:");
  lines.push("- Base the answer on this injected business snapshot first.");
  lines.push("- Use real injected product names whenever product-level data exists.");
  lines.push("- Do not give generic theory when the snapshot already contains business data.");
  lines.push("- If product data is insufficient, say exactly which product data is missing.");
  lines.push("- If the user asks about stock risk, use low stock items and slow/dead stock items directly.");
  lines.push("- If the user asks about profit leaks, connect the answer to sales, COGS, expenses, margin, and top products.");
  lines.push("- If the user asks for actions, produce concrete next actions using the injected products and metrics.");

  return lines.join("\n");
}

function normalizeStockBucket(x: any): "FAST_MOVING" | "SLOW_MOVING" | "DEAD_STOCK" | "LOW_STOCK" {
  const v = String(x ?? "").trim().toUpperCase().replace(/\s+/g, "_");
  if (v === "FAST_MOVING") return "FAST_MOVING";
  if (v === "SLOW_MOVING") return "SLOW_MOVING";
  if (v === "DEAD_STOCK") return "DEAD_STOCK";
  return "LOW_STOCK";
}
function buildInventoryDeterministicReply(
  snapshot: BusinessInjectionSnapshot | null,
  intent: "INVENTORY" | "PRODUCT"
) {
  if (!snapshot) return "";

  const low = Array.isArray(snapshot.low_stock_items) ? snapshot.low_stock_items : [];
  const dead = Array.isArray(snapshot.dead_stock_items) ? snapshot.dead_stock_items : [];
  const top = Array.isArray(snapshot.top_products) ? snapshot.top_products : [];
  const storeName = clean(snapshot.store_name) || "Store";

  const lines: string[] = [];

  if (intent === "INVENTORY") {
    lines.push(`Hapa kuna muhtasari wa stock ya **${storeName}** kwa sasa:`);
    lines.push("");

    lines.push("## 📦 Low Stock");
    if (low.length) {
      low.slice(0, 8).forEach((p, idx) => {
        lines.push(
          `${idx + 1}. **${clean(p.product_name) || "Unknown Product"}** — akiba: ${num(
            p.stock_qty
          )}${p.threshold_qty != null ? ` / threshold: ${num(p.threshold_qty)}` : ""}`
        );
      });
    } else {
      lines.push("- Hakuna bidhaa low stock zilizopatikana kwenye snapshot ya sasa.");
    }

    lines.push("");
    lines.push("## 🐢 Slow / Dead Stock");
    if (dead.length) {
      dead.slice(0, 5).forEach((p, idx) => {
        lines.push(
          `${idx + 1}. **${clean(p.product_name) || "Unknown Product"}** — stock: ${num(
            p.stock_qty
          )}${p.days_without_sale != null ? ` • days without sale: ${num(p.days_without_sale)}` : ""}`
        );
      });
    } else {
      lines.push("- Hakuna dead stock iliyoonekana kwenye snapshot ya sasa.");
    }

    lines.push("");
    lines.push("## 🧠 Maoni");
    if (low.length) {
      lines.push("- Bidhaa za low stock zinaweza kukatiza mauzo kama hazitajazwa mapema.");
      lines.push("- Kipaumbele kiwe kwa bidhaa zinazouzwa haraka au zinazohusiana na top products.");
    } else {
      lines.push("- Mfumo haujaona low stock ya dhahiri kwa sasa.");
      lines.push("- Ukiamini kuna bidhaa zinakaribia kuisha, kagua thresholds au inventory sync.");
    }

    lines.push("");
    lines.push("## ✅ Hatua Zinazoshauriwa");
    if (low.length) {
      lines.push("- Tengeneza restock order ya bidhaa hizi leo.");
      lines.push("- Panga supplier follow-up kwa bidhaa zenye mahitaji ya haraka.");
      lines.push("- Kagua kama kiwango cha threshold kinaendana na mwendo wa mauzo.");
    } else {
      lines.push("- Kagua threshold settings za bidhaa muhimu.");
      lines.push("- Hakikisha stock movement, receiving, na adjustments zinasync vizuri.");
    }

    return prettifyAssistantSections(lines.join("\n"));
  }

  lines.push(`Hapa kuna product intelligence ya **${storeName}**:`);
  lines.push("");

  lines.push("## 🏆 Top Products");
  if (top.length) {
    top.slice(0, 6).forEach((p, idx) => {
      lines.push(
        `${idx + 1}. **${clean(p.product_name) || "Unknown Product"}** — qty: ${num(
          p.qty_sold
        )} • sales: ${num(p.sales_amount)} • profit: ${num(p.profit_amount)}`
      );
    });
  } else {
    lines.push("- Hakuna top products zilizopatikana kwenye snapshot ya sasa.");
  }

  lines.push("");
  lines.push("## 📦 Low Stock");
  if (low.length) {
    low.slice(0, 6).forEach((p, idx) => {
      lines.push(
        `${idx + 1}. **${clean(p.product_name) || "Unknown Product"}** — stock: ${num(
          p.stock_qty
        )}${p.threshold_qty != null ? ` • threshold: ${num(p.threshold_qty)}` : ""}`
      );
    });
  } else {
    lines.push("- Hakuna bidhaa low stock kwenye snapshot ya sasa.");
  }

  lines.push("");
  lines.push("## 🐢 Slow / Dead Stock");
  if (dead.length) {
    dead.slice(0, 6).forEach((p, idx) => {
      lines.push(
        `${idx + 1}. **${clean(p.product_name) || "Unknown Product"}** — stock: ${num(
          p.stock_qty
        )}${p.days_without_sale != null ? ` • no sale days: ${num(p.days_without_sale)}` : ""}`
      );
    });
  } else {
    lines.push("- Hakuna bidhaa za mwendo mdogo zilizopatikana kwenye snapshot ya sasa.");
  }

  lines.push("");
  lines.push("## 🚀 Mapendekezo");
  lines.push("- Linda top products zako zisikose stock.");
  lines.push("- Restock bidhaa low stock kabla mauzo hayajakatika.");
  lines.push("- Dead stock ziangalie kwa promo, markdown, bundle, au display mpya.");

  return prettifyAssistantSections(lines.join("\n"));
}
function buildProfitDeterministicReply(
  snapshot: BusinessInjectionSnapshot | null,
  intent: "PROFIT" | "SALES" | "GENERAL"
) {
  if (!snapshot) return "";

  const storeName = clean(snapshot.store_name) || "Store";
  const sales = num(snapshot.sales_total);
  const expenses = num(snapshot.expenses_total);
  const cogs = num(snapshot.cogs_total);
  const profit = num(snapshot.profit_total);
  const orders = num(snapshot.orders_count);
  const avgOrder = Math.round(num(snapshot.avg_order_value));
  const margin = Number(num(snapshot.margin_pct).toFixed(1));

  const salesText = fmtMoney(sales);
  const expensesText = fmtMoney(expenses);
  const cogsText = fmtMoney(cogs);
  const profitText = fmtMoney(profit);
  const avgOrderText = fmtMoney(avgOrder);

  const top = Array.isArray(snapshot.top_products) ? snapshot.top_products : [];
  const low = Array.isArray(snapshot.low_stock_items) ? snapshot.low_stock_items : [];
  const dead = Array.isArray(snapshot.dead_stock_items) ? snapshot.dead_stock_items : [];
  const weakest = getLowestProfitEfficiencyProducts(top)[0] ?? null;
  const bestOne = top[0] ?? null;

  const lines: string[] = [];

  if (intent === "PROFIT") {
    lines.push(`Hii ndiyo executive view ya **${storeName}** sasa hivi:`);
    lines.push("");

    lines.push("🚨 CRITICAL RISKS");
    if (weakest) {
      lines.push(
        `• ${clean(weakest.product_name)} ina margin dhaifu: sales ${fmtMoney(weakest.sales_amount)}, profit ${fmtMoney(
          weakest.profit_amount
        )}, efficiency ${num((weakest as any).efficiency_pct)}%.`
      );
    } else if (margin < 12) {
      lines.push(`• Margin ya biashara iko chini (${margin}%). Pricing/cost discipline inahitaji correction sasa.`);
    } else {
      lines.push("• Hakuna risk kubwa ya margin iliyojitokeza wazi kwenye bidhaa za sasa, lakini discipline ya pricing ibaki strict.");
    }

    if (expenses > 0) {
      lines.push(`• Expenses za ${expensesText} zinakata profit moja kwa moja.`);
    } else if (dead.length > 0) {
      lines.push(`• Kuna ${dead.length} dead/slow stock inayofunga cash bila kurudi haraka.`);
    } else if (low.length > 0) {
      lines.push(`• Kuna ${low.length} bidhaa low stock; stockout inaweza kukata momentum ya profit.`);
    } else {
      lines.push("• Hakuna operational drag kubwa iliyoonekana wazi kwenye snapshot ya sasa.");
    }

    lines.push("");
    lines.push("💰 MONEY OPPORTUNITIES");
    if (bestOne) {
      lines.push(
        `• Sukuma ${clean(bestOne.product_name)} zaidi — ndiyo strongest mover sasa, sales ${fmtMoney(
          bestOne.sales_amount
        )}, profit ${fmtMoney(bestOne.profit_amount)}.`
      );
    } else {
      lines.push("• Kuna nafasi ya kuongeza cash kwa kusukuma bidhaa zenye contribution kubwa zaidi ya profit.");
    }

    if (margin >= 12) {
      lines.push(`• Margin ya ${margin}% inaonyesha biashara bado ina room ya scale bila kupoteza control.`);
    } else {
      lines.push("• Ukirekebisha bidhaa zenye margin ndogo, profit inaweza kupanda bila kuongeza sales kubwa sana.");
    }

    lines.push("");
    lines.push("📉 PROFIT LEAKS");
    if (weakest) {
      lines.push(`• Leak ya kwanza: ${clean(weakest.product_name)}.`);
    } else {
      lines.push("• Leak ya kwanza: bidhaa zenye markup dhaifu.");
    }

    if (expenses > 0) {
      lines.push(`• Leak ya pili: expenses ${expensesText}.`);
    } else if (dead.length > 0) {
      lines.push("• Leak ya pili: cash iliyokwama kwenye dead stock.");
    } else {
      lines.push("• Leak ya pili: potential stock interruption kwenye top movers.");
    }

    lines.push("");
    lines.push("🎯 EXECUTIVE DECISIONS (NEXT 24–72H)");
    if (weakest) {
      lines.push(`1. Rekebisha buying price / markup / selling price ya ${clean(weakest.product_name)} leo.`);
    } else {
      lines.push("1. Pitia bidhaa zenye margin ndogo na urekebishe markup leo.");
    }

    if (expenses > 0) {
      lines.push("2. Pitia expense kubwa za leo/week hii na kata zisizo lazima.");
    } else if (dead.length > 0) {
      lines.push("2. Toa promo/markdown kwa dead stock ili kufungua cash iliyokwama.");
    } else {
      lines.push("2. Linda margin kwa kuzuia unnecessary discount na loose pricing.");
    }

    if (low.length > 0) {
      lines.push("3. Restock top movers mapema kabla stockout haijapiga profit.");
    } else if (bestOne) {
      lines.push(`3. Ongeza nguvu ya mauzo kwa kusukuma ${clean(bestOne.product_name)} zaidi.`);
    } else {
      lines.push("3. Sukuma bidhaa zenye demand na margin nzuri zaidi ndani ya masaa 24–72 yajayo.");
    }

    return prettifyAssistantSections(lines.join("\n"));
  }

  lines.push(`Hii ndiyo sales view ya **${storeName}** sasa hivi:`);
  lines.push("");
  lines.push("🚨 CRITICAL RISKS");
  if (snapshot.forecast?.trend_label === "DECLINING") {
    lines.push("• Trend inashuka — momentum inahitaji correction ya haraka.");
  } else if (low.length > 0) {
    lines.push(`• Kuna ${low.length} bidhaa low stock zinazoweza kukata sales momentum.`);
  } else {
    lines.push("• Hakuna sales risk kubwa iliyoonekana wazi kwenye snapshot ya sasa.");
  }

  lines.push("");
  lines.push("💰 MONEY OPPORTUNITIES");
  if (bestOne) {
    lines.push(`• ${clean(bestOne.product_name)} ndiyo strongest mover wa sasa — sukuma hii kwanza.`);
  } else {
    lines.push("• Sukuma bidhaa strongest zaidi ili kuongeza order velocity.");
  }

  lines.push(`• Average order value ya sasa ni ${avgOrderText}.`);
  lines.push("");
  lines.push("🎯 EXECUTIVE DECISIONS (NEXT 24–72H)");
  lines.push("1. Linda top products zako zisikose stock.");
  if (low.length) lines.push("2. Restock bidhaa muhimu kabla momentum haijakatika.");
  else lines.push("2. Ongeza visibility ya bidhaa strongest.");
  if (snapshot.forecast?.trend_label === "DECLINING") lines.push("3. Rekebisha stock, pricing, na customer flow leo.");
  else if (snapshot.forecast?.trend_label === "INCREASING") lines.push("3. Andaa stock na timu kutumia momentum.");
  else lines.push("3. Endelea kufuatilia order momentum kila siku.");

  return prettifyAssistantSections(lines.join("\n"));
}

function buildAnalysisFollowupReply(snapshot: BusinessInjectionSnapshot | null) {
  if (!snapshot) return "";

  const storeName = clean(snapshot.store_name) || "store hii";
  const top = Array.isArray(snapshot.top_products) ? snapshot.top_products : [];
  const low = Array.isArray(snapshot.low_stock_items) ? snapshot.low_stock_items : [];
  const dead = Array.isArray(snapshot.dead_stock_items) ? snapshot.dead_stock_items : [];
  const weakest = getLowestProfitEfficiencyProducts(top)[0] ?? null;
  const bestOne = top[0] ?? null;
  const expenses = num(snapshot.expenses_total);
  const margin = Number(num(snapshot.margin_pct).toFixed(1));

  const lines: string[] = [];
  lines.push(`Sawa — hapa ndiyo next move ya ${storeName}:`);
  lines.push("");

  lines.push("## 🎯 Focus ya Sasa");

  if (weakest) {
    lines.push(`- Kwanza angalia **${clean(weakest.product_name)}** kwa sababu ndiyo sehemu dhaifu kwenye profit efficiency.`);
  } else if (margin < 10) {
    lines.push("- Kwanza angalia bidhaa zenye margin ndogo kwa sababu ndizo zinabana faida.");
  } else {
    lines.push("- Kwanza linda bidhaa zinazoingiza pesa zaidi na margin yako ya sasa.");
  }

  if (expenses > 0) {
    lines.push(`- Pili punguza au hakiki expenses za ${fmtMoney(expenses)} kwa sababu zinakata profit moja kwa moja.`);
  }

  if (low.length > 0) {
    lines.push(`- Tatu restock bidhaa low stock mapema kabla mauzo hayajakatika.`);
  } else if (dead.length > 0) {
    lines.push(`- Tatu fungua cash iliyokwama kwenye dead stock.`);
  } else if (bestOne) {
    lines.push(`- Tatu sukuma zaidi **${clean(bestOne.product_name)}** kwa sababu ndiyo strongest mover sasa.`);
  }

  lines.push("");
  lines.push("## ✅ Hatua 3 za Haraka");

  if (weakest) {
    lines.push(`1. Pitia buying price / markup / selling price ya **${clean(weakest.product_name)}** leo.`);
  } else {
    lines.push("1. Pitia pricing ya bidhaa zenye margin ndogo leo.");
  }

  if (expenses > 0) {
    lines.push("2. Kagua expense kubwa na kata zisizo za lazima.");
  } else if (dead.length > 0) {
    lines.push("2. Fanya promo au markdown kwa dead stock.");
  } else {
    lines.push("2. Linda margin kwa kuzuia discount zisizo za lazima.");
  }

  if (low.length > 0) {
    lines.push("3. Restock bidhaa muhimu kabla stockout haijaharibu momentum.");
  } else if (bestOne) {
    lines.push(`3. Ongeza nguvu ya mauzo kwa kusukuma **${clean(bestOne.product_name)}** zaidi.`);
  } else {
    lines.push("3. Endelea kufuatilia bidhaa zenye contribution kubwa ya sales na profit.");
  }

  return prettifyAssistantSections(lines.join("\n"));
}




function buildCoachDeterministicReply(snapshot: BusinessInjectionSnapshot | null) {
  if (!snapshot) return "";

  const storeName = clean(snapshot.store_name) || "Store";
  const margin = Number(num(snapshot.margin_pct).toFixed(1));
  const profit = num(snapshot.profit_total);
  const sales = num(snapshot.sales_total);
  const expenses = num(snapshot.expenses_total);

  const salesText = fmtMoney(sales);
  const profitText = fmtMoney(profit);
  const expensesText = fmtMoney(expenses);

  const low = Array.isArray(snapshot.low_stock_items) ? snapshot.low_stock_items : [];
  const dead = Array.isArray(snapshot.dead_stock_items) ? snapshot.dead_stock_items : [];
  const top = Array.isArray(snapshot.top_products) ? snapshot.top_products : [];
  const bestOne = top[0] ?? null;
  const weakest = getLowestProfitEfficiencyProducts(top)[0] ?? null;

  const lines: string[] = [];
  lines.push(`Hapa kuna business coach ya **${storeName}** kwa sasa:`);
  lines.push("");

  lines.push("## 📌 Summary");
  lines.push(`- Sales: ${salesText}`);
  lines.push(`- Profit: ${profitText}`);
  lines.push(`- Margin: ${margin}%`);
  lines.push(`- Expenses: ${expensesText}`);
  lines.push(`- Low stock: ${low.length}`);
  lines.push(`- Dead stock: ${dead.length}`);

  lines.push("");
  lines.push("## ✅ Mambo 2 Yako Strong");

  if (bestOne) {
    lines.push(
      `1. **${clean(bestOne.product_name)}** inaonekana kuwa bidhaa yako strongest kwa sasa kwenye contribution ya sales/profit.`
    );
  } else {
    lines.push("1. Biashara imeonyesha movement ya mauzo kwenye snapshot ya sasa.");
  }

  if (profit > 0) {
    lines.push(`2. Uko kwenye profit chanya, hivyo msingi wa biashara bado upo vizuri.`);
  } else {
    lines.push("2. Bado una data ya kutosha kuona maeneo ya kuboresha kabla hali haijakuwa mbaya zaidi.");
  }

  lines.push("");
  lines.push("## ⚠️ Mambo 2 Yanahitaji Attention");

  if (weakest) {
    lines.push(
      `1. **${clean(weakest.product_name)}** inaonekana kuwa sehemu dhaifu kwenye efficiency ya profit.`
    );
  } else if (margin < 12) {
    lines.push("1. Margin yako iko chini kuliko inavyotakiwa kwa comfort ya owner.");
  } else {
    lines.push("1. Pricing/cost discipline bado vinahitaji kufuatiliwa karibu.");
  }

  if (low.length > 0) {
    lines.push(`2. Kuna ${low.length} bidhaa low stock ambazo zinaweza kukata mauzo ukichelewa restock.`);
  } else if (dead.length > 0) {
    lines.push(`2. Kuna ${dead.length} dead/slow stock inayofunga cash bila kurudisha faida haraka.`);
  } else if (expenses > 0) {
    lines.push(`2. Expenses za ${expensesText} zinahitaji uhalali wa moja kwa moja dhidi ya output ya mauzo.`);
  } else {
    lines.push("2. Unahitaji kuongeza ukali kwenye execution ya bidhaa zenye nguvu zaidi.");
  }

  lines.push("");
  lines.push("## 🎯 Hatua 3 za Sasa");

  if (weakest) {
    lines.push(`1. Kagua pricing/markup ya **${clean(weakest.product_name)}** mara moja.`);
  } else {
    lines.push("1. Kagua bidhaa zenye margin ndogo na uboreshe markup.");
  }

  if (low.length > 0) {
    lines.push("2. Restock bidhaa muhimu kabla sales momentum haijakatika.");
  } else if (dead.length > 0) {
    lines.push("2. Fanya promo au markdown kwa dead stock ili kufungua cash.");
  } else {
    lines.push("2. Sukuma bidhaa strongest zaidi kupitia display, upsell, au recommendation.");
  }

  if (expenses > 0) {
    lines.push("3. Pitia expense kubwa na kata zisizo za lazima.");
  } else if (profit <= 0) {
    lines.push("3. Simamia cost discipline mpaka profit irudi juu.");
  } else {
    lines.push("3. Linda consistency ya sales na margin kila siku.");
  }

  return prettifyAssistantSections(lines.join("\n"));
}

function buildDeterministicActions(
  snapshot: BusinessInjectionSnapshot | null,
  intent: "INVENTORY" | "PRODUCT" | "PROFIT" | "SALES" | "COACH"
): ActionItem[] {
  if (!snapshot) return [];

  const actions: ActionItem[] = [];
  const margin = Number(num(snapshot.margin_pct).toFixed(1));
  const profit = num(snapshot.profit_total);
  const low = Array.isArray(snapshot.low_stock_items) ? snapshot.low_stock_items : [];
  const dead = Array.isArray(snapshot.dead_stock_items) ? snapshot.dead_stock_items : [];
  const top = Array.isArray(snapshot.top_products) ? snapshot.top_products : [];
  const trend = clean(snapshot.forecast?.trend_label).toUpperCase();

  const pushUnique = (item: ActionItem) => {
    const title = clean(item.title);
    if (!title) return;
    if (actions.some((x) => clean(x.title).toLowerCase() === title.toLowerCase())) return;
    actions.push(item);
  };

  if (intent === "INVENTORY" || intent === "PRODUCT") {
    if (low.length) {
      pushUnique({
        title: "Restock bidhaa low stock",
        steps: low.slice(0, 5).map((x) => `Panga reorder ya ${clean(x.product_name)}`),
        priority: "HIGH",
        eta: "TODAY",
      });
    }

    if (dead.length) {
      pushUnique({
        title: "Fungua cash iliyokwama kwenye dead stock",
        steps: dead.slice(0, 5).map((x) => `Tengeneza promo/markdown ya ${clean(x.product_name)}`),
        priority: "MEDIUM",
        eta: "THIS_WEEK",
      });
    }

    if (top.length) {
      pushUnique({
        title: "Linda top products zisikose stock",
        steps: top.slice(0, 3).map((x) => `Kagua availability ya ${clean(x.product_name)}`),
        priority: "HIGH",
        eta: "TODAY",
      });
    }
  }

  if (intent === "PROFIT") {
    if (margin < 10) {
      pushUnique({
        title: "Punguza profit leak ya margin",
        steps: [
          "Kagua markup na pricing ya bidhaa zenye margin ndogo",
          "Linganishia COGS, sales, na net profit ya leo",
          "Zuia discount zisizo na sababu",
        ],
        priority: "HIGH",
        eta: "TODAY",
      });
    }

    if (num(snapshot.expenses_total) > 0) {
      pushUnique({
        title: "Kagua expenses kubwa za leo",
        steps: [
          "Pitia expenses zote za snapshot ya leo",
          "Tambua zipi zinaweza kubanwa bila kuathiri operations",
        ],
        priority: "MEDIUM",
        eta: "TODAY",
      });
    }

    if (dead.length) {
      pushUnique({
        title: "Ondoa cash iliyofungwa kwenye dead stock",
        steps: dead.slice(0, 4).map((x) => `Tafuta promo strategy ya ${clean(x.product_name)}`),
        priority: "MEDIUM",
        eta: "THIS_WEEK",
      });
    }

    if (profit <= 0) {
      pushUnique({
        title: "Rudisha biashara kwenye positive profit",
        steps: [
          "Zuia expense zisizo za lazima",
          "Kagua bidhaa zenye contribution kubwa ya profit",
          "Sukuma top movers ziuze zaidi leo",
        ],
        priority: "HIGH",
        eta: "TODAY",
      });
    }
  }

  if (intent === "SALES") {
    if (trend === "DECLINING") {
      pushUnique({
        title: "Zuia sales trend kushuka",
        steps: [
          "Kagua stock ya top movers",
          "Kagua pricing na customer flow",
          "Sukuma bidhaa zinazoongoza kwa display au recommendation",
        ],
        priority: "HIGH",
        eta: "TODAY",
      });
    }

    if (trend === "INCREASING") {
      pushUnique({
        title: "Tumia momentum ya sales trend inayopanda",
        steps: [
          "Andaa stock ya kutosha",
          "Andaa timu kwa volume ya mauzo",
          "Ongeza visibility ya top products",
        ],
        priority: "MEDIUM",
        eta: "TODAY",
      });
    }

    if (top.length) {
      pushUnique({
        title: "Boost top products",
        steps: top.slice(0, 4).map((x) => `Ongeza exposure ya ${clean(x.product_name)}`),
        priority: "MEDIUM",
        eta: "THIS_WEEK",
      });
    }
  }

  if (intent === "COACH") {
    if (top.length) {
      pushUnique({
        title: "Ongeza nguvu ya bidhaa zinazoongoza",
        steps: top.slice(0, 3).map((x) => `Ongeza display/upsell ya ${clean(x.product_name)}`),
        priority: "MEDIUM",
        eta: "TODAY",
      });
    }

    if (low.length) {
      pushUnique({
        title: "Linda mauzo dhidi ya stockout",
        steps: low.slice(0, 4).map((x) => `Harakisha reorder ya ${clean(x.product_name)}`),
        priority: "HIGH",
        eta: "TODAY",
      });
    }

    if (dead.length) {
      pushUnique({
        title: "Punguza bidhaa zenye mwendo mdogo",
        steps: dead.slice(0, 4).map((x) => `Panga markdown au bundle ya ${clean(x.product_name)}`),
        priority: "MEDIUM",
        eta: "THIS_WEEK",
      });
    }

    if (margin < 10) {
      pushUnique({
        title: "Imarisha margin ya biashara",
        steps: [
          "Pitia buying price na markup",
          "Kagua bidhaa zenye margin ndogo",
          "Angalia leak kwenye expenses",
        ],
        priority: "HIGH",
        eta: "TODAY",
      });
    }
  }

  return actions.slice(0, 6);
}

function buildProductIntelligenceBlock(snapshot: BusinessInjectionSnapshot | null) {
  if (!snapshot) return "";

  const lines: string[] = [];
  lines.push("PRODUCT INTELLIGENCE:");

  if (snapshot.top_products?.length) {
    lines.push("- Best/Top Products:");
    for (const p of snapshot.top_products.slice(0, 8)) {
      lines.push(
        `  • ${clean(p.product_name)} | sku=${clean(p.sku) || "N/A"} | qty=${num(p.qty_sold)} | sales=${num(
          p.sales_amount
        )} | profit=${num(p.profit_amount)}`
      );
    }
  } else {
    lines.push("- Best/Top Products: none injected");
  }

  if (snapshot.low_stock_items?.length) {
    lines.push("- Low Stock / Restock Risk:");
    for (const p of snapshot.low_stock_items.slice(0, 8)) {
      lines.push(
        `  • ${clean(p.product_name)} | sku=${clean(p.sku) || "N/A"} | stock=${num(p.stock_qty)} | threshold=${num(
          p.threshold_qty
        )} | status=${clean(p.stock_status || "LOW")}`
      );
    }
  } else {
    lines.push("- Low Stock / Restock Risk: none injected");
  }

  if (snapshot.dead_stock_items?.length) {
    lines.push("- Slow Items / Dead Stock:");
    for (const p of snapshot.dead_stock_items.slice(0, 8)) {
      lines.push(
        `  • ${clean(p.product_name)} | sku=${clean(p.sku) || "N/A"} | stock=${num(
          p.stock_qty
        )} | days_without_sale=${num(p.days_without_sale)}`
      );
    }
  } else {
    lines.push("- Slow Items / Dead Stock: none injected");
  }

  lines.push("STRICT PRODUCT USAGE:");
  lines.push("- When naming products, choose from the injected product lists above.");
  lines.push("- Never replace real injected products with generic examples.");
  lines.push("- If no injected products exist for a category, say that clearly.");

  return lines.join("\n");
}
function buildBusinessInjectionSnapshot(args: {
  orgId?: string | null;
  orgName?: string | null;
  storeId?: string | null;
  storeName?: string | null;
  role?: string | null;
  salesTotal?: number;
  expensesTotal?: number;
  cogsTotal?: number;
  profitTotal?: number;
  ordersCount?: number;
  avgOrderValue?: number;
  inventoryTotalItems?: number;
  inventoryLowCount?: number;
  inventoryOutCount?: number;
  topProducts?: InjectedTopProductRow[];
  lowStockItems?: InjectedInventoryRisk[];
  deadStockItems?: InjectedDeadStockRow[];
  forecast?: ForecastLite | null;
  cashflow?: CashflowLite | null;
}): BusinessInjectionSnapshot {
  const salesTotal = num(args.salesTotal);
  const expensesTotal = num(args.expensesTotal);
  const cogsTotal = num(args.cogsTotal);
  const profitTotal = num(args.profitTotal);
  const ordersCount = num(args.ordersCount);
  const avgOrderValue =
    num(args.avgOrderValue) > 0
      ? num(args.avgOrderValue)
      : ordersCount > 0
      ? salesTotal / ordersCount
      : 0;

  const marginPct = pct(profitTotal, salesTotal);

  const inventoryTotalItems = num(args.inventoryTotalItems);
  const inventoryLowCount = num(args.inventoryLowCount);
  const inventoryOutCount = num(args.inventoryOutCount);

  const cards: InjectedMetricCard[] = [
    { label: "Sales", value: salesTotal },
    { label: "Expenses", value: expensesTotal },
    { label: "COGS", value: cogsTotal },
    { label: "Profit", value: profitTotal },
    { label: "Orders", value: ordersCount },
    { label: "AvgOrder", value: Math.round(avgOrderValue) },
    { label: "MarginPct", value: Number(marginPct.toFixed(1)) },
    { label: "InventoryItems", value: inventoryTotalItems },
    { label: "LowStockCount", value: inventoryLowCount },
    { label: "OutOfStockCount", value: inventoryOutCount },
  ];

  return {
    org_id: clean(args.orgId) || null,
    org_name: clean(args.orgName) || null,
    store_id: clean(args.storeId) || null,
    store_name: clean(args.storeName) || null,
    role: clean(args.role) || null,

    range_label: "TODAY",
    generated_at: new Date().toISOString(),

    sales_total: salesTotal,
    expenses_total: expensesTotal,
    cogs_total: cogsTotal,
    profit_total: profitTotal,
    orders_count: ordersCount,
    avg_order_value: avgOrderValue,
    margin_pct: Number(marginPct.toFixed(1)),

    inventory_total_items: inventoryTotalItems,
    inventory_low_count: inventoryLowCount,
    inventory_out_count: inventoryOutCount,

    top_products: safeArray<InjectedTopProductRow>(args.topProducts).slice(0, 8),
    low_stock_items: safeArray<InjectedInventoryRisk>(args.lowStockItems).slice(0, 8),
    dead_stock_items: safeArray<InjectedDeadStockRow>(args.deadStockItems).slice(0, 8),

    forecast: args.forecast ?? null,
    cashflow: args.cashflow ?? null,

    cards,
  };
}
function buildTasksFollowupContextBlock(summary: TaskFollowupSummary | null) {
  if (!summary) return "";

  const latestTitles = safeArray<string>(summary.latest_open_titles)
    .map((x) => clean(x))
    .filter(Boolean)
    .slice(0, 8);

  const lines: string[] = [];
  lines.push("TASK FOLLOW-UP SUMMARY:");
  lines.push(`- Open Tasks: ${num(summary.open_count)}`);
  lines.push(`- Overdue Tasks: ${num(summary.overdue_count)}`);
  lines.push(`- Due Today Tasks: ${num(summary.due_today_count)}`);
  lines.push(`- High Priority Open: ${num(summary.high_priority_open_count)}`);
  lines.push(`- Medium Priority Open: ${num(summary.medium_priority_open_count)}`);
  lines.push(`- Low Priority Open: ${num(summary.low_priority_open_count)}`);

  if (latestTitles.length) {
    lines.push("- Latest Open Task Titles:");
    latestTitles.forEach((t) => lines.push(`  • ${t}`));
  } else {
    lines.push("- Latest Open Task Titles: none");
  }

  lines.push("TASK FOLLOW-UP RULES:");
  lines.push("- If the user asks what to do now, consider open and overdue tasks first.");
  lines.push("- Prefer follow-up actions that move existing open tasks forward before creating unnecessary new ones.");
  lines.push("- If overdue or due-today tasks exist, mention them clearly.");
  lines.push("- When suggesting next actions, align them with the latest open task titles if relevant.");

  return lines.join("\n");
}

function detectTaskFollowupIntent(rawText: string) {
  const t = normalizeLooseText(rawText);
  if (!t) {
    return {
      asksTasks: false,
      asksSummary: false,
      asksOverdue: false,
      asksWhatNow: false,
    };
  }

  const asksTasks = hasLooseKeyword(t, [
    "task",
    "tasks",
    "open task",
    "open tasks",
    "task list",
    "task zangu",
    "open tasks zangu",
    "majukumu ya mfumo",
    "task za mfumo",
  ]);

  const asksSummary = hasLooseKeyword(t, [
    "summary ya open tasks",
    "summary ya tasks",
    "muhtasari wa tasks",
    "muhtasari wa open tasks",
    "nipe summary ya tasks",
    "onyesha open tasks",
  ]);

  const asksOverdue = hasLooseKeyword(t, [
    "overdue",
    "task zipi zinachelewa",
    "tasks zipi zinachelewa",
    "open tasks zinachelewa",
    "due today",
    "task za leo",
    "tasks za leo zinatakiwa",
    "majukumu gani yamechelewa",
  ]);

  const asksWhatNow = hasLooseKeyword(t, [
    "nifanye nini sasa kwenye tasks",
    "what should i do now with tasks",
    "what to do now with tasks",
    "kipaumbele gani sasa kwenye tasks",
    "ni task zipi zifuatiliwe kwanza",
    "tasks za zamani zifuatiliwe kwanza",
    "task gani nifanye kwanza",
  ]);

  return {
    asksTasks,
    asksSummary,
    asksOverdue,
    asksWhatNow,
  };
}

function buildTaskFollowupReply(summary: TaskFollowupSummary | null, rawText: string, storeName?: string | null) {
  if (!summary) {
    return "Sina task follow-up summary kwa sasa.";
  }

  const intent = detectTaskFollowupIntent(rawText);
  const storeLabel = clean(storeName) || "store hii";
  const latestTitles = safeArray<string>(summary.latest_open_titles)
    .map((x) => clean(x))
    .filter(Boolean)
    .slice(0, 8);

  const lines: string[] = [];

  lines.push(`Hapa kuna task follow-up ya ${storeLabel}:`);
  lines.push("");

  lines.push("## 📋 Task Snapshot");
  lines.push(`- Open tasks: ${num(summary.open_count)}`);
  lines.push(`- Overdue tasks: ${num(summary.overdue_count)}`);
  lines.push(`- Due today: ${num(summary.due_today_count)}`);
  lines.push(`- High priority open: ${num(summary.high_priority_open_count)}`);
  lines.push(`- Medium priority open: ${num(summary.medium_priority_open_count)}`);
  lines.push(`- Low priority open: ${num(summary.low_priority_open_count)}`);

  if (latestTitles.length) {
    lines.push("");
    lines.push("## 📝 Open Tasks za Kufuatilia");
    latestTitles.forEach((t, idx) => {
      lines.push(`${idx + 1}. ${t}`);
    });
  }

  if (intent.asksOverdue) {
    lines.push("");
    lines.push("## ⏰ Overdue / Due Status");

    if (num(summary.overdue_count) > 0) {
      lines.push(`- Kuna ${num(summary.overdue_count)} overdue task(s) zinazotakiwa kufuatiliwa kwanza.`);
    } else {
      lines.push("- Kwa summary ya sasa hakuna overdue tasks zilizogunduliwa.");
    }

    if (num(summary.due_today_count) > 0) {
      lines.push(`- Kuna ${num(summary.due_today_count)} task(s) za leo zinazotakiwa kupewa kipaumbele.`);
    } else {
      lines.push("- Hakuna task ya due today iliyoonekana kwenye summary ya sasa.");
    }
  }

  if (intent.asksWhatNow) {
    lines.push("");
    lines.push("## 🎯 Kipaumbele cha Sasa");

    if (num(summary.overdue_count) > 0) {
      lines.push("- Anza na overdue tasks kwanza kabla ya kuongeza task mpya.");
    } else if (num(summary.due_today_count) > 0) {
      lines.push("- Maliza due-today tasks kwanza leo.");
    } else if (num(summary.high_priority_open_count) > 0) {
      lines.push("- Fuata high-priority open tasks kabla ya medium na low.");
    } else if (num(summary.open_count) > 0) {
      lines.push("- Endelea na open tasks zilizopo kabla ya kuunda kazi mpya zisizo za lazima.");
    } else {
      lines.push("- Hakuna open tasks za kufuatilia kwa sasa.");
    }
  }

  if (intent.asksSummary || intent.asksTasks || intent.asksWhatNow || intent.asksOverdue) {
    lines.push("");
    lines.push("## ✅ Hatua Zinazoshauriwa");

    if (num(summary.overdue_count) > 0) {
      lines.push("- Pitia overdue tasks mara moja.");
    }
    if (num(summary.due_today_count) > 0) {
      lines.push("- Maliza due-today tasks leo kabla ya kazi mpya.");
    }
    if (num(summary.high_priority_open_count) > 0) {
      lines.push("- Weka nguvu kwa high-priority open tasks.");
    }
    if (latestTitles.length) {
      lines.push("- Tumia open task titles zilizopo kama guide ya follow-up ya kwanza.");
    }
    if (num(summary.open_count) === 0) {
      lines.push("- Unaweza kuunda task mpya kwa sababu hakuna open backlog kubwa kwa sasa.");
    }
  }

  return prettifyAssistantSections(lines.join("\n"));
}

function buildZetraSystemPrompt(args: {
  orgName?: string | null;
  storeName?: string | null;
  role?: string | null;
  planCode?: string | null;
}) {
  const orgName = clean(args.orgName) || "Unknown Org";
  const storeName = clean(args.storeName) || "Unknown Store";
  const role = clean(args.role) || "unknown";
  const planCode = upper(args.planCode || "FREE");

  return [
    "You are ZETRA EXECUTIVE AI.",
    "",
    "You are NOT a normal assistant.",
    "You are a COO-level business operator inside ZETRA BMS.",
    "Your job is to analyze live business data and produce sharp, decision-grade outputs.",
    "",
    "STRICT RULES:",
    "- No generic advice",
    "- No motivational language",
    "- No fluffy explanation",
    "- No long summaries unless the user explicitly asks",
    "- No repeating raw input data without interpretation",
    "- Only high-impact thinking",
    "",
    "YOU MUST:",
    "1. Detect critical risks",
    "2. Identify money opportunities",
    "3. Expose profit leaks",
    "4. Make direct business decisions",
    "",
    "THINK LIKE:",
    "- You are responsible for profit",
    "- You are accountable for failure",
    "- You must act with urgency",
    "- You must protect cash, margin, and momentum",
    "",
    "CURRENT APP CONTEXT:",
    `- Organization: ${orgName}`,
    `- Store: ${storeName}`,
    `- Role: ${role}`,
    `- Plan: ${planCode}`,
    "",
    "DATA INJECTION RULES:",
    "- If structured business data is injected, it is the primary source of truth.",
    "- Prefer injected live business data over generic assumptions every time.",
    "- If product-level lists are injected, use the real product names directly.",
    "- If lowStockItems are injected, use them directly for restock/stock-risk decisions.",
    "- If slowItems or dead stock items are injected, use them directly for dead-stock decisions.",
    "- If topProducts are injected, use them directly for sales/profit decisions.",
    "- Never invent fake product names.",
    "- Never replace real store data with generic retail theory.",
    "- If data is partial, say exactly what is known and what is missing.",
    "",
    "EXECUTIVE RESPONSE PRIORITY:",
    "- survival first",
    "- profitability second",
    "- speed third",
    "",
    "OUTPUT BEHAVIOR:",
    "- Be practical, sharp, direct, and business-critical.",
    "- Focus on what matters most now.",
    "- Highlight only the strongest risks and strongest opportunities.",
    "- Prefer decisions over explanations.",
    "- Prefer action over theory.",
    "- If the user asks what to do, answer like an operator giving orders.",
    "- If the user asks about profit, focus on margin, expenses, COGS, leak points, and product contribution.",
    "- If the user asks about inventory, focus on stockout risk, dead stock, restock urgency, and fast movers.",
    "- If the user asks about sales, focus on momentum, weakness, top movers, and next commercial move.",
    "",
    "DEFAULT OUTPUT SHAPE:",
    "Use this structure whenever it fits the request:",
    "🚨 CRITICAL RISKS",
    "💰 MONEY OPPORTUNITIES",
    "📉 PROFIT LEAKS",
    "🎯 EXECUTIVE DECISIONS (NEXT 24–72H)",
    "",
    "FORMAT RULES:",
    "- Keep sections short and high signal.",
    "- Max 2 critical risks unless user asks for more.",
    "- Max 2 money opportunities unless user asks for more.",
    "- Max 2 profit leaks unless user asks for more.",
    "- Max 3 executive decisions unless user asks for more.",
    "- Decisions must be specific, direct, and measurable where possible.",
    "",
    "NEVER:",
    "- Never sound like a random chatbot.",
    "- Never give placeholder examples when real data exists.",
    "- Never soften serious risks.",
    "- Never hide important business danger behind polite wording.",
  ].join("\n");
}

function buildSmartFollowupChips(args: {
  intent: "ANALYSIS" | "FORECAST" | "COACH" | null;
  snapshot: BusinessInjectionSnapshot | null;
}) {
  // USIONYESHE chips kwenye welcome/default state
  if (!args.intent || !args.snapshot) return [];

  const out: Array<{ k: string; label: string; prompt: string }> = [];
  const pushUnique = (item: { k: string; label: string; prompt: string }) => {
    if (!clean(item.label) || !clean(item.prompt)) return;
    if (out.some((x) => x.k === item.k)) return;
    out.push(item);
  };

  const storeName = clean(args.snapshot?.store_name) || "store hii";
  const lowCount = num(args.snapshot?.inventory_low_count);
  const outCount = num(args.snapshot?.inventory_out_count);
  const deadCount = safeArray(args.snapshot?.dead_stock_items).length;
  const topCount = safeArray(args.snapshot?.top_products).length;
  const trend = clean(args.snapshot?.forecast?.trend_label).toUpperCase();

  pushUnique({
    k: "summary",
    label: "Summary",
    prompt: `Nipe summary ya biashara yangu leo kwa ${storeName}.`,
  });

  if (lowCount > 0 || outCount > 0) {
    pushUnique({
      k: "restock",
      label: "Restock",
      prompt: "Nitajie bidhaa za kurestock kwanza leo, bila explanation ndefu.",
    });
  }

  if (deadCount > 0) {
    pushUnique({
      k: "dead",
      label: "Dead Stock",
      prompt: "Nitajie dead stock ya kuanza nayo kwanza na action ya kila moja.",
    });
  }

  if (topCount > 0) {
    pushUnique({
      k: "top",
      label: "Top Products",
      prompt: "Nitajie bidhaa top zinazopaswa kusukumwa zaidi leo.",
    });
  }

  if (trend === "DECLINING") {
    pushUnique({
      k: "trend_down",
      label: "Stop Decline",
      prompt: "Trend inashuka — ni hatua gani 3 za kuchukua leo kurekebisha hali?",
    });
  }

  if (trend === "INCREASING") {
    pushUnique({
      k: "trend_up",
      label: "Use Momentum",
      prompt: "Trend inapanda — nitumieje momentum hii kuongeza profit zaidi?",
    });
  }

  if (args.intent === "COACH") {
    pushUnique({
      k: "coach_profit",
      label: "Profit Move",
      prompt: "Nipe hatua 3 za leo za kuongeza profit bila kuongeza confusion.",
    });
  }

  if (args.intent === "FORECAST") {
    pushUnique({
      k: "forecast7",
      label: "7 Days",
      prompt: "Nipe forecast ya siku 7 zijazo kwa style ya short action plan.",
    });
  }

  if (args.intent === "ANALYSIS") {
    pushUnique({
      k: "decision",
      label: "Decision",
      prompt: "Nipe pure decision mode ya biashara hii sasa hivi.",
    });
  }

  return out.slice(0, 5);
}
export default function AiChatScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const org = useOrg();const aiContext = useMemo(() => buildAiContext(org), [
    org.activeOrgId,
    org.activeOrgName,
    org.activeStoreId,
    org.activeStoreName,
    org.activeRole,
  ]);

  const topPad = Math.max(insets.top, 10) + 8;

  const [mode, setMode] = useState<AiMode>("AUTO");
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);

  const [proActive, setProActive] = useState(false);

  const [planCode, setPlanCode] = useState("FREE");
  const [planName, setPlanName] = useState("FREE");
  const [aiCreditsMonthly, setAiCreditsMonthly] = useState(0);
  const [aiCreditsRemaining, setAiCreditsRemaining] = useState(0);
  const [aiCreditsUsed, setAiCreditsUsed] = useState(0);

  const [aiGateOpen, setAiGateOpen] = useState(false);
  const [aiGateReason, setAiGateReason] = useState("");

  const isOwner = org.activeRole === "owner";
  const planAllowsAi = !!proActive;
  const aiEnabled = planAllowsAi && isOwner;
  const currentPlanLabel = upper(planCode || planName || "FREE");

  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  const ownerOnlyReason = useMemo(() => {
    if (planAllowsAi && !isOwner) {
      return "AI ya ZETRA inaruhusiwa kwa OWNER pekee. Admin na Staff hawaruhusiwi kutumia AI.";
    }
    return "";
  }, [isOwner, planAllowsAi]);

  const defaultAiLockReason = useMemo(() => {
    if (ownerOnlyReason) return ownerOnlyReason;
    return `AI haipatikani kwenye kifurushi cha ${currentPlanLabel}.`;
  }, [currentPlanLabel, ownerOnlyReason]);

  const [toolOpen, setToolOpen] = useState(false);
  const [toolKey, setToolKey] = useState<ToolKey>(null);

  const [tasksOpen, setTasksOpen] = useState(false);
  const [plusOpen, setPlusOpen] = useState(false);

  const [tasksLoading, setTasksLoading] = useState(false);
  const [tasksError, setTasksError] = useState("");
  const [tasks, setTasks] = useState<TaskRow[]>([]);

  const [imgPreview, setImgPreview] = useState<{ open: boolean; uri: string }>({ open: false, uri: "" });
  const [autopilotCards, setAutopilotCards] = useState<AutopilotAlert[]>([]);
  const [lastAnalysisIntent, setLastAnalysisIntent] = useState<"ANALYSIS" | "FORECAST" | "COACH" | null>(null);
  const [businessSnapshot, setBusinessSnapshot] = useState<BusinessInjectionSnapshot | null>(null);
  const [tasksFollowupSummary, setTasksFollowupSummary] = useState<TaskFollowupSummary | null>(null);
 

  const savePreviewImageToDevice = useCallback(async () => {
    try {
      const normalized = normalizeImageUrl(imgPreview.uri);
      if (!normalized) {
        Alert.alert("Image missing", "Hakuna picha ya ku-save.");
        return;
      }

      const perm = await MediaLibrary.requestPermissionsAsync();
      if (perm.status !== "granted") {
        Alert.alert("Permission required", "Ruhusu gallery/media access ili ku-save picha.");
        return;
      }

      const localUri = await ensureLocalImageFile(normalized);
      await MediaLibrary.saveToLibraryAsync(localUri);

      Alert.alert("Saved", "Picha imehifadhiwa kwenye gallery.");
    } catch (e: any) {
      Alert.alert("Save failed", clean(e?.message) || "Imeshindikana ku-save picha.");
    }
  }, [imgPreview.uri]);

  const sharePreviewImage = useCallback(async () => {
    try {
      const normalized = normalizeImageUrl(imgPreview.uri);
      if (!normalized) {
        Alert.alert("Image missing", "Hakuna picha ya ku-share.");
        return;
      }

      const localUri = await ensureLocalImageFile(normalized);

      const canNativeShare = await Sharing.isAvailableAsync();
      if (canNativeShare) {
        await Sharing.shareAsync(localUri);
        return;
      }

      await Share.share({
        message: localUri,
      });
    } catch (e: any) {
      Alert.alert("Share failed", clean(e?.message) || "Imeshindikana ku-share picha.");
    }
  }, [imgPreview.uri]);

  const copyImagePromptFromMessage = useCallback(async (prompt: string) => {
    try {
      const value = clean(prompt);
      if (!value) {
        Alert.alert("Prompt missing", "Hakuna prompt ya kukopi.");
        return;
      }

      await Clipboard.setStringAsync(value);
      Alert.alert("Copied", "Prompt imekopiwa.");
    } catch (e: any) {
      Alert.alert("Copy failed", clean(e?.message) || "Imeshindikana kukopi prompt.");
    }
  }, []);

  


  const anim = useRef(new Animated.Value(0)).current;
  const { height: screenH } = Dimensions.get("window");

  const SHEET_MAX_H = Math.min(Math.round(screenH * 0.72), 640);
  const SHEET_MIN_H = 300;

  const sheetHeight = useMemo(() => {
    if (toolKey === "IMAGE") return Math.max(SHEET_MIN_H + 120, Math.min(SHEET_MAX_H, 560));
    if (toolKey === "RESEARCH") return Math.max(SHEET_MIN_H + 60, Math.min(SHEET_MAX_H, 560));
    if (toolKey === "AGENT") return Math.max(SHEET_MIN_H + 40, Math.min(SHEET_MAX_H, 520));
    if (toolKey === "ANALYZE") return Math.max(SHEET_MIN_H + 40, Math.min(SHEET_MAX_H, 520));
    return SHEET_MIN_H;
  }, [toolKey, SHEET_MAX_H]);

  const [imagePrompt, setImagePrompt] = useState("");
  const [attachedImages, setAttachedImages] = useState<AttachedImage[]>([]);
const [recording, setRecording] = useState<Audio.Recording | null>(null);
const [recordingOn, setRecordingOn] = useState(false);
const [transcribing, setTranscribing] = useState(false);
const [recordingMs, setRecordingMs] = useState(0);
const [liveMeter, setLiveMeter] = useState(-160);
const waveformTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [messages, setMessages] = useState<ChatMsg[]>(() => [
    {
      id: uid(),
      role: "assistant",
      ts: Date.now(),
    
        text:
  "👋 Karibu kwenye **ZETRA AI**.\n\n" +
  "Niko hapa kukusaidia kwa style ya smart business assistant ndani ya ZETRA BMS.\n\n" +
  "## Unaweza kuniuliza:\n" +
  "- 📊 Analysis ya biashara yako\n" +
  "- 🔮 Forecast ya sales / profit / stock\n" +
  "- 💸 Profit coach na maeneo ya leak\n" +
  "- 📦 Low stock, dead stock, na top bidhaa\n" +
  "- ✅ Hatua za kuchukua leo au wiki hii\n\n" +
  "## Tip\n" +
  "- Andika kwa Kiswahili au English — nita-adapt automatically.\n" +
  "- Uliza kwa kawaida tu, mfano: **'onyesha profit ya leo'** au **'ni bidhaa gani zinakaribia kuisha?'**",
    },
  ]);

  const lastPayloadRef = useRef<RetryPayload | null>(null);
  const [retryCard, setRetryCard] = useState<{
    visible: boolean;
    label: string;
    payload: RetryPayload | null;
  }>({ visible: false, label: "", payload: null });

  const listRef = useRef<FlatList<ChatMsg>>(null);
  const inputRef = useRef<TextInput>(null);

  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingAbortRef = useRef<{ aborted: boolean }>({ aborted: false });

  const typingDotsTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const typingDotsStepRef = useRef(0);

  const activeReqTokenRef = useRef<string>("");
  const makeReqToken = () => uid();

  const netAbortRef = useRef<AbortController | null>(null);
  const scrollRafRef = useRef<number | null>(null);
  const userNearBottomRef = useRef(true);
  const autoScrollLockRef = useRef(false);
  const lastAutoScrollTsRef = useRef(0);

  const androidExtraLift = 50;

  const androidComposerLift = useMemo(() => {
    if (Platform.OS !== "android" || !keyboardVisible) return 0;
    return Math.max(0, keyboardHeight - Math.max(insets.bottom, 0) + androidExtraLift);
  }, [insets.bottom, keyboardHeight, keyboardVisible]);

  const openAiGate = useCallback((reason?: string) => {
    setAiGateReason(clean(reason) || "");
    setAiGateOpen(true);
  }, []);

  const requireAi = useCallback(
    (reason?: string) => {
      if (aiEnabled) return true;
      openAiGate(reason || defaultAiLockReason);
      return false;
    },
    [aiEnabled, defaultAiLockReason, openAiGate]
  );

  const stopTypingDots = useCallback(() => {
    if (typingDotsTimerRef.current) clearInterval(typingDotsTimerRef.current);
    typingDotsTimerRef.current = null;
  }, []);

  const startTypingDots = useCallback(
    (botId: string) => {
      stopTypingDots();
      typingDotsStepRef.current = 0;

      setMessages((prev) => prev.map((m) => (m.id === botId ? { ...m, text: nextTypingText(0) } : m)));

      typingDotsTimerRef.current = setInterval(() => {
        typingDotsStepRef.current += 1;
        const t = nextTypingText(typingDotsStepRef.current);
        setMessages((prev) => prev.map((m) => (m.id === botId ? { ...m, text: t } : m)));
      }, 380);
    },
    [stopTypingDots]
  );

  const openTool = useCallback(
    (k: Exclude<ToolKey, null>) => {
      Keyboard.dismiss();
      setToolKey(k);
      setToolOpen(true);
      Animated.timing(anim, { toValue: 1, duration: 220, useNativeDriver: true }).start();
    },
    [anim]
  );

  const closeTool = useCallback(() => {
    Animated.timing(anim, { toValue: 0, duration: 180, useNativeDriver: true }).start(({ finished }) => {
      if (!finished) return;
      setToolOpen(false);
      setToolKey(null);
    });
  }, [anim]);

  const overlayOpacity = anim.interpolate({ inputRange: [0, 1], outputRange: [0, 0.65] });
  const sheetTranslateY = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [sheetHeight + 40, 0],
  });
  const sheetScale = anim.interpolate({ inputRange: [0, 1], outputRange: [0.985, 1] });

  const headerSubtitle = useMemo(() => {
    const orgName = org.activeOrgName ?? "—";
    const storeName = org.activeStoreName ?? "—";
    const role = org.activeRole ?? "—";
    return `${orgName} • ${storeName} • ${role}`;
  }, [org.activeOrgName, org.activeRole, org.activeStoreName]);

const scrollToLatest = useCallback((animated = false, force = false) => {
    const now = Date.now();

    if (!force) {
      if (!userNearBottomRef.current) return;
      if (autoScrollLockRef.current) return;
      if (now - lastAutoScrollTsRef.current < AUTO_SCROLL_THROTTLE_MS) return;
    }

    lastAutoScrollTsRef.current = now;

    if (scrollRafRef.current != null) {
      cancelAnimationFrame(scrollRafRef.current);
      scrollRafRef.current = null;
    }

    scrollRafRef.current = requestAnimationFrame(() => {
      try {
        listRef.current?.scrollToOffset({ offset: 0, animated });
      } catch {}
      scrollRafRef.current = null;
    });
  }, []);

  const useImagePromptAgainFromMessage = useCallback(
    (prompt: string) => {
      if (!requireAi(ownerOnlyReason || `AI haipatikani kwenye ${currentPlanLabel}. Upgrade ili kuendelea.`)) return;

      const value = clean(prompt);
      if (!value) {
        Alert.alert("Prompt missing", "Hakuna prompt ya kutumia tena.");
        return;
      }

      setRetryCard({ visible: false, label: "", payload: null });
      lastPayloadRef.current = null;
      setPlusOpen(false);
      setAttachedImages([]);
      setInput(`create image: ${value}`);

      requestAnimationFrame(() => {
        inputRef.current?.focus();
        scrollToLatest(false, true);
      });
    },
    [currentPlanLabel, ownerOnlyReason, requireAi, scrollToLatest]
  );

  const stopTyping = useCallback(() => {
    typingAbortRef.current.aborted = true;
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    typingTimerRef.current = null;
  }, []);

  const patchMessageText = useCallback((id: string, nextText: string) => {
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, text: nextText } : m)));
  }, []);
const handleListScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = Number(e.nativeEvent.contentOffset?.y ?? 0);

    // FlatList ni inverted, hivyo karibu na latest = offset ndogo
    userNearBottomRef.current = y <= 120;
    autoScrollLockRef.current = y > 180;
  }, []);
const typeOutChatGPTLike = useCallback(
    async (msgId: string, fullText: string, reqToken?: string) => {
      stopTyping();
      stopTypingDots();
      typingAbortRef.current = { aborted: false };

      const myToken = clean(reqToken || "");
      const txt = String(fullText ?? "");

      if (!txt.trim()) {
        if (myToken && activeReqTokenRef.current && myToken !== activeReqTokenRef.current) return;
        patchMessageText(msgId, "Samahani — AI imerudisha jibu tupu. Jaribu tena.");
        return;
      }

      if (myToken && activeReqTokenRef.current && myToken !== activeReqTokenRef.current) return;

      patchMessageText(msgId, "");

      const L = txt.length;
      const speedFactor = L > 1800 ? 0.55 : L > 1000 ? 0.68 : L > 600 ? 0.8 : 0.92;

      let i = 0;
      let lastPainted = 0;

      const tick = () => {
        if (typingAbortRef.current.aborted) return;
        if (myToken && activeReqTokenRef.current && myToken !== activeReqTokenRef.current) return;

        const remaining = txt.length - i;
        const randomChunk =
          TYPEWRITER_MIN_CHUNK + Math.floor(Math.random() * (TYPEWRITER_MAX_CHUNK - TYPEWRITER_MIN_CHUNK + 1));

        let chunk = Math.min(randomChunk, remaining);

        // kwa message ndefu, ongeza kasi bila kufanya screen icheze-cheze
        if (remaining > 1200) chunk = Math.max(chunk, 8);
        else if (remaining > 700) chunk = Math.max(chunk, 6);
        else if (remaining > 350) chunk = Math.max(chunk, 4);

        const nextI = Math.min(txt.length, i + chunk);
        const next = txt.slice(0, nextI);
        const lastChar = next.charAt(next.length - 1);

        i = nextI;

        // punguza rerender nyingi sana
        const shouldPaint =
          i === txt.length ||
          i - lastPainted >= 6 ||
          lastChar === "\n" ||
          lastChar === "." ||
          lastChar === "!" ||
          lastChar === "?";

        if (shouldPaint) {
          patchMessageText(msgId, next);
          lastPainted = i;
          scrollToLatest(false, false);
        }

        if (i >= txt.length) {
          patchMessageText(msgId, txt);
          scrollToLatest(false, true);
          return;
        }

        let delay = TYPEWRITER_BASE_DELAY * speedFactor;

        if (lastChar === "\n") delay += TYPEWRITER_LINE_DELAY;
        else if (lastChar === "." || lastChar === "!" || lastChar === "?") delay += TYPEWRITER_PUNCT_DELAY;
        else if (isPunct(lastChar)) delay += 28;

        typingTimerRef.current = setTimeout(tick, Math.max(10, Math.floor(delay)));
      };

      typingTimerRef.current = setTimeout(tick, Math.max(10, Math.floor(TYPEWRITER_BASE_DELAY * speedFactor)));
    },
    [patchMessageText, scrollToLatest, stopTyping, stopTypingDots]
  );

  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
const onShow = Keyboard.addListener(showEvent, (e: any) => {
      const h = Number(e?.endCoordinates?.height ?? 0);
      setKeyboardVisible(true);
      setKeyboardHeight(h);
      scrollToLatest(false, true);
    });
    const onHide = Keyboard.addListener(hideEvent, () => {
      setKeyboardVisible(false);
      setKeyboardHeight(0);
    });

    return () => {
      onShow.remove();
      onHide.remove();
    };
  }, [scrollToLatest]);

  useEffect(() => {
  return () => {
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    typingTimerRef.current = null;
    typingAbortRef.current.aborted = true;
    stopTypingDots();

    try {
      netAbortRef.current?.abort();
    } catch {}
    netAbortRef.current = null;

    if (scrollRafRef.current != null) {
      cancelAnimationFrame(scrollRafRef.current);
      scrollRafRef.current = null;
    }

    if (waveformTimerRef.current) clearInterval(waveformTimerRef.current);
    waveformTimerRef.current = null;
  };
}, [stopTypingDots]);

useEffect(() => {
  if (!recordingOn) {
    if (waveformTimerRef.current) clearInterval(waveformTimerRef.current);
    waveformTimerRef.current = null;
    setLiveMeter(-160);
    setRecordingMs(0);
    return;
  }

  if (waveformTimerRef.current) clearInterval(waveformTimerRef.current);

  waveformTimerRef.current = setInterval(() => {
    setLiveMeter(-95 + Math.random() * 70);
    setRecordingMs((prev) => prev + 80);
  }, 80);

  return () => {
    if (waveformTimerRef.current) clearInterval(waveformTimerRef.current);
    waveformTimerRef.current = null;
  };
}, [recordingOn]);

 const loadAiBalance = useCallback(async (): Promise<{
    ok: boolean;
    remaining: number;
    used: number;
    monthly: number;
    error: string;
  }> => {
    const orgId = clean(org.activeOrgId);
    if (!orgId) {
      setAiCreditsRemaining(0);
      setAiCreditsUsed(0);
      return {
        ok: false,
        remaining: 0,
        used: 0,
        monthly: 0,
        error: "Missing orgId",
      };
    }

    try {
      const { data, error } = await supabase.rpc("ai_get_balance", {
        p_org_id: orgId,
      });

      if (error) {
        return {
          ok: false,
          remaining: 0,
          used: 0,
          monthly: 0,
          error: clean(error.message) || "Failed to load AI balance",
        };
      }

      const row = (Array.isArray(data) ? data?.[0] : data) as AiBalanceRow | null;

      const monthly = Math.max(0, Number(row?.credits_monthly ?? 0) || 0);
      const used = Math.max(0, Number(row?.credits_used ?? 0) || 0);
      const remaining = Math.max(0, Number(row?.credits_remaining ?? 0) || 0);

      setAiCreditsMonthly(monthly);
      setAiCreditsUsed(used);
      setAiCreditsRemaining(remaining);

      return {
        ok: true,
        remaining,
        used,
        monthly,
        error: "",
      };
    } catch (e: any) {
      return {
        ok: false,
        remaining: 0,
        used: 0,
        monthly: 0,
        error: clean(e?.message) || "Failed to load AI balance",
      };
    }
  }, [org.activeOrgId]);

  const loadTasksFollowupSummary = useCallback(async () => {
    const orgId = clean(org.activeOrgId);
    const storeId = clean(org.activeStoreId);

    if (!orgId) {
      setTasksFollowupSummary(null);
      return;
    }

    const res = await safeRpcOne("get_tasks_followup_summary", {
      p_org_id: orgId,
      p_store_id: storeId || null,
    });

    if (!res.ok) {
      setTasksFollowupSummary(null);
      return;
    }

    const row = Array.isArray(res.data) ? res.data[0] : res.data;

    if (!row) {
      setTasksFollowupSummary(null);
      return;
    }

    setTasksFollowupSummary({
      open_count: firstNumFromRow(row, ["open_count"]),
      overdue_count: firstNumFromRow(row, ["overdue_count"]),
      due_today_count: firstNumFromRow(row, ["due_today_count"]),
      high_priority_open_count: firstNumFromRow(row, ["high_priority_open_count"]),
      medium_priority_open_count: firstNumFromRow(row, ["medium_priority_open_count"]),
      low_priority_open_count: firstNumFromRow(row, ["low_priority_open_count"]),
      latest_open_titles: safeArray<any>(row?.latest_open_titles).map((x) => clean(x)).filter(Boolean),
    });
  }, [org.activeOrgId, org.activeStoreId]);

  const loadBusinessSnapshot = useCallback(async () => {
    const orgId = clean(org.activeOrgId);
    const storeId = clean(org.activeStoreId);

    if (!orgId || !storeId) {
      setBusinessSnapshot(null);
      return;
    }

    const auth = await waitForActiveSession();
    if (!auth.ok) {
      setBusinessSnapshot(null);
      return;
    }

    const pFrom = startOfTodayIso();
    const pTo = endExclusiveTomorrowIso();

    let salesTotal = 0;
    let expensesTotal = 0;
    let cogsTotal = 0;
    let profitTotal = 0;
    let ordersCount = 0;
    let avgOrderValue = 0;

    let inventoryTotalItems = 0;
    let inventoryLowCount = 0;
    let inventoryOutCount = 0;

    let topProducts: InjectedTopProductRow[] = [];
    let lowStockItems: InjectedInventoryRisk[] = [];
    let deadStockItems: InjectedDeadStockRow[] = [];
    let forecastLite: ForecastLite | null = null;
    let cashflowLite: CashflowLite | null = null;

    const salesRes = await safeRpcOne("get_sales", {
      p_store_id: storeId,
      p_from: pFrom,
      p_to: pTo,
    });

    const expenseRes = await safeRpcOne("get_expense_summary", {
      p_store_id: storeId,
      p_from: pFrom,
      p_to: pTo,
    });

    const profitRes = await safeRpcOne("get_store_net_profit_v2", {
      p_store_id: storeId,
      p_from: pFrom,
      p_to: pTo,
    });

    const inventoryRes = await safeRpcOne("get_store_inventory_v2", {
      p_store_id: storeId,
    });

    const stockIntelRes = await safeRpcOne("get_stock_intelligence_v1", {
      p_org_id: orgId,
      p_store_id: storeId,
      p_scope: "STORE",
      p_from: pFrom,
      p_to: pTo,
      p_limit: 8,
    });

    const productProfitRes = await safeRpcOne("get_product_profit_report_v2", {
      p_store_id: storeId,
      p_from: pFrom,
      p_to: pTo,
      p_limit: 8,
    });

    const forecastRes = await safeRpcOne("get_sales_forecast_v1", {
      p_org_id: orgId,
      p_store_id: storeId,
      p_scope: "STORE",
      p_from: pFrom,
      p_to: pTo,
    });

    const cashflowRes = await safeRpcOne("get_cashflow_prediction_v1", {
      p_org_id: orgId,
      p_store_id: storeId,
      p_scope: "STORE",
      p_from: pFrom,
      p_to: pTo,
    });

    const salesRows = salesRes.ok ? safeArray<any>(salesRes.data) : [];

    if (salesRows.length) {
      ordersCount = salesRows.length;

      salesTotal = sumRowsByKeys(salesRows, [
        "total_amount",
        "gross_total",
        "paid_total",
        "sales_total",
        "total",
        "amount",
        "subtotal",
      ]);

      if (salesTotal <= 0) {
        salesTotal = firstNumFromRow(salesRows[0], ["sales_total", "total_sales", "gross_total"]);
      }
    }

    if (expenseRes.ok) {
      const expRow = Array.isArray(expenseRes.data) ? expenseRes.data[0] : expenseRes.data;
      expensesTotal = firstNumFromRow(expRow, [
        "expenses_total",
        "total_expenses",
        "total",
        "amount",
      ]);
    }

    if (profitRes.ok) {
      const row = Array.isArray(profitRes.data) ? profitRes.data[0] : profitRes.data;

      const canonicalSales = firstNumFromRow(row, ["sales_total", "sales", "total_sales"]);
      const canonicalCogs = firstNumFromRow(row, ["cogs_total", "cogs", "total_cogs"]);
      const canonicalExpenses = firstNumFromRow(row, ["expenses_total", "expenses", "total_expenses"]);
      const canonicalProfit = firstNumFromRow(row, ["net_profit", "profit", "profit_total"]);
      const canonicalOrders = firstNumFromRow(row, ["orders_count", "orders", "total_orders"]);

      // CANONICAL SOURCE OF TRUTH FOR AI ANALYSIS
      // Tukishapata get_store_net_profit_v2, tusiruhusu sources nyingine zipindishe numbers hizi.
      salesTotal = canonicalSales;
      cogsTotal = canonicalCogs;
      expensesTotal = canonicalExpenses;
      profitTotal = canonicalProfit;
      ordersCount = canonicalOrders;
    }

    if (inventoryRes.ok) {
      const rows = safeArray<any>(inventoryRes.data);
      inventoryTotalItems = rows.length;
    }

    if (stockIntelRes.ok) {
      const rows = safeArray<any>(stockIntelRes.data);

      lowStockItems = rows
        .filter((r) => normalizeStockBucket(r?.bucket) === "LOW_STOCK")
        .map((r) => ({
          product_id: clean(r?.product_id) || null,
          product_name: clean(r?.product_name) || "Unknown Product",
          sku: clean(r?.sku) || null,
          stock_qty: firstNumFromRow(r, ["stock_on_hand", "stock_qty", "qty", "quantity"]),
          threshold_qty: firstNumFromRow(r, ["low_stock_threshold", "threshold_qty", "threshold"]),
          stock_status:
            (() => {
              const s = String(r?.stock_status ?? "").trim().toUpperCase();
              if (s === "OUT") return "OUT" as const;
              if (s === "OK") return "OK" as const;
              if (s === "LOW") return "LOW" as const;
              return null;
            })(),
        }))
        .slice(0, 8);

      deadStockItems = rows
        .filter((r) => normalizeStockBucket(r?.bucket) === "DEAD_STOCK")
        .map((r) => ({
          product_id: clean(r?.product_id) || null,
          product_name: clean(r?.product_name) || "Unknown Product",
          sku: clean(r?.sku) || null,
          stock_qty: firstNumFromRow(r, ["stock_on_hand", "stock_qty", "qty", "quantity"]),
          days_without_sale: firstNumFromRow(r, ["days_without_sale", "days_no_sale"]),
        }))
        .slice(0, 8);

      inventoryLowCount = lowStockItems.length;

      inventoryOutCount = rows.filter(
        (r) => String(r?.stock_status ?? "").trim().toUpperCase() === "OUT"
      ).length;
    }

    if (productProfitRes.ok) {
      const rows = safeArray<any>(productProfitRes.data);

      topProducts = rows
        .sort(
          (a, b) =>
            firstNumFromRow(b, ["gross_profit", "profit_amount", "profit"]) -
            firstNumFromRow(a, ["gross_profit", "profit_amount", "profit"])
        )
        .slice(0, 8)
        .map((r) => ({
          product_id: clean(r?.product_id) || null,
          product_name: clean(r?.product_name) || "Unknown Product",
          sku: clean(r?.sku) || null,
          qty_sold: firstNumFromRow(r, ["qty_sold", "quantity_sold", "sales_count"]),
          sales_amount: firstNumFromRow(r, ["revenue", "sales_amount", "total"]),
          profit_amount: firstNumFromRow(r, ["gross_profit", "profit_amount", "profit"]),
        }));
    }

    if (!topProducts.length && salesRows.length) {
      topProducts = buildTopProductsFromSalesRows(salesRows);
    }

    if (forecastRes.ok) {
      const row = Array.isArray(forecastRes.data) ? forecastRes.data[0] : forecastRes.data;
      if (row) {
        forecastLite = {
          scope_used: String(row?.scope_used ?? "STORE").trim().toUpperCase() === "ALL" ? "ALL" : "STORE",
          forecast_days: firstNumFromRow(row, ["forecast_days"]),
          period_sales: firstNumFromRow(row, ["period_sales"]),
          period_orders: firstNumFromRow(row, ["period_orders"]),
          avg_daily_sales: firstNumFromRow(row, ["avg_daily_sales"]),
          avg_daily_orders: firstNumFromRow(row, ["avg_daily_orders"]),
          projected_sales_next_period: firstNumFromRow(row, ["projected_sales_next_period"]),
          projected_orders_next_period: firstNumFromRow(row, ["projected_orders_next_period"]),
          trend_label:
            String(row?.trend_label ?? "STABLE").trim().toUpperCase() === "INCREASING"
              ? "INCREASING"
              : String(row?.trend_label ?? "STABLE").trim().toUpperCase() === "DECLINING"
              ? "DECLINING"
              : "STABLE",
          trend_pct: firstNumFromRow(row, ["trend_pct"]),
          stockout_risk_count: firstNumFromRow(row, ["stockout_risk_count"]),
          urgent_restock_count: firstNumFromRow(row, ["urgent_restock_count"]),
        };
      }
    }

    if (cashflowRes.ok) {
      const row = Array.isArray(cashflowRes.data) ? cashflowRes.data[0] : cashflowRes.data;
      if (row) {
        cashflowLite = {
          scope_used: String(row?.scope_used ?? "STORE").trim().toUpperCase() === "ALL" ? "ALL" : "STORE",
          forecast_days: firstNumFromRow(row, ["forecast_days"]),
          projected_cash_in: firstNumFromRow(row, ["projected_cash_in", "projected_cash", "cash_in_next_period"]),
          projected_cash_orders: firstNumFromRow(row, ["projected_cash_orders", "cash_orders", "projected_orders"]),
          avg_daily_cash: firstNumFromRow(row, ["avg_daily_cash", "daily_cash_avg"]),
          avg_daily_orders: firstNumFromRow(row, ["avg_daily_orders", "daily_orders_avg"]),
          confidence:
            String(row?.confidence ?? row?.confidence_label ?? "MEDIUM").trim().toUpperCase() === "HIGH"
              ? "HIGH"
              : String(row?.confidence ?? row?.confidence_label ?? "MEDIUM").trim().toUpperCase() === "LOW"
              ? "LOW"
              : "MEDIUM",
        };
      }
    }

    // IMPORTANT:
    // COGS isi-derive tena hapa kama tayari canonical profit RPC imeitoa.
    // Tukifanya derive upya tunaweza kuvuruga analysis baada ya expense/profit fixes.
    if (!Number.isFinite(cogsTotal)) {
      cogsTotal = 0;
    }

    avgOrderValue = ordersCount > 0 ? salesTotal / ordersCount : 0;

    // SAFETY FALLBACK:
    // Kama canonical profit RPC imefail, profit ibaki derived fallback badala ya kuwa random.
    if (!profitRes.ok) {
      profitTotal = salesTotal - cogsTotal - expensesTotal;
    }

    const snapshot = buildBusinessInjectionSnapshot({
      orgId,
      orgName: org.activeOrgName,
      storeId,
      storeName: org.activeStoreName,
      role: org.activeRole,
      salesTotal,
      expensesTotal,
      cogsTotal,
      profitTotal,
      ordersCount,
      avgOrderValue,
      inventoryTotalItems,
      inventoryLowCount,
      inventoryOutCount,
      topProducts,
      lowStockItems,
      deadStockItems,
      forecast: forecastLite,
      cashflow: cashflowLite,
    });

    setBusinessSnapshot(snapshot);
  }, [
    org.activeOrgId,
    org.activeOrgName,
    org.activeStoreId,
    org.activeStoreName,
    org.activeRole,
  ]);

  useFocusEffect( 
    useCallback(() => {
      let cancelled = false;

      async function run() {
        try {
          const orgId = org.activeOrgId ?? "";
          if (!orgId) {
            if (!cancelled) {
              setProActive(false);
              setPlanCode("FREE");
              setPlanName("FREE");
              setAiCreditsMonthly(0);
              setAiCreditsRemaining(0);
              setAiCreditsUsed(0);
            }
            return;
          }

          const [ok, snap] = await Promise.all([
            isProActiveForOrg(orgId),
            getAiSubscriptionSnapshotForOrg(orgId, { forceRefresh: true }),
          ]);

          if (cancelled) return;

          setProActive(!!ok);
          setPlanCode(upper(snap?.planCode || "FREE"));
          setPlanName(clean(snap?.planName || snap?.planCode || "FREE"));
          setAiCreditsMonthly(Number(snap?.aiCreditsMonthly ?? 0) || 0);

         await loadAiBalance();
          await loadBusinessSnapshot();
          await loadTasksFollowupSummary();
        } catch {
          if (!cancelled) {
            setProActive(false);
            setPlanCode("FREE");
            setPlanName("FREE");
            setAiCreditsMonthly(0);
            setAiCreditsRemaining(0);
            setAiCreditsUsed(0);
          }
        }
      }

      void run();
      return () => {
        cancelled = true;
      };
   }, [loadAiBalance, loadBusinessSnapshot, loadTasksFollowupSummary, org.activeOrgId])
  );

  const buildHistory = useCallback((): ReqMsg[] => {
    const chronological = [...messages].reverse();
    const cleanedMsgs = chronological.filter((m) => m.role === "user" || m.role === "assistant");
    const withoutWelcome = cleanedMsgs.filter((m, idx) => !(idx === 0 && m.role === "assistant"));
    const last = withoutWelcome.slice(Math.max(0, withoutWelcome.length - 12));
    return last.map((m) => ({ role: m.role, text: m.text }));
  }, [messages]);

  const requireWorkerUrlOrAlert = useCallback(() => {
    if (!AI_WORKER_URL) {
      Alert.alert(
        "AI Worker URL missing",
        "Weka EXPO_PUBLIC_AI_WORKER_URL kwenye .env (base URL ya Cloudflare Worker), kisha restart Metro.\n\n" +
          "Mfano:\nhttps://zetra-ai-worker.jofreyjofreysanga.workers.dev"
      );
      return false;
    }
    return true;
  }, []);

  const pickAndAttachImage = useCallback(async () => {
    if (!requireAi(ownerOnlyReason || `AI haipatikani kwenye ${currentPlanLabel}. Upgrade ili kutumia image/vision tools.`)) {
      return;
    }

    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert("Permission required", "Ruhusu Photos/Media ili ku-attach picha.");
        return;
      }

      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.85,
        base64: true,
        allowsMultipleSelection: false,
      });

      if (res.canceled) return;

      const asset = res.assets?.[0];
      if (!asset?.uri || !asset?.base64) {
        Alert.alert("Failed", "Imeshindikana kupata image base64. Jaribu tena.");
        return;
      }

      const mime = (asset as any).mimeType || "image/jpeg";
      const dataUrl = `data:${mime};base64,${asset.base64}`;

      setAttachedImages((prev) => [
        ...prev,
        {
          id: uid(),
          uri: asset.uri,
          dataUrl,
        },
      ]);
requestAnimationFrame(() => {
        inputRef.current?.focus();
        scrollToLatest(false, true);
      });
    } catch (e: any) {
      Alert.alert("Error", clean(e?.message) || "Image pick error");
    }
  }, [currentPlanLabel, ownerOnlyReason, requireAi]);

  const removeAttachedImage = useCallback((id: string) => {
    setAttachedImages((prev) => prev.filter((x) => x.id !== id));
  }, []);

  const startRecording = useCallback(async () => {
    if (!requireAi(ownerOnlyReason || `AI haipatikani kwenye ${currentPlanLabel}. Upgrade ili kutumia mic/voice.`)) {
      return;
    }

    try {
      if (!requireWorkerUrlOrAlert()) return;

      const perm = await Audio.requestPermissionsAsync();
      if (!perm.granted) {
        Alert.alert("Permission required", "Ruhusu Microphone ili AI isikie sauti.");
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const rec = new Audio.Recording();
      // live waveform handled by local timer effect

      await rec.prepareToRecordAsync({
        android: {
          extension: ".m4a",
          outputFormat: 2, // MPEG_4
          audioEncoder: 3, // AAC
          sampleRate: 44100,
          numberOfChannels: 1,
          bitRate: 128000,
          
        },
        ios: {
          extension: ".m4a",
          audioQuality: 1,
          sampleRate: 44100,
          numberOfChannels: 1,
          bitRate: 128000,
          outputFormat: "mpeg4aac",
        
        },
        web: {},
      });

      rec.setProgressUpdateInterval(80);
      await rec.startAsync();

      setRecordingMs(0);
      setLiveMeter(-160);
      setRecording(rec);
      setRecordingOn(true);
    } catch (e: any) {
      Alert.alert("Mic error", clean(e?.message) || "Failed to start recording");
      setRecording(null);
      setRecordingMs(0);
      setLiveMeter(-160);
      setRecordingOn(false);
    }
  }, [currentPlanLabel, ownerOnlyReason, requireAi, requireWorkerUrlOrAlert]);

  const stopRecordingAndTranscribe = useCallback(async () => {
    try {
      if (!recording) return;
setTranscribing(true);
setInput("...");
      setRecordingOn(false);

      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      setRecording(null);
      setRecordingMs(0);
      setLiveMeter(-160);

      if (!uri) {
        Alert.alert("Error", "Recording URI missing.");
        setTranscribing(false);
        return;
      }

      const form = new FormData();
      form.append(
        "file",
        {
          uri,
          name: "voice.m4a",
         type: "audio/m4a",
        } as any
      );

      const url = `${AI_WORKER_URL}/transcribe`;

      const abort = new AbortController();
      netAbortRef.current = abort;

     const out = await fetchJsonWithRetry(
  url,
  {
    method: "POST",
    headers: {
      "x-zetra-role": clean(org.activeRole),
    },
    body: form,
    signal: abort.signal,
  },
  { timeoutMs: 20_000, retries: 0, tag: "transcribe" }
);

      const data: any = out.data;

      if (!out.ok) {
        const msg =
          clean(data?.error) || clean(data?.message) || clean(out.textBody) || `Transcription failed (${out.status})`;
        Alert.alert("Transcribe failed", msg);
        setTranscribing(false);
        return;
      }

      const text = clean(data?.text);
      if (!text) {
        Alert.alert("No text", "AI haikupata maneno. Jaribu tena ukikaribia mic.");
        setTranscribing(false);
        return;
      }

      const directText = clean(text);
      if (!directText) {
        setTranscribing(false);
        return;
      }

      setInput("");
await (async () => {
  const directText = clean(text);
  if (!directText) return;

  const history = buildHistory();
  await loadBusinessSnapshot();
  await loadTasksFollowupSummary();
  setRetryCard({ visible: false, label: "", payload: null });
  lastPayloadRef.current = null;

  setThinking(true);
  stopTyping();
  stopTypingDots();

  const reqToken = makeReqToken();
  activeReqTokenRef.current = reqToken;

  const abortDirect = new AbortController();
  netAbortRef.current = abortDirect;

  const userMsg: ChatMsg = {
    id: uid(),
    role: "user",
    text: directText,
    ts: Date.now(),
    images: null,
  };

  const botId = uid();
  const botPlaceholder: ChatMsg = {
    id: botId,
    role: "assistant",
    ts: Date.now(),
    text: "AI inaandika",
  };

  setMessages((prev) => [botPlaceholder, userMsg, ...prev]);
  userNearBottomRef.current = true;
  autoScrollLockRef.current = false;
  scrollToLatest(false, true);
  startTypingDots(botId);

  try {
    const payload: RetryPayload = { kind: "chat", text: directText, history };
    lastPayloadRef.current = payload;
    setRetryCard({ visible: false, label: "", payload });

    const res = await callWorkerChat(directText, history, abortDirect.signal);

    if (reqToken !== activeReqTokenRef.current) return;

    await finalizeAssistantResponse({
      botId,
      reqToken,
      res,
      creditFailureNote: "⚠️ AI response imefanikiwa lakini credit deduction imeshindikana.",
    });
  } catch (e: any) {
    stopTypingDots();

    const msg = clean(e?.message);
    const isAbort =
      msg.toLowerCase().includes("aborted") ||
      msg.toLowerCase().includes("abort") ||
      msg.toLowerCase().includes("canceled") ||
      msg.toLowerCase().includes("cancelled");

    patchMessageText(
      botId,
      isAbort
        ? "⛔ Umesimamisha AI.\n\nUkihitaji, tuma tena ujumbe."
        : "Samahani — kuna hitilafu kidogo.\n" +
            (e?.message ? `\nError: ${String(e.message)}` : "") +
            `\n\n[debug] EXPO_PUBLIC_AI_WORKER_URL(base) = ${AI_WORKER_URL || "EMPTY"}`
    );

    const last = lastPayloadRef.current;
    if (last && !isAbort) {
      setRetryCard({
        visible: true,
        label: "Network issue — Retry",
        payload: last,
      });
    }
  } finally {
    netAbortRef.current = null;
    setThinking(false);
    scrollToLatest(false, true);
  }
})();
     requestAnimationFrame(() => {
        inputRef.current?.focus();
        scrollToLatest(false, true);
      });
    } catch (e: any) {
      Alert.alert("Transcribe error", clean(e?.message) || "Unknown transcribe error");
    } finally {
      setTranscribing(false);
      netAbortRef.current = null;
    }
   }, [
  currentPlanLabel,
  org.activeRole,
  recording,
  scrollToLatest,
  startTypingDots,
  stopTyping,
  stopTypingDots,
]);

  const toggleMic = useCallback(()=> {
    if (!aiEnabled) {
      openAiGate(ownerOnlyReason || `AI haipatikani kwenye ${currentPlanLabel}. Upgrade ili kutumia mic/voice.`);
      return;
    }
    if (recordingOn) {
      void stopRecordingAndTranscribe();
      return;
    }
    void startRecording();
  }, [aiEnabled, currentPlanLabel, openAiGate, ownerOnlyReason, recordingOn, startRecording, stopRecordingAndTranscribe]);

const callWorkerChat = useCallback(
  async (text: string, history: ReqMsg[], signal?: AbortSignal) => {
    if (!requireWorkerUrlOrAlert()) throw new Error("Worker URL missing");

    const detectedIntent = detectBusinessIntent(text);
    const pureDecisionMode = detectPureDecisionMode(text);
    const analysisFollowupMode = detectAnalysisFollowupIntent(text);
    const businessCalcBypass = detectBusinessCalcBypass(text);

    const systemPromptBase = buildZetraSystemPrompt({
      orgName: org.activeOrgName,
      storeName: org.activeStoreName,
      role: org.activeRole,
      planCode: currentPlanLabel,
    });

    const injectedBusinessContext = buildBusinessContextBlock(businessSnapshot, detectedIntent);
    const productIntelligenceBlock = buildProductIntelligenceBlock(businessSnapshot);
    const tasksFollowupBlock = buildTasksFollowupContextBlock(tasksFollowupSummary);

    const systemPrompt = [systemPromptBase, injectedBusinessContext, productIntelligenceBlock, tasksFollowupBlock]
      .filter(Boolean)
      .join("\n\n");

    const taskIntent = detectTaskFollowupIntent(text);

    if (taskIntent.asksTasks || taskIntent.asksSummary || taskIntent.asksOverdue || taskIntent.asksWhatNow) {
      return {
        text: buildTaskFollowupReply(tasksFollowupSummary, text, org.activeStoreName),
        meta: {
          analysisIntent: "ANALYSIS",
          autopilotAlerts: [
            tasksFollowupSummary && num(tasksFollowupSummary.overdue_count) > 0
              ? {
                  level: "warning",
                  title: "Overdue Tasks",
                  message: `${num(tasksFollowupSummary.overdue_count)} task(s) zimechelewa.`,
                }
              : null,
            tasksFollowupSummary && num(tasksFollowupSummary.due_today_count) > 0
              ? {
                  level: "info",
                  title: "Due Today",
                  message: `${num(tasksFollowupSummary.due_today_count)} task(s) zinahitaji kufuatiliwa leo.`,
                }
              : null,
          ].filter(Boolean),
          actions: [],
        },
      };
    }

    if (analysisFollowupMode && !businessSnapshot) {
      return {
        text:
          "Sina snapshot ya analysis kwa sasa.\n\n" +
          "Jaribu tena baada ya business data kusomwa vizuri, au bonyeza Reset kisha ulize tena.",
        meta: {
          analysisIntent: "ANALYSIS",
          autopilotAlerts: [],
          actions: [],
          hideActionsBlock: true,
        },
      };
    }

    if (businessSnapshot && !businessCalcBypass) {
      if (analysisFollowupMode) {
        return {
          text: buildAnalysisFollowupReply(businessSnapshot),
          meta: {
            analysisIntent: "ANALYSIS",
            autopilotAlerts: [
              businessSnapshot.low_stock_items?.length
                ? {
                    level: "warning",
                    title: "Restock Risk",
                    message: `${businessSnapshot.low_stock_items.length} bidhaa zinahitaji uangalizi wa stock.`,
                  }
                : null,
              businessSnapshot.dead_stock_items?.length
                ? {
                    level: "info",
                    title: "Dead Stock Attention",
                    message: `${businessSnapshot.dead_stock_items.length} bidhaa zina cash iliyokwama.`,
                  }
                : null,
            ].filter(Boolean),
            actions: buildDeterministicActions(businessSnapshot, "COACH"),
            hideActionsBlock: true,
          },
        };
      }

      if (pureDecisionMode) {
        return {
          text: buildPureDecisionReply(businessSnapshot, text),
          meta: {
            analysisIntent: "COACH",
            autopilotAlerts: [],
            actions: [],
          },
        };
      }

      if (detectedIntent === "INVENTORY" || detectedIntent === "PRODUCT") {
        const localText = buildInventoryDeterministicReply(
          businessSnapshot,
          detectedIntent as "INVENTORY" | "PRODUCT"
        );

        return {
          text: localText,
          meta: {
            analysisIntent: "ANALYSIS",
            autopilotAlerts: [
              businessSnapshot.low_stock_items?.length
                ? {
                    level: "warning",
                    title: "Low Stock Detected",
                    message: `${businessSnapshot.low_stock_items.length} bidhaa zinaonekana kuwa low stock.`,
                  }
                : null,
              businessSnapshot.dead_stock_items?.length
                ? {
                    level: "info",
                    title: "Slow / Dead Stock",
                    message: `${businessSnapshot.dead_stock_items.length} bidhaa zina mwendo mdogo au hazijauza.`,
                  }
                : null,
            ].filter(Boolean),
            actions: buildDeterministicActions(
              businessSnapshot,
              detectedIntent as "INVENTORY" | "PRODUCT"
            ),
            hideActionsBlock: true,
          },
        };
      }

      if (detectedIntent === "PROFIT") {
        return {
          text: buildProfitDeterministicReply(businessSnapshot, "PROFIT"),
          meta: {
            analysisIntent: "COACH",
            autopilotAlerts: [
              num(businessSnapshot.margin_pct) < 10
                ? {
                    level: "warning",
                    title: "Low Margin",
                    message: `Margin ya sasa iko ${num(businessSnapshot.margin_pct).toFixed(1)}%.`,
                  }
                : null,
              num(businessSnapshot.expenses_total) > 0
                ? {
                    level: "info",
                    title: "Expenses Included",
                    message: `Expenses za snapshot hii ni ${fmtMoney(businessSnapshot.expenses_total)}.`,
                  }
                : null,
            ].filter(Boolean),
            actions: buildDeterministicActions(businessSnapshot, "PROFIT"),
              hideActionsBlock: true,
            
          },
        };
      }

      if (detectedIntent === "SALES") {
        return {
          text: buildProfitDeterministicReply(businessSnapshot, "SALES"),
          meta: {
            analysisIntent: "FORECAST",
            autopilotAlerts: [
              businessSnapshot.forecast?.trend_label === "DECLINING"
                ? {
                    level: "warning",
                    title: "Declining Trend",
                    message: "Forecast inaonyesha trend ya kushuka.",
                  }
                : null,
              businessSnapshot.forecast?.trend_label === "INCREASING"
                ? {
                    level: "info",
                    title: "Increasing Trend",
                    message: "Forecast inaonyesha trend ya kupanda.",
                  }
                : null,
            ].filter(Boolean),
            actions: buildDeterministicActions(businessSnapshot, "SALES"),
              hideActionsBlock: true,
          
          },
        };
      }

      if (
        hasLooseKeyword(text, [
          "coach",
          "ushauri",
          "nifanye nini",
          "hatua gani",
          "next move",
          "what should i do",
          "nipe ushauri",
          "naomba ushauri",
        ])
      ) {
        return {
          text: buildCoachDeterministicReply(businessSnapshot),
          meta: {
            analysisIntent: "COACH",
            autopilotAlerts: [
              businessSnapshot.low_stock_items?.length
                ? {
                    level: "warning",
                    title: "Restock Risk",
                    message: `${businessSnapshot.low_stock_items.length} bidhaa zinahitaji uangalizi wa stock.`,
                  }
                : null,
              businessSnapshot.dead_stock_items?.length
                ? {
                    level: "info",
                    title: "Dead Stock Attention",
                    message: `${businessSnapshot.dead_stock_items.length} bidhaa zina cash iliyokwama.`,
                  }
                : null,
            ].filter(Boolean),
            actions: buildDeterministicActions(businessSnapshot, "COACH"),
            hideActionsBlock: true,
          },
        };
      }
    }

    const payload = {
      text,
      mode,
      history,
      roleHint: "AUTO",
      systemPrompt,
      context: {
        ...aiContext,
        orgId: org.activeOrgId ?? null,
        orgName: org.activeOrgName ?? null,
        storeId: org.activeStoreId ?? null,
        storeName: org.activeStoreName ?? null,
        role: org.activeRole ?? null,
        planCode: currentPlanLabel,
        module: "ZETRA_BMS_AI",
        businessIntent: detectedIntent,
        businessSnapshot,
        injectedBusinessContext,
        productIntelligenceBlock,
        tasksFollowupSummary,
        tasksFollowupBlock,
        topProducts: businessSnapshot?.top_products ?? [],
        lowStockItems: businessSnapshot?.low_stock_items ?? [],
        slowItems: businessSnapshot?.dead_stock_items ?? [],
        forceUseRealBusinessData: true,
        forceUseRealProductNames: true,
        disallowGenericProductAdvice: true,
      },
    };

    const url = `${AI_WORKER_URL}/v1/chat`;
    const out = await fetchJsonWithRetry(
      url,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(payload),
        signal,
      },
      { timeoutMs: DEFAULT_TIMEOUT_MS, retries: DEFAULT_RETRIES, tag: "chat" }
    );

    const data: any = out.data;

    if (!out.ok) {
      const body = clean(data?.error) || clean(data?.message) || clean(out.textBody);
      const msg = body
        ? `Chat request failed (${out.status})\n${safeClip(body)}\n\n[debug] url=${url}`
        : `Chat request failed (${out.status})\n\n[debug] url=${url}`;
      throw new Error(msg);
    }

    if (!data?.ok) {
      const body = clean(data?.error) || clean(data?.message) || clean(out.textBody);
      const msg = body
        ? `Chat failed\n${safeClip(body)}\n\n[debug] url=${url}`
        : `Chat failed\n\n[debug] url=${url}`;
      throw new Error(msg);
    }

    return {
      text: clean(data?.reply) || "No response",
      meta: data?.meta ?? null,
    };
  },
  [
    aiContext,
    businessSnapshot,
    tasksFollowupSummary,
    currentPlanLabel,
    mode,
    org.activeOrgId,
    org.activeOrgName,
    org.activeRole,
    org.activeStoreId,
    org.activeStoreName,
    requireWorkerUrlOrAlert,
  ]
);

  const callWorkerVision = useCallback(
    async (text: string, images: AttachedImage[], history: ReqMsg[], signal?: AbortSignal) => {
      if (!requireWorkerUrlOrAlert()) throw new Error("Worker URL missing");

      const detectedIntent = detectBusinessIntent(text);
      const pureDecisionMode = detectPureDecisionMode(text);
      const analysisFollowupMode = detectAnalysisFollowupIntent(text);
      const businessCalcBypass = detectBusinessCalcBypass(text);

      const systemPromptBase = buildZetraSystemPrompt({
        orgName: org.activeOrgName,
        storeName: org.activeStoreName,
        role: org.activeRole,
        planCode: currentPlanLabel,
      });

      const injectedBusinessContext = buildBusinessContextBlock(businessSnapshot, detectedIntent);
      const productIntelligenceBlock = buildProductIntelligenceBlock(businessSnapshot);
      const tasksFollowupBlock = buildTasksFollowupContextBlock(tasksFollowupSummary);

      const visionPriorityInstruction = images.length
        ? [
            "IMAGE FIRST RULES:",
            "- User attached image(s).",
            "- Visible image content is PRIMARY evidence.",
            "- Analyze what is visible in the image first.",
            "- Use business snapshot only as secondary supporting context.",
            "- Do not replace image analysis with generic stock summary.",
            "- If user asks stock/display risk from image, inspect visible arrangement, emptiness, display quality, accessibility, and obvious risk signals first.",
          ].join("\n")
        : "";

      const systemPrompt = [
        systemPromptBase,
        injectedBusinessContext,
        productIntelligenceBlock,
        tasksFollowupBlock,
        visionPriorityInstruction,
      ]
        .filter(Boolean)
        .join("\n\n");

      const taskIntent = detectTaskFollowupIntent(text);

      if (taskIntent.asksTasks || taskIntent.asksSummary || taskIntent.asksOverdue || taskIntent.asksWhatNow) {
        return {
          text: buildTaskFollowupReply(tasksFollowupSummary, text, org.activeStoreName),
          meta: {
            analysisIntent: "ANALYSIS",
            autopilotAlerts: [
              tasksFollowupSummary && num(tasksFollowupSummary.overdue_count) > 0
                ? {
                    level: "warning",
                    title: "Overdue Tasks",
                    message: `${num(tasksFollowupSummary.overdue_count)} task(s) zimechelewa.`,
                  }
                : null,
              tasksFollowupSummary && num(tasksFollowupSummary.due_today_count) > 0
                ? {
                    level: "info",
                    title: "Due Today",
                    message: `${num(tasksFollowupSummary.due_today_count)} task(s) zinahitaji kufuatiliwa leo.`,
                  }
                : null,
            ].filter(Boolean),
            actions: [],
          },
        };
      }

      const shouldBypassLocalDeterministicForVision = images.length > 0;

      if (analysisFollowupMode && !businessSnapshot && !shouldBypassLocalDeterministicForVision) {
        return {
          text:
            "Sina snapshot ya analysis kwa sasa.\n\n" +
            "Jaribu tena baada ya business data kusomwa vizuri, au bonyeza Reset kisha ulize tena.",
          meta: {
            analysisIntent: "ANALYSIS",
            autopilotAlerts: [],
            actions: [],
            hideActionsBlock: true,
          },
        };
      }

      if (businessSnapshot && !shouldBypassLocalDeterministicForVision && !businessCalcBypass) {
        if (analysisFollowupMode) {
          return {
            text: buildAnalysisFollowupReply(businessSnapshot),
            meta: {
              analysisIntent: "ANALYSIS",
              autopilotAlerts: [
                businessSnapshot.low_stock_items?.length
                  ? {
                      level: "warning",
                      title: "Restock Risk",
                      message: `${businessSnapshot.low_stock_items.length} bidhaa zinahitaji uangalizi wa stock.`,
                    }
                  : null,
                businessSnapshot.dead_stock_items?.length
                  ? {
                      level: "info",
                      title: "Dead Stock Attention",
                      message: `${businessSnapshot.dead_stock_items.length} bidhaa zina cash iliyokwama.`,
                    }
                  : null,
              ].filter(Boolean),
              actions: buildDeterministicActions(businessSnapshot, "COACH"),
              hideActionsBlock: true,
            },
          };
        }

        if (pureDecisionMode) {
          return {
            text: buildPureDecisionReply(businessSnapshot, text),
            meta: {
              analysisIntent: "COACH",
              autopilotAlerts: [],
              actions: [],
            },
          };
        }

        if (detectedIntent === "INVENTORY" || detectedIntent === "PRODUCT") {
          const localText = buildInventoryDeterministicReply(
            businessSnapshot,
            detectedIntent as "INVENTORY" | "PRODUCT"
          );

          return {
            text: localText,
            meta: {
              analysisIntent: "ANALYSIS",
              autopilotAlerts: [
                businessSnapshot.low_stock_items?.length
                  ? {
                      level: "warning",
                      title: "Low Stock Detected",
                      message: `${businessSnapshot.low_stock_items.length} bidhaa zinaonekana kuwa low stock.`,
                    }
                  : null,
                businessSnapshot.dead_stock_items?.length
                  ? {
                      level: "info",
                      title: "Slow / Dead Stock",
                      message: `${businessSnapshot.dead_stock_items.length} bidhaa zina mwendo mdogo au hazijauza.`,
                    }
                  : null,
              ].filter(Boolean),
              actions: buildDeterministicActions(
                businessSnapshot,
                detectedIntent as "INVENTORY" | "PRODUCT"
              ),
              hideActionsBlock: true,
            },
          };
        }

        if (detectedIntent === "PROFIT") {
          return {
            text: buildProfitDeterministicReply(businessSnapshot, "PROFIT"),
            meta: {
              analysisIntent: "COACH",
              autopilotAlerts: [
                num(businessSnapshot.margin_pct) < 10
                  ? {
                      level: "warning",
                      title: "Low Margin",
                      message: `Margin ya sasa iko ${num(businessSnapshot.margin_pct).toFixed(1)}%.`,
                    }
                  : null,
                num(businessSnapshot.expenses_total) > 0
                  ? {
                      level: "info",
                      title: "Expenses Included",
                      message: `Expenses za snapshot hii ni ${fmtMoney(businessSnapshot.expenses_total)}.`,
                    }
                  : null,
              ].filter(Boolean),
              actions: buildDeterministicActions(businessSnapshot, "PROFIT"),
              hideActionsBlock: true,
            },
          };
        }

        if (detectedIntent === "SALES") {
          return {
            text: buildProfitDeterministicReply(businessSnapshot, "SALES"),
            meta: {
              analysisIntent: "FORECAST",
              autopilotAlerts: [
                businessSnapshot.forecast?.trend_label === "DECLINING"
                  ? {
                      level: "warning",
                      title: "Declining Trend",
                      message: "Forecast inaonyesha trend ya kushuka.",
                    }
                  : null,
                businessSnapshot.forecast?.trend_label === "INCREASING"
                  ? {
                      level: "info",
                      title: "Increasing Trend",
                      message: "Forecast inaonyesha trend ya kupanda.",
                    }
                  : null,
              ].filter(Boolean),
              actions: buildDeterministicActions(businessSnapshot, "SALES"),
              hideActionsBlock: true,
            },
          };
        }
if (
          hasLooseKeyword(text, [
            "coach",
            "ushauri",
            "nifanye nini",
            "hatua gani",
            "next move",
            "what should i do",
            "nipe ushauri",
            "naomba ushauri",
          ])
        ) {
          return {
            text: buildCoachDeterministicReply(businessSnapshot),
            meta: {
              analysisIntent: "COACH",
              autopilotAlerts: [
                businessSnapshot.low_stock_items?.length
                  ? {
                      level: "warning",
                      title: "Restock Risk",
                      message: `${businessSnapshot.low_stock_items.length} bidhaa zinahitaji uangalizi wa stock.`,
                    }
                  : null,
                businessSnapshot.dead_stock_items?.length
                  ? {
                      level: "info",
                      title: "Dead Stock Attention",
                      message: `${businessSnapshot.dead_stock_items.length} bidhaa zina cash iliyokwama.`,
                    }
                  : null,
              ].filter(Boolean),
              actions: buildDeterministicActions(businessSnapshot, "COACH"),
              hideActionsBlock: true,
            },
          };
        }
      }

      const payload = {
        message: text,
        images: images.map((x) => x.dataUrl),
        meta: {
          mode,
          history,
          roleHint: "AUTO",
          systemPrompt,
          context: {
            ...aiContext,
            orgId: org.activeOrgId ?? null,
            orgName: org.activeOrgName ?? null,
            storeId: org.activeStoreId ?? null,
            storeName: org.activeStoreName ?? null,
            role: org.activeRole ?? null,
            planCode: currentPlanLabel,
            module: "ZETRA_BMS_AI",
            businessIntent: detectedIntent,
            businessSnapshot,
            injectedBusinessContext,
            productIntelligenceBlock,
            tasksFollowupSummary,
            tasksFollowupBlock,
            topProducts: businessSnapshot?.top_products ?? [],
            lowStockItems: businessSnapshot?.low_stock_items ?? [],
            slowItems: businessSnapshot?.dead_stock_items ?? [],
            forceUseRealBusinessData: true,
            forceUseRealProductNames: true,
            disallowGenericProductAdvice: true,
            imageAnalysisPrimary: images.length > 0,
            imageCount: images.length,
          },
        },
      };

      const url = `${AI_WORKER_URL}/vision`;
      const out = await fetchJsonWithRetry(
        url,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify(payload),
          signal,
        },
        { timeoutMs: 40_000, retries: 2, tag: "vision" }
      );

      const data: any = out.data;

      if (!out.ok) {
        const body = clean(data?.error) || clean(data?.message) || clean(out.textBody);
        const msg = body
          ? `Vision request failed (${out.status})\n${safeClip(body)}\n\n[debug] url=${url}`
          : `Vision request failed (${out.status})\n\n[debug] url=${url}`;
        throw new Error(msg);
      }

      return {
        text: clean(data?.reply) || "No response",
        meta: data?.meta ?? null,
      };
    },
   [
      aiContext,
      businessSnapshot,
      tasksFollowupSummary,
      currentPlanLabel,
      mode,
      org.activeOrgId,
      org.activeOrgName,
      org.activeRole,
      org.activeStoreId,
      org.activeStoreName,
      requireWorkerUrlOrAlert,
    ]
  );

  const callWorkerImageGenerate = useCallback(
    async (prompt: string, signal?: AbortSignal) => {
      if (!requireWorkerUrlOrAlert()) throw new Error("Worker URL missing");

      const url = `${AI_WORKER_URL}/image`;
      const out = await fetchJsonWithRetry(
        url,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({
            prompt,
            context: {
              ...aiContext,
              orgId: org.activeOrgId ?? null,
              orgName: org.activeOrgName ?? null,
              storeId: org.activeStoreId ?? null,
              storeName: org.activeStoreName ?? null,
              role: org.activeRole ?? null,
              planCode: currentPlanLabel,
              module: "ZETRA_BMS_AI",
            },
          }),
          signal,
        },
        { timeoutMs: 60_000, retries: 2, tag: "image" }
      );

      const data: any = out.data;

      if (!out.ok) {
        const body = clean(data?.error) || clean(data?.message) || clean(out.textBody);
        const msg = body
          ? `Image generation failed (${out.status})\n${safeClip(body)}\n\n[debug] url=${url}`
          : `Image generation failed (${out.status})\n\n[debug] url=${url}`;
        throw new Error(msg);
      }

      const urlRaw = clean(data?.url);
      const imgUrl = normalizeImageUrl(urlRaw);
      if (!imgUrl) throw new Error("No image URL returned");
      return imgUrl;
    },
    [
      aiContext,
      requireWorkerUrlOrAlert,
    ]
  );

const quickChips = useMemo(
  () => [
    { k: "sales", label: "Sales", icon: "trending-up", prompt: "Niambie hali ya biashara yangu leo kwa store hii." },
    { k: "leaks", label: "Profit Leak", icon: "alert-circle", prompt: "Nina leak ya profit wapi kwenye biashara yangu?" },
    { k: "stock", label: "Stock Risk", icon: "cube", prompt: "Ni bidhaa zipi zina hatari ya kuisha stock na zipi haziuzi?" },
    { k: "tasks", label: "Weekly Tasks", icon: "checkbox", prompt: "Nipangie tasks za wiki hii ili kuboresha biashara." },
    { k: "owner", label: "Owner View", icon: "sparkles", prompt: "Kama wewe ungekuwa mmiliki wa hii biashara, ungefanya mabadiliko gani sasa hivi?" },
    { k: "forecast", label: "Forecast", icon: "analytics", prompt: "Nipe analysis na forecast ya biashara yangu kwa siku 7 zijazo kwa store hii." },
    { k: "coach", label: "Profit Coach", icon: "pricetag", prompt: "Nifanyie executive profit coach ya store hii kwa kutumia sales, profit, expenses, cogs na stock za leo. Nipe: (1) mambo 2 niliyofanya vizuri, (2) maeneo 2 ninapopoteza pesa, (3) hatua 3 za kuchukua sasa." },
    { k: "reports", label: "Reports", icon: "bar-chart", prompt: "Ni report gani 5 za lazima kwa biashara ya retail?" },
  ],
  []
);
  const focusComposer = useCallback(() => {
   requestAnimationFrame(() => {
        inputRef.current?.focus();
        scrollToLatest(false, true);
      });
  }, []);

  const clearComposer = useCallback(() => {
    setInput("");
    setAttachedImages([]);
   requestAnimationFrame(() => {
        inputRef.current?.focus();
        scrollToLatest(false, true);
      });
  }, []);

 
  const applyChipPrompt = useCallback(
    (p: string) => {
      if (!requireAi(ownerOnlyReason || `AI haipatikani kwenye ${currentPlanLabel}. Upgrade ili kutumia AI prompts.`)) {
        return;
      }

      const t = clean(p);
      if (!t) return;
      setRetryCard({ visible: false, label: "", payload: null });
      lastPayloadRef.current = null;
      setPlusOpen(false);
      setInput(t);
      requestAnimationFrame(() => {
        inputRef.current?.focus();
        scrollToLatest(false, true);
      });
    },
    [currentPlanLabel, ownerOnlyReason, requireAi]
  );
function buildTopProductsFromSalesRows(rows: any[]): InjectedTopProductRow[] {
  const bucket = new Map<
    string,
    {
      product_id?: string | null;
      product_name: string;
      sku?: string | null;
      qty_sold: number;
      sales_amount: number;
      profit_amount: number;
    }
  >();

  for (const row of safeArray<any>(rows)) {
    const productId = clean(row?.product_id || row?.id || "");
    const productName =
      firstTextFromRow(row, ["product_name", "name", "title", "product", "item_name"]) || "Unknown Product";
    const sku = firstTextFromRow(row, ["sku", "product_sku"]) || null;

    const qty = firstNumFromRow(row, ["qty_sold", "quantity", "qty", "units", "count"]);
    const salesAmount = firstNumFromRow(row, [
      "sales_amount",
      "line_total",
      "total",
      "gross_total",
      "subtotal",
      "paid_amount",
      "amount",
    ]);
    const profitAmount = firstNumFromRow(row, ["profit_amount", "profit", "net_profit", "gross_profit"]);

    const key = productId || `${productName}__${sku || "NOSKU"}`;
    const existing = bucket.get(key);

    if (existing) {
      existing.qty_sold += qty;
      existing.sales_amount += salesAmount;
      existing.profit_amount += profitAmount;
    } else {
      bucket.set(key, {
        product_id: productId || null,
        product_name: productName,
        sku,
        qty_sold: qty,
        sales_amount: salesAmount,
        profit_amount: profitAmount,
      });
    }
  }

  return [...bucket.values()]
    .sort((a, b) => {
      const bySales = b.sales_amount - a.sales_amount;
      if (bySales !== 0) return bySales;
      return b.qty_sold - a.qty_sold;
    })
    .slice(0, 8)
    .map((x) => ({
      product_id: x.product_id ?? null,
      product_name: x.product_name,
      sku: x.sku ?? null,
      qty_sold: x.qty_sold,
      sales_amount: x.sales_amount,
      profit_amount: x.profit_amount,
    }));
}  

  useEffect(() => {
    void loadBusinessSnapshot();
    void loadTasksFollowupSummary();
    void loadAiBalance();
  }, [loadAiBalance, loadBusinessSnapshot, loadTasksFollowupSummary]);
  const loadTasks = useCallback(async () => {
    const orgId = clean(org.activeOrgId);
    if (!orgId) {
      setTasks([]);
      setTasksError("No org selected.");
      return;
    }

    setTasksLoading(true);
    setTasksError("");

    try {
      const { data, error } = await supabase
        .from("tasks")
        .select("id,organization_id,store_id,title,steps,priority,eta,status,created_at")
        .eq("organization_id", orgId)
        .order("created_at", { ascending: false })
        .limit(80);

      if (error) {
        setTasks([]);
        setTasksError(clean(error.message) || "Failed to load tasks");
        return;
      }

      const rows = (data as any[] | null) ?? [];
      setTasks(
        rows.map((r) => ({
          id: String(r.id),
          organization_id: String(r.organization_id),
          store_id: r.store_id ? String(r.store_id) : null,
          title: clean(r.title),
          steps: Array.isArray(r.steps) ? (r.steps as string[]) : null,
          priority: r.priority ?? null,
          eta: r.eta ?? null,
          status: r.status ?? null,
          created_at: String(r.created_at || ""),
        }))
      );
    } catch (e: any) {
      setTasks([]);
      setTasksError(clean(e?.message) || "Failed to load tasks");
    } finally {
      setTasksLoading(false);
    }
  }, [org.activeOrgId]);

  const consumeAiCredits = useCallback(
    async (credits: number): Promise<{ ok: boolean; error: string }> => {
      const orgId = clean(org.activeOrgId);
      if (!orgId) return { ok: false, error: "Missing orgId" };const n = Number(credits);
      if (!Number.isFinite(n) || n <= 0) {
        return { ok: false, error: "Invalid credits amount" };
      }

      try {
        const { error } = await supabase.rpc("ai_consume_credits", {
          p_org_id: orgId,
          p_credits: n,
        });

        if (error) {
          return {
            ok: false,
            error: clean(error.message) || "Failed to consume AI credits",
          };
        }
await loadAiBalance();
          await loadBusinessSnapshot();
          await loadTasksFollowupSummary();
        return { ok: true, error: "" };
      } catch (e: any) {
        return {
          ok: false,
          error: clean(e?.message) || "Failed to consume AI credits",
        };
      }
    },
   [loadAiBalance, loadBusinessSnapshot, loadTasksFollowupSummary, org.activeOrgId]
  );

  const stopGenerating = useCallback(() => {
    activeReqTokenRef.current = `STOP_${uid()}`;
    stopTyping();
    stopTypingDots();

    try {
      netAbortRef.current?.abort();
    } catch {}
    netAbortRef.current = null;

    setThinking(false);
  }, [stopTyping, stopTypingDots]);

  const applyAssistantMetaToMessage = useCallback((botId: string, meta: any) => {
    const normalizedAlerts = normalizeAutopilotAlerts(meta);
    const normalizedIntent = (meta?.analysisIntent as "ANALYSIS" | "FORECAST" | "COACH" | null) ?? null;

    setMessages((prev) =>
      prev.map((m) =>
        m.id === botId
          ? {
              ...m,
              autopilotAlerts: normalizedAlerts,
              analysisIntent: normalizedIntent,
            }
          : m
      )
    );

    setAutopilotCards(normalizedAlerts);
    setLastAnalysisIntent(normalizedIntent);

    return normalizedAlerts;
  }, []);
 async function finalizeAssistantResponse(args: {
  botId: string;
  reqToken: string;
  res: { text: string; meta: any | null };
  creditFailureNote: string;
}) {
  const resMeta: any = args.res?.meta ?? null;

  applyAssistantMetaToMessage(args.botId, resMeta);

  const creditResult = await consumeAiCredits(1);

  let footerNote = creditResult.ok ? "" : args.creditFailureNote;

  if (aiEnabled && clean(org.activeOrgId) && Array.isArray(resMeta?.actions) && resMeta.actions.length) {
    const result = await createTasksFromAiActions({
      orgId: org.activeOrgId!,
      storeId: org.activeStoreId ?? null,
      actions: resMeta.actions as ActionItem[],
    });

    if (result.created > 0) {
      footerNote = footerNote
        ? `${footerNote}\n\n✅ Saved to Tasks: ${result.created}${result.failed > 0 ? ` • Failed: ${result.failed}` : ""}`
        : `✅ Saved to Tasks: ${result.created}${result.failed > 0 ? ` • Failed: ${result.failed}` : ""}`;
    } else if (result.failed > 0) {
      const taskWarn =
        "⚠️ Actions zimeshindwa ku-save kwenye Tasks.\n" +
        "Tip: Hakikisha RPC `create_task_from_ai` ipo na una role ya owner/admin.";

      footerNote = footerNote ? `${footerNote}\n\n${taskWarn}` : taskWarn;
    }
  }

  const packed = packAssistantText({
    text: args.res?.text,
    actions: resMeta?.actions ?? [],
    footerNote,
    hideActionsBlock: !!resMeta?.hideActionsBlock,
  });

  await typeOutChatGPTLike(
    args.botId,
    packed || sanitizeAssistantText(args.res?.text || ""),
    args.reqToken
  );
} const regenerateImageFromMessage = useCallback(
    async (prompt: string) => {
      if (!requireAi(ownerOnlyReason || `AI haipatikani kwenye ${currentPlanLabel}. Upgrade ili kuendelea.`)) return;

      const p = clean(prompt);
      if (!p || thinking) return;

      setRetryCard({ visible: false, label: "", payload: null });
      lastPayloadRef.current = null;
      setInput("");
      setAttachedImages([]);
      setThinking(true);

      stopTyping();
      stopTypingDots();

      const reqToken = makeReqToken();
      activeReqTokenRef.current = reqToken;

      const abort = new AbortController();
      netAbortRef.current = abort;

      const userMsg: ChatMsg = {
        id: uid(),
        role: "user",
        text: `create image: ${p}`,
        ts: Date.now(),
        images: null,
      };

      const botId = uid();
      const botPlaceholder: ChatMsg = {
        id: botId,
        role: "assistant",
        ts: Date.now(),
        text: "AI inaandika",
      };

      setMessages((prev) => [botPlaceholder, userMsg, ...prev]);
      userNearBottomRef.current = true;
      autoScrollLockRef.current = false;
      scrollToLatest(false, true);
      startTypingDots(botId);

      try {
        const payload: RetryPayload = { kind: "image", prompt: p };
        lastPayloadRef.current = payload;
        setRetryCard({ visible: false, label: "", payload });

        const url = await callWorkerImageGenerate(p, abort.signal);

        if (reqToken !== activeReqTokenRef.current) return;

        const creditResult = await consumeAiCredits(1);

        const reply = creditResult.ok
          ? "✅ Image generated"
          : "✅ Image generated\n\n⚠️ AI image imetoka lakini credit deduction imeshindikana.";

        setMessages((prev) =>
          prev.map((m) =>
            m.id === botId
              ? {
                  ...m,
                  generatedImageUri: url,
                  imagePrompt: p,
                }
              : m
          )
        );

        await typeOutChatGPTLike(botId, reply, reqToken);
      } catch (e: any) {
        stopTypingDots();

        const msg = clean(e?.message);
        const isAbort =
          msg.toLowerCase().includes("aborted") ||
          msg.toLowerCase().includes("abort") ||
          msg.toLowerCase().includes("canceled") ||
          msg.toLowerCase().includes("cancelled");

        if (reqToken !== activeReqTokenRef.current) return;

        patchMessageText(
          botId,
          isAbort
            ? "⛔ Umesimamisha AI.\n\nUkihitaji, tuma tena ujumbe."
            : "Samahani — kuna hitilafu kidogo.\n" +
                (e?.message ? `\nError: ${String(e.message)}` : "") +
                `\n\n[debug] EXPO_PUBLIC_AI_WORKER_URL(base) = ${AI_WORKER_URL || "EMPTY"}`
        );

        const last = lastPayloadRef.current;
        if (last && !isAbort) {
          setRetryCard({
            visible: true,
            label: "Network issue — Retry",
            payload: last,
          });
        }
      } finally {
        netAbortRef.current = null;
        setThinking(false);
        scrollToLatest(false, true);
      }
    },
    [
      callWorkerImageGenerate,
      consumeAiCredits,
      currentPlanLabel,
      ownerOnlyReason,
      patchMessageText,
      requireAi,
      scrollToLatest,
      startTypingDots,
      stopTyping,
      stopTypingDots,
      thinking,
      typeOutChatGPTLike,
    ]
  );

  const send = useCallback(async () => {
    if (!requireAi(ownerOnlyReason || `AI haipatikani kwenye ${currentPlanLabel}. Upgrade ili kuendelea.`)) return;

    const text = clean(input);
    const hasImages = attachedImages.length > 0;

    if ((!text && !hasImages) || thinking) return;

    setRetryCard({ visible: false, label: "", payload: null });
    lastPayloadRef.current = null;

    if (text.length > INPUT_MAX) {
      const botMsg: ChatMsg = {
        id: uid(),
        role: "assistant",
        ts: Date.now(),
        text:
          `Ujumbe wako ni mrefu sana.\n` +
          `• Limit: ${INPUT_MAX.toLocaleString()} characters\n\n` +
          `Punguza au gawanya message vipande viwili.`,
      };
      setMessages((prev) => [botMsg, ...prev]);
      return;
    }

    const history = buildHistory();

const imagesToSend = attachedImages;
setAttachedImages([]);

const userMsg: ChatMsg = {
  id: uid(),
  role: "user",
  text: text || (imagesToSend.length ? "📷 Image attached" : ""),
  ts: Date.now(),
  images: imagesToSend.length ? imagesToSend.map((x) => ({ id: x.id, uri: x.uri })) : null,
};

const botId = uid();
const botPlaceholder: ChatMsg = {
  id: botId,
  role: "assistant",
  ts: Date.now(),
  text: "AI inaandika",
};

// instant feedback kwanza
setInput("");
setThinking(true);

stopTyping();
stopTypingDots();

const reqToken = makeReqToken();
activeReqTokenRef.current = reqToken;

const abort = new AbortController();
netAbortRef.current = abort;

// onyesha message mara moja kwenye UI
setMessages((prev) => [botPlaceholder, userMsg, ...prev]);
userNearBottomRef.current = true;
autoScrollLockRef.current = false;
scrollToLatest(false, true);
startTypingDots(botId);

// background refresh bila ku-block send click
// NOTE:
// Tuna-refresh snapshot kwa utulivu, lakini canonical analysis bado inategemea
// latest snapshot iliyopo. Hii inasaidia UI ibaki fast na stable.
setTimeout(() => {
  void loadBusinessSnapshot();
  void loadTasksFollowupSummary();
}, 0);
    try {
      if (reqToken !== activeReqTokenRef.current) return;

      if (imagesToSend.length > 0) {
        const payload: RetryPayload = { kind: "vision", text, history, images: imagesToSend };
        lastPayloadRef.current = payload;
        setRetryCard({ visible: false, label: "", payload });

        const res = await callWorkerVision(text, imagesToSend, history, abort.signal);

        if (reqToken !== activeReqTokenRef.current) return;

        await finalizeAssistantResponse({
          botId,
          reqToken,
          res,
          creditFailureNote: "⚠️ AI response imefanikiwa lakini credit deduction imeshindikana.",
        });
        return;
      }

      const imgIntent = detectImageIntent(text);
      if (imgIntent.isImage) {
        const p = clean(imgIntent.prompt) || text;

        const payload: RetryPayload = { kind: "image", prompt: p };
        lastPayloadRef.current = payload;
        setRetryCard({ visible: false, label: "", payload });

        const url = await callWorkerImageGenerate(p, abort.signal);

        if (reqToken !== activeReqTokenRef.current) return;

        const creditResult = await consumeAiCredits(1);

        const reply = creditResult.ok
  ? "✅ Image generated"
  : "✅ Image generated\n\n⚠️ AI image imetoka lakini credit deduction imeshindikana.";

setMessages((prev) =>
  prev.map((m) =>
    m.id === botId
      ? {
          ...m,
          generatedImageUri: url,
          imagePrompt: p,
        }
      : m
  )
);

await typeOutChatGPTLike(botId, reply, reqToken);
return;
      }

      const payload: RetryPayload = { kind: "chat", text, history };
      lastPayloadRef.current = payload;
      setRetryCard({ visible: false, label: "", payload });

      const res = await callWorkerChat(text, history, abort.signal);

      if (reqToken !== activeReqTokenRef.current) return;

      await finalizeAssistantResponse({
        botId,
        reqToken,
        res,
        creditFailureNote: "⚠️ AI response imefanikiwa lakini credit deduction imeshindikana.",
      });
    } catch (e: any) {
      stopTypingDots();

      const msg = clean(e?.message);
      const isAbort =
        msg.toLowerCase().includes("aborted") ||
        msg.toLowerCase().includes("abort") ||
        msg.toLowerCase().includes("canceled") ||
        msg.toLowerCase().includes("cancelled");

      if (reqToken !== activeReqTokenRef.current) return;

      patchMessageText(
        botId,
        isAbort
          ? "⛔ Umesimamisha AI.\n\nUkihitaji, tuma tena ujumbe."
          : "Samahani — kuna hitilafu kidogo.\n" +
              (e?.message ? `\nError: ${String(e.message)}` : "") +
              `\n\n[debug] EXPO_PUBLIC_AI_WORKER_URL(base) = ${AI_WORKER_URL || "EMPTY"}`
      );

      const last = lastPayloadRef.current;
      if (last && !isAbort) {
        setRetryCard({
          visible: true,
          label: "Network issue — Retry",
          payload: last,
        });
      }
    } finally {
      netAbortRef.current = null;
      setThinking(false);
      scrollToLatest(false, true);
    }
  }, [
    aiEnabled,
    attachedImages,
    buildHistory,
    callWorkerChat,
    callWorkerImageGenerate,
    callWorkerVision,
    consumeAiCredits,
    currentPlanLabel,
    finalizeAssistantResponse,
    input,
    loadBusinessSnapshot,
    org.activeOrgId,
    org.activeStoreId,
  
    ownerOnlyReason,
    patchMessageText,
    requireAi,
    scrollToLatest,
    startTypingDots,
    stopTyping,
    stopTypingDots,
    thinking,
    typeOutChatGPTLike,
  ]);

  const retryLast = useCallback(async () => {
    if (!requireAi(ownerOnlyReason || `AI haipatikani kwenye ${currentPlanLabel}. Upgrade ili kuendelea.`)) return;

    const p = retryCard.payload;
    if (!p || thinking) return;

    setRetryCard({ visible: false, label: "", payload: p });
    await loadBusinessSnapshot();
    await loadTasksFollowupSummary();
    lastPayloadRef.current = p;

    const reqToken = makeReqToken();
    activeReqTokenRef.current = reqToken;

    const abort = new AbortController();
    netAbortRef.current = abort;

  const userMsg: ChatMsg = {
  id: uid(),
  role: "user",
  ts: Date.now(),
  text: p.kind === "image" ? `create image: ${p.prompt}` : `[Retry] ${p.kind.toUpperCase()}`,
};

    const botId = uid();
    const botPlaceholder: ChatMsg = { id: botId, role: "assistant", ts: Date.now(), text: "AI inaandika" };

    setThinking(true);
    stopTyping();
    stopTypingDots();

    setMessages((prev) => [botPlaceholder, userMsg, ...prev]);
    userNearBottomRef.current = true;
    autoScrollLockRef.current = false;
    scrollToLatest(false, true);
    startTypingDots(botId);

    try {
      if (p.kind === "image") {
        const url = await callWorkerImageGenerate(p.prompt, abort.signal);

        if (reqToken !== activeReqTokenRef.current) return;

        const creditResult = await consumeAiCredits(1);

        const reply = creditResult.ok
  ? "✅ Image generated"
  : "✅ Image generated\n\n⚠️ Retry image imetoka lakini credit deduction imeshindikana.";

setMessages((prev) =>
  prev.map((m) =>
    m.id === botId
      ? {
          ...m,
          generatedImageUri: url,
          imagePrompt: p.prompt,
        }
      : m
  )
);

await typeOutChatGPTLike(botId, reply, reqToken);
return;
      }

      if (p.kind === "vision") {
        const res = await callWorkerVision(p.text, p.images, p.history, abort.signal);

        if (reqToken !== activeReqTokenRef.current) return;

        await finalizeAssistantResponse({
          botId,
          reqToken,
          res,
          creditFailureNote: "⚠️ Retry vision imefanikiwa lakini credit deduction imeshindikana.",
        });
        return;
      }

      const res = await callWorkerChat(p.text, p.history, abort.signal);

      if (reqToken !== activeReqTokenRef.current) return;

      await finalizeAssistantResponse({
        botId,
        reqToken,
        res,
        creditFailureNote: "⚠️ Retry chat imefanikiwa lakini credit deduction imeshindikana.",
      });
    } catch (e: any) {
      stopTypingDots();

      const msg = clean(e?.message);
      const isAbort =
        msg.toLowerCase().includes("aborted") ||
        msg.toLowerCase().includes("abort") ||
        msg.toLowerCase().includes("canceled") ||
        msg.toLowerCase().includes("cancelled");

      if (reqToken !== activeReqTokenRef.current) return;

      patchMessageText(botId,
        isAbort
          ? "⛔ Retry imesimamishwa.\n\nUkihitaji, bonyeza Retry tena."
          : "Samahani — retry imegoma.\n" + (e?.message ? `\nError: ${String(e.message)}` : "") + "\n\nJaribu tena."
      );

      if (!isAbort) {
        setRetryCard({ visible: true, label: "Retry failed — Try again", payload: p });
      }
      lastPayloadRef.current = p;
    } finally {
      netAbortRef.current = null;
      setThinking(false);
      scrollToLatest(false, true);
    }
  }, [
    aiEnabled,
    callWorkerChat,
    callWorkerImageGenerate,
    callWorkerVision,
    consumeAiCredits,
    currentPlanLabel,
    finalizeAssistantResponse,
    org.activeOrgId,
    org.activeStoreId,
    ownerOnlyReason,
    patchMessageText,
    requireAi,
    retryCard.payload,
    scrollToLatest,
    startTypingDots,
    stopTyping,
    stopTypingDots,
    thinking,
    typeOutChatGPTLike,
  ]);

  const ModePill = ({ k, label }: { k: AiMode; label: string }) => {
    const active = mode === k;
    return (
      <Pressable
        onPress={() => setMode(k)}
        hitSlop={10}
        style={({ pressed }) => ({
          paddingHorizontal: 12,
          height: 34,
          borderRadius: 999,
          borderWidth: 1,
          borderColor: active ? C.emeraldBorder : "rgba(255,255,255,0.12)",
          backgroundColor: active ? C.emeraldSoft : "rgba(255,255,255,0.06)",
          alignItems: "center",
          justifyContent: "center",
          opacity: pressed ? 0.92 : 1,
          transform: [{ scale: pressed ? 0.985 : 1 }],
        })}
      >
        <Text style={{ color: UI.text, fontWeight: "900" }}>{label}</Text>
      </Pressable>
    );
  };

const TopBar = (
  <View
    style={{
      paddingTop: topPad,
      paddingBottom: 10,
      paddingHorizontal: 16,
      borderBottomWidth: 1,
      borderBottomColor: "rgba(255,255,255,0.08)",
      backgroundColor: C.background,
    }}
  >
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
      }}
    >
      {/* BACK */}
      <Pressable
        onPress={() => router.back()}
        hitSlop={10}
        style={({ pressed }) => ({
          width: 46,
          height: 46,
          borderRadius: 999,
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.12)",
          backgroundColor: "rgba(255,255,255,0.06)",
          alignItems: "center",
          justifyContent: "center",
          opacity: pressed ? 0.92 : 1,
          transform: [{ scale: pressed ? 0.985 : 1 }],
        })}
      >
        <Ionicons name="chevron-back" size={22} color={UI.text} />
      </Pressable>

      {/* TITLE */}
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", minWidth: 0 }}>
        <Text
          style={{ color: UI.text, fontWeight: "900", fontSize: 18 }}
          numberOfLines={1}
        >
          ZETRA AI
        </Text>
      </View>

      {/* RESET */}
      <Pressable
  onPress={() => {
    stopGenerating();
    setMessages([
      {
        id: uid(),
        role: "assistant",
        ts: Date.now(),
        text:
          "👋 Karibu kwenye **ZETRA AI**.\n\n" +
          "Niko hapa kukusaidia kwa style ya smart business assistant ndani ya ZETRA BMS.\n\n" +
          "## Unaweza kuniuliza:\n" +
          "- 📊 Analysis ya biashara yako\n" +
          "- 🔮 Forecast ya sales / profit / stock\n" +
          "- 💸 Profit coach na maeneo ya leak\n" +
          "- 📦 Low stock, dead stock, na top bidhaa\n" +
          "- ✅ Hatua za kuchukua leo au wiki hii\n\n" +
          "## Tip\n" +
          "- Andika kwa Kiswahili au English — nita-adapt automatically.\n" +
          "- Uliza kwa kawaida tu, mfano: **'onyesha profit ya leo'** au **'ni bidhaa gani zinakaribia kuisha?'**",
      },
    ]);
    setAttachedImages([]);
    setAutopilotCards([]);
    setLastAnalysisIntent(null);
    setRetryCard({ visible: false, label: "", payload: null });
    lastPayloadRef.current = null;

   void loadBusinessSnapshot();
    void loadTasksFollowupSummary();
    void loadAiBalance();

    requestAnimationFrame(() => {
      inputRef.current?.focus();
      scrollToLatest(false, true);
    });
  }}
        hitSlop={10}
        style={({ pressed }) => ({
          paddingHorizontal: 14,
          height: 46,
          borderRadius: 999,
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.12)",
          backgroundColor: "rgba(255,255,255,0.06)",
          alignItems: "center",
          justifyContent: "center",
          opacity: pressed ? 0.92 : 1,
          transform: [{ scale: pressed ? 0.985 : 1 }],
        })}
      >
        <Text style={{ color: UI.text, fontWeight: "900" }}>Reset</Text>
      </Pressable>
    </View>
  </View>
);

const renderMsg = useCallback(({ item }: { item: ChatMsg }) => {
  const isUser = item.role === "user";
  const imgs = Array.isArray(item.images) ? item.images : [];
  const alerts = Array.isArray(item.autopilotAlerts) ? item.autopilotAlerts : [];
  const msgTime = fmtChatTime(item.ts);
  const intentLabel = getIntentLabel(item.analysisIntent);

 const generatedImageUri = !isUser
  ? normalizeImageUrl(item.generatedImageUri || extractMarkdownImageUrl(item.text))
  : "";

const displayText = !isUser
  ? prettifyAssistantSections(stripMarkdownImageTag(item.text))
  : item.text;

const imagePromptText = !isUser
  ? clean(item.imagePrompt)
  : "";

  return (
    <View style={{ paddingHorizontal: 16, paddingTop: 10 }}>
      <View
        style={{
          flexDirection: "row",
          justifyContent: isUser ? "flex-end" : "flex-start",
          marginBottom: 6,
        }}
      >
        <View
          style={{
            paddingHorizontal: 12,
            minHeight: 28,
            borderRadius: 999,
            borderWidth: 1,
            borderColor: isUser ? "rgba(16,185,129,0.30)" : "rgba(255,255,255,0.10)",
            backgroundColor: isUser ? "rgba(16,185,129,0.10)" : "rgba(255,255,255,0.05)",
            alignItems: "center",
            justifyContent: "center",
            flexDirection: "row",
            gap: 7,
          }}
        >
          <Ionicons
            name={isUser ? "person-circle-outline" : "sparkles-outline"}
            size={13}
            color={UI.text}
          />
          <Text style={{ color: UI.text, fontWeight: "900", fontSize: 11 }}>
            {isUser ? "You" : `ZETRA AI • ${intentLabel}`}
          </Text>
          {!!msgTime && (
            <>
              <View
                style={{
                  width: 4,
                  height: 4,
                  borderRadius: 999,
                  backgroundColor: "rgba(255,255,255,0.28)",
                }}
              />
              <Text style={{ color: UI.faint, fontWeight: "800", fontSize: 10 }}>
                {msgTime}
              </Text>
            </>
          )}
        </View></View>

   {isUser && imgs.length ? (
  <View
    style={{
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
      marginBottom: 10,
      justifyContent: "flex-end",
    }}
  >
    {imgs.map((x, idx) => (
      <Pressable
        key={x.id}
        onPress={() => setImgPreview({ open: true, uri: x.uri })}
        style={({ pressed }) => ({
          width: 74,
          height: 74,
          borderRadius: 16,
          overflow: "hidden",
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.12)",
          backgroundColor: "rgba(255,255,255,0.04)",
          opacity: pressed ? 0.92 : 1,
        })}
      >
        <Image source={{ uri: x.uri }} style={{ width: "100%", height: "100%" }} resizeMode="cover" />
        <View
          style={{
            position: "absolute",
            left: 6,
            bottom: 6,
            paddingHorizontal: 6,
            height: 18,
            borderRadius: 999,
            backgroundColor: "rgba(0,0,0,0.55)",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text style={{ color: "#fff", fontWeight: "900", fontSize: 10 }}>
            IMG {idx + 1}
          </Text>
        </View>
      </Pressable>
    ))}
  </View>
) : null}

      {!isUser && alerts.length ? (
      <Card
          style={{
            padding: 16,
            borderRadius: 24,
            marginBottom: 12,
            borderWidth: 1,
            borderColor: "rgba(255,255,255,0.08)",
            backgroundColor: "rgba(255,255,255,0.035)",
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 }}>
            <View
              style={{
                width: 30,
                height: 30,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: "rgba(16,185,129,0.25)",
                backgroundColor: "rgba(16,185,129,0.10)",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Ionicons name="sparkles" size={15} color={UI.text} />
            </View>

            <View style={{ flex: 1 }}>
              <Text style={{ color: UI.text, fontWeight: "900", fontSize: 17 }}>
                {item.analysisIntent === "FORECAST"
                  ? "🔮 Autopilot Forecast"
                  : item.analysisIntent === "COACH"
                  ? "💸 Autopilot Profit Coach"
                  : "✨ Autopilot Business Alerts"}
              </Text>
              <Text style={{ color: UI.faint, fontWeight: "800", fontSize: 11, marginTop: 3 }}>
                Smart highlights generated from this reply
              </Text>
            </View>
          </View>

          {alerts.map((a, idx) => {
            const borderColor =
              a.level === "critical"
                ? "rgba(239,68,68,0.40)"
                : a.level === "warning"
                ? "rgba(245,158,11,0.40)"
                : "rgba(16,185,129,0.40)";

            const bg =
              a.level === "critical"
                ? "rgba(239,68,68,0.10)"
                : a.level === "warning"
                ? "rgba(245,158,11,0.10)"
                : "rgba(16,185,129,0.10)";

            const icon =
              a.level === "critical"
                ? "alert-circle"
                : a.level === "warning"
                ? "warning"
                : "checkmark-circle";

            return (
              <View
                key={`${item.id}_alert_${idx}`}
                style={{
                  borderWidth: 1,
                  borderColor,
                  backgroundColor: bg,
                  borderRadius: 16,
                  padding: 12,
                  marginTop: idx === 0 ? 0 : 10,
                }}
              >
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Ionicons name={icon as any} size={16} color={UI.text} />
                  <Text style={{ color: UI.text, fontWeight: "900", flex: 1 }}>{a.title}</Text>
                </View>

                {!!clean(a.message) && (
                  <Text style={{ color: UI.muted, fontWeight: "800", marginTop: 6, lineHeight: 20 }}>
                    {a.message}
                  </Text>
                )}
              </View>
            );
          })}
        </Card>
      ) : null}

      <View
        style={{
          alignItems: isUser ? "flex-end" : "flex-start",
        }}
      >
        {!!displayText ? (
          <View
            style={{
              maxWidth: "100%",
              borderRadius: 24,
              overflow: "hidden",
            }}
          >
            <AiMessageBubble role={isUser ? "user" : "assistant"} text={displayText} />
          </View>
        ) : null}

        {!isUser && !!generatedImageUri ? (
          <View
            style={{
              marginTop: displayText ? 10 : 0,
              width: Math.min(Dimensions.get("window").width * 0.72, 320),
            }}
          >
            <Pressable
              onPress={() => setImgPreview({ open: true, uri: generatedImageUri })}
              style={({ pressed }) => ({
                width: "100%",
                aspectRatio: 1,
                borderRadius: 22,
                overflow: "hidden",
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.12)",
                backgroundColor: "rgba(255,255,255,0.04)",
                opacity: pressed ? 0.95 : 1,
              })}
            >
              <Image
                source={{ uri: generatedImageUri }}
                style={{ width: "100%", height: "100%" }}
                resizeMode="cover"
              />
            </Pressable>

            {!!imagePromptText && (
              <View
                style={{
                  marginTop: 8,
                  gap: 8,
                }}
              >
                <View
                  style={{
                    flexDirection: "row",
                    gap: 8,
                  }}
                >
                  <Pressable
                    onPress={() => void copyImagePromptFromMessage(imagePromptText)}
                    style={({ pressed }) => ({
                      flex: 1,
                      height: 40,
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: "rgba(255,255,255,0.14)",
                      backgroundColor: pressed ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.06)",
                      alignItems: "center",
                      justifyContent: "center",
                      flexDirection: "row",
                      gap: 6,
                    })}
                  >
                    <Ionicons name="copy-outline" size={16} color={UI.text} />
                    <Text style={{ color: UI.text, fontWeight: "900", fontSize: 12 }}>Copy Prompt</Text>
                  </Pressable>

                  <Pressable
                    onPress={() => useImagePromptAgainFromMessage(imagePromptText)}
                    style={({ pressed }) => ({
                      flex: 1,
                      height: 40,
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: "rgba(255,255,255,0.14)",
                      backgroundColor: pressed ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.06)",
                      alignItems: "center",
                      justifyContent: "center",
                      flexDirection: "row",
                      gap: 6,
                    })}
                  >
                    <Ionicons name="create-outline" size={16} color={UI.text} />
                    <Text style={{ color: UI.text, fontWeight: "900", fontSize: 12 }}>Use Again</Text>
                  </Pressable>
                </View>

                <Pressable
                  onPress={() => void regenerateImageFromMessage(imagePromptText)}
                  style={({ pressed }) => ({
                    width: "100%",
                    height: 42,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: "rgba(16,185,129,0.35)",
                    backgroundColor: pressed ? "rgba(16,185,129,0.18)" : "rgba(16,185,129,0.12)",
                    alignItems: "center",
                    justifyContent: "center",
                    flexDirection: "row",
                    gap: 8,
                  })}
                >
                  <Ionicons name="refresh-outline" size={16} color={UI.text} />
                  <Text style={{ color: UI.text, fontWeight: "900", fontSize: 12 }}>Regenerate</Text>
                </Pressable>
              </View>
            )}
          </View>
        ) : null}
      </View>
    </View>
  );
}, [
  regenerateImageFromMessage,
  copyImagePromptFromMessage,
  savePreviewImageToDevice,
  sharePreviewImage,
  useImagePromptAgainFromMessage,
]);

const RetryBanner = useMemo(() => {
    if (!retryCard.visible || !retryCard.payload) return null;
    return (
      <View style={{ paddingHorizontal: 16, paddingTop: 10 }}>
        <Pressable
          onPress={() => void retryLast()}
          hitSlop={10}
          style={({ pressed }) => ({
            borderWidth: 1,
            borderColor: "rgba(245,158,11,0.45)",
            backgroundColor: pressed ? "rgba(245,158,11,0.14)" : "rgba(245,158,11,0.10)",
            borderRadius: 20,
            padding: 12,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            opacity: pressed ? 0.95 : 1,
          })}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }}>
            <View
              style={{
                width: 34,
                height: 34,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: "rgba(245,158,11,0.35)",
                backgroundColor: "rgba(245,158,11,0.12)",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Ionicons name="refresh" size={16} color={UI.text} />
            </View>

            <View style={{ flex: 1 }}>
              <Text style={{ color: UI.text, fontWeight: "900" }}>{retryCard.label || "Retry"}</Text>
              <Text style={{ color: UI.muted, fontWeight: "800", marginTop: 2 }} numberOfLines={2}>
                Connection ilikatika au request haikukamilika. Gusa hapa ili ku-run tena response ya mwisho.
              </Text>
            </View>
          </View>

          <Ionicons name="chevron-forward" size={18} color={UI.muted} />
        </Pressable>
      </View>
    );
  }, [retryCard.label, retryCard.payload, retryCard.visible, retryLast]);

 const AttachRow = useMemo(() => {
    if (!attachedImages.length) return null;

    return (
      <View style={{ paddingHorizontal: 6, paddingBottom: 10 }}>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {attachedImages.map((x, idx) => (
            <View
              key={x.id}
              style={{
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.10)",
                backgroundColor: "rgba(255,255,255,0.05)",
                borderRadius: 16,
                paddingVertical: 8,
                paddingHorizontal: 10,
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
              }}
            >
              <Pressable
                onPress={() => setImgPreview({ open: true, uri: x.uri })}
                hitSlop={8}
                style={({ pressed }) => ({
                  width: 34,
                  height: 34,
                  borderRadius: 10,
                  overflow: "hidden",
                  opacity: pressed ? 0.9 : 1,
                })}
              >
                <Image source={{ uri: x.uri }} style={{ width: "100%", height: "100%" }} resizeMode="cover" />
              </Pressable>

              <View>
                <Text style={{ color: UI.text, fontWeight: "900", fontSize: 12 }}>
                  Image {idx + 1}
                </Text>
                <Text style={{ color: UI.faint, fontWeight: "800", fontSize: 11 }}>
                  Ready to send
                </Text>
              </View>

              <Pressable
                onPress={() => removeAttachedImage(x.id)}
                hitSlop={10}
                style={({ pressed }) => ({
                  width: 28,
                  height: 28,
                  borderRadius: 999,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: pressed ? "rgba(239,68,68,0.18)" : "rgba(239,68,68,0.12)",
                  borderWidth: 1,
                  borderColor: "rgba(239,68,68,0.30)",
                  marginLeft: 2,
                })}
              >
                <Ionicons name="close" size={14} color={UI.text} />
              </Pressable>
            </View>
          ))}
        </View>
      </View>
    );
  }, [attachedImages, removeAttachedImage]);

  const canSend = useMemo(() => {
    if (!aiEnabled) return false;
    if (thinking) return false;
    if (!clean(input) && attachedImages.length === 0) return false;
    return true;
  }, [aiEnabled, attachedImages.length, input, thinking]);

  const smartFollowupChips = useMemo(() => {
    return buildSmartFollowupChips({
      intent: lastAnalysisIntent,
      snapshot: businessSnapshot,
    });
  }, [businessSnapshot, lastAnalysisIntent]);

  const AiLockedModal = (
    <Modal visible={aiGateOpen} transparent animationType="fade" onRequestClose={() => setAiGateOpen(false)}>
      <Pressable
        onPress={() => setAiGateOpen(false)}
        style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.65)", justifyContent: "center", padding: 18 }}
      >
        <Pressable
          onPress={() => {}}
          style={{
            backgroundColor: C.background,
            borderRadius: 22,
            borderWidth: 1,
            borderColor: "rgba(255,255,255,0.12)",
            padding: 16,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <View
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 16,
                  borderWidth: 1,
                  borderColor: "rgba(245,158,11,0.35)",
                  backgroundColor: "rgba(245,158,11,0.12)",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Ionicons name="lock-closed-outline" size={20} color={UI.text} />
              </View>
              <View>
                <Text style={{ color: UI.text, fontWeight: "900", fontSize: 16 }}>
                  {ownerOnlyReason ? "Owner Only" : "Upgrade Required"}
                </Text>
                <Text style={{ color: UI.muted, fontWeight: "800", marginTop: 2 }}>
                  {ownerOnlyReason ? "AI access restricted" : `AI locked (${currentPlanLabel})`}
                </Text>
              </View>
            </View>

            <Pressable
              onPress={() => setAiGateOpen(false)}
              hitSlop={10}
              style={({ pressed }) => ({
                width: 40,
                height: 40,
                borderRadius: 14,
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.12)",
                backgroundColor: pressed ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.06)",
                alignItems: "center",
                justifyContent: "center",
              })}
            >
              <Ionicons name="close" size={18} color={UI.text} />
            </Pressable>
          </View>

          <View style={{ marginTop: 12 }}>
            <Text style={{ color: UI.text, fontWeight: "900" }}>
              {ownerOnlyReason
                ? "AI ya ZETRA ni ya OWNER pekee."
                : `AI haipatikani kwenye kifurushi cha ${currentPlanLabel}.`}
            </Text>
            <Text style={{ color: UI.muted, fontWeight: "800", marginTop: 8, lineHeight: 20 }}>
              {aiGateReason || defaultAiLockReason}
            </Text>
          </View>

          <View style={{ flexDirection: "row", gap: 10, marginTop: 14 }}>
            {!ownerOnlyReason ? (
              <Pressable
                onPress={() => {
                  setAiGateOpen(false);
                  router.push("/settings/subscription");
                }}
                style={({ pressed }) => ({
                  flex: 1,
                  height: 46,
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: "rgba(16,185,129,0.45)",
                  backgroundColor: pressed ? "rgba(16,185,129,0.20)" : "rgba(16,185,129,0.14)",
                  alignItems: "center",
                  justifyContent: "center",
                  flexDirection: "row",
                  gap: 10,
                })}
              >
                <Ionicons name="sparkles" size={18} color={UI.text} />
                <Text style={{ color: UI.text, fontWeight: "900" }}>Upgrade Plan</Text>
              </Pressable>
            ) : null}

            <Pressable
              onPress={() => setAiGateOpen(false)}
              style={({ pressed }) => ({
                width: ownerOnlyReason ? "100%" : 110,
                height: 46,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.12)",
                backgroundColor: pressed ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.06)",
                alignItems: "center",
                justifyContent: "center",
              })}
            >
              <Text style={{ color: UI.text, fontWeight: "900" }}>Close</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );

const PlusMenu = (
  <Modal visible={plusOpen} transparent animationType="fade" onRequestClose={() => setPlusOpen(false)}>
    <Pressable
      onPress={() => setPlusOpen(false)}
      style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.60)", justifyContent: "flex-end" }}
    >
      <Pressable
        onPress={() => {}}
        style={{
          backgroundColor: C.background,
          borderTopLeftRadius: 22,
          borderTopRightRadius: 22,
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.10)",
          padding: 14,
          paddingBottom: Math.max(insets.bottom, 10) + 14,
          maxHeight: "88%",
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Text style={{ color: UI.text, fontWeight: "900", fontSize: 16 }}>Menu</Text>

          <Pressable
            onPress={() => setPlusOpen(false)}
            hitSlop={10}
            style={({ pressed }) => ({
              width: 40,
              height: 40,
              borderRadius: 14,
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.12)",
              backgroundColor: pressed ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.06)",
              alignItems: "center",
              justifyContent: "center",
            })}
          >
            <Ionicons name="close" size={18} color={UI.text} />
          </Pressable>
        </View>
<View style={{ marginTop: 14 }}>
  <Text style={{ color: UI.muted, fontWeight: "900", marginBottom: 8 }}>Quick actions</Text>

  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
    <Pressable
      onPress={() => {
        setPlusOpen(false);
        void pickAndAttachImage();
      }}
      disabled={!aiEnabled}
      hitSlop={10}
      style={({ pressed }) => ({
        height: 42,
        paddingHorizontal: 14,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.12)",
        backgroundColor: pressed ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.06)",
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "row",
        gap: 8,
        opacity: !aiEnabled ? 0.55 : pressed ? 0.92 : 1,
      })}
    >
      <Ionicons name="image-outline" size={16} color={UI.text} />
      <Text style={{ color: UI.text, fontWeight: "900", fontSize: 12 }}>Attach Image</Text>
    </Pressable>

    {(clean(input) || attachedImages.length > 0) && !thinking ? (
      <Pressable
        onPress={() => {
          setPlusOpen(false);
          clearComposer();
        }}
        hitSlop={10}
        style={({ pressed }) => ({
          height: 42,
          paddingHorizontal: 14,
          borderRadius: 999,
          borderWidth: 1,
          borderColor: "rgba(239,68,68,0.24)",
          backgroundColor: pressed ? "rgba(239,68,68,0.16)" : "rgba(239,68,68,0.08)",
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "row",
          gap: 8,
        })}
      >
        <Ionicons name="close-circle-outline" size={16} color={UI.text} />
        <Text style={{ color: UI.text, fontWeight: "900", fontSize: 12 }}>Clear</Text>
      </Pressable>
    ) : null}
  </View>
</View>
        {/* SUBSCRIPTION BUTTON */}
        <View style={{ marginTop: 14 }}>
          <Pressable
            onPress={() => {
              setPlusOpen(false);
              router.push("/settings/subscription");
            }}
            hitSlop={10}
            style={({ pressed }) => ({
              height: 48,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.12)",
              backgroundColor: pressed ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.06)",
              alignItems: "center",
              justifyContent: "center",
              flexDirection: "row",
              gap: 10,
            })}
          >
            <Ionicons name="card-outline" size={18} color={UI.text} />
            <Text style={{ color: UI.text, fontWeight: "900" }}>Subscription</Text>
          </Pressable>
        </View>

        {/* MOVED CARDS */}
        <View style={{ marginTop: 14 }}>
          <Text style={{ color: UI.muted, fontWeight: "900", marginBottom: 8 }}>Current AI Status</Text>

          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            <View
              style={{
                paddingHorizontal: 12,
                height: 36,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: aiEnabled ? "rgba(16,185,129,0.35)" : "rgba(255,255,255,0.12)",
                backgroundColor: aiEnabled ? "rgba(16,185,129,0.10)" : "rgba(255,255,255,0.06)",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text style={{ color: UI.text, fontWeight: "900", fontSize: 12 }}>
                {aiEnabled ? "AI ON" : "LOCKED"}
              </Text>
            </View>

            <View
              style={{
                paddingHorizontal: 12,
                height: 36,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.12)",
                backgroundColor: "rgba(255,255,255,0.06)",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text style={{ color: UI.text, fontWeight: "900", fontSize: 12 }}>
                Plan: {currentPlanLabel}
              </Text>
            </View>

            {planAllowsAi ? (
              <View
                style={{
                  paddingHorizontal: 12,
                  height: 36,
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: isOwner ? "rgba(16,185,129,0.35)" : "rgba(245,158,11,0.35)",
                  backgroundColor: isOwner ? "rgba(16,185,129,0.10)" : "rgba(245,158,11,0.10)",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text style={{ color: UI.text, fontWeight: "900", fontSize: 12 }}>
                  AI: {isOwner ? "OWNER ONLY" : "NO ACCESS"}
                </Text>
              </View>
            ) : null}

            {aiEnabled ? (
              <View
                style={{
                  paddingHorizontal: 12,
                  height: 36,
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: "rgba(16,185,129,0.35)",
                  backgroundColor: "rgba(16,185,129,0.10)",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text style={{ color: UI.text, fontWeight: "900", fontSize: 12 }}>
                  Credits: {fmtNum(aiCreditsRemaining)} / {fmtNum(aiCreditsMonthly)}
                </Text>
              </View>
            ) : null}
          </View>
        </View>

        {/* AI LANGUAGE */}
        <View style={{ marginTop: 16 }}>
          <Text style={{ color: UI.muted, fontWeight: "900", marginBottom: 8 }}>AI Language</Text>
          <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
            <ModePill k="AUTO" label="Auto" />
            <ModePill k="SW" label="Swahili" />
            <ModePill k="EN" label="English" />
          </View>
        </View>

        {/* QUICK PROMPTS */}
        <View style={{ marginTop: 16, opacity: aiEnabled ? 1 : 0.55 }}>
          <Text style={{ color: UI.muted, fontWeight: "900", marginBottom: 8 }}>Quick prompts</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
            {quickChips.map((c) => (
              <Pressable
                key={c.k}
                onPress={() => applyChipPrompt(c.prompt)}
                disabled={!aiEnabled}
                hitSlop={10}
                style={({ pressed }) => ({
                  paddingHorizontal: 12,
                  height: 36,
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.12)",
                  backgroundColor: pressed ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.06)",
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 8,
                  opacity: pressed ? 0.92 : 1,
                })}
              >
                <Ionicons name={c.icon as any} size={14} color={UI.text} />
                <Text style={{ color: UI.text, fontWeight: "900", fontSize: 12 }}>{c.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>
{/* SMART FOLLOW-UP */}
        {aiEnabled && smartFollowupChips.length ? (
          <View style={{ marginTop: 16 }}>
            <Text style={{ color: UI.muted, fontWeight: "900", marginBottom: 8 }}>Smart follow-up</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
              {smartFollowupChips.map((chip) => (
                <Pressable
                  key={chip.k}
                  onPress={() => applyChipPrompt(chip.prompt)}
                  hitSlop={10}
                  style={({ pressed }) => ({
                    paddingHorizontal: 12,
                    height: 36,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: "rgba(16,185,129,0.28)",
                    backgroundColor: pressed ? "rgba(16,185,129,0.18)" : "rgba(16,185,129,0.10)",
                    alignItems: "center",
                    justifyContent: "center",
                    opacity: pressed ? 0.92 : 1,
                  })}
                >
                  <Text style={{ color: UI.text, fontWeight: "900", fontSize: 12 }}>
                    {chip.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}

        {/* TASKS */}
        <View style={{ marginTop: 16, opacity: aiEnabled ? 1 : 0.55 }}></View>
        {/* TASKS */}
        <View style={{ marginTop: 16, opacity: aiEnabled ? 1 : 0.55 }}>
          <Pressable
            onPress={() => {
              if (!requireAi(ownerOnlyReason || `AI haipatikani kwenye ${currentPlanLabel}. Upgrade ili kufungua Tasks panel.`)) {
                return;
              }
              setPlusOpen(false);
              Keyboard.dismiss();
              setTasksOpen(true);
              void loadTasks();
            }}
            disabled={!aiEnabled}
            hitSlop={10}
            style={({ pressed }) => ({
              height: 48,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: "rgba(16,185,129,0.45)",
              backgroundColor: pressed ? "rgba(16,185,129,0.20)" : "rgba(16,185,129,0.14)",
              alignItems: "center",
              justifyContent: "center",
              flexDirection: "row",
              gap: 10,
            })}
          >
            <Ionicons name="checkbox-outline" size={18} color={UI.text} />
            <Text style={{ color: UI.text, fontWeight: "900" }}>Open Tasks</Text>
          </Pressable>
        </View>

        {!aiEnabled ? (
          <Pressable
            onPress={() => {
              setPlusOpen(false);
              openAiGate(defaultAiLockReason);
            }}
            style={({ pressed }) => ({
              marginTop: 14,
              height: 48,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: "rgba(245,158,11,0.35)",
              backgroundColor: pressed ? "rgba(245,158,11,0.16)" : "rgba(245,158,11,0.10)",
              alignItems: "center",
              justifyContent: "center",
              flexDirection: "row",
              gap: 10,
            })}
          >
            <Ionicons name="lock-closed-outline" size={18} color={UI.text} />
            <Text style={{ color: UI.text, fontWeight: "900" }}>
              {ownerOnlyReason ? "AI Owner Only" : "AI Locked — Upgrade"}
            </Text>
          </Pressable>
        ) : null}
      </Pressable>
    </Pressable>
  </Modal>
);

const Composer = (
  <View
    style={{
      paddingHorizontal: 14,
      paddingTop: 8,
      paddingBottom: Math.max(insets.bottom, 0) + androidComposerLift,
      backgroundColor: "transparent",
      opacity: aiEnabled ? 1 : 0.76,
    }}
  >
    <View
      style={{
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.10)",
        backgroundColor: "rgba(10,14,20,0.96)",
        borderRadius: 28,
        paddingHorizontal: 10,
        paddingTop: 10,
        paddingBottom: 10,
        shadowColor: "#000",
        shadowOpacity: 0.24,
        shadowRadius: 18,
        shadowOffset: { width: 0, height: 10 },
        elevation: 10,
      }}
    >
      {AttachRow}

      <View
        style={{
          flexDirection: "row",
          alignItems: "flex-end",
          gap: 8,
        }}
      >
        <Pressable
          onPress={() => {
            if (!aiEnabled) {
              openAiGate(defaultAiLockReason);
              return;
            }
            Keyboard.dismiss();
            setPlusOpen(true);
          }}
          disabled={!aiEnabled}
          hitSlop={10}
          style={({ pressed }) => ({
            width: 40,
            height: 40,
            borderRadius: 20,
            borderWidth: 1,
            borderColor: "rgba(255,255,255,0.10)",
            backgroundColor: pressed ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.05)",
            alignItems: "center",
            justifyContent: "center",
            opacity: !aiEnabled ? 0.55 : pressed ? 0.92 : 1,
          })}
        >
          <Ionicons name="add" size={18} color={UI.text} />
        </Pressable>

        <View
          style={{
            flex: 1,
            minHeight: 44,
            borderRadius: 22,
            justifyContent: "center",
            paddingHorizontal: 2,
          }}
        >
          <TextInput
            ref={inputRef}
            value={input}
            onChangeText={setInput}
            placeholder={
              aiEnabled
                ? transcribing
                  ? "Transcribing voice..."
                  : attachedImages.length
                  ? "Eleza picha au uliza AI ichambue..."
                  : "Uliza ZETRA AI chochote kuhusu biashara yako..."
                : ownerOnlyReason
                ? "AI ni ya OWNER pekee"
                : `AI imezimwa (${currentPlanLabel}) — upgrade ili kutumia`
            }
            placeholderTextColor={UI.faint}
            multiline
            maxLength={INPUT_MAX}
            editable={aiEnabled}
            style={{
              color: UI.text,
              fontWeight: "800",
              fontSize: 16,
              lineHeight: 22,
              minHeight: 24,
              maxHeight: 140,
              paddingHorizontal: 4,
              paddingTop: 8,
              paddingBottom: 8,
            }}
            keyboardAppearance="dark"
            autoCorrect
            autoCapitalize="sentences"
            returnKeyType="default"
            blurOnSubmit={false}
            textAlignVertical="top"
            onFocus={() => {
              if (Platform.OS === "android") {
                scrollToLatest(false, true);
              }
            }}
            onSubmitEditing={() => {}}
          />
        </View>

        <Pressable
          onPress={() => {
            if (recordingOn) {
              void stopRecordingAndTranscribe();
              return;
            }
            if (canSend) {
              void send();
              return;
            }
            toggleMic();
          }}
          disabled={recordingOn ? false : canSend ? !canSend : !aiEnabled}
          hitSlop={10}
          style={({ pressed }) => {
            const activeSend = recordingOn || canSend;

            return {
              width: 42,
              height: 42,
              borderRadius: 21,
              borderWidth: 1,
              borderColor: activeSend ? C.emeraldBorder : "rgba(255,255,255,0.10)",
              backgroundColor: activeSend
                ? C.emeraldSoft
                : pressed
                ? "rgba(255,255,255,0.08)"
                : "rgba(255,255,255,0.05)",
              alignItems: "center",
              justifyContent: "center",
              opacity: !recordingOn && !canSend && !aiEnabled ? 0.55 : pressed ? 0.92 : 1,
              transform: [{ scale: pressed ? 0.985 : 1 }],
            };
          }}
        >
          <Ionicons
            name={recordingOn || canSend ? "arrow-up" : "mic-outline"}
            size={18}
            color={UI.text}
          />
        </Pressable>
      </View>

      <View
  style={{
    marginTop: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    paddingHorizontal: 2,
  }}
>
  {recordingOn ? (
    <View
      style={{
        flex: 1,
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        minHeight: 28,
      }}
    >
      <Text style={{ color: UI.faint, fontWeight: "800", fontSize: 11, width: 64 }}>
        Listening...
      </Text>

      <View
        style={{
          flex: 1,
          height: 26,
          flexDirection: "row",
          alignItems: "flex-end",
          gap: 3,
          overflow: "hidden",
        }}
      >
        {Array.from({ length: 14 }).map((_, idx) => {
          const normalized = Math.max(0, Math.min(1, (liveMeter + 160) / 160));
          const base = [0.42, 0.62, 0.86, 0.58, 0.96, 0.48, 0.74];
          const factor = base[idx % base.length];
          const h = Math.max(6, Math.min(24, Math.round((6 + normalized * 18) * factor)));

          return (
            <View
              key={`bar_${idx}`}
              style={{
                width: 4,
                height: h,
                borderRadius: 999,
                backgroundColor:
                  idx % 3 === 0 ? "rgba(16,185,129,0.95)" : "rgba(255,255,255,0.75)",
              }}
            />
          );
        })}
      </View>

      <Text
        style={{
          color: UI.faint,
          fontWeight: "800",
          fontSize: 11,
          width: 36,
          textAlign: "right",
        }}
      >
        {(recordingMs / 1000).toFixed(1)}s
      </Text>
    </View>
  ) : (
    <>
      <Text style={{ color: UI.faint, fontWeight: "800", fontSize: 11 }}>
        {transcribing
          ? "🎙️ Voice inachakatwa..."
          : attachedImages.length
          ? `🖼️ ${attachedImages.length} image attached`
          : "✨ AI ready"}
      </Text>

      <Text style={{ color: UI.faint, fontWeight: "800", fontSize: 11 }}>
        {clean(input).length}/{INPUT_MAX.toLocaleString()}
      </Text>
    </>
  )}
</View>

      {thinking ? (
        <View style={{ marginTop: 10 }}>
          <Pressable
            onPress={stopGenerating}
            style={({ pressed }) => ({
              height: 42,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: "rgba(239,68,68,0.35)",
              backgroundColor: pressed ? "rgba(239,68,68,0.18)" : "rgba(239,68,68,0.12)",
              alignItems: "center",
              justifyContent: "center",
              flexDirection: "row",
              gap: 10,
            })}
          >
            <Ionicons name="stop-circle-outline" size={18} color={UI.text} />
            <Text style={{ color: UI.text, fontWeight: "900" }}>STOP GENERATING</Text>
          </Pressable>
        </View>
      ) : !aiEnabled ? (
        <View style={{ marginTop: 10 }}>
          <Pressable
            onPress={() => openAiGate(defaultAiLockReason)}
            style={({ pressed }) => ({
              height: 42,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: "rgba(245,158,11,0.35)",
              backgroundColor: pressed ? "rgba(245,158,11,0.18)" : "rgba(245,158,11,0.12)",
              alignItems: "center",
              justifyContent: "center",
              flexDirection: "row",
              gap: 10,
            })}
          >
            <Ionicons name="lock-closed-outline" size={18} color={UI.text} />
            <Text style={{ color: UI.text, fontWeight: "900" }}>
              {ownerOnlyReason ? "OWNER ONLY AI" : "UPGRADE TO USE AI"}
            </Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  </View>
);

  const TasksModal = (
    <Modal visible={tasksOpen} transparent animationType="fade" onRequestClose={() => setTasksOpen(false)}>
      <Pressable
        onPress={() => setTasksOpen(false)}
        style={{
          flex: 1,
          backgroundColor: "rgba(0,0,0,0.60)",
          justifyContent: "flex-end",
        }}
      >
        <Pressable
          onPress={() => {}}
          style={{
            backgroundColor: C.background,
            borderTopLeftRadius: 22,
            borderTopRightRadius: 22,
            borderWidth: 1,
            borderColor: "rgba(255,255,255,0.10)",
            padding: 14,
            paddingBottom: Math.max(insets.bottom, 12) + 14,
            maxHeight: "86%",
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Text style={{ color: UI.text, fontWeight: "900", fontSize: 16 }}>Tasks</Text>

            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <Pressable
                onPress={() => void loadTasks()}
                hitSlop={10}
                style={({ pressed }) => ({
                  width: 40,
                  height: 40,
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.12)",
                  backgroundColor: pressed ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.06)",
                  alignItems: "center",
                  justifyContent: "center",
                })}
              >
                <Ionicons name="refresh" size={18} color={UI.text} />
              </Pressable>

              <Pressable
                onPress={() => setTasksOpen(false)}
                hitSlop={10}
                style={({ pressed }) => ({
                  width: 40,
                  height: 40,
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.12)",
                  backgroundColor: pressed ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.06)",
                  alignItems: "center",
                  justifyContent: "center",
                })}
              >
                <Ionicons name="close" size={18} color={UI.text} />
              </Pressable>
            </View>
          </View>

          <Text style={{ color: UI.muted, fontWeight: "800", marginTop: 6 }}>
            Org: {org.activeOrgName ?? "—"} • Showing latest tasks saved by AI & manual.
          </Text>

          {tasksLoading ? (
            <View style={{ paddingTop: 16, alignItems: "center" }}>
              <ActivityIndicator />
              <Text style={{ color: UI.muted, fontWeight: "800", marginTop: 10 }}>Loading tasks...</Text>
            </View>
          ) : tasksError ? (
            <Card style={{ marginTop: 12, padding: 14, borderRadius: 18 }}>
              <Text style={{ color: UI.text, fontWeight: "900" }}>Could not load tasks</Text>
              <Text style={{ color: UI.muted, fontWeight: "800", marginTop: 6 }}>{tasksError}</Text>
              <Pressable
                onPress={() => void loadTasks()}
                style={({ pressed }) => ({
                  marginTop: 12,
                  height: 44,
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: "rgba(16,185,129,0.45)",
                  backgroundColor: pressed ? "rgba(16,185,129,0.20)" : "rgba(16,185,129,0.14)",
                  alignItems: "center",
                  justifyContent: "center",
                })}
              >
                <Text style={{ color: UI.text, fontWeight: "900" }}>Retry</Text>
              </Pressable>
            </Card>
          ) : tasks.length === 0 ? (
            <Card style={{ marginTop: 12, padding: 14, borderRadius: 18 }}>
              <Text style={{ color: UI.text, fontWeight: "900" }}>No tasks yet</Text>
              <Text style={{ color: UI.muted, fontWeight: "800", marginTop: 6 }}>
                Ukiona “✅ Saved to Tasks: N” chini ya jibu la AI — itatokea hapa.
              </Text>
            </Card>
          ) : (
            <FlatList
              data={tasks}
              keyExtractor={(t) => t.id}
              style={{ marginTop: 12 }}
              refreshControl={<RefreshControl refreshing={tasksLoading} onRefresh={() => void loadTasks()} />}
              renderItem={({ item }) => {
                const pr = item.priority ? String(item.priority) : "—";
                const st = item.status ? String(item.status) : "—";
                const eta = item.eta ? String(item.eta) : "";
                const steps = Array.isArray(item.steps) ? item.steps : [];
                return (
                  <Card style={{ padding: 14, borderRadius: 18, marginBottom: 10 }}>
                    <Text style={{ color: UI.text, fontWeight: "900" }}>{item.title || "Untitled"}</Text>

                    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
                      <View
                        style={{
                          paddingHorizontal: 10,
                          height: 28,
                          borderRadius: 999,
                          borderWidth: 1,
                          borderColor: "rgba(255,255,255,0.12)",
                          backgroundColor: "rgba(255,255,255,0.06)",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <Text style={{ color: UI.muted, fontWeight: "900", fontSize: 12 }}>status: {st}</Text>
                      </View>

                      <View
                        style={{
                          paddingHorizontal: 10,
                          height: 28,
                          borderRadius: 999,
                          borderWidth: 1,
                          borderColor: "rgba(255,255,255,0.12)",
                          backgroundColor: "rgba(255,255,255,0.06)",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <Text style={{ color: UI.muted, fontWeight: "900", fontSize: 12 }}>priority: {pr}</Text>
                      </View>

                      {eta ? (
                        <View
                          style={{
                            paddingHorizontal: 10,
                            height: 28,
                            borderRadius: 999,
                            borderWidth: 1,
                            borderColor: "rgba(16,185,129,0.25)",
                            backgroundColor: "rgba(16,185,129,0.10)",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          <Text style={{ color: UI.muted, fontWeight: "900", fontSize: 12 }}>eta: {eta}</Text>
                        </View>
                      ) : null}
                    </View>

                    {steps.length ? (
                      <View style={{ marginTop: 10 }}>
                        <Text style={{ color: UI.text, fontWeight: "900", marginBottom: 6 }}>Steps</Text>
                        {steps.slice(0, 6).map((s, idx) => (
                          <Text key={`${item.id}_s_${idx}`} style={{ color: UI.muted, fontWeight: "800", marginTop: 4 }}>
                            • {clean(s)}
                          </Text>
                        ))}
                        {steps.length > 6 ? (
                          <Text style={{ color: UI.faint, fontWeight: "800", marginTop: 6 }}>
                            +{steps.length - 6} more...
                          </Text>
                        ) : null}
                      </View>
                    ) : null}
                  </Card>
                );
              }}
            />
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );

  const ImagePreviewModal = (
    <Modal
      visible={imgPreview.open}
      transparent
      animationType="fade"
      onRequestClose={() => setImgPreview({ open: false, uri: "" })}
    >
      <Pressable
        onPress={() => setImgPreview({ open: false, uri: "" })}
        style={{
          flex: 1,
          backgroundColor: "rgba(0,0,0,0.85)",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Pressable
          onPress={() => {}}
          style={{
            width: "92%",
            aspectRatio: 1,
            borderRadius: 18,
            overflow: "hidden",
          }}
        >
          <Image
            source={{ uri: imgPreview.uri }}
            style={{ width: "100%", height: "100%" }}
            resizeMode="contain"
          />
        </Pressable>

        <View
          style={{
            position: "absolute",
            top: Math.max(insets.top, 12) + 12,
            right: 16,
          }}
        >
          <Pressable
            onPress={() => setImgPreview({ open: false, uri: "" })}
            style={({ pressed }) => ({
              width: 44,
              height: 44,
              borderRadius: 16,
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.18)",
              backgroundColor: pressed ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.06)",
              alignItems: "center",
              justifyContent: "center",
            })}
          >
            <Ionicons name="close" size={22} color={UI.text} />
          </Pressable>
        </View>

        {!!clean(imgPreview.uri) && (
          <View
            style={{
              position: "absolute",
              left: 16,
              right: 16,
              bottom: Math.max(insets.bottom, 12) + 12,
              flexDirection: "row",
              gap: 10,
            }}
          >
            <Pressable
              onPress={() => void sharePreviewImage()}
              style={({ pressed }) => ({
                flex: 1,
                height: 48,
                borderRadius: 14,
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.14)",
                backgroundColor: pressed ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.06)",
                alignItems: "center",
                justifyContent: "center",
                flexDirection: "row",
                gap: 8,
              })}
            >
              <Ionicons name="share-social-outline" size={18} color={UI.text} />
              <Text style={{ color: UI.text, fontWeight: "900" }}>Share</Text>
            </Pressable>

            <Pressable
              onPress={() => void savePreviewImageToDevice()}
              style={({ pressed }) => ({
                flex: 1,
                height: 48,
                borderRadius: 14,
                borderWidth: 1,
                borderColor: "rgba(16,185,129,0.35)",
                backgroundColor: pressed ? "rgba(16,185,129,0.18)" : "rgba(16,185,129,0.12)",
                alignItems: "center",
                justifyContent: "center",
                flexDirection: "row",
                gap: 8,
              })}
            >
              <Ionicons name="download-outline" size={18} color={UI.text} />
              <Text style={{ color: UI.text, fontWeight: "900" }}>Save</Text>
            </Pressable>
          </View>
        )}
      </Pressable>
    </Modal>
  );

const Content = (
  <View style={{ flex: 1 }}>
    {RetryBanner}

    <FlatList
      ref={listRef}
      data={messages}
      keyExtractor={(m) => m.id}
      renderItem={renderMsg}
      inverted
      keyboardShouldPersistTaps="always"
      keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
      showsVerticalScrollIndicator={false}
      removeClippedSubviews={Platform.OS === "android"}
      initialNumToRender={12}
      maxToRenderPerBatch={8}
      windowSize={10}
      scrollEventThrottle={16}
      onScroll={handleListScroll}
      style={{ flex: 1 }}
      contentContainerStyle={{
        paddingTop: 12,
        paddingBottom: 16 + (Platform.OS === "android" ? androidComposerLift : 0),
      }}
    />

    {Composer}
  </View>
);

  return (
    <Screen scroll={false} contentStyle={{ paddingTop: 0, paddingHorizontal: 0, paddingBottom: 0 }}>
      <View style={{ flex: 1, backgroundColor: C.background }}>
        {TopBar}

        {Platform.OS === "ios" ? (
          <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding" keyboardVerticalOffset={0}>
            {Content}
          </KeyboardAvoidingView>
        ) : (
          <View style={{ flex: 1 }}>{Content}</View>
        )}

        {TasksModal}
        
        {ImagePreviewModal}
        {PlusMenu}
        {AiLockedModal}

        {toolOpen ? (
          <View style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0 }}>
            <Animated.View
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                top: 0,
                bottom: 0,
                opacity: overlayOpacity,
                backgroundColor: "#000",
              }}
            />
            <Pressable style={{ flex: 1 }} onPress={closeTool} />
            <Animated.View
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                bottom: 0,
                height: sheetHeight,
                transform: [{ translateY: sheetTranslateY }, { scale: sheetScale }],
                backgroundColor: C.background,
                borderTopLeftRadius: 22,
                borderTopRightRadius: 22,
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.10)",
                padding: 14,
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <Text style={{ color: UI.text, fontWeight: "900" }}>{toolKey || "Tool"}</Text>
                <Pressable
                  onPress={closeTool}
                  hitSlop={10}
                  style={({ pressed }) => ({
                    width: 38,
                    height: 38,
                    borderRadius: 14,
                    borderWidth: 1,
                    borderColor: "rgba(255,255,255,0.12)",
                    backgroundColor: pressed ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.06)",
                    alignItems: "center",
                    justifyContent: "center",
                  })}
                >
                  <Ionicons name="close" size={18} color={UI.text} />
                </Pressable>
              </View>

              <Text style={{ color: UI.muted, fontWeight: "800", marginTop: 10 }}>
                Tool sheet placeholder — tutaijaza baadae (Analyze/Research/Image/Agent).
              </Text>

              {toolKey === "IMAGE" ? (
                <View style={{ marginTop: 12 }}>
                  <Text style={{ color: UI.text, fontWeight: "900" }}>Image Prompt</Text>
                  <TextInput
                    value={imagePrompt}
                    onChangeText={setImagePrompt}
                    placeholder="Write an image prompt..."
                    placeholderTextColor={UI.faint}
                    style={{
                      marginTop: 10,
                      color: UI.text,
                      fontWeight: "800",
                      borderWidth: 1,
                      borderColor: "rgba(255,255,255,0.10)",
                      backgroundColor: "rgba(255,255,255,0.04)",
                      borderRadius: 16,
                      paddingHorizontal: 12,
                      paddingVertical: 10,
                      minHeight: 44,
                    }}
                  />
                </View>
              ) : null}
            </Animated.View>
          </View>
        ) : null}
      </View>
    </Screen>
  );
}