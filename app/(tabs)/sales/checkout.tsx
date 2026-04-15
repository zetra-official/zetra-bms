import SafeIcon from "@/src/ui/SafeIcon";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";

import { useNetInfo } from "@react-native-community/netinfo";

import { useOrg } from "../../../src/context/OrgContext";
import { enqueueSale, makeId } from "../../../src/offline/salesQueue";
import { supabase } from "../../../src/supabase/supabaseClient";
import { Button } from "../../../src/ui/Button";
import { Card } from "../../../src/ui/Card";
import { Screen } from "../../../src/ui/Screen";
import { formatMoney, useOrgMoneyPrefs } from "@/src/ui/money";
import { theme } from "../../../src/ui/theme";

type CartItem = {
  product_id: string;
  name: string;
  sku: string | null;
  qty: number;
  unit: string | null;
  unit_price: number;
  line_total: number;

  // checkout-only dynamic markup
  extra_per_qty?: number;
};

type PayMethod = "CASH" | "MOBILE" | "BANK" | "CREDIT";

type DiscountType = "fixed" | "percent" | null;
type DiscountResult = { type: DiscountType; value: number; amount: number };

type OpenCashierShiftRow = {
  shift_id: string;
  organization_id?: string | null;
  store_id?: string | null;
  membership_id?: string | null;
  opening_cash?: number | null;
  status?: string | null;
  opened_at?: string | null;
  closed_at?: string | null;
};

function one(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : v;
}

function parseMoney(s: string) {
  const cleaned = String(s ?? "").replace(/[, ]+/g, "").trim();
  if (!cleaned) return NaN;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : NaN;
}

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
  const rawNum = m?.[1] ?? compact.match(/-?[0-9][0-9,]*(?:\.[0-9]+)?/)?.[0] ?? "";
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
  const base = String(args.note ?? "").trim();
  const dText = String(args.discountText ?? "").trim();
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
  compact = false,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  compact?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => ({
        flex: compact ? undefined : 1,
        width: compact ? ("48.7%" as any) : undefined,
        minHeight: compact ? 44 : 48,
        paddingVertical: compact ? 8 : 10,
        paddingHorizontal: compact ? 10 : 12,
        borderRadius: theme.radius.pill,
        borderWidth: 1,
        borderColor: active ? "rgba(52,211,153,0.40)" : theme.colors.border,
        backgroundColor: active ? "rgba(52,211,153,0.12)" : "rgba(255,255,255,0.06)",
        alignItems: "center",
        justifyContent: "center",
        opacity: pressed ? 0.92 : 1,
      })}
    >
      <Text
        style={{
          color: active ? theme.colors.emerald : theme.colors.text,
          fontWeight: "900",
          fontSize: compact ? 13 : 14,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function normalizeMoneyInput(raw: string) {
  const digitsOnly = String(raw ?? "").replace(/[^\d]/g, "");
  if (!digitsOnly) return "";
  const stripped = digitsOnly.replace(/^0+(?=\d)/, "");
  return stripped;
}

function isStrictPayMethod(x: any): x is PayMethod {
  return x === "CASH" || x === "BANK" || x === "MOBILE" || x === "CREDIT";
}

function parseWholeNumberInput(raw: string) {
  const cleaned = String(raw ?? "").replace(/[^\d]/g, "").trim();
  if (!cleaned) return 0;
  const n = Number(cleaned);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : 0;
}

function getExtraPerQty(item: CartItem) {
  const n = Number(item.extra_per_qty ?? 0);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
}

function getAdjustedUnitPrice(item: CartItem) {
  return Math.max(0, Math.round(Number(item.unit_price || 0)) + getExtraPerQty(item));
}

function getAdjustedLineTotal(item: CartItem) {
  const qty = Math.max(0, Math.trunc(Number(item.qty || 0)));
  return getAdjustedUnitPrice(item) * qty;
}

async function getMyOpenCashierShiftId(storeId: string): Promise<string | null> {
  const sid = String(storeId ?? "").trim();
  if (!sid) return null;

  const { data, error } = await supabase.rpc("get_my_open_cashier_shift_v1", {
    p_store_id: sid,
  } as any);

  if (error) throw error;

  const row = (Array.isArray(data) ? data[0] : data) as OpenCashierShiftRow | null;
  const shiftId = String(row?.shift_id ?? "").trim();
  return shiftId || null;
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
  const { width, height } = useWindowDimensions();

  const params = useLocalSearchParams<{
    storeId?: string | string[];
    storeName?: string | string[];
    cart?: string | string[];
    cashierMode?: string | string[];
  }>();

  const netInfo = useNetInfo();
  const isOnline = !!(netInfo.isConnected && netInfo.isInternetReachable !== false);
  const isOffline = !isOnline;

  const orgCtx: any = useOrg();
  const { activeOrgId, activeStoreId, activeStoreName, activeRole } = orgCtx;

  const orgId = String(activeOrgId ?? "").trim();
  const money = useOrgMoneyPrefs(orgId);
  const displayCurrency = money.currency || "TZS";
  const displayLocale = money.locale || "en-TZ";

  const fmt = useCallback(
    (n: number) =>
      formatMoney(n, { currency: displayCurrency, locale: displayLocale }).replace(/\s+/g, " "),
    [displayCurrency, displayLocale]
  );

  const storeId = String(one(params.storeId) ?? "").trim();
  const storeNameParam = String(one(params.storeName) ?? "").trim();
  const cashierMode = one(params.cashierMode) === "1";

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

  const [checkoutCart, setCheckoutCart] = useState<CartItem[]>([]);
  const [adjustModalVisible, setAdjustModalVisible] = useState(false);
  const [adjustTargetIndex, setAdjustTargetIndex] = useState<number | null>(null);
  const [adjustApplyToAll, setAdjustApplyToAll] = useState(false);
  const [adjustValue, setAdjustValue] = useState("");

  useEffect(() => {
    setCheckoutCart(
      cart.map((c) => ({
        ...c,
        extra_per_qty: Number((c as any)?.extra_per_qty ?? 0) || 0,
      }))
    );
  }, [cart]);

  const isDesktopWeb = Platform.OS === "web" && width >= 1180;
  const desktopPaneHeight = Math.max(520, height - 220);

  const canSell = useMemo(() => {
    const r = String(activeRole ?? "staff").trim().toLowerCase();
    return r === "owner" || r === "admin" || r === "staff" || r === "cashier";
  }, [activeRole]);

  const openAdjustModal = useCallback((index: number) => {
    const row = checkoutCart[index];
    if (!row) return;
    setAdjustTargetIndex(index);
    setAdjustApplyToAll(false);
    setAdjustValue(String(getExtraPerQty(row) || ""));
    setAdjustModalVisible(true);
  }, [checkoutCart]);

  const closeAdjustModal = useCallback(() => {
    setAdjustModalVisible(false);
    setAdjustTargetIndex(null);
    setAdjustApplyToAll(false);
    setAdjustValue("");
  }, []);

  const applyAdjustment = useCallback(() => {
    const extra = parseWholeNumberInput(adjustValue);

    if (adjustApplyToAll) {
      setCheckoutCart((prev) =>
        prev.map((item) => ({
          ...item,
          extra_per_qty: extra,
        }))
      );
      closeAdjustModal();
      return;
    }

    if (adjustTargetIndex == null) return;

    setCheckoutCart((prev) =>
      prev.map((item, idx) =>
        idx === adjustTargetIndex
          ? {
              ...item,
              extra_per_qty: extra,
            }
          : item
      )
    );

    closeAdjustModal();
  }, [adjustValue, adjustApplyToAll, adjustTargetIndex, closeAdjustModal]);

  const totalQty = useMemo(
    () => checkoutCart.reduce((a, c) => a + (c.qty || 0), 0),
    [checkoutCart]
  );

  const subtotalAmount = useMemo(
    () => checkoutCart.reduce((a, c) => a + getAdjustedLineTotal(c), 0),
    [checkoutCart]
  );

  const [discountText, setDiscountText] = useState<string>("");
  const discount = useMemo(
    () => parseDiscountInput(discountText, subtotalAmount),
    [discountText, subtotalAmount]
  );

  const grandTotal = useMemo(
    () => Math.max(0, subtotalAmount - (discount.amount || 0)),
    [subtotalAmount, discount.amount]
  );

  const headerStoreName = storeNameParam || activeStoreName || "—";
  const mismatch = !!(activeStoreId && storeId && activeStoreId !== storeId);

  const [method, setMethod] = useState<PayMethod>("CASH");
  const [paidVia, setPaidVia] = useState<Exclude<PayMethod, "CREDIT">>("CASH");

  const [paidStr, setPaidStr] = useState<string>(() =>
    String(Math.round(grandTotal || subtotalAmount))
  );
  const [channel, setChannel] = useState<string>("");
  const [reference, setReference] = useState<string>("");

  const [customerName, setCustomerName] = useState<string>("");
  const [customerPhone, setCustomerPhone] = useState<string>("");

  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [openCashierShiftId, setOpenCashierShiftId] = useState<string | null>(null);

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

  const isCredit = useMemo(() => method === "CREDIT", [method]);

  const showPaidVia = useMemo(
    () => method === "CREDIT" && (Number.isFinite(paidAmount) ? paidAmount : 0) > 0,
    [method, paidAmount]
  );

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
    let alive = true;

    async function loadMyOpenCashierShift() {
      try {
        if (!storeId) {
          if (alive) setOpenCashierShiftId(null);
          return;
        }

        const role = String(activeRole ?? "").trim().toLowerCase();
        if (role !== "cashier") {
          if (alive) setOpenCashierShiftId(null);
          return;
        }

        const { data, error } = await supabase.rpc("get_my_open_cashier_shift_v1", {
          p_store_id: storeId,
        } as any);

        if (error) throw error;

        const row = (Array.isArray(data) ? data[0] : data) as OpenCashierShiftRow | null;
        const shiftId = String(row?.shift_id ?? "").trim();

        if (alive) setOpenCashierShiftId(shiftId || null);
      } catch {
        if (alive) setOpenCashierShiftId(null);
      }
    }

    void loadMyOpenCashierShift();

    return () => {
      alive = false;
    };
  }, [storeId, activeRole]);

  useEffect(() => {
    if (cashierMode) return;

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
  }, [cashierMode, grandTotal, paidStr, isCredit]);

  const invalidReason = useMemo(() => {
    if (!canSell) return "No permission to sell.";
    if (!storeId) return "Missing storeId.";
    if (mismatch) {
      return "Store mismatch: rudi nyuma, chagua store sahihi kisha uende Checkout upya.";
    }
    if (checkoutCart.length === 0) return "Cart is empty.";
    if (checkoutCart.some((c) => !Number.isFinite(c.unit_price) || c.unit_price <= 0)) {
      return "Some items are missing price.";
    }

    if (String(activeRole ?? "").trim().toLowerCase() === "cashier" && !cashierMode) {
      if (!openCashierShiftId) return "Cashier hana OPEN shift kwa store hii.";
    }

    if (cashierMode) {
      if (isOffline) return "Cashier handoff requires online connection.";
      return null;
    }

    if (!Number.isFinite(paidAmount)) return "Enter a valid paid amount.";
    if (paidAmount < 0) return "Paid amount cannot be negative.";
    if (paidAmount > grandTotal) return "Paid amount cannot exceed total.";

    if (!isCredit && Math.round(paidAmount) !== Math.round(grandTotal)) {
      return "Non-credit sale must be fully paid.";
    }

    if (showPaidVia) {
      if (!paidVia) return "Chagua Paid Via (Cash/Mobile/Bank).";
    }

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
    checkoutCart,
    cashierMode,
    isOffline,
    paidAmount,
    grandTotal,
    isCredit,
    showPaidVia,
    paidVia,
    rpcPaymentMethod,
    rpcChannel,
    rpcReference,
    customerName,
    activeRole,
    openCashierShiftId,
  ]);

  const preflightCheckStock = useCallback(async () => {
    const productIds = Array.from(new Set(checkoutCart.map((c) => c.product_id).filter(Boolean)));
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
    for (const c of checkoutCart) {
      const have = map.has(c.product_id) ? Number(map.get(c.product_id)) : 0;
      const need = Math.trunc(Number(c.qty || 0));
      if (need > 0 && have < need) bad.push({ name: c.name || "Product", need, have });
    }

    if (bad.length > 0) {
      const lines = bad
        .slice(0, 8)
        .map((x) => `• ${x.name}: have ${x.have}, need ${x.need}`)
        .join("\n");

      throw new Error(
        `Stock insufficient to complete this sale.\n\n${lines}\n\nPlease go to Inventory → Adjust Stock (ADD), then try again.`
      );
    }
  }, [checkoutCart, storeId]);

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
    async (args: {
      storeId: string;
      creditAccountId: string;
      amount: number;
      note?: string | null;
      reference?: string | null;
    }) => {
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

    if (cashierMode) {
      setSaving(true);
      try {
        const finalNote = buildNoteWithDiscount({
          note: `${note || ""}`,
          discountText,
          discountAmount: discount.amount,
          subtotal: subtotalAmount,
        });

        const items = checkoutCart.map((c) => ({
          product_id: c.product_id,
          qty: Math.trunc(Number(c.qty)),
          unit_price: getAdjustedUnitPrice(c),
          name: c.name ?? "Product",
          sku: c.sku ?? null,
          unit: c.unit ?? null,
          line_total: getAdjustedLineTotal(c),
        }));

        const { data, error } = await supabase.rpc("create_cashier_handoff_v2", {
          p_store_id: storeId,
          p_items: items,
          p_subtotal: subtotalAmount,
          p_discount_amount: discount.amount,
          p_total: grandTotal,
          p_note: finalNote,
        });

        if (error) throw error;

        Alert.alert(
          "Sent to Cashiers ✅",
          `Order imetumwa kwa cashier queue ya store hii.\n\nHandoff ID: ${String(data ?? "").slice(0, 8)}...`
        );

        router.replace("/(tabs)/sales" as any);
      } catch (e: any) {
        Alert.alert("Failed", e?.message ?? "Failed to send order to cashier queue");
      } finally {
        setSaving(false);
      }
      return;
    }

    if (isOffline) {
      try {
        const clientSaleId = makeId();

        if (String(activeRole ?? "").trim().toLowerCase() === "cashier") {
          const cashierShiftId = await getMyOpenCashierShiftId(storeId);
          if (!cashierShiftId) {
            throw new Error("Cashier hana OPEN shift. Fungua shift kwanza kabla ya kufanya sale.");
          }
        }

        const items = checkoutCart.map((c) => ({
          product_id: c.product_id,
          qty: Math.trunc(Number(c.qty)),
          unit_price: getAdjustedUnitPrice(c),
          name: c.name ?? "Product",
          sku: c.sku ?? null,
          unit: c.unit ?? null,
        }));

        const p_paid_amount = Number.isFinite(paidAmount) ? Number(paidAmount) : 0;
        const p_payment_method = rpcPaymentMethod;

        const p_payment_channel =
          p_payment_method === "MOBILE" || p_payment_method === "BANK"
            ? rpcChannel.trim() || null
            : null;
        const p_reference =
          p_payment_method === "MOBILE" || p_payment_method === "BANK"
            ? rpcReference.trim() || null
            : null;

        const customerLines = isCredit
          ? `CUSTOMER: ${customerName.trim()}\nPHONE: ${customerPhone.trim() || "-"}\n`
          : "";

        const finalNote = buildNoteWithDiscount({
          note: `${customerLines}${note || ""}`,
          discountText,
          discountAmount: discount.amount,
          subtotal: subtotalAmount,
        });

        const rpcDiscountType =
          discount.type === "percent" ? "PERCENT" : discount.type === "fixed" ? "FIXED" : null;

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
            customer_phone: isCredit ? customerPhone.trim() || null : null,
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

    setSaving(true);
    try {
      await preflightCheckStock();

      const access = await supabase.rpc("ensure_my_store_access", { p_store_id: storeId });
      if (access.error) throw access.error;

      const items = checkoutCart.map((c) => ({
        product_id: c.product_id,
        qty: Math.trunc(Number(c.qty)),
        unit_price: getAdjustedUnitPrice(c),
      }));

      const p_paid_amount = Number(paidAmount);

      const customerLines = isCredit
        ? `CUSTOMER: ${customerName.trim()}\nPHONE: ${customerPhone.trim() || "-"}\n`
        : "";

      const finalNote = buildNoteWithDiscount({
        note: `${customerLines}${note || ""}`,
        discountText,
        discountAmount: discount.amount,
        subtotal: subtotalAmount,
      });

      const rpcDiscountType =
        discount.type === "percent" ? "PERCENT" : discount.type === "fixed" ? "FIXED" : null;

      const rpcDiscountValue =
        discount.type === "percent"
          ? Number(discount.value || 0)
          : discount.type === "fixed"
            ? Number(discount.amount || 0)
            : null;

      const clientSaleId = makeId();

      let cashierShiftId: string | null = null;
      const isCashierUser = String(activeRole ?? "").trim().toLowerCase() === "cashier";

      if (isCashierUser) {
        cashierShiftId = await getMyOpenCashierShiftId(storeId);
        if (!cashierShiftId) {
          throw new Error("Cashier hana OPEN shift. Fungua shift kwanza kabla ya kufanya sale.");
        }
      }

      const res = await supabase.rpc("create_sale_with_payment_v4", {
        p_store_id: storeId,
        p_items: items,
        p_note: finalNote,
        p_payment_method: rpcPaymentMethod,
        p_paid_amount: p_paid_amount,
        p_payment_channel:
          rpcPaymentMethod === "MOBILE" || rpcPaymentMethod === "BANK"
            ? rpcChannel.trim() || null
            : null,
        p_reference:
          rpcPaymentMethod === "MOBILE" || rpcPaymentMethod === "BANK"
            ? rpcReference.trim() || null
            : null,
        p_customer_id: null,
        p_customer_phone: null,
        p_customer_full_name: null,
        p_discount_type: rpcDiscountType,
        p_discount_value: rpcDiscountValue,
        p_discount_note: discountText.trim() || null,
        p_client_sale_id: clientSaleId,
        p_cashier_shift_id: isCashierUser ? cashierShiftId : null,
      } as any);

      if (res.error) throw res.error;

      const row = Array.isArray(res.data) ? (res.data[0] ?? null) : res.data;
      const saleId: string | null =
        row?.sale_id != null
          ? String(row.sale_id)
          : row != null && typeof row === "string"
            ? String(row)
            : null;

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
    cashierMode,
    note,
    discountText,
    discount.amount,
    subtotalAmount,
    checkoutCart,
    storeId,
    grandTotal,
    router,
    isOffline,
    paidAmount,
    rpcPaymentMethod,
    rpcChannel,
    rpcReference,
    isCredit,
    customerName,
    customerPhone,
    balance,
    preflightCheckStock,
    ensureCreditAccountV2,
    recordCreditSaleV2,
    discount,
    activeRole,
  ]);

  const cartTotalLabel = useMemo(() => {
    const itemsCount = checkoutCart.length;
    return `${itemsCount} item${itemsCount === 1 ? "" : "s"} • ${totalQty} qty`;
  }, [checkoutCart.length, totalQty]);

  const prettySubtotal = useMemo(() => fmt(subtotalAmount), [fmt, subtotalAmount]);
  const prettyDiscount = useMemo(() => fmt(discount.amount), [fmt, discount.amount]);
  const prettyTotal = useMemo(() => fmt(grandTotal), [fmt, grandTotal]);
  const prettyPaid = useMemo(
    () => fmt(Number.isFinite(paidAmount) ? paidAmount : 0),
    [fmt, paidAmount]
  );
  const prettyBal = useMemo(() => fmt(balance), [fmt, balance]);

  const showChannelRef = useMemo(() => {
    if (cashierMode) return false;
    if (isOffline) return false;
    return rpcPaymentMethod === "MOBILE" || rpcPaymentMethod === "BANK";
  }, [cashierMode, isOffline, rpcPaymentMethod]);

  const summaryCard = (
    <Card style={{ gap: 10 }}>
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 16 }}>
            Order Summary
          </Text>
          <Text style={{ color: theme.colors.muted, fontWeight: "800", marginTop: 2 }}>
            {cartTotalLabel}
          </Text>
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
        {checkoutCart.map((c, index) => {
          const baseUnit = fmt(Number(c.unit_price || 0));
          const adjustedUnit = fmt(getAdjustedUnitPrice(c));
          const adjustedLine = fmt(getAdjustedLineTotal(c));
          const extra = getExtraPerQty(c);
          const extraLabel = extra > 0 ? fmt(extra) : null;

          return (
            <View
              key={`${c.product_id}-${c.sku ?? ""}-${index}`}
              style={{
                padding: 12,
                borderRadius: 16,
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.10)",
                backgroundColor: "rgba(255,255,255,0.05)",
                gap: 8,
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 10,
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text style={{ color: theme.colors.text, fontWeight: "900" }} numberOfLines={1}>
                    {c.name}
                  </Text>
                  <Text style={{ color: theme.colors.muted, fontWeight: "800" }} numberOfLines={1}>
                    SKU: {c.sku ?? "—"} • Qty: {c.qty} • Unit: {c.unit ?? "—"}
                  </Text>
                </View>

                <Pressable
                  onPress={() => openAdjustModal(index)}
                  style={({ pressed }) => ({
                    minWidth: 42,
                    height: 42,
                    borderRadius: 999,
                    alignItems: "center",
                    justifyContent: "center",
                    borderWidth: 1,
                    borderColor: "rgba(52,211,153,0.30)",
                    backgroundColor: "rgba(52,211,153,0.10)",
                    opacity: pressed ? 0.9 : 1,
                  })}
                >
                  <SafeIcon name="add" size={20} color={theme.colors.emerald} />
                </Pressable>
              </View>

              <Text style={{ color: theme.colors.faint, fontWeight: "900" }}>
                Unit: {adjustedUnit} • Line: {adjustedLine}
              </Text>

              {extra > 0 ? (
                <Text style={{ color: theme.colors.emerald, fontWeight: "900" }}>
                  Markup: +{extraLabel} kwa kila qty
                </Text>
              ) : (
                <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>
                  Hakuna markup bado
                </Text>
              )}

              {extra > 0 ? (
                <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>
                  Base Unit: {baseUnit}
                </Text>
              ) : null}
            </View>
          );
        })}
      </View>

      <View style={{ height: 1, backgroundColor: "rgba(255,255,255,0.08)" }} />

      <View
        style={{
          flexDirection: isDesktopWeb ? "column" : "row",
          gap: 10,
        }}
      >
        <View
          style={{
            flex: 1,
            padding: 12,
            borderRadius: 16,
            borderWidth: 1,
            borderColor: "rgba(255,255,255,0.08)",
            backgroundColor: "rgba(255,255,255,0.04)",
          }}
        >
          <Text style={{ color: theme.colors.muted, fontWeight: "900" }}>Subtotal</Text>
          <Text style={{ color: theme.colors.text, fontWeight: "900", marginTop: 4 }}>
            {prettySubtotal}
          </Text>
        </View>

        <View
          style={{
            flex: 1,
            padding: 12,
            borderRadius: 16,
            borderWidth: 1,
            borderColor: "rgba(255,255,255,0.08)",
            backgroundColor: "rgba(255,255,255,0.04)",
          }}
        >
          <Text style={{ color: theme.colors.muted, fontWeight: "900" }}>Discount</Text>
          <Text style={{ color: theme.colors.text, fontWeight: "900", marginTop: 4 }}>
            {prettyDiscount}
          </Text>
        </View>

        <View
          style={{
            flex: 1,
            padding: 12,
            borderRadius: 16,
            borderWidth: 1,
            borderColor: "rgba(52,211,153,0.20)",
            backgroundColor: "rgba(52,211,153,0.08)",
          }}
        >
          <Text style={{ color: theme.colors.muted, fontWeight: "900" }}>Total</Text>
          <Text style={{ color: theme.colors.text, fontWeight: "900", marginTop: 4 }}>
            {prettyTotal}
          </Text>
        </View>
      </View>
    </Card>
  );

  const discountNoteCard = (
    <Card style={{ gap: 10 }}>
      <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 16 }}>
        Discount & Note
      </Text>

      <View>
        <FieldLabel>Discount (e.g. 10% • 5000 • 5k • 1m)</FieldLabel>
        <InputBox
          value={discountText}
          onChangeText={setDiscountText}
          placeholder="mf: 10% au 5000 au 5k"
          keyboardType="default"
        />
        <Text style={{ color: theme.colors.faint, fontWeight: "800", marginTop: 8 }}>
          Tip: Ukiweka discount, total itashuka moja kwa moja.
        </Text>
        <Text style={{ color: theme.colors.faint, fontWeight: "800", marginTop: 4 }}>
          Pia unaweza kubonyeza alama ya + kwenye kila item kuongeza bei kwa kila qty.
        </Text>
      </View>

      <View style={{ height: 1, backgroundColor: "rgba(255,255,255,0.08)" }} />

      <View>
        <FieldLabel>Note (optional)</FieldLabel>
        <InputBox
          value={note}
          onChangeText={setNote}
          placeholder={
            cashierMode
              ? "andika maelezo ya order kwa cashiers..."
              : "andika maelezo ya mauzo..."
          }
          keyboardType="default"
          multiline
        />
      </View>
    </Card>
  );

  const paymentCard = !cashierMode ? (
    <Card style={{ gap: 12 }}>
      <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 16 }}>
        Payment
      </Text>

     <View
        style={{
          flexDirection: "row",
          flexWrap: isDesktopWeb ? "wrap" : "nowrap",
          gap: 8,
          justifyContent: "space-between",
          alignItems: "stretch",
        }}
      >
        <MethodChip
          label="Cash"
          active={method === "CASH"}
          onPress={() => onSetMethod("CASH")}
          compact={isDesktopWeb}
        />
        <MethodChip
          label="Mobile"
          active={method === "MOBILE"}
          onPress={() => onSetMethod("MOBILE")}
          compact={isDesktopWeb}
        />
        <MethodChip
          label="Bank"
          active={method === "BANK"}
          onPress={() => onSetMethod("BANK")}
          compact={isDesktopWeb}
        />
        <MethodChip
          label="Credit"
          active={method === "CREDIT"}
          onPress={() => onSetMethod("CREDIT")}
          compact={isDesktopWeb}
        />
      </View>

      <View style={{ height: 1, backgroundColor: "rgba(255,255,255,0.08)" }} />

      <View>
        <FieldLabel>Paid ({displayCurrency})</FieldLabel>
        <InputBox
          value={paidStr}
          onChangeText={onPaidChange}
          placeholder="mf: 120000"
          keyboardType="numeric"
        />
        <Text style={{ color: theme.colors.faint, fontWeight: "800", marginTop: 8 }}>
          {method === "CREDIT"
            ? "Unaweza kuweka 0 hadi total (partial payment)."
            : "Kwa non-credit, lazima ulipe full total."}
        </Text>
      </View>

      <View
        style={{
          flexDirection: isDesktopWeb ? "column" : "row",
          gap: 10,
        }}
      >
        <View
          style={{
            flex: 1,
            padding: 12,
            borderRadius: 16,
            borderWidth: 1,
            borderColor: "rgba(255,255,255,0.08)",
            backgroundColor: "rgba(255,255,255,0.04)",
          }}
        >
          <Text style={{ color: theme.colors.muted, fontWeight: "900" }}>Total</Text>
          <Text style={{ color: theme.colors.text, fontWeight: "900", marginTop: 4 }}>
            {prettyTotal}
          </Text>
        </View>

        <View
          style={{
            flex: 1,
            padding: 12,
            borderRadius: 16,
            borderWidth: 1,
            borderColor: "rgba(255,255,255,0.08)",
            backgroundColor: "rgba(255,255,255,0.04)",
          }}
        >
          <Text style={{ color: theme.colors.muted, fontWeight: "900" }}>Paid</Text>
          <Text style={{ color: theme.colors.text, fontWeight: "900", marginTop: 4 }}>
            {prettyPaid}
          </Text>
        </View>

        <View
          style={{
            flex: 1,
            padding: 12,
            borderRadius: 16,
            borderWidth: 1,
            borderColor: isCredit ? "rgba(52,211,153,0.20)" : "rgba(255,255,255,0.08)",
            backgroundColor: isCredit ? "rgba(52,211,153,0.08)" : "rgba(255,255,255,0.04)",
          }}
        >
          <Text style={{ color: theme.colors.muted, fontWeight: "900" }}>Balance</Text>
          <Text
            style={{
              color: isCredit ? theme.colors.emerald : theme.colors.text,
              fontWeight: "900",
              marginTop: 4,
            }}
          >
            {prettyBal}
          </Text>
        </View>
      </View>

      {method === "CREDIT" ? (
        <>
          <View style={{ height: 1, backgroundColor: "rgba(255,255,255,0.08)" }} />

          <Text style={{ color: theme.colors.faint, fontWeight: "900" }}>
            CREDIT MODE: ukiweka Paid &gt; 0, chagua Paid Via (mali uliyopokea leo).
          </Text>

          <View
            style={{
              flexDirection: "row",
              flexWrap: isDesktopWeb ? "wrap" : "nowrap",
              gap: 8,
              opacity: showPaidVia ? 1 : 0.55,
              justifyContent: "space-between",
            }}
          >
            <MethodChip
              label="Cash"
              active={paidVia === "CASH"}
              compact={isDesktopWeb}
              onPress={() => {
                if (!showPaidVia) return;
                setPaidVia("CASH");
              }}
            />
            <MethodChip
              label="Mobile"
              active={paidVia === "MOBILE"}
              compact={isDesktopWeb}
              onPress={() => {
                if (!showPaidVia) return;
                setPaidVia("MOBILE");
                if (!channel) setChannel("M-PESA");
              }}
            />
            <MethodChip
              label="Bank"
              active={paidVia === "BANK"}
              compact={isDesktopWeb}
              onPress={() => {
                if (!showPaidVia) return;
                setPaidVia("BANK");
              }}
            />
          </View>
        </>
      ) : null}

      {showChannelRef ? (
        <>
          <View style={{ height: 1, backgroundColor: "rgba(255,255,255,0.08)" }} />
          <View style={{ gap: 10 }}>
            <View>
              <FieldLabel>
                {rpcPaymentMethod === "MOBILE"
                  ? "Mobile Channel (e.g. M-PESA / TIGO-PESA)"
                  : "Bank Channel (e.g. NMB / CRDB)"}
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
              <InputBox
                value={reference}
                onChangeText={setReference}
                placeholder="mf: TXN12345"
                keyboardType="default"
              />
            </View>
          </View>
        </>
      ) : null}

      {isOffline ? (
        <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>
          OFFLINE: mobile/bank reference haitahitajika sasa; sale itasave offline na itasync.
        </Text>
      ) : null}
    </Card>
  ) : null;

  const customerCard =
    !cashierMode && isCredit ? (
      <Card style={{ gap: 10 }}>
        <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 16 }}>
          Customer (for Credit/Partial)
        </Text>

        <View>
          <FieldLabel>Customer Name *</FieldLabel>
          <InputBox
            value={customerName}
            onChangeText={setCustomerName}
            placeholder="mf: Juma Ali"
            keyboardType="default"
          />
        </View>

        <View>
          <FieldLabel>Customer Phone (optional)</FieldLabel>
          <InputBox
            value={customerPhone}
            onChangeText={setCustomerPhone}
            placeholder="mf: 0712xxxxxx"
            keyboardType="phone-pad"
          />
        </View>

        <Text style={{ color: theme.colors.faint, fontWeight: "800" }}>
          Tip: Credit itarekodiwa v2 na balance itaingia kwenye Credit account.
        </Text>
      </Card>
    ) : null;

  const actionCard = (
    <Card style={{ gap: 10 }}>
      <Button
        title={
          saving
            ? cashierMode
              ? "Sending..."
              : "Creating..."
            : cashierMode
              ? "Send to Cashiers"
              : isOffline
                ? "Save Offline"
                : "Confirm Sale"
        }
        onPress={confirm}
        disabled={saving || !!invalidReason}
        variant="primary"
      />
      <Button title="Back" onPress={() => router.back()} disabled={saving} variant="secondary" />

      {!!invalidReason && (
        <Text style={{ color: theme.colors.muted, fontWeight: "900" }}>⚠ {invalidReason}</Text>
      )}
    </Card>
  );

  const adjustTargetItem =
    adjustTargetIndex != null ? checkoutCart[adjustTargetIndex] ?? null : null;

  const adjustPreviewExtra = parseWholeNumberInput(adjustValue);
  const adjustPreviewQty = Math.max(0, Math.trunc(Number(adjustTargetItem?.qty || 0)));
  const adjustPreviewLineAdd = adjustApplyToAll
    ? 0
    : adjustPreviewExtra > 0 && adjustPreviewQty > 0
      ? adjustPreviewExtra * adjustPreviewQty
      : 0;

  return (
    <Screen scroll bottomPad={240}>
      <Modal
        visible={adjustModalVisible}
        transparent
        animationType="fade"
        onRequestClose={closeAdjustModal}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.55)",
            justifyContent: "center",
            padding: 16,
          }}
        >
          <View
            style={{
              borderRadius: 22,
              borderWidth: 1,
              borderColor: theme.colors.border,
              backgroundColor: "#10141c",
              padding: 16,
              gap: 12,
            }}
          >
            <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 18 }}>
              Adjust Price
            </Text>

            <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>
              {adjustTargetItem?.name ?? "Item"}
            </Text>

            <View
              style={{
                padding: 12,
                borderRadius: 16,
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.08)",
                backgroundColor: "rgba(255,255,255,0.04)",
                gap: 4,
              }}
            >
              <Text style={{ color: theme.colors.muted, fontWeight: "900" }}>
                Mode: Add per qty
              </Text>
              <Text style={{ color: theme.colors.faint, fontWeight: "800" }}>
                Ukiweka 5000 na qty ni 2, line itaongezeka 10000 moja kwa moja.
              </Text>
            </View>

            <View>
              <FieldLabel>Increase per qty ({displayCurrency})</FieldLabel>
              <InputBox
                value={adjustValue}
                onChangeText={(v) => setAdjustValue(v.replace(/[^\d]/g, ""))}
                placeholder="mf: 5000"
                keyboardType="numeric"
              />
            </View>

            <View style={{ gap: 8 }}>
              <Pressable
                onPress={() => setAdjustApplyToAll(false)}
                style={({ pressed }) => ({
                  borderRadius: 16,
                  borderWidth: 1,
                  borderColor: !adjustApplyToAll
                    ? "rgba(52,211,153,0.40)"
                    : theme.colors.border,
                  backgroundColor: !adjustApplyToAll
                    ? "rgba(52,211,153,0.10)"
                    : "rgba(255,255,255,0.04)",
                  paddingVertical: 12,
                  paddingHorizontal: 12,
                  opacity: pressed ? 0.92 : 1,
                })}
              >
                <Text
                  style={{
                    color: !adjustApplyToAll ? theme.colors.emerald : theme.colors.text,
                    fontWeight: "900",
                  }}
                >
                  This item only
                </Text>
              </Pressable>

              <Pressable
                onPress={() => setAdjustApplyToAll(true)}
                style={({ pressed }) => ({
                  borderRadius: 16,
                  borderWidth: 1,
                  borderColor: adjustApplyToAll
                    ? "rgba(52,211,153,0.40)"
                    : theme.colors.border,
                  backgroundColor: adjustApplyToAll
                    ? "rgba(52,211,153,0.10)"
                    : "rgba(255,255,255,0.04)",
                  paddingVertical: 12,
                  paddingHorizontal: 12,
                  opacity: pressed ? 0.92 : 1,
                })}
              >
                <Text
                  style={{
                    color: adjustApplyToAll ? theme.colors.emerald : theme.colors.text,
                    fontWeight: "900",
                  }}
                >
                  Apply to all items
                </Text>
              </Pressable>
            </View>

            <View
              style={{
                padding: 12,
                borderRadius: 16,
                borderWidth: 1,
                borderColor: "rgba(52,211,153,0.18)",
                backgroundColor: "rgba(52,211,153,0.08)",
                gap: 4,
              }}
            >
              <Text style={{ color: theme.colors.text, fontWeight: "900" }}>
                Preview
              </Text>

              {adjustApplyToAll ? (
                <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>
                  Markup ya {fmt(adjustPreviewExtra)} itawekwa kwa kila qty kwenye items zote.
                </Text>
              ) : (
                <>
                  <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>
                    Qty: {adjustPreviewQty}
                  </Text>
                  <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>
                    Added to line: {fmt(adjustPreviewLineAdd)}
                  </Text>
                </>
              )}
            </View>

            <View style={{ flexDirection: "row", gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Button title="Cancel" onPress={closeAdjustModal} variant="secondary" />
              </View>
              <View style={{ flex: 1 }}>
                <Button title="Apply" onPress={applyAdjustment} variant="primary" />
              </View>
            </View>
          </View>
        </View>
      </Modal>

      <View
        style={{
          flex: 1,
          gap: 14,
          width: "100%",
          maxWidth: isDesktopWeb ? 1380 : 980,
          alignSelf: "center",
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 10,
          }}
        >
         <Pressable
            onPress={() => router.back()}
            hitSlop={10}
            style={({ pressed }) => ({
              width: 44,
              height: 44,
              borderRadius: 999,
              alignItems: "center",
              justifyContent: "center",
              borderWidth: 1,
              borderColor: theme.colors.border,
              backgroundColor: "rgba(255,255,255,0.06)",
              opacity: pressed ? 0.92 : 1,
            })}
          >
            <SafeIcon name="chevron-left" size={22} color={theme.colors.text} />
          </Pressable>

          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 26, fontWeight: "900", color: theme.colors.text }}>
              {cashierMode ? "Cashier Handoff" : "Checkout"}
            </Text>
            <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>
              Store: {headerStoreName}
              {isOffline ? "  •  OFFLINE" : "  •  ONLINE"}
            </Text>
          </View>
        </View>

        {mismatch ? (
          <Card>
            <Text style={{ color: theme.colors.muted, fontWeight: "900" }}>
              ⚠️ Store mismatch: Active store na store ya checkout ni tofauti.
              {"\n"}Rudi nyuma → chagua store sahihi → checkout upya.
            </Text>
          </Card>
        ) : null}

        {cashierMode ? (
          <Card style={{ gap: 8 }}>
            <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 16 }}>
              Cashier Flow
            </Text>
            <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>
              Hapa order itatumwa kwenye cashier queue ya store hii. Cashier yeyote aliye-assigniwa
              store hii anaweza kuipokea na kukamilisha malipo.
            </Text>
            <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>
              • Hii mode inahitaji ONLINE
            </Text>
            <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>
              • Store lazima iwe na cashier angalau mmoja aliye-assigniwa
            </Text>
          </Card>
        ) : null}

        {!cashierMode && String(activeRole ?? "").trim().toLowerCase() === "cashier" ? (
          <Card style={{ gap: 8 }}>
            <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 16 }}>
              Cashier Shift Link
            </Text>
            <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>
              Sale za cashier zitafungwa kwenye OPEN shift ya cashier huyu kwa store hii.
            </Text>
            <Text
              style={{
                color: openCashierShiftId ? theme.colors.emerald : theme.colors.danger,
                fontWeight: "900",
              }}
            >
              {openCashierShiftId
                ? `OPEN SHIFT: ${openCashierShiftId.slice(0, 8)}...`
                : "Hakuna OPEN cashier shift kwa store hii."}
            </Text>
          </Card>
        ) : null}

        {isDesktopWeb ? (
          <View
            style={{
              flexDirection: "row",
              alignItems: "flex-start",
              gap: 18,
            }}
          >
            <ScrollView
              style={{
                flex: 1.2,
                minWidth: 0,
                maxHeight: desktopPaneHeight,
                paddingRight: 2,
              }}
              contentContainerStyle={{ gap: 14, paddingRight: 4 }}
              showsVerticalScrollIndicator={false}
              nestedScrollEnabled
            >
              {summaryCard}
            </ScrollView>

            <ScrollView
              style={{
                width: 500,
                minWidth: 500,
                maxHeight: desktopPaneHeight,
              }}
              contentContainerStyle={{ gap: 14, paddingRight: 4 }}
              showsVerticalScrollIndicator={false}
              nestedScrollEnabled
            >
              {discountNoteCard}
              {paymentCard}
              {customerCard}
              {actionCard}
            </ScrollView>
          </View>
        ) : (
          <>
            {summaryCard}
            {discountNoteCard}
            {paymentCard}
            {customerCard}
            {actionCard}
          </>
        )}

        <View style={{ height: 24 }} />
      </View>
    </Screen>
  );
}