// src/ai/business/snapshotRepository.ts

/**
 * ============================================================================
 * ZETRA AI — SNAPSHOT REPOSITORY
 * ============================================================================
 *
 * Purpose:
 * Read verified business snapshots from:
 *
 *   public.ai_daily_store_snapshots_v1
 *
 * Responsibilities:
 * - Read canonical daily snapshots.
 * - Enforce organization + store scope.
 * - Read date ranges safely.
 * - Convert Postgres snake_case rows into internal camelCase objects.
 *
 * This module DOES NOT:
 * - Call OpenAI.
 * - Interpret natural language.
 * - Generate business advice.
 * - Calculate trends/comparisons.
 * - Read raw sales/expenses/inventory tables.
 *
 * Source of truth:
 *   ai_daily_store_snapshots_v1
 * ============================================================================
 */

import { supabase } from "@/src/supabase/supabaseClient";

import type {
  ZetraAiDailyStoreSnapshot,
  ZetraAiDailyStoreSnapshotDbRow,
} from "./types";

const SNAPSHOT_TABLE = "ai_daily_store_snapshots_v1";

/**
 * ============================================================================
 * HELPERS
 * ============================================================================
 */

function safeNumber(value: unknown): number {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

function cleanString(value: unknown): string {
  return String(value ?? "").trim();
}

function isValidIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function assertOrganizationId(organizationId: string): void {
  if (!cleanString(organizationId)) {
    throw new Error(
      "[ZETRA_AI_SNAPSHOT_REPOSITORY] organizationId is required."
    );
  }
}

function assertStoreId(storeId: string): void {
  if (!cleanString(storeId)) {
    throw new Error(
      "[ZETRA_AI_SNAPSHOT_REPOSITORY] storeId is required."
    );
  }
}

function assertDate(date: string, label: string): void {
  if (!isValidIsoDate(date)) {
    throw new Error(
      `[ZETRA_AI_SNAPSHOT_REPOSITORY] ${label} must use YYYY-MM-DD format.`
    );
  }
}

/**
 * ============================================================================
 * DB → DOMAIN MAPPER
 * ============================================================================
 */

export function mapDailySnapshotRow(
  row: ZetraAiDailyStoreSnapshotDbRow
): ZetraAiDailyStoreSnapshot {
  return {
    organizationId: cleanString(row.organization_id),
    storeId: cleanString(row.store_id),

    snapshotDate: cleanString(row.snapshot_date),
    timezone: cleanString(row.timezone) || "UTC",

    salesTotal: safeNumber(row.sales_total),
    ordersCount: safeNumber(row.orders_count),

    cogsTotal: safeNumber(row.cogs_total),

    cogsItemsCount: safeNumber(row.cogs_items_count),
    cogsMissingItemsCount: safeNumber(row.cogs_missing_items_count),
    cogsCoveragePercent: safeNumber(row.cogs_coverage_percent),

    expensesTotal: safeNumber(row.expenses_total),
    expensesCount: safeNumber(row.expenses_count),

    grossProfit: safeNumber(row.gross_profit),
    netProfit: safeNumber(row.net_profit),

    stockQty: safeNumber(row.stock_qty),
    reservedQty: safeNumber(row.reserved_qty),
    availableStockQty: safeNumber(row.available_stock_qty),

    productsInStock: safeNumber(row.products_in_stock),
    outOfStockProducts: safeNumber(row.out_of_stock_products),
    lowStockProducts: safeNumber(row.low_stock_products),

    engineVersion:
      row.engine_version == null
        ? null
        : cleanString(row.engine_version),

    generatedAt:
      row.generated_at == null
        ? null
        : cleanString(row.generated_at),

    updatedAt:
      row.updated_at == null
        ? null
        : cleanString(row.updated_at),
  };
}

/**
 * ============================================================================
 * SINGLE DAY
 * ============================================================================
 */

export async function getDailyStoreSnapshot(params: {
  organizationId: string;
  storeId: string;
  date: string;
}): Promise<ZetraAiDailyStoreSnapshot | null> {
  const organizationId = cleanString(params.organizationId);
  const storeId = cleanString(params.storeId);
  const date = cleanString(params.date);

  assertOrganizationId(organizationId);
  assertStoreId(storeId);
  assertDate(date, "date");

  const { data, error } = await supabase
    .from(SNAPSHOT_TABLE)
    .select("*")
    .eq("organization_id", organizationId)
    .eq("store_id", storeId)
    .eq("snapshot_date", date)
    .maybeSingle();

  if (error) {
    throw new Error(
      `[ZETRA_AI_SNAPSHOT_REPOSITORY] Failed to load daily snapshot: ${error.message}`
    );
  }

  if (!data) {
    return null;
  }

  return mapDailySnapshotRow(
    data as ZetraAiDailyStoreSnapshotDbRow
  );
}

/**
 * ============================================================================
 * DATE RANGE — SINGLE STORE
 * ============================================================================
 */

export async function getStoreSnapshotsByRange(params: {
  organizationId: string;
  storeId: string;
  fromDate: string;
  toDate: string;
}): Promise<ZetraAiDailyStoreSnapshot[]> {
  const organizationId = cleanString(params.organizationId);
  const storeId = cleanString(params.storeId);
  const fromDate = cleanString(params.fromDate);
  const toDate = cleanString(params.toDate);

  assertOrganizationId(organizationId);
  assertStoreId(storeId);

  assertDate(fromDate, "fromDate");
  assertDate(toDate, "toDate");

  if (fromDate > toDate) {
    throw new Error(
      "[ZETRA_AI_SNAPSHOT_REPOSITORY] fromDate cannot be after toDate."
    );
  }

  const { data, error } = await supabase
    .from(SNAPSHOT_TABLE)
    .select("*")
    .eq("organization_id", organizationId)
    .eq("store_id", storeId)
    .gte("snapshot_date", fromDate)
    .lte("snapshot_date", toDate)
    .order("snapshot_date", {
      ascending: true,
    });

  if (error) {
    throw new Error(
      `[ZETRA_AI_SNAPSHOT_REPOSITORY] Failed to load snapshot range: ${error.message}`
    );
  }

  return ((data ?? []) as ZetraAiDailyStoreSnapshotDbRow[]).map(
    mapDailySnapshotRow
  );
}

/**
 * ============================================================================
 * ORGANIZATION — SINGLE DAY
 * ============================================================================
 *
 * Used later for questions such as:
 *
 * "Ni store gani imefanya vizuri zaidi leo?"
 *
 * IMPORTANT:
 * organization_id is ALWAYS applied.
 * Never query all organizations.
 * ============================================================================
 */

export async function getOrganizationSnapshotsForDate(params: {
  organizationId: string;
  date: string;
}): Promise<ZetraAiDailyStoreSnapshot[]> {
  const organizationId = cleanString(params.organizationId);
  const date = cleanString(params.date);

  assertOrganizationId(organizationId);
  assertDate(date, "date");

  const { data, error } = await supabase
    .from(SNAPSHOT_TABLE)
    .select("*")
    .eq("organization_id", organizationId)
    .eq("snapshot_date", date)
    .order("store_id", {
      ascending: true,
    });

  if (error) {
    throw new Error(
      `[ZETRA_AI_SNAPSHOT_REPOSITORY] Failed to load organization snapshots: ${error.message}`
    );
  }

  return ((data ?? []) as ZetraAiDailyStoreSnapshotDbRow[]).map(
    mapDailySnapshotRow
  );
}

/**
 * ============================================================================
 * ORGANIZATION — DATE RANGE
 * ============================================================================
 *
 * This supports future organization-wide analysis across multiple stores.
 *
 * Example:
 * "Nionyeshe performance ya biashara yangu wiki hii."
 * ============================================================================
 */

export async function getOrganizationSnapshotsByRange(params: {
  organizationId: string;
  fromDate: string;
  toDate: string;
}): Promise<ZetraAiDailyStoreSnapshot[]> {
  const organizationId = cleanString(params.organizationId);
  const fromDate = cleanString(params.fromDate);
  const toDate = cleanString(params.toDate);

  assertOrganizationId(organizationId);

  assertDate(fromDate, "fromDate");
  assertDate(toDate, "toDate");

  if (fromDate > toDate) {
    throw new Error(
      "[ZETRA_AI_SNAPSHOT_REPOSITORY] fromDate cannot be after toDate."
    );
  }

  const { data, error } = await supabase
    .from(SNAPSHOT_TABLE)
    .select("*")
    .eq("organization_id", organizationId)
    .gte("snapshot_date", fromDate)
    .lte("snapshot_date", toDate)
    .order("snapshot_date", {
      ascending: true,
    })
    .order("store_id", {
      ascending: true,
    });

  if (error) {
    throw new Error(
      `[ZETRA_AI_SNAPSHOT_REPOSITORY] Failed to load organization snapshot range: ${error.message}`
    );
  }

  return ((data ?? []) as ZetraAiDailyStoreSnapshotDbRow[]).map(
    mapDailySnapshotRow
  );
}

/**
 * ============================================================================
 * LATEST AVAILABLE SNAPSHOT — STORE
 * ============================================================================
 *
 * Useful when today's snapshot is not available yet.
 *
 * IMPORTANT:
 * This function does NOT pretend that the returned snapshot is today.
 * Caller receives the actual snapshotDate and decides how to communicate it.
 * ============================================================================
 */

export async function getLatestStoreSnapshot(params: {
  organizationId: string;
  storeId: string;
  onOrBeforeDate?: string | null;
}): Promise<ZetraAiDailyStoreSnapshot | null> {
  const organizationId = cleanString(params.organizationId);
  const storeId = cleanString(params.storeId);

  assertOrganizationId(organizationId);
  assertStoreId(storeId);

  let query = supabase
    .from(SNAPSHOT_TABLE)
    .select("*")
    .eq("organization_id", organizationId)
    .eq("store_id", storeId);

  const onOrBeforeDate = cleanString(
    params.onOrBeforeDate ?? ""
  );

  if (onOrBeforeDate) {
    assertDate(onOrBeforeDate, "onOrBeforeDate");

    query = query.lte(
      "snapshot_date",
      onOrBeforeDate
    );
  }

  const { data, error } = await query
    .order("snapshot_date", {
      ascending: false,
    })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(
      `[ZETRA_AI_SNAPSHOT_REPOSITORY] Failed to load latest snapshot: ${error.message}`
    );
  }

  if (!data) {
    return null;
  }

  return mapDailySnapshotRow(
    data as ZetraAiDailyStoreSnapshotDbRow
  );
}

/**
 * ============================================================================
 * SNAPSHOT EXISTENCE
 * ============================================================================
 */

export async function hasDailyStoreSnapshot(params: {
  organizationId: string;
  storeId: string;
  date: string;
}): Promise<boolean> {
  const snapshot = await getDailyStoreSnapshot(params);

  return snapshot !== null;
}

/**
 * ============================================================================
 * REPOSITORY EXPORT
 * ============================================================================
 *
 * Optional object-style API for modules that prefer dependency injection.
 * ============================================================================
 */

export const zetraAiSnapshotRepository = {
  getDailyStoreSnapshot,
  getStoreSnapshotsByRange,
  getOrganizationSnapshotsForDate,
  getOrganizationSnapshotsByRange,
  getLatestStoreSnapshot,
  hasDailyStoreSnapshot,
} as const;