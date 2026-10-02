import { supabase } from "../../../supabase/supabaseClient";

import {
  resolveSalesPerformancePeriods,
  salesPerformanceToISO,
  type SalesPerformanceBucket,
  type SalesPerformanceMode,
} from "./periodEngine";

export type SalesPerformanceSale = {
  saleId: string;
  soldAt: string;
  totalAmount: number;
  totalQty: number;
};

export type SalesPerformancePoint = {
  key: string;
  label: string;
  shortLabel: string;
  sales: number;
  orders: number;
  quantity: number;
};

export type SalesPerformanceMetrics = {
  sales: number;
  orders: number;
  quantity: number;
  averageOrderValue: number;
};

export type SalesPerformanceComparison = {
  amount: number;
  percent: number | null;
};

export type SalesPerformanceResult = {
  mode: SalesPerformanceMode;

  current: SalesPerformanceMetrics;
  previous: SalesPerformanceMetrics;

  difference: SalesPerformanceComparison;

  currentPoints: SalesPerformancePoint[];
  previousPoints: SalesPerformancePoint[];

  currentRange: {
    from: Date;
    to: Date;
  };

  previousRange: {
    from: Date;
    to: Date;
  };
};

function finite(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function normalizeSale(row: any): SalesPerformanceSale | null {
  const soldAt = String(
    row?.sold_at ?? ""
  ).trim();

  if (!soldAt) return null;

  return {
    saleId: String(
      row?.sale_id ??
        row?.id ??
        ""
    ),
    soldAt,
    totalAmount: finite(
      row?.total_amount ??
        row?.grand_total
    ),
    totalQty: finite(
      row?.total_qty
    ),
  };
}

async function fetchSales(
  storeId: string,
  from: Date,
  to: Date
): Promise<SalesPerformanceSale[]> {
  const { data, error } =
    await supabase.rpc(
      "get_sales_v3",
      {
        p_store_id: storeId,
        p_from: salesPerformanceToISO(from),
        p_to: salesPerformanceToISO(to),
      } as any
    );

  if (error) {
    throw error;
  }

  return (
    Array.isArray(data)
      ? data
      : []
  )
    .map(normalizeSale)
    .filter(
      (
        row
      ): row is SalesPerformanceSale =>
        row !== null
    );
}

function summarize(
  rows: SalesPerformanceSale[]
): SalesPerformanceMetrics {
  const sales = rows.reduce(
    (sum, row) =>
      sum + finite(row.totalAmount),
    0
  );

  const quantity = rows.reduce(
    (sum, row) =>
      sum + finite(row.totalQty),
    0
  );

  const orders = rows.length;

  return {
    sales,
    orders,
    quantity,
    averageOrderValue:
      orders > 0
        ? sales / orders
        : 0,
  };
}

function bucketRows(
  rows: SalesPerformanceSale[],
  buckets: SalesPerformanceBucket[]
): SalesPerformancePoint[] {
  return buckets.map((bucket) => {
    const fromMs = bucket.from.getTime();
    const toMs = bucket.to.getTime();

    const bucketRows = rows.filter((row) => {
      const soldMs =
        new Date(row.soldAt).getTime();

      return (
        Number.isFinite(soldMs) &&
        soldMs >= fromMs &&
        soldMs < toMs
      );
    });

    const metrics = summarize(bucketRows);

    return {
      key: bucket.key,
      label: bucket.label,
      shortLabel: bucket.shortLabel,
      sales: metrics.sales,
      orders: metrics.orders,
      quantity: metrics.quantity,
    };
  });
}

function comparison(
  current: number,
  previous: number
): SalesPerformanceComparison {
  const amount = current - previous;

  if (previous === 0) {
    return {
      amount,
      percent:
        current === 0
          ? 0
          : null,
    };
  }

  return {
    amount,
    percent:
      (amount / previous) * 100,
  };
}

export async function loadSalesPerformance(
  args: {
    storeId: string;
    mode: SalesPerformanceMode;
    anchor?: Date;
  }
): Promise<SalesPerformanceResult> {
  const storeId =
    String(args.storeId || "").trim();

  if (!storeId) {
    throw new Error(
      "Sales Performance requires a store."
    );
  }

  const periods =
    resolveSalesPerformancePeriods(
      args.mode,
      args.anchor ?? new Date()
    );

  /*
   * IMPORTANT:
   * Exactly TWO sales RPC calls.
   *
   * We fetch the complete current period and
   * previous equivalent period once, then
   * bucket everything locally.
   *
   * No per-chart-point RPC calls.
   */
  const [
    currentRows,
    previousRows,
  ] = await Promise.all([
    fetchSales(
      storeId,
      periods.current.from,
      periods.current.to
    ),

    fetchSales(
      storeId,
      periods.previous.from,
      periods.previous.to
    ),
  ]);

  const current =
    summarize(currentRows);

  const previous =
    summarize(previousRows);

  return {
    mode: args.mode,

    current,
    previous,

    difference:
      comparison(
        current.sales,
        previous.sales
      ),

    currentPoints:
      bucketRows(
        currentRows,
        periods.currentBuckets
      ),

    previousPoints:
      bucketRows(
        previousRows,
        periods.previousBuckets
      ),

    currentRange:
      periods.current,

    previousRange:
      periods.previous,
  };
}
