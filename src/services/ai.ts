// src/services/ai.ts
import { kv } from "@/src/storage/kv";
import { supabase } from "@/src/supabase/supabaseClient";

type AiMode = "AUTO" | "SW" | "EN";

export type ChatHistoryMsg = { role: "user" | "assistant"; text: string };

export type ModelHint =
  | "gpt-4o"
  | "gpt-4o-mini"
  | "gpt-4.1"
  | "gpt-4.1-mini"
  | string;

export type ReasoningTier = "FAST" | "BALANCED" | "DEEP";

export type AiRoleKey =
  | "AUTO"
  | "ZETRA_BMS"
  | "ENGINEERING"
  | "MATH"
  | "HEALTH"
  | "LEGAL"
  | "FINANCE"
  | "MARKETING"
  | "GENERAL";

export type AskOpts = {
  mode?: AiMode; // kept for backward compatibility; screen will use AUTO
  history?: ChatHistoryMsg[];
  locale?: string; // NEW (non-breaking): org locale eg "en-US", "sw-TZ"

  // ✅ NEW (non-breaking): optional role hint override
  roleHint?: AiRoleKey;

  context?: {
    orgId?: string | null;
    activeOrgId?: string | null;
    activeOrgName?: string | null;

    activeStoreId?: string | null;
    activeStoreName?: string | null;

    activeRole?: string | null;

    currency?: string | null;
    timezone?: string | null;
    country?: string | null;
  };

  taskAutosave?: boolean;
  modelHint?: ModelHint;
  reasoningTier?: ReasoningTier;
};

export type ActionItem = {
  title: string;
  steps?: string[];
  priority?: "LOW" | "MEDIUM" | "HIGH";
  eta?: string;
};

export type ConversationState = {
  topic?: string;
  objective?: string;
  lastPlan?: string;
  strategyLevel?: "IDEA" | "PLAN" | "EXECUTION";
  lang?: "sw" | "en" | "auto";
  updatedAt?: number;
};

export type AiMeta = {
  text: string;
  actions: ActionItem[];
  nextMove?: string;
  lang?: "sw" | "en" | "auto";
  memory?: ConversationState;
};

const DEFAULT_AI_URL = "https://zetra-ai-worker.jofreyjofreysanga.workers.dev";
const MAX_CHARS = 12_000;

const conversationStore = new Map<string, ConversationState>();
const MEMORY_TTL_MS = 6 * 60 * 60 * 1000;
const hydratedKeys = new Set<string>();

function clean(x: unknown) {
  return String(x ?? "").trim();
}

function safeSlice(s: string, n: number) {
  if (s.length <= n) return s;
  return s.slice(0, n);
}

function getConversationKey(opts?: AskOpts): string {
  const ctx = opts?.context ?? {};
  const orgId = clean(ctx.orgId || ctx.activeOrgId || "");
  return orgId || "global";
}

function isExpired(state: ConversationState | null) {
  const t = state?.updatedAt ?? 0;
  if (!t) return false;
  return Date.now() - t > MEMORY_TTL_MS;
}

async function ensureHydrated(key: string) {
  if (hydratedKeys.has(key)) return;
  hydratedKeys.add(key);

  const inMem = conversationStore.get(key) ?? null;
  if (inMem && !isExpired(inMem)) return;

  try {
    const stored = await kv.getJson<ConversationState>(kv.aiMemoryKey(key));
    if (!stored) return;

    if (isExpired(stored)) {
      conversationStore.delete(key);
      await kv.setJson(kv.aiMemoryKey(key), null);
      return;
    }

    conversationStore.set(key, stored);
  } catch {}
}

function getConversationState(key: string): ConversationState | null {
  const s = conversationStore.get(key) ?? null;
  if (!s) return null;

  if (isExpired(s)) {
    conversationStore.delete(key);
    void kv.setJson(kv.aiMemoryKey(key), null);
    return null;
  }

  return { ...s };
}

function mergeState(prev: ConversationState | null, next: ConversationState | null): ConversationState | null {
  const a = prev ?? {};
  const b = next ?? {};

  const merged: ConversationState = {
    topic: clean((b as any).topic) || clean((a as any).topic) || undefined,
    objective: clean((b as any).objective) || clean((a as any).objective) || undefined,
    lastPlan: clean((b as any).lastPlan) || clean((a as any).lastPlan) || undefined,
    strategyLevel: (b as any).strategyLevel || (a as any).strategyLevel || undefined,
    lang: (b as any).lang || (a as any).lang || undefined,
    updatedAt: Date.now(),
  };

  if (!merged.topic && !merged.objective && !merged.lastPlan && !merged.strategyLevel && !merged.lang) return null;
  return merged;
}

async function persistConversationState(key: string, state: ConversationState | null) {
  try {
    await kv.setJson(kv.aiMemoryKey(key), state);
  } catch {}
}

function setConversationState(key: string, state: ConversationState | null) {
  if (!state) {
    conversationStore.delete(key);
    void persistConversationState(key, null);
    return;
  }
  conversationStore.set(key, state);
  void persistConversationState(key, state);
}

function parseZetraOutput(raw: string): AiMeta {
  const s = clean(raw);

  const replyMarker = "<<<ZETRA_REPLY>>>";
  const actionsMarker = "<<<ZETRA_ACTIONS>>>";

  const iReply = s.indexOf(replyMarker);
  const iAct = s.indexOf(actionsMarker);

  if (iReply === -1 || iAct === -1 || iAct <= iReply) {
    return { text: s, actions: [], nextMove: undefined, lang: "auto", memory: undefined };
  }

  const reply = clean(s.slice(iReply + replyMarker.length, iAct));
  const jsonPart = clean(s.slice(iAct + actionsMarker.length));

  let parsed: any = null;
  try {
    parsed = JSON.parse(jsonPart);
  } catch {
    parsed = null;
  }

  const actionsRaw = Array.isArray(parsed?.actions) ? parsed.actions : [];
  const actions: ActionItem[] = actionsRaw
    .map((a: any) => ({
      title: clean(a?.title),
      steps: Array.isArray(a?.steps) ? a.steps.map((x: any) => clean(x)).filter(Boolean) : undefined,
      priority: a?.priority === "HIGH" || a?.priority === "MEDIUM" || a?.priority === "LOW" ? a.priority : undefined,
      eta: clean(a?.eta) || undefined,
    }))
    .filter((a: ActionItem) => !!a.title);

  const nextMove = clean(parsed?.nextMove) || undefined;
  const lang = parsed?.lang === "sw" || parsed?.lang === "en" || parsed?.lang === "auto" ? parsed.lang : "auto";

  const memRaw = parsed?.memory && typeof parsed.memory === "object" ? parsed.memory : null;
  const memory: ConversationState | undefined = memRaw
    ? {
        topic: clean((memRaw as any).topic) || undefined,
        objective: clean((memRaw as any).objective) || undefined,
        lastPlan: clean((memRaw as any).lastPlan) || undefined,
        strategyLevel:
          (memRaw as any).strategyLevel === "IDEA" ||
          (memRaw as any).strategyLevel === "PLAN" ||
          (memRaw as any).strategyLevel === "EXECUTION"
            ? (memRaw as any).strategyLevel
            : undefined,
        lang: lang,
        updatedAt: Date.now(),
      }
    : undefined;

  return { text: reply || s, actions, nextMove, lang, memory };
}

function updateMemoryAfterReply(opts: AskOpts | undefined, meta: AiMeta) {
  const key = getConversationKey(opts);
  const prev = getConversationState(key);

  const next: ConversationState | null = meta.memory
    ? meta.memory
    : meta.lang
    ? { lang: meta.lang, updatedAt: Date.now() }
    : null;

  const merged = mergeState(prev, next);
  setConversationState(key, merged);
}

async function saveAiActionsToTasks(opts: AskOpts | undefined, actions: ActionItem[]) {
  try {
    if (!opts?.taskAutosave) return;
    if (!actions || actions.length === 0) return;

    const ctx = opts?.context ?? {};
    const orgId = clean(ctx.orgId || ctx.activeOrgId || "");
    if (!orgId) return;

    const storeId = clean(ctx.activeStoreId || "");
    const storeArg = storeId ? storeId : null;

    for (const a of actions) {
      const title = clean(a?.title);
      if (!title) continue;

      const steps = Array.isArray(a.steps) ? a.steps.map((s) => clean(s)).filter(Boolean) : [];
      const priority = a?.priority === "LOW" || a?.priority === "MEDIUM" || a?.priority === "HIGH" ? a.priority : null;
      const eta = clean(a?.eta || "") || null;

      const { error } = await supabase.rpc("create_task_from_ai", {
        p_org_id: orgId,
        p_store_id: storeArg,
        p_title: title,
        p_steps: steps,
        p_priority: priority,
        p_eta: eta,
      });

      if (error) {
        console.warn("[AI] create_task_from_ai failed:", error.message);
      }
    }
  } catch (e: any) {
    console.warn("[AI] saveAiActionsToTasks error:", e?.message ? String(e.message) : String(e));
  }
}

/* =========================
   Canonical Worker Client
========================= */

const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);
const DEFAULT_TIMEOUT_MS = 25_000;
const DEFAULT_RETRIES = 2;

function normalizeWorkerBaseUrl(raw: any) {
  let u = clean(raw);
  if (!u) return "";
  u = u.replace(/\s+/g, "");
  u = u.replace(/\/+$/g, "");

  // strip known endpoint suffixes if user pasted full endpoint
  u = u.replace(/\/v1\/chat$/i, "");
  u = u.replace(/\/health$/i, "");
  u = u.replace(/\/vision$/i, "");
  u = u.replace(/\/image$/i, "");
  u = u.replace(/\/transcribe$/i, "");

  u = u.replace(/\/+$/g, "");
  return u;
}

function joinUrl(base: string, path: string) {
  const b = clean(base).replace(/\/+$/, "");
  const p = clean(path).startsWith("/") ? clean(path) : `/${clean(path)}`;
  return `${b}${p}`;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
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

function safeClip(s: string, max = 900) {
  const t = clean(s);
  if (!t) return "";
  return t.length > max ? t.slice(0, max) + "…" : t;
}

export type AiHttpResult = {
  status: number;
  ok: boolean;
  data: any | null;
  textBody: string;
};

export async function fetchJsonWithRetry(
  url: string,
  init: RequestInit,
  opts?: { timeoutMs?: number; retries?: number; tag?: string }
): Promise<AiHttpResult> {
  const timeoutMs = Math.max(2_000, Number(opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS));
  const retries = Math.max(0, Math.min(5, Number(opts?.retries ?? DEFAULT_RETRIES)));
  const tag = clean(opts?.tag) || "request";

  let lastErr: any = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeoutMs);

    // Mirror external abort -> internal controller.abort()
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

      const bodyStr =
        clean((json as any)?.error) ||
        clean((json as any)?.message) ||
        safeClip(text);

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

      const msg = clean(e?.message).toLowerCase();
      const isAbort =
        e?.name === "AbortError" || msg.includes("aborted") || msg.includes("abort");
      const isNetwork = msg.includes("network request failed") || msg.includes("failed to fetch");

      const shouldRetry = isAbort || isNetwork;

      if (!shouldRetry || attempt >= retries) {
        const outMsg = isAbort
          ? `${tag} aborted/timeout after ${Math.round(timeoutMs / 1000)}s`
          : clean(e?.message) || `${tag} failed`;
        return { status: 0, ok: false, data: null, textBody: outMsg };
      }

      const backoff = 350 * (attempt + 1);
      await sleep(backoff);
      continue;
    }
  }

  const fallback = clean(lastErr?.message) || `${clean(opts?.tag) || "request"} failed`;
  return { status: 0, ok: false, data: null, textBody: fallback };
}

function getBaseUrl() {
  const raw = (process.env.EXPO_PUBLIC_AI_WORKER_URL as string | undefined) || DEFAULT_AI_URL;
  return normalizeWorkerBaseUrl(raw);
}

export type VisionImage = { id: string; dataUrl: string }; // data:image/jpeg;base64,...

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

/**
 * Canonical: Chat (AUTO language, follow user)
 */
export async function askZetraAIWithMeta(
  message: string,
  opts?: AskOpts,
  signal?: AbortSignal
): Promise<AiMeta> {
  const text = clean(message);
  if (!text) throw new Error("Empty message");
  if (text.length > MAX_CHARS) throw new Error(`Message too long (limit ${MAX_CHARS.toLocaleString()} chars)`);

  const key = getConversationKey(opts);
  await ensureHydrated(key);

  const baseUrl = getBaseUrl();
  if (!baseUrl) throw new Error("AI Worker URL missing");

  const url = joinUrl(baseUrl, "/v1/chat");

  const locale = clean(opts?.locale || "") || "en-US";
  const mode: AiMode = opts?.mode ?? "AUTO";

  // Language policy: follow user message (supports any language + mixing)
  const language = {
    policy: "FOLLOW_USER", // worker can ignore if not implemented; non-breaking
    reply: "AUTO", // never force SW/EN here
    mix: true,
  };

  const roleHint =
    opts?.roleHint && opts.roleHint !== "AUTO" ? opts.roleHint : undefined;

  const payload = {
    text,
    mode,
    locale,
    language,
    roleHint,
    context: opts?.context ?? null,
    history: Array.isArray(opts?.history) ? opts!.history! : [],
    modelHint: opts?.modelHint,
    reasoningTier: opts?.reasoningTier,
  };

  const out = await fetchJsonWithRetry(
    url,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(payload),
      signal,
    },
    { timeoutMs: 45_000, retries: 2, tag: "chat" }
  );

  const data: any = out.data;

  if (!out.ok) {
    const errMsg =
      clean(data?.error) ||
      clean(data?.message) ||
      clean(data?.details) ||
      clean(out.textBody) ||
      `AI request failed (${out.status})`;
    throw new Error(`${errMsg}${out.status ? ` [${out.status}]` : ""}`);
  }

  if (data && data.ok === false) {
    const errMsg = clean(data?.error) || clean(data?.message) || "AI failed";
    throw new Error(errMsg);
  }

  const raw = clean(data?.reply) || clean(data?.text);
  if (!raw) throw new Error("AI returned empty reply");

  const meta = parseZetraOutput(raw);

  updateMemoryAfterReply(opts, meta);
  void saveAiActionsToTasks(opts, meta.actions ?? []);

  return meta;
}

export async function askZetraAI(
  message: string,
  opts?: AskOpts,
  signal?: AbortSignal
): Promise<string> {
  const meta = await askZetraAIWithMeta(message, opts, signal);
  return meta.text;
}

/**
 * Vision: analyze message + images (dataUrls)
 */
export async function askZetraAIVision(
  message: string,
  images: VisionImage[],
  opts?: AskOpts,
  signal?: AbortSignal
): Promise<AiMeta> {
  const text = clean(message);
  if (!text) throw new Error("Empty message");
  if (text.length > MAX_CHARS) throw new Error(`Message too long (limit ${MAX_CHARS.toLocaleString()} chars)`);

  const baseUrl = getBaseUrl();
  if (!baseUrl) throw new Error("AI Worker URL missing");

  const url = joinUrl(baseUrl, "/vision");

  const locale = clean(opts?.locale || "") || "en-US";
  const mode: AiMode = opts?.mode ?? "AUTO";

  const language = { policy: "FOLLOW_USER", reply: "AUTO", mix: true };

  const roleHint =
    opts?.roleHint && opts.roleHint !== "AUTO" ? opts.roleHint : undefined;

  const payload = {
    message: text,
    images: (Array.isArray(images) ? images : []).map((x) => clean(x.dataUrl)).filter(Boolean),
    meta: {
      mode,
      locale,
      language,
      roleHint,
      history: Array.isArray(opts?.history) ? opts!.history! : [],
      context: opts?.context ?? null,
    },
  };

  const out = await fetchJsonWithRetry(
    url,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(payload),
      signal,
    },
    { timeoutMs: 45_000, retries: 2, tag: "vision" }
  );

  const data: any = out.data;

  if (!out.ok) {
    const errMsg =
      clean(data?.error) ||
      clean(data?.message) ||
      clean(out.textBody) ||
      `Vision failed (${out.status})`;
    throw new Error(errMsg);
  }

  const reply = clean(data?.reply) || clean(data?.text);
  if (!reply) throw new Error("Vision returned empty reply");

  // Vision worker may return meta/actions in plain object
  // Try parseZetraOutput first, else wrap.
  const parsed = parseZetraOutput(reply);

  // If worker already returns meta/actions separately, merge.
  const actionsRaw = Array.isArray(data?.meta?.actions) ? data.meta.actions : [];
  const nextMove = clean(data?.meta?.nextMove) || parsed.nextMove;

  const merged: AiMeta = {
    text: parsed.text,
    actions: parsed.actions.length ? parsed.actions : actionsRaw,
    nextMove,
    lang: parsed.lang ?? "auto",
    memory: parsed.memory,
  };

  updateMemoryAfterReply(opts, merged);
  void saveAiActionsToTasks(opts, merged.actions ?? []);

  return merged;
}

/**
 * Image generation: returns a URL or data:image/...
 */
export async function generateZetraImage(
  prompt: string,
  signal?: AbortSignal
): Promise<string> {
  const p = clean(prompt);
  if (!p) throw new Error("Empty prompt");

  const baseUrl = getBaseUrl();
  if (!baseUrl) throw new Error("AI Worker URL missing");

  const url = joinUrl(baseUrl, "/image");

  const out = await fetchJsonWithRetry(
    url,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ prompt: p }),
      signal,
    },
    { timeoutMs: 60_000, retries: 2, tag: "image" }
  );

  const data: any = out.data;

  if (!out.ok) {
    const errMsg =
      clean(data?.error) ||
      clean(data?.message) ||
      clean(out.textBody) ||
      `Image generation failed (${out.status})`;
    throw new Error(errMsg);
  }

  const urlRaw = clean(data?.url);
  const imgUrl = normalizeImageUrl(urlRaw);
  if (!imgUrl) throw new Error("No image URL returned");
  return imgUrl;
}

/**
 * Transcribe: RN FormData upload
 */
export async function transcribeZetraAudio(
  uri: string,
  mimeType?: string,
  signal?: AbortSignal
): Promise<string> {
  const u = clean(uri);
  if (!u) throw new Error("Missing audio uri");

  const baseUrl = getBaseUrl();
  if (!baseUrl) throw new Error("AI Worker URL missing");

  const url = joinUrl(baseUrl, "/transcribe");

  const form = new FormData();
  form.append(
    "file",
    {
      uri: u,
      name: "voice.m4a",
      type: clean(mimeType) || "audio/mp4",
    } as any
  );

  const out = await fetchJsonWithRetry(
    url,
    {
      method: "POST",
      body: form,
      signal,
    },
    { timeoutMs: 60_000, retries: 2, tag: "transcribe" }
  );

  const data: any = out.data;

  if (!out.ok) {
    const errMsg =
      clean(data?.error) ||
      clean(data?.message) ||
      clean(out.textBody) ||
      `Transcription failed (${out.status})`;
    throw new Error(errMsg);
  }

  const text = clean(data?.text);
  if (!text) throw new Error("No text returned");
  return text;
}

export async function clearConversationMemoryForOrg(orgId?: string | null) {
  const key = clean(orgId || "") || "global";
  conversationStore.delete(key);
  hydratedKeys.delete(key);
  await kv.setJson(kv.aiMemoryKey(key), null);
}

export async function clearZetraAIMemoryForOrg(orgKey?: string | null) {
  return clearConversationMemoryForOrg(orgKey);
}