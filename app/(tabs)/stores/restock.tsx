import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  Pressable,
  Share,
  Text,
  TextInput,
  View,
} from "react-native";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";

import { supabase } from "../../../src/supabase/supabaseClient";
import { Card } from "../../../src/ui/Card";
import { Screen } from "../../../src/ui/Screen";
import { theme } from "../../../src/ui/theme";

type RestockRow = {
  product_id: string;
  product_name: string;
  sku: string | null;
  current_qty: number;
  alert_level: number;
  suggested_qty: number;
  stock_status: "LOW_STOCK" | "OUT_OF_STOCK" | string;
  order_qty: string;
  included: boolean;
  is_custom?: boolean;
};

function num(x: any) {
  const n = Number(x ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function clean(s: any) {
  return String(s ?? "").trim();
}

function escapeHtml(s: any) {
  return String(s ?? "")
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

export default function RestockScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    orgId?: string;
    storeId?: string;
    storeName?: string;
  }>();

  const orgId = clean(params?.orgId);
  const storeId = clean(params?.storeId);
  const storeName = clean(params?.storeName) || "Store";

  const C: any = (theme as any)?.colors ?? {};
  const col = (key: string, fallback: string) => {
    const v = C?.[key];
    return typeof v === "string" && v.trim() ? v : fallback;
  };

  const TEXT = col("text", "#EAF2FF");
  const MUTED = col("muted", "rgba(234,242,255,0.70)");
  const FAINT = col("faint", MUTED);
  const BORDER_SOFT = col("borderSoft", "rgba(255,255,255,0.10)");
  const EMERALD = col("emerald", "#34D399");

  const [rows, setRows] = useState<RestockRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [customName, setCustomName] = useState("");
  const [customSku, setCustomSku] = useState("");
  const [customQty, setCustomQty] = useState("");

  const loadData = useCallback(async () => {
    if (!orgId || !storeId) return;

    setLoading(true);
    try {
      const { data, error } = await supabase.rpc("get_restock_suggestions_v1", {
        p_org_id: orgId,
        p_store_id: storeId,
      });

      if (error) throw error;

      const mapped: RestockRow[] = (Array.isArray(data) ? data : []).map((r: any) => {
        const suggested = Math.max(num(r?.suggested_qty), 1);

        return {
          product_id: clean(r?.product_id),
          product_name: clean(r?.product_name) || "Product",
          sku: clean(r?.sku) || null,
          current_qty: num(r?.current_qty),
          alert_level: num(r?.alert_level),
          suggested_qty: suggested,
          stock_status: clean(r?.stock_status) || "LOW_STOCK",
          order_qty: String(suggested),
          included: true,
          is_custom: false,
        };
      });

      setRows(mapped);
    } catch (err: any) {
      Alert.alert("Failed", err?.message ?? "Imeshindikana kupakia restock list.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [orgId, storeId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const validItems = useMemo(() => {
    return rows
      .map((r) => ({
        product_id: r.is_custom ? "" : r.product_id,
        product_name: r.product_name,
        sku: r.sku,
        order_qty: num(r.order_qty),
        included: r.included,
        is_custom: !!r.is_custom,
      }))
      .filter((r) => r.included && clean(r.product_name) && r.order_qty > 0);
  }, [rows]);

  const totalQty = useMemo(
    () => validItems.reduce((sum, r) => sum + num(r.order_qty), 0),
    [validItems]
  );

  const orderText = useMemo(() => {
    const lines = validItems.map((r, index) => {
      const sku = r.sku ? ` | SKU: ${r.sku}` : "";
      const tag = r.is_custom ? " | Custom" : "";
      return `${index + 1}. ${r.product_name}${sku}${tag} - Qty ${r.order_qty}`;
    });

    return [
      `RESTOCK ORDER - ${storeName}`,
      "",
      ...lines,
      "",
      `Total Items: ${validItems.length}`,
      `Total Qty: ${totalQty}`,
      "",
      "Generated by ZETRA BMS",
    ].join("\n");
  }, [storeName, validItems, totalQty]);

  const updateQty = useCallback((productId: string, value: string) => {
    const cleaned = value.replace(/[^\d.]/g, "");
    setRows((prev) =>
      prev.map((r) => (r.product_id === productId ? { ...r, order_qty: cleaned } : r))
    );
  }, []);

  const toggleIncluded = useCallback((productId: string) => {
    setRows((prev) =>
      prev.map((r) => (r.product_id === productId ? { ...r, included: !r.included } : r))
    );
  }, []);

  const removeCustom = useCallback((productId: string) => {
    setRows((prev) => prev.filter((r) => r.product_id !== productId));
  }, []);

  const addCustomItem = useCallback(() => {
    const name = clean(customName);
    const qty = num(customQty);

    if (!name) {
      Alert.alert("Missing item", "Andika jina la item.");
      return;
    }

    if (qty <= 0) {
      Alert.alert("Invalid qty", "Weka quantity kubwa kuliko 0.");
      return;
    }

    const id = `custom-${Date.now()}-${Math.random().toString(16).slice(2)}`;

    setRows((prev) => [
      ...prev,
      {
        product_id: id,
        product_name: name,
        sku: clean(customSku) || null,
        current_qty: 0,
        alert_level: 0,
        suggested_qty: qty,
        stock_status: "CUSTOM_ITEM",
        order_qty: String(qty),
        included: true,
        is_custom: true,
      },
    ]);

    setCustomName("");
    setCustomSku("");
    setCustomQty("");
  }, [customName, customSku, customQty]);

  const placeOrder = useCallback(async () => {
    if (!orgId || !storeId) {
      Alert.alert("Missing data", "Organization au store haijapatikana.");
      return;
    }

    if (validItems.length === 0) {
      Alert.alert("No items", "Chagua item angalau moja na quantity iwe zaidi ya 0.");
      return;
    }

    setSaving(true);
    try {
      const payload = validItems.map((r) => ({
        product_id: r.product_id || null,
        product_name: r.product_name,
        sku: r.sku,
        order_qty: r.order_qty,
      }));

      const { error } = await supabase.rpc("create_purchase_order_from_restock_v1", {
        p_org_id: orgId,
        p_store_id: storeId,
        p_items: payload,
        p_supplier_name: null,
        p_notes: "Created from Restock Assistant",
      });

      if (error) throw error;

      Alert.alert("Order Created", "Purchase order imehifadhiwa kwenye database.", [
        { text: "OK" },
        {
          text: "Share",
          onPress: () => {
            void Share.share({ message: orderText });
          },
        },
      ]);
    } catch (err: any) {
      Alert.alert("Failed", err?.message ?? "Imeshindikana ku-create order.");
    } finally {
      setSaving(false);
    }
  }, [orgId, storeId, validItems, orderText]);

  const shareText = useCallback(async () => {
    if (validItems.length === 0) {
      Alert.alert("No items", "Hakuna bidhaa zilizochaguliwa za kushare.");
      return;
    }

    await Share.share({
      title: `Restock Order - ${storeName}`,
      message: orderText,
    });
  }, [validItems.length, orderText, storeName]);

  const sharePdf = useCallback(async () => {
    if (validItems.length === 0) {
      Alert.alert("No items", "Hakuna bidhaa zilizochaguliwa za kuweka kwenye PDF.");
      return;
    }

    try {
      const htmlRows = validItems
        .map(
          (r, i) => `
            <tr>
              <td>${i + 1}</td>
              <td><b>${escapeHtml(r.product_name)}</b></td>
              <td>${escapeHtml(r.sku || "—")}</td>
              <td>${r.is_custom ? "Custom" : "Inventory"}</td>
              <td class="right">${escapeHtml(String(r.order_qty))}</td>
            </tr>
          `
        )
        .join("");

      const html = `
<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Restock Order - ${escapeHtml(storeName)}</title>
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

    .page { width: 100%; background: #ffffff; }

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

    .data-table th, .data-table td {
      border: 1px solid #cbd5e1;
      padding: 5px;
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

    .data-table td { font-size: 9px; }

    .section-title {
      font-size: 12px;
      font-weight: 900;
      text-transform: uppercase;
      margin: 13px 0 6px;
      border-bottom: 1px solid #cbd5e1;
      padding-bottom: 4px;
    }

    .right {
      text-align: right;
      white-space: nowrap;
    }

    .total-box {
      margin-top: 12px;
      border: 1.5px solid #10b981;
      background: #ecfdf5;
      padding: 10px;
      page-break-inside: avoid;
      break-inside: avoid;
    }

    .total-label {
      color: #047857;
      font-weight: 900;
      font-size: 10px;
      text-transform: uppercase;
    }

    .total-value {
      font-size: 20px;
      font-weight: 900;
      margin-top: 3px;
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
        <div class="brand-title">Restock Order</div>
        <div class="brand-sub">Restock Assistant & Place Order</div>
      </div>

      <div class="meta">
        <b>Store:</b> ${escapeHtml(storeName)}<br/>
        <b>Generated:</b> ${escapeHtml(new Date().toLocaleString())}<br/>
        <span class="badge">${validItems.length} Selected • Qty ${totalQty}</span>
      </div>
    </div>

    <table class="info-table">
      <tr>
        <td><b>Store</b><br/>${escapeHtml(storeName)}</td>
        <td><b>Total Items</b><br/>${validItems.length}</td>
        <td><b>Total Qty</b><br/>${totalQty}</td>
      </tr>
    </table>

    <div class="section-title">Order Items</div>

    <table class="data-table">
      <thead>
        <tr>
          <th style="width:5%">#</th>
          <th style="width:42%">Product</th>
          <th style="width:23%">SKU / Note</th>
          <th style="width:17%">Type</th>
          <th style="width:13%" class="right">Qty</th>
        </tr>
      </thead>
      <tbody>${htmlRows}</tbody>
    </table>

    <div class="total-box">
      <div class="total-label">Total Order Qty</div>
      <div class="total-value">${totalQty}</div>
    </div>

    <div class="footer">Generated by ZETRA BMS • Restock Assistant</div>
  </div>
</body>
</html>
`;

      if (printHtmlPdfOnWeb(html)) return;

      const file = await Print.printToFileAsync({ html });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(file.uri, {
          mimeType: "application/pdf",
          dialogTitle: "Share Restock Order PDF",
          UTI: "com.adobe.pdf",
        });
      } else {
        await Print.printAsync({ uri: file.uri });
      }
    } catch (e: any) {
      Alert.alert("PDF Failed", e?.message ?? "Imeshindikana kutengeneza PDF.");
    }
  }, [validItems, storeName, totalQty]);

  return (
    <Screen
      scroll={false}
      contentStyle={{
        paddingHorizontal: 0,
        paddingTop: 0,
        paddingBottom: 0,
      }}
    >
      <FlatList
        data={rows}
        keyExtractor={(item) => item.product_id}
        onRefresh={() => void loadData()}
        refreshing={loading}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: 16,
          paddingBottom: 160,
          gap: 10,
        }}
        ListHeaderComponent={
          <View style={{ gap: 12, marginBottom: 12 }}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
              }}
            >
              <Pressable
                onPress={() => router.back()}
                style={({ pressed }) => ({
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: BORDER_SOFT,
                  backgroundColor: "rgba(255,255,255,0.05)",
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
                onPress={() => void loadData()}
                style={({ pressed }) => ({
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: BORDER_SOFT,
                  backgroundColor: "rgba(255,255,255,0.05)",
                  paddingVertical: 9,
                  paddingHorizontal: 14,
                  opacity: pressed ? 0.9 : 1,
                })}
              >
                <Text style={{ color: TEXT, fontWeight: "900", fontSize: 12.5 }}>
                  Refresh
                </Text>
              </Pressable>
            </View>

            <Card style={{ gap: 12 }}>
              <Text
                style={{
                  color: FAINT,
                  fontWeight: "900",
                  fontSize: 10.5,
                  letterSpacing: 1,
                }}
              >
                RESTOCK ASSISTANT
              </Text>

              <Text
                style={{
                  color: TEXT,
                  fontWeight: "900",
                  fontSize: 22,
                  letterSpacing: 0.2,
                }}
              >
                Restock Assistant & Place Order
              </Text>

              <Text
                style={{
                  color: MUTED,
                  fontWeight: "800",
                  lineHeight: 19,
                  fontSize: 12.5,
                }}
              >
                Chagua bidhaa unazotaka ziingie kwenye order. Zima item usiyoitaka,
                ongeza custom item, kisha share WhatsApp/PDF au save order.
              </Text>

              <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
                <View
                  style={{
                    paddingHorizontal: 12,
                    paddingVertical: 7,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: "rgba(16,185,129,0.28)",
                    backgroundColor: "rgba(16,185,129,0.10)",
                  }}
                >
                  <Text style={{ color: EMERALD, fontWeight: "900", fontSize: 11.5 }}>
                    {validItems.length} Selected
                  </Text>
                </View>

                <View
                  style={{
                    paddingHorizontal: 12,
                    paddingVertical: 7,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: BORDER_SOFT,
                    backgroundColor: "rgba(255,255,255,0.06)",
                  }}
                >
                  <Text style={{ color: TEXT, fontWeight: "900", fontSize: 11.5 }}>
                    Order Qty {totalQty}
                  </Text>
                </View>
              </View>

              <View style={{ flexDirection: "row", gap: 8 }}>
                <Pressable
                  onPress={placeOrder}
                  disabled={saving || loading}
                  style={({ pressed }) => ({
                    flex: 1,
                    borderRadius: 16,
                    paddingVertical: 12,
                    alignItems: "center",
                    backgroundColor: EMERALD,
                    opacity: pressed || saving || loading ? 0.75 : 1,
                  })}
                >
                  <Text style={{ color: "#06130E", fontWeight: "900", fontSize: 12.5 }}>
                    {saving ? "Saving..." : "Place Order"}
                  </Text>
                </Pressable>

                <Pressable
                  onPress={shareText}
                  style={({ pressed }) => ({
                    borderRadius: 16,
                    borderWidth: 1,
                    borderColor: BORDER_SOFT,
                    paddingVertical: 12,
                    paddingHorizontal: 14,
                    alignItems: "center",
                    backgroundColor: "rgba(255,255,255,0.06)",
                    opacity: pressed ? 0.85 : 1,
                  })}
                >
                  <Text style={{ color: TEXT, fontWeight: "900", fontSize: 12.5 }}>
                    Share
                  </Text>
                </Pressable>

                <Pressable
                  onPress={sharePdf}
                  style={({ pressed }) => ({
                    borderRadius: 16,
                    borderWidth: 1,
                    borderColor: BORDER_SOFT,
                    paddingVertical: 12,
                    paddingHorizontal: 14,
                    alignItems: "center",
                    backgroundColor: "rgba(255,255,255,0.06)",
                    opacity: pressed ? 0.85 : 1,
                  })}
                >
                  <Text style={{ color: TEXT, fontWeight: "900", fontSize: 12.5 }}>
                    PDF
                  </Text>
                </Pressable>
              </View>
            </Card>

            <Card style={{ gap: 10 }}>
              <Text style={{ color: TEXT, fontWeight: "900", fontSize: 15 }}>
                Add Custom Item
              </Text>

              <TextInput
                value={customName}
                onChangeText={setCustomName}
                placeholder="Item name e.g Packaging bags"
                placeholderTextColor="rgba(234,242,255,0.35)"
                style={{
                  borderWidth: 1,
                  borderColor: BORDER_SOFT,
                  borderRadius: 14,
                  backgroundColor: "rgba(255,255,255,0.05)",
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  color: TEXT,
                  fontWeight: "800",
                }}
              />

              <View style={{ flexDirection: "row", gap: 8 }}>
                <TextInput
                  value={customSku}
                  onChangeText={setCustomSku}
                  placeholder="SKU / note"
                  placeholderTextColor="rgba(234,242,255,0.35)"
                  style={{
                    flex: 1,
                    borderWidth: 1,
                    borderColor: BORDER_SOFT,
                    borderRadius: 14,
                    backgroundColor: "rgba(255,255,255,0.05)",
                    paddingHorizontal: 12,
                    paddingVertical: 10,
                    color: TEXT,
                    fontWeight: "800",
                  }}
                />

                <TextInput
                  value={customQty}
                  onChangeText={(v) => setCustomQty(v.replace(/[^\d.]/g, ""))}
                  placeholder="Qty"
                  keyboardType="numeric"
                  placeholderTextColor="rgba(234,242,255,0.35)"
                  style={{
                    width: 86,
                    borderWidth: 1,
                    borderColor: BORDER_SOFT,
                    borderRadius: 14,
                    backgroundColor: "rgba(255,255,255,0.05)",
                    paddingHorizontal: 12,
                    paddingVertical: 10,
                    color: TEXT,
                    fontWeight: "900",
                    textAlign: "center",
                  }}
                />
              </View>

              <Pressable
                onPress={addCustomItem}
                style={({ pressed }) => ({
                  borderRadius: 16,
                  paddingVertical: 12,
                  alignItems: "center",
                  backgroundColor: "rgba(16,185,129,0.14)",
                  borderWidth: 1,
                  borderColor: "rgba(16,185,129,0.32)",
                  opacity: pressed ? 0.85 : 1,
                })}
              >
                <Text style={{ color: EMERALD, fontWeight: "900", fontSize: 12.5 }}>
                  + Add Item to Order
                </Text>
              </Pressable>
            </Card>
          </View>
        }
        ListEmptyComponent={
          loading ? (
            <View style={{ paddingTop: 24, alignItems: "center" }}>
              <ActivityIndicator />
              <Text style={{ color: MUTED, fontWeight: "800", marginTop: 10 }}>
                Loading restock list...
              </Text>
            </View>
          ) : (
            <Card>
              <Text style={{ color: TEXT, fontWeight: "900", fontSize: 15 }}>
                No restock needed
              </Text>
              <Text style={{ color: MUTED, fontWeight: "800", marginTop: 6, lineHeight: 20 }}>
                Unaweza kuongeza custom items hapo juu kama unahitaji kuandika order.
              </Text>
            </Card>
          )
        }
        renderItem={({ item, index }) => {
          const danger = item.stock_status === "OUT_OF_STOCK" || item.current_qty <= 0;
          const muted = !item.included;

          return (
            <Card
              style={{
                borderColor: muted
                  ? "rgba(255,255,255,0.06)"
                  : danger
                  ? "rgba(239,68,68,0.28)"
                  : BORDER_SOFT,
                backgroundColor: muted
                  ? "#F8FAFC"
                  : danger
                  ? "#FFF1F2"
                  : item.is_custom
                  ? "#ECFDF5"
                  : "#F8FAFC",
                paddingVertical: 12,
                paddingHorizontal: 12,
                opacity: muted ? 0.62 : 1,
              }}
            >
              <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
                <View
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: BORDER_SOFT,
                    backgroundColor: "rgba(255,255,255,0.05)",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Text style={{ color: "#0F172A", fontWeight: "900", fontSize: 12 }}>
                    {index + 1}
                  </Text>
                </View>

                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text
                    style={{
                      color: "#0F172A",
                      fontWeight: "900",
                      fontSize: 14.5,
                    }}
                    numberOfLines={1}
                  >
                    {item.product_name}
                  </Text>

                  <Text
                    style={{
                      color: "#64748B",
                      fontWeight: "800",
                      marginTop: 4,
                      fontSize: 11.5,
                    }}
                    numberOfLines={1}
                  >
                    {item.is_custom
                      ? `Custom • ${item.sku || "No note"}`
                      : `SKU: ${item.sku || "—"} • Qty ${item.current_qty} • Alert ${item.alert_level}`}
                  </Text>

                  <Text
                    style={{
                      color: item.is_custom ? "#047857" : danger ? "#DC2626" : "#B45309",
                      fontWeight: "900",
                      marginTop: 4,
                      fontSize: 11,
                    }}
                  >
                    {item.is_custom ? "CUSTOM ITEM" : danger ? "OUT OF STOCK" : "LOW STOCK"}
                  </Text>
                </View>

                <View
                  style={{
                    width: 74,
                    borderRadius: 14,
                    borderWidth: 1,
                    borderColor: "rgba(15,23,42,0.10)",
                    backgroundColor: "#FFFFFF",
                    paddingHorizontal: 8,
                    paddingVertical: 2,
                  }}
                >
                  <TextInput
                    value={item.order_qty}
                    onChangeText={(v) => updateQty(item.product_id, v)}
                    keyboardType="numeric"
                    placeholder="Qty"
                    placeholderTextColor="#94A3B8"
                    style={{
                      color: "#0F172A",
                      fontWeight: "900",
                      textAlign: "center",
                      paddingVertical: 8,
                      fontSize: 13,
                    }}
                  />
                </View>
              </View>

              <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
                <Pressable
                  onPress={() => toggleIncluded(item.product_id)}
                  style={({ pressed }) => ({
                    flex: 1,
                    borderRadius: 14,
                    paddingVertical: 10,
                    alignItems: "center",
                    borderWidth: 1,
                    borderColor: item.included
                      ? "rgba(16,185,129,0.32)"
                      : "rgba(239,68,68,0.28)",
                    backgroundColor: item.included
                      ? "rgba(16,185,129,0.10)"
                      : "rgba(239,68,68,0.08)",
                    opacity: pressed ? 0.85 : 1,
                  })}
                >
                  <Text
                    style={{
                      color: item.included ? EMERALD : "#F87171",
                      fontWeight: "900",
                      fontSize: 12,
                    }}
                  >
                    {item.included ? "Included" : "Excluded"}
                  </Text>
                </Pressable>

                {item.is_custom ? (
                  <Pressable
                    onPress={() => removeCustom(item.product_id)}
                    style={({ pressed }) => ({
                      borderRadius: 14,
                      paddingVertical: 10,
                      paddingHorizontal: 14,
                      alignItems: "center",
                      borderWidth: 1,
                      borderColor: "rgba(239,68,68,0.28)",
                      backgroundColor: "rgba(239,68,68,0.08)",
                      opacity: pressed ? 0.85 : 1,
                    })}
                  >
                    <Text style={{ color: "#F87171", fontWeight: "900", fontSize: 12 }}>
                      Remove
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            </Card>
          );
        }}
      />
    </Screen>
  );
}