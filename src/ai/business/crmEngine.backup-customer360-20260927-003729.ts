// src/ai/business/crmEngine.ts

/**
 * ============================================================================
 * ZETRA AI — CRM ENGINE
 * ============================================================================
 *
 * Purpose:
 * Transform verified canonical CRM intelligence into deterministic,
 * business-ready customer metrics and period comparisons.
 *
 * Source:
 *   crmRepository.ts
 *        │
 *        ▼
 *   get_ai_crm_intelligence_v1
 *
 * Canonical principles:
 * - ZETRA determines the numbers.
 * - Only verified customer identity is used for customer metrics.
 * - Anonymous sales are never assigned to customers by inference.
 * - Customer identity V1 is customers.id.
 * - Same phone/name does NOT automatically mean same customer.
 * - Historical customer value is verified historical spend,
 *   NOT predictive CLV.
 * - Inactivity always preserves its explicit threshold.
 * - Historical identity coverage limitations must remain visible.
 *
 * Responsibilities:
 * - Preserve canonical CRM figures.
 * - Calculate safe derived customer indicators.
 * - Compare CRM periods.
 * - Calculate customer composition ratios.
 * - Calculate identity coverage gaps.
 * - Preserve top-customer rankings from canonical source.
 * - Preserve canonical capabilities and data-quality warnings.
 *
 * This module DOES NOT:
 * - Query Supabase directly.
 * - Call OpenAI.
 * - Interpret natural language.
 * - Search or resolve customer identity.
 * - Merge customers by phone or name.
 * - Assign anonymous sales to customers.
 * - Use customers.total_orders / total_spent / last_seen_at.
 * - Invent predictive CLV.
 * - Invent customer history outside verified ZETRA data.
 * ============================================================================
 */

import type {
  ZetraAiCrmDataQuality,
  ZetraAiCrmHistoricalTopCustomer,
  ZetraAiCrmIdentityCoverage,
  ZetraAiCrmIntelligence,
  ZetraAiCrmTopCustomer,
} from "./crmRepository";

/**
 * ============================================================================
 * TYPES
 * ============================================================================
 */

export type ZetraAiCrmTrendDirection =
  | "UP"
  | "DOWN"
  | "FLAT"
  | "NO_BASELINE";

export type ZetraAiCrmMetricKey =
  | "activeIdentifiedCustomers"
  | "newCustomers"
  | "returningCustomers"
  | "lifetimeRepeatCustomersActiveInPeriod"
  | "repeatPurchasersWithinPeriod"
  | "identifiedOrders"
  | "identifiedRevenue"
  | "averageOrderValue"
  | "averageSpendPerActiveCustomer"
  | "averagePurchasesPerActiveCustomer"
  | "transactionIdentityCoveragePercent"
  | "revenueIdentityCoveragePercent"
  | "inactiveCustomers";

export interface ZetraAiCrmMetricComparison {
  metric: ZetraAiCrmMetricKey;

  currentValue: number;
  previousValue: number;

  absoluteChange: number;

  /**
   * Null means percentage change cannot be calculated
   * because previous value is zero while current value
   * is non-zero.
   */
  percentageChange: number | null;

  direction: ZetraAiCrmTrendDirection;
}

export interface ZetraAiCrmCustomerComposition {
  /**
   * Share of active identified customers whose first
   * verified purchase in the requested scope falls
   * inside the requested period.
   */
  newCustomerSharePercent: number;

  /**
   * Share of active identified customers whose first
   * verified purchase predates the requested period.
   */
  returningCustomerSharePercent: number;

  /**
   * Share of active identified customers that have
   * at least two verified historical purchases as-of
   * the period end.
   */
  lifetimeRepeatCustomerSharePercent: number;

  /**
   * Share of active identified customers that purchased
   * at least twice inside the requested period.
   */
  periodRepeatPurchaserSharePercent: number;
}

export interface ZetraAiCrmIdentityCoverageAnalysis {
  totalCompletedSales: number;

  identifiedSales: number;
  unidentifiedSales: number;

  transactionIdentityCoveragePercent: number | null;
  transactionIdentityGapPercent: number | null;

  totalRevenue: number;

  identifiedRevenue: number;
  unidentifiedRevenue: number;

  revenueIdentityCoveragePercent: number | null;
  revenueIdentityGapPercent: number | null;
}

export interface ZetraAiCrmDerivedMetrics {
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

  inactiveCustomers: number;
  inactivityThresholdDays: number;

  customerComposition: ZetraAiCrmCustomerComposition;

  identityCoverage: ZetraAiCrmIdentityCoverageAnalysis;
}

export interface ZetraAiCrmAnalysis {
  intelligence: ZetraAiCrmIntelligence;

  metrics: ZetraAiCrmDerivedMetrics;

  topCustomersByPeriodSpend: ZetraAiCrmTopCustomer[];

  topCustomersByPeriodPurchaseCount: ZetraAiCrmTopCustomer[];

  topCustomersByHistoricalValue:
    ZetraAiCrmHistoricalTopCustomer[];

  capabilities: ZetraAiCrmIntelligence["capabilities"];

  dataQuality: ZetraAiCrmDataQuality;
}

export interface ZetraAiCrmPeriodComparison {
  current: ZetraAiCrmAnalysis;
  previous: ZetraAiCrmAnalysis;

  activeIdentifiedCustomers:
    ZetraAiCrmMetricComparison;

  newCustomers:
    ZetraAiCrmMetricComparison;

  returningCustomers:
    ZetraAiCrmMetricComparison;

  lifetimeRepeatCustomersActiveInPeriod:
    ZetraAiCrmMetricComparison;

  repeatPurchasersWithinPeriod:
    ZetraAiCrmMetricComparison;

  identifiedOrders:
    ZetraAiCrmMetricComparison;

  identifiedRevenue:
    ZetraAiCrmMetricComparison;

  averageOrderValue:
    ZetraAiCrmMetricComparison;

  averageSpendPerActiveCustomer:
    ZetraAiCrmMetricComparison;

  averagePurchasesPerActiveCustomer:
    ZetraAiCrmMetricComparison;

  transactionIdentityCoveragePercent:
    ZetraAiCrmMetricComparison;

  revenueIdentityCoveragePercent:
    ZetraAiCrmMetricComparison;

  inactiveCustomers:
    ZetraAiCrmMetricComparison;
}

/**
 * ============================================================================
 * NUMBER HELPERS
 * ============================================================================
 */

function finite(
  value: unknown
): number {
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

function nullablePercentGap(
  coveragePercent: number | null
): number | null {
  if (
    coveragePercent === null ||
    coveragePercent === undefined
  ) {
    return null;
  }

  return round(
    100 -
      finite(
        coveragePercent
      ),
    2
  );
}

/**
 * ============================================================================
 * COMPARISON HELPERS
 * ============================================================================
 */

export function calculateCrmPercentageChange(
  currentValue: number,
  previousValue: number
): number | null {
  const current =
    finite(
      currentValue
    );

  const previous =
    finite(
      previousValue
    );

  if (previous === 0) {
    if (current === 0) {
      return 0;
    }

    return null;
  }

  return round(
    (
      (current - previous) /
      Math.abs(previous)
    ) * 100,
    2
  );
}

export function detectCrmTrendDirection(
  currentValue: number,
  previousValue: number
): ZetraAiCrmTrendDirection {
  const current =
    finite(
      currentValue
    );

  const previous =
    finite(
      previousValue
    );

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

export function compareCrmMetric(
  metric: ZetraAiCrmMetricKey,
  currentValue: number,
  previousValue: number
): ZetraAiCrmMetricComparison {
  const current =
    finite(
      currentValue
    );

  const previous =
    finite(
      previousValue
    );

  return {
    metric,

    currentValue:
      round(
        current,
        2
      ),

    previousValue:
      round(
        previous,
        2
      ),

    absoluteChange:
      round(
        current - previous,
        2
      ),

    percentageChange:
      calculateCrmPercentageChange(
        current,
        previous
      ),

    direction:
      detectCrmTrendDirection(
        current,
        previous
      ),
  };
}

/**
 * ============================================================================
 * CUSTOMER COMPOSITION
 * ============================================================================
 */

export function buildCrmCustomerComposition(
  intelligence: ZetraAiCrmIntelligence
): ZetraAiCrmCustomerComposition {
  const summary =
    intelligence.periodSummary;

  const active =
    Math.max(
      finite(
        summary.activeIdentifiedCustomers
      ),
      0
    );

  const newCustomers =
    Math.max(
      finite(
        summary.newCustomers
      ),
      0
    );

  const returningCustomers =
    Math.max(
      finite(
        summary.returningCustomers
      ),
      0
    );

  const lifetimeRepeat =
    Math.max(
      finite(
        summary
          .lifetimeRepeatCustomersActiveInPeriod
      ),
      0
    );

  const periodRepeat =
    Math.max(
      finite(
        summary.repeatPurchasersWithinPeriod
      ),
      0
    );

  return {
    newCustomerSharePercent:
      active > 0
        ? percent(
            newCustomers,
            active
          )
        : 0,

    returningCustomerSharePercent:
      active > 0
        ? percent(
            returningCustomers,
            active
          )
        : 0,

    lifetimeRepeatCustomerSharePercent:
      active > 0
        ? percent(
            lifetimeRepeat,
            active
          )
        : 0,

    periodRepeatPurchaserSharePercent:
      active > 0
        ? percent(
            periodRepeat,
            active
          )
        : 0,
  };
}

/**
 * ============================================================================
 * IDENTITY COVERAGE
 * ============================================================================
 */

export function buildCrmIdentityCoverageAnalysis(
  coverage: ZetraAiCrmIdentityCoverage
): ZetraAiCrmIdentityCoverageAnalysis {
  const totalCompletedSales =
    Math.max(
      finite(
        coverage.totalCompletedSales
      ),
      0
    );

  const identifiedSales =
    Math.max(
      finite(
        coverage.identifiedSales
      ),
      0
    );

  const unidentifiedSales =
    Math.max(
      finite(
        coverage.unidentifiedSales
      ),
      0
    );

  const totalRevenue =
    finite(
      coverage.totalRevenue
    );

  const identifiedRevenue =
    finite(
      coverage.identifiedRevenue
    );

  const unidentifiedRevenue =
    finite(
      coverage.unidentifiedRevenue
    );

  const transactionCoverage =
    coverage
      .transactionIdentityCoveragePercent ==
    null
      ? null
      : round(
          finite(
            coverage
              .transactionIdentityCoveragePercent
          ),
          2
        );

  const revenueCoverage =
    coverage
      .revenueIdentityCoveragePercent ==
    null
      ? null
      : round(
          finite(
            coverage
              .revenueIdentityCoveragePercent
          ),
          2
        );

  return {
    totalCompletedSales:
      round(
        totalCompletedSales,
        0
      ),

    identifiedSales:
      round(
        identifiedSales,
        0
      ),

    unidentifiedSales:
      round(
        unidentifiedSales,
        0
      ),

    transactionIdentityCoveragePercent:
      transactionCoverage,

    transactionIdentityGapPercent:
      nullablePercentGap(
        transactionCoverage
      ),

    totalRevenue:
      round(
        totalRevenue,
        2
      ),

    identifiedRevenue:
      round(
        identifiedRevenue,
        2
      ),

    unidentifiedRevenue:
      round(
        unidentifiedRevenue,
        2
      ),

    revenueIdentityCoveragePercent:
      revenueCoverage,

    revenueIdentityGapPercent:
      nullablePercentGap(
        revenueCoverage
      ),
  };
}

/**
 * ============================================================================
 * DERIVED CRM METRICS
 * ============================================================================
 */

export function buildCrmDerivedMetrics(
  intelligence: ZetraAiCrmIntelligence
): ZetraAiCrmDerivedMetrics {
  const summary =
    intelligence.periodSummary;

  const inactivity =
    intelligence.inactivity;

  return {
    activeIdentifiedCustomers:
      round(
        Math.max(
          finite(
            summary.activeIdentifiedCustomers
          ),
          0
        ),
        0
      ),

    newCustomers:
      round(
        Math.max(
          finite(
            summary.newCustomers
          ),
          0
        ),
        0
      ),

    returningCustomers:
      round(
        Math.max(
          finite(
            summary.returningCustomers
          ),
          0
        ),
        0
      ),

    lifetimeRepeatCustomersActiveInPeriod:
      round(
        Math.max(
          finite(
            summary
              .lifetimeRepeatCustomersActiveInPeriod
          ),
          0
        ),
        0
      ),

    repeatPurchasersWithinPeriod:
      round(
        Math.max(
          finite(
            summary
              .repeatPurchasersWithinPeriod
          ),
          0
        ),
        0
      ),

    identifiedOrders:
      round(
        Math.max(
          finite(
            summary.identifiedOrders
          ),
          0
        ),
        0
      ),

    identifiedRevenue:
      round(
        finite(
          summary.identifiedRevenue
        ),
        2
      ),

    averageOrderValue:
      summary.averageOrderValue == null
        ? null
        : round(
            finite(
              summary.averageOrderValue
            ),
            2
          ),

    averageSpendPerActiveCustomer:
      summary
        .averageSpendPerActiveCustomer ==
      null
        ? null
        : round(
            finite(
              summary
                .averageSpendPerActiveCustomer
            ),
            2
          ),

    averagePurchasesPerActiveCustomer:
      summary
        .averagePurchasesPerActiveCustomer ==
      null
        ? null
        : round(
            finite(
              summary
                .averagePurchasesPerActiveCustomer
            ),
            2
          ),

    inactiveCustomers:
      round(
        Math.max(
          finite(
            inactivity.inactiveCustomers
          ),
          0
        ),
        0
      ),

    inactivityThresholdDays:
      round(
        Math.max(
          finite(
            inactivity.thresholdDays
          ),
          0
        ),
        0
      ),

    customerComposition:
      buildCrmCustomerComposition(
        intelligence
      ),

    identityCoverage:
      buildCrmIdentityCoverageAnalysis(
        intelligence.identityCoverage
      ),
  };
}

/**
 * ============================================================================
 * CRM ANALYSIS
 * ============================================================================
 */

export function buildCrmAnalysis(
  intelligence: ZetraAiCrmIntelligence
): ZetraAiCrmAnalysis {
  return {
    intelligence,

    metrics:
      buildCrmDerivedMetrics(
        intelligence
      ),

    topCustomersByPeriodSpend:
      intelligence.topCustomers
        .byPeriodSpend,

    topCustomersByPeriodPurchaseCount:
      intelligence.topCustomers
        .byPeriodPurchaseCount,

    topCustomersByHistoricalValue:
      intelligence.topCustomers
        .byHistoricalValue,

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

export function compareCrmPeriods(
  currentIntelligence:
    ZetraAiCrmIntelligence,

  previousIntelligence:
    ZetraAiCrmIntelligence
): ZetraAiCrmPeriodComparison {
  const current =
    buildCrmAnalysis(
      currentIntelligence
    );

  const previous =
    buildCrmAnalysis(
      previousIntelligence
    );

  return {
    current,
    previous,

    activeIdentifiedCustomers:
      compareCrmMetric(
        "activeIdentifiedCustomers",
        current.metrics
          .activeIdentifiedCustomers,
        previous.metrics
          .activeIdentifiedCustomers
      ),

    newCustomers:
      compareCrmMetric(
        "newCustomers",
        current.metrics
          .newCustomers,
        previous.metrics
          .newCustomers
      ),

    returningCustomers:
      compareCrmMetric(
        "returningCustomers",
        current.metrics
          .returningCustomers,
        previous.metrics
          .returningCustomers
      ),

    lifetimeRepeatCustomersActiveInPeriod:
      compareCrmMetric(
        "lifetimeRepeatCustomersActiveInPeriod",
        current.metrics
          .lifetimeRepeatCustomersActiveInPeriod,
        previous.metrics
          .lifetimeRepeatCustomersActiveInPeriod
      ),

    repeatPurchasersWithinPeriod:
      compareCrmMetric(
        "repeatPurchasersWithinPeriod",
        current.metrics
          .repeatPurchasersWithinPeriod,
        previous.metrics
          .repeatPurchasersWithinPeriod
      ),

    identifiedOrders:
      compareCrmMetric(
        "identifiedOrders",
        current.metrics
          .identifiedOrders,
        previous.metrics
          .identifiedOrders
      ),

    identifiedRevenue:
      compareCrmMetric(
        "identifiedRevenue",
        current.metrics
          .identifiedRevenue,
        previous.metrics
          .identifiedRevenue
      ),

    averageOrderValue:
      compareCrmMetric(
        "averageOrderValue",
        current.metrics
          .averageOrderValue ??
          0,
        previous.metrics
          .averageOrderValue ??
          0
      ),

    averageSpendPerActiveCustomer:
      compareCrmMetric(
        "averageSpendPerActiveCustomer",
        current.metrics
          .averageSpendPerActiveCustomer ??
          0,
        previous.metrics
          .averageSpendPerActiveCustomer ??
          0
      ),

    averagePurchasesPerActiveCustomer:
      compareCrmMetric(
        "averagePurchasesPerActiveCustomer",
        current.metrics
          .averagePurchasesPerActiveCustomer ??
          0,
        previous.metrics
          .averagePurchasesPerActiveCustomer ??
          0
      ),

    transactionIdentityCoveragePercent:
      compareCrmMetric(
        "transactionIdentityCoveragePercent",
        current.metrics
          .identityCoverage
          .transactionIdentityCoveragePercent ??
          0,
        previous.metrics
          .identityCoverage
          .transactionIdentityCoveragePercent ??
          0
      ),

    revenueIdentityCoveragePercent:
      compareCrmMetric(
        "revenueIdentityCoveragePercent",
        current.metrics
          .identityCoverage
          .revenueIdentityCoveragePercent ??
          0,
        previous.metrics
          .identityCoverage
          .revenueIdentityCoveragePercent ??
          0
      ),

    inactiveCustomers:
      compareCrmMetric(
        "inactiveCustomers",
        current.metrics
          .inactiveCustomers,
        previous.metrics
          .inactiveCustomers
      ),
  };
}

/**
 * ============================================================================
 * CAPABILITY HELPERS
 * ============================================================================
 */

export function canAnalyzePredictiveCrmClv(
  intelligence: ZetraAiCrmIntelligence
): boolean {
  return (
    intelligence.capabilities
      .supportsPredictiveClv === true
  );
}

export function getCrmPredictiveClvLimitation(
  intelligence: ZetraAiCrmIntelligence
): string | null {
  if (
    canAnalyzePredictiveCrmClv(
      intelligence
    )
  ) {
    return null;
  }

  return (
    "Predictive customer lifetime value is not available. " +
    "Verified historical customer value can be used instead."
  );
}

export function canAutomaticallyMergeCrmCustomersAcrossStores(
  intelligence: ZetraAiCrmIntelligence
): boolean {
  return (
    intelligence.capabilities
      .supportsAutomaticCrossStoreIdentityMerge ===
    true
  );
}

/**
 * ============================================================================
 * DATA QUALITY HELPERS
 * ============================================================================
 */

export function hasCrmHistoricalCoverageWarning(
  intelligence: ZetraAiCrmIntelligence
): boolean {
  return (
    intelligence.dataQuality
      .historicalIdentityCoverageIsComplete !==
    true
  );
}

export function getCrmHistoricalCoverageNote(
  intelligence: ZetraAiCrmIntelligence
): string | null {
  if (
    !hasCrmHistoricalCoverageWarning(
      intelligence
    )
  ) {
    return null;
  }

  return (
    intelligence.dataQuality
      .historicalCoverageNote ||
    "Verified customer identity history is incomplete."
  );
}

export function hasCrmAnonymousSales(
  intelligence: ZetraAiCrmIntelligence
): boolean {
  return (
    finite(
      intelligence.identityCoverage
        .unidentifiedSales
    ) > 0
  );
}

export function hasCrmIdentityCoverageWarning(
  intelligence: ZetraAiCrmIntelligence
): boolean {
  const coverage =
    intelligence.identityCoverage;

  return (
    finite(
      coverage.unidentifiedSales
    ) > 0 ||
    (
      coverage
        .transactionIdentityCoveragePercent !==
        null &&
      finite(
        coverage
          .transactionIdentityCoveragePercent
      ) < 100
    )
  );
}

/**
 * ============================================================================
 * CANONICAL SEMANTIC HELPERS
 * ============================================================================
 */

export function getCrmCustomerHistorySemantics(
  intelligence: ZetraAiCrmIntelligence
): {
  firstPurchaseLabel: string;
  historicalValueLabel: string;
  inactivityLabel: string;
} {
  return {
    firstPurchaseLabel:
      "First verified purchase in ZETRA records",

    historicalValueLabel:
      "Verified historical customer spend",

    inactivityLabel:
      `No verified purchase within the last ${Math.max(
        finite(
          intelligence.inactivity
            .thresholdDays
        ),
        0
      )} days`,
  };
}

/**
 * ============================================================================
 * ENGINE EXPORT
 * ============================================================================
 */

export const zetraAiCrmEngine = {
  calculateCrmPercentageChange,
  detectCrmTrendDirection,
  compareCrmMetric,

  buildCrmCustomerComposition,
  buildCrmIdentityCoverageAnalysis,
  buildCrmDerivedMetrics,
  buildCrmAnalysis,

  compareCrmPeriods,

  canAnalyzePredictiveCrmClv,
  getCrmPredictiveClvLimitation,

  canAutomaticallyMergeCrmCustomersAcrossStores,

  hasCrmHistoricalCoverageWarning,
  getCrmHistoricalCoverageNote,

  hasCrmAnonymousSales,
  hasCrmIdentityCoverageWarning,

  getCrmCustomerHistorySemantics,
} as const;