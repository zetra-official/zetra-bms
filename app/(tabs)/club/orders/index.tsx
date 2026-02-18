import { supabase } from "@/src/supabase/supabaseClient";
import { Card } from "@/src/ui/Card";
import { Screen } from "@/src/ui/Screen";
import { theme } from "@/src/ui/theme";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type OrderRow = {
  id: string;
  store_id: string;
  created_at: string | null;
  status?: string | null;

  customer_name?: string | null;
  phone?: string | null;

  total_amount?: number | null;
  total_qty?: number | null;

  note?: string | null;
  sale_id?: string | null;
};

function clean(x: any) {
  return String(x ?? "").trim();
}
function safeStr(x: any, fallback = "—") {
  const s = clean(x);
  return s.length ? s : fallback;
}
function safeNum(x: any, fallback = 0) {
  const n = Number(x);
  return Number.isFinite(n) ? n : fallback;
}

const ORDERS_RPC_CANDIDATES = [
  "get_store_orders",
  "get_store_club_orders",
  "get_club_orders_for_store",
  "get_orders_for_store",
] as const;

export default function ClubOrdersListScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const topPad = Math.max(insets.top, 10) + 8;

  const params = useLocalSearchParams<{ storeId?: string; storeName?: string }>();
  const storeId = clean(params?.storeId);
  const storeName = clean(params?.storeName);

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [rpcUsed, setRpcUsed] = useState<string | null>(null);

  const callFirstWorkingOrdersRpc = useCallback(async () => {
    let lastErr: any = null;

    for (const fn of ORDERS_RPC_CANDIDATES) {
      const { data, error } = await supabase.rpc(fn as any, { p_store_id: storeId });
      if (!error) {
        setRpcUsed(String(fn));
        return (data ?? []) as OrderRow[];
      }

      lastErr = error;
      const msg = String(error.message ?? "").toLowerCase();
      const missing =
        msg.includes("does not exist") ||
        msg.includes("function") ||
        msg.includes("rpc");

      if (!missing) break; // kama si "missing function", tusisimame hapa (real error)
    }

    throw lastErr ?? new Error("Orders RPC missing");
  }, [storeId]);

  const load = useCallback(async () => {
    setErr(null);
    setLoading(true);

    try {
      if (!storeId) throw new Error("Store missing");

      // 1) Jaribu RPC (salama + consistent)
      try {
        const list = await callFirstWorkingOrdersRpc();
        setOrders(list);
        return;
      } catch (e: any) {
        // 2) Fallback: direct select (kama RLS inaruhusu)
        const { data, error } = await supabase
          .from("club_orders")
          .select(
            "id,store_id,created_at,status,customer_name,phone,total_amount,total_qty,note,sale_id"
          )
          .eq("store_id", storeId)
          .order("created_at", { ascending: false })
          .limit(200);

        if (error) throw e; // rudisha error ya RPC (ndiyo chanzo)
        setRpcUsed("table:club_orders");
        setOrders((data ?? []) as any);
      }
    } catch (e: any) {
      setOrders([]);
      setErr(e?.message ?? "Failed to load orders");
    } finally {
      setLoading(false);
    }
  }, [callFirstWorkingOrdersRpc, storeId]);

  useEffect(() => {
    void load();
  }, [load]);

  const openCreate = useCallback(() => {
    if (!storeId) return;
    router.push({
      pathname: "/(tabs)/club/orders/create" as any,
      params: { storeId, storeName },
    } as any);
  }, [router, storeId, storeName]);

  const openOrder = useCallback(
    (o: OrderRow) => {
      const orderId = clean(o.id);
      if (!orderId) return;
      router.push({
        pathname: "/(tabs)/club/orders/[orderId]" as any,
        params: { orderId, storeId, storeName },
      } as any);
    },
    [router, storeId, storeName]
  );

  const subtitle = useMemo(() => {
    if (storeName) return `Store: ${storeName}`;
    if (storeId) return `Store: ${storeId.slice(0, 8)}…`;
    return "Chagua store kwanza";
  }, [storeId, storeName]);

  const stats = useMemo(() => {
    let total = orders.length;
    let newCount = 0;
    let confirmed = 0;
    for (const o of orders) {
      const st = clean(o.status).toUpperCase();
      if (!st || st === "NEW") newCount++;
      if (st === "CONFIRMED") confirmed++;
    }
    return { total, newCount, confirmed };
  }, [orders]);

  const Header = useMemo(() => {
    return (
      <View style={{ paddingTop: topPad, paddingBottom: 12, gap: 12 }}>
        <Card style={{ padding: 14 }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
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
                <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 16 }}>
                  Orders
                </Text>
                <Text style={{ color: theme.colors.faint, fontWeight: "900", fontSize: 12 }} numberOfLines={1}>
                  {subtitle}
                </Text>
              </View>
            </View>

            <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
              <Pressable
                onPress={() => void load()}
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
                <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 12 }}>Refresh</Text>
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

          {!!rpcUsed && (
            <Text style={{ color: theme.colors.faint, fontWeight: "800", fontSize: 11, marginTop: 10 }}>
              Orders source: {rpcUsed}
            </Text>
          )}
        </Card>

        <Card style={{ padding: 14, gap: 10 }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Text style={{ color: theme.colors.text, fontWeight: "900" }}>
              Summary
            </Text>

            <View style={{ flexDirection: "row", gap: 8 }}>
              <View
                style={{
                  paddingHorizontal: 10,
                  height: 26,
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.12)",
                  backgroundColor: "rgba(255,255,255,0.06)",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 12 }}>
                  Total {stats.total}
                </Text>
              </View>

              <View
                style={{
                  paddingHorizontal: 10,
                  height: 26,
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: theme.colors.emeraldBorder,
                  backgroundColor: theme.colors.emeraldSoft,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 12 }}>
                  NEW {stats.newCount}
                </Text>
              </View>
            </View>
          </View>

          <Pressable
            onPress={openCreate}
            hitSlop={10}
            disabled={!storeId}
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
                opacity: !storeId ? 0.6 : pressed ? 0.92 : 1,
              },
            ]}
          >
            <Ionicons name="add-circle-outline" size={18} color={theme.colors.emerald} />
            <Text style={{ color: theme.colors.text, fontWeight: "900" }}>Create Order</Text>
          </Pressable>

          {!!err && (
            <Card style={{ padding: 12, borderColor: theme.colors.dangerBorder, backgroundColor: theme.colors.dangerSoft }}>
              <Text style={{ color: theme.colors.dangerText, fontWeight: "900" }}>{err}</Text>
            </Card>
          )}
        </Card>

        <Text style={{ color: theme.colors.faint, fontWeight: "900", paddingHorizontal: 2 }}>
          Recent Orders
        </Text>
      </View>
    );
  }, [err, load, openCreate, rpcUsed, router, stats, storeId, subtitle, topPad]);

  const renderItem = useCallback(
    ({ item }: { item: OrderRow }) => {
      const name = safeStr(item.customer_name, "Customer");
      const phone = safeStr(item.phone, "—");
      const status = safeStr(item.status, "NEW").toUpperCase();
      const amount = safeNum(item.total_amount, 0);
      const qty = safeNum(item.total_qty, 0);

      const isConfirmed = status === "CONFIRMED";
      const statusBorder = isConfirmed ? theme.colors.emeraldBorder : "rgba(255,255,255,0.12)";
      const statusBg = isConfirmed ? theme.colors.emeraldSoft : "rgba(255,255,255,0.06)";

      return (
        <Pressable
          onPress={() => openOrder(item)}
          hitSlop={10}
          style={({ pressed }) => [{ opacity: pressed ? 0.92 : 1, marginBottom: 12 }]}
        >
          <Card style={{ padding: 12 }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }}>
                <View
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: theme.colors.emeraldBorder,
                    backgroundColor: theme.colors.emeraldSoft,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Ionicons name="person-outline" size={16} color={theme.colors.emerald} />
                </View>

                <View style={{ flex: 1 }}>
                  <Text style={{ color: theme.colors.text, fontWeight: "900" }} numberOfLines={1}>
                    {name}
                  </Text>
                  <Text style={{ color: theme.colors.muted, fontWeight: "800", marginTop: 4 }} numberOfLines={1}>
                    {phone} • Qty {qty} • TSh {Math.round(amount).toLocaleString("en-TZ")}
                  </Text>
                </View>
              </View>

              <View style={{ alignItems: "flex-end", gap: 8 }}>
                <View
                  style={{
                    paddingHorizontal: 10,
                    height: 26,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: statusBorder,
                    backgroundColor: statusBg,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 12 }}>
                    {status}
                  </Text>
                </View>

                <Ionicons name="chevron-forward" size={18} color={theme.colors.faint} />
              </View>
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
        data={orders}
        keyExtractor={(x) => String(x.id)}
        renderItem={renderItem}
        ListHeaderComponent={Header}
        contentContainerStyle={{
          paddingHorizontal: theme.spacing.page,
          paddingBottom: Math.max(insets.bottom, 10) + 110,
        }}
        ListEmptyComponent={
          loading ? (
            <View style={{ paddingVertical: 18, alignItems: "center" }}>
              <ActivityIndicator />
              <Text style={{ color: theme.colors.muted, fontWeight: "800", marginTop: 10 }}>
                Loading orders...
              </Text>
            </View>
          ) : (
            <Card style={{ padding: 14 }}>
              <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 16 }}>No orders</Text>
              <Text style={{ color: theme.colors.muted, fontWeight: "800", marginTop: 6 }}>
                Hakuna order bado. Customer aki-order, itaonekana hapa.
              </Text>
            </Card>
          )
        }
        showsVerticalScrollIndicator={false}
      />
    </Screen>
  );
}