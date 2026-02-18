// app/(tabs)/sales/history.tsx
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, Text, View } from "react-native";
import { useOrg } from "../../../src/context/OrgContext";
import { supabase } from "../../../src/supabase/supabaseClient";
import { Button } from "../../../src/ui/Button";
import { Card } from "../../../src/ui/Card";
import { Screen } from "../../../src/ui/Screen";
import { theme } from "../../../src/ui/theme";

type SaleRow = {
  sale_id?: string;
  id?: string;
  created_at?: string;
  total_items?: number;
  total_qty?: number;
  total_amount?: number;
  note?: string | null;
  payment_method?: string | null;
};

export default function SalesHistoryScreen() {
  const router = useRouter();
  const { activeOrgName, activeStoreId, activeStoreName, activeRole } = useOrg();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [rows, setRows] = useState<SaleRow[]>([]);

  const canView = useMemo(() => {
    const r = (activeRole ?? "staff") as "owner" | "admin" | "staff";
    return r === "owner" || r === "admin" || r === "staff";
  }, [activeRole]);

  const load = useCallback(
    async (mode: "boot" | "refresh") => {
      setErr(null);
      if (mode === "boot") setLoading(true);
      if (mode === "refresh") setRefreshing(true);

      try {
        if (!activeStoreId) throw new Error("No active store selected.");
        if (!canView) throw new Error("No permission.");

        const access = await supabase.rpc("ensure_my_store_access", {
          p_store_id: activeStoreId,
        });
        if (access.error) throw access.error;

        let res = await supabase.rpc("get_sales", { p_store_id: activeStoreId } as any);

        if (res.error) {
          res = await supabase.rpc("get_sales", {
            p_store_id: activeStoreId,
            p_limit: 50,
            p_offset: 0,
          } as any);
        }

        if (res.error) {
          res = await supabase.rpc("get_sales", {
            store_id: activeStoreId,
            p_limit: 50,
            p_offset: 0,
          } as any);
        }

        if (res.error) throw res.error;

        const list = (res.data ?? []) as SaleRow[];
        list.sort((a, b) => {
          const ta = a.created_at ? Date.parse(a.created_at) : 0;
          const tb = b.created_at ? Date.parse(b.created_at) : 0;
          return tb - ta;
        });

        setRows(list);
      } catch (e: any) {
        setErr(e?.message ?? "Failed to load sales");
      } finally {
        if (mode === "boot") setLoading(false);
        if (mode === "refresh") setRefreshing(false);
      }
    },
    [activeStoreId, canView]
  );

  useEffect(() => {
    void load("boot");
  }, [load]);

  const openReceipt = useCallback(
    (row: SaleRow) => {
      const saleId = (row.sale_id ?? row.id ?? "").trim();
      if (!saleId) return;
      router.push({
        pathname: "/(tabs)/sales/receipt",
        params: { saleId },
      });
    },
    [router]
  );

  return (
    <Screen bottomPad={140}>
      <View style={{ flex: 1, gap: 14 }}>
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
            <Text style={{ fontSize: 26, fontWeight: "900", color: theme.colors.text }}>
              History
            </Text>
            <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>
              {activeOrgName ?? "—"} • {activeStoreName ?? "No store"} • {activeRole ?? "—"}
            </Text>
          </View>
        </View>

        <Card style={{ gap: 10 }}>
          <Button
            title={refreshing ? "Refreshing..." : "Refresh"}
            onPress={() => load("refresh")}
            disabled={refreshing}
            variant="primary"
          />
          {err && <Text style={{ color: theme.colors.dangerText, fontWeight: "800" }}>{err}</Text>}
        </Card>

        {loading ? (
          <View style={{ paddingTop: 18, alignItems: "center" }}>
            <ActivityIndicator />
            <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>
              Loading sales...
            </Text>
          </View>
        ) : (
          <FlatList
            data={rows}
            keyExtractor={(item, idx) => String(item.sale_id ?? item.id ?? idx)}
            refreshing={refreshing}
            onRefresh={() => load("refresh")}
            contentContainerStyle={{ paddingBottom: 18 }}
            renderItem={({ item }) => {
              const saleId = (item.sale_id ?? item.id ?? "").trim();
              const when = item.created_at ? new Date(item.created_at).toLocaleString() : "—";

              return (
                <Pressable onPress={() => openReceipt(item)}>
                  <Card style={{ marginBottom: 12, gap: 8 }}>
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 10,
                      }}
                    >
                      <Text
                        style={{
                          color: theme.colors.text,
                          fontWeight: "900",
                          fontSize: 16,
                          flex: 1,
                        }}
                        numberOfLines={1}
                      >
                        Sale {saleId ? saleId.slice(0, 8) : "—"}
                      </Text>

                      <View
                        style={{
                          paddingHorizontal: 10,
                          paddingVertical: 6,
                          borderRadius: 999,
                          borderWidth: 1,
                          borderColor: "rgba(52,211,153,0.35)",
                          backgroundColor: "rgba(52,211,153,0.10)",
                        }}
                      >
                        <Text style={{ color: theme.colors.text, fontWeight: "900" }}>
                          {item.payment_method ?? "—"}
                        </Text>
                      </View>
                    </View>

                    <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>
                      When: {when}
                    </Text>

                    <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>
                      Items: {item.total_items ?? "—"} • Qty: {item.total_qty ?? "—"}
                      {typeof item.total_amount === "number" ? ` • Amount: ${item.total_amount}` : ""}
                    </Text>

                    {!!item.note && (
                      <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>
                        Note: {item.note}
                      </Text>
                    )}

                    <Text
                      style={{
                        color: theme.colors.muted,
                        fontWeight: "800",
                        textDecorationLine: "underline",
                        marginTop: 4,
                      }}
                    >
                      Open Receipt
                    </Text>
                  </Card>
                </Pressable>
              );
            }}
            ListEmptyComponent={
              <View style={{ paddingTop: 16, alignItems: "center" }}>
                <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>
                  No sales yet.
                </Text>
              </View>
            }
          />
        )}
      </View>
    </Screen>
  );
}