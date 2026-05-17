import { useLocalSearchParams, useRouter } from "expo-router";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
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

import { supabase } from "../../../src/supabase/supabaseClient";
import { Card } from "../../../src/ui/Card";
import { Screen } from "../../../src/ui/Screen";
import { theme } from "../../../src/ui/theme";

type CatalogProductRow = {
  id: string;
  name: string;
  sku: string | null;
  qty: number;
  sellingPrice: number;
};

function money(n: number) {
  const v = Number(n || 0);
  return `TSh ${v.toLocaleString("en-US")}`;
}

function escapeHtml(value: any) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export default function PriceCatalogScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    orgId?: string;
    storeId?: string;
    storeName?: string;
  }>();

  const storeId = String(params?.storeId ?? "").trim();
  const storeName = String(params?.storeName ?? "Store").trim();

  const C: any = (theme as any)?.colors ?? {};
  const col = (key: string, fallback: string) => {
    const v = C?.[key];
    return typeof v === "string" && v.trim() ? v : fallback;
  };

  const TEXT = "#0F172A";
const MUTED = "#64748B";
const BORDER_SOFT = "#DDE7F3";
const EMERALD = "#059669";

const SURFACE = "#F8FAFC";
const CARD_WHITE = "#FFFFFF";
const BLUE = "#0B63CE";
const BLUE_SOFT = "#EAF3FF";
const GOLD = "#B7791F";
const GOLD_SOFT = "#FFF7E6";
const DARK_CARD = "#102033";
const SELECTED_BG = "#E7F8EF";
const SELECTED_BORDER = "#5DD6A0";

  const [rows, setRows] = useState<CatalogProductRow[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [printing, setPrinting] = useState(false);

  const loadData = useCallback(async () => {
    if (!storeId) return;

    setLoading(true);
    try {
      const { data, error } = await supabase.rpc("get_store_inventory_v2", {
        p_store_id: storeId,
      });

      if (error) throw error;

      const mapped: CatalogProductRow[] = (Array.isArray(data) ? data : [])
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

          const rawPrice =
            r?.selling_price ??
            r?.price ??
            r?.retail_price ??
            r?.sale_price ??
            r?.unit_price ??
            0;

          return {
            id: String(rawId),
            name: String(rawName ?? "Unnamed Product"),
            sku: rawSku ? String(rawSku) : null,
            qty: Number(rawQty ?? 0),
            sellingPrice: Number(rawPrice ?? 0),
          };
        })
        .filter((r) => !!r.name)
        .sort((a, b) => a.name.localeCompare(b.name));

      setRows(mapped);

      const initialSelected: Record<string, boolean> = {};
      mapped.forEach((item) => {
        initialSelected[item.id] = true;
      });
      setSelected(initialSelected);
    } catch (err: any) {
      Alert.alert("Failed", err?.message ?? "Imeshindikana kupakia catalog.");
      setRows([]);
      setSelected({});
    } finally {
      setLoading(false);
    }
  }, [storeId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const filteredRows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return rows;

    return rows.filter((item) => {
      const hay = `${item.name} ${item.sku ?? ""}`.toLowerCase();
      return hay.includes(needle);
    });
  }, [rows, query]);

  const selectedRows = useMemo(
    () => rows.filter((item) => selected[item.id]),
    [rows, selected]
  );

  const toggleOne = (id: string) => {
    setSelected((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const selectAll = () => {
    const next: Record<string, boolean> = {};
    rows.forEach((item) => {
      next[item.id] = true;
    });
    setSelected(next);
  };

  const clearAll = () => {
    setSelected({});
  };

  const generateHtml = () => {
    const today = new Date().toLocaleDateString();

    const tableRows = selectedRows
      .map(
        (item, index) => `
          <tr>
            <td>${index + 1}</td>
            <td>
              <strong>${escapeHtml(item.name)}</strong>
              <br/>
              <span>${escapeHtml(item.sku || "SKU: —")}</span>
            </td>
            <td>${money(item.sellingPrice)}</td>
          </tr>
        `
      )
      .join("");

    return `
      <html>
        <head>
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <style>
            body {
              font-family: Arial, sans-serif;
              padding: 24px;
              color: #111827;
            }
            .header {
              border-bottom: 2px solid #111827;
              padding-bottom: 14px;
              margin-bottom: 18px;
            }
            .brand {
              font-size: 24px;
              font-weight: 900;
              margin-bottom: 4px;
            }
            .subtitle {
              font-size: 13px;
              color: #4B5563;
              font-weight: 700;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              margin-top: 16px;
            }
            th {
              background: #111827;
              color: white;
              text-align: left;
              padding: 10px;
              font-size: 12px;
            }
            td {
              border-bottom: 1px solid #E5E7EB;
              padding: 10px;
              font-size: 12px;
              vertical-align: top;
            }
            td:nth-child(1) {
              width: 40px;
              font-weight: 800;
            }
            td:nth-child(3) {
              width: 130px;
              font-weight: 900;
              color: #047857;
            }
            span {
              color: #6B7280;
              font-size: 10px;
              font-weight: 700;
            }
            .footer {
              margin-top: 24px;
              padding-top: 12px;
              border-top: 1px solid #E5E7EB;
              font-size: 11px;
              color: #6B7280;
              font-weight: 700;
            }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="brand">${escapeHtml(storeName)}</div>
            <div class="subtitle">Product Price Catalog • ${today}</div>
            <div class="subtitle">Selected Products: ${selectedRows.length}</div>
          </div>

          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Product</th>
                <th>Selling Price</th>
              </tr>
            </thead>
            <tbody>
              ${tableRows}
            </tbody>
          </table>

          <div class="footer">
            Generated by ZETRA BMS
          </div>
        </body>
      </html>
    `;
  };

  const sharePdf = async () => {
    if (selectedRows.length === 0) {
      Alert.alert("No products selected", "Chagua bidhaa angalau moja kwanza.");
      return;
    }

    setPrinting(true);
    try {
      const file = await Print.printToFileAsync({
        html: generateHtml(),
        base64: false,
      });

      const canShare = await Sharing.isAvailableAsync();
      if (!canShare) {
        Alert.alert("PDF created", file.uri);
        return;
      }

      await Sharing.shareAsync(file.uri, {
        mimeType: "application/pdf",
        dialogTitle: `${storeName} Price Catalog`,
        UTI: "com.adobe.pdf",
      });
    } catch (err: any) {
      Alert.alert("PDF failed", err?.message ?? "Imeshindikana kutengeneza PDF.");
    } finally {
      setPrinting(false);
    }
  };

  return (
    <Screen
      scroll={false}
      contentStyle={{ paddingHorizontal: 0, paddingTop: 0, paddingBottom: 0 }}
    >
      <FlatList
        data={filteredRows}
        keyExtractor={(item) => item.id}
        refreshing={loading}
        onRefresh={() => void loadData()}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: 16,
          paddingBottom: 150,
          gap: 10,
        }}
        ListHeaderComponent={
          <View style={{ gap: 12, marginBottom: 12 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 12 }}>
              <Pressable
                onPress={() => router.back()}
                style={({ pressed }) => ({
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: BORDER_SOFT,
                  backgroundColor: "#F8FAFC",
                  paddingVertical: 9,
                  paddingHorizontal: 14,
                  opacity: pressed ? 0.9 : 1,
                })}
              >
                <Text style={{ color: TEXT, fontWeight: "900", fontSize: 12.5 }}>← Back</Text>
              </Pressable>

              <Pressable
                onPress={sharePdf}
                disabled={printing}
                style={({ pressed }) => ({
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: "rgba(16,185,129,0.35)",
                  backgroundColor: BLUE_SOFT,
                  paddingVertical: 9,
                  paddingHorizontal: 14,
                  opacity: pressed || printing ? 0.75 : 1,
                })}
              >
                <Text style={{ color: BLUE, fontWeight: "900", fontSize: 12.5 }}>
                  {printing ? "Creating..." : "Share PDF"}
                </Text>
              </Pressable>
            </View>

            <Card
  style={{
    gap: 12,
    backgroundColor: CARD_WHITE,
    borderColor: BORDER_SOFT,
  }}
>
              <Text style={{ color: MUTED, fontWeight: "900", fontSize: 10.5, letterSpacing: 1 }}>
                PRICE CATALOG
              </Text>

              <View>
                <Text style={{ color: TEXT, fontWeight: "900", fontSize: 22 }}>
                  {storeName || "Store"}
                </Text>
                <Text style={{ color: MUTED, fontWeight: "800", marginTop: 5, lineHeight: 19, fontSize: 12.5 }}>
                  Select products and send customer a clean selling-price PDF.
                </Text>
              </View>

              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                <View style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: "rgba(16,185,129,0.28)",backgroundColor: SELECTED_BG  }}>
                  <Text style={{ color: EMERALD, fontWeight: "900", fontSize: 11.5 }}>
                    Selected {selectedRows.length}
                  </Text>
                </View>

                <View
  style={{
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: BORDER_SOFT,
    backgroundColor: "#FFFFFF",
  }}
>
  <Text style={{ color: TEXT, fontWeight: "900", fontSize: 11.5 }}>
    Total {rows.length}
  </Text>
</View>
              </View>

              <View style={{ flexDirection: "row", gap: 8 }}>
                <Pressable
                  onPress={selectAll}
                  style={({ pressed }) => ({
                    flex: 1,
                    borderRadius: 14,
                    borderWidth: 1,
                    borderColor: BORDER_SOFT,
                   backgroundColor: "#FFFFFF",
                    paddingVertical: 11,
                    alignItems: "center",
                    opacity: pressed ? 0.85 : 1,
                  })}
                >
                  <Text style={{ color: TEXT, fontWeight: "900", fontSize: 12 }}>
                    Select All
                  </Text>
                </Pressable>

                <Pressable
                  onPress={clearAll}
                  style={({ pressed }) => ({
                    flex: 1,
                    borderRadius: 14,
                    borderWidth: 1,
                    borderColor: "rgba(239,68,68,0.25)",
                    backgroundColor: "rgba(239,68,68,0.08)",
                    paddingVertical: 11,
                    alignItems: "center",
                    opacity: pressed ? 0.85 : 1,
                  })}
                >
                  <Text style={{ color: "#F87171", fontWeight: "900", fontSize: 12 }}>
                    Clear
                  </Text>
                </Pressable>
              </View>

              <View style={{ borderWidth: 1, borderColor: BORDER_SOFT, borderRadius: 16,backgroundColor: "#FFFFFF", paddingHorizontal: 12, paddingVertical: 4 }}>
                <TextInput
                  value={query}
                  onChangeText={setQuery}
                  placeholder="Search product or SKU..."
                  placeholderTextColor="#9CA3AF"
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
                Loading catalog...
              </Text>
            </View>
          ) : (
            <Card>
              <Text style={{ color: TEXT, fontWeight: "900", fontSize: 15 }}>
                No products found
              </Text>
              <Text style={{ color: MUTED, fontWeight: "800", marginTop: 6 }}>
                Hakuna bidhaa za kutengeneza catalog.
              </Text>
            </Card>
          )
        }
        renderItem={({ item, index }) => {
          const isSelected = !!selected[item.id];

          return (
            <Pressable onPress={() => toggleOne(item.id)} style={({ pressed }) => ({ opacity: pressed ? 0.88 : 1 })}>
              <Card
  style={{
    borderColor: isSelected ? SELECTED_BORDER : "#C7D2E1",
    backgroundColor: isSelected ? SELECTED_BG : DARK_CARD,
    paddingVertical: 12,
    paddingHorizontal: 12,
  }}
>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                  <View style={{ width: 36, height: 36, borderRadius: 12, borderWidth: 1, borderColor: isSelected ? "rgba(16,185,129,0.45)" : BORDER_SOFT, backgroundColor: isSelected ? "rgba(16,185,129,0.14)" : "rgba(255,255,255,0.05)", alignItems: "center", justifyContent: "center" }}>
                    <Text style={{ color: isSelected ? EMERALD : TEXT, fontWeight: "900", fontSize: 12 }}>
                      {isSelected ? "✓" : index + 1}
                    </Text>
                  </View>

                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ color: TEXT, fontWeight: "900", fontSize: 14.5 }} numberOfLines={1}>
                      {item.name}
                    </Text>
                    <Text style={{ color: MUTED, fontWeight: "800", marginTop: 4, fontSize: 11.5 }} numberOfLines={1}>
                      SKU: {item.sku || "—"} • Qty {item.qty}
                    </Text>
                  </View>

                  <Text style={{ color: isSelected ? BLUE : "#FBBF24", fontWeight: "900", fontSize: 12 }}>
  {money(item.sellingPrice)}
</Text>
                </View>
              </Card>
            </Pressable>
          );
        }}
      />
    </Screen>
  );
}