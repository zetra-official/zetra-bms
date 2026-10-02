// src/ai/business/crmRepository.ts

/**
 * ============================================================================
 * ZETRA AI Ã¢â‚¬â€ CRM REPOSITORY
 * ============================================================================
 *
 * Purpose:
 * Read verified canonical CRM intelligence from:
 *
 *   public.get_ai_crm_intelligence_v1(...)
 *
 * Canonical database sources behind the RPC:
 *
 *   public.sales
 *   public.customers
 *
 * Responsibilities:
 * - Call the canonical CRM Intelligence RPC.
 * - Keep organization/store scope explicit.
 * - Convert business dates into exact Tanzania business-day boundaries.
 * - Normalize RPC JSON into stable TypeScript domain objects.
 * - Preserve verified-customer and identity-coverage semantics.
 *
 * This module DOES NOT:
 * - Read raw sales/customers tables directly.
 * - Interpret natural language.
 * - Call OpenAI.
 * - Infer anonymous customer identity.
 * - Merge customers by phone or name.
 * - Use customers.total_orders / total_spent / last_seen_at as canonical facts.
 * - Calculate predictive CLV.
 * - Generate business advice.
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

export type ZetraAiCrmScope =
  | "STORE"
  | "ORGANIZATION";

export interface ZetraAiCrmDateRange {
  fromDate: string;
  toDate: string;
}

export interface ZetraAiCrmPeriodSummary {
  activeIdentifiedCustomers: number;
  newCustomers: number;
  returningCustomers: number;

  lifetimeRepeatCustomersActiveInPeriod: number;
  repeatPurchasersWithinPeriod: number;

  identifiedOrders: number;
  identifiedRevenue: number;

  averageOrderValue: number | null;
  averageSpendPerActiveCustomer: number | null;
  averagePurchasesPerActiveCustomer: number | null;
}

export interface ZetraAiCrmHistoricalSummary {
  customersWithVerifiedPurchaseHistory: number;
  onePurchaseCustomers: number;
  repeatCustomers: number;

  earliestVerifiedCustomerPurchase: string | null;
  latestVerifiedCustomerPurchase: string | null;
}

export interface ZetraAiCrmInactivity {
  thresholdDays: number;
  inactiveCustomers: number;
}

export interface ZetraAiCrmIdentityCoverage {
  totalCompletedSales: number;
  identifiedSales: number;
  unidentifiedSales: number;

  transactionIdentityCoveragePercent: number | null;

  totalRevenue: number;
  identifiedRevenue: number;
  unidentifiedRevenue: number;

  revenueIdentityCoveragePercent: number | null;
}

export interface ZetraAiCrmTopCustomer {
  customerId: string;
  fullName: string;
  phone: string | null;

  periodPurchaseCount: number;
  periodSpend: number;

  historicalPurchaseCount: number;
  historicalValue: number;

  firstVerifiedPurchaseAt: string | null;
  lastVerifiedPurchaseAt: string | null;
}

export interface ZetraAiCrmHistoricalTopCustomer {
  customerId: string;
  fullName: string;
  phone: string | null;

  historicalPurchaseCount: number;
  historicalValue: number;

  firstVerifiedPurchaseAt: string | null;
  lastVerifiedPurchaseAt: string | null;
}

export interface ZetraAiCrmTopCustomers {
  byPeriodSpend: ZetraAiCrmTopCustomer[];
  byPeriodPurchaseCount: ZetraAiCrmTopCustomer[];
  byHistoricalValue: ZetraAiCrmHistoricalTopCustomer[];
}

export interface ZetraAiCrmCapabilities {
  supportsVerifiedCustomerIdentity: boolean;
  supportsNewCustomers: boolean;
  supportsReturningCustomers: boolean;
  supportsRepeatCustomers: boolean;

  supportsPeriodCustomerValue: boolean;
  supportsHistoricalCustomerValue: boolean;

  supportsPredictiveClv: boolean;

  supportsInactivity: boolean;
  supportsTopCustomers: boolean;

  supportsAutomaticCrossStoreIdentityMerge: boolean;
}

export interface ZetraAiCrmDataQuality {
  customerMetricsUseIdentifiedSalesOnly: boolean;
  anonymousSalesAreNeverInferred: boolean;
  customerAggregateColumnsAreCanonical: boolean;
  crossStorePhoneMatchesAreAutomaticallyMerged: boolean;
  historicalIdentityCoverageIsComplete: boolean;

  historicalCoverageNote: string | null;
}

export interface ZetraAiCrmIntelligence {
  engineVersion: string;

  scope: ZetraAiCrmScope;

  organizationId: string;
  storeId: string | null;

  requestedRange: ZetraAiCrmDateRange;

  /**
   * Exact timestamptz boundaries sent to the canonical RPC.
   */
  fromTimestamp: string;
  toExclusiveTimestamp: string;

  periodSummary: ZetraAiCrmPeriodSummary;
  historicalSummary: ZetraAiCrmHistoricalSummary;
  inactivity: ZetraAiCrmInactivity;
  identityCoverage: ZetraAiCrmIdentityCoverage;
  topCustomers: ZetraAiCrmTopCustomers;

  capabilities: ZetraAiCrmCapabilities;
  dataQuality: ZetraAiCrmDataQuality;

  generatedAt: string | null;
}

export interface GetCrmIntelligenceParams {
  organizationId: string;

  /**
   * Inclusive YYYY-MM-DD business dates.
   */
  fromDate: string;
  toDate: string;

  storeId?: string | null;
  topLimit?: number | null;
  inactiveDays?: number | null;
}


/**
 * ============================================================================
 * CRM CUSTOMER 360 V1 TYPES
 * ============================================================================
 */

export interface ZetraAiCrmCustomer360Customer {
  id: string;
  name: string;
  phone: string | null;
  normalizedPhone: string | null;
  customerRecordCreatedAt: string | null;
}

export interface ZetraAiCrmCustomer360PeriodSummary {
  purchaseCount: number;
  revenue: number;
  discountAmount: number;
  verifiedHistoricalCogs: number;
  grossProfit: number | null;
  profitFullyVerified: boolean;
  costCoveragePercent: number;
  costItemCount: number;
  verifiedCostItems: number;
  missingCostItems: number;
  averageOrderValue: number;
}

export interface ZetraAiCrmCustomer360HistoricalSummary {
  asOf: string | null;
  purchaseCount: number;
  verifiedHistoricalSpend: number;
  firstVerifiedPurchaseAt: string | null;
  lastVerifiedPurchaseAt: string | null;
  verifiedHistoricalCogs: number;
  grossProfit: number | null;
  profitFullyVerified: boolean;
  costCoveragePercent: number;
  costItemCount: number;
  verifiedCostItems: number;
  missingCostItems: number;
}

export interface ZetraAiCrmCustomer360ReceiptItem {
  saleItemId: string;
  productId: string;
  productName: string;
  productNameSource: string;
  qty: number;
  unitPrice: number;
  lineTotal: number;
  historicalUnitCost: number | null;
  historicalCostVerified: boolean;
  historicalLineCogs: number | null;
}

export interface ZetraAiCrmCustomer360Receipt {
  saleId: string;
  soldAt: string | null;

  store: {
    id: string;
    name: string;
  };

  seller: {
    membershipId: string;
    userId: string;
    displayName: string;
  };

  subtotal: number;

  discount: {
    type: string | null;
    value: number | null;
    amount: number;
    note: string | null;
  };

  finalAmount: number;

  payment: {
    amountPaid: number;
    balanceDue: number;
    method: string | null;
    status: string | null;
  };

  cost: {
    verifiedCogs: number;
    itemCount: number;
    verifiedCostItems: number;
    missingCostItems: number;
    costCoveragePercent: number;
    profitFullyVerified: boolean;
    grossProfit: number | null;
  };

  items: ZetraAiCrmCustomer360ReceiptItem[];
}

export interface ZetraAiCrmCustomer360ProductSummary {
  productId: string;
  productName: string;
  productNameSource: string;
  qtyBought: number;
  purchaseCount: number;
  preDiscountLineValue: number;
  historicalCogsVerified: number;
  costItemCount: number;
  verifiedCostItems: number;
  missingCostItems: number;
  costFullyVerified: boolean;
}

export interface ZetraAiCrmCustomer360 {
  engineVersion: string;
  organizationId: string;
  storeId: string | null;

  requestedRange: ZetraAiCrmDateRange;

  fromTimestamp: string;
  toExclusiveTimestamp: string;

  customer: ZetraAiCrmCustomer360Customer;

  periodSummary: ZetraAiCrmCustomer360PeriodSummary;
  historicalSummary: ZetraAiCrmCustomer360HistoricalSummary;

  receipts: ZetraAiCrmCustomer360Receipt[];
  productSummary: ZetraAiCrmCustomer360ProductSummary[];

  capabilities: {
    verifiedReceiptHistory: boolean;
    verifiedProductHistory: boolean;
    verifiedSellerAttribution: boolean;
    historicalCostBasedProfit: boolean;
    creditLedgerMerged: boolean;
    predictiveCustomerLifetimeValue: boolean;
    automaticCrossStoreIdentityMerge: boolean;
  };

  dataQuality: {
    identityRule: string;
    productNameSource: string;
    historicalProductNameSnapshotGuaranteed: boolean;
    historicalCostSource: string;
    currentProductCostFallbackAllowed: boolean;
    profitRule: string;
    anonymousSalesAttributedToCustomer: boolean;
    nameOrPhoneIdentityInference: boolean;
    creditAccountAutoLinkedByPhoneOrName: boolean;
  };

  generatedAt: string | null;
}

export interface GetCrmCustomer360Params {
  organizationId: string;
  customerId: string;
  fromDate: string;
  toDate: string;
  storeId?: string | null;
  receiptLimit?: number | null;
}
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

function safeNumber(
  value: unknown
): number {
  if (
    typeof value === "number"
  ) {
    return Number.isFinite(value)
      ? value
      : 0;
  }

  if (
    typeof value === "string"
  ) {
    const parsed =
      Number(value);

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

  const parsed =
    Number(value);

  return Number.isFinite(parsed)
    ? parsed
    : null;
}

function safeBoolean(
  value: unknown
): boolean {
  return value === true;
}

function safeNullableString(
  value: unknown
): string | null {
  const normalized =
    clean(value);

  return normalized || null;
}

function isIsoDate(
  value: string
): boolean {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(
      value
    )
  ) {
    return false;
  }

  const [
    yearRaw,
    monthRaw,
    dayRaw,
  ] = value.split("-");

  const year =
    Number(yearRaw);

  const month =
    Number(monthRaw);

  const day =
    Number(dayRaw);

  const date =
    new Date(
      Date.UTC(
        year,
        month - 1,
        day
      )
    );

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() ===
      month - 1 &&
    date.getUTCDate() === day
  );
}

function assertRequired(
  value: string,
  label: string
): void {
  if (!clean(value)) {
    throw new Error(
      `[ZETRA_AI_CRM_REPOSITORY] ${label} is required.`
    );
  }
}

function assertDate(
  value: string,
  label: string
): void {
  if (!isIsoDate(value)) {
    throw new Error(
      `[ZETRA_AI_CRM_REPOSITORY] ${label} must use YYYY-MM-DD format.`
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
  assertDate(
    value,
    "date"
  );

  const [
    year,
    month,
    day,
  ] = value
    .split("-")
    .map(Number);

  return {
    year,
    month,
    day,
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
    date.getUTCDate() +
      days
  );

  const yyyy =
    String(
      date.getUTCFullYear()
    );

  const mm =
    String(
      date.getUTCMonth() + 1
    ).padStart(
      2,
      "0"
    );

  const dd =
    String(
      date.getUTCDate()
    ).padStart(
      2,
      "0"
    );

  return `${yyyy}-${mm}-${dd}`;
}

function businessDateStartTimestamp(
  date: string
): string {
  assertDate(
    date,
    "date"
  );

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
  value:
    | number
    | null
    | undefined
): number {
  const parsed =
    Number(
      value ?? 10
    );

  if (
    !Number.isFinite(parsed)
  ) {
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

function normalizeInactiveDays(
  value:
    | number
    | null
    | undefined
): number {
  const parsed =
    Number(
      value ?? 30
    );

  if (
    !Number.isFinite(parsed)
  ) {
    return 30;
  }

  return Math.max(
    1,
    Math.min(
      3650,
      Math.trunc(parsed)
    )
  );
}

function asRecord(
  value: unknown
): Record<string, any> {
  if (
    value &&
    typeof value === "object" &&
    !Array.isArray(value)
  ) {
    return value as Record<
      string,
      any
    >;
  }

  return {};
}

function asArray(
  value: unknown
): any[] {
  return Array.isArray(value)
    ? value
    : [];
}

/**
 * ============================================================================
 * MAPPERS
 * ============================================================================
 */

function mapTopCustomer(
  raw: unknown
): ZetraAiCrmTopCustomer {
  const row =
    asRecord(raw);

  return {
    customerId:
      clean(
        row.customerId
      ),

    fullName:
      clean(
        row.fullName
      ),

    phone:
      safeNullableString(
        row.phone
      ),

    periodPurchaseCount:
      safeNumber(
        row.periodPurchaseCount
      ),

    periodSpend:
      safeNumber(
        row.periodSpend
      ),

    historicalPurchaseCount:
      safeNumber(
        row.historicalPurchaseCount
      ),

    historicalValue:
      safeNumber(
        row.historicalValue
      ),

    firstVerifiedPurchaseAt:
      safeNullableString(
        row.firstVerifiedPurchaseAt
      ),

    lastVerifiedPurchaseAt:
      safeNullableString(
        row.lastVerifiedPurchaseAt
      ),
  };
}

function mapHistoricalTopCustomer(
  raw: unknown
): ZetraAiCrmHistoricalTopCustomer {
  const row =
    asRecord(raw);

  return {
    customerId:
      clean(
        row.customerId
      ),

    fullName:
      clean(
        row.fullName
      ),

    phone:
      safeNullableString(
        row.phone
      ),

    historicalPurchaseCount:
      safeNumber(
        row.historicalPurchaseCount
      ),

    historicalValue:
      safeNumber(
        row.historicalValue
      ),

    firstVerifiedPurchaseAt:
      safeNullableString(
        row.firstVerifiedPurchaseAt
      ),

    lastVerifiedPurchaseAt:
      safeNullableString(
        row.lastVerifiedPurchaseAt
      ),
  };
}

function mapCrmIntelligence(
  raw: unknown,
  context: {
    organizationId: string;
    storeId: string | null;

    fromDate: string;
    toDate: string;

    fromTimestamp: string;
    toExclusiveTimestamp: string;
  }
): ZetraAiCrmIntelligence {
  const root =
    asRecord(raw);

  const periodSummary =
    asRecord(
      root.periodSummary
    );

  const historicalSummary =
    asRecord(
      root.historicalSummary
    );

  const inactivity =
    asRecord(
      root.inactivity
    );

  const identityCoverage =
    asRecord(
      root.identityCoverage
    );

  const topCustomers =
    asRecord(
      root.topCustomers
    );

  const capabilities =
    asRecord(
      root.capabilities
    );

  const dataQuality =
    asRecord(
      root.dataQuality
    );

  const rpcScope =
    clean(
      root.scope
    ).toUpperCase();

  const scope:
    ZetraAiCrmScope =
      rpcScope === "STORE"
        ? "STORE"
        : "ORGANIZATION";

  return {
    engineVersion:
      clean(
        root.engineVersion
      ) ||
      "CRM_INTELLIGENCE_V1",

    scope,

    organizationId:
      clean(
        root.organizationId
      ) ||
      context.organizationId,

    storeId:
      safeNullableString(
        root.storeId
      ) ??
      context.storeId,

    requestedRange: {
      fromDate:
        context.fromDate,

      toDate:
        context.toDate,
    },

    fromTimestamp:
      context.fromTimestamp,

    toExclusiveTimestamp:
      context.toExclusiveTimestamp,

    periodSummary: {
      activeIdentifiedCustomers:
        safeNumber(
          periodSummary.activeIdentifiedCustomers
        ),

      newCustomers:
        safeNumber(
          periodSummary.newCustomers
        ),

      returningCustomers:
        safeNumber(
          periodSummary.returningCustomers
        ),

      lifetimeRepeatCustomersActiveInPeriod:
        safeNumber(
          periodSummary.lifetimeRepeatCustomersActiveInPeriod
        ),

      repeatPurchasersWithinPeriod:
        safeNumber(
          periodSummary.repeatPurchasersWithinPeriod
        ),

      identifiedOrders:
        safeNumber(
          periodSummary.identifiedOrders
        ),

      identifiedRevenue:
        safeNumber(
          periodSummary.identifiedRevenue
        ),

      averageOrderValue:
        safeNullableNumber(
          periodSummary.averageOrderValue
        ),

      averageSpendPerActiveCustomer:
        safeNullableNumber(
          periodSummary.averageSpendPerActiveCustomer
        ),

      averagePurchasesPerActiveCustomer:
        safeNullableNumber(
          periodSummary.averagePurchasesPerActiveCustomer
        ),
    },

    historicalSummary: {
      customersWithVerifiedPurchaseHistory:
        safeNumber(
          historicalSummary.customersWithVerifiedPurchaseHistory
        ),

      onePurchaseCustomers:
        safeNumber(
          historicalSummary.onePurchaseCustomers
        ),

      repeatCustomers:
        safeNumber(
          historicalSummary.repeatCustomers
        ),

      earliestVerifiedCustomerPurchase:
        safeNullableString(
          historicalSummary.earliestVerifiedCustomerPurchase
        ),

      latestVerifiedCustomerPurchase:
        safeNullableString(
          historicalSummary.latestVerifiedCustomerPurchase
        ),
    },

    inactivity: {
      thresholdDays:
        safeNumber(
          inactivity.thresholdDays
        ),

      inactiveCustomers:
        safeNumber(
          inactivity.inactiveCustomers
        ),
    },

    identityCoverage: {
      totalCompletedSales:
        safeNumber(
          identityCoverage.totalCompletedSales
        ),

      identifiedSales:
        safeNumber(
          identityCoverage.identifiedSales
        ),

      unidentifiedSales:
        safeNumber(
          identityCoverage.unidentifiedSales
        ),

      transactionIdentityCoveragePercent:
        safeNullableNumber(
          identityCoverage.transactionIdentityCoveragePercent
        ),

      totalRevenue:
        safeNumber(
          identityCoverage.totalRevenue
        ),

      identifiedRevenue:
        safeNumber(
          identityCoverage.identifiedRevenue
        ),

      unidentifiedRevenue:
        safeNumber(
          identityCoverage.unidentifiedRevenue
        ),

      revenueIdentityCoveragePercent:
        safeNullableNumber(
          identityCoverage.revenueIdentityCoveragePercent
        ),
    },

    topCustomers: {
      byPeriodSpend:
        asArray(
          topCustomers.byPeriodSpend
        ).map(
          mapTopCustomer
        ),

      byPeriodPurchaseCount:
        asArray(
          topCustomers.byPeriodPurchaseCount
        ).map(
          mapTopCustomer
        ),

      byHistoricalValue:
        asArray(
          topCustomers.byHistoricalValue
        ).map(
          mapHistoricalTopCustomer
        ),
    },

    capabilities: {
      supportsVerifiedCustomerIdentity:
        safeBoolean(
          capabilities.supportsVerifiedCustomerIdentity
        ),

      supportsNewCustomers:
        safeBoolean(
          capabilities.supportsNewCustomers
        ),

      supportsReturningCustomers:
        safeBoolean(
          capabilities.supportsReturningCustomers
        ),

      supportsRepeatCustomers:
        safeBoolean(
          capabilities.supportsRepeatCustomers
        ),

      supportsPeriodCustomerValue:
        safeBoolean(
          capabilities.supportsPeriodCustomerValue
        ),

      supportsHistoricalCustomerValue:
        safeBoolean(
          capabilities.supportsHistoricalCustomerValue
        ),

      supportsPredictiveClv:
        safeBoolean(
          capabilities.supportsPredictiveClv
        ),

      supportsInactivity:
        safeBoolean(
          capabilities.supportsInactivity
        ),

      supportsTopCustomers:
        safeBoolean(
          capabilities.supportsTopCustomers
        ),

      supportsAutomaticCrossStoreIdentityMerge:
        safeBoolean(
          capabilities.supportsAutomaticCrossStoreIdentityMerge
        ),
    },

    dataQuality: {
      customerMetricsUseIdentifiedSalesOnly:
        safeBoolean(
          dataQuality.customerMetricsUseIdentifiedSalesOnly
        ),

      anonymousSalesAreNeverInferred:
        safeBoolean(
          dataQuality.anonymousSalesAreNeverInferred
        ),

      customerAggregateColumnsAreCanonical:
        safeBoolean(
          dataQuality.customerAggregateColumnsAreCanonical
        ),

      crossStorePhoneMatchesAreAutomaticallyMerged:
        safeBoolean(
          dataQuality.crossStorePhoneMatchesAreAutomaticallyMerged
        ),

      historicalIdentityCoverageIsComplete:
        safeBoolean(
          dataQuality.historicalIdentityCoverageIsComplete
        ),

      historicalCoverageNote:
        safeNullableString(
          dataQuality.historicalCoverageNote
        ),
    },

    generatedAt:
      safeNullableString(
        root.generatedAt
      ),
  };
}

/**
 * ============================================================================
 * CANONICAL CRM INTELLIGENCE
 * ============================================================================
 */

export async function getCrmIntelligence(
  params: GetCrmIntelligenceParams
): Promise<ZetraAiCrmIntelligence> {
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

  if (
    fromDate > toDate
  ) {
    throw new Error(
      "[ZETRA_AI_CRM_REPOSITORY] fromDate cannot be after toDate."
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

  const inactiveDays =
    normalizeInactiveDays(
      params.inactiveDays
    );

  const {
    data,
    error,
  } = await supabase.rpc(
    "get_ai_crm_intelligence_v1",
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

      p_inactive_days:
        inactiveDays,
    } as any
  );

  if (error) {
    throw new Error(
      `[ZETRA_AI_CRM_REPOSITORY] Failed to load canonical CRM intelligence: ${error.message}`
    );
  }

  if (
    data === null ||
    data === undefined
  ) {
    throw new Error(
      "[ZETRA_AI_CRM_REPOSITORY] Canonical CRM RPC returned no data."
    );
  }

  return mapCrmIntelligence(
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
 * CRM CUSTOMER 360 V1
 * ============================================================================
 */

function normalizeReceiptLimit(
  value:
    | number
    | null
    | undefined
): number {
  const parsed =
    Number(
      value ?? 50
    );

  if (
    !Number.isFinite(parsed)
  ) {
    return 50;
  }

  return Math.max(
    1,
    Math.min(
      100,
      Math.trunc(parsed)
    )
  );
}

function mapCrmCustomer360(
  raw: unknown,
  context: {
    organizationId: string;
    storeId: string | null;
    fromDate: string;
    toDate: string;
    fromTimestamp: string;
    toExclusiveTimestamp: string;
  }
): ZetraAiCrmCustomer360 {
  const root =
    asRecord(raw);

  const customer =
    asRecord(
      root.customer
    );

  const period =
    asRecord(
      root.periodSummary
    );

  const historical =
    asRecord(
      root.historicalSummary
    );

  const capabilities =
    asRecord(
      root.capabilities
    );

  const dataQuality =
    asRecord(
      root.dataQuality
    );

  const receipts:
    ZetraAiCrmCustomer360Receipt[] =
      asArray(
        root.receipts
      ).map(
        (value) => {
          const row =
            asRecord(value);

          const store =
            asRecord(
              row.store
            );

          const seller =
            asRecord(
              row.seller
            );

          const discount =
            asRecord(
              row.discount
            );

          const payment =
            asRecord(
              row.payment
            );

          const cost =
            asRecord(
              row.cost
            );

          const items:
            ZetraAiCrmCustomer360ReceiptItem[] =
              asArray(
                row.items
              ).map(
                (itemValue) => {
                  const item =
                    asRecord(
                      itemValue
                    );

                  return {
                    saleItemId:
                      clean(
                        item.saleItemId
                      ),

                    productId:
                      clean(
                        item.productId
                      ),

                    productName:
                      clean(
                        item.productName
                      ),

                    productNameSource:
                      clean(
                        item.productNameSource
                      ),

                    qty:
                      safeNumber(
                        item.qty
                      ),

                    unitPrice:
                      safeNumber(
                        item.unitPrice
                      ),

                    lineTotal:
                      safeNumber(
                        item.lineTotal
                      ),

                    historicalUnitCost:
                      safeNullableNumber(
                        item.historicalUnitCost
                      ),

                    historicalCostVerified:
                      safeBoolean(
                        item.historicalCostVerified
                      ),

                    historicalLineCogs:
                      safeNullableNumber(
                        item.historicalLineCogs
                      ),
                  };
                }
              );

          return {
            saleId:
              clean(
                row.saleId
              ),

            soldAt:
              safeNullableString(
                row.soldAt
              ),

            store: {
              id:
                clean(
                  store.id
                ),

              name:
                clean(
                  store.name
                ),
            },

            seller: {
              membershipId:
                clean(
                  seller.membershipId
                ),

              userId:
                clean(
                  seller.userId
                ),

              displayName:
                clean(
                  seller.displayName
                ),
            },

            subtotal:
              safeNumber(
                row.subtotal
              ),

            discount: {
              type:
                safeNullableString(
                  discount.type
                ),

              value:
                safeNullableNumber(
                  discount.value
                ),

              amount:
                safeNumber(
                  discount.amount
                ),

              note:
                safeNullableString(
                  discount.note
                ),
            },

            finalAmount:
              safeNumber(
                row.finalAmount
              ),

            payment: {
              amountPaid:
                safeNumber(
                  payment.amountPaid
                ),

              balanceDue:
                safeNumber(
                  payment.balanceDue
                ),

              method:
                safeNullableString(
                  payment.method
                ),

              status:
                safeNullableString(
                  payment.status
                ),
            },

            cost: {
              verifiedCogs:
                safeNumber(
                  cost.verifiedCogs
                ),

              itemCount:
                safeNumber(
                  cost.itemCount
                ),

              verifiedCostItems:
                safeNumber(
                  cost.verifiedCostItems
                ),

              missingCostItems:
                safeNumber(
                  cost.missingCostItems
                ),

              costCoveragePercent:
                safeNumber(
                  cost.costCoveragePercent
                ),

              profitFullyVerified:
                safeBoolean(
                  cost.profitFullyVerified
                ),

              grossProfit:
                safeNullableNumber(
                  cost.grossProfit
                ),
            },

            items,
          };
        }
      );

  const productSummary:
    ZetraAiCrmCustomer360ProductSummary[] =
      asArray(
        root.productSummary
      ).map(
        (value) => {
          const row =
            asRecord(value);

          return {
            productId:
              clean(
                row.productId
              ),

            productName:
              clean(
                row.productName
              ),

            productNameSource:
              clean(
                row.productNameSource
              ),

            qtyBought:
              safeNumber(
                row.qtyBought
              ),

            purchaseCount:
              safeNumber(
                row.purchaseCount
              ),

            preDiscountLineValue:
              safeNumber(
                row.preDiscountLineValue
              ),

            historicalCogsVerified:
              safeNumber(
                row.historicalCogsVerified
              ),

            costItemCount:
              safeNumber(
                row.costItemCount
              ),

            verifiedCostItems:
              safeNumber(
                row.verifiedCostItems
              ),

            missingCostItems:
              safeNumber(
                row.missingCostItems
              ),

            costFullyVerified:
              safeBoolean(
                row.costFullyVerified
              ),
          };
        }
      );

  return {
    engineVersion:
      clean(
        root.engineVersion
      ) ||
      "CRM_CUSTOMER_360_V1",

    organizationId:
      clean(
        root.organizationId
      ) ||
      context.organizationId,

    storeId:
      safeNullableString(
        root.storeId
      ) ??
      context.storeId,

    requestedRange: {
      fromDate:
        context.fromDate,

      toDate:
        context.toDate,
    },

    fromTimestamp:
      context.fromTimestamp,

    toExclusiveTimestamp:
      context.toExclusiveTimestamp,

    customer: {
      id:
        clean(
          customer.id
        ),

      name:
        clean(
          customer.name
        ),

      phone:
        safeNullableString(
          customer.phone
        ),

      normalizedPhone:
        safeNullableString(
          customer.normalizedPhone
        ),

      customerRecordCreatedAt:
        safeNullableString(
          customer.customerRecordCreatedAt
        ),
    },

    periodSummary: {
      purchaseCount:
        safeNumber(
          period.purchaseCount
        ),

      revenue:
        safeNumber(
          period.revenue
        ),

      discountAmount:
        safeNumber(
          period.discountAmount
        ),

      verifiedHistoricalCogs:
        safeNumber(
          period.verifiedHistoricalCogs
        ),

      grossProfit:
        safeNullableNumber(
          period.grossProfit
        ),

      profitFullyVerified:
        safeBoolean(
          period.profitFullyVerified
        ),

      costCoveragePercent:
        safeNumber(
          period.costCoveragePercent
        ),

      costItemCount:
        safeNumber(
          period.costItemCount
        ),

      verifiedCostItems:
        safeNumber(
          period.verifiedCostItems
        ),

      missingCostItems:
        safeNumber(
          period.missingCostItems
        ),

      averageOrderValue:
        safeNumber(
          period.averageOrderValue
        ),
    },

    historicalSummary: {
      asOf:
        safeNullableString(
          historical.asOf
        ),

      purchaseCount:
        safeNumber(
          historical.purchaseCount
        ),

      verifiedHistoricalSpend:
        safeNumber(
          historical.verifiedHistoricalSpend
        ),

      firstVerifiedPurchaseAt:
        safeNullableString(
          historical.firstVerifiedPurchaseAt
        ),

      lastVerifiedPurchaseAt:
        safeNullableString(
          historical.lastVerifiedPurchaseAt
        ),

      verifiedHistoricalCogs:
        safeNumber(
          historical.verifiedHistoricalCogs
        ),

      grossProfit:
        safeNullableNumber(
          historical.grossProfit
        ),

      profitFullyVerified:
        safeBoolean(
          historical.profitFullyVerified
        ),

      costCoveragePercent:
        safeNumber(
          historical.costCoveragePercent
        ),

      costItemCount:
        safeNumber(
          historical.costItemCount
        ),

      verifiedCostItems:
        safeNumber(
          historical.verifiedCostItems
        ),

      missingCostItems:
        safeNumber(
          historical.missingCostItems
        ),
    },

    receipts,
    productSummary,

    capabilities: {
      verifiedReceiptHistory:
        safeBoolean(
          capabilities.verifiedReceiptHistory
        ),

      verifiedProductHistory:
        safeBoolean(
          capabilities.verifiedProductHistory
        ),

      verifiedSellerAttribution:
        safeBoolean(
          capabilities.verifiedSellerAttribution
        ),

      historicalCostBasedProfit:
        safeBoolean(
          capabilities.historicalCostBasedProfit
        ),

      creditLedgerMerged:
        safeBoolean(
          capabilities.creditLedgerMerged
        ),

      predictiveCustomerLifetimeValue:
        safeBoolean(
          capabilities.predictiveCustomerLifetimeValue
        ),

      automaticCrossStoreIdentityMerge:
        safeBoolean(
          capabilities.automaticCrossStoreIdentityMerge
        ),
    },

    dataQuality: {
      identityRule:
        clean(
          dataQuality.identityRule
        ),

      productNameSource:
        clean(
          dataQuality.productNameSource
        ),

      historicalProductNameSnapshotGuaranteed:
        safeBoolean(
          dataQuality.historicalProductNameSnapshotGuaranteed
        ),

      historicalCostSource:
        clean(
          dataQuality.historicalCostSource
        ),

      currentProductCostFallbackAllowed:
        safeBoolean(
          dataQuality.currentProductCostFallbackAllowed
        ),

      profitRule:
        clean(
          dataQuality.profitRule
        ),

      anonymousSalesAttributedToCustomer:
        safeBoolean(
          dataQuality.anonymousSalesAttributedToCustomer
        ),

      nameOrPhoneIdentityInference:
        safeBoolean(
          dataQuality.nameOrPhoneIdentityInference
        ),

      creditAccountAutoLinkedByPhoneOrName:
        safeBoolean(
          dataQuality.creditAccountAutoLinkedByPhoneOrName
        ),
    },

    generatedAt:
      safeNullableString(
        root.generatedAt
      ),
  };
}

export async function getCrmCustomer360(
  params: GetCrmCustomer360Params
): Promise<ZetraAiCrmCustomer360> {
  const organizationId =
    clean(
      params.organizationId
    );

  const customerId =
    clean(
      params.customerId
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

  assertRequired(
    customerId,
    "customerId"
  );

  assertDate(
    fromDate,
    "fromDate"
  );

  assertDate(
    toDate,
    "toDate"
  );

  if (
    fromDate > toDate
  ) {
    throw new Error(
      "[ZETRA_AI_CRM_REPOSITORY] fromDate cannot be after toDate."
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

  const receiptLimit =
    normalizeReceiptLimit(
      params.receiptLimit
    );

  const {
    data,
    error,
  } = await supabase.rpc(
    "get_ai_crm_customer_360_v1",
    {
      p_org_id:
        organizationId,

      p_customer_id:
        customerId,

      p_from:
        fromTimestamp,

      p_to:
        toExclusiveTimestamp,

      p_store_id:
        storeId,

      p_receipt_limit:
        receiptLimit,
    } as any
  );

  if (error) {
    throw new Error(
      "[ZETRA_AI_CRM_REPOSITORY] Failed to load canonical CRM Customer 360: " +
        error.message
    );
  }

  if (
    data === null ||
    data === undefined
  ) {
    throw new Error(
      "[ZETRA_AI_CRM_REPOSITORY] Canonical Customer 360 RPC returned no data."
    );
  }

  return mapCrmCustomer360(
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
 * REPOSITORY EXPORT
 * ============================================================================
 */

export const zetraAiCrmRepository = {
  getCrmIntelligence,
  getCrmCustomer360,
} as const;