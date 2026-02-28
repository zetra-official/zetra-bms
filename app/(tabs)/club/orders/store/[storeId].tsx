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

function clean(x: any) {
  return String(x ?? "").trim();
}

function isUuid(v: string) {
  const s = clean(v);
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
}

type OrderRowAny = Record<string, any>;

type OrderRow = {
  id: string;
  store_id: string;
  created_at: string | null;

  status?: string | null;
  currency?: string | null;

  customer_name?: string | null;
  customer_phone?: string | null;

  total_amount?: number | null;
  paid_amount?: number | null;

  sale_id?: string | null;
  payment_status?: string | null;
  payment_method?: string | null;
};

function normalizeOrderRow(r: OrderRowAny): OrderRow {
  const id = String(r.id ?? r.order_id ?? r.orderId ?? "");
  const store_id = String(r.store_id ?? r.storeId ?? "");
  const created_at =
    (r.created_at ?? r.inserted_at ?? r.createdAt ?? null) != null
      ? String(r.created_at ?? r.inserted_at ?? r.createdAt)
      : null;

  const status = r.status != null ? String(r.status) : null;
  const currency = r.currency != null ? String(r.currency) : null;

  const customer_name =
    (r.customer_name ?? r.customer_full_name ?? r.full_name ?? r.name ?? null) != null
      ? String(r.customer_name ?? r.customer_full_name ?? r.full_name ?? r.name)
      : null;

  const customer_phone =
    (r.customer_phone ?? r.phone ?? r.mobile ?? null) != null
      ? String(r.customer_phone ?? r.phone ?? r.mobile)
      : null;

  const total_amount = r.total_amount ?? r.total ?? r.amount ?? null;
  const paid_amount = r.paid_amount ?? r.paid ?? null;

  const sale_id = (r.sale_id ?? r.saleId ?? null) != null ? String(r.sale_id ?? r.saleId) : null;
  const payment_status =
    (r.payment_status ?? r.pay_status ?? null) != null
      ? String(r.payment_status ?? r.pay_status)
      : null;
  const payment_method =
    (r.payment_method ?? r.pay_method ?? null) != null
      ? String(r.payment_method ?? r.pay_method)
      : null;

  return {
    id,
    store_id,
    created_at,
    status,
    currency,
    customer_name,
    customer_phone,
    total_amount: total_amount == null ? null : Number(total_amount),
    paid_amount: paid_amount == null ? null : Number(paid_amount),
    sale_id,
    payment_status,
    payment_method,
  };
}

function safeDateLabel(iso: string | null | undefined) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return String(iso);
  }
}

export default function ClubOrdersByStoreScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const topPad = Math.max(insets.top, 10) + 8;

  const params = useLocalSearchParams<{ storeId?: string; storeName?: string }>();
  const storeId = clean(params?.storeId);
  const storeName = clean(params?.storeName);

  const storeIdOk = isUuid(storeId);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [rows, setRows] = useState<OrderRow[]>([]);

  const load = useCallback(
    async (mode: "boot" | "refresh") => {
      setErr(null);
      if (mode === "boot") setLoading(true);
      if (mode === "refresh") setRefreshing(true);

      try {
        if (!storeId) throw new Error("Store missing");
        if (!storeIdOk) throw new Error(`Invalid storeId: "${storeId}"`);

        // ✅ Load orders for this store
        const res = await supabase
          .from("club_orders")
          .select(
            "id, store_id, created_at, status, currency, customer_name, customer_phone, total_amount, paid_amount, sale_id, payment_status, payment_method"
          )
          .eq("store_id", storeId)
          .order("created_at", { ascending: false })
          .limit(200);

        if (res.error) throw res.error;

        const list = (res.data ?? []).map(normalizeOrderRow);

        // Ensure we only keep rows with ids (safety)
        const cleanList = list.filter((x) => clean(x.id).length > 0);

        setRows(cleanList);
      } catch (e: any) {
        setRows([]);
        setErr(e?.message ?? "Failed to load orders");
      } finally {
        if (mode === "boot") setLoading(false);
        if (mode === "refresh") setRefreshing(false);
      }
    },
    [storeId, storeIdOk]
  );

  useEffect(() => {
    void load("boot");
  }, [load]);

  const subtitle = useMemo(() => {
    if (storeName) return `Store: ${storeName}`;
    if (storeId) return `Store: ${storeId.slice(0, 8)}…`;
    return "Chagua store kwanza";
  }, [storeId, storeName]);

  const openOrder = useCallback(
    (row: OrderRow) => {
      const orderId = clean(row.id);
      if (!orderId) return;

      router.push({
        pathname: "/(tabs)/club/orders/[orderId]" as any,
        params: {
          orderId,
          storeId,
          storeName: storeName || undefined,
        },
      } as any);
    },
    [router, storeId, storeName]
  );

  const goCreate = useCallback(() => {
    if (!storeIdOk) return;
    router.push({
      pathname: "/(tabs)/club/orders/create" as any,
      params: { storeId, storeName: storeName || undefined },
    } as any);
  }, [router, storeId, storeIdOk, storeName]);

  const Header = useMemo(() => {
    return (
      <View style={{ paddingTop: topPad, paddingBottom: 12, gap: 12 }}>
        <Card style={{ padding: 14 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1, minWidth: 0 }}>
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

              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 16 }}>Customer Orders</Text>
                <Text style={{ color: theme.colors.faint, fontWeight: "900", fontSize: 12 }} numberOfLines={1}>
                  {subtitle}
                </Text>
              </View>
            </View>

            <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
              <Pressable
                onPress={() => void load("refresh")}
                hitSlop={10}
                style={({ pressed }) => [
                  {
                    height: 38,
                    paddingHorizontal: 10,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: "rgba(255,255,255,0.12)",
                    backgroundColor: "rgba(255,255,255,0.06)",
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 6,
                    opacity: pressed ? 0.92 : 1,
                  },
                ]}
              >
                <Ionicons name="refresh" size={16} color={theme.colors.text} />
                <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 12 }}>
                  {refreshing ? "..." : "Refresh"}
                </Text>
              </Pressable>

              <Pressable
                onPress={() => router.back()}
                hitSlop={10}
                style={({ pressed }) => [
                  {
                    width: 38,
                    height: 38,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: "rgba(255,255,255,0.12)",
                    backgroundColor: "rgba(255,255,255,0.06)",
                    opacity: pressed ? 0.92 : 1,
                    alignItems: "center",
                    justifyContent: "center",
                  },
                ]}
              >
                <Ionicons name="chevron-back" size={18} color={theme.colors.text} />
              </Pressable>
            </View>
          </View>
        </Card>

        {!!err && (
          <Card style={{ padding: 12, borderColor: theme.colors.dangerBorder, backgroundColor: theme.colors.dangerSoft }}>
            <Text style={{ color: theme.colors.dangerText, fontWeight: "900" }}>{err}</Text>
          </Card>
        )}

        <Card style={{ padding: 14, gap: 10 }}>
          <Text style={{ color: theme.colors.text, fontWeight: "900" }}>Actions</Text>

          <Pressable
            onPress={goCreate}
            hitSlop={10}
            disabled={!storeIdOk}
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
                opacity: !storeIdOk ? 0.6 : pressed ? 0.92 : 1,
              },
            ]}
          >
            <Ionicons name="add-circle-outline" size={18} color={theme.colors.emerald} />
            <Text style={{ color: theme.colors.text, fontWeight: "900" }}>Create Order</Text>
          </Pressable>

          <Text style={{ color: theme.colors.faint, fontWeight: "800", fontSize: 12, lineHeight: 16 }}>
            TIP: Hapa ndipo utaona orders zote za wateja kwa store hii (tap kufungua).
          </Text>
        </Card>

        {loading && (
          <View style={{ paddingTop: 8, alignItems: "center" }}>
            <ActivityIndicator />
            <Text style={{ color: theme.colors.muted, fontWeight: "800", marginTop: 8 }}>Loading orders...</Text>
          </View>
        )}
      </View>
    );
  }, [err, goCreate, load, loading, refreshing, router, storeIdOk, subtitle, topPad]);

  const renderItem = useCallback(
    ({ item }: { item: OrderRow }) => {
      const id = clean(item.id);
      const status = clean(item.status).toUpperCase() || "PENDING";
      const currency = clean(item.currency) || "TZS";
      const when = safeDateLabel(item.created_at);

      const customerName = clean(item.customer_name) || "Customer";
      const customerPhone = clean(item.customer_phone);

      const total = Number(item.total_amount ?? 0) || 0;
      const paid = Number(item.paid_amount ?? 0) || 0;

      const hasSale = !!clean(item.sale_id);

      // ✅ showCurrency:false => numbers only
      const fmt = (n: number) => formatMoney(n, { currency, showCurrency: false });

      return (
        <Pressable onPress={() => openOrder(item)} hitSlop={10} style={({ pressed }) => [{ opacity: pressed ? 0.92 : 1 }]}>
          <Card style={{ marginBottom: 12, gap: 10 }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
              <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 16, flex: 1 }} numberOfLines={1}>
                Order {id ? id.slice(0, 8) : "—"}
              </Text>

              <View
                style={{
                  paddingHorizontal: 10,
                  paddingVertical: 6,
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: theme.colors.emeraldBorder,
                  backgroundColor: theme.colors.emeraldSoft,
                }}
              >
                <Text style={{ color: theme.colors.text, fontWeight: "900" }}>{status}</Text>
              </View>
            </View>

            <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>
              Customer: <Text style={{ color: theme.colors.text, fontWeight: "900" }}>{customerName}</Text>
              {customerPhone ? (
                <Text style={{ color: theme.colors.faint, fontWeight: "900" }}> • {customerPhone}</Text>
              ) : null}
            </Text>

            <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>
              When: <Text style={{ color: theme.colors.text }}>{when}</Text>
            </Text>

            <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 10 }}>
              <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>
                Total: <Text style={{ color: theme.colors.text, fontWeight: "900" }}>{fmt(total)}</Text>
              </Text>

              <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>
                Paid: <Text style={{ color: theme.colors.text, fontWeight: "900" }}>{fmt(paid)}</Text>
              </Text>
            </View>

            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={{ color: theme.colors.faint, fontWeight: "900" }}>
                {hasSale ? "Converted to Sale ✅" : "Not yet sale"}
              </Text>
              <Text style={{ color: theme.colors.muted, fontWeight: "800", textDecorationLine: "underline" }}>
                Open
              </Text>
            </View>
          </Card>
        </Pressable>
      );
    },
    [openOrder]
  );

  return (
    <Screen scroll={false} contentStyle={{ paddingTop: 0, paddingHorizontal: 0, paddingBottom: 0 }}>
      <FlatList
        data={loading ? [] : rows}
        keyExtractor={(x, idx) => String(x.id ?? idx)}
        renderItem={renderItem}
        ListHeaderComponent={Header}
        contentContainerStyle={{
          paddingHorizontal: theme.spacing.page,
          paddingBottom: Math.max(insets.bottom, 10) + 110,
        }}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          loading ? null : (
            <Card style={{ padding: 14 }}>
              <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 16 }}>No orders</Text>
              <Text style={{ color: theme.colors.muted, fontWeight: "800", marginTop: 6 }}>
                Hakuna orders bado kwa store hii.
              </Text>
            </Card>
          )
        }
      />
    </Screen>
  );
}