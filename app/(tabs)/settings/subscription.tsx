// app/(tabs)/settings/subscription.tsx
import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Screen } from "@/src/ui/Screen";
import { Card } from "@/src/ui/Card";
import { Button } from "@/src/ui/Button";
import { UI } from "@/src/ui/theme";
import { useOrg } from "@/src/context/OrgContext";
import { supabase } from "@/src/supabase/supabaseClient";

function clean(s: any) {
  return String(s ?? "").trim();
}
function upper(s: any) {
  return clean(s).toUpperCase();
}

type PlanRow = {
  id?: string;
  code?: string;
  name?: string;

  // prices (any of these could exist depending on schema)
  price_tzs?: number;
  price_monthly?: number;
  price?: number;
  amount?: number;

  // legacy fields (some DBs used max_*)
  max_organizations?: number;
  max_orgs?: number;

  max_stores?: number;
  maxStores?: number;

  max_staff?: number;
  maxStaff?: number;

  // ✅ NEW canonical limits (your plans table columns)
  stores_per_org?: number;
  staff_per_org?: number;
  business_club_posts_per_store_month?: number;
  ai_enabled?: boolean;

  // optional extras
  ai_credits_monthly?: number;
  advanced_reports_enabled?: boolean;

  [k: string]: any;
};

type DurationRow = {
  months: number;
  label?: string;
  discount_percent?: number;
  multiplier?: number;
  [k: string]: any;
};

type MySubRow = {
  plan_code?: string;
  plan_name?: string;
  status?: string;
  expires_at?: string;
  started_at?: string;

  // OPTIONAL if your RPC returns it (good to have)
  duration_months?: number;

  [k: string]: any;
};

function fmtLimit(v: any) {
  if (v === null || v === undefined) return "—";
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  if (n < 0) return "—";
  return String(n);
}

function num(v: any): number | null {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return n;
}

function fmtMoneyTZS(v: any) {
  const n = num(v);
  if (n === null) return "—";
  const s = Math.round(n).toString();
  const withComma = s.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `TZS ${withComma}`;
}

function fmtISODate(v: any) {
  const s = clean(v);
  if (!s) return "—";
  try {
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return s;
    return d.toISOString().slice(0, 10);
  } catch {
    return s;
  }
}

/**
 * ✅ Canonical fallback prices (TZS / month)
 * If DB returns price_tzs, we use it.
 * If DB doesn't, we fallback to this map by plan code.
 */
const FALLBACK_PRICE_TZS: Record<string, number> = {
  FREE: 0,
  LITE: 10000,
  STARTER: 15000,
  PRO: 45000,
  BUSINESS: 100000,
  EXECUTIVE: 150000,
  // ELITE is "Contact Sales"
};

function getPlanCode(p: any) {
  // IMPORTANT: always normalize to UPPER for stable matching
  return upper(p?.code) || upper(p?.id) || upper(p?.name) || "";
}

function getPlanPriceMonthlyTZS(p: any): number | null {
  const code = getPlanCode(p);
  const db =
    num(p?.price_tzs) ??
    num(p?.price_monthly) ??
    num(p?.price) ??
    num(p?.amount) ??
    null;

  if (db !== null) return db;

  if (code && FALLBACK_PRICE_TZS[code] !== undefined) return FALLBACK_PRICE_TZS[code];
  return null;
}

function getDurationDiscountPercent(d: any): number {
  const raw = num(d?.discount_percent);
  if (raw === null) return 0;
  if (raw < 0) return 0;
  if (raw > 100) return 100;
  return raw;
}

function computeTotalTZS(monthly: number, months: number, discountPercent: number) {
  const base = monthly * months;
  const disc = base * (discountPercent / 100);
  const total = Math.max(0, Math.round(base - disc));
  return total;
}

/**
 * ✅ Temporary manual Mobile Money receiver (Vodacom ONLY)
 * NOTE: Later we replace with Selcom/webhook.
 */
const PAY_TO_NAME = "JOFREY JOHN SANGA";
const PAY_TO_NETWORK = "VODACOM (M-PESA)";
const PAY_TO_PHONE = "0758014675";

/**
 * ✅ Normalize transaction reference:
 * - trim
 * - uppercase
 * - remove extra spaces
 * - keep readable: allow letters/numbers/-/_
 */
function normalizeTxRef(input: any) {
  const t = upper(input);
  const collapsed = t.replace(/\s+/g, " ").trim();
  const safe = collapsed.replace(/[^A-Z0-9 _-]/g, "");
  return safe;
}

/**
 * ✅ Plan-driven limit mapping (NEW plans table columns + legacy fallback)
 */
function getPlanLimits(p: any) {
  const plan = p ?? {};
  const maxOrgs = plan.max_organizations ?? plan.max_orgs ?? null;

  // ✅ NEW canonical
  const storesPerOrg = plan.stores_per_org ?? plan.max_stores ?? plan.maxStores ?? null;
  const staffPerOrg = plan.staff_per_org ?? plan.max_staff ?? plan.maxStaff ?? null;

  // ✅ NEW canonical (Club)
  const postsPerStoreMonth = plan.business_club_posts_per_store_month ?? null;

  // ✅ NEW canonical (AI)
  const aiEnabled = typeof plan.ai_enabled === "boolean" ? plan.ai_enabled : !!plan.ai_enabled;

  const credits = plan.ai_credits_monthly ?? null;
  const adv = !!plan.advanced_reports_enabled;

  return {
    maxOrgs,
    storesPerOrg,
    staffPerOrg,
    postsPerStoreMonth,
    aiEnabled,
    credits,
    adv,
  };
}

export default function SubscriptionScreen() {
  const router = useRouter();
  const org = useOrg();
  const insets = useSafeAreaInsets();

  const orgId = clean(org.activeOrgId);
  const canManage = org.activeRole === "owner"; // ✅ billing owner-only

  const headerSubtitle = useMemo(() => {
    const name = org.activeOrgName ?? "No organization";
    const role = org.activeRole ? upper(org.activeRole) : "—";
    return `${name} • ${role}`;
  }, [org.activeOrgName, org.activeRole]);

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [mySub, setMySub] = useState<MySubRow | null>(null);
  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [durations, setDurations] = useState<DurationRow[]>([
    { months: 1, label: "1 month" },
    { months: 3, label: "3 months", discount_percent: 5 },
    { months: 6, label: "6 months", discount_percent: 10 },
    { months: 12, label: "12 months", discount_percent: 20 },
  ]);

  // selection (store UPPER plan code for stability)
  const [selectedPlanCode, setSelectedPlanCode] = useState<string>("");
  const selectedPlanCodeRef = useRef<string>("");
  React.useEffect(() => {
    selectedPlanCodeRef.current = upper(selectedPlanCode);
  }, [selectedPlanCode]);

  const [selectedMonths, setSelectedMonths] = useState<number>(1);

  // payment flow
  const [payOpen, setPayOpen] = useState(false);
  const [paymentId, setPaymentId] = useState<string>("");
  const [payAmount, setPayAmount] = useState<string>("");
  const [payNote, setPayNote] = useState<string>("");
  const [txRef, setTxRef] = useState<string>("");

  // ✅ keyboard-aware modal
  const [kbVisible, setKbVisible] = useState(false);
  const scrollRef = useRef<ScrollView | null>(null);

  // ✅ prevent overwriting user selection when user is browsing plans
  const userTouchedPlanRef = useRef(false);

  React.useEffect(() => {
    const showSub = Keyboard.addListener("keyboardDidShow", () => setKbVisible(true));
    const hideSub = Keyboard.addListener("keyboardDidHide", () => setKbVisible(false));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const safeAlert = (title: string, msg: string) => Alert.alert(title, msg);

  const loadAll = useCallback(async () => {
    if (!orgId) {
      setLoading(false);
      setMySub(null);
      setPlans([]);
      return;
    }

    setLoading(true);
    try {
      // 1) current subscription
      const { data: subData, error: subErr } = await supabase.rpc("get_my_subscription", {
        p_org_id: orgId,
      });

      let currentCode = "";
      if (!subErr) {
        const row = Array.isArray(subData) ? (subData?.[0] as any) : (subData as any);
        const normalized = (row ?? null) as any;
        setMySub(normalized);

        currentCode = upper(normalized?.plan_code);
        // ✅ AUTO-HIGHLIGHT current plan (unless user already browsing)
        if (currentCode && !userTouchedPlanRef.current) {
          setSelectedPlanCode(currentCode);
        }
      } else {
        setMySub(null);
      }

      // 2) plans list
      const { data: planData, error: planErr } = await supabase.rpc("get_public_plans");
      if (planErr) throw planErr;

      const planRows = (planData ?? []) as PlanRow[];

      // ✅ Keep stable: remove ELITE from DB list (contact sales card is manual)
      const filtered = planRows.filter((p) => getPlanCode(p) !== "ELITE");
      setPlans(filtered);

      // ✅ If still no selection, choose: current plan else first returned
      const sel = selectedPlanCodeRef.current;
      if (!sel) {
        const pick = currentCode || getPlanCode(filtered?.[0]);
        if (pick) setSelectedPlanCode(upper(pick));
      }

      // 3) durations list (optional RPC)
      const { data: durData, error: durErr } = await supabase.rpc("get_plan_durations");

      if (!durErr && Array.isArray(durData) && durData.length > 0) {
        const d = (durData ?? []) as DurationRow[];
        const normalized = d
          .map((x) => ({
            ...x,
            months: Number((x as any)?.months ?? (x as any)?.duration_months ?? 0),
          }))
          .filter((x) => Number.isFinite(x.months) && x.months > 0)
          .sort((a, b) => a.months - b.months);

        if (normalized.length > 0) {
          setDurations(normalized);
          if (!normalized.some((x) => x.months === selectedMonths)) {
            setSelectedMonths(normalized[0].months);
          }
        }
      }
    } catch (e: any) {
      safeAlert("Subscription", e?.message ?? "Failed to load subscription data");
    } finally {
      setLoading(false);
    }
  }, [orgId, selectedMonths]);

  React.useEffect(() => {
    void loadAll();
  }, [loadAll]);

  // ✅ When mySub changes (e.g. after activation), re-highlight automatically (unless user browsing)
  React.useEffect(() => {
    const code = upper(mySub?.plan_code);
    if (code && !userTouchedPlanRef.current) {
      setSelectedPlanCode(code);
    }
  }, [mySub]);

  const currentPlanLabel = useMemo(() => {
    if (!mySub) return "—";
    const name = clean(mySub.plan_name) || clean(mySub.plan_code) || "—";
    const st = upper(mySub.status || "");
    return st ? `${name} • ${st}` : name;
  }, [mySub]);

  const startedLabel = useMemo(() => fmtISODate(mySub?.started_at), [mySub]);
  const expiryLabel = useMemo(() => fmtISODate(mySub?.expires_at), [mySub]);

  const selectedPlan = useMemo(() => {
    const key = upper(selectedPlanCode);
    if (!key) return null;
    return plans.find((p) => getPlanCode(p) === key) || null;
  }, [plans, selectedPlanCode]);

  const selectedDuration = useMemo(() => {
    const d = durations.find((x) => Number(x.months) === Number(selectedMonths)) || null;
    return d;
  }, [durations, selectedMonths]);

  const planFeatures = useMemo(() => {
    const p = selectedPlan as any;
    if (!p) return [];

    const lim = getPlanLimits(p);
    const out: string[] = [];

    out.push(`Organizations: ${fmtLimit(lim.maxOrgs)}`);
    out.push(`Stores per Organization: ${fmtLimit(lim.storesPerOrg)}`);
    out.push(`Staff per Organization: ${fmtLimit(lim.staffPerOrg)}`);

    out.push(`AI: ${lim.aiEnabled ? "Enabled" : "Disabled"}`);
    if (lim.aiEnabled) out.push(`AI Credits/Month: ${fmtLimit(lim.credits)}`);

    if (lim.adv) out.push("Advanced Reports: Enabled");
    if (lim.postsPerStoreMonth != null)
      out.push(`Business Club Posts/Store/Month: ${fmtLimit(lim.postsPerStoreMonth)}`);

    return out;
  }, [selectedPlan]);

  const makePay = useCallback(async () => {
    if (!canManage) {
      safeAlert("Not allowed", "Billing ni Owner tu.");
      return;
    }
    if (!orgId) {
      safeAlert("No org", "Organization haijapatikana.");
      return;
    }
    if (!selectedPlan) {
      safeAlert("Plan", "Chagua plan kwanza.");
      return;
    }

    setBusy(true);
    try {
      const planCode = upper(
        (selectedPlan as any)?.code ||
          (selectedPlan as any)?.plan_code ||
          getPlanCode(selectedPlan)
      );
      if (!planCode) throw new Error("Missing plan code");

      const payload: any = {
        p_org_id: orgId,
        p_plan_code: planCode,
        p_duration_months: selectedMonths,
        p_method: "MOBILE",
      };

      const { data, error } = await supabase.rpc("create_payment_intent_v1", payload);
      if (error) throw error;

      const row = Array.isArray(data) ? (data?.[0] as any) : (data as any);

      const pid = clean(row?.payment_id);
      if (!pid) throw new Error("Payment intent failed: missing payment_id");
      setPaymentId(pid);

      const amount = row?.expected_amount_tzs ?? null;
      setPayAmount(amount != null ? String(amount) : "");

      setPayNote(
        `Lipa kwa ${PAY_TO_NETWORK} kwenda namba ${PAY_TO_PHONE} (${PAY_TO_NAME}), kisha weka Transaction Reference (receipt code) ili tu-activate subscription.`
      );

      setTxRef("");
      setPayOpen(true);
    } catch (e: any) {
      safeAlert("Payment", e?.message ?? "Failed to create payment intent");
    } finally {
      setBusy(false);
    }
  }, [canManage, orgId, selectedPlan, selectedMonths]);

  const confirmPay = useCallback(async () => {
    if (!canManage) {
      safeAlert("Not allowed", "Billing ni Owner tu.");
      return;
    }

    const ref = normalizeTxRef(txRef);

    if (!paymentId) {
      safeAlert("Payment", "Missing payment_id. Rudi nyuma uanze tena.");
      return;
    }

    if (!ref) {
      safeAlert("Transaction ref", "Weka Transaction Reference (receipt code).");
      return;
    }
    if (ref.length < 6) {
      safeAlert(
        "Transaction ref",
        "Reference fupi sana. Copy receipt code kamili kutoka SMS ya muamala."
      );
      return;
    }

    setBusy(true);
    try {
      const payload: any = {
        p_payment_id: paymentId,
        p_transaction_ref: ref,
        p_is_test: false,
      };

      const { error } = await supabase.rpc("confirm_payment_and_activate_v1", payload);
      if (error) throw error;

      setPayOpen(false);
      safeAlert("Activated ✅", "Subscription ime-activate kikamilifu.");

      // ✅ Critical: refresh + auto highlight paid plan
      userTouchedPlanRef.current = false;
      await loadAll();
    } catch (e: any) {
      safeAlert("Confirm payment", e?.message ?? "Failed to confirm payment");
    } finally {
      setBusy(false);
    }
  }, [canManage, txRef, paymentId, loadAll]);

  const DurationPill = ({
    months,
    label,
    active,
    onPress,
    discountPercent,
  }: {
    months: number;
    label: string;
    active: boolean;
    onPress: () => void;
    discountPercent?: number;
  }) => {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [
          {
            paddingVertical: 10,
            paddingHorizontal: 12,
            borderRadius: 999,
            borderWidth: 1,
            borderColor: active ? UI.emeraldBorder : "rgba(255,255,255,0.10)",
            backgroundColor: active ? "rgba(16,185,129,0.14)" : "rgba(255,255,255,0.04)",
            opacity: pressed ? 0.92 : 1,
          },
        ]}
      >
        <Text style={{ color: UI.text, fontWeight: "900", fontSize: 12 }}>
          {label || `${months} mo`}
          {discountPercent ? ` • -${discountPercent}%` : ""}
        </Text>
      </Pressable>
    );
  };

  const PlanCard = ({ item }: { item: PlanRow }) => {
    const code = getPlanCode(item); // UPPER
    const active = upper(selectedPlanCode) === code;

    const currentPaidCode = upper(mySub?.plan_code);
    const isCurrentPaid = !!currentPaidCode && currentPaidCode === code;

    const label = clean(item.name) || clean(item.code) || "Plan";

    const priceMonthly = getPlanPriceMonthlyTZS(item);
    const discountPercent = getDurationDiscountPercent(selectedDuration);
    const total =
      priceMonthly !== null ? computeTotalTZS(priceMonthly, selectedMonths, discountPercent) : null;

    const lim = getPlanLimits(item);

    return (
      <Pressable
        onPress={() => {
          userTouchedPlanRef.current = true;
          setSelectedPlanCode(code);
        }}
        style={({ pressed }) => [
          {
            borderRadius: 22,
            borderWidth: 1,
            borderColor: active
              ? UI.emeraldBorder
              : isCurrentPaid
              ? "rgba(16,185,129,0.28)"
              : "rgba(255,255,255,0.12)",
            backgroundColor: active ? "rgba(16,185,129,0.10)" : "rgba(255,255,255,0.05)",
            padding: 14,
            opacity: pressed ? 0.95 : 1,
            marginBottom: 12,
          },
        ]}
      >
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <View style={{ flex: 1, paddingRight: 10 }}>
            <Text style={{ color: UI.text, fontWeight: "900", fontSize: 15 }}>
              {label} {active ? "✅" : ""}
            </Text>

            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 6 }}>
              <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12 }}>
                Code: {code || "—"}
              </Text>

              {isCurrentPaid ? (
                <View
                  style={{
                    paddingVertical: 3,
                    paddingHorizontal: 8,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: "rgba(16,185,129,0.35)",
                    backgroundColor: "rgba(16,185,129,0.12)",
                  }}
                >
                  <Text style={{ color: UI.text, fontWeight: "900", fontSize: 11 }}>Current</Text>
                </View>
              ) : null}

              {active && !isCurrentPaid ? (
                <View
                  style={{
                    paddingVertical: 3,
                    paddingHorizontal: 8,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: "rgba(255,255,255,0.14)",
                    backgroundColor: "rgba(255,255,255,0.06)",
                  }}
                >
                  <Text style={{ color: UI.text, fontWeight: "900", fontSize: 11 }}>Selected</Text>
                </View>
              ) : null}
            </View>
          </View>

          <View
            style={{
              paddingVertical: 8,
              paddingHorizontal: 10,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: active ? UI.emeraldBorder : "rgba(255,255,255,0.12)",
              backgroundColor: active ? "rgba(16,185,129,0.12)" : "rgba(255,255,255,0.04)",
            }}
          >
            <Text style={{ color: UI.text, fontWeight: "900", fontSize: 12 }}>
              {priceMonthly === null ? "—" : `${fmtMoneyTZS(priceMonthly)}/mo`}
            </Text>
          </View>
        </View>

        <View style={{ marginTop: 10, gap: 6 }}>
          <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12 }}>
            Organizations: {fmtLimit(lim.maxOrgs)}
          </Text>

          <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12 }}>
            Stores/Org: {fmtLimit(lim.storesPerOrg)} • Staff/Org: {fmtLimit(lim.staffPerOrg)}
          </Text>

          <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12 }}>
            Club Posts/Store/Month: {fmtLimit(lim.postsPerStoreMonth)}
          </Text>

          <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12 }}>
            AI: {lim.aiEnabled ? "Enabled" : "Disabled"}
            {lim.aiEnabled ? ` • Credits/mo: ${fmtLimit(lim.credits)}` : ""}
          </Text>

          {active && priceMonthly !== null ? (
            <View
              style={{
                marginTop: 6,
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.10)",
                backgroundColor: "rgba(255,255,255,0.04)",
                borderRadius: 16,
                padding: 10,
              }}
            >
              <Text style={{ color: UI.text, fontWeight: "900", fontSize: 12 }}>
                Total for {selectedMonths} month{selectedMonths > 1 ? "s" : ""}
                {discountPercent ? ` (-${discountPercent}%)` : ""}
              </Text>
              <Text style={{ color: UI.muted, fontWeight: "900", fontSize: 12, marginTop: 6 }}>
                {total === null ? "—" : fmtMoneyTZS(total)}
              </Text>
            </View>
          ) : null}
        </View>
      </Pressable>
    );
  };

  const EliteCard = () => {
    return (
      <View style={{ marginTop: 12 }}>
        <Pressable
          onPress={() =>
            Alert.alert(
              "ELITE (Contact Sales)",
              "Hii ni kifurushi cha biashara kubwa.\n\n• Unlimited Organizations\n• Unlimited Stores\n• Unlimited Staff\n• Unlimited Stock/Products\n• Unlimited Club growth\n\n⚠️ Note: AI na Analytics bado vina limit (kwa usalama na gharama za huduma).\n\nBonyeza “Contact Sales” kupata utaratibu na bei."
            )
          }
          style={({ pressed }) => [
            {
              borderRadius: 22,
              borderWidth: 1,
              borderColor: "rgba(16,185,129,0.35)",
              backgroundColor: "rgba(16,185,129,0.08)",
              padding: 14,
              opacity: pressed ? 0.95 : 1,
            },
          ]}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <View
              style={{
                width: 44,
                height: 44,
                borderRadius: 16,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: "rgba(16,185,129,0.14)",
                borderWidth: 1,
                borderColor: "rgba(16,185,129,0.35)",
              }}
            >
              <Ionicons name="sparkles-outline" size={22} color={UI.emerald} />
            </View>

            <View style={{ flex: 1 }}>
              <Text style={{ color: UI.text, fontWeight: "900", fontSize: 15 }}>ELITE</Text>
              <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12, marginTop: 4 }}>
                Unlimited growth • Contact Sales for setup & pricing
              </Text>
            </View>

            <View
              style={{
                paddingVertical: 8,
                paddingHorizontal: 10,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: "rgba(16,185,129,0.35)",
                backgroundColor: "rgba(16,185,129,0.10)",
              }}
            >
              <Text style={{ color: UI.text, fontWeight: "900", fontSize: 12 }}>Contact</Text>
            </View>
          </View>

          <View style={{ marginTop: 10, gap: 6 }}>
            <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12 }}>
              • Unlimited Organizations • Stores • Staff • Stock
            </Text>
            <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12 }}>
              • AI & Analytics zina limit (enterprise policy)
            </Text>
          </View>

          <View style={{ marginTop: 12 }}>
            <Button
              title="Contact Sales"
              onPress={() =>
                Alert.alert(
                  "Contact Sales",
                  "Tafadhali wasiliana nasi kupata utaratibu wa ELITE.\n\n(Tutakuja kuweka njia rasmi: WhatsApp / Call / Email ndani ya app.)"
                )
              }
            />
          </View>
        </Pressable>
      </View>
    );
  };

  return (
    <Screen scroll>
      {/* Header */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginTop: 2 }}>
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
          <Ionicons name="chevron-back" size={20} color={UI.text} />
        </Pressable>

        <View style={{ flex: 1 }}>
          <Text style={{ color: UI.text, fontWeight: "900", fontSize: 20 }}>
            Subscription & Billing
          </Text>
          <Text style={{ color: UI.muted, fontWeight: "800", marginTop: 4 }}>{headerSubtitle}</Text>
        </View>

        {/* ✅ Move refresh left a bit to avoid bell overlap */}
        <Pressable
          onPress={() => {
            userTouchedPlanRef.current = false; // allow auto-highlight after refresh
            void loadAll();
          }}
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
              marginRight: 52, // ✅ reserve space for notification bell button
            },
          ]}
        >
          <Ionicons name="refresh-outline" size={18} color={UI.text} />
        </Pressable>
      </View>

      {/* Guard */}
      {!canManage ? (
        <View style={{ marginTop: 12 }}>
          <Card>
            <Text style={{ color: UI.text, fontWeight: "900" }}>Owner only</Text>
            <Text style={{ color: UI.muted, fontWeight: "800", marginTop: 8, lineHeight: 18 }}>
              Billing/Subscription management ni kwa Owner tu. Admin/Staff wataendelea kutumia mfumo,
              lakini hawabadilishi plan.
            </Text>
          </Card>
        </View>
      ) : null}

      {/* Current plan */}
      <View style={{ marginTop: 12 }}>
        <Card>
          <Text style={{ color: UI.text, fontWeight: "900", fontSize: 14 }}>
            Current subscription
          </Text>

          {loading ? (
            <View style={{ marginTop: 12 }}>
              <ActivityIndicator />
              <Text style={{ color: UI.muted, fontWeight: "800", marginTop: 10 }}>
                Loading subscription…
              </Text>
            </View>
          ) : (
            <View style={{ marginTop: 10 }}>
              <Text style={{ color: UI.text, fontWeight: "900", fontSize: 14 }}>
                {currentPlanLabel}
              </Text>

              <Text style={{ color: UI.muted, fontWeight: "800", marginTop: 6 }}>
                Starts: {startedLabel}
              </Text>

              <Text style={{ color: UI.muted, fontWeight: "800", marginTop: 6 }}>
                Server Expires: {expiryLabel}
              </Text>

              <View style={{ marginTop: 10 }}>
                <View
                  style={{
                    borderWidth: 1,
                    borderColor: "rgba(255,255,255,0.10)",
                    backgroundColor: "rgba(255,255,255,0.04)",
                    borderRadius: 16,
                    padding: 12,
                  }}
                >
                  <Text style={{ color: UI.text, fontWeight: "900", fontSize: 12 }}>
                    Plan limits are DB-driven ✅
                  </Text>
                  <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12, marginTop: 6 }}>
                    Stores/Staff/AI/Club zina-control kwa org level kupitia public.plans (plan_code).
                  </Text>
                </View>
              </View>
            </View>
          )}
        </Card>
      </View>

      {/* Choose duration */}
      <View style={{ marginTop: 12 }}>
        <Card>
          <Text style={{ color: UI.text, fontWeight: "900", fontSize: 14 }}>
            Choose billing duration
          </Text>
          <Text style={{ color: UI.muted, fontWeight: "800", marginTop: 6 }}>
            1 • 3 • 6 • 12 months (discounts optional)
          </Text>

          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 12 }}>
            {durations.map((d, idx) => {
              const months = Number(d.months || 0);
              if (!months) return null;

              const label = clean(d.label) || `${months} month${months > 1 ? "s" : ""}`;
              const disc = getDurationDiscountPercent(d) || undefined;

              return (
                <DurationPill
                  key={`${months}-${idx}`}
                  months={months}
                  label={label}
                  active={selectedMonths === months}
                  discountPercent={disc}
                  onPress={() => setSelectedMonths(months)}
                />
              );
            })}
          </View>
        </Card>
      </View>

      {/* Plans */}
      <View style={{ marginTop: 12 }}>
        <Card>
          <Text style={{ color: UI.text, fontWeight: "900", fontSize: 14 }}>
            Choose plan
          </Text>
          <Text style={{ color: UI.muted, fontWeight: "800", marginTop: 6 }}>
            Select a plan then activate via mobile payment.
          </Text>

          <View style={{ marginTop: 12 }}>
            {plans.length === 0 && !loading ? (
              <Text style={{ color: UI.muted, fontWeight: "800" }}>
                No plans returned. (Check get_public_plans RPC)
              </Text>
            ) : (
              <FlatList
                data={plans}
                keyExtractor={(it, idx) => getPlanCode(it) || String(idx)}
                scrollEnabled={false}
                renderItem={({ item }) => <PlanCard item={item} />}
              />
            )}
          </View>

          <EliteCard />

          {/* Selected plan details */}
          <View style={{ marginTop: 12 }}>
            <View
              style={{
                borderWidth: 1.5,
                borderColor: "rgba(16,185,129,0.35)",
                backgroundColor: "rgba(10,12,16,0.90)",
                borderRadius: 22,
                padding: 14,
                shadowColor: "#000",
                shadowOpacity: 0.25,
                shadowRadius: 16,
                shadowOffset: { width: 0, height: 8 },
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <View
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 16,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: "rgba(16,185,129,0.14)",
                    borderWidth: 1,
                    borderColor: "rgba(16,185,129,0.35)",
                  }}
                >
                  <Ionicons name="checkmark-done-outline" size={20} color={UI.emerald} />
                </View>

                <View style={{ flex: 1 }}>
                  <Text style={{ color: UI.text, fontWeight: "900", fontSize: 13 }}>
                    Selected features
                  </Text>
                  <Text
                    style={{
                      color: "rgba(255,255,255,0.60)",
                      fontWeight: "800",
                      fontSize: 12,
                      marginTop: 3,
                    }}
                  >
                    Summary ya limits za plan uliyochagua (DB-driven)
                  </Text>
                </View>
              </View>

              <View style={{ marginTop: 10, gap: 6 }}>
                {planFeatures.length === 0 ? (
                  <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12 }}>
                    Select a plan to preview limits.
                  </Text>
                ) : (
                  planFeatures.map((x, i) => (
                    <Text
                      key={`${x}-${i}`}
                      style={{ color: "rgba(255,255,255,0.72)", fontWeight: "900", fontSize: 12 }}
                    >
                      • {x}
                    </Text>
                  ))
                )}
              </View>
            </View>
          </View>

          <View style={{ marginTop: 12 }}>
            <Button
              title={busy ? "Please wait..." : "Create Payment (Mobile Money)"}
              onPress={makePay}
              disabled={!canManage || busy || loading || !selectedPlan}
            />
          </View>
        </Card>
      </View>

      {/* ✅ FULL SCREEN Payment modal (100% height + ScrollView) */}
      <Modal
        visible={payOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setPayOpen(false)}
      >
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          keyboardVerticalOffset={0}
        >
          <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.70)" }}>
            {/* FULL SCREEN PANEL */}
            <View
              style={{
                flex: 1,
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.10)",
                backgroundColor: "rgba(20,22,26,0.98)",
                paddingTop: Math.max(insets.top, 10) + 8,
                paddingHorizontal: 16,
                paddingBottom: Math.max(insets.bottom, 10) + 10,
              }}
            >
              {/* Header (fixed) */}
              <View
                style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}
              >
                <Text style={{ color: UI.text, fontWeight: "900", fontSize: 16 }}>
                  Confirm payment
                </Text>
                <Pressable onPress={() => setPayOpen(false)} hitSlop={12}>
                  <Ionicons name="close" size={24} color={UI.text} />
                </Pressable>
              </View>

              {/* Body (scrollable) */}
              <ScrollView
                ref={(r) => {
                  scrollRef.current = r;
                }}
                style={{ flex: 1, marginTop: 10 }}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{
                  paddingBottom: kbVisible ? 24 : 12,
                }}
              >
                <Text
                  style={{
                    color: UI.muted,
                    fontWeight: "800",
                    fontSize: 12,
                    lineHeight: 18,
                  }}
                >
                  {payNote ||
                    `Lipa kwa ${PAY_TO_NETWORK} kwenda ${PAY_TO_PHONE} (${PAY_TO_NAME}), kisha weka receipt reference.`}
                </Text>

                <View style={{ marginTop: 12, gap: 12 }}>
                  {/* Pay To */}
                  <View
                    style={{
                      borderWidth: 1,
                      borderColor: "rgba(16,185,129,0.20)",
                      backgroundColor: "rgba(16,185,129,0.08)",
                      borderRadius: 16,
                      padding: 12,
                    }}
                  >
                    <Text style={{ color: UI.text, fontWeight: "900", fontSize: 12 }}>Pay To</Text>

                    <Text style={{ color: UI.muted, fontWeight: "900", marginTop: 6, fontSize: 12 }}>
                      {PAY_TO_NAME}
                    </Text>

                    <View style={{ height: 10 }} />

                    <Text style={{ color: UI.text, fontWeight: "900", fontSize: 12 }}>Network</Text>
                    <Text style={{ color: UI.muted, fontWeight: "900", marginTop: 6, fontSize: 12 }}>
                      {PAY_TO_NETWORK}
                    </Text>

                    <View style={{ height: 10 }} />

                    <Text style={{ color: UI.text, fontWeight: "900", fontSize: 12 }}>
                      Phone Number
                    </Text>
                    <Text style={{ color: UI.muted, fontWeight: "900", marginTop: 6, fontSize: 14 }}>
                      {PAY_TO_PHONE}
                    </Text>

                    <Text style={{ color: UI.faint, fontWeight: "800", fontSize: 12, marginTop: 10 }}>
                      Baada ya kulipa, utapata SMS ya muamala. Copy ile “Receipt/Reference/Transaction ID”
                      uiweke hapa chini.
                    </Text>
                  </View>

                  {/* Payment details */}
                  <View
                    style={{
                      borderWidth: 1,
                      borderColor: "rgba(255,255,255,0.10)",
                      backgroundColor: "rgba(255,255,255,0.04)",
                      borderRadius: 16,
                      padding: 12,
                    }}
                  >
                    <Text style={{ color: UI.text, fontWeight: "900", fontSize: 12 }}>Payment ID</Text>
                    <Text style={{ color: UI.muted, fontWeight: "800", marginTop: 6, fontSize: 12 }}>
                      {paymentId || "—"}
                    </Text>

                    <View style={{ height: 10 }} />

                    <Text style={{ color: UI.text, fontWeight: "900", fontSize: 12 }}>Amount</Text>
                    <Text style={{ color: UI.muted, fontWeight: "800", marginTop: 6, fontSize: 12 }}>
                      {payAmount ? fmtMoneyTZS(payAmount) : "—"}
                    </Text>
                  </View>

                  {/* Input */}
                  <TextInput
                    value={txRef}
                    onChangeText={(t) => setTxRef(normalizeTxRef(t))}
                    onFocus={() => {
                      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 120);
                    }}
                    placeholder="Transaction Reference (receipt code)"
                    placeholderTextColor="rgba(255,255,255,0.45)"
                    autoCapitalize="characters"
                    autoCorrect={false}
                    style={{
                      height: 52,
                      borderRadius: 16,
                      borderWidth: 1,
                      borderColor: "rgba(255,255,255,0.12)",
                      backgroundColor: "rgba(255,255,255,0.06)",
                      color: UI.text,
                      paddingHorizontal: 12,
                      fontWeight: "900",
                    }}
                  />

                  <Button
                    title={busy ? "Confirming..." : "CONFIRM & ACTIVATE"}
                    onPress={confirmPay}
                    disabled={busy}
                  />

                  <Pressable
                    onPress={() => setPayOpen(false)}
                    style={({ pressed }) => [
                      {
                        marginTop: 6,
                        height: 48,
                        borderRadius: 999,
                        borderWidth: 1,
                        borderColor: "rgba(255,255,255,0.12)",
                        backgroundColor: "rgba(255,255,255,0.04)",
                        alignItems: "center",
                        justifyContent: "center",
                        opacity: pressed ? 0.92 : 1,
                      },
                    ]}
                  >
                    <Text style={{ color: UI.text, fontWeight: "900" }}>CANCEL</Text>
                  </Pressable>

                  <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12, marginTop: 8 }}>
                    Note: Kwa sasa tunatumia “manual confirm” (input ref). Baadaye tutaunganisha Selcom
                    webhook auto-confirm bila kuandika ref.
                  </Text>

                  <View style={{ height: 20 }} />
                </View>
              </ScrollView>
            </View>

            {/* Tap outside to dismiss keyboard only (optional) */}
            <Pressable
              onPress={() => Keyboard.dismiss()}
              style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0 }}
              pointerEvents="box-none"
            />
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <View style={{ height: 24 }} />
    </Screen>
  );
}