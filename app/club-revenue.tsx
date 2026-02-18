// app/club-revenue.tsx
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
    ActivityIndicator,
    Pressable,
    ScrollView,
    Text,
    View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useOrg } from "../src/context/OrgContext";
import { supabase } from "../src/supabase/supabaseClient";
import { Card } from "../src/ui/Card";
import { Screen } from "../src/ui/Screen";
import { StoreGuard } from "../src/ui/StoreGuard";
import { UI } from "../src/ui/theme";

type RangeKey = "today" | "7d" | "30d";
type MoneyBreak = { revenue: number; orders: number };
type JsonBreak = Record<string, MoneyBreak>;

type DashRow = {
  store_id: string;
  from_ts: string;
  to_ts: string;
  currency: string;

  revenue: number;
  delivered_orders: number;

  total_orders: number;
  pending_orders: number;
  confirmed_orders: number;
  ready_orders: number;
  cancelled_orders: number;

  avg_order_value: number;

  paid_revenue: number;
  awaiting_revenue: number;
  paid_orders: number;
  awaiting_orders: number;

  by_method: JsonBreak | null;
  by_channel: JsonBreak | null;
};

type TopProduct = {
  product_id: string;
  product_name: string | null;
  qty: number;
  revenue: number;
};

type TopPost = {
  post_id: string;
  post_caption: string | null;
  orders: number;
  revenue: number;
};

function fmtMoney(n: number, currency?: string | null) {
  const c = String(currency || "TZS").trim() || "TZS";
  try {
    return new Intl.NumberFormat("en-TZ", {
      style: "currency",
      currency: c,
      maximumFractionDigits: 0,
    }).format(Number(n) || 0);
  } catch {
    return `${c} ${String(Math.round(Number(n) || 0))}`;
  }
}

function pct(n: number) {
  const x = Number.isFinite(n) ? n : 0;
  return `${Math.round(x * 100)}%`;
}

function rangeToFromTo(k: RangeKey) {
  const now = new Date();
  const to = now;
  const from = new Date(now);

  if (k === "today") {
    from.setHours(0, 0, 0, 0);
  } else if (k === "7d") {
    from.setDate(from.getDate() - 7);
  } else {
    from.setDate(from.getDate() - 30);
  }

  return { from: from.toISOString(), to: to.toISOString() };
}

function toNum(x: any) {
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
}

function toInt(x: any) {
  const n = Number(x);
  if (!Number.isFinite(n)) return 0;
  return Math.trunc(n);
}

function normalizeBreak(obj: any): JsonBreak | null {
  if (!obj || typeof obj !== "object") return null;
  const out: JsonBreak = {};
  for (const [k, v] of Object.entries(obj)) {
    const revenue = toNum((v as any)?.revenue);
    const orders = toInt((v as any)?.orders);
    out[String(k)] = { revenue, orders };
  }
  return out;
}

function normalizeDash(raw: any, fallbackFrom: string, fallbackTo: string, storeId: string): DashRow {
  const store_id = String(raw?.store_id ?? raw?.p_store_id ?? storeId ?? "").trim();

  const from_ts = String(raw?.from_ts ?? raw?.date_from ?? raw?.p_from ?? fallbackFrom ?? "").trim();
  const to_ts = String(raw?.to_ts ?? raw?.date_to ?? raw?.p_to ?? fallbackTo ?? "").trim();

  const currency = String(raw?.currency ?? "TZS").trim() || "TZS";

  const revenue = toNum(raw?.revenue ?? raw?.revenue_amount ?? 0);
  const delivered_orders = toInt(raw?.delivered_orders ?? raw?.revenue_orders ?? 0);

  const total_orders = toInt(raw?.total_orders ?? raw?.total ?? 0);
  const pending_orders = toInt(raw?.pending_orders ?? raw?.pending ?? 0);
  const confirmed_orders = toInt(raw?.confirmed_orders ?? raw?.confirmed ?? 0);
  const ready_orders = toInt(raw?.ready_orders ?? raw?.ready ?? 0);
  const cancelled_orders = toInt(raw?.cancelled_orders ?? raw?.cancelled ?? 0);

  const avg_order_value = toNum(raw?.avg_order_value ?? 0);

  const paid_revenue = toNum(raw?.paid_revenue ?? 0);
  const awaiting_revenue = toNum(raw?.awaiting_revenue ?? 0);
  const paid_orders = toInt(raw?.paid_orders ?? 0);
  const awaiting_orders = toInt(raw?.awaiting_orders ?? 0);

  const by_method = normalizeBreak(raw?.by_method);
  const by_channel = normalizeBreak(raw?.by_channel);

  return {
    store_id,
    from_ts,
    to_ts,
    currency,
    revenue,
    delivered_orders,
    total_orders,
    pending_orders,
    confirmed_orders,
    ready_orders,
    cancelled_orders,
    avg_order_value,
    paid_revenue,
    awaiting_revenue,
    paid_orders,
    awaiting_orders,
    by_method,
    by_channel,
  };
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 14 }}>
      <Text style={{ color: UI.muted, fontWeight: "800" }}>{label}</Text>
      <Text style={{ color: UI.text, fontWeight: "900" }}>{value}</Text>
    </View>
  );
}

function Divider() {
  return (
    <View
      style={{
        height: 1,
        backgroundColor: "rgba(255,255,255,0.08)",
        marginVertical: 6,
      }}
    />
  );
}

function MiniStat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <View style={{ flex: 1, gap: 4 }}>
      <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12 }}>{label}</Text>
      <Text style={{ color: UI.text, fontWeight: "900", fontSize: 16 }}>{value}</Text>
      {!!hint && (
        <Text style={{ color: UI.faint, fontWeight: "800", fontSize: 12 }}>{hint}</Text>
      )}
    </View>
  );
}

function BreakList({
  title,
  currency,
  data,
}: {
  title: string;
  currency: string;
  data: JsonBreak | null | undefined;
}) {
  const entries = useMemo(() => {
    const obj = data ?? {};
    return Object.entries(obj)
      .map(([k, v]) => ({
        k,
        revenue: Number((v as any)?.revenue ?? 0),
        orders: Number((v as any)?.orders ?? 0),
      }))
      .sort((a, b) => b.revenue - a.revenue);
  }, [data]);

  if (!entries.length) return null;

  return (
    <View style={{ gap: 8, marginTop: 10 }}>
      <Text style={{ color: UI.muted, fontWeight: "900" }}>{title}</Text>
      {entries.slice(0, 6).map((e) => (
        <View
          key={e.k}
          style={{ flexDirection: "row", justifyContent: "space-between", gap: 12 }}
        >
          <Text style={{ color: UI.text, fontWeight: "800", flex: 1 }} numberOfLines={1}>
            {e.k}
          </Text>
          <Text style={{ color: UI.muted, fontWeight: "900" }}>
            {fmtMoney(e.revenue, currency)} • {e.orders}
          </Text>
        </View>
      ))}
    </View>
  );
}

function ClubRevenueFullCard() {
  const orgAny = useOrg() as any;

  const storeId: string = String(
    orgAny?.activeStoreId ??
      orgAny?.activeStore?.id ??
      orgAny?.selectedStoreId ??
      orgAny?.selectedStore?.id ??
      ""
  ).trim();

  const storeName: string =
    String(orgAny?.activeStoreName ?? orgAny?.activeStore?.name ?? "Store").trim() ||
    "Store";

  const [range, setRange] = useState<RangeKey>("today");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [row, setRow] = useState<DashRow | null>(null);
  const [topProducts, setTopProducts] = useState<TopProduct[]>([]);
  const [topPosts, setTopPosts] = useState<TopPost[]>([]);

  const load = useCallback(async () => {
    if (!storeId) {
      setErr("No active store selected");
      setRow(null);
      setTopProducts([]);
      setTopPosts([]);
      return;
    }

    setLoading(true);
    setErr(null);

    try {
      const { from, to } = rangeToFromTo(range);

      const { data: d1, error: e1 } = await supabase.rpc(
        "get_club_revenue_dashboard_v4",
        { p_store_id: storeId, p_from: from, p_to: to } as any
      );
      if (e1) throw e1;

      const raw = (Array.isArray(d1) ? d1[0] : d1) as any;
      setRow(raw ? normalizeDash(raw, from, to, storeId) : null);

      const { data: d2, error: e2 } = await supabase.rpc("get_club_top_products_v1", {
        p_store_id: storeId,
        p_from: from,
        p_to: to,
        p_limit: 5,
      });
      if (e2) throw e2;
      setTopProducts((Array.isArray(d2) ? d2 : []) as any);

      const { data: d3, error: e3 } = await supabase.rpc("get_club_top_posts_v1", {
        p_store_id: storeId,
        p_from: from,
        p_to: to,
        p_limit: 5,
      });
      if (e3) throw e3;
      setTopPosts((Array.isArray(d3) ? d3 : []) as any);
    } catch (e: any) {
      setErr(e?.message ?? "Failed to load club revenue dashboard");
      setRow(null);
      setTopProducts([]);
      setTopPosts([]);
    } finally {
      setLoading(false);
    }
  }, [range, storeId]);

  useEffect(() => {
    void load();
  }, [load]);

  const currency = row?.currency || "TZS";

  const delivered = Number(row?.delivered_orders ?? 0);
  const total = Number(row?.total_orders ?? 0);
  const pending = Number(row?.pending_orders ?? 0);

  const conversion = total > 0 ? delivered / total : 0;
  const pendingRisk =
    pending >= 10 ? "HIGH" : pending >= 4 ? "MEDIUM" : pending > 0 ? "LOW" : "OK";

  const Pill = ({ k, label }: { k: RangeKey; label: string }) => {
    const active = range === k;
    return (
      <Pressable
        onPress={() => setRange(k)}
        hitSlop={10}
        style={({ pressed }) => ({
          flex: 1,
          height: 42,
          borderRadius: 999,
          borderWidth: 1,
          borderColor: active ? "rgba(42,168,118,0.35)" : "rgba(255,255,255,0.12)",
          backgroundColor: active ? "rgba(42,168,118,0.10)" : "rgba(255,255,255,0.06)",
          alignItems: "center",
          justifyContent: "center",
          opacity: pressed ? 0.92 : 1,
        })}
      >
        <Text style={{ color: UI.text, fontWeight: "900" }}>{label}</Text>
      </Pressable>
    );
  };

  return (
    <Card style={{ gap: 12 }}>
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: UI.text, fontWeight: "900", fontSize: 16 }}>
            Club Revenue Dashboard
          </Text>
          <Text style={{ color: UI.muted, fontWeight: "700", marginTop: 2 }}>
            Store: {storeName}
          </Text>
        </View>

        <Pressable
          onPress={load}
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
          <Text style={{ color: UI.text, fontWeight: "900" }}>{loading ? "..." : "Reload"}</Text>
        </Pressable>
      </View>

      <View style={{ flexDirection: "row", gap: 10 }}>
        <Pill k="today" label="Today" />
        <Pill k="7d" label="7 Days" />
        <Pill k="30d" label="30 Days" />
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

      {/* A) Quick KPIs */}
      <View style={{ flexDirection: "row", gap: 12, paddingTop: 4 }}>
        <MiniStat label="Conversion" value={pct(conversion)} hint={`${delivered}/${total} delivered`} />
        <MiniStat label="Pending risk" value={pendingRisk} hint={`${pending} pending`} />
        <MiniStat
          label="Paid orders"
          value={String(row?.paid_orders ?? 0)}
          hint={fmtMoney(Number(row?.paid_revenue ?? 0), currency)}
        />
      </View>

      <Divider />

      {/* Base rows */}
      <View style={{ gap: 8 }}>
        <Row label="Revenue (DELIVERED)" value={fmtMoney(Number(row?.revenue || 0), currency)} />
        <Row label="Delivered orders" value={String(row?.delivered_orders ?? 0)} />
        <Divider />
        <Row label="Total orders" value={String(row?.total_orders ?? 0)} />
        <Row label="Pending" value={String(row?.pending_orders ?? 0)} />
        <Row label="Confirmed" value={String(row?.confirmed_orders ?? 0)} />
        <Row label="Ready" value={String(row?.ready_orders ?? 0)} />
        <Row label="Cancelled" value={String(row?.cancelled_orders ?? 0)} />
        <Divider />
        <Row label="Avg order value" value={fmtMoney(Number(row?.avg_order_value || 0), currency)} />
      </View>

      {/* B) Payment breakdown */}
      <Divider />
      <Text style={{ color: UI.text, fontWeight: "900" }}>Payments (DELIVERED)</Text>
      <View style={{ gap: 8 }}>
        <Row label="Paid revenue" value={fmtMoney(Number(row?.paid_revenue ?? 0), currency)} />
        <Row
          label="Awaiting revenue"
          value={fmtMoney(Number(row?.awaiting_revenue ?? 0), currency)}
        />
        <Row label="Paid orders" value={String(row?.paid_orders ?? 0)} />
        <Row label="Awaiting orders" value={String(row?.awaiting_orders ?? 0)} />
      </View>

      <BreakList title="By method" currency={currency} data={row?.by_method ?? {}} />
      <BreakList title="By channel" currency={currency} data={row?.by_channel ?? {}} />

      {/* C) Top lists */}
      <Divider />
      <Text style={{ color: UI.text, fontWeight: "900" }}>Top products</Text>
      {topProducts.length ? (
        <View style={{ gap: 8 }}>
          {topProducts.map((p) => (
            <View
              key={p.product_id}
              style={{ flexDirection: "row", justifyContent: "space-between", gap: 12 }}
            >
              <Text style={{ color: UI.text, fontWeight: "800", flex: 1 }} numberOfLines={1}>
                {p.product_name ?? "Unknown product"}
              </Text>
              <Text style={{ color: UI.muted, fontWeight: "900" }}>
                {fmtMoney(Number(p.revenue || 0), currency)} • {Number(p.qty || 0)}
              </Text>
            </View>
          ))}
        </View>
      ) : (
        <Text style={{ color: UI.muted, fontWeight: "800" }}>No data</Text>
      )}

      <View style={{ height: 10 }} />

      <Text style={{ color: UI.text, fontWeight: "900" }}>Top posts</Text>
      {topPosts.length ? (
        <View style={{ gap: 8 }}>
          {topPosts.map((p) => (
            <View
              key={p.post_id}
              style={{ flexDirection: "row", justifyContent: "space-between", gap: 12 }}
            >
              <Text style={{ color: UI.text, fontWeight: "800", flex: 1 }} numberOfLines={1}>
                {p.post_caption ?? "Post"}
              </Text>
              <Text style={{ color: UI.muted, fontWeight: "900" }}>
                {fmtMoney(Number(p.revenue || 0), currency)} • {Number(p.orders || 0)}
              </Text>
            </View>
          ))}
        </View>
      ) : (
        <Text style={{ color: UI.muted, fontWeight: "800" }}>No data</Text>
      )}

      {loading && (
        <View style={{ paddingTop: 8, alignItems: "center" }}>
          <ActivityIndicator />
          <Text style={{ color: UI.muted, fontWeight: "800", marginTop: 8 }}>Loading...</Text>
        </View>
      )}
    </Card>
  );
}

export default function ClubRevenueScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const topPad = useMemo(() => Math.max(insets.top, 10) + 8, [insets.top]);

  return (
    <StoreGuard>
      <Screen>
        <ScrollView
          style={{ flex: 1 }}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            paddingTop: topPad,
            paddingHorizontal: 16,
            paddingBottom: 18,
          }}
        >
          {/* Header */}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 12 }}>
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
              <Text style={{ color: UI.text, fontWeight: "900" }}>‹ Back</Text>
            </Pressable>

            <View style={{ flex: 1 }}>
              <Text style={{ color: UI.text, fontWeight: "900", fontSize: 18 }}>
                Club Revenue
              </Text>
              <Text style={{ color: UI.muted, fontWeight: "700", marginTop: 2 }}>
                Full dashboard
              </Text>
            </View>
          </View>

          <ClubRevenueFullCard />
        </ScrollView>
      </Screen>
    </StoreGuard>
  );
}