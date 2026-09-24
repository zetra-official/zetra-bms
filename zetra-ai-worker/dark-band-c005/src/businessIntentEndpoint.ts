// src/ai/worker/businessIntentEndpoint.ts

/**
 * ============================================================================
 * ZETRA AI WORKER â€” BUSINESS INTENT ENDPOINT
 * ============================================================================
 *
 * PURPOSE
 *
 * Handler for:
 *
 * POST /v1/business/intent
 *
 * This endpoint:
 * - receives an already authenticated ZETRA AI request
 * - receives verified organization/store context
 * - calls the semantic business classifier
 * - returns strict structured business intent
 *
 * IMPORTANT:
 *
 * Authentication, subscription access, owner validation, and store ownership
 * remain responsibilities of the main Worker security layer.
 *
 * This file DOES NOT:
 * - query financial tables
 * - calculate sales/profit
 * - consume AI business data
 * - fabricate metrics
 *
 * ============================================================================
 */

import {
  classifyBusinessIntent,
  type BusinessIntentClassifierEnv,
  type BusinessIntentHistoryItem,
  type WorkerSemanticBusinessIntent,
} from "./businessIntentClassifier.ts";

/**
 * ============================================================================
 * TYPES
 * ============================================================================
 */

export interface BusinessIntentEndpointEnv
  extends BusinessIntentClassifierEnv {}

export interface BusinessIntentVerifiedAccess {
  userId: string;

  organizationId: string;

  role: string;

  planCode?: string | null;

  planName?: string | null;

  creditsRemaining?: number | null;
}

export interface BusinessIntentVerifiedStore {
  storeId: string | null;

  storeName?: string | null;

  timezone?: string | null;

  /**
   * YYYY-MM-DD in the store/business timezone.
   */
  businessDate: string;
}

export interface BusinessIntentEndpointBody {
  text?: unknown;

  locale?: unknown;

  context?: {
    orgId?: unknown;
    activeOrgId?: unknown;

    activeOrgName?: unknown;

    activeStoreId?: unknown;
    storeId?: unknown;

    activeStoreName?: unknown;
    storeName?: unknown;

    businessDate?: unknown;

    timezone?: unknown;

    activeRole?: unknown;

    [key: string]: unknown;
  };

  history?: unknown;
}

export interface BusinessIntentEndpointDependencies {
  /**
   * Verified server-side access.
   *
   * Never build this object directly from client context.
   */
  access: BusinessIntentVerifiedAccess;

  /**
   * Verified store/business date context.
   *
   * The main worker should verify the requested store belongs to the
   * authenticated organization before calling this endpoint handler.
   */
  store: BusinessIntentVerifiedStore;
}

export type BusinessIntentEndpointResult =
  | {
      ok: true;

      status: 200;

      body: {
        ok: true;

        semanticIntent: WorkerSemanticBusinessIntent;

        meta: {
          source:
            | "OPENAI_STRUCTURED_OUTPUT"
            | "OPENAI_JSON_FALLBACK";

          model: string;

          organizationId: string;

          storeId: string | null;

          businessDate: string;

          timezone: string | null;
        };
      };
    }
  | {
      ok: false;

      status: number;

      body: {
        ok: false;

        code: string;

        error: string;
      };
    };

/**
 * ============================================================================
 * HELPERS
 * ============================================================================
 */

function clean(
  value: unknown
): string {
  return String(
    value ?? ""
  ).trim();
}

function isIsoDate(
  value: unknown
): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(
    clean(value)
  );
}

function normalizeHistory(
  raw: unknown
): BusinessIntentHistoryItem[] {
  if (
    !Array.isArray(raw)
  ) {
    return [];
  }

  const out:
    BusinessIntentHistoryItem[] =
    [];

  for (
    const item of raw
  ) {
    if (
      !item ||
      typeof item !==
        "object"
    ) {
      continue;
    }

    const role =
      (item as any)?.role ===
      "assistant"
        ? "assistant"
        : (item as any)?.role ===
          "user"
        ? "user"
        : null;

    const text =
      clean(
        (item as any)?.text
      );

    if (
      !role ||
      !text
    ) {
      continue;
    }

    out.push({
      role,
      text:
        text.length > 1000
          ? text.slice(
              0,
              1000
            )
          : text,
    });
  }

  return out.slice(-6);
}

function fail(
  status: number,
  code: string,
  error: string
): BusinessIntentEndpointResult {
  return {
    ok: false,

    status,

    body: {
      ok: false,

      code,

      error,
    },
  };
}

/**
 * ============================================================================
 * INPUT VALIDATION
 * ============================================================================
 */

function validateVerifiedDependencies(
  deps: BusinessIntentEndpointDependencies
): string | null {
  if (
    !clean(
      deps?.access
        ?.userId
    )
  ) {
    return (
      "Verified user is missing."
    );
  }

  if (
    !clean(
      deps?.access
        ?.organizationId
    )
  ) {
    return (
      "Verified organization is missing."
    );
  }

  if (
    !isIsoDate(
      deps?.store
        ?.businessDate
    )
  ) {
    return (
      "Verified businessDate must use YYYY-MM-DD."
    );
  }

  return null;
}

/**
 * ============================================================================
 * MAIN HANDLER
 * ============================================================================
 */

export async function handleBusinessIntentEndpoint(
  env: BusinessIntentEndpointEnv,

  body: BusinessIntentEndpointBody,

  deps: BusinessIntentEndpointDependencies
): Promise<BusinessIntentEndpointResult> {
  /**
   * --------------------------------------------------------------------------
   * SECURITY CONTRACT
   * --------------------------------------------------------------------------
   *
   * We trust ONLY deps.access.organizationId for tenant identity.
   *
   * body.context.orgId is client input and therefore is never financial truth.
   * --------------------------------------------------------------------------
   */

  const dependencyError =
    validateVerifiedDependencies(
      deps
    );

  if (
    dependencyError
  ) {
    return fail(
      500,
      "VERIFIED_CONTEXT_INVALID",
      dependencyError
    );
  }

  const text =
    clean(
      body?.text
    );

  if (!text) {
    return fail(
      400,
      "TEXT_REQUIRED",
      "Message text is required."
    );
  }

  if (
    text.length >
    10_000
  ) {
    return fail(
      413,
      "TEXT_TOO_LARGE",
      "Message is too large for semantic classification."
    );
  }

  const verifiedOrganizationId =
    clean(
      deps.access
        .organizationId
    );

  const clientOrganizationId =
    clean(
      body?.context
        ?.orgId ??
        body?.context
          ?.activeOrgId
    );

  /**
   * A mismatching client org is rejected instead of silently switching tenant.
   */
  if (
    clientOrganizationId &&
    clientOrganizationId !==
      verifiedOrganizationId
  ) {
    return fail(
      403,
      "ORG_CONTEXT_MISMATCH",
      "Requested organization does not match authenticated organization."
    );
  }

  const verifiedStoreId =
    clean(
      deps.store
        .storeId
    ) || null;

  const clientStoreId =
    clean(
      body?.context
        ?.activeStoreId ??
        body?.context
          ?.storeId
    ) || null;

  /**
   * The main Worker is responsible for verifying store ownership.
   *
   * Once it supplies verifiedStoreId, the client cannot classify against a
   * different store.
   */
  if (
    verifiedStoreId &&
    clientStoreId &&
    verifiedStoreId !==
      clientStoreId
  ) {
    return fail(
      403,
      "STORE_CONTEXT_MISMATCH",
      "Requested store does not match verified store."
    );
  }

  const businessDate =
    clean(
      deps.store
        .businessDate
    );

  const timezone =
    clean(
      deps.store
        .timezone
    ) || null;

  const organizationName =
    clean(
      body?.context
        ?.activeOrgName
    ) || null;

  const storeName =
    clean(
      deps.store
        .storeName ??
        body?.context
          ?.activeStoreName ??
        body?.context
          ?.storeName
    ) || null;

  const history =
    normalizeHistory(
      body?.history
    );

  /**
   * --------------------------------------------------------------------------
   * OPENAI SEMANTIC CLASSIFICATION
   * --------------------------------------------------------------------------
   */

  const classified =
    await classifyBusinessIntent(
      env,
      {
        text,

        businessDate,

        timezone,

        organizationName,

        storeName,

        history,
      },
      {
        timeoutMs:
          18_000,
      }
    );

  if (
    !classified.ok
  ) {
    const status =
      classified.code ===
      "OPENAI_TIMEOUT"
        ? 504
        : classified.code ===
          "MISSING_API_KEY"
        ? 500
        : classified.code ===
          "INVALID_INPUT"
        ? 400
        : 502;

    return fail(
      status,
      classified.code,
      classified.error
    );
  }

  /**
   * --------------------------------------------------------------------------
   * SUCCESS
   * --------------------------------------------------------------------------
   */

  return {
    ok: true,

    status: 200,

    body: {
      ok: true,

      semanticIntent:
        classified.semanticIntent,

      meta: {
        source:
          classified.source,

        model:
          classified.model,

        organizationId:
          verifiedOrganizationId,

        storeId:
          verifiedStoreId,

        businessDate,

        timezone,
      },
    },
  };
}

/**
 * ============================================================================
 * OPTIONAL RESPONSE HELPER
 * ============================================================================
 *
 * Keeps the module independent from the main Worker's CORS implementation.
 * The main Worker can still pass this Response through its existing withCors().
 * ============================================================================
 */

export function businessIntentEndpointResultToResponse(
  result: BusinessIntentEndpointResult
): Response {
  return new Response(
    JSON.stringify(
      result.body
    ),
    {
      status:
        result.status,

      headers: {
        "Content-Type":
          "application/json; charset=utf-8",
      },
    }
  );
}

/**
 * ============================================================================
 * EXPORT
 * ============================================================================
 */

export const zetraBusinessIntentEndpoint = {
  handle:
    handleBusinessIntentEndpoint,

  toResponse:
    businessIntentEndpointResultToResponse,
} as const;
