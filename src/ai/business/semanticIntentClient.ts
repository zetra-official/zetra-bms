// src/ai/business/semanticIntentClient.ts

import {
  parseSemanticBusinessIntent,
  validateSemanticBusinessIntent,
} from "./semanticIntent";

import type {
  ZetraAiSemanticBusinessIntent,
} from "./types";

export type ZetraAiSemanticIntentClientContext = {
  organizationId: string | null;
  organizationName?: string | null;

  storeId?: string | null;
  storeName?: string | null;

  role?: string | null;
  planCode?: string | null;

  businessDate?: string | null;
  timezone?: string | null;
};

export type ZetraAiSemanticIntentHistoryItem = {
  role: "user" | "assistant";
  content: string;
};

export type ZetraAiSemanticIntentRequest = {
  workerUrl: string;

  text: string;

  context: ZetraAiSemanticIntentClientContext;

  history?: ZetraAiSemanticIntentHistoryItem[];

  headers: Record<string, string>;

  signal?: AbortSignal;

  timeoutMs?: number;
};

export type ZetraAiSemanticIntentClientResult =
  | {
      ok: true;
      intent: ZetraAiSemanticBusinessIntent;

      meta?: {
        source?: string | null;
        model?: string | null;
        requestId?: string | null;
      } | null;
    }
  | {
      ok: false;

      code:
        | "INVALID_REQUEST"
        | "NETWORK_ERROR"
        | "TIMEOUT"
        | "UNAUTHORIZED"
        | "FORBIDDEN"
        | "WORKER_ERROR"
        | "INVALID_RESPONSE";

      error: string;

      status?: number | null;
    };

function clean(value: unknown): string {
  return String(value ?? "").trim();
}

function normalizeWorkerUrl(value: unknown): string {
  return clean(value).replace(/\/+$/, "");
}

function safeJsonParse(text: string): any | null {
  const raw = clean(text);

  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function safeClip(value: unknown, max = 700): string {
  const text = clean(value);

  if (!text) return "";

  if (text.length <= max) {
    return text;
  }

  return `${text.slice(0, max)}…`;
}

function normalizeHistory(
  history: ZetraAiSemanticIntentHistoryItem[] | undefined
): ZetraAiSemanticIntentHistoryItem[] {
  if (!Array.isArray(history)) {
    return [];
  }

  return history
    .map((item) => {
      const role =
        item?.role === "assistant"
          ? "assistant"
          : item?.role === "user"
          ? "user"
          : null;

      const content = clean(item?.content);

      if (!role || !content) {
        return null;
      }

      return {
        role,
        content: content.slice(0, 1500),
      } satisfies ZetraAiSemanticIntentHistoryItem;
    })
    .filter(
      (
        item
      ): item is ZetraAiSemanticIntentHistoryItem =>
        item !== null
    )
    .slice(-8);
}

function getErrorMessageFromBody(data: any, textBody: string): string {
  return (
    clean(data?.error) ||
    clean(data?.message) ||
    clean(data?.detail) ||
    clean(textBody)
  );
}

type ZetraAiSemanticIntentErrorCode =
  | "INVALID_REQUEST"
  | "NETWORK_ERROR"
  | "TIMEOUT"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "WORKER_ERROR"
  | "INVALID_RESPONSE";

function getErrorCodeFromStatus(
  status: number
): ZetraAiSemanticIntentErrorCode {
  if (status === 401) {
    return "UNAUTHORIZED";
  }

  if (status === 403) {
    return "FORBIDDEN";
  }

  return "WORKER_ERROR";
}

function extractIntentPayload(data: any): unknown {
  if (!data || typeof data !== "object") {
    return null;
  }

  if (data.intent && typeof data.intent === "object") {
    return data.intent;
  }

  if (
    data.semanticIntent &&
    typeof data.semanticIntent === "object"
  ) {
    return data.semanticIntent;
  }

  if (
    data.businessIntent &&
    typeof data.businessIntent === "object"
  ) {
    return data.businessIntent;
  }

  if (
    data.result &&
    typeof data.result === "object"
  ) {
    if (
      data.result.intent &&
      typeof data.result.intent === "object"
    ) {
      return data.result.intent;
    }

    return data.result;
  }

  if (
    typeof data.isBusinessQuery === "boolean"
  ) {
    return data;
  }

  return null;
}

function parseIntentPayload(
  payload: unknown
): ZetraAiSemanticBusinessIntent | null {
  if (!payload) {
    return null;
  }

  try {
    const raw =
      typeof payload === "string"
        ? payload
        : JSON.stringify(payload);

    const parsed = parseSemanticBusinessIntent(raw);

    if (!validateSemanticBusinessIntent(parsed)) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

async function fetchWithTimeout(params: {
  url: string;
  init: RequestInit;
  externalSignal?: AbortSignal;
  timeoutMs: number;
}): Promise<Response> {
  const controller = new AbortController();

  let timeoutTriggered = false;

  const timeoutId = setTimeout(() => {
    timeoutTriggered = true;

    try {
      controller.abort();
    } catch {}
  }, params.timeoutMs);

  const onExternalAbort = () => {
    try {
      controller.abort();
    } catch {}
  };

  if (params.externalSignal) {
    if (params.externalSignal.aborted) {
      clearTimeout(timeoutId);

      throw new DOMException(
        "Request aborted",
        "AbortError"
      );
    }

    params.externalSignal.addEventListener(
      "abort",
      onExternalAbort,
      {
        once: true,
      }
    );
  }

  try {
    return await fetch(params.url, {
      ...params.init,
      signal: controller.signal,
    });
  } catch (error: any) {
    if (timeoutTriggered) {
      const timeoutError = new Error(
        "Semantic intent request timed out."
      );

      (timeoutError as any).__zetraTimeout = true;

      throw timeoutError;
    }

    throw error;
  } finally {
    clearTimeout(timeoutId);

    params.externalSignal?.removeEventListener(
      "abort",
      onExternalAbort
    );
  }
}

/**
 * Calls the EXISTING ZETRA AI Worker semantic-intent endpoint.
 *
 * IMPORTANT:
 * - No OpenAI API key exists here.
 * - Authentication is supplied by the caller.
 * - This client does not calculate business numbers.
 * - This client does not query Supabase business tables.
 * - It only requests semantic interpretation from the Worker.
 *
 * Expected Worker route:
 *
 * POST /v1/business/intent
 *
 * Expected success response:
 *
 * {
 *   ok: true,
 *   intent: {
 *     isBusinessQuery: true,
 *     domain: "PROFIT",
 *     intent: "PROFIT_SUMMARY",
 *     periodPreset: "TODAY",
 *     comparisonMode: "NONE",
 *     customFromDate: null,
 *     customToDate: null,
 *     confidence: 0.98,
 *     reason: "..."
 *   }
 * }
 */
export async function requestSemanticBusinessIntent(
  params: ZetraAiSemanticIntentRequest
): Promise<ZetraAiSemanticIntentClientResult> {
  const workerUrl = normalizeWorkerUrl(
    params.workerUrl
  );

  const text = clean(params.text);

  const organizationId = clean(
    params.context?.organizationId
  );

  if (!workerUrl) {
    return {
      ok: false,
      code: "INVALID_REQUEST",
      error: "AI Worker URL is missing.",
    };
  }

  if (!text) {
    return {
      ok: false,
      code: "INVALID_REQUEST",
      error: "Semantic intent text is empty.",
    };
  }

  if (!organizationId) {
    return {
      ok: false,
      code: "INVALID_REQUEST",
      error: "Organization ID is missing.",
    };
  }

  const url = `${workerUrl}/v1/business/intent`;

  const history = normalizeHistory(
    params.history
  );

  const body = {
    text,

    history,

   context: {
  organizationId,
  orgId: organizationId,
  activeOrgId: organizationId,

  organizationName:
        clean(
          params.context?.organizationName
        ) || null,

      storeId:
        clean(params.context?.storeId) ||
        null,

      storeName:
        clean(params.context?.storeName) ||
        null,

      role:
        clean(params.context?.role) ||
        null,

      planCode:
        clean(params.context?.planCode) ||
        null,

      businessDate:
        clean(
          params.context?.businessDate
        ) || null,

      timezone:
        clean(params.context?.timezone) ||
        null,

      module: "ZETRA_BMS_AI",

      purpose:
        "SEMANTIC_BUSINESS_INTENT",
    },
  };

  const headers: Record<string, string> = {
    ...params.headers,
    "Content-Type": "application/json",
  };

  try {
    const response = await fetchWithTimeout({
      url,

      init: {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      },

      externalSignal: params.signal,

      timeoutMs:
        typeof params.timeoutMs === "number" &&
        params.timeoutMs > 0
          ? params.timeoutMs
          : 12_000,
    });

    const textBody = await response.text();

    const data =
      safeJsonParse(textBody) ?? {};

    if (!response.ok) {
      const message =
        getErrorMessageFromBody(
          data,
          textBody
        ) ||
        `Semantic intent request failed (${response.status}).`;

      return {
        ok: false,

        code: getErrorCodeFromStatus(
          response.status
        ),

        error: safeClip(message),

        status: response.status,
      };
    }

    if (data?.ok === false) {
      const message =
        getErrorMessageFromBody(
          data,
          textBody
        ) ||
        "Semantic intent worker returned an error.";

      return {
        ok: false,
        code: "WORKER_ERROR",
        error: safeClip(message),
        status: response.status,
      };
    }

    const payload =
      extractIntentPayload(data);

    const intent =
      parseIntentPayload(payload);

    if (!intent) {
      return {
        ok: false,
        code: "INVALID_RESPONSE",

        error:
          "Semantic intent response is invalid or does not match ZETRA AI business intent contract.",

        status: response.status,
      };
    }

    return {
      ok: true,

      intent,

      meta: {
        source:
          clean(data?.meta?.source) ||
          clean(data?.source) ||
          "ZETRA_AI_WORKER",

        model:
          clean(data?.meta?.model) ||
          clean(data?.model) ||
          null,

        requestId:
          clean(data?.meta?.requestId) ||
          clean(data?.requestId) ||
          null,
      },
    };
  } catch (error: any) {
    if (error?.__zetraTimeout) {
      return {
        ok: false,
        code: "TIMEOUT",
        error:
          clean(error?.message) ||
          "Semantic intent request timed out.",
      };
    }

    const message =
      clean(error?.message) ||
      "Semantic intent network request failed.";

    const lower =
      message.toLowerCase();

    if (
      lower.includes("abort") ||
      lower.includes("cancel")
    ) {
      return {
        ok: false,
        code: "NETWORK_ERROR",
        error: "Semantic intent request aborted.",
      };
    }

    return {
      ok: false,
      code: "NETWORK_ERROR",
      error: safeClip(message),
    };
  }
}

export const zetraAiSemanticIntentClient = {
  requestSemanticBusinessIntent,
} as const;