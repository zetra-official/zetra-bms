// app/settings/subscription.tsx
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { supabase } from "@/src/supabase/supabaseClient";
import { useOrg } from "@/src/context/OrgContext";
import { Card } from "@/src/ui/Card";
import { Screen } from "@/src/ui/Screen";
import { UI } from "@/src/ui/theme";

type PlanMonths = 1 | 3 | 6 | 12;
type PlanCode = "FREE" | "LITE" | "STARTER" | "PRO" | "BUSINESS" | "EXECUTIVE" | "ELITE";

type PlanRow = {
  id: string;
  code: PlanCode;
  name: string;
  description: string | null;
  monthly_price_tzs: number | null;
  is_public: boolean | null;
  is_active: boolean | null;
  ai_enabled: boolean | null;
  ai_credits_monthly: number | null;
  stores_per_org: number | null;
  staff_per_org: number | null;
  business_club_posts_per_month: number | null;
};

/**
 * ✅ THEME BRIDGE
 * Some builds export UI as flat tokens (UI.background, UI.emeraldBorder, ...)
 * but code uses UI.colors.*. This bridge supports BOTH without changing theme.ts.
 */
const C: any = (UI as any)?.colors ?? UI;

function formatTzs(v: number) {
  try {
    return `TZS ${Number(v || 0).toLocaleString("en-US")}`;
  } catch {
    return `TZS ${v || 0}`;
  }
}

function getDiscountRate(months: PlanMonths) {
  if (months === 3) return 0.05;
  if (months === 6) return 0.10;
  if (months === 12) return 0.20;
  return 0;
}

function getExpectedAmount(monthlyPrice: number, months: PlanMonths) {
  const gross = monthlyPrice * months;
  const discount = gross * getDiscountRate(months);
  return Math.round(gross - discount);
}

function planMonthsLabel(m: PlanMonths) {
  if (m === 1) return "1 month";
  return `${m} months`;
}

function clean(s: any) {
  return String(s ?? "").trim();
}

function Pill({ label }: { label: string }) {
  return (
    <View
      style={{
        paddingHorizontal: 10,
        height: 28,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.12)",
        backgroundColor: "rgba(255,255,255,0.06)",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text style={{ color: UI.muted, fontWeight: "900", fontSize: 12 }}>{label}</Text>
    </View>
  );
}

function PrimaryButton({
  label,
  onPress,
  danger,
  disabled,
}: {
  label: string;
  onPress: () => void;
  danger?: boolean;
  disabled?: boolean;
}) {
  const border = danger ? "rgba(239,68,68,0.35)" : C.emeraldBorder;
  const bg = danger ? "rgba(239,68,68,0.12)" : C.emeraldSoft;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={10}
      style={({ pressed }) => ({
        height: 48,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: disabled ? "rgba(255,255,255,0.12)" : border,
        backgroundColor: disabled ? "rgba(255,255,255,0.06)" : bg,
        alignItems: "center",
        justifyContent: "center",
        opacity: disabled ? 0.55 : pressed ? 0.95 : 1,
      })}
    >
      <Text style={{ color: UI.text, fontWeight: "900" }}>{label}</Text>
    </Pressable>
  );
}

function SmallPlanBtn({
  label,
  onPress,
  disabled,
  selected,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  selected?: boolean;
}) {
  const borderColor = selected ? C.emeraldBorder : "rgba(255,255,255,0.12)";
  const bgColor = selected ? "rgba(16,185,129,0.18)" : "rgba(255,255,255,0.06)";

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={10}
      style={({ pressed }) => ({
        flex: 1,
        height: 46,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: disabled ? "rgba(255,255,255,0.12)" : borderColor,
        backgroundColor: disabled ? "rgba(255,255,255,0.06)" : bgColor,
        alignItems: "center",
        justifyContent: "center",
        opacity: disabled ? 0.55 : pressed ? 0.98 : 1,
      })}
    >
      <Text style={{ color: UI.text, fontWeight: "900", fontSize: 12 }}>
        {selected ? `✓ ${label}` : label}
      </Text>
    </Pressable>
  );
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder: string;
  keyboardType?: "default" | "number-pad" | "phone-pad";
}) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ color: UI.muted, fontWeight: "900", fontSize: 12 }}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={UI.faint}
        keyboardType={keyboardType ?? "default"}
        autoCapitalize="characters"
        style={{
          minHeight: 52,
          borderRadius: 14,
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.12)",
          backgroundColor: "rgba(255,255,255,0.06)",
          color: UI.text,
          paddingHorizontal: 14,
          fontWeight: "800",
        }}
      />
    </View>
  );
}

export default function SubscriptionScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const org = useOrg();

  const topPad = Math.max(insets.top, 10) + 8;

  const activeOrgId = org.activeOrgId ?? null;
  const activeOrgName = org.activeOrgName ?? "—";
  const activeRole = org.activeRole ?? "—";

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [selectedPlanCode, setSelectedPlanCode] = useState<PlanCode>("STARTER");
  const [selectedMonths, setSelectedMonths] = useState<PlanMonths>(1);

  const [payerPhone, setPayerPhone] = useState("");
  const [transactionRef, setTransactionRef] = useState("");
  const [payerName, setPayerName] = useState("");

  const canManage = useMemo(() => {
    const r = String(activeRole).toLowerCase();
    return r === "owner" || r === "admin";
  }, [activeRole]);

  const loadPlans = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("plans")
        .select(
          `
            id,
            code,
            name,
            description,
            monthly_price_tzs,
            is_public,
            is_active,
            ai_enabled,
            ai_credits_monthly,
            stores_per_org,
            staff_per_org,
            business_club_posts_per_month
          `
        )
        .eq("is_public", true)
        .eq("is_active", true)
        .order("monthly_price_tzs", { ascending: true });

      if (error) throw error;

      const rows = ((data ?? []) as any[]).map((r) => ({
        id: String(r.id),
        code: String(r.code).toUpperCase() as PlanCode,
        name: String(r.name ?? r.code ?? "").toUpperCase(),
        description: r.description ?? null,
        monthly_price_tzs: Number(r.monthly_price_tzs ?? 0),
        is_public: !!r.is_public,
        is_active: !!r.is_active,
        ai_enabled: !!r.ai_enabled,
        ai_credits_monthly: Number(r.ai_credits_monthly ?? 0),
        stores_per_org: r.stores_per_org == null ? null : Number(r.stores_per_org),
        staff_per_org: r.staff_per_org == null ? null : Number(r.staff_per_org),
        business_club_posts_per_month:
          r.business_club_posts_per_month == null
            ? null
            : Number(r.business_club_posts_per_month),
      }));

      setPlans(rows);

      const hasStarter = rows.some((p) => p.code === "STARTER");
      if (hasStarter) setSelectedPlanCode("STARTER");
      else if (rows.length > 0) setSelectedPlanCode(rows[0].code);
    } catch (e: any) {
      Alert.alert("Load failed", e?.message ?? "Failed to load plans.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPlans();
  }, [loadPlans]);

  const selectedPlan = useMemo(
    () => plans.find((p) => p.code === selectedPlanCode) ?? null,
    [plans, selectedPlanCode]
  );

  const expectedAmount = useMemo(() => {
    const monthly = Number(selectedPlan?.monthly_price_tzs ?? 0);
    return getExpectedAmount(monthly, selectedMonths);
  }, [selectedPlan, selectedMonths]);

  const submitPaymentRequest = useCallback(async () => {
    if (!activeOrgId) {
      Alert.alert("No organization", "Please select an active organization first.");
      return;
    }

    if (!selectedPlan) {
      Alert.alert("No plan selected", "Please choose a plan first.");
      return;
    }

    const phone = clean(payerPhone);
    const ref = clean(transactionRef).toUpperCase();
    const name = clean(payerName);

    if (!phone) {
      Alert.alert("Phone required", "Enter the phone number used to pay.");
      return;
    }

    if (!ref) {
      Alert.alert("Reference required", "Enter the transaction/reference ID.");
      return;
    }

    setSubmitting(true);
    try {
      const { error } = await supabase.rpc("submit_subscription_payment_request", {
        p_organization_id: activeOrgId,
        p_plan_code: selectedPlan.code,
        p_duration_months: selectedMonths,
        p_expected_amount: expectedAmount,
        p_submitted_amount: expectedAmount,
        p_transaction_reference: ref,
        p_payer_phone: phone,
        p_payer_name: name || null,
      });

      if (error) throw error;

      setTransactionRef("");
      setPayerPhone("");
      setPayerName("");

      Alert.alert(
        "Request submitted",
        `Your payment request was sent successfully.\n\nPlan: ${selectedPlan.code}\nDuration: ${planMonthsLabel(
          selectedMonths
        )}\nExpected amount: ${formatTzs(expectedAmount)}\n\nStatus: PENDING`
      );
    } catch (e: any) {
      Alert.alert("Submit failed", e?.message ?? "Failed to submit payment request.");
    } finally {
      setSubmitting(false);
    }
  }, [
    activeOrgId,
    expectedAmount,
    payerName,
    payerPhone,
    selectedMonths,
    selectedPlan,
    transactionRef,
  ]);

  return (
    <Screen scroll={false} contentStyle={{ paddingTop: 0, paddingHorizontal: 0, paddingBottom: 0 }}>
      <View
        style={{
          paddingTop: topPad,
          paddingBottom: 12,
          paddingHorizontal: 16,
          borderBottomWidth: 1,
          borderBottomColor: "rgba(255,255,255,0.08)",
          backgroundColor: C.background,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <Pressable
            onPress={() => router.back()}
            hitSlop={10}
            style={({ pressed }) => ({
              width: 44,
              height: 44,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.12)",
              backgroundColor: "rgba(255,255,255,0.06)",
              alignItems: "center",
              justifyContent: "center",
              opacity: pressed ? 0.95 : 1,
            })}
          >
            <Ionicons name="chevron-back" size={22} color={UI.text} />
          </Pressable>

          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ color: UI.text, fontWeight: "900", fontSize: 18 }} numberOfLines={1}>
              Subscription & Billing
            </Text>
            <Text style={{ color: UI.muted, fontWeight: "800", marginTop: 2 }} numberOfLines={1}>
              {activeOrgName} • {String(activeRole).toUpperCase()}
            </Text>
          </View>

          <Pill label="MANUAL" />
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{
          padding: 16,
          gap: 12,
          paddingBottom: Math.max(insets.bottom, 12) + 18,
        }}
        showsVerticalScrollIndicator={false}
      >
        <Card style={{ padding: 14, borderRadius: 18 }}>
          <Text style={{ color: UI.text, fontWeight: "900", fontSize: 14 }}>Current subscription</Text>

          <View style={{ marginTop: 10, gap: 6 }}>
            <Text style={{ color: UI.muted, fontWeight: "800" }}>
              Org: <Text style={{ color: UI.text }}>{activeOrgName}</Text>
            </Text>

            <Text style={{ color: UI.muted, fontWeight: "800" }}>
              Role: <Text style={{ color: UI.text }}>{String(activeRole).toUpperCase()}</Text>
            </Text>

            <Text style={{ color: UI.faint, fontWeight: "800", marginTop: 6 }}>
              Plan limits are DB-driven. Payment requests are submitted manually, then approved by
              Owner/Admin.
            </Text>
          </View>
        </Card>

        <Card style={{ padding: 14, borderRadius: 18 }}>
          <Text style={{ color: UI.text, fontWeight: "900", fontSize: 14 }}>
            Choose billing duration
          </Text>

          <Text style={{ color: UI.muted, fontWeight: "800", marginTop: 8 }}>
            1 • 3 • 6 • 12 months (discounts optional)
          </Text>

          <View style={{ marginTop: 12, gap: 8 }}>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <SmallPlanBtn
                label="1 month"
                onPress={() => setSelectedMonths(1)}
                disabled={submitting || loading}
                selected={selectedMonths === 1}
              />
              <SmallPlanBtn
                label="3 months • -5%"
                onPress={() => setSelectedMonths(3)}
                disabled={submitting || loading}
                selected={selectedMonths === 3}
              />
            </View>

            <View style={{ flexDirection: "row", gap: 8 }}>
              <SmallPlanBtn
                label="6 months • -10%"
                onPress={() => setSelectedMonths(6)}
                disabled={submitting || loading}
                selected={selectedMonths === 6}
              />
              <SmallPlanBtn
                label="12 months • -20%"
                onPress={() => setSelectedMonths(12)}
                disabled={submitting || loading}
                selected={selectedMonths === 12}
              />
            </View>
          </View>
        </Card>

        <Card style={{ padding: 14, borderRadius: 18 }}>
          <Text style={{ color: UI.text, fontWeight: "900", fontSize: 14 }}>Choose plan</Text>
          <Text style={{ color: UI.muted, fontWeight: "800", marginTop: 8 }}>
            Select a plan then activate via mobile payment.
          </Text>

          <View style={{ marginTop: 12, gap: 12 }}>
            {loading ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <ActivityIndicator />
                <Text style={{ color: UI.muted, fontWeight: "900" }}>Loading plans…</Text>
              </View>
            ) : (
              plans.map((p) => {
                const selected = p.code === selectedPlanCode;
                const amount = getExpectedAmount(Number(p.monthly_price_tzs ?? 0), selectedMonths);

                return (
                  <Pressable
                    key={p.id}
                    onPress={() => setSelectedPlanCode(p.code)}
                    style={({ pressed }) => ({
                      padding: 16,
                      borderRadius: 18,
                      borderWidth: 1,
                      borderColor: selected ? C.emeraldBorder : "rgba(255,255,255,0.10)",
                      backgroundColor: selected ? "rgba(16,185,129,0.10)" : "rgba(255,255,255,0.04)",
                      opacity: pressed ? 0.98 : 1,
                    })}
                  >
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "flex-start",
                        justifyContent: "space-between",
                        gap: 12,
                      }}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: UI.text, fontWeight: "900", fontSize: 16 }}>
                          {p.code} {selected ? "✅" : ""}
                        </Text>
                        <Text style={{ color: UI.muted, fontWeight: "800", marginTop: 4 }}>
                          Code: {p.code}
                        </Text>
                      </View>

                      <View
                        style={{
                          paddingHorizontal: 12,
                          height: 40,
                          borderRadius: 999,
                          borderWidth: 1,
                          borderColor: selected ? C.emeraldBorder : "rgba(255,255,255,0.12)",
                          backgroundColor: selected ? C.emeraldSoft : "rgba(255,255,255,0.06)",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <Text style={{ color: UI.text, fontWeight: "900" }}>
                          {formatTzs(amount)}
                        </Text>
                      </View>
                    </View>

                    <View style={{ marginTop: 12, gap: 6 }}>
                      <Text style={{ color: UI.muted, fontWeight: "800" }}>
                        Organizations:{" "}
                        <Text style={{ color: UI.text }}>
                          {p.code === "BUSINESS" ? 2 : p.code === "EXECUTIVE" ? 4 : 1}
                        </Text>
                      </Text>

                      <Text style={{ color: UI.muted, fontWeight: "800" }}>
                        Stores/Org: <Text style={{ color: UI.text }}>{p.stores_per_org ?? "—"}</Text> •
                        Staff/Org: <Text style={{ color: UI.text }}>{p.staff_per_org ?? "—"}</Text>
                      </Text>

                      <Text style={{ color: UI.muted, fontWeight: "800" }}>
                        Club Posts/Store/Month:{" "}
                        <Text style={{ color: UI.text }}>
                          {p.business_club_posts_per_month ?? "—"}
                        </Text>
                      </Text>

                      <Text style={{ color: UI.muted, fontWeight: "800" }}>
                        AI:{" "}
                        <Text style={{ color: UI.text }}>
                          {p.ai_enabled
                            ? `Enabled • Credits/mo: ${p.ai_credits_monthly ?? 0}`
                            : "Disabled"}
                        </Text>
                      </Text>
                    </View>
                  </Pressable>
                );
              })
            )}
          </View>
        </Card>

        <Card style={{ padding: 14, borderRadius: 18 }}>
          <Text style={{ color: UI.text, fontWeight: "900", fontSize: 14 }}>Confirm payment</Text>

          <View
            style={{
              marginTop: 12,
              padding: 14,
              borderRadius: 18,
              borderWidth: 1,
              borderColor: C.emeraldBorder,
              backgroundColor: "rgba(16,185,129,0.10)",
              gap: 8,
            }}
          >
<Text style={{ color: UI.text, fontWeight: "900", fontSize: 14 }}>Pay To</Text>
<Text style={{ color: UI.text, fontWeight: "900" }}>ZETRA TECHNOLOGIES</Text>

<Text style={{ color: UI.muted, fontWeight: "900", marginTop: 4 }}>Payment Method</Text>
<Text style={{ color: UI.text, fontWeight: "900" }}>VODACOM M-PESA LIPA</Text>

<Text style={{ color: UI.muted, fontWeight: "900", marginTop: 4 }}>Lipa Number</Text>
<Text style={{ color: UI.text, fontWeight: "900" }}>354098140</Text>

            <Text style={{ color: UI.faint, fontWeight: "800", marginTop: 8 }}>
              Baada ya kulipa, utapata SMS ya muamala. Copy ile
              “Receipt/Reference/Transaction ID” uiweke hapa chini.
            </Text>
          </View>

          <View
            style={{
              marginTop: 12,
              padding: 14,
              borderRadius: 18,
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.10)",
              backgroundColor: "rgba(255,255,255,0.04)",
              gap: 8,
            }}
          >
            <Text style={{ color: UI.muted, fontWeight: "900" }}>Plan</Text>
            <Text style={{ color: UI.text, fontWeight: "900" }}>{selectedPlan?.code ?? "—"}</Text>

            <Text style={{ color: UI.muted, fontWeight: "900", marginTop: 4 }}>Duration</Text>
            <Text style={{ color: UI.text, fontWeight: "900" }}>{planMonthsLabel(selectedMonths)}</Text>

            <Text style={{ color: UI.muted, fontWeight: "900", marginTop: 4 }}>Amount</Text>
            <Text style={{ color: UI.text, fontWeight: "900" }}>{formatTzs(expectedAmount)}</Text>
          </View>

          <View style={{ marginTop: 12, gap: 10 }}>
            <Field
              label="Phone Number"
              value={payerPhone}
              onChangeText={setPayerPhone}
              placeholder="0758014675"
              keyboardType="phone-pad"
            />

            <Field
              label="Transaction / Reference ID"
              value={transactionRef}
              onChangeText={(v) => setTransactionRef(v.toUpperCase())}
              placeholder="TEUEHHJAL"
            />

            <Field
              label="Payer Name (optional)"
              value={payerName}
              onChangeText={setPayerName}
              placeholder="JOFREY JOHN SANGA"
            />
          </View>

          <View style={{ marginTop: 14, gap: 10 }}>
            <PrimaryButton
              label={submitting ? "Submitting..." : "CONFIRM & SEND REQUEST"}
              onPress={() => void submitPaymentRequest()}
              disabled={!activeOrgId || loading || submitting || !selectedPlan || !canManage}
            />
          </View>

          {!canManage ? (
            <Text style={{ color: UI.faint, fontWeight: "800", marginTop: 12 }}>
              Staff cannot manage subscription. Owner/Admin only.
            </Text>
          ) : null}

          <Text style={{ color: UI.faint, fontWeight: "800", marginTop: 12 }}>
            Note: Kwa sasa tunatumia manual confirm. Ukishaandika ref, request itaingia PENDING
            mpaka Owner/Admin a-approve.
          </Text>
        </Card>

        <Card style={{ padding: 14, borderRadius: 18 }}>
          <Text style={{ color: UI.text, fontWeight: "900", fontSize: 14 }}>
            Organizations overview
          </Text>

          <View style={{ marginTop: 10, gap: 10 }}>
            {(org.orgs ?? []).map((o) => {
              const isActive = o.organization_id === activeOrgId;

              return (
                <View
                  key={o.organization_id}
                  style={{
                    padding: 12,
                    borderRadius: 14,
                    borderWidth: 1,
                    borderColor: isActive ? C.emeraldBorder : "rgba(255,255,255,0.10)",
                    backgroundColor: isActive ? "rgba(16,185,129,0.10)" : "rgba(255,255,255,0.04)",
                  }}
                >
                  <Text style={{ color: UI.text, fontWeight: "900" }} numberOfLines={1}>
                    {o.organization_name}
                  </Text>

                  <Text style={{ color: UI.muted, fontWeight: "800", marginTop: 4 }}>
                    role: {o.role}
                  </Text>
                </View>
              );
            })}
          </View>

          <Text style={{ color: UI.faint, fontWeight: "800", fontSize: 11, marginTop: 12 }}>
            Real billing request flow is now DB-driven. Approval screen comes next.
          </Text>
        </Card>
      </ScrollView>
    </Screen>
  );
}