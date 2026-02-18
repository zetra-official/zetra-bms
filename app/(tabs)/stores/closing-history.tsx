// app/(tabs)/stores/closing-history.tsx
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useFocusEffect } from "@react-navigation/native";
import { useRouter } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    FlatList,
    Pressable,
    Text,
    View,
} from "react-native";
import { useOrg } from "../../../src/context/OrgContext";
import { supabase } from "../../../src/supabase/supabaseClient";
import { Button } from "../../../src/ui/Button";
import { Card } from "../../../src/ui/Card";
import { Screen } from "../../../src/ui/Screen";
import { theme } from "../../../src/ui/theme";

// ✅ local YYYY-MM-DD (avoid UTC off-by-one)
function localYMD(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function fromYMD(s: string) {
  const [y, m, d] = s.split("-").map((x) => Number(x));
  return new Date(y, (m ?? 1) - 1, d ?? 1, 12, 0, 0, 0);
}
function fmtInt(n: number) {
  try {
    return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(
      n
    );
  } catch {
    return String(n);
  }
}
function addDaysYMD(dateStr: string, delta: number) {
  const d = fromYMD(dateStr);
  d.setDate(d.getDate() + delta);
  return localYMD(d);
}
function monthRangeFromDateStr(dateStr: string) {
  const d = fromYMD(dateStr);
  const start = new Date(d.getFullYear(), d.getMonth(), 1, 12, 0, 0, 0);
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 0, 12, 0, 0, 0);
  return { start: localYMD(start), end: localYMD(end) };
}

type ClosingSummaryRow = {
  date: string;
  store_id: string;
  opening_qty_total: number;
  closing_qty_total: number;
  in_qty_total: number;
  out_qty_total: number;
  net_change: number;
};

type FilterMode = "7d" | "month" | "all";

type HistoryItem = {
  date: string;
  locked: boolean;
  summary: ClosingSummaryRow | null;
};

export default function ClosingHistoryScreen() {
  const router = useRouter();
  const tabBarHeight = useBottomTabBarHeight(); // ✅ dynamic bottom tabs height

  const { activeOrgName, activeRole, activeStoreId, activeStoreName } = useOrg();

  const [filter, setFilter] = useState<FilterMode>("7d");
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  const isOwnerOrAdmin = useMemo(() => {
    const r = (activeRole ?? "staff") as "owner" | "admin" | "staff";
    return r === "owner" || r === "admin";
  }, [activeRole]);

  const roleLabel = activeRole ?? "—";

  const dateRange = useMemo(() => {
    const today = localYMD();
    if (filter === "7d") return { start: addDaysYMD(today, -6), end: today };
    if (filter === "month") return monthRangeFromDateStr(today);
    // all: keep it reasonable in UI (last 90 days)
    return { start: addDaysYMD(today, -89), end: today };
  }, [filter]);

  const chipStyle = useCallback(
    (active: boolean) => ({
      flex: 1,
      borderWidth: 1,
      borderColor: active ? theme.colors.emeraldBorder : theme.colors.border,
      borderRadius: theme.radius.pill,
      paddingHorizontal: 12,
      paddingVertical: 12,
      backgroundColor: active ? "rgba(52,211,153,0.10)" : theme.colors.card,
      alignItems: "center" as const,
      justifyContent: "center" as const,
    }),
    []
  );

  const chipTextStyle = useCallback(
    (active: boolean) => ({
      color: theme.colors.text,
      fontWeight: "900" as const,
      opacity: active ? 1 : 0.9,
    }),
    []
  );

  const loadHistory = useCallback(async () => {
    if (!activeStoreId) {
      setItems([]);
      setError("No active store selected.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { start, end } = dateRange;

      // STEP 1: candidate dates from snapshots
      const { data: snapRows, error: snapErr } = await supabase
        .from("inventory_daily_snapshots")
        .select("snapshot_date")
        .eq("store_id", activeStoreId)
        .gte("snapshot_date", start)
        .lte("snapshot_date", end)
        .order("snapshot_date", { ascending: false })
        .limit(500);

      if (snapErr) throw snapErr;

      const uniqDates = Array.from(
        new Set((snapRows ?? []).map((r: any) => String(r.snapshot_date)))
      ).sort((a, b) => (a < b ? 1 : -1));

      if (uniqDates.length === 0) {
        setItems([]);
        setError(null);
        return;
      }

      // STEP 2: lock dates (best-effort)
      const { data: lockRows, error: lockErr } = await supabase
        .from("closing_locks")
        .select("lock_date, lock_type")
        .eq("store_id", activeStoreId)
        .in("lock_date", uniqDates);

      // if lockErr -> ignore (table may be protected)
      const lockedSet = new Set(
        (lockRows ?? [])
          .filter((r: any) => !r.lock_type || String(r.lock_type) === "daily")
          .map((r: any) => String(r.lock_date))
      );

      // STEP 3: summaries via RPC (cap)
      const capDates = uniqDates.slice(0, 45);

      const results: HistoryItem[] = [];
      for (const d of capDates) {
        try {
          const { data, error: e } = await supabase.rpc(
            "get_daily_closing_summary",
            {
              p_store_id: activeStoreId,
              p_date: d,
            }
          );
          if (e) throw e;

          const row = Array.isArray(data) ? data[0] : data;
          const summary: ClosingSummaryRow | null = row
            ? {
                date: d,
                store_id: row.store_id ?? activeStoreId,
                opening_qty_total: Number(row.opening_qty_total ?? 0),
                closing_qty_total: Number(row.closing_qty_total ?? 0),
                in_qty_total: Number(row.in_qty_total ?? 0),
                out_qty_total: Number(row.out_qty_total ?? 0),
                net_change: Number(row.net_change ?? 0),
              }
            : null;

          results.push({
            date: d,
            locked: lockedSet.has(d),
            summary,
          });
        } catch {
          results.push({
            date: d,
            locked: lockedSet.has(d),
            summary: null,
          });
        }
      }

      setItems(results);

      // if lockErr happened, we still showed list; optionally keep silent
      void lockErr;
    } catch (e: any) {
      const msg = e?.message ?? "Failed to load closing history";
      setError(msg);
      setItems([]);

      if (
        String(msg).toLowerCase().includes("permission") ||
        String(msg).toLowerCase().includes("rls")
      ) {
        Alert.alert(
          "History blocked",
          "Inaonekana RLS imekataa kusoma snapshot dates. Hii ni sawa. Tukiamua, tutaongeza RPC salama ya “list_snapshot_dates” bila kuharibu lock."
        );
      }
    } finally {
      setLoading(false);
    }
  }, [activeStoreId, dateRange]);

  // refresh when screen opens / returns
  useFocusEffect(
    useCallback(() => {
      loadHistory();
    }, [loadHistory])
  );

  const renderItem = useCallback(({ item }: { item: HistoryItem }) => {
    const s = item.summary;
    const net = s?.net_change ?? 0;
    const netPositive = net >= 0;

    return (
      <Pressable
        onPress={() => {
          const msg = s
            ? `Date: ${item.date}\nLocked: ${
                item.locked ? "YES" : "NO"
              }\nOpening: ${fmtInt(s.opening_qty_total)}\nIN: ${fmtInt(
                s.in_qty_total
              )}\nOUT: ${fmtInt(s.out_qty_total)}\nClosing: ${fmtInt(
                s.closing_qty_total
              )}\nNet: ${netPositive ? "+" : ""}${fmtInt(net)}`
            : `Date: ${item.date}\nLocked: ${
                item.locked ? "YES" : "NO"
              }\n\nSummary haikupatikana (RPC error au data haipo).`;
          Alert.alert("Closing Summary", msg);
        }}
      >
        <Card style={{ gap: 10 }}>
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              gap: 10,
            }}
          >
            <Text
              style={{
                color: theme.colors.text,
                fontWeight: "900",
                fontSize: 16,
              }}
            >
              {item.date}
            </Text>

            <View
              style={{
                borderWidth: 1,
                borderColor: item.locked
                  ? "rgba(52,211,153,0.35)"
                  : theme.colors.border,
                backgroundColor: item.locked
                  ? "rgba(52,211,153,0.10)"
                  : theme.colors.card,
                borderRadius: theme.radius.pill,
                paddingHorizontal: 10,
                paddingVertical: 6,
              }}
            >
              <Text
                style={{
                  color: item.locked ? theme.colors.emerald : theme.colors.muted,
                  fontWeight: "900",
                }}
              >
                {item.locked ? "LOCKED ✅" : "UNLOCKED"}
              </Text>
            </View>
          </View>

          {!s ? (
            <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>
              Summary haipo (tap kuona details ya error state).
            </Text>
          ) : (
            <>
              <View
                style={{ flexDirection: "row", justifyContent: "space-between" }}
              >
                <Text style={{ color: theme.colors.muted, fontWeight: "900" }}>
                  Opening
                </Text>
                <Text style={{ color: theme.colors.text, fontWeight: "900" }}>
                  {fmtInt(s.opening_qty_total)}
                </Text>
              </View>

              <View
                style={{ flexDirection: "row", justifyContent: "space-between" }}
              >
                <Text style={{ color: theme.colors.muted, fontWeight: "900" }}>
                  IN
                </Text>
                <Text style={{ color: theme.colors.text, fontWeight: "900" }}>
                  {fmtInt(s.in_qty_total)}
                </Text>
              </View>

              <View
                style={{ flexDirection: "row", justifyContent: "space-between" }}
              >
                <Text style={{ color: theme.colors.muted, fontWeight: "900" }}>
                  OUT
                </Text>
                <Text style={{ color: theme.colors.text, fontWeight: "900" }}>
                  {fmtInt(s.out_qty_total)}
                </Text>
              </View>

              <View
                style={{ flexDirection: "row", justifyContent: "space-between" }}
              >
                <Text style={{ color: theme.colors.muted, fontWeight: "900" }}>
                  Closing
                </Text>
                <Text style={{ color: theme.colors.text, fontWeight: "900" }}>
                  {fmtInt(s.closing_qty_total)}
                </Text>
              </View>

              <View
                style={{
                  borderWidth: 1,
                  borderColor: netPositive
                    ? "rgba(52,211,153,0.35)"
                    : theme.colors.dangerBorder,
                  borderRadius: theme.radius.pill,
                  paddingVertical: 10,
                  paddingHorizontal: 14,
                  backgroundColor: netPositive
                    ? "rgba(52,211,153,0.10)"
                    : theme.colors.dangerSoft,
                }}
              >
                <Text
                  style={{
                    color: netPositive ? theme.colors.emerald : theme.colors.danger,
                    fontWeight: "900",
                    textAlign: "center",
                  }}
                >
                  Net: {netPositive ? "+" : ""}
                  {fmtInt(net)}
                </Text>
              </View>
            </>
          )}
        </Card>
      </Pressable>
    );
  }, []);

  // ✅ Dynamic bottom padding so tabs NEVER cover content
  const bottomPad = useMemo(() => {
    // add a little extra breathing room
    return Math.max(24, tabBarHeight + 24);
  }, [tabBarHeight]);

  const ListHeader = useMemo(() => {
    return (
      <View style={{ gap: 12 }}>
        {/* Header */}
        <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 12 }}>
          <Text style={{ fontSize: 24, fontWeight: "900", color: theme.colors.text }}>
            Closing History
          </Text>

          <Pressable
            onPress={() => router.back()}
            style={{
              borderWidth: 1,
              borderColor: theme.colors.border,
              borderRadius: theme.radius.pill,
              paddingHorizontal: 14,
              paddingVertical: 10,
              backgroundColor: theme.colors.card,
            }}
          >
            <Text style={{ color: theme.colors.text, fontWeight: "900" }}>Back</Text>
          </Pressable>
        </View>

        {/* Context Card */}
        <Card style={{ gap: 10 }}>
          <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>Organization</Text>
          <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 18 }}>
            {activeOrgName ?? "—"}
          </Text>

          <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>Store</Text>
          <Text style={{ color: theme.colors.text, fontWeight: "900" }}>
            {activeStoreName ?? "—"}
          </Text>

          <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>Role</Text>
          <Text style={{ color: theme.colors.text, fontWeight: "900" }}>{roleLabel}</Text>

          <Text style={{ color: theme.colors.muted, fontWeight: "800", marginTop: 6 }}>
            Range
          </Text>

          <View style={{ flexDirection: "row", gap: 10 }}>
            <Pressable onPress={() => setFilter("7d")} style={chipStyle(filter === "7d")}>
              <Text style={chipTextStyle(filter === "7d")}>Last 7 days</Text>
            </Pressable>

            <Pressable onPress={() => setFilter("month")} style={chipStyle(filter === "month")}>
              <Text style={chipTextStyle(filter === "month")}>This Month</Text>
            </Pressable>

            <Pressable onPress={() => setFilter("all")} style={chipStyle(filter === "all")}>
              <Text style={chipTextStyle(filter === "all")}>Last 90</Text>
            </Pressable>
          </View>

          <View
            style={{
              marginTop: 6,
              borderWidth: 1,
              borderColor: theme.colors.border,
              borderRadius: theme.radius.xl,
              padding: 12,
              backgroundColor: theme.colors.card,
            }}
          >
            <Text style={{ color: theme.colors.muted, fontWeight: "900" }}>
              Showing: {dateRange.start} .. {dateRange.end}
            </Text>

            <Text style={{ color: theme.colors.muted, fontWeight: "800", marginTop: 6 }}>
              {isOwnerOrAdmin
                ? "Owner/Admin anaona LOCKED status pia."
                : "Staff anaweza kuona history. (Kama RLS imekataa snapshot dates, tutaongeza RPC salama baadaye.)"}
            </Text>
          </View>

          <Button
            title={loading ? "Loading..." : "Refresh"}
            onPress={loadHistory}
            disabled={loading}
            variant="secondary"
            style={{ marginTop: 10 }}
          />
        </Card>

        {!!error && (
          <Card
            style={{
              borderColor: theme.colors.dangerBorder,
              backgroundColor: theme.colors.dangerSoft,
            }}
          >
            <Text style={{ color: theme.colors.danger, fontWeight: "900" }}>{error}</Text>
          </Card>
        )}

        {loading && items.length === 0 && (
          <View style={{ paddingVertical: 18, alignItems: "center" }}>
            <ActivityIndicator />
            <Text style={{ color: theme.colors.muted, fontWeight: "800", marginTop: 10 }}>
              Loading history...
            </Text>
          </View>
        )}

        {!loading && items.length === 0 && !error && (
          <Card>
            <Text style={{ color: theme.colors.text, fontWeight: "900" }}>No history yet</Text>
            <Text style={{ color: theme.colors.muted, fontWeight: "800", marginTop: 6 }}>
              Hakuna snapshots kwenye range hii. (Tumia Daily Closing → Load Report ili kuona summary.)
            </Text>
          </Card>
        )}
      </View>
    );
  }, [
    router,
    activeOrgName,
    activeStoreName,
    roleLabel,
    chipStyle,
    chipTextStyle,
    filter,
    dateRange.start,
    dateRange.end,
    isOwnerOrAdmin,
    loadHistory,
    loading,
    items.length,
    error,
  ]);

  return (
    <Screen>
      <FlatList
        style={{ flex: 1 }}
        data={items}
        keyExtractor={(it) => it.date}
        renderItem={renderItem}
        ListHeaderComponent={ListHeader}
        ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
        contentContainerStyle={{
          paddingTop: 0,
          paddingBottom: bottomPad, // ✅ GUARANTEED: tabs can't cover content
        }}
        ListFooterComponent={<View style={{ height: bottomPad }} />}
        showsVerticalScrollIndicator={false}
      />
    </Screen>
  );
}