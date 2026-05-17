// app/(tabs)/staff/cash-out.tsx
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

type StaffCashoutRow = {
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

function shortId(v: string) {
  if (!v) return "—";
  return v.length > 10 ? `${v.slice(0, 8)}...` : v;
}

function toNum(v: any) {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function cleanMoneyInput(raw: string) {
  return String(raw ?? "").replace(/[^\d]/g, "");
}

function initialsFromEmail(email: string | null, fallback = "ST") {
  if (!email) return fallback;
  const base = email.split("@")[0]?.trim() ?? "";
  const letters = base.replace(/[^a-zA-Z]/g, "");
  if (letters.length >= 2) return letters.slice(0, 2).toUpperCase();
  if (letters.length === 1) return (letters + "T").toUpperCase();
  return fallback;
}

function payoutMethodLabel(row: StaffCashoutRow) {
  const method = String(row.payout_payment_method ?? "").trim().toUpperCase();

  if (method === "MOBILE") {
    const net = String(row.payout_mobile_network ?? "").trim();
    const num = String(row.payout_mobile_number ?? "").trim();
    if (net || num) return `${net || "Mobile"} • ${num || "—"}`;
    return "Mobile";
  }

  if (method === "BANK") {
    const bank = String(row.payout_bank_name ?? "").trim();
    const acc = String(row.payout_bank_account_number ?? "").trim();
    if (bank || acc) return `${bank || "Bank"} • ${acc || "—"}`;
    return "Bank";
  }

  return "No payout profile";
}

function payoutStatusMeta(row: StaffCashoutRow) {
  const paid = Math.max(0, toNum(row.paid_commission));
  const remaining = Math.max(0, toNum(row.remaining_commission));
  const hasProfile = !!row.payout_profile_configured;

  if (hasProfile && paid > 0 && remaining <= 0) {
    return {
      label: "PAID",
      color: UI.warning,
      borderColor: "rgba(245,158,11,0.25)",
      backgroundColor: "rgba(245,158,11,0.10)",
    };
  }

  if (hasProfile) {
    return {
      label: "READY",
      color: UI.emerald,
      borderColor: "rgba(52,211,153,0.30)",
      backgroundColor: "rgba(52,211,153,0.10)",
    };
  }

  return {
    label: "NO PROFILE",
    color: UI.warning,
    borderColor: "rgba(245,158,11,0.25)",
    backgroundColor: "rgba(245,158,11,0.10)",
  };
}

export default function StaffCommissionCashOutScreen() {
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

  const [rows, setRows] = useState<StaffCashoutRow[]>([]);
  const [q, setQ] = useState("");
  const [amountDrafts, setAmountDrafts] = useState<Record<string, string>>({});
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});

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

        const nextRows = ((data ?? []) as StaffCashoutRow[]).filter(
          (r) => String(r.role ?? "").toLowerCase() === "staff"
        );

        setRows(nextRows);

        setAmountDrafts((prev) => {
          const next = { ...prev };
          for (const row of nextRows) {
            const key = String(row.membership_id ?? "");
            if (!key) continue;
            if (prev[key] == null) {
              const remaining = Math.max(0, Math.round(toNum(row.remaining_commission)));
              next[key] = remaining > 0 ? String(remaining) : "";
            }
          }
          return next;
        });

        setNoteDrafts((prev) => {
          const next = { ...prev };
          for (const row of nextRows) {
            const key = String(row.membership_id ?? "");
            if (!key) continue;
            if (prev[key] == null) next[key] = "";
          }
          return next;
        });
      } catch (err: any) {
        setError(err?.message ?? "Failed to load commission cash-out dashboard");
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
        `${r.email ?? ""} ${r.membership_id ?? ""} ${r.user_id ?? ""} ${r.role ?? ""} ${r.payout_payment_method ?? ""} ${r.payout_mobile_number ?? ""} ${r.payout_bank_account_number ?? ""}`.toLowerCase();
      return hay.includes(needle);
    });
  }, [rows, q]);

  const totalRemaining = useMemo(
    () => rows.reduce((a, r) => a + toNum(r.remaining_commission), 0),
    [rows]
  );

  const totalPaid = useMemo(
    () => rows.reduce((a, r) => a + toNum(r.paid_commission), 0),
    [rows]
  );

  const cashOutNow = useCallback(
    async (row: StaffCashoutRow) => {
      if (!canManage) {
        Alert.alert("No Access", "Owner/Admin only.");
        return;
      }

      const membershipId = String(row.membership_id ?? "");
      const rawAmount = String(amountDrafts[membershipId] ?? "").trim();
      const amount = Number(rawAmount || 0);
      const remaining = Math.max(0, toNum(row.remaining_commission));
      const note = String(noteDrafts[membershipId] ?? "").trim();

      if (!membershipId) {
        Alert.alert("Failed", "Missing membership id.");
        return;
      }

      if (!row.payout_profile_configured) {
        Alert.alert("Blocked", "Staff huyu bado hajaweka payout profile.");
        return;
      }

      if (!Number.isFinite(amount) || amount <= 0) {
        Alert.alert("Blocked", "Weka amount sahihi ya cash out.");
        return;
      }

      if (amount > remaining) {
        Alert.alert("Blocked", "Amount haiwezi kuzidi remaining commission.");
        return;
      }

      try {
        setSavingMembershipId(membershipId);

        const { error: e } = await supabase.rpc("create_staff_commission_cashout_v1", {
          p_org_id: orgId,
          p_membership_id: membershipId,
          p_amount: amount,
          p_note: note || null,
        });

        if (e) throw e;

        Alert.alert("Success", "Commission cash-out saved successfully.");

        setAmountDrafts((prev) => ({
          ...prev,
          [membershipId]: "",
        }));

        setNoteDrafts((prev) => ({
          ...prev,
          [membershipId]: "",
        }));

        await loadData({ silent: true });
      } catch (err: any) {
        Alert.alert("Failed", err?.message ?? "Failed to create commission cash-out");
      } finally {
        setSavingMembershipId(null);
      }
    },
    [amountDrafts, noteDrafts, canManage, orgId, loadData]
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
              backgroundColor: "rgba(255,255,255,0.06)",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text style={{ color: UI.text, fontWeight: "900", fontSize: 18 }}>‹</Text>
          </Pressable>

          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 26, fontWeight: "900", color: UI.text }}>
              Commission Cash Out
            </Text>
            <Text style={{ color: UI.muted, fontWeight: "800", marginTop: 4 }}>
              Pay staff commission and reduce remaining balance
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
                backgroundColor: "rgba(255,255,255,0.05)",
                padding: 12,
              }}
            >
              <Text style={{ color: UI.muted, fontWeight: "800" }}>Total Paid</Text>
              <Text style={{ color: UI.text, fontWeight: "900", marginTop: 6 }}>
                {fmtMoney(totalPaid)}
              </Text>
            </View>

            <View
              style={{
                flex: 1,
                borderWidth: 1,
                borderColor: "rgba(245,158,11,0.22)",
                borderRadius: 18,
                backgroundColor: "rgba(245,158,11,0.08)",
                padding: 12,
              }}
            >
              <Text style={{ color: UI.muted, fontWeight: "800" }}>Remaining</Text>
              <Text style={{ color: UI.text, fontWeight: "900", marginTop: 6 }}>
                {fmtMoney(totalRemaining)}
              </Text>
            </View>
          </View>

          <Text style={{ color: UI.faint, fontWeight: "800", lineHeight: 20 }}>
            Cash-out itapunguza remaining commission ya staff husika na itaingia kwenye history.
          </Text>
        </View>

        <View style={{ flexDirection: "row", gap: 10 }}>
          <Pressable
            onPress={() => void loadData()}
            disabled={loading}
            style={{
              flex: 1,
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
              {loading ? "Loading..." : "Refresh Cash-Out Dashboard"}
            </Text>
          </Pressable>

          <Pressable
            onPress={() => router.push("/(tabs)/staff/commission-history")}
            style={{
              backgroundColor: "rgba(52,211,153,0.10)",
              borderWidth: 1,
              borderColor: "rgba(52,211,153,0.30)",
              paddingVertical: 14,
              paddingHorizontal: 16,
              borderRadius: 18,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text style={{ color: UI.text, fontWeight: "900", fontSize: 16 }}>
              History
            </Text>
          </Pressable>
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

        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder="Tafuta kwa email / membership / payout / reference..."
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
              No staff commission data found
            </Text>
            <Text style={{ marginTop: 6, color: UI.muted, fontWeight: "700", lineHeight: 20 }}>
              Hakuna data ya cash-out kwa sasa.
            </Text>
          </View>
        ) : (
          filtered.map((r) => {
            const membershipId = String(r.membership_id ?? "");
            const email = String(r.email ?? "").trim() || null;
            const initials = initialsFromEmail(email, "ST");

            const accrued = Math.max(0, toNum(r.accrued_commission));
            const paid = Math.max(0, toNum(r.paid_commission));
            const remaining = Math.max(0, toNum(r.remaining_commission));

            const amountDraft = amountDrafts[membershipId] ?? "";
            const noteDraft = noteDrafts[membershipId] ?? "";
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
                    const meta = payoutStatusMeta(r);
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
                        <Text
                          style={{
                            color: meta.color,
                            fontWeight: "900",
                          }}
                        >
                          {meta.label}
                        </Text>
                      </View>
                    );
                  })()}
                </View>

                <View
                  style={{
                    borderWidth: 1,
                    borderColor: UI.border,
                    borderRadius: 18,
                    backgroundColor: "rgba(255,255,255,0.04)",
                    padding: 12,
                    gap: 8,
                  }}
                >
                  <Text style={{ color: UI.muted, fontWeight: "800" }}>Payout Destination</Text>
                  <Text style={{ color: UI.text, fontWeight: "900", marginTop: 2 }}>
                    {payoutMethodLabel(r)}
                  </Text>

                  <Text style={{ color: UI.muted, fontWeight: "800" }}>
                    Account Holder
                  </Text>
                  <Text style={{ color: UI.text, fontWeight: "900" }}>
                    {String(r.payout_account_holder_name ?? "").trim() || "—"}
                  </Text>

                  {String(r.payout_payment_method ?? "").trim().toUpperCase() === "MOBILE" ? (
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

                  {String(r.payout_payment_method ?? "").trim().toUpperCase() === "BANK" ? (
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
                    <Text style={{ color: UI.muted, fontWeight: "800" }}>Accrued</Text>
                    <Text style={{ color: UI.text, fontWeight: "900", marginTop: 6 }}>
                      {fmtMoney(accrued)}
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
                    <Text style={{ color: UI.muted, fontWeight: "800" }}>Paid</Text>
                    <Text style={{ color: UI.text, fontWeight: "900", marginTop: 6 }}>
                      {fmtMoney(paid)}
                    </Text>
                  </View>

                  <View
                    style={{
                      flex: 1,
                      borderWidth: 1,
                      borderColor: "rgba(245,158,11,0.25)",
                      borderRadius: 18,
                      backgroundColor: "rgba(245,158,11,0.08)",
                      padding: 12,
                    }}
                  >
                    <Text style={{ color: UI.muted, fontWeight: "800" }}>Remaining</Text>
                    <Text style={{ color: UI.text, fontWeight: "900", marginTop: 6 }}>
                      {fmtMoney(remaining)}
                    </Text>
                  </View>
                </View>

                <View>
                  <Text style={{ color: UI.muted, fontWeight: "800", marginBottom: 6 }}>
                    Cash Out Amount
                  </Text>
                  <TextInput
                    value={amountDraft}
                    onChangeText={(v) =>
                      setAmountDrafts((prev) => ({
                        ...prev,
                        [membershipId]: cleanMoneyInput(v),
                      }))
                    }
                    placeholder="mf: 50000"
                    placeholderTextColor="rgba(255,255,255,0.35)"
                    keyboardType="numeric"
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

                <View>
                  <Text style={{ color: UI.muted, fontWeight: "800", marginBottom: 6 }}>
                    Payment Reference / Transaction Message
                  </Text>
                  <TextInput
                    value={noteDraft}
                    onChangeText={(v) =>
                      setNoteDrafts((prev) => ({
                        ...prev,
                        [membershipId]: v,
                      }))
                    }
                    placeholder="Bandika SMS/message ya muamala wote au andika reference code ya malipo"
                    placeholderTextColor="rgba(255,255,255,0.35)"
                    multiline
                    textAlignVertical="top"
                    style={{
                      borderWidth: 1,
                      borderColor: UI.border,
                      borderRadius: 18,
                      backgroundColor: "rgba(255,255,255,0.05)",
                      paddingHorizontal: 14,
                      paddingVertical: 12,
                      minHeight: 96,
                      color: UI.text,
                      fontWeight: "800",
                    }}
                  />
                  <Text style={{ color: UI.faint, fontWeight: "800", marginTop: 8, lineHeight: 20 }}>
                    Owner/Admin anaweza kubandika message yote ya muamala au reference code ya
                    malipo ili staff aweze kuilinganisha na fedha iliyoingia kwenye simu au bank.
                  </Text>
                </View>

                <Pressable
                  onPress={() => void cashOutNow(r)}
                  disabled={isSaving || !r.payout_profile_configured || remaining <= 0}
                  style={{
                    borderWidth: 1,
                    borderColor:
                      !r.payout_profile_configured || remaining <= 0
                        ? UI.border
                        : "rgba(52,211,153,0.30)",
                    borderRadius: 18,
                    backgroundColor:
                      !r.payout_profile_configured || remaining <= 0
                        ? "rgba(255,255,255,0.05)"
                        : "rgba(52,211,153,0.10)",
                    paddingVertical: 14,
                    alignItems: "center",
                    opacity: isSaving || !r.payout_profile_configured || remaining <= 0 ? 0.55 : 1,
                  }}
                >
                  <Text style={{ color: UI.text, fontWeight: "900" }}>
                    {isSaving ? "Processing..." : "Cash Out Now"}
                  </Text>
                </Pressable>

                {!r.payout_profile_configured ? (
                  <Text style={{ color: UI.warning, fontWeight: "800", lineHeight: 20 }}>
                    Staff huyu bado hajaweka payout profile, hivyo cash out haijawezeshwa.
                  </Text>
                ) : null}

                {remaining <= 0 ? (
                  <Text style={{ color: UI.faint, fontWeight: "800", lineHeight: 20 }}>
                    Commission ya mwezi huu imelipwa tayari. Cash-out mpya itasoma tena commission mpya itakapoingia.
                  </Text>
                ) : null}
              </View>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}