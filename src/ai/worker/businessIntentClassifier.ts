// src/ai/worker/businessIntentClassifier.ts

/**
 * ============================================================================
 * ZETRA AI WORKER — BUSINESS INTENT CLASSIFIER
 * ============================================================================
 *
 * PURPOSE
 *
 * Server-side semantic classifier for ZETRA AI Business Intelligence.
 *
 * FLOW
 *
 * Natural language
 *      ↓
 * OpenAI
 *      ↓
 * Strict semantic business intent
 *      ↓
 * /v1/business/intent
 *      ↓
 * Mobile/Web Business Bridge
 *
 * CRITICAL RULE
 *
 * This module understands LANGUAGE only.
 *
 * It MUST NEVER:
 * - calculate sales
 * - calculate profit
 * - calculate COGS
 * - calculate expenses
 * - invent inventory numbers
 * - query business tables
 * - decide financial truth
 *
 * Verified business numbers remain the responsibility of ZETRA's
 * canonical business intelligence engine.
 * ============================================================================
 */

/**
 * ============================================================================
 * CONTRACT TYPES
 * ============================================================================
 */

export type WorkerBusinessDomain =
  | "PERFORMANCE"
  | "SALES"
  | "PROFIT"
  | "EXPENSES"
  | "INVENTORY"
  | "PRODUCTS"
  | "CUSTOMERS"
  | "CRM"
  | "CREDIT"
  | "CASHFLOW"
  | "FORECAST"
  | "GENERAL_BUSINESS";

export type WorkerBusinessIntent =
  | "BUSINESS_OVERVIEW"
  | "BUSINESS_HEALTH"
  | "SALES_SUMMARY"
  | "PROFIT_SUMMARY"
  | "EXPENSE_SUMMARY"
  | "INVENTORY_SUMMARY"
  | "TOP_PRODUCTS"
  | "LOW_STOCK"
  | "OUT_OF_STOCK"
  | "SLOW_MOVING"
  | "PERIOD_COMPARISON"
  | "STORE_COMPARISON"
  | "TREND_ANALYSIS"
  | "FORECAST"
  | "BUSINESS_COACH"
  | "PROFIT_LEAK"
  | "CUSTOMER_ANALYSIS"
  | "CRM_ANALYSIS"
  | "CREDIT_ANALYSIS"
  | "CASHFLOW_ANALYSIS"
  | "UNKNOWN";

export type WorkerPeriodPreset =
  | "TODAY"
  | "YESTERDAY"
  | "THIS_WEEK"
  | "LAST_7_DAYS"
  | "THIS_MONTH"
  | "LAST_30_DAYS"
  | "THIS_YEAR"
  | "CUSTOM"
  | "UNSPECIFIED";

export type WorkerComparisonMode =
  | "NONE"
  | "PREVIOUS_DAY"
  | "PREVIOUS_PERIOD"
  | "PREVIOUS_WEEK"
  | "PREVIOUS_MONTH"
  | "PREVIOUS_YEAR"
  | "CUSTOM";

export interface WorkerSemanticBusinessIntent {
  isBusinessQuery: boolean;

  domain: WorkerBusinessDomain;

  intent: WorkerBusinessIntent;

  periodPreset: WorkerPeriodPreset;

  comparisonMode: WorkerComparisonMode;

  customFromDate: string | null;
  customToDate: string | null;

  confidence: number;

  reason: string | null;
}

export interface BusinessIntentHistoryItem {
  role: "user" | "assistant";
  text: string;
}

export interface BusinessIntentClassifierInput {
  text: string;

  businessDate?: string | null;

  timezone?: string | null;

  organizationName?: string | null;

  storeName?: string | null;

  history?: BusinessIntentHistoryItem[];
}

export interface BusinessIntentClassifierEnv {
  OPENAI_API_KEY: string;

  OPENAI_CLASSIFIER_MODEL?: string;

  OPENAI_MODEL?: string;
}

export type BusinessIntentClassifierResult =
  | {
      ok: true;

      semanticIntent: WorkerSemanticBusinessIntent;

      model: string;

      source: "OPENAI_STRUCTURED_OUTPUT" | "OPENAI_JSON_FALLBACK";
    }
  | {
      ok: false;

      code:
        | "MISSING_API_KEY"
        | "INVALID_INPUT"
        | "OPENAI_HTTP_ERROR"
        | "OPENAI_INVALID_RESPONSE"
        | "OPENAI_PARSE_ERROR"
        | "OPENAI_TIMEOUT";

      error: string;
    };

/**
 * ============================================================================
 * ALLOWED VALUES
 * ============================================================================
 */

const BUSINESS_DOMAINS: readonly WorkerBusinessDomain[] = [
  "PERFORMANCE",
  "SALES",
  "PROFIT",
  "EXPENSES",
  "INVENTORY",
  "PRODUCTS",
  "CUSTOMERS",
  "CRM",
  "CREDIT",
  "CASHFLOW",
  "FORECAST",
  "GENERAL_BUSINESS",
] as const;

const BUSINESS_INTENTS: readonly WorkerBusinessIntent[] = [
  "BUSINESS_OVERVIEW",
  "BUSINESS_HEALTH",
  "SALES_SUMMARY",
  "PROFIT_SUMMARY",
  "EXPENSE_SUMMARY",
  "INVENTORY_SUMMARY",
  "TOP_PRODUCTS",
  "LOW_STOCK",
  "OUT_OF_STOCK",
  "SLOW_MOVING",
  "PERIOD_COMPARISON",
  "STORE_COMPARISON",
  "TREND_ANALYSIS",
  "FORECAST",
  "BUSINESS_COACH",
  "PROFIT_LEAK",
  "CUSTOMER_ANALYSIS",
  "CRM_ANALYSIS",
  "CREDIT_ANALYSIS",
  "CASHFLOW_ANALYSIS",
  "UNKNOWN",
] as const;

const PERIOD_PRESETS: readonly WorkerPeriodPreset[] = [
  "TODAY",
  "YESTERDAY",
  "THIS_WEEK",
  "LAST_7_DAYS",
  "THIS_MONTH",
  "LAST_30_DAYS",
  "THIS_YEAR",
  "CUSTOM",
  "UNSPECIFIED",
] as const;

const COMPARISON_MODES: readonly WorkerComparisonMode[] = [
  "NONE",
  "PREVIOUS_DAY",
  "PREVIOUS_PERIOD",
  "PREVIOUS_WEEK",
  "PREVIOUS_MONTH",
  "PREVIOUS_YEAR",
  "CUSTOM",
] as const;

/**
 * ============================================================================
 * BASIC HELPERS
 * ============================================================================
 */

function clean(value: unknown): string {
  return String(value ?? "").trim();
}

function upper(value: unknown): string {
  return clean(value).toUpperCase();
}

function clampConfidence(value: unknown): number {
  const n = Number(value);

  if (!Number.isFinite(n)) {
    return 0;
  }

  return Math.max(
    0,
    Math.min(1, n)
  );
}

function isIsoDate(value: unknown): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(
    clean(value)
  );
}

function isAllowed<T extends string>(
  value: string,
  allowed: readonly T[]
): value is T {
  return (
    allowed as readonly string[]
  ).includes(value);
}

function safeSlice(
  value: unknown,
  maxLength: number
): string {
  const text = clean(value);

  if (text.length <= maxLength) {
    return text;
  }

  return text.slice(
    0,
    maxLength
  );
}

function isAbortError(
  error: unknown
): boolean {
  const e = error as any;

  const name = clean(
    e?.name
  ).toLowerCase();

  const message = clean(
    e?.message
  ).toLowerCase();

  return (
    name.includes("abort") ||
    message.includes("aborted") ||
    message.includes("timeout")
  );
}

/**
 * ============================================================================
 * NETWORK
 * ============================================================================
 */

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller =
    new AbortController();

  const timer =
    setTimeout(
      () => controller.abort(),
      Math.max(
        3000,
        timeoutMs
      )
    );

  try {
    return await fetch(
      url,
      {
        ...init,
        signal:
          controller.signal,
      }
    );
  } finally {
    clearTimeout(timer);
  }
}

async function readJsonSafe(
  response: Response
): Promise<{
  parsed: any;
  raw: string;
}> {
  const raw =
    await response.text();

  try {
    return {
      parsed:
        raw
          ? JSON.parse(raw)
          : null,

      raw,
    };
  } catch {
    return {
      parsed: null,
      raw,
    };
  }
}

/**
 * ============================================================================
 * SAFE FALLBACK SEMANTIC OBJECT
 * ============================================================================
 */

export function createWorkerNonBusinessIntent(
  reason =
    "not_business_query"
): WorkerSemanticBusinessIntent {
  return {
    isBusinessQuery: false,

    domain:
      "GENERAL_BUSINESS",

    intent:
      "UNKNOWN",

    periodPreset:
      "UNSPECIFIED",

    comparisonMode:
      "NONE",

    customFromDate:
      null,

    customToDate:
      null,

    confidence:
      0,

    reason,
  };
}

/**
 * ============================================================================
 * NORMALIZER
 * ============================================================================
 */

export function normalizeWorkerSemanticBusinessIntent(
  raw: any
): WorkerSemanticBusinessIntent {
  const isBusinessQuery =
    raw?.isBusinessQuery === true;

  const confidence =
    clampConfidence(
      raw?.confidence
    );

  const reason =
    safeSlice(
      raw?.reason,
      160
    ) || null;

  if (!isBusinessQuery) {
    return {
      ...createWorkerNonBusinessIntent(
        reason ||
          "model_non_business"
      ),

      confidence,
    };
  }

  const rawDomain =
    upper(
      raw?.domain
    );

  const rawIntent =
    upper(
      raw?.intent
    );

  const rawPeriod =
    upper(
      raw?.periodPreset
    );

  const rawComparison =
    upper(
      raw?.comparisonMode
    );

  const domain:
    WorkerBusinessDomain =
    isAllowed(
      rawDomain,
      BUSINESS_DOMAINS
    )
      ? rawDomain
      : "GENERAL_BUSINESS";

  const intent:
    WorkerBusinessIntent =
    isAllowed(
      rawIntent,
      BUSINESS_INTENTS
    )
      ? rawIntent
      : "BUSINESS_OVERVIEW";

  const periodPreset:
    WorkerPeriodPreset =
    isAllowed(
      rawPeriod,
      PERIOD_PRESETS
    )
      ? rawPeriod
      : "UNSPECIFIED";

  const comparisonMode:
    WorkerComparisonMode =
    isAllowed(
      rawComparison,
      COMPARISON_MODES
    )
      ? rawComparison
      : "NONE";

  let customFromDate:
    string | null =
    null;

  let customToDate:
    string | null =
    null;

  if (
    periodPreset ===
    "CUSTOM"
  ) {
    const from =
      clean(
        raw?.customFromDate
      );

    const to =
      clean(
        raw?.customToDate
      );

    customFromDate =
      isIsoDate(from)
        ? from
        : null;

    customToDate =
      isIsoDate(to)
        ? to
        : null;
  }

  return {
    isBusinessQuery: true,

    domain,

    intent,

    periodPreset,

    comparisonMode,

    customFromDate,

    customToDate,

    confidence,

    reason,
  };
}

/**
 * ============================================================================
 * VALIDATION
 * ============================================================================
 */

export function validateWorkerSemanticBusinessIntent(
  semantic:
    WorkerSemanticBusinessIntent
): {
  valid: boolean;
  error: string | null;
} {
  if (
    typeof semantic
      ?.isBusinessQuery !==
    "boolean"
  ) {
    return {
      valid: false,
      error:
        "Invalid isBusinessQuery.",
    };
  }

  if (
    !isAllowed(
      semantic.domain,
      BUSINESS_DOMAINS
    )
  ) {
    return {
      valid: false,
      error:
        "Invalid business domain.",
    };
  }

  if (
    !isAllowed(
      semantic.intent,
      BUSINESS_INTENTS
    )
  ) {
    return {
      valid: false,
      error:
        "Invalid business intent.",
    };
  }

  if (
    !isAllowed(
      semantic.periodPreset,
      PERIOD_PRESETS
    )
  ) {
    return {
      valid: false,
      error:
        "Invalid period preset.",
    };
  }

  if (
    !isAllowed(
      semantic.comparisonMode,
      COMPARISON_MODES
    )
  ) {
    return {
      valid: false,
      error:
        "Invalid comparison mode.",
    };
  }

  if (
    !Number.isFinite(
      semantic.confidence
    ) ||
    semantic.confidence < 0 ||
    semantic.confidence > 1
  ) {
    return {
      valid: false,
      error:
        "Invalid confidence.",
    };
  }

  if (
    semantic.periodPreset ===
    "CUSTOM"
  ) {
    if (
      !isIsoDate(
        semantic.customFromDate
      ) ||
      !isIsoDate(
        semantic.customToDate
      )
    ) {
      return {
        valid: false,
        error:
          "CUSTOM period requires both dates.",
      };
    }

    if (
      clean(
        semantic.customFromDate
      ) >
      clean(
        semantic.customToDate
      )
    ) {
      return {
        valid: false,
        error:
          "customFromDate cannot be after customToDate.",
      };
    }
  }

  return {
    valid: true,
    error: null,
  };
}

/**
 * ============================================================================
 * SYSTEM PROMPT
 * ============================================================================
 */

function buildBusinessIntentSystemPrompt(): string {
  return `
You are ZETRA AI Business Semantic Router.

Your only responsibility is semantic understanding.

Understand the user's real meaning even when the message contains:
- Kiswahili
- English
- mixed Kiswahili and English
- spelling errors
- shorthand
- informal speech
- incomplete grammar
- conversational references

Do not depend on exact keywords.

You MUST determine whether the current message is asking about the user's
business, business performance, business data, inventory, products,
customers, credit, cashflow, CRM, forecast, or business improvement.

You are NOT answering the user's question.

You MUST NOT invent, estimate, calculate, or infer financial numbers.

Never create:
- sales values
- profit values
- expenses
- COGS
- inventory quantities
- customer balances
- credit balances
- store rankings

Those values come from ZETRA's verified Business Intelligence Engine.

SEMANTIC EXAMPLES:

"Leo biashara imekaaje?"
"Hali yangu leo?"
"Leo tumepigaje?"
"Biashara imefanyaje leo?"
"How is my business doing today?"

Possible meaning:
domain = PERFORMANCE
intent = BUSINESS_OVERVIEW
periodPreset = TODAY
comparisonMode = NONE

"Leo tumefanya vizuri kuliko jana?"
"Jana na leo ipi nzuri?"
"Compare today and yesterday."
"Leo nimepiga hatua kuliko jana?"

Meaning:
domain = PERFORMANCE
intent = PERIOD_COMPARISON
periodPreset = TODAY
comparisonMode = PREVIOUS_DAY

"Faida yangu mwezi huu ikoje?"
Meaning:
domain = PROFIT
intent = PROFIT_SUMMARY
periodPreset = THIS_MONTH

"Ni branch gani inanipa profit zaidi?"
Meaning:
domain = PERFORMANCE
intent = STORE_COMPARISON

"Bidhaa gani zinaisha?"
Meaning:
domain = PRODUCTS
intent = LOW_STOCK

"Bidhaa gani hazitembei?"
Meaning:
domain = PRODUCTS
intent = SLOW_MOVING

"Madeni yangu yakoje?"
Meaning:
domain = CREDIT
intent = CREDIT_ANALYSIS

"Mteja gani ameacha kununua?"
Meaning:
domain = CUSTOMERS
intent = CUSTOMER_ANALYSIS

"Nifanye nini kuongeza faida?"
Meaning:
domain = PROFIT
intent = BUSINESS_COACH

"Faida inapotea wapi?"
Meaning:
domain = PROFIT
intent = PROFIT_LEAK

"Wiki ijayo biashara inaweza kwenda vipi?"
Meaning:
domain = FORECAST
intent = FORECAST

ALLOWED DOMAINS:

PERFORMANCE
SALES
PROFIT
EXPENSES
INVENTORY
PRODUCTS
CUSTOMERS
CRM
CREDIT
CASHFLOW
FORECAST
GENERAL_BUSINESS

ALLOWED INTENTS:

BUSINESS_OVERVIEW
BUSINESS_HEALTH
SALES_SUMMARY
PROFIT_SUMMARY
EXPENSE_SUMMARY
INVENTORY_SUMMARY
TOP_PRODUCTS
LOW_STOCK
OUT_OF_STOCK
SLOW_MOVING
PERIOD_COMPARISON
STORE_COMPARISON
TREND_ANALYSIS
FORECAST
BUSINESS_COACH
PROFIT_LEAK
CUSTOMER_ANALYSIS
CRM_ANALYSIS
CREDIT_ANALYSIS
CASHFLOW_ANALYSIS
UNKNOWN

ALLOWED PERIOD PRESETS:

TODAY
YESTERDAY
THIS_WEEK
LAST_7_DAYS
THIS_MONTH
LAST_30_DAYS
THIS_YEAR
CUSTOM
UNSPECIFIED

ALLOWED COMPARISON MODES:

NONE
PREVIOUS_DAY
PREVIOUS_PERIOD
PREVIOUS_WEEK
PREVIOUS_MONTH
PREVIOUS_YEAR
CUSTOM

PERIOD RULES:

today / leo:
TODAY

yesterday / jana:
YESTERDAY

current week:
THIS_WEEK

last seven days:
LAST_7_DAYS

current month:
THIS_MONTH

last thirty days:
LAST_30_DAYS

current year:
THIS_YEAR

explicit from/to dates:
CUSTOM

No period stated:
UNSPECIFIED

COMPARISON RULES:

today versus yesterday:
PREVIOUS_DAY

current period versus immediately preceding equivalent period:
PREVIOUS_PERIOD

this week versus previous week:
PREVIOUS_WEEK

this month versus previous month:
PREVIOUS_MONTH

this year versus previous year:
PREVIOUS_YEAR

no comparison:
NONE

IMPORTANT CONTEXT RULE:

Recent conversation may clarify ambiguous follow-up questions.

Example:

USER:
"Profit yangu leo ni kiasi gani?"

ASSISTANT:
"Your verified profit is ..."

USER:
"Na jana?"

The final message should still be understood as a business request because
recent conversation establishes the business subject.

NON-BUSINESS RULE:

If the current message is not asking about the user's business or business
data, return isBusinessQuery=false.

Do not force ordinary conversation, writing, health, engineering, legal,
general knowledge, or unrelated questions into business intelligence.

Return only the required structured object.
`.trim();
}

/**
 * ============================================================================
 * USER PROMPT
 * ============================================================================
 */

function buildBusinessIntentUserPrompt(
  input:
    BusinessIntentClassifierInput
): string {
  const lines: string[] = [];

  const businessDate =
    clean(
      input.businessDate
    );

  const timezone =
    clean(
      input.timezone
    );

  const organizationName =
    clean(
      input.organizationName
    );

  const storeName =
    clean(
      input.storeName
    );

  if (businessDate) {
    lines.push(
      `Current business date: ${businessDate}`
    );
  }

  if (timezone) {
    lines.push(
      `Business timezone: ${timezone}`
    );
  }

  if (organizationName) {
    lines.push(
      `Active organization: ${organizationName}`
    );
  }

  if (storeName) {
    lines.push(
      `Active store: ${storeName}`
    );
  }

  const history =
    Array.isArray(
      input.history
    )
      ? input.history
          .filter(
            (item) =>
              (item?.role ===
                "user" ||
                item?.role ===
                  "assistant") &&
              !!clean(item?.text)
          )
          .slice(-6)
      : [];

  if (history.length) {
    lines.push("");
    lines.push(
      "Recent conversation:"
    );

    for (const item of history) {
      lines.push(
        `${item.role.toUpperCase()}: ${safeSlice(
          item.text,
          500
        )}`
      );
    }
  }

  lines.push("");
  lines.push(
    "Current user message:"
  );

  lines.push(
    safeSlice(
      input.text,
      4000
    )
  );

  return lines
    .join("\n")
    .trim();
}

/**
 * ============================================================================
 * STRUCTURED OUTPUT JSON SCHEMA
 * ============================================================================
 */

const BUSINESS_INTENT_JSON_SCHEMA = {
  name:
    "zetra_business_semantic_intent",

  strict:
    true,

  schema: {
    type:
      "object",

    additionalProperties:
      false,

    properties: {
      isBusinessQuery: {
        type:
          "boolean",
      },

      domain: {
        type:
          "string",

        enum:
          BUSINESS_DOMAINS,
      },

      intent: {
        type:
          "string",

        enum:
          BUSINESS_INTENTS,
      },

      periodPreset: {
        type:
          "string",

        enum:
          PERIOD_PRESETS,
      },

      comparisonMode: {
        type:
          "string",

        enum:
          COMPARISON_MODES,
      },

      customFromDate: {
        anyOf: [
          {
            type:
              "string",
          },
          {
            type:
              "null",
          },
        ],
      },

      customToDate: {
        anyOf: [
          {
            type:
              "string",
          },
          {
            type:
              "null",
          },
        ],
      },

      confidence: {
        type:
          "number",

        minimum:
          0,

        maximum:
          1,
      },

      reason: {
        anyOf: [
          {
            type:
              "string",
          },
          {
            type:
              "null",
          },
        ],
      },
    },

    required: [
      "isBusinessQuery",
      "domain",
      "intent",
      "periodPreset",
      "comparisonMode",
      "customFromDate",
      "customToDate",
      "confidence",
      "reason",
    ],
  },
} as const;

/**
 * ============================================================================
 * OPENAI RESPONSE EXTRACTION
 * ============================================================================
 */

function extractAssistantContent(
  data: any
): string {
  const content =
    data?.choices?.[0]
      ?.message?.content;

  if (
    typeof content ===
    "string"
  ) {
    return clean(content);
  }

  if (
    Array.isArray(content)
  ) {
    return content
      .map((part: any) => {
        if (
          typeof part ===
          "string"
        ) {
          return part;
        }

        return clean(
          part?.text
        );
      })
      .filter(Boolean)
      .join("");
  }

  return "";
}

function extractJsonObject(
  raw: unknown
): string {
  let text =
    clean(raw);

  if (!text) {
    return "";
  }

  text = text
    .replace(
      /^```json\s*/i,
      ""
    )
    .replace(
      /^```\s*/i,
      ""
    )
    .replace(
      /\s*```$/i,
      ""
    )
    .trim();

  if (
    text.startsWith("{") &&
    text.endsWith("}")
  ) {
    return text;
  }

  const firstBrace =
    text.indexOf("{");

  const lastBrace =
    text.lastIndexOf("}");

  if (
    firstBrace >= 0 &&
    lastBrace >
      firstBrace
  ) {
    return text.slice(
      firstBrace,
      lastBrace + 1
    );
  }

  return "";
}

function extractOpenAiError(
  parsed: any,
  raw: string
): string {
  return (
    clean(
      parsed?.error?.message
    ) ||
    clean(
      parsed?.message
    ) ||
    clean(
      parsed?.error
    ) ||
    safeSlice(
      raw,
      500
    ) ||
    "Unknown OpenAI error"
  );
}

/**
 * ============================================================================
 * OPENAI CALL
 * ============================================================================
 */

async function callOpenAiClassifier(
  params: {
    apiKey: string;

    model: string;

    systemPrompt: string;

    userPrompt: string;

    structuredOutput:
      boolean;

    timeoutMs:
      number;
  }
): Promise<{
  ok: boolean;

  status: number;

  rawText: string;

  error: string;
}> {
  const body: any = {
    model:
      params.model,

    messages: [
      {
        role:
          "system",

        content:
          params.systemPrompt,
      },
      {
        role:
          "user",

        content:
          params.userPrompt,
      },
    ],

    temperature:
      0,

    max_tokens:
      350,
  };

  if (
    params.structuredOutput
  ) {
    body.response_format = {
      type:
        "json_schema",

      json_schema:
        BUSINESS_INTENT_JSON_SCHEMA,
    };
  } else {
    body.response_format = {
      type:
        "json_object",
    };
  }

  try {
    const response =
      await fetchWithTimeout(
        "https://api.openai.com/v1/chat/completions",
        {
          method:
            "POST",

          headers: {
            Authorization:
              `Bearer ${params.apiKey}`,

            "Content-Type":
              "application/json",
          },

          body:
            JSON.stringify(
              body
            ),
        },
        params.timeoutMs
      );

    const {
      parsed,
      raw,
    } =
      await readJsonSafe(
        response
      );

    if (!response.ok) {
      return {
        ok: false,

        status:
          response.status,

        rawText:
          "",

        error:
          extractOpenAiError(
            parsed,
            raw
          ),
      };
    }

    const rawText =
      extractAssistantContent(
        parsed
      );

    if (!rawText) {
      return {
        ok: false,

        status:
          500,

        rawText:
          "",

        error:
          "OpenAI returned empty semantic classifier content.",
      };
    }

    return {
      ok: true,

      status:
        200,

      rawText,

      error:
        "",
    };
  } catch (error) {
    if (
      isAbortError(
        error
      )
    ) {
      return {
        ok: false,

        status:
          408,

        rawText:
          "",

        error:
          "OpenAI semantic classifier timed out.",
      };
    }

    return {
      ok: false,

      status:
        500,

      rawText:
        "",

      error:
        clean(
          (error as any)?.message
        ) ||
        "OpenAI semantic classifier failed.",
    };
  }
}

/**
 * ============================================================================
 * PARSE MODEL RESULT
 * ============================================================================
 */

function parseClassifierResult(
  rawText: string
):
  | {
      ok: true;

      semanticIntent:
        WorkerSemanticBusinessIntent;
    }
  | {
      ok: false;

      error:
        string;
    } {
  const jsonText =
    extractJsonObject(
      rawText
    );

  if (!jsonText) {
    return {
      ok: false,

      error:
        "Semantic classifier did not return JSON.",
    };
  }

  try {
    const parsed =
      JSON.parse(
        jsonText
      );

    const semanticIntent =
      normalizeWorkerSemanticBusinessIntent(
        parsed
      );

    const validation =
      validateWorkerSemanticBusinessIntent(
        semanticIntent
      );

    if (!validation.valid) {
      return {
        ok: false,

        error:
          validation.error ||
          "Semantic intent validation failed.",
      };
    }

    return {
      ok: true,

      semanticIntent,
    };
  } catch {
    return {
      ok: false,

      error:
        "Failed to parse semantic classifier JSON.",
    };
  }
}

/**
 * ============================================================================
 * MAIN CLASSIFIER
 * ============================================================================
 */

export async function classifyBusinessIntent(
  env:
    BusinessIntentClassifierEnv,

  input:
    BusinessIntentClassifierInput,

  options?: {
    timeoutMs?: number;
  }
): Promise<BusinessIntentClassifierResult> {
  const apiKey =
    clean(
      env.OPENAI_API_KEY
    );

  if (!apiKey) {
    return {
      ok: false,

      code:
        "MISSING_API_KEY",

      error:
        "Missing OPENAI_API_KEY.",
    };
  }

  const text =
    clean(
      input?.text
    );

  if (!text) {
    return {
      ok: false,

      code:
        "INVALID_INPUT",

      error:
        "Business semantic classifier requires text.",
    };
  }

  const model =
    clean(
      env.OPENAI_CLASSIFIER_MODEL
    ) ||
    clean(
      env.OPENAI_MODEL
    ) ||
    "gpt-4o-mini";

  const timeoutMs =
    Math.max(
      4000,
      Math.min(
        Number(
          options
            ?.timeoutMs ??
            18_000
        ) ||
          18_000,
        40_000
      )
    );

  const systemPrompt =
    buildBusinessIntentSystemPrompt();

  const userPrompt =
    buildBusinessIntentUserPrompt(
      input
    );

  /**
   * --------------------------------------------------------------------------
   * FIRST ATTEMPT
   *
   * Prefer strict Structured Outputs.
   * --------------------------------------------------------------------------
   */

  const strictResult =
    await callOpenAiClassifier({
      apiKey,

      model,

      systemPrompt,

      userPrompt,

      structuredOutput:
        true,

      timeoutMs,
    });

  if (strictResult.ok) {
    const parsed =
      parseClassifierResult(
        strictResult.rawText
      );

    if (parsed.ok) {
      return {
        ok: true,

        semanticIntent:
          parsed.semanticIntent,

        model,

        source:
          "OPENAI_STRUCTURED_OUTPUT",
      };
    }
  }

  /**
   * --------------------------------------------------------------------------
   * SECOND ATTEMPT
   *
   * Some model/config combinations may not support json_schema.
   *
   * Retry using JSON object mode instead of failing ZETRA AI.
   * --------------------------------------------------------------------------
   */

  const fallbackResult =
    await callOpenAiClassifier({
      apiKey,

      model,

      systemPrompt:

        `${systemPrompt}

Return ONLY one JSON object with exactly these fields:

{
  "isBusinessQuery": boolean,
  "domain": string,
  "intent": string,
  "periodPreset": string,
  "comparisonMode": string,
  "customFromDate": string|null,
  "customToDate": string|null,
  "confidence": number,
  "reason": string|null
}

Never include markdown.
Never include explanation outside JSON.`,

      userPrompt,

      structuredOutput:
        false,

      timeoutMs,
    });

  if (!fallbackResult.ok) {
    if (
      fallbackResult.status ===
      408
    ) {
      return {
        ok: false,

        code:
          "OPENAI_TIMEOUT",

        error:
          fallbackResult.error,
      };
    }

    return {
      ok: false,

      code:
        "OPENAI_HTTP_ERROR",

      error:
        fallbackResult.error ||
        strictResult.error ||
        "Semantic classifier failed.",
    };
  }

  const parsedFallback =
    parseClassifierResult(
      fallbackResult.rawText
    );

  if (!parsedFallback.ok) {
    return {
      ok: false,

      code:
        "OPENAI_PARSE_ERROR",

      error:
        parsedFallback.error,
    };
  }

  return {
    ok: true,

    semanticIntent:
      parsedFallback.semanticIntent,

    model,

    source:
      "OPENAI_JSON_FALLBACK",
  };
}

/**
 * ============================================================================
 * EXPORT
 * ============================================================================
 */

export const zetraBusinessIntentClassifier = {
  classify:
    classifyBusinessIntent,

  normalize:
    normalizeWorkerSemanticBusinessIntent,

  validate:
    validateWorkerSemanticBusinessIntent,

  createNonBusinessIntent:
    createWorkerNonBusinessIntent,
} as const;