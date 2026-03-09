export interface Env {
  OPENAI_API_KEY: string;

  // Chat + classifier
  OPENAI_MODEL?: string; // e.g. "gpt-4o-mini"
  OPENAI_CLASSIFIER_MODEL?: string; // e.g. "gpt-4o-mini"

  // Vision / Image / Transcribe (optional overrides)
  OPENAI_VISION_MODEL?: string; // e.g. "gpt-4o-mini"
  OPENAI_IMAGE_MODEL?: string; // e.g. "gpt-image-1" or "dall-e-3"
  OPENAI_TRANSCRIBE_MODEL?: string; // e.g. "whisper-1"

  // Image options
  OPENAI_IMAGE_SIZE?: string; // e.g. "1024x1024"
}

type ReqMsg = { role: "user" | "assistant"; text: string };

type AiRoleKey =
  | "ZETRA_BMS"
  | "ENGINEERING"
  | "MATH"
  | "HEALTH"
  | "LEGAL"
  | "FINANCE"
  | "MARKETING"
  | "GENERAL";

type ReqBody = {
  text?: string;
  mode?: "AUTO" | "SW" | "EN";
  locale?: string;
  language?: any; // passthrough
  roleHint?: "AUTO" | AiRoleKey;

  context?: {
    orgId?: string | null;
    activeOrgId?: string | null;
    activeOrgName?: string | null;
    activeStoreId?: string | null;
    activeStoreName?: string | null;
    activeRole?: string | null;
    [k: string]: unknown;
  };

  history?: ReqMsg[];
};

type VisionBody = {
  message?: string;
  images?: string[]; // data urls or http urls
  meta?: {
    mode?: "AUTO" | "SW" | "EN";
    locale?: string;
    history?: ReqMsg[];
    language?: any;
    context?: ReqBody["context"];
    roleHint?: "AUTO" | AiRoleKey;
  };
};

function clean(x: unknown) {
  return String(x ?? "").trim();
}

function safeSlice(s: string, n: number) {
  const t = clean(s);
  return t.length <= n ? t : t.slice(0, n);
}

function json(data: unknown, init: ResponseInit = {}) {
  const h = new Headers(init.headers);
  h.set("Content-Type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(data), { ...init, headers: h });
}

function corsHeaders(origin: string | null) {
  return {
    "Access-Control-Allow-Origin": origin ?? "*",
    "Access-Control-Allow-Headers": "content-type, authorization",
    "Access-Control-Allow-Methods": "POST, OPTIONS, GET",
  };
}

function withCors(resp: Response, origin: string | null) {
  const h = new Headers(resp.headers);
  const c = corsHeaders(origin);
  for (const [k, v] of Object.entries(c)) h.set(k, v);
  return new Response(resp.body, { status: resp.status, headers: h });
}

/**
 * mode is a hint:
 * - SW/EN => force reply fully in that language
 * - AUTO => reply in user's language(s)
 */
function pickLang(mode?: "AUTO" | "SW" | "EN") {
  if (mode === "SW") return "sw" as const;
  if (mode === "EN") return "en" as const;
  return "auto" as const;
}

function normalizeRoleHint(x: any): AiRoleKey | null {
  const v = clean(x).toUpperCase();
  if (!v || v === "AUTO") return null;
  const ok: Record<string, AiRoleKey> = {
    ZETRA_BMS: "ZETRA_BMS",
    ENGINEERING: "ENGINEERING",
    MATH: "MATH",
    HEALTH: "HEALTH",
    LEGAL: "LEGAL",
    FINANCE: "FINANCE",
    MARKETING: "MARKETING",
    GENERAL: "GENERAL",
  };
  return ok[v] ?? null;
}

function normalizeUserRole(x: any) {
  return clean(x).toLowerCase();
}

function ownerOnlyError(origin: string | null) {
  return withCors(
    json(
      {
        ok: false,
        error: "AI is available only for organization owner.",
        code: "OWNER_ONLY_AI",
      },
      { status: 403 }
    ),
    origin
  );
}

function ensureOwnerRole(roleRaw: any) {
  return normalizeUserRole(roleRaw) === "owner";
}

function buildRoleInstructions(role: AiRoleKey) {
  if (role === "ENGINEERING") {
    return `
ROLE: ENGINEERING (Senior Engineer)
- Be precise, technical, and structured.
- Prefer step-by-step debugging, root-cause analysis, and safe fixes.
- Ask for the exact error/log if missing.
- Provide code examples only when needed.
`.trim();
  }

  if (role === "MATH") {
    return `
ROLE: MATH (Mathematics Tutor)
- Explain clearly with correct steps.
- Define variables, show working, then final answer.
- If information is missing, ask the minimum needed.
`.trim();
  }

  if (role === "HEALTH") {
    return `
ROLE: HEALTH (General Health Information)
- Provide general health information only (not diagnosis or prescription).
- Encourage seeking a qualified clinician for urgent/severe symptoms.
- Keep it practical: what it could mean, safe next steps, red flags.
- Avoid overly graphic details.
`.trim();
  }

  if (role === "LEGAL") {
    return `
ROLE: LEGAL (General Legal Information)
- Provide general legal info and best practices (not legal advice).
- Ask jurisdiction if needed, but still give general guidance.
- Be structured: risks, options, documentation.
`.trim();
  }

  if (role === "FINANCE") {
    return `
ROLE: FINANCE (Finance & Accounting Advisor)
- Give practical finance guidance: budgeting, cashflow, pricing, margins, bookkeeping.
- Use clear assumptions; if numbers missing, ask for key inputs.
`.trim();
  }

  if (role === "MARKETING") {
    return `
ROLE: MARKETING (Marketing Strategist)
- Give actionable marketing plans, creatives, targeting, and measurement.
- Focus on conversion, retention, and brand positioning.
`.trim();
  }

  if (role === "ZETRA_BMS") {
    return `
ROLE: ZETRA_BMS (ZETRA Product Coach)
- Guide user inside ZETRA BMS step-by-step.
- Ask which screen/module they are on if unclear.
- Provide clear workflows and safe operations.
`.trim();
  }

  return `
ROLE: GENERAL (Helpful Assistant)
- Be helpful, structured, and practical.
- If uncertain, ask a short clarification.
`.trim();
}

function buildZetraInstructions(lang: "sw" | "en" | "auto", role: AiRoleKey) {
  const langLine =
    lang === "sw"
      ? "Respond fully in Kiswahili."
      : lang === "en"
      ? "Respond fully in English."
      : "Respond in the same language(s) used by the user (AUTO). If the user mixes languages, you may mix too.";

  const globalLanguagePolicy = `
GLOBAL LANGUAGE POLICY (CRITICAL):
- You support ALL human languages (worldwide).
- NEVER claim you only speak one language.
- AUTO mode: reply in the same language(s) the user used.
- If user explicitly requests a reply language, follow it.
`.trim();

  const safetyPolicy = `
SAFETY (CRITICAL):
- Do not provide instructions for self-harm, suicide, violence, or illegal wrongdoing.
- For health topics: general info only; encourage professional help for urgent/severe symptoms.
- Never reveal secrets, API keys, or private data.
`.trim();

  const stopConversationPolicy = `
STOP / CLOSING BEHAVIOR (CRITICAL):
- If the user indicates they are done / have no question / don't need help now (e.g. "hapana sina swali", "kwa leo sitaki kitu", "sawa mkuu", "nipo sawa", "bye", "no thanks"):
  - Reply with ONE short acknowledgement only.
  - Do NOT ask follow-up questions like "unahitaji msaada mwingine?".
  - Do NOT suggest other topics.
  - Example (SW): "Sawa mkuu. Nipo hapa ukihitaji."
  - Example (EN): "All good. I'm here whenever you need me."
`.trim();

  const roleBlock = buildRoleInstructions(role);

  return `
You are ZETRA AI — Elite Multi-Role Intelligence System.

CORE BEHAVIOR:
- Be natural and adaptive.
- Be detailed when needed, concise when appropriate.
- Suggest next steps only if helpful or when user is solving something.
- Do NOT force structured templates.

LANGUAGE:
${langLine}

${globalLanguagePolicy}

${safetyPolicy}

${stopConversationPolicy}

${roleBlock}
`.trim();
}

function extractChatCompletionText(data: any): string {
  return clean(data?.choices?.[0]?.message?.content);
}

function extractOpenAiErrorMessage(parsed: any, raw: string) {
  const msg = clean(parsed?.error?.message) || clean(parsed?.message) || clean(parsed?.error) || "";
  return msg || safeSlice(raw, 600);
}

function isAbortOrTimeoutError(e: any) {
  const name = clean(e?.name).toLowerCase();
  const msg = clean(e?.message).toLowerCase();
  return name.includes("abort") || msg.includes("aborted") || msg.includes("timeout");
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), Math.max(2000, timeoutMs));
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(t);
  }
}

async function readJsonSafe(res: Response): Promise<{ ok: boolean; parsed: any; raw: string }> {
  const raw = await res.text();
  try {
    const parsed = raw ? JSON.parse(raw) : null;
    return { ok: true, parsed, raw };
  } catch {
    return { ok: false, parsed: null, raw };
  }
}

function buildCtxLines(ctx: ReqBody["context"]) {
  const c = ctx ?? {};
  const orgId = clean(c.orgId ?? c.activeOrgId);
  const orgName = clean(c.activeOrgName);
  const storeName = clean(c.activeStoreName);
  const role = clean(c.activeRole);

  const lines: string[] = [];
  if (orgId) lines.push(`orgId: ${orgId}`);
  if (orgName) lines.push(`orgName: ${orgName}`);
  if (storeName) lines.push(`activeStoreName: ${storeName}`);
  if (role) lines.push(`activeRole: ${role}`);

  return lines;
}

function normalizeHistory(history?: ReqMsg[]) {
  const h = Array.isArray(history) ? history : [];
  const out: Array<{ role: "user" | "assistant"; content: string }> = [];
  for (const m of h) {
    const r = m?.role === "assistant" ? "assistant" : "user";
    const t = clean(m?.text);
    if (!t) continue;
    out.push({ role: r, content: t });
  }
  return out.slice(-20);
}

function heuristicRole(text: string, ctx: ReqBody["context"]): AiRoleKey {
  const t = clean(text).toLowerCase();
  const hasOrg = !!clean(ctx?.orgId ?? ctx?.activeOrgId);

  const mathHit =
    /\b(percentage|percent|asilimia|equation|integral|derivative|algebra|trigon|calculus|hesabu|suluhisha)\b/.test(t) ||
    /[\d]+\s*[%]/.test(t);

  const healthHit = /\b(headache|kizunguzungu|maumivu|homa|fever|pain|dizzy|nausea|dalili|clinic|hospital)\b/.test(t);

  const legalHit = /\b(contract|agreement|law|legal|sheria|kesi|court|lawsuit|breach|terms)\b/.test(t);

  const financeHit = /\b(profit|margin|cashflow|budget|faida|hasara|bei|gharama|mtaji|mapato|expense)\b/.test(t);

  const marketingHit = /\b(marketing|campaign|instagram|tiktok|ads|branding|wateja|mauzo|promotion|promo)\b/.test(t);

  const engHit =
    /\b(error|bug|crash|expo|router|supabase|sql|typescript|react|api|deploy|build|logs|worker|wrangler)\b/.test(t);

  const bmsHit =
    /\b(zetra|bms|dashboard|home|screen|skrini|module|moduli|tab|sales|mauzo|stock|inventory|bidhaa|product|products|store|duka|stores|pricing|bei|reports|report|transfer|movement|closing|lock|tasks|staff|admin|owner|org|organization|settings|profile)\b/.test(
      t
    );

  if (mathHit) return "MATH";
  if (healthHit) return "HEALTH";
  if (legalHit) return "LEGAL";
  if (financeHit) return "FINANCE";
  if (marketingHit) return "MARKETING";
  if (engHit) return "ENGINEERING";

  if (hasOrg && bmsHit) return "ZETRA_BMS";
  return "GENERAL";
}

function isClosingMessage(raw: string) {
  const t = clean(raw).toLowerCase();
  if (!t) return false;

  if (
    /^(sawa|poa|ok(ay)?|asante|thank(s)?)(\s+(mkuu|boss|bro|dad|sir))?[\s.!]*$/.test(t) ||
    /^(bye|goodbye|see you|ttyl|later)[\s.!]*$/.test(t)
  )
    return true;

  if (
    /\b(hapana\s+sina\s+swali|sina\s+swali|sihitaji\s+kitu|kwa\s+leo\s+sihitaji|kwa\s+leo\s+sitaki\s+kitu|siitaji\s+msaada|sipo\s+tayari|nipo\s+sawa|ni\s+sawa)\b/.test(
      t
    )
  )
    return true;

  if (/\b(no\s+question|no\s+questions|no\s+thanks|i'?m\s+good|i\s+am\s+good|nothing\s+else|not\s+now)\b/.test(t))
    return true;

  return false;
}

function closingReply(lang: "sw" | "en" | "auto") {
  if (lang === "en") return "All good. I’m here whenever you need me.";
  return "Sawa mkuu. Nipo hapa ukihitaji.";
}

async function classifyRole(
  env: Env,
  text: string,
  ctxLines: string[],
  history: Array<{ role: "user" | "assistant"; content: string }>,
  timeoutMs = 18_000
): Promise<{ role: AiRoleKey; confidence: number; reason: string }> {
  const OPENAI_API_KEY = clean(env.OPENAI_API_KEY);
  const model = clean(env.OPENAI_CLASSIFIER_MODEL) || "gpt-4o-mini";

  if (!OPENAI_API_KEY) return { role: "GENERAL", confidence: 0, reason: "missing_api_key" };

  const sys = `
You are a strict JSON classifier for routing user requests to a role.

Return ONLY valid minified JSON (no markdown) in shape:
{"role":"ENGINEERING|MATH|HEALTH|LEGAL|FINANCE|MARKETING|ZETRA_BMS|GENERAL","confidence":0-1,"reason":"short"}

Rules:
- ENGINEERING for software/app/dev/debugging/logs/errors.
- MATH for calculations/steps.
- HEALTH for symptoms/health questions (general info only).
- LEGAL for law/contract/compliance.
- FINANCE for accounting/pricing/margins/budgeting.
- MARKETING for ads/campaigns/branding/strategy.
- ZETRA_BMS when user asks how to do something inside ZETRA BMS.
- Otherwise GENERAL.
- Confidence 0..1, reason <= 10 words.
`.trim();

  const ctxBlock = ctxLines.length ? `Context:\n- ${ctxLines.join("\n- ")}` : "Context: (none)";
  const histBlock = history.length
    ? `Recent history:\n${history
        .slice(-6)
        .map((m) => `${m.role.toUpperCase()}: ${safeSlice(m.content, 240)}`)
        .join("\n")}`
    : "Recent history: (none)";

  const user = `${ctxBlock}\n\n${histBlock}\n\nUser message:\n${text}`.trim();

  const body = {
    model,
    messages: [
      { role: "system", content: sys },
      { role: "user", content: user },
    ],
    temperature: 0.1,
    max_tokens: 120,
  };

  const url = "https://api.openai.com/v1/chat/completions";
  const res = await fetchWithTimeout(
    url,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
    timeoutMs
  );

  const { parsed, raw } = await readJsonSafe(res);
  if (!res.ok) {
    const msg = extractOpenAiErrorMessage(parsed, raw);
    return { role: "GENERAL", confidence: 0, reason: `classifier_http_${res.status}:${safeSlice(msg, 60)}` };
  }

  const txt = extractChatCompletionText(parsed);
  const j = safeSlice(txt, 400);
  try {
    const out = JSON.parse(j);
    const r = clean(out?.role).toUpperCase();
    const ok: Record<string, AiRoleKey> = {
      ZETRA_BMS: "ZETRA_BMS",
      ENGINEERING: "ENGINEERING",
      MATH: "MATH",
      HEALTH: "HEALTH",
      LEGAL: "LEGAL",
      FINANCE: "FINANCE",
      MARKETING: "MARKETING",
      GENERAL: "GENERAL",
    };
    const role = ok[r] ?? "GENERAL";
    const confidence = Math.max(0, Math.min(1, Number(out?.confidence ?? 0)));
    const reason = safeSlice(clean(out?.reason) || "ok", 60);
    return { role, confidence, reason };
  } catch {
    return { role: "GENERAL", confidence: 0.2, reason: "classifier_parse_failed" };
  }
}

async function openaiChatCompletions(
  env: Env,
  messages: Array<{ role: "system" | "user" | "assistant"; content: any }>,
  timeoutMs = 32_000
) {
  const OPENAI_API_KEY = clean(env.OPENAI_API_KEY);
  const model = clean(env.OPENAI_MODEL) || "gpt-4o-mini";
  if (!OPENAI_API_KEY) {
    return { ok: false as const, status: 500, text: "", error: "Missing OPENAI_API_KEY" };
  }

  const body = {
    model,
    messages,
    temperature: 0.4,
    max_tokens: 1200,
  };

  const url = "https://api.openai.com/v1/chat/completions";
  const res = await fetchWithTimeout(
    url,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
    timeoutMs
  );

  const { parsed, raw } = await readJsonSafe(res);
  if (!res.ok) {
    const msg = extractOpenAiErrorMessage(parsed, raw);
    return { ok: false as const, status: res.status, text: "", error: msg };
  }

  const text = extractChatCompletionText(parsed);
  return { ok: true as const, status: 200, text, error: "" };
}

function buildMessages(
  sys: string,
  ctxLines: string[],
  history: Array<{ role: "user" | "assistant"; content: string }>,
  userText: string
) {
  const ctxBlock = ctxLines.length ? `Context:\n- ${ctxLines.join("\n- ")}` : "";
  const msgs: Array<{ role: "system" | "user" | "assistant"; content: any }> = [];
  msgs.push({ role: "system", content: sys });
  if (ctxBlock) msgs.push({ role: "system", content: ctxBlock });
  for (const m of history) msgs.push({ role: m.role, content: m.content });
  msgs.push({ role: "user", content: userText });
  return msgs;
}

function buildVisionMessages(
  sys: string,
  ctxLines: string[],
  history: Array<{ role: "user" | "assistant"; content: string }>,
  userText: string,
  images: string[]
) {
  const ctxBlock = ctxLines.length ? `Context:\n- ${ctxLines.join("\n- ")}` : "";
  const msgs: Array<{ role: "system" | "user" | "assistant"; content: any }> = [];
  msgs.push({ role: "system", content: sys });
  if (ctxBlock) msgs.push({ role: "system", content: ctxBlock });

  for (const m of history) {
    msgs.push({ role: m.role, content: m.content });
  }

  const content: any[] = [];
  if (clean(userText)) content.push({ type: "text", text: userText });

  for (const img of images) {
    const u = clean(img);
    if (!u) continue;
    content.push({ type: "image_url", image_url: { url: u } });
  }

  msgs.push({ role: "user", content });
  return msgs;
}

async function openaiImageGenerate(env: Env, prompt: string, timeoutMs = 60_000) {
  const OPENAI_API_KEY = clean(env.OPENAI_API_KEY);
  if (!OPENAI_API_KEY) return { ok: false as const, status: 500, url: "", error: "Missing OPENAI_API_KEY" };

  const model = clean(env.OPENAI_IMAGE_MODEL) || "gpt-image-1";
  const size = clean(env.OPENAI_IMAGE_SIZE) || "1024x1024";

  const body: any = {
    model,
    prompt,
    size,
    response_format: "b64_json",
  };

  const url = "https://api.openai.com/v1/images/generations";
  const res = await fetchWithTimeout(
    url,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
    timeoutMs
  );

  const { parsed, raw } = await readJsonSafe(res);
  if (!res.ok) {
    const msg = extractOpenAiErrorMessage(parsed, raw);
    return { ok: false as const, status: res.status, url: "", error: msg };
  }

  const b64 = clean(parsed?.data?.[0]?.b64_json);
  if (b64) {
    const dataUrl = `data:image/png;base64,${b64}`;
    return { ok: true as const, status: 200, url: dataUrl, error: "" };
  }

  const u = clean(parsed?.data?.[0]?.url);
  if (u) return { ok: true as const, status: 200, url: u, error: "" };

  return { ok: false as const, status: 500, url: "", error: "No image returned" };
}

async function openaiTranscribe(env: Env, file: File, timeoutMs = 55_000) {
  const OPENAI_API_KEY = clean(env.OPENAI_API_KEY);
  if (!OPENAI_API_KEY) return { ok: false as const, status: 500, text: "", error: "Missing OPENAI_API_KEY" };

  const model = clean(env.OPENAI_TRANSCRIBE_MODEL) || "whisper-1";

  const form = new FormData();
  form.append("model", model);
  form.append("file", file, file.name || "audio.m4a");

  const url = "https://api.openai.com/v1/audio/transcriptions";
  const res = await fetchWithTimeout(
    url,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: form as any,
    },
    timeoutMs
  );

  const { parsed, raw } = await readJsonSafe(res);
  if (!res.ok) {
    const msg = extractOpenAiErrorMessage(parsed, raw);
    return { ok: false as const, status: res.status, text: "", error: msg };
  }

  const text = clean(parsed?.text);
  if (!text) return { ok: false as const, status: 500, text: "", error: "No transcription text returned" };
  return { ok: true as const, status: 200, text, error: "" };
}

async function resolveRole(
  env: Env,
  text: string,
  ctx: ReqBody["context"],
  ctxLines: string[],
  history: Array<{ role: "user" | "assistant"; content: string }>,
  roleHintRaw: any
): Promise<{ role: AiRoleKey; roleMeta: any }> {
  const roleHint = normalizeRoleHint(roleHintRaw);
  if (roleHint) {
    return { role: roleHint, roleMeta: { source: "roleHint", confidence: 1, reason: "app_override" } };
  }

  try {
    const classified = await classifyRole(env, text, ctxLines, history);
    let role = classified.role;
    let roleMeta: any = { source: "classifier", confidence: classified.confidence, reason: classified.reason };

    if (classified.confidence < 0.45) {
      role = heuristicRole(text, ctx);
      roleMeta = { source: "heuristic", confidence: 0.45, reason: "low_confidence_classifier" };
    }

    return { role, roleMeta };
  } catch (e: any) {
    const role = heuristicRole(text, ctx);
    return {
      role,
      roleMeta: {
        source: "heuristic",
        confidence: 0.35,
        reason: isAbortOrTimeoutError(e) ? "classifier_timeout" : "classifier_error",
      },
    };
  }
}

function getPath(request: Request) {
  try {
    const u = new URL(request.url);
    return u.pathname || "/";
  } catch {
    return "/";
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get("Origin");
    const path = getPath(request);

    if (request.method === "OPTIONS") {
      return withCors(new Response(null, { status: 204, headers: corsHeaders(origin) }), origin);
    }

    if (request.method === "GET") {
      if (path === "/" || path === "/health") {
        return withCors(
          json({
            ok: true,
            service: "zetra-ai-worker",
            version: "stable-full-v1",
            time: new Date().toISOString(),
          }),
          origin
        );
      }

      return withCors(json({ ok: false, error: "Not found" }, { status: 404 }), origin);
    }

    if (request.method !== "POST") {
      return withCors(json({ ok: false, error: "Method not allowed" }, { status: 405 }), origin);
    }

    // ----------------------------
    // (1) CHAT: /v1/chat (and backward compatible POST /)
    // ----------------------------
    if (path === "/v1/chat" || path === "/") {
      let body: ReqBody | null = null;
      try {
        body = (await request.json()) as ReqBody;
      } catch {
        return withCors(json({ ok: false, error: "Invalid JSON body" }, { status: 400 }), origin);
      }

      if (!ensureOwnerRole(body?.context?.activeRole)) {
        return ownerOnlyError(origin);
      }

      const text = clean(body?.text);
      if (!text) return withCors(json({ ok: false, error: "Missing text" }, { status: 400 }), origin);

      const mode = body?.mode ?? "AUTO";
      const lang = pickLang(mode);

      if (isClosingMessage(text)) {
        return withCors(
          json({
            ok: true,
            reply: closingReply(lang),
            meta: {
              role: "GENERAL",
              roleMeta: { source: "closing_guard", confidence: 1, reason: "user_closed" },
              mode,
              locale: body?.locale ?? null,
              language: body?.language ?? null,
            },
          }),
          origin
        );
      }

      const ctx = body?.context ?? {};
      const ctxLines = buildCtxLines(ctx);
      const history = normalizeHistory(body?.history);

      const rr = await resolveRole(env, text, ctx, ctxLines, history, body?.roleHint);
      const role = rr.role;
      const roleMeta = rr.roleMeta;

      const sys = buildZetraInstructions(lang, role);
      const messages = buildMessages(sys, ctxLines, history, text);

      let out = await openaiChatCompletions(env, messages, 32_000);
      if (!out.ok && /timeout|aborted/i.test(out.error)) out = await openaiChatCompletions(env, messages, 36_000);

      if (!out.ok) {
        return withCors(
          json(
            {
              ok: false,
              error: out.error || "OpenAI error",
              meta: { role, roleMeta },
            },
            { status: out.status || 500 }
          ),
          origin
        );
      }

      return withCors(
        json({
          ok: true,
          reply: out.text || "",
          meta: {
            role,
            roleMeta,
            mode,
            locale: body?.locale ?? null,
            language: body?.language ?? null,
          },
        }),
        origin
      );
    }

    // ----------------------------
    // (2) VISION: /vision
    // ----------------------------
    if (path === "/vision") {
      let body: VisionBody | null = null;
      try {
        body = (await request.json()) as VisionBody;
      } catch {
        return withCors(json({ ok: false, error: "Invalid JSON body" }, { status: 400 }), origin);
      }

      if (!ensureOwnerRole(body?.meta?.context?.activeRole)) {
        return ownerOnlyError(origin);
      }

      const message = clean(body?.message);
      const images = Array.isArray(body?.images) ? body!.images!.map((x) => clean(x)).filter(Boolean) : [];
      const meta = body?.meta ?? {};
      const mode = meta?.mode ?? "AUTO";
      const lang = pickLang(mode);

      if (!message && images.length === 0) {
        return withCors(json({ ok: false, error: "Missing message/images" }, { status: 400 }), origin);
      }

      if (message && images.length === 0 && isClosingMessage(message)) {
        return withCors(
          json({
            ok: true,
            reply: closingReply(lang),
            meta: {
              role: "GENERAL",
              roleMeta: { source: "closing_guard", confidence: 1, reason: "user_closed" },
              mode,
              locale: meta?.locale ?? null,
              language: meta?.language ?? null,
            },
          }),
          origin
        );
      }

      const ctx = meta?.context ?? {};
      const ctxLines = buildCtxLines(ctx);
      const history = normalizeHistory(meta?.history);

      const rr = await resolveRole(env, message || "(vision)", ctx, ctxLines, history, meta?.roleHint);
      const role = rr.role;
      const roleMeta = rr.roleMeta;

      const sys = buildZetraInstructions(lang, role);
      const visionModel = clean(env.OPENAI_VISION_MODEL) || clean(env.OPENAI_MODEL) || "gpt-4o-mini";

      const messages = buildVisionMessages(sys, ctxLines, history, message, images);

      const OPENAI_API_KEY = clean(env.OPENAI_API_KEY);
      if (!OPENAI_API_KEY) {
        return withCors(json({ ok: false, error: "Missing OPENAI_API_KEY" }, { status: 500 }), origin);
      }

      const bodyOut = {
        model: visionModel,
        messages,
        temperature: 0.4,
        max_tokens: 1200,
      };

      const url = "https://api.openai.com/v1/chat/completions";
      const res = await fetchWithTimeout(
        url,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${OPENAI_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(bodyOut),
        },
        42_000
      );

      const { parsed, raw } = await readJsonSafe(res);
      if (!res.ok) {
        const msg = extractOpenAiErrorMessage(parsed, raw);
        return withCors(
          json({ ok: false, error: msg, meta: { role, roleMeta } }, { status: res.status || 500 }),
          origin
        );
      }

      const reply = extractChatCompletionText(parsed) || "";
      return withCors(
        json({
          ok: true,
          reply,
          meta: {
            role,
            roleMeta,
            mode,
            locale: meta?.locale ?? null,
            language: meta?.language ?? null,
          },
        }),
        origin
      );
    }

    // ----------------------------
    // (3) IMAGE: /image
    // ----------------------------
    if (path === "/image") {
      let body: any = null;
      try {
        body = await request.json();
      } catch {
        return withCors(json({ ok: false, error: "Invalid JSON body" }, { status: 400 }), origin);
      }

      if (!ensureOwnerRole(body?.context?.activeRole ?? body?.activeRole)) {
        return ownerOnlyError(origin);
      }

      const prompt = clean(body?.prompt);
      if (!prompt) return withCors(json({ ok: false, error: "Missing prompt" }, { status: 400 }), origin);

      const out = await openaiImageGenerate(env, prompt, 70_000);
      if (!out.ok) {
        return withCors(json({ ok: false, error: out.error }, { status: out.status || 500 }), origin);
      }

      return withCors(json({ ok: true, url: out.url }), origin);
    }

    // ----------------------------
    // (4) TRANSCRIBE: /transcribe
    // ----------------------------
    if (path === "/transcribe") {
      const roleHeader = request.headers.get("x-zetra-role");
      if (!ensureOwnerRole(roleHeader)) {
        return ownerOnlyError(origin);
      }

      let form: FormData | null = null;
      try {
        form = await request.formData();
      } catch {
        return withCors(json({ ok: false, error: "Expected multipart/form-data" }, { status: 400 }), origin);
      }

      const f = form.get("file");
      if (!f || !(f instanceof File)) {
        return withCors(json({ ok: false, error: "Missing file" }, { status: 400 }), origin);
      }

      const maxBytes = 16 * 1024 * 1024; // 16MB
      if ((f as File).size > maxBytes) {
        return withCors(json({ ok: false, error: "Audio too large (max 16MB)" }, { status: 413 }), origin);
      }

      const out = await openaiTranscribe(env, f as File, 60_000);
      if (!out.ok) {
        return withCors(json({ ok: false, error: out.error }, { status: out.status || 500 }), origin);
      }

      return withCors(json({ ok: true, text: out.text }), origin);
    }

    return withCors(json({ ok: false, error: "Not found" }, { status: 404 }), origin);
  },
};