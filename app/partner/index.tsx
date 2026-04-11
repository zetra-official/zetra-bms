import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Pressable, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";

import { Screen } from "@/src/ui/Screen";
import { Card } from "@/src/ui/Card";
import { UI } from "@/src/ui/theme";
import { supabase } from "@/src/supabase/supabaseClient";

type PartnerSummaryRow = {
  partner_id?: string | null;
  referral_code?: string | null;
  status?: string | null;

  total_referrals?: number | null;
  active_referrals?: number | null;

  total_earned_tzs?: number | null;
  total_paid_tzs?: number | null;
  total_unpaid_tzs?: number | null;

  customers_needing_followup?: number | null;
  renewals_due_soon?: number | null;

  created_at?: string | null;
  activated_at?: string | null;
};

type ReferralRow = {
  referral_id?: string | null;
  referred_user_id?: string | null;
  referred_email_snapshot?: string | null;
  referral_code_used?: string | null;
  status?: string | null;
  linked_at?: string | null;
  ended_at?: string | null;
  total_commission_tzs?: number | null;
  paid_commission_tzs?: number | null;
  unpaid_commission_tzs?: number | null;
};

type PartnerPayoutProfileRow = {
  partner_id?: string | null;
  payout_method?: string | null;
  payout_phone?: string | null;
  payout_account_name?: string | null;
  payout_notes?: string | null;
  payout_updated_at?: string | null;
};

type CommissionRow = {
  commission_id?: string | null;
  referral_id?: string | null;
  referred_user_id?: string | null;
  referred_email_snapshot?: string | null;
  subscription_payment_request_id?: string | null;

  payment_amount_tzs?: number | null;
  monthly_charge_tzs?: number | null;
  months_paid_count?: number | null;
  commission_month_number?: number | null;

  commission_percent?: number | null;
  commission_amount_tzs?: number | null;
  payment_sequence_number?: number | null;
  commission_status?: string | null;

  earned_at?: string | null;
  approved_at?: string | null;
  paid_at?: string | null;
  unlock_at?: string | null;

  payout_id?: string | null;
  notes?: string | null;
};

type PartnerPayoutRow = {
  payout_id?: string | null;
  payout_amount_tzs?: number | null;
  payout_status?: string | null;
  payout_method?: string | null;
  payout_reference?: string | null;
  payout_note?: string | null;
  payout_date?: string | null;
  receiver_confirmed_at?: string | null;
  receiver_confirmation_note?: string | null;
};

function clean(v: any) {
  return String(v ?? "").trim();
}

function upper(v: any) {
  return clean(v).toUpperCase();
}

function fmtMoney(v: any, currencyCode?: string | null) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  const code = upper(currencyCode || "TZS");
  return `${code} ${Math.round(n).toLocaleString("en-US")}`;
}

function fmtDateTime(v: any) {
  const s = clean(v);
  if (!s) return "—";

  try {
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return s;

    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");

    return `${y}-${m}-${dd} ${hh}:${mm}`;
  } catch {
    return s;
  }
}

function hasMoney(v: any) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0;
}

function hasCount(v: any) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0;
}

function isReadyCommission(status: any) {
  const s = upper(status);
  return s === "EARNED" || s === "APPROVED";
}

function isLockedCommission(status: any) {
  return upper(status) === "LOCKED";
}

function isPaidCommission(status: any) {
  return upper(status) === "PAID";
}

function commissionStateNote(row: CommissionRow) {
  const status = upper(row.commission_status);

  if (status === "PAID") {
    return "Commission hii tayari imelipwa.";
  }

  if (status === "LOCKED") {
    return clean(row.unlock_at)
      ? `Commission hii imefungwa hadi ${fmtDateTime(row.unlock_at)}.`
      : "Commission hii bado imefungwa mpaka muda wake ufike.";
  }

  if (status === "APPROVED") {
    return "Commission hii iko tayari kulipwa na imeidhinishwa.";
  }

  if (status === "EARNED") {
    return "Commission hii iko tayari kulipwa.";
  }

  return "Commission status inaendelea kufuatiliwa.";
}

function payoutTone(status: string) {
  const s = upper(status);

  if (s === "CONFIRMED") {
    return {
      borderColor: "rgba(16,185,129,0.35)",
      backgroundColor: "rgba(16,185,129,0.12)",
      text: "CONFIRMED",
    };
  }

  if (s === "PAID") {
    return {
      borderColor: "rgba(59,130,246,0.28)",
      backgroundColor: "rgba(59,130,246,0.10)",
      text: "PAID",
    };
  }

  if (s === "PENDING") {
    return {
      borderColor: "rgba(245,158,11,0.28)",
      backgroundColor: "rgba(245,158,11,0.10)",
      text: "PENDING",
    };
  }

  if (s === "CANCELLED") {
    return {
      borderColor: "rgba(239,68,68,0.28)",
      backgroundColor: "rgba(239,68,68,0.10)",
      text: "CANCELLED",
    };
  }

  return {
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(255,255,255,0.04)",
    text: s || "UNKNOWN",
  };
}

function commissionTone(status: string) {
  const s = upper(status);

  if (s === "PAID") {
    return {
      borderColor: "rgba(16,185,129,0.22)",
      backgroundColor: "rgba(16,185,129,0.08)",
      text: "PAID",
    };
  }

  if (s === "LOCKED") {
    return {
      borderColor: "rgba(245,158,11,0.22)",
      backgroundColor: "rgba(245,158,11,0.08)",
      text: "LOCKED",
    };
  }

  if (s === "EARNED") {
    return {
      borderColor: "rgba(59,130,246,0.22)",
      backgroundColor: "rgba(59,130,246,0.08)",
      text: "EARNED",
    };
  }

  if (s === "APPROVED") {
    return {
      borderColor: "rgba(168,85,247,0.22)",
      backgroundColor: "rgba(168,85,247,0.08)",
      text: "APPROVED",
    };
  }

  return {
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(255,255,255,0.04)",
    text: s || "UNKNOWN",
  };
}

function statusTone(status: string) {
  const s = upper(status);

  if (s === "ACTIVE") {
    return {
      borderColor: "rgba(16,185,129,0.35)",
      backgroundColor: "rgba(16,185,129,0.12)",
      text: "ACTIVE",
    };
  }

  if (s === "SUSPENDED") {
    return {
      borderColor: "rgba(239,68,68,0.35)",
      backgroundColor: "rgba(239,68,68,0.12)",
      text: "SUSPENDED",
    };
  }

  if (s === "PENDING") {
    return {
      borderColor: "rgba(245,158,11,0.35)",
      backgroundColor: "rgba(245,158,11,0.12)",
      text: "PENDING",
    };
  }

  return {
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(255,255,255,0.06)",
    text: s || "UNKNOWN",
  };
}

function StatCard({
  label,
  value,
  green,
}: {
  label: string;
  value: string;
  green?: boolean;
}) {
  return (
    <View
      style={{
        minWidth: "47%",
        flex: 1,
        borderWidth: 1,
        borderColor: green ? "rgba(16,185,129,0.22)" : "rgba(255,255,255,0.10)",
        backgroundColor: green ? "rgba(16,185,129,0.08)" : "rgba(255,255,255,0.04)",
        borderRadius: 16,
        padding: 12,
      }}
    >
      <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 11 }}>{label}</Text>
      <Text style={{ color: UI.text, fontWeight: "900", fontSize: 18, marginTop: 6 }}>
        {value}
      </Text>
    </View>
  );
}

export default function PartnerDashboardScreen() {
  const router = useRouter();

  const [checking, setChecking] = useState(true);
  const [allowed, setAllowed] = useState(false);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [summary, setSummary] = useState<PartnerSummaryRow | null>(null);
  const [referrals, setReferrals] = useState<ReferralRow[]>([]);
  const [commissions, setCommissions] = useState<CommissionRow[]>([]);
  const [payouts, setPayouts] = useState<PartnerPayoutRow[]>([]);
  const [errorText, setErrorText] = useState("");

  const [payoutProfile, setPayoutProfile] = useState<PartnerPayoutProfileRow | null>(null);
  const [savingPayoutProfile, setSavingPayoutProfile] = useState(false);
  const [confirmingPayoutId, setConfirmingPayoutId] = useState("");
  const [confirmReceiptNote, setConfirmReceiptNote] = useState("");

  const [payoutMethodInput, setPayoutMethodInput] = useState("MOBILE_MONEY");
  const [payoutPhoneInput, setPayoutPhoneInput] = useState("");
  const [payoutAccountNameInput, setPayoutAccountNameInput] = useState("");
  const [payoutNotesInput, setPayoutNotesInput] = useState("");

  const statusUi = useMemo(() => statusTone(summary?.status || ""), [summary?.status]);

  const loadPartnerData = useCallback(async () => {
    setErrorText("");

    try {
      await supabase.rpc("gp_unlock_due_commissions_v1");

      const [
        { data: authData, error: authError },
        { data: summaryData, error: summaryError },
        { data: referralsData, error: referralsError },
        { data: commissionsData, error: commissionsError },
        { data: payoutProfileData, error: payoutProfileError },
        { data: payoutsData, error: payoutsError },
      ] = await Promise.all([
        supabase.auth.getUser(),
        supabase.rpc("gp_my_dashboard_summary_v1"),
        supabase.rpc("gp_my_referrals_v1"),
        supabase.rpc("gp_my_commissions_v1"),
        supabase.rpc("gp_my_payout_profile_v1"),
        supabase.rpc("gp_my_payouts_v1"),
      ]);

      if (authError) throw authError;
      if (summaryError) throw summaryError;
      if (referralsError) throw referralsError;
      if (commissionsError) throw commissionsError;
      if (payoutProfileError) throw payoutProfileError;
      if (payoutsError) throw payoutsError;

      const userId = clean(authData?.user?.id);
      if (!userId) {
        throw new Error("User session not found.");
      }

      const summaryRow = Array.isArray(summaryData)
        ? ((summaryData?.[0] ?? null) as PartnerSummaryRow | null)
        : ((summaryData ?? null) as PartnerSummaryRow | null);

      if (!summaryRow?.partner_id) {
        setAllowed(false);
        setSummary(null);
        setReferrals([]);
        setCommissions([]);
        setPayouts([]);
        setPayoutProfile(null);
        setPayoutMethodInput("MOBILE_MONEY");
        setPayoutPhoneInput("");
        setPayoutAccountNameInput("");
        setPayoutNotesInput("");
        setErrorText(
          "Partner dashboard haijafunguliwa kwenye akaunti hii bado. Office inatakiwa iku-link kwa email kwanza."
        );
        return;
      }

      setAllowed(true);
      setSummary(summaryRow ?? null);
      setReferrals((Array.isArray(referralsData) ? referralsData : []) as ReferralRow[]);

      const payoutRow = Array.isArray(payoutProfileData)
        ? ((payoutProfileData?.[0] ?? null) as PartnerPayoutProfileRow | null)
        : ((payoutProfileData ?? null) as PartnerPayoutProfileRow | null);

      setPayoutProfile(payoutRow ?? null);
      setPayoutMethodInput(upper(payoutRow?.payout_method || "MOBILE_MONEY") || "MOBILE_MONEY");
      setPayoutPhoneInput(clean(payoutRow?.payout_phone));
      setPayoutAccountNameInput(clean(payoutRow?.payout_account_name));
      setPayoutNotesInput(clean(payoutRow?.payout_notes));

      const payoutRows = (Array.isArray(payoutsData) ? payoutsData : []) as PartnerPayoutRow[];
      setPayouts(payoutRows);

      const commissionRows = (Array.isArray(commissionsData)
        ? commissionsData
        : []) as CommissionRow[];

      commissionRows.sort((a, b) => {
        const aPaidAt = clean(a.paid_at);
        const bPaidAt = clean(b.paid_at);

        if (aPaidAt && bPaidAt) {
          return new Date(bPaidAt).getTime() - new Date(aPaidAt).getTime();
        }

        const aUnlock = clean(a.unlock_at);
        const bUnlock = clean(b.unlock_at);

        if (aUnlock && bUnlock) {
          return new Date(aUnlock).getTime() - new Date(bUnlock).getTime();
        }

        const aMonth = Number(a.commission_month_number ?? 0);
        const bMonth = Number(b.commission_month_number ?? 0);
        if (aMonth !== bMonth) return aMonth - bMonth;

        return new Date(clean(b.earned_at) || 0).getTime() - new Date(clean(a.earned_at) || 0).getTime();
      });

      setCommissions(commissionRows);
    } catch (e: any) {
      setAllowed(false);
      setSummary(null);
      setReferrals([]);
      setCommissions([]);
      setPayouts([]);
      setPayoutProfile(null);
      setPayoutMethodInput("MOBILE_MONEY");
      setPayoutPhoneInput("");
      setPayoutAccountNameInput("");
      setPayoutNotesInput("");
      setErrorText(clean(e?.message) || "Failed to load Partner dashboard.");
    }
  }, []);

  const confirmMyPayoutReceived = useCallback(
    async (payoutId: string) => {
      const id = clean(payoutId);
      if (!id) return;

      Alert.alert(
        "Confirm received",
        "Je, umepokea payout hii kweli?",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "CONFIRM",
            onPress: async () => {
              setConfirmingPayoutId(id);
              try {
                const { error } = await supabase.rpc("gp_confirm_my_payout_received_v1", {
                  p_payout_id: id,
                  p_confirmation_note: clean(confirmReceiptNote) || null,
                });

                if (error) throw error;

                setConfirmReceiptNote("");
                Alert.alert("Confirmed ✅", "Payout receipt yako imethibitishwa successfully.");
                await loadPartnerData();
              } catch (e: any) {
                Alert.alert(
                  "Confirm failed",
                  clean(e?.message) || "Failed to confirm payout receipt."
                );
              } finally {
                setConfirmingPayoutId("");
              }
            },
          },
        ]
      );
    },
    [confirmReceiptNote, loadPartnerData]
  );

  const saveMyPayoutProfile = useCallback(async () => {
    const method = upper(payoutMethodInput || "MOBILE_MONEY") || "MOBILE_MONEY";
    const phone = clean(payoutPhoneInput);
    const accountName = clean(payoutAccountNameInput);
    const notes = clean(payoutNotesInput);

    if (!phone) {
      Alert.alert("Phone required", "Weka namba ya kupokea payout kwanza.");
      return;
    }

    if (!accountName) {
      Alert.alert("Receiver name required", "Weka jina la mpokeaji kwanza.");
      return;
    }

    setSavingPayoutProfile(true);
    try {
      const { data, error } = await supabase.rpc("gp_save_my_payout_profile_v1", {
        p_payout_method: method,
        p_payout_phone: phone,
        p_payout_account_name: accountName,
        p_payout_notes: notes || null,
      });

      if (error) throw error;

      const row = Array.isArray(data)
        ? ((data?.[0] ?? null) as PartnerPayoutProfileRow | null)
        : ((data ?? null) as PartnerPayoutProfileRow | null);

      setPayoutProfile(row ?? null);
      setPayoutMethodInput(upper(row?.payout_method || method) || "MOBILE_MONEY");
      setPayoutPhoneInput(clean(row?.payout_phone || phone));
      setPayoutAccountNameInput(clean(row?.payout_account_name || accountName));
      setPayoutNotesInput(clean(row?.payout_notes || notes));

      Alert.alert("Saved ✅", "Payout destination saved successfully.");
    } catch (e: any) {
      Alert.alert("Save failed", clean(e?.message) || "Failed to save payout destination.");
    } finally {
      setSavingPayoutProfile(false);
    }
  }, [payoutAccountNameInput, payoutMethodInput, payoutNotesInput, payoutPhoneInput]);

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        setChecking(true);
        setLoading(true);
        await loadPartnerData();
      } finally {
        if (mounted) {
          setChecking(false);
          setLoading(false);
        }
      }
    })();

    return () => {
      mounted = false;
    };
  }, [loadPartnerData]);

  useEffect(() => {
    if (!allowed) return;

    const refreshPartner = async () => {
      if (refreshing) return;
      await loadPartnerData();
    };

    const channel = supabase
      .channel("partner-dashboard-live")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "growth_partner_profiles",
        },
        refreshPartner
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "growth_partner_referrals",
        },
        refreshPartner
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "growth_partner_commissions",
        },
        refreshPartner
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "growth_partner_payouts",
        },
        refreshPartner
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [allowed, loadPartnerData, refreshing]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadPartnerData();
    } finally {
      setRefreshing(false);
    }
  }, [loadPartnerData]);

  const unpaidCommissions = useMemo(() => {
    return commissions.filter((x) => isReadyCommission(x.commission_status));
  }, [commissions]);

  const lockedCommissions = useMemo(() => {
    return commissions.filter((x) => upper(x.commission_status) === "LOCKED");
  }, [commissions]);

  const paidCommissions = useMemo(() => {
    return commissions.filter((x) => upper(x.commission_status) === "PAID");
  }, [commissions]);

  const latestPayout = useMemo(() => {
    return payouts.length > 0 ? payouts[0] : null;
  }, [payouts]);

  return (
    <Screen scroll>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
          marginTop: 2,
        }}
      >
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [
            {
              width: 42,
              height: 42,
              borderRadius: 16,
              alignItems: "center",
              justifyContent: "center",
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.10)",
              backgroundColor: "rgba(255,255,255,0.04)",
              opacity: pressed ? 0.9 : 1,
            },
          ]}
        >
          <Text style={{ color: UI.text, fontWeight: "900", fontSize: 18 }}>‹</Text>
        </Pressable>

        <View style={{ flex: 1 }}>
          <Text style={{ color: UI.text, fontWeight: "900", fontSize: 20 }}>
            Partner Dashboard
          </Text>
          <Text style={{ color: UI.muted, fontWeight: "800", marginTop: 4 }}>
            ZETRA Growth Partner Workspace
          </Text>
        </View>

        <Pressable
          onPress={() => void onRefresh()}
          disabled={refreshing}
          style={({ pressed }) => [
            {
              width: 42,
              height: 42,
              borderRadius: 16,
              alignItems: "center",
              justifyContent: "center",
              borderWidth: 1,
              borderColor: UI.emeraldBorder,
              backgroundColor: "rgba(16,185,129,0.10)",
              opacity: refreshing ? 0.6 : pressed ? 0.9 : 1,
            },
          ]}
        >
          <Text style={{ color: UI.text, fontWeight: "900", fontSize: 16 }}>
            {refreshing ? "…" : "↻"}
          </Text>
        </Pressable>
      </View>

      <View style={{ marginTop: 12 }}>
        <Card>
          <Text style={{ color: UI.text, fontWeight: "900", fontSize: 14 }}>
            Access status
          </Text>

          <View style={{ marginTop: 10, gap: 6 }}>
            <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12 }}>
              Checking partner link:{" "}
              <Text style={{ color: UI.text }}>
                {checking ? "CHECKING…" : allowed ? "ACTIVE" : "NOT LINKED"}
              </Text>
            </Text>

            <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12 }}>
              Dashboard access:{" "}
              <Text style={{ color: UI.text }}>
                {allowed ? "GRANTED" : checking ? "WAITING…" : "DENIED"}
              </Text>
            </Text>
          </View>
        </Card>
      </View>

      {loading ? (
        <View style={{ marginTop: 12 }}>
          <Card>
            <ActivityIndicator />
            <Text style={{ color: UI.muted, fontWeight: "800", marginTop: 10 }}>
              Loading Partner dashboard…
            </Text>
          </Card>
        </View>
      ) : errorText ? (
        <View style={{ marginTop: 12 }}>
          <Card
            style={{
              borderWidth: 1,
              borderColor: "rgba(239,68,68,0.25)",
              backgroundColor: "rgba(239,68,68,0.08)",
            }}
          >
            <Text style={{ color: UI.text, fontWeight: "900", fontSize: 14 }}>
              Partner dashboard not ready
            </Text>
            <Text
              style={{
                color: UI.muted,
                fontWeight: "800",
                fontSize: 12,
                marginTop: 8,
                lineHeight: 18,
              }}
            >
              {errorText}
            </Text>
          </Card>
        </View>
      ) : (
        <>
          <View style={{ marginTop: 12 }}>
            <Card>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 10,
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text style={{ color: UI.text, fontWeight: "900", fontSize: 14 }}>
                    Your Partner Profile
                  </Text>

                  <Text
                    style={{
                      color: UI.muted,
                      fontWeight: "800",
                      fontSize: 12,
                      marginTop: 8,
                    }}
                  >
                    Referral code
                  </Text>

                  <Text style={{ color: UI.text, fontWeight: "900", fontSize: 24, marginTop: 4 }}>
                    {clean(summary?.referral_code) || "—"}
                  </Text>
                </View>

                <View
                  style={{
                    paddingVertical: 6,
                    paddingHorizontal: 12,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: statusUi.borderColor,
                    backgroundColor: statusUi.backgroundColor,
                    alignSelf: "flex-start",
                  }}
                >
                  <Text style={{ color: UI.text, fontWeight: "900", fontSize: 11 }}>
                    {statusUi.text}
                  </Text>
                </View>
              </View>

              <View style={{ marginTop: 12, gap: 6 }}>
                <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12 }}>
                  Partner ID: <Text style={{ color: UI.text }}>{clean(summary?.partner_id) || "—"}</Text>
                </Text>

                <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12 }}>
                  Activated at: <Text style={{ color: UI.text }}>{fmtDateTime(summary?.activated_at)}</Text>
                </Text>

                <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12 }}>
                  Created at: <Text style={{ color: UI.text }}>{fmtDateTime(summary?.created_at)}</Text>
                </Text>
              </View>
            </Card>
          </View>

          <View style={{ marginTop: 12 }}>
            <Card>
              <Text style={{ color: UI.text, fontWeight: "900", fontSize: 14 }}>
                Payout Destination
              </Text>

              <Text
                style={{
                  color: UI.muted,
                  fontWeight: "800",
                  fontSize: 12,
                  marginTop: 8,
                  lineHeight: 18,
                }}
              >
                Hapa ndipo unaweka namba na jina litakalotumika kupokea payout zako. Office itaona hizi details moja kwa moja wakati wa kurekodi payout.
              </Text>

              <View style={{ marginTop: 12, gap: 10 }}>
                <TextInput
                  value={payoutMethodInput}
                  onChangeText={(v) => setPayoutMethodInput(upper(v))}
                  placeholder="Mfano MOBILE_MONEY"
                  placeholderTextColor="rgba(255,255,255,0.45)"
                  autoCapitalize="characters"
                  style={{
                    minHeight: 52,
                    borderRadius: 14,
                    borderWidth: 1,
                    borderColor: "rgba(255,255,255,0.12)",
                    backgroundColor: "rgba(255,255,255,0.06)",
                    color: UI.text,
                    paddingHorizontal: 12,
                    fontWeight: "800",
                  }}
                />

                <TextInput
                  value={payoutPhoneInput}
                  onChangeText={setPayoutPhoneInput}
                  placeholder="Namba ya kupokea payout"
                  placeholderTextColor="rgba(255,255,255,0.45)"
                  keyboardType="phone-pad"
                  style={{
                    minHeight: 52,
                    borderRadius: 14,
                    borderWidth: 1,
                    borderColor: "rgba(255,255,255,0.12)",
                    backgroundColor: "rgba(255,255,255,0.06)",
                    color: UI.text,
                    paddingHorizontal: 12,
                    fontWeight: "800",
                  }}
                />

                <TextInput
                  value={payoutAccountNameInput}
                  onChangeText={setPayoutAccountNameInput}
                  placeholder="Jina la mpokeaji"
                  placeholderTextColor="rgba(255,255,255,0.45)"
                  style={{
                    minHeight: 52,
                    borderRadius: 14,
                    borderWidth: 1,
                    borderColor: "rgba(255,255,255,0.12)",
                    backgroundColor: "rgba(255,255,255,0.06)",
                    color: UI.text,
                    paddingHorizontal: 12,
                    fontWeight: "800",
                  }}
                />

                <TextInput
                  value={payoutNotesInput}
                  onChangeText={setPayoutNotesInput}
                  placeholder="Notes (optional)"
                  placeholderTextColor="rgba(255,255,255,0.45)"
                  multiline
                  style={{
                    minHeight: 88,
                    borderRadius: 14,
                    borderWidth: 1,
                    borderColor: "rgba(255,255,255,0.12)",
                    backgroundColor: "rgba(255,255,255,0.06)",
                    color: UI.text,
                    paddingHorizontal: 12,
                    paddingVertical: 12,
                    fontWeight: "800",
                    textAlignVertical: "top",
                  }}
                />

                <Pressable
                  onPress={() => void saveMyPayoutProfile()}
                  disabled={savingPayoutProfile}
                  style={({ pressed }) => [
                    {
                      minHeight: 48,
                      borderRadius: 14,
                      borderWidth: 1,
                      borderColor: UI.emeraldBorder,
                      backgroundColor: "rgba(16,185,129,0.12)",
                      alignItems: "center",
                      justifyContent: "center",
                      opacity: savingPayoutProfile ? 0.6 : pressed ? 0.92 : 1,
                    },
                  ]}
                >
                  <Text style={{ color: UI.text, fontWeight: "900", fontSize: 13 }}>
                    {savingPayoutProfile ? "SAVING..." : "SAVE PAYOUT DETAILS"}
                  </Text>
                </Pressable>

                <View
                  style={{
                    borderWidth: 1,
                    borderColor: "rgba(255,255,255,0.10)",
                    backgroundColor: "rgba(255,255,255,0.04)",
                    borderRadius: 14,
                    padding: 12,
                    gap: 4,
                  }}
                >
                  <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12 }}>
                    Current method: <Text style={{ color: UI.text }}>{clean(payoutProfile?.payout_method) || "—"}</Text>
                  </Text>
                  <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12 }}>
                    Current phone: <Text style={{ color: UI.text }}>{clean(payoutProfile?.payout_phone) || "—"}</Text>
                  </Text>
                  <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12 }}>
                    Current name: <Text style={{ color: UI.text }}>{clean(payoutProfile?.payout_account_name) || "—"}</Text>
                  </Text>
                  <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12 }}>
                    Last updated: <Text style={{ color: UI.text }}>{fmtDateTime(payoutProfile?.payout_updated_at)}</Text>
                  </Text>
                </View>
              </View>
            </Card>
          </View>

          <View style={{ marginTop: 12 }}>
            <Card>
              <Text style={{ color: UI.text, fontWeight: "900", fontSize: 14 }}>
                Monthly Commission Rule
              </Text>

              <View
                style={{
                  marginTop: 12,
                  borderWidth: 1,
                  borderColor: "rgba(16,185,129,0.20)",
                  backgroundColor: "rgba(16,185,129,0.08)",
                  borderRadius: 16,
                  padding: 12,
                  gap: 6,
                }}
              >
                <Text style={{ color: UI.text, fontWeight: "900", fontSize: 13 }}>
                  Month 1 = 25% of monthly charge
                </Text>
                <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12, lineHeight: 18 }}>
                  Commission ya kwanza hutolewa kwa mwezi wa kwanza tu, siyo kwa jumla yote ya package.
                </Text>

                <Text style={{ color: UI.text, fontWeight: "900", fontSize: 13, marginTop: 6 }}>
                  Month 2 → 12 = 10% of monthly charge
                </Text>
                <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12, lineHeight: 18 }}>
                  Miezi inayofuata hufunguliwa hatua kwa hatua kwa mwezi wake, badala ya kutolewa mkupuo mmoja.
                </Text>
              </View>
            </Card>
          </View>

          <View style={{ marginTop: 12 }}>
            <Card>
              <Text style={{ color: UI.text, fontWeight: "900", fontSize: 14 }}>
                Performance Overview
              </Text>

              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 12 }}>
                <StatCard
                  label="Total Referrals"
                  value={Number(summary?.total_referrals ?? 0).toLocaleString("en-US")}
                  green
                />
                <StatCard
                  label="Active Referrals"
                  value={Number(summary?.active_referrals ?? 0).toLocaleString("en-US")}
                  green
                />
                <StatCard
                  label="Need Follow-up"
                  value={Number(summary?.customers_needing_followup ?? 0).toLocaleString("en-US")}
                />
                <StatCard
                  label="Renewals Due Soon"
                  value={Number(summary?.renewals_due_soon ?? 0).toLocaleString("en-US")}
                />

                <View
                  style={{
                    width: "100%",
                    borderWidth: 1,
                    borderColor: "rgba(255,255,255,0.10)",
                    backgroundColor: "rgba(255,255,255,0.04)",
                    borderRadius: 16,
                    padding: 12,
                    gap: 6,
                  }}
                >
                  <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 11 }}>
                    Total Earned
                  </Text>
                  <Text style={{ color: UI.text, fontWeight: "900", fontSize: 16 }}>
                    {fmtMoney(summary?.total_earned_tzs ?? 0, "TZS")}
                  </Text>

                  <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 11, marginTop: 4 }}>
                    Total Paid
                  </Text>
                  <Text style={{ color: UI.text, fontWeight: "900", fontSize: 15 }}>
                    {fmtMoney(summary?.total_paid_tzs ?? 0, "TZS")}
                  </Text>

                  <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 11, marginTop: 4 }}>
                    Ready for payout
                  </Text>
                  <Text style={{ color: UI.text, fontWeight: "900", fontSize: 15 }}>
                    {fmtMoney(summary?.total_unpaid_tzs ?? 0, "TZS")}
                  </Text>
                </View>
              </View>
            </Card>
          </View>

          <View style={{ marginTop: 12 }}>
            <Card>
              <Text style={{ color: UI.text, fontWeight: "900", fontSize: 14 }}>
                Action Center
              </Text>

              <View style={{ marginTop: 12, gap: 10 }}>
                <View
                  style={{
                    borderWidth: 1,
                    borderColor: "rgba(16,185,129,0.22)",
                    backgroundColor: "rgba(16,185,129,0.08)",
                    borderRadius: 16,
                    padding: 12,
                  }}
                >
                  <Text style={{ color: UI.text, fontWeight: "900", fontSize: 13 }}>
                    Customers to follow up
                  </Text>
                  <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12, marginTop: 8 }}>
                    {Number(summary?.customers_needing_followup ?? 0).toLocaleString("en-US")} customer(s)
                    need follow-up.
                  </Text>
                </View>

                <View
                  style={{
                    borderWidth: 1,
                    borderColor: "rgba(245,158,11,0.22)",
                    backgroundColor: "rgba(245,158,11,0.08)",
                    borderRadius: 16,
                    padding: 12,
                  }}
                >
                  <Text style={{ color: UI.text, fontWeight: "900", fontSize: 13 }}>
                    Renewals due soon
                  </Text>
                  <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12, marginTop: 8 }}>
                    {Number(summary?.renewals_due_soon ?? 0).toLocaleString("en-US")} customer(s)
                    may need renewal follow-up soon.
                  </Text>
                </View>

                <View
                  style={{
                    borderWidth: 1,
                    borderColor: "rgba(255,255,255,0.10)",
                    backgroundColor: "rgba(255,255,255,0.04)",
                    borderRadius: 16,
                    padding: 12,
                  }}
                >
                  <Text style={{ color: UI.text, fontWeight: "900", fontSize: 13 }}>
                    Commission status overview
                  </Text>
                  <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12, marginTop: 8 }}>
                    Ready for payout:{" "}
                    <Text style={{ color: UI.text }}>
                      {unpaidCommissions.length.toLocaleString("en-US")}
                    </Text>
                  </Text>

                  <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12, marginTop: 8 }}>
                    Locked upcoming:{" "}
                    <Text style={{ color: UI.text }}>
                      {lockedCommissions.length.toLocaleString("en-US")}
                    </Text>
                  </Text>

                  <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12, marginTop: 4 }}>
                    Paid records:{" "}
                    <Text style={{ color: UI.text }}>
                      {paidCommissions.length.toLocaleString("en-US")}
                    </Text>
                  </Text>

                  <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12, marginTop: 4 }}>
                    Live sync: <Text style={{ color: UI.text }}>ON</Text>
                  </Text>
                </View>
              </View>
            </Card>
          </View>

        <View style={{ marginTop: 12 }}>
            <Card>
              <Text style={{ color: UI.text, fontWeight: "900", fontSize: 14 }}>
                Latest Payout Received
              </Text>

              {!latestPayout ? (
                <Text style={{ color: UI.muted, fontWeight: "800", marginTop: 12 }}>
                  Bado hujapokea payout yoyote.
                </Text>
              ) : (
                <View
                  style={{
                    marginTop: 12,
                    borderWidth: 1,
                    borderColor: payoutTone(latestPayout.payout_status || "").borderColor,
                    backgroundColor: payoutTone(latestPayout.payout_status || "").backgroundColor,
                    borderRadius: 16,
                    padding: 12,
                    gap: 6,
                  }}
                >
                  <Text style={{ color: UI.text, fontWeight: "900", fontSize: 16 }}>
                    {fmtMoney(latestPayout.payout_amount_tzs ?? 0, "TZS")}
                  </Text>

                  <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12 }}>
                    Status:{" "}
                    <Text style={{ color: UI.text }}>
                      {payoutTone(latestPayout.payout_status || "").text}
                    </Text>
                  </Text>

                  <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12 }}>
                    Method:{" "}
                    <Text style={{ color: UI.text }}>
                      {clean(latestPayout.payout_method) || "—"}
                    </Text>
                  </Text>

                  <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12 }}>
                    Reference:{" "}
                    <Text style={{ color: UI.text }}>
                      {clean(latestPayout.payout_reference) || "—"}
                    </Text>
                  </Text>

                  <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12 }}>
                    Paid at:{" "}
                    <Text style={{ color: UI.text }}>
                      {fmtDateTime(latestPayout.payout_date)}
                    </Text>
                  </Text>

                  {!!clean(latestPayout.payout_note) ? (
                    <View
                      style={{
                        marginTop: 6,
                        borderWidth: 1,
                        borderColor: "rgba(255,255,255,0.10)",
                        backgroundColor: "rgba(255,255,255,0.04)",
                        borderRadius: 12,
                        padding: 10,
                      }}
                    >
                      <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12 }}>
                        Office message
                      </Text>
                      <Text
                        style={{
                          color: UI.text,
                          fontWeight: "800",
                          fontSize: 12,
                          marginTop: 6,
                          lineHeight: 18,
                        }}
                      >
                        {clean(latestPayout.payout_note)}
                      </Text>
                    </View>
                  ) : null}

                  {!!clean(latestPayout.receiver_confirmed_at) ? (
                    <View
                      style={{
                        marginTop: 6,
                        borderWidth: 1,
                        borderColor: "rgba(16,185,129,0.22)",
                        backgroundColor: "rgba(16,185,129,0.08)",
                        borderRadius: 12,
                        padding: 10,
                      }}
                    >
                      <Text style={{ color: UI.text, fontWeight: "900", fontSize: 12 }}>
                        Ulishathibitisha receipt ya payout hii.
                      </Text>

                      <Text
                        style={{
                          color: UI.muted,
                          fontWeight: "800",
                          fontSize: 12,
                          marginTop: 6,
                        }}
                      >
                        Confirmed at:{" "}
                        <Text style={{ color: UI.text }}>
                          {fmtDateTime(latestPayout.receiver_confirmed_at)}
                        </Text>
                      </Text>

                      {!!clean(latestPayout.receiver_confirmation_note) ? (
                        <Text
                          style={{
                            color: UI.muted,
                            fontWeight: "800",
                            fontSize: 12,
                            marginTop: 4,
                          }}
                        >
                          Note yako:{" "}
                          <Text style={{ color: UI.text }}>
                            {clean(latestPayout.receiver_confirmation_note)}
                          </Text>
                        </Text>
                      ) : null}
                    </View>
                  ) : upper(latestPayout.payout_status) === "PAID" ? (
                    <>
                      <TextInput
                        value={confirmReceiptNote}
                        onChangeText={setConfirmReceiptNote}
                        placeholder="Optional note, mfano: Nimepokea asante"
                        placeholderTextColor="rgba(255,255,255,0.45)"
                        multiline
                        style={{
                          minHeight: 88,
                          borderRadius: 14,
                          borderWidth: 1,
                          borderColor: "rgba(255,255,255,0.12)",
                          backgroundColor: "rgba(255,255,255,0.06)",
                          color: UI.text,
                          paddingHorizontal: 12,
                          paddingVertical: 12,
                          fontWeight: "800",
                          textAlignVertical: "top",
                          marginTop: 6,
                        }}
                      />

                      <Pressable
                        onPress={() =>
                          void confirmMyPayoutReceived(clean(latestPayout.payout_id))
                        }
                        disabled={confirmingPayoutId === clean(latestPayout.payout_id)}
                        style={({ pressed }) => [
                          {
                            minHeight: 48,
                            borderRadius: 14,
                            borderWidth: 1,
                            borderColor: UI.emeraldBorder,
                            backgroundColor: "rgba(16,185,129,0.12)",
                            alignItems: "center",
                            justifyContent: "center",
                            opacity:
                              confirmingPayoutId === clean(latestPayout.payout_id)
                                ? 0.6
                                : pressed
                                ? 0.92
                                : 1,
                            marginTop: 6,
                          },
                        ]}
                      >
                        <Text style={{ color: UI.text, fontWeight: "900", fontSize: 13 }}>
                          {confirmingPayoutId === clean(latestPayout.payout_id)
                            ? "CONFIRMING..."
                            : "CONFIRM RECEIVED"}
                        </Text>
                      </Pressable>
                    </>
                  ) : null}
                </View>
              )}
            </Card>
          </View>

          <View style={{ marginTop: 12 }}>
            <Card>
              <Text style={{ color: UI.text, fontWeight: "900", fontSize: 14 }}>
                Payout History
              </Text>

              {payouts.length === 0 ? (
                <Text style={{ color: UI.muted, fontWeight: "800", marginTop: 12 }}>
                  No payout history yet.
                </Text>
              ) : (
                <View style={{ marginTop: 12, gap: 10 }}>
                  {payouts.map((row, index) => (
                    <View
                      key={clean(row.payout_id) || String(index)}
                      style={{
                        borderWidth: 1,
                        borderColor: payoutTone(row.payout_status || "").borderColor,
                        backgroundColor: payoutTone(row.payout_status || "").backgroundColor,
                        borderRadius: 14,
                        padding: 12,
                        gap: 4,
                      }}
                    >
                      <Text style={{ color: UI.text, fontWeight: "900", fontSize: 14 }}>
                        {fmtMoney(row.payout_amount_tzs ?? 0, "TZS")}
                      </Text>

                      <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12 }}>
                        Status: <Text style={{ color: UI.text }}>{payoutTone(row.payout_status || "").text}</Text>
                      </Text>

                      <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12 }}>
                        Method: <Text style={{ color: UI.text }}>{clean(row.payout_method) || "—"}</Text>
                      </Text>

                      <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12 }}>
                        Reference: <Text style={{ color: UI.text }}>{clean(row.payout_reference) || "—"}</Text>
                      </Text>

                      <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12 }}>
                        Date: <Text style={{ color: UI.text }}>{fmtDateTime(row.payout_date)}</Text>
                      </Text>

                      {!!clean(row.payout_note) ? (
                        <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12 }}>
                          Office message: <Text style={{ color: UI.text }}>{clean(row.payout_note)}</Text>
                        </Text>
                      ) : null}

                      {!!clean(row.receiver_confirmed_at) ? (
                        <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12 }}>
                          Confirmed at: <Text style={{ color: UI.text }}>{fmtDateTime(row.receiver_confirmed_at)}</Text>
                        </Text>
                      ) : null}

                      {!!clean(row.receiver_confirmation_note) ? (
                        <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12 }}>
                          Your note: <Text style={{ color: UI.text }}>{clean(row.receiver_confirmation_note)}</Text>
                        </Text>
                      ) : null}
                    </View>
                  ))}
                </View>
              )}
            </Card>
          </View>

          <View style={{ marginTop: 12 }}>
            <Card>
              <Text style={{ color: UI.text, fontWeight: "900", fontSize: 14 }}>
                My Referrals
              </Text>

              {referrals.length === 0 ? (
                <Text style={{ color: UI.muted, fontWeight: "800", marginTop: 12 }}>
                  No referrals yet.
                </Text>
              ) : (
                <View style={{ marginTop: 12, gap: 10 }}>
                  {referrals.map((row, index) => (
                    <View
                      key={clean(row.referral_id) || String(index)}
                      style={{
                        borderWidth: 1,
                        borderColor: "rgba(255,255,255,0.10)",
                        backgroundColor: "rgba(255,255,255,0.04)",
                        borderRadius: 14,
                        padding: 12,
                        gap: 4,
                      }}
                    >
                      <Text style={{ color: UI.text, fontWeight: "900", fontSize: 13 }}>
                        {clean(row.referred_email_snapshot) || "Customer"}
                      </Text>

                      <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12 }}>
                        Status: <Text style={{ color: UI.text }}>{upper(row.status) || "—"}</Text>
                      </Text>

                      <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12 }}>
                        Linked at: <Text style={{ color: UI.text }}>{fmtDateTime(row.linked_at)}</Text>
                      </Text>

                      <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12 }}>
                        Total commission:{" "}
                        <Text style={{ color: UI.text }}>
                          {fmtMoney(row.total_commission_tzs ?? 0, "TZS")}
                        </Text>
                      </Text>

                      <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12 }}>
                        Ready unpaid commission:{" "}
                        <Text style={{ color: UI.text }}>
                          {fmtMoney(row.unpaid_commission_tzs ?? 0, "TZS")}
                        </Text>
                      </Text>
                    </View>
                  ))}
                </View>
              )}
            </Card>
          </View>

          <View style={{ marginTop: 12 }}>
            <Card>
              <Text style={{ color: UI.text, fontWeight: "900", fontSize: 14 }}>
                My Commissions
              </Text>

              {commissions.length === 0 ? (
                <Text style={{ color: UI.muted, fontWeight: "800", marginTop: 12 }}>
                  No commissions yet.
                </Text>
              ) : (
                <View style={{ marginTop: 12, gap: 10 }}>
                  {commissions.map((row, index) => {
                    const tone = commissionTone(row.commission_status || "");
                    const rowStatus = upper(row.commission_status);
                    const isLocked = isLockedCommission(row.commission_status);
                    const isPaid = isPaidCommission(row.commission_status);
                    const isReady = isReadyCommission(row.commission_status);

                    return (
                      <View
                        key={clean(row.commission_id) || String(index)}
                        style={{
                          borderWidth: 1,
                          borderColor: tone.borderColor,
                          backgroundColor: tone.backgroundColor,
                          borderRadius: 14,
                          padding: 12,
                          gap: 4,
                        }}
                      >
                        <Text style={{ color: UI.text, fontWeight: "900", fontSize: 13 }}>
                          {clean(row.referred_email_snapshot) || "Customer commission"}
                        </Text>

                        <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12 }}>
                          Status: <Text style={{ color: UI.text }}>{tone.text}</Text>
                        </Text>

                        <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12 }}>
                          Global sequence:{" "}
                          <Text style={{ color: UI.text }}>
                            {row.payment_sequence_number ?? "—"}
                          </Text>
                        </Text>

                        {hasCount(row.commission_month_number) ? (
                          <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12 }}>
                            Commission month:{" "}
                            <Text style={{ color: UI.text }}>
                              {row.commission_month_number}
                            </Text>
                          </Text>
                        ) : null}

                        {hasCount(row.months_paid_count) ? (
                          <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12 }}>
                            Months paid in package:{" "}
                            <Text style={{ color: UI.text }}>
                              {row.months_paid_count}
                            </Text>
                          </Text>
                        ) : null}

                        <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12 }}>
                          Total payment:{" "}
                          <Text style={{ color: UI.text }}>
                            {fmtMoney(row.payment_amount_tzs ?? 0, "TZS")}
                          </Text>
                        </Text>

                        {hasMoney(row.monthly_charge_tzs) ? (
                          <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12 }}>
                            Monthly charge base:{" "}
                            <Text style={{ color: UI.text }}>
                              {fmtMoney(row.monthly_charge_tzs ?? 0, "TZS")}
                            </Text>
                          </Text>
                        ) : null}

                        <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12 }}>
                          Percent:{" "}
                          <Text style={{ color: UI.text }}>
                            {row.commission_percent ?? 0}%
                          </Text>
                        </Text>

                        <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12 }}>
                          Commission amount:{" "}
                          <Text style={{ color: UI.text }}>
                            {fmtMoney(row.commission_amount_tzs ?? 0, "TZS")}
                          </Text>
                        </Text>

                        <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12 }}>
                          Unlock at:{" "}
                          <Text style={{ color: UI.text }}>
                            {clean(row.unlock_at) ? fmtDateTime(row.unlock_at) : isLocked ? "WAITING RELEASE" : "—"}
                          </Text>
                        </Text>

                        <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12 }}>
                          Earned at: <Text style={{ color: UI.text }}>{fmtDateTime(row.earned_at)}</Text>
                        </Text>

                        {isPaid ? (
                          <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12 }}>
                            Paid at: <Text style={{ color: UI.text }}>{fmtDateTime(row.paid_at)}</Text>
                          </Text>
                        ) : null}

                        <Text style={{ color: UI.text, fontWeight: "900", fontSize: 12, marginTop: 6 }}>
                          {commissionStateNote(row)}
                        </Text>

                        {!!clean(row.notes) ? (
                          <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12 }}>
                            Engine note: <Text style={{ color: UI.text }}>{clean(row.notes)}</Text>
                          </Text>
                        ) : null}
                      </View>
                    );
                  })}
                </View>
              )}
            </Card>
          </View>
        </>
      )}
    </Screen>
  );
}