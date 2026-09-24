// src/ai/business/semanticIntent.ts

/**
 * ============================================================================
 * ZETRA AI — SEMANTIC BUSINESS INTELLIGENCE
 * ============================================================================
 *
 * Purpose:
 * Convert natural-language business questions into a strict structured
 * business intent contract.
 *
 * IMPORTANT ARCHITECTURE:
 *
 * User language
 *      ↓
 * OpenAI semantic understanding
 *      ↓
 * ZetraAiSemanticBusinessIntent
 *      ↓
 * businessBridge.ts
 *      ↓
 * Verified ZETRA business data
 *
 * PRINCIPLE:
 *
 * OpenAI decides:
 * - What the user means
 * - Which business domain is being discussed
 * - Which period the user refers to
 * - Whether comparison is requested
 *
 * OpenAI DOES NOT decide:
 * - Sales numbers
 * - Profit numbers
 * - Expenses
 * - COGS
 * - Inventory totals
 * - Store rankings
 *
 * Those always come from the ZETRA Business Intelligence Engine.
 *
 * This file:
 * - Builds the semantic classifier prompt.
 * - Validates model JSON.
 * - Normalizes model output.
 * - Provides safe fallback intent.
 *
 * This file DOES NOT:
 * - Call Supabase.
 * - Query business tables.
 * - Calculate business metrics.
 * - Store API keys.
 * ============================================================================
 */

import type {
  ZetraAiBusinessDomain,
  ZetraAiBusinessIntent,
  ZetraAiComparisonMode,
  ZetraAiPeriodPreset,
  ZetraAiSemanticBusinessIntent,
} from "./types";

/**
 * ============================================================================
 * MODEL RESPONSE TYPE
 * ============================================================================
 */

export interface ZetraAiSemanticIntentModelResponse {
  isBusinessQuery?: unknown;

  domain?: unknown;
  intent?: unknown;

  periodPreset?: unknown;
  comparisonMode?: unknown;

  customFromDate?: unknown;
  customToDate?: unknown;


  rollingDays?: unknown;
  confidence?: unknown;
  reason?: unknown;
}

/**
 * ============================================================================
 * ALLOWED CONTRACT VALUES
 * ============================================================================
 */

const BUSINESS_DOMAINS: readonly ZetraAiBusinessDomain[] = [
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

const BUSINESS_INTENTS: readonly ZetraAiBusinessIntent[] = [
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

const PERIOD_PRESETS: readonly ZetraAiPeriodPreset[] = [
  "TODAY",
  "YESTERDAY",
  "THIS_WEEK",
  "LAST_7_DAYS",
  "THIS_MONTH",
  "LAST_30_DAYS",
  "ROLLING_DAYS",
  "THIS_YEAR",
  "CUSTOM",
  "UNSPECIFIED",
] as const;

const COMPARISON_MODES: readonly ZetraAiComparisonMode[] = [
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

function isIsoDate(value: unknown): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(
    clean(value)
  );
}

function safeConfidence(value: unknown): number {
  const n = Number(value);

  if (!Number.isFinite(n)) {
    return 0;
  }

  return Math.max(
    0,
    Math.min(1, n)
  );
}

function isAllowedValue<T extends string>(
  value: string,
  allowed: readonly T[]
): value is T {
  return (
    allowed as readonly string[]
  ).includes(value);
}

/**
 * ============================================================================
 * SAFE NON-BUSINESS FALLBACK
 * ============================================================================
 *
 * We intentionally DO NOT fake a business intent when semantic classification
 * fails.
 *
 * This allows the normal ZETRA AI conversation path to continue safely.
 * ============================================================================
 */

export function createNonBusinessIntent(
  reason = "not_business_or_unresolved"
): ZetraAiSemanticBusinessIntent {
  return {
    isBusinessQuery: false,

    domain: "GENERAL_BUSINESS",

    intent: "UNKNOWN",

    periodPreset: "UNSPECIFIED",

    comparisonMode: "NONE",

    customFromDate: null,
    customToDate: null,


    rollingDays: null,

    confidence: 0,

    reason,
  };
}

/**
 * ============================================================================
 * DEFAULT BUSINESS INTENT
 * ============================================================================
 *
 * Used only when the model clearly says the request IS business-related,
 * but one secondary field is incomplete.
 *
 * We still avoid inventing a specialist business domain.
 * ============================================================================
 */

function createDefaultBusinessIntent(
  confidence: number,
  reason: string
): ZetraAiSemanticBusinessIntent {
  return {
    isBusinessQuery: true,

    domain: "GENERAL_BUSINESS",

    intent: "BUSINESS_OVERVIEW",

    periodPreset: "UNSPECIFIED",

    comparisonMode: "NONE",

    customFromDate: null,
    customToDate: null,

    confidence,

    reason,
  };
}

/**
 * ============================================================================
 * SEMANTIC SYSTEM PROMPT
 * ============================================================================
 */

export function buildSemanticBusinessIntentSystemPrompt(): string {
  return `
You are ZETRA AI Business Semantic Router.

Your ONLY job is to understand the meaning of the user's message and return
ONE strict JSON object.

You are NOT calculating business numbers.
You are NOT answering the user's question.
You are NOT inventing business data.

You are only translating natural language into structured business intent.

IMPORTANT LANGUAGE RULES:
- Understand Kiswahili.
- Understand English.
- Understand mixed Kiswahili + English.
- Understand casual language.
- Understand typing mistakes.
- Understand shortened words.
- Understand imperfect grammar.
- Infer meaning semantically instead of requiring exact keywords.

Examples of equivalent meanings:

"Leo biashara imekaaje?"
"Leo tumepigaje?"
"Hali yangu leo?"
"Biashara imefanyaje leo?"
"How is my business doing today?"

These can all mean BUSINESS_OVERVIEW for TODAY.

Another example:

"Leo tumefanya vizuri kuliko jana?"
"Compare today with yesterday"
"Jana na leo ipi iko vizuri?"
"Leo nimepiga hatua kuliko jana?"

These can all mean PERIOD_COMPARISON,
periodPreset TODAY,
comparisonMode PREVIOUS_DAY.

RETURN ONLY VALID JSON.

Required shape:

{
  "isBusinessQuery": true,
  "domain": "PERFORMANCE",
  "intent": "BUSINESS_OVERVIEW",
  "periodPreset": "TODAY",
  "comparisonMode": "NONE",
  "customFromDate": null,
  "customToDate": null,
    "rollingDays": null,
  "confidence": 0.95,
  "reason": "short machine-readable explanation"
}

ALLOWED domain values:

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

ALLOWED intent values:

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

ALLOWED periodPreset values:

TODAY
YESTERDAY
THIS_WEEK
LAST_7_DAYS
THIS_MONTH
LAST_30_DAYS
ROLLING_DAYS
THIS_YEAR
CUSTOM
UNSPECIFIED

ALLOWED comparisonMode values:

NONE
PREVIOUS_DAY
PREVIOUS_PERIOD
PREVIOUS_WEEK
PREVIOUS_MONTH
PREVIOUS_YEAR
CUSTOM

SEMANTIC GUIDANCE:

BUSINESS_OVERVIEW:
General question about business performance or current condition.

BUSINESS_HEALTH:
User wants an overall health/risk assessment.

SALES_SUMMARY:
User specifically asks about sales/revenue.

PROFIT_SUMMARY:
User specifically asks about profit.

EXPENSE_SUMMARY:
User asks about expenses/cost spending.

INVENTORY_SUMMARY:
User asks about general stock/inventory condition.

TOP_PRODUCTS:
User asks which products sell/perform best.

LOW_STOCK:
User asks which products are running low.

OUT_OF_STOCK:
User asks which products are finished/out.

SLOW_MOVING:
User asks about dead stock or products not moving.

PERIOD_COMPARISON:
User wants one time period compared with another.

STORE_COMPARISON:
User wants stores/branches compared against each other.

TREND_ANALYSIS:
User wants to know whether performance is rising, falling, or stable.

FORECAST:
User asks about future expected business performance.

BUSINESS_COACH:
User asks what they should do to improve the business.

PROFIT_LEAK:
User asks where profit/money is being lost.

CUSTOMER_ANALYSIS:
User asks for customer-related business analysis.

CRM_ANALYSIS:
User asks about CRM relationships/follow-up/customer engagement.

CREDIT_ANALYSIS:
User asks about debts/credit business performance.

CASHFLOW_ANALYSIS:
User asks about money flow/cashflow.

PERIOD RULES:

If user explicitly says today:
periodPreset = TODAY

If user explicitly says yesterday:
periodPreset = YESTERDAY

If user means current week:
periodPreset = THIS_WEEK

If user means last seven days:
periodPreset = LAST_7_DAYS

If user means current month:
periodPreset = THIS_MONTH

If user means last thirty days:
periodPreset = LAST_30_DAYS

If the user explicitly asks for an exact number of past days, use ROLLING_DAYS.
Examples:
"siku 30 zilizopita" => periodPreset = ROLLING_DAYS, rollingDays = 30
"siku 50 zilizopita" => periodPreset = ROLLING_DAYS, rollingDays = 50
"last 45 days" => periodPreset = ROLLING_DAYS, rollingDays = 45
"past 90 days" => periodPreset = ROLLING_DAYS, rollingDays = 90

Exact numeric rolling-day requests take priority over LAST_30_DAYS, including when the number is 30.

If user means current year:
periodPreset = THIS_YEAR

If user gives explicit start/end dates:
periodPreset = CUSTOM
customFromDate = YYYY-MM-DD
customToDate = YYYY-MM-DD

If no period is stated:
periodPreset = UNSPECIFIED

COMPARISON RULES:

today vs yesterday:
comparisonMode = PREVIOUS_DAY

current period vs immediately previous equivalent period:
comparisonMode = PREVIOUS_PERIOD

this week vs previous week:
comparisonMode = PREVIOUS_WEEK

this month vs previous month:
comparisonMode = PREVIOUS_MONTH

this year vs previous year:
comparisonMode = PREVIOUS_YEAR

No comparison:
comparisonMode = NONE

IMPORTANT:

If the request is NOT about the user's business/business data,
return:

{
  "isBusinessQuery": false,
  "domain": "GENERAL_BUSINESS",
  "intent": "UNKNOWN",
  "periodPreset": "UNSPECIFIED",
  "comparisonMode": "NONE",
  "customFromDate": null,
  "customToDate": null,
    "rollingDays": null,
  "confidence": 0.95,
  "reason": "not_business_query"
}

Never use values outside the allowed lists.

Never return markdown.

Never wrap JSON inside backticks.

Never answer the business question itself.
`.trim();
}

/**
 * ============================================================================
 * USER SEMANTIC INPUT BUILDER
 * ============================================================================
 */

export function buildSemanticBusinessIntentUserPrompt(params: {
  text: string;

  businessDate?: string | null;

  organizationName?: string | null;
  storeName?: string | null;

  recentHistory?: Array<{
    role: "user" | "assistant";
    text: string;
  }>;
}): string {
  const text = clean(
    params.text
  );

  const businessDate =
    clean(
      params.businessDate ?? ""
    );

  const organizationName =
    clean(
      params.organizationName ?? ""
    );

  const storeName =
    clean(
      params.storeName ?? ""
    );

  const history = Array.isArray(
    params.recentHistory
  )
    ? params.recentHistory
        .filter(
          (item) =>
            !!clean(item?.text)
        )
        .slice(-6)
    : [];

  const lines: string[] = [];

  if (businessDate) {
    lines.push(
      `Current business date: ${businessDate}`
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

  if (history.length > 0) {
    lines.push("");
    lines.push("Recent conversation:");

    for (const item of history) {
      lines.push(
        `${item.role.toUpperCase()}: ${clean(
          item.text
        )}`
      );
    }
  }

  lines.push("");
  lines.push("Current user message:");
  lines.push(text);

  return lines.join("\n").trim();
}

/**
 * ============================================================================
 * JSON EXTRACTION
 * ============================================================================
 *
 * The model is instructed to return raw JSON.
 *
 * This helper still tolerates accidental surrounding text / markdown fences
 * so a minor model-formatting error does not crash the application.
 * ============================================================================
 */

export function extractSemanticIntentJson(
  raw: unknown
): string {
  let text = clean(raw);

  if (!text) {
    return "";
  }

  text = text
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
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
    lastBrace > firstBrace
  ) {
    return text.slice(
      firstBrace,
      lastBrace + 1
    );
  }

  return "";
}

/**
 * ============================================================================
 * NORMALIZATION
 * ============================================================================
 */

export function normalizeSemanticBusinessIntent(
  input: ZetraAiSemanticIntentModelResponse
): ZetraAiSemanticBusinessIntent {
  const isBusinessQuery =
    input?.isBusinessQuery === true;

  const confidence =
    safeConfidence(
      input?.confidence
    );

  const reason =
    clean(
      input?.reason
    ) || null;

  if (!isBusinessQuery) {
    return {
      ...createNonBusinessIntent(
        reason ||
          "model_classified_non_business"
      ),

      confidence,
    };
  }

  const fallback =
    createDefaultBusinessIntent(
      confidence,
      reason ||
        "business_intent_normalized"
    );

  const rawDomain =
    upper(
      input?.domain
    );

  const rawIntent =
    upper(
      input?.intent
    );

  const rawPeriod =
    upper(
      input?.periodPreset
    );

  const rawComparison =
    upper(
      input?.comparisonMode
    );

  const domain: ZetraAiBusinessDomain =
    isAllowedValue(
      rawDomain,
      BUSINESS_DOMAINS
    )
      ? rawDomain
      : fallback.domain;

  const intent: ZetraAiBusinessIntent =
    isAllowedValue(
      rawIntent,
      BUSINESS_INTENTS
    )
      ? rawIntent
      : fallback.intent;

  const periodPreset: ZetraAiPeriodPreset =
    isAllowedValue(
      rawPeriod,
      PERIOD_PRESETS
    )
      ? rawPeriod
      : fallback.periodPreset;

  const comparisonMode: ZetraAiComparisonMode =
    isAllowedValue(
      rawComparison,
      COMPARISON_MODES
    )
      ? rawComparison
      : fallback.comparisonMode;

  let customFromDate:
    | string
    | null = null;

  let customToDate:
    | string
    | null = null;

  let rollingDays:
    | number
    | null = null;

  if (
    periodPreset === "ROLLING_DAYS"
  ) {
    const n =
      Number(
        input?.rollingDays
      );

    rollingDays =
      Number.isInteger(n) &&
      n >= 1 &&
      n <= 3650
        ? n
        : null;
  }

  if (
    periodPreset === "CUSTOM"
  ) {
    const from =
      clean(
        input?.customFromDate
      );

    const to =
      clean(
        input?.customToDate
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

    rollingDays,
    confidence,

    reason,
  };
}

/**
 * ============================================================================
 * PARSER
 * ============================================================================
 */

export function parseSemanticBusinessIntent(
  rawModelResponse: unknown
): ZetraAiSemanticBusinessIntent {
  const jsonText =
    extractSemanticIntentJson(
      rawModelResponse
    );

  if (!jsonText) {
    return createNonBusinessIntent(
      "semantic_json_missing"
    );
  }

  try {
    const parsed =
      JSON.parse(
        jsonText
      ) as ZetraAiSemanticIntentModelResponse;

    return normalizeSemanticBusinessIntent(
      parsed
    );
  } catch {
    return createNonBusinessIntent(
      "semantic_json_parse_failed"
    );
  }
}

/**
 * ============================================================================
 * VALIDATION
 * ============================================================================
 */

export function validateSemanticBusinessIntent(
  intent: ZetraAiSemanticBusinessIntent
): {
  valid: boolean;
  error: string | null;
} {
  if (
    typeof intent?.isBusinessQuery !==
    "boolean"
  ) {
    return {
      valid: false,
      error:
        "isBusinessQuery is invalid.",
    };
  }

  if (
    !isAllowedValue(
      clean(intent.domain),
      BUSINESS_DOMAINS
    )
  ) {
    return {
      valid: false,
      error:
        "domain is invalid.",
    };
  }

  if (
    !isAllowedValue(
      clean(intent.intent),
      BUSINESS_INTENTS
    )
  ) {
    return {
      valid: false,
      error:
        "intent is invalid.",
    };
  }

  if (
    !isAllowedValue(
      clean(intent.periodPreset),
      PERIOD_PRESETS
    )
  ) {
    return {
      valid: false,
      error:
        "periodPreset is invalid.",
    };
  }

  if (
    !isAllowedValue(
      clean(intent.comparisonMode),
      COMPARISON_MODES
    )
  ) {
    return {
      valid: false,
      error:
        "comparisonMode is invalid.",
    };
  }

  if (
    !Number.isFinite(
      intent.confidence
    ) ||
    intent.confidence < 0 ||
    intent.confidence > 1
  ) {
    return {
      valid: false,
      error:
        "confidence must be between 0 and 1.",
    };
  }

  if (
    intent.periodPreset ===
    "ROLLING_DAYS"
  ) {
    if (
      !Number.isInteger(
        intent.rollingDays
      ) ||
      Number(intent.rollingDays) < 1 ||
      Number(intent.rollingDays) > 3650
    ) {
      return {
        valid: false,
        error:
          "ROLLING_DAYS period requires a valid rollingDays integer between 1 and 3650.",
      };
    }
  }

  if (
    intent.periodPreset ===
    "CUSTOM"
  ) {
    if (
      !isIsoDate(
        intent.customFromDate
      ) ||
      !isIsoDate(
        intent.customToDate
      )
    ) {
      return {
        valid: false,
        error:
          "CUSTOM period requires valid customFromDate and customToDate.",
      };
    }

    if (
      clean(
        intent.customFromDate
      ) >
      clean(
        intent.customToDate
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
 * BUSINESS ENGINE ELIGIBILITY
 * ============================================================================
 *
 * Some domains are already supported by our canonical snapshot engine.
 *
 * Others will be plugged in later:
 * CRM, Customers, Credit, Cashflow specialist engines, etc.
 *
 * This prevents us from pretending the snapshot engine knows information
 * it does not contain.
 * ============================================================================
 */

export function isCanonicalSnapshotIntent(
  semantic: ZetraAiSemanticBusinessIntent
): boolean {
  if (!semantic.isBusinessQuery) {
    return false;
  }

  switch (semantic.intent) {
    case "BUSINESS_OVERVIEW":
    case "BUSINESS_HEALTH":
    case "SALES_SUMMARY":
    case "PROFIT_SUMMARY":
    case "EXPENSE_SUMMARY":
    case "INVENTORY_SUMMARY":
    case "PERIOD_COMPARISON":
    case "STORE_COMPARISON":
    case "TREND_ANALYSIS":
    case "FORECAST":
    case "BUSINESS_COACH":
    case "PROFIT_LEAK":
      return true;

    /**
     * Product-level names are NOT contained in the canonical daily snapshot.
     * They require specialist product intelligence.
     */
    case "TOP_PRODUCTS":
    case "LOW_STOCK":
    case "OUT_OF_STOCK":
    case "SLOW_MOVING":
      return false;

    /**
     * Future specialist engines.
     */
    case "CUSTOMER_ANALYSIS":
    case "CRM_ANALYSIS":
    case "CREDIT_ANALYSIS":
    case "CASHFLOW_ANALYSIS":
      return false;

    case "UNKNOWN":
    default:
      return false;
  }
}

/**
 * ============================================================================
 * SPECIALIST ENGINE ROUTING
 * ============================================================================
 */

export type ZetraAiSpecialistBusinessEngine =
  | "CANONICAL_SNAPSHOT"
  | "PRODUCT_INTELLIGENCE"
  | "CUSTOMER_INTELLIGENCE"
  | "CRM_INTELLIGENCE"
  | "CREDIT_INTELLIGENCE"
  | "CASHFLOW_INTELLIGENCE"
  | "NONE";

export function resolveSpecialistBusinessEngine(
  semantic: ZetraAiSemanticBusinessIntent
): ZetraAiSpecialistBusinessEngine {
  if (
    !semantic.isBusinessQuery
  ) {
    return "NONE";
  }

  if (
    isCanonicalSnapshotIntent(
      semantic
    )
  ) {
    return "CANONICAL_SNAPSHOT";
  }

  switch (semantic.intent) {
    case "TOP_PRODUCTS":
    case "LOW_STOCK":
    case "OUT_OF_STOCK":
    case "SLOW_MOVING":
      return "PRODUCT_INTELLIGENCE";

    case "CUSTOMER_ANALYSIS":
      return "CUSTOMER_INTELLIGENCE";

    case "CRM_ANALYSIS":
      return "CRM_INTELLIGENCE";

    case "CREDIT_ANALYSIS":
      return "CREDIT_INTELLIGENCE";

    case "CASHFLOW_ANALYSIS":
      return "CASHFLOW_INTELLIGENCE";

    default:
      return "NONE";
  }
}

/**
 * ============================================================================
 * EXPORT
 * ============================================================================
 */

export const zetraAiSemanticIntent = {
  buildSystemPrompt:
    buildSemanticBusinessIntentSystemPrompt,

  buildUserPrompt:
    buildSemanticBusinessIntentUserPrompt,

  extractJson:
    extractSemanticIntentJson,

  normalize:
    normalizeSemanticBusinessIntent,

  parse:
    parseSemanticBusinessIntent,

  validate:
    validateSemanticBusinessIntent,

  isCanonicalSnapshotIntent,

  resolveSpecialistBusinessEngine,

  createNonBusinessIntent,
} as const;