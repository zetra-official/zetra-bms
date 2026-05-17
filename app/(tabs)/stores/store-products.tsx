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

import { useOrg } from "../../../src/context/OrgContext";
import { supabase } from "../../../src/supabase/supabaseClient";
import { Card } from "../../../src/ui/Card";
import { Screen } from "../../../src/ui/Screen";
import { theme } from "../../../src/ui/theme";

type StoreProductRow = {
  id: string;
  name: string;
  sku: string | null;
  qty: number;
  unit: string | null;
  isPrecision: boolean;
  packSize: number | null;
  baseUnit: string | null;
  packQty: number | null;
  baseUnitQty: number | null;
};

export default function StoreProductsScreen() {
  const router = useRouter();
  const { activeOrgId } = useOrg();
  const params = useLocalSearchParams<{ storeId?: string; storeName?: string }>();

  const storeId = String(params?.storeId ?? "").trim();
  const storeName = String(params?.storeName ?? "").trim();

  const C: any = (theme as any)?.colors ?? {};
  const col = (key: string, fallback: string) => {
    const v = C?.[key];
    return typeof v === "string" && v.trim() ? v : fallback;
  };

  const TEXT = col("text", "#111827");
const MUTED = col("muted", "#4B5563");
const FAINT = col("faint", "#8A94A6");
const BORDER_SOFT = col("borderSoft", "#E5EAF1");
  const EMERALD = col("emerald", "#34D399");

  const [rows, setRows] = useState<StoreProductRow[]>([]);
  const [restockCount, setRestockCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState("");

  const loadData = useCallback(async (mode: "initial" | "refresh" = "initial") => {
    if (!storeId) return;

    if (mode === "refresh") setRefreshing(true);
    else setLoading(true);

    try {
      const { data, error } = await supabase.rpc("get_store_inventory_v2", {
        p_store_id: storeId,
      });

      if (error) throw error;

      const mapped: StoreProductRow[] = (Array.isArray(data) ? data : [])
        .map((r: any, index: number) => {
          const rawId = r?.product_id ?? r?.id ?? `${storeId}-${index}`;
          const rawName = r?.product_name ?? r?.name ?? r?.item_name ?? "Unnamed Product";
          const rawSku = r?.sku ?? r?.product_sku ?? r?.item_sku ?? null;
          const rawQty =
            r?.quantity ??
            r?.qty ??
            r?.on_hand_qty ??
            r?.stock_qty ??
            r?.current_stock ??
            r?.current_qty ??
            0;

          const rawUnit = r?.unit ?? r?.product_unit ?? null;
const isPrecision = Boolean(r?.is_precision_product ?? r?.is_precision ?? false);
const packSize =
  r?.precision_pack_size != null ? Number(r.precision_pack_size) : null;
const baseUnit =
  r?.precision_base_unit ?? r?.base_unit ?? r?.precision_unit ?? null;

const packQty = r?.pack_qty != null ? Number(r.pack_qty) : null;
const baseUnitQty = r?.base_unit_qty != null ? Number(r.base_unit_qty) : null;

return {
  id: String(rawId),
  name: String(rawName ?? "Unnamed Product"),
  sku: rawSku ? String(rawSku) : null,
  qty: Number(rawQty ?? 0),
  unit: rawUnit ? String(rawUnit) : null,
  isPrecision,
  packSize: Number.isFinite(packSize) ? packSize : null,
  baseUnit: baseUnit ? String(baseUnit) : null,
  packQty: Number.isFinite(packQty) ? packQty : null,
  baseUnitQty: Number.isFinite(baseUnitQty) ? baseUnitQty : null,
};
        })
        .filter((r) => !!r.name)
        .sort((a, b) => a.name.localeCompare(b.name));

      setRows(mapped);

      if (activeOrgId) {
        const { data: restockData, error: restockErr } = await supabase.rpc(
          "get_restock_suggestions_v1",
          {
            p_org_id: activeOrgId,
            p_store_id: storeId,
          }
        );

        setRestockCount(!restockErr && Array.isArray(restockData) ? restockData.length : 0);
      } else {
        setRestockCount(0);
      }
    } catch (err: any) {
      Alert.alert("Failed", err?.message ?? "Imeshindikana kupakia products za store hii.");
      setRows([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeOrgId, storeId]);

  useEffect(() => {
    void loadData("initial");
  }, [loadData]);

  const totalQty = useMemo(
    () => rows.reduce((sum, item) => sum + Number(item.qty || 0), 0),
    [rows]
  );

  const lowStockCount = useMemo(
    () => rows.filter((item) => Number(item.qty || 0) <= 5).length,
    [rows]
  );

  const filteredRows = useMemo(() => {
    const needle = String(query ?? "").trim().toLowerCase();
    if (!needle) return rows;

    return rows.filter((item) => {
      const hay = `${item.name ?? ""} ${item.sku ?? ""}`.toLowerCase();
      return hay.includes(needle);
    });
  }, [rows, query]);

  return (
    <Screen scroll={false} contentStyle={{ paddingHorizontal: 0, paddingTop: 0, paddingBottom: 0 }}>
      <FlatList
        data={filteredRows}
        keyExtractor={(item) => item.id}
        onRefresh={() => void loadData("refresh")}
        refreshing={refreshing}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: 16,
          paddingBottom: 140,
          gap: 10,
        }}
        ListHeaderComponent={
          <View style={{ gap: 12, marginBottom: 12 }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <Pressable
                onPress={() => router.back()}
                style={({ pressed }) => ({
                  alignSelf: "flex-start",
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: BORDER_SOFT,
                  backgroundColor: "#F8FAFC",
                  paddingVertical: 9,
                  paddingHorizontal: 14,
                  opacity: pressed ? 0.92 : 1,
                })}
              >
                <Text style={{ color: TEXT, fontWeight: "900", fontSize: 12.5 }}>← Back</Text>
              </Pressable>

              <Pressable
                onPress={() => void loadData("refresh")}
                style={({ pressed }) => ({
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: BORDER_SOFT,
                  backgroundColor: "#F8FAFC",
                  paddingVertical: 9,
                  paddingHorizontal: 14,
                  opacity: pressed ? 0.92 : 1,
                })}
              >
                <Text style={{ color: TEXT, fontWeight: "900", fontSize: 12.5 }}>Refresh</Text>
              </Pressable>
            </View>

            <Card style={{ gap: 12 }}>
              <Text style={{ color: FAINT, fontWeight: "900", fontSize: 10.5, letterSpacing: 1 }}>
                STORE PRODUCTS
              </Text>

              <View style={{ gap: 5 }}>
                <Text style={{ color: TEXT, fontWeight: "900", fontSize: 22, letterSpacing: 0.2 }} numberOfLines={2}>
                  {storeName || "Store Products"}
                </Text>

                <Text style={{ color: MUTED, fontWeight: "800", lineHeight: 19, fontSize: 12.5 }}>
                  View-only page for products available in this store.
                </Text>
              </View>

              <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
                <View style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: "rgba(16,185,129,0.28)", backgroundColor: "rgba(16,185,129,0.10)" }}>
                  <Text style={{ color: EMERALD, fontWeight: "900", fontSize: 11.5 }}>{rows.length} Products</Text>
                </View>
backgroundColor: "#FFFFFF"
                <View style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: BORDER_SOFT,  }}>
                  <Text style={{ color: TEXT, fontWeight: "900", fontSize: 11.5 }}>Total Qty {totalQty}</Text>
                </View>

                <View style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: BORDER_SOFT,  }}>
                  <Text style={{ color: TEXT, fontWeight: "900", fontSize: 11.5 }}>Low Stock {lowStockCount}</Text>
                </View>backgroundColor: "#FFFFFF"
              </View>

              <Pressable
                onPress={() => {
                  if (!activeOrgId || !storeId) {
                    Alert.alert("Missing store", "Store au organization haijapatikana.");
                    return;
                  }

                  router.push({
                    pathname: "/stores/restock" as any,
                    params: { orgId: activeOrgId, storeId, storeName: storeName || "Store" },
                  });
                }}
                style={({ pressed }) => ({
                  borderWidth: 1,
                  borderColor: restockCount > 0 ? "rgba(16,185,129,0.35)" : BORDER_SOFT,
                  borderRadius: 18,
                  backgroundColor: restockCount > 0 ? "rgba(16,185,129,0.10)" : "rgba(255,255,255,0.05)",
                  padding: 14,
                  opacity: pressed ? 0.88 : 1,
                })}
              >
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ color: TEXT, fontWeight: "900", fontSize: 14.5 }}>
                      Restock Assistant & Place Order
                    </Text>

                    <Text style={{ color: MUTED, fontWeight: "800", fontSize: 11.5, marginTop: 5, lineHeight: 17 }}>
                      {restockCount > 0
                        ? `${restockCount} product(s) need restock. Open to create order.`
                        : "No low-stock products right now."}
                    </Text>
                  </View>

                  <View style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: restockCount > 0 ? "rgba(16,185,129,0.35)" : BORDER_SOFT, backgroundColor: restockCount > 0 ? "rgba(16,185,129,0.14)" : "rgba(255,255,255,0.06)" }}>
                    <Text style={{ color: restockCount > 0 ? EMERALD : TEXT, fontWeight: "900", fontSize: 11.5 }}>
                      Open →
                    </Text>
                  </View>
                </View>
              </Pressable>

              <Pressable
                onPress={() => {
                  if (!activeOrgId || !storeId) {
                    Alert.alert("Missing store", "Store au organization haijapatikana.");
                    return;
                  }

                  router.push({
                    pathname: "/stores/price-catalog" as any,
                    params: { orgId: activeOrgId, storeId, storeName: storeName || "Store" },
                  });
                }}
                style={({ pressed }) => ({
                  borderWidth: 1,
                  borderColor: "rgba(59,130,246,0.35)",
                  borderRadius: 18,
                  backgroundColor: "rgba(59,130,246,0.10)",
                  padding: 14,
                  opacity: pressed ? 0.88 : 1,
                })}
              >
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ color: TEXT, fontWeight: "900", fontSize: 14.5 }}>
                      Price Catalog PDF
                    </Text>

                    <Text style={{ color: MUTED, fontWeight: "800", fontSize: 11.5, marginTop: 5, lineHeight: 17 }}>
                      Select products and share selling-price list as PDF.
                    </Text>
                  </View>

                  <View style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: "rgba(59,130,246,0.35)", backgroundColor: "rgba(59,130,246,0.14)" }}>
                    <Text style={{ color: "#93C5FD", fontWeight: "900", fontSize: 11.5 }}>Open →</Text>
                  </View>
                </View>
              </Pressable>

              <View style={{ borderWidth: 1, borderColor: BORDER_SOFT, borderRadius: 16, backgroundColor: "#FFFFFF", paddingHorizontal: 12, paddingVertical: 4 }}>
                <TextInput
                  value={query}
                  onChangeText={setQuery}
                  placeholder="Search product or SKU..."
                  placeholderTextColor="rgba(234,242,255,0.35)"
                  style={{ color: TEXT, fontWeight: "800", fontSize: 13, paddingVertical: 10 }}
                />
              </View>
            </Card>
          </View>
        }
        ListEmptyComponent={
          loading ? (
            <View style={{ paddingTop: 24, alignItems: "center" }}>
              <ActivityIndicator />
              <Text style={{ color: MUTED, fontWeight: "800", marginTop: 10 }}>
                Loading store products...
              </Text>
            </View>
          ) : (
            <Card>
              <Text style={{ color: TEXT, fontWeight: "900", fontSize: 15 }}>
                {rows.length === 0 ? "No products found" : "No matching products"}
              </Text>
              <Text style={{ color: MUTED, fontWeight: "800", marginTop: 6, lineHeight: 20 }}>
                {rows.length === 0
                  ? "Hakuna bidhaa zilizopatikana kwenye store hii."
                  : "Hakuna bidhaa zinazolingana na utafutaji wako."}
              </Text>
            </Card>
          )
        }
        renderItem={({ item, index }) => (
          <Card style={{ borderColor: "#E5EAF1", backgroundColor: "#FFFFFF", paddingVertical: 12, paddingHorizontal: 12 }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <View style={{ width: 36, height: 36, borderRadius: 12, borderWidth: 1, borderColor: "#E5EAF1", backgroundColor: "#F8FAFC", alignItems: "center", justifyContent: "center" }}>
                <Text style={{ color: TEXT, fontWeight: "900", fontSize: 12 }}>{index + 1}</Text>
              </View>

              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ color: TEXT, fontWeight: "900", fontSize: 14.5, letterSpacing: 0.15 }} numberOfLines={1}>
                  {item.name}
                </Text>

                <Text style={{ color: MUTED, fontWeight: "800", marginTop: 4, fontSize: 11.5 }} numberOfLines={1}>
  SKU: {item.sku || "—"} {item.unit ? ` | Unit: ${item.unit}` : ""}
</Text>

{item.isPrecision ? (
  <Text style={{ color: EMERALD, fontWeight: "900", marginTop: 4, fontSize: 11.5 }} numberOfLines={1}>
    {item.unit || "Box"}: {Number(item.packQty ?? 0).toFixed(2)} | {item.baseUnit || "Units"}: {Number(item.baseUnitQty ?? item.qty)}
  </Text>
) : null}
              </View>

              <View style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: Number(item.qty || 0) <= 5 ? "rgba(239,68,68,0.30)" : BORDER_SOFT, backgroundColor: Number(item.qty || 0) <= 5 ? "rgba(239,68,68,0.10)" : "rgba(255,255,255,0.06)" }}>
                <Text style={{ color: Number(item.qty || 0) <= 5 ? "#F87171" : TEXT, fontWeight: "900", fontSize: 11.5 }}>
                  Qty {item.qty}
                </Text>
              </View>
            </View>
          </Card>
        )}
        ListFooterComponent={
          filteredRows.length > 0 ? (
            <View style={{ paddingTop: 6 }}>
              <Text style={{ color: MUTED, fontWeight: "800", fontSize: 11.5, textAlign: "center" }}>
                Showing {filteredRows.length} of {rows.length} products
              </Text>
            </View>
          ) : null
        }
      />
    </Screen>
  );
}