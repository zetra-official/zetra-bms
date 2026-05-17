// app/(tabs)/staff/commission.tsx
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
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

import { useOrg } from "../../../src/context/OrgContext";
import { supabase } from "../../../src/supabase/supabaseClient";
import { formatMoney, useOrgMoneyPrefs } from "@/src/ui/money";

type StaffCommissionRow = {
  membership_id: string;
  user_id: string;
  email: string | null;
  role: string | null;
  total_sales: number | string | null;
  sales_count: number | string | null;
  commission_percent: number | string | null;

  accrued_commission: number | string | null;
  paid_commission: number | string | null;
  remaining_commission: number | string | null;

  payout_payment_method: string | null;
  payout_mobile_network: string | null;
  payout_mobile_number: string | null;
  payout_bank_name: string | null;
  payout_bank_account_name: string | null;
  payout_bank_account_number: string | null;
  payout_account_holder_name: string | null;
  payout_profile_configured: boolean | null;
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

function cleanPercentInput(raw: string) {
  return String(raw ?? "")
    .replace(/[^\d.]/g, "")
    .replace(/(\..*)\./g, "$1");
}

function toPercentValue(raw: string) {
  const n = Number(String(raw ?? "").trim());
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, n));
}

function initialsFromEmail(email: string | null, fallback = "ST") {
  if (!email) return fallback;
  const base = email.split("@")[0]?.trim() ?? "";
  const letters = base.replace(/[^a-zA-Z]/g, "");
  if (letters.length >= 2) return letters.slice(0, 2).toUpperCase();
  if (letters.length === 1) return (letters + "T").toUpperCase();
  return fallback;
}

function commissionStatusMeta(row: StaffCommissionRow) {
  const paid = Math.max(0, toNum(row.paid_commission));
  const remaining = Math.max(0, toNum(row.remaining_commission));
  const hasProfile = !!row.payout_profile_configured;

  if (paid > 0 && remaining <= 0) {
    return {
      label: "PAID THIS MONTH",
      color: UI.emerald,
      borderColor: "rgba(52,211,153,0.30)",
      backgroundColor: "rgba(52,211,153,0.10)",
    };
  }

  if (hasProfile) {
    return {
      label: "ACCRUING",
      color: UI.text,
      borderColor: UI.border,
      backgroundColor: "rgba(255,255,255,0.06)",
    };
  }

  return {
    label: "NO PROFILE",
    color: UI.danger,
    borderColor: "rgba(251,113,133,0.28)",
    backgroundColor: "rgba(251,113,133,0.08)",
  };
}

export default function StaffCommissionScreen() {
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
  const [savingMembershipId, setSavingMembershipId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [rows, setRows] = useState<StaffCommissionRow[]>([]);
  const [q, setQ] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string>>({});

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
  "get_org_staff_commission_dashboard_v2",
  { p_org_id: orgId }
);

        if (e) throw e;

        const nextRows = ((data ?? []) as StaffCommissionRow[]).filter(
          (r) => String(r.role ?? "").toLowerCase() === "staff"
        );

        setRows(nextRows);

        setDrafts((prev) => {
          const next = { ...prev };
          for (const row of nextRows) {
            const key = String(row.membership_id ?? "");
            if (!key) continue;
            if (prev[key] == null) {
              next[key] = String(toNum(row.commission_percent));
            }
          }
          return next;
        });
      } catch (err: any) {
        setError(err?.message ?? "Failed to load staff commission");
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
      const hay = `${r.email ?? ""} ${r.membership_id ?? ""} ${r.user_id ?? ""} ${r.role ?? ""}`.toLowerCase();
      return hay.includes(needle);
    });
  }, [rows, q]);

  const savePercent = useCallback(
    async (membershipId: string) => {
      if (!canManage) {
        Alert.alert("No Access", "Owner/Admin only.");
        return;
      }

      const raw = String(drafts[membershipId] ?? "").trim();
      const percent = toPercentValue(raw);

      try {
        setSavingMembershipId(membershipId);

       const { error: e } = await supabase.rpc("set_staff_commission_percent_v2", {
  p_org_id: orgId,
  p_membership_id: membershipId,
  p_percent: percent,
});

if (e) throw e;

setDrafts((prev) => ({
  ...prev,
  [membershipId]: String(percent),
}));

await loadData({ silent: true });

Alert.alert("Success", "Commission rate saved.");
      } catch (err: any) {
        Alert.alert("Failed", err?.message ?? "Failed to save commission rate");
      } finally {
        setSavingMembershipId(null);
      }
    },
    [canManage, drafts, orgId]
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
                backgroundColor: "rgba(255,255,255,0.05)",
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
          padding: 16,
          paddingBottom: 190,
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
              backgroundColor: "rgba(255,255,255,0.06)",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text style={{ color: UI.text, fontWeight: "900", fontSize: 18 }}>‹</Text>
          </Pressable>

          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 26, fontWeight: "900", color: UI.text }}>
              Staff Sales & Commission
            </Text>
            <Text style={{ color: UI.muted, fontWeight: "800", marginTop: 4 }}>
              Monthly summary for staff only
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

          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <Text style={{ color: UI.muted, fontWeight: "800" }}>Role:</Text>
            <View
              style={{
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.18)",
                backgroundColor: "rgba(255,255,255,0.06)",
                paddingHorizontal: 12,
                paddingVertical: 6,
                borderRadius: 999,
              }}
            >
              <Text style={{ color: UI.text, fontWeight: "900" }}>
                {String(activeRole ?? "—").toUpperCase()}
              </Text>
            </View>
          </View>

          <Text style={{ color: UI.faint, fontWeight: "800", lineHeight: 20 }}>
            Mfumo huu unaonyesha mauzo ya mwezi wa sasa kwa STAFF tu. Ukijaza 0, mauzo yanaendelea kuonekana kawaida lakini commission inabaki 0.
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

        <View
          style={{
            flexDirection: "row",
            gap: 10,
          }}
        >
          <View
            style={{
              flex: 1,
              borderWidth: 1,
              borderColor: UI.border,
              borderRadius: 18,
              backgroundColor: "rgba(255,255,255,0.05)",
              padding: 14,
            }}
          >
            <Text style={{ color: UI.muted, fontWeight: "800" }}>Staff Count</Text>
            <Text style={{ color: UI.text, fontWeight: "900", fontSize: 22, marginTop: 6 }}>
              {rows.length}
            </Text>
          </View>

          <View
            style={{
              flex: 1,
              borderWidth: 1,
              borderColor: UI.border,
              borderRadius: 18,
              backgroundColor: "rgba(255,255,255,0.05)",
              padding: 14,
            }}
          >
            <Text style={{ color: UI.muted, fontWeight: "800" }}>Total Staff Sales</Text>
            <Text style={{ color: UI.text, fontWeight: "900", fontSize: 18, marginTop: 6 }}>
              {fmtMoney(rows.reduce((a, r) => a + toNum(r.total_sales), 0))}
            </Text>
          </View>
        </View>

        <View
          style={{
            borderWidth: 1,
            borderColor: "rgba(52,211,153,0.20)",
            borderRadius: 18,
            backgroundColor: "rgba(52,211,153,0.08)",
            padding: 14,
          }}
        >
          <Text style={{ color: UI.muted, fontWeight: "800" }}>Total Remaining Commission</Text>
          <Text style={{ color: UI.text, fontWeight: "900", fontSize: 20, marginTop: 6 }}>
            {fmtMoney(rows.reduce((a, r) => a + toNum(r.remaining_commission), 0))}
          </Text>
        </View>

        <Pressable
          onPress={() => void loadData()}
          disabled={loading}
          style={{
            backgroundColor: "rgba(255,255,255,0.05)",
            borderWidth: 1,
            borderColor: UI.border,
            paddingVertical: 14,
            borderRadius: 18,
            alignItems: "center",
            opacity: loading ? 0.65 : 1,
          }}
        >
          <Text style={{ color: UI.text, fontWeight: "900", fontSize: 16 }}>
            {loading ? "Loading..." : "Refresh Commission List"}
          </Text>
        </Pressable>

        <View style={{ marginBottom: 8 }}>
          <TextInput
            value={q}
          onChangeText={setQ}
          placeholder="Tafuta kwa email / membership / role..."
          placeholderTextColor="rgba(255,255,255,0.35)"
          style={{
            borderWidth: 1,
            borderColor: UI.border,
            borderRadius: 18,
            backgroundColor: "rgba(255,255,255,0.05)",
            paddingHorizontal: 14,
            paddingVertical: 12,
            color: UI.text,
            fontWeight: "800",
          }}
        />
        </View>

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
              No staff sales found
            </Text>
            <Text style={{ marginTop: 6, color: UI.muted, fontWeight: "700", lineHeight: 20 }}>
              Hakuna data ya staff ya mwezi huu bado, au attribution ya mauzo haijaanza kujaza kwa staff.
            </Text>
          </View>
        ) : (
          filtered.map((r) => {
            const membershipId = String(r.membership_id ?? "");
            const email = String(r.email ?? "").trim() || null;
            const initials = initialsFromEmail(email, "ST");
            const totalSales = toNum(r.total_sales);
            const salesCount = Math.trunc(toNum(r.sales_count));
            const commissionPercent = toNum(r.commission_percent);
const accruedCommission = toNum(r.accrued_commission);
const paidCommission = toNum(r.paid_commission);
const remainingCommission = toNum(r.remaining_commission);

const payoutProfileConfigured = !!r.payout_profile_configured;
const payoutMethod = String(r.payout_payment_method ?? "").trim();
const payoutDestination =
  payoutMethod === "MOBILE"
    ? String(r.payout_mobile_number ?? "").trim()
    : payoutMethod === "BANK"
      ? String(r.payout_bank_account_number ?? "").trim()
      : "";

const draft = drafts[membershipId] ?? String(commissionPercent);
const isSaving = savingMembershipId === membershipId;

            return (
              <View
                key={membershipId}
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
                      backgroundColor: "rgba(255,255,255,0.06)",
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
                      Membership: {shortId(membershipId)}
                    </Text>
                  </View>

                  {(() => {
                    const meta = commissionStatusMeta(r);
                    return (
                      <View
                        style={{
                          borderWidth: 1,
                          borderColor: meta.borderColor,
                          backgroundColor: meta.backgroundColor,
                          paddingHorizontal: 12,
                          paddingVertical: 7,
                          borderRadius: 999,
                        }}
                      >
                        <Text style={{ color: meta.color, fontWeight: "900" }}>
                          {meta.label}
                        </Text>
                      </View>
                    );
                  })()}
                </View>

                <View style={{ flexDirection: "row", gap: 10 }}>
                  <View
                    style={{
                      flex: 1,
                      borderWidth: 1,
                      borderColor: UI.border,
                      borderRadius: 18,
                      backgroundColor: "rgba(255,255,255,0.04)",
                      padding: 12,
                    }}
                  >
                    <Text style={{ color: UI.muted, fontWeight: "800" }}>Sales</Text>
                    <Text style={{ color: UI.text, fontWeight: "900", marginTop: 6 }}>
                      {fmtMoney(totalSales)}
                    </Text>
                  </View>

                  <View
                    style={{
                      flex: 1,
                      borderWidth: 1,
                      borderColor: UI.border,
                      borderRadius: 18,
                      backgroundColor: "rgba(255,255,255,0.04)",
                      padding: 12,
                    }}
                  >
                    <Text style={{ color: UI.muted, fontWeight: "800" }}>Sales Count</Text>
                    <Text style={{ color: UI.text, fontWeight: "900", marginTop: 6 }}>
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
                      padding: 12,
                    }}
                  >
                    <Text style={{ color: UI.muted, fontWeight: "800" }}>Rate</Text>
                    <Text style={{ color: UI.text, fontWeight: "900", marginTop: 6 }}>
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
                      padding: 12,
                    }}
                  >
                    <Text style={{ color: UI.muted, fontWeight: "800" }}>Accrued</Text>
                    <Text style={{ color: UI.text, fontWeight: "900", marginTop: 6 }}>
                      {fmtMoney(accruedCommission)}
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
                      backgroundColor: "rgba(255,255,255,0.04)",
                      padding: 12,
                    }}
                  >
                    <Text style={{ color: UI.muted, fontWeight: "800" }}>Paid</Text>
                    <Text style={{ color: UI.text, fontWeight: "900", marginTop: 6 }}>
                      {fmtMoney(paidCommission)}
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
                    <Text style={{ color: UI.muted, fontWeight: "800" }}>Remaining</Text>
                    <Text style={{ color: UI.text, fontWeight: "900", marginTop: 6 }}>
                      {fmtMoney(remainingCommission)}
                    </Text>
                  </View>
                </View>

                <View
                  style={{
                    borderWidth: 1,
                    borderColor: payoutProfileConfigured
                      ? "rgba(52,211,153,0.20)"
                      : "rgba(251,113,133,0.28)",
                    borderRadius: 18,
                    backgroundColor: payoutProfileConfigured
                      ? "rgba(52,211,153,0.08)"
                      : "rgba(251,113,133,0.08)",
                    padding: 12,
                    gap: 8,
                  }}
                >
                  <Text
                    style={{
                      color: payoutProfileConfigured ? UI.emerald : UI.danger,
                      fontWeight: "900",
                      fontSize: 12,
                    }}
                  >
                    {payoutProfileConfigured ? "PAYOUT PROFILE READY" : "PAYOUT PROFILE MISSING"}
                  </Text>

                  {!payoutProfileConfigured ? (
                    <Text style={{ color: UI.text, fontWeight: "900", marginTop: 2 }}>
                      Staff hajajaza destination ya commission bado.
                    </Text>
                  ) : (
                    <>
                      <Text style={{ color: UI.text, fontWeight: "900", marginTop: 2 }}>
                        {payoutMethod || "—"}{payoutDestination ? ` • ${payoutDestination}` : ""}
                      </Text>

                      <Text style={{ color: UI.muted, fontWeight: "800" }}>
                        Account Holder
                      </Text>
                      <Text style={{ color: UI.text, fontWeight: "900" }}>
                        {String(r.payout_account_holder_name ?? "").trim() || "—"}
                      </Text>

                      {payoutMethod.toUpperCase() === "MOBILE" ? (
                        <>
                          <Text style={{ color: UI.muted, fontWeight: "800" }}>Network</Text>
                          <Text style={{ color: UI.text, fontWeight: "900" }}>
                            {String(r.payout_mobile_network ?? "").trim() || "—"}
                          </Text>

                          <Text style={{ color: UI.muted, fontWeight: "800" }}>Mobile Number</Text>
                          <Text style={{ color: UI.text, fontWeight: "900" }}>
                            {String(r.payout_mobile_number ?? "").trim() || "—"}
                          </Text>
                        </>
                      ) : null}

                      {payoutMethod.toUpperCase() === "BANK" ? (
                        <>
                          <Text style={{ color: UI.muted, fontWeight: "800" }}>Bank</Text>
                          <Text style={{ color: UI.text, fontWeight: "900" }}>
                            {String(r.payout_bank_name ?? "").trim() || "—"}
                          </Text>

                          <Text style={{ color: UI.muted, fontWeight: "800" }}>Bank Account Name</Text>
                          <Text style={{ color: UI.text, fontWeight: "900" }}>
                            {String(r.payout_bank_account_name ?? "").trim() || "—"}
                          </Text>

                          <Text style={{ color: UI.muted, fontWeight: "800" }}>Bank Account Number</Text>
                          <Text style={{ color: UI.text, fontWeight: "900" }}>
                            {String(r.payout_bank_account_number ?? "").trim() || "—"}
                          </Text>
                        </>
                      ) : null}
                    </>
                  )}
                </View>

                <View>
                  <Text style={{ color: UI.muted, fontWeight: "800", marginBottom: 6 }}>
                    Set Commission %
                  </Text>

                  <View style={{ flexDirection: "row", gap: 10 }}>
                    <TextInput
                      value={draft}
                      onChangeText={(v) =>
                        setDrafts((prev) => ({
                          ...prev,
                          [membershipId]: cleanPercentInput(v),
                        }))
                      }
                      placeholder="0"
                      placeholderTextColor="rgba(255,255,255,0.35)"
                      keyboardType="numeric"
                      style={{
                        flex: 1,
                        borderWidth: 1,
                        borderColor: UI.border,
                        borderRadius: 18,
                        backgroundColor: "rgba(255,255,255,0.05)",
                        paddingHorizontal: 14,
                        paddingVertical: 12,
                        color: UI.text,
                        fontWeight: "800",
                      }}
                    />

                    <Pressable
                      onPress={() => void savePercent(membershipId)}
                      disabled={isSaving}
                      style={{
                        minWidth: 110,
                        borderWidth: 1,
                        borderColor: "rgba(52,211,153,0.30)",
                        borderRadius: 18,
                        backgroundColor: "rgba(52,211,153,0.10)",
                        paddingHorizontal: 14,
                        paddingVertical: 12,
                        alignItems: "center",
                        justifyContent: "center",
                        opacity: isSaving ? 0.65 : 1,
                      }}
                    >
                      <Text style={{ color: UI.text, fontWeight: "900" }}>
                        {isSaving ? "Saving..." : "Save"}
                      </Text>
                    </Pressable>
                  </View>

                  <Text style={{ color: UI.faint, fontWeight: "800", marginTop: 8, lineHeight: 20 }}>
                    Ukiweka 0, sales zitaendelea kuonekana lakini commission itabaki 0.
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