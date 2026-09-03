// app/office/growth-partners.tsx

import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  ActivityIndicator,
  Alert,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";

import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Screen } from "@/src/ui/Screen";
import { Card } from "@/src/ui/Card";
import { UI } from "@/src/ui/theme";
import { supabase } from "@/src/supabase/supabaseClient";

const INTERNAL_BILLING_EMAIL = "zetraofficialtz@gmail.com";

type PartnerSummaryRow = {
  total_partners?: number | null;
  active_partners?: number | null;
  total_referrals?: number | null;
  active_referrals?: number | null;
  total_earned_tzs?: number | null;
  total_paid_tzs?: number | null;
  total_unpaid_tzs?: number | null;
};

type PartnerListRow = {
  partner_id: string;
  user_id: string;
  email_snapshot: string;
  full_name_snapshot: string | null;
  phone_snapshot: string | null;
  referral_code: string;
  status: string;
  total_referrals: number | null;
  active_referrals: number | null;
  total_earned_tzs: number | null;
  total_paid_tzs: number | null;
  total_unpaid_tzs: number | null;
  created_at: string | null;
  activated_at: string | null;
};

type PartnerReferralRow = {
  referral_id: string;
  referred_user_id: string;
  referred_email_snapshot: string;
  referral_code_used: string;
  status: string;
  linked_at: string | null;
  ended_at: string | null;
  total_commission_tzs: number | null;
  paid_commission_tzs: number | null;
  unpaid_commission_tzs: number | null;
};

type PartnerCommissionRow = {
  commission_id: string;
  referral_id: string;
  referred_user_id: string;
  referred_email_snapshot: string;
  subscription_payment_request_id: string;

  payment_amount_tzs: number | null;
  monthly_charge_tzs?: number | null;
  months_paid_count?: number | null;
  commission_month_number?: number | null;

  commission_percent: number | null;
  commission_amount_tzs: number | null;
  payment_sequence_number: number | null;
  commission_status: string;

  earned_at: string | null;
  approved_at: string | null;
  paid_at: string | null;
  unlock_at?: string | null;

  payout_id: string | null;
  notes: string | null;
};

type PartnerPayoutRow = {
  payout_id: string;
  payout_amount_tzs: number | null;
  payout_status: string;
  payout_method: string;
  payout_reference: string | null;
  payout_note: string | null;
  payout_date: string | null;
  created_at: string | null;
};

type OfficePartnerPayoutProfileRow = {
  partner_id: string;
  email_snapshot: string | null;
  full_name_snapshot: string | null;
  payout_method: string | null;
  payout_phone: string | null;
  payout_account_name: string | null;
  payout_notes: string | null;
  payout_updated_at: string | null;
};

function clean(value: any) {
  return String(value ?? "").trim();
}

function upper(value: any) {
  return clean(value).toUpperCase();
}

function fmtMoney(value: any) {
  const amount = Number(value);

  if (!Number.isFinite(amount)) {
    return "TZS 0";
  }

  return `TZS ${Math.round(amount).toLocaleString("en-US")}`;
}

function fmtDateTime(value: any) {
  const raw = clean(value);

  if (!raw) {
    return "—";
  }

  try {
    const date = new Date(raw);

    if (Number.isNaN(date.getTime())) {
      return raw;
    }

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const hour = String(date.getHours()).padStart(2, "0");
    const minute = String(date.getMinutes()).padStart(2, "0");

    return `${year}-${month}-${day} ${hour}:${minute}`;
  } catch {
    return raw;
  }
}

function partnerStatusTone(status: any) {
  const value = upper(status);

  if (value === "ACTIVE") {
    return {
      text: "ACTIVE",
      borderColor: "rgba(16,185,129,0.35)",
      backgroundColor: "rgba(16,185,129,0.12)",
    };
  }

  if (value === "SUSPENDED") {
    return {
      text: "SUSPENDED",
      borderColor: "rgba(239,68,68,0.35)",
      backgroundColor: "rgba(239,68,68,0.10)",
    };
  }

  if (value === "PENDING") {
    return {
      text: "PENDING",
      borderColor: "rgba(245,158,11,0.35)",
      backgroundColor: "rgba(245,158,11,0.10)",
    };
  }

  return {
    text: value || "UNKNOWN",
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.05)",
  };
}

function commissionTone(status: any) {
  const value = upper(status);

  if (value === "PAID") {
    return {
      borderColor: "rgba(16,185,129,0.28)",
      backgroundColor: "rgba(16,185,129,0.08)",
    };
  }

  if (value === "LOCKED") {
    return {
      borderColor: "rgba(245,158,11,0.30)",
      backgroundColor: "rgba(245,158,11,0.08)",
    };
  }

  if (value === "EARNED" || value === "APPROVED") {
    return {
      borderColor: "rgba(16,185,129,0.30)",
      backgroundColor: "rgba(16,185,129,0.08)",
    };
  }

  return {
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(255,255,255,0.04)",
  };
}

function isReadyCommission(status: any) {
  const value = upper(status);

  return value === "EARNED" || value === "APPROVED";
}

function ActionButton({
  label,
  onPress,
  disabled,
  danger,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => ({
        minHeight: 46,
        flex: 1,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: disabled
          ? "rgba(255,255,255,0.10)"
          : danger
          ? "rgba(239,68,68,0.35)"
          : UI.emeraldBorder,
        backgroundColor: disabled
          ? "rgba(255,255,255,0.04)"
          : danger
          ? "rgba(239,68,68,0.09)"
          : "rgba(16,185,129,0.11)",
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 12,
        opacity: disabled ? 0.5 : pressed ? 0.9 : 1,
      })}
    >
      <Text
        style={{
          color: UI.text,
          fontWeight: "900",
          fontSize: 12,
          textAlign: "center",
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function StatusBadge({
  status,
}: {
  status: string;
}) {
  const tone = partnerStatusTone(status);

  return (
    <View
      style={{
        alignSelf: "flex-start",
        borderWidth: 1,
        borderColor: tone.borderColor,
        backgroundColor: tone.backgroundColor,
        borderRadius: 999,
        paddingVertical: 5,
        paddingHorizontal: 10,
      }}
    >
      <Text
        style={{
          color: UI.text,
          fontWeight: "900",
          fontSize: 10,
        }}
      >
        {tone.text}
      </Text>
    </View>
  );
}

function DetailLine({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <Text
      style={{
        color: UI.muted,
        fontWeight: "800",
        fontSize: 12,
        lineHeight: 18,
      }}
    >
      {label}:{" "}
      <Text
        style={{
          color: UI.text,
          fontWeight: "900",
        }}
      >
        {value}
      </Text>
    </Text>
  );
}

function StatBox({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <View
      style={{
        flex: 1,
        minWidth: "47%",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.10)",
        backgroundColor: "rgba(255,255,255,0.04)",
        borderRadius: 16,
        padding: 13,
      }}
    >
      <Text
        style={{
          color: UI.muted,
          fontWeight: "800",
          fontSize: 11,
        }}
      >
        {label}
      </Text>

      <Text
        style={{
          color: UI.text,
          fontWeight: "900",
          fontSize: 18,
          marginTop: 6,
        }}
      >
        {value}
      </Text>
    </View>
  );
}

export default function GrowthPartnersScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [checkingAccess, setCheckingAccess] = useState(true);
  const [allowed, setAllowed] = useState(false);

  const [partnersLoading, setPartnersLoading] = useState(true);
  const [partnersBusy, setPartnersBusy] = useState(false);
  const [partnerErrorText, setPartnerErrorText] = useState("");

  const [partnerSummary, setPartnerSummary] =
    useState<PartnerSummaryRow | null>(null);

  const [partners, setPartners] =
    useState<PartnerListRow[]>([]);

  const [selectedPartner, setSelectedPartner] =
    useState<PartnerListRow | null>(null);

  const [partnerEmail, setPartnerEmail] = useState("");
  const [partnerFullName, setPartnerFullName] = useState("");
  const [partnerPhone, setPartnerPhone] = useState("");
  const [partnerNotes, setPartnerNotes] = useState("");

  const [partnerDetailLoading, setPartnerDetailLoading] =
    useState(false);

  const [partnerDetailErrorText, setPartnerDetailErrorText] =
    useState("");

  const [partnerReferrals, setPartnerReferrals] =
    useState<PartnerReferralRow[]>([]);

  const [partnerCommissions, setPartnerCommissions] =
    useState<PartnerCommissionRow[]>([]);

  const [partnerPayouts, setPartnerPayouts] =
    useState<PartnerPayoutRow[]>([]);

  const [
    selectedPartnerPayoutProfile,
    setSelectedPartnerPayoutProfile,
  ] = useState<OfficePartnerPayoutProfileRow | null>(null);

  const [showRegisterForm, setShowRegisterForm] =
    useState(false);

  const [showPayoutForm, setShowPayoutForm] =
    useState(false);

  const [selectedCommissionIds, setSelectedCommissionIds] =
    useState<string[]>([]);

  const [payoutMethod, setPayoutMethod] =
    useState("MOBILE_MONEY");

  const [payoutReference, setPayoutReference] =
    useState("");

  const [payoutNote, setPayoutNote] =
    useState("");

  const [creatingPayout, setCreatingPayout] =
    useState(false);

  const loadPartnersModule = useCallback(async () => {
    setPartnersLoading(true);
    setPartnerErrorText("");

    try {
      const unlockResult = await supabase.rpc(
        "gp_unlock_due_commissions_v1"
      );

      if (unlockResult.error) {
        throw unlockResult.error;
      }

      const [
        { data: summaryData, error: summaryError },
        { data: partnersData, error: partnersError },
      ] = await Promise.all([
        supabase.rpc("gp_office_dashboard_summary_v1"),
        supabase.rpc("gp_list_partners_v1"),
      ]);

      if (summaryError) {
        throw summaryError;
      }

      if (partnersError) {
        throw partnersError;
      }

      const summary = Array.isArray(summaryData)
        ? ((summaryData[0] ?? null) as PartnerSummaryRow | null)
        : ((summaryData ?? null) as PartnerSummaryRow | null);

      const list = (
        Array.isArray(partnersData)
          ? partnersData
          : []
      ) as PartnerListRow[];

      setPartnerSummary(summary);
      setPartners(list);

      setSelectedPartner((current) => {
        if (!current?.partner_id) {
          return current;
        }

        const refreshed = list.find(
          (item) =>
            item.partner_id === current.partner_id
        );

        return refreshed ?? current;
      });
    } catch (error: any) {
      setPartnerSummary(null);
      setPartners([]);

      setPartnerErrorText(
        clean(error?.message) ||
          "Failed to load Growth Partners."
      );
    } finally {
      setPartnersLoading(false);
    }
  }, []);

  const loadSelectedPartnerDetail = useCallback(
    async (partnerId: string) => {
      const id = clean(partnerId);

      if (!id) {
        setPartnerReferrals([]);
        setPartnerCommissions([]);
        setPartnerPayouts([]);
        setPartnerDetailErrorText("");
        return;
      }

      setPartnerDetailLoading(true);
      setPartnerDetailErrorText("");

      try {
        const unlockResult = await supabase.rpc(
          "gp_unlock_due_commissions_v1"
        );

        if (unlockResult.error) {
          throw unlockResult.error;
        }

        const [
          { data: referralsData, error: referralsError },
          { data: commissionsData, error: commissionsError },
          { data: payoutsData, error: payoutsError },
        ] = await Promise.all([
          supabase.rpc(
            "gp_list_partner_referrals_v1",
            {
              p_partner_id: id,
            }
          ),

          supabase.rpc(
            "gp_list_partner_commissions_v1",
            {
              p_partner_id: id,
            }
          ),

          supabase.rpc(
            "gp_list_partner_payouts_v1",
            {
              p_partner_id: id,
            }
          ),
        ]);

        if (referralsError) {
          throw referralsError;
        }

        if (commissionsError) {
          throw commissionsError;
        }

        if (payoutsError) {
          throw payoutsError;
        }

        const referrals = (
          Array.isArray(referralsData)
            ? referralsData
            : []
        ) as PartnerReferralRow[];

        const commissions = (
          Array.isArray(commissionsData)
            ? commissionsData
            : []
        ) as PartnerCommissionRow[];

        const payouts = (
          Array.isArray(payoutsData)
            ? payoutsData
            : []
        ) as PartnerPayoutRow[];

        commissions.sort((a, b) => {
          const aMonth = Number(
            a.commission_month_number ?? 0
          );

          const bMonth = Number(
            b.commission_month_number ?? 0
          );

          if (aMonth !== bMonth) {
            return aMonth - bMonth;
          }

          return (
            new Date(clean(b.earned_at) || 0).getTime() -
            new Date(clean(a.earned_at) || 0).getTime()
          );
        });

        setPartnerReferrals(referrals);
        setPartnerCommissions(commissions);
        setPartnerPayouts(payouts);
      } catch (error: any) {
        setPartnerReferrals([]);
        setPartnerCommissions([]);
        setPartnerPayouts([]);

        setPartnerDetailErrorText(
          clean(error?.message) ||
            "Failed to load partner details."
        );
      } finally {
        setPartnerDetailLoading(false);
      }
    },
    []
  );

  const loadSelectedPartnerPayoutProfile =
    useCallback(async (partnerId: string) => {
      const id = clean(partnerId);

      if (!id) {
        setSelectedPartnerPayoutProfile(null);
        return;
      }

      try {
        const { data, error } = await supabase.rpc(
          "gp_office_get_partner_payout_profile_v1",
          {
            p_partner_id: id,
          }
        );

        if (error) {
          throw error;
        }

        const row = Array.isArray(data)
          ? ((data[0] ??
              null) as OfficePartnerPayoutProfileRow | null)
          : ((data ??
              null) as OfficePartnerPayoutProfileRow | null);

        setSelectedPartnerPayoutProfile(row);

        if (clean(row?.payout_method)) {
          setPayoutMethod(
            upper(row?.payout_method)
          );
        }
      } catch {
        setSelectedPartnerPayoutProfile(null);
      }
    }, []);

  const refreshSelectedPartner =
    useCallback(async () => {
      if (!selectedPartner?.partner_id) {
        return;
      }

      await Promise.all([
        loadSelectedPartnerDetail(
          selectedPartner.partner_id
        ),
        loadSelectedPartnerPayoutProfile(
          selectedPartner.partner_id
        ),
      ]);
    }, [
      loadSelectedPartnerDetail,
      loadSelectedPartnerPayoutProfile,
      selectedPartner?.partner_id,
    ]);

  const checkInternalAccess =
    useCallback(async () => {
      setCheckingAccess(true);

      try {
        const { data, error } =
          await supabase.auth.getUser();

        if (error) {
          throw error;
        }

        const email = clean(
          data?.user?.email
        ).toLowerCase();

        const ok =
          email === INTERNAL_BILLING_EMAIL;

        setAllowed(ok);

        if (!ok) {
          Alert.alert(
            "Restricted",
            "This screen is for ZETRA Office only."
          );

          router.back();
          return;
        }

        await loadPartnersModule();
      } catch (error: any) {
        setAllowed(false);

        Alert.alert(
          "Restricted",
          clean(error?.message) ||
            "Unable to verify Office access."
        );

        router.back();
      } finally {
        setCheckingAccess(false);
      }
    }, [
      loadPartnersModule,
      router,
    ]);

  useEffect(() => {
    void checkInternalAccess();
  }, [checkInternalAccess]);

  useEffect(() => {
    if (!allowed) {
      return;
    }

    const channel = supabase
      .channel("office-growth-partners-clean")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "growth_partner_profiles",
        },
        () => {
          void loadPartnersModule();
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "growth_partner_referrals",
        },
        () => {
          void loadPartnersModule();
          void refreshSelectedPartner();
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "growth_partner_commissions",
        },
        () => {
          void loadPartnersModule();
          void refreshSelectedPartner();
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "growth_partner_payouts",
        },
        () => {
          void loadPartnersModule();
          void refreshSelectedPartner();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [
    allowed,
    loadPartnersModule,
    refreshSelectedPartner,
  ]);

  useEffect(() => {
    if (!selectedPartner?.partner_id) {
      setPartnerReferrals([]);
      setPartnerCommissions([]);
      setPartnerPayouts([]);
      setPartnerDetailErrorText("");
      setSelectedPartnerPayoutProfile(null);

      setShowPayoutForm(false);
      setSelectedCommissionIds([]);

      setPayoutMethod("MOBILE_MONEY");
      setPayoutReference("");
      setPayoutNote("");

      return;
    }

    setShowPayoutForm(false);
    setSelectedCommissionIds([]);
    setPayoutReference("");
    setPayoutNote("");

    void refreshSelectedPartner();
  }, [
    refreshSelectedPartner,
    selectedPartner?.partner_id,
  ]);

  const registerPartner =
    useCallback(async () => {
      const email = clean(
        partnerEmail
      ).toLowerCase();

      const fullName = clean(
        partnerFullName
      );

      const phone = clean(
        partnerPhone
      );

      const notes = clean(
        partnerNotes
      );

      if (!email) {
        Alert.alert(
          "Email required",
          "Weka email ya Growth Partner."
        );

        return;
      }

      setPartnersBusy(true);

      try {
        const { error } = await supabase.rpc(
          "gp_register_partner_v1",
          {
            p_email: email,
            p_full_name:
              fullName || null,
            p_phone:
              phone || null,
            p_notes:
              notes || null,
          }
        );

        if (error) {
          throw error;
        }

        setPartnerEmail("");
        setPartnerFullName("");
        setPartnerPhone("");
        setPartnerNotes("");
        setShowRegisterForm(false);

        Alert.alert(
          "Growth Partner added ✅",
          "Partner amesajiliwa successfully."
        );

        await loadPartnersModule();
      } catch (error: any) {
        Alert.alert(
          "Register failed",
          clean(error?.message) ||
            "Failed to register Growth Partner."
        );
      } finally {
        setPartnersBusy(false);
      }
    }, [
      loadPartnersModule,
      partnerEmail,
      partnerFullName,
      partnerNotes,
      partnerPhone,
    ]);

  const activatePartner =
    useCallback(async (partnerId: string) => {
      setPartnersBusy(true);

      try {
        const { error } = await supabase.rpc(
          "gp_set_partner_status_v1",
          {
            p_partner_id: partnerId,
            p_status: "ACTIVE",
            p_notes: null,
          }
        );

        if (error) {
          throw error;
        }

        setSelectedPartner((current) =>
          current?.partner_id === partnerId
            ? {
                ...current,
                status: "ACTIVE",
              }
            : current
        );

        Alert.alert(
          "Activated ✅",
          "Growth Partner sasa yupo ACTIVE."
        );

        await loadPartnersModule();
      } catch (error: any) {
        Alert.alert(
          "Activation failed",
          clean(error?.message) ||
            "Failed to activate partner."
        );
      } finally {
        setPartnersBusy(false);
      }
    }, [loadPartnersModule]);

  const suspendPartner =
    useCallback(async (partnerId: string) => {
      setPartnersBusy(true);

      try {
        const { error } = await supabase.rpc(
          "gp_set_partner_status_v1",
          {
            p_partner_id: partnerId,
            p_status: "SUSPENDED",
            p_notes: null,
          }
        );

        if (error) {
          throw error;
        }

        setSelectedPartner((current) =>
          current?.partner_id === partnerId
            ? {
                ...current,
                status: "SUSPENDED",
              }
            : current
        );

        Alert.alert(
          "Suspended",
          "Growth Partner ame-suspend."
        );

        await loadPartnersModule();
      } catch (error: any) {
        Alert.alert(
          "Suspend failed",
          clean(error?.message) ||
            "Failed to suspend partner."
        );
      } finally {
        setPartnersBusy(false);
      }
    }, [loadPartnersModule]);

  const deletePartnerPermanently =
    useCallback(
      (partner: PartnerListRow) => {
        const partnerId =
          clean(partner.partner_id);

        if (!partnerId) {
          return;
        }

        const name =
          clean(
            partner.full_name_snapshot
          ) ||
          clean(
            partner.email_snapshot
          ) ||
          "Growth Partner";

        Alert.alert(
          "Delete Growth Partner",
          `Unataka kumfuta kabisa ${name}? Referral code yake haitafanya kazi tena.`,
          [
            {
              text: "Cancel",
              style: "cancel",
            },
            {
              text: "DELETE",
              style: "destructive",
              onPress: async () => {
                setPartnersBusy(true);

                try {
                  const { error } =
                    await supabase.rpc(
                      "gp_delete_partner_permanently_v1",
                      {
                        p_partner_id:
                          partnerId,
                      }
                    );

                  if (error) {
                    throw error;
                  }

                  if (
                    selectedPartner?.partner_id ===
                    partnerId
                  ) {
                    setSelectedPartner(null);
                  }

                  Alert.alert(
                    "Deleted ✅",
                    "Growth Partner amefutwa."
                  );

                  await loadPartnersModule();
                } catch (error: any) {
                  Alert.alert(
                    "Delete failed",
                    clean(error?.message) ||
                      "Failed to delete partner."
                  );
                } finally {
                  setPartnersBusy(false);
                }
              },
            },
          ]
        );
      },
      [
        loadPartnersModule,
        selectedPartner?.partner_id,
      ]
    );

  const unpaidPartnerCommissions =
    useMemo(() => {
      return partnerCommissions.filter(
        (row) =>
          isReadyCommission(
            row.commission_status
          )
      );
    }, [partnerCommissions]);

  const readyCommissionCount =
    unpaidPartnerCommissions.length;

  const selectedPayoutTotal =
    useMemo(() => {
      return selectedCommissionIds.reduce(
        (sum, id) => {
          const row =
            unpaidPartnerCommissions.find(
              (item) =>
                item.commission_id === id
            );

          return (
            sum +
            Number(
              row?.commission_amount_tzs ??
                0
            )
          );
        },
        0
      );
    }, [
      selectedCommissionIds,
      unpaidPartnerCommissions,
    ]);

  const toggleCommissionSelection =
    useCallback(
      (commissionId: string) => {
        const id = clean(commissionId);

        if (!id) {
          return;
        }

        setSelectedCommissionIds(
          (current) => {
            if (current.includes(id)) {
              return current.filter(
                (item) => item !== id
              );
            }

            return [...current, id];
          }
        );
      },
      []
    );

  const selectAllReadyCommissions =
    useCallback(() => {
      setSelectedCommissionIds(
        unpaidPartnerCommissions
          .map((row) =>
            clean(row.commission_id)
          )
          .filter(Boolean)
      );
    }, [unpaidPartnerCommissions]);

  const createPartnerPayout =
    useCallback(async () => {
      if (!selectedPartner?.partner_id) {
        Alert.alert(
          "Partner required",
          "Chagua Growth Partner kwanza."
        );

        return;
      }

      if (
        selectedCommissionIds.length === 0
      ) {
        Alert.alert(
          "Select commissions",
          "Chagua commission za kulipa."
        );

        return;
      }

      const method =
        upper(payoutMethod);

      if (!method) {
        Alert.alert(
          "Method required",
          "Weka payout method."
        );

        return;
      }

      const selectedRows =
        unpaidPartnerCommissions.filter(
          (row) =>
            selectedCommissionIds.includes(
              row.commission_id
            )
        );

      if (
        selectedRows.length !==
        selectedCommissionIds.length
      ) {
        Alert.alert(
          "Refresh required",
          "Baadhi ya commission hazipo READY tena."
        );

        return;
      }

      const totalAmount =
        selectedRows.reduce(
          (sum, row) =>
            sum +
            Number(
              row.commission_amount_tzs ??
                0
            ),
          0
        );

      Alert.alert(
        "Confirm payout",
        `Rekodi payout ya ${fmtMoney(
          totalAmount
        )} kwa commission ${
          selectedRows.length
        }?`,
        [
          {
            text: "Cancel",
            style: "cancel",
          },
          {
            text: "CONFIRM",
            onPress: async () => {
              setCreatingPayout(true);

              try {
                const { error } =
                  await supabase.rpc(
                    "gp_create_partner_payout_v2",
                    {
                      p_partner_id:
                        selectedPartner.partner_id,

                      p_commission_ids:
                        selectedCommissionIds,

                      p_payout_method:
                        method,

                      p_payout_reference:
                        clean(
                          payoutReference
                        ) || null,

                      p_payout_note:
                        clean(
                          payoutNote
                        ) || null,
                    }
                  );

                if (error) {
                  throw error;
                }

                setShowPayoutForm(false);
                setSelectedCommissionIds(
                  []
                );
                setPayoutReference("");
                setPayoutNote("");

                Alert.alert(
                  "Payout recorded ✅",
                  "Partner payout imehifadhiwa successfully."
                );

                await Promise.all([
                  loadPartnersModule(),
                  refreshSelectedPartner(),
                ]);
              } catch (error: any) {
                Alert.alert(
                  "Payout failed",
                  clean(
                    error?.message
                  ) ||
                    "Failed to create payout."
                );
              } finally {
                setCreatingPayout(
                  false
                );
              }
            },
          },
        ]
      );
    }, [
      loadPartnersModule,
      payoutMethod,
      payoutNote,
      payoutReference,
      refreshSelectedPartner,
      selectedCommissionIds,
      selectedPartner?.partner_id,
      unpaidPartnerCommissions,
    ]);

  const selectedPartnerStatus =
    upper(selectedPartner?.status);

  if (
    checkingAccess &&
    !allowed
  ) {
    return (
      <Screen scroll>
        <View
          style={{
            minHeight: 300,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <ActivityIndicator />

          <Text
            style={{
              color: UI.muted,
              fontWeight: "800",
              marginTop: 12,
            }}
          >
            Loading Growth Partners…
          </Text>
        </View>
      </Screen>
    );
  }

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
          style={({ pressed }) => ({
            width: 42,
            height: 42,
            borderRadius: 16,
            alignItems: "center",
            justifyContent: "center",
            borderWidth: 1,
            borderColor:
              "rgba(255,255,255,0.10)",
            backgroundColor:
              "rgba(255,255,255,0.04)",
            opacity:
              pressed ? 0.9 : 1,
          })}
        >
          <Ionicons
            name="chevron-back"
            size={20}
            color={UI.text}
          />
        </Pressable>

        <View
          style={{
            flex: 1,
          }}
        >
          <Text
            style={{
              color: UI.text,
              fontWeight: "900",
              fontSize: 20,
            }}
          >
            Growth Partners
          </Text>

          <Text
            style={{
              color: UI.muted,
              fontWeight: "800",
              marginTop: 4,
            }}
          >
            Partners, referrals & commissions
          </Text>
        </View>

        <Pressable
          onPress={() => {
            if (!partnersLoading) {
              void loadPartnersModule();
            }
          }}
          style={({ pressed }) => ({
            width: 42,
            height: 42,
            borderRadius: 16,
            alignItems: "center",
            justifyContent: "center",
            borderWidth: 1,
            borderColor:
              UI.emeraldBorder,
            backgroundColor:
              "rgba(16,185,129,0.10)",
            opacity:
              pressed ? 0.9 : 1,
          })}
        >
          <Ionicons
            name="refresh-outline"
            size={19}
            color={UI.text}
          />
        </Pressable>
      </View>

      <View
        style={{
          marginTop: 16,
        }}
      >
        <Card>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent:
                "space-between",
              gap: 12,
            }}
          >
            <View
              style={{
                flex: 1,
              }}
            >
              <Text
                style={{
                  color: UI.text,
                  fontWeight: "900",
                  fontSize: 16,
                }}
              >
                Overview
              </Text>

              <Text
                style={{
                  color: UI.muted,
                  fontWeight: "800",
                  fontSize: 12,
                  lineHeight: 18,
                  marginTop: 5,
                }}
              >
                Muhtasari wa Growth Partner
                network.
              </Text>
            </View>
          </View>

          {partnersLoading ? (
            <View
              style={{
                paddingVertical: 26,
                alignItems: "center",
              }}
            >
              <ActivityIndicator />

              <Text
                style={{
                  color: UI.muted,
                  fontWeight: "800",
                  marginTop: 10,
                }}
              >
                Loading…
              </Text>
            </View>
          ) : partnerErrorText ? (
            <View
              style={{
                marginTop: 14,
                borderWidth: 1,
                borderColor:
                  "rgba(239,68,68,0.25)",
                backgroundColor:
                  "rgba(239,68,68,0.07)",
                borderRadius: 16,
                padding: 13,
              }}
            >
              <Text
                style={{
                  color: UI.text,
                  fontWeight: "900",
                  fontSize: 12,
                }}
              >
                Unable to load Growth Partners
              </Text>

              <Text
                style={{
                  color: UI.muted,
                  fontWeight: "800",
                  fontSize: 12,
                  lineHeight: 18,
                  marginTop: 6,
                }}
              >
                {partnerErrorText}
              </Text>
            </View>
          ) : (
            <>
              <View
                style={{
                  flexDirection: "row",
                  flexWrap: "wrap",
                  gap: 10,
                  marginTop: 14,
                }}
              >
                <StatBox
                  label="Total Partners"
                  value={Number(
                    partnerSummary?.total_partners ??
                      0
                  ).toLocaleString(
                    "en-US"
                  )}
                />

                <StatBox
                  label="Active Partners"
                  value={Number(
                    partnerSummary?.active_partners ??
                      0
                  ).toLocaleString(
                    "en-US"
                  )}
                />

                <StatBox
                  label="Total Referrals"
                  value={Number(
                    partnerSummary?.total_referrals ??
                      0
                  ).toLocaleString(
                    "en-US"
                  )}
                />

                <StatBox
                  label="Active Referrals"
                  value={Number(
                    partnerSummary?.active_referrals ??
                      0
                  ).toLocaleString(
                    "en-US"
                  )}
                />
              </View>

              <View
                style={{
                  marginTop: 10,
                  borderWidth: 1,
                  borderColor:
                    "rgba(16,185,129,0.20)",
                  backgroundColor:
                    "rgba(16,185,129,0.07)",
                  borderRadius: 16,
                  padding: 14,
                  gap: 8,
                }}
              >
                <DetailLine
                  label="Commission Generated"
                  value={fmtMoney(
                    partnerSummary?.total_earned_tzs ??
                      0
                  )}
                />

                <DetailLine
                  label="Total Paid"
                  value={fmtMoney(
                    partnerSummary?.total_paid_tzs ??
                      0
                  )}
                />

                <DetailLine
                  label="Ready Unpaid"
                  value={fmtMoney(
                    partnerSummary?.total_unpaid_tzs ??
                      0
                  )}
                />
              </View>
            </>
          )}
        </Card>
      </View>

      <View
        style={{
          marginTop: 12,
        }}
      >
        <Card>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent:
                "space-between",
              gap: 12,
            }}
          >
            <View
              style={{
                flex: 1,
              }}
            >
              <Text
                style={{
                  color: UI.text,
                  fontWeight: "900",
                  fontSize: 15,
                }}
              >
                Growth Partners
              </Text>

              <Text
                style={{
                  color: UI.muted,
                  fontWeight: "800",
                  fontSize: 12,
                  marginTop: 4,
                }}
              >
                Manage registered partners.
              </Text>
            </View>

            <Pressable
              onPress={() =>
                setShowRegisterForm(
                  (current) =>
                    !current
                )
              }
              style={({ pressed }) => ({
                width: 42,
                height: 42,
                borderRadius: 14,
                alignItems: "center",
                justifyContent:
                  "center",
                borderWidth: 1,
                borderColor:
                  UI.emeraldBorder,
                backgroundColor:
                  "rgba(16,185,129,0.10)",
                opacity:
                  pressed ? 0.9 : 1,
              })}
            >
              <Ionicons
                name={
                  showRegisterForm
                    ? "close-outline"
                    : "add-outline"
                }
                size={22}
                color={UI.text}
              />
            </Pressable>
          </View>

          {showRegisterForm ? (
            <View
              style={{
                marginTop: 14,
                borderWidth: 1,
                borderColor:
                  "rgba(16,185,129,0.20)",
                backgroundColor:
                  "rgba(16,185,129,0.06)",
                borderRadius: 16,
                padding: 12,
                gap: 10,
              }}
            >
              <Text
                style={{
                  color: UI.text,
                  fontWeight: "900",
                  fontSize: 13,
                }}
              >
                Register Growth Partner
              </Text>

              <TextInput
                value={partnerEmail}
                onChangeText={
                  setPartnerEmail
                }
                placeholder="Email"
                placeholderTextColor="rgba(255,255,255,0.45)"
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                style={{
                  minHeight: 50,
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor:
                    "rgba(255,255,255,0.12)",
                  backgroundColor:
                    "rgba(255,255,255,0.05)",
                  color: UI.text,
                  paddingHorizontal: 12,
                  fontWeight: "800",
                }}
              />

              <TextInput
                value={
                  partnerFullName
                }
                onChangeText={
                  setPartnerFullName
                }
                placeholder="Full name (optional)"
                placeholderTextColor="rgba(255,255,255,0.45)"
                style={{
                  minHeight: 50,
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor:
                    "rgba(255,255,255,0.12)",
                  backgroundColor:
                    "rgba(255,255,255,0.05)",
                  color: UI.text,
                  paddingHorizontal: 12,
                  fontWeight: "800",
                }}
              />

              <TextInput
                value={partnerPhone}
                onChangeText={
                  setPartnerPhone
                }
                placeholder="Phone (optional)"
                placeholderTextColor="rgba(255,255,255,0.45)"
                keyboardType="phone-pad"
                style={{
                  minHeight: 50,
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor:
                    "rgba(255,255,255,0.12)",
                  backgroundColor:
                    "rgba(255,255,255,0.05)",
                  color: UI.text,
                  paddingHorizontal: 12,
                  fontWeight: "800",
                }}
              />

              <TextInput
                value={partnerNotes}
                onChangeText={
                  setPartnerNotes
                }
                placeholder="Notes (optional)"
                placeholderTextColor="rgba(255,255,255,0.45)"
                multiline
                style={{
                  minHeight: 80,
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor:
                    "rgba(255,255,255,0.12)",
                  backgroundColor:
                    "rgba(255,255,255,0.05)",
                  color: UI.text,
                  paddingHorizontal: 12,
                  paddingVertical: 12,
                  fontWeight: "800",
                  textAlignVertical:
                    "top",
                }}
              />

              <View
                style={{
                  flexDirection: "row",
                  gap: 10,
                }}
              >
                <ActionButton
                  label={
                    partnersBusy
                      ? "ADDING..."
                      : "ADD PARTNER"
                  }
                  onPress={() =>
                    void registerPartner()
                  }
                  disabled={
                    partnersBusy ||
                    !clean(partnerEmail)
                  }
                />
              </View>
            </View>
          ) : null}

          {!partnersLoading &&
          partners.length === 0 &&
          !partnerErrorText ? (
            <Text
              style={{
                color: UI.muted,
                fontWeight: "800",
                fontSize: 13,
                marginTop: 18,
              }}
            >
              No Growth Partners yet.
            </Text>
          ) : null}

          {!partnersLoading &&
          partners.length > 0 ? (
            <View
              style={{
                marginTop: 14,
                gap: 10,
              }}
            >
              {partners.map(
                (partner) => {
                  const selected =
                    selectedPartner?.partner_id ===
                    partner.partner_id;

                  return (
                    <Pressable
                      key={
                        partner.partner_id
                      }
                      onPress={() =>
                        setSelectedPartner(
                          partner
                        )
                      }
                      style={({
                        pressed,
                      }) => ({
                        opacity:
                          pressed
                            ? 0.92
                            : 1,
                      })}
                    >
                      <View
                        style={{
                          borderWidth: 1,
                          borderColor:
                            selected
                              ? UI.emeraldBorder
                              : "rgba(255,255,255,0.10)",
                          backgroundColor:
                            selected
                              ? "rgba(16,185,129,0.07)"
                              : "rgba(255,255,255,0.04)",
                          borderRadius: 16,
                          padding: 13,
                        }}
                      >
                        <View
                          style={{
                            flexDirection:
                              "row",
                            alignItems:
                              "flex-start",
                            justifyContent:
                              "space-between",
                            gap: 10,
                          }}
                        >
                          <View
                            style={{
                              flex: 1,
                            }}
                          >
                            <Text
                              style={{
                                color:
                                  UI.text,
                                fontWeight:
                                  "900",
                                fontSize:
                                  14,
                              }}
                            >
                              {clean(
                                partner.full_name_snapshot
                              ) ||
                                clean(
                                  partner.email_snapshot
                                ) ||
                                "Growth Partner"}
                            </Text>

                            <Text
                              style={{
                                color:
                                  UI.muted,
                                fontWeight:
                                  "800",
                                fontSize:
                                  12,
                                marginTop:
                                  4,
                              }}
                            >
                              {
                                partner.email_snapshot
                              }
                            </Text>
                          </View>

                          <StatusBadge
                            status={
                              partner.status
                            }
                          />
                        </View>

                        <View
                          style={{
                            marginTop: 12,
                            gap: 5,
                          }}
                        >
                          <DetailLine
                            label="Referral Code"
                            value={
                              clean(
                                partner.referral_code
                              ) || "—"
                            }
                          />

                          <DetailLine
                            label="Referrals"
                            value={Number(
                              partner.total_referrals ??
                                0
                            ).toLocaleString(
                              "en-US"
                            )}
                          />

                          <DetailLine
                            label="Commission"
                            value={fmtMoney(
                              partner.total_earned_tzs ??
                                0
                            )}
                          />

                          <DetailLine
                            label="Ready Unpaid"
                            value={fmtMoney(
                              partner.total_unpaid_tzs ??
                                0
                            )}
                          />
                        </View>

                        <View
                          style={{
                            flexDirection:
                              "row",
                            gap: 10,
                            marginTop: 12,
                          }}
                        >
                          <ActionButton
                            label="VIEW DETAILS"
                            onPress={() =>
                              setSelectedPartner(
                                partner
                              )
                            }
                            disabled={
                              partnersBusy
                            }
                          />

                          <ActionButton
                            label="DELETE"
                            danger
                            onPress={() =>
                              deletePartnerPermanently(
                                partner
                              )
                            }
                            disabled={
                              partnersBusy
                            }
                          />
                        </View>
                      </View>
                    </Pressable>
                  );
                }
              )}
            </View>
          ) : null}
        </Card>
      </View>

      {selectedPartner ? (
        <View
          style={{
            marginTop: 12,
          }}
        >
          <Card>
            <View
              style={{
                flexDirection: "row",
                alignItems: "flex-start",
                justifyContent:
                  "space-between",
                gap: 12,
              }}
            >
              <View
                style={{
                  flex: 1,
                }}
              >
                <Text
                  style={{
                    color: UI.text,
                    fontWeight: "900",
                    fontSize: 16,
                  }}
                >
                  Partner Details
                </Text>

                <Text
                  style={{
                    color: UI.muted,
                    fontWeight: "800",
                    fontSize: 12,
                    marginTop: 5,
                  }}
                >
                  {clean(
                    selectedPartner.full_name_snapshot
                  ) ||
                    clean(
                      selectedPartner.email_snapshot
                    )}
                </Text>
              </View>

              <StatusBadge
                status={
                  selectedPartner.status
                }
              />
            </View>

            <View
              style={{
                marginTop: 14,
                borderWidth: 1,
                borderColor:
                  "rgba(255,255,255,0.10)",
                backgroundColor:
                  "rgba(255,255,255,0.04)",
                borderRadius: 16,
                padding: 13,
                gap: 6,
              }}
            >
              <DetailLine
                label="Email"
                value={
                  selectedPartner.email_snapshot
                }
              />

              <DetailLine
                label="Phone"
                value={
                  clean(
                    selectedPartner.phone_snapshot
                  ) || "—"
                }
              />

              <DetailLine
                label="Referral Code"
                value={
                  selectedPartner.referral_code
                }
              />

              <DetailLine
                label="Total Referrals"
                value={Number(
                  selectedPartner.total_referrals ??
                    0
                ).toLocaleString(
                  "en-US"
                )}
              />

              <DetailLine
                label="Active Referrals"
                value={Number(
                  selectedPartner.active_referrals ??
                    0
                ).toLocaleString(
                  "en-US"
                )}
              />

              <DetailLine
                label="Commission Generated"
                value={fmtMoney(
                  selectedPartner.total_earned_tzs ??
                    0
                )}
              />

              <DetailLine
                label="Total Paid"
                value={fmtMoney(
                  selectedPartner.total_paid_tzs ??
                    0
                )}
              />

              <DetailLine
                label="Ready Unpaid"
                value={fmtMoney(
                  selectedPartner.total_unpaid_tzs ??
                    0
                )}
              />

              <DetailLine
                label="Created"
                value={fmtDateTime(
                  selectedPartner.created_at
                )}
              />
            </View>

            <View
              style={{
                marginTop: 12,
                flexDirection: "row",
                gap: 10,
              }}
            >
              <ActionButton
                label={
                  selectedPartnerStatus ===
                  "ACTIVE"
                    ? "ACTIVE"
                    : "ACTIVATE"
                }
                onPress={() =>
                  void activatePartner(
                    selectedPartner.partner_id
                  )
                }
                disabled={
                  partnersBusy ||
                  selectedPartnerStatus ===
                    "ACTIVE"
                }
              />

              <ActionButton
                label={
                  selectedPartnerStatus ===
                  "SUSPENDED"
                    ? "SUSPENDED"
                    : "SUSPEND"
                }
                danger
                onPress={() =>
                  void suspendPartner(
                    selectedPartner.partner_id
                  )
                }
                disabled={
                  partnersBusy ||
                  selectedPartnerStatus ===
                    "SUSPENDED"
                }
              />
            </View>

            <View
              style={{
                marginTop: 16,
              }}
            >
              <Text
                style={{
                  color: UI.text,
                  fontWeight: "900",
                  fontSize: 14,
                }}
              >
                Payout Destination
              </Text>

              <View
                style={{
                  marginTop: 10,
                  borderWidth: 1,
                  borderColor:
                    "rgba(255,255,255,0.10)",
                  backgroundColor:
                    "rgba(255,255,255,0.04)",
                  borderRadius: 16,
                  padding: 13,
                  gap: 6,
                }}
              >
                <DetailLine
                  label="Method"
                  value={
                    clean(
                      selectedPartnerPayoutProfile?.payout_method
                    ) || "—"
                  }
                />

                <DetailLine
                  label="Phone"
                  value={
                    clean(
                      selectedPartnerPayoutProfile?.payout_phone
                    ) || "—"
                  }
                />

                <DetailLine
                  label="Receiver"
                  value={
                    clean(
                      selectedPartnerPayoutProfile?.payout_account_name
                    ) || "—"
                  }
                />

                <DetailLine
                  label="Updated"
                  value={fmtDateTime(
                    selectedPartnerPayoutProfile?.payout_updated_at
                  )}
                />
              </View>
            </View>

            {partnerDetailLoading ? (
              <View
                style={{
                  alignItems: "center",
                  paddingVertical: 26,
                }}
              >
                <ActivityIndicator />

                <Text
                  style={{
                    color: UI.muted,
                    fontWeight: "800",
                    marginTop: 10,
                  }}
                >
                  Loading partner details…
                </Text>
              </View>
            ) : partnerDetailErrorText ? (
              <View
                style={{
                  marginTop: 14,
                  borderWidth: 1,
                  borderColor:
                    "rgba(239,68,68,0.25)",
                  backgroundColor:
                    "rgba(239,68,68,0.07)",
                  borderRadius: 16,
                  padding: 13,
                }}
              >
                <Text
                  style={{
                    color: UI.text,
                    fontWeight: "900",
                    fontSize: 12,
                  }}
                >
                  Unable to load details
                </Text>

                <Text
                  style={{
                    color: UI.muted,
                    fontWeight: "800",
                    fontSize: 12,
                    lineHeight: 18,
                    marginTop: 6,
                  }}
                >
                  {
                    partnerDetailErrorText
                  }
                </Text>
              </View>
            ) : (
              <>
                <View
                  style={{
                    marginTop: 18,
                  }}
                >
                  <View
                    style={{
                      flexDirection:
                        "row",
                      alignItems:
                        "center",
                      justifyContent:
                        "space-between",
                      gap: 10,
                    }}
                  >
                    <View>
                      <Text
                        style={{
                          color:
                            UI.text,
                          fontWeight:
                            "900",
                          fontSize:
                            14,
                        }}
                      >
                        Commissions
                      </Text>

                      <Text
                        style={{
                          color:
                            UI.muted,
                          fontWeight:
                            "800",
                          fontSize:
                            11,
                          marginTop:
                            3,
                        }}
                      >
                        Ready:{" "}
                        {
                          readyCommissionCount
                        }
                      </Text>
                    </View>

                    <Pressable
                      disabled={
                        readyCommissionCount ===
                        0
                      }
                      onPress={() => {
                        if (
                          showPayoutForm
                        ) {
                          setShowPayoutForm(
                            false
                          );
                          return;
                        }

                        selectAllReadyCommissions();
                        setShowPayoutForm(
                          true
                        );
                      }}
                      style={({
                        pressed,
                      }) => ({
                        paddingHorizontal:
                          12,
                        minHeight: 38,
                        borderRadius:
                          12,
                        borderWidth: 1,
                        borderColor:
                          readyCommissionCount >
                          0
                            ? UI.emeraldBorder
                            : "rgba(255,255,255,0.10)",
                        backgroundColor:
                          readyCommissionCount >
                          0
                            ? "rgba(16,185,129,0.10)"
                            : "rgba(255,255,255,0.04)",
                        alignItems:
                          "center",
                        justifyContent:
                          "center",
                        opacity:
                          readyCommissionCount ===
                          0
                            ? 0.5
                            : pressed
                            ? 0.9
                            : 1,
                      })}
                    >
                      <Text
                        style={{
                          color:
                            UI.text,
                          fontWeight:
                            "900",
                          fontSize:
                            11,
                        }}
                      >
                        {
                          showPayoutForm
                            ? "CLOSE PAYOUT"
                            : "RECORD PAYOUT"
                        }
                      </Text>
                    </Pressable>
                  </View>

                  {showPayoutForm ? (
                    <View
                      style={{
                        marginTop: 12,
                        borderWidth:
                          1,
                        borderColor:
                          "rgba(16,185,129,0.25)",
                        backgroundColor:
                          "rgba(16,185,129,0.07)",
                        borderRadius:
                          16,
                        padding: 13,
                        gap: 10,
                      }}
                    >
                      <Text
                        style={{
                          color:
                            UI.text,
                          fontWeight:
                            "900",
                          fontSize:
                            13,
                        }}
                      >
                        Create Payout
                      </Text>

                      <DetailLine
                        label="Selected"
                        value={
                          selectedCommissionIds.length
                        }
                      />

                      <DetailLine
                        label="Total"
                        value={fmtMoney(
                          selectedPayoutTotal
                        )}
                      />

                      <TextInput
                        value={
                          payoutMethod
                        }
                        onChangeText={(
                          value
                        ) =>
                          setPayoutMethod(
                            upper(
                              value
                            )
                          )
                        }
                        placeholder="MOBILE_MONEY"
                        placeholderTextColor="rgba(255,255,255,0.45)"
                        autoCapitalize="characters"
                        style={{
                          minHeight:
                            50,
                          borderRadius:
                            14,
                          borderWidth:
                            1,
                          borderColor:
                            "rgba(255,255,255,0.12)",
                          backgroundColor:
                            "rgba(255,255,255,0.05)",
                          color:
                            UI.text,
                          paddingHorizontal:
                            12,
                          fontWeight:
                            "800",
                        }}
                      />

                      <TextInput
                        value={
                          payoutReference
                        }
                        onChangeText={
                          setPayoutReference
                        }
                        placeholder="Payout reference (optional)"
                        placeholderTextColor="rgba(255,255,255,0.45)"
                        style={{
                          minHeight:
                            50,
                          borderRadius:
                            14,
                          borderWidth:
                            1,
                          borderColor:
                            "rgba(255,255,255,0.12)",
                          backgroundColor:
                            "rgba(255,255,255,0.05)",
                          color:
                            UI.text,
                          paddingHorizontal:
                            12,
                          fontWeight:
                            "800",
                        }}
                      />

                      <TextInput
                        value={
                          payoutNote
                        }
                        onChangeText={
                          setPayoutNote
                        }
                        placeholder="Payout note (optional)"
                        placeholderTextColor="rgba(255,255,255,0.45)"
                        multiline
                        style={{
                          minHeight:
                            75,
                          borderRadius:
                            14,
                          borderWidth:
                            1,
                          borderColor:
                            "rgba(255,255,255,0.12)",
                          backgroundColor:
                            "rgba(255,255,255,0.05)",
                          color:
                            UI.text,
                          paddingHorizontal:
                            12,
                          paddingVertical:
                            12,
                          fontWeight:
                            "800",
                          textAlignVertical:
                            "top",
                        }}
                      />

                      <View
                        style={{
                          flexDirection:
                            "row",
                          gap: 10,
                        }}
                      >
                        <ActionButton
                          label={
                            creatingPayout
                              ? "SAVING..."
                              : "CONFIRM PAYOUT"
                          }
                          onPress={() =>
                            void createPartnerPayout()
                          }
                          disabled={
                            creatingPayout ||
                            selectedCommissionIds.length ===
                              0
                          }
                        />
                      </View>
                    </View>
                  ) : null}

                  {partnerCommissions.length ===
                  0 ? (
                    <Text
                      style={{
                        color:
                          UI.muted,
                        fontWeight:
                          "800",
                        marginTop:
                          12,
                      }}
                    >
                      No commissions yet.
                    </Text>
                  ) : (
                    <View
                      style={{
                        marginTop: 12,
                        gap: 10,
                      }}
                    >
                      {partnerCommissions.map(
                        (row) => {
                          const status =
                            upper(
                              row.commission_status
                            );

                          const selectable =
                            isReadyCommission(
                              status
                            );

                          const selected =
                            selectedCommissionIds.includes(
                              row.commission_id
                            );

                          const tone =
                            commissionTone(
                              status
                            );

                          return (
                            <Pressable
                              key={
                                row.commission_id
                              }
                              disabled={
                                !selectable
                              }
                              onPress={() =>
                                toggleCommissionSelection(
                                  row.commission_id
                                )
                              }
                              style={({
                                pressed,
                              }) => ({
                                opacity:
                                  !selectable
                                    ? 0.7
                                    : pressed
                                    ? 0.92
                                    : 1,
                              })}
                            >
                              <View
                                style={{
                                  borderWidth:
                                    1,
                                  borderColor:
                                    selected
                                      ? UI.emeraldBorder
                                      : tone.borderColor,
                                  backgroundColor:
                                    selected
                                      ? "rgba(16,185,129,0.10)"
                                      : tone.backgroundColor,
                                  borderRadius:
                                    15,
                                  padding:
                                    12,
                                  gap: 5,
                                }}
                              >
                                <View
                                  style={{
                                    flexDirection:
                                      "row",
                                    justifyContent:
                                      "space-between",
                                    gap: 10,
                                  }}
                                >
                                  <Text
                                    style={{
                                      color:
                                        UI.text,
                                      fontWeight:
                                        "900",
                                      fontSize:
                                        13,
                                      flex: 1,
                                    }}
                                  >
                                    {clean(
                                      row.referred_email_snapshot
                                    ) ||
                                      "Customer"}
                                  </Text>

                                  <Text
                                    style={{
                                      color:
                                        UI.text,
                                      fontWeight:
                                        "900",
                                      fontSize:
                                        10,
                                    }}
                                  >
                                    {
                                      status
                                    }
                                  </Text>
                                </View>

                                <DetailLine
                                  label="Commission"
                                  value={fmtMoney(
                                    row.commission_amount_tzs ??
                                      0
                                  )}
                                />

                                <DetailLine
                                  label="Percent"
                                  value={`${
                                    row.commission_percent ??
                                    0
                                  }%`}
                                />

                                <DetailLine
                                  label="Month"
                                  value={
                                    row.commission_month_number ??
                                    "—"
                                  }
                                />

                                <DetailLine
                                  label="Unlock"
                                  value={
                                    clean(
                                      row.unlock_at
                                    )
                                      ? fmtDateTime(
                                          row.unlock_at
                                        )
                                      : status ===
                                        "LOCKED"
                                      ? "WAITING RELEASE"
                                      : "—"
                                  }
                                />

                                {selectable ? (
                                  <Text
                                    style={{
                                      color:
                                        UI.text,
                                      fontWeight:
                                        "900",
                                      fontSize:
                                        11,
                                      marginTop:
                                        3,
                                    }}
                                  >
                                    {selected
                                      ? "SELECTED"
                                      : "TAP TO SELECT"}
                                  </Text>
                                ) : null}
                              </View>
                            </Pressable>
                          );
                        }
                      )}
                    </View>
                  )}
                </View>

                <View
                  style={{
                    marginTop: 20,
                  }}
                >
                  <Text
                    style={{
                      color: UI.text,
                      fontWeight: "900",
                      fontSize: 14,
                    }}
                  >
                    Referrals
                  </Text>

                  {partnerReferrals.length ===
                  0 ? (
                    <Text
                      style={{
                        color:
                          UI.muted,
                        fontWeight:
                          "800",
                        marginTop:
                          10,
                      }}
                    >
                      No referrals yet.
                    </Text>
                  ) : (
                    <View
                      style={{
                        marginTop: 10,
                        gap: 10,
                      }}
                    >
                      {partnerReferrals.map(
                        (row) => (
                          <View
                            key={
                              row.referral_id
                            }
                            style={{
                              borderWidth:
                                1,
                              borderColor:
                                "rgba(255,255,255,0.10)",
                              backgroundColor:
                                "rgba(255,255,255,0.04)",
                              borderRadius:
                                15,
                              padding:
                                12,
                              gap: 5,
                            }}
                          >
                            <Text
                              style={{
                                color:
                                  UI.text,
                                fontWeight:
                                  "900",
                                fontSize:
                                  13,
                              }}
                            >
                              {clean(
                                row.referred_email_snapshot
                              ) ||
                                "Customer"}
                            </Text>

                            <DetailLine
                              label="Status"
                              value={upper(
                                row.status
                              )}
                            />

                            <DetailLine
                              label="Linked"
                              value={fmtDateTime(
                                row.linked_at
                              )}
                            />

                            <DetailLine
                              label="Total Commission"
                              value={fmtMoney(
                                row.total_commission_tzs ??
                                  0
                              )}
                            />

                            <DetailLine
                              label="Unpaid"
                              value={fmtMoney(
                                row.unpaid_commission_tzs ??
                                  0
                              )}
                            />
                          </View>
                        )
                      )}
                    </View>
                  )}
                </View>

                <View
                  style={{
                    marginTop: 20,
                  }}
                >
                  <Text
                    style={{
                      color: UI.text,
                      fontWeight: "900",
                      fontSize: 14,
                    }}
                  >
                    Payout History
                  </Text>

                  {partnerPayouts.length ===
                  0 ? (
                    <Text
                      style={{
                        color:
                          UI.muted,
                        fontWeight:
                          "800",
                        marginTop:
                          10,
                      }}
                    >
                      No payouts yet.
                    </Text>
                  ) : (
                    <View
                      style={{
                        marginTop: 10,
                        gap: 10,
                      }}
                    >
                      {partnerPayouts.map(
                        (row) => (
                          <View
                            key={
                              row.payout_id
                            }
                            style={{
                              borderWidth:
                                1,
                              borderColor:
                                "rgba(255,255,255,0.10)",
                              backgroundColor:
                                "rgba(255,255,255,0.04)",
                              borderRadius:
                                15,
                              padding:
                                12,
                              gap: 5,
                            }}
                          >
                            <Text
                              style={{
                                color:
                                  UI.text,
                                fontWeight:
                                  "900",
                                fontSize:
                                  14,
                              }}
                            >
                              {fmtMoney(
                                row.payout_amount_tzs ??
                                  0
                              )}
                            </Text>

                            <DetailLine
                              label="Status"
                              value={upper(
                                row.payout_status
                              )}
                            />

                            <DetailLine
                              label="Method"
                              value={
                                clean(
                                  row.payout_method
                                ) ||
                                "—"
                              }
                            />

                            <DetailLine
                              label="Reference"
                              value={
                                clean(
                                  row.payout_reference
                                ) ||
                                "—"
                              }
                            />

                            <DetailLine
                              label="Date"
                              value={fmtDateTime(
                                row.payout_date
                              )}
                            />
                          </View>
                        )
                      )}
                    </View>
                  )}
                </View>
              </>
            )}

            <View
              style={{
                marginTop: 18,
              }}
            >
              <ActionButton
                label="CLOSE DETAILS"
                onPress={() =>
                  setSelectedPartner(null)
                }
              />
            </View>
          </Card>
        </View>
      ) : null}

      <View
        style={{
          height:
            24 +
            Math.max(
              insets.bottom,
              0
            ),
        }}
      />
    </Screen>
  );
}