import { supabase } from "../../../supabase/supabaseClient";

import {
  salesPerformanceToISO,
  type SalesPerformanceRange,
} from "./periodEngine";

export type SalesPaymentMethodKey =
  | "CASH"
  | "BANK"
  | "MOBILE"
  | "CREDIT"
  | "OTHER";

export type SalesPaymentMethodItem = {
  key: SalesPaymentMethodKey;
  label: string;
  revenue: number;
  orders: number;
  percent: number;
};

export type SalesPaymentBreakdown = {
  cash: number;
  bank: number;
  mobile: number;
  credit: number;
  other: number;
  orders: number;
  totalRevenue: number;
  items: SalesPaymentMethodItem[];
};

export type SalesPeakPeriod = {
  key: string;
  label: string;
  sales: number;
  orders: number;
};

export type TopSellingProduct = {
  productId: string;
  productName: string;
  sku: string | null;
  category: string | null;
  unit: string | null;
  qtySold: number;
  revenue: number;
  salesCount: number;
  estimatedCost: number;
  grossProfit: number;
  profitMarginPct: number;
  salesSharePercent: number;
};

export type SalesIntelligenceResult = {
  paymentBreakdown: SalesPaymentBreakdown;
  topProducts: TopSellingProduct[];
  peakSalesTime: SalesPeakPeriod | null;
};

type RawSaleForPeak = {
  soldAt: string;
  totalAmount: number;
};

function finite(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function integer(value: unknown): number {
  const n = Number(value);

  return Number.isFinite(n)
    ? Math.max(0, Math.trunc(n))
    : 0;
}

function normalizeChannel(
  value: unknown
): SalesPaymentMethodKey {
  const channel = String(value ?? "")
    .trim()
    .toUpperCase();

  if (channel === "CASH") return "CASH";
  if (channel === "BANK") return "BANK";
  if (channel === "MOBILE") return "MOBILE";
  if (channel === "CREDIT") return "CREDIT";

  return "OTHER";
}

function labelForChannel(
  key: SalesPaymentMethodKey
): string {
  if (key === "CASH") return "Cash";
  if (key === "BANK") return "Bank";
  if (key === "MOBILE") return "Mobile Money";
  if (key === "CREDIT") return "Credit";

  return "Other";
}

function percent(
  value: number,
  total: number
): number {
  if (total <= 0) return 0;

  return (value / total) * 100;
}

export async function loadSalesPaymentBreakdown(
  args: {
    orgId: string;
    storeId: string;
    range: SalesPerformanceRange;
  }
): Promise<SalesPaymentBreakdown> {
  const orgId = String(args.orgId || "").trim();
  const storeId = String(args.storeId || "").trim();

  if (!orgId) {
    throw new Error(
      "Sales payment breakdown requires an organisation."
    );
  }

  if (!storeId) {
    throw new Error(
      "Sales payment breakdown requires a store."
    );
  }

  const { data, error } = await supabase.rpc(
    "get_sales_channel_summary_v3",
    {
      p_org_id: orgId,
      p_from: salesPerformanceToISO(
        args.range.from
      ),
      p_to: salesPerformanceToISO(
        args.range.to
      ),
      p_store_id: storeId,
    } as any
  );

  if (error) {
    throw error;
  }

  const rows = Array.isArray(data)
    ? data
    : [];

  const revenue: Record<
    SalesPaymentMethodKey,
    number
  > = {
    CASH: 0,
    BANK: 0,
    MOBILE: 0,
    CREDIT: 0,
    OTHER: 0,
  };

  const orders: Record<
    SalesPaymentMethodKey,
    number
  > = {
    CASH: 0,
    BANK: 0,
    MOBILE: 0,
    CREDIT: 0,
    OTHER: 0,
  };

  let totalOrders = 0;

  for (const row of rows as any[]) {
    /*
     * IMPORTANT:
     * This mirrors the already verified Home mapper:
     *
     * channel ?? payment_method
     * revenue ?? total
     * orders
     */
    const key = normalizeChannel(
      row?.channel ??
        row?.payment_method
    );

    const rowRevenue = finite(
      row?.revenue ??
        row?.total ??
        0
    );

    const rowOrders = integer(
      row?.orders ?? 0
    );

    revenue[key] += rowRevenue;
    orders[key] += rowOrders;
    totalOrders += rowOrders;
  }

  const totalRevenue =
    revenue.CASH +
    revenue.BANK +
    revenue.MOBILE +
    revenue.CREDIT +
    revenue.OTHER;

  const keys: SalesPaymentMethodKey[] = [
    "CASH",
    "BANK",
    "MOBILE",
    "CREDIT",
    "OTHER",
  ];

  const items = keys
    .map((key) => ({
      key,
      label: labelForChannel(key),
      revenue: revenue[key],
      orders: orders[key],
      percent: percent(
        revenue[key],
        totalRevenue
      ),
    }))
    .filter(
      (item) =>
        item.revenue > 0 ||
        item.orders > 0
    );

  return {
    cash: revenue.CASH,
    bank: revenue.BANK,
    mobile: revenue.MOBILE,
    credit: revenue.CREDIT,
    other: revenue.OTHER,
    orders: totalOrders,
    totalRevenue,
    items,
  };
}

export async function loadTopSellingProducts(
  args: {
    storeId: string;
    range: SalesPerformanceRange;
    limit?: number;
  }
): Promise<TopSellingProduct[]> {
  const storeId = String(
    args.storeId || ""
  ).trim();

  if (!storeId) {
    throw new Error(
      "Top selling products requires a store."
    );
  }

  const requestedLimit = Number(
    args.limit ?? 5
  );

  const displayLimit =
    Number.isFinite(requestedLimit)
      ? Math.max(
          1,
          Math.min(
            20,
            Math.trunc(requestedLimit)
          )
        )
      : 5;

  /*
   * Canonical product performance source.
   *
   * The same RPC is already used by Finance History.
   * Sales Performance ranks products by SALES REVENUE.
   */
  const { data, error } = await supabase.rpc(
    "get_product_profit_report_v3",
    {
      p_store_id: storeId,
      p_from: salesPerformanceToISO(
        args.range.from
      ),
      p_to: salesPerformanceToISO(
        args.range.to
      ),
      p_limit: 5000,
    } as any
  );

  if (error) {
    throw error;
  }

  const rows = Array.isArray(data)
    ? (data as any[])
    : [];

  const mapped: TopSellingProduct[] =
    rows.map((row) => ({
      productId: String(
        row?.product_id ?? ""
      ),

      productName: String(
        row?.product_name ??
          "Unknown Product"
      ),

      sku:
        row?.sku == null
          ? null
          : String(row.sku),

      category:
        row?.category == null
          ? null
          : String(row.category),

      unit:
        row?.unit == null
          ? null
          : String(row.unit),

      qtySold: finite(
        row?.qty_sold
      ),

      revenue: finite(
        row?.revenue
      ),

      salesCount: integer(
        row?.sales_count
      ),

      estimatedCost: finite(
        row?.estimated_cost
      ),

      grossProfit: finite(
        row?.gross_profit
      ),

      profitMarginPct: finite(
        row?.profit_margin_pct
      ),

      salesSharePercent: 0,
    }));

  /*
   * IMPORTANT:
   * Sales Performance = sales ranking.
   * Therefore rank by REVENUE first,
   * not by gross profit.
   */
  mapped.sort((a, b) => {
    if (b.revenue !== a.revenue) {
      return b.revenue - a.revenue;
    }

    if (b.qtySold !== a.qtySold) {
      return b.qtySold - a.qtySold;
    }

    return b.salesCount - a.salesCount;
  });

  const totalRevenue =
    mapped.reduce(
      (sum, item) =>
        sum + item.revenue,
      0
    );

  return mapped
    .slice(0, displayLimit)
    .map((item) => ({
      ...item,

      salesSharePercent:
        percent(
          item.revenue,
          totalRevenue
        ),
    }));
}

function peakLabel(hour: number): string {
  const nextHour = (hour + 1) % 24;

  const format = (h: number): string => {
    const normalized = h % 24;

    if (normalized === 0) return "12 AM";
    if (normalized === 12) return "12 PM";

    if (normalized < 12) {
      return `${normalized} AM`;
    }

    return `${normalized - 12} PM`;
  };

  return `${format(hour)} - ${format(nextHour)}`;
}

export function calculatePeakSalesTime(
  rows: RawSaleForPeak[]
): SalesPeakPeriod | null {
  const buckets = Array.from(
    { length: 24 },
    (_, hour) => ({
      key: `hour-${hour}`,
      label: peakLabel(hour),
      sales: 0,
      orders: 0,
    })
  );

  for (const row of rows) {
    const soldAt = new Date(row.soldAt);

    if (
      !Number.isFinite(
        soldAt.getTime()
      )
    ) {
      continue;
    }

    const hour = soldAt.getHours();

    buckets[hour].sales += finite(
      row.totalAmount
    );

    buckets[hour].orders += 1;
  }

  const active = buckets.filter(
    (bucket) =>
      bucket.sales > 0 ||
      bucket.orders > 0
  );

  if (active.length === 0) {
    return null;
  }

  active.sort((a, b) => {
    if (b.sales !== a.sales) {
      return b.sales - a.sales;
    }

    return b.orders - a.orders;
  });

  return active[0];
}

export async function loadSalesIntelligence(
  args: {
    orgId: string;
    storeId: string;
    range: SalesPerformanceRange;
    currentSalesRows?: RawSaleForPeak[];
  }
): Promise<SalesIntelligenceResult> {
  /*
   * Payment mix requires ONE canonical RPC.
   *
   * Peak time does NOT require another request when
   * Sales Performance V2 passes its already-loaded
   * current get_sales_v3 rows.
   */
  const [
    paymentBreakdown,
    topProducts,
  ] = await Promise.all([
    loadSalesPaymentBreakdown({
      orgId: args.orgId,
      storeId: args.storeId,
      range: args.range,
    }),

    loadTopSellingProducts({
      storeId: args.storeId,
      range: args.range,
      limit: 5,
    }),
  ]);

  const peakSalesTime =
    calculatePeakSalesTime(
      Array.isArray(args.currentSalesRows)
        ? args.currentSalesRows
        : []
    );

  return {
    paymentBreakdown,
    topProducts,
    peakSalesTime,
  };
}

