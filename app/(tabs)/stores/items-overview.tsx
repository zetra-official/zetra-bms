// app/stores/items-overview.tsx
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";

import { useOrg } from "@/src/context/OrgContext";
import { supabase } from "@/src/supabase/supabaseClient";
import { Card } from "@/src/ui/Card";
import { Screen } from "@/src/ui/Screen";
import { theme } from "@/src/ui/theme";
import { formatMoney, useOrgMoneyPrefs } from "@/src/ui/money";

type ScopeMode = "STORE" | "ORG";

type ItemRow = {
  id: string;
  name: string;
  sku: string | null;
  unit: string | null;
  qty: number;
  isLowStock: boolean;
  sellingPrice: number | null;
  costPrice: number | null;
  imageUrl: string | null;
  storeId: string | null;
  storeName: string | null;
};

export default function ItemsOverviewScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    orgId?: string;
    storeId?: string;
    storeName?: string;
    scope?: ScopeMode;
  }>();

  const { activeOrgId, activeRole, stores, activeStoreId, activeStoreName } = useOrg();
  const money = useOrgMoneyPrefs(activeOrgId ?? "");

  const orgId = String(params?.orgId ?? activeOrgId ?? "").trim();
  const startStoreId = String(params?.storeId ?? activeStoreId ?? "").trim();
  const startStoreName = String(params?.storeName ?? activeStoreName ?? "Active Store").trim();

  const isOwner = String(activeRole ?? "").toLowerCase() === "owner";

  const [scope, setScope] = useState<ScopeMode>(
    params?.scope === "ORG" ? "ORG" : "STORE"
  );
  const [selectedStoreId, setSelectedStoreId] = useState(startStoreId);
  const [selectedStoreName, setSelectedStoreName] = useState(startStoreName);
  const [rows, setRows] = useState<ItemRow[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
const [expandedItemKey, setExpandedItemKey] = useState<string | null>(null);

  const C: any = (theme as any)?.colors ?? {};
  const TEXT = C?.text ?? "#0F172A";
  const MUTED = C?.muted ?? "#64748B";
  const FAINT = C?.faint ?? "#94A3B8";
  const BORDER = C?.borderSoft ?? "#E5EAF1";
  const EMERALD = C?.emerald ?? "#10B981";

  const storeChoices = useMemo(() => {
    return (stores ?? [])
      .filter((s: any) => {
        const sidOrg = String(
          s?.organization_id ?? s?.org_id ?? s?.active_org_id ?? orgId ?? ""
        ).trim();

        return !orgId || sidOrg === orgId;
      })
      .map((s: any) => ({
        id: String(s?.store_id ?? s?.id ?? "").trim(),
        name: String(s?.store_name ?? s?.name ?? "Store").trim(),
      }))
      .filter((s) => !!s.id);
  }, [stores, orgId]);

  const loadStoreItems = useCallback(
    async (sid: string, sname: string) => {
      const { data, error } = await supabase.rpc("get_items_overview_v1", {
        p_org_id: orgId,
        p_store_id: sid,
      });

      if (error) throw error;

      return (Array.isArray(data) ? data : [])
        .map((r: any, index: number): ItemRow => {
          const qty = Number(
            r?.qty ??
              r?.quantity ??
              r?.quantity_on_hand ??
              r?.on_hand_qty ??
              r?.stock ??
              r?.stock_on_hand ??
              r?.stock_qty ??
              r?.current_stock ??
              r?.current_qty ??
              r?.available_qty ??
              r?.total_qty ??
              r?.balance_qty ??
              r?.remaining_qty ??
              0
          );

          const sellingPrice =
            r?.selling_price ??
            r?.sellingPrice ??
            r?.sale_price ??
            r?.price ??
            r?.unit_price ??
            null;

          const costPrice =
            r?.cost_price ??
            r?.costPrice ??
            r?.buying_price ??
            r?.buyingPrice ??
            r?.purchase_price ??
            null;

          const lowStockLimit = Number(r?.alert_level ?? r?.low_stock_threshold ?? 5);

          return {
            id: String(
              r?.product_id ??
                r?.item_id ??
                r?.inventory_id ??
                r?.id ??
                `${sid}-${index}`
            ),
            name: String(
              r?.product_name ??
                r?.item_name ??
                r?.name ??
                r?.title ??
                "Unnamed Product"
            ),
            sku: r?.sku || r?.product_sku ? String(r?.sku ?? r?.product_sku) : null,
            unit:
              r?.unit || r?.product_unit || r?.uom
                ? String(r?.unit ?? r?.product_unit ?? r?.uom)
                : null,
            qty,
            isLowStock: qty > 0 && qty <= lowStockLimit,
            sellingPrice: sellingPrice != null ? Number(sellingPrice) : null,
            costPrice: isOwner && costPrice != null ? Number(costPrice) : null,
            imageUrl:
              r?.image_url ||
              r?.product_image_url ||
              r?.photo_url ||
              r?.imageUrl ||
              r?.picture_url
                ? String(
                    r?.image_url ??
                      r?.product_image_url ??
                      r?.photo_url ??
                      r?.imageUrl ??
                      r?.picture_url
                  )
                : null,
            storeId: String(r?.store_id ?? sid),
            storeName: String(r?.store_name ?? sname),
          };
        })
        .filter((r) => !!r.id && !!r.name && Number(r.qty || 0) > 0);
    },
    [isOwner, orgId]
  );

  const loadData = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (!orgId) {
        Alert.alert("Missing organization", "Organization haijapatikana.");
        return;
      }

      if (mode === "refresh") setRefreshing(true);
      else setLoading(true);

      try {
        let nextRows: ItemRow[] = [];

        if (scope === "ORG") {
          const allowedStores = storeChoices;
          const batches = await Promise.all(
            allowedStores.map((s) => loadStoreItems(s.id, s.name))
          );
          nextRows = batches.flat();
        } else {
          if (!selectedStoreId) {
            Alert.alert("Select store", "Chagua store kwanza.");
            nextRows = [];
          } else {
            nextRows = await loadStoreItems(selectedStoreId, selectedStoreName);
          }
        }

        nextRows.sort((a, b) => a.name.localeCompare(b.name));
        setRows(nextRows);
      } catch (err: any) {
        Alert.alert("Failed", err?.message ?? "Imeshindikana kupakia items.");
        setRows([]);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [orgId, scope, selectedStoreId, selectedStoreName, storeChoices, loadStoreItems]
  );

  useEffect(() => {
    void loadData("initial");
  }, [loadData]);

  const filteredRows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return rows;

    return rows.filter((item) => {
      const hay = `${item.name} ${item.sku ?? ""} ${item.storeName ?? ""}`.toLowerCase();
      return hay.includes(needle);
    });
  }, [rows, query]);

  const totalQty = useMemo(
    () => rows.reduce((sum, item) => sum + Number(item.qty || 0), 0),
    [rows]
  );

  const totalSellingValue = useMemo(
    () =>
      rows.reduce(
        (sum, item) => sum + Number(item.qty || 0) * Number(item.sellingPrice || 0),
        0
      ),
    [rows]
  );

  const totalCostValue = useMemo(
    () =>
      rows.reduce(
        (sum, item) => sum + Number(item.qty || 0) * Number(item.costPrice || 0),
        0
      ),
    [rows]
  );

  return (
    <Screen scroll={false} contentStyle={{ paddingHorizontal: 0, paddingTop: 0 }}>
      <FlatList
        data={filteredRows}
        keyExtractor={(item, index) => `${item.storeId}-${item.id}-${index}`}
        refreshing={refreshing}
        onRefresh={() => void loadData("refresh")}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: 16,
          paddingBottom: 140,
          gap: 10,
        }}
        ListHeaderComponent={
          <View style={{ gap: 12, marginBottom: 12 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 10 }}>
              <Pressable
                onPress={() => router.back()}
                style={{
                  borderWidth: 1,
                  borderColor: BORDER,
                  backgroundColor: "#FFFFFF",
                  borderRadius: 999,
                  paddingHorizontal: 14,
                  paddingVertical: 9,
                }}
              >
                <Text style={{ color: TEXT, fontWeight: "900" }}>← Back</Text>
              </Pressable>

              <Pressable
                onPress={() => void loadData("refresh")}
                style={{
                  borderWidth: 1,
                  borderColor: BORDER,
                  backgroundColor: "#FFFFFF",
                  borderRadius: 999,
                  paddingHorizontal: 14,
                  paddingVertical: 9,
                }}
              >
                <Text style={{ color: TEXT, fontWeight: "900" }}>Refresh</Text>
              </Pressable>
            </View>

            <Card style={{ gap: 12, backgroundColor: "#FFFFFF", borderColor: BORDER }}>
              <Text style={{ color: FAINT, fontWeight: "900", letterSpacing: 1, fontSize: 11 }}>
                ITEMS OVERVIEW
              </Text>

              <Text style={{ color: TEXT, fontWeight: "900", fontSize: 24 }}>
                {scope === "ORG" ? "Organization Items" : selectedStoreName || "Store Items"}
              </Text>

              <Text style={{ color: MUTED, fontWeight: "800", lineHeight: 20 }}>
                Angalia bidhaa, picha, quantity, selling price na owner-only buying price.
              </Text>

              <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
                <Pressable
                  onPress={() => setScope("STORE")}
                  style={{
                    borderWidth: 1,
                    borderColor: scope === "STORE" ? "rgba(16,185,129,0.35)" : BORDER,
                    backgroundColor: scope === "STORE" ? "rgba(16,185,129,0.12)" : "#F8FAFC",
                    borderRadius: 999,
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                  }}
                >
                  <Text style={{ color: scope === "STORE" ? EMERALD : TEXT, fontWeight: "900" }}>
                    Active Store
                  </Text>
                </Pressable>

                <Pressable
                  onPress={() => setScope("ORG")}
                  style={{
                    borderWidth: 1,
                    borderColor: scope === "ORG" ? "rgba(16,185,129,0.35)" : BORDER,
                    backgroundColor: scope === "ORG" ? "rgba(16,185,129,0.12)" : "#F8FAFC",
                    borderRadius: 999,
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                  }}
                >
                  <Text style={{ color: scope === "ORG" ? EMERALD : TEXT, fontWeight: "900" }}>
                    Organization
                  </Text>
                </Pressable>
              </View>

              {scope === "STORE" ? (
                <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
                  {storeChoices.map((s) => (
                    <Pressable
                      key={s.id}
                      onPress={() => {
                        setSelectedStoreId(s.id);
                        setSelectedStoreName(s.name);
                      }}
                      style={{
                        borderWidth: 1,
                        borderColor: selectedStoreId === s.id ? "rgba(59,130,246,0.45)" : BORDER,
                        backgroundColor: selectedStoreId === s.id ? "#EFF6FF" : "#F8FAFC",
                        borderRadius: 999,
                        paddingHorizontal: 12,
                        paddingVertical: 8,
                      }}
                    >
                      <Text style={{ color: TEXT, fontWeight: "900", fontSize: 12 }}>
                        {s.name}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}

              <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
                <View style={{ borderWidth: 1, borderColor: BORDER, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 }}>
                  <Text style={{ color: TEXT, fontWeight: "900" }}>{rows.length} Items</Text>
                </View>

                <View style={{ borderWidth: 1, borderColor: BORDER, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 }}>
                  <Text style={{ color: TEXT, fontWeight: "900" }}>Qty {totalQty}</Text>
                </View>

                <View style={{ borderWidth: 1, borderColor: BORDER, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 }}>
                  <Text style={{ color: TEXT, fontWeight: "900" }}>
                    Sell {formatMoney(totalSellingValue, money)}
                  </Text>
                </View>

                {isOwner ? (
                  <View style={{ borderWidth: 1, borderColor: BORDER, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 }}>
                    <Text style={{ color: TEXT, fontWeight: "900" }}>
                      Cost {formatMoney(totalCostValue, money)}
                    </Text>
                  </View>
                ) : null}
              </View>

              <View style={{ borderWidth: 1, borderColor: BORDER, borderRadius: 16, backgroundColor: "#F8FAFC", paddingHorizontal: 12 }}>
                <TextInput
                  value={query}
                  onChangeText={setQuery}
                  placeholder="Search item, SKU or store..."
                  placeholderTextColor={FAINT}
                  style={{
                    color: TEXT,
                    fontWeight: "800",
                    paddingVertical: 11,
                  }}
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
                Loading items...
              </Text>
            </View>
          ) : (
            <Card style={{ backgroundColor: "#FFFFFF", borderColor: BORDER }}>
              <Text style={{ color: TEXT, fontWeight: "900" }}>
                No items found
              </Text>
              <Text style={{ color: MUTED, fontWeight: "800", marginTop: 6 }}>
                Hakuna bidhaa zenye stock kwenye scope hii.
              </Text>
            </Card>
          )
        }
      renderItem={({ item, index }) => {
  const itemKey = `${item.storeId}-${item.id}-${index}`;
  const expanded = expandedItemKey === itemKey;

  return (
    <Pressable
      onPress={() => setExpandedItemKey(expanded ? null : itemKey)}
      style={({ pressed }) => ({
        borderRadius: 24,
        opacity: pressed ? 0.94 : 1,
      })}
    >
      <Card style={{ backgroundColor: "#FFFFFF", borderColor: BORDER, padding: 12 }}>
        <View style={{ flexDirection: "row", gap: 12, alignItems: "flex-start" }}>
          <View style={{ alignItems: "center", gap: 5 }}>
            <View
              style={{
                minWidth: 28,
                height: 24,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: BORDER,
                backgroundColor: "#F8FAFC",
                alignItems: "center",
                justifyContent: "center",
                paddingHorizontal: 8,
              }}
            >
              <Text style={{ color: TEXT, fontWeight: "900", fontSize: 11 }}>
                {index + 1}
              </Text>
            </View>

            <View
              style={{
                width: 58,
                height: 58,
                borderRadius: 18,
                borderWidth: 1,
                borderColor: BORDER,
                backgroundColor: "#F8FAFC",
                overflow: "hidden",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {item.imageUrl ? (
                <Image source={{ uri: item.imageUrl }} style={{ width: "100%", height: "100%" }} resizeMode="cover" />
              ) : (
                <Text style={{ fontSize: 24 }}>📦</Text>
              )}
            </View>
          </View>

          <View style={{ flex: 1, minWidth: 0 }}>
            <Text
              style={{ color: TEXT, fontWeight: "900", fontSize: 15, lineHeight: 20 }}
              numberOfLines={expanded ? undefined : 1}
            >
              {item.name}
            </Text>

            <Text
              style={{ color: MUTED, fontWeight: "800", marginTop: 4, fontSize: 12, lineHeight: 18 }}
              numberOfLines={expanded ? undefined : 1}
            >
              SKU: {item.sku || "—"} {item.unit ? ` | Unit: ${item.unit}` : ""}
            </Text>

            {scope === "ORG" ? (
              <Text style={{ color: FAINT, fontWeight: "800", marginTop: 4, fontSize: 12, lineHeight: 18 }}>
                Store: {item.storeName || "—"}
              </Text>
            ) : null}

            <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
              <Text style={{ color: TEXT, fontWeight: "900", fontSize: 12 }}>
                Qty {item.qty}
              </Text>

              {item.isLowStock ? ( 
                <Text style={{ color: "#DC2626", fontWeight: "900", fontSize: 12 }}>
                  LOW STOCK
                </Text>
              ) : null}

              <Text style={{ color: EMERALD, fontWeight: "900", fontSize: 12 }}>
                Sell {formatMoney(item.sellingPrice ?? 0, money)}
              </Text>

              {isOwner ? (
                <Text style={{ color: "#B45309", fontWeight: "900", fontSize: 12 }}>
                  Cost {formatMoney(item.costPrice ?? 0, money)}
                </Text>
              ) : null}
            </View>

            {expanded ? (
              <View
                style={{
                  marginTop: 12,
                  paddingTop: 12,
                  borderTopWidth: 1,
                  borderTopColor: BORDER,
                  gap: 6,
                }}
              >
                <Text style={{ color: TEXT, fontWeight: "900", fontSize: 13 }}>
                  Full Item Details
                </Text>

                <Text style={{ color: MUTED, fontWeight: "800", lineHeight: 19 }}>
                  Name: {item.name}
                </Text>

                <Text style={{ color: MUTED, fontWeight: "800", lineHeight: 19 }}>
                  SKU: {item.sku || "—"}
                </Text>

                <Text style={{ color: MUTED, fontWeight: "800", lineHeight: 19 }}>
                  Unit: {item.unit || "—"}
                </Text>

                <Text style={{ color: MUTED, fontWeight: "800", lineHeight: 19 }}>
                  Quantity: {item.qty}
                </Text>

                <Text style={{ color: MUTED, fontWeight: "800", lineHeight: 19 }}>
                  Selling Price: {formatMoney(item.sellingPrice ?? 0, money)}
                </Text>

                {isOwner ? (
                  <Text style={{ color: MUTED, fontWeight: "800", lineHeight: 19 }}>
                    Cost Price: {formatMoney(item.costPrice ?? 0, money)}
                  </Text>
                ) : null}

                {scope === "ORG" ? (
                  <Text style={{ color: MUTED, fontWeight: "800", lineHeight: 19 }}>
                    Store: {item.storeName || "—"}
                  </Text>
                ) : null}
              </View>
            ) : null}
          </View>
        </View>
      </Card>
    </Pressable>
  );
}}
        ListFooterComponent={
          filteredRows.length > 0 ? (
            <Text style={{ color: MUTED, fontWeight: "800", textAlign: "center", marginTop: 8 }}>
              Showing {filteredRows.length} of {rows.length} items
            </Text>
          ) : null
        }
      />
    </Screen>
  );
}