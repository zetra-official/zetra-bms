// src/ai/business/creditRepository.ts

/**
 * ============================================================================
 * ZETRA AI — CREDIT REPOSITORY
 * ============================================================================
 *
 * Purpose:
 * Read verified customer-credit intelligence from:
 *
 *   public.get_ai_credit_intelligence_v1(...)
 *
 * Canonical database sources behind the RPC:
 *
 *   public.credit_accounts_v2
 *   public.credit_ledger_v2
 *
 * Responsibilities:
 * - Call the canonical Credit Intelligence RPC.
 * - Keep organization/store scope explicit.
 * - Normalize RPC JSON into stable TypeScript domain objects.
 * - Preserve current-position and period-activity semantics.
 *
 * This module DOES NOT:
 * - Read raw credit tables directly.
 * - Interpret natural language.
 * - Call OpenAI.
 * - Invent overdue status.
 * - Calculate business advice.
 *
 * Security:
 * - The canonical RPC is OWNER-ONLY.
 * - Database remains the final authorization boundary.
 * ============================================================================
 */

import { supabase } from "@/src/supabase/supabaseClient";

/**
 * ============================================================================
 * TYPES
 * ============================================================================
 */

export type ZetraAiCreditScope =
  | "STORE"
  | "ORGANIZATION";

export interface ZetraAiCreditDateRange {
  fromDate: string;
  toDate: string;
}

export interface ZetraAiCreditCurrentPosition {
  totalAccounts: number;
  accountsWithActivity: number;

  debtorsCount: number;
  clearedAccounts: number;
  overpaidAccounts: number;

  outstandingBalance: number;
  customerCreditBalance: number;
  netLedgerBalance: number;
}

export interface ZetraAiCreditPeriodActivity {
  creditIssued: number;
  creditSalesCount: number;

  collections: number;
  paymentsCount: number;

  netCreditMovement: number;

  /**
   * Period collections / period credit issued × 100.
   *
   * IMPORTANT:
   * This is NOT cohort recovery rate.
   * Payments received in the period may belong to credit issued earlier.
   */
  collectionToIssuedRatePercent: number | null;
}

export interface ZetraAiCreditCollectionChannels {
  cash: number;
  bank: number;
  mobile: number;
  other: number;
}

export interface ZetraAiCreditDebtor {
  creditAccountId: string;

  customerName: string;
  phone: string | null;

  storeId: string;
  storeName: string;

  outstandingBalance: number;

  lastActivityAt: string | null;
}

export interface ZetraAiCreditCapabilities {
  supportsCurrentOutstanding: boolean;
  supportsPeriodCreditIssued: boolean;
  supportsPeriodCollections: boolean;
  supportsPaymentChannels: boolean;
  supportsTopDebtors: boolean;

  supportsOverdue: boolean;
  overdueReason: string | null;
}

export interface ZetraAiCreditDataQuality {
  negativeBalanceAccounts: number;

  negativeBalancesTreatedAsCustomerCredit: boolean;
}

export interface ZetraAiCreditIntelligence {
  engineVersion: string;

  scope: ZetraAiCreditScope;

  organizationId: string;
  storeId: string | null;

  requestedRange: ZetraAiCreditDateRange;

  /**
   * Exact UTC/timestamptz boundaries sent to the canonical RPC.
   */
  fromTimestamp: string;
  toExclusiveTimestamp: string;

  currentPosition: ZetraAiCreditCurrentPosition;

  periodActivity: ZetraAiCreditPeriodActivity;

  collectionChannels: ZetraAiCreditCollectionChannels;

  topDebtors: ZetraAiCreditDebtor[];

  capabilities: ZetraAiCreditCapabilities;

  dataQuality: ZetraAiCreditDataQuality;

  generatedAt: string | null;
}

/**
 * ============================================================================
 * HELPERS
 * ============================================================================
 */

function clean(value: unknown): string {
  return String(value ?? "").trim();
}

function safeNumber(value: unknown): number {
  if (typeof value === "number") {
    return Number.isFinite(value)
      ? value
      : 0;
  }

  if (typeof value === "string") {
    const parsed = Number(value);

    return Number.isFinite(parsed)
      ? parsed
      : 0;
  }

  return 0;
}

function safeNullableNumber(
  value: unknown
): number | null {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed)
    ? parsed
    : null;
}

function safeBoolean(value: unknown): boolean {
  return value === true;
}

function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function assertRequired(
  value: string,
  label: string
): void {
  if (!clean(value)) {
    throw new Error(
      `[ZETRA_AI_CREDIT_REPOSITORY] ${label} is required.`
    );
  }
}

function assertDate(
  value: string,
  label: string
): void {
  if (!isIsoDate(value)) {
    throw new Error(
      `[ZETRA_AI_CREDIT_REPOSITORY] ${label} must use YYYY-MM-DD format.`
    );
  }
}

function parseIsoDate(
  value: string
): {
  year: number;
  month: number;
  day: number;
} {
  assertDate(value, "date");

  const [
    yearText,
    monthText,
    dayText,
  ] = value.split("-");

  return {
    year: Number(yearText),
    month: Number(monthText),
    day: Number(dayText),
  };
}

function addDaysIso(
  value: string,
  days: number
): string {
  const {
    year,
    month,
    day,
  } = parseIsoDate(value);

  const date =
    new Date(
      Date.UTC(
        year,
        month - 1,
        day
      )
    );

  date.setUTCDate(
    date.getUTCDate() + days
  );

  return date
    .toISOString()
    .slice(0, 10);
}

/**
 * Tanzania is currently the canonical ZETRA business timezone used by the
 * existing stores audited for this project.
 *
 * We keep the timezone boundary explicit here rather than silently relying on
 * the device timezone.
 *
 * When ZETRA expands to stores with different business timezones, this helper
 * should be replaced by store/org timezone resolution before the RPC call.
 */
function businessDateStartTimestamp(
  date: string
): string {
  assertDate(date, "date");

  return `${date}T00:00:00+03:00`;
}

function businessDateEndExclusiveTimestamp(
  toDate: string
): string {
  const nextDate =
    addDaysIso(
      toDate,
      1
    );

  return `${nextDate}T00:00:00+03:00`;
}

function normalizeTopLimit(
  value: number | null | undefined
): number {
  const parsed =
    Number(value ?? 10);

  if (!Number.isFinite(parsed)) {
    return 10;
  }

  return Math.max(
    1,
    Math.min(
      50,
      Math.trunc(parsed)
    )
  );
}

/**
 * ============================================================================
 * RPC JSON MAPPER
 * ============================================================================
 */

function mapCreditIntelligence(
  raw: unknown,
  params: {
    organizationId: string;
    storeId: string | null;
    fromDate: string;
    toDate: string;
    fromTimestamp: string;
    toExclusiveTimestamp: string;
  }
): ZetraAiCreditIntelligence {
  const root =
    raw &&
    typeof raw === "object"
      ? (raw as Record<string, any>)
      : {};

  const current =
    root.currentPosition &&
    typeof root.currentPosition === "object"
      ? root.currentPosition
      : {};

  const activity =
    root.periodActivity &&
    typeof root.periodActivity === "object"
      ? root.periodActivity
      : {};

  const channels =
    root.collectionChannels &&
    typeof root.collectionChannels === "object"
      ? root.collectionChannels
      : {};

  const capabilities =
    root.capabilities &&
    typeof root.capabilities === "object"
      ? root.capabilities
      : {};

  const quality =
    root.dataQuality &&
    typeof root.dataQuality === "object"
      ? root.dataQuality
      : {};

  const debtorRows =
    Array.isArray(root.topDebtors)
      ? root.topDebtors
      : [];

  const topDebtors: ZetraAiCreditDebtor[] =
    debtorRows.map((item: any) => ({
      creditAccountId:
        clean(item?.creditAccountId),

      customerName:
        clean(item?.customerName),

      phone:
        clean(item?.phone) || null,

      storeId:
        clean(item?.storeId),

      storeName:
        clean(item?.storeName),

      outstandingBalance:
        safeNumber(
          item?.outstandingBalance
        ),

      lastActivityAt:
        clean(item?.lastActivityAt) ||
        null,
    }));

  return {
    engineVersion:
      clean(root.engineVersion) ||
      "CREDIT_INTELLIGENCE_V1",

    scope:
      params.storeId
        ? "STORE"
        : "ORGANIZATION",

    organizationId:
      params.organizationId,

    storeId:
      params.storeId,

    requestedRange: {
      fromDate:
        params.fromDate,

      toDate:
        params.toDate,
    },

    fromTimestamp:
      params.fromTimestamp,

    toExclusiveTimestamp:
      params.toExclusiveTimestamp,

    currentPosition: {
      totalAccounts:
        safeNumber(
          current.totalAccounts
        ),

      accountsWithActivity:
        safeNumber(
          current.accountsWithActivity
        ),

      debtorsCount:
        safeNumber(
          current.debtorsCount
        ),

      clearedAccounts:
        safeNumber(
          current.clearedAccounts
        ),

      overpaidAccounts:
        safeNumber(
          current.overpaidAccounts
        ),

      outstandingBalance:
        safeNumber(
          current.outstandingBalance
        ),

      customerCreditBalance:
        safeNumber(
          current.customerCreditBalance
        ),

      netLedgerBalance:
        safeNumber(
          current.netLedgerBalance
        ),
    },

    periodActivity: {
      creditIssued:
        safeNumber(
          activity.creditIssued
        ),

      creditSalesCount:
        safeNumber(
          activity.creditSalesCount
        ),

      collections:
        safeNumber(
          activity.collections
        ),

      paymentsCount:
        safeNumber(
          activity.paymentsCount
        ),

      netCreditMovement:
        safeNumber(
          activity.netCreditMovement
        ),

      collectionToIssuedRatePercent:
        safeNullableNumber(
          activity.collectionToIssuedRatePercent
        ),
    },

    collectionChannels: {
      cash:
        safeNumber(
          channels.cash
        ),

      bank:
        safeNumber(
          channels.bank
        ),

      mobile:
        safeNumber(
          channels.mobile
        ),

      other:
        safeNumber(
          channels.other
        ),
    },

    topDebtors,

    capabilities: {
      supportsCurrentOutstanding:
        safeBoolean(
          capabilities.supportsCurrentOutstanding
        ),

      supportsPeriodCreditIssued:
        safeBoolean(
          capabilities.supportsPeriodCreditIssued
        ),

      supportsPeriodCollections:
        safeBoolean(
          capabilities.supportsPeriodCollections
        ),

      supportsPaymentChannels:
        safeBoolean(
          capabilities.supportsPaymentChannels
        ),

      supportsTopDebtors:
        safeBoolean(
          capabilities.supportsTopDebtors
        ),

      supportsOverdue:
        safeBoolean(
          capabilities.supportsOverdue
        ),

      overdueReason:
        clean(
          capabilities.overdueReason
        ) || null,
    },

    dataQuality: {
      negativeBalanceAccounts:
        safeNumber(
          quality.negativeBalanceAccounts
        ),

      negativeBalancesTreatedAsCustomerCredit:
        safeBoolean(
          quality.negativeBalancesTreatedAsCustomerCredit
        ),
    },

    generatedAt:
      clean(root.generatedAt) ||
      null,
  };
}

/**
 * ============================================================================
 * CANONICAL CREDIT INTELLIGENCE
 * ============================================================================
 */

export async function getCreditIntelligence(
  params: {
    organizationId: string;

    storeId?: string | null;

    fromDate: string;
    toDate: string;

    topLimit?: number | null;
  }
): Promise<ZetraAiCreditIntelligence> {
  const organizationId =
    clean(
      params.organizationId
    );

  const storeId =
    clean(
      params.storeId ?? ""
    ) || null;

  const fromDate =
    clean(
      params.fromDate
    );

  const toDate =
    clean(
      params.toDate
    );

  assertRequired(
    organizationId,
    "organizationId"
  );

  assertDate(
    fromDate,
    "fromDate"
  );

  assertDate(
    toDate,
    "toDate"
  );

  if (fromDate > toDate) {
    throw new Error(
      "[ZETRA_AI_CREDIT_REPOSITORY] fromDate cannot be after toDate."
    );
  }

  const fromTimestamp =
    businessDateStartTimestamp(
      fromDate
    );

  const toExclusiveTimestamp =
    businessDateEndExclusiveTimestamp(
      toDate
    );

  const topLimit =
    normalizeTopLimit(
      params.topLimit
    );

  const {
    data,
    error,
  } = await supabase.rpc(
    "get_ai_credit_intelligence_v1",
    {
      p_org_id:
        organizationId,

      p_from:
        fromTimestamp,

      p_to:
        toExclusiveTimestamp,

      p_store_id:
        storeId,

      p_top_limit:
        topLimit,
    } as any
  );

  if (error) {
    throw new Error(
      `[ZETRA_AI_CREDIT_REPOSITORY] Failed to load canonical credit intelligence: ${error.message}`
    );
  }

  if (!data) {
    throw new Error(
      "[ZETRA_AI_CREDIT_REPOSITORY] Canonical credit RPC returned no data."
    );
  }

  return mapCreditIntelligence(
    data,
    {
      organizationId,
      storeId,
      fromDate,
      toDate,
      fromTimestamp,
      toExclusiveTimestamp,
    }
  );
}
/**
 * ============================================================================
 * CUSTOMER CREDIT HISTORY
 * ============================================================================
 */

export type ZetraAiCreditCustomerHistoryStatus =
  | "FOUND"
  | "NOT_FOUND"
  | "AMBIGUOUS";

export interface ZetraAiCreditCustomerIdentity {
  creditAccountId: string;
  customerName: string;
  phone: string | null;
  storeId: string;
  storeName: string;
}

export interface ZetraAiCreditCustomerTransaction {
  id: string;
  entryType: "SALE" | "PAYMENT" | string;
  delta: number;
  amount: number;
  method: string | null;
  reference: string | null;
  note: string | null;
  createdAt: string;
}

export interface ZetraAiCreditCustomerLatestActivity {
  id: string;
  entryType: "SALE" | "PAYMENT" | string;
  amount: number;
  method: string | null;
  reference: string | null;
  note: string | null;
  createdAt: string;
}

export interface ZetraAiCreditCustomerHistory {
  engineVersion: string;

  status: ZetraAiCreditCustomerHistoryStatus;

  query: string;

  matchCount: number | null;

  customer: ZetraAiCreditCustomerIdentity | null;

  currentBalance: number | null;

  latestPayment: ZetraAiCreditCustomerLatestActivity | null;

  latestCreditSale: ZetraAiCreditCustomerLatestActivity | null;

  transactions: ZetraAiCreditCustomerTransaction[];

  generatedAt: string | null;
}

function mapCreditCustomerLatestActivity(
  value: unknown
): ZetraAiCreditCustomerLatestActivity | null {
  if (
    !value ||
    typeof value !== "object"
  ) {
    return null;
  }

  const row =
    value as Record<string, unknown>;

  const id =
    clean(row.id);

  const createdAt =
    clean(row.createdAt);

  if (
    !id ||
    !createdAt
  ) {
    return null;
  }

  return {
    id,

    entryType:
      clean(row.entryType)
        .toUpperCase(),

    amount:
      safeNumber(row.amount),

    method:
      clean(row.method) || null,

    reference:
      clean(row.reference) || null,

    note:
      clean(row.note) || null,

    createdAt,
  };
}

function mapCreditCustomerTransaction(
  value: unknown
): ZetraAiCreditCustomerTransaction | null {
  if (
    !value ||
    typeof value !== "object"
  ) {
    return null;
  }

  const row =
    value as Record<string, unknown>;

  const id =
    clean(row.id);

  const createdAt =
    clean(row.createdAt);

  if (
    !id ||
    !createdAt
  ) {
    return null;
  }

  return {
    id,

    entryType:
      clean(row.entryType)
        .toUpperCase(),

    delta:
      safeNumber(row.delta),

    amount:
      safeNumber(row.amount),

    method:
      clean(row.method) || null,

    reference:
      clean(row.reference) || null,

    note:
      clean(row.note) || null,

    createdAt,
  };
}

function mapCreditCustomerHistory(
  raw: unknown,
  fallbackQuery: string
): ZetraAiCreditCustomerHistory {
  const root: Record<string, any> =
    raw &&
    typeof raw === "object"
      ? (raw as Record<string, any>)
      : {};

  const rawStatus =
    clean(root.status)
      .toUpperCase();

  let status: ZetraAiCreditCustomerHistoryStatus =
    "NOT_FOUND";

  if (rawStatus === "FOUND") {
    status = "FOUND";
  } else if (rawStatus === "AMBIGUOUS") {
    status = "AMBIGUOUS";
  }

  const customerRaw =
    root.customer &&
    typeof root.customer === "object"
      ? (root.customer as Record<string, unknown>)
      : null;

  let customer:
    ZetraAiCreditCustomerIdentity | null =
      null;

  if (
    status === "FOUND" &&
    customerRaw
  ) {
    customer = {
      creditAccountId:
        clean(
          customerRaw.creditAccountId
        ),

      customerName:
        clean(
          customerRaw.customerName
        ),

      phone:
        clean(
          customerRaw.phone
        ) || null,

      storeId:
        clean(
          customerRaw.storeId
        ),

      storeName:
        clean(
          customerRaw.storeName
        ),
    };
  }

  const transactionRows: unknown[] =
    Array.isArray(root.transactions)
      ? root.transactions
      : [];

  const transactions:
    ZetraAiCreditCustomerTransaction[] =
      transactionRows
        .map(
          (
            item: unknown
          ): ZetraAiCreditCustomerTransaction | null =>
            mapCreditCustomerTransaction(
              item
            )
        )
        .filter(
          (
            item: ZetraAiCreditCustomerTransaction | null
          ): item is ZetraAiCreditCustomerTransaction =>
            item !== null
        );

  const rawMatchCount =
    Number(
      root.matchCount
    );

  let matchCount:
    number | null =
      null;

  if (
    Number.isFinite(
      rawMatchCount
    )
  ) {
    matchCount =
      rawMatchCount;
  } else if (
    status === "FOUND"
  ) {
    matchCount = 1;
  } else if (
    status === "NOT_FOUND"
  ) {
    matchCount = 0;
  }

  const currentBalance =
    status === "FOUND"
      ? safeNumber(
          root.currentBalance
        )
      : null;

  const latestPayment =
    status === "FOUND"
      ? mapCreditCustomerLatestActivity(
          root.latestPayment
        )
      : null;

  const latestCreditSale =
    status === "FOUND"
      ? mapCreditCustomerLatestActivity(
          root.latestCreditSale
        )
      : null;

  return {
    engineVersion:
      clean(
        root.engineVersion
      ) ||
      "CREDIT_CUSTOMER_HISTORY_V1",

    status,

    query:
      clean(
        root.query
      ) ||
      fallbackQuery,

    matchCount,

    customer,

    currentBalance,

    latestPayment,

    latestCreditSale,

    transactions,

    generatedAt:
      clean(
        root.generatedAt
      ) ||
      null,
  };
}

function normalizeCustomerHistoryLimit(
  value?: number | null
): number {
  const parsed =
    Number(
      value
    );

  if (
    !Number.isFinite(
      parsed
    )
  ) {
    return 100;
  }

  return Math.max(
    1,
    Math.min(
      500,
      Math.trunc(
        parsed
      )
    )
  );
}

export async function getCreditCustomerHistory(
  params: {
    organizationId: string;
    customerQuery: string;
    storeId?: string | null;
    limit?: number | null;
  }
): Promise<ZetraAiCreditCustomerHistory> {
  const organizationId =
    clean(
      params.organizationId
    );

  const customerQuery =
    clean(
      params.customerQuery
    );

  const storeId =
    clean(
      params.storeId ?? ""
    ) || null;

  assertRequired(
    organizationId,
    "organizationId"
  );

  assertRequired(
    customerQuery,
    "customerQuery"
  );

  const limit =
    normalizeCustomerHistoryLimit(
      params.limit
    );

  const {
    data,
    error,
  } = await supabase.rpc(
    "get_ai_credit_customer_history_v1",
    {
      p_org_id:
        organizationId,

      p_customer_query:
        customerQuery,

      p_store_id:
        storeId,

      p_limit:
        limit,
    } as any
  );

  if (error) {
    throw new Error(
      `[ZETRA_AI_CREDIT_REPOSITORY] Failed to load customer credit history: ${error.message}`
    );
  }

  if (
    data === null ||
    data === undefined
  ) {
    throw new Error(
      "[ZETRA_AI_CREDIT_REPOSITORY] Customer credit history RPC returned no data."
    );
  }

  return mapCreditCustomerHistory(
    data,
    customerQuery
  );
}

/**
 * ============================================================================
 * REPOSITORY EXPORT
 * ============================================================================
 */

export const zetraAiCreditRepository = {
  getCreditIntelligence,
  getCreditCustomerHistory,
} as const;