// src/ai/business/businessQueryService.ts

/**
 * ============================================================================
 * ZETRA AI — BUSINESS QUERY SERVICE
 * ============================================================================
 *
 * Purpose:
 * Provide one clean business-intelligence API above:
 *
 *   snapshotRepository.ts
 *          +
 *   metricsEngine.ts
 *
 * Architecture:
 *
 * Existing ZETRA AI / Business Bridge
 *                │
 *                ▼
 *      businessQueryService.ts
 *                │
 *        ┌───────┴────────┐
 *        ▼                ▼
 * snapshotRepository   metricsEngine
 *        │
 *        ▼
 * ai_daily_store_snapshots_v1
 *
 * Responsibilities:
 * - Load verified canonical snapshots.
 * - Aggregate business periods.
 * - Compare periods.
 * - Provide store rankings.
 * - Keep tenant scope explicit.
 *
 * This module DOES NOT:
 * - Interpret natural language.
 * - Call OpenAI.
 * - Generate conversational answers.
 * - Query raw sales / expenses / inventory tables.
 * ============================================================================
 */

import {
  getDailyStoreSnapshot,
  getLatestStoreSnapshot,
  getOrganizationSnapshotsByRange,
  getOrganizationSnapshotsForDate,
  getStoreSnapshotsByRange,
} from "./snapshotRepository";

import {
  aggregateSnapshots,
  buildStorePerformance,
  comparePeriods,
  getBestStore,
  getWorstStore,
  rankStores,
  type ZetraAiPeriodComparison,
  type ZetraAiPeriodMetrics,
  type ZetraAiStorePerformance,
  type ZetraAiStoreRankingMetric,
} from "./metricsEngine";

import type {
  ZetraAiDailyStoreSnapshot,
} from "./types";

/**
 * ============================================================================
 * TYPES
 * ============================================================================
 */

export type ZetraAiBusinessScope =
  | "STORE"
  | "ORGANIZATION";

export interface ZetraAiDateRange {
  fromDate: string;
  toDate: string;
}

export interface ZetraAiStoreScope {
  organizationId: string;
  storeId: string;
}

export interface ZetraAiOrganizationScope {
  organizationId: string;
}

export interface ZetraAiStorePeriodRequest
  extends ZetraAiStoreScope,
    ZetraAiDateRange {}

export interface ZetraAiOrganizationPeriodRequest
  extends ZetraAiOrganizationScope,
    ZetraAiDateRange {}

export interface ZetraAiStoreComparisonRequest
  extends ZetraAiStoreScope {
  current: ZetraAiDateRange;
  previous: ZetraAiDateRange;
}

export interface ZetraAiOrganizationComparisonRequest
  extends ZetraAiOrganizationScope {
  current: ZetraAiDateRange;
  previous: ZetraAiDateRange;
}

export interface ZetraAiBusinessPeriodResult {
  scope: ZetraAiBusinessScope;

  organizationId: string;
  storeId: string | null;

  requestedRange: ZetraAiDateRange;

  metrics: ZetraAiPeriodMetrics;

  /**
   * Actual canonical snapshots used to produce metrics.
   *
   * Useful for debugging / future evidence generation.
   */
  snapshots: ZetraAiDailyStoreSnapshot[];
}

export interface ZetraAiBusinessComparisonResult {
  scope: ZetraAiBusinessScope;

  organizationId: string;
  storeId: string | null;

  currentRange: ZetraAiDateRange;
  previousRange: ZetraAiDateRange;

  comparison: ZetraAiPeriodComparison;
}

export interface ZetraAiStoreRankingResult {
  organizationId: string;

  range: ZetraAiDateRange;

  metric: ZetraAiStoreRankingMetric;

  stores: ZetraAiStorePerformance[];

  bestStore: ZetraAiStorePerformance | null;
  worstStore: ZetraAiStorePerformance | null;
}

export interface ZetraAiLatestStoreResult {
  organizationId: string;
  storeId: string;

  requestedOnOrBeforeDate: string | null;

  snapshot: ZetraAiDailyStoreSnapshot | null;
}

/**
 * ============================================================================
 * VALIDATION HELPERS
 * ============================================================================
 */

function clean(value: unknown): string {
  return String(value ?? "").trim();
}

function assertRequired(
  value: string,
  field: string
): void {
  if (!clean(value)) {
    throw new Error(
      `[ZETRA_AI_BUSINESS_QUERY] ${field} is required.`
    );
  }
}

function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function assertDate(
  value: string,
  field: string
): void {
  if (!isIsoDate(clean(value))) {
    throw new Error(
      `[ZETRA_AI_BUSINESS_QUERY] ${field} must use YYYY-MM-DD format.`
    );
  }
}

function normalizeRange(
  range: ZetraAiDateRange
): ZetraAiDateRange {
  const fromDate = clean(range.fromDate);
  const toDate = clean(range.toDate);

  assertDate(fromDate, "fromDate");
  assertDate(toDate, "toDate");

  if (fromDate > toDate) {
    throw new Error(
      "[ZETRA_AI_BUSINESS_QUERY] fromDate cannot be after toDate."
    );
  }

  return {
    fromDate,
    toDate,
  };
}

/**
 * ============================================================================
 * STORE — SINGLE DAY
 * ============================================================================
 */

export async function getStoreDayPerformance(params: {
  organizationId: string;
  storeId: string;
  date: string;
}): Promise<ZetraAiBusinessPeriodResult> {
  const organizationId = clean(params.organizationId);
  const storeId = clean(params.storeId);
  const date = clean(params.date);

  assertRequired(
    organizationId,
    "organizationId"
  );

  assertRequired(
    storeId,
    "storeId"
  );

  assertDate(
    date,
    "date"
  );

  const snapshot = await getDailyStoreSnapshot({
    organizationId,
    storeId,
    date,
  });

  const snapshots = snapshot
    ? [snapshot]
    : [];

  return {
    scope: "STORE",

    organizationId,
    storeId,

    requestedRange: {
      fromDate: date,
      toDate: date,
    },

    metrics: aggregateSnapshots(snapshots),

    snapshots,
  };
}

/**
 * ============================================================================
 * STORE — PERIOD
 * ============================================================================
 */

export async function getStorePeriodPerformance(
  params: ZetraAiStorePeriodRequest
): Promise<ZetraAiBusinessPeriodResult> {
  const organizationId = clean(
    params.organizationId
  );

  const storeId = clean(
    params.storeId
  );

  assertRequired(
    organizationId,
    "organizationId"
  );

  assertRequired(
    storeId,
    "storeId"
  );

  const range = normalizeRange({
    fromDate: params.fromDate,
    toDate: params.toDate,
  });

  const snapshots =
    await getStoreSnapshotsByRange({
      organizationId,
      storeId,
      fromDate: range.fromDate,
      toDate: range.toDate,
    });

  return {
    scope: "STORE",

    organizationId,
    storeId,

    requestedRange: range,

    metrics: aggregateSnapshots(
      snapshots
    ),

    snapshots,
  };
}

/**
 * ============================================================================
 * ORGANIZATION — SINGLE DAY
 * ============================================================================
 */

export async function getOrganizationDayPerformance(params: {
  organizationId: string;
  date: string;
}): Promise<ZetraAiBusinessPeriodResult> {
  const organizationId = clean(
    params.organizationId
  );

  const date = clean(
    params.date
  );

  assertRequired(
    organizationId,
    "organizationId"
  );

  assertDate(
    date,
    "date"
  );

  const snapshots =
    await getOrganizationSnapshotsForDate({
      organizationId,
      date,
    });

  return {
    scope: "ORGANIZATION",

    organizationId,
    storeId: null,

    requestedRange: {
      fromDate: date,
      toDate: date,
    },

    metrics: aggregateSnapshots(
      snapshots
    ),

    snapshots,
  };
}

/**
 * ============================================================================
 * ORGANIZATION — PERIOD
 * ============================================================================
 */

export async function getOrganizationPeriodPerformance(
  params: ZetraAiOrganizationPeriodRequest
): Promise<ZetraAiBusinessPeriodResult> {
  const organizationId = clean(
    params.organizationId
  );

  assertRequired(
    organizationId,
    "organizationId"
  );

  const range = normalizeRange({
    fromDate: params.fromDate,
    toDate: params.toDate,
  });

  const snapshots =
    await getOrganizationSnapshotsByRange({
      organizationId,
      fromDate: range.fromDate,
      toDate: range.toDate,
    });

  return {
    scope: "ORGANIZATION",

    organizationId,
    storeId: null,

    requestedRange: range,

    metrics: aggregateSnapshots(
      snapshots
    ),

    snapshots,
  };
}

/**
 * ============================================================================
 * STORE — PERIOD COMPARISON
 * ============================================================================
 */

export async function compareStorePeriods(
  params: ZetraAiStoreComparisonRequest
): Promise<ZetraAiBusinessComparisonResult> {
  const organizationId = clean(
    params.organizationId
  );

  const storeId = clean(
    params.storeId
  );

  assertRequired(
    organizationId,
    "organizationId"
  );

  assertRequired(
    storeId,
    "storeId"
  );

  const currentRange =
    normalizeRange(params.current);

  const previousRange =
    normalizeRange(params.previous);

  /**
   * Run both independent reads concurrently.
   */
  const [
    currentSnapshots,
    previousSnapshots,
  ] = await Promise.all([
    getStoreSnapshotsByRange({
      organizationId,
      storeId,
      fromDate: currentRange.fromDate,
      toDate: currentRange.toDate,
    }),

    getStoreSnapshotsByRange({
      organizationId,
      storeId,
      fromDate: previousRange.fromDate,
      toDate: previousRange.toDate,
    }),
  ]);

  const current =
    aggregateSnapshots(
      currentSnapshots
    );

  const previous =
    aggregateSnapshots(
      previousSnapshots
    );

  return {
    scope: "STORE",

    organizationId,
    storeId,

    currentRange,
    previousRange,

    comparison: comparePeriods(
      current,
      previous
    ),
  };
}

/**
 * ============================================================================
 * ORGANIZATION — PERIOD COMPARISON
 * ============================================================================
 */

export async function compareOrganizationPeriods(
  params: ZetraAiOrganizationComparisonRequest
): Promise<ZetraAiBusinessComparisonResult> {
  const organizationId = clean(
    params.organizationId
  );

  assertRequired(
    organizationId,
    "organizationId"
  );

  const currentRange =
    normalizeRange(params.current);

  const previousRange =
    normalizeRange(params.previous);

  const [
    currentSnapshots,
    previousSnapshots,
  ] = await Promise.all([
    getOrganizationSnapshotsByRange({
      organizationId,
      fromDate: currentRange.fromDate,
      toDate: currentRange.toDate,
    }),

    getOrganizationSnapshotsByRange({
      organizationId,
      fromDate: previousRange.fromDate,
      toDate: previousRange.toDate,
    }),
  ]);

  const current =
    aggregateSnapshots(
      currentSnapshots
    );

  const previous =
    aggregateSnapshots(
      previousSnapshots
    );

  return {
    scope: "ORGANIZATION",

    organizationId,
    storeId: null,

    currentRange,
    previousRange,

    comparison: comparePeriods(
      current,
      previous
    ),
  };
}

/**
 * ============================================================================
 * ORGANIZATION — STORE RANKING
 * ============================================================================
 *
 * Examples:
 *
 * "Ni store gani inanipa faida zaidi?"
 * "Ni duka gani lina mauzo makubwa wiki hii?"
 * "Nipange stores zangu kwa net profit."
 * ============================================================================
 */

export async function getOrganizationStoreRanking(params: {
  organizationId: string;

  fromDate: string;
  toDate: string;

  metric?: ZetraAiStoreRankingMetric;
}): Promise<ZetraAiStoreRankingResult> {
  const organizationId = clean(
    params.organizationId
  );

  assertRequired(
    organizationId,
    "organizationId"
  );

  const range = normalizeRange({
    fromDate: params.fromDate,
    toDate: params.toDate,
  });

  const metric =
    params.metric ?? "netProfit";

  const snapshots =
    await getOrganizationSnapshotsByRange({
      organizationId,
      fromDate: range.fromDate,
      toDate: range.toDate,
    });

  const performance =
    buildStorePerformance(
      snapshots
    );

  const stores = rankStores(
    performance,
    metric,
    "DESC"
  );

  return {
    organizationId,

    range,

    metric,

    stores,

    bestStore:
      getBestStore(
        performance,
        metric
      ),

    worstStore:
      getWorstStore(
        performance,
        metric
      ),
  };
}

/**
 * ============================================================================
 * LATEST AVAILABLE STORE SNAPSHOT
 * ============================================================================
 *
 * This is useful when today's canonical snapshot has not been
 * generated yet.
 *
 * IMPORTANT:
 * We return the actual snapshot date.
 * We NEVER pretend old data is today's data.
 * ============================================================================
 */

export async function getLatestAvailableStorePerformance(params: {
  organizationId: string;
  storeId: string;
  onOrBeforeDate?: string | null;
}): Promise<ZetraAiLatestStoreResult> {
  const organizationId = clean(
    params.organizationId
  );

  const storeId = clean(
    params.storeId
  );

  assertRequired(
    organizationId,
    "organizationId"
  );

  assertRequired(
    storeId,
    "storeId"
  );

  const requestedOnOrBeforeDate =
    clean(
      params.onOrBeforeDate ?? ""
    ) || null;

  if (requestedOnOrBeforeDate) {
    assertDate(
      requestedOnOrBeforeDate,
      "onOrBeforeDate"
    );
  }

  const snapshot =
    await getLatestStoreSnapshot({
      organizationId,
      storeId,
      onOrBeforeDate:
        requestedOnOrBeforeDate,
    });

  return {
    organizationId,
    storeId,

    requestedOnOrBeforeDate,

    snapshot,
  };
}

/**
 * ============================================================================
 * QUERY SERVICE EXPORT
 * ============================================================================
 */

export const zetraAiBusinessQueryService = {
  getStoreDayPerformance,
  getStorePeriodPerformance,

  getOrganizationDayPerformance,
  getOrganizationPeriodPerformance,

  compareStorePeriods,
  compareOrganizationPeriods,

  getOrganizationStoreRanking,

  getLatestAvailableStorePerformance,
} as const;