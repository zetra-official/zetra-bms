// app/(tabs)/staff/commission-history.tsx
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

import { useOrg } from "../../../src/context/OrgContext";
import { supabase } from "../../../src/supabase/supabaseClient";
import { formatMoney, useOrgMoneyPrefs } from "@/src/ui/money";

type CommissionHistoryRow = {
  payout_id: string;
  membership_id: string;
  user_id?: string | null;
  email?: string | null;
  role?: string | null;

  period_key?: string | null;
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
  bg0: "#F3F6FB",
  card: "#FFFFFF",
  softCard: "#F8FAFC",
  border: "rgba(15,23,42,0.10)",
  text: "#0F172A",
  muted: "#64748B",
  faint: "#94A3B8",
  emerald: "#047857",
  emeraldSoft: "rgba(16,185,129,0.12)",
  danger: "#E11D48",
  warning: "#D97706",
};

function toNum(v: any) {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function shortId(v: string) {
  if (!v) return "—";
  return v.length > 10 ? `${v.slice(0, 8)}...` : v;
}

function fmtDateTime(iso?: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

function initialsFromEmail(email: string | null, fallback = "ST") {
  if (!email) return fallback;
  const base = email.split("@")[0]?.trim() ?? "";
  const letters = base.replace(/[^a-zA-Z]/g, "");
  if (letters.length >= 2) return letters.slice(0, 2).toUpperCase();
  if (letters.length === 1) return (letters + "T").toUpperCase();
  return fallback;
}

function statusColor(status: string) {
  const s = String(status ?? "").trim().toUpperCase();
  if (s === "RECEIVED" || s === "CONFIRMED") return UI.emerald;
  if (s === "PAID" || s === "SENT") return UI.warning;
  if (s === "CANCELLED" || s === "FAILED") return UI.danger;
  return UI.text;
}

function statusBg(status: string) {
  const s = String(status ?? "").trim().toUpperCase();
  if (s === "RECEIVED" || s === "CONFIRMED") return "rgba(52,211,153,0.10)";
  if (s === "PAID" || s === "SENT") return "rgba(245,158,11,0.10)";
  if (s === "CANCELLED" || s === "FAILED") return "rgba(251,113,133,0.10)";
  return "rgba(255,255,255,0.06)";
}

function statusBorder(status: string) {
  const s = String(status ?? "").trim().toUpperCase();
  if (s === "RECEIVED" || s === "CONFIRMED") return "rgba(52,211,153,0.30)";
  if (s === "PAID" || s === "SENT") return "rgba(245,158,11,0.28)";
  if (s === "CANCELLED" || s === "FAILED") return "rgba(251,113,133,0.30)";
  return "rgba(255,255,255,0.14)";
}

function payoutLabel(row: CommissionHistoryRow) {
  const method = String(row.payment_method ?? "").trim().toUpperCase();
  const destination = String(row.payment_destination ?? "").trim();

  if (!method && !destination) return "—";
  if (!method) return destination || "—";
  if (!destination) return method;

  return `${method} • ${destination}`;
}

export default function CommissionHistoryScreen() {
  const router = useRouter();
  const { activeOrgId, activeOrgName, activeRole } = useOrg();

  const orgId = String(activeOrgId ?? "").trim();
  const canManage = activeRole === "owner" || activeRole === "admin";

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

  const [q, setQ] = useState("");
  const [rows, setRows] = useState<CommissionHistoryRow[]>([]);

  const loadData = useCallback(
    async (opts?: { silent?: boolean }) => {
      const silent = !!opts?.silent;

      if (!canManage) {
        setRows([]);
        setError("Owner/Admin only.");
        return;
      }

      if (!orgId) {
        setRows([]);
        setError("No active organization.");
        return;
      }

      if (!silent) {
        setLoading(true);
        setError(null);
      }

      try {
        const { data, error: e } = await supabase.rpc(
          "get_org_staff_commission_history_v1",
          { p_org_id: orgId }
        );

        if (e) throw e;

        setRows((data ?? []) as CommissionHistoryRow[]);
      } catch (err: any) {
        setError(err?.message ?? "Failed to load commission history");
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [canManage, orgId]
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

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;

    return rows.filter((r) => {
      const hay =
        `${r.email ?? ""} ${r.membership_id ?? ""} ${r.user_id ?? ""} ${r.status ?? ""} ${r.note ?? ""} ${r.payment_method ?? ""} ${r.payment_destination ?? ""} ${r.reference ?? ""} ${r.period_key ?? ""}`.toLowerCase();
      return hay.includes(needle);
    });
  }, [rows, q]);

  const totalAmount = useMemo(
    () => rows.reduce((a, r) => a + toNum(r.commission_amount), 0),
    [rows]
  );

  const totalPaid = useMemo(
    () => rows.reduce((a, r) => a + toNum(r.paid_amount), 0),
    [rows]
  );

  if (!canManage) {
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
              Hii screen ni ya Owner/Admin tu.
            </Text>

            <Pressable
              onPress={() => router.back()}
              style={{
                marginTop: 8,
                borderWidth: 1,
                borderColor: UI.border,
                borderRadius: 18,
                backgroundColor: UI.softCard,
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
              backgroundColor: UI.softCard,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text style={{ color: UI.text, fontWeight: "900", fontSize: 22 }}>‹</Text>
          </Pressable>

          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 26, fontWeight: "900", color: UI.text }}>
              Commission History
            </Text>
            <Text style={{ color: UI.muted, fontWeight: "800", marginTop: 4 }}>
              Full payout history for staff commissions
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
          <Text style={{ color: UI.muted, fontWeight: "800" }}>Organization</Text>
          <Text style={{ fontSize: 18, fontWeight: "900", color: UI.text }}>
            {activeOrgName ?? "—"}
          </Text>

          <View style={{ flexDirection: "row", gap: 10 }}>
            <View
              style={{
                flex: 1,
                borderWidth: 1,
                borderColor: UI.border,
                borderRadius: 18,
                backgroundColor: UI.softCard,
                padding: 12,
              }}
            >
              <Text style={{ color: UI.muted, fontWeight: "800" }}>Records</Text>
              <Text style={{ color: UI.text, fontWeight: "900", marginTop: 6 }}>
                {rows.length}
              </Text>
            </View>

            <View
              style={{
                flex: 1,
                borderWidth: 1,
                borderColor: UI.border,
                borderRadius: 18,
                backgroundColor: UI.softCard,
                padding: 12,
              }}
            >
              <Text style={{ color: UI.muted, fontWeight: "800" }}>Total Amount</Text>
              <Text style={{ color: UI.text, fontWeight: "900", marginTop: 6 }}>
                {fmtMoney(totalAmount)}
              </Text>
            </View>

            <View
              style={{
                flex: 1,
                borderWidth: 1,
                borderColor: "rgba(52,211,153,0.20)",
                borderRadius: 18,
                backgroundColor: "rgba(52,211,153,0.08)",
                padding: 12,
              }}
            >
              <Text style={{ color: UI.muted, fontWeight: "800" }}>Paid/Confirmed</Text>
              <Text style={{ color: UI.text, fontWeight: "900", marginTop: 6 }}>
                {fmtMoney(totalPaid)}
              </Text>
            </View>
          </View>
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

        <Pressable
          onPress={() => void loadData()}
          disabled={loading}
          style={{
            backgroundColor: UI.softCard,
            borderWidth: 1,
            borderColor: UI.border,
            paddingVertical: 14,
            borderRadius: 18,
            alignItems: "center",
            opacity: loading ? 0.65 : 1,
          }}
        >
          <Text style={{ color: UI.text, fontWeight: "900", fontSize: 16 }}>
            {loading ? "Loading..." : "Refresh History"}
          </Text>
        </Pressable>

        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder="Tafuta kwa email / status / reference / muamala / payout..."
          placeholderTextColor={UI.faint}
          style={{
            borderWidth: 1,
            borderColor: UI.border,
            borderRadius: 18,
            backgroundColor: UI.softCard,
            paddingHorizontal: 14,
            paddingVertical: 12,
            color: UI.text,
            fontWeight: "800",
          }}
        />

        {filtered.length === 0 ? (
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
              No commission history found
            </Text>
            <Text style={{ marginTop: 6, color: UI.muted, fontWeight: "700", lineHeight: 20 }}>
              Bado hakuna records za commission history.
            </Text>
          </View>
        ) : (
          filtered.map((r) => {
            const email = String(r.email ?? "").trim() || null;
            const initials = initialsFromEmail(email, "ST");
            const status = String(r.status ?? "").trim().toUpperCase() || "PENDING";

            return (
              <View
                key={String(r.payout_id)}
                style={{
                  borderWidth: 1,
                  borderColor: UI.border,
                  borderRadius: 22,
                  backgroundColor: UI.card,
                  padding: 16,
                  gap: 12,
                }}
              >
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <View
                    style={{
                      width: 46,
                      height: 46,
                      borderRadius: 999,
                      borderWidth: 1,
                      borderColor: "rgba(255,255,255,0.18)",
                      backgroundColor: UI.softCard,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Text style={{ color: UI.text, fontWeight: "900" }}>{initials}</Text>
                  </View>

                  <View style={{ flex: 1 }}>
                    <Text style={{ color: UI.text, fontWeight: "900" }}>
                      {email ?? `User: ${shortId(String(r.user_id ?? ""))}`}
                    </Text>
                    <Text style={{ color: UI.muted, fontWeight: "800", marginTop: 4 }}>
                      Membership: {shortId(String(r.membership_id ?? ""))}
                    </Text>
                  </View>

                  <View
                    style={{
                      borderWidth: 1,
                      borderColor: statusBorder(status),
                      backgroundColor: statusBg(status),
                      paddingHorizontal: 12,
                      paddingVertical: 7,
                      borderRadius: 999,
                    }}
                  >
                    <Text
                      style={{
                        color: statusColor(status),
                        fontWeight: "900",
                      }}
                    >
                      {status}
                    </Text>
                  </View>
                </View>

                <View style={{ flexDirection: "row", gap: 10 }}>
                  <View
                    style={{
                      flex: 1,
                      borderWidth: 1,
                      borderColor: UI.border,
                      borderRadius: 18,
                      backgroundColor: UI.softCard,
                      padding: 12,
                    }}
                  >
                    <Text style={{ color: UI.muted, fontWeight: "800" }}>Amount</Text>
                    <Text style={{ color: UI.text, fontWeight: "900", marginTop: 6 }}>
                      {fmtMoney(toNum(r.commission_amount))}
                    </Text>
                  </View>

                  <View
                    style={{
                      flex: 1,
                      borderWidth: 1,
                      borderColor: UI.border,
                      borderRadius: 18,
                      backgroundColor: UI.softCard,
                      padding: 12,
                    }}
                  >
                    <Text style={{ color: UI.muted, fontWeight: "800" }}>Payout</Text>
                    <Text style={{ color: UI.text, fontWeight: "900", marginTop: 6 }}>
                      {payoutLabel(r)}
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
                      padding: 12,
                    }}
                  >
                    <Text style={{ color: UI.muted, fontWeight: "800" }}>Paid Amount</Text>
                    <Text style={{ color: UI.text, fontWeight: "900", marginTop: 6 }}>
                      {fmtMoney(toNum(r.paid_amount))}
                    </Text>
                  </View>

                  <View
                    style={{
                      flex: 1,
                      borderWidth: 1,
                      borderColor: UI.border,
                      borderRadius: 18,
                      backgroundColor: UI.softCard,
                      padding: 12,
                    }}
                  >
                    <Text style={{ color: UI.muted, fontWeight: "800" }}>Remaining</Text>
                    <Text style={{ color: UI.text, fontWeight: "900", marginTop: 6 }}>
                      {fmtMoney(toNum(r.remaining_amount))}
                    </Text>
                  </View>
                </View>

                <View
                  style={{
                    borderWidth: 1,
                    borderColor: UI.border,
                    borderRadius: 18,
                    backgroundColor: UI.softCard,
                    padding: 12,
                    gap: 8,
                  }}
                >
                  <Text style={{ color: UI.muted, fontWeight: "800" }}>Period</Text>
                  <Text style={{ color: UI.text, fontWeight: "900" }}>
                    {String(r.period_key ?? "").trim() || "—"}
                  </Text>

                  <Text style={{ color: UI.muted, fontWeight: "800" }}>Reference</Text>
                  <Text style={{ color: UI.text, fontWeight: "900" }}>
                    {String(r.reference ?? "").trim() || "—"}
                  </Text>

                  <Text style={{ color: UI.muted, fontWeight: "800" }}>
                    Transaction Message / Note
                  </Text>
                  <Text style={{ color: UI.text, fontWeight: "800", lineHeight: 20 }}>
                    {String(r.note ?? "").trim() || "—"}
                  </Text>

                  <Text style={{ color: UI.faint, fontWeight: "800", lineHeight: 20 }}>
                    Hii inaweza kuwa message yote ya muamala iliyobandikwa wakati wa cash-out au
                    reference code ya malipo.
                  </Text>

                  <Text style={{ color: UI.muted, fontWeight: "800" }}>Received Note</Text>
                  <Text style={{ color: UI.text, fontWeight: "800", lineHeight: 20 }}>
                    {String(r.received_note ?? "").trim() || "—"}
                  </Text>
                </View>

                <View
                  style={{
                    borderWidth: 1,
                    borderColor: UI.border,
                    borderRadius: 18,
                    backgroundColor: UI.softCard,
                    padding: 12,
                    gap: 6,
                  }}
                >
                  <Text style={{ color: UI.muted, fontWeight: "800" }}>
                    Created At:{" "}
                    <Text style={{ color: UI.text }}>{fmtDateTime(r.created_at)}</Text>
                  </Text>

                  <Text style={{ color: UI.muted, fontWeight: "800" }}>
                    Sent At:{" "}
                    <Text style={{ color: UI.text }}>{fmtDateTime(r.sent_at)}</Text>
                  </Text>

                  <Text style={{ color: UI.muted, fontWeight: "800" }}>
                    Received At:{" "}
                    <Text style={{ color: UI.text }}>{fmtDateTime(r.received_at)}</Text>
                  </Text>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}