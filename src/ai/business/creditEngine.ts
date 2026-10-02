// src/ai/business/creditEngine.ts

/**
 * ============================================================================
 * ZETRA AI — CREDIT ENGINE
 * ============================================================================
 *
 * Purpose:
 * Transform verified canonical credit intelligence into derived,
 * business-ready credit metrics and period comparisons.
 *
 * Source:
 *   creditRepository.ts
 *        │
 *        ▼
 *   get_ai_credit_intelligence_v1
 *
 * Responsibilities:
 * - Preserve verified canonical credit figures.
 * - Calculate safe derived credit indicators.
 * - Compare credit periods.
 * - Measure debtor concentration.
 * - Measure collection-channel mix.
 * - Respect canonical capability limitations.
 * - Preserve credit data-quality warnings.
 *
 * This module DOES NOT:
 * - Query Supabase directly.
 * - Call OpenAI.
 * - Interpret natural language.
 * - Invent overdue information.
 * - Invent due dates.
 * - Guess why customers have not paid.
 * - Treat customer overpayments as negative debt.
 *
 * IMPORTANT:
 * Current outstanding balance is a CURRENT POSITION.
 * Period activity is activity recorded inside the requested period.
 *
 * These concepts must remain separate.
 * ============================================================================
 */

import type {
  ZetraAiCreditCollectionChannels,
  ZetraAiCreditCustomerHistory,
  ZetraAiCreditCustomerLatestActivity,
  ZetraAiCreditCustomerTransaction,
  ZetraAiCreditDataQuality,
  ZetraAiCreditDebtor,
  ZetraAiCreditIntelligence,
} from "./creditRepository";

/**
 * ============================================================================
 * TYPES
 * ============================================================================
 */

export type ZetraAiCreditTrendDirection =
  | "UP"
  | "DOWN"
  | "FLAT"
  | "NO_BASELINE";

export type ZetraAiCreditMetricKey =
  | "creditIssued"
  | "collections"
  | "netCreditMovement"
  | "creditSalesCount"
  | "paymentsCount"
  | "collectionToIssuedRatePercent"
  | "outstandingBalance"
  | "debtorsCount";

export interface ZetraAiCreditMetricComparison {
  metric: ZetraAiCreditMetricKey;

  currentValue: number;
  previousValue: number;

  absoluteChange: number;

  /**
   * Null means percentage change cannot be calculated
   * because the previous value is zero while the current
   * value is non-zero.
   */
  percentageChange: number | null;

  direction: ZetraAiCreditTrendDirection;
}

export interface ZetraAiCreditChannelMix {
  cashPercent: number;
  bankPercent: number;
  mobilePercent: number;
  otherPercent: number;

  totalCollectionsByChannel: number;
}

export interface ZetraAiCreditConcentration {
  topDebtorBalance: number;
  topDebtorSharePercent: number | null;

  top3DebtorsBalance: number;
  top3DebtorsSharePercent: number | null;

  top5DebtorsBalance: number;
  top5DebtorsSharePercent: number | null;
}

export interface ZetraAiCreditDerivedMetrics {
  /**
   * Current positive debt exposure.
   */
  outstandingBalance: number;

  debtorsCount: number;

  averageOutstandingPerDebtor: number;

  /**
   * Customer overpayments / advance-credit position.
   *
   * This must NOT be interpreted as negative debt.
   */
  customerCreditBalance: number;

  /**
   * Net ledger position supplied by canonical source.
   */
  netLedgerBalance: number;

  creditIssued: number;
  creditSalesCount: number;

  collections: number;
  paymentsCount: number;

  netCreditMovement: number;

  averageCreditSaleValue: number;
  averageCollectionValue: number;

  /**
   * Period collections divided by period credit issued.
   *
   * IMPORTANT:
   * This is NOT cohort recovery rate because collections
   * may relate to credit issued before the requested period.
   */
  collectionToIssuedRatePercent: number | null;

  collectionChannels: ZetraAiCreditCollectionChannels;

  channelMix: ZetraAiCreditChannelMix;

  concentration: ZetraAiCreditConcentration;
}

export interface ZetraAiCreditAnalysis {
  intelligence: ZetraAiCreditIntelligence;

  metrics: ZetraAiCreditDerivedMetrics;

  topDebtors: ZetraAiCreditDebtor[];

  capabilities: ZetraAiCreditIntelligence["capabilities"];

  dataQuality: ZetraAiCreditDataQuality;
}

export interface ZetraAiCreditPeriodComparison {
  current: ZetraAiCreditAnalysis;
  previous: ZetraAiCreditAnalysis;

  creditIssued: ZetraAiCreditMetricComparison;

  collections: ZetraAiCreditMetricComparison;

  netCreditMovement: ZetraAiCreditMetricComparison;

  creditSalesCount: ZetraAiCreditMetricComparison;

  paymentsCount: ZetraAiCreditMetricComparison;

  collectionToIssuedRatePercent:
    ZetraAiCreditMetricComparison;

  /**
   * IMPORTANT:
   *
   * These are CURRENT POSITION comparisons returned by
   * each canonical query.
   *
   * They must not be described as "debt created during
   * the period".
   */
  outstandingBalance: ZetraAiCreditMetricComparison;

  debtorsCount: ZetraAiCreditMetricComparison;
}

/**
 * ============================================================================
 * NUMBER HELPERS
 * ============================================================================
 */

function finite(value: unknown): number {
  const n =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : 0;

  return Number.isFinite(n)
    ? n
    : 0;
}

function round(
  value: number,
  decimals = 2
): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  const factor =
    10 ** decimals;

  return (
    Math.round(
      (value + Number.EPSILON) *
        factor
    ) / factor
  );
}

function safeDivide(
  numerator: number,
  denominator: number
): number {
  const safeNumerator =
    finite(numerator);

  const safeDenominator =
    finite(denominator);

  if (safeDenominator === 0) {
    return 0;
  }

  return (
    safeNumerator /
    safeDenominator
  );
}

function percent(
  numerator: number,
  denominator: number
): number {
  return round(
    safeDivide(
      numerator,
      denominator
    ) * 100,
    2
  );
}

/**
 * ============================================================================
 * COMPARISON HELPERS
 * ============================================================================
 */

export function calculateCreditPercentageChange(
  currentValue: number,
  previousValue: number
): number | null {
  const current =
    finite(currentValue);

  const previous =
    finite(previousValue);

  if (previous === 0) {
    if (current === 0) {
      return 0;
    }

    return null;
  }

  return round(
    ((current - previous) /
      Math.abs(previous)) *
      100,
    2
  );
}

export function detectCreditTrendDirection(
  currentValue: number,
  previousValue: number
): ZetraAiCreditTrendDirection {
  const current =
    finite(currentValue);

  const previous =
    finite(previousValue);

  if (
    previous === 0 &&
    current !== 0
  ) {
    return "NO_BASELINE";
  }

  const delta =
    round(
      current - previous,
      8
    );

  if (delta > 0) {
    return "UP";
  }

  if (delta < 0) {
    return "DOWN";
  }

  return "FLAT";
}

export function compareCreditMetric(
  metric: ZetraAiCreditMetricKey,
  currentValue: number,
  previousValue: number
): ZetraAiCreditMetricComparison {
  const current =
    finite(currentValue);

  const previous =
    finite(previousValue);

  return {
    metric,

    currentValue:
      round(current, 2),

    previousValue:
      round(previous, 2),

    absoluteChange:
      round(
        current - previous,
        2
      ),

    percentageChange:
      calculateCreditPercentageChange(
        current,
        previous
      ),

    direction:
      detectCreditTrendDirection(
        current,
        previous
      ),
  };
}

/**
 * ============================================================================
 * COLLECTION CHANNEL MIX
 * ============================================================================
 */

export function buildCreditChannelMix(
  channels: ZetraAiCreditCollectionChannels
): ZetraAiCreditChannelMix {
  const cash =
    Math.max(
      finite(channels.cash),
      0
    );

  const bank =
    Math.max(
      finite(channels.bank),
      0
    );

  const mobile =
    Math.max(
      finite(channels.mobile),
      0
    );

  const other =
    Math.max(
      finite(channels.other),
      0
    );

  const total =
    round(
      cash +
        bank +
        mobile +
        other,
      2
    );

  return {
    cashPercent:
      total > 0
        ? percent(cash, total)
        : 0,

    bankPercent:
      total > 0
        ? percent(bank, total)
        : 0,

    mobilePercent:
      total > 0
        ? percent(
            mobile,
            total
          )
        : 0,

    otherPercent:
      total > 0
        ? percent(
            other,
            total
          )
        : 0,

    totalCollectionsByChannel:
      total,
  };
}

/**
 * ============================================================================
 * DEBTOR CONCENTRATION
 * ============================================================================
 */

function positiveDebtorBalance(
  debtor: ZetraAiCreditDebtor
): number {
  return Math.max(
    finite(
      debtor.outstandingBalance
    ),
    0
  );
}

function sumTopDebtors(
  debtors: ZetraAiCreditDebtor[],
  limit: number
): number {
  return round(
    debtors
      .slice(0, limit)
      .reduce(
        (
          total,
          debtor
        ) =>
          total +
          positiveDebtorBalance(
            debtor
          ),
        0
      ),
    2
  );
}

export function buildCreditConcentration(
  debtors: ZetraAiCreditDebtor[],
  outstandingBalance: number
): ZetraAiCreditConcentration {
  const totalOutstanding =
    Math.max(
      finite(
        outstandingBalance
      ),
      0
    );

  const sorted =
    [...debtors]
      .filter(
        (debtor) =>
          positiveDebtorBalance(
            debtor
          ) > 0
      )
      .sort(
        (a, b) =>
          positiveDebtorBalance(
            b
          ) -
          positiveDebtorBalance(
            a
          )
      );

  const topDebtorBalance =
    sorted.length > 0
      ? round(
          positiveDebtorBalance(
            sorted[0]
          ),
          2
        )
      : 0;

  const top3DebtorsBalance =
    sumTopDebtors(
      sorted,
      3
    );

  const top5DebtorsBalance =
    sumTopDebtors(
      sorted,
      5
    );

  return {
    topDebtorBalance,

    topDebtorSharePercent:
      totalOutstanding > 0
        ? percent(
            topDebtorBalance,
            totalOutstanding
          )
        : null,

    top3DebtorsBalance,

    top3DebtorsSharePercent:
      totalOutstanding > 0
        ? percent(
            top3DebtorsBalance,
            totalOutstanding
          )
        : null,

    top5DebtorsBalance,

    top5DebtorsSharePercent:
      totalOutstanding > 0
        ? percent(
            top5DebtorsBalance,
            totalOutstanding
          )
        : null,
  };
}

/**
 * ============================================================================
 * DERIVED CREDIT METRICS
 * ============================================================================
 */

export function buildCreditDerivedMetrics(
  intelligence: ZetraAiCreditIntelligence
): ZetraAiCreditDerivedMetrics {
  const current =
    intelligence.currentPosition;

  const activity =
    intelligence.periodActivity;

  const outstandingBalance =
    Math.max(
      finite(
        current.outstandingBalance
      ),
      0
    );

  const debtorsCount =
    Math.max(
      finite(
        current.debtorsCount
      ),
      0
    );

  const creditIssued =
    Math.max(
      finite(
        activity.creditIssued
      ),
      0
    );

  const creditSalesCount =
    Math.max(
      finite(
        activity.creditSalesCount
      ),
      0
    );

  const collections =
    Math.max(
      finite(
        activity.collections
      ),
      0
    );

  const paymentsCount =
    Math.max(
      finite(
        activity.paymentsCount
      ),
      0
    );

  const channelMix =
    buildCreditChannelMix(
      intelligence.collectionChannels
    );

  return {
    outstandingBalance:
      round(
        outstandingBalance,
        2
      ),

    debtorsCount:
      round(
        debtorsCount,
        0
      ),

    averageOutstandingPerDebtor:
      debtorsCount > 0
        ? round(
            safeDivide(
              outstandingBalance,
              debtorsCount
            ),
            2
          )
        : 0,

    customerCreditBalance:
      round(
        Math.max(
          finite(
            current.customerCreditBalance
          ),
          0
        ),
        2
      ),

    netLedgerBalance:
      round(
        finite(
          current.netLedgerBalance
        ),
        2
      ),

    creditIssued:
      round(
        creditIssued,
        2
      ),

    creditSalesCount:
      round(
        creditSalesCount,
        0
      ),

    collections:
      round(
        collections,
        2
      ),

    paymentsCount:
      round(
        paymentsCount,
        0
      ),

    netCreditMovement:
      round(
        finite(
          activity.netCreditMovement
        ),
        2
      ),

    averageCreditSaleValue:
      creditSalesCount > 0
        ? round(
            safeDivide(
              creditIssued,
              creditSalesCount
            ),
            2
          )
        : 0,

    averageCollectionValue:
      paymentsCount > 0
        ? round(
            safeDivide(
              collections,
              paymentsCount
            ),
            2
          )
        : 0,

    collectionToIssuedRatePercent:
      activity.collectionToIssuedRatePercent == null
        ? null
        : round(
            finite(
              activity.collectionToIssuedRatePercent
            ),
            2
          ),

    collectionChannels:
      intelligence.collectionChannels,

    channelMix,

    concentration:
      buildCreditConcentration(
        intelligence.topDebtors,
        outstandingBalance
      ),
  };
}

/**
 * ============================================================================
 * CREDIT ANALYSIS
 * ============================================================================
 */

export function buildCreditAnalysis(
  intelligence: ZetraAiCreditIntelligence
): ZetraAiCreditAnalysis {
  return {
    intelligence,

    metrics:
      buildCreditDerivedMetrics(
        intelligence
      ),

    topDebtors:
      intelligence.topDebtors,

    capabilities:
      intelligence.capabilities,

    dataQuality:
      intelligence.dataQuality,
  };
}

/**
 * ============================================================================
 * PERIOD COMPARISON
 * ============================================================================
 */

export function compareCreditPeriods(
  currentIntelligence:
    ZetraAiCreditIntelligence,

  previousIntelligence:
    ZetraAiCreditIntelligence
): ZetraAiCreditPeriodComparison {
  const current =
    buildCreditAnalysis(
      currentIntelligence
    );

  const previous =
    buildCreditAnalysis(
      previousIntelligence
    );

  return {
    current,
    previous,

    creditIssued:
      compareCreditMetric(
        "creditIssued",
        current.metrics
          .creditIssued,
        previous.metrics
          .creditIssued
      ),

    collections:
      compareCreditMetric(
        "collections",
        current.metrics
          .collections,
        previous.metrics
          .collections
      ),

    netCreditMovement:
      compareCreditMetric(
        "netCreditMovement",
        current.metrics
          .netCreditMovement,
        previous.metrics
          .netCreditMovement
      ),

    creditSalesCount:
      compareCreditMetric(
        "creditSalesCount",
        current.metrics
          .creditSalesCount,
        previous.metrics
          .creditSalesCount
      ),

    paymentsCount:
      compareCreditMetric(
        "paymentsCount",
        current.metrics
          .paymentsCount,
        previous.metrics
          .paymentsCount
      ),

    collectionToIssuedRatePercent:
      compareCreditMetric(
        "collectionToIssuedRatePercent",
        current.metrics
          .collectionToIssuedRatePercent ??
          0,
        previous.metrics
          .collectionToIssuedRatePercent ??
          0
      ),

    outstandingBalance:
      compareCreditMetric(
        "outstandingBalance",
        current.metrics
          .outstandingBalance,
        previous.metrics
          .outstandingBalance
      ),

    debtorsCount:
      compareCreditMetric(
        "debtorsCount",
        current.metrics
          .debtorsCount,
        previous.metrics
          .debtorsCount
      ),
  };
}

/**
 * ============================================================================
 * CAPABILITY HELPERS
 * ============================================================================
 */

export function canAnalyzeCreditOverdue(
  intelligence: ZetraAiCreditIntelligence
): boolean {
  return (
    intelligence.capabilities
      .supportsOverdue === true
  );
}

export function getCreditOverdueLimitation(
  intelligence: ZetraAiCreditIntelligence
): string | null {
  if (
    canAnalyzeCreditOverdue(
      intelligence
    )
  ) {
    return null;
  }

  return (
    intelligence.capabilities
      .overdueReason ||
    "Verified overdue credit data is not available."
  );
}

/**
 * ============================================================================
 * DATA QUALITY HELPERS
 * ============================================================================
 */

export function hasCreditDataQualityWarning(
  intelligence: ZetraAiCreditIntelligence
): boolean {
  return (
    finite(
      intelligence.dataQuality
        .negativeBalanceAccounts
    ) > 0
  );
}

/**
 * ============================================================================
 * ENGINE EXPORT
 * ============================================================================
 */
/**
 * ============================================================================
 * CUSTOMER CREDIT HISTORY ANALYSIS
 * ============================================================================
 *
 * This layer only transforms verified canonical customer-credit history.
 *
 * It does NOT:
 * - Search customers.
 * - Guess customer identity.
 * - Infer missing payments.
 * - Invent dates or amounts.
 * - Decide whether a customer is overdue.
 * ============================================================================
 */

export interface ZetraAiCreditCustomerHistoryAnalysis {
  status:
    ZetraAiCreditCustomerHistory["status"];

  query: string;

  matchCount: number | null;

  customer:
    ZetraAiCreditCustomerHistory["customer"];

  currentBalance: number | null;

  latestPayment:
    ZetraAiCreditCustomerLatestActivity | null;

  latestCreditSale:
    ZetraAiCreditCustomerLatestActivity | null;

  transactions:
    ZetraAiCreditCustomerTransaction[];

  totalCreditIssuedFromHistory: number;

  totalPaymentsFromHistory: number;

  creditSalesCountFromHistory: number;

  paymentsCountFromHistory: number;

  hasVerifiedLatestPayment: boolean;

  hasVerifiedLatestCreditSale: boolean;

  hasVerifiedCurrentBalance: boolean;

  generatedAt: string | null;
}

function positiveTransactionAmount(
  transaction: ZetraAiCreditCustomerTransaction
): number {
  const amount =
    Math.abs(
      finite(
        transaction.amount
      )
    );

  if (amount > 0) {
    return amount;
  }

  return Math.abs(
    finite(
      transaction.delta
    )
  );
}

export function buildCreditCustomerHistoryAnalysis(
  history: ZetraAiCreditCustomerHistory
): ZetraAiCreditCustomerHistoryAnalysis {
  const isFound =
    history.status === "FOUND";

  const transactions =
    isFound
      ? history.transactions
      : [];

  let totalCreditIssuedFromHistory = 0;
  let totalPaymentsFromHistory = 0;

  let creditSalesCountFromHistory = 0;
  let paymentsCountFromHistory = 0;

  for (const transaction of transactions) {
    const entryType =
      String(
        transaction.entryType ?? ""
      )
        .trim()
        .toUpperCase();

    const amount =
      positiveTransactionAmount(
        transaction
      );

    if (entryType === "SALE") {
      totalCreditIssuedFromHistory +=
        amount;

      creditSalesCountFromHistory += 1;

      continue;
    }

    if (entryType === "PAYMENT") {
      totalPaymentsFromHistory +=
        amount;

      paymentsCountFromHistory += 1;
    }
  }

  const latestPayment =
    isFound
      ? history.latestPayment
      : null;

  const latestCreditSale =
    isFound
      ? history.latestCreditSale
      : null;

  const currentBalance =
    isFound &&
    history.currentBalance !== null
      ? round(
          finite(
            history.currentBalance
          ),
          2
        )
      : null;

  return {
    status:
      history.status,

    query:
      history.query,

    matchCount:
      history.matchCount,

    customer:
      isFound
        ? history.customer
        : null,

    currentBalance,

    latestPayment,

    latestCreditSale,

    transactions,

    totalCreditIssuedFromHistory:
      round(
        totalCreditIssuedFromHistory,
        2
      ),

    totalPaymentsFromHistory:
      round(
        totalPaymentsFromHistory,
        2
      ),

    creditSalesCountFromHistory,

    paymentsCountFromHistory,

    hasVerifiedLatestPayment:
      latestPayment !== null,

    hasVerifiedLatestCreditSale:
      latestCreditSale !== null,

    hasVerifiedCurrentBalance:
      currentBalance !== null,

    generatedAt:
      history.generatedAt,
  };
}

export function hasVerifiedCreditCustomer(
  history: ZetraAiCreditCustomerHistory
): boolean {
  return (
    history.status === "FOUND" &&
    history.customer !== null
  );
}

export function hasVerifiedCreditCustomerLatestPayment(
  history: ZetraAiCreditCustomerHistory
): boolean {
  return (
    hasVerifiedCreditCustomer(
      history
    ) &&
    history.latestPayment !== null
  );
}

export function hasVerifiedCreditCustomerLatestSale(
  history: ZetraAiCreditCustomerHistory
): boolean {
  return (
    hasVerifiedCreditCustomer(
      history
    ) &&
    history.latestCreditSale !== null
  );
}
export const zetraAiCreditEngine = {
  calculateCreditPercentageChange,
  detectCreditTrendDirection,
  compareCreditMetric,

  buildCreditChannelMix,
  buildCreditConcentration,

  buildCreditDerivedMetrics,
  buildCreditAnalysis,

  compareCreditPeriods,

  canAnalyzeCreditOverdue,
  getCreditOverdueLimitation,

  hasCreditDataQualityWarning,

  buildCreditCustomerHistoryAnalysis,
  hasVerifiedCreditCustomer,
  hasVerifiedCreditCustomerLatestPayment,
  hasVerifiedCreditCustomerLatestSale,
} as const;