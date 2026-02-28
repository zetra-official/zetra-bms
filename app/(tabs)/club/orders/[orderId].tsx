import { supabase } from "@/src/supabase/supabaseClient";
import { Card } from "@/src/ui/Card";
import { Screen } from "@/src/ui/Screen";
import { theme } from "@/src/ui/theme";
import { formatMoney } from "@/src/ui/money";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type ItemRow = {
  id: string;
  order_id: string;
  product_id: string | null;
  product_name: string;
  unit_price: number;
  qty: number;
  line_total: number;
  created_at: string;
};

type OrderMeta = {
  status: string;
  currency: string;
  sale_id?: string | null;
  payment_status?: string | null;
  payment_method?: string | null;
  payment_ref?: string | null;
  paid_amount?: number | null;
};

function clean(x: any) {
  return String(x ?? "").trim();
}

function isUuid(v: string) {
  const s = clean(v);
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    s
  );
}

function toNum(v: any): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

const FINAL_STATUSES = new Set(["DELIVERED", "CANCELLED"]);

const PAYMENT_METHODS = [
  { key: "CASH", label: "Cash" },
  { key: "MOBILE_MONEY", label: "Simu (M-Pesa/TigoPesa/AirtelMoney)" },
  { key: "BANK", label: "Benki" },
] as const;

type PayMethod = (typeof PAYMENT_METHODS)[number]["key"];

export default function CustomerOrderDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    orderId?: string;
    storeId?: string;
    storeName?: string;
  }>();

  const orderId = clean(params?.orderId);
  const storeId = clean(params?.storeId);
  const storeName = clean(params?.storeName) || "Store";

  const topPad = Math.max(insets.top, 10) + 8;
  const orderIdIsValid = isUuid(orderId);

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [items, setItems] = useState<ItemRow[]>([]);
  const [meta, setMeta] = useState<OrderMeta>({
    status: "PENDING",
    currency: "TZS",
    sale_id: null,
    payment_status: null,
    payment_method: null,
    payment_ref: null,
    paid_amount: null,
  });

  const currency = meta.currency || "TZS";
  const status = clean(meta.status).toUpperCase() || "PENDING";
  const isLocked = FINAL_STATUSES.has(status);

  // ✅ showCurrency:false => no "TSh" / no "TZS"
  const fmt = useCallback(
    (amount: number) => formatMoney(amount, { currency, showCurrency: false }),
    [currency]
  );

  const subtotal = useMemo(
    () => items.reduce((s, it) => s + (Number(it.line_total) || 0), 0),
    [items]
  );

  const totalQty = useMemo(
    () => items.reduce((s, it) => s + (Number(it.qty) || 0), 0),
    [items]
  );

  // ✅ Confirm/payment UI state
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [payMethod, setPayMethod] = useState<PayMethod>("CASH");
  const [payRef, setPayRef] = useState("");
  const [paidAmount, setPaidAmount] = useState(""); // optional input

  const canConfirm = useMemo(() => {
    if (!orderIdIsValid) return false;
    if (loading) return false;
    if (confirmBusy) return false;
    if (isLocked) return false;
    if (clean(meta?.sale_id)) return false; // already converted
    return true;
  }, [confirmBusy, isLocked, loading, meta?.sale_id, orderIdIsValid]);

  const load = useCallback(async () => {
    setErr(null);
    setLoading(true);

    try {
      if (!orderId) throw new Error("Order missing");
      if (!orderIdIsValid) throw new Error(`Invalid order id: "${orderId}"`);

      const { data, error } = await supabase.rpc(
        "get_order_items",
        { p_order_id: orderId } as any
      );
      if (error) throw error;
      setItems((data ?? []) as ItemRow[]);

      const { data: o, error: oe } = await supabase
        .from("club_orders")
        .select(
          "status, currency, sale_id, payment_status, payment_method, payment_ref, paid_amount"
        )
        .eq("id", orderId)
        .maybeSingle();

      if (oe) throw oe;

      const nextMeta: OrderMeta = {
        status: String((o as any)?.status ?? "PENDING"),
        currency: String((o as any)?.currency ?? "TZS"),
        sale_id: (o as any)?.sale_id ?? null,
        payment_status: (o as any)?.payment_status ?? null,
        payment_method: (o as any)?.payment_method ?? null,
        payment_ref: (o as any)?.payment_ref ?? null,
        paid_amount: (o as any)?.paid_amount ?? null,
      };

      setMeta(nextMeta);

      // ✅ helpful: auto-fill method/ref if already present
      const pm = clean(nextMeta.payment_method).toUpperCase();
      if (pm === "CASH" || pm === "MOBILE_MONEY" || pm === "BANK") {
        setPayMethod(pm as PayMethod);
      }
      if (clean(nextMeta.payment_ref)) setPayRef(clean(nextMeta.payment_ref));
      if (nextMeta.paid_amount != null && Number.isFinite(Number(nextMeta.paid_amount))) {
        setPaidAmount(String(Math.round(Number(nextMeta.paid_amount))));
      }
    } catch (e: any) {
      setErr(e?.message ?? "Failed to load order");
      setItems([]);
      setMeta({
        status: "PENDING",
        currency: "TZS",
        sale_id: null,
        payment_status: null,
        payment_method: null,
        payment_ref: null,
        paid_amount: null,
      });
    } finally {
      setLoading(false);
    }
  }, [orderId, orderIdIsValid]);

  useEffect(() => {
    if (!orderId) {
      setLoading(false);
      setErr("Order missing");
      return;
    }
    if (!orderIdIsValid) {
      setLoading(false);
      setErr(`Invalid order id: "${orderId}"`);
      return;
    }
    void load();
  }, [load, orderId, orderIdIsValid]);

  const openReceiptBySaleId = useCallback(
    (saleId: string) => {
      const id = clean(saleId);
      if (!id) return;
      // ✅ This route EXISTS in your app: app/(tabs)/sales/receipt.tsx
      router.push({ pathname: "/(tabs)/sales/receipt", params: { saleId: id } } as any);
    },
    [router]
  );

  const confirmAndCreateSale = useCallback(async () => {
    if (!orderId) return;
    if (!canConfirm) return;

    setConfirmBusy(true);
    try {
      const amt = Number(String(paidAmount || "").trim());
      const paid = Number.isFinite(amt) && amt > 0 ? amt : null;

      // ✅ ONLY CHANGE: use v2 (stock reduce included)
      const { data, error } = await supabase.rpc(
        "club_confirm_order_and_create_sale_v2",
        {
          p_order_id: orderId,
          p_payment_method: payMethod,
          p_paid_amount: paid,
          p_payment_ref: clean(payRef) || null,
        } as any
      );

      if (error) throw error;

      const saleId = clean(data);

      Alert.alert("Order", "Imeconfirmiwa ✅ na imeingia kwenye SALES", [
        {
          text: "OPEN RECEIPT",
          onPress: () => {
            if (saleId) openReceiptBySaleId(saleId);
          },
        },
        { text: "OK" },
      ]);

      // ✅ refresh order meta after confirm
      void load();
    } catch (e: any) {
      Alert.alert("Confirm", e?.message ?? "Failed to confirm order");
    } finally {
      setConfirmBusy(false);
    }
  }, [canConfirm, load, openReceiptBySaleId, orderId, paidAmount, payMethod, payRef]);

  const renderItem = useCallback(
    ({ item }: { item: ItemRow }) => (
      <Card
        style={{
          padding: 12,
          backgroundColor: theme.colors.surface2,
          borderColor: theme.colors.borderSoft,
        }}
      >
        <Text style={{ color: theme.colors.text, fontWeight: "900" }}>
          {clean(item.product_name) || "Item"}
        </Text>

        <Text style={{ color: theme.colors.muted, fontWeight: "800", marginTop: 6 }}>
          Qty: {String(item.qty)} • Price: {fmt(Number(item.unit_price) || 0)}
        </Text>

        <Text style={{ color: theme.colors.text, fontWeight: "900", marginTop: 8 }}>
          Line total: {fmt(Number(item.line_total) || 0)}
        </Text>
      </Card>
    ),
    [fmt]
  );

  const saleIdFromMeta = clean(meta.sale_id);

  return (
    <Screen scroll={false} contentStyle={{ paddingTop: 0, paddingHorizontal: 0, paddingBottom: 0 }}>
      <FlatList
        data={items}
        keyExtractor={(x) => String(x.id)}
        renderItem={renderItem}
        contentContainerStyle={{
          paddingTop: topPad,
          paddingHorizontal: theme.spacing.page,
          paddingBottom: Math.max(insets.bottom, 10) + 18,
          gap: 10,
        }}
        ListHeaderComponent={
          <View style={{ gap: 12 }}>
            <Card>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <View
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 999,
                      borderWidth: 1,
                      borderColor: theme.colors.emeraldBorder,
                      backgroundColor: theme.colors.emeraldSoft,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Ionicons name="receipt-outline" size={18} color={theme.colors.emerald} />
                  </View>

                  <View>
                    <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 16 }}>Order Details</Text>

                    <Text style={{ color: theme.colors.faint, fontWeight: "900", fontSize: 12 }}>
                      Store: {storeName} • Order: {orderId ? orderId.slice(0, 8) + "…" : "—"}
                      {storeId ? ` • ${storeId.slice(0, 8)}…` : ""}
                    </Text>

                    {/* ✅ removed "Currency: ..." */}
                    <Text style={{ color: theme.colors.faint, fontWeight: "900", fontSize: 12, marginTop: 4 }}>
                      Status: {status}
                      {isLocked ? " • LOCKED" : ""}
                      {saleIdFromMeta ? " • SALE ✅" : ""}
                    </Text>
                  </View>
                </View>

                <Pressable
                  onPress={() => router.back()}
                  hitSlop={10}
                  style={({ pressed }) => [
                    {
                      paddingHorizontal: 12,
                      paddingVertical: 10,
                      borderRadius: 999,
                      borderWidth: 1,
                      borderColor: "rgba(255,255,255,0.12)",
                      backgroundColor: "rgba(255,255,255,0.06)",
                      opacity: pressed ? 0.92 : 1,
                    },
                  ]}
                >
                  <Text style={{ color: theme.colors.text, fontWeight: "900" }}>Back</Text>
                </Pressable>
              </View>
            </Card>

            {!!err && (
              <Card style={{ backgroundColor: theme.colors.dangerSoft, borderColor: theme.colors.dangerBorder }}>
                <Text style={{ color: theme.colors.dangerText, fontWeight: "900" }}>{err}</Text>
              </Card>
            )}

            <Card style={{ padding: 12, backgroundColor: theme.colors.surface2, borderColor: theme.colors.borderSoft }}>
              <Text style={{ color: theme.colors.faint, fontWeight: "900" }}>Summary</Text>
              <View style={{ marginTop: 8, gap: 6 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>Total qty</Text>
                  <Text style={{ color: theme.colors.text, fontWeight: "900" }}>{String(totalQty)}</Text>
                </View>

                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>Subtotal</Text>
                  <Text style={{ color: theme.colors.text, fontWeight: "900" }}>
                    {fmt(subtotal)}
                  </Text>
                </View>
              </View>
            </Card>

            {/* ✅ Confirm & Payment (Staff flow) */}
            <Card style={{ padding: 14, gap: 10 }}>
              <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 14 }}>
                Confirm & Payment
              </Text>

              <Text style={{ color: theme.colors.faint, fontWeight: "800", fontSize: 12, lineHeight: 16 }}>
                Ukiconfirm, order hii itaingia kwenye SALES na itaonekana kwenye reports kama mauzo ya kawaida.
              </Text>

              {saleIdFromMeta ? (
                <>
                  <View
                    style={{
                      paddingVertical: 10,
                      paddingHorizontal: 12,
                      borderRadius: 14,
                      borderWidth: 1,
                      borderColor: theme.colors.emeraldBorder,
                      backgroundColor: theme.colors.emeraldSoft,
                    }}
                  >
                    <Text style={{ color: theme.colors.text, fontWeight: "900" }}>
                      Tayari imeingia SALES ✅
                    </Text>
                    <Text style={{ color: theme.colors.faint, fontWeight: "900", marginTop: 6 }}>
                      Sale: {saleIdFromMeta.slice(0, 8)}…
                    </Text>
                  </View>

                  <Pressable
                    onPress={() => openReceiptBySaleId(saleIdFromMeta)}
                    hitSlop={10}
                    style={({ pressed }) => [
                      {
                        height: 48,
                        borderRadius: theme.radius.pill,
                        borderWidth: 1,
                        borderColor: theme.colors.emeraldBorder,
                        backgroundColor: theme.colors.emeraldSoft,
                        alignItems: "center",
                        justifyContent: "center",
                        flexDirection: "row",
                        gap: 10,
                        opacity: pressed ? 0.92 : 1,
                      },
                    ]}
                  >
                    <Ionicons name="document-text-outline" size={18} color={theme.colors.emerald} />
                    <Text style={{ color: theme.colors.text, fontWeight: "900" }}>OPEN RECEIPT</Text>
                  </Pressable>
                </>
              ) : (
                <>
                  <View style={{ gap: 8 }}>
                    {PAYMENT_METHODS.map((m) => (
                      <Pressable
                        key={m.key}
                        onPress={() => setPayMethod(m.key)}
                        style={{
                          paddingVertical: 10,
                          paddingHorizontal: 12,
                          borderRadius: 14,
                          borderWidth: 1,
                          borderColor:
                            m.key === payMethod ? theme.colors.emeraldBorder : "rgba(255,255,255,0.12)",
                          backgroundColor:
                            m.key === payMethod ? theme.colors.emeraldSoft : "rgba(255,255,255,0.06)",
                        }}
                      >
                        <Text style={{ color: theme.colors.text, fontWeight: "900" }}>{m.label}</Text>
                      </Pressable>
                    ))}
                  </View>

                  <TextInput
                    value={paidAmount}
                    onChangeText={setPaidAmount}
                    placeholder="Paid amount (optional, default = total)"
                    keyboardType="numeric"
                    placeholderTextColor={theme.colors.muted}
                    style={{
                      height: 44,
                      paddingHorizontal: 12,
                      borderRadius: 14,
                      borderWidth: 1,
                      borderColor: "rgba(255,255,255,0.12)",
                      backgroundColor: "rgba(255,255,255,0.06)",
                      color: theme.colors.text,
                      fontWeight: "800",
                    }}
                  />

                  <TextInput
                    value={payRef}
                    onChangeText={setPayRef}
                    placeholder="Reference (optional) e.g M-Pesa ref / Bank ref"
                    placeholderTextColor={theme.colors.muted}
                    style={{
                      height: 44,
                      paddingHorizontal: 12,
                      borderRadius: 14,
                      borderWidth: 1,
                      borderColor: "rgba(255,255,255,0.12)",
                      backgroundColor: "rgba(255,255,255,0.06)",
                      color: theme.colors.text,
                      fontWeight: "800",
                    }}
                  />

                  <Pressable
                    onPress={() => {
                      if (!canConfirm) return;

                      Alert.alert(
                        "Confirm Order",
                        `Confirm hii order ianze kuhesabiwa kama SALE?\n\nMethod: ${payMethod}\nPaid: ${
                          clean(paidAmount) ? fmt(toNum(paidAmount)) : "(default = total)"
                        }\nRef: ${clean(payRef) || "—"}`,
                        [
                          { text: "Cancel", style: "cancel" },
                          { text: "CONFIRM", onPress: confirmAndCreateSale },
                        ]
                      );
                    }}
                    disabled={!canConfirm}
                    style={({ pressed }) => [
                      {
                        height: 48,
                        borderRadius: theme.radius.pill,
                        borderWidth: 1,
                        borderColor: theme.colors.emeraldBorder,
                        backgroundColor: theme.colors.emeraldSoft,
                        alignItems: "center",
                        justifyContent: "center",
                        flexDirection: "row",
                        gap: 10,
                        opacity: !canConfirm ? 0.55 : confirmBusy ? 0.75 : pressed ? 0.92 : 1,
                      },
                    ]}
                  >
                    <Ionicons name="checkmark-circle-outline" size={18} color={theme.colors.emerald} />
                    <Text style={{ color: theme.colors.text, fontWeight: "900" }}>
                      {confirmBusy ? "Confirming..." : "CONFIRM → CREATE SALE"}
                    </Text>
                  </Pressable>

                  <Text style={{ color: theme.colors.faint, fontWeight: "800", fontSize: 12, lineHeight: 16 }}>
                    NOTE: Kama order ina item yoyote bila product_id, DB itazuia confirm (usalama).
                  </Text>
                </>
              )}
            </Card>

            <Card style={{ padding: 12 }}>
              <Text style={{ color: theme.colors.text, fontWeight: "900" }}>Status</Text>
              <Text style={{ color: theme.colors.muted, fontWeight: "800", marginTop: 6 }}>
                Hii ni taarifa ya order. Staff wa store ndio watathibitisha, kuandaa, na ku-deliver.
              </Text>

              <Pressable
                onPress={load}
                hitSlop={10}
                disabled={!orderIdIsValid}
                style={({ pressed }) => [
                  {
                    marginTop: 12,
                    height: 44,
                    borderRadius: theme.radius.pill,
                    borderWidth: 1,
                    borderColor: theme.colors.emeraldBorder,
                    backgroundColor: theme.colors.emeraldSoft,
                    alignItems: "center",
                    justifyContent: "center",
                    opacity: !orderIdIsValid ? 0.55 : pressed ? 0.92 : 1,
                  },
                ]}
              >
                <Text style={{ color: theme.colors.text, fontWeight: "900" }}>Refresh status</Text>
              </Pressable>

              {loading && (
                <View style={{ paddingTop: 12, alignItems: "center" }}>
                  <ActivityIndicator />
                  <Text style={{ color: theme.colors.muted, fontWeight: "800", marginTop: 8 }}>
                    Loading...
                  </Text>
                </View>
              )}
            </Card>
          </View>
        }
        ListEmptyComponent={
          loading ? null : (
            <Card style={{ padding: 14 }}>
              <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 16 }}>No item-lines</Text>
              <Text style={{ color: theme.colors.muted, fontWeight: "800", marginTop: 6 }}>
                Hii order haina item-lines.
              </Text>

              <Pressable
                onPress={load}
                hitSlop={10}
                disabled={!orderIdIsValid}
                style={({ pressed }) => [
                  {
                    marginTop: 12,
                    height: 44,
                    borderRadius: theme.radius.pill,
                    borderWidth: 1,
                    borderColor: theme.colors.emeraldBorder,
                    backgroundColor: theme.colors.emeraldSoft,
                    alignItems: "center",
                    justifyContent: "center",
                    opacity: !orderIdIsValid ? 0.55 : pressed ? 0.92 : 1,
                  },
                ]}
              >
                <Text style={{ color: theme.colors.text, fontWeight: "900" }}>Reload</Text>
              </Pressable>
            </Card>
          )
        }
        showsVerticalScrollIndicator={false}
      />
    </Screen>
  );
}