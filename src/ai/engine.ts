// src/ai/engine.ts
export type AiMode = "AUTO" | "SW" | "EN";

export type ChatHistoryItem = {
  role: "user" | "assistant";
  text: string;
};

export type GenerateReplyArgs = {
  text: string;
  mode: AiMode;
  context?: Record<string, any>;
  history?: ChatHistoryItem[];
};

function clean(s: any) {
  return String(s ?? "").trim();
}

function safeClip(s: string, max = 900) {
  const t = clean(s);
  if (!t) return "";
  return t.length > max ? t.slice(0, max) + "…" : t;
}

const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);
const DEFAULT_TIMEOUT_MS = 25_000;
const DEFAULT_RETRIES = 2;

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

async function fetchJsonWithRetry(
  url: string,
  init: RequestInit,
  opts?: { timeoutMs?: number; retries?: number; tag?: string }
): Promise<{ status: number; ok: boolean; data: any | null; textBody: string }> {
  const timeoutMs = Math.max(2_000, Number(opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS));
  const retries = Math.max(0, Math.min(5, Number(opts?.retries ?? DEFAULT_RETRIES)));
  const tag = clean(opts?.tag) || "request";

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(url, { ...init, signal: controller.signal });
      clearTimeout(t);

      const { json, text } = await readJsonOrText(res);

      if (res.ok) {
        return { status: res.status, ok: true, data: json ?? (clean(text) ? { raw: text } : null), textBody: text };
      }

      const bodyStr = clean(json?.error) || clean(json?.message) || safeClip(text);
      const shouldRetry = RETRYABLE_STATUS.has(res.status);

      if (!shouldRetry || attempt >= retries) {
        return { status: res.status, ok: false, data: json, textBody: bodyStr || text };
      }

      await sleep(350 * (attempt + 1));
      continue;
    } catch (e: any) {
      clearTimeout(t);

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
          ? `${tag} timeout after ${Math.round(timeoutMs / 1000)}s`
          : clean(e?.message) || `${tag} failed`;
        return { status: 0, ok: false, data: null, textBody: msg };
      }

      await sleep(350 * (attempt + 1));
      continue;
    }
  }

  return { status: 0, ok: false, data: null, textBody: "request failed" };
}

function getWorkerBaseUrl() {
  // Must match app/ai/index.tsx usage:
  return clean(process.env.EXPO_PUBLIC_AI_WORKER_URL ?? "");
}

/**
 * Calls Cloudflare Worker: POST {BASE}/v1/chat
 * Expected response: { ok: true, reply: string, meta?: any } OR { ok:false, error:string }
 */
export async function generateReply(args: GenerateReplyArgs): Promise<string> {
  const base = getWorkerBaseUrl();
  if (!base) {
    throw new Error("AI Worker URL missing: set EXPO_PUBLIC_AI_WORKER_URL then restart Metro.");
  }

  const text = clean(args.text);
  const mode = args.mode ?? "AUTO";
  const history = Array.isArray(args.history) ? args.history : [];
  const context = args.context ?? {};

  if (!text) return "Tafadhali andika swali.";

  const payload = {
    text,
    mode,
    history,
    context,
  };

  const url = `${base}/v1/chat`;

  const out = await fetchJsonWithRetry(
    url,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
    { timeoutMs: DEFAULT_TIMEOUT_MS, retries: DEFAULT_RETRIES, tag: "chat" }
  );

  const data = out.data;

  if (!out.ok) {
    const body = clean(data?.error) || clean(data?.message) || clean(out.textBody);
    throw new Error(body ? `Chat request failed (${out.status})\n${safeClip(body)}` : `Chat request failed (${out.status})`);
  }

  if (!data?.ok) {
    const errMsg = clean(data?.error) || "Chat failed";
    throw new Error(errMsg);
  }

  const reply = clean(data?.reply);
  if (!reply) throw new Error(`Unexpected AI response: ${safeClip(JSON.stringify(data))}`);

  return reply;
}