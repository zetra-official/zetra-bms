// app/finance/history.tsx
import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";

import { useOrg } from "@/src/context/OrgContext";
import { supabase } from "@/src/supabase/supabaseClient";
import { Screen } from "@/src/ui/Screen";
import { Card } from "@/src/ui/Card";
import { UI } from "@/src/ui/theme";
import { formatMoney, useOrgMoneyPrefs } from "@/src/ui/money";

type Mode = "SALES" | "EXPENSES" | "PROFIT";

type SalesSummary = {
  total: number;
  orders: number;
  currency?: string | null;
  directOrders: number;
  clubOrders: number;
};

type ExpenseSummary = { total: number; count: number };
type ProfitSummary = { net: number; sales: number | null; expenses: number | null };

type PayBreakdown = {
  cash: number;
  bank: number;
  mobile: number;
  credit: number;
  other: number;
  orders: number;
};

type CreditCollections = {
  cash: number;
  bank: number;
  mobile: number;
  other: number;
  payments: number;
};

type ExpenseChannelBreakdown = {
  cash: number;
  bank: number;
  mobile: number;
  other: number;
  total: number;
  count: number;
};

type TrendPoint = {
  key: string;
  label: string;
  sales: number;
  expenses: number;
  profit: number | null;
};

type TrendBucket = {
  key: string;
  label: string;
  fromYMD: string;
  toYMD: string;
  fromISO: string;
  toISO: string;
};

type StoreComparisonRow = {
  storeId: string;
  storeName: string;
  sales: number;
  expenses: number;
  profit: number | null;
  orders: number;
};

type HealthSummary = {
  score: number;
  label: "EXCELLENT" | "GOOD" | "WATCH" | "CRITICAL";
  profitMargin: number | null;
  expensesRatio: number | null;
  salesTrend: "INCREASING" | "STABLE" | "DECLINING" | "NO_DATA";
  message: string;
};

type ProductProfitRow = {
  product_id: string;
  product_name: string;
  sku: string | null;
  category: string | null;
  unit: string | null;
  qty_sold: number;
  revenue: number;
  estimated_cost: number;
  gross_profit: number;
  profit_margin_pct: number;
  sales_count: number;
};

type StockIntelBucket = "FAST_MOVING" | "SLOW_MOVING" | "DEAD_STOCK" | "LOW_STOCK";

type StockIntelRow = {
  bucket: StockIntelBucket;
  product_id: string;
  product_name: string;
  sku: string | null;
  category: string | null;
  unit: string | null;
  store_id: string | null;
  qty_sold: number;
  sales_count: number;
  stock_on_hand: number;
  low_stock_threshold: number;
  stock_status: string;
  activity_score: number;
};

type ForecastSummary = {
  scope_used: "STORE" | "ALL";
  forecast_days: number;
  period_sales: number;
  period_orders: number;
  avg_daily_sales: number;
  avg_daily_orders: number;
  projected_sales_next_period: number;
  projected_orders_next_period: number;
  trend_label: "INCREASING" | "STABLE" | "DECLINING";
  trend_pct: number;
  stockout_risk_count: number;
  urgent_restock_count: number;
};

type CashflowPrediction = {
  scope_used: "STORE" | "ALL";
  forecast_days: number;
  projected_cash_in: number;
  projected_cash_orders: number;
  avg_daily_cash: number;
  avg_daily_orders: number;
  confidence: "HIGH" | "MEDIUM" | "LOW";
};

type FinanceCachePayload = {
  salesRow: SalesSummary;
  expRow: ExpenseSummary;
  profitRow: ProfitSummary;
  pay: PayBreakdown;
  collections: CreditCollections;
  expPay: ExpenseChannelBreakdown;
  trendRows: TrendPoint[];
  comparisonRows: StoreComparisonRow[];
  health: HealthSummary | null;
  productProfitRows: ProductProfitRow[];
  stockIntelRows: StockIntelRow[];
  forecast: ForecastSummary | null;
  cashflow: CashflowPrediction | null;
};

type InsightTone = "good" | "warn" | "danger" | "info";

type InsightItem = {
  id: string;
  title: string;
  body: string;
  tone: InsightTone;
};

function toNum(x: any) {
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
}

function toInt(x: any) {
  const n = Number(x);
  if (!Number.isFinite(n)) return 0;
  return Math.trunc(n);
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function toIsoDateLocal(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function startOfLocalDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

function endOfLocalDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

function isValidYYYYMMDD(s: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split("-").map((x) => Number(x));
  if (!y || m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

function ymdToDate(s: string) {
  const [y, m, d] = s.split("-").map((x) => Number(x));
  return new Date(y, m - 1, d);
}

function ymdToISOFrom(s: string) {
  return startOfLocalDay(ymdToDate(s)).toISOString();
}

function ymdToISOTo(s: string) {
  return startOfLocalDay(addDays(ymdToDate(s), 1)).toISOString();
}

function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function diffDaysInclusive(fromYMD: string, toYMD: string) {
  const a = startOfLocalDay(ymdToDate(fromYMD)).getTime();
  const b = startOfLocalDay(ymdToDate(toYMD)).getTime();
  const diff = Math.round((b - a) / 86400000);
  return diff + 1;
}

function shortLabelYMD(s: string) {
  const d = ymdToDate(s);
  const day = d.getDate();
  const m = d.toLocaleString("en", { month: "short" });
  return `${day} ${m}`;
}

function monthLabel(date: Date) {
  return date.toLocaleString("en", { month: "short" });
}

function buildTrendBuckets(fromYMD: string, toYMD: string): TrendBucket[] {
  const totalDays = diffDaysInclusive(fromYMD, toYMD);
  const start = ymdToDate(fromYMD);
  const end = ymdToDate(toYMD);

  const out: TrendBucket[] = [];

  if (totalDays <= 31) {
    let cur = new Date(start);
    while (cur <= end) {
      const ymd = toIsoDateLocal(cur);
      out.push({
        key: ymd,
        label: String(cur.getDate()),
        fromYMD: ymd,
        toYMD: ymd,
        fromISO: ymdToISOFrom(ymd),
        toISO: ymdToISOTo(ymd),
      });
      cur = addDays(cur, 1);
    }
    return out;
  }

  if (totalDays <= 120) {
    let cur = new Date(start);
    let idx = 0;
    while (cur <= end) {
      const bucketStart = new Date(cur);
      let bucketEnd = addDays(bucketStart, 6);
      if (bucketEnd > end) bucketEnd = new Date(end);

      const from = toIsoDateLocal(bucketStart);
      const to = toIsoDateLocal(bucketEnd);

      out.push({
        key: `w-${idx}-${from}`,
        label: shortLabelYMD(from),
        fromYMD: from,
        toYMD: to,
        fromISO: ymdToISOFrom(from),
        toISO: ymdToISOTo(to),
      });

      cur = addDays(bucketEnd, 1);
      idx += 1;
    }
    return out;
  }

  let cur = new Date(start.getFullYear(), start.getMonth(), 1);
  while (cur <= end) {
    const monthStart = new Date(cur);
    const monthEnd = new Date(cur.getFullYear(), cur.getMonth() + 1, 0);

    const fromDate = monthStart < start ? new Date(start) : monthStart;
    const toDate = monthEnd > end ? new Date(end) : monthEnd;

    const from = toIsoDateLocal(fromDate);
    const to = toIsoDateLocal(toDate);

    out.push({
      key: `m-${cur.getFullYear()}-${cur.getMonth() + 1}`,
      label: monthLabel(cur),
      fromYMD: from,
      toYMD: to,
      fromISO: ymdToISOFrom(from),
      toISO: ymdToISOTo(to),
    });

    cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
  }

  return out;
}

function percent(n: number | null) {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${n.toFixed(1)}%`;
}

function normalizeStockBucket(x: any): StockIntelBucket {
  const v = String(x ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "_");

  if (v === "FAST_MOVING") return "FAST_MOVING";
  if (v === "SLOW_MOVING") return "SLOW_MOVING";
  if (v === "DEAD_STOCK") return "DEAD_STOCK";
  return "LOW_STOCK";
}

function normalizeConfidence(x: any): CashflowPrediction["confidence"] {
  const v = String(x ?? "").trim().toUpperCase();
  if (v === "HIGH") return "HIGH";
  if (v === "LOW") return "LOW";
  return "MEDIUM";
}

function normalizeMoneyChannel(x: any): "CASH" | "BANK" | "MOBILE" | "OTHER" {
  const v = String(x ?? "").trim().toUpperCase();

  if (v === "CASH") return "CASH";

  if (v === "BANK" || v === "BANK_TRANSFER" || v === "TRANSFER") return "BANK";

  if (
    v === "MOBILE" ||
    v === "MOBILE_MONEY" ||
    v === "M-PESA" ||
    v === "MPESA" ||
    v === "TIGOPESA" ||
    v === "AIRTELMONEY" ||
    v === "HALOPESA" ||
    v === "AZAMPESA"
  ) {
    return "MOBILE";
  }

  return "OTHER";
}

function zeroExpenseChannelBreakdown(): ExpenseChannelBreakdown {
  return {
    cash: 0,
    bank: 0,
    mobile: 0,
    other: 0,
    total: 0,
    count: 0,
  };
}

function subtractFloor(a: number, b: number) {
  return Math.max(0, toNum(a) - toNum(b));
}

function getBucketTitle(bucket: StockIntelBucket) {
  if (bucket === "FAST_MOVING") return "Fast Moving";
  if (bucket === "SLOW_MOVING") return "Slow Moving";
  if (bucket === "DEAD_STOCK") return "Dead Stock";
  return "Low Stock";
}

function getBucketHint(bucket: StockIntelBucket, scope: "STORE" | "ALL") {
  if (bucket === "FAST_MOVING") {
    return scope === "ALL"
      ? "Bidhaa zinazotoka sana kwenye org nzima"
      : "Bidhaa zinazotoka sana kwenye store hii";
  }
  if (bucket === "SLOW_MOVING") {
    return scope === "ALL"
      ? "Bidhaa zinauza taratibu kwenye org nzima"
      : "Bidhaa zinauza taratibu kwenye store hii";
  }
  if (bucket === "DEAD_STOCK") {
    return "Zipo stock lakini hazijauza ndani ya kipindi";
  }
  return scope === "ALL"
    ? "Bidhaa zilizokaribia kuisha kwenye org nzima"
    : "Bidhaa zilizokaribia kuisha kwenye store hii";
}

function getBucketAccent(bucket: StockIntelBucket) {
  if (bucket === "FAST_MOVING") {
    return {
      borderColor: "rgba(16,185,129,0.24)",
      backgroundColor: "rgba(16,185,129,0.08)",
    };
  }
  if (bucket === "SLOW_MOVING") {
    return {
      borderColor: "rgba(59,130,246,0.24)",
      backgroundColor: "rgba(59,130,246,0.08)",
    };
  }
  if (bucket === "DEAD_STOCK") {
    return {
      borderColor: "rgba(201,74,74,0.24)",
      backgroundColor: "rgba(201,74,74,0.08)",
    };
  }
  return {
    borderColor: "rgba(245,158,11,0.24)",
    backgroundColor: "rgba(245,158,11,0.08)",
  };
}

function getInsightToneStyle(tone: InsightTone) {
  if (tone === "good") {
    return {
      borderColor: "rgba(16,185,129,0.26)",
      backgroundColor: "rgba(16,185,129,0.08)",
    };
  }
  if (tone === "warn") {
    return {
      borderColor: "rgba(245,158,11,0.26)",
      backgroundColor: "rgba(245,158,11,0.08)",
    };
  }
  if (tone === "danger") {
    return {
      borderColor: "rgba(201,74,74,0.28)",
      backgroundColor: "rgba(201,74,74,0.08)",
    };
  }
  return {
    borderColor: "rgba(59,130,246,0.24)",
    backgroundColor: "rgba(59,130,246,0.08)",
  };
}

function topRowByActivity(rows: StockIntelRow[]) {
  if (!rows.length) return null;
  return [...rows].sort((a, b) => b.activity_score - a.activity_score)[0];
}

function bottomStoreRow(rows: StoreComparisonRow[], mode: Mode): StoreComparisonRow | null {
  if (!rows.length) return null;

  const sorted = [...rows].sort((a, b) => {
    if (mode === "EXPENSES") return a.expenses - b.expenses;
    if (mode === "PROFIT") return toNum(a.profit) - toNum(b.profit);
    return a.sales - b.sales;
  });

  return sorted[0] ?? null;
}

function valueByMode(row: StoreComparisonRow, mode: Mode) {
  if (mode === "EXPENSES") return row.expenses;
  if (mode === "PROFIT") return toNum(row.profit);
  return row.sales;
}

function Chip({
  active,
  label,
  danger,
  disabled,
  onPress,
}: {
  active: boolean;
  label: string;
  danger?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={() => {
        if (disabled) return;
        onPress();
      }}
      hitSlop={10}
      style={({ pressed }) => ({
        flex: 1,
        height: 38,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: active
          ? danger
            ? "rgba(201,74,74,0.45)"
            : "rgba(42,168,118,0.35)"
          : "rgba(255,255,255,0.12)",
        backgroundColor: active
          ? danger
            ? "rgba(201,74,74,0.10)"
            : "rgba(42,168,118,0.10)"
          : "rgba(255,255,255,0.06)",
        alignItems: "center",
        justifyContent: "center",
        opacity: disabled ? 0.45 : pressed ? 0.92 : 1,
      })}
    >
      <Text style={{ color: UI.text, fontWeight: "900" }}>{label}</Text>
    </Pressable>
  );
}

function SmallChip({
  active,
  label,
  disabled,
  onPress,
}: {
  active: boolean;
  label: string;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={() => {
        if (disabled) return;
        onPress();
      }}
      hitSlop={10}
      style={({ pressed }) => ({
        height: 34,
        paddingHorizontal: 12,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: active ? "rgba(42,168,118,0.35)" : "rgba(255,255,255,0.12)",
        backgroundColor: active ? "rgba(42,168,118,0.10)" : "rgba(255,255,255,0.06)",
        alignItems: "center",
        justifyContent: "center",
        opacity: disabled ? 0.45 : pressed ? 0.92 : 1,
      })}
    >
      <Text style={{ color: UI.text, fontWeight: "900", fontSize: 12 }}>{label}</Text>
    </Pressable>
  );
}

function MiniStat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <View style={{ flex: 1, gap: 4, minWidth: 0 }}>
      <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12 }} numberOfLines={1}>
        {label}
      </Text>
      <Text
        style={{ color: UI.text, fontWeight: "900", fontSize: 16 }}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.75}
        allowFontScaling={false}
      >
        {value}
      </Text>
      {!!hint && (
        <Text style={{ color: UI.faint, fontWeight: "800", fontSize: 12 }} numberOfLines={1}>
          {hint}
        </Text>
      )}
    </View>
  );
}

function TrendLegend() {
  return (
    <View style={{ flexDirection: "row", gap: 14, flexWrap: "wrap" }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        <View
          style={{
            width: 10,
            height: 10,
            borderRadius: 999,
            backgroundColor: "rgba(16,185,129,0.95)",
          }}
        />
        <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12 }}>Sales</Text>
      </View>

      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        <View
          style={{
            width: 10,
            height: 10,
            borderRadius: 999,
            backgroundColor: "rgba(245,158,11,0.95)",
          }}
        />
        <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12 }}>Expenses</Text>
      </View>

      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        <View
          style={{
            width: 10,
            height: 10,
            borderRadius: 999,
            backgroundColor: "rgba(59,130,246,0.95)",
          }}
        />
        <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12 }}>Profit</Text>
      </View>

      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        <View
          style={{
            width: 10,
            height: 10,
            borderRadius: 999,
            backgroundColor: "rgba(201,74,74,0.95)",
          }}
        />
        <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12 }}>Negative Profit</Text>
      </View>
    </View>
  );
}

function TrendChart({
  data,
  fmtShort,
  showProfit,
}: {
  data: TrendPoint[];
  fmtShort: (n: number) => string;
  showProfit: boolean;
}) {
  const chartHeight = 180;
  const axisWidth = 52;
  const groupWidth = 64;
  const barWidth = 12;
  const barGap = 6;
  const gridLines = 4;

  const { maxVal, minVal } = useMemo(() => {
    const vals: number[] = [0];

    for (const p of data) {
      vals.push(toNum(p.sales));
      vals.push(toNum(p.expenses));
      if (showProfit && p.profit != null) vals.push(toNum(p.profit));
    }

    return {
      maxVal: Math.max(...vals, 1),
      minVal: Math.min(...vals, 0),
    };
  }, [data, showProfit]);

  const range = Math.max(1, maxVal - minVal);

  const valueToY = useCallback(
    (value: number) => {
      const ratio = (maxVal - value) / range;
      return ratio * chartHeight;
    },
    [chartHeight, maxVal, range]
  );

  const zeroY = valueToY(0);

  if (!data.length) {
    return (
      <Card
        style={{
          borderRadius: 18,
          padding: 12,
          borderColor: "rgba(255,255,255,0.10)",
          backgroundColor: "rgba(255,255,255,0.04)",
        }}
      >
        <Text style={{ color: UI.muted, fontWeight: "800" }}>No graph data yet.</Text>
      </Card>
    );
  }

  const ticks = Array.from({ length: gridLines + 1 }, (_, i) => {
    const ratio = i / gridLines;
    const value = maxVal - ratio * range;
    return {
      key: `tick-${i}`,
      value,
      top: chartHeight * ratio,
    };
  });

  const chartWidth = Math.max(data.length * groupWidth, 280);

  return (
    <View
      style={{
        borderRadius: 20,
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.10)",
        backgroundColor: "rgba(255,255,255,0.03)",
        padding: 12,
      }}
    >
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={{ flexDirection: "row" }}>
          <View style={{ width: axisWidth, height: chartHeight + 30, position: "relative" }}>
            {ticks.map((t) => (
              <Text
                key={t.key}
                style={{
                  position: "absolute",
                  top: Math.max(-8, t.top - 8),
                  left: 0,
                  width: axisWidth - 8,
                  color: UI.faint,
                  fontWeight: "800",
                  fontSize: 11,
                  textAlign: "right",
                }}
                numberOfLines={1}
              >
                {fmtShort(t.value)}
              </Text>
            ))}
          </View>

          <View style={{ width: chartWidth }}>
            <View style={{ height: chartHeight, position: "relative" }}>
              {ticks.map((t) => (
                <View
                  key={`grid-${t.key}`}
                  style={{
                    position: "absolute",
                    left: 0,
                    right: 0,
                    top: t.top,
                    height: 1,
                    backgroundColor:
                      Math.abs(t.value) < 0.0001
                        ? "rgba(255,255,255,0.18)"
                        : "rgba(255,255,255,0.07)",
                  }}
                />
              ))}

              <View style={{ flexDirection: "row", alignItems: "flex-end", height: chartHeight }}>
                {data.map((p) => {
                  const salesVal = toNum(p.sales);
                  const expVal = toNum(p.expenses);
                  const profitVal = showProfit && p.profit != null ? toNum(p.profit) : null;

                  const salesTop = valueToY(salesVal);
                  const salesHeight = Math.max(3, Math.abs(zeroY - salesTop));

                  const expTop = valueToY(expVal);
                  const expHeight = Math.max(3, Math.abs(zeroY - expTop));

                  const profitTop = profitVal != null ? valueToY(profitVal) : zeroY;
                  const profitHeight =
                    profitVal != null ? Math.max(3, Math.abs(zeroY - profitTop)) : 0;

                  return (
                    <View
                      key={p.key}
                      style={{
                        width: groupWidth,
                        alignItems: "center",
                        justifyContent: "flex-end",
                        height: chartHeight,
                      }}
                    >
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "flex-end",
                          justifyContent: "center",
                          gap: barGap,
                          height: chartHeight,
                          width: "100%",
                        }}
                      >
                        <View
                          style={{
                            width: barWidth,
                            height: chartHeight,
                            position: "relative",
                          }}
                        >
                          <View
                            style={{
                              position: "absolute",
                              left: 0,
                              right: 0,
                              top: Math.min(zeroY, salesTop),
                              height: salesHeight,
                              borderRadius: 8,
                              backgroundColor: "rgba(16,185,129,0.95)",
                            }}
                          />
                        </View>

                        <View
                          style={{
                            width: barWidth,
                            height: chartHeight,
                            position: "relative",
                          }}
                        >
                          <View
                            style={{
                              position: "absolute",
                              left: 0,
                              right: 0,
                              top: Math.min(zeroY, expTop),
                              height: expHeight,
                              borderRadius: 8,
                              backgroundColor: "rgba(245,158,11,0.95)",
                            }}
                          />
                        </View>

                        {showProfit ? (
                          <View
                            style={{
                              width: barWidth,
                              height: chartHeight,
                              position: "relative",
                            }}
                          >
                            <View
                              style={{
                                position: "absolute",
                                left: 0,
                                right: 0,
                                top: Math.min(zeroY, profitTop),
                                height: profitHeight,
                                borderRadius: 8,
                                backgroundColor:
                                  profitVal != null && profitVal < 0
                                    ? "rgba(201,74,74,0.95)"
                                    : "rgba(59,130,246,0.95)",
                              }}
                            />
                          </View>
                        ) : null}
                      </View>
                    </View>
                  );
                })}
              </View>
            </View>

            <View style={{ flexDirection: "row", marginTop: 10 }}>
              {data.map((p) => (
                <View key={`label-${p.key}`} style={{ width: groupWidth, alignItems: "center" }}>
                  <Text
                    style={{ color: UI.text, fontWeight: "900", fontSize: 11 }}
                    numberOfLines={1}
                  >
                    {p.label}
                  </Text>
                  <Text
                    style={{ color: UI.faint, fontWeight: "800", fontSize: 10, marginTop: 2 }}
                    numberOfLines={1}
                  >
                    {showProfit && p.profit != null ? fmtShort(p.profit) : fmtShort(p.sales)}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

function ComparisonRow({
  rank,
  name,
  value,
  hint,
}: {
  rank: number;
  name: string;
  value: string;
  hint?: string;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        paddingVertical: 10,
        borderBottomWidth: 1,
        borderBottomColor: "rgba(255,255,255,0.06)",
      }}
    >
      <View
        style={{
          width: 28,
          height: 28,
          borderRadius: 999,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "rgba(255,255,255,0.06)",
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.10)",
        }}
      >
        <Text style={{ color: UI.text, fontWeight: "900", fontSize: 12 }}>{rank}</Text>
      </View>

      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ color: UI.text, fontWeight: "900" }} numberOfLines={1}>
          {name}
        </Text>
        {!!hint && (
          <Text style={{ color: UI.faint, fontWeight: "800", fontSize: 12 }} numberOfLines={1}>
            {hint}
          </Text>
        )}
      </View>

      <Text style={{ color: UI.text, fontWeight: "900" }} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

export default function FinanceHistoryScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<any>();
  const org = useOrg();

  const orgId = String(org.activeOrgId ?? "").trim();
  const orgName = String(org.activeOrgName ?? "Org").trim() || "Org";
  const storeId = String(org.activeStoreId ?? "").trim();
  const storeName = String(org.activeStoreName ?? "Store").trim() || "Store";

  const roleLower = String(org.activeRole ?? "").trim().toLowerCase();
  const isOwner = roleLower === "owner";
  const isAdmin = roleLower === "admin";
  const canAll = isOwner || isAdmin;
  const canSeeExpenses = isOwner || isAdmin;

  const money = useOrgMoneyPrefs(orgId);
  const displayCurrency = money.currency || "TZS";
  const displayLocale = money.locale || "en-TZ";

  const fmt = useCallback(
    (n: number) =>
      formatMoney(n, { currency: displayCurrency, locale: displayLocale }).replace(/\s+/g, " "),
    [displayCurrency, displayLocale]
  );

  const fmtShort = useCallback((n: number) => {
    const abs = Math.abs(toNum(n));
    const sign = n < 0 ? "-" : "";

    if (abs >= 1_000_000_000) return `${sign}${(abs / 1_000_000_000).toFixed(1)}B`;
    if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(1)}M`;
    if (abs >= 1_000) return `${sign}${(abs / 1_000).toFixed(0)}K`;
    return `${sign}${Math.round(abs)}`;
  }, []);

  const storesMeta = useMemo(() => {
    const rows = (org.stores ?? [])
      .filter((s) => String((s as any)?.organization_id ?? "").trim() === orgId)
      .map((s) => ({
        storeId: String((s as any)?.store_id ?? "").trim(),
        storeName:
          String((s as any)?.store_name ?? (s as any)?.name ?? "Store").trim() || "Store",
      }))
      .filter((x) => !!x.storeId);

    const map = new Map<string, string>();
    for (const row of rows) map.set(row.storeId, row.storeName);
    if (storeId && !map.has(storeId)) map.set(storeId, storeName || "Store");
    return map;
  }, [org.stores, orgId, storeId, storeName]);

  const storeIdsInOrg = useMemo(() => {
    const ids = Array.from(storesMeta.keys());
    if (!ids.length && storeId) return [storeId];
    return Array.from(new Set(ids));
  }, [storesMeta, storeId]);

  const today = useMemo(() => toIsoDateLocal(new Date()), []);

  const [mode, setMode] = useState<Mode>("SALES");
  const [scope, setScope] = useState<"STORE" | "ALL">(() => (storeId ? "STORE" : "ALL"));
  const [dateFrom, setDateFrom] = useState<string>(today);
  const [dateTo, setDateTo] = useState<string>(today);

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [stockIntelErr, setStockIntelErr] = useState<string | null>(null);
  const [forecastErr, setForecastErr] = useState<string | null>(null);
  const [cashflowErr, setCashflowErr] = useState<string | null>(null);

  const [salesRow, setSalesRow] = useState<SalesSummary>({
    total: 0,
    orders: 0,
    currency: "TZS",
    directOrders: 0,
    clubOrders: 0,
  });

  const [expRow, setExpRow] = useState<ExpenseSummary>({ total: 0, count: 0 });
  const [profitRow, setProfitRow] = useState<ProfitSummary>({
    net: 0,
    sales: null,
    expenses: null,
  });

  const [pay, setPay] = useState<PayBreakdown>({
    cash: 0,
    bank: 0,
    mobile: 0,
    credit: 0,
    other: 0,
    orders: 0,
  });

  const [collections, setCollections] = useState<CreditCollections>({
    cash: 0,
    bank: 0,
    mobile: 0,
    other: 0,
    payments: 0,
  });

  const [expPay, setExpPay] = useState<ExpenseChannelBreakdown>(zeroExpenseChannelBreakdown());

  const [trendRows, setTrendRows] = useState<TrendPoint[]>([]);
  const [comparisonRows, setComparisonRows] = useState<StoreComparisonRow[]>([]);
  const [health, setHealth] = useState<HealthSummary | null>(null);
  const [productProfitRows, setProductProfitRows] = useState<ProductProfitRow[]>([]);
  const [stockIntelRows, setStockIntelRows] = useState<StockIntelRow[]>([]);
  const [forecast, setForecast] = useState<ForecastSummary | null>(null);
  const [cashflow, setCashflow] = useState<CashflowPrediction | null>(null);

  const reqRef = useRef(0);
  const cacheRef = useRef<Map<string, FinanceCachePayload>>(new Map());

  const desiredRef = useRef<{
    mode?: Mode;
    scope?: "STORE" | "ALL";
    from?: string;
    to?: string;
  }>({});

  const appliedOnceRef = useRef(false);

  const applyCachePayload = useCallback((payload: FinanceCachePayload) => {
    setSalesRow(payload.salesRow);
    setExpRow(payload.expRow);
    setProfitRow(payload.profitRow);
    setPay(payload.pay);
    setCollections(payload.collections);
    setExpPay(payload.expPay);
    setTrendRows(payload.trendRows);
    setComparisonRows(payload.comparisonRows);
    setHealth(payload.health);
    setProductProfitRows(payload.productProfitRows);
    setStockIntelRows(payload.stockIntelRows);
    setForecast(payload.forecast);
    setCashflow(payload.cashflow);
  }, []);

  React.useEffect(() => {
    const pMode = String(params?.mode ?? "").trim().toUpperCase();
    const pScope = String(params?.scope ?? "").trim().toUpperCase();
    const pFrom = String(params?.from ?? params?.dateFrom ?? "").trim();
    const pTo = String(params?.to ?? params?.dateTo ?? "").trim();

    const next: any = {};
    if (pMode === "SALES" || pMode === "EXPENSES" || pMode === "PROFIT") {
      next.mode = pMode as Mode;
    }
    if (pScope === "STORE" || pScope === "ALL") {
      next.scope = pScope as "STORE" | "ALL";
    }
    if (pFrom && isValidYYYYMMDD(pFrom)) next.from = pFrom;
    if (pTo && isValidYYYYMMDD(pTo)) next.to = pTo;

    desiredRef.current = next;
    appliedOnceRef.current = false;
  }, [params?.mode, params?.scope, params?.from, params?.to, params?.dateFrom, params?.dateTo]);

  React.useEffect(() => {
    if (appliedOnceRef.current) return;
    if (!orgId) return;

    const desired = desiredRef.current || {};

    let nextMode: Mode = desired.mode ?? mode;
    let nextScope: "STORE" | "ALL" = desired.scope ?? scope;

    if (!canAll) nextScope = "STORE";
    if (nextMode === "PROFIT" && !isOwner) nextMode = "SALES";

    if (nextScope === "STORE" && !storeId) return;

    setMode(nextMode);
    setScope(nextScope);

    if (desired.from) setDateFrom(desired.from);
    if (desired.to) setDateTo(desired.to);

    appliedOnceRef.current = true;
  }, [orgId, storeId, canAll, isOwner, mode, scope]);

  React.useEffect(() => {
    if (!canAll) setScope("STORE");
  }, [canAll]);

  React.useEffect(() => {
    if (mode === "PROFIT" && !isOwner) setMode("SALES");
  }, [mode, isOwner]);

  const applyQuick = useCallback((k: "today" | "7d" | "30d" | "90d" | "1y") => {
    const now = new Date();
    const to = new Date(now);
    const from = new Date(now);

    if (k === "today") {
      // no change
    } else if (k === "7d") {
      from.setDate(from.getDate() - 6);
    } else if (k === "30d") {
      from.setDate(from.getDate() - 29);
    } else if (k === "90d") {
      from.setDate(from.getDate() - 89);
    } else {
      from.setDate(from.getDate() - 364);
    }

    setDateFrom(toIsoDateLocal(from));
    setDateTo(toIsoDateLocal(to));
  }, []);

  const callSalesForStore = useCallback(
    async (sid: string, fromISO: string, toISO: string): Promise<SalesSummary> => {
      const { data, error } = await supabase.rpc(
        "get_sales",
        { p_store_id: sid, p_from: fromISO, p_to: toISO } as any
      );
      if (error) throw error;

      const rows = (Array.isArray(data) ? data : []) as any[];

      const pickAmount = (r: any) => {
        const candidates = [
          r?.total_amount,
          r?.grand_total,
          r?.total,
          r?.amount,
          r?.paid_amount,
          r?.revenue,
        ];
        for (const c of candidates) {
          const n = Number(c);
          if (Number.isFinite(n)) return n;
        }
        return 0;
      };

      const isCancelled = (r: any) => {
        const st = String(r?.status ?? "").toLowerCase().trim();
        return st === "cancelled" || st === "canceled" || st === "void";
      };

      const normalizeSource = (r: any) => String(r?.source ?? "POS").trim().toUpperCase();

      const isClubSource = (src: string) => {
        return src === "CLUB_ORDER" || src === "CLUB" || src === "BUSINESS_CLUB";
      };

      let total = 0;
      let orders = 0;
      let directOrders = 0;
      let clubOrders = 0;

      for (const r of rows) {
        if (isCancelled(r)) continue;

        total += toNum(pickAmount(r));
        orders += 1;

        const src = normalizeSource(r);
        if (isClubSource(src)) clubOrders += 1;
        else directOrders += 1;
      }

      const currency = String(rows?.[0]?.currency ?? "TZS").trim() || "TZS";

      return {
        total,
        orders,
        currency,
        directOrders,
        clubOrders,
      };
    },
    []
  );

  const callPaymentBreakdownV3 = useCallback(
    async (fromISO: string, toISO: string, sidOrNull: string | null): Promise<PayBreakdown> => {
      if (!orgId) return { cash: 0, bank: 0, mobile: 0, credit: 0, other: 0, orders: 0 };

      const { data, error } = await supabase.rpc(
        "get_sales_channel_summary_v3",
        { p_org_id: orgId, p_from: fromISO, p_to: toISO, p_store_id: sidOrNull } as any
      );
      if (error) throw error;

      const rows = (Array.isArray(data) ? data : []) as any[];
      const out: PayBreakdown = { cash: 0, bank: 0, mobile: 0, credit: 0, other: 0, orders: 0 };

      for (const r of rows) {
        const ch = String(r?.channel ?? r?.payment_method ?? "").trim().toUpperCase();
        const rev = toNum(r?.revenue ?? r?.total ?? 0);
        const ord = toInt(r?.orders ?? 0);
        out.orders += ord;

        if (ch === "CASH") out.cash += rev;
        else if (ch === "BANK") out.bank += rev;
        else if (ch === "MOBILE") out.mobile += rev;
        else if (ch === "CREDIT") out.credit += rev;
        else out.other += rev;
      }
      return out;
    },
    [orgId]
  );

  const callCreditCollections = useCallback(
    async (
      fromISO: string,
      toISO: string,
      sidOrNull: string | null
    ): Promise<CreditCollections> => {
      if (!orgId) return { cash: 0, bank: 0, mobile: 0, other: 0, payments: 0 };

      const { data, error } = await supabase.rpc(
        "get_credit_collections_summary_v2",
        { p_org_id: orgId, p_from: fromISO, p_to: toISO, p_store_id: sidOrNull } as any
      );
      if (error) throw error;

      const rows = (Array.isArray(data) ? data : []) as any[];
      const out: CreditCollections = { cash: 0, bank: 0, mobile: 0, other: 0, payments: 0 };

      for (const r of rows) {
        const ch = String(r?.channel ?? "").trim().toUpperCase();
        const amt = toNum(r?.amount ?? r?.total ?? 0);
        const cnt = toInt(r?.payments ?? r?.count ?? 0);
        out.payments += cnt;

        if (ch === "CASH") out.cash += amt;
        else if (ch === "BANK") out.bank += amt;
        else if (ch === "MOBILE") out.mobile += amt;
        else out.other += amt;
      }
      return out;
    },
    [orgId]
  );

  const callExpenseForStore = useCallback(
    async (sid: string, fromYMD: string, toYMD: string): Promise<ExpenseSummary> => {
      const { data, error } = await supabase.rpc(
        "get_expense_summary",
        { p_store_id: sid, p_from: fromYMD, p_to: toYMD } as any
      );
      if (error) throw error;
      const row = (Array.isArray(data) ? data[0] : data) as any;
      return {
        total: toNum(row?.total ?? row?.amount ?? row?.sum ?? 0),
        count: toInt(row?.count ?? row?.items ?? 0),
      };
    },
    []
  );

  const callExpenseChannelBreakdownForStore = useCallback(
    async (sid: string, fromYMD: string, toYMD: string): Promise<ExpenseChannelBreakdown> => {
      const { data, error } = await supabase.rpc(
        "get_expenses",
        {
          p_store_id: sid,
          p_from: fromYMD,
          p_to: toYMD,
        } as any
      );
      if (error) throw error;

      const rows = (Array.isArray(data) ? data : []) as any[];
      const out = zeroExpenseChannelBreakdown();

      for (const r of rows) {
        const amt = toNum(r?.amount ?? 0);
        const ch = normalizeMoneyChannel(r?.payment_method);

        out.total += amt;
        out.count += 1;

        if (ch === "CASH") out.cash += amt;
        else if (ch === "BANK") out.bank += amt;
        else if (ch === "MOBILE") out.mobile += amt;
        else out.other += amt;
      }

      return out;
    },
    []
  );

  const callProfitOwnerOnly = useCallback(
    async (sid: string, fromISO: string, toISO: string): Promise<ProfitSummary> => {
      if (!isOwner) return { net: 0, sales: null, expenses: null };

      const { data, error } = await supabase.rpc(
        "get_store_net_profit_v2",
        { p_store_id: sid, p_from: fromISO, p_to: toISO } as any
      );
      if (error) throw error;

      const row = (Array.isArray(data) ? data[0] : data) as any;
      const net = toNum(row?.net_profit ?? row?.net ?? 0);
      const sales = row?.sales_total != null ? toNum(row?.sales_total) : null;
      const expenses = row?.expenses_total != null ? toNum(row?.expenses_total) : null;
      return { net, sales, expenses };
    },
    [isOwner]
  );

  const callProductProfitReport = useCallback(
    async (sid: string, fromISO: string, toISO: string): Promise<ProductProfitRow[]> => {
      if (!isOwner) return [];

      const { data, error } = await supabase.rpc(
        "get_product_profit_report_v2",
        {
          p_store_id: sid,
          p_from: fromISO,
          p_to: toISO,
          p_limit: 20,
        } as any
      );

      if (error) throw error;

      const rows = (Array.isArray(data) ? data : []) as any[];

      return rows.map((r) => ({
        product_id: String(r?.product_id ?? ""),
        product_name: String(r?.product_name ?? "Product").trim() || "Product",
        sku: r?.sku ?? null,
        category: r?.category ?? null,
        unit: r?.unit ?? null,
        qty_sold: toNum(r?.qty_sold),
        revenue: toNum(r?.revenue),
        estimated_cost: toNum(r?.estimated_cost),
        gross_profit: toNum(r?.gross_profit),
        profit_margin_pct: toNum(r?.profit_margin_pct),
        sales_count: toInt(r?.sales_count),
      }));
    },
    [isOwner]
  );

  const callStockIntelligence = useCallback(
    async (
      fromISO: string,
      toISO: string,
      nextScope: "STORE" | "ALL",
      sid: string | null
    ): Promise<StockIntelRow[]> => {
      if (!orgId) return [];

      const scopeCandidates = nextScope === "STORE" ? ["STORE", "store"] : ["ALL", "all"];

      let lastError: any = null;

      for (const scopeArg of scopeCandidates) {
        const { data, error } = await supabase.rpc(
          "get_stock_intelligence_v1",
          {
            p_org_id: orgId,
            p_store_id: nextScope === "STORE" ? sid : null,
            p_scope: scopeArg,
            p_from: fromISO,
            p_to: toISO,
            p_limit: 10,
          } as any
        );

        if (error) {
          lastError = error;
          continue;
        }

        const rows = (Array.isArray(data) ? data : []) as any[];

        return rows.map((r) => ({
          bucket: normalizeStockBucket(r?.bucket),
          product_id: String(r?.product_id ?? ""),
          product_name: String(r?.product_name ?? "Product").trim() || "Product",
          sku: r?.sku ?? null,
          category: r?.category ?? null,
          unit: r?.unit ?? null,
          store_id: r?.store_id ? String(r.store_id) : null,
          qty_sold: toNum(r?.qty_sold),
          sales_count: toInt(r?.sales_count),
          stock_on_hand: toNum(r?.stock_on_hand),
          low_stock_threshold: toNum(r?.low_stock_threshold),
          stock_status: String(r?.stock_status ?? "").trim().toUpperCase(),
          activity_score: toNum(r?.activity_score),
        }));
      }

      if (lastError) throw lastError;
      return [];
    },
    [orgId]
  );

  const callForecastSummary = useCallback(
    async (
      fromISO: string,
      toISO: string,
      nextScope: "STORE" | "ALL",
      sid: string | null
    ): Promise<ForecastSummary | null> => {
      if (!orgId) return null;

      const { data, error } = await supabase.rpc(
        "get_sales_forecast_v1",
        {
          p_org_id: orgId,
          p_store_id: nextScope === "STORE" ? sid : null,
          p_scope: nextScope,
          p_from: fromISO,
          p_to: toISO,
        } as any
      );

      if (error) throw error;

      const row = (Array.isArray(data) ? data[0] : data) as any;
      if (!row) return null;

      const forecastDays = toInt(row?.forecast_days);
      const trendPct = toNum(row?.trend_pct);

      return {
        scope_used:
          String(row?.scope_used ?? nextScope).trim().toUpperCase() === "ALL" ? "ALL" : "STORE",
        forecast_days: forecastDays,
        period_sales: toNum(row?.period_sales),
        period_orders: toInt(row?.period_orders),
        avg_daily_sales: toNum(row?.avg_daily_sales),
        avg_daily_orders: toNum(row?.avg_daily_orders),
        projected_sales_next_period: toNum(row?.projected_sales_next_period),
        projected_orders_next_period: toNum(row?.projected_orders_next_period),
        trend_label:
          String(row?.trend_label ?? "STABLE").trim().toUpperCase() === "INCREASING"
            ? "INCREASING"
            : String(row?.trend_label ?? "STABLE").trim().toUpperCase() === "DECLINING"
              ? "DECLINING"
              : "STABLE",
        trend_pct: trendPct,
        stockout_risk_count: toInt(row?.stockout_risk_count),
        urgent_restock_count: toInt(row?.urgent_restock_count),
      };
    },
    [orgId]
  );

  const callCashflowPrediction = useCallback(
    async (
      fromISO: string,
      toISO: string,
      nextScope: "STORE" | "ALL",
      sid: string | null
    ): Promise<CashflowPrediction | null> => {
      if (!orgId) return null;

      const { data, error } = await supabase.rpc(
        "get_cashflow_prediction_v1",
        {
          p_org_id: orgId,
          p_store_id: nextScope === "STORE" ? sid : null,
          p_scope: nextScope,
          p_from: fromISO,
          p_to: toISO,
        } as any
      );

      if (error) throw error;

      const row = (Array.isArray(data) ? data[0] : data) as any;
      if (!row) return null;

      return {
        scope_used:
          String(row?.scope_used ?? nextScope).trim().toUpperCase() === "ALL" ? "ALL" : "STORE",
        forecast_days: toInt(row?.forecast_days),
        projected_cash_in: toNum(
          row?.projected_cash_in ?? row?.projected_cash ?? row?.cash_in_next_period
        ),
        projected_cash_orders: toInt(
          row?.projected_cash_orders ?? row?.cash_orders ?? row?.projected_orders
        ),
        avg_daily_cash: toNum(row?.avg_daily_cash ?? row?.daily_cash_avg),
        avg_daily_orders: toNum(row?.avg_daily_orders ?? row?.daily_orders_avg),
        confidence: normalizeConfidence(row?.confidence ?? row?.confidence_label),
      };
    },
    [orgId]
  );

  const run = useCallback(async () => {
    const rid = ++reqRef.current;

    if (!orgId) {
      setErr("No active organization selected");
      return;
    }
    if (scope === "STORE" && !storeId) {
      setErr("No active store selected");
      return;
    }
    if (!isValidYYYYMMDD(dateFrom) || !isValidYYYYMMDD(dateTo)) {
      setErr("Tarehe lazima iwe format: YYYY-MM-DD (mfano 2025-12-31)");
      return;
    }

    const fromISO = ymdToISOFrom(dateFrom);
    const toISO = ymdToISOTo(dateTo);

    const targets =
      scope === "STORE"
        ? [storeId].filter(Boolean)
        : storeIdsInOrg.length
          ? storeIdsInOrg
          : storeId
            ? [storeId]
            : [];

    if (!targets.length) {
      setErr("No stores found for this org");
      return;
    }

    if (mode === "PROFIT" && !isOwner) {
      setErr("Huna ruhusa ya kuona Profit (Owner only).");
      return;
    }

    const cacheKey = `${orgId}|${scope}|${storeId}|${mode}|${dateFrom}|${dateTo}`;
    const cached = cacheRef.current.get(cacheKey);

    if (cached) {
      applyCachePayload(cached);
    }

    if (mode !== "PROFIT" && !cached) {
      setProductProfitRows([]);
    }

    setLoading(true);
    setErr(null);
    setStockIntelErr(null);
    setForecastErr(null);
    setCashflowErr(null);

    try {
      const comparisonOut: StoreComparisonRow[] = [];

      let nextSalesRow: SalesSummary = {
        total: 0,
        orders: 0,
        currency: "TZS",
        directOrders: 0,
        clubOrders: 0,
      };

      let nextExpRow: ExpenseSummary = { total: 0, count: 0 };
      let nextProfitRow: ProfitSummary = { net: 0, sales: null, expenses: null };
      let nextPay: PayBreakdown = {
        cash: 0,
        bank: 0,
        mobile: 0,
        credit: 0,
        other: 0,
        orders: 0,
      };
      let nextCollections: CreditCollections = {
        cash: 0,
        bank: 0,
        mobile: 0,
        other: 0,
        payments: 0,
      };
      let nextExpPay: ExpenseChannelBreakdown = zeroExpenseChannelBreakdown();
      let nextProductProfitRows: ProductProfitRow[] = [];
      let nextStockIntelRows: StockIntelRow[] = [];
      let nextForecast: ForecastSummary | null = null;
      let nextCashflow: CashflowPrediction | null = null;

      if (mode === "SALES") {
        const rows = await Promise.all(targets.map((sid) => callSalesForStore(sid, fromISO, toISO)));

        const sumTotal = rows.reduce((a, r) => a + toNum(r.total), 0);
        const sumOrders = rows.reduce((a, r) => a + toInt(r.orders), 0);
        const sumDirectOrders = rows.reduce((a, r) => a + toInt(r.directOrders), 0);
        const sumClubOrders = rows.reduce((a, r) => a + toInt(r.clubOrders), 0);
        const currency = rows[0]?.currency ?? "TZS";

        const sidOrNull = scope === "STORE" ? storeId : null;

        const pb = await callPaymentBreakdownV3(fromISO, toISO, sidOrNull);
        const cc = await callCreditCollections(fromISO, toISO, sidOrNull);

        if (canSeeExpenses) {
          const expChannelRows = await Promise.all(
            targets.map((sid) => callExpenseChannelBreakdownForStore(sid, dateFrom, dateTo))
          );

          nextExpPay = expChannelRows.reduce<ExpenseChannelBreakdown>((acc, row) => {
            acc.cash += toNum(row.cash);
            acc.bank += toNum(row.bank);
            acc.mobile += toNum(row.mobile);
            acc.other += toNum(row.other);
            acc.total += toNum(row.total);
            acc.count += toInt(row.count);
            return acc;
          }, zeroExpenseChannelBreakdown());
        }

        nextSalesRow = {
          total: sumTotal,
          orders: sumOrders,
          currency,
          directOrders: sumDirectOrders,
          clubOrders: sumClubOrders,
        };
        nextPay = pb;
        nextCollections = cc;

        for (let i = 0; i < targets.length; i += 1) {
          const sid = targets[i];
          const sales = rows[i];
          let expTotalForStore = 0;
          let profitForStore: number | null = null;

          if (canSeeExpenses) {
            try {
              const exp = await callExpenseForStore(sid, dateFrom, dateTo);
              expTotalForStore = toNum(exp.total);
            } catch {}
          }

          if (isOwner) {
            try {
              const prof = await callProfitOwnerOnly(sid, fromISO, toISO);
              profitForStore = toNum(prof.net);
            } catch {}
          }

          comparisonOut.push({
            storeId: sid,
            storeName: storesMeta.get(sid) ?? "Store",
            sales: toNum(sales.total),
            expenses: expTotalForStore,
            profit: profitForStore,
            orders: toInt(sales.orders),
          });
        }
      } else if (mode === "EXPENSES") {
        const rows = await Promise.all(
          targets.map((sid) => callExpenseForStore(sid, dateFrom, dateTo))
        );
        const sumTotal = rows.reduce((a, r) => a + toNum(r.total), 0);
        const sumCount = rows.reduce((a, r) => a + toInt(r.count), 0);

        nextExpRow = { total: sumTotal, count: sumCount };

        if (canSeeExpenses) {
          const expChannelRows = await Promise.all(
            targets.map((sid) => callExpenseChannelBreakdownForStore(sid, dateFrom, dateTo))
          );

          nextExpPay = expChannelRows.reduce<ExpenseChannelBreakdown>((acc, row) => {
            acc.cash += toNum(row.cash);
            acc.bank += toNum(row.bank);
            acc.mobile += toNum(row.mobile);
            acc.other += toNum(row.other);
            acc.total += toNum(row.total);
            acc.count += toInt(row.count);
            return acc;
          }, zeroExpenseChannelBreakdown());
        }

        for (let i = 0; i < targets.length; i += 1) {
          const sid = targets[i];
          const exp = rows[i];

          let salesForStore = 0;
          let profitForStore: number | null = null;
          let ordersForStore = 0;

          try {
            const sales = await callSalesForStore(sid, fromISO, toISO);
            salesForStore = toNum(sales.total);
            ordersForStore = toInt(sales.orders);
          } catch {}

          if (isOwner) {
            try {
              const prof = await callProfitOwnerOnly(sid, fromISO, toISO);
              profitForStore = toNum(prof.net);
            } catch {}
          }

          comparisonOut.push({
            storeId: sid,
            storeName: storesMeta.get(sid) ?? "Store",
            sales: salesForStore,
            expenses: toNum(exp.total),
            profit: profitForStore,
            orders: ordersForStore,
          });
        }
      } else {
        const rows = await Promise.all(targets.map((sid) => callProfitOwnerOnly(sid, fromISO, toISO)));
        const sumNet = rows.reduce((a, r) => a + toNum(r.net), 0);

        const sumSalesRaw = rows.reduce((a, r) => a + (r.sales == null ? 0 : toNum(r.sales)), 0);
        const sumSalesAny = rows.some((r) => r.sales != null) ? sumSalesRaw : null;

        const sumExpRaw = rows.reduce(
          (a, r) => a + (r.expenses == null ? 0 : toNum(r.expenses)),
          0
        );
        const sumExpAny = rows.some((r) => r.expenses != null) ? sumExpRaw : null;

        nextProfitRow = { net: sumNet, sales: sumSalesAny, expenses: sumExpAny };

        if (canSeeExpenses) {
          const expChannelRows = await Promise.all(
            targets.map((sid) => callExpenseChannelBreakdownForStore(sid, dateFrom, dateTo))
          );

          nextExpPay = expChannelRows.reduce<ExpenseChannelBreakdown>((acc, row) => {
            acc.cash += toNum(row.cash);
            acc.bank += toNum(row.bank);
            acc.mobile += toNum(row.mobile);
            acc.other += toNum(row.other);
            acc.total += toNum(row.total);
            acc.count += toInt(row.count);
            return acc;
          }, zeroExpenseChannelBreakdown());
        }

        if (scope === "STORE" && storeId) {
          try {
            nextProductProfitRows = await callProductProfitReport(storeId, fromISO, toISO);
          } catch {
            nextProductProfitRows = [];
          }
        } else {
          nextProductProfitRows = [];
        }

        for (let i = 0; i < targets.length; i += 1) {
          const sid = targets[i];
          const prof = rows[i];

          let ordersForStore = 0;
          try {
            const sales = await callSalesForStore(sid, fromISO, toISO);
            ordersForStore = toInt(sales.orders);
          } catch {}

          comparisonOut.push({
            storeId: sid,
            storeName: storesMeta.get(sid) ?? "Store",
            sales: prof.sales == null ? 0 : toNum(prof.sales),
            expenses: prof.expenses == null ? 0 : toNum(prof.expenses),
            profit: toNum(prof.net),
            orders: ordersForStore,
          });
        }
      }

      try {
        nextStockIntelRows = await callStockIntelligence(
          fromISO,
          toISO,
          scope,
          scope === "STORE" ? storeId : null
        );
      } catch (stockErr: any) {
        nextStockIntelRows = [];
        setStockIntelErr(stockErr?.message ?? "Failed to load stock intelligence");
      }

      try {
        nextForecast = await callForecastSummary(
          fromISO,
          toISO,
          scope,
          scope === "STORE" ? storeId : null
        );
      } catch (forecastError: any) {
        nextForecast = null;
        setForecastErr(forecastError?.message ?? "Failed to load forecast engine");
      }

      try {
        nextCashflow = await callCashflowPrediction(
          fromISO,
          toISO,
          scope,
          scope === "STORE" ? storeId : null
        );
      } catch (cashflowError: any) {
        nextCashflow = null;
        setCashflowErr(cashflowError?.message ?? "Failed to load cashflow engine");
      }

      const buckets = buildTrendBuckets(dateFrom, dateTo);
      const trendOut: TrendPoint[] = [];

      for (const bucket of buckets) {
        let salesTotal = 0;
        let expensesTotal = 0;
        let profitTotal = 0;
        let hasProfit = false;

        for (const sid of targets) {
          const sales = await callSalesForStore(sid, bucket.fromISO, bucket.toISO);
          salesTotal += toNum(sales.total);

          if (canSeeExpenses) {
            try {
              const exp = await callExpenseForStore(sid, bucket.fromYMD, bucket.toYMD);
              expensesTotal += toNum(exp.total);
            } catch {}
          }

          if (isOwner) {
            try {
              const profit = await callProfitOwnerOnly(sid, bucket.fromISO, bucket.toISO);
              profitTotal += toNum(profit.net);
              hasProfit = true;
            } catch {}
          }
        }

        trendOut.push({
          key: bucket.key,
          label: bucket.label,
          sales: salesTotal,
          expenses: expensesTotal,
          profit: isOwner && hasProfit ? profitTotal : null,
        });
      }

      const comparisonSorted =
        mode === "EXPENSES"
          ? [...comparisonOut].sort((a, b) => b.expenses - a.expenses)
          : mode === "PROFIT"
            ? [...comparisonOut].sort((a, b) => toNum(b.profit) - toNum(a.profit))
            : [...comparisonOut].sort((a, b) => b.sales - a.sales);

      const totalSalesForHealth = toNum(
        comparisonOut.reduce((acc, row) => acc + toNum(row.sales), 0)
      );

      const totalExpensesForHealth = toNum(
        comparisonOut.reduce((acc, row) => acc + toNum(row.expenses), 0)
      );

      const totalProfitForHealth = isOwner
        ? toNum(comparisonOut.reduce((acc, row) => acc + toNum(row.profit), 0))
        : null;

      const profitMargin =
        isOwner && totalSalesForHealth > 0 && totalProfitForHealth != null
          ? (totalProfitForHealth / totalSalesForHealth) * 100
          : null;

      const expensesRatio =
        totalSalesForHealth > 0 ? (totalExpensesForHealth / totalSalesForHealth) * 100 : null;

      const half = Math.floor(trendOut.length / 2);
      const left = trendOut.slice(0, Math.max(1, half));
      const right = trendOut.slice(Math.max(1, half));

      const avgLeft =
        left.length > 0 ? left.reduce((acc, p) => acc + toNum(p.sales), 0) / left.length : 0;
      const avgRight =
        right.length > 0 ? right.reduce((acc, p) => acc + toNum(p.sales), 0) / right.length : 0;

      let salesTrend: HealthSummary["salesTrend"] = "NO_DATA";
      if (trendOut.length >= 2 && avgLeft > 0) {
        const changePct = ((avgRight - avgLeft) / avgLeft) * 100;
        if (changePct > 8) salesTrend = "INCREASING";
        else if (changePct < -8) salesTrend = "DECLINING";
        else salesTrend = "STABLE";
      } else if (trendOut.length >= 2) {
        salesTrend = avgRight > avgLeft ? "INCREASING" : "STABLE";
      }

      let score = 50;

      if (profitMargin != null) {
        if (profitMargin >= 25) score += 28;
        else if (profitMargin >= 15) score += 20;
        else if (profitMargin >= 8) score += 12;
        else if (profitMargin >= 0) score += 4;
        else if (profitMargin >= -5) score -= 18;
        else if (profitMargin >= -10) score -= 30;
        else score -= 42;
      }

      if (expensesRatio != null) {
        if (expensesRatio <= 10) score += 16;
        else if (expensesRatio <= 20) score += 10;
        else if (expensesRatio <= 30) score += 4;
        else if (expensesRatio <= 40) score -= 6;
        else if (expensesRatio <= 50) score -= 14;
        else score -= 24;
      }

      if (salesTrend === "INCREASING") score += 14;
      else if (salesTrend === "STABLE") score += 4;
      else if (salesTrend === "DECLINING") score -= 16;

      if (isOwner && totalProfitForHealth != null && totalProfitForHealth < 0) {
        score -= 12;
      }

      score = Math.max(0, Math.min(100, Math.round(score)));

      let label: HealthSummary["label"] = "WATCH";

      if (profitMargin != null && profitMargin < -8) {
        label = "CRITICAL";
      } else if (score >= 85) {
        label = "EXCELLENT";
      } else if (score >= 65) {
        label = "GOOD";
      } else if (score >= 40) {
        label = "WATCH";
      } else {
        label = "CRITICAL";
      }

      let message = "Business performance needs attention.";

      if (label === "EXCELLENT") {
        message = "Strong performance. Sales, cost control, and trend look healthy.";
      } else if (label === "GOOD") {
        message = "Business is healthy with stable fundamentals and manageable cost pressure.";
      } else if (label === "WATCH") {
        message =
          "Business needs close monitoring. Margin, expenses, or stock movement should be reviewed.";
      } else {
        message =
          "Critical attention needed. Profitability is under pressure and immediate action is recommended.";
      }

      const nextHealth: HealthSummary = {
        score,
        label,
        profitMargin,
        expensesRatio,
        salesTrend,
        message,
      };

      const payload: FinanceCachePayload = {
        salesRow: nextSalesRow,
        expRow: nextExpRow,
        profitRow: nextProfitRow,
        pay: nextPay,
        collections: nextCollections,
        expPay: nextExpPay,
        trendRows: trendOut,
        comparisonRows: comparisonSorted,
        health: nextHealth,
        productProfitRows: nextProductProfitRows,
        stockIntelRows: nextStockIntelRows,
        forecast: nextForecast,
        cashflow: nextCashflow,
      };

      if (rid !== reqRef.current) return;

      cacheRef.current.set(cacheKey, payload);
      applyCachePayload(payload);
    } catch (e: any) {
      if (rid !== reqRef.current) return;
      setErr(e?.message ?? "Failed to search");
    } finally {
      if (rid === reqRef.current) setLoading(false);
    }
  }, [
    orgId,
    scope,
    storeId,
    storeIdsInOrg,
    storesMeta,
    mode,
    isOwner,
    canSeeExpenses,
    dateFrom,
    dateTo,
    callSalesForStore,
    callPaymentBreakdownV3,
    callCreditCollections,
    callExpenseForStore,
    callExpenseChannelBreakdownForStore,
    callProfitOwnerOnly,
    callProductProfitReport,
    callStockIntelligence,
    callForecastSummary,
    callCashflowPrediction,
    applyCachePayload,
  ]);

  React.useEffect(() => {
    if (!appliedOnceRef.current) return;
    if (!orgId) return;
    if (scope === "STORE" && !storeId) return;
    if (!isValidYYYYMMDD(dateFrom) || !isValidYYYYMMDD(dateTo)) return;

    void run();
  }, [orgId, storeId, scope, mode, dateFrom, dateTo, run]);

  const salesTotal = fmt(salesRow.total);
  const salesOrders = String(salesRow.orders ?? 0);
  const salesAvg = salesRow.orders > 0 ? fmt(salesRow.total / Math.max(1, salesRow.orders)) : "—";
  const directOrdersText = String(salesRow.directOrders ?? 0);
  const clubOrdersText = String(salesRow.clubOrders ?? 0);

  const expTotal = fmt(expRow.total);
  const expCount = String(expRow.count ?? 0);
  const expAvg = expRow.count > 0 ? fmt(expRow.total / Math.max(1, expRow.count)) : "—";

  const pNet = fmt(profitRow.net);
  const pGross =
    profitRow.expenses == null ? "—" : fmt(toNum(profitRow.net) + toNum(profitRow.expenses));
  const pSales = profitRow.sales == null ? "—" : fmt(profitRow.sales);
  const pExp = profitRow.expenses == null ? "—" : fmt(profitRow.expenses);

  const expenseCash = fmt(expPay.cash);
  const expenseBank = fmt(expPay.bank);
  const expenseMobile = fmt(expPay.mobile);
  const expenseOther = fmt(expPay.other);
  const expenseByChannelsTotal = fmt(expPay.total);

  const cCash = fmt(collections.cash);
  const cBank = fmt(collections.bank);
  const cMobile = fmt(collections.mobile);
  const cTotalNum = collections.cash + collections.bank + collections.mobile + collections.other;
  const cTotal = fmt(cTotalNum);
  const cPayments = String(collections.payments ?? 0);

  const credit = fmt(pay.credit);

  const availableCashNum = subtractFloor(pay.cash + collections.cash, expPay.cash);
  const availableBankNum = subtractFloor(pay.bank + collections.bank, expPay.bank);
  const availableMobileNum = subtractFloor(pay.mobile + collections.mobile, expPay.mobile);
  const availableOtherNum = subtractFloor(pay.other + collections.other, expPay.other);

  const availableCash = fmt(availableCashNum);
  const availableBank = fmt(availableBankNum);
  const availableMobile = fmt(availableMobileNum);

  const totalMoneyInNum =
    availableCashNum + availableBankNum + availableMobileNum + availableOtherNum;
  const totalMoneyIn = fmt(totalMoneyInNum);

  const paidMoneyInNum = pay.cash + pay.bank + pay.mobile;
  const paidMoneyIn = fmt(paidMoneyInNum);

  const totalReceipts = salesTotal;

  const totalInCash = fmt(availableCashNum);
  const totalInBank = fmt(availableBankNum);
  const totalInMobile = fmt(availableMobileNum);

  const bucketInfo = useMemo(() => {
    const totalDays =
      isValidYYYYMMDD(dateFrom) && isValidYYYYMMDD(dateTo)
        ? diffDaysInclusive(dateFrom, dateTo)
        : 0;

    if (totalDays <= 31) return "Daily trend";
    if (totalDays <= 120) return "Weekly trend";
    return "Monthly trend";
  }, [dateFrom, dateTo]);

  const comparisonTitle =
    mode === "EXPENSES"
      ? "Store Comparison • Expenses"
      : mode === "PROFIT"
        ? "Store Comparison • Profit"
        : "Store Comparison • Sales";

  const subtitle = scope === "STORE" ? `Store: ${storeName}` : `Org: ${orgName} (ALL)`;

  const stockIntelByBucket = useMemo(() => {
    const order: StockIntelBucket[] = ["FAST_MOVING", "SLOW_MOVING", "DEAD_STOCK", "LOW_STOCK"];
    return order.map((bucket) => ({
      bucket,
      rows: stockIntelRows.filter((r) => normalizeStockBucket(r.bucket) === bucket),
    }));
  }, [stockIntelRows]);

  const aiInsights = useMemo<InsightItem[]>(() => {
    const items: InsightItem[] = [];

    if (health?.label === "EXCELLENT") {
      items.push({
        id: "health-excellent",
        tone: "good",
        title: "Biashara iko strong",
        body: `Health score ni ${health.score}/100 na trend ni ${health.salesTrend}. Endelea kusukuma bidhaa zinazouza zaidi na linda margin iliyopo.`,
      });
    } else if (health?.label === "GOOD") {
      items.push({
        id: "health-good",
        tone: "info",
        title: "Biashara iko vizuri",
        body: `Health score ni ${health.score}/100. Kuna msingi mzuri, lakini endelea kufuatilia expenses na kasi ya mauzo.`,
      });
    } else if (health?.label === "WATCH") {
      items.push({
        id: "health-watch",
        tone: "warn",
        title: "Kuna maeneo ya kuangalia",
        body: `Health score ni ${health.score}/100. Angalia margin, expense ratio, na bidhaa ambazo hazizunguki vizuri.`,
      });
    } else if (health?.label === "CRITICAL") {
      items.push({
        id: "health-critical",
        tone: "danger",
        title: "Hatua ya haraka inahitajika",
        body: `Health score ni ${health?.score ?? 0}/100. Punguza matumizi, sukuma bidhaa zenye mzunguko, na hakikisha cash-in haichelewi.`,
      });
    }

    if (salesRow.orders > 0) {
      const avgOrder = salesRow.total / Math.max(1, salesRow.orders);
      items.push({
        id: "avg-order",
        tone: "info",
        title: "Average order value",
        body: `Kila order kwa wastani ni ${fmt(avgOrder)}. Tumia hii kupima kama upsell/cross-sell zinafanya kazi kwenye kipindi hiki.`,
      });
    }

    if (pay.credit > 0) {
      items.push({
        id: "credit-balance",
        tone: "warn",
        title: "Kuna pesa bado kwenye Credit",
        body: `Credit balance ni ${fmt(pay.credit)}. Hii si money-in bado, hivyo fanya follow-up ya makusanyo ili cash flow isikwame.`,
      });
    }

    if (collections.payments > 0 && cTotalNum > 0) {
      items.push({
        id: "collections",
        tone: "good",
        title: "Makusanyo ya credit yameingia",
        body: `Umekusanya ${fmt(cTotalNum)} kutoka kwenye malipo ${collections.payments}. Hii ni dalili nzuri ya kurejesha cash flow.`,
      });
    }

    if (isOwner && profitRow.net < 0) {
      items.push({
        id: "negative-profit",
        tone: "danger",
        title: "Biashara ipo negative profit",
        body: `Profit ya kipindi hiki ni ${fmt(
          profitRow.net
        )}. Hii inaonyesha sales hazijatosha kufunika cost na expenses. Punguza matumizi ya haraka, kagua pricing, na sukuma bidhaa zenye margin nzuri.`,
      });
    }

    if (expRow.total > 0 && salesRow.total > 0) {
        const ratio = (expRow.total / salesRow.total) * 100;
        const grossBeforeExpenses =
          isOwner && profitRow.expenses != null
            ? toNum(profitRow.net) + toNum(profitRow.expenses)
            : null;

        if (
          isOwner &&
          grossBeforeExpenses != null &&
          grossBeforeExpenses > 0 &&
          expRow.total > grossBeforeExpenses
        ) {
          items.push({
            id: "expenses-over-gross-profit",
            tone: "danger",
            title: "Expenses zimezidi gross profit",
            body: `Gross profit kabla ya expenses ni ${fmt(
              grossBeforeExpenses
            )}, lakini expenses za kipindi hiki ni ${fmt(
              expRow.total
            )}. Hapa net profit itashuka kwa sababu matumizi yamezidi faida ya jumla kabla ya expenses.`,
          });
        } else if (ratio >= 35) {
          items.push({
            id: "expense-high",
            tone: "danger",
            title: "Expenses ziko juu ukilinganisha na sales",
            body: `Expense ratio ya kipindi hiki ni ${ratio.toFixed(
              1
            )}%. Kagua matumizi makubwa kabla hayajaanza kula margin kwa nguvu.`,
          });
        } else if (ratio >= 20) {
          items.push({
            id: "expense-watch",
            tone: "warn",
            title: "Expenses zinahitaji uangalizi",
            body: `Expense ratio ni ${ratio.toFixed(
              1
            )}%. Biashara bado iko sawa, lakini ni muda mzuri wa kubana maeneo yasiyo lazima.`,
          });
        }
      }

    if (stockIntelRows.length) {
      const fast = stockIntelRows.filter((x) => x.bucket === "FAST_MOVING");
      const slow = stockIntelRows.filter((x) => x.bucket === "SLOW_MOVING");
      const dead = stockIntelRows.filter((x) => x.bucket === "DEAD_STOCK");
      const low = stockIntelRows.filter((x) => x.bucket === "LOW_STOCK");

      if (fast.length) {
        const topFast = topRowByActivity(fast);
        const fastStore =
          topFast?.store_id && storesMeta.has(topFast.store_id)
            ? storesMeta.get(topFast.store_id)
            : null;

        if (topFast) {
          items.push({
            id: "fast-moving",
            tone: "good",
            title:
              scope === "ALL" ? "Bidhaa inayongoza kwenye org" : "Bidhaa ya kusukuma / kurestock",
            body:
              scope === "ALL"
                ? `${topFast.product_name}${fastStore ? ` (${fastStore})` : ""} inaongoza kwa movement ndani ya org. Activity score yake ni ${topFast.activity_score.toFixed(1)}.`
                : `${topFast.product_name} inaonekana kuwa fast-moving. Activity score yake ni ${topFast.activity_score.toFixed(1)}, hivyo hii ni candidate mzuri ya kuhakikisha haikatiki stock.`,
          });
        }
      }

      if (slow.length) {
        const topSlow = topRowByActivity(slow);
        const slowStore =
          topSlow?.store_id && storesMeta.has(topSlow.store_id)
            ? storesMeta.get(topSlow.store_id)
            : null;

        if (topSlow) {
          items.push({
            id: "slow-moving",
            tone: "warn",
            title: "Bidhaa ya kuangalia kwa karibu",
            body:
              scope === "ALL"
                ? `${topSlow.product_name}${slowStore ? ` (${slowStore})` : ""} ipo kwenye slow-moving ndani ya org. Angalia display, promo, au uhamishe kwenye store yenye demand zaidi.`
                : `${topSlow.product_name} ipo kwenye slow-moving. Angalia display, bei, au promo ili kuongeza mzunguko wake.`,
          });
        }
      }

      if (dead.length) {
        const topDead = dead[0];
        const deadStore =
          topDead?.store_id && storesMeta.has(topDead.store_id)
            ? storesMeta.get(topDead.store_id)
            : null;

        items.push({
          id: "dead-stock",
          tone: "danger",
          title: "Kuna dead stock",
          body:
            scope === "ALL"
              ? `${topDead.product_name}${deadStore ? ` (${deadStore})` : ""} ipo kwenye dead-stock. Iangalie kwa markdown, transfer, au promo.`
              : `${topDead.product_name} ipo kwenye dead-stock. Iangalie kwa markdown, promo, au uhamisho kwenda store nyingine yenye mzunguko.`,
        });
      }

      if (low.length) {
        const topLow = [...low].sort((a, b) => toNum(a.stock_on_hand) - toNum(b.stock_on_hand))[0];
        const lowStore =
          topLow?.store_id && storesMeta.has(topLow.store_id)
            ? storesMeta.get(topLow.store_id)
            : null;

        items.push({
          id: "low-stock",
          tone: "warn",
          title: "Bidhaa inakaribia kuisha",
          body:
            scope === "ALL"
              ? `${topLow.product_name}${lowStore ? ` (${lowStore})` : ""} ipo low-stock na on-hand ni ${topLow.stock_on_hand}. Panga restock mapema.`
              : `${topLow.product_name} ipo low-stock na on-hand ni ${topLow.stock_on_hand}. Panga restock mapema kabla mauzo hayajasimama.`,
        });
      }
    }

    if (forecast) {
      if (forecast.trend_label === "INCREASING") {
        items.push({
          id: "forecast-up",
          tone: "good",
          title: "Forecast inaonyesha ukuaji",
          body: `Kwa siku ${forecast.forecast_days} zijazo, biashara inaelekea kwenye momentum nzuri. Projected sales ni ${fmt(
            forecast.projected_sales_next_period
          )} na trend change ni ${forecast.trend_pct.toFixed(1)}%.`,
        });
      } else if (forecast.trend_label === "DECLINING") {
        items.push({
          id: "forecast-down",
          tone: "warn",
          title: "Forecast inaonyesha kushuka",
          body: `Kwa siku ${forecast.forecast_days} zijazo, projected sales ni ${fmt(
            forecast.projected_sales_next_period
          )}. Trend imepungua kwa ${Math.abs(forecast.trend_pct).toFixed(
            1
          )}%, hivyo ongeza promo, follow-up, au push ya bidhaa zinazotoka.`,
        });
      } else {
        items.push({
          id: "forecast-stable",
          tone: "info",
          title: "Forecast inaonyesha utulivu",
          body: `Kwa siku ${forecast.forecast_days} zijazo, projected sales ni ${fmt(
            forecast.projected_sales_next_period
          )}. Trend iko stable, hivyo focus iwe kwenye kuongeza order value na stock discipline.`,
        });
      }

      if (forecast.stockout_risk_count > 0) {
        items.push({
          id: "forecast-stockout-risk",
          tone: "warn",
          title: "Kuna risk ya stockout",
          body: `${forecast.stockout_risk_count} bidhaa zinaonyesha risk ya kuisha mapema kwa mwendo wa mauzo wa sasa. Restock planning ifanyike kabla ya sales kukatika.`,
        });
      }

      if (forecast.urgent_restock_count > 0) {
        items.push({
          id: "forecast-urgent-restock",
          tone: "danger",
          title: "Urgent restock inahitajika",
          body: `${forecast.urgent_restock_count} bidhaa zipo kwenye threshold ya low-stock au chini yake. Hii ni signal ya haraka kwa purchasing/restock.`,
        });
      }
    }

    if (cashflow) {
      if (cashflow.projected_cash_in > 0 && expRow.total > 0) {
        if (cashflow.projected_cash_in < expRow.total) {
          items.push({
            id: "cashflow-gap",
            tone: "danger",
            title: "Cashflow gap inaonekana",
            body: `Projected cash-in ya siku ${cashflow.forecast_days} zijazo ni ${fmt(
              cashflow.projected_cash_in
            )}, chini ya expenses za kipindi hiki (${fmt(
              expRow.total
            )}). Dhibiti matumizi na fanya collections mapema.`,
          });
        } else {
          items.push({
            id: "cashflow-healthy",
            tone: "good",
            title: "Cashflow inaonekana kuwa nzuri",
            body: `Projected cash-in ya siku ${cashflow.forecast_days} zijazo ni ${fmt(
              cashflow.projected_cash_in
            )}. Hii inaonyesha uwezo mzuri wa kuhimili movement ya pesa ya karibu.`,
          });
        }
      } else if (cashflow.projected_cash_in > 0) {
        items.push({
          id: "cashflow-projection",
          tone: "info",
          title: "Cashflow projection ipo tayari",
          body: `Kwa siku ${cashflow.forecast_days} zijazo, projected cash-in ni ${fmt(
            cashflow.projected_cash_in
          )} kutoka kwenye orders ${cashflow.projected_cash_orders}.`,
        });
      }

      if (cashflow.confidence === "LOW") {
        items.push({
          id: "cashflow-confidence-low",
          tone: "warn",
          title: "Cashflow confidence iko chini",
          body: "Prediction confidence iko LOW. Jaribu kutumia range pana zaidi au data zaidi ili projection iwe imara zaidi.",
        });
      } else if (cashflow.confidence === "HIGH") {
        items.push({
          id: "cashflow-confidence-high",
          tone: "good",
          title: "Cashflow signal ina nguvu",
          body: "Prediction confidence iko HIGH. Hii ni signal nzuri ya kutumia projection hii kwenye planning ya short-term cash movement.",
        });
      }
    }

    if (mode === "PROFIT" && scope === "STORE" && productProfitRows.length) {
      const topProfit = [...productProfitRows].sort((a, b) => b.gross_profit - a.gross_profit)[0];
      const worstMargin = [...productProfitRows].sort(
        (a, b) => a.profit_margin_pct - b.profit_margin_pct
      )[0];

      items.push({
        id: "top-profit-product",
        tone: "good",
        title: "Bidhaa inayobeba profit zaidi",
        body: `${topProfit.product_name} imeleta gross profit ya ${fmt(
          topProfit.gross_profit
        )}. Hii ni bidhaa ya kulindwa kwenye stock na mauzo.`,
      });

      if (worstMargin && worstMargin.product_id !== topProfit.product_id) {
        items.push({
          id: "weak-margin-product",
          tone: "warn",
          title: "Bidhaa yenye margin ndogo",
          body: `${worstMargin.product_name} ina margin ya ${worstMargin.profit_margin_pct.toFixed(
            1
          )}%. Kagua cost, pricing, au discount zake.`,
        });
      }
    }

    if (scope === "ALL" && comparisonRows.length > 1) {
      const topStore = comparisonRows[0];
      const weakestStore = bottomStoreRow(comparisonRows, mode);

      items.push({
        id: "store-leader",
        tone: "info",
        title: "Store inayotangulia",
        body: `${topStore.storeName} inaongoza ndani ya range hii na value ya ${fmt(
          valueByMode(topStore, mode)
        )}. Tumia hii kama benchmark ya stores nyingine.`,
      });

      if (weakestStore && weakestStore.storeId !== topStore.storeId) {
        items.push({
          id: "store-bottom",
          tone: "warn",
          title: "Store inayohitaji review",
          body: `${weakestStore.storeName} inahitaji review kwenye kipindi hiki. Linganisha sales effort, stock mix, na matumizi dhidi ya ${topStore.storeName}.`,
        });
      }
    }

    if (!items.length) {
      items.push({
        id: "default",
        tone: "info",
        title: "Hakuna insight ya kutosha bado",
        body: "Endelea kutumia Search kwa range tofauti au scope tofauti ili kupata ushauri wa biashara ulio wazi zaidi.",
      });
    }

    return items.slice(0, 6);
  }, [
    health,
    salesRow,
    pay.credit,
    collections.payments,
    cTotalNum,
    expRow.total,
    stockIntelRows,
    forecast,
    cashflow,
    mode,
    scope,
    productProfitRows,
    comparisonRows,
    fmt,
    storesMeta,
    profitRow,
    isOwner,
  ]);

  const currentCacheKey = `${orgId}|${scope}|${storeId}|${mode}|${dateFrom}|${dateTo}`;
  const hasCache = cacheRef.current.has(currentCacheKey);

  return (
    <Screen>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: 16, paddingHorizontal: 16, paddingBottom: 24 }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <Pressable
            onPress={() => router.back()}
            hitSlop={10}
            style={({ pressed }) => ({
              paddingHorizontal: 12,
              paddingVertical: 10,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.12)",
              backgroundColor: "rgba(255,255,255,0.06)",
              opacity: pressed ? 0.92 : 1,
            })}
          >
            <Text style={{ color: UI.text, fontWeight: "900" }}>Back</Text>
          </Pressable>

          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ color: UI.text, fontWeight: "900", fontSize: 18 }} numberOfLines={1}>
              Finance Search
            </Text>
            <Text style={{ color: UI.muted, fontWeight: "800" }} numberOfLines={1}>
              {subtitle}
            </Text>
          </View>

          <Pressable
            onPress={() => void run()}
            hitSlop={10}
            style={({ pressed }) => ({
              paddingHorizontal: 12,
              paddingVertical: 10,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: "rgba(42,168,118,0.35)",
              backgroundColor: "rgba(42,168,118,0.10)",
              opacity: pressed ? 0.92 : 1,
            })}
          >
            <Text style={{ color: UI.text, fontWeight: "900" }}>{loading ? "..." : "Search"}</Text>
          </Pressable>
        </View>

        <View style={{ height: 12 }} />

        <Card style={{ gap: 10 }}>
          <Text style={{ color: UI.faint, fontWeight: "900", fontSize: 12, letterSpacing: 0.4 }}>
            MODE
          </Text>

          <View style={{ flexDirection: "row", gap: 10 }}>
            <Chip active={mode === "SALES"} label="Sales" onPress={() => setMode("SALES")} />
            <Chip
              active={mode === "EXPENSES"}
              label="Expenses"
              onPress={() => setMode("EXPENSES")}
            />
            <Chip
              active={mode === "PROFIT"}
              label="Profit"
              danger
              disabled={!isOwner}
              onPress={() => setMode("PROFIT")}
            />
          </View>

          {canAll && (
            <>
              <View style={{ height: 4 }} />
              <Text
                style={{ color: UI.faint, fontWeight: "900", fontSize: 12, letterSpacing: 0.4 }}
              >
                SCOPE
              </Text>
              <View style={{ flexDirection: "row", gap: 10 }}>
                <SmallChip
                  active={scope === "STORE"}
                  label="STORE"
                  onPress={() => setScope("STORE")}
                />
                <SmallChip active={scope === "ALL"} label="ALL" onPress={() => setScope("ALL")} />
              </View>
            </>
          )}

          <View style={{ height: 4 }} />

          <Text style={{ color: UI.faint, fontWeight: "900", fontSize: 12, letterSpacing: 0.4 }}>
            DATE RANGE (YYYY-MM-DD)
          </Text>

          <View style={{ flexDirection: "row", gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: UI.muted, fontWeight: "800", marginBottom: 6 }}>From</Text>
              <TextInput
                value={dateFrom}
                onChangeText={setDateFrom}
                placeholder="2025-01-01"
                placeholderTextColor={UI.faint}
                autoCapitalize="none"
                style={{
                  borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.12)",
                  backgroundColor: "rgba(255,255,255,0.06)",
                  borderRadius: 14,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  color: UI.text,
                  fontWeight: "900",
                }}
              />
            </View>

            <View style={{ flex: 1 }}>
              <Text style={{ color: UI.muted, fontWeight: "800", marginBottom: 6 }}>To</Text>
              <TextInput
                value={dateTo}
                onChangeText={setDateTo}
                placeholder="2025-01-31"
                placeholderTextColor={UI.faint}
                autoCapitalize="none"
                style={{
                  borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.12)",
                  backgroundColor: "rgba(255,255,255,0.06)",
                  borderRadius: 14,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  color: UI.text,
                  fontWeight: "900",
                }}
              />
            </View>
          </View>

          <View style={{ flexDirection: "row", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
            <SmallChip active={false} label="Today" onPress={() => applyQuick("today")} />
            <SmallChip active={false} label="7 Days" onPress={() => applyQuick("7d")} />
            <SmallChip active={false} label="30 Days" onPress={() => applyQuick("30d")} />
            <SmallChip active={false} label="90 Days" onPress={() => applyQuick("90d")} />
            <SmallChip active={false} label="1 Year" onPress={() => applyQuick("1y")} />
          </View>

          {!!err && (
            <Card
              style={{
                borderColor: "rgba(201,74,74,0.35)",
                backgroundColor: "rgba(201,74,74,0.10)",
                borderRadius: 18,
                padding: 12,
              }}
            >
              <Text style={{ color: UI.danger, fontWeight: "900" }}>{err}</Text>
            </Card>
          )}
        </Card>

        <View style={{ height: 12 }} />

        <Card style={{ gap: 10 }}>
          <Text style={{ color: UI.text, fontWeight: "900", fontSize: 16 }}>Results</Text>

          {loading && !hasCache ? (
            <View style={{ paddingVertical: 18 }}>
              <ActivityIndicator />
            </View>
          ) : mode === "SALES" ? (
            <View style={{ gap: 12 }}>
              <View style={{ flexDirection: "row", gap: 12 }}>
                <MiniStat label="Sales" value={salesTotal} />
                <MiniStat label="Orders" value={salesOrders} />
                <MiniStat label="Avg/Order" value={String(salesAvg).replace(/\s+/g, " ")} />
              </View>

              <View style={{ flexDirection: "row", gap: 12 }}>
                <MiniStat label="Direct Sales" value={directOrdersText} hint="normal sales" />
                <MiniStat label="Club Sales" value={clubOrdersText} hint="club orders" />
                <View style={{ flex: 1 }} />
              </View>

              <View
                style={{
                  borderRadius: 20,
                  borderWidth: 1,
                  borderColor: "rgba(16,185,129,0.24)",
                  backgroundColor: "rgba(16,185,129,0.07)",
                  padding: 12,
                  gap: 10,
                }}
              >
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <Text
                    style={{ color: UI.text, fontWeight: "900", fontSize: 13, letterSpacing: 0.3 }}
                  >
                    RECEIPTS SUMMARY
                  </Text>
                  <View style={{ flex: 1 }} />
                  <Text style={{ color: UI.faint, fontWeight: "900", fontSize: 12 }}>
                    after expenses
                  </Text>
                </View>

                <View style={{ height: 1, backgroundColor: "rgba(255,255,255,0.10)" }} />

                <View style={{ flexDirection: "row", gap: 12 }}>
                  <MiniStat
                    label="Total Receipts"
                    value={totalReceipts}
                    hint="sales total (incl. credit)"
                  />
                  <MiniStat label="Total Money In" value={totalMoneyIn} hint="after expenses" />
                </View>

                <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12 }}>
                  Total Receipts = Sales total (including Credit). Total Money In = (Sales paid +
                  Credit collections) - expenses by payment channel.
                </Text>
              </View>

              <View style={{ height: 1, backgroundColor: "rgba(255,255,255,0.08)" }} />

              <Text
                style={{ color: UI.faint, fontWeight: "900", fontSize: 12, letterSpacing: 0.3 }}
              >
                PAYMENT BREAKDOWN (AFTER EXPENSES + CREDIT BALANCE)
              </Text>

              <View style={{ flexDirection: "row", gap: 12 }}>
                <MiniStat label="Cash" value={availableCash} hint="after expense" />
                <MiniStat label="Mobile" value={availableMobile} hint="after expense" />
                <MiniStat label="Total Money In" value={totalMoneyIn} hint="available + received" />
              </View>

              <View style={{ flexDirection: "row", gap: 12 }}>
                <MiniStat label="Bank" value={availableBank} hint="after expense" />
                <MiniStat label="Credit (Balance)" value={credit} hint="not money-in" />
                <View style={{ flex: 1 }} />
              </View>

              <View style={{ height: 1, backgroundColor: "rgba(255,255,255,0.08)" }} />

              <Text
                style={{ color: UI.faint, fontWeight: "900", fontSize: 12, letterSpacing: 0.3 }}
              >
                EXPENSES BY PAYMENT CHANNEL
              </Text>

              <View style={{ flexDirection: "row", gap: 12 }}>
                <MiniStat label="Cash" value={expenseCash} />
                <MiniStat label="Mobile" value={expenseMobile} />
                <MiniStat
                  label="Total"
                  value={expenseByChannelsTotal}
                  hint={`${expPay.count} expenses`}
                />
              </View>

              <View style={{ flexDirection: "row", gap: 12 }}>
                <MiniStat label="Bank" value={expenseBank} />
                <MiniStat label="Other" value={expenseOther} />
                <View style={{ flex: 1 }} />
              </View>

              <View style={{ height: 1, backgroundColor: "rgba(255,255,255,0.08)" }} />

              <Text
                style={{ color: UI.faint, fontWeight: "900", fontSize: 12, letterSpacing: 0.3 }}
              >
                CREDIT COLLECTIONS (PAYMENTS RECEIVED)
              </Text>

              <View style={{ flexDirection: "row", gap: 12 }}>
                <MiniStat label="Cash" value={cCash} />
                <MiniStat label="Mobile" value={cMobile} />
                <MiniStat label="Total" value={cTotal} hint={`${cPayments} payments`} />
              </View>

              <View style={{ flexDirection: "row", gap: 12 }}>
                <MiniStat label="Bank" value={cBank} />
                <View style={{ flex: 1 }} />
                <View style={{ flex: 1 }} />
              </View>

              <View
                style={{
                  marginTop: 6,
                  borderRadius: 20,
                  borderWidth: 1,
                  borderColor: "rgba(16,185,129,0.26)",
                  backgroundColor: "rgba(16,185,129,0.08)",
                  padding: 12,
                  gap: 10,
                }}
              >
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <Text
                    style={{ color: UI.text, fontWeight: "900", fontSize: 13, letterSpacing: 0.3 }}
                  >
                    TOTAL MONEY IN
                  </Text>
                  <View style={{ flex: 1 }} />
                  <Text style={{ color: UI.faint, fontWeight: "900", fontSize: 12 }}>
                    after expenses
                  </Text>
                </View>

                <View style={{ height: 1, backgroundColor: "rgba(255,255,255,0.10)" }} />

                <View style={{ flexDirection: "row", gap: 12 }}>
                  <MiniStat label="Cash" value={totalInCash} />
                  <MiniStat label="Mobile" value={totalInMobile} />
                  <MiniStat label="Total" value={totalMoneyIn} hint="available" />
                </View>

                <View style={{ flexDirection: "row", gap: 12 }}>
                  <MiniStat label="Bank" value={totalInBank} />
                  <View style={{ flex: 1 }} />
                  <View style={{ flex: 1 }} />
                </View>

                <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12 }}>
                  Includes: Sales PAID + Credit Collections received. Then subtracts expenses from
                  the same payment channel. Excludes: Credit (Balance).
                </Text>

                <View style={{ height: 1, backgroundColor: "rgba(255,255,255,0.08)" }} />

                <View style={{ flexDirection: "row", gap: 12 }}>
                  <MiniStat label="Sales Paid" value={paidMoneyIn} hint="before expense" />
                  <MiniStat label="Collections" value={cTotal} hint="payments received" />
                  <View style={{ flex: 1 }} />
                </View>
              </View>
            </View>
          ) : mode === "EXPENSES" ? (
            <View style={{ gap: 12 }}>
              <View style={{ flexDirection: "row", gap: 12 }}>
                <MiniStat label="Expenses" value={expTotal} />
                <MiniStat label="Count" value={expCount} />
                <MiniStat label="Avg/Expense" value={String(expAvg).replace(/\s+/g, " ")} />
              </View>

              <View style={{ height: 1, backgroundColor: "rgba(255,255,255,0.08)" }} />

              <Text
                style={{ color: UI.faint, fontWeight: "900", fontSize: 12, letterSpacing: 0.3 }}
              >
                EXPENSE CHANNEL BREAKDOWN
              </Text>

              <View style={{ flexDirection: "row", gap: 12 }}>
                <MiniStat label="Cash" value={expenseCash} />
                <MiniStat label="Mobile" value={expenseMobile} />
                <MiniStat
                  label="Total"
                  value={expenseByChannelsTotal}
                  hint={`${expPay.count} expenses`}
                />
              </View>

              <View style={{ flexDirection: "row", gap: 12 }}>
                <MiniStat label="Bank" value={expenseBank} />
                <MiniStat label="Other" value={expenseOther} />
                <View style={{ flex: 1 }} />
              </View>
            </View>
          ) : (
            <View style={{ gap: 12 }}>
              <View style={{ flexDirection: "row", gap: 12 }}>
                <MiniStat label="Net Profit" value={pNet} hint="after expenses" />
                <MiniStat label="Gross Profit" value={pGross} hint="before expenses" />
                <MiniStat label="Expenses" value={pExp} />
              </View>

              <View style={{ height: 1, backgroundColor: "rgba(255,255,255,0.08)" }} />

              <Text
                style={{ color: UI.faint, fontWeight: "900", fontSize: 12, letterSpacing: 0.3 }}
              >
                EXPENSE CHANNEL BREAKDOWN
              </Text>

              <View style={{ flexDirection: "row", gap: 12 }}>
                <MiniStat label="Cash" value={expenseCash} />
                <MiniStat label="Mobile" value={expenseMobile} />
                <MiniStat
                  label="Total"
                  value={expenseByChannelsTotal}
                  hint={`${expPay.count} expenses`}
                />
              </View>

              <View style={{ flexDirection: "row", gap: 12 }}>
                <MiniStat label="Bank" value={expenseBank} />
                <MiniStat label="Other" value={expenseOther} />
                <View style={{ flex: 1 }} />
              </View>

              {scope === "STORE" ? (
                <>
                  <View style={{ height: 1, backgroundColor: "rgba(255,255,255,0.08)" }} />

                  <Text
                    style={{
                      color: UI.faint,
                      fontWeight: "900",
                      fontSize: 12,
                      letterSpacing: 0.3,
                    }}
                  >
                    PRODUCT INTELLIGENCE
                  </Text>

                  <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12 }}>
                    Gross Profit hapa ni faida ya bidhaa kabla ya store-level expenses. Net Profit ya juu tayari huondoa expenses za siku/range yote.
                  </Text>

                  {productProfitRows.length ? (
                    <View style={{ gap: 10 }}>
                      {productProfitRows.slice(0, 8).map((row, idx) => (
                        <View
                          key={`${row.product_id}-${idx}`}
                          style={{
                            borderRadius: 16,
                            borderWidth: 1,
                            borderColor: "rgba(255,255,255,0.08)",
                            backgroundColor: "rgba(255,255,255,0.04)",
                            padding: 12,
                            gap: 8,
                          }}
                        >
                          <View
                            style={{
                              flexDirection: "row",
                              justifyContent: "space-between",
                              gap: 10,
                              alignItems: "center",
                            }}
                          >
                            <View style={{ flex: 1, minWidth: 0 }}>
                              <Text
                                style={{ color: UI.text, fontWeight: "900", fontSize: 14 }}
                                numberOfLines={1}
                              >
                                {idx + 1}. {row.product_name}
                              </Text>

                              <Text
                                style={{ color: UI.muted, fontWeight: "800", fontSize: 12 }}
                                numberOfLines={1}
                              >
                                SKU: {row.sku ?? "—"}
                                {row.category ? ` • ${row.category}` : ""}
                              </Text>
                            </View>

                            <Text
                              style={{ color: UI.text, fontWeight: "900", fontSize: 13 }}
                              numberOfLines={1}
                            >
                              {fmt(row.gross_profit)}
                            </Text>
                          </View>

                          <View style={{ flexDirection: "row", gap: 12 }}>
                            <MiniStat label="Revenue" value={fmt(row.revenue)} />
                            <MiniStat label="Cost" value={fmt(row.estimated_cost)} />
                            <MiniStat
                              label="Gross Margin"
                              value={`${row.profit_margin_pct.toFixed(1)}%`}
                            />
                          </View>

                          <View style={{ flexDirection: "row", gap: 12 }}>
                            <MiniStat label="Qty Sold" value={String(row.qty_sold)} />
                            <MiniStat label="Sales Count" value={String(row.sales_count)} />
                            <View style={{ flex: 1 }} />
                          </View>
                        </View>
                      ))}
                    </View>
                  ) : (
                    <Text style={{ color: UI.muted, fontWeight: "800" }}>
                      No product profit data yet for this store and range.
                    </Text>
                  )}
                </>
              ) : (
                <Text style={{ color: UI.muted, fontWeight: "800" }}>
                  Product Intelligence inaonekana kwenye STORE scope tu.
                </Text>
              )}
            </View>
          )}

          <View style={{ height: 1, backgroundColor: "rgba(255,255,255,0.08)", marginTop: 10 }} />

          <Text style={{ color: UI.muted, fontWeight: "800" }}>
            Range: <Text style={{ color: UI.text, fontWeight: "900" }}>{dateFrom}</Text> →{" "}
            <Text style={{ color: UI.text, fontWeight: "900" }}>{dateTo}</Text>
          </Text>

          {!orgId ? (
            <Text style={{ color: UI.danger, fontWeight: "900", marginTop: 8 }}>
              No active org selected.
            </Text>
          ) : null}

          {scope === "STORE" && !storeId ? (
            <Text style={{ color: UI.danger, fontWeight: "900", marginTop: 8 }}>
              No active store selected.
            </Text>
          ) : null}

          {mode === "PROFIT" && !isOwner ? (
            <Text style={{ color: UI.danger, fontWeight: "900", marginTop: 8 }}>
              Profit ni Owner-only (DORA v1).
            </Text>
          ) : null}
        </Card>

        <View style={{ height: 12 }} />

        <Card style={{ gap: 12 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ color: UI.text, fontWeight: "900", fontSize: 16 }}>
                AI Actionable Insights
              </Text>
              <Text style={{ color: UI.muted, fontWeight: "800" }} numberOfLines={1}>
                Ushauri wa biashara kutoka kwenye data ya kipindi ulichochagua
              </Text>
            </View>
            {loading ? <ActivityIndicator /> : null}
          </View>

          <View style={{ gap: 10 }}>
            {aiInsights.map((item) => {
              const toneStyle = getInsightToneStyle(item.tone);
              return (
                <View
                  key={item.id}
                  style={{
                    borderRadius: 18,
                    borderWidth: 1,
                    borderColor: toneStyle.borderColor,
                    backgroundColor: toneStyle.backgroundColor,
                    padding: 12,
                    gap: 6,
                  }}
                >
                  <Text style={{ color: UI.text, fontWeight: "900", fontSize: 14 }}>
                    {item.title}
                  </Text>
                  <Text style={{ color: UI.muted, fontWeight: "800", lineHeight: 20 }}>
                    {item.body}
                  </Text>
                </View>
              );
            })}
          </View>
        </Card>

        <View style={{ height: 12 }} />

        <Card style={{ gap: 12 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ color: UI.text, fontWeight: "900", fontSize: 16 }}>
                AI Forecast Engine
              </Text>
              <Text style={{ color: UI.muted, fontWeight: "800" }} numberOfLines={1}>
                Projection ya kipindi kijacho kwa kutumia trend ya range uliyochagua
              </Text>
            </View>
            {loading ? <ActivityIndicator /> : null}
          </View>

          {!!forecastErr && (
            <Card
              style={{
                borderColor: "rgba(201,74,74,0.35)",
                backgroundColor: "rgba(201,74,74,0.10)",
                borderRadius: 18,
                padding: 12,
              }}
            >
              <Text style={{ color: UI.danger, fontWeight: "900" }}>{forecastErr}</Text>
            </Card>
          )}

          {forecast ? (
            <View
              style={{
                borderRadius: 20,
                borderWidth: 1,
                borderColor:
                  forecast.trend_label === "INCREASING"
                    ? "rgba(16,185,129,0.26)"
                    : forecast.trend_label === "DECLINING"
                      ? "rgba(245,158,11,0.26)"
                      : "rgba(59,130,246,0.24)",
                backgroundColor:
                  forecast.trend_label === "INCREASING"
                    ? "rgba(16,185,129,0.08)"
                    : forecast.trend_label === "DECLINING"
                      ? "rgba(245,158,11,0.08)"
                      : "rgba(59,130,246,0.08)",
                padding: 14,
                gap: 10,
              }}
            >
              <View style={{ flexDirection: "row", gap: 12 }}>
                <MiniStat label="Forecast Days" value={String(forecast.forecast_days)} />
                <MiniStat label="Trend" value={forecast.trend_label} />
                <MiniStat label="Trend %" value={`${forecast.trend_pct.toFixed(1)}%`} />
              </View>

              <View style={{ flexDirection: "row", gap: 12 }}>
                <MiniStat
                  label="Projected Sales"
                  value={fmt(forecast.projected_sales_next_period)}
                />
                <MiniStat
                  label="Projected Orders"
                  value={String(Math.round(forecast.projected_orders_next_period))}
                />
                <MiniStat label="Avg/Day" value={fmt(forecast.avg_daily_sales)} />
              </View>

              <View style={{ flexDirection: "row", gap: 12 }}>
                <MiniStat label="Stockout Risk" value={String(forecast.stockout_risk_count)} />
                <MiniStat
                  label="Urgent Restock"
                  value={String(forecast.urgent_restock_count)}
                />
                <MiniStat
                  label="Avg Orders/Day"
                  value={String(forecast.avg_daily_orders.toFixed(1))}
                />
              </View>

              <Text style={{ color: UI.text, fontWeight: "800" }}>
                {forecast.trend_label === "INCREASING"
                  ? "Momentum inaonekana kuongezeka. Linda stock ya bidhaa zinazotoka na sukuma conversion."
                  : forecast.trend_label === "DECLINING"
                    ? "Kuna dalili ya kushuka. Ongeza promo, display, follow-up, na restock ya bidhaa zenye movement."
                    : "Trend iko stable. Hii ni nafasi ya kuongeza order value, margin, na discipline ya stock."}
              </Text>
            </View>
          ) : (
            <Text style={{ color: UI.muted, fontWeight: "800" }}>
              No forecast data yet for this scope and range.
            </Text>
          )}
        </Card>

        <View style={{ height: 12 }} />

        <Card style={{ gap: 12 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ color: UI.text, fontWeight: "900", fontSize: 16 }}>
                AI Cashflow Prediction
              </Text>
              <Text style={{ color: UI.muted, fontWeight: "800" }} numberOfLines={1}>
                Projection ya cash-in ya kipindi kijacho kwa kutumia range uliyochagua
              </Text>
            </View>
            {loading ? <ActivityIndicator /> : null}
          </View>

          {!!cashflowErr && (
            <Card
              style={{
                borderColor: "rgba(201,74,74,0.35)",
                backgroundColor: "rgba(201,74,74,0.10)",
                borderRadius: 18,
                padding: 12,
              }}
            >
              <Text style={{ color: UI.danger, fontWeight: "900" }}>{cashflowErr}</Text>
            </Card>
          )}

          {cashflow ? (
            <View
              style={{
                borderRadius: 20,
                borderWidth: 1,
                borderColor:
                 cashflow.confidence === "HIGH"
                    ? "rgba(16,185,129,0.26)"
                    : cashflow.confidence === "LOW"
                      ? "rgba(245,158,11,0.26)"
                      : "rgba(59,130,246,0.24)",
                backgroundColor:
                  cashflow.confidence === "HIGH"
                    ? "rgba(16,185,129,0.08)"
                    : cashflow.confidence === "LOW"
                      ? "rgba(245,158,11,0.08)"
                      : "rgba(59,130,246,0.08)",
                padding: 14,
                gap: 10,
              }}
            >
              <View style={{ flexDirection: "row", gap: 12 }}>
                <MiniStat label="Forecast Days" value={String(cashflow.forecast_days)} />
                <MiniStat label="Confidence" value={cashflow.confidence} />
                <MiniStat label="Scope" value={cashflow.scope_used} />
              </View>

              <View style={{ flexDirection: "row", gap: 12 }}>
                <MiniStat label="Projected Cash In" value={fmt(cashflow.projected_cash_in)} />
                <MiniStat
                  label="Projected Orders"
                  value={String(Math.round(cashflow.projected_cash_orders))}
                />
                <MiniStat label="Avg Cash/Day" value={fmt(cashflow.avg_daily_cash)} />
              </View>

              <View style={{ flexDirection: "row", gap: 12 }}>
                <MiniStat
                  label="Avg Orders/Day"
                  value={String(cashflow.avg_daily_orders.toFixed(1))}
                />
                <View style={{ flex: 1 }} />
                <View style={{ flex: 1 }} />
              </View>

              <Text style={{ color: UI.text, fontWeight: "800" }}>
                {cashflow.confidence === "HIGH"
                  ? "Cashflow signal ina nguvu. Unaweza kuitumia kwa planning ya short-term purchasing, collections, na matumizi."
                  : cashflow.confidence === "LOW"
                    ? "Cashflow signal bado ni ya tahadhari. Jaribu kutumia range pana zaidi ili prediction iwe imara zaidi."
                    : "Cashflow signal iko wastani. Tumia pamoja na forecast na collections trend kabla ya kufanya maamuzi makubwa ya matumizi."}
              </Text>
            </View>
          ) : (
            <Text style={{ color: UI.muted, fontWeight: "800" }}>
              No cashflow prediction yet for this scope and range.
            </Text>
          )}
        </Card>

        <View style={{ height: 12 }} />

        <Card style={{ gap: 12 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ color: UI.text, fontWeight: "900", fontSize: 16 }}>
                Stock Intelligence
              </Text>

              <View style={{ gap: 2 }}>
                <Text style={{ color: UI.muted, fontWeight: "800" }} numberOfLines={1}>
                  {scope === "STORE" ? `Store: ${storeName}` : `Org: ${orgName} (ALL stores)`}
                </Text>

                <Text
                  style={{ color: UI.faint, fontWeight: "800", fontSize: 12 }}
                  numberOfLines={1}
                >
                  {scope === "STORE"
                    ? "Fast / Slow / Dead / Low stock kwa store iliyochaguliwa"
                    : "Fast / Slow / Dead / Low stock kwa stores zote ndani ya organization"}
                </Text>
              </View>
            </View>

            {loading ? <ActivityIndicator /> : null}
          </View>

          {scope === "ALL" ? (
            <View
              style={{
                borderRadius: 14,
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.08)",
                backgroundColor: "rgba(255,255,255,0.04)",
                paddingHorizontal: 12,
                paddingVertical: 10,
              }}
            >
              <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12 }}>
                Stores in scope:{" "}
                <Text style={{ color: UI.text, fontWeight: "900" }}>{storeIdsInOrg.length}</Text>
              </Text>
            </View>
          ) : null}

          {!!stockIntelErr && (
            <Card
              style={{
                borderColor: "rgba(201,74,74,0.35)",
                backgroundColor: "rgba(201,74,74,0.10)",
                borderRadius: 18,
                padding: 12,
              }}
            >
              <Text style={{ color: UI.danger, fontWeight: "900" }}>{stockIntelErr}</Text>
            </Card>
          )}

          {stockIntelRows.length ? (
            <View style={{ gap: 12 }}>
              {stockIntelByBucket.map(({ bucket, rows }) => {
                const accent = getBucketAccent(bucket);

                return (
                  <View
                    key={bucket}
                    style={{
                      borderRadius: 20,
                      borderWidth: 1,
                      borderColor: accent.borderColor,
                      backgroundColor: accent.backgroundColor,
                      padding: 12,
                      gap: 10,
                    }}
                  >
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={{ color: UI.text, fontWeight: "900", fontSize: 14 }}>
                          {getBucketTitle(bucket)}
                        </Text>
                        <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12 }}>
                          {getBucketHint(bucket, scope)}
                        </Text>
                      </View>
                      <Text style={{ color: UI.text, fontWeight: "900" }}>{rows.length}</Text>
                    </View>

                    {rows.length ? (
                      rows.slice(0, 6).map((row, idx) => {
                        const rowStoreName =
                          row.store_id && storesMeta.has(row.store_id)
                            ? storesMeta.get(row.store_id)
                            : "Store";

                        return (
                          <View
                            key={`${bucket}-${row.product_id}-${idx}`}
                            style={{
                              borderRadius: 16,
                              borderWidth: 1,
                              borderColor: "rgba(255,255,255,0.08)",
                              backgroundColor: "rgba(255,255,255,0.04)",
                              padding: 12,
                              gap: 8,
                            }}
                          >
                            <View
                              style={{
                                flexDirection: "row",
                                alignItems: "center",
                                justifyContent: "space-between",
                                gap: 10,
                              }}
                            >
                              <View style={{ flex: 1, minWidth: 0 }}>
                                <Text
                                  style={{ color: UI.text, fontWeight: "900", fontSize: 14 }}
                                  numberOfLines={1}
                                >
                                  {idx + 1}. {row.product_name}
                                </Text>

                                <Text
                                  style={{ color: UI.muted, fontWeight: "800", fontSize: 12 }}
                                  numberOfLines={1}
                                >
                                  SKU: {row.sku ?? "—"}
                                  {row.category ? ` • ${row.category}` : ""}
                                  {scope === "ALL" ? ` • ${rowStoreName}` : ""}
                                </Text>
                              </View>

                              <Text
                                style={{ color: UI.text, fontWeight: "900", fontSize: 12 }}
                                numberOfLines={1}
                              >
                                {row.stock_status || "—"}
                              </Text>
                            </View>

                            <View style={{ flexDirection: "row", gap: 12 }}>
                              <MiniStat label="Qty Sold" value={String(row.qty_sold)} />
                              <MiniStat label="Sales Count" value={String(row.sales_count)} />
                              <MiniStat label="On Hand" value={String(row.stock_on_hand)} />
                            </View>

                            <View style={{ flexDirection: "row", gap: 12 }}>
                              <MiniStat
                                label="Threshold"
                                value={String(row.low_stock_threshold)}
                              />
                              <MiniStat label="Activity" value={row.activity_score.toFixed(1)} />
                              <MiniStat label="Unit" value={row.unit ?? "—"} />
                            </View>
                          </View>
                        );
                      })
                    ) : (
                      <Text style={{ color: UI.muted, fontWeight: "800" }}>
                        No items in this bucket for selected range.
                      </Text>
                    )}
                  </View>
                );
              })}
            </View>
          ) : (
            <Text style={{ color: UI.muted, fontWeight: "800" }}>
              No stock intelligence data yet for this scope and range.
            </Text>
          )}
        </Card>

        <View style={{ height: 12 }} />

        <Card style={{ gap: 12 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ color: UI.text, fontWeight: "900", fontSize: 16 }}>
                Finance Graph
              </Text>
              <Text style={{ color: UI.muted, fontWeight: "800" }} numberOfLines={1}>
                {bucketInfo} • Sales / Expenses / Profit
              </Text>
            </View>
          </View>

          <TrendLegend />

          <TrendChart data={trendRows} fmtShort={fmtShort} showProfit={isOwner} />

          <Text style={{ color: UI.faint, fontWeight: "800", fontSize: 12 }}>
            Profit graph ni Owner-only. Expenses graph inaonekana kwa owner/admin. Profit ikiwa
            negative itaonekana kwa red chini ya zero line.
          </Text>
        </Card>

        {canAll ? (
          <>
            <View style={{ height: 12 }} />

            <Card style={{ gap: 10 }}>
              <Text style={{ color: UI.text, fontWeight: "900", fontSize: 16 }}>
                {comparisonTitle}
              </Text>
              <Text style={{ color: UI.muted, fontWeight: "800" }}>
                Ranking ya stores ndani ya range uliyochagua.
              </Text>

              {comparisonRows.length ? (
                comparisonRows.map((row, idx) => {
                  const value =
                    mode === "EXPENSES"
                      ? fmt(row.expenses)
                      : mode === "PROFIT"
                        ? row.profit == null
                          ? "—"
                          : fmt(row.profit)
                        : fmt(row.sales);

                  const hint =
                    mode === "EXPENSES"
                      ? `${row.orders} orders • Sales ${fmt(row.sales)}`
                      : mode === "PROFIT"
                        ? `Expenses ${fmt(row.expenses)} • ${row.orders} orders`
                        : `Expenses ${fmt(row.expenses)} • ${row.orders} orders`;

                  return (
                    <ComparisonRow
                      key={row.storeId}
                      rank={idx + 1}
                      name={row.storeName}
                      value={value}
                      hint={hint}
                    />
                  );
                })
              ) : (
                <Text style={{ color: UI.muted, fontWeight: "800" }}>No comparison data yet.</Text>
              )}
            </Card>
          </>
        ) : null}

        <View style={{ height: 12 }} />

        <Card style={{ gap: 10 }}>
          <Text style={{ color: UI.text, fontWeight: "900", fontSize: 16 }}>
            Business Health Score
          </Text>
          <Text style={{ color: UI.muted, fontWeight: "800" }}>
            AI CFO style summary kwa kipindi ulichochagua.
          </Text>

          <View
            style={{
              borderRadius: 20,
              borderWidth: 1,
              borderColor:
                health?.label === "EXCELLENT"
                  ? "rgba(16,185,129,0.30)"
                  : health?.label === "GOOD"
                    ? "rgba(42,168,118,0.28)"
                    : health?.label === "WATCH"
                      ? "rgba(245,158,11,0.26)"
                      : "rgba(201,74,74,0.30)",
              backgroundColor:
                health?.label === "EXCELLENT"
                  ? "rgba(16,185,129,0.08)"
                  : health?.label === "GOOD"
                    ? "rgba(42,168,118,0.08)"
                    : health?.label === "WATCH"
                      ? "rgba(245,158,11,0.08)"
                      : "rgba(201,74,74,0.08)",
              padding: 14,
              gap: 10,
            }}
          >
            <View style={{ flexDirection: "row", gap: 12 }}>
              <MiniStat label="Health" value={health?.label ?? "—"} />
              <MiniStat label="Score" value={health ? `${health.score}/100` : "—"} />
              <MiniStat label="Sales Trend" value={health?.salesTrend ?? "—"} />
            </View>

            <View style={{ flexDirection: "row", gap: 12 }}>
              <MiniStat label="Profit Margin" value={percent(health?.profitMargin ?? null)} />
              <MiniStat label="Expenses Ratio" value={percent(health?.expensesRatio ?? null)} />
              <View style={{ flex: 1 }} />
            </View>

            <Text style={{ color: UI.text, fontWeight: "800" }}>
              {health?.message ?? "No health summary yet."}
            </Text>
          </View>
        </Card>

        <View style={{ height: 18 }} />

        <Pressable
          onPress={() => {
            Alert.alert(
              "How it works",
              "TOTAL RECEIPTS: Sales total (ina include Credit).\n\nPAYMENT BREAKDOWN: inaonyesha cash/mobile/bank zilizobaki baada ya kuondoa expenses za channel hiyo, pamoja na Credit (Balance) ambayo bado haijalipwa.\n\nEXPENSES BY PAYMENT CHANNEL: inaonyesha expense ilitoka wapi hasa (Cash / Mobile / Bank / Other).\n\nCREDIT COLLECTIONS: ni malipo ya madeni yaliyopokelewa ndani ya date range.\n\nTOTAL MONEY IN: (Sales PAID + Credit Collections) - Expenses za channel husika. Credit balance haijumuishwi.\n\nGROSS PROFIT: faida kabla ya kuondoa store-level expenses.\n\nNET PROFIT: faida baada ya kuondoa COGS na expenses zote za kipindi.\n\nPRODUCT INTELLIGENCE: inaonyesha gross profit ya bidhaa moja moja; haiigawi store-level expenses kwa bidhaa moja moja.\n\nAI ACTIONABLE INSIGHTS: inaweka ushauri wa moja kwa moja kutoka kwenye Sales, Stock Intelligence, Product Profit, Store Comparison, Health Score, Forecast Engine, na Cashflow Prediction.\n\nAI FORECAST ENGINE: ina-project kipindi kijacho kwa kutumia trend ya date range uliyochagua, pamoja na stockout risk na urgent restock counts.\n\nAI CASHFLOW PREDICTION: inaonyesha projected cash-in, projected paid orders, avg cash/day, na confidence ya signal.\n\nSTOCK INTELLIGENCE: inaonyesha fast moving, slow moving, dead stock, na low stock kwa STORE au ALL scope.\n\nBUSINESS HEALTH SCORE: ni summary ya margin, expense ratio, na sales trend kwa kipindi ulichochagua."
            );
          }}
          style={({ pressed }) => ({ opacity: pressed ? 0.92 : 1, alignSelf: "flex-start" })}
        >
          <Text style={{ color: UI.faint, fontWeight: "900" }}>💡 How it works</Text>
        </Pressable>

        <View style={{ height: 30 }} />
      </ScrollView>
    </Screen>
  );
}