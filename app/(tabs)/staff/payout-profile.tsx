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

type PayoutProfileRow = {
  payment_method: string | null;
  mobile_network: string | null;
  mobile_number: string | null;
  bank_name: string | null;
  bank_account_name: string | null;
  bank_account_number: string | null;
  account_holder_name: string | null;
  is_configured: boolean | null;
};

type PayoutMethod = "MOBILE" | "BANK";

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

function clean(s: any) {
  return String(s ?? "").trim();
}

function digitsOnly(s: any) {
  return String(s ?? "").replace(/[^\d]/g, "");
}

function InputField(props: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  keyboardType?: any;
}) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ color: UI.muted, fontWeight: "800" }}>{props.label}</Text>
      <TextInput
        value={props.value}
        onChangeText={props.onChangeText}
        placeholder={props.placeholder}
        placeholderTextColor="rgba(255,255,255,0.35)"
        keyboardType={props.keyboardType}
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
  );
}

function MethodChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        flex: 1,
        minHeight: 46,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: active ? "rgba(52,211,153,0.35)" : UI.border,
        backgroundColor: active ? "rgba(52,211,153,0.12)" : "rgba(255,255,255,0.05)",
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 12,
      }}
    >
      <Text
        style={{
          color: active ? UI.emerald : UI.text,
          fontWeight: "900",
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export default function StaffPayoutProfileScreen() {
  const router = useRouter();
  const { activeOrgId, activeOrgName, activeRole } = useOrg();

  const orgId = String(activeOrgId ?? "").trim();
  const isStaff = activeRole === "staff";

  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [paymentMethod, setPaymentMethod] = useState<PayoutMethod>("MOBILE");
  const [mobileNetwork, setMobileNetwork] = useState("");
  const [mobileNumber, setMobileNumber] = useState("");
  const [bankName, setBankName] = useState("");
  const [bankAccountName, setBankAccountName] = useState("");
  const [bankAccountNumber, setBankAccountNumber] = useState("");
  const [accountHolderName, setAccountHolderName] = useState("");
  const [isConfigured, setIsConfigured] = useState(false);

  const loadProfile = useCallback(
    async (opts?: { silent?: boolean }) => {
      const silent = !!opts?.silent;

      if (!isStaff) {
        setError("Staff only.");
        return;
      }

      if (!orgId) {
        setError("No active organization.");
        return;
      }

      if (!silent) {
        setLoading(true);
        setError(null);
      }

      try {
        const { data, error: e } = await supabase.rpc(
          "get_my_commission_payout_profile_v1",
          { p_org_id: orgId }
        );

        if (e) throw e;

        const row = Array.isArray(data) ? (data[0] ?? null) : (data as PayoutProfileRow | null);

        const method = String(row?.payment_method ?? "").trim().toUpperCase();

        setPaymentMethod(method === "BANK" ? "BANK" : "MOBILE");
        setMobileNetwork(clean(row?.mobile_network));
        setMobileNumber(clean(row?.mobile_number));
        setBankName(clean(row?.bank_name));
        setBankAccountName(clean(row?.bank_account_name));
        setBankAccountNumber(clean(row?.bank_account_number));
        setAccountHolderName(clean(row?.account_holder_name));
        setIsConfigured(!!row?.is_configured);
      } catch (err: any) {
        setError(err?.message ?? "Failed to load payout profile");
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [isStaff, orgId]
  );

  useFocusEffect(
    useCallback(() => {
      void loadProfile({ silent: true });
    }, [loadProfile])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadProfile();
    } finally {
      setRefreshing(false);
    }
  }, [loadProfile]);

  const invalidReason = useMemo(() => {
    if (!isStaff) return "Staff only.";
    if (!orgId) return "No active organization.";

    const holder = clean(accountHolderName);
    if (!holder) return "Weka account holder name.";

    if (paymentMethod === "MOBILE") {
      if (!clean(mobileNetwork)) return "Weka mobile network.";
      if (!digitsOnly(mobileNumber)) return "Weka mobile number sahihi.";
      return null;
    }

    if (paymentMethod === "BANK") {
      if (!clean(bankName)) return "Weka bank name.";
      if (!clean(bankAccountName)) return "Weka bank account name.";
      if (!digitsOnly(bankAccountNumber)) return "Weka bank account number sahihi.";
      return null;
    }

    return "Invalid payout method.";
  }, [
    isStaff,
    orgId,
    accountHolderName,
    paymentMethod,
    mobileNetwork,
    mobileNumber,
    bankName,
    bankAccountName,
    bankAccountNumber,
  ]);

  const saveProfile = useCallback(async () => {
    if (invalidReason) {
      Alert.alert("Blocked", invalidReason);
      return;
    }

    try {
      setSaving(true);

      const { error: e } = await supabase.rpc("upsert_my_commission_payout_profile_v1", {
        p_org_id: orgId,
        p_payment_method: paymentMethod,
        p_mobile_network: paymentMethod === "MOBILE" ? clean(mobileNetwork) : null,
        p_mobile_number: paymentMethod === "MOBILE" ? digitsOnly(mobileNumber) : null,
        p_bank_name: paymentMethod === "BANK" ? clean(bankName) : null,
        p_bank_account_name: paymentMethod === "BANK" ? clean(bankAccountName) : null,
        p_bank_account_number: paymentMethod === "BANK" ? digitsOnly(bankAccountNumber) : null,
        p_account_holder_name: clean(accountHolderName),
      });

      if (e) throw e;

      setIsConfigured(true);
      Alert.alert("Success", "Payout profile saved successfully.");
      await loadProfile({ silent: true });
    } catch (err: any) {
      Alert.alert("Failed", err?.message ?? "Failed to save payout profile");
    } finally {
      setSaving(false);
    }
  }, [
    invalidReason,
    orgId,
    paymentMethod,
    mobileNetwork,
    mobileNumber,
    bankName,
    bankAccountName,
    bankAccountNumber,
    accountHolderName,
    loadProfile,
  ]);

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
              Payout Profile
            </Text>
            <Text style={{ color: UI.muted, fontWeight: "800", marginTop: 4 }}>
              Setup ambapo commission zako zitapokelewa
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

          <View
            style={{
              borderWidth: 1,
              borderColor: isConfigured ? "rgba(52,211,153,0.30)" : UI.border,
              backgroundColor: isConfigured
                ? "rgba(52,211,153,0.10)"
                : "rgba(255,255,255,0.05)",
              borderRadius: 16,
              padding: 12,
            }}
          >
            <Text
              style={{
                color: isConfigured ? UI.emerald : UI.muted,
                fontWeight: "900",
              }}
            >
              {isConfigured ? "PROFILE CONFIGURED" : "PROFILE NOT CONFIGURED"}
            </Text>
          </View>

          <Text style={{ color: UI.faint, fontWeight: "800", lineHeight: 20 }}>
            Owner/Admin akifanya cash out, mfumo utatumia taarifa ulizoweka hapa.
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
            borderWidth: 1,
            borderColor: UI.border,
            borderRadius: 22,
            backgroundColor: UI.card,
            padding: 16,
            gap: 12,
          }}
        >
          <Text style={{ color: UI.text, fontWeight: "900", fontSize: 16 }}>
            Payout Method
          </Text>

          <View style={{ flexDirection: "row", gap: 10 }}>
            <MethodChip
              label="Mobile Money"
              active={paymentMethod === "MOBILE"}
              onPress={() => setPaymentMethod("MOBILE")}
            />
            <MethodChip
              label="Bank"
              active={paymentMethod === "BANK"}
              onPress={() => setPaymentMethod("BANK")}
            />
          </View>

          <InputField
            label="Account Holder Name"
            value={accountHolderName}
            onChangeText={setAccountHolderName}
            placeholder="mf: Juma Ali"
          />

          {paymentMethod === "MOBILE" ? (
            <>
              <InputField
                label="Mobile Network"
                value={mobileNetwork}
                onChangeText={setMobileNetwork}
                placeholder="mf: M-PESA / TIGO PESA / AIRTEL MONEY"
              />

              <InputField
                label="Mobile Number"
                value={mobileNumber}
                onChangeText={(v) => setMobileNumber(digitsOnly(v))}
                placeholder="mf: 0712345678"
                keyboardType="phone-pad"
              />
            </>
          ) : (
            <>
              <InputField
                label="Bank Name"
                value={bankName}
                onChangeText={setBankName}
                placeholder="mf: CRDB / NMB"
              />

              <InputField
                label="Bank Account Name"
                value={bankAccountName}
                onChangeText={setBankAccountName}
                placeholder="mf: Juma Ali"
              />

              <InputField
                label="Bank Account Number"
                value={bankAccountNumber}
                onChangeText={(v) => setBankAccountNumber(digitsOnly(v))}
                placeholder="mf: 015002345678"
                keyboardType="numeric"
              />
            </>
          )}

          <Pressable
            onPress={() => void saveProfile()}
            disabled={saving || !!invalidReason}
            style={{
              borderWidth: 1,
              borderColor: saving || !!invalidReason
                ? UI.border
                : "rgba(52,211,153,0.30)",
              borderRadius: 18,
              backgroundColor: saving || !!invalidReason
                ? "rgba(255,255,255,0.05)"
                : "rgba(52,211,153,0.10)",
              paddingVertical: 14,
              alignItems: "center",
              opacity: saving || !!invalidReason ? 0.6 : 1,
            }}
          >
            <Text style={{ color: UI.text, fontWeight: "900" }}>
              {saving ? "Saving..." : "Save Payout Profile"}
            </Text>
          </Pressable>

          {!!invalidReason ? (
            <Text style={{ color: UI.faint, fontWeight: "800", lineHeight: 20 }}>
              ⚠ {invalidReason}
            </Text>
          ) : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}