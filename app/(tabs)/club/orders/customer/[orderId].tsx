// app/(tabs)/club/orders/customer/[orderId].tsx
import { supabase } from "@/src/supabase/supabaseClient";
import { Card } from "@/src/ui/Card";
import { Screen } from "@/src/ui/Screen";
import { theme } from "@/src/ui/theme";
import { formatMoney } from "@/src/ui/money";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, Text, View } from "react-native";
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
};

function clean(x: any) {
  return String(x ?? "").trim();
}

function isUuid(v: string) {
  const s = clean(v);
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
}

export default function CustomerOrderDetailScreenLite() {
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
    status: "NEW",
    currency: "TZS",
    sale_id: null,
  });

  const currency = meta.currency || "TZS";
  const status = clean(meta.status).toUpperCase() || "NEW";
  const saleId = clean(meta.sale_id);

  // ✅ showCurrency:false => no "TSh" / no "TZS"
  const fmt = useCallback(
    (amount: number) => formatMoney(amount, { currency: clean(currency) || "TZS", showCurrency: false }),
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

  const load = useCallback(async () => {
    setErr(null);
    setLoading(true);
    try {
      if (!orderId) throw new Error("Order missing");
      if (!orderIdIsValid) throw new Error(`Invalid order id: "${orderId}"`);

      // Items (RPC)
      const { data, error } = await supabase.rpc("get_order_items", { p_order_id: orderId } as any);
      if (error) throw error;
      setItems((data ?? []) as ItemRow[]);

      // Meta (table)
      const { data: o, error: oe } = await supabase
        .from("club_orders")
        .select("status, currency, sale_id")
        .eq("id", orderId)
        .maybeSingle();

      if (oe) throw oe;

      setMeta({
        status: String((o as any)?.status ?? "NEW"),
        currency: String((o as any)?.currency ?? "TZS"),
        sale_id: (o as any)?.sale_id ?? null,
      });
    } catch (e: any) {
      setErr(e?.message ?? "Failed to load order");
      setItems([]);
      setMeta({ status: "NEW", currency: "TZS", sale_id: null });
    } finally {
      setLoading(false);
    }
  }, [orderId, orderIdIsValid]);

  useEffect(() => {
    void load();
  }, [load]);

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
                      {saleId ? " • SALE ✅" : ""}
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
                  <Text style={{ color: theme.colors.text, fontWeight: "900" }}>{fmt(subtotal)}</Text>
                </View>
              </View>
            </Card>

            <Card style={{ padding: 12 }}>
              <Text style={{ color: theme.colors.text, fontWeight: "900" }}>Status</Text>
              <Text style={{ color: theme.colors.muted, fontWeight: "800", marginTop: 6 }}>
                Hii order imetumwa kwa store. Staff wa store ndio watathibitisha, kuandaa, na ku-deliver.
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