import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";

import { useOrg } from "../../../src/context/OrgContext";
import { supabase } from "../../../src/supabase/supabaseClient";
import { Card } from "../../../src/ui/Card";
import { Screen } from "../../../src/ui/Screen";
import { StoreGuard } from "../../../src/ui/StoreGuard";
import { UI } from "../../../src/ui/theme";
import { formatMoney } from "../../../src/ui/money";

type CapitalRecoveryHistoryRow = {
  id: string;
  entry_type: "ASSET" | "COST" | "INCOME";
  amount: number;
  note: string | null;
  created_at: string;
  created_by?: string | null;
};

type EntryMethod = "MANUAL" | "PRODUCTS";

type ProductRow = {
  id: string;
  store_id?: string | null;
  name: string;
  selling_price: number | null;
  cost_price: number | null;
  is_active?: boolean;
};

type ProductPickRow = {
  product_id: string;
  quantity: string;
};

function toNum(x: any) {
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
}

function toInt(x: any) {
  const n = Number(x);
  if (!Number.isFinite(n)) return 0;
  return Math.trunc(n);
}

function clean(v: any) {
  return String(v ?? "").trim();
}

function fmtLocal(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  try {
    return d.toLocaleString();
  } catch {
    return iso;
  }
}

function MiniStat({
  label,
  value,
  hint,
  multilineValue = false,
}: {
  label: string;
  value: string;
  hint?: string;
  multilineValue?: boolean;
}) {
  return (
    <View style={{ flex: 1, gap: 4, minWidth: 0 }}>
      <Text
        style={{ color: UI.muted, fontWeight: "800", fontSize: 12 }}
        numberOfLines={1}
      >
        {label}
      </Text>

      <Text
        style={{ color: UI.text, fontWeight: "900", fontSize: 16, lineHeight: 20 }}
        numberOfLines={multilineValue ? 2 : 1}
        adjustsFontSizeToFit={!multilineValue}
        minimumFontScale={0.75}
        allowFontScaling={false}
      >
        {value}
      </Text>

      {!!hint && (
        <Text
          style={{ color: UI.faint, fontWeight: "800", fontSize: 12 }}
          numberOfLines={1}
        >
          {hint}
        </Text>
      )}
    </View>
  );
}

export default function CapitalRecoveryWorkspaceScreen() {
  const router = useRouter();
  const { activeOrgId, activeOrgName, activeStoreName, activeStoreId, refresh } = useOrg();

  const [entryType, setEntryType] = useState<"ASSET" | "COST" | "INCOME">("ASSET");
  const [entryMethod, setEntryMethod] = useState<EntryMethod>("MANUAL");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const [productsLoading, setProductsLoading] = useState(false);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [productItems, setProductItems] = useState<ProductPickRow[]>([]);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerSearch, setPickerSearch] = useState("");
  const [pickerTargetIndex, setPickerTargetIndex] = useState<number | null>(null);

  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [history, setHistory] = useState<CapitalRecoveryHistoryRow[]>([]);

  const storeId = String(activeStoreId ?? "").trim();

  const amountNum = toNum(String(amount).replace(/,/g, "").trim());

  const productModeEnabled = entryType === "COST" || entryType === "INCOME";

 const eligibleProducts = useMemo(() => {
    return products.filter((p) => {
      if (entryType === "COST") return toNum(p.cost_price) > 0;
      if (entryType === "INCOME") return toNum(p.selling_price) > 0;
      return false;
    });
  }, [entryType, products]);

  const filteredEligibleProducts = useMemo(() => {
    const q = clean(pickerSearch).toLowerCase();
    if (!q) return eligibleProducts;

    return eligibleProducts.filter((p) => clean(p.name).toLowerCase().includes(q));
  }, [eligibleProducts, pickerSearch]);

  const selectedProductItems = useMemo(() => {
    return productItems
      .map((item) => {
        const product = products.find((p) => p.id === item.product_id);
        const qty = toNum(item.quantity);
        const unitPrice =
          entryType === "COST"
            ? toNum(product?.cost_price)
            : toNum(product?.selling_price);

        return {
          product_id: item.product_id,
          product_name: String(product?.name ?? "").trim(),
          quantity: qty,
          unit_price: unitPrice,
          line_total: qty > 0 ? qty * unitPrice : 0,
        };
      })
      .filter((item) => item.product_id && item.product_name && item.quantity > 0 && item.unit_price > 0);
  }, [entryType, productItems, products]);

  const productModeTotal = useMemo(() => {
    return selectedProductItems.reduce((sum, item) => sum + toNum(item.line_total), 0);
  }, [selectedProductItems]);

  const canSave =
    entryMethod === "MANUAL"
      ? amountNum > 0
      : selectedProductItems.length > 0 && productModeTotal > 0;

  const previewTitle =
    entryType === "ASSET"
      ? "Asset Entry Preview"
      : entryType === "COST"
      ? "Operating Cost Preview"
      : "Income Entry Preview";

  const previewHint =
    entryType === "ASSET"
      ? "Hii itaingia upande wa mtaji/asset."
      : entryType === "COST"
      ? "Hii itaingia upande wa gharama za uendeshaji."
      : "Hii itaingia upande wa mapato/income.";

  const previewAmountValue = entryMethod === "MANUAL" ? amountNum : productModeTotal;

  const formattedPreviewAmount = formatMoney(previewAmountValue, {
    currency: "TZS",
    locale: "en-TZ",
  }).replace(/\s+/g, " ");

  const loadProducts = useCallback(async () => {
    const orgId = String(activeOrgId ?? "").trim();

    if (!storeId || !orgId) {
      setProducts([]);
      return;
    }

    setProductsLoading(true);
    try {
     const { data, error } = await supabase.rpc("get_products_manage", {
  p_org_id: orgId,
  p_store_id: storeId,
});

      if (error) throw error;

      const rows = Array.isArray(data) ? data : [];
     setProducts(
  rows
    .map((r: any) => ({
      id: String(r?.id ?? ""),
      store_id: clean(r?.store_id) || null,
      name: clean(r?.name),
      selling_price: r?.selling_price == null ? null : toNum(r?.selling_price),
      cost_price: r?.cost_price == null ? null : toNum(r?.cost_price),
      is_active: !!r?.is_active,
    }))
    .filter((r) => r.id && r.name && r.is_active !== false)
);
    } catch (e) {
      setProducts([]);
    } finally {
      setProductsLoading(false);
    }
  }, [activeOrgId, storeId]);

  const loadHistory = useCallback(async () => {
    if (!storeId) {
      setHistory([]);
      setHistoryError("No active Capital Recovery store selected");
      return;
    }

    setHistoryLoading(true);
    setHistoryError(null);

    try {
      const { data, error } = await supabase.rpc("get_capital_recovery_history_v1", {
        p_store_id: storeId,
        p_limit: 100,
      });

      if (error) throw error;

      const rows = (Array.isArray(data) ? data : []) as any[];

      setHistory(
        rows.map((r) => ({
          id: String(r?.id ?? ""),
          entry_type: String(r?.entry_type ?? "ASSET").toUpperCase() as
            | "ASSET"
            | "COST"
            | "INCOME",
          amount: toNum(r?.amount),
          note: clean(r?.note) || null,
          created_at: String(r?.created_at ?? ""),
          created_by: clean(r?.created_by) || null,
        }))
      );
    } catch (e: any) {
      setHistoryError(clean(e?.message) || "Failed to load Capital Recovery history");
      setHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  }, [storeId]);

  useEffect(() => {
    void loadHistory();
    void loadProducts();
  }, [loadHistory, loadProducts]);

  useFocusEffect(
    useCallback(() => {
      void loadHistory();
      void loadProducts();
    }, [loadHistory, loadProducts])
  );

  useEffect(() => {
    if (entryType === "ASSET") {
      setEntryMethod("MANUAL");
      setProductItems([]);
    }
  }, [entryType]);

  const report = useMemo(() => {
    const base = {
      ASSET: { count: 0, amount: 0 },
      COST: { count: 0, amount: 0 },
      INCOME: { count: 0, amount: 0 },
    };

    for (const item of history) {
      base[item.entry_type].count += 1;
      base[item.entry_type].amount += toNum(item.amount);
    }

    return base;
  }, [history]);

  const latestEntry = history[0] ?? null;

  const onSaveEntry = useCallback(async () => {
    if (!storeId) {
      Alert.alert("Missing Store", "Hakuna active Capital Recovery store.");
      return;
    }

    if (!canSave) {
      Alert.alert(
        "Invalid Entry",
        entryMethod === "MANUAL"
          ? "Weka amount sahihi zaidi ya sifuri."
          : "Chagua product angalau moja yenye quantity sahihi."
      );
      return;
    }

    setSaving(true);
    try {
      if (entryMethod === "MANUAL") {
        const { error } = await supabase.rpc("create_capital_recovery_entry", {
          p_store_id: storeId,
          p_entry_type: entryType,
          p_amount: amountNum,
          p_note: clean(note) || null,
        });

        if (error) throw error;
      } else {
        const payload = selectedProductItems.map((item) => ({
          product_id: item.product_id,
          quantity: item.quantity,
        }));

        const { error } = await supabase.rpc("create_capital_recovery_entry_items_v1", {
          p_store_id: storeId,
          p_entry_type: entryType,
          p_items: payload,
          p_note: clean(note) || null,
        });

        if (error) throw error;
      }

      setAmount("");
      setNote("");
      setProductItems([]);
      await Promise.resolve(refresh());
      await loadHistory();
      await loadProducts();

      Alert.alert(
        "Success ✅",
        `${entryType} entry imehifadhiwa vizuri (${entryMethod === "MANUAL" ? "manual" : "products"}).`
      );
    } catch (e: any) {
      Alert.alert("Save failed", clean(e?.message) || "Unknown error");
    } finally {
      setSaving(false);
    }
  }, [
    storeId,
    canSave,
    entryMethod,
    entryType,
    amountNum,
    note,
    selectedProductItems,
    refresh,
    loadHistory,
    loadProducts,
  ]);

  const openAddProductPicker = useCallback(() => {
    if (productsLoading || eligibleProducts.length === 0) return;
    setPickerTargetIndex(null);
    setPickerSearch("");
    setPickerOpen(true);
  }, [eligibleProducts.length, productsLoading]);

  const openChangeProductPicker = useCallback(
    (index: number) => {
      if (productsLoading || eligibleProducts.length === 0) return;
      setPickerTargetIndex(index);
      setPickerSearch("");
      setPickerOpen(true);
    },
    [eligibleProducts.length, productsLoading]
  );

  const closeProductPicker = useCallback(() => {
    setPickerOpen(false);
    setPickerSearch("");
    setPickerTargetIndex(null);
  }, []);

  const selectProductFromPicker = useCallback(
    (productId: string) => {
      setProductItems((prev) => {
        const pid = String(productId ?? "").trim();
        if (!pid) return prev;

        // ADD NEW PRODUCT
        if (pickerTargetIndex == null) {
          const existingIndex = prev.findIndex((row) => row.product_id === pid);
          if (existingIndex >= 0) {
            return prev.map((row, i) =>
              i === existingIndex
                ? { ...row, quantity: String(Math.max(1, toNum(row.quantity)) + 1) }
                : row
            );
          }

          return [...prev, { product_id: pid, quantity: "1" }];
        }

        // CHANGE EXISTING ROW PRODUCT
        const currentRow = prev[pickerTargetIndex];
        if (!currentRow) return prev;

        const currentQty = Math.max(1, toNum(currentRow.quantity));
        const existingIndex = prev.findIndex(
          (row, i) => i !== pickerTargetIndex && row.product_id === pid
        );

        if (existingIndex >= 0) {
          return prev
            .map((row, i) =>
              i === existingIndex
                ? { ...row, quantity: String(Math.max(1, toNum(row.quantity)) + currentQty) }
                : row
            )
            .filter((_, i) => i !== pickerTargetIndex);
        }

        return prev.map((row, i) =>
          i === pickerTargetIndex ? { ...row, product_id: pid } : row
        );
      });

      closeProductPicker();
    },
    [closeProductPicker, pickerTargetIndex]
  );

  const updateProductRow = useCallback(
    (index: number, patch: Partial<ProductPickRow>) => {
      setProductItems((prev) =>
        prev.map((row, i) => (i === index ? { ...row, ...patch } : row))
      );
    },
    []
  );

  const removeProductRow = useCallback((index: number) => {
    setProductItems((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const Pill = ({
    title,
    active,
    onPress,
  }: {
    title: string;
    active: boolean;
    onPress: () => void;
  }) => {
    return (
      <Pressable
        onPress={onPress}
        hitSlop={10}
        style={({ pressed }) => ({
          flex: 1,
          minWidth: 96,
          minHeight: 50,
          paddingHorizontal: 12,
          paddingVertical: 12,
          borderRadius: 16,
          borderWidth: 1,
          borderColor: active ? "rgba(16,185,129,0.40)" : "rgba(255,255,255,0.10)",
          backgroundColor: active ? "rgba(16,185,129,0.18)" : "rgba(255,255,255,0.05)",
          alignItems: "center",
          justifyContent: "center",
          opacity: pressed ? 0.92 : 1,
          transform: pressed ? [{ scale: 0.985 }] : [{ scale: 1 }],
        })}
      >
        <Text style={{ color: UI.text, fontWeight: "900", fontSize: 13 }}>{title}</Text>
      </Pressable>
    );
  };

  const fmt = (n: number) =>
    formatMoney(n, {
      currency: "TZS",
      locale: "en-TZ",
    }).replace(/\s+/g, " ");

  return (
    <Screen scroll={false} contentStyle={{ paddingTop: 0, paddingHorizontal: 0, paddingBottom: 0 }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior="height"
        keyboardVerticalOffset={0}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="none"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            paddingTop: 14,
            paddingHorizontal: 16,
            paddingBottom: 24,
          }}
        >
          <StoreGuard>
            <Card
              style={{
                gap: 16,
                borderRadius: 24,
                borderColor: "rgba(16,185,129,0.24)",
                backgroundColor: "rgba(15,18,24,0.98)",
                overflow: "hidden",
              }}
            >
          <View
            pointerEvents="none"
            style={{
              position: "absolute",
              top: -80,
              right: -60,
              width: 220,
              height: 220,
              borderRadius: 999,
              backgroundColor: "rgba(16,185,129,0.08)",
            }}
          />

          <View
            pointerEvents="none"
            style={{
              position: "absolute",
              left: -70,
              bottom: -100,
              width: 220,
              height: 220,
              borderRadius: 999,
              backgroundColor: "rgba(34,211,238,0.04)",
            }}
          />

          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <View
              style={{
                width: 52,
                height: 52,
                borderRadius: 18,
                alignItems: "center",
                justifyContent: "center",
                borderWidth: 1,
                borderColor: "rgba(16,185,129,0.30)",
                backgroundColor: "rgba(16,185,129,0.12)",
              }}
            >
              <Ionicons name="layers-outline" size={22} color={UI.emerald} />
            </View>

            <View style={{ flex: 1, minWidth: 0 }}>
              <Text
                style={{
                  color: UI.faint,
                  fontWeight: "900",
                  fontSize: 11,
                  letterSpacing: 0.9,
                }}
              >
                CAPITAL RECOVERY WORKSPACE
              </Text>

              <Text
                style={{ color: UI.text, fontWeight: "900", fontSize: 22, marginTop: 4 }}
                numberOfLines={1}
              >
                {activeStoreName ?? "Capital Recovery Store"}
              </Text>
            </View>
          </View>

          <Text style={{ color: UI.muted, fontWeight: "800", lineHeight: 22 }}>
            Organization: {activeOrgName ?? "—"}
          </Text>

          <Card
            style={{
              gap: 12,
              borderRadius: 20,
              borderColor: "rgba(255,255,255,0.10)",
              backgroundColor: "rgba(255,255,255,0.04)",
            }}
          >
            <Text style={{ color: UI.text, fontWeight: "900", fontSize: 17 }}>
              Quick Entry
            </Text>

            <Text style={{ color: UI.muted, fontWeight: "800", lineHeight: 20 }}>
              Hapa ndipo uta-record Asset, Cost, na Income.
            </Text>

            <View
              style={{
                flexDirection: "row",
                flexWrap: "wrap",
                gap: 10,
                width: "100%",
              }}
            >
              <Pill
                title="Add Asset"
                active={entryType === "ASSET"}
                onPress={() => setEntryType("ASSET")}
              />
              <Pill
                title="Add Cost"
                active={entryType === "COST"}
                onPress={() => setEntryType("COST")}
              />
              <Pill
                title="Add Income"
                active={entryType === "INCOME"}
                onPress={() => setEntryType("INCOME")}
              />
            </View>

            {productModeEnabled && (
              <View style={{ gap: 8 }}>
                <Text style={{ color: UI.muted, fontWeight: "800" }}>Entry Method</Text>

                <View
                  style={{
                    flexDirection: "row",
                    gap: 10,
                    width: "100%",
                  }}
                >
                  <Pill
                    title="Manual"
                    active={entryMethod === "MANUAL"}
                    onPress={() => setEntryMethod("MANUAL")}
                  />
                  <Pill
                    title="Products"
                    active={entryMethod === "PRODUCTS"}
                    onPress={() => setEntryMethod("PRODUCTS")}
                  />
                </View>
              </View>
            )}

            {entryMethod === "MANUAL" ? (
              <View style={{ gap: 8 }}>
                <Text style={{ color: UI.muted, fontWeight: "800" }}>Amount (TZS)</Text>
                <TextInput
                  value={amount}
                  onChangeText={setAmount}
                  placeholder="mfano: 250000"
                  placeholderTextColor="rgba(234,242,255,0.35)"
                  keyboardType="numeric"
                  style={{
                    borderWidth: 1,
                    borderColor: "rgba(255,255,255,0.10)",
                    backgroundColor: "rgba(255,255,255,0.05)",
                    color: UI.text,
                    borderRadius: 18,
                    paddingHorizontal: 14,
                    paddingVertical: 14,
                    fontWeight: "800",
                    fontSize: 15,
                  }}
                />
              </View>
            ) : (
              <View style={{ gap: 10 }}>
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                  <Text style={{ color: UI.muted, fontWeight: "800" }}>Products & Quantity</Text>

                  <Pressable
                    onPress={openAddProductPicker}
                    disabled={productsLoading || eligibleProducts.length === 0}
                    style={({ pressed }) => ({
                      paddingHorizontal: 12,
                      paddingVertical: 8,
                      borderRadius: 999,
                      borderWidth: 1,
                      borderColor: "rgba(16,185,129,0.28)",
                      backgroundColor: "rgba(16,185,129,0.12)",
                      opacity: productsLoading || eligibleProducts.length === 0 ? 0.45 : pressed ? 0.92 : 1,
                    })}
                  >
                    <Text style={{ color: UI.text, fontWeight: "900", fontSize: 12 }}>Add Product</Text>
                  </Pressable>
                </View>

                {productsLoading ? (
                  <Text style={{ color: UI.faint, fontWeight: "800" }}>Loading products...</Text>
                ) : productItems.length === 0 ? (
                  <Card
                    style={{
                      borderColor: "rgba(255,255,255,0.10)",
                      backgroundColor: "rgba(255,255,255,0.04)",
                      borderRadius: 18,
                      padding: 12,
                    }}
                  >
                    <Text style={{ color: UI.faint, fontWeight: "800", lineHeight: 20 }}>
                      Bofya Add Product kuchagua bidhaa. Ukichagua bidhaa iliyopo tayari, quantity itaongezeka badala ya kutengeneza duplicate.
                    </Text>
                  </Card>
                ) : (
                  <View style={{ gap: 10 }}>
                    {productItems.map((row, index) => {
                      const selected = products.find((p) => p.id === row.product_id);
                      const unitPrice =
                        entryType === "COST"
                          ? toNum(selected?.cost_price)
                          : toNum(selected?.selling_price);
                      const qty = toNum(row.quantity);
                      const lineTotal = unitPrice > 0 && qty > 0 ? unitPrice * qty : 0;

                      return (
                        <Card
                          key={`product-row-${index}-${row.product_id || "empty"}`}
                          style={{
                            gap: 10,
                            borderRadius: 18,
                            borderColor: "rgba(255,255,255,0.10)",
                            backgroundColor: "rgba(255,255,255,0.04)",
                          }}
                        >
                          <View
                            style={{
                              flexDirection: "row",
                              alignItems: "center",
                              justifyContent: "space-between",
                              gap: 10,
                            }}
                          >
                            <View style={{ flex: 1, minWidth: 0 }}>
                              <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12 }}>
                                Selected Product
                              </Text>
                              <Text
                                style={{ color: UI.text, fontWeight: "900", fontSize: 16, marginTop: 4 }}
                                numberOfLines={1}
                              >
                                {selected ? selected.name : "No product selected"}
                              </Text>
                              <Text
                                style={{ color: UI.faint, fontWeight: "800", marginTop: 4 }}
                                numberOfLines={1}
                              >
                                {selected
                                  ? entryType === "COST"
                                    ? `Cost ${fmt(toNum(selected.cost_price))}`
                                    : `Selling ${fmt(toNum(selected.selling_price))}`
                                  : "No price"}
                              </Text>
                            </View>

                            <Pressable
                              onPress={() => openChangeProductPicker(index)}
                              style={({ pressed }) => ({
                                paddingHorizontal: 12,
                                paddingVertical: 10,
                                borderRadius: 14,
                                borderWidth: 1,
                                borderColor: "rgba(16,185,129,0.28)",
                                backgroundColor: "rgba(16,185,129,0.12)",
                                opacity: pressed ? 0.92 : 1,
                              })}
                            >
                              <Text style={{ color: UI.text, fontWeight: "900", fontSize: 12 }}>
                                Change
                              </Text>
                            </Pressable>
                          </View>

                          <View style={{ gap: 8 }}>
                            <Text style={{ color: UI.muted, fontWeight: "800" }}>Quantity</Text>
                            <TextInput
                              value={row.quantity}
                              onChangeText={(t) =>
                                updateProductRow(index, { quantity: t.replace(/[^0-9.]/g, "") })
                              }
                              placeholder="mfano: 1"
                              placeholderTextColor="rgba(234,242,255,0.35)"
                              keyboardType="numeric"
                              style={{
                                borderWidth: 1,
                                borderColor: "rgba(255,255,255,0.10)",
                                backgroundColor: "rgba(255,255,255,0.05)",
                                color: UI.text,
                                borderRadius: 18,
                                paddingHorizontal: 14,
                                paddingVertical: 14,
                                fontWeight: "800",
                                fontSize: 15,
                              }}
                            />
                          </View>

                          <View
                            style={{
                              flexDirection: "row",
                              alignItems: "center",
                              justifyContent: "space-between",
                              gap: 10,
                            }}
                          >
                            <Text style={{ color: UI.faint, fontWeight: "800", flex: 1 }}>
                              {selected ? `${selected.name} × ${qty || 0}` : "No product selected"}
                            </Text>

                            <Text style={{ color: UI.text, fontWeight: "900" }}>
                              {lineTotal > 0 ? fmt(lineTotal) : "TSh 0"}
                            </Text>
                          </View>

                          <Pressable
                            onPress={() => removeProductRow(index)}
                            style={({ pressed }) => ({
                              borderRadius: 14,
                              borderWidth: 1,
                              borderColor: "rgba(201,74,74,0.30)",
                              backgroundColor: "rgba(201,74,74,0.10)",
                              paddingVertical: 10,
                              alignItems: "center",
                              justifyContent: "center",
                              opacity: pressed ? 0.92 : 1,
                            })}
                          >
                            <Text style={{ color: UI.text, fontWeight: "900", fontSize: 12 }}>
                              Remove
                            </Text>
                          </Pressable>
                        </Card>
                      );
                    })}
                  </View>
                )}
              </View>
            )}

            <View style={{ gap: 8 }}>
              <Text style={{ color: UI.muted, fontWeight: "800" }}>Note / Description</Text>
              <TextInput
                value={note}
                onChangeText={setNote}
                placeholder="mfano: kununua mashine / gharama ya kodi / mapato ya biashara"
                placeholderTextColor="rgba(234,242,255,0.35)"
                multiline
                style={{
                  minHeight: 96,
                  borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.10)",
                  backgroundColor: "rgba(255,255,255,0.05)",
                  color: UI.text,
                  borderRadius: 18,
                  paddingHorizontal: 14,
                  paddingVertical: 14,
                  fontWeight: "800",
                  fontSize: 15,
                  textAlignVertical: "top",
                }}
              />
            </View>
          </Card>

          <Card
            style={{
              gap: 10,
              borderRadius: 20,
              borderColor: canSave ? "rgba(16,185,129,0.22)" : "rgba(255,255,255,0.10)",
              backgroundColor: canSave ? "rgba(16,185,129,0.07)" : "rgba(255,255,255,0.04)",
            }}
          >
            <Text style={{ color: UI.text, fontWeight: "900", fontSize: 16 }}>
              {previewTitle}
            </Text>

            <Text style={{ color: UI.muted, fontWeight: "800", lineHeight: 20 }}>
              {previewHint}
            </Text>

            <View style={{ flexDirection: "row", gap: 12 }}>
              <MiniStat label="Entry Type" value={entryType} hint="current selection" />
              <MiniStat
                label="Method"
                value={entryMethod}
                hint={entryMethod === "MANUAL" ? "direct amount" : "product-based"}
              />
              <MiniStat
                label="Amount"
                value={canSave ? formattedPreviewAmount : "TSh 0"}
                hint="preview"
              />
            </View>

            {entryMethod === "PRODUCTS" && (
              <Card
                style={{
                  borderColor: "rgba(255,255,255,0.10)",
                  backgroundColor: "rgba(255,255,255,0.04)",
                  borderRadius: 18,
                  padding: 12,
                  gap: 8,
                }}
              >
                <Text style={{ color: UI.text, fontWeight: "900", fontSize: 14 }}>
                  Product Breakdown
                </Text>

                {selectedProductItems.length === 0 ? (
                  <Text style={{ color: UI.faint, fontWeight: "800", lineHeight: 20 }}>
                    Hakuna bidhaa zilizochaguliwa bado.
                  </Text>
                ) : (
                  selectedProductItems.map((item) => (
                    <View
                      key={`${item.product_id}-${item.quantity}-${item.line_total}`}
                      style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 }}
                    >
                      <Text style={{ color: UI.faint, fontWeight: "800", flex: 1 }}>
                        {item.product_name} × {item.quantity}
                      </Text>
                      <Text style={{ color: UI.text, fontWeight: "900" }}>
                        {fmt(item.line_total)}
                      </Text>
                    </View>
                  ))
                )}
              </Card>
            )}

            <Card
              style={{
                borderColor: "rgba(255,255,255,0.10)",
                backgroundColor: "rgba(255,255,255,0.04)",
                borderRadius: 18,
                padding: 12,
              }}
            >
              <Text style={{ color: UI.faint, fontWeight: "800", lineHeight: 20 }}>
                {clean(note)
                  ? note
                  : "Hakuna maelezo bado. Weka note fupi ili entry iwe clear."}
              </Text>
            </Card>
          </Card>

          <Pressable
            onPress={onSaveEntry}
            disabled={!canSave || saving}
            style={({ pressed }) => ({
              borderRadius: 18,
              borderWidth: 1,
              borderColor:
                canSave && !saving
                  ? "rgba(16,185,129,0.30)"
                  : "rgba(255,255,255,0.10)",
              backgroundColor:
                canSave && !saving
                  ? "rgba(16,185,129,0.12)"
                  : "rgba(255,255,255,0.05)",
              paddingVertical: 15,
              paddingHorizontal: 16,
              alignItems: "center",
              justifyContent: "center",
              opacity: pressed ? 0.92 : canSave && !saving ? 1 : 0.6,
            })}
          >
            <Text style={{ color: UI.text, fontWeight: "900", fontSize: 15 }}>
              {saving
                ? "Saving..."
                : entryMethod === "MANUAL"
                ? "Save Entry"
                : "Save Product Entry"}
            </Text>
          </Pressable>
        </Card>

        <Modal
          visible={pickerOpen}
          animationType="slide"
          transparent
          onRequestClose={closeProductPicker}
        >
          <View
            style={{
              flex: 1,
              backgroundColor: "rgba(2,6,23,0.82)",
              justifyContent: "flex-end",
            }}
          >
            <View
              style={{
                maxHeight: "78%",
                borderTopLeftRadius: 24,
                borderTopRightRadius: 24,
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.10)",
                backgroundColor: "rgba(15,18,24,0.98)",
                paddingHorizontal: 16,
                paddingTop: 16,
                paddingBottom: 22,
                gap: 12,
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                }}
              >
                <Text style={{ color: UI.text, fontWeight: "900", fontSize: 18 }}>
                  Select Product
                </Text>

                <Pressable
                  onPress={closeProductPicker}
                  style={({ pressed }) => ({
                    width: 40,
                    height: 40,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: "rgba(255,255,255,0.10)",
                    backgroundColor: "rgba(255,255,255,0.05)",
                    alignItems: "center",
                    justifyContent: "center",
                    opacity: pressed ? 0.92 : 1,
                  })}
                >
                  <Ionicons name="close" size={18} color={UI.text} />
                </Pressable>
              </View>

              <TextInput
                value={pickerSearch}
                onChangeText={setPickerSearch}
                placeholder="Search product..."
                placeholderTextColor="rgba(234,242,255,0.35)"
                style={{
                  borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.10)",
                  backgroundColor: "rgba(255,255,255,0.05)",
                  color: UI.text,
                  borderRadius: 16,
                  paddingHorizontal: 14,
                  paddingVertical: 14,
                  fontWeight: "800",
                  fontSize: 14,
                }}
              />

              <Text style={{ color: UI.faint, fontWeight: "800" }}>
                {entryType === "COST"
                  ? "Showing products with cost price only."
                  : "Showing products with selling price only."}
              </Text>

              <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingBottom: 12, gap: 8 }}
              >
                {filteredEligibleProducts.length === 0 ? (
                  <Card
                    style={{
                      borderColor: "rgba(255,255,255,0.10)",
                      backgroundColor: "rgba(255,255,255,0.04)",
                      borderRadius: 16,
                      padding: 12,
                    }}
                  >
                    <Text style={{ color: UI.faint, fontWeight: "800", lineHeight: 20 }}>
                      Hakuna product inayolingana na search/mode hii.
                    </Text>
                  </Card>
                ) : (
                  filteredEligibleProducts.map((product) => (
                    <Pressable
                      key={product.id}
                      onPress={() => selectProductFromPicker(product.id)}
                      style={({ pressed }) => ({
                        borderRadius: 16,
                        borderWidth: 1,
                        borderColor: "rgba(255,255,255,0.10)",
                        backgroundColor: "rgba(255,255,255,0.05)",
                        paddingHorizontal: 12,
                        paddingVertical: 12,
                        opacity: pressed ? 0.92 : 1,
                      })}
                    >
                      <Text style={{ color: UI.text, fontWeight: "900", fontSize: 14 }}>
                        {product.name}
                      </Text>
                      <Text style={{ color: UI.faint, fontWeight: "800", marginTop: 4 }}>
                        {entryType === "COST"
                          ? `Cost ${fmt(toNum(product.cost_price))}`
                          : `Selling ${fmt(toNum(product.selling_price))}`}
                      </Text>
                    </Pressable>
                  ))
                )}
              </ScrollView>
            </View>
          </View>
        </Modal>

        <Card
          style={{
            marginTop: 14,
            gap: 14,
            borderRadius: 24,
            borderColor: "rgba(16,185,129,0.22)",
            backgroundColor: "rgba(15,18,24,0.98)",
          }}
        >
          <Text style={{ color: UI.text, fontWeight: "900", fontSize: 20 }}>
            Reports
          </Text>

          {!!historyError ? (
            <Card
              style={{
                borderColor: "rgba(201,74,74,0.35)",
                backgroundColor: "rgba(201,74,74,0.10)",
                borderRadius: 18,
                padding: 12,
              }}
            >
              <Text style={{ color: UI.danger, fontWeight: "900" }}>{historyError}</Text>
            </Card>
          ) : null}

          <View style={{ flexDirection: "row", gap: 12 }}>
            <MiniStat
              label="Asset Entries"
              value={String(report.ASSET.count)}
              hint={fmt(report.ASSET.amount)}
            />
            <MiniStat
              label="Cost Entries"
              value={String(report.COST.count)}
              hint={fmt(report.COST.amount)}
            />
            <MiniStat
              label="Income Entries"
              value={String(report.INCOME.count)}
              hint={fmt(report.INCOME.amount)}
            />
          </View>

          <View style={{ flexDirection: "row", gap: 12 }}>
            <MiniStat
              label="Latest Entry"
              value={latestEntry ? latestEntry.entry_type : "—"}
              hint={latestEntry ? fmtLocal(latestEntry.created_at) : "no history"}
              multilineValue
            />
            <MiniStat
              label="Total Records"
              value={historyLoading ? "..." : String(history.length)}
              hint="history loaded"
            />
          </View>

          <Pressable
            onPress={() => router.push("/capital-recovery/history")}
            style={({ pressed }) => ({
              borderRadius: 20,
              borderWidth: 1,
              borderColor: "rgba(16,185,129,0.34)",
              backgroundColor: "rgba(16,185,129,0.16)",
              paddingVertical: 16,
              paddingHorizontal: 16,
              alignItems: "center",
              justifyContent: "center",
              opacity: pressed ? 0.92 : 1,
            })}
          >
            <Text style={{ color: UI.text, fontWeight: "900", fontSize: 15 }}>
              Open Recent History
            </Text>
          </Pressable>
        </Card>
      </StoreGuard>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}