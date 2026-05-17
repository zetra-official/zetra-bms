// app/(tabs)/staff/my-sales.tsx
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useOrg } from "../../../src/context/OrgContext";
import { supabase } from "../../../src/supabase/supabaseClient";
import { formatMoney, useOrgMoneyPrefs } from "@/src/ui/money";

type MySalesRow = {
  membership_id: string;
  user_id: string;
  email: string | null;
  role: string | null;
  total_sales: number | string | null;
  sales_count: number | string | null;
  commission_percent: number | string | null;
  commission_amount: number | string | null;
  paid_commission?: number | string | null;
  remaining_commission?: number | string | null;
};

type MyPayoutProfileRow = {
  id: string;
  organization_id: string;
  membership_id: string;
  payment_method: string | null;
  mobile_network: string | null;
  mobile_number: string | null;
  bank_name: string | null;
  bank_account_name: string | null;
  bank_account_number: string | null;
  account_holder_name: string | null;
  is_active: boolean | null;
  created_at: string | null;
  updated_at: string | null;
};

type MyCommissionHistoryRow = {
  payout_id: string;
  membership_id: string;
  period_key: string | null;
  sales_amount: number | string | null;
  commission_percent: number | string | null;
  commission_amount: number | string | null;
  paid_amount: number | string | null;
  remaining_amount: number | string | null;
  payment_method: string | null;
  payment_destination: string | null;
  reference: string | null;
  note: string | null;
  status: string | null;
  sent_at: string | null;
  received_at: string | null;
  received_note: string | null;
  created_at: string | null;
};

const UI = {
  bg0: "#F3F7FC",
  card: "#FFFFFF",
  border: "rgba(15,23,42,0.10)",
  text: "#0F172A",
  muted: "#64748B",
  faint: "#94A3B8",
  emerald: "#059669",
  emeraldSoft: "rgba(5,150,105,0.10)",
  danger: "#E11D48",
};

function shortId(v: string) {
  if (!v) return "—";
  return v.length > 10 ? `${v.slice(0, 8)}...` : v;
}

function toNum(v: any) {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function initialsFromEmail(email: string | null, fallback = "ST") {
  if (!email) return fallback;
  const base = email.split("@")[0]?.trim() ?? "";
  const letters = base.replace(/[^a-zA-Z]/g, "");
  if (letters.length >= 2) return letters.slice(0, 2).toUpperCase();
  if (letters.length === 1) return (letters + "T").toUpperCase();
  return fallback;
}

export default function MySalesScreen() {
  const router = useRouter();
  const { activeOrgId, activeOrgName, activeRole } = useOrg();

  const orgId = String(activeOrgId ?? "").trim();
  const isStaff = activeRole === "staff";

  const money = useOrgMoneyPrefs(orgId);
  const currency = money.currency || "TZS";
  const locale = money.locale || "en-TZ";

  const fmtMoney = useCallback(
    (n: number) =>
      formatMoney(n, {
        currency,
        locale,
      }).replace(/\s+/g, " "),
    [currency, locale]
  );

  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [row, setRow] = useState<MySalesRow | null>(null);
  const [profile, setProfile] = useState<MyPayoutProfileRow | null>(null);
  const [historyRows, setHistoryRows] = useState<MyCommissionHistoryRow[]>([]);

  const loadData = useCallback(
    async (opts?: { silent?: boolean }) => {
      const silent = !!opts?.silent;

      if (!isStaff) {
        setRow(null);
        setError("Staff only.");
        return;
      }

      if (!orgId) {
        setRow(null);
        setError("No active organization.");
        return;
      }

      if (!silent) {
        setLoading(true);
        setError(null);
      }

      try {
        const [
          { data, error: e },
          { data: profileData, error: profileError },
          { data: historyData, error: historyError },
        ] = await Promise.all([
          supabase.rpc("get_my_staff_sales_commission_month_v1", {
            p_org_id: orgId,
          }),
          supabase.rpc("get_my_commission_payout_profile_v1", {
            p_org_id: orgId,
          }),
          supabase.rpc("get_my_commission_history_v1", {
            p_org_id: orgId,
            p_limit: 10,
          }),
        ]);

        if (e) throw e;
        if (profileError) throw profileError;
        if (historyError) throw historyError;

        const nextRow = Array.isArray(data) ? (data[0] ?? null) : (data as MySalesRow | null);
        const nextProfile = Array.isArray(profileData)
          ? (profileData[0] ?? null)
          : (profileData as MyPayoutProfileRow | null);

        setRow(nextRow);
        setProfile(nextProfile);
        setHistoryRows(Array.isArray(historyData) ? (historyData as MyCommissionHistoryRow[]) : []);
      } catch (err: any) {
        setError(err?.message ?? "Failed to load my sales");
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [isStaff, orgId]
  );

  useFocusEffect(
    useCallback(() => {
      void loadData({ silent: true });
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

  const email = useMemo(() => {
    const e = String(row?.email ?? "").trim();
    return e || null;
  }, [row]);

  const initials = useMemo(() => initialsFromEmail(email, "ST"), [email]);

  const totalSales = useMemo(() => toNum(row?.total_sales), [row]);
  const salesCount = useMemo(() => Math.trunc(toNum(row?.sales_count)), [row]);
  const commissionPercent = useMemo(() => toNum(row?.commission_percent), [row]);
  const commissionAmount = useMemo(() => toNum(row?.commission_amount), [row]);

  const payoutMethod = useMemo(
    () => String(profile?.payment_method ?? "").trim(),
    [profile]
  );

  const payoutDestination = useMemo(() => {
    if (payoutMethod === "MOBILE") return String(profile?.mobile_number ?? "").trim();
    if (payoutMethod === "BANK") return String(profile?.bank_account_number ?? "").trim();
    return "";
  }, [profile, payoutMethod]);

  const hasPayoutProfile = !!profile?.id;

  const currentPeriodKey = useMemo(() => {
    const d = new Date();
    const y = d.getFullYear();
    const m = `${d.getMonth() + 1}`.padStart(2, "0");
    return `${y}-${m}`;
  }, []);

  const currentPeriodPayouts = useMemo(
    () =>
      historyRows.filter(
        (h) => String(h.period_key ?? "").trim() === currentPeriodKey
      ),
    [historyRows, currentPeriodKey]
  );

  const currentPeriodPaid = useMemo(
    () => currentPeriodPayouts.reduce((a, h) => a + toNum(h.paid_amount), 0),
    [currentPeriodPayouts]
  );

  const currentRemaining = useMemo(() => {
    const raw = row?.remaining_commission;
    if (raw != null) return Math.max(0, toNum(raw));
    return Math.max(0, commissionAmount - currentPeriodPaid);
  }, [row, commissionAmount, currentPeriodPaid]);

  const isCurrentMonthPaid = currentPeriodPaid > 0 && currentRemaining <= 0;

  if (!isStaff) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: UI.bg0 }} edges={["top"]}>
        <View style={{ flex: 1, padding: 16, justifyContent: "center" }}>
          <View
            style={{
              borderWidth: 1,
              borderColor: "rgba(251,113,133,0.35)",
              borderRadius: 22,
              backgroundColor: "rgba(251,113,133,0.08)",
              padding: 16,
              gap: 10,
            }}
          >
            <Text style={{ color: UI.danger, fontWeight: "900", fontSize: 18 }}>
              No Access
            </Text>
            <Text style={{ color: UI.text, fontWeight: "800", lineHeight: 22 }}>
              Hii screen ni ya STAFF tu.
            </Text>

            <Pressable
              onPress={() => router.back()}
              style={{
                marginTop: 8,
                borderWidth: 1,
                borderColor: UI.border,
                borderRadius: 18,
               backgroundColor: "#F8FAFC",
                paddingVertical: 14,
                alignItems: "center",
              }}
            >
              <Text style={{ color: UI.text, fontWeight: "900" }}>Back</Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: UI.bg0 }} edges={["top"]}>
      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={{
          padding: 18,
          paddingBottom: 170,
          gap: 12,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <Pressable
            onPress={() => router.back()}
            style={{
              width: 44,
              height: 44,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: UI.border,
              backgroundColor: "#FFFFFF",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text style={{ color: UI.text, fontWeight: "900", fontSize: 18 }}>‹</Text>
          </Pressable>

          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 26, fontWeight: "900", color: UI.text }}>
              My Sales
            </Text>
            <Text style={{ color: UI.muted, fontWeight: "800", marginTop: 4 }}>
              Monthly summary for my staff sales
            </Text>
          </View>
        </View>

        <View
          style={{
            borderWidth: 1,
            borderColor: UI.border,
            borderRadius: 22,
            backgroundColor: UI.card,
            padding: 16,
            gap: 10,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <View
              style={{
                width: 52,
                height: 52,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: "rgba(15,23,42,0.12)",
backgroundColor: "#F8FAFC",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text style={{ color: UI.text, fontWeight: "900", fontSize: 16 }}>{initials}</Text>
            </View>

            <View style={{ flex: 1 }}>
              <Text style={{ color: UI.muted, fontWeight: "800" }}>Staff Account</Text>
              <Text style={{ color: UI.text, fontWeight: "900", fontSize: 18, marginTop: 4 }}>
                {email ?? "—"}
              </Text>
            </View>

            <View
              style={{
                borderWidth: 1,
                borderColor: "rgba(52,211,153,0.30)",
                backgroundColor: "rgba(52,211,153,0.10)",
                paddingHorizontal: 12,
                paddingVertical: 7,
                borderRadius: 999,
              }}
            >
              <Text style={{ color: UI.emerald, fontWeight: "900" }}>STAFF</Text>
            </View>
          </View>

          <View>
            <Text style={{ color: UI.muted, fontWeight: "800" }}>Organization</Text>
            <Text style={{ color: UI.text, fontWeight: "900", fontSize: 18, marginTop: 4 }}>
              {activeOrgName ?? "—"}
            </Text>
          </View>

          <Text style={{ color: UI.faint, fontWeight: "800", lineHeight: 20 }}>
            Hapa unaona mauzo yako ya mwezi huu pamoja na commission yako ya sasa. Kama owner ameweka 0%, commission itaonekana 0 lakini mauzo yataendelea kuhesabiwa kawaida.
          </Text>
        </View>

        <View
          style={{
            borderWidth: 1,
            borderColor: hasPayoutProfile ? "rgba(52,211,153,0.20)" : "rgba(251,113,133,0.30)",
            borderRadius: 22,
            backgroundColor: hasPayoutProfile
              ? "rgba(52,211,153,0.08)"
              : "rgba(251,113,133,0.08)",
            padding: 16,
            gap: 8,
          }}
        >
          <Text
            style={{
              color: hasPayoutProfile ? UI.emerald : UI.danger,
              fontWeight: "900",
              fontSize: 16,
            }}
          >
            {hasPayoutProfile ? "Payout Profile Ready" : "Payout Profile Missing"}
          </Text>

          <Text style={{ color: UI.text, fontWeight: "800", lineHeight: 20 }}>
            {hasPayoutProfile
              ? `${payoutMethod}${payoutDestination ? ` • ${payoutDestination}` : ""}`
              : "Bado hujajaza sehemu ya kupokea commission (simu au bank)."}
          </Text>

          {hasPayoutProfile ? (
            <>
              <Text style={{ color: UI.muted, fontWeight: "800" }}>
                Account Holder
              </Text>
              <Text style={{ color: UI.text, fontWeight: "900" }}>
                {String(profile?.account_holder_name ?? "").trim() || "—"}
              </Text>

              {payoutMethod.toUpperCase() === "MOBILE" ? (
                <>
                  <Text style={{ color: UI.muted, fontWeight: "800" }}>Network</Text>
                  <Text style={{ color: UI.text, fontWeight: "900" }}>
                    {String(profile?.mobile_network ?? "").trim() || "—"}
                  </Text>
                </>
              ) : null}

              {payoutMethod.toUpperCase() === "BANK" ? (
                <>
                  <Text style={{ color: UI.muted, fontWeight: "800" }}>Bank</Text>
                  <Text style={{ color: UI.text, fontWeight: "900" }}>
                    {String(profile?.bank_name ?? "").trim() || "—"}
                  </Text>

                  <Text style={{ color: UI.muted, fontWeight: "800" }}>Bank Account Name</Text>
                  <Text style={{ color: UI.text, fontWeight: "900" }}>
                    {String(profile?.bank_account_name ?? "").trim() || "—"}
                  </Text>
                </>
              ) : null}
            </>
          ) : null}
        </View>

        <View
          style={{
            borderWidth: 1,
            borderColor: isCurrentMonthPaid
  ? "rgba(52,211,153,0.20)"
  : UI.border,
            borderRadius: 22,
            backgroundColor: isCurrentMonthPaid
              ? "rgba(52,211,153,0.08)"
              : UI.card,
            padding: 16,
            gap: 8,
          }}
        >
          <Text
            style={{
              color: isCurrentMonthPaid ? UI.emerald : UI.text,
              fontWeight: "900",
              fontSize: 16,
            }}
          >
            {isCurrentMonthPaid ? "Commission Already Paid This Month" : "Current Commission Status"}
          </Text>

          <Text style={{ color: UI.text, fontWeight: "800", lineHeight: 20 }}>
            Paid this month: {fmtMoney(currentPeriodPaid)}
          </Text>

          <Text style={{ color: UI.text, fontWeight: "800", lineHeight: 20 }}>
            Remaining this month: {fmtMoney(currentRemaining)}
          </Text>

          <Text style={{ color: UI.faint, fontWeight: "800", lineHeight: 20 }}>
            Ukishalipwa full, mfumo utaonyesha remaining = 0 na utaendelea kusoma commission mpya zinazoingia.
          </Text>
        </View>

        {!!error ? (
          <View
            style={{
              borderWidth: 1,
              borderColor: "rgba(251,113,133,0.35)",
              borderRadius: 18,
              backgroundColor: "rgba(251,113,133,0.08)",
              padding: 12,
            }}
          >
            <Text style={{ color: UI.danger, fontWeight: "900" }}>{error}</Text>
          </View>
        ) : null}

        <View style={{ flexDirection: "row", gap: 10 }}>
          <View
            style={{
              flex: 1,
              borderWidth: 1,
              borderColor: UI.border,
              borderRadius: 18,
              backgroundColor: "#F8FAFC",
              padding: 14,
            }}
          >
            <Text style={{ color: UI.muted, fontWeight: "800" }}>My Sales</Text>
            <Text style={{ color: UI.text, fontWeight: "900", fontSize: 18, marginTop: 6 }}>
              {fmtMoney(totalSales)}
            </Text>
          </View>

          <View
            style={{
              flex: 1,
              borderWidth: 1,
              borderColor: UI.border,
              borderRadius: 18,
              backgroundColor: "#F8FAFC",
              padding: 14,
            }}
          >
            <Text style={{ color: UI.muted, fontWeight: "800" }}>Sales Count</Text>
            <Text style={{ color: UI.text, fontWeight: "900", fontSize: 22, marginTop: 6 }}>
              {salesCount}
            </Text>
          </View>
        </View>

        <View style={{ flexDirection: "row", gap: 10 }}>
          <View
            style={{
              flex: 1,
              borderWidth: 1,
              borderColor: "rgba(52,211,153,0.20)",
              borderRadius: 18,
              backgroundColor: "rgba(52,211,153,0.08)",
              padding: 14,
            }}
          >
            <Text style={{ color: UI.muted, fontWeight: "800" }}>Commission Rate</Text>
            <Text style={{ color: UI.text, fontWeight: "900", fontSize: 22, marginTop: 6 }}>
              {commissionPercent}%
            </Text>
          </View>

          <View
            style={{
              flex: 1,
              borderWidth: 1,
              borderColor: "rgba(52,211,153,0.20)",
              borderRadius: 18,
              backgroundColor: "rgba(52,211,153,0.08)",
              padding: 14,
            }}
          >
            <Text style={{ color: UI.muted, fontWeight: "800" }}>Current Remaining</Text>
            <Text style={{ color: UI.text, fontWeight: "900", fontSize: 18, marginTop: 6 }}>
              {fmtMoney(currentRemaining)}
            </Text>
          </View>
        </View>

        <Pressable
          onPress={() => void loadData()}
          disabled={loading}
          style={{
          backgroundColor: "#F8FAFC",
            borderWidth: 1,
            borderColor: UI.border,
            paddingVertical: 14,
            borderRadius: 18,
            alignItems: "center",
            opacity: loading ? 0.65 : 1,
          }}
        >
          <Text style={{ color: UI.text, fontWeight: "900", fontSize: 16 }}>
            {loading ? "Loading..." : "Refresh My Sales"}
          </Text>
        </Pressable>

        <View
          style={{
            borderWidth: 1,
            borderColor: UI.border,
            borderRadius: 22,
            backgroundColor: UI.card,
            padding: 16,
            gap: 8,
          }}
        >
          <Text style={{ color: UI.text, fontWeight: "900", fontSize: 16 }}>
            Info
          </Text>

          <Text style={{ color: UI.muted, fontWeight: "800", lineHeight: 20 }}>
            Membership: {shortId(String(row?.membership_id ?? ""))}
          </Text>

          <Text style={{ color: UI.muted, fontWeight: "800", lineHeight: 20 }}>
            User: {shortId(String(row?.user_id ?? ""))}
          </Text>

          <Text style={{ color: UI.faint, fontWeight: "800", lineHeight: 20 }}>
            Summary hii ni ya mwezi wa sasa tu. Mfumo unakokotoa commission kwa formula ya:
            Total Sales × Commission %.
          </Text>
        </View>

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
          <Text style={{ color: UI.text, fontWeight: "900", fontSize: 16 }}>
            Commission History
          </Text>

          {historyRows.length === 0 ? (
            <Text style={{ color: UI.muted, fontWeight: "800", lineHeight: 20 }}>
              Hakuna payout history bado.
            </Text>
          ) : (
            historyRows.map((h) => {
              const paid = toNum(h.paid_amount);
              const comm = toNum(h.commission_amount);
              const status = String(h.status ?? "").trim().toUpperCase() || "—";

              return (
                <View
                  key={String(h.payout_id)}
                  style={{
                    borderWidth: 1,
                    borderColor: UI.border,
                    borderRadius: 18,
                  backgroundColor: "#FFFFFF",
                    padding: 12,
                    gap: 6,
                  }}
                >
                  <Text style={{ color: UI.text, fontWeight: "900" }}>
                    Period: {String(h.period_key ?? "—")}
                  </Text>

                  <Text style={{ color: UI.muted, fontWeight: "800" }}>
                    Commission: {fmtMoney(comm)}
                  </Text>

                  <Text style={{ color: UI.muted, fontWeight: "800" }}>
                    Paid: {fmtMoney(paid)}
                  </Text>

                  <Text style={{ color: UI.muted, fontWeight: "800" }}>
                    Remaining: {fmtMoney(toNum(h.remaining_amount))}
                  </Text>

                  <Text style={{ color: UI.muted, fontWeight: "800" }}>
                    Status: {status}
                  </Text>

                  <Text style={{ color: UI.muted, fontWeight: "800" }}>
                    Reference: {String(h.reference ?? "").trim() || "—"}
                  </Text>

                  <Text style={{ color: UI.muted, fontWeight: "800" }}>
                    Destination: {String(h.payment_method ?? "").trim() || "—"}
                    {String(h.payment_destination ?? "").trim()
                      ? ` • ${String(h.payment_destination ?? "").trim()}`
                      : ""}
                  </Text>

                  <Text style={{ color: UI.muted, fontWeight: "800", lineHeight: 20 }}>
                    Transaction Message: {String(h.note ?? "").trim() || "—"}
                  </Text>
                </View>
              );
            })
          )}
        </View>

        {!row ? (
          <View
            style={{
              borderWidth: 1,
              borderColor: UI.border,
              borderRadius: 22,
              backgroundColor: UI.card,
              padding: 16,
            }}
          >
            <Text style={{ fontWeight: "900", color: UI.text }}>
              No sales data yet
            </Text>
            <Text style={{ marginTop: 6, color: UI.muted, fontWeight: "700", lineHeight: 20 }}>
              Bado hakuna data ya mwezi huu, au mauzo yako bado hayaja-attributed kwa staff membership yako.
            </Text>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}