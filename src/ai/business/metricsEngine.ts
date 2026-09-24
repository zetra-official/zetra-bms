// src/ai/business/metricsEngine.ts

/**
 * ============================================================================
 * ZETRA AI — BUSINESS METRICS ENGINE
 * ============================================================================
 *
 * Purpose:
 * Convert verified canonical daily snapshots into deterministic
 * business intelligence.
 *
 * Source of truth:
 *   public.ai_daily_store_snapshots_v1
 *
 * Data access:
 *   snapshotRepository.ts
 *
 * Responsibilities:
 * - Aggregate daily snapshots into period metrics.
 * - Calculate AOV and profit margins.
 * - Calculate growth / decline percentages.
 * - Compare two business periods.
 * - Detect trend direction.
 * - Rank stores by business performance.
 * - Preserve COGS data-quality awareness.
 *
 * This module DOES NOT:
 * - Query raw sales tables.
 * - Query raw expense tables.
 * - Query raw inventory tables.
 * - Call OpenAI.
 * - Interpret natural language.
 * - Generate conversational answers.
 *
 * OpenAI may explain these results later.
 * OpenAI must NEVER invent these numbers.
 * ============================================================================
 */

import type { ZetraAiDailyStoreSnapshot } from "./types";

/**
 * ============================================================================
 * TYPES
 * ============================================================================
 */

export type ZetraAiTrendDirection =
  | "UP"
  | "DOWN"
  | "FLAT"
  | "NO_BASELINE";

export type ZetraAiMetricKey =
  | "sales"
  | "cogs"
  | "expenses"
  | "grossProfit"
  | "netProfit"
  | "orders"
  | "averageOrderValue"
  | "grossMarginPercent"
  | "netMarginPercent"
  | "stockQty"
  | "availableStockQty";

export interface ZetraAiPeriodMetrics {
  organizationId: string | null;

  /**
   * Present when the dataset belongs to exactly one store.
   * Null for organization-wide / multi-store aggregation.
   */
  storeId: string | null;

  fromDate: string | null;
  toDate: string | null;

  daysWithSnapshots: number;
  storesCount: number;

  salesTotal: number;
  cogsTotal: number;
  expensesTotal: number;

  grossProfit: number;
  netProfit: number;

  ordersCount: number;

  averageOrderValue: number;

  grossMarginPercent: number;
  netMarginPercent: number;

  cogsItemsCount: number;
  cogsMissingItemsCount: number;
  cogsCoveragePercent: number;

  /**
   * Inventory is a position, not a flow.
   *
   * Therefore we DO NOT sum inventory across dates.
   * These values represent the latest snapshot available
   * for each store inside the requested period.
   */
  stockQty: number;
  reservedQty: number;
  availableStockQty: number;

  productsInStock: number;
  outOfStockProducts: number;
  lowStockProducts: number;

  latestSnapshotDate: string | null;

  hasData: boolean;
}

export interface ZetraAiMetricComparison {
  metric: ZetraAiMetricKey;

  currentValue: number;
  previousValue: number;

  absoluteChange: number;

  /**
   * Null means a mathematically meaningful percentage
   * cannot be calculated because previousValue = 0.
   */
  percentageChange: number | null;

  direction: ZetraAiTrendDirection;
}

export interface ZetraAiPeriodComparison {
  current: ZetraAiPeriodMetrics;
  previous: ZetraAiPeriodMetrics;

  sales: ZetraAiMetricComparison;
  cogs: ZetraAiMetricComparison;
  expenses: ZetraAiMetricComparison;

  grossProfit: ZetraAiMetricComparison;
  netProfit: ZetraAiMetricComparison;

  orders: ZetraAiMetricComparison;
  averageOrderValue: ZetraAiMetricComparison;

  grossMarginPercent: ZetraAiMetricComparison;
  netMarginPercent: ZetraAiMetricComparison;

  stockQty: ZetraAiMetricComparison;
  availableStockQty: ZetraAiMetricComparison;
}

export interface ZetraAiStorePerformance {
  organizationId: string;
  storeId: string;

  fromDate: string | null;
  toDate: string | null;

  salesTotal: number;
  netProfit: number;
  grossProfit: number;
  expensesTotal: number;

  ordersCount: number;
  averageOrderValue: number;

  grossMarginPercent: number;
  netMarginPercent: number;

  cogsCoveragePercent: number;

  latestSnapshotDate: string | null;
}

export type ZetraAiStoreRankingMetric =
  | "sales"
  | "netProfit"
  | "grossProfit"
  | "orders"
  | "averageOrderValue"
  | "netMarginPercent";

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

  return Number.isFinite(n) ? n : 0;
}

function round(value: number, decimals = 2): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  const factor = Math.pow(10, decimals);

  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function safeDivide(
  numerator: number,
  denominator: number
): number {
  if (!Number.isFinite(numerator)) {
    return 0;
  }

  if (!Number.isFinite(denominator) || denominator === 0) {
    return 0;
  }

  return numerator / denominator;
}

function percent(
  numerator: number,
  denominator: number
): number {
  return round(safeDivide(numerator, denominator) * 100, 2);
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return Array.from(
    new Set(
      values
        .map((value) => String(value ?? "").trim())
        .filter(Boolean)
    )
  );
}

/**
 * ============================================================================
 * DATE HELPERS
 * ============================================================================
 */

function compareIsoDates(a: string, b: string): number {
  if (a === b) return 0;

  return a < b ? -1 : 1;
}

function minSnapshotDate(
  snapshots: ZetraAiDailyStoreSnapshot[]
): string | null {
  const dates = snapshots
    .map((row) => String(row.snapshotDate ?? "").trim())
    .filter(Boolean)
    .sort(compareIsoDates);

  return dates[0] ?? null;
}

function maxSnapshotDate(
  snapshots: ZetraAiDailyStoreSnapshot[]
): string | null {
  const dates = snapshots
    .map((row) => String(row.snapshotDate ?? "").trim())
    .filter(Boolean)
    .sort(compareIsoDates);

  return dates.length > 0 ? dates[dates.length - 1] : null;
}

/**
 * ============================================================================
 * EMPTY METRICS
 * ============================================================================
 */

export function createEmptyPeriodMetrics(): ZetraAiPeriodMetrics {
  return {
    organizationId: null,
    storeId: null,

    fromDate: null,
    toDate: null,

    daysWithSnapshots: 0,
    storesCount: 0,

    salesTotal: 0,
    cogsTotal: 0,
    expensesTotal: 0,

    grossProfit: 0,
    netProfit: 0,

    ordersCount: 0,

    averageOrderValue: 0,

    grossMarginPercent: 0,
    netMarginPercent: 0,

    cogsItemsCount: 0,
    cogsMissingItemsCount: 0,
    cogsCoveragePercent: 0,

    stockQty: 0,
    reservedQty: 0,
    availableStockQty: 0,

    productsInStock: 0,
    outOfStockProducts: 0,
    lowStockProducts: 0,

    latestSnapshotDate: null,

    hasData: false,
  };
}

/**
 * ============================================================================
 * LATEST INVENTORY POSITION
 * ============================================================================
 *
 * Inventory values are NOT additive across dates.
 *
 * Example:
 *
 * Day 1 stock = 100
 * Day 2 stock = 90
 * Day 3 stock = 80
 *
 * Period stock is NOT 270.
 * Current/latest position is 80.
 *
 * For organization-wide datasets we take the latest snapshot
 * independently for every store, then add those store positions.
 * ============================================================================
 */

function getLatestSnapshotsPerStore(
  snapshots: ZetraAiDailyStoreSnapshot[]
): ZetraAiDailyStoreSnapshot[] {
  const latestByStore = new Map<
    string,
    ZetraAiDailyStoreSnapshot
  >();

  for (const snapshot of snapshots) {
    const storeId = String(snapshot.storeId ?? "").trim();

    if (!storeId) {
      continue;
    }

    const existing = latestByStore.get(storeId);

    if (!existing) {
      latestByStore.set(storeId, snapshot);
      continue;
    }

    const currentDate = String(
      snapshot.snapshotDate ?? ""
    ).trim();

    const existingDate = String(
      existing.snapshotDate ?? ""
    ).trim();

    if (currentDate > existingDate) {
      latestByStore.set(storeId, snapshot);
    }
  }

  return Array.from(latestByStore.values());
}

/**
 * ============================================================================
 * PERIOD AGGREGATION
 * ============================================================================
 */

export function aggregateSnapshots(
  snapshots: ZetraAiDailyStoreSnapshot[]
): ZetraAiPeriodMetrics {
  if (!Array.isArray(snapshots) || snapshots.length === 0) {
    return createEmptyPeriodMetrics();
  }

  const organizationIds = uniqueStrings(
    snapshots.map((row) => row.organizationId)
  );

  const storeIds = uniqueStrings(
    snapshots.map((row) => row.storeId)
  );

  const uniqueDates = uniqueStrings(
    snapshots.map((row) => row.snapshotDate)
  );

  let salesTotal = 0;
  let cogsTotal = 0;
  let expensesTotal = 0;

  let grossProfit = 0;
  let netProfit = 0;

  let ordersCount = 0;

  let cogsItemsCount = 0;
  let cogsMissingItemsCount = 0;

  for (const snapshot of snapshots) {
    salesTotal += finite(snapshot.salesTotal);
    cogsTotal += finite(snapshot.cogsTotal);
    expensesTotal += finite(snapshot.expensesTotal);

    grossProfit += finite(snapshot.grossProfit);
    netProfit += finite(snapshot.netProfit);

    ordersCount += finite(snapshot.ordersCount);

    cogsItemsCount += finite(snapshot.cogsItemsCount);
    cogsMissingItemsCount += finite(
      snapshot.cogsMissingItemsCount
    );
  }

  /**
   * COGS coverage is recalculated using item counts.
   * We intentionally DO NOT average daily percentages because
   * a day with 1 item should not have equal weight to a day
   * with 1,000 items.
   */
  const totalCostRelevantItems =
    cogsItemsCount + cogsMissingItemsCount;

  const cogsCoveragePercent =
    totalCostRelevantItems > 0
      ? percent(cogsItemsCount, totalCostRelevantItems)
      : 100;

  const latestInventorySnapshots =
    getLatestSnapshotsPerStore(snapshots);

  let stockQty = 0;
  let reservedQty = 0;
  let availableStockQty = 0;

  let productsInStock = 0;
  let outOfStockProducts = 0;
  let lowStockProducts = 0;

  for (const snapshot of latestInventorySnapshots) {
    stockQty += finite(snapshot.stockQty);
    reservedQty += finite(snapshot.reservedQty);
    availableStockQty += finite(
      snapshot.availableStockQty
    );

    productsInStock += finite(snapshot.productsInStock);
    outOfStockProducts += finite(
      snapshot.outOfStockProducts
    );
    lowStockProducts += finite(snapshot.lowStockProducts);
  }

  const averageOrderValue =
    ordersCount > 0
      ? round(salesTotal / ordersCount, 2)
      : 0;

  const grossMarginPercent =
    salesTotal !== 0
      ? percent(grossProfit, salesTotal)
      : 0;

  const netMarginPercent =
    salesTotal !== 0
      ? percent(netProfit, salesTotal)
      : 0;

  return {
    organizationId:
      organizationIds.length === 1
        ? organizationIds[0]
        : null,

    storeId:
      storeIds.length === 1
        ? storeIds[0]
        : null,

    fromDate: minSnapshotDate(snapshots),
    toDate: maxSnapshotDate(snapshots),

    daysWithSnapshots: uniqueDates.length,
    storesCount: storeIds.length,

    salesTotal: round(salesTotal, 2),
    cogsTotal: round(cogsTotal, 2),
    expensesTotal: round(expensesTotal, 2),

    grossProfit: round(grossProfit, 2),
    netProfit: round(netProfit, 2),

    ordersCount: round(ordersCount, 0),

    averageOrderValue,

    grossMarginPercent,
    netMarginPercent,

    cogsItemsCount: round(cogsItemsCount, 0),
    cogsMissingItemsCount: round(
      cogsMissingItemsCount,
      0
    ),
    cogsCoveragePercent,

    stockQty: round(stockQty, 2),
    reservedQty: round(reservedQty, 2),
    availableStockQty: round(
      availableStockQty,
      2
    ),

    productsInStock: round(productsInStock, 0),
    outOfStockProducts: round(
      outOfStockProducts,
      0
    ),
    lowStockProducts: round(
      lowStockProducts,
      0
    ),

    latestSnapshotDate:
      maxSnapshotDate(latestInventorySnapshots),

    hasData: true,
  };
}

/**
 * ============================================================================
 * CHANGE / TREND ENGINE
 * ============================================================================
 */

export function calculatePercentageChange(
  currentValue: number,
  previousValue: number
): number | null {
  const current = finite(currentValue);
  const previous = finite(previousValue);

  if (previous === 0) {
    /**
     * 0 -> 0 means no movement.
     */
    if (current === 0) {
      return 0;
    }

    /**
     * Example:
     * previous = 0
     * current = 100,000
     *
     * Calling this "+100%" would be mathematically wrong.
     * There is no valid percentage baseline.
     */
    return null;
  }

  return round(
    ((current - previous) / Math.abs(previous)) * 100,
    2
  );
}

export function detectTrendDirection(
  currentValue: number,
  previousValue: number
): ZetraAiTrendDirection {
  const current = finite(currentValue);
  const previous = finite(previousValue);

  if (previous === 0 && current !== 0) {
    return "NO_BASELINE";
  }

  const delta = round(current - previous, 8);

  if (delta > 0) {
    return "UP";
  }

  if (delta < 0) {
    return "DOWN";
  }

  return "FLAT";
}

export function compareMetric(
  metric: ZetraAiMetricKey,
  currentValue: number,
  previousValue: number
): ZetraAiMetricComparison {
  const current = finite(currentValue);
  const previous = finite(previousValue);

  return {
    metric,

    currentValue: round(current, 2),
    previousValue: round(previous, 2),

    absoluteChange: round(current - previous, 2),

    percentageChange: calculatePercentageChange(
      current,
      previous
    ),

    direction: detectTrendDirection(
      current,
      previous
    ),
  };
}

/**
 * ============================================================================
 * PERIOD COMPARISON
 * ============================================================================
 */

export function comparePeriods(
  current: ZetraAiPeriodMetrics,
  previous: ZetraAiPeriodMetrics
): ZetraAiPeriodComparison {
  return {
    current,
    previous,

    sales: compareMetric(
      "sales",
      current.salesTotal,
      previous.salesTotal
    ),

    cogs: compareMetric(
      "cogs",
      current.cogsTotal,
      previous.cogsTotal
    ),

    expenses: compareMetric(
      "expenses",
      current.expensesTotal,
      previous.expensesTotal
    ),

    grossProfit: compareMetric(
      "grossProfit",
      current.grossProfit,
      previous.grossProfit
    ),

    netProfit: compareMetric(
      "netProfit",
      current.netProfit,
      previous.netProfit
    ),

    orders: compareMetric(
      "orders",
      current.ordersCount,
      previous.ordersCount
    ),

    averageOrderValue: compareMetric(
      "averageOrderValue",
      current.averageOrderValue,
      previous.averageOrderValue
    ),

    grossMarginPercent: compareMetric(
      "grossMarginPercent",
      current.grossMarginPercent,
      previous.grossMarginPercent
    ),

    netMarginPercent: compareMetric(
      "netMarginPercent",
      current.netMarginPercent,
      previous.netMarginPercent
    ),

    stockQty: compareMetric(
      "stockQty",
      current.stockQty,
      previous.stockQty
    ),

    availableStockQty: compareMetric(
      "availableStockQty",
      current.availableStockQty,
      previous.availableStockQty
    ),
  };
}

/**
 * ============================================================================
 * STORE PERFORMANCE
 * ============================================================================
 */

export function buildStorePerformance(
  snapshots: ZetraAiDailyStoreSnapshot[]
): ZetraAiStorePerformance[] {
  if (!Array.isArray(snapshots) || snapshots.length === 0) {
    return [];
  }

  const byStore = new Map<
    string,
    ZetraAiDailyStoreSnapshot[]
  >();

  for (const snapshot of snapshots) {
    const storeId = String(snapshot.storeId ?? "").trim();

    if (!storeId) {
      continue;
    }

    const existing = byStore.get(storeId) ?? [];

    existing.push(snapshot);

    byStore.set(storeId, existing);
  }

  const result: ZetraAiStorePerformance[] = [];

  for (const [storeId, rows] of byStore.entries()) {
    const metrics = aggregateSnapshots(rows);

    const organizationId =
      String(rows[0]?.organizationId ?? "").trim();

    if (!organizationId) {
      continue;
    }

    result.push({
      organizationId,
      storeId,

      fromDate: metrics.fromDate,
      toDate: metrics.toDate,

      salesTotal: metrics.salesTotal,
      netProfit: metrics.netProfit,
      grossProfit: metrics.grossProfit,
      expensesTotal: metrics.expensesTotal,

      ordersCount: metrics.ordersCount,
      averageOrderValue: metrics.averageOrderValue,

      grossMarginPercent:
        metrics.grossMarginPercent,

      netMarginPercent:
        metrics.netMarginPercent,

      cogsCoveragePercent:
        metrics.cogsCoveragePercent,

      latestSnapshotDate:
        metrics.latestSnapshotDate,
    });
  }

  return result;
}

/**
 * ============================================================================
 * STORE RANKING
 * ============================================================================
 */

function getStoreRankingValue(
  row: ZetraAiStorePerformance,
  metric: ZetraAiStoreRankingMetric
): number {
  switch (metric) {
    case "sales":
      return finite(row.salesTotal);

    case "netProfit":
      return finite(row.netProfit);

    case "grossProfit":
      return finite(row.grossProfit);

    case "orders":
      return finite(row.ordersCount);

    case "averageOrderValue":
      return finite(row.averageOrderValue);

    case "netMarginPercent":
      return finite(row.netMarginPercent);

    default:
      return 0;
  }
}

export function rankStores(
  stores: ZetraAiStorePerformance[],
  metric: ZetraAiStoreRankingMetric = "netProfit",
  direction: "DESC" | "ASC" = "DESC"
): ZetraAiStorePerformance[] {
  const copy = [...stores];

  copy.sort((a, b) => {
    const aValue = getStoreRankingValue(a, metric);
    const bValue = getStoreRankingValue(b, metric);

    if (aValue === bValue) {
      /**
       * Stable deterministic fallback.
       */
      return a.storeId.localeCompare(b.storeId);
    }

    if (direction === "ASC") {
      return aValue - bValue;
    }

    return bValue - aValue;
  });

  return copy;
}

/**
 * ============================================================================
 * BEST / WORST STORE
 * ============================================================================
 */

export function getBestStore(
  stores: ZetraAiStorePerformance[],
  metric: ZetraAiStoreRankingMetric = "netProfit"
): ZetraAiStorePerformance | null {
  const ranked = rankStores(
    stores,
    metric,
    "DESC"
  );

  return ranked[0] ?? null;
}

export function getWorstStore(
  stores: ZetraAiStorePerformance[],
  metric: ZetraAiStoreRankingMetric = "netProfit"
): ZetraAiStorePerformance | null {
  const ranked = rankStores(
    stores,
    metric,
    "ASC"
  );

  return ranked[0] ?? null;
}

/**
 * ============================================================================
 * DATA QUALITY
 * ============================================================================
 */

export function hasReliableCogs(
  metrics: ZetraAiPeriodMetrics,
  minimumCoveragePercent = 95
): boolean {
  return (
    finite(metrics.cogsCoveragePercent) >=
    finite(minimumCoveragePercent)
  );
}

/**
 * ============================================================================
 * ENGINE EXPORT
 * ============================================================================
 */

export const zetraAiMetricsEngine = {
  createEmptyPeriodMetrics,

  aggregateSnapshots,

  calculatePercentageChange,
  detectTrendDirection,
  compareMetric,
  comparePeriods,

  buildStorePerformance,
  rankStores,
  getBestStore,
  getWorstStore,

  hasReliableCogs,
} as const;