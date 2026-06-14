// app/stores/orders.tsx
import { useOrg } from "@/src/context/OrgContext";
import { supabase } from "@/src/supabase/supabaseClient";
import { Card } from "@/src/ui/Card";
import { Screen } from "@/src/ui/Screen";
import { theme } from "@/src/ui/theme";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";

type TabMode = "RESERVATIONS" | "PRE_ORDERS";
type SectionKey = "PENDING" | "READY" | "COMPLETED";

type StoreOrderRow = {
  id: string;
  order_type?: string | null;
  status?: string | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  product_name?: string | null;
  note?: string | null;
  total_amount?: number | null;
  paid_amount?: number | null;
  balance_amount?: number | null;
  created_at?: string | null;
};

type ParsedOrderNote = {
  cleanNote: string | null;
  itemsText: string | null;
  paymentText: string | null;
  discountText: string | null;
};

type CustomerFile = {
  key: string;
  name: string;
  phone: string;
  orders: StoreOrderRow[];
  total: number;
  paid: number;
  balance: number;
};

type CustomerSuggestion = {
  key: string;
  name: string;
  phone: string;
};

function money(v: any) {
  return `TSh ${Number(v || 0).toLocaleString()}`;
}

function shortDate(v?: string | null) {
  if (!v) return "—";
  try {
    return new Intl.DateTimeFormat("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(new Date(v));
  } catch {
    return "—";
  }
}

function normalizePhone(v?: string | null) {
  return String(v ?? "").replace(/\s+/g, "").trim();
}

function isCompletedOrder(r: StoreOrderRow) {
  const s = String(r.status ?? "").trim().toUpperCase();
  return s === "COMPLETED" || s === "PICKED_UP" || s === "CLOSED";
}

function parseOrderNote(note?: string | null): ParsedOrderNote {
  const raw = String(note ?? "").trim();
  if (!raw) return { cleanNote: null, itemsText: null, paymentText: null, discountText: null };

  let itemsText: string | null = null;
  let paymentText: string | null = null;
  let discountText: string | null = null;

  const paymentMatch = raw.match(/ORDER_PAYMENT:\s*([^\n]+)/i);
  if (paymentMatch?.[1]) paymentText = paymentMatch[1].replace(/\s*\|\s*/g, " • ").trim();

  const discountMatch = raw.match(/DISCOUNT:\s*"([^"]*)"\s*\|\s*DISCOUNT_AMOUNT:\s*([0-9.]+)/i);
  if (discountMatch?.[1]) {
    const label = discountMatch[1] === "—" ? "Discount" : discountMatch[1];
    discountText = `${label} • ${money(discountMatch[2])}`;
  }

  const jsonIndex = raw.indexOf("ITEMS_JSON:");
  if (jsonIndex >= 0) {
    const after = raw.slice(jsonIndex + "ITEMS_JSON:".length).trim();
    const discountIndex = after.indexOf("DISCOUNT:");
    const jsonRaw = discountIndex >= 0 ? after.slice(0, discountIndex).trim() : after.trim();

    try {
      const parsed = JSON.parse(jsonRaw);
      if (Array.isArray(parsed)) {
        itemsText = parsed
          .map((x: any) => `${String(x?.name ?? "Item")} x ${Number(x?.qty ?? 1)}`)
          .join(", ");
      }
    } catch {}
  }

  const cleaned = raw
    .replace(/ORDER_PAYMENT:[^\n]*\n?/gi, "")
    .replace(/CHANNEL:[^\n]*\n?/gi, "")
    .replace(/ITEMS_JSON:[\s\S]*?(?=DISCOUNT:|$)/gi, "")
    .replace(/DISCOUNT:[\s\S]*$/gi, "")
    .trim();

  return { cleanNote: cleaned || null, itemsText, paymentText, discountText };
}

function MiniPill({
  label,
  tone = "default",
}: {
  label: string;
  tone?: "default" | "green" | "amber" | "blue";
}) {
  const bg =
    tone === "green"
      ? "rgba(16,185,129,0.10)"
      : tone === "amber"
        ? "rgba(180,83,9,0.10)"
        : tone === "blue"
          ? "rgba(59,130,246,0.10)"
          : "#F8FAFC";

  const color =
    tone === "green"
      ? "#059669"
      : tone === "amber"
        ? "#B45309"
        : tone === "blue"
          ? "#2563EB"
          : "#0F172A";

  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: "rgba(15,23,42,0.08)",
        backgroundColor: bg,
        borderRadius: 999,
        paddingHorizontal: 10,
        paddingVertical: 6,
      }}
    >
      <Text style={{ color, fontWeight: "900", fontSize: 12 }}>{label}</Text>
    </View>
  );
}

export default function StoreOrdersScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ orgId?: string; storeId?: string; storeName?: string }>();
  const orgCtx: any = useOrg();

  const orgId = String(params?.orgId ?? orgCtx?.activeOrgId ?? "").trim();
  const storeId = String(params?.storeId ?? orgCtx?.activeStoreId ?? "").trim();
  const storeName = String(params?.storeName ?? orgCtx?.activeStoreName ?? "Active Store").trim();

  const [tab, setTab] = useState<TabMode>("RESERVATIONS");
  const [rows, setRows] = useState<StoreOrderRow[]>([]);
  const [loading, setLoading] = useState(false);

  const [payModalOpen, setPayModalOpen] = useState(false);
  const [payTarget, setPayTarget] = useState<StoreOrderRow | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState("CASH");
  const [payReference, setPayReference] = useState("");
  const [paySaving, setPaySaving] = useState(false);

  const [preModalOpen, setPreModalOpen] = useState(false);
  const [preCustomerName, setPreCustomerName] = useState("");
  const [preCustomerPhone, setPreCustomerPhone] = useState("");
  const [preProductName, setPreProductName] = useState("");
  const [preTotalAmount, setPreTotalAmount] = useState("");
  const [prePaidAmount, setPrePaidAmount] = useState("");
  const [prePaymentMethod, setPrePaymentMethod] = useState("CASH");
  const [preReference, setPreReference] = useState("");
  const [preNote, setPreNote] = useState("");
  const [preSaving, setPreSaving] = useState(false);
  const [preCustomerSuggestions, setPreCustomerSuggestions] = useState<CustomerSuggestion[]>([]);

  const [pickupConfirmOpen, setPickupConfirmOpen] = useState(false);
  const [pickupTarget, setPickupTarget] = useState<StoreOrderRow | null>(null);
  const [pickupSaving, setPickupSaving] = useState(false);

  const [pickupDoneOpen, setPickupDoneOpen] = useState(false);
  const [pickupReceiptSaleId, setPickupReceiptSaleId] = useState("");

  const [openSections, setOpenSections] = useState<Record<SectionKey, boolean>>({
    PENDING: true,
    READY: true,
    COMPLETED: false,
  });
  const [openCustomers, setOpenCustomers] = useState<Record<string, boolean>>({});

  const C: any = (theme as any)?.colors ?? {};
  const TEXT = C?.text ?? "#0F172A";
  const MUTED = C?.muted ?? "#64748B";
  const FAINT = C?.faint ?? "#94A3B8";
  const BORDER = C?.borderSoft ?? "#E5EAF1";
  const EMERALD = C?.emerald ?? "#10B981";

  const title = tab === "RESERVATIONS" ? "Reservations" : "Pre Orders";
  const dbType = tab === "RESERVATIONS" ? "RESERVATION" : "PRE_ORDER";

  const goPickProducts = useCallback(() => {
    if (!orgId || !storeId) {
      Alert.alert("Missing", "Organization au Store haijapatikana.");
      return;
    }

    router.push({
      pathname: "/(tabs)/sales",
      params: {
        orderMode: "1",
        orderType: dbType,
        orderOrgId: orgId,
        orderStoreId: storeId,
        orderStoreName: storeName,
      },
    } as any);
  }, [router, orgId, storeId, storeName, dbType]);
const loadOrders = useCallback(async () => {
    if (!storeId) return;

    setLoading(true);
    try {
      const { data, error } = await supabase.rpc("get_store_orders_v1", {
        p_org_id: orgId || null,
        p_store_id: storeId,
        p_order_type: dbType,
      });

      if (error) throw error;
      setRows(Array.isArray(data) ? (data as StoreOrderRow[]) : []);
    } catch (err: any) {
      Alert.alert("Failed", err?.message ?? "Imeshindikana kupakia store orders.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [orgId, storeId, dbType]);

  const openNewOrder = useCallback(() => {
    if (tab === "PRE_ORDERS") {
      setPreModalOpen(true);
      return;
    }

    goPickProducts();
  }, [tab, goPickProducts]);

  const closePreOrderModal = useCallback(() => {
    if (preSaving) return;
    setPreModalOpen(false);
    setPreCustomerSuggestions([]);
  }, [preSaving]);

  const onChangePreCustomerName = useCallback((v: string) => {
    setPreCustomerName(v);

    const q = v.trim().toLowerCase();
    if (q.length < 2) {
      setPreCustomerSuggestions([]);
      return;
    }

    const map = new Map<string, CustomerSuggestion>();

    for (const r of rows) {
      const name = String(r.customer_name ?? "").trim();
      const phone = String(r.customer_phone ?? "").trim();
      if (!name && !phone) continue;

      const hay = `${name} ${phone}`.toLowerCase();
      if (!hay.includes(q)) continue;

      const key = normalizePhone(phone) || name.toLowerCase();
      map.set(key, { key, name: name || "Customer", phone });
    }

    setPreCustomerSuggestions(Array.from(map.values()).slice(0, 6));
  }, [rows]);

  const choosePreCustomer = useCallback((c: CustomerSuggestion) => {
    setPreCustomerName(c.name);
    setPreCustomerPhone(c.phone);
    setPreCustomerSuggestions([]);
  }, []);

  const savePreOrder = useCallback(async () => {
    if (!orgId || !storeId) {
      Alert.alert("Missing", "Organization au Store haijapatikana.");
      return;
    }

    const name = preCustomerName.trim();
    const phone = preCustomerPhone.trim();
    const product = preProductName.trim();
    const total = Number(String(preTotalAmount || "0").replace(/[^\d]/g, ""));
    const paid = Number(String(prePaidAmount || "0").replace(/[^\d]/g, ""));

    if (!name) return Alert.alert("Missing", "Weka jina la mteja.");
    if (!phone) return Alert.alert("Missing", "Weka namba ya simu.");
    if (!product) return Alert.alert("Missing", "Andika bidhaa/design anayohitaji.");
    if (!Number.isFinite(total) || total <= 0) return Alert.alert("Invalid", "Weka makadirio ya bei.");
    if (!Number.isFinite(paid) || paid < 0) return Alert.alert("Invalid", "Paid amount si sahihi.");
    if (paid > total) return Alert.alert("Invalid", "Paid haiwezi kuzidi total.");

    const balance = Math.max(0, total - paid);
    const noteParts = [
      `PRE_ORDER_PAYMENT: METHOD=${prePaymentMethod || "CASH"} | PAID=${paid} | BALANCE=${balance}`,
      `REF: ${preReference.trim() || "-"}`,
      preNote.trim() ? `NOTE: ${preNote.trim()}` : "",
    ].filter(Boolean);

    setPreSaving(true);
    try {
      const { error } = await supabase.rpc("create_store_order_v1", {
        p_org_id: orgId,
        p_store_id: storeId,
        p_order_type: "PRE_ORDER",
        p_customer_name: name,
        p_customer_phone: phone,
        p_product_name: product,
        p_total_amount: total,
        p_paid_amount: paid,
        p_note: noteParts.join("\n"),
      });

      if (error) throw error;

      setPreCustomerName("");
      setPreCustomerPhone("");
      setPreProductName("");
      setPreTotalAmount("");
      setPrePaidAmount("");
      setPrePaymentMethod("CASH");
      setPreReference("");
      setPreNote("");
      setPreModalOpen(false);

      await loadOrders();
      Alert.alert("Success ✅", "Pre-order imehifadhiwa vizuri.");
    } catch (err: any) {
      Alert.alert("Failed", err?.message ?? "Imeshindikana kuhifadhi pre-order.");
    } finally {
      setPreSaving(false);
    }
  }, [
    orgId,
    storeId,
    preCustomerName,
    preCustomerPhone,
    preProductName,
    preTotalAmount,
    prePaidAmount,
    prePaymentMethod,
    preReference,
    preNote,
    loadOrders,
  ]);
  

  useFocusEffect(
    useCallback(() => {
      void loadOrders();
      const t = setTimeout(() => void loadOrders(), 600);
      return () => clearTimeout(t);
    }, [loadOrders])
  );

  const openAddPayment = useCallback((order: StoreOrderRow) => {
    if (isCompletedOrder(order)) {
      Alert.alert("Closed", "Order hii tayari imekamilishwa.");
      return;
    }

    setPayTarget(order);
    setPayAmount(String(Math.round(Number(order.balance_amount || 0))));
    setPayMethod("CASH");
    setPayReference("");
    setPayModalOpen(true);
  }, []);

  const closeAddPayment = useCallback(() => {
    if (paySaving) return;
    setPayModalOpen(false);
    setPayTarget(null);
    setPayAmount("");
    setPayMethod("CASH");
    setPayReference("");
  }, [paySaving]);

  const submitAddPayment = useCallback(async () => {
    if (!payTarget?.id) return;

    const amount = Number(String(payAmount || "0").replace(/[^\d]/g, ""));
    const balance = Number(payTarget.balance_amount || 0);

    if (!Number.isFinite(amount) || amount <= 0) {
      Alert.alert("Invalid", "Weka kiasi sahihi cha malipo.");
      return;
    }

    if (amount > balance) {
      Alert.alert("Invalid", "Malipo hayawezi kuzidi balance iliyobaki.");
      return;
    }

    setPaySaving(true);
    try {
      const { error } = await supabase.rpc("add_store_reserved_order_payment_v1", {
        p_order_id: payTarget.id,
        p_amount: amount,
        p_method: payMethod || "CASH",
        p_reference: payReference.trim() || null,
        p_note: null,
      });

      if (error) throw error;

      closeAddPayment();
      await loadOrders();
      Alert.alert("Success ✅", "Malipo yameongezwa vizuri.");
    } catch (err: any) {
      Alert.alert("Failed", err?.message ?? "Imeshindikana kuongeza malipo.");
    } finally {
      setPaySaving(false);
    }
  }, [payTarget, payAmount, payMethod, payReference, closeAddPayment, loadOrders]);

  const completePickup = useCallback((order: StoreOrderRow) => {
    if (!order?.id) return;

    if (isCompletedOrder(order)) {
      Alert.alert("Already Completed", "Pickup hii tayari imekamilishwa.");
      return;
    }

    if (Number(order.balance_amount || 0) > 0) {
      Alert.alert("Blocked", "Order bado ina balance. Ongeza malipo kwanza.");
      return;
    }

    setPickupTarget(order);
    setPickupConfirmOpen(true);
  }, []);

  const cancelPickupConfirm = useCallback(() => {
    if (pickupSaving) return;
    setPickupConfirmOpen(false);
    setPickupTarget(null);
  }, [pickupSaving]);

  const submitCompletePickup = useCallback(async () => {
    if (!pickupTarget?.id || pickupSaving) return;

    setPickupSaving(true);
    try {
      const { data, error } = await supabase.rpc("complete_store_reserved_order_pickup_v1", {
        p_order_id: pickupTarget.id,
        p_payment_method: "CASH",
        p_payment_channel: null,
        p_reference: null,
      });

      if (error) throw error;

      const row: any = Array.isArray(data) ? data[0] : data;
      const saleId = typeof row === "string" ? row : String(row?.sale_id ?? row?.id ?? "").trim();

      setPickupConfirmOpen(false);
      setPickupTarget(null);
      setPickupReceiptSaleId(saleId);
      setPickupDoneOpen(true);

      await loadOrders();
    } catch (err: any) {
      Alert.alert("Failed", err?.message ?? "Imeshindikana kukamilisha pickup.");
    } finally {
      setPickupSaving(false);
    }
  }, [pickupTarget, pickupSaving, loadOrders]);

  const openPickupReceipt = useCallback(() => {
    const saleId = pickupReceiptSaleId.trim();
    setPickupDoneOpen(false);

    if (saleId) {
      router.push({
        pathname: "/(tabs)/sales/receipt",
        params: { saleId },
      } as any);
    }
  }, [pickupReceiptSaleId, router]);

  const summary = useMemo(() => {
    return rows.reduce(
      (a, r) => {
        a.total += Number(r.total_amount || 0);
        a.paid += Number(r.paid_amount || 0);
        a.balance += Number(r.balance_amount || 0);
        return a;
      },
      { total: 0, paid: 0, balance: 0 }
    );
  }, [rows]);

  const pendingRows = rows.filter((r) => !isCompletedOrder(r) && Number(r.balance_amount || 0) > 0);
  const readyRows = rows.filter((r) => !isCompletedOrder(r) && Number(r.balance_amount || 0) <= 0);
  const completedRows = rows.filter((r) => isCompletedOrder(r));

  const makeCustomerFiles = useCallback((sourceRows: StoreOrderRow[]) => {
    const map = new Map<string, CustomerFile>();

    for (const r of sourceRows) {
      const phone = normalizePhone(r.customer_phone);
      const name = String(r.customer_name ?? "Customer").trim() || "Customer";
      const key = phone || name.toLowerCase();

      const existing =
        map.get(key) ??
        ({
          key,
          name,
          phone: phone || "—",
          orders: [],
          total: 0,
          paid: 0,
          balance: 0,
        } as CustomerFile);

      existing.orders.push(r);
      existing.total += Number(r.total_amount || 0);
      existing.paid += Number(r.paid_amount || 0);
      existing.balance += Number(r.balance_amount || 0);

      map.set(key, existing);
    }

    return Array.from(map.values()).sort((a, b) => b.orders.length - a.orders.length);
  }, []);

  const pendingFiles = useMemo(() => makeCustomerFiles(pendingRows), [makeCustomerFiles, pendingRows]);
  const readyFiles = useMemo(() => makeCustomerFiles(readyRows), [makeCustomerFiles, readyRows]);
  const completedFiles = useMemo(
    () => makeCustomerFiles(completedRows),
    [makeCustomerFiles, completedRows]
  );

  const renderOrderCompact = (r: StoreOrderRow, orderIndex: number) => {
    const parsed = parseOrderNote(r.note);
    const itemText = parsed.itemsText || r.product_name || "Order item";
    const paid = Number(r.paid_amount || 0);
    const bal = Number(r.balance_amount || 0);
    const total = Number(r.total_amount || 0);
    const completed = isCompletedOrder(r);
    const paidStatus = bal <= 0 && total > 0 ? "PAID" : paid > 0 ? "PARTIAL" : "UNPAID";

    return (
      <View
        key={r.id || String(orderIndex)}
        style={{
          borderWidth: 1,
          borderColor: BORDER,
          backgroundColor: "#F8FAFC",
          borderRadius: 14,
          padding: 10,
          gap: 6,
        }}
      >
        <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
          <Text style={{ color: TEXT, fontWeight: "900", flex: 1 }}>Order #{orderIndex + 1}</Text>
          <Text style={{ color: FAINT, fontWeight: "900", fontSize: 12 }}>
            {shortDate(r.created_at)}
          </Text>
        </View>

        <Text style={{ color: TEXT, fontWeight: "900", lineHeight: 19 }}>{itemText}</Text>

        <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
          <MiniPill label={money(total)} />
          <MiniPill label={`Paid ${money(paid)}`} tone="green" />
          <MiniPill label={`Bal ${money(bal)}`} tone={bal > 0 ? "amber" : "green"} />
        </View>

        <Text style={{ color: FAINT, fontWeight: "900", lineHeight: 18 }}>
          {completed ? "PICKED UP" : String(r.status || "ACTIVE").toUpperCase()} • {paidStatus}
        </Text>

        {parsed.paymentText ? (
          <Text style={{ color: MUTED, fontWeight: "800", lineHeight: 18 }}>
            Payment: {parsed.paymentText}
          </Text>
        ) : null}

        {parsed.discountText ? (
          <Text style={{ color: "#047857", fontWeight: "900", lineHeight: 18 }}>
            Discount: {parsed.discountText}
          </Text>
        ) : null}

        {parsed.cleanNote ? (
          <Text style={{ color: MUTED, fontWeight: "800", lineHeight: 18 }}>
            Note: {parsed.cleanNote}
          </Text>
        ) : null}

        {!completed ? (
          <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap", marginTop: 2 }}>
            {bal > 0 ? (
              <Pressable
                onPress={() => openAddPayment(r)}
                style={{
                  borderWidth: 1,
                  borderColor: "rgba(16,185,129,0.35)",
                  backgroundColor: "rgba(16,185,129,0.10)",
                  borderRadius: 999,
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                }}
              >
                <Text style={{ color: EMERALD, fontWeight: "900" }}>Add Payment</Text>
              </Pressable>
            ) : null}

            {tab === "RESERVATIONS" ? (
            <Pressable
              onPress={() => completePickup(r)}
              style={{
                borderWidth: 1,
                borderColor: "rgba(15,23,42,0.10)",
                backgroundColor: "#FFFFFF",
                borderRadius: 999,
                paddingHorizontal: 12,
                paddingVertical: 8,
              }}
            >
              <Text style={{ color: TEXT, fontWeight: "900" }}>Complete Pickup</Text>
            </Pressable>
            ) : null}
          </View>
        ) : null}
      </View>
    );
  };

  const renderSection = (
    sectionKey: SectionKey,
    heading: string,
    subtitle: string,
    files: CustomerFile[],
    tone: "amber" | "green" | "blue"
  ) => {
    const open = openSections[sectionKey];

    const totals = files.reduce(
      (a, f) => {
        a.orders += f.orders.length;
        a.total += f.total;
        a.paid += f.paid;
        a.balance += f.balance;
        return a;
      },
      { orders: 0, total: 0, paid: 0, balance: 0 }
    );

    return (
      <Card style={{ backgroundColor: "#FFFFFF", borderColor: BORDER, gap: 10 }}>
        <Pressable
          onPress={() => setOpenSections((p) => ({ ...p, [sectionKey]: !p[sectionKey] }))}
          style={{ gap: 8 }}
        >
          <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 10 }}>
            <Text style={{ color: TEXT, fontWeight: "900", fontSize: 19, flex: 1 }}>{heading}</Text>
            <Text style={{ color: FAINT, fontWeight: "900", fontSize: 20 }}>{open ? "▲" : "▼"}</Text>
          </View>

          <Text style={{ color: MUTED, fontWeight: "800", lineHeight: 19 }}>{subtitle}</Text>

          <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
            <MiniPill label={`${totals.orders} Orders`} tone={tone} />
            <MiniPill label={`Paid ${money(totals.paid)}`} tone="green" />
            <MiniPill label={`Bal ${money(totals.balance)}`} tone={totals.balance > 0 ? "amber" : "green"} />
          </View>
        </Pressable>

        {open ? (
          <View style={{ gap: 10 }}>
            {files.length === 0 ? (
              <View
                style={{
                  borderWidth: 1,
                  borderColor: BORDER,
                  backgroundColor: "#F8FAFC",
                  borderRadius: 14,
                  padding: 12,
                }}
              >
                <Text style={{ color: MUTED, fontWeight: "800" }}>Hakuna taarifa kwenye sehemu hii.</Text>
              </View>
            ) : (
              files.map((file, index) => {
                const customerKey = `${sectionKey}:${file.key}`;
                const customerOpen = openCustomers[customerKey] ?? false;

                return (
                  <View
                    key={customerKey}
                    style={{
                      borderWidth: 1,
                      borderColor: BORDER,
                      backgroundColor: "#FFFFFF",
                      borderRadius: 16,
                      padding: 12,
                      gap: 8,
                    }}
                  >
                    <Pressable
                      onPress={() =>
                        setOpenCustomers((p) => ({ ...p, [customerKey]: !(p[customerKey] ?? false) }))
                      }
                      style={{ gap: 7 }}
                    >
                      <Text style={{ color: TEXT, fontWeight: "900", fontSize: 18 }}>
                        {index + 1}. {file.name}
                      </Text>
                      <Text style={{ color: MUTED, fontWeight: "900" }}>Phone: {file.phone}</Text>

                      <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
                        <MiniPill label={`${file.orders.length} Orders`} tone={tone} />
                        <MiniPill label={`Total ${money(file.total)}`} />
                        <MiniPill label={`Bal ${money(file.balance)}`} tone={file.balance > 0 ? "amber" : "green"} />
                      </View>

                      <Text style={{ color: FAINT, fontWeight: "900" }}>
                        {customerOpen ? "Close customer file ▲" : "Open customer file ▼"}
                      </Text>
                    </Pressable>

                    {customerOpen ? (
                      <View style={{ gap: 8 }}>
                        {file.orders.map((r, i) => renderOrderCompact(r, i))}
                      </View>
                    ) : null}
                  </View>
                );
              })
            )}
          </View>
        ) : null}
      </Card>
    );
  };

  return (
    <Screen scroll contentStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 140 }}>
      <Modal visible={payModalOpen} transparent animationType="fade" onRequestClose={closeAddPayment}>
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.45)",
            justifyContent: "center",
            padding: 18,
          }}
        >
          <Card style={{ backgroundColor: "#FFFFFF", borderColor: BORDER, gap: 12 }}>
            <Text style={{ color: TEXT, fontWeight: "900", fontSize: 20 }}>Add Payment</Text>

            <Text style={{ color: MUTED, fontWeight: "800" }}>
              Balance: {money(payTarget?.balance_amount)}
            </Text>

            <TextInput
              value={payAmount}
              onChangeText={(v) => setPayAmount(v.replace(/[^\d]/g, ""))}
              placeholder="Amount"
              placeholderTextColor={FAINT}
              keyboardType="numeric"
              style={{
                borderWidth: 1,
                borderColor: BORDER,
                borderRadius: 16,
                padding: 12,
                fontWeight: "900",
                color: TEXT,
              }}
            />

            <TextInput
              value={payMethod}
              onChangeText={setPayMethod}
              placeholder="Method: CASH / MOBILE / BANK"
              placeholderTextColor={FAINT}
              style={{
                borderWidth: 1,
                borderColor: BORDER,
                borderRadius: 16,
                padding: 12,
                fontWeight: "900",
                color: TEXT,
              }}
            />

            <TextInput
              value={payReference}
              onChangeText={setPayReference}
              placeholder="Reference optional"
              placeholderTextColor={FAINT}
              style={{
                borderWidth: 1,
                borderColor: BORDER,
                borderRadius: 16,
                padding: 12,
                fontWeight: "900",
                color: TEXT,
              }}
            />

            <Pressable
              onPress={paySaving ? undefined : submitAddPayment}
              style={{
                backgroundColor: paySaving ? "#94A3B8" : EMERALD,
                borderRadius: 18,
                paddingVertical: 14,
                alignItems: "center",
              }}
            >
              <Text style={{ color: "#FFFFFF", fontWeight: "900" }}>
                {paySaving ? "Saving..." : "Save Payment"}
              </Text>
            </Pressable>

            <Pressable
              onPress={closeAddPayment}
              style={{
                borderWidth: 1,
                borderColor: BORDER,
                borderRadius: 18,
                paddingVertical: 14,
                alignItems: "center",
              }}
            >
              <Text style={{ color: TEXT, fontWeight: "900" }}>Cancel</Text>
            </Pressable>
          </Card>
        </View>
      </Modal>
<Modal visible={preModalOpen} transparent animationType="fade" onRequestClose={closePreOrderModal}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "center", padding: 18 }}>
          <Card style={{ backgroundColor: "#FFFFFF", borderColor: BORDER, gap: 10 }}>
            <Text style={{ color: TEXT, fontWeight: "900", fontSize: 20 }}>New Pre Order</Text>
            <Text style={{ color: MUTED, fontWeight: "800" }}>
              Hii ni kwa mzigo ambao bado haupo dukani. Haitapunguza stock wala kufungua checkout.
            </Text>

            <TextInput value={preCustomerName} onChangeText={onChangePreCustomerName} placeholder="Customer name" placeholderTextColor={FAINT} style={{ borderWidth: 1, borderColor: BORDER, borderRadius: 16, padding: 12, fontWeight: "900", color: TEXT }} />

{preCustomerSuggestions.length > 0 ? (
  <View style={{ borderWidth: 1, borderColor: BORDER, borderRadius: 16, overflow: "hidden" }}>
    {preCustomerSuggestions.map((c) => (
      <Pressable
        key={c.key}
        onPress={() => choosePreCustomer(c)}
        style={{
          paddingHorizontal: 12,
          paddingVertical: 10,
          backgroundColor: "#F8FAFC",
          borderBottomWidth: 1,
          borderBottomColor: BORDER,
        }}
      >
        <Text style={{ color: TEXT, fontWeight: "900" }}>{c.name}</Text>
        <Text style={{ color: MUTED, fontWeight: "800", marginTop: 2 }}>{c.phone || "No phone"}</Text>
      </Pressable>
    ))}
  </View>
) : null}
            <TextInput value={preCustomerPhone} onChangeText={setPreCustomerPhone} placeholder="Phone number" placeholderTextColor={FAINT} keyboardType="phone-pad" style={{ borderWidth: 1, borderColor: BORDER, borderRadius: 16, padding: 12, fontWeight: "900", color: TEXT }} />
            <TextInput value={preProductName} onChangeText={setPreProductName} placeholder="Bidhaa / design anayohitaji" placeholderTextColor={FAINT} style={{ borderWidth: 1, borderColor: BORDER, borderRadius: 16, padding: 12, fontWeight: "900", color: TEXT }} />

            <View style={{ flexDirection: "row", gap: 8 }}>
              <TextInput value={preTotalAmount} onChangeText={(v) => setPreTotalAmount(v.replace(/[^\d]/g, ""))} placeholder="Estimated total" placeholderTextColor={FAINT} keyboardType="numeric" style={{ flex: 1, borderWidth: 1, borderColor: BORDER, borderRadius: 16, padding: 12, fontWeight: "900", color: TEXT }} />
              <TextInput value={prePaidAmount} onChangeText={(v) => setPrePaidAmount(v.replace(/[^\d]/g, ""))} placeholder="Paid" placeholderTextColor={FAINT} keyboardType="numeric" style={{ flex: 1, borderWidth: 1, borderColor: BORDER, borderRadius: 16, padding: 12, fontWeight: "900", color: TEXT }} />
            </View>

            <TextInput value={prePaymentMethod} onChangeText={setPrePaymentMethod} placeholder="Method: CASH / MOBILE / BANK" placeholderTextColor={FAINT} style={{ borderWidth: 1, borderColor: BORDER, borderRadius: 16, padding: 12, fontWeight: "900", color: TEXT }} />
            <TextInput value={preReference} onChangeText={setPreReference} placeholder="Reference optional" placeholderTextColor={FAINT} style={{ borderWidth: 1, borderColor: BORDER, borderRadius: 16, padding: 12, fontWeight: "900", color: TEXT }} />
            <TextInput value={preNote} onChangeText={setPreNote} placeholder="Note optional" placeholderTextColor={FAINT} multiline style={{ borderWidth: 1, borderColor: BORDER, borderRadius: 16, padding: 12, fontWeight: "900", color: TEXT, minHeight: 70 }} />

            <Pressable onPress={preSaving ? undefined : savePreOrder} style={{ backgroundColor: preSaving ? "#94A3B8" : EMERALD, borderRadius: 18, paddingVertical: 14, alignItems: "center" }}>
              <Text style={{ color: "#FFFFFF", fontWeight: "900" }}>{preSaving ? "Saving..." : "Save Pre Order"}</Text>
            </Pressable>

            <Pressable onPress={closePreOrderModal} style={{ borderWidth: 1, borderColor: BORDER, borderRadius: 18, paddingVertical: 14, alignItems: "center" }}>
              <Text style={{ color: TEXT, fontWeight: "900" }}>Cancel</Text>
            </Pressable>
          </Card>
        </View>
      </Modal>
      <Modal visible={pickupConfirmOpen} transparent animationType="fade" onRequestClose={cancelPickupConfirm}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "center", padding: 18 }}>
          <Card style={{ backgroundColor: "#FFFFFF", borderColor: BORDER, gap: 12 }}>
            <Text style={{ color: TEXT, fontWeight: "900", fontSize: 20 }}>Complete Pickup</Text>
            <Text style={{ color: MUTED, fontWeight: "800", lineHeight: 20 }}>
              Una uhakika mteja amechukua mzigo huu? Mfumo utaunda sale na order itahamia Completed Pickups.
            </Text>

            <Pressable
              onPress={pickupSaving ? undefined : submitCompletePickup}
              style={{ backgroundColor: pickupSaving ? "#94A3B8" : EMERALD, borderRadius: 18, paddingVertical: 14, alignItems: "center" }}
            >
              <Text style={{ color: "#FFFFFF", fontWeight: "900" }}>
                {pickupSaving ? "Completing..." : "Complete Pickup"}
              </Text>
            </Pressable>

            <Pressable onPress={cancelPickupConfirm} style={{ borderWidth: 1, borderColor: BORDER, borderRadius: 18, paddingVertical: 14, alignItems: "center" }}>
              <Text style={{ color: TEXT, fontWeight: "900" }}>Cancel</Text>
            </Pressable>
          </Card>
        </View>
      </Modal>

      <Modal visible={pickupDoneOpen} transparent animationType="fade" onRequestClose={() => setPickupDoneOpen(false)}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "center", padding: 18 }}>
          <Card style={{ backgroundColor: "#FFFFFF", borderColor: BORDER, gap: 12 }}>
            <Text style={{ color: TEXT, fontWeight: "900", fontSize: 20 }}>Success ✅</Text>
            <Text style={{ color: MUTED, fontWeight: "800", lineHeight: 20 }}>
              Pickup imekamilishwa na sale imeundwa vizuri.
            </Text>

            <Pressable onPress={openPickupReceipt} style={{ backgroundColor: EMERALD, borderRadius: 18, paddingVertical: 14, alignItems: "center" }}>
              <Text style={{ color: "#FFFFFF", fontWeight: "900" }}>Open Receipt</Text>
            </Pressable>

            <Pressable onPress={() => setPickupDoneOpen(false)} style={{ borderWidth: 1, borderColor: BORDER, borderRadius: 18, paddingVertical: 14, alignItems: "center" }}>
              <Text style={{ color: TEXT, fontWeight: "900" }}>OK</Text>
            </Pressable>
          </Card>
        </View>
      </Modal>

      <View style={{ gap: 12 }}>
        <Pressable
          onPress={() => router.back()}
          style={{
            borderWidth: 1,
            borderColor: BORDER,
            backgroundColor: "#FFFFFF",
            borderRadius: 999,
            paddingHorizontal: 14,
            paddingVertical: 9,
            alignSelf: "flex-start",
          }}
        >
          <Text style={{ color: TEXT, fontWeight: "900" }}>← Back</Text>
        </Pressable>

        <Card style={{ gap: 12, backgroundColor: "#FFFFFF", borderColor: BORDER }}>
          <Text style={{ color: FAINT, fontWeight: "900", letterSpacing: 1, fontSize: 11 }}>
            STORE ORDERS
          </Text>

          <Text style={{ color: TEXT, fontWeight: "900", fontSize: 26 }}>{storeName}</Text>

          <Text style={{ color: MUTED, fontWeight: "800", lineHeight: 20 }}>
            Customer files zimepangwa kwa madeni, ready pickup, na completed pickups.
          </Text>

          <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
            {(["RESERVATIONS", "PRE_ORDERS"] as TabMode[]).map((t) => (
              <Pressable
                key={t}
                onPress={() => setTab(t)}
                style={{
                  borderWidth: 1,
                  borderColor: tab === t ? "rgba(16,185,129,0.35)" : BORDER,
                  backgroundColor: tab === t ? "rgba(16,185,129,0.12)" : "#F8FAFC",
                  borderRadius: 999,
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                }}
              >
                <Text style={{ color: tab === t ? EMERALD : TEXT, fontWeight: "900" }}>
                  {t === "RESERVATIONS" ? "Reservations" : "Pre Orders"}
                </Text>
              </Pressable>
            ))}
          </View>

          <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
            <MiniPill label={`${rows.length} Orders`} />
            <MiniPill label={`Paid ${money(summary.paid)}`} tone="green" />
            <MiniPill label={`Balance ${money(summary.balance)}`} tone="amber" />
          </View>
        </Card>

        <Pressable onPress={openNewOrder}>
          <Card
            style={{
              gap: 8,
              backgroundColor: "rgba(16,185,129,0.08)",
              borderColor: "rgba(16,185,129,0.32)",
            }}
          >
            <Text style={{ color: TEXT, fontWeight: "900", fontSize: 18 }}>
              + New {tab === "RESERVATIONS" ? "Reservation" : "Pre Order"}
            </Text>
            <Text style={{ color: TEXT, fontWeight: "900" }}>
              {tab === "PRE_ORDERS" ? "Save pre-order details →" : "Pick products from Sales →"}
            </Text>
            <Text style={{ color: MUTED, fontWeight: "800", lineHeight: 19 }}>
              {tab === "PRE_ORDERS"
                ? "Pre-order ni kwa mzigo ambao haupo dukani; haitagusa stock wala checkout."
                : "Bonyeza hapa kuanzisha reservation kupitia Checkout."}
            </Text>
          </Card>
        </Pressable>

        {loading ? (
          <Card style={{ backgroundColor: "#FFFFFF", borderColor: BORDER, alignItems: "center" }}>
            <ActivityIndicator />
            <Text style={{ color: MUTED, fontWeight: "800", marginTop: 8 }}>Loading...</Text>
          </Card>
        ) : rows.length === 0 ? (
          <Card style={{ backgroundColor: "#FFFFFF", borderColor: BORDER }}>
            <Text style={{ color: TEXT, fontWeight: "900", fontSize: 18 }}>{title}</Text>
            <Text style={{ color: MUTED, fontWeight: "800", marginTop: 8 }}>
              Hakuna {title.toLowerCase()} kwa store hii.
            </Text>
          </Card>
        ) : (
          <>
            {renderSection(
              "PENDING",
              "Pending Payments",
              "Wateja ambao bado hawajakamilisha malipo ya mzigo.",
              pendingFiles,
              "amber"
            )}

            {renderSection(
              "READY",
              "Ready for Pickup",
              "Wamelipa full, bado hawajachukua mzigo.",
              readyFiles,
              "blue"
            )}

            {renderSection(
              "COMPLETED",
              "Completed Pickups",
              "Wateja waliolipa na kuchukua mzigo. Fungua kuona history.",
              completedFiles,
              "green"
            )}
          </>
        )}
      </View>
    </Screen>
  );
}