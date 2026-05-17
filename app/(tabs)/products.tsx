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

  is_precision_product?: boolean | null;
  precision_pack_size?: number | null;
  precision_base_unit?: string | null;
  precision_sell_mode?: string | null;
  precision_allow_box_sales?: boolean | null;
  precision_allow_unit_sales?: boolean | null;
};
const PRODUCT_PRICE_DECIMALS = 6;

function isPrecisionRetailType(storeType: any) {
  const t = String(storeType ?? "").trim().toUpperCase();
  return (
    t === "PRECISION_RETAIL" ||
    t === "PRECISION" ||
    t === "PHARMACY" ||
    t === "PHARMA"
  );
}

function fmtFormulaNumber(n: number) {
  if (!Number.isFinite(n)) return "";

  const fixed = n.toFixed(PRODUCT_PRICE_DECIMALS);

  return fixed.includes(".")
    ? fixed.replace(/\.?0+$/, "")
    : fixed;
}

function normalizeDecimalInput(raw: string) {
  const cleaned = String(raw ?? "")
    .replace(",", ".")
    .replace(/[^0-9.]/g, "")
    .replace(/(\..*)\./g, "$1");

  const [whole, decimal] = cleaned.split(".");
  return decimal !== undefined
    ? `${whole}.${decimal.slice(0, PRODUCT_PRICE_DECIMALS)}`
    : whole;
}

function parsePositiveNumberOrNull(raw: string): number | null {
  const t = normalizeDecimalInput(raw).trim();
  if (!t) return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Number(n.toFixed(PRODUCT_PRICE_DECIMALS));
}

function parseZeroOrPositiveNumberOrNull(raw: string): number | null {
  const t = normalizeDecimalInput(raw).trim();
  if (!t) return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0) return null;
  return Number(n.toFixed(PRODUCT_PRICE_DECIMALS));
}

function cleanBarcode(raw: string) {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  return s.replace(/\s+/g, "");
}

function getProductLimitFriendlyMessage(err: any) {
  const raw = String(err?.message ?? "").trim();
  const msg = raw.toLowerCase();

  if (
    msg.includes("free plan limit reached") ||
    msg.includes("product limit") ||
    msg.includes("upgrade to continue")
  ) {
    const m = raw.match(/(\d+)/);
    const limit = m?.[1] ?? "30";

    return `Umefikia limit ya bidhaa ${limit} kwenye FREE plan. Ili kuendelea kuongeza bidhaa zaidi, tafadhali upgrade kwenda LITE plan.`;
  }

  return raw || "Unknown error";
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
const isPrecisionRetailStore = isPrecisionRetailType(activeStoreType);
const scopedStoreId = String(activeStoreId ?? "").trim() || null;
// Products list must be organization-wide.
// Store is only needed for active context/inventory, not for product ownership.
const productStoreScope =
  isCapitalRecoveryStore || isPrecisionRetailStore ? scopedStoreId : null;

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
const [productSearch, setProductSearch] = useState("");

const [precisionPackQty, setPrecisionPackQty] = useState("");
const [precisionPackCost, setPrecisionPackCost] = useState("");
const [precisionPackSelling, setPrecisionPackSelling] = useState("");
const [precisionUnit, setPrecisionUnit] = useState("");

const [editPrecisionPackQty, setEditPrecisionPackQty] = useState("");
const [editPrecisionPackCost, setEditPrecisionPackCost] = useState("");
const [editPrecisionPackSelling, setEditPrecisionPackSelling] = useState("");
const [editPrecisionUnit, setEditPrecisionUnit] = useState("");

const [precisionCalcOpen, setPrecisionCalcOpen] = useState(false);
const [editPrecisionCalcOpen, setEditPrecisionCalcOpen] = useState(false);

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

  if (isCapitalRecoveryStore && !scopedStoreId) {
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
        p_store_id: productStoreScope,
      });
      if (e) throw e;
      setRows((data ?? []) as ProductRow[]);
    } else {
      const { data, error: e } = await supabase.rpc("get_products", {
        p_org_id: activeOrgId,
        p_store_id: productStoreScope,
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
}, [activeOrgId, canManage, isCapitalRecoveryStore, productStoreScope, scopedStoreId]);

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

  const applyPrecisionFormula = useCallback(() => {
  const packQty = Number(normalizeDecimalInput(precisionPackQty));
  const packCost = Number(normalizeDecimalInput(precisionPackCost));
  const packSelling = Number(normalizeDecimalInput(precisionPackSelling));

  if (!Number.isFinite(packQty) || packQty <= 0) {
    Alert.alert("Missing", "Weka Pack Size / Quantity, mfano 100.");
    return;
  }

  if (!Number.isFinite(packCost) || packCost < 0) {
    Alert.alert("Missing", "Weka Buying/Cost Price ya box/pack.");
    return;
  }

  if (!Number.isFinite(packSelling) || packSelling <= 0) {
    Alert.alert("Missing", "Weka Selling Price ya box/pack.");
    return;
  }

  const unitCost = packCost / packQty;
  const unitSelling = packSelling / packQty;

  // Usibadilishe Unit ya juu. Unit ya juu ni pack/jumla mfano Box, Carton, Belo.
  // PrecisionUnit ni unit ya ndani mfano Capsule, Tablet, Piece.
  setCostPrice(fmtFormulaNumber(unitCost));
  setSellingPrice(fmtFormulaNumber(unitSelling));

  if (!category.trim()) setCategory("General");
}, [category, precisionPackCost, precisionPackQty, precisionPackSelling, precisionUnit]);

const applyEditPrecisionFormula = useCallback(() => {
  const packQty = Number(normalizeDecimalInput(editPrecisionPackQty));
  const packCost = Number(normalizeDecimalInput(editPrecisionPackCost));
  const packSelling = Number(normalizeDecimalInput(editPrecisionPackSelling));

  if (!Number.isFinite(packQty) || packQty <= 0) {
    Alert.alert("Missing", "Weka Pack Size / Quantity, mfano 100.");
    return;
  }

  if (!Number.isFinite(packCost) || packCost < 0) {
    Alert.alert("Missing", "Weka Buying/Cost Price ya box/pack.");
    return;
  }

  if (!Number.isFinite(packSelling) || packSelling <= 0) {
    Alert.alert("Missing", "Weka Selling Price ya box/pack.");
    return;
  }

  setEditCostPrice(fmtFormulaNumber(packCost / packQty));
  setEditSellingPrice(fmtFormulaNumber(packSelling / packQty));

  if (!editCategory.trim()) setEditCategory("General");
}, [editCategory, editPrecisionPackCost, editPrecisionPackQty, editPrecisionPackSelling]);

const openEdit = useCallback((p: ProductRow) => {
    setEditProductId(p.id);
    setEditName(String(p.name ?? ""));
    setEditSku(String(p.sku ?? ""));
    setEditUnit(String(p.unit ?? ""));
    setEditCategory(String(p.category ?? ""));
    setEditSellingPrice(p.selling_price != null ? String(Number(p.selling_price)) : "");
setEditCostPrice(p.cost_price != null ? String(Number(p.cost_price)) : "");
    setEditBarcode(String(p.barcode ?? ""));

    setEditPrecisionPackQty(
      p.precision_pack_size != null ? String(Number(p.precision_pack_size)) : ""
    );
    setEditPrecisionPackCost("");
    setEditPrecisionPackSelling("");
    setEditPrecisionUnit(String(p.precision_base_unit ?? ""));

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
    setEditPrecisionPackQty("");
    setEditPrecisionPackCost("");
    setEditPrecisionPackSelling("");
    setEditPrecisionUnit("");
  }, []);

 const add = useCallback(async () => {
  if (!activeOrgId) return;
if (isCapitalRecoveryStore && !scopedStoreId) return;

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
  p_store_id: productStoreScope,
p_is_precision_product: isPrecisionRetailStore,
p_precision_pack_size: isPrecisionRetailStore ? parsePositiveNumberOrNull(precisionPackQty) : null,
p_precision_base_unit: isPrecisionRetailStore ? precisionUnit.trim() || unit.trim() || null : null,
p_precision_sell_mode: isPrecisionRetailStore ? "BOTH" : "UNIT",
p_precision_allow_box_sales: isPrecisionRetailStore,
p_precision_allow_unit_sales: true,
});

      if (e) throw e;

      setName("");
      setSku("");
      setUnit("");
      setCategory("");
      setSellingPrice("");
      setCostPrice("");
     setBarcode("");
setPrecisionPackQty("");
setPrecisionPackCost("");
setPrecisionPackSelling("");
setPrecisionUnit("");

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
      Alert.alert("Plan Limit", getProductLimitFriendlyMessage(err));
    } finally {
      setLoading(false);
    }
  }, [
    activeOrgId,
    scopedStoreId,
    productStoreScope,
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
isPrecisionRetailStore,
precisionPackQty,
precisionUnit,
  ]);

  const saveEdit = useCallback(async () => {
    if (!activeOrgId || !editProductId) return;
if (isCapitalRecoveryStore && !scopedStoreId) return;

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
p_store_id: productStoreScope,

p_is_precision_product: isPrecisionRetailStore,
p_precision_pack_size: isPrecisionRetailStore
  ? parsePositiveNumberOrNull(editPrecisionPackQty)
  : null,
p_precision_base_unit: isPrecisionRetailStore
  ? editPrecisionUnit.trim() || editUnit.trim() || null
  : null,
p_precision_sell_mode: isPrecisionRetailStore ? "BOTH" : "UNIT",
p_precision_allow_box_sales: isPrecisionRetailStore,
p_precision_allow_unit_sales: true,
});
      if (e) throw e;

      closeEdit();
      await load();
      Alert.alert("Success ✅", "Product updated");
    } catch (err: any) {
      Alert.alert("Plan Limit", getProductLimitFriendlyMessage(err));
    } finally {
      setLoading(false);
    }
  }, [
    activeOrgId,
    scopedStoreId,
    productStoreScope,
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
    isPrecisionRetailStore,
    load,
    editPrecisionPackQty,
    editPrecisionUnit,
  ]);

  const remove = useCallback(
    async (productId: string, productName: string) => {
      if (!activeOrgId) return;

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
  p_store_id: productStoreScope,
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
    [activeOrgId, productStoreScope, canManage, load]
  );

  const visibleRows = useMemo(() => {
    const normalizeSearchText = (value: any) =>
      String(value ?? "")
        .toLowerCase()
        .trim()
        .replace(/[^\p{L}\p{N}]+/gu, " ")
        .replace(/\s+/g, " ");

    const normalizeCompactText = (value: any) =>
      normalizeSearchText(value).replace(/\s+/g, "");

    const q = normalizeSearchText(productSearch);
    const qCompact = normalizeCompactText(productSearch);

    const activeRows = rows.filter((r) => r.is_active !== false);

    if (!q && !qCompact) return activeRows;

    return activeRows
      .map((r) => {
        const fields = [r.name, r.sku, r.unit, r.category, r.barcode];

        const fieldTexts = fields.map((v) => normalizeSearchText(v));
        const fieldCompacts = fields.map((v) => normalizeCompactText(v));

        const exactField = fieldTexts.some((v) => v === q) || fieldCompacts.some((v) => v === qCompact);
        const startsField = fieldTexts.some((v) => v.startsWith(q)) || fieldCompacts.some((v) => v.startsWith(qCompact));
        const containsField = fieldTexts.some((v) => v.includes(q)) || fieldCompacts.some((v) => v.includes(qCompact));

        let score = 0;
        if (exactField) score = 300;
        else if (startsField) score = 200;
        else if (containsField) score = 100;

        return { row: r, score };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return String(a.row.name ?? "").localeCompare(String(b.row.name ?? ""));
      })
      .map((x) => x.row);
  }, [productSearch, rows]);

  const solidInputStyle = {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.lg,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: theme.colors.text,
    fontWeight: "800" as const,
  };

  return (
    <Screen scroll>
      <View style={{ gap: 6 }}>
  <Text style={{ fontSize: 30, fontWeight: "900", color: theme.colors.text }}>
    Products
  </Text>
  <Text style={{ color: theme.colors.muted, fontWeight: "800", lineHeight: 22 }}>
    Manage catalog, barcode, pricing, units, and store-ready products.
  </Text>
</View>

      <Card
  style={{
    gap: 12,
    borderColor: "rgba(148,163,184,0.22)",
    backgroundColor: "#FFFFFF",
  }}
>
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
    marginTop: 8,
    borderRadius: 22,
    borderColor: isCapitalRecoveryStore || isPrecisionRetailStore
      ? theme.colors.emeraldBorder
      : "rgba(148,163,184,0.20)",
    backgroundColor: isCapitalRecoveryStore || isPrecisionRetailStore
      ? "rgba(16,185,129,0.08)"
      : "rgba(241,245,249,0.72)",
    shadowOpacity: 0.08,
    shadowRadius: 14,
    elevation: 3,
  }}
>
          <Text style={{ color: theme.colors.text, fontWeight: "900" }}>
           {isCapitalRecoveryStore
  ? "Capital Recovery Product Mode"
  : isPrecisionRetailStore
  ? "Precision Retail Product Mode"
  : "Standard Product Mode"}
          </Text>
          <Text style={{ color: theme.colors.muted, fontWeight: "700", marginTop: 6 }}>
            {isCapitalRecoveryStore
  ? "Hapa unaweka bidhaa za kuuza kwa income tu. Barcode, cost, unit, na inventory-style product fields hazitumiki kwenye mode hii."
  : isPrecisionRetailStore
  ? "Hapa unaweka bidhaa zinazouzwa kwa pack, box, carton, dozen au jumla na kuzigawa kwenye unit ndogo kama tablet, piece, bottle, capsule au kipimo kingine. Mfumo utahesabu cost/selling ya unit moja automatic."
  : "Hapa unaweka bidhaa za kawaida za biashara, zikiwemo cost, barcode, na details nyingine."}
          </Text>
        </Card>

        <View style={{ flexDirection: "row", gap: 10, marginTop: 10, alignItems: "center" }}>
  <View style={{ flex: 1 }}>
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        borderWidth: 1,
        borderColor: theme.colors.emeraldBorder,
        borderRadius: theme.radius.lg,
        backgroundColor: "rgba(16,185,129,0.10)",
        paddingHorizontal: 14,
        minHeight: 54,
      }}
    >
      <Ionicons name="search" size={18} color={theme.colors.muted} />
      <TextInput
        value={productSearch}
        onChangeText={setProductSearch}
        placeholder="Search name, SKU, category..."
        placeholderTextColor={theme.colors.faint}
        autoCorrect={false}
        autoCapitalize="none"
        style={{
          flex: 1,
          color: theme.colors.text,
          fontWeight: "900",
          paddingVertical: 12,
        }}
      />
      {!!productSearch.trim() && (
        <Pressable onPress={() => setProductSearch("")} hitSlop={10}>
          <Ionicons name="close-circle" size={20} color={theme.colors.muted} />
        </Pressable>
      )}
    </View>
  </View>

  <Pressable
    onPress={load}
    disabled={loading}
    style={({ pressed }) => ({
      width: 58,
      height: 54,
      borderRadius: theme.radius.lg,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: theme.colors.emeraldBorder,
      backgroundColor: theme.colors.emeraldSoft,
      opacity: loading ? 0.55 : pressed ? 0.88 : 1,
    })}
  >
    <Ionicons name="refresh" size={22} color={theme.colors.text} />
  </Pressable>
</View>
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
        <Card
  style={{
    gap: 12,
    borderColor: "rgba(148,163,184,0.22)",
    backgroundColor: "#FFFFFF",
  }}
>
          <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 16 }}>
            {isCapitalRecoveryStore ? "Add Income Product" : "Add Product"}
          </Text>

          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Product name"
            placeholderTextColor={theme.colors.faint}
            style={{
              borderWidth: 1,
              borderColor: theme.colors.border,
              borderRadius: theme.radius.lg,
              backgroundColor: "#FFFFFF",
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
                  placeholderTextColor={theme.colors.faint}
                  style={{
                    borderWidth: 1,
                    borderColor: theme.colors.border,
                    borderRadius: theme.radius.lg,
                    backgroundColor: "#FFFFFF",
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
                  placeholderTextColor={theme.colors.faint}
                  style={{
                    borderWidth: 1,
                    borderColor: theme.colors.border,
                    borderRadius: theme.radius.lg,
                    backgroundColor: "#FFFFFF",
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
            placeholderTextColor={theme.colors.faint}
            style={{
              borderWidth: 1,
              borderColor: theme.colors.border,
              borderRadius: theme.radius.lg,
              backgroundColor: "#FFFFFF",
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
                  placeholderTextColor={theme.colors.faint}
                  style={{
                    borderWidth: 1,
                    borderColor: theme.colors.border,
                    borderRadius: theme.radius.lg,
                    backgroundColor: "#FFFFFF",
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

       {isPrecisionRetailStore && canSeeCost && (
  <Card
    style={{
      gap: 10,
      borderRadius: 22,
      borderColor: "rgba(52,211,153,0.30)",
      backgroundColor: "rgba(16,185,129,0.07)",
      shadowOpacity: 0.06,
      shadowRadius: 12,
      elevation: 2,
    }}
  >
    <Pressable
      onPress={() => setPrecisionCalcOpen((v) => !v)}
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 10,
      }}
    >
            <View style={{ flex: 1 }}>
  <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 15 }}>
    Unit & Pack Calculator
  </Text>
  <Text style={{ color: theme.colors.muted, fontWeight: "800", marginTop: 3 }}>
    Auto calculate unit cost/selling
  </Text>
</View>

<Ionicons
  name={precisionCalcOpen ? "chevron-up" : "chevron-down"}
  size={22}
  color={theme.colors.text}
/>
</Pressable>

{precisionCalcOpen && (
  <>

<Text style={{ color: theme.colors.muted, fontWeight: "800", lineHeight: 19 }}>
  Mfano: Box, carton, dozen, sack au pack inaweza kugawanywa kwenye unit ndogo.
  Mfumo utapata cost/selling ya unit moja automatic.
</Text>

          <View style={{ flexDirection: "row", gap: 10 }}>
  <View style={{ flex: 1.15 }}>
    <TextInput
      value={precisionPackQty}
      onChangeText={(t) => setPrecisionPackQty(normalizeDecimalInput(t))}
      placeholder="Pack size e.g. 100"
      keyboardType="numeric"
      placeholderTextColor={theme.colors.faint}
      style={[
        solidInputStyle,
        {
          fontSize: 13,
          backgroundColor: "#FFFFFF",
        },
      ]}
    />
  </View>

  <View style={{ flex: 1 }}>
    <TextInput
      value={precisionUnit}
      onChangeText={setPrecisionUnit}
      placeholder="Unit e.g. tablet"
      placeholderTextColor={theme.colors.faint}
      style={[
        solidInputStyle,
        {
          fontSize: 13,
          backgroundColor: "#ECFDF5",
          borderColor: theme.colors.emeraldBorder,
          color: theme.colors.text,
          fontWeight: "900",
        },
      ]}
    />
  </View>
</View>

              <TextInput
                value={precisionPackCost}
                onChangeText={(t) => setPrecisionPackCost(normalizeDecimalInput(t))}
                placeholder="Buying/Cost price ya box/pack"
                keyboardType="numeric"
                placeholderTextColor={theme.colors.faint}
                style={solidInputStyle}
              />

              <TextInput
                value={precisionPackSelling}
                onChangeText={(t) => setPrecisionPackSelling(normalizeDecimalInput(t))}
                placeholder="Selling price ya box/pack"
                keyboardType="numeric"
                placeholderTextColor={theme.colors.faint}
                style={solidInputStyle}
              />

              <Button
                title="Calculate Per Unit Price"
                onPress={applyPrecisionFormula}
                disabled={loading}
                variant="secondary"
              />

              <Text style={{ color: theme.colors.faint, fontWeight: "800" }}>
  Baada ya calculate, Cost Price na Selling Price chini zitajazwa kama bei ya unit moja.
</Text>
</>
)}
            </Card>
          )}

        {canSeeCost && (
            <TextInput
              value={costPrice}
              onChangeText={(t) => setCostPrice(normalizeDecimalInput(t))}
              placeholder="Cost Price (optional)"
              keyboardType="numeric"
              placeholderTextColor={theme.colors.faint}
              style={{
                borderWidth: 1,
                borderColor: theme.colors.border,
                borderRadius: theme.radius.lg,
                backgroundColor: "#FFFFFF",
                paddingHorizontal: 14,
                paddingVertical: 12,
                color: theme.colors.text,
                fontWeight: "800",
              }}
            />
          )}

          <TextInput
            value={sellingPrice}
            onChangeText={(t) => setSellingPrice(normalizeDecimalInput(t))}
            placeholder={isCapitalRecoveryStore ? "Selling Price" : "Selling Price (optional)"}
            keyboardType="numeric"
            placeholderTextColor={theme.colors.faint}
            style={{
              borderWidth: 1,
              borderColor: theme.colors.border,
              borderRadius: theme.radius.lg,
              backgroundColor: "#FFFFFF",
              paddingHorizontal: 14,
              paddingVertical: 12,
              color: theme.colors.text,
              fontWeight: "800",
            }}
          />

       <Pressable
  onPress={add}
  disabled={loading}
  style={({ pressed }) => ({
    minHeight: 58,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: loading ? "rgba(16,185,129,0.45)" : "#059669",
    opacity: pressed ? 0.9 : 1,
    shadowColor: "#059669",
    shadowOpacity: 0.22,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  })}
>
  <Text style={{ color: "#FFFFFF", fontWeight: "900", fontSize: 16 }}>
    {loading ? "Saving..." : isCapitalRecoveryStore ? "Add Income Product" : "Add Product"}
  </Text>
</Pressable>
          {!isCapitalRecoveryStore && (
            <Text style={{ color: theme.colors.faint, fontWeight: "800", marginTop: 2 }}>
              FREE plan ina limit ya products. Ukifika mwisho, utaombwa u-upgrade.
            </Text>
          )}

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

     <View style={{ marginTop: 4, gap: 4 }}>
  <Text style={{ fontWeight: "900", fontSize: 20, color: theme.colors.text }}>
    {isCapitalRecoveryStore ? "Income Products" : "Product Catalog"}
  </Text>
  <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>
    {visibleRows.length} active item{visibleRows.length === 1 ? "" : "s"}
  </Text>
</View>

      {visibleRows.length === 0 ? (
        <Card>
          <Text style={{ color: theme.colors.text, fontWeight: "900" }}>
            {productSearch.trim()
  ? "No matching products"
  : isCapitalRecoveryStore
  ? "No income products yet"
  : "No products yet"}
          </Text>
          <Text style={{ color: theme.colors.muted, fontWeight: "700", marginTop: 6 }}>
           {productSearch.trim()
  ? "Badili neno la search au futa search kuona bidhaa zote."
  : canManage
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
  borderColor: "rgba(148,163,184,0.22)",
  borderRadius: 24,
  backgroundColor: "#FFFFFF",
  padding: 18,
  marginBottom: 12,
  shadowColor: "#0F172A",
  shadowOpacity: 0.08,
  shadowRadius: 14,
  shadowOffset: { width: 0, height: 8 },
  elevation: 3,
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
                <View style={{ flexDirection: "row", gap: 10, marginTop: 16 }}>
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
                  placeholderTextColor={theme.colors.faint}
                  style={solidInputStyle}
                />

                {!isCapitalRecoveryStore && (
                  <View style={{ flexDirection: "row", gap: 10 }}>
                    <View style={{ flex: 1 }}>
                      <TextInput
                        value={editSku}
                        onChangeText={setEditSku}
                        placeholder="SKU (optional)"
                        placeholderTextColor={theme.colors.faint}
                        style={solidInputStyle}
                      />
                    </View>

                    <View style={{ flex: 1 }}>
                      <TextInput
                        value={editUnit}
                        onChangeText={setEditUnit}
                        placeholder="Unit / UOM (optional)"
                        placeholderTextColor={theme.colors.faint}
                        style={solidInputStyle}
                      />
                    </View>
                  </View>
                )}

                <TextInput
                  value={editCategory}
                  onChangeText={setEditCategory}
                  placeholder="Category (optional)"
                  placeholderTextColor={theme.colors.faint}
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

                {isPrecisionRetailStore && canSeeCost && (
                  <Card
                    style={{
                      gap: 10,
                      borderColor: "rgba(52,211,153,0.28)",
                      backgroundColor: "rgba(52,211,153,0.08)",
                    }}
                  >
                    <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 15 }}>
                      Unit & Pack Calculator
                    </Text>

                    <Text style={{ color: theme.colors.muted, fontWeight: "800", lineHeight: 19 }}>
                      Badili pack size, unit ya ndani, cost ya pack na selling ya pack. Mfumo utahesabu bei ya unit moja automatic.
                    </Text>

                   <View style={{ flexDirection: "row", gap: 10 }}>
  <View style={{ flex: 1.15 }}>
    <TextInput
      value={editPrecisionPackQty}
      onChangeText={(t) => setEditPrecisionPackQty(normalizeDecimalInput(t))}
      placeholder="Pack size e.g. 100"
      keyboardType="numeric"
      placeholderTextColor={theme.colors.faint}
      style={[
        solidInputStyle,
        {
          fontSize: 13,
          backgroundColor: "#FFFFFF",
        },
      ]}
    />
  </View>

  <View style={{ flex: 1 }}>
    <TextInput
      value={editPrecisionUnit}
      onChangeText={setEditPrecisionUnit}
      placeholder="Unit e.g. capsule"
      placeholderTextColor={theme.colors.faint}
      style={[
        solidInputStyle,
        {
          fontSize: 13,
          backgroundColor: "#ECFDF5",
          borderColor: theme.colors.emeraldBorder,
          color: theme.colors.text,
          fontWeight: "900",
        },
      ]}
    />
  </View>
</View>

                    <TextInput
                      value={editPrecisionPackCost}
                      onChangeText={(t) => setEditPrecisionPackCost(normalizeDecimalInput(t))}
                      placeholder="Buying/Cost price ya box/pack"
                      keyboardType="numeric"
                      placeholderTextColor={theme.colors.faint}
                      style={solidInputStyle}
                    />

                    <TextInput
                      value={editPrecisionPackSelling}
                      onChangeText={(t) => setEditPrecisionPackSelling(normalizeDecimalInput(t))}
                      placeholder="Selling price ya box/pack"
                      keyboardType="numeric"
                      placeholderTextColor={theme.colors.faint}
                      style={solidInputStyle}
                    />

                    <Button
                      title="Calculate Per Unit Price"
                      onPress={applyEditPrecisionFormula}
                      disabled={loading}
                      variant="secondary"
                    />

                    <Text style={{ color: theme.colors.faint, fontWeight: "800" }}>
                      Baada ya calculate, Cost Price na Selling Price chini zitabadilishwa kama bei ya unit moja.
                    </Text>
                  </Card>
                )}

                {canSeeCost && (
                  <TextInput
                    value={editCostPrice}
                    onChangeText={(t) => setEditCostPrice(normalizeDecimalInput(t))}
                    placeholder="Cost Price (optional)"
                    keyboardType="numeric"
                    placeholderTextColor={theme.colors.faint}
                    style={solidInputStyle}
                  />
                )}

                <TextInput
                  value={editSellingPrice}
                  onChangeText={(t) => setEditSellingPrice(normalizeDecimalInput(t))}
                  placeholder={isCapitalRecoveryStore ? "Selling Price" : "Selling Price (optional)"}
                  keyboardType="numeric"
                  placeholderTextColor={theme.colors.faint}
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