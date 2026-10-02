import { supabase } from "../../../supabase/supabaseClient";

import {
  buildPreviousFinancialBuckets,
  resolvePreviousFinancialRange,
  type FinancialDateRange,
  type FinancialPeriodBucket,
  type FinancialPeriodMode,
} from "./periodEngine";

export type FinancialMetric = {
  sales: number;
  expenses: number;
  netProfit: number;
  cogs: number;
  orders: number;
};

export type FinancialBucketResult =
  FinancialPeriodBucket &
    FinancialMetric;

export type FinancialOverviewResult = {
  range: FinancialDateRange;
  total: FinancialMetric;
  buckets: FinancialBucketResult[];
};

export type FinancialMetricChange = {
  sales: number | null;
  expenses: number | null;
  netProfit: number | null;
};

export type FinancialPerformanceInsight = {
  profitMargin: number | null;
  bestPeriod: FinancialBucketResult | null;
  weakestPeriod: FinancialBucketResult | null;
};

export type FinancialComparisonResult = {
  current: FinancialOverviewResult;
  previous: FinancialOverviewResult;
  change: FinancialMetricChange;
  insight: FinancialPerformanceInsight;
};

function numberValue(
  value: unknown
): number {
  const parsed =
    Number(value ?? 0);

  return Number.isFinite(parsed)
    ? parsed
    : 0;
}

function integerValue(
  value: unknown
): number {
  return Math.trunc(
    numberValue(value)
  );
}

function parseYMD(
  value: string
): Date {
  const match =
    /^(\d{4})-(\d{2})-(\d{2})$/.exec(
      value
    );

  if (!match) {
    throw new Error(
      "Invalid financial date."
    );
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  const date =
    new Date(
      year,
      month - 1,
      day
    );

  if (
    date.getFullYear() !== year ||
    date.getMonth() !==
      month - 1 ||
    date.getDate() !== day
  ) {
    throw new Error(
      "Invalid financial date."
    );
  }

  return date;
}

function startISO(
  ymd: string
) {
  const date =
    parseYMD(ymd);

  date.setHours(
    0,
    0,
    0,
    0
  );

  return date.toISOString();
}

/*
 * IMPORTANT:
 * get_store_net_profit_v2 treats
 * the expense p_to calendar date
 * as inclusive.
 *
 * Keep the same boundary semantics
 * already used by Finance History.
 */
function profitToISO(
  ymd: string
) {
  const date =
    parseYMD(ymd);

  date.setHours(
    23,
    59,
    59,
    999
  );

  return date.toISOString();
}

async function loadStoreMetric(
  storeId: string,
  range: FinancialDateRange
): Promise<FinancialMetric> {
  const {
    data,
    error,
  } = await supabase.rpc(
    "get_store_net_profit_v2",
    {
      p_store_id: storeId,
      p_from: startISO(
        range.fromYMD
      ),
      p_to: profitToISO(
        range.toYMD
      ),
    } as any
  );

  if (error) {
    throw error;
  }

  const row: any =
    Array.isArray(data)
      ? data[0]
      : data;

  return {
    sales: numberValue(
      row?.sales_total
    ),
    expenses: numberValue(
      row?.expenses_total
    ),
    netProfit: numberValue(
      row?.net_profit
    ),
    cogs: numberValue(
      row?.cogs_total
    ),
    orders: integerValue(
      row?.orders_count
    ),
  };
}

function sumMetrics(
  metrics: FinancialMetric[]
): FinancialMetric {
  return metrics.reduce<FinancialMetric>(
    (total, item) => ({
      sales:
        total.sales +
        item.sales,

      expenses:
        total.expenses +
        item.expenses,

      netProfit:
        total.netProfit +
        item.netProfit,

      cogs:
        total.cogs +
        item.cogs,

      orders:
        total.orders +
        item.orders,
    }),
    {
      sales: 0,
      expenses: 0,
      netProfit: 0,
      cogs: 0,
      orders: 0,
    }
  );
}

function percentageChange(
  current: number,
  previous: number
): number | null {
  const currentValue =
    numberValue(current);

  const previousValue =
    numberValue(previous);

  /*
   * There is no mathematically meaningful percentage
   * change when the previous value is zero.
   *
   * null lets the UI show "N/A" instead of inventing
   * an infinite or misleading percentage.
   */
  if (previousValue === 0) {
    return null;
  }

  return (
    ((currentValue - previousValue) /
      Math.abs(previousValue)) *
    100
  );
}

function profitMargin(
  metric: FinancialMetric
): number | null {
  const sales =
    numberValue(metric.sales);

  if (sales === 0) {
    return null;
  }

  return (
    numberValue(metric.netProfit) /
    sales
  ) * 100;
}

function performanceInsights(
  result: FinancialOverviewResult
): FinancialPerformanceInsight {
  const buckets =
    Array.isArray(result.buckets)
      ? result.buckets
      : [];

  if (!buckets.length) {
    return {
      profitMargin:
        profitMargin(
          result.total
        ),
      bestPeriod: null,
      weakestPeriod: null,
    };
  }

  /*
   * Best / weakest are based on verified NET PROFIT,
   * not sales volume. This keeps the insight aligned
   * with actual financial performance.
   */
  const ordered =
    buckets
      .slice()
      .sort(
        (a, b) =>
          numberValue(
            b.netProfit
          ) -
          numberValue(
            a.netProfit
          )
      );

  return {
    profitMargin:
      profitMargin(
        result.total
      ),
    bestPeriod:
      ordered[0] ?? null,
    weakestPeriod:
      ordered[
        ordered.length - 1
      ] ?? null,
  };
}
async function loadRangeMetric(
  storeIds: string[],
  range: FinancialDateRange
): Promise<FinancialMetric> {
  if (!storeIds.length) {
    throw new Error(
      "No store available for financial overview."
    );
  }

  const parts =
    await Promise.all(
      storeIds.map(
        (storeId) =>
          loadStoreMetric(
            storeId,
            range
          )
      )
    );

  return sumMetrics(parts);
}

export async function loadFinancialOverview(
  storeIds: string[],
  range: FinancialDateRange,
  buckets: FinancialPeriodBucket[]
): Promise<FinancialOverviewResult> {
  if (!storeIds.length) {
    throw new Error(
      "No store available for financial overview."
    );
  }

  /*
   * Bucket metrics are enough to build
   * the total safely, so we deliberately
   * do NOT issue another duplicate RPC
   * for the whole selected range.
   */
  const bucketMetrics =
    await Promise.all(
      buckets.map(
        async (
          bucket
        ): Promise<FinancialBucketResult> => {
          const metric =
            await loadRangeMetric(
              storeIds,
              {
                fromYMD:
                  bucket.fromYMD,
                toYMD:
                  bucket.toYMD,
              }
            );

          return {
            ...bucket,
            ...metric,
          };
        }
      )
    );

  return {
    range,
    total: sumMetrics(
      bucketMetrics
    ),
    buckets:
      bucketMetrics,
  };
}

/*
 * ============================================================
 * PREMIUM FINANCIAL COMPARISON
 * ============================================================
 *
 * Both CURRENT and PREVIOUS periods use the SAME canonical
 * get_store_net_profit_v2 pipeline.
 *
 * No alternative sales / expense / profit formulas exist here.
 */
export async function loadFinancialComparison(
  storeIds: string[],
  mode: FinancialPeriodMode,
  currentRange: FinancialDateRange,
  currentBuckets: FinancialPeriodBucket[]
): Promise<FinancialComparisonResult> {
  const previousRange =
    resolvePreviousFinancialRange(
      currentRange
    );

  const previousBuckets =
    buildPreviousFinancialBuckets(
      mode,
      currentBuckets,
      previousRange
    );

  const [
    current,
    previous,
  ] = await Promise.all([
    loadFinancialOverview(
      storeIds,
      currentRange,
      currentBuckets
    ),

    loadFinancialOverview(
      storeIds,
      previousRange,
      previousBuckets
    ),
  ]);

  return {
    current,
    previous,

    change: {
      sales:
        percentageChange(
          current.total.sales,
          previous.total.sales
        ),

      expenses:
        percentageChange(
          current.total.expenses,
          previous.total.expenses
        ),

      netProfit:
        percentageChange(
          current.total.netProfit,
          previous.total.netProfit
        ),
    },

    insight:
      performanceInsights(
        current
      ),
  };
}

