export interface Env {
  OPENAI_API_KEY: string;
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;

  // Chat + classifier
  OPENAI_MODEL?: string;
  OPENAI_CLASSIFIER_MODEL?: string;

  // Vision / Image / Transcribe
  OPENAI_VISION_MODEL?: string;
  OPENAI_IMAGE_MODEL?: string;
  OPENAI_TRANSCRIBE_MODEL?: string;

  // Image options
  OPENAI_IMAGE_SIZE?: string;
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
  language?: any;
  roleHint?: "AUTO" | AiRoleKey;
  systemPrompt?: string;
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
  images?: string[];
  meta?: {
    mode?: "AUTO" | "SW" | "EN";
    locale?: string;
    history?: ReqMsg[];
    language?: any;
    context?: ReqBody["context"];
    roleHint?: "AUTO" | AiRoleKey;
    systemPrompt?: string;
  };
};

type SnapshotRow = {
  sales_total?: number | string | null;
  cogs_total?: number | string | null;
  expenses_total?: number | string | null;
  net_profit?: number | string | null;
  orders_count?: number | string | null;
};

type AnalysisIntent = "ANALYSIS" | "FORECAST" | "COACH";

type AutopilotAlert = {
  level: "info" | "warning" | "critical";
  title: string;
  message: string;
};

type ForecastPoint = {
  label: string;
  sales: number;
  cogs: number;
  expenses: number;
  profit: number;
  orders: number;
  margin: number;
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
    "Access-Control-Allow-Headers": "content-type, authorization, x-zetra-role",
    "Access-Control-Allow-Methods": "POST, OPTIONS, GET",
  };
}

function withCors(resp: Response, origin: string | null) {
  const h = new Headers(resp.headers);
  const c = corsHeaders(origin);
  for (const [k, v] of Object.entries(c)) h.set(k, v);
  return new Response(resp.body, { status: resp.status, headers: h });
}

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
- If the user indicates they are done / have no question / don't need help now:
  - Reply with ONE short acknowledgement only.
  - Do NOT ask follow-up questions.
  - Do NOT suggest other topics.
`.trim();

  const roleBlock = buildRoleInstructions(role);

  return `
You are ZETRA AI — Elite Multi-Role Intelligence System.

CORE BEHAVIOR:
- Be natural and adaptive.
- Understand the user's likely goal, not just exact keywords.
- Infer intent from wording, business context, and recent history.
- Be detailed when needed, concise when appropriate.
- Suggest next steps only if helpful or when user is solving something.
- Do NOT force structured templates.
- When the user sends an image, analyze the visible content directly.
- Do not say you cannot see/analyze the image if image input is present.
- Describe what is visible first, then answer the user's requested task.
- If the image is unclear, say exactly what is unclear and give the best possible partial answer.
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
    return await fetch(url, { ...init, signal: controller.signal });
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

function num(x: unknown) {
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
}

function buildInjectedDataLines(ctx: ReqBody["context"]) {
  const c: any = ctx ?? {};
  const lines: string[] = [];

  const businessIntent = clean(c.businessIntent);
  if (businessIntent) lines.push(`businessIntent: ${businessIntent}`);

  if (c.forceUseRealBusinessData) lines.push("forceUseRealBusinessData: true");
  if (c.forceUseRealProductNames) lines.push("forceUseRealProductNames: true");
  if (c.disallowGenericProductAdvice) lines.push("disallowGenericProductAdvice: true");

  const topProducts = Array.isArray(c.topProducts) ? c.topProducts : [];
  const lowStockItems = Array.isArray(c.lowStockItems) ? c.lowStockItems : [];
  const slowItems = Array.isArray(c.slowItems) ? c.slowItems : [];

  if (topProducts.length) {
    lines.push("TOP PRODUCTS (REAL DATA):");
    for (const p of topProducts.slice(0, 8)) {
      lines.push(
        `- ${clean(p?.product_name) || "Unknown Product"} | sku=${clean(p?.sku) || "N/A"} | qty=${num(
          p?.qty_sold
        )} | sales=${num(p?.sales_amount)} | profit=${num(p?.profit_amount)}`
      );
    }
  }

  if (lowStockItems.length) {
    lines.push("LOW STOCK ITEMS (REAL DATA):");
    for (const p of lowStockItems.slice(0, 8)) {
      lines.push(
        `- ${clean(p?.product_name) || "Unknown Product"} | sku=${clean(p?.sku) || "N/A"} | stock=${num(
          p?.stock_qty
        )} | threshold=${num(p?.threshold_qty)} | status=${clean(p?.stock_status) || "LOW"}`
      );
    }
  }

  if (slowItems.length) {
    lines.push("SLOW / DEAD STOCK ITEMS (REAL DATA):");
    for (const p of slowItems.slice(0, 8)) {
      lines.push(
        `- ${clean(p?.product_name) || "Unknown Product"} | sku=${clean(p?.sku) || "N/A"} | stock=${num(
          p?.stock_qty
        )} | days_without_sale=${num(p?.days_without_sale)}`
      );
    }
  }

  const injectedBusinessContext = clean(c.injectedBusinessContext);
  if (injectedBusinessContext) {
    lines.push("INJECTED BUSINESS CONTEXT:");
    lines.push(injectedBusinessContext);
  }

  const productIntelligenceBlock = clean(c.productIntelligenceBlock);
  if (productIntelligenceBlock) {
    lines.push("PRODUCT INTELLIGENCE BLOCK:");
    lines.push(productIntelligenceBlock);
  }

  return lines;
}

function buildDataDrivenRules(ctx: ReqBody["context"]) {
  const c: any = ctx ?? {};
  const topProducts = Array.isArray(c.topProducts) ? c.topProducts : [];
  const lowStockItems = Array.isArray(c.lowStockItems) ? c.lowStockItems : [];
  const slowItems = Array.isArray(c.slowItems) ? c.slowItems : [];

  const hasInjectedProducts = topProducts.length || lowStockItems.length || slowItems.length;

  if (!hasInjectedProducts) return "";

  return `
DATA-DRIVEN PRODUCT RULES (CRITICAL):
- You have REAL injected business product data from ZETRA BMS.
- You MUST use the injected product names directly when answering.
- You MUST NOT answer with generic examples or generic retail theory if injected data already exists.
- If user asks:
  - about low stock -> use LOW STOCK ITEMS first
  - about slow/idle products -> use SLOW / DEAD STOCK ITEMS first
  - about top/best products -> use TOP PRODUCTS first
  - about profit leak -> connect answer to margin, COGS, expenses, and real products when available
- If a requested category has no injected items, say clearly that category has no injected data instead of inventing.
- Never say “I cannot see product-level data” when injected product data is present in context.
`.trim();
}

function detectDirectProductQuestion(text: string) {
  const t = clean(text).toLowerCase();

  return {
    asksLowStock: hasAnyPhrase(t, [
      "low stock",
      "ziko low",
      "stock low",
      "chini cha hisa",
      "hisa ndogo",
      "restock",
      "hatari ya kuisha stock",
      "inventory risk",
      "bidhaa ziko low",
      "bidhaa zipi ziko low",
    ]),
    asksSlowItems: hasAnyPhrase(t, [
      "slow moving",
      "slow items",
      "dead stock",
      "hazitembei",
      "hazikauzwi",
      "hazikauzwa",
      "zinakaa muda mrefu",
      "bila kuuzwa",
      "slow moving products",
      "idle products",
    ]),
    asksTopProducts: hasAnyPhrase(t, [
      "top bidhaa",
      "top products",
      "best seller",
      "best sellers",
      "zinaouza zaidi",
      "zinazouza zaidi",
      "fast moving",
      "top zinauza",
    ]),
    asksProfitLeak: hasAnyPhrase(t, [
      "profit leak",
      "leak ya profit",
      "leak ya faida",
      "faida inapotea wapi",
      "profit wapi",
      "nina leak ya profit",
      "profit risk",
    ]),
    asksSteps: hasAnyPhrase(t, [
      "hatua",
      "steps",
      "nifanye nini",
      "what should i do",
      "haraka",
      "quick actions",
    ]),
  };
}

function formatInjectedProductLine(p: any, mode: "TOP" | "LOW" | "SLOW") {
  const name = clean(p?.product_name) || "Unknown Product";
  const sku = clean(p?.sku);
  const stock = num(p?.stock_qty);
  const qtySold = num(p?.qty_sold);
  const salesAmount = num(p?.sales_amount);
  const profitAmount = num(p?.profit_amount);
  const threshold = num(p?.threshold_qty);
  const days = num(p?.days_without_sale);
  const status = clean(p?.stock_status) || "LOW";

  if (mode === "TOP") {
    return `• ${name}${sku ? ` (SKU: ${sku})` : ""} — qty sold: ${qtySold}, sales: ${fmtMoney(
      salesAmount
    )}, profit: ${fmtMoney(profitAmount)}`;
  }

  if (mode === "LOW") {
    return `• ${name}${sku ? ` (SKU: ${sku})` : ""} — stock: ${stock}, threshold: ${threshold}, status: ${status}`;
  }

  return `• ${name}${sku ? ` (SKU: ${sku})` : ""} — stock: ${stock}, no sale days: ${days}`;
}

function buildFullCombinedDataReply(text: string, ctx: ReqBody["context"]) {
  const c: any = ctx ?? {};

  const topProducts = Array.isArray(c?.topProducts) ? c.topProducts : [];
  const lowStockItems = Array.isArray(c?.lowStockItems) ? c.lowStockItems : [];
  const slowItems = Array.isArray(c?.slowItems) ? c.slowItems : [];
  const snapshot = c?.businessSnapshot ?? null;

  const q = detectDirectProductQuestion(text);

  const hasAnyInjected = topProducts.length || lowStockItems.length || slowItems.length;
  if (!hasAnyInjected) return "";

  const asksAnythingProduct =
    q.asksLowStock || q.asksSlowItems || q.asksTopProducts || q.asksProfitLeak;

  if (!asksAnythingProduct) return "";

  const lines: string[] = [];

  if (q.asksLowStock) {
    lines.push("LOW STOCK ITEMS:");
    if (lowStockItems.length) {
      for (const p of lowStockItems.slice(0, 8)) {
        lines.push(formatInjectedProductLine(p, "LOW"));
      }
    } else {
      lines.push("• Hakuna low stock items zilizoinjectiwa kwa sasa.");
    }
    lines.push("");
  }

  if (q.asksSlowItems) {
    lines.push("SLOW / DEAD STOCK ITEMS:");
    if (slowItems.length) {
      for (const p of slowItems.slice(0, 8)) {
        lines.push(formatInjectedProductLine(p, "SLOW"));
      }
    } else {
      lines.push("• Hakuna slow/dead stock items zilizoinjectiwa kwa sasa.");
    }
    lines.push("");
  }

  if (q.asksTopProducts) {
    lines.push("TOP PRODUCTS:");
    if (topProducts.length) {
      for (const p of topProducts.slice(0, 8)) {
        lines.push(formatInjectedProductLine(p, "TOP"));
      }
    } else {
      lines.push("• Hakuna top products zilizoinjectiwa kwa sasa.");
    }
    lines.push("");
  }

  if (q.asksProfitLeak) {
    const salesTotal = num(snapshot?.sales_total);
    const cogsTotal = num(snapshot?.cogs_total);
    const expensesTotal = num(snapshot?.expenses_total);
    const profitTotal = num(snapshot?.profit_total);
    const marginPct = num(snapshot?.margin_pct);

    lines.push("PROFIT LEAK ANALYSIS:");
    lines.push(`• Sales: ${fmtMoney(salesTotal)}`);
    lines.push(`• COGS: ${fmtMoney(cogsTotal)}`);
    lines.push(`• Expenses: ${fmtMoney(expensesTotal)}`);
    lines.push(`• Profit: ${fmtMoney(profitTotal)}`);
    lines.push(`• Margin: ${fmtPercent(marginPct)}`);

    if (marginPct < 10) {
      lines.push("• Leak kubwa iko kwenye margin ya jumla ya biashara kuwa ndogo sana.");
    }

    if (salesTotal > 0 && cogsTotal > salesTotal * 0.8) {
      lines.push("• Leak kubwa iko kwenye COGS ya biashara kuwa kubwa sana dhidi ya sales za kipindi hiki.");
    }

    if (salesTotal > 0 && expensesTotal > salesTotal * 0.2) {
      lines.push("• Leak nyingine iko kwenye expenses za biashara kuwa nzito dhidi ya sales za kipindi hiki.");
    }

    if (topProducts.length) {
      lines.push("");
      lines.push("Bidhaa za kwanza kukaguliwa kwa pricing/cost:");
      for (const p of topProducts.slice(0, 5)) {
        lines.push(formatInjectedProductLine(p, "TOP"));
      }
    }

    if (slowItems.length) {
      lines.push("");
      lines.push("Bidhaa zinazofunga cash bila movement:");
      for (const p of slowItems.slice(0, 5)) {
        lines.push(formatInjectedProductLine(p, "SLOW"));
      }
    }

    lines.push("");
  }

  if (q.asksSteps || (q.asksTopProducts && q.asksSlowItems) || q.asksProfitLeak) {
    lines.push("HATUA ZA HARAKA:");
    lines.push("• Linda stock ya top products zisije kuisha.");
    lines.push("• Punguza reorder ya slow/dead stock kwanza.");
    lines.push("• Tumia bundle ya top product + slow item kusukuma movement.");
    lines.push("• Kagua supplier cost ya top products kwanza.");
    lines.push("• Rekebisha price/margin ya bidhaa zinazobeba mauzo lakini faida ndogo.");
  }

  return lines.join("\n").trim();
}

function buildDirectProductDataReply(text: string, ctx: ReqBody["context"]) {
  const c: any = ctx ?? {};

  const topProducts = Array.isArray(c?.topProducts) ? c.topProducts : [];
  const lowStockItems = Array.isArray(c?.lowStockItems) ? c.lowStockItems : [];
  const slowItems = Array.isArray(c?.slowItems) ? c.slowItems : [];
  const snapshot = c?.businessSnapshot ?? null;

  const q = detectDirectProductQuestion(text);

  const hasAnyInjected = topProducts.length || lowStockItems.length || slowItems.length;
  if (!hasAnyInjected) return "";

  if (q.asksLowStock && !q.asksSlowItems && !q.asksTopProducts && !q.asksProfitLeak) {
    if (!lowStockItems.length) {
      return "Kwa data ya sasa iliyoinjectiwa kutoka ZETRA BMS, sijaona bidhaa zilizo kwenye LOW STOCK list kwa sasa.";
    }

    return [
      "Hizi ndizo bidhaa zako ziko low stock kwa data halisi ya sasa:",
      "",
      ...lowStockItems.slice(0, 12).map((p: any) => formatInjectedProductLine(p, "LOW")),
      "",
      "Hatua ya haraka:",
      "• Refill bidhaa zenye stock ndogo kuliko threshold kwanza",
      "• Zenye status OUT ziwe priority ya kwanza kurestock",
    ].join("\n");
  }

  if (q.asksSlowItems && !q.asksLowStock && !q.asksTopProducts && !q.asksProfitLeak) {
    if (!slowItems.length) {
      return "Kwa data ya sasa iliyoinjectiwa kutoka ZETRA BMS, sijaona bidhaa kwenye slow/dead stock list kwa sasa.";
    }

    return [
      "Hizi ndizo bidhaa zako slow moving / dead stock kwa data halisi ya sasa:",
      "",
      ...slowItems.slice(0, 12).map((p: any) => formatInjectedProductLine(p, "SLOW")),
      "",
      "Hatua ya haraka:",
      "• Punguza reorder ya bidhaa hizi kwanza",
      "• Fikiria offer/bundle kwa bidhaa hizi ili zitembee",
      "• Kagua kama pricing au display yake inahitaji kubadilishwa",
    ].join("\n");
  }

  if (q.asksTopProducts && !q.asksSlowItems && !q.asksLowStock && !q.asksProfitLeak) {
    if (!topProducts.length) {
      return "Kwa data ya sasa iliyoinjectiwa kutoka ZETRA BMS, sijaona top products list yenye product-level details kwa sasa.";
    }

    return [
      "Hizi ndizo top products zako kwa data halisi ya sasa:",
      "",
      ...topProducts.slice(0, 12).map((p: any) => formatInjectedProductLine(p, "TOP")),
      "",
      "Hatua ya haraka:",
      "• Linda stock ya bidhaa hizi zisije kuisha",
      "• Kagua margin ya bidhaa hizi kwa sababu ndizo zinabeba mauzo zaidi",
      "• Tumia bidhaa hizi kama anchor ya bundles/offers",
    ].join("\n");
  }

  if (q.asksTopProducts && q.asksSlowItems) {
    const topLines = topProducts.length
      ? topProducts.slice(0, 5).map((p: any) => formatInjectedProductLine(p, "TOP"))
      : ["• Hakuna top products zilizoinjectiwa kwa sasa"];

    const slowLines = slowItems.length
      ? slowItems.slice(0, 5).map((p: any) => formatInjectedProductLine(p, "SLOW"))
      : ["• Hakuna slow/dead stock items zilizoinjectiwa kwa sasa"];

    const actions: string[] = [];
    actions.push("1. Linda availability ya top products zako kwanza.");
    actions.push("2. Usiongeze buying ya slow items mpaka zilizopo zipungue.");
    actions.push("3. Tumia bundle: top product + slow item ili kusukuma slow stock.");
    actions.push("4. Kagua pricing ya slow items kama bei imebana movement.");
    actions.push("5. Toa display/promo ya haraka kwa slow items zenye stock kubwa.");

    return [
      "Hapa kuna mchanganuo wa real products zako za top vs slow moving:",
      "",
      "TOP PRODUCTS:",
      ...topLines,
      "",
      "SLOW / DEAD STOCK:",
      ...slowLines,
      "",
      "Hatua 5 za haraka:",
      ...actions.map((x) => `• ${x}`),
    ].join("\n");
  }

  if (q.asksProfitLeak) {
    const salesTotal = num(snapshot?.sales_total);
    const cogsTotal = num(snapshot?.cogs_total);
    const expensesTotal = num(snapshot?.expenses_total);
    const profitTotal = num(snapshot?.profit_total);
    const marginPct = num(snapshot?.margin_pct);

    const lines: string[] = [];
    lines.push("Hapa kuna leak ya profit kwa kutumia data halisi ya sasa:");

    if (marginPct < 10) {
      lines.push(`• Margin iko chini: ${fmtPercent(marginPct)}`);
    }

    if (salesTotal > 0 && cogsTotal > salesTotal * 0.8) {
      lines.push(`• COGS imebana sana faida: sales ${fmtMoney(salesTotal)} vs COGS ${fmtMoney(cogsTotal)}`);
    }

    if (salesTotal > 0 && expensesTotal > salesTotal * 0.2) {
      lines.push(`• Expenses ni nzito dhidi ya sales: ${fmtMoney(expensesTotal)}`);
    }

    if (topProducts.length) {
      lines.push("");
      lines.push("Bidhaa za kwanza za kukaguliwa kwa pricing/cost/margin:");
      for (const p of topProducts.slice(0, 5)) {
        lines.push(formatInjectedProductLine(p, "TOP"));
      }
      lines.push("• Kumbuka: top product si leak moja kwa moja; leak inathibitishwa na margin/cost/expense pressure.");
    }

    if (slowItems.length) {
      lines.push("");
      lines.push("Bidhaa zinazofunga cash bila movement:");
      for (const p of slowItems.slice(0, 5)) {
        lines.push(formatInjectedProductLine(p, "SLOW"));
      }
    }

    if (lowStockItems.length) {
      lines.push("");
      lines.push("Bidhaa zenye risk ya stock interruption:");
      for (const p of lowStockItems.slice(0, 5)) {
        lines.push(formatInjectedProductLine(p, "LOW"));
      }
    }

    lines.push("");
    lines.push("Hatua ya haraka:");
    lines.push("• Kagua supplier cost ya top products kwanza");
    lines.push("• Rekebisha price/margin ya top movers kama margin ni ndogo");
    lines.push("• Punguza buying ya slow items zinazokaa bila kuuzwa");
    lines.push("• Restock low-stock winners ili usikate mauzo");

    return lines.join("\n");
  }

  return "";
}

type SlashCommandKey = "/heal" | "/finance" | "/stock" | "/profit" | "/debug";

function detectSlashCommand(raw: string): { command: SlashCommandKey | null; rest: string } {
  const src = clean(raw);
  if (!src.startsWith("/")) return { command: null, rest: src };

  const m = src.match(/^\/([a-zA-Z]+)\s*(.*)$/);
  const cmd = clean(m?.[1]).toLowerCase();
  const rest = clean(m?.[2]);

  if (cmd === "heal") return { command: "/heal", rest };
  if (cmd === "finance") return { command: "/finance", rest };
  if (cmd === "stock") return { command: "/stock", rest };
  if (cmd === "profit") return { command: "/profit", rest };
  if (cmd === "debug") return { command: "/debug", rest };

  return { command: null, rest: src };
}

function roleHintFromSlashCommand(command: SlashCommandKey | null): AiRoleKey | null {
  if (command === "/heal") return "HEALTH";
  if (command === "/finance") return "FINANCE";
  if (command === "/debug") return "ENGINEERING";
  if (command === "/stock") return "ZETRA_BMS";
  if (command === "/profit") return "ZETRA_BMS";
  return null;
}

function normalizeCommandUserText(command: SlashCommandKey | null, rest: string) {
  const body = clean(rest);

  if (command === "/heal") {
    return body || "Nahitaji msaada wa afya. Nipe mwongozo wa afya kwa lugha rahisi.";
  }

  if (command === "/finance") {
    return body || "Nipe mwongozo wa kifedha kwa biashara yangu kwa lugha rahisi.";
  }

  if (command === "/debug") {
    return body || "Nisaidie kufanya debugging ya tatizo la mfumo kwa hatua za kitaalamu.";
  }

  if (command === "/stock") {
    return body || "Nipe uchambuzi wa stock, low stock, slow moving, na display risk.";
  }

  if (command === "/profit") {
    return body || "Nipe uchambuzi wa profit leak, margin, expenses, na hatua za kuongeza profit.";
  }

  return body;
}

function buildSlashCommandSystemBlock(command: SlashCommandKey | null) {
  if (command === "/heal") {
    return `
SLASH COMMAND MODE: /heal
- Route this request as HEALTH mode directly.
- Jibu kwa lugha rahisi, practical, na ya tahadhari.
- General health information only.
- Ukipewa dalili, eleza possible meaning, red flags, na hatua salama za kuchukua.
`.trim();
  }

  if (command === "/finance") {
    return `
SLASH COMMAND MODE: /finance
- Route this request as FINANCE mode directly.
- Focus on cashflow, margins, pricing, budgeting, and business decisions.
`.trim();
  }

  if (command === "/debug") {
    return `
SLASH COMMAND MODE: /debug
- Route this request as ENGINEERING mode directly.
- Focus on root cause, logs, exact failure path, and safe fixes.
`.trim();
  }

  if (command === "/stock") {
    return `
SLASH COMMAND MODE: /stock
- Route this request as ZETRA_BMS stock intelligence mode.
- Focus on low stock, dead stock, display risk, restock urgency, and movement.
`.trim();
  }

  if (command === "/profit") {
    return `
SLASH COMMAND MODE: /profit
- Route this request as ZETRA_BMS profit intelligence mode.
- Focus on margin, COGS, expenses, profit leaks, and corrective actions.
`.trim();
  }

  return "";
}

function buildVisionPriorityRules(text: string, images: string[], ctx: ReqBody["context"]) {
  if (!Array.isArray(images) || images.length === 0) return "";

  const c: any = ctx ?? {};
  const asksStockOrDisplay = hasAnyPhrase(text, [
    "stock",
    "display",
    "risk",
    "inventory",
    "low stock",
    "shelf",
    "rack",
    "bidhaa",
    "akiba",
    "restock",
    "display risk",
    "stock risk",
  ]);

  const hasInjectedProducts =
    (Array.isArray(c?.topProducts) && c.topProducts.length > 0) ||
    (Array.isArray(c?.lowStockItems) && c.lowStockItems.length > 0) ||
    (Array.isArray(c?.slowItems) && c.slowItems.length > 0);

  return `
VISION PRIORITY RULES (CRITICAL):
- An image is attached in this request.
- The visible image is PRIMARY evidence.
- First describe what is actually visible in the image.
- Then answer the user's question using the image first.
- Use injected business/product/store data only as secondary supporting context.
- Never ignore the image and jump straight to generic business summary.
${asksStockOrDisplay ? "- If user asks stock/display risk, inspect visible arrangement, emptiness, crowding, accessibility, shelf/display quality, and obvious stock signals from the image." : ""}
${hasInjectedProducts ? "- If injected product/store data exists, use it only to cross-check or strengthen the image-based answer, not to replace the image analysis." : ""}
- If the image is unclear, say exactly what is unclear, then give the best partial answer.
`.trim();
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

function tokenizeText(text: string) {
  return clean(text)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s/%-]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function hasAnyPhrase(text: string, phrases: string[]) {
  const t = clean(text).toLowerCase();
  return phrases.some((p) => t.includes(clean(p).toLowerCase()));
}

function countPhraseHits(text: string, phrases: string[]) {
  const t = clean(text).toLowerCase();
  let hits = 0;
  for (const p of phrases) {
    if (t.includes(clean(p).toLowerCase())) hits++;
  }
  return hits;
}

function detectBusinessAnalysisRequest(text: string, ctx: ReqBody["context"], history: Array<{ role: "user" | "assistant"; content: string }>) {
  const t = clean(text).toLowerCase();
  const c: any = ctx ?? {};
  const activeStoreId = clean(c?.activeStoreId || c?.storeId);

  const hasInjectedProducts =
    (Array.isArray(c?.topProducts) && c.topProducts.length > 0) ||
    (Array.isArray(c?.lowStockItems) && c.lowStockItems.length > 0) ||
    (Array.isArray(c?.slowItems) && c.slowItems.length > 0);

  if (hasInjectedProducts) return true;
  if (!activeStoreId) return false;

  const directSignals = [
    "analysis",
    "uchambuzi",
    "business analysis",
    "analysis ya leo",
    "forecast",
    "utabiri",
    "prediction",
    "smart prediction",
    "profit coach",
    "coach",
    "boresha faida",
    "niongoze kwenye profit",
  ];

  const financeSignals = [
    "sales",
    "mauzo",
    "profit",
    "faida",
    "margin",
    "expenses",
    "gharama",
    "expense",
    "cogs",
    "orders",
    "order",
    "money in",
    "avg/order",
    "avg order",
    "biashara yangu",
    "store hii",
    "duka hili",
    "duka yangu",
    "biashara hii",
  ];

  const timeSignals = [
    "leo",
    "today",
    "wiki",
    "week",
    "siku",
    "month",
    "mwezi",
    "next day",
    "next 7 days",
    "siku 7 zijazo",
    "wiki ijayo",
    "jana",
    "yesterday",
  ];

  const directHit = hasAnyPhrase(t, directSignals);
  const financeHits = countPhraseHits(t, financeSignals);
  const timeHits = countPhraseHits(t, timeSignals);

  if (directHit) return true;
  if (financeHits >= 2) return true;
  if (financeHits >= 1 && timeHits >= 1) return true;

  const lastUser = [...history].reverse().find((m) => m.role === "user");
  const prevText = clean(lastUser?.content).toLowerCase();
  if (prevText) {
    const prevDirect = hasAnyPhrase(prevText, directSignals);
    const currentShortFollowUp =
      t.length <= 60 &&
      hasAnyPhrase(t, ["endelea", "sasa", "na forecast", "na coach", "onyesha tena", "endelea hapo", "endelea kwenye analysis"]);

    if (prevDirect && currentShortFollowUp) return true;
  }

  return false;
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
  if (engHit) return "ENGINEERING";
  if (hasOrg && bmsHit) return "ZETRA_BMS";
  if (financeHit) return "FINANCE";
  if (marketingHit) return "MARKETING";
  return "GENERAL";
}

function isClosingMessage(raw: string) {
  const t = clean(raw).toLowerCase();
  if (!t) return false;

  if (
    /^(sawa|poa|ok(ay)?|asante|thank(s)?)(\s+(mkuu|boss|bro|dad|sir))?[\s.!]*$/.test(t) ||
    /^(bye|goodbye|see you|ttyl|later)[\s.!]*$/.test(t)
  ) {
    return true;
  }

  if (
    /\b(hapana\s+sina\s+swali|sina\s+swali|sihitaji\s+kitu|kwa\s+leo\s+sihitaji|kwa\s+leo\s+sitaki\s+kitu|siitaji\s+msaada|sipo\s+tayari|nipo\s+sawa|ni\s+sawa)\b/.test(
      t
    )
  ) {
    return true;
  }

  if (/\b(no\s+question|no\s+questions|no\s+thanks|i'?m\s+good|i\s+am\s+good|nothing\s+else|not\s+now)\b/.test(t)) {
    return true;
  }

  return false;
}

function closingReply(lang: "sw" | "en" | "auto") {
  if (lang === "en") return "All good. I’m here whenever you need me.";
  return "Sawa mkuu. Nipo hapa ukihitaji.";
}

function fmtMoney(n: number) {
  const v = Number(n) || 0;
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(Math.round(v));
}

function fmtPercent(n: number) {
  const v = Number(n) || 0;
  return `${v.toFixed(1)}%`;
}

function detectBusinessIntent(text: string): AnalysisIntent {
  const t = clean(text).toLowerCase();

  const wantsForecast =
    hasAnyPhrase(t, [
      "forecast",
      "utabiri",
      "prediction",
      "smart prediction",
      "siku 7 zijazo",
      "wiki ijayo",
      "next day",
      "next 7 days",
      "kesho",
      "tomorrow",
      "projected",
      "projection",
    ]);

  const wantsCoach =
    hasAnyPhrase(t, [
      "profit coach",
      "coach",
      "nishauri",
      "nifundishe",
      "niongoze kwenye profit",
      "boresha faida",
      "how can i improve profit",
      "increase profit",
      "ongeza faida",
    ]);

  if (wantsForecast) return "FORECAST";
  if (wantsCoach) return "COACH";
  return "ANALYSIS";
}

function detectSlashModeCommand(text: string) {
  const t = clean(text).toLowerCase();

  if (!t.startsWith("/")) return null;

  if (t === "/heal" || t === "/health") return "HEALTH";
  if (t === "/pro" || t === "/profit") return "PROFIT";
  if (t === "/sto" || t === "/stock") return "STOCK";
  if (t === "/for" || t === "/forecast") return "FORECAST";

  return null;
}

function buildSlashModeReply(cmd: "HEALTH" | "PROFIT" | "STOCK" | "FORECAST", lang: "sw" | "en" | "auto") {
  if (cmd === "HEALTH") {
    if (lang === "en") {
      return (
        "Health mode is active.\n\n" +
        "You can now ask directly about a health issue, for example:\n" +
        "• I have a severe headache\n" +
        "• My stomach hurts\n" +
        "• I feel dizzy\n\n" +
        "I will give general health information and safe next steps."
      );
    }

    return (
      "Health mode imewashwa.\n\n" +
      "Sasa unaweza kuuliza moja kwa moja tatizo la afya, mfano:\n" +
      "• Kichwa kinauma sana\n" +
      "• Tumbo linauma\n" +
      "• Nahisi kizunguzungu\n\n" +
      "Nitakupa taarifa za afya za jumla na hatua salama za kuanza nazo."
    );
  }

  if (cmd === "PROFIT") {
    return lang === "en"
      ? "Profit mode is active. Ask about profit leaks, margin, COGS, expenses, or what to do next."
      : "Profit mode imewashwa. Uliza kuhusu profit leak, margin, COGS, expenses, au hatua za kuchukua sasa.";
  }

  if (cmd === "STOCK") {
    return lang === "en"
      ? "Stock mode is active. Ask about low stock, dead stock, restock priorities, or display risk."
      : "Stock mode imewashwa. Uliza kuhusu low stock, dead stock, restock priority, au display risk.";
  }

  return lang === "en"
    ? "Forecast mode is active. Ask about trend, next-day projection, or next 7 days outlook."
    : "Forecast mode imewashwa. Uliza kuhusu trend, projection ya kesho, au outlook ya siku 7 zijazo.";
}

function buildVisionBusinessGuard(text: string) {
  const t = clean(text).toLowerCase();

  const asksStockDisplay =
    hasAnyPhrase(t, [
      "stock",
      "display",
      "display risk",
      "stock risk",
      "inventory risk",
      "shelf",
      "rack",
      "restock",
      "bidhaa",
      "akiba",
      "merchandising",
      "shop display",
      "store display",
      "product display",
      "niambie kuna risk gani ya stock au display",
    ]) ||
    (t.includes("stock") && t.includes("picha")) ||
    (t.includes("display") && t.includes("picha"));

  if (!asksStockDisplay) return "";

  return `
BUSINESS IMAGE GUARD (CRITICAL):
- The user is asking about STOCK / DISPLAY / MERCHANDISING risk from the image.
- First determine what is actually visible in the image.
- If the image is NOT a store/shop/product/display scene:
  - say that clearly first,
  - do NOT switch into unrelated domains like mechanic safety, vehicle workshop safety, or generic workplace hazard analysis,
  - do NOT invent stock/display conclusions from a non-store image.
- If the image IS a store/product/display scene:
  - focus on visible shelf gaps, empty facing, clutter, poor arrangement, weak visibility, overstock clutter, accessibility, display quality, and customer shopping flow.
- Always answer in this order:
  1. What the image actually shows
  2. Whether it is valid for stock/display analysis
  3. Business risks visible (only if relevant)
  4. Short next actions
`.trim();
}

function avg(nums: number[]) {
  if (!nums.length) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function toUtcDayStartIso(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0)).toISOString();
}

function toUtcNextDayStartIso(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1, 0, 0, 0, 0)).toISOString();
}

async function getStoreBusinessSnapshotByRange(
  env: Env,
  storeId: string,
  fromIso: string,
  toIso: string
): Promise<{
  ok: boolean;
  salesTotal: number;
  cogsTotal: number;
  expensesTotal: number;
  netProfit: number;
  ordersCount: number;
  avgOrder: number;
  moneyIn: number;
  error: string;
}> {
  const supabaseUrl = clean(env.SUPABASE_URL);
  const serviceRoleKey = clean(env.SUPABASE_SERVICE_ROLE_KEY);

  if (!supabaseUrl || !serviceRoleKey) {
    return {
      ok: false,
      salesTotal: 0,
      cogsTotal: 0,
      expensesTotal: 0,
      netProfit: 0,
      ordersCount: 0,
      avgOrder: 0,
      moneyIn: 0,
      error: "Missing Supabase envs",
    };
  }

  if (!clean(storeId)) {
    return {
      ok: false,
      salesTotal: 0,
      cogsTotal: 0,
      expensesTotal: 0,
      netProfit: 0,
      ordersCount: 0,
      avgOrder: 0,
      moneyIn: 0,
      error: "Missing storeId",
    };
  }

  try {
    const res = await fetch(`${supabaseUrl}/rest/v1/rpc/get_store_net_profit_v2`, {
      method: "POST",
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        p_store_id: storeId,
        p_from: fromIso,
        p_to: toIso,
      }),
    });

    const raw = await res.text();
    let parsed: SnapshotRow | SnapshotRow[] | null = null;

    try {
      parsed = raw ? JSON.parse(raw) : null;
    } catch {}

    if (!res.ok) {
      return {
        ok: false,
        salesTotal: 0,
        cogsTotal: 0,
        expensesTotal: 0,
        netProfit: 0,
        ordersCount: 0,
        avgOrder: 0,
        moneyIn: 0,
        error: clean((parsed as any)?.message) || clean((parsed as any)?.error) || safeSlice(raw, 400),
      };
    }

    const row = (Array.isArray(parsed) ? parsed[0] : parsed) ?? {};

    const salesTotal = Number(row.sales_total ?? 0) || 0;
    const cogsTotal = Number(row.cogs_total ?? 0) || 0;
    const expensesTotal = Number(row.expenses_total ?? 0) || 0;
    const netProfit = Number(row.net_profit ?? 0) || 0;
    const ordersCount = Number(row.orders_count ?? 0) || 0;
    const avgOrder = ordersCount > 0 ? salesTotal / ordersCount : 0;
    const moneyIn = salesTotal - expensesTotal;

    return {
      ok: true,
      salesTotal,
      cogsTotal,
      expensesTotal,
      netProfit,
      ordersCount,
      avgOrder,
      moneyIn,
      error: "",
    };
  } catch (e: any) {
    return {
      ok: false,
      salesTotal: 0,
      cogsTotal: 0,
      expensesTotal: 0,
      netProfit: 0,
      ordersCount: 0,
      avgOrder: 0,
      moneyIn: 0,
      error: clean(e?.message) || "Snapshot fetch failed",
    };
  }
}

async function getTodayStoreBusinessSnapshot(
  env: Env,
  storeId: string
): Promise<{
  ok: boolean;
  salesTotal: number;
  cogsTotal: number;
  expensesTotal: number;
  netProfit: number;
  ordersCount: number;
  avgOrder: number;
  moneyIn: number;
  error: string;
}> {
  const now = new Date();
  return getStoreBusinessSnapshotByRange(env, storeId, toUtcDayStartIso(now), now.toISOString());
}

async function getRecentDailySnapshots(env: Env, storeId: string, days = 7): Promise<ForecastPoint[]> {
  const out: ForecastPoint[] = [];
  const today = new Date();

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate(), 0, 0, 0, 0));
    d.setUTCDate(d.getUTCDate() - i);

    const snap = await getStoreBusinessSnapshotByRange(env, storeId, toUtcDayStartIso(d), toUtcNextDayStartIso(d));

    const sales = snap.ok ? snap.salesTotal : 0;
    const cogs = snap.ok ? snap.cogsTotal : 0;
    const expenses = snap.ok ? snap.expensesTotal : 0;
    const profit = snap.ok ? snap.netProfit : 0;
    const orders = snap.ok ? snap.ordersCount : 0;
    const margin = sales > 0 ? (profit / sales) * 100 : 0;

    const dd = String(d.getUTCDate()).padStart(2, "0");
    const mm = String(d.getUTCMonth() + 1).padStart(2, "0");

    out.push({
      label: `${dd}/${mm}`,
      sales,
      cogs,
      expenses,
      profit,
      orders,
      margin,
    });
  }

  return out;
}

function buildForecastBlock(points: ForecastPoint[]): string {
  if (!Array.isArray(points) || points.length === 0) return "";

  const salesSeries = points.map((p) => p.sales);
  const profitSeries = points.map((p) => p.profit);
  const ordersSeries = points.map((p) => p.orders);

  const salesAvg = avg(salesSeries);
  const profitAvg = avg(profitSeries);
  const ordersAvg = avg(ordersSeries);

  const last = points[points.length - 1];
  const prev = points.slice(0, -1);

  const prevSalesAvg = avg(prev.map((p) => p.sales));
  const salesTrendPct = prevSalesAvg > 0 ? ((last.sales - prevSalesAvg) / prevSalesAvg) * 100 : 0;

  const trendText =
    salesTrendPct > 8
      ? `📈 Trend: mauzo yanaongezeka (${fmtPercent(salesTrendPct)})`
      : salesTrendPct < -8
      ? `📉 Trend: mauzo yanashuka (${fmtPercent(salesTrendPct)})`
      : `➡️ Trend: mauzo yako yapo stable (${fmtPercent(salesTrendPct)})`;

  const projectedSales = Math.max(0, Math.round((salesAvg + last.sales) / 2));
  const projectedProfit = Math.max(0, Math.round(profitAvg * 0.6 + last.profit * 0.4));
  const projectedOrders = Math.max(0, Math.round(ordersAvg * 0.6 + last.orders * 0.4));

  const risks: string[] = [];
  const tips: string[] = [];

  const lastCogsRate = last.sales > 0 ? (last.cogs / last.sales) * 100 : 0;
  const lastExpenseRate = last.sales > 0 ? (last.expenses / last.sales) * 100 : 0;

  if (salesTrendPct < -8) {
    risks.push("⚠️ Forecast inaonyesha mauzo yanaweza kushuka kama trend hii ikiendelea.");
    tips.push("💡 Fanya push ya bidhaa zinazoenda haraka ndani ya saa/chache zijazo.");
  }

  if (lastCogsRate > 80) {
    risks.push("⚠️ COGS ratio yako ni kubwa sana.");
    tips.push("💡 Jadili supplier cost au punguza discount zisizo za lazima.");
  }

  if (lastExpenseRate > 20) {
    risks.push("⚠️ Expenses ratio yako ni nzito dhidi ya sales.");
    tips.push("💡 Punguza matumizi yasiyo ya lazima kabla ya closing.");
  }

  const riskBlock = risks.length ? `\n\n🚨 PREDICTION RISKS:\n${risks.join("\n")}` : "";
  const tipBlock = tips.length ? `\n\n🧠 SMART PREDICTIONS:\n${tips.join("\n")}` : "";

  return (
    `\n\n🔮 FORECAST (based on last 7 days):\n` +
    `${trendText}\n` +
    `📦 Projected Orders (next day): ${projectedOrders.toLocaleString("en-US")}\n` +
    `💰 Projected Sales (next day): ${fmtMoney(projectedSales)}\n` +
    `🏁 Projected Profit (next day): ${fmtMoney(projectedProfit)}` +
    riskBlock +
    tipBlock
  );
}

function buildAutopilotAlerts(args: {
  margin: number;
  salesTotal: number;
  cogsTotal: number;
  expensesTotal: number;
  ordersCount: number;
  trendPct?: number;
}): AutopilotAlert[] {
  const alerts: AutopilotAlert[] = [];

  const cogsRate = args.salesTotal > 0 ? (args.cogsTotal / args.salesTotal) * 100 : 0;
  const expenseRate = args.salesTotal > 0 ? (args.expensesTotal / args.salesTotal) * 100 : 0;

  if (args.margin < 10) {
    alerts.push({
      level: "critical",
      title: "Low Margin Risk",
      message: "Profit margin yako iko chini ya 10%. Kagua pricing, supplier cost, au unnecessary discount.",
    });
  }

  if (cogsRate > 80) {
    alerts.push({
      level: "warning",
      title: "High COGS Ratio",
      message: "COGS yako imezidi 80% ya sales. Hii inabana faida moja kwa moja.",
    });
  }

  if (expenseRate > 20) {
    alerts.push({
      level: "warning",
      title: "Heavy Expense Load",
      message: "Expenses zako ni nzito ukilinganisha na sales. Punguza matumizi yasiyo ya lazima.",
    });
  }

  if (args.ordersCount <= 0) {
    alerts.push({
      level: "critical",
      title: "No Orders Today",
      message: "Hakuna mauzo yaliyorekodiwa leo. Fanya promotion ya haraka au customer push.",
    });
  }

  if ((args.trendPct ?? 0) < -8) {
    alerts.push({
      level: "warning",
      title: "Sales Trend Dropping",
      message: "Trend ya mauzo inaonyesha kushuka. Chukua hatua mapema kabla sales hazijazidi kuporomoka.",
    });
  }

  if (alerts.length === 0) {
    alerts.push({
      level: "info",
      title: "Business Stable",
      message: "Hakuna red flag kubwa kwa sasa. Endelea kufuatilia performance kila siku.",
    });
  }

  return alerts;
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
  injectedLines: string[],
  history: Array<{ role: "user" | "assistant"; content: string }>,
  userText: string
) {
  const ctxBlock = ctxLines.length ? `Context:\n- ${ctxLines.join("\n- ")}` : "";
  const injectedBlock = injectedLines.length ? injectedLines.join("\n") : "";
  const msgs: Array<{ role: "system" | "user" | "assistant"; content: any }> = [];

  msgs.push({ role: "system", content: sys });
  if (ctxBlock) msgs.push({ role: "system", content: ctxBlock });
  if (injectedBlock) msgs.push({ role: "system", content: injectedBlock });

  for (const m of history) msgs.push({ role: m.role, content: m.content });
  msgs.push({ role: "user", content: userText });

  return msgs;
}

function buildVisionMessages(
  sys: string,
  ctxLines: string[],
  injectedLines: string[],
  history: Array<{ role: "user" | "assistant"; content: string }>,
  userText: string,
  images: string[]
) {
  const ctxBlock = ctxLines.length ? `Context:\n- ${ctxLines.join("\n- ")}` : "";
  const injectedBlock = injectedLines.length ? injectedLines.join("\n") : "";
  const msgs: Array<{ role: "system" | "user" | "assistant"; content: any }> = [];

  msgs.push({ role: "system", content: sys });
  if (ctxBlock) msgs.push({ role: "system", content: ctxBlock });
  if (injectedBlock) msgs.push({ role: "system", content: injectedBlock });

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

 const isDalle = model === "dall-e-2" || model === "dall-e-3";

  const body: any = isDalle
    ? {
        model,
        prompt,
        size,
        response_format: "url",
      }
    : {
        model,
        prompt,
        size,
        output_format: "png",
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

  const first = parsed?.data?.[0] ?? null;

  const b64 = clean(first?.b64_json);
  if (b64) {
    const mime =
      clean(first?.mime_type) ||
      (clean(first?.output_format).toLowerCase() === "jpeg"
        ? "image/jpeg"
        : clean(first?.output_format).toLowerCase() === "webp"
        ? "image/webp"
        : "image/png");

    const dataUrl = `data:${mime};base64,${b64}`;
    return { ok: true as const, status: 200, url: dataUrl, error: "" };
  }

  const u = clean(first?.url);
  if (u) {
    return { ok: true as const, status: 200, url: u, error: "" };
  }

  return {
    ok: false as const,
    status: 500,
    url: "",
    error: "No image returned from OpenAI image API",
  };
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
            version: "stable-full-v2-recovered-b1",
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

      const rawText = clean(body?.text);
      if (!rawText) {
        return withCors(json({ ok: false, error: "Missing text" }, { status: 400 }), origin);
      }

      const slash = detectSlashCommand(rawText);
      const text = normalizeCommandUserText(slash.command, slash.rest) || rawText;

      const mode: "AUTO" | "SW" | "EN" = body?.mode ?? "AUTO";
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

      const slashCmd = detectSlashModeCommand(text);
      if (slashCmd) {
        const reply = buildSlashModeReply(slashCmd, lang);

        return withCors(
          json({
            ok: true,
            reply,
            meta: {
              role:
                slashCmd === "HEALTH"
                  ? "HEALTH"
                  : slashCmd === "PROFIT" || slashCmd === "STOCK" || slashCmd === "FORECAST"
                  ? "ZETRA_BMS"
                  : "GENERAL",
              roleMeta: {
                source: "slash_mode_command",
                confidence: 1,
                reason: `direct_${slashCmd.toLowerCase()}_mode`,
              },
              analysisIntent:
                slashCmd === "FORECAST"
                  ? "FORECAST"
                  : slashCmd === "PROFIT"
                  ? "COACH"
                  : "ANALYSIS",
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
      const injectedLines = buildInjectedDataLines(ctx);
      const history = normalizeHistory(body?.history);

      const activeStoreId = clean((ctx as any)?.activeStoreId || (ctx as any)?.storeId);
      const activeStoreName = clean((ctx as any)?.activeStoreName || (ctx as any)?.storeName || "Store");
      const activeOrgName = clean((ctx as any)?.activeOrgName || (ctx as any)?.orgName || "Organization");

      const combinedInjectedReply = buildFullCombinedDataReply(text, ctx);
      if (combinedInjectedReply) {
        return withCors(
          json({
            ok: true,
            reply: combinedInjectedReply,
            meta: {
              role: "ZETRA_BMS",
              roleMeta: {
                source: "combined_injected_product_data",
                confidence: 1,
                reason: "multi_intent_real_product_data_answered_directly",
              },
              analysisIntent: detectBusinessIntent(text),
              mode,
              locale: body?.locale ?? null,
              language: body?.language ?? null,
            },
          }),
          origin
        );
      }

      const directInjectedReply = buildDirectProductDataReply(text, ctx);
      if (directInjectedReply) {
        return withCors(
          json({
            ok: true,
            reply: directInjectedReply,
            meta: {
              role: "ZETRA_BMS",
              roleMeta: {
                source: "direct_injected_product_data",
                confidence: 1,
                reason: "real_product_data_answered_directly",
              },
              analysisIntent: detectBusinessIntent(text),
              mode,
              locale: body?.locale ?? null,
              language: body?.language ?? null,
            },
          }),
          origin
        );
      }

      const wantsBusinessAnalysis = detectBusinessAnalysisRequest(text, ctx, history);

      if (wantsBusinessAnalysis && activeStoreId) {
        const snap = await getTodayStoreBusinessSnapshot(env, activeStoreId);
        const businessIntent = detectBusinessIntent(text);

        if (snap.ok) {
          const warnings: string[] = [];
          const ideas: string[] = [];
          const actions: string[] = [];

          const margin = snap.salesTotal > 0 ? (snap.netProfit / snap.salesTotal) * 100 : 0;

          if (margin < 10) {
            warnings.push("⚠️ Margin yako ni ndogo sana (High Risk)");
            ideas.push("💡 Punguza buying cost kwa supplier");
            ideas.push("💡 Ongeza bei ya kuuza (price adjustment)");
            actions.push("👉 Angalia bidhaa top 5 zinazouzwa zaidi — ongeza margin kidogo");
            actions.push("👉 Jaribu supplier mwingine mwenye cost nafuu");
          } else if (margin >= 10 && margin < 20) {
            warnings.push("📌 Margin iko medium — inaweza kuboreshwa");
            ideas.push("💡 Optimize pricing strategy");
            ideas.push("💡 Reduce unnecessary expenses");
            actions.push("👉 Punguza gharama zisizo muhimu leo");
          } else {
            warnings.push("✅ Margin iko vizuri sana");
            ideas.push("💡 Scale biashara (ongeza stock & marketing)");
            actions.push("👉 Ongeza bidhaa zinazouza sana");
          }

          if (snap.expensesTotal > snap.salesTotal * 0.3) {
            warnings.push("⚠️ Expenses zako ni kubwa sana");
            actions.push("👉 Punguza matumizi ya pesa yasiyo ya lazima");
          }

          if (snap.cogsTotal === 0) {
            warnings.push("⚠️ COGS ni 0 — hakikisha sale_items zina cost sahihi");
          } else if (snap.salesTotal > 0 && snap.cogsTotal > snap.salesTotal * 0.8) {
            warnings.push("⚠️ COGS yako ni kubwa sana ukilinganisha na sales");
            ideas.push("💡 Kagua supplier cost na pricing ya bidhaa");
          }

          if (snap.ordersCount <= 0) {
            warnings.push("⚠️ Hakuna mauzo yaliyorekodiwa leo");
            ideas.push("💡 Fanya promotion au offer ya haraka");
            actions.push("👉 Tuma tangazo WhatsApp kwa wateja wako");
          }

          let forecastBlock = "";
          let trendPct = 0;

          try {
            const forecastSeries = await getRecentDailySnapshots(env, activeStoreId, 7);

            const last = forecastSeries[forecastSeries.length - 1];
            const prev = forecastSeries.slice(0, -1);
            const prevSalesAvg = avg(prev.map((p) => p.sales));
            trendPct = prevSalesAvg > 0 ? ((last.sales - prevSalesAvg) / prevSalesAvg) * 100 : 0;

            forecastBlock = buildForecastBlock(forecastSeries);
          } catch {}

          const insightsBlock =
            warnings.length || ideas.length || actions.length
              ? `\n\n🔍 INSIGHTS:\n${warnings.join("\n")}\n\n💡 IDEAS:\n${ideas.join("\n")}\n\n🚀 ACTIONS:\n${actions.join("\n")}`
              : "";

          const autopilotAlerts = buildAutopilotAlerts({
            margin,
            salesTotal: snap.salesTotal,
            cogsTotal: snap.cogsTotal,
            expensesTotal: snap.expensesTotal,
            ordersCount: snap.ordersCount,
            trendPct,
          });

          const headerText =
            businessIntent === "FORECAST"
              ? `Hapa kuna forecast ya biashara yako kwa store "${activeStoreName}" ndani ya "${activeOrgName}":\n\n`
              : businessIntent === "COACH"
              ? `Hapa kuna profit coach ya biashara yako kwa store "${activeStoreName}" ndani ya "${activeOrgName}":\n\n`
              : `Hapa kuna analysis ya biashara yako ya leo kwa store "${activeStoreName}" ndani ya "${activeOrgName}":\n\n`;

          const baseSummary =
            `Sales (jumla ya kipindi): ${fmtMoney(snap.salesTotal)}\n` +
            `COGS (jumla ya kipindi): ${fmtMoney(snap.cogsTotal)}\n` +
            `Expenses (jumla ya kipindi): ${fmtMoney(snap.expensesTotal)}\n` +
            `Profit (jumla ya kipindi): ${fmtMoney(snap.netProfit)}\n\n` +
            `🧾 Orders: ${snap.ordersCount.toLocaleString("en-US")}\n` +
            `🛒 Avg/Order: ${fmtMoney(snap.avgOrder)}\n` +
            `💵 Money In: ${fmtMoney(snap.moneyIn)}\n\n` +
            `📊 Margin: ${fmtPercent(margin)}`;

          const coachIntro =
            businessIntent === "COACH"
              ? `\n\n🧠 COACH NOTE:\nLengo letu hapa ni kuongeza faida, kupunguza cost, na kulinda margin ya biashara yako.\n`
              : "";

          const reply = headerText + baseSummary + coachIntro + insightsBlock + forecastBlock;

          return withCors(
            json({
              ok: true,
              reply,
              meta: {
                role: "ZETRA_BMS",
                roleMeta: {
                  source: "live_store_snapshot",
                  confidence: 1,
                  reason: "smart_business_intent_detected",
                },
                analysisIntent: businessIntent,
                autopilotAlerts,
                mode,
                locale: body?.locale ?? null,
                language: body?.language ?? null,
              },
            }),
            origin
          );
        }

        return withCors(
          json({
            ok: true,
            reply:
              `Nimeshindwa kusoma live business data ya leo kwa store "${activeStoreName}".\n\n` +
              `Sababu: ${snap.error || "Unknown snapshot error"}\n\n` +
              `Hii ina maana snapshot fetch imegoma, siyo kwamba analysis logic haipo.`,
            meta: {
              role: "ZETRA_BMS",
              roleMeta: {
                source: "live_store_snapshot_error",
                confidence: 1,
                reason: "snapshot_failed",
              },
              mode,
              locale: body?.locale ?? null,
              language: body?.language ?? null,
            },
          }),
          origin
        );
      }

      const commandRoleHint = roleHintFromSlashCommand(slash.command);
      const rr = await resolveRole(env, text, ctx, ctxLines, history, commandRoleHint ?? body?.roleHint);
      const role = rr.role;
      const roleMeta = rr.roleMeta;

      const appSystemPrompt = clean(body?.systemPrompt);
      const slashSystemBlock = buildSlashCommandSystemBlock(slash.command);
      const dataDrivenRules = buildDataDrivenRules(ctx);

      const hasInjectedProducts =
        (Array.isArray((ctx as any)?.topProducts) && (ctx as any).topProducts.length > 0) ||
        (Array.isArray((ctx as any)?.lowStockItems) && (ctx as any).lowStockItems.length > 0) ||
        (Array.isArray((ctx as any)?.slowItems) && (ctx as any).slowItems.length > 0);

      const sys = [
        buildZetraInstructions(lang, role),
        slashSystemBlock,
        appSystemPrompt,
        dataDrivenRules,
        hasInjectedProducts
          ? `
STRICT FALLBACK RULE:
- Injected product data exists in this request.
- Never say you cannot access product-level, inventory, stock, or sales detail directly.
- Use injected data first.
- If a category is empty, say that exact injected category is empty.
`
          : "",
      ]
        .filter(Boolean)
        .join("\n\n");

      const messages = buildMessages(sys, ctxLines, injectedLines, history, text);

      let out = await openaiChatCompletions(env, messages, 32_000);
      if (!out.ok && /timeout|aborted/i.test(out.error)) {
        out = await openaiChatCompletions(env, messages, 36_000);
      }

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

      const rawMessage = clean(body?.message);
      const images = Array.isArray(body?.images) ? body.images.map((x) => clean(x)).filter(Boolean) : [];
      const meta = body?.meta ?? {};
      const slash = detectSlashCommand(rawMessage);
      const message = normalizeCommandUserText(slash.command, slash.rest) || rawMessage;
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
      const injectedLines = buildInjectedDataLines(ctx);
      const history = normalizeHistory(meta?.history);

      const commandRoleHint = roleHintFromSlashCommand(slash.command);
      const rr = await resolveRole(
        env,
        message || rawMessage || "(vision)",
        ctx,
        ctxLines,
        history,
        commandRoleHint ?? meta?.roleHint
      );
      const role = rr.role;
      const roleMeta = rr.roleMeta;

      const appSystemPrompt = clean(meta?.systemPrompt);
      const slashSystemBlock = buildSlashCommandSystemBlock(slash.command);
      const dataDrivenRules = buildDataDrivenRules(ctx);
      const visionPriorityRules = buildVisionPriorityRules(message, images, ctx);
      const visionBusinessGuard = buildVisionBusinessGuard(message);

      const hasInjectedProducts =
        (Array.isArray((ctx as any)?.topProducts) && (ctx as any).topProducts.length > 0) ||
        (Array.isArray((ctx as any)?.lowStockItems) && (ctx as any).lowStockItems.length > 0) ||
        (Array.isArray((ctx as any)?.slowItems) && (ctx as any).slowItems.length > 0);

      const sys = [
        buildZetraInstructions(lang, role),
        slashSystemBlock,
        appSystemPrompt,
        visionPriorityRules,
        dataDrivenRules,
        visionBusinessGuard,
        hasInjectedProducts
          ? `
STRICT FALLBACK RULE:
- Injected product data exists in this request.
- Never say you cannot access product-level, inventory, stock, or sales detail directly.
- Use injected data only AFTER checking the image first.
- If a category is empty, say that exact injected category is empty.
- Do not replace image analysis with generic stock summary.
`
          : "",
      ]
        .filter(Boolean)
        .join("\n\n");

      const visionModel = clean(env.OPENAI_VISION_MODEL) || clean(env.OPENAI_MODEL) || "gpt-4o-mini";
      const messages = buildVisionMessages(
        sys,
        ctxLines,
        injectedLines,
        history,
        message || rawMessage,
        images
      );

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
      if (!prompt) {
        return withCors(json({ ok: false, error: "Missing prompt" }, { status: 400 }), origin);
      }

      const out = await openaiImageGenerate(env, prompt, 70_000);
      const imageModel = clean(env.OPENAI_IMAGE_MODEL) || "gpt-image-1";

      if (!out.ok) {
        return withCors(
          json(
            {
              ok: false,
              error: out.error,
              debug: {
                imageModel,
                workerversion: "stable-full-v2-recovered-b1",
              },
            },
            { status: out.status || 500 }
          ),
          origin
        );
      }

      return withCors(
        json({
          ok: true,
          url: out.url,
          debug: {
            imageModel,
            workerversion: "stable-full-v2-recovered-b1",
          },
        }),
        origin
      );
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

      const maxBytes = 16 * 1024 * 1024;
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