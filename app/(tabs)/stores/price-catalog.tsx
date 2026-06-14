// app/stores/price-catalog.tsx

import { useLocalSearchParams, useRouter } from "expo-router";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
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
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function printHtmlPdfOnWeb(html: string) {
  if (Platform.OS !== "web" || typeof document === "undefined") return false;

  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  iframe.style.visibility = "hidden";

  document.body.appendChild(iframe);

  const doc = iframe.contentWindow?.document;
  if (!doc) {
    document.body.removeChild(iframe);
    return false;
  }

  doc.open();
  doc.write(html);
  doc.close();

  setTimeout(() => {
    iframe.contentWindow?.focus();
    iframe.contentWindow?.print();

    setTimeout(() => {
      try {
        document.body.removeChild(iframe);
      } catch {}
    }, 1500);
  }, 500);

  return true;
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

  const TEXT = "#0F172A";
  const MUTED = "#64748B";
  const BORDER_SOFT = "#DDE7F3";
  const EMERALD = "#059669";
  const BLUE = "#0B63CE";
  const BLUE_SOFT = "#EAF3FF";
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
        .map((r: any, index: number) => ({
          id: String(r?.product_id ?? r?.id ?? `${storeId}-${index}`),
          name: String(r?.product_name ?? r?.name ?? r?.item_name ?? "Unnamed Product"),
          sku: r?.sku ?? r?.product_sku ?? r?.item_sku ?? null,
          qty: Number(
            r?.quantity ??
              r?.qty ??
              r?.on_hand_qty ??
              r?.stock_qty ??
              r?.current_stock ??
              r?.current_qty ??
              0
          ),
          sellingPrice: Number(
            r?.selling_price ??
              r?.price ??
              r?.retail_price ??
              r?.sale_price ??
              r?.unit_price ??
              0
          ),
        }))
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

    return rows.filter((item) =>
      `${item.name} ${item.sku ?? ""}`.toLowerCase().includes(needle)
    );
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

  const generateHtml = useCallback(() => {
    const today = new Date().toLocaleDateString("en-GB");

    const tableRows = selectedRows
      .map(
        (item, index) => `
          <tr>
            <td>${index + 1}</td>
            <td>
              <b>${escapeHtml(item.name)}</b><br/>
              <span>SKU: ${escapeHtml(item.sku || "—")}</span>
            </td>
            <td class="right">${escapeHtml(money(item.sellingPrice))}</td>
          </tr>
        `
      )
      .join("");

    return `
<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(storeName)} Price Catalog</title>
  <style>
    @page { size: A4 portrait; margin: 12mm 10mm; }

    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    html, body {
      margin: 0 !important;
      padding: 0 !important;
      background: #ffffff;
      color: #111827;
      font-family: Arial, Helvetica, sans-serif;
      font-size: 10.5px;
      line-height: 1.32;
    }

    .page {
      width: 100%;
      background: #ffffff;
    }

    .header {
      display: table;
      width: 100%;
      border-bottom: 2px solid #111827;
      padding-bottom: 8px;
      margin-bottom: 10px;
    }

    .brand, .meta {
      display: table-cell;
      vertical-align: top;
    }

    .brand-title {
      font-size: 18px;
      font-weight: 900;
      letter-spacing: 0.2px;
    }

    .brand-sub {
      margin-top: 3px;
      font-size: 10px;
      font-weight: 800;
      color: #475569;
    }

    .meta {
      width: 38%;
      text-align: right;
      font-size: 9.5px;
      color: #334155;
      line-height: 1.45;
    }

    .badge {
      display: inline-block;
      border: 1px solid #10b981;
      background: #ecfdf5;
      color: #047857;
      border-radius: 999px;
      padding: 4px 8px;
      font-weight: 900;
      margin-top: 4px;
    }

    .info-table, .data-table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
      margin-top: 8px;
    }

    .info-table td {
      border: 1px solid #cbd5e1;
      padding: 7px;
      vertical-align: top;
      word-break: break-word;
    }

    .section-title {
      font-size: 12px;
      font-weight: 900;
      text-transform: uppercase;
      margin: 13px 0 6px;
      border-bottom: 1px solid #cbd5e1;
      padding-bottom: 4px;
    }

    .data-table th, .data-table td {
      border: 1px solid #cbd5e1;
      padding: 6px;
      text-align: left;
      vertical-align: top;
      word-break: break-word;
    }

    .data-table th {
      background: #f1f5f9;
      font-size: 8.5px;
      font-weight: 900;
      text-transform: uppercase;
    }

    .data-table td {
      font-size: 9.5px;
    }

    .data-table span {
      color: #64748b;
      font-size: 8.7px;
      font-weight: 800;
    }

    .right {
      text-align: right;
      white-space: nowrap;
      font-weight: 900;
      color: #047857;
    }

    .footer {
      margin-top: 10px;
      padding-top: 8px;
      border-top: 1px solid #e5e7eb;
      color: #64748b;
      text-align: center;
      font-size: 9px;
      font-weight: 800;
    }
  </style>
</head>

<body>
  <div class="page">
    <div class="header">
      <div class="brand">
        <div class="brand-title">${escapeHtml(storeName)}</div>
        <div class="brand-sub">Product Price Catalog</div>
      </div>

      <div class="meta">
        <b>Date:</b> ${escapeHtml(today)}<br/>
        <b>Total Products:</b> ${selectedRows.length}<br/>
        <span class="badge">Selling Price PDF</span>
      </div>
    </div>

    <table class="info-table">
      <tr>
        <td><b>Store</b><br/>${escapeHtml(storeName)}</td>
        <td><b>Selected Products</b><br/>${selectedRows.length}</td>
        <td><b>Generated</b><br/>${escapeHtml(today)}</td>
      </tr>
    </table>

    <div class="section-title">Products & Selling Prices</div>

    <table class="data-table">
      <thead>
        <tr>
          <th style="width:6%">#</th>
          <th style="width:64%">Product</th>
          <th style="width:30%" class="right">Selling Price</th>
        </tr>
      </thead>
      <tbody>
        ${tableRows || `<tr><td colspan="3">No products selected.</td></tr>`}
      </tbody>
    </table>

    <div class="footer">
      Generated by ZETRA BMS • Price Catalog
    </div>
  </div>
</body>
</html>
`;
  }, [selectedRows, storeName]);

  const sharePdf = async () => {
    if (selectedRows.length === 0) {
      Alert.alert("No products selected", "Chagua bidhaa angalau moja kwanza.");
      return;
    }

    setPrinting(true);
    try {
      const html = generateHtml();

      if (printHtmlPdfOnWeb(html)) return;

      const file = await Print.printToFileAsync({
        html,
        base64: false,
      });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(file.uri, {
          mimeType: "application/pdf",
          dialogTitle: `${storeName} Price Catalog`,
          UTI: "com.adobe.pdf",
        });
      } else {
        await Print.printAsync({ uri: file.uri });
      }
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
                <Text style={{ color: TEXT, fontWeight: "900", fontSize: 12.5 }}>
                  ← Back
                </Text>
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

            <Card style={{ gap: 12, backgroundColor: "#FFFFFF", borderColor: BORDER_SOFT }}>
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
                <View style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: "rgba(16,185,129,0.28)", backgroundColor: SELECTED_BG }}>
                  <Text style={{ color: EMERALD, fontWeight: "900", fontSize: 11.5 }}>
                    Selected {selectedRows.length}
                  </Text>
                </View>

                <View style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: BORDER_SOFT, backgroundColor: "#FFFFFF" }}>
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

              <View style={{ borderWidth: 1, borderColor: BORDER_SOFT, borderRadius: 16, backgroundColor: "#FFFFFF", paddingHorizontal: 12, paddingVertical: 4 }}>
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
            <Pressable
              onPress={() => toggleOne(item.id)}
              style={({ pressed }) => ({ opacity: pressed ? 0.88 : 1 })}
            >
              <Card
                style={{
                  borderColor: isSelected ? SELECTED_BORDER : "#C7D2E1",
                  backgroundColor: isSelected ? SELECTED_BG : DARK_CARD,
                  paddingVertical: 12,
                  paddingHorizontal: 12,
                }}
              >
                <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                  <View
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: isSelected ? "rgba(16,185,129,0.45)" : BORDER_SOFT,
                      backgroundColor: isSelected ? "rgba(16,185,129,0.14)" : "rgba(255,255,255,0.05)",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Text style={{ color: isSelected ? EMERALD : "#FFFFFF", fontWeight: "900", fontSize: 12 }}>
                      {isSelected ? "✓" : index + 1}
                    </Text>
                  </View>

                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ color: isSelected ? TEXT : "#FFFFFF", fontWeight: "900", fontSize: 14.5 }} numberOfLines={1}>
                      {item.name}
                    </Text>
                    <Text style={{ color: isSelected ? MUTED : "rgba(255,255,255,0.72)", fontWeight: "800", marginTop: 4, fontSize: 11.5 }} numberOfLines={1}>
                      SKU: {item.sku || "—"}
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