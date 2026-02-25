// src/services/ai.ts
import { kv } from "@/src/storage/kv";
import { supabase } from "@/src/supabaseClient";

type AiMode = "AUTO" | "SW" | "EN";

export type ChatHistoryMsg = { role: "user" | "assistant"; text: string };

export type ModelHint =
  | "gpt-4o"
  | "gpt-4o-mini"
  | "gpt-4.1"
  | "gpt-4.1-mini"
  | string;

export type ReasoningTier = "FAST" | "BALANCED" | "DEEP";

export type AskOpts = {
  mode?: AiMode;
  history?: ChatHistoryMsg[];
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

function joinUrl(base: string, path: string) {
  const b = clean(base).replace(/\/+$/, "");
  const p = clean(path).startsWith("/") ? clean(path) : `/${clean(path)}`;
  return `${b}${p}`;
}

async function safeReadJson(res: Response): Promise<any | null> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

async function safeReadText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "";
  }
}

export async function askZetraAI(message: string, opts?: AskOpts): Promise<string> {
  const meta = await askZetraAIWithMeta(message, opts);
  return meta.text;
}

export async function askZetraAIWithMeta(message: string, opts?: AskOpts): Promise<AiMeta> {
  const text = clean(message);
  if (!text) throw new Error("Empty message");
  if (text.length > MAX_CHARS) throw new Error(`Message too long (limit ${MAX_CHARS.toLocaleString()} chars)`);

  const key = getConversationKey(opts);
  await ensureHydrated(key);

  const baseUrl = (process.env.EXPO_PUBLIC_AI_WORKER_URL as string | undefined) || DEFAULT_AI_URL;
  const url = joinUrl(baseUrl, "/v1/chat");

  const controller = new AbortController();
  const timeoutMs = 45_000;
  const t = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        text,
        mode: opts?.mode ?? "AUTO",
        context: opts?.context ?? null,
        history: Array.isArray(opts?.history) ? opts!.history! : [],
        modelHint: opts?.modelHint,
        reasoningTier: opts?.reasoningTier,
      }),
      signal: controller.signal,
    });

    const data = await safeReadJson(res);

    if (!res.ok) {
      const fallbackText = data ? "" : safeSlice(await safeReadText(res), 700);
      const errMsg =
        clean(data?.error) ||
        clean(data?.message) ||
        clean(data?.details) ||
        (fallbackText ? fallbackText : `AI request failed (${res.status})`);
      throw new Error(`${errMsg}${res.status ? ` [${res.status}]` : ""}`);
    }

    const raw = clean(data?.reply) || clean(data?.text);
    if (!raw) throw new Error("AI returned empty reply");

    const meta = parseZetraOutput(raw);

    updateMemoryAfterReply(opts, meta);
    void saveAiActionsToTasks(opts, meta.actions ?? []);

    return meta;
  } catch (e: any) {
    if (e?.name === "AbortError") {
      throw new Error("AI timeout — jaribu tena (mtandao au server inachelewa).");
    }
    throw e;
  } finally {
    clearTimeout(t);
  }
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
