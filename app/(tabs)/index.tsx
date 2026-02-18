// app/(tabs)/index.tsx
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useOrg } from "../../src/context/OrgContext";
import { supabase } from "../../src/supabase/supabaseClient";
import { Button } from "../../src/ui/Button";
import { Card } from "../../src/ui/Card";
import { Screen } from "../../src/ui/Screen";
import { StoreGuard } from "../../src/ui/StoreGuard";
import { UI } from "../../src/ui/theme";

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

function fmtMoney(n: number, currency?: string | null) {
  const c = String(currency || "TZS").trim() || "TZS";
  try {
    // NOTE: Intl wakati mwingine huweka space ya ajabu; tuta-normalize chini
    return new Intl.NumberFormat("en-TZ", {
      style: "currency",
      currency: c,
      maximumFractionDigits: 0,
    }).format(Number(n) || 0);
  } catch {
    return `${c} ${String(Math.round(Number(n) || 0))}`;
  }
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

/**
 * ✅ SUPER SAFE NORMALIZER:
 * DB function versions sometimes return different column names.
 * This maps v2/v3/v4 shapes into the UI shape we already use.
 */
function normalizeDash(
  raw: any,
  fallbackFrom: string,
  fallbackTo: string,
  storeId: string
): DashRow {
  const store_id = String(raw?.store_id ?? raw?.p_store_id ?? storeId ?? "").trim();

  const from_ts = String(
    raw?.from_ts ?? raw?.date_from ?? raw?.p_from ?? fallbackFrom ?? ""
  ).trim();
  const to_ts = String(raw?.to_ts ?? raw?.date_to ?? raw?.p_to ?? fallbackTo ?? "").trim();

  const currency = String(raw?.currency ?? "TZS").trim() || "TZS";

  // Revenue/orders: v4 uses revenue_amount + revenue_orders
  const revenue = toNum(raw?.revenue ?? raw?.revenue_amount ?? 0);
  const delivered_orders = toInt(raw?.delivered_orders ?? raw?.revenue_orders ?? 0);

  // Counts: v4 uses pending/confirmed/ready/cancelled (no suffix)
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
    // ✅ FIX: minWidth:0 + numberOfLines => pesa hazivunjiki mstari
    <View style={{ flex: 1, gap: 4, minWidth: 0 }}>
      <Text
        style={{ color: UI.muted, fontWeight: "800", fontSize: 12 }}
        numberOfLines={1}
        ellipsizeMode="tail"
      >
        {label}
      </Text>
      <Text
        style={{ color: UI.text, fontWeight: "900", fontSize: 16 }}
        numberOfLines={1}
        ellipsizeMode="tail"
      >
        {value}
      </Text>
      {!!hint && (
        <Text
          style={{ color: UI.faint, fontWeight: "800", fontSize: 12 }}
          numberOfLines={1}
          ellipsizeMode="tail"
        >
          {hint}
        </Text>
      )}
    </View>
  );
}

function CompactClubRevenueCard({ onOpen }: { onOpen: () => void }) {
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

  const load = useCallback(async () => {
    if (!storeId) {
      setErr("No active store selected");
      setRow(null);
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
    } catch (e: any) {
      setErr(e?.message ?? "Failed to load club revenue");
      setRow(null);
    } finally {
      setLoading(false);
    }
  }, [range, storeId]);

  useEffect(() => {
    void load();
  }, [load]);

  const currency = row?.currency || "TZS";

  // ✅ Normalize spaces to reduce weird wrapping
  const revenue = fmtMoney(toNum(row?.revenue), currency).replace(/\s+/g, " ");
  const paid = fmtMoney(toNum(row?.paid_revenue), currency).replace(/\s+/g, " ");

  const Pill = ({ k, label }: { k: RangeKey; label: string }) => {
    const active = range === k;
    return (
      <Pressable
        onPress={() => setRange(k)}
        hitSlop={10}
        style={({ pressed }) => ({
          flex: 1,
          height: 38,
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
    <View style={{ paddingTop: 10 }}>
      <Pressable
        onPress={onOpen}
        style={({ pressed }) => ({
          opacity: pressed ? 0.96 : 1,
          transform: pressed ? [{ scale: 0.998 }] : [{ scale: 1 }],
        })}
      >
        <Card style={{ gap: 10 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ color: UI.text, fontWeight: "900", fontSize: 16 }}>
                Club Revenue
              </Text>
              <Text
                style={{ color: UI.muted, fontWeight: "700", marginTop: 2 }}
                numberOfLines={1}
              >
                Store: {storeName}
              </Text>
            </View>

            <Pressable
              onPress={(e) => {
                e.stopPropagation();
                load();
              }}
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
              <Text style={{ color: UI.text, fontWeight: "900" }}>
                {loading ? "..." : "Reload"}
              </Text>
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

          <View style={{ flexDirection: "row", gap: 12, paddingTop: 2 }}>
            <MiniStat label="Revenue" value={revenue} />
            <MiniStat label="Paid" value={paid} />
            <MiniStat
              label="Orders"
              value={String(row?.delivered_orders ?? 0)}
              hint="delivered"
            />
          </View>

          <View
            style={{
              height: 1,
              backgroundColor: "rgba(255,255,255,0.08)",
              marginTop: 4,
            }}
          />

          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <Text style={{ color: UI.muted, fontWeight: "800" }}>
              Tap to view full dashboard
            </Text>
            <View style={{ flex: 1 }} />
            {loading ? (
              <ActivityIndicator />
            ) : (
              <Text style={{ color: UI.muted, fontWeight: "900", fontSize: 18 }}>›</Text>
            )}
          </View>
        </Card>
      </Pressable>
    </View>
  );
}

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const { loading, refreshing, error, refresh, activeOrgName, activeRole, activeStoreName } =
    useOrg();

  const [dashTick, setDashTick] = useState(0);
  const [pulling, setPulling] = useState(false);

  const onLogout = useCallback(async () => {
    try {
      const { error: e } = await supabase.auth.signOut();
      if (e) throw e;
    } catch (err: any) {
      Alert.alert("Logout failed", err?.message ?? "Unknown error");
    }
  }, []);

  const goStaff = useCallback(() => {
    router.push("/(tabs)/staff");
  }, [router]);

  const goOrgSwitcher = useCallback(() => {
    router.push("/org-switcher");
  }, [router]);

  const goClubRevenue = useCallback(() => {
    router.push("/club-revenue");
  }, [router]);

  const bottomPad = useMemo(() => Math.max(insets.bottom, 8) + 12, [insets.bottom]);

  // ✅ Permanent rule: push header down to keep status icons visible
  const topPad = useMemo(() => Math.max(insets.top, 10) + 8, [insets.top]);

  const onPullRefresh = useCallback(async () => {
    setPulling(true);
    try {
      await Promise.resolve(refresh());
      setDashTick((x) => x + 1);
    } finally {
      setPulling(false);
    }
  }, [refresh]);

  return (
    <Screen>
      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={pulling || refreshing}
            onRefresh={onPullRefresh}
            tintColor={UI.text}
          />
        }
        contentContainerStyle={{
          paddingTop: topPad,
          paddingHorizontal: 16,
          paddingBottom: bottomPad,
        }}
      >
        <Text style={{ fontSize: 28, fontWeight: "900", color: UI.text }}>ZETRA BMS</Text>

        <Text style={{ color: UI.muted, fontWeight: "700", marginTop: 2 }}>Dashboard</Text>

        {/* ✅ CLUB: compact preview card. Tap => full page */}
        <StoreGuard>
          <CompactClubRevenueCard key={`club-mini-${dashTick}`} onOpen={goClubRevenue} />
        </StoreGuard>

        {!!error && (
          <Card
            style={{
              borderColor: "rgba(201,74,74,0.35)",
              backgroundColor: "rgba(201,74,74,0.10)",
              borderRadius: 18,
              padding: 12,
              marginTop: 12,
            }}
          >
            <Text style={{ color: UI.danger, fontWeight: "900" }}>{error}</Text>
          </Card>
        )}

        <StoreGuard>
          <View style={{ height: 14 }} />

          <Card style={{ gap: 10 }}>
            <Text style={{ color: UI.muted, fontWeight: "800" }}>Active</Text>

            <Pressable
              onPress={goOrgSwitcher}
              hitSlop={10}
              style={({ pressed }) => ({
                opacity: pressed ? 0.92 : 1,
                transform: pressed ? [{ scale: 0.998 }] : [{ scale: 1 }],
              })}
            >
              <Text style={{ color: UI.faint, fontWeight: "800" }}>
                Org:{" "}
                <Text style={{ color: UI.text, fontWeight: "900" }}>
                  {activeOrgName ?? "—"}
                </Text>
                <Text style={{ color: UI.muted, fontWeight: "900" }}>  ›</Text>
              </Text>
            </Pressable>

            <Text style={{ color: UI.faint, fontWeight: "800" }}>
              Role:{" "}
              <Text style={{ color: UI.text, fontWeight: "900" }}>{activeRole ?? "—"}</Text>
            </Text>

            <Text style={{ color: UI.faint, fontWeight: "800" }}>
              Store:{" "}
              <Text style={{ color: UI.text, fontWeight: "900" }}>
                {activeStoreName ?? "—"}
              </Text>
            </Text>
          </Card>

          <View style={{ height: 14 }} />

          <Text style={{ color: UI.muted, fontWeight: "800", marginBottom: 8 }}>Actions</Text>

          <Button
            title={loading ? "Loading..." : refreshing ? "Refreshing..." : "Refresh"}
            onPress={() => {
              refresh();
              setDashTick((x) => x + 1);
            }}
            disabled={loading || refreshing}
            variant="primary"
          />

          <View style={{ height: 10 }} />

          <Pressable
            onPress={goStaff}
            style={({ pressed }) => [
              {
                opacity: pressed ? 0.92 : 1,
                transform: pressed ? [{ scale: 0.995 }] : [{ scale: 1 }],
              },
            ]}
          >
            <Card
              style={{
                paddingVertical: 14,
                paddingHorizontal: 16,
                borderRadius: 18,
                borderColor: "rgba(42,168,118,0.22)",
                backgroundColor: "rgba(23,27,33,0.92)",
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: UI.text, fontWeight: "900", fontSize: 16 }}>
                    Staff Management
                  </Text>
                  <Text style={{ color: UI.muted, fontWeight: "700", marginTop: 2 }}>
                    Add staff and assign stores
                  </Text>
                </View>

                <Text style={{ color: UI.muted, fontWeight: "900", fontSize: 18 }}>›</Text>
              </View>
            </Card>
          </Pressable>

          <View style={{ height: 14 }} />

          <Button
            title="Logout"
            onPress={onLogout}
            variant="secondary"
            style={{
              borderColor: "rgba(201,74,74,0.28)",
              backgroundColor: "rgba(201,74,74,0.06)",
            }}
          />
        </StoreGuard>
      </ScrollView>
    </Screen>
  );
}