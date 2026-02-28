// app/(tabs)/sales/checkout.tsx
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, Text, TextInput, View } from "react-native";

import { useNetInfo } from "@react-native-community/netinfo";

import { useOrg } from "../../../src/context/OrgContext";
import { supabase } from "../../../src/supabase/supabaseClient";
import { Button } from "../../../src/ui/Button";
import { Card } from "../../../src/ui/Card";
import { Screen } from "../../../src/ui/Screen";
import { theme } from "../../../src/ui/theme";

import { enqueueSale, makeId } from "../../../src/offline/salesQueue";
import { formatMoney, useOrgMoneyPrefs } from "@/src/ui/money";

type CartItem = {
  product_id: string;
  name: string;
  sku: string | null;
  qty: number;
  unit: string | null;
  unit_price: number;
  line_total: number;
};

type PayMethod = "CASH" | "MOBILE" | "BANK" | "CREDIT";

type DiscountType = "fixed" | "percent" | null;
type DiscountResult = { type: DiscountType; value: number; amount: number };

function one(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : v;
}

function parseMoney(s: string) {
  const cleaned = String(s ?? "").replace(/[, ]+/g, "").trim();
  if (!cleaned) return NaN;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : NaN;
}

/**
 * ✅ Robust Discount Parser
 * Supports:
 * - "10%"  => percent
 * - "5000" => fixed
 * - "5k"   => 5000
 * - "1m"   => 1,000,000
 */
function parseDiscountInput(input: string, total: number): DiscountResult {
  const t = String(input ?? "").toLowerCase().trim();
  if (!t || total <= 0) return { type: null, value: 0, amount: 0 };

  const pctMatch = t.match(/([0-9]+(?:\.[0-9]+)?)\s*%/);
  if (pctMatch?.[1]) {
    const pct = Number(pctMatch[1]);
    if (Number.isFinite(pct) && pct > 0) {
      const clampedPct = Math.min(100, Math.max(0, pct));
      const amt = Math.min(total, Math.round((total * clampedPct) / 100));
      return { type: "percent", value: clampedPct, amount: Math.max(0, amt) };
    }
  }

  const compact = t.replace(/\s+/g, "");
  const m = compact.match(/^(-?[0-9][0-9,]*(?:\.[0-9]+)?)([km])?$/i);
  const rawNum = m?.[1] ?? (compact.match(/-?[0-9][0-9,]*(?:\.[0-9]+)?/)?.[0] ?? "");
  if (!rawNum) return { type: null, value: 0, amount: 0 };

  const suffix = (m?.[2] ?? compact.match(/[km]\b/i)?.[0] ?? "").toLowerCase();
  const cleaned = rawNum.replace(/,/g, "");
  let n = Number(cleaned);
  if (!Number.isFinite(n)) return { type: null, value: 0, amount: 0 };
  n = Math.abs(n);

  const mult = suffix === "m" ? 1_000_000 : suffix === "k" ? 1_000 : 1;
  const fixedValue = n * mult;

  const amount = Math.max(0, Math.min(total, Math.round(fixedValue)));
  return { type: "fixed", value: fixedValue, amount };
}

function buildNoteWithDiscount(args: {
  note: string;
  discountText: string;
  discountAmount: number;
  subtotal: number;
}) {
  const base = (args.note ?? "").trim();
  const dText = (args.discountText ?? "").trim();
  const dAmt = Math.max(0, Math.round(args.discountAmount || 0));
  const sub = Math.max(0, Math.round(args.subtotal || 0));

  if (!dText && dAmt <= 0) return (base || null) as any;

  const tag = `DISCOUNT: "${dText || "—"}" | DISCOUNT_AMOUNT: ${dAmt} | SUBTOTAL: ${sub}`;
  if (!base) return tag as any;

  return `${base}\n${tag}` as any;
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
      hitSlop={8}
      style={({ pressed }) => ({
        flex: 1,
        paddingVertical: 10,
        borderRadius: theme.radius.pill,
        borderWidth: 1,
        borderColor: active ? "rgba(52,211,153,0.40)" : theme.colors.border,
        backgroundColor: active ? "rgba(52,211,153,0.12)" : "rgba(255,255,255,0.06)",
        alignItems: "center",
        justifyContent: "center",
        opacity: pressed ? 0.92 : 1,
      })}
    >
      <Text style={{ color: active ? theme.colors.emerald : theme.colors.text, fontWeight: "900" }}>
        {label}
      </Text>
    </Pressable>
  );
}

// ✅ removes leading zeros e.g. "0200000" -> "200000"
function normalizeMoneyInput(raw: string) {
  const digitsOnly = String(raw ?? "").replace(/[^\d]/g, "");
  if (!digitsOnly) return "";
  const stripped = digitsOnly.replace(/^0+(?=\d)/, "");
  return stripped;
}

// ✅ strict guard (future proof)
function isStrictPayMethod(x: any): x is PayMethod {
  return x === "CASH" || x === "BANK" || x === "MOBILE" || x === "CREDIT";
}

function FieldLabel({ children }: { children: any }) {
  return <Text style={{ color: theme.colors.muted, fontWeight: "900", marginBottom: 6 }}>{children}</Text>;
}

function InputBox(props: {
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  keyboardType?: any;
  multiline?: boolean;
}) {
  return (
    <TextInput
      value={props.value}
      onChangeText={props.onChangeText}
      placeholder={props.placeholder}
      placeholderTextColor="rgba(255,255,255,0.35)"
      keyboardType={props.keyboardType}
      multiline={props.multiline}
      style={{
        color: theme.colors.text,
        fontWeight: "800",
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: "rgba(255,255,255,0.06)",
        borderRadius: 16,
        paddingHorizontal: 12,
        paddingVertical: props.multiline ? 12 : 10,
        minHeight: props.multiline ? 90 : undefined,
      }}
    />
  );
}

export default function CheckoutScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    storeId?: string | string[];
    storeName?: string | string[];
    cart?: string | string[];
  }>();

  const netInfo = useNetInfo();
  const isOnline = !!(netInfo.isConnected && netInfo.isInternetReachable !== false);
  const isOffline = !isOnline;

  const orgCtx: any = useOrg();
  const { activeOrgId, activeStoreId, activeStoreName, activeRole } = orgCtx;

  // ✅ org-level currency prefs (display only)
  const orgId = String(activeOrgId ?? "").trim();
  const money = useOrgMoneyPrefs(orgId);
  const displayCurrency = money.currency || "TZS";
  const displayLocale = money.locale || "en-TZ";

  const fmt = useCallback(
    (n: number) =>
      formatMoney(n, { currency: displayCurrency, locale: displayLocale }).replace(/\s+/g, " "),
    [displayCurrency, displayLocale]
  );

  const storeId = (one(params.storeId) ?? "").trim();
  const storeNameParam = (one(params.storeName) ?? "").trim();

  const cart: CartItem[] = useMemo(() => {
    try {
      const raw = one(params.cart);
      if (!raw) return [];
      const decoded = decodeURIComponent(raw);
      const parsed = JSON.parse(decoded);
      if (!Array.isArray(parsed)) return [];

      return parsed
        .map((x: any) => {
          const qty = Math.trunc(Number(x.qty ?? 0));
          const unit_price = Number(x.unit_price ?? 0);
          const line_total =
            Number.isFinite(unit_price) && unit_price > 0 && Number.isFinite(qty) && qty > 0
              ? unit_price * qty
              : Number(x.line_total ?? 0);

          return {
            product_id: String(x.product_id ?? ""),
            name: String(x.name ?? "Product"),
            sku: x.sku ?? null,
            qty,
            unit: x.unit ?? null,
            unit_price,
            line_total,
          } as CartItem;
        })
        .filter((x) => x.product_id && Number.isFinite(x.qty) && x.qty > 0);
    } catch {
      return [];
    }
  }, [params.cart]);

  const canSell = useMemo(() => {
    const r = (activeRole ?? "staff") as "owner" | "admin" | "staff";
    return r === "owner" || r === "admin" || r === "staff";
  }, [activeRole]);

  const totalQty = useMemo(() => cart.reduce((a, c) => a + (c.qty || 0), 0), [cart]);

  const subtotalAmount = useMemo(() => cart.reduce((a, c) => a + Number(c.line_total || 0), 0), [cart]);

  const [discountText, setDiscountText] = useState<string>("");
  const discount = useMemo(() => parseDiscountInput(discountText, subtotalAmount), [discountText, subtotalAmount]);

  const grandTotal = useMemo(
    () => Math.max(0, subtotalAmount - (discount.amount || 0)),
    [subtotalAmount, discount.amount]
  );

  const headerStoreName = storeNameParam || activeStoreName || "—";

  // ✅ ROOT FIX: if active store differs from param storeId, BLOCK sale.
  const mismatch = !!(activeStoreId && storeId && activeStoreId !== storeId);

  const [method, setMethod] = useState<PayMethod>("CASH");

  // ✅ for CREDIT partial payments, select where paid goes
  const [paidVia, setPaidVia] = useState<Exclude<PayMethod, "CREDIT">>("CASH");

  const [paidStr, setPaidStr] = useState<string>(() => String(Math.round(grandTotal || subtotalAmount)));
  const [channel, setChannel] = useState<string>("");
  const [reference, setReference] = useState<string>("");

  const [customerName, setCustomerName] = useState<string>("");
  const [customerPhone, setCustomerPhone] = useState<string>("");

  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const onPaidChange = useCallback((t: string) => {
    setPaidStr(normalizeMoneyInput(t));
  }, []);

  const onSetMethod = useCallback(
    (m: PayMethod) => {
      if (!isStrictPayMethod(m)) return;
      setMethod(m);

      if (m === "CREDIT") {
        setPaidStr("0");
        setPaidVia("CASH");
        setChannel("");
        setReference("");
        return;
      }

      setPaidStr(String(Math.round(grandTotal)));
      setPaidVia("CASH");

      if (m === "CASH") {
        setChannel("");
        setReference("");
      }

      if (m === "MOBILE") {
        if (!channel) setChannel("M-PESA");
      }
    },
    [grandTotal, channel]
  );

  const paidAmount = useMemo(() => parseMoney(paidStr), [paidStr]);

  const balance = useMemo(() => {
    const p = Number.isFinite(paidAmount) ? paidAmount : 0;
    return Math.max(0, grandTotal - Math.max(0, p));
  }, [paidAmount, grandTotal]);

  // ✅ credit mode if method is CREDIT OR paid < total
  const isCredit = useMemo(() => method === "CREDIT" || balance > 0, [method, balance]);

  // ✅ show Paid Via only when CREDIT selected AND paid > 0
  const showPaidVia = useMemo(
    () => method === "CREDIT" && (Number.isFinite(paidAmount) ? paidAmount : 0) > 0,
    [method, paidAmount]
  );

  // ✅ actual method sent to DB:
  const rpcPaymentMethod: PayMethod = useMemo(() => {
    if (method !== "CREDIT") return method;
    const p = Number.isFinite(paidAmount) ? paidAmount : 0;
    if (p > 0) return paidVia;
    return "CREDIT";
  }, [method, paidAmount, paidVia]);

  const rpcChannel = useMemo(() => {
    if (rpcPaymentMethod === "MOBILE") return channel.trim() || "M-PESA";
    if (rpcPaymentMethod === "BANK") return channel.trim();
    return "";
  }, [rpcPaymentMethod, channel]);

  const rpcReference = useMemo(() => {
    if (rpcPaymentMethod === "MOBILE" || rpcPaymentMethod === "BANK") return reference.trim();
    return "";
  }, [rpcPaymentMethod, reference]);

  useEffect(() => {
    const gt = Math.round(grandTotal);
    const current = parseMoney(paidStr);

    if (!Number.isFinite(current)) {
      setPaidStr(isCredit ? "0" : String(gt));
      return;
    }

    if (!isCredit) {
      if (current !== gt) setPaidStr(String(gt));
      return;
    }

    if (current < 0) setPaidStr("0");
    if (current > gt) setPaidStr(String(gt));
  }, [grandTotal, paidStr, isCredit]);

  const invalidReason = useMemo(() => {
    if (!canSell) return "No permission to sell.";
    if (!storeId) return "Missing storeId.";
    if (mismatch) return "Store mismatch: rudi nyuma, chagua store sahihi kisha uende Checkout upya.";
    if (cart.length === 0) return "Cart is empty.";
    if (cart.some((c) => !Number.isFinite(c.unit_price) || c.unit_price <= 0)) return "Some items are missing price.";

    if (!Number.isFinite(paidAmount)) return "Enter a valid paid amount.";
    if (paidAmount < 0) return "Paid amount cannot be negative.";
    if (paidAmount > grandTotal) return "Paid amount cannot exceed total.";

    // ✅ if NOT credit: must fully pay
    if (!isCredit && Math.round(paidAmount) !== Math.round(grandTotal)) {
      return "Non-credit sale must be fully paid.";
    }

    // ✅ if CREDIT selected AND paid>0, user must choose Paid Via
    if (showPaidVia) {
      if (!paidVia) return "Chagua Paid Via (Cash/Mobile/Bank).";
    }

    // ✅ online mode validation for MOBILE/BANK of the paid portion
    if (!isOffline && (rpcPaymentMethod === "MOBILE" || rpcPaymentMethod === "BANK")) {
      if (!rpcChannel.trim()) {
        return rpcPaymentMethod === "MOBILE"
          ? "Select mobile channel (e.g. M-PESA)."
          : "Enter bank name/channel (e.g. NMB/CRDB).";
      }
      if (!rpcReference.trim()) {
        return "Enter reference/transaction id.";
      }
    }

    if (isCredit && !customerName.trim()) {
      return "Enter customer name (for credit/partial).";
    }

    return null;
  }, [
    canSell,
    storeId,
    mismatch,
    cart,
    paidAmount,
    grandTotal,
    isCredit,
    showPaidVia,
    paidVia,
    isOffline,
    rpcPaymentMethod,
    rpcChannel,
    rpcReference,
    customerName,
  ]);

  // ✅ Preflight stock check
  const preflightCheckStock = useCallback(async () => {
    const productIds = Array.from(new Set(cart.map((c) => c.product_id).filter(Boolean)));
    if (!storeId || productIds.length === 0) return;

    const { data, error } = await supabase
      .from("inventory")
      .select("product_id, qty")
      .eq("store_id", storeId)
      .in("product_id", productIds);

    if (error) return;

    const map = new Map<string, number>();
    (data ?? []).forEach((r: any) => map.set(String(r.product_id), Number(r.qty ?? 0)));

    const bad: { name: string; need: number; have: number }[] = [];
    for (const c of cart) {
      const have = map.has(c.product_id) ? Number(map.get(c.product_id)) : 0;
      const need = Math.trunc(Number(c.qty || 0));
      if (need > 0 && have < need) bad.push({ name: c.name || "Product", need, have });
    }

    if (bad.length > 0) {
      const lines = bad
        .slice(0, 8)
        .map((x) => `• ${x.name}: have ${x.have}, need ${x.need}`)
        .join("\n");

      throw new Error(`Stock haitoshi kwa store hii.\n\n${lines}\n\nNenda Inventory → Adjust Stock (ADD) kisha jaribu tena.`);
    }
  }, [cart, storeId]);

  // CREDIT V2 helpers
  const ensureCreditAccountV2 = useCallback(
    async (args: { storeId: string; customerName: string; customerPhone: string | null }) => {
      const payload = {
        p_store_id: args.storeId,
        p_customer_name: args.customerName,
        p_phone: args.customerPhone,
      };
      const res = await supabase.rpc("create_credit_account_v2", payload as any);
      if (res.error) throw res.error;

      const d: any = res.data;
      const id =
        typeof d === "string"
          ? d
          : Array.isArray(d)
          ? d?.[0]?.id ?? d?.[0]?.credit_account_id
          : d?.id ?? d?.credit_account_id;

      if (!id) throw new Error("create_credit_account_v2 did not return account id");
      return String(id);
    },
    []
  );

  const recordCreditSaleV2 = useCallback(
    async (args: { storeId: string; creditAccountId: string; amount: number; note?: string | null; reference?: string | null }) => {
      const payload = {
        p_store_id: args.storeId,
        p_credit_account_id: args.creditAccountId,
        p_amount: args.amount,
        p_note: args.note ?? null,
        p_reference: args.reference ?? null,
      };
      const res = await supabase.rpc("record_credit_sale_v2", payload as any);
      if (res.error) throw res.error;
      return res.data;
    },
    []
  );

  const confirm = useCallback(async () => {
    if (saving) return;

    if (invalidReason) {
      Alert.alert("Blocked", invalidReason);
      return;
    }

    // ✅ OFFLINE BRANCH
    if (isOffline) {
      try {
        const clientSaleId = makeId();

        const items = cart.map((c) => ({
          product_id: c.product_id,
          qty: Math.trunc(Number(c.qty)),
          unit_price: Number(c.unit_price),

          name: c.name ?? "Product",
          sku: c.sku ?? null,
          unit: c.unit ?? null,
        }));

        const p_paid_amount = Number.isFinite(paidAmount) ? Number(paidAmount) : 0;

        const p_payment_method = rpcPaymentMethod;

        const p_payment_channel =
          p_payment_method === "MOBILE" || p_payment_method === "BANK" ? (rpcChannel.trim() || null) : null;
        const p_reference =
          p_payment_method === "MOBILE" || p_payment_method === "BANK" ? (rpcReference.trim() || null) : null;

        const customerLines = isCredit ? `CUSTOMER: ${customerName.trim()}\nPHONE: ${customerPhone.trim() || "-"}\n` : "";

        const finalNote = buildNoteWithDiscount({
          note: `${customerLines}${note || ""}`,
          discountText,
          discountAmount: discount.amount,
          subtotal: subtotalAmount,
        });

        const rpcDiscountType = discount.type === "percent" ? "PERCENT" : discount.type === "fixed" ? "FIXED" : null;

        const rpcDiscountValue =
          discount.type === "percent"
            ? Number(discount.value || 0)
            : discount.type === "fixed"
            ? Number(discount.amount || 0)
            : null;

        await enqueueSale(storeId, {
          client_sale_id: clientSaleId,
          store_id: storeId,
          payload: {
            items,
            note: finalNote,

            payment_method: p_payment_method,
            paid_amount: p_paid_amount,
            payment_channel: p_payment_channel,
            reference: p_reference,

            discount_type: rpcDiscountType as any,
            discount_value: rpcDiscountValue,
            discount_note: discountText.trim() || null,

            is_credit: isCredit,
            customer_name: isCredit ? customerName.trim() : null,
            customer_phone: isCredit ? (customerPhone.trim() || null) : null,
            credit_balance: Number(balance || 0),
          },
        });

        Alert.alert("Saved Offline ✅", "Sale imehifadhiwa. Itasync mtandao ukirudi.");
        router.replace("/(tabs)/sales/history" as any);
      } catch (e: any) {
        Alert.alert("Failed", e?.message ?? "Failed to save offline");
      }
      return;
    }

    // ✅ ONLINE BRANCH
    setSaving(true);
    try {
      await preflightCheckStock();

      const access = await supabase.rpc("ensure_my_store_access", { p_store_id: storeId });
      if (access.error) throw access.error;

      const items = cart.map((c) => ({
        product_id: c.product_id,
        qty: Math.trunc(Number(c.qty)),
        unit_price: Number(c.unit_price),
      }));

      const p_paid_amount = Number(paidAmount);

      const customerLines = isCredit ? `CUSTOMER: ${customerName.trim()}\nPHONE: ${customerPhone.trim() || "-"}\n` : "";

      const finalNote = buildNoteWithDiscount({
        note: `${customerLines}${note || ""}`,
        discountText,
        discountAmount: discount.amount,
        subtotal: subtotalAmount,
      });

      const rpcDiscountType = discount.type === "percent" ? "PERCENT" : discount.type === "fixed" ? "FIXED" : null;

      const rpcDiscountValue =
        discount.type === "percent"
          ? Number(discount.value || 0)
          : discount.type === "fixed"
          ? Number(discount.amount || 0)
          : null;

      const clientSaleId = makeId();

      const res = await supabase.rpc("create_sale_with_payment_v3", {
        p_store_id: storeId,
        p_items: items,
        p_note: finalNote,

        p_payment_method: rpcPaymentMethod,
        p_paid_amount: p_paid_amount,
        p_payment_channel:
          rpcPaymentMethod === "MOBILE" || rpcPaymentMethod === "BANK" ? (rpcChannel.trim() || null) : null,
        p_reference: rpcPaymentMethod === "MOBILE" || rpcPaymentMethod === "BANK" ? (rpcReference.trim() || null) : null,

        p_customer_id: null,
        p_customer_phone: null,
        p_customer_full_name: null,

        p_discount_type: rpcDiscountType,
        p_discount_value: rpcDiscountValue,
        p_discount_note: discountText.trim() || null,

        p_client_sale_id: clientSaleId,
      } as any);

      if (res.error) throw res.error;

      const row = Array.isArray(res.data) ? (res.data[0] ?? null) : res.data;
      const saleId: string | null = row?.sale_id ? String(row.sale_id) : null;

      let creditRecorded = false;
      if (isCredit && balance > 0) {
        const accountId = await ensureCreditAccountV2({
          storeId,
          customerName: customerName.trim(),
          customerPhone: customerPhone.trim() || null,
        });

        await recordCreditSaleV2({
          storeId,
          creditAccountId: accountId,
          amount: Number(balance),
          note: finalNote,
          reference: saleId ?? null,
        });

        creditRecorded = true;
      }

      Alert.alert("Success ✅", creditRecorded ? "Sale created (credit recorded v2)" : "Sale created");

      if (saleId) {
        router.replace({ pathname: "/(tabs)/sales/receipt", params: { saleId } } as any);
      } else {
        router.replace("/(tabs)/sales/history" as any);
      }
    } catch (e: any) {
      Alert.alert("Failed", e?.message ?? "Unknown error");
    } finally {
      setSaving(false);
    }
  }, [
    saving,
    invalidReason,
    isOffline,
    storeId,
    cart,
    note,
    paidAmount,
    rpcPaymentMethod,
    rpcChannel,
    rpcReference,
    isCredit,
    balance,
    router,
    ensureCreditAccountV2,
    recordCreditSaleV2,
    discount,
    discountText,
    subtotalAmount,
    customerName,
    customerPhone,
    preflightCheckStock,
  ]);

  const cartTotalLabel = useMemo(() => {
    const itemsCount = cart.length;
    return `${itemsCount} item${itemsCount === 1 ? "" : "s"} • ${totalQty} qty`;
  }, [cart.length, totalQty]);

  const prettySubtotal = useMemo(() => fmt(subtotalAmount), [fmt, subtotalAmount]);
  const prettyDiscount = useMemo(() => fmt(discount.amount), [fmt, discount.amount]);
  const prettyTotal = useMemo(() => fmt(grandTotal), [fmt, grandTotal]);
  const prettyPaid = useMemo(() => fmt(Number.isFinite(paidAmount) ? paidAmount : 0), [fmt, paidAmount]);
  const prettyBal = useMemo(() => fmt(balance), [fmt, balance]);

  const showChannelRef = useMemo(() => {
    if (isOffline) return false;
    return rpcPaymentMethod === "MOBILE" || rpcPaymentMethod === "BANK";
  }, [isOffline, rpcPaymentMethod]);

  return (
    <Screen scroll bottomPad={240}>
      <View style={{ flex: 1, gap: 14 }}>
        {/* Header */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <Pressable
            onPress={() => router.back()}
            style={{
              width: 44,
              height: 44,
              borderRadius: 999,
              alignItems: "center",
              justifyContent: "center",
              borderWidth: 1,
              borderColor: theme.colors.border,
              backgroundColor: "rgba(255,255,255,0.06)",
            }}
          >
            <Ionicons name="chevron-back" size={22} color={theme.colors.text} />
          </Pressable>

          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 26, fontWeight: "900", color: theme.colors.text }}>Checkout</Text>
            <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>
              Store: {headerStoreName}
              {isOffline ? "  •  OFFLINE" : "  •  ONLINE"}
            </Text>
          </View>
        </View>

        {mismatch && (
          <Card>
            <Text style={{ color: theme.colors.muted, fontWeight: "900" }}>
              ⚠️ Store mismatch: Active store na store ya checkout ni tofauti.
              {"\n"}Rudi nyuma → chagua store sahihi → checkout upya.
            </Text>
          </Card>
        )}

        {/* Cart Summary */}
        <Card style={{ gap: 10 }}>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 16 }}>Order Summary</Text>
              <Text style={{ color: theme.colors.muted, fontWeight: "800", marginTop: 2 }}>{cartTotalLabel}</Text>
            </View>
            <View
              style={{
                paddingHorizontal: 12,
                paddingVertical: 8,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: "rgba(52,211,153,0.22)",
                backgroundColor: "rgba(52,211,153,0.10)",
              }}
            >
              <Text style={{ color: theme.colors.text, fontWeight: "900" }}>{prettyTotal}</Text>
            </View>
          </View>

          <View style={{ height: 1, backgroundColor: "rgba(255,255,255,0.08)" }} />

          <View style={{ gap: 10 }}>
            {cart.map((c) => {
              const line = fmt(Number(c.line_total || 0));
              const up = fmt(Number(c.unit_price || 0));
              return (
                <View
                  key={`${c.product_id}-${c.sku ?? ""}`}
                  style={{
                    padding: 12,
                    borderRadius: 16,
                    borderWidth: 1,
                    borderColor: "rgba(255,255,255,0.10)",
                    backgroundColor: "rgba(255,255,255,0.05)",
                    gap: 4,
                  }}
                >
                  <Text style={{ color: theme.colors.text, fontWeight: "900" }} numberOfLines={1}>
                    {c.name}
                  </Text>
                  <Text style={{ color: theme.colors.muted, fontWeight: "800" }} numberOfLines={1}>
                    SKU: {c.sku ?? "—"} • Qty: {c.qty} • Unit: {c.unit ?? "—"}
                  </Text>
                  <Text style={{ color: theme.colors.faint, fontWeight: "900" }}>
                    Unit: {up} • Line: {line}
                  </Text>
                </View>
              );
            })}
          </View>

          <View style={{ height: 1, backgroundColor: "rgba(255,255,255,0.08)" }} />

          {/* Totals */}
          <View style={{ flexDirection: "row", gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: theme.colors.muted, fontWeight: "900" }}>Subtotal</Text>
              <Text style={{ color: theme.colors.text, fontWeight: "900", marginTop: 4 }}>{prettySubtotal}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: theme.colors.muted, fontWeight: "900" }}>Discount</Text>
              <Text style={{ color: theme.colors.text, fontWeight: "900", marginTop: 4 }}>{prettyDiscount}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: theme.colors.muted, fontWeight: "900" }}>Total</Text>
              <Text style={{ color: theme.colors.text, fontWeight: "900", marginTop: 4 }}>{prettyTotal}</Text>
            </View>
          </View>
        </Card>

        {/* Discount + Note */}
        <Card style={{ gap: 10 }}>
          <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 16 }}>Discount & Note</Text>

          <View>
            <FieldLabel>Discount (e.g. 10% • 5000 • 5k • 1m)</FieldLabel>
            <InputBox value={discountText} onChangeText={setDiscountText} placeholder="mf: 10% au 5000 au 5k" keyboardType="default" />
            <Text style={{ color: theme.colors.faint, fontWeight: "800", marginTop: 8 }}>
              Tip: Ukiweka discount, total itashuka moja kwa moja.
            </Text>
          </View>

          <View style={{ height: 1, backgroundColor: "rgba(255,255,255,0.08)" }} />

          <View>
            <FieldLabel>Note (optional)</FieldLabel>
            <InputBox value={note} onChangeText={setNote} placeholder="andika maelezo ya mauzo..." keyboardType="default" multiline />
          </View>
        </Card>

        {/* Payment */}
        <Card style={{ gap: 12 }}>
          <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 16 }}>Payment</Text>

          <View style={{ flexDirection: "row", gap: 10 }}>
            <MethodChip label="Cash" active={method === "CASH"} onPress={() => onSetMethod("CASH")} />
            <MethodChip label="Mobile" active={method === "MOBILE"} onPress={() => onSetMethod("MOBILE")} />
            <MethodChip label="Bank" active={method === "BANK"} onPress={() => onSetMethod("BANK")} />
            <MethodChip label="Credit" active={method === "CREDIT"} onPress={() => onSetMethod("CREDIT")} />
          </View>

          <View style={{ height: 1, backgroundColor: "rgba(255,255,255,0.08)" }} />

          <View style={{ flexDirection: "row", gap: 10 }}>
            <View style={{ flex: 1 }}>
              <FieldLabel>Paid ({displayCurrency})</FieldLabel>
              <InputBox value={paidStr} onChangeText={onPaidChange} placeholder="mf: 120000" keyboardType="numeric" />
              <Text style={{ color: theme.colors.faint, fontWeight: "800", marginTop: 8 }}>
                {method === "CREDIT" ? "Unaweza kuweka 0 hadi total (partial payment)." : "Kwa non-credit, lazima ulipe full total."}
              </Text>
            </View>
            <View style={{ width: 10 }} />
          </View>

          <View style={{ flexDirection: "row", gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: theme.colors.muted, fontWeight: "900" }}>Total</Text>
              <Text style={{ color: theme.colors.text, fontWeight: "900", marginTop: 4 }}>{prettyTotal}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: theme.colors.muted, fontWeight: "900" }}>Paid</Text>
              <Text style={{ color: theme.colors.text, fontWeight: "900", marginTop: 4 }}>{prettyPaid}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: theme.colors.muted, fontWeight: "900" }}>Balance</Text>
              <Text style={{ color: isCredit ? theme.colors.emerald : theme.colors.text, fontWeight: "900", marginTop: 4 }}>
                {prettyBal}
              </Text>
            </View>
          </View>

          {/* CREDIT: Paid Via */}
          {method === "CREDIT" && (
            <>
              <View style={{ height: 1, backgroundColor: "rgba(255,255,255,0.08)" }} />

              <Text style={{ color: theme.colors.faint, fontWeight: "900" }}>
                CREDIT MODE: ukiweka Paid &gt; 0, chagua Paid Via (mali uliyopokea leo).
              </Text>

              <View style={{ flexDirection: "row", gap: 10, opacity: showPaidVia ? 1 : 0.55 }}>
                <MethodChip
                  label="Cash"
                  active={paidVia === "CASH"}
                  onPress={() => {
                    if (!showPaidVia) return;
                    setPaidVia("CASH");
                  }}
                />
                <MethodChip
                  label="Mobile"
                  active={paidVia === "MOBILE"}
                  onPress={() => {
                    if (!showPaidVia) return;
                    setPaidVia("MOBILE");
                    if (!channel) setChannel("M-PESA");
                  }}
                />
                <MethodChip
                  label="Bank"
                  active={paidVia === "BANK"}
                  onPress={() => {
                    if (!showPaidVia) return;
                    setPaidVia("BANK");
                  }}
                />
              </View>
            </>
          )}

          {/* Channel + Reference (ONLINE only) */}
          {showChannelRef && (
            <>
              <View style={{ height: 1, backgroundColor: "rgba(255,255,255,0.08)" }} />
              <View style={{ gap: 10 }}>
                <View>
                  <FieldLabel>
                    {rpcPaymentMethod === "MOBILE" ? "Mobile Channel (e.g. M-PESA / TIGO-PESA)" : "Bank Channel (e.g. NMB / CRDB)"}
                  </FieldLabel>
                  <InputBox
                    value={channel}
                    onChangeText={setChannel}
                    placeholder={rpcPaymentMethod === "MOBILE" ? "M-PESA" : "NMB"}
                    keyboardType="default"
                  />
                </View>

                <View>
                  <FieldLabel>Reference / Transaction ID</FieldLabel>
                  <InputBox value={reference} onChangeText={setReference} placeholder="mf: TXN12345" keyboardType="default" />
                </View>
              </View>
            </>
          )}

          {isOffline && (
            <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>
              OFFLINE: mobile/bank reference haitahitajika sasa; sale itasave offline na itasync.
            </Text>
          )}
        </Card>

        {/* Credit Customer Info */}
        {isCredit && (
          <Card style={{ gap: 10 }}>
            <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 16 }}>Customer (for Credit/Partial)</Text>

            <View>
              <FieldLabel>Customer Name *</FieldLabel>
              <InputBox value={customerName} onChangeText={setCustomerName} placeholder="mf: Juma Ali" keyboardType="default" />
            </View>

            <View>
              <FieldLabel>Customer Phone (optional)</FieldLabel>
              <InputBox value={customerPhone} onChangeText={setCustomerPhone} placeholder="mf: 0712xxxxxx" keyboardType="phone-pad" />
            </View>

            <Text style={{ color: theme.colors.faint, fontWeight: "800" }}>
              Tip: Credit itarekodiwa v2 na balance itaingia kwenye Credit account.
            </Text>
          </Card>
        )}

        {/* Actions */}
        <Card style={{ gap: 10 }}>
          <Button
            title={saving ? "Creating..." : isOffline ? "Save Offline" : "Confirm Sale"}
            onPress={confirm}
            disabled={saving || !!invalidReason}
            variant="primary"
          />
          <Button title="Back" onPress={() => router.back()} disabled={saving} variant="secondary" />

          {!!invalidReason && (
            <Text style={{ color: theme.colors.muted, fontWeight: "900" }}>
              ⚠ {invalidReason}
            </Text>
          )}
        </Card>

        <View style={{ height: 24 }} />
      </View>
    </Screen>
  );
}