import {useSystemMessageText} from "@/src/i18n/useSystemMessageText";
import {useCommonText} from "@/src/i18n/useCommonText";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import {
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

type StaffPerformanceRow = {
  membership_id: string;
  user_id: string;
  email: string | null;
  role: string | null;
  total_sales: number | string | null;
  sales_count: number | string | null;
  remaining_commission?: number | string | null;
};

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

function toNum(v: any) {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function formatTZS(n: number) {
  return `TSh ${Math.round(n).toLocaleString("en-TZ")}`;
}

function shortId(v: string) {
  if (!v) return "—";
  return v.length > 10 ? `${v.slice(0, 8)}...` : v;
}

export default function StaffPerformanceScreen() {
 const systemText = useSystemMessageText();
 const uiText = useCommonText();
  const router = useRouter();
  const { activeOrgId, activeOrgName, activeRole } = useOrg();

  const role = String(activeRole ?? "")
  .trim()
  .toLowerCase();

const canManage =
  role === "owner" ||
  role === "admin";

  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<StaffPerformanceRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!activeOrgId || !canManage) {
      setRows([]);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { data, error: e } = await supabase.rpc(
        "get_org_staff_commission_dashboard_v2",
        { p_org_id: activeOrgId }
      );

      if (e) throw e;

      setRows(
        ((data ?? []) as StaffPerformanceRow[]).filter(
          (x) => String(x.role ?? "").toLowerCase() === "staff"
        )
      );
    } catch (err: any) {
      setError(err?.message ?? "Failed to load performance data");
    } finally {
      setLoading(false);
    }
  }, [activeOrgId, canManage]);

  useFocusEffect(
    useCallback(() => {
      void loadData();
    }, [loadData])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadData();
    } finally {
      setRefreshing(false);
    }
  }, [loadData]);

const allRanked = useMemo(() => {
  return rows
    .map((r) => ({
      ...r,
      totalSalesNum: Math.max(0, toNum(r.total_sales)),
      salesCountNum: Math.max(0, Math.trunc(toNum(r.sales_count))),
      remainingCommissionNum: Math.max(
        0,
        toNum(r.remaining_commission)
      ),
    }))
    .sort((a, b) => {
      if (b.totalSalesNum !== a.totalSalesNum) {
        return b.totalSalesNum - a.totalSalesNum;
      }

      return b.salesCountNum - a.salesCountNum;
    });
}, [rows]);

const ranked = useMemo(() => {
  const needle = q.trim().toLowerCase();

  if (!needle) return allRanked;

  return allRanked.filter((r) => {
    const hay =
      `${r.email ?? ""} ${r.membership_id ?? ""} ${r.user_id ?? ""}`
        .toLowerCase();

    return hay.includes(needle);
  });
}, [allRanked, q]);

const best = useMemo(() => {
  return (
    allRanked.find(
      (r) => r.totalSalesNum > 0 || r.salesCountNum > 0
    ) ?? null
  );
}, [allRanked]);

const followUp = useMemo(() => {
  const activeStaff = allRanked.filter(
    (r) => r.totalSalesNum > 0 || r.salesCountNum > 0
  );

  if (activeStaff.length <= 1) return null;

  return activeStaff[activeStaff.length - 1];
}, [allRanked]);

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
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: UI.card,
            }}
          >
            <Text style={{ color: UI.text, fontWeight: "900", fontSize: 22 }}>‹</Text>
          </Pressable>

          <View style={{ flex: 1 }}>
            <Text style={{ color: UI.text, fontWeight: "900", fontSize: 28 }}>
              {uiText("Performance Insights")}</Text>
            <Text style={{ color: UI.muted, fontWeight: "800", marginTop: 4 }}>
              {activeOrgName ?? "—"} {uiText("• Staff performance overview")}</Text>
          </View>
        </View>

        {!!error ? (
          <View style={{ borderWidth: 1, borderColor: "rgba(225,29,72,0.25)", borderRadius: 18, backgroundColor: "rgba(225,29,72,0.06)", padding: 14 }}>
            <Text style={{ color: UI.danger, fontWeight: "900" }}>{systemText(error)}</Text>
          </View>
        ) : null}

        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder={uiText("Search staff by email / membership...")}
          placeholderTextColor={UI.faint}
          style={{
            borderWidth: 1,
            borderColor: UI.border,
            borderRadius: 18,
            backgroundColor: UI.card,
            paddingHorizontal: 14,
            paddingVertical: 13,
            color: UI.text,
            fontWeight: "900",
          }}
        />

        <View style={{ borderWidth: 1, borderColor: UI.border, borderRadius: 22, backgroundColor: UI.card, padding: 16, gap: 12 }}>
         <Text style={{ color: UI.text, fontWeight: "900", fontSize: 18 }}>
  {uiText("Performance Highlights")}</Text>

          {best ? (
            <View style={{ borderWidth: 1, borderColor: "rgba(52,211,153,0.25)", borderRadius: 18, backgroundColor: "rgba(52,211,153,0.08)", padding: 14, gap: 6 }}>
              <Text style={{ color: UI.emerald, fontWeight: "900", fontSize: 12 }}>
                {uiText("TOP PERFORMER")}</Text>
              <Text style={{ color: UI.text, fontWeight: "900", fontSize: 16 }}>
                {best.email ?? uiText("User: {p0}", {p0: (shortId(best.user_id))})}
              </Text>
              <Text style={{ color: UI.muted, fontWeight: "900" }}>
                {uiText("Sales:")}{formatTZS(best.totalSalesNum)} {uiText("• Receipts:")}{best.salesCountNum}
              </Text>
            </View>
          ) : (
            <Text style={{ color: UI.muted, fontWeight: "800" }}>
              {uiText("Bado hakuna sales data ya staff.")}</Text>
          )}

          {followUp ? (
            <View style={{ borderWidth: 1, borderColor: "rgba(225,29,72,0.20)", borderRadius: 18, backgroundColor: "rgba(225,29,72,0.06)", padding: 14, gap: 6 }}>
              <Text style={{ color: UI.danger, fontWeight: "900", fontSize: 12 }}>
                {uiText("NEEDS FOLLOW UP")}</Text>
              <Text style={{ color: UI.text, fontWeight: "900", fontSize: 16 }}>
                {followUp.email ?? uiText("User: {p0}", {p0: (shortId(followUp.user_id))})}
              </Text>
              <Text style={{ color: UI.muted, fontWeight: "900" }}>
                {uiText("Sales:")}{formatTZS(followUp.totalSalesNum)} {uiText("• Receipts:")}{followUp.salesCountNum}
              </Text>
            </View>
          ) : null}
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
            {loading ? uiText("Loading...") : uiText("Refresh Performance")}
          </Text>
        </Pressable>

        <Text style={{ color: UI.text, fontWeight: "900", fontSize: 18 }}>
          {uiText("Full Staff Ranking")}</Text>

       {ranked.map((r, index) => (
  <Pressable
    key={r.membership_id}
    onPress={() =>
      router.push({
        pathname: "/staff/performance-detail" as any,
        params: {
          membershipId: r.membership_id,
          userId: r.user_id,
          email: r.email ?? "",
        },
      })
    }
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
              {uiText("RANK #")}{index + 1}
            </Text>

            <Text style={{ color: UI.text, fontWeight: "900", fontSize: 16 }}>
              {r.email ?? uiText("User: {p0}", {p0: (shortId(r.user_id))})}
            </Text>

            <Text style={{ color: UI.muted, fontWeight: "900" }}>
              {uiText("Sales:")}{formatTZS(r.totalSalesNum)}
            </Text>

            <Text style={{ color: UI.muted, fontWeight: "900" }}>
         {uiText("Receipts:")}{r.salesCountNum} {uiText("• Unpaid Commission:")}{" "}
{formatTZS(r.remainingCommissionNum)}
            </Text>
        <Text style={{ color: UI.faint, fontWeight: "800", marginTop: 4 }}>
      {uiText("Tap to open full staff report ›")}</Text>
  </Pressable>
))}
      </ScrollView>
    </SafeAreaView>
  );
}