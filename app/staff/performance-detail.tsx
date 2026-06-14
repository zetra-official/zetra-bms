import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useOrg } from "../../src/context/OrgContext";
import { supabase } from "../../src/supabase/supabaseClient";

type RangeKey = "today" | "week" | "month" | "year" | "custom";

const UI = {
  bg0: "#F3F7FC",
  card: "#FFFFFF",
  border: "rgba(15,23,42,0.10)",
  text: "#0F172A",
  muted: "#64748B",
  faint: "#94A3B8",
  emerald: "#059669",
  danger: "#E11D48",
};

function one(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : v;
}

function toNum(v: any) {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function formatTZS(n: number) {
  return `TSh ${Math.round(n).toLocaleString("en-TZ")}`;
}

function getCommissionAmount(r: any) {
  return toNum(r.commission_amount);
}

function getNetProfitAfterCommission(r: any) {
  const fromDb = r.net_profit_after_commission;
  if (fromDb !== null && fromDb !== undefined) return toNum(fromDb);

  return toNum(r.gross_profit ?? r.profit_amount);
}

function ymd(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function getRange(key: RangeKey, customFrom: string, customTo: string) {
  const now = new Date();
  const to = ymd(now);
  const fromDate = new Date(now);

  if (key === "today") return { from: to, to };

  if (key === "week") {
    fromDate.setDate(now.getDate() - 6);
    return { from: ymd(fromDate), to };
  }

  if (key === "month") {
    fromDate.setDate(1);
    return { from: ymd(fromDate), to };
  }

  if (key === "year") {
    fromDate.setMonth(0, 1);
    return { from: ymd(fromDate), to };
  }

  return { from: customFrom.trim(), to: customTo.trim() };
}

export default function StaffPerformanceDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    membershipId?: string | string[];
    userId?: string | string[];
    email?: string | string[];
  }>();

  const { activeOrgId, activeOrgName, activeRole } = useOrg();

  const membershipId = (one(params.membershipId) ?? "").trim();
  const userId = (one(params.userId) ?? "").trim();
  const email = (one(params.email) ?? "").trim();

  const canManage = activeRole === "owner" || activeRole === "admin";

  const [rangeKey, setRangeKey] = useState<RangeKey>("month");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [rows, setRows] = useState<any[]>([]);

  const range = useMemo(
    () => getRange(rangeKey, customFrom, customTo),
    [rangeKey, customFrom, customTo]
  );

  const loadData = useCallback(async () => {
    if (!activeOrgId || !canManage || !membershipId) {
      setRows([]);
      return;
    }

    if (!range.from || !range.to) {
      Alert.alert("Date Required", "Weka tarehe ya kuanzia na kuishia.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { data, error: e } = await supabase.rpc(
        "get_staff_performance_detail_v1",
        {
          p_org_id: activeOrgId,
          p_membership_id: membershipId,
          p_from_date: range.from,
          p_to_date: range.to,
        }
      );

      if (e) throw e;

      setRows((data ?? []) as any[]);
    } catch (err: any) {
      setError(err?.message ?? "Failed to load staff performance detail");
    } finally {
      setLoading(false);
    }
  }, [activeOrgId, canManage, membershipId, range.from, range.to]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadData();
    } finally {
      setRefreshing(false);
    }
  }, [loadData]);

  const totals = useMemo(() => {
    return rows.reduce(
      (acc, r) => {
        acc.sales += toNum(r.total_amount ?? r.sale_amount ?? r.sales_amount);
        acc.profit += toNum(r.gross_profit ?? r.profit_amount);
      acc.commission += getCommissionAmount(r);
acc.netProfit += getNetProfitAfterCommission(r);
        acc.receipts += 1;
        return acc;
      },
      { sales: 0, profit: 0, commission: 0, netProfit: 0, receipts: 0 }
    );
  }, [rows]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: UI.bg0 }} edges={["top"]}>
      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={{ padding: 18, paddingBottom: 170, gap: 12 }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <Pressable
            onPress={() => router.back()}
            style={{
              width: 46,
              height: 46,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: UI.border,
              backgroundColor: UI.card,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text style={{ color: UI.text, fontWeight: "900", fontSize: 22 }}>‹</Text>
          </Pressable>

          <View style={{ flex: 1 }}>
            <Text style={{ color: UI.text, fontWeight: "900", fontSize: 26 }}>
              Staff Report
            </Text>
            <Text style={{ color: UI.muted, fontWeight: "800", marginTop: 4 }}>
              {activeOrgName ?? "—"} • {email || userId || "Staff"}
            </Text>
          </View>
        </View>

        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {(["today", "week", "month", "year", "custom"] as RangeKey[]).map((k) => (
            <Pressable
              key={k}
              onPress={() => setRangeKey(k)}
              style={{
                borderWidth: 1,
                borderColor: rangeKey === k ? "rgba(52,211,153,0.35)" : UI.border,
                backgroundColor: rangeKey === k ? "rgba(52,211,153,0.10)" : UI.card,
                borderRadius: 999,
                paddingHorizontal: 12,
                paddingVertical: 8,
              }}
            >
              <Text style={{ color: UI.text, fontWeight: "900" }}>{k.toUpperCase()}</Text>
            </Pressable>
          ))}
        </View>

        {rangeKey === "custom" ? (
          <View style={{ flexDirection: "row", gap: 10 }}>
            <TextInput
              value={customFrom}
              onChangeText={setCustomFrom}
              placeholder="From YYYY-MM-DD"
              placeholderTextColor={UI.faint}
              style={{
                flex: 1,
                borderWidth: 1,
                borderColor: UI.border,
                borderRadius: 18,
                backgroundColor: UI.card,
                padding: 12,
                color: UI.text,
                fontWeight: "900",
              }}
            />
            <TextInput
              value={customTo}
              onChangeText={setCustomTo}
              placeholder="To YYYY-MM-DD"
              placeholderTextColor={UI.faint}
              style={{
                flex: 1,
                borderWidth: 1,
                borderColor: UI.border,
                borderRadius: 18,
                backgroundColor: UI.card,
                padding: 12,
                color: UI.text,
                fontWeight: "900",
              }}
            />
          </View>
        ) : null}

        {!!error ? (
          <View
            style={{
              borderWidth: 1,
              borderColor: "rgba(225,29,72,0.25)",
              borderRadius: 18,
              backgroundColor: "rgba(225,29,72,0.06)",
              padding: 14,
            }}
          >
            <Text style={{ color: UI.danger, fontWeight: "900" }}>{error}</Text>
          </View>
        ) : null}

        <View
          style={{
            borderWidth: 1,
            borderColor: UI.border,
            borderRadius: 22,
            backgroundColor: UI.card,
            padding: 16,
            gap: 12,
          }}
        >
          <Text style={{ color: UI.text, fontWeight: "900", fontSize: 18 }}>
            Summary
          </Text>

          <Text style={{ color: UI.muted, fontWeight: "900" }}>
            Period: {range.from || "—"} → {range.to || "—"}
          </Text>

          <Text style={{ color: UI.text, fontWeight: "900", fontSize: 20 }}>
            Sales: {formatTZS(totals.sales)}
          </Text>

          <Text style={{ color: UI.text, fontWeight: "900" }}>
            Gross Profit: {formatTZS(totals.profit)}
          </Text>

          <Text style={{ color: UI.text, fontWeight: "900" }}>
            Commission: {formatTZS(totals.commission)}
          </Text>

          <Text style={{ color: UI.emerald, fontWeight: "900" }}>
            Net Profit After Commission: {formatTZS(totals.netProfit)}
          </Text>

          <Text style={{ color: UI.muted, fontWeight: "900" }}>
            Receipts: {totals.receipts}
          </Text>
        </View>

        <Pressable
          onPress={() => void loadData()}
          disabled={loading}
          style={{
            borderWidth: 1,
            borderColor: UI.border,
            borderRadius: 18,
            backgroundColor: UI.card,
            paddingVertical: 14,
            alignItems: "center",
            opacity: loading ? 0.6 : 1,
          }}
        >
          <Text style={{ color: UI.text, fontWeight: "900" }}>
            {loading ? "Loading..." : "Refresh Report"}
          </Text>
        </Pressable>

        <Text style={{ color: UI.text, fontWeight: "900", fontSize: 18 }}>
          Sales / Receipts
        </Text>

        {rows.length === 0 ? (
          <View
            style={{
              borderWidth: 1,
              borderColor: UI.border,
              borderRadius: 22,
              backgroundColor: UI.card,
              padding: 16,
            }}
          >
            <Text style={{ color: UI.text, fontWeight: "900" }}>No sales found</Text>
            <Text style={{ color: UI.muted, fontWeight: "800", marginTop: 6 }}>
              Hakuna mauzo yaliyopatikana kwa mfanyakazi huyu kwenye range hii.
            </Text>
          </View>
        ) : (
          rows.map((r, idx) => (
            <View
              key={String(r.sale_id ?? r.id ?? idx)}
              style={{
                borderWidth: 1,
                borderColor: UI.border,
                borderRadius: 22,
                backgroundColor: UI.card,
                padding: 16,
                gap: 8,
              }}
            >
              <Text style={{ color: UI.emerald, fontWeight: "900", fontSize: 12 }}>
                RECEIPT #{idx + 1}
              </Text>

              <Text style={{ color: UI.text, fontWeight: "900" }}>
                {String(r.sale_date ?? r.created_at ?? "—")}
              </Text>

              <Text style={{ color: UI.muted, fontWeight: "900" }}>
                Sales: {formatTZS(toNum(r.total_amount ?? r.sale_amount ?? r.sales_amount))}
              </Text>

              <Text style={{ color: UI.muted, fontWeight: "900" }}>
                Gross Profit: {formatTZS(toNum(r.gross_profit ?? r.profit_amount))}
              </Text>

              <Text style={{ color: UI.muted, fontWeight: "900" }}>
                Commission: {formatTZS(getCommissionAmount(r))}
              </Text>

              <Text style={{ color: UI.text, fontWeight: "900" }}>
                Net Profit: {formatTZS(getNetProfitAfterCommission(r))}
              </Text>
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}