// app/(tabs)/products.tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { CameraView, useCameraPermissions } from "expo-camera";

import { useFocusEffect } from "expo-router";
import { useOrg } from "../../src/context/OrgContext";
import { supabase } from "../../src/supabase/supabaseClient";
import { Button } from "../../src/ui/Button";
import { Card } from "../../src/ui/Card";
import { Screen } from "../../src/ui/Screen";
import { theme } from "../../src/ui/theme";
import { useOrgMoneyPrefs } from "../../src/ui/money";
import { setActiveScanScope, subscribeScanBarcode } from "@/src/utils/scanBus";

type ProductRow = {
  id: string;
  organization_id: string;
  store_id?: string | null;
  name: string;
  sku: string | null;
  unit: string | null;
  category: string | null;
  selling_price: number | null;
  cost_price?: number | null;
  barcode?: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

function parsePositiveNumberOrNull(raw: string): number | null {
  const t = String(raw ?? "").trim();
  if (!t) return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.trunc(n);
}

function parseZeroOrPositiveNumberOrNull(raw: string): number | null {
  const t = String(raw ?? "").trim();
  if (!t) return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.trunc(n);
}

function cleanBarcode(raw: string) {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  return s.replace(/\s+/g, "");
}

function isTypingIntoField(target: any) {
  if (!target) return false;
  const tag = String(target.tagName ?? "").toLowerCase();
  const editable = !!target.isContentEditable;
  return editable || tag === "input" || tag === "textarea" || tag === "select";
}

function ScannerFabIcon({ size = 28, color = "#E5E7EB" }: { size?: number; color?: string }) {
  const w = Math.max(22, Math.round(size * 1.05));
  const h = Math.max(18, Math.round(size * 0.78));
  const barHeights = [0.72, 0.46, 0.86, 0.58, 0.92, 0.52, 0.8];
  const barWidths = [2, 1.5, 2.2, 1.4, 2.4, 1.6, 2];
  const gap = Math.max(1.5, Math.round(size * 0.04));

  return (
    <View
      style={{
        width: size + 4,
        height: size + 4,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <View
        style={{
          width: w,
          height: h,
          borderRadius: 7,
          borderWidth: 1.8,
          borderColor: color,
          paddingHorizontal: 3,
          flexDirection: "row",
          alignItems: "flex-end",
          justifyContent: "center",
          backgroundColor: "transparent",
          gap,
        }}
      >
        {barHeights.map((ratio, idx) => (
          <View
            key={idx}
            style={{
              width: barWidths[idx],
              height: Math.max(5, Math.round(h * ratio)),
              backgroundColor: color,
              borderRadius: 1.5,
            }}
          />
        ))}
      </View>

      <View
        style={{
          position: "absolute",
          left: -1,
          top: -1,
          width: 8,
          height: 8,
          borderLeftWidth: 2,
          borderTopWidth: 2,
          borderColor: color,
          borderTopLeftRadius: 3,
        }}
      />
      <View
        style={{
          position: "absolute",
          right: -1,
          top: -1,
          width: 8,
          height: 8,
          borderRightWidth: 2,
          borderTopWidth: 2,
          borderColor: color,
          borderTopRightRadius: 3,
        }}
      />
      <View
        style={{
          position: "absolute",
          left: -1,
          bottom: -1,
          width: 8,
          height: 8,
          borderLeftWidth: 2,
          borderBottomWidth: 2,
          borderColor: color,
          borderBottomLeftRadius: 3,
        }}
      />
      <View
        style={{
          position: "absolute",
          right: -1,
          bottom: -1,
          width: 8,
          height: 8,
          borderRightWidth: 2,
          borderBottomWidth: 2,
          borderColor: color,
          borderBottomRightRadius: 3,
        }}
      />
    </View>
  );
}

export default function ProductsTabScreen() {
  const {
  activeOrgId,
  activeOrgName,
  activeRole,
  activeStoreId,
  activeStoreName,
  activeStoreType,
} = useOrg();

  const money = useOrgMoneyPrefs(activeOrgId ?? "");
const isCapitalRecoveryStore = activeStoreType === "CAPITAL_RECOVERY";
const scopedStoreId = String(activeStoreId ?? "").trim() || null;

  const canManage = useMemo(
    () => (activeRole ?? "staff") === "owner",
    [activeRole]
  );

  const canSeeCost = useMemo(
    () => (activeRole ?? "staff") === "owner" && !isCapitalRecoveryStore,
    [activeRole, isCapitalRecoveryStore]
  );

  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<ProductRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [unit, setUnit] = useState("");
  const [category, setCategory] = useState("");
  const [sellingPrice, setSellingPrice] = useState("");
  const [costPrice, setCostPrice] = useState("");
  const [barcode, setBarcode] = useState("");

  const [editOpen, setEditOpen] = useState(false);
  const [editProductId, setEditProductId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editSku, setEditSku] = useState("");
  const [editUnit, setEditUnit] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [editSellingPrice, setEditSellingPrice] = useState("");
  const [editCostPrice, setEditCostPrice] = useState("");
  const [editBarcode, setEditBarcode] = useState("");

  const [permission, requestPermission] = useCameraPermissions();
  const [scanOpen, setScanOpen] = useState(false);
  const [scanBusy, setScanBusy] = useState(false);
  const [keyboardSpace, setKeyboardSpace] = useState(0);

  const handleProductsScopedScan = useCallback(
    (rawInput: any) => {
      if (!canManage) return;

      const code = cleanBarcode(rawInput);
      if (!code) return;

      if (editOpen) {
        setEditBarcode(code);
      } else {
        setBarcode(code);
      }
    },
    [canManage, editOpen]
  );

  const webScanBufferRef = useRef("");
  const webScanLastAtRef = useRef(0);
  const webScanTimerRef = useRef<any>(null);

  const openScan = useCallback(async () => {
    if (!canManage) {
      Alert.alert("No Access", "Owner only.");
      return;
    }

    if (isCapitalRecoveryStore) {
      Alert.alert("Not Needed", "Barcode haitumiki kwenye Capital Recovery products.");
      return;
    }

    try {
      if (!permission?.granted) {
        const res = await requestPermission();
        if (!res.granted) {
          Alert.alert("Camera Permission", "Ruhusa ya camera inahitajika ili kuscan barcode.");
          return;
        }
      }

      setScanBusy(false);
      setScanOpen(true);
    } catch {
      Alert.alert("Camera", "Imeshindikana kuomba ruhusa ya camera.");
    }
  }, [canManage, isCapitalRecoveryStore, permission?.granted, requestPermission]);

  const closeScan = useCallback(() => {
    setScanOpen(false);
    setScanBusy(false);
  }, []);

  const onBarcodeScanned = useCallback(
    (result: any) => {
      if (!scanOpen || scanBusy) return;

      const raw = String(result?.data ?? "").trim();
      const v = cleanBarcode(raw);
      if (!v) return;

      setScanBusy(true);
      setBarcode(v);

      setTimeout(() => {
        closeScan();
      }, 180);
    },
    [closeScan, scanBusy, scanOpen]
  );

const load = useCallback(async () => {
  if (!activeOrgId) {
    setRows([]);
    return;
  }

  if (!scopedStoreId) {
    setRows([]);
    setError("No active store selected");
    return;
  }

  setLoading(true);
  setError(null);

  try {
    if (canManage) {
      const { data, error: e } = await supabase.rpc("get_products_manage", {
        p_org_id: activeOrgId,
        p_store_id: scopedStoreId,
      });
      if (e) throw e;
      setRows((data ?? []) as ProductRow[]);
    } else {
      const { data, error: e } = await supabase.rpc("get_products", {
        p_org_id: activeOrgId,
        p_store_id: scopedStoreId,
      });
      if (e) throw e;
      setRows((data ?? []) as ProductRow[]);
    }
  } catch (err: any) {
    setError(err?.message ?? "Failed to load products");
    setRows([]);
  } finally {
    setLoading(false);
  }
}, [activeOrgId, canManage, scopedStoreId]);

  useEffect(() => {
    void load();
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      if (isCapitalRecoveryStore) {
        setActiveScanScope("GLOBAL");
        return () => {
          setActiveScanScope("GLOBAL");
        };
      }

      setActiveScanScope("PRODUCTS");

      const unsub = subscribeScanBarcode(
        (barcode) => {
          handleProductsScopedScan(barcode);
        },
        { scope: "PRODUCTS" }
      );

      return () => {
        unsub();
        setActiveScanScope("GLOBAL");
      };
    }, [handleProductsScopedScan, isCapitalRecoveryStore])
  );

  useEffect(() => {
    const showSub = Keyboard.addListener("keyboardDidShow", (e) => {
      setKeyboardSpace(Math.max(0, e.endCoordinates?.height ?? 0) + 24);
    });

    const hideSub = Keyboard.addListener("keyboardDidHide", () => {
      setKeyboardSpace(0);
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  useEffect(() => {
    if (Platform.OS !== "web") return;
    if (!canManage) return;

    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as any;
      if (isTypingIntoField(target)) return;

      const key = String(e.key ?? "");
      const now = Date.now();

      if (key === "Enter") {
        const code = cleanBarcode(webScanBufferRef.current);
        webScanBufferRef.current = "";
        webScanLastAtRef.current = 0;

        if (webScanTimerRef.current) {
          clearTimeout(webScanTimerRef.current);
          webScanTimerRef.current = null;
        }

        if (code.length >= 4) {
          handleProductsScopedScan(code);
        }
        return;
      }

      if (key.length !== 1) return;
      if (e.ctrlKey || e.altKey || e.metaKey) return;

      if (now - webScanLastAtRef.current > 120) {
        webScanBufferRef.current = "";
      }

      webScanBufferRef.current += key;
      webScanLastAtRef.current = now;

      if (webScanTimerRef.current) clearTimeout(webScanTimerRef.current);
      webScanTimerRef.current = setTimeout(() => {
        webScanBufferRef.current = "";
        webScanLastAtRef.current = 0;
      }, 180);
    };

    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      if (webScanTimerRef.current) {
        clearTimeout(webScanTimerRef.current);
        webScanTimerRef.current = null;
      }
    };
  }, [canManage, handleProductsScopedScan]);

  const openEdit = useCallback((p: ProductRow) => {
    setEditProductId(p.id);
    setEditName(String(p.name ?? ""));
    setEditSku(String(p.sku ?? ""));
    setEditUnit(String(p.unit ?? ""));
    setEditCategory(String(p.category ?? ""));
    setEditSellingPrice(p.selling_price != null ? String(Math.trunc(Number(p.selling_price))) : "");
    setEditCostPrice(p.cost_price != null ? String(Math.trunc(Number(p.cost_price))) : "");
    setEditBarcode(String(p.barcode ?? ""));
    setEditOpen(true);
  }, []);

  const closeEdit = useCallback(() => {
    setEditOpen(false);
    setEditProductId(null);
    setEditName("");
    setEditSku("");
    setEditUnit("");
    setEditCategory("");
    setEditSellingPrice("");
    setEditCostPrice("");
    setEditBarcode("");
  }, []);

 const add = useCallback(async () => {
  if (!activeOrgId || !scopedStoreId) return;

    const n = name.trim();
    if (!n) {
      Alert.alert("Missing", "Weka product name.");
      return;
    }

    if (!canManage) {
      Alert.alert("No Access", "Owner only.");
      return;
    }

    const sp = parsePositiveNumberOrNull(sellingPrice);
    if (sellingPrice.trim() && sp === null) {
      Alert.alert("Invalid", "Selling Price iwe namba (> 0) au uiache wazi.");
      return;
    }

    const cp = parseZeroOrPositiveNumberOrNull(costPrice);
    if (!isCapitalRecoveryStore && costPrice.trim() && cp === null) {
      Alert.alert("Invalid", "Cost Price iwe namba (>= 0) au uiache wazi.");
      return;
    }

    if (isCapitalRecoveryStore) {
      if (sp === null) {
        Alert.alert("Missing", "Weka Selling Price kwa Capital Recovery product.");
        return;
      }
    } else {
      if (sp === null && cp === null) {
        Alert.alert("Missing", "Weka angalau Cost Price au Selling Price (hata moja).");
        return;
      }
    }

    const bc = cleanBarcode(barcode);
    if (!isCapitalRecoveryStore && bc && bc.length < 6) {
      Alert.alert("Invalid", "Barcode inaonekana fupi sana. Hakikisha ume-scan sahihi.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { error: e } = await supabase.rpc("upsert_product", {
  p_org_id: activeOrgId,
  p_product_id: null,
  p_name: n,
  p_sku: isCapitalRecoveryStore ? null : sku.trim() || null,
  p_unit: isCapitalRecoveryStore ? null : unit.trim() || null,
  p_category: category.trim() || null,
  p_is_active: true,
  p_selling_price: sp,
  p_cost_price: isCapitalRecoveryStore ? null : cp,
  p_barcode: isCapitalRecoveryStore ? null : bc || null,
  p_store_id: scopedStoreId,
});

      if (e) throw e;

      setName("");
      setSku("");
      setUnit("");
      setCategory("");
      setSellingPrice("");
      setCostPrice("");
      setBarcode("");

      await load();
      Alert.alert(
        "Success ✅",
        isCapitalRecoveryStore
          ? "Income product added"
          : bc
          ? "Product added (barcode saved)"
          : "Product added"
      );
    } catch (err: any) {
      Alert.alert("Failed", err?.message ?? "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [
    activeOrgId,
    scopedStoreId,
    barcode,
    canManage,
    category,
    costPrice,
    isCapitalRecoveryStore,
    load,
    name,
    sellingPrice,
    sku,
    unit,
  ]);

  const saveEdit = useCallback(async () => {
    if (!activeOrgId || !scopedStoreId || !editProductId) return;

    if (!canManage) {
      Alert.alert("No Access", "Owner only.");
      return;
    }

    const n = editName.trim();
    if (!n) {
      Alert.alert("Missing", "Weka product name.");
      return;
    }

    const sp = parsePositiveNumberOrNull(editSellingPrice);
    if (editSellingPrice.trim() && sp === null) {
      Alert.alert("Invalid", "Selling Price iwe namba (> 0) au uiache wazi.");
      return;
    }

    const cp = parseZeroOrPositiveNumberOrNull(editCostPrice);
    if (!isCapitalRecoveryStore && editCostPrice.trim() && cp === null) {
      Alert.alert("Invalid", "Cost Price iwe namba (>= 0) au uiache wazi.");
      return;
    }

    if (isCapitalRecoveryStore) {
      if (sp === null) {
        Alert.alert("Missing", "Weka Selling Price kwa Capital Recovery product.");
        return;
      }
    } else {
      if (sp === null && cp === null) {
        Alert.alert("Missing", "Weka angalau Cost Price au Selling Price (hata moja).");
        return;
      }
    }

    const bc = cleanBarcode(editBarcode);
    if (!isCapitalRecoveryStore && bc && bc.length < 6) {
      Alert.alert("Invalid", "Barcode inaonekana fupi sana. Hakikisha umeweka sahihi.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { error: e } = await supabase.rpc("upsert_product", {
        p_org_id: activeOrgId,
        p_product_id: editProductId,
        p_name: n,
        p_sku: isCapitalRecoveryStore ? null : editSku.trim() || null,
        p_unit: isCapitalRecoveryStore ? null : editUnit.trim() || null,
        p_category: editCategory.trim() || null,
        p_is_active: true,
        p_selling_price: sp,
        p_cost_price: isCapitalRecoveryStore ? null : cp,
        p_barcode: isCapitalRecoveryStore ? null : bc || null,
        p_store_id: scopedStoreId,
      });
      if (e) throw e;

      closeEdit();
      await load();
      Alert.alert("Success ✅", "Product updated");
    } catch (err: any) {
      Alert.alert("Failed", err?.message ?? "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [
    activeOrgId,
    scopedStoreId,
    canManage,
    closeEdit,
    editBarcode,
    editCategory,
    editCostPrice,
    editName,
    editProductId,
    editSellingPrice,
    editSku,
    editUnit,
    isCapitalRecoveryStore,
    load,
  ]);

  const remove = useCallback(
    async (productId: string, productName: string) => {
      if (!activeOrgId || !scopedStoreId) return;

      if (!canManage) {
        Alert.alert("No Access", "Owner only.");
        return;
      }

      Alert.alert(
        "Delete Product?",
        productName,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Delete",
            style: "destructive",
            onPress: async () => {
              setLoading(true);
              try {
                const { error: e } = await supabase.rpc("delete_product", {
  p_org_id: activeOrgId,
  p_product_id: productId,
  p_store_id: scopedStoreId,
});
                if (e) throw e;

                await load();
                Alert.alert("Success ✅", "Product deleted/archived safely");
              } catch (err: any) {
                Alert.alert("Failed", err?.message ?? "Unknown error");
              } finally {
                setLoading(false);
              }
            },
          },
        ],
        { cancelable: true }
      );
    },
    [activeOrgId, scopedStoreId, canManage, load]
  );

  const visibleRows = useMemo(() => rows.filter((r) => r.is_active !== false), [rows]);

  const solidInputStyle = {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.lg,
    backgroundColor: "#111827",
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: theme.colors.text,
    fontWeight: "800" as const,
  };

  return (
    <Screen scroll>
      <Text style={{ fontSize: 26, fontWeight: "900", color: theme.colors.text }}>Products</Text>

      <Card style={{ gap: 8 }}>
        <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>Organization</Text>
        <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 18 }}>
          {activeOrgName ?? "—"}
        </Text>

        <Text style={{ color: theme.colors.muted, fontWeight: "800", marginTop: 6 }}>Active Store</Text>
        <Text style={{ color: theme.colors.text, fontWeight: "900" }}>{activeStoreName ?? "—"}</Text>

        <Text style={{ color: theme.colors.muted, fontWeight: "800", marginTop: 6 }}>Role</Text>
        <Text style={{ color: theme.colors.text, fontWeight: "900" }}>{activeRole ?? "—"}</Text>

        <Card
          style={{
            marginTop: 10,
            borderColor: isCapitalRecoveryStore ? theme.colors.emeraldBorder : theme.colors.border,
            backgroundColor: isCapitalRecoveryStore ? theme.colors.emeraldSoft : "rgba(255,255,255,0.04)",
          }}
        >
          <Text style={{ color: theme.colors.text, fontWeight: "900" }}>
            {isCapitalRecoveryStore
              ? "Capital Recovery Product Mode"
              : "Standard Product Mode"}
          </Text>
          <Text style={{ color: theme.colors.muted, fontWeight: "700", marginTop: 6 }}>
            {isCapitalRecoveryStore
              ? "Hapa unaweka bidhaa za kuuza kwa income tu. Barcode, cost, unit, na inventory-style product fields hazitumiki kwenye mode hii."
              : "Hapa unaweka bidhaa za kawaida za biashara, zikiwemo cost, barcode, na details nyingine."}
          </Text>
        </Card>

        <Button
          title={loading ? "Loading..." : "Refresh"}
          onPress={load}
          disabled={loading}
          variant="primary"
          style={{ marginTop: 10 }}
        />
      </Card>

      {!!error && (
        <Card
          style={{
            borderColor: theme.colors.dangerBorder,
            backgroundColor: theme.colors.dangerSoft,
          }}
        >
          <Text style={{ color: theme.colors.danger, fontWeight: "900" }}>{error}</Text>
        </Card>
      )}

      {canManage && (
        <Card style={{ gap: 10 }}>
          <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 16 }}>
            {isCapitalRecoveryStore ? "Add Income Product" : "Add Product"}
          </Text>

          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Product name"
            placeholderTextColor="rgba(255,255,255,0.35)"
            style={{
              borderWidth: 1,
              borderColor: theme.colors.border,
              borderRadius: theme.radius.lg,
              backgroundColor: "rgba(255,255,255,0.05)",
              paddingHorizontal: 14,
              paddingVertical: 12,
              color: theme.colors.text,
              fontWeight: "800",
            }}
          />

          {!isCapitalRecoveryStore && (
            <View style={{ flexDirection: "row", gap: 10 }}>
              <View style={{ flex: 1 }}>
                <TextInput
                  value={sku}
                  onChangeText={setSku}
                  placeholder="SKU (optional)"
                  placeholderTextColor="rgba(255,255,255,0.35)"
                  style={{
                    borderWidth: 1,
                    borderColor: theme.colors.border,
                    borderRadius: theme.radius.lg,
                    backgroundColor: "rgba(255,255,255,0.05)",
                    paddingHorizontal: 14,
                    paddingVertical: 12,
                    color: theme.colors.text,
                    fontWeight: "800",
                  }}
                />
              </View>

              <View style={{ flex: 1 }}>
                <TextInput
                  value={unit}
                  onChangeText={setUnit}
                  placeholder="Unit (optional)"
                  placeholderTextColor="rgba(255,255,255,0.35)"
                  style={{
                    borderWidth: 1,
                    borderColor: theme.colors.border,
                    borderRadius: theme.radius.lg,
                    backgroundColor: "rgba(255,255,255,0.05)",
                    paddingHorizontal: 14,
                    paddingVertical: 12,
                    color: theme.colors.text,
                    fontWeight: "800",
                  }}
                />
              </View>
            </View>
          )}

          <TextInput
            value={category}
            onChangeText={setCategory}
            placeholder="Category (optional)"
            placeholderTextColor="rgba(255,255,255,0.35)"
            style={{
              borderWidth: 1,
              borderColor: theme.colors.border,
              borderRadius: theme.radius.lg,
              backgroundColor: "rgba(255,255,255,0.05)",
              paddingHorizontal: 14,
              paddingVertical: 12,
              color: theme.colors.text,
              fontWeight: "800",
            }}
          />

          {!isCapitalRecoveryStore && (
            <View style={{ gap: 8 }}>
              <Text style={{ color: theme.colors.muted, fontWeight: "900" }}>Barcode (optional)</Text>

            <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
              <View style={{ flex: 1 }}>
                <TextInput
                  value={barcode}
                  onChangeText={(t) => setBarcode(cleanBarcode(t))}
                  placeholder="Scan or type barcode"
                  placeholderTextColor="rgba(255,255,255,0.35)"
                  style={{
                    borderWidth: 1,
                    borderColor: theme.colors.border,
                    borderRadius: theme.radius.lg,
                    backgroundColor: "rgba(255,255,255,0.05)",
                    paddingHorizontal: 14,
                    paddingVertical: 12,
                    color: theme.colors.text,
                    fontWeight: "900",
                  }}
                />
              </View>

              <Pressable
                onPress={openScan}
                disabled={loading}
                style={({ pressed }) => ({
                  width: 62,
                  height: 62,
                  borderRadius: 999,
                  alignItems: "center",
                  justifyContent: "center",
                  borderWidth: 1,
                  borderColor: theme.colors.emeraldBorder,
                  backgroundColor: theme.colors.emeraldSoft,
                  opacity: loading ? 0.55 : pressed ? 0.92 : 1,
                  transform: pressed ? [{ scale: 0.995 }] : [{ scale: 1 }],
                })}
              >
                <View style={{ marginLeft: 1, marginTop: 1 }}>
                  <ScannerFabIcon size={28} color={theme.colors.text} />
                </View>
              </Pressable>

              {!!barcode && (
                <Pressable
                  onPress={() => setBarcode("")}
                  disabled={loading}
                  style={({ pressed }) => ({
                    width: 52,
                    height: 52,
                    borderRadius: 999,
                    alignItems: "center",
                    justifyContent: "center",
                    borderWidth: 1,
                    borderColor: theme.colors.border,
                    backgroundColor: "rgba(255,255,255,0.06)",
                    opacity: loading ? 0.55 : pressed ? 0.92 : 1,
                    transform: pressed ? [{ scale: 0.995 }] : [{ scale: 1 }],
                  })}
                >
                  <Ionicons name="close" size={20} color={theme.colors.text} />
                </Pressable>
              )}
            </View>

            <Text style={{ color: theme.colors.faint, fontWeight: "800" }}>
                Tip: Scan barcode ili iwe fast kama supermarket.
              </Text>
            </View>
          )}

        {canSeeCost && (
            <TextInput
              value={costPrice}
              onChangeText={(t) => setCostPrice(t.replace(/[^0-9]/g, ""))}
              placeholder="Cost Price (optional)"
              keyboardType="numeric"
              placeholderTextColor="rgba(255,255,255,0.35)"
              style={{
                borderWidth: 1,
                borderColor: theme.colors.border,
                borderRadius: theme.radius.lg,
                backgroundColor: "rgba(255,255,255,0.05)",
                paddingHorizontal: 14,
                paddingVertical: 12,
                color: theme.colors.text,
                fontWeight: "800",
              }}
            />
          )}

          <TextInput
            value={sellingPrice}
            onChangeText={(t) => setSellingPrice(t.replace(/[^0-9]/g, ""))}
            placeholder={isCapitalRecoveryStore ? "Selling Price" : "Selling Price (optional)"}
            keyboardType="numeric"
            placeholderTextColor="rgba(255,255,255,0.35)"
            style={{
              borderWidth: 1,
              borderColor: theme.colors.border,
              borderRadius: theme.radius.lg,
              backgroundColor: "rgba(255,255,255,0.05)",
              paddingHorizontal: 14,
              paddingVertical: 12,
              color: theme.colors.text,
              fontWeight: "800",
            }}
          />

          <Button
            title={loading ? "Saving..." : isCapitalRecoveryStore ? "Add Income Product" : "Add Product"}
            onPress={add}
            disabled={loading}
            variant="primary"
          />

          <Modal
            visible={scanOpen}
            animationType="fade"
            transparent
            presentationStyle="overFullScreen"
            statusBarTranslucent
            onRequestClose={closeScan}
          >
            <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.82)" }}>
              <View style={{ padding: 16, paddingTop: 18, gap: 10 }}>
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                  <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 18 }}>Scan Barcode</Text>

                  <Pressable
                    onPress={closeScan}
                    hitSlop={10}
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 999,
                      alignItems: "center",
                      justifyContent: "center",
                      borderWidth: 1,
                      borderColor: "rgba(255,255,255,0.12)",
                      backgroundColor: "rgba(255,255,255,0.06)",
                    }}
                  >
                    <Ionicons name="close" size={22} color={theme.colors.text} />
                  </Pressable>
                </View>

                <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>
                  Elekeza camera kwenye barcode. Itajaza moja kwa moja.
                </Text>
              </View>

              <View style={{ flex: 1, paddingHorizontal: 16, paddingBottom: 18 }}>
                <View
                  style={{
                    flex: 1,
                    borderRadius: 18,
                    overflow: "hidden",
                    borderWidth: 1,
                    borderColor: "rgba(255,255,255,0.12)",
                    backgroundColor: "rgba(255,255,255,0.04)",
                  }}
                >
                  <CameraView
                    style={{ flex: 1 }}
                    facing="back"
                    onBarcodeScanned={onBarcodeScanned}
                    barcodeScannerSettings={{
                      barcodeTypes: [
                        "ean13",
                        "ean8",
                        "upc_a",
                        "upc_e",
                        "code128",
                        "code39",
                        "itf14",
                        "qr",
                        "pdf417",
                        "aztec",
                        "datamatrix",
                      ],
                    }}
                  />

                  <View
                    pointerEvents="none"
                    style={{
                      position: "absolute",
                      left: 18,
                      right: 18,
                      top: "32%",
                      height: 140,
                      borderRadius: 16,
                      borderWidth: 2,
                      borderColor: "rgba(52,211,153,0.55)",
                      backgroundColor: "rgba(0,0,0,0.05)",
                    }}
                  />
                </View>

                <View style={{ marginTop: 12, gap: 10 }}>
                  <Card style={{ gap: 6 }}>
                    <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>Last scanned</Text>
                    <Text style={{ color: theme.colors.text, fontWeight: "900" }}>{barcode ? barcode : "—"}</Text>
                    <Text style={{ color: theme.colors.faint, fontWeight: "800" }}>
                      Ukiscan, modal itajifunga na barcode itaingia kwenye form.
                    </Text>
                  </Card>

                  <Button title="Close" onPress={closeScan} variant="secondary" />
                </View>
              </View>
            </View>
          </Modal>
        </Card>
      )}

      <Text style={{ fontWeight: "900", fontSize: 16, color: theme.colors.text }}>
        {isCapitalRecoveryStore ? "Income Product List" : "Product List"}
      </Text>

      {visibleRows.length === 0 ? (
        <Card>
          <Text style={{ color: theme.colors.text, fontWeight: "900" }}>
            {isCapitalRecoveryStore ? "No income products yet" : "No products yet"}
          </Text>
          <Text style={{ color: theme.colors.muted, fontWeight: "700", marginTop: 6 }}>
            {canManage
              ? isCapitalRecoveryStore
                ? "Ongeza bidhaa ya income juu kisha Refresh."
                : "Ongeza product juu kisha Refresh."
              : "Muombe owner aongeze au abadili products."}
          </Text>
        </Card>
      ) : (
        visibleRows.map((p) => {
          const sp = Number(p.selling_price ?? 0);
          const cp = Number(p.cost_price ?? NaN);
          const bc = String(p.barcode ?? "").trim();

          return (
            <Pressable
              key={p.id}
              style={{
                borderWidth: 1,
                borderColor: theme.colors.border,
                borderRadius: theme.radius.xl,
                backgroundColor: theme.colors.card,
                padding: 16,
                marginBottom: 12,
              }}
            >
              <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 16 }}>{p.name}</Text>

              {!isCapitalRecoveryStore && (
                <>
                  <Text style={{ color: theme.colors.muted, fontWeight: "800", marginTop: 6 }}>
                    SKU: <Text style={{ color: theme.colors.text }}>{p.sku ?? "—"}</Text>
                    {"   "}•{"   "}
                    Unit: <Text style={{ color: theme.colors.text }}>{p.unit ?? "—"}</Text>
                  </Text>

                  <Text style={{ color: theme.colors.muted, fontWeight: "800", marginTop: 6 }}>
                    Category: <Text style={{ color: theme.colors.text }}>{p.category ?? "—"}</Text>
                  </Text>

                  <Text style={{ color: theme.colors.muted, fontWeight: "900", marginTop: 8 }}>
                    Barcode: <Text style={{ color: theme.colors.text }}>{bc ? bc : "—"}</Text>
                  </Text>
                </>
              )}

              {isCapitalRecoveryStore && (
                <Text style={{ color: theme.colors.muted, fontWeight: "800", marginTop: 6 }}>
                  Category: <Text style={{ color: theme.colors.text }}>{p.category ?? "—"}</Text>
                </Text>
              )}

              <Text style={{ color: theme.colors.muted, fontWeight: "900", marginTop: 8 }}>
                Selling Price: <Text style={{ color: theme.colors.text }}>{sp > 0 ? money.fmt(sp) : "—"}</Text>
              </Text>

              {canSeeCost && (
                <Text style={{ color: theme.colors.muted, fontWeight: "900", marginTop: 6 }}>
                  Cost Price:{" "}
                  <Text style={{ color: theme.colors.text }}>
                    {Number.isFinite(cp) ? money.fmt(cp) : "—"}
                  </Text>
                </Text>
              )}

              {canManage && (
                <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
                  <View style={{ flex: 1 }}>
                    <Button title="Edit" variant="primary" onPress={() => openEdit(p)} disabled={loading} />
                  </View>

                  <View style={{ flex: 1 }}>
                    <Button title="Delete" variant="secondary" onPress={() => remove(p.id, p.name)} disabled={loading} />
                  </View>
                </View>
              )}
            </Pressable>
          );
        })
      )}

     <View style={{ height: keyboardSpace }} />

      <Modal
        visible={editOpen}
        animationType="fade"
        transparent
        presentationStyle="overFullScreen"
        statusBarTranslucent
        onRequestClose={closeEdit}
      >
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          keyboardVerticalOffset={0}
        >
          <View
            style={{
              flex: 1,
              backgroundColor: "rgba(2,6,23,0.96)",
              paddingHorizontal: 16,
              paddingTop: 28,
              paddingBottom: 18,
              justifyContent: "center",
            }}
          >
            <View
              style={{
                width: "100%",
                maxHeight: "88%",
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.10)",
                borderRadius: 24,
                backgroundColor: "#0B1220",
                overflow: "hidden",
                shadowColor: "#000",
                shadowOpacity: 0.35,
                shadowRadius: 24,
                shadowOffset: { width: 0, height: 12 },
                elevation: 18,
              }}
            >
              <View
                style={{
                  paddingHorizontal: 16,
                  paddingTop: 16,
                  paddingBottom: 14,
                  borderBottomWidth: 1,
                  borderBottomColor: "rgba(255,255,255,0.08)",
                  backgroundColor: "#0F172A",
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 20 }}>
                  Edit Product
                </Text>

                <Pressable
                  onPress={closeEdit}
                  hitSlop={10}
                  style={({ pressed }) => ({
                    width: 44,
                    height: 44,
                    borderRadius: 999,
                    alignItems: "center",
                    justifyContent: "center",
                    borderWidth: 1,
                    borderColor: "rgba(255,255,255,0.12)",
                    backgroundColor: pressed ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.08)",
                  })}
                >
                  <Ionicons name="close" size={22} color={theme.colors.text} />
                </Pressable>
              </View>

              <ScrollView
                style={{ flexGrow: 0 }}
                contentContainerStyle={{ padding: 16, paddingBottom: 22, gap: 12 }}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
                <TextInput
                  value={editName}
                  onChangeText={setEditName}
                  placeholder="Product name"
                  placeholderTextColor="rgba(255,255,255,0.35)"
                  style={solidInputStyle}
                />

                {!isCapitalRecoveryStore && (
                  <View style={{ flexDirection: "row", gap: 10 }}>
                    <View style={{ flex: 1 }}>
                      <TextInput
                        value={editSku}
                        onChangeText={setEditSku}
                        placeholder="SKU (optional)"
                        placeholderTextColor="rgba(255,255,255,0.35)"
                        style={solidInputStyle}
                      />
                    </View>

                    <View style={{ flex: 1 }}>
                      <TextInput
                        value={editUnit}
                        onChangeText={setEditUnit}
                        placeholder="Unit (optional)"
                        placeholderTextColor="rgba(255,255,255,0.35)"
                        style={solidInputStyle}
                      />
                    </View>
                  </View>
                )}

                <TextInput
                  value={editCategory}
                  onChangeText={setEditCategory}
                  placeholder="Category (optional)"
                  placeholderTextColor="rgba(255,255,255,0.35)"
                  style={solidInputStyle}
                />

                {!isCapitalRecoveryStore && (
                  <TextInput
                    value={editBarcode}
                    onChangeText={(t) => setEditBarcode(cleanBarcode(t))}
                    placeholder="Barcode (optional)"
                    placeholderTextColor="rgba(255,255,255,0.35)"
                    style={solidInputStyle}
                  />
                )}

                {canSeeCost && (
                  <TextInput
                    value={editCostPrice}
                    onChangeText={(t) => setEditCostPrice(t.replace(/[^0-9]/g, ""))}
                    placeholder="Cost Price (optional)"
                    keyboardType="numeric"
                    placeholderTextColor="rgba(255,255,255,0.35)"
                    style={solidInputStyle}
                  />
                )}

                <TextInput
                  value={editSellingPrice}
                  onChangeText={(t) => setEditSellingPrice(t.replace(/[^0-9]/g, ""))}
                  placeholder={isCapitalRecoveryStore ? "Selling Price" : "Selling Price (optional)"}
                  keyboardType="numeric"
                  placeholderTextColor="rgba(255,255,255,0.35)"
                  style={solidInputStyle}
                />

                <View style={{ flexDirection: "row", gap: 10, marginTop: 6 }}>
                  <View style={{ flex: 1 }}>
                    <Button title="Cancel" variant="secondary" onPress={closeEdit} disabled={loading} />
                  </View>

                  <View style={{ flex: 1 }}>
                    <Button
                      title={loading ? "Saving..." : "Save Changes"}
                      variant="primary"
                      onPress={saveEdit}
                      disabled={loading}
                    />
                  </View>
                </View>
              </ScrollView>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </Screen>
  );
}