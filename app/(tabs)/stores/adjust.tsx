// app/(tabs)/stores/adjust.tsx
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
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
  TouchableWithoutFeedback,
  View,
} from "react-native";

import { useOrg } from "../../../src/context/OrgContext";
import { supabase } from "../../../src/supabase/supabaseClient";
import { Button } from "../../../src/ui/Button";
import { Card } from "../../../src/ui/Card";
import { Screen } from "../../../src/ui/Screen";
import { theme } from "../../../src/ui/theme";

type Mode = "ADD" | "REDUCE";

type SupplierRow = {
  id: string;
  name: string;
  phone?: string | null;
  email?: string | null;
};

type PrecisionMeta = {
  is_precision_product: boolean;
  precision_pack_size: number | null;
  precision_base_unit: string | null;
  precision_package_unit: string | null;
};

function one(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : v;
}

function asDecimal(n: number) {
  if (!Number.isFinite(n)) return 0;
  return Number(n.toFixed(3));
}

const PRODUCT_PRICE_DECIMALS = 6;

function normalizeDecimalInput(raw: string) {
  const cleaned = String(raw ?? "")
    .replace(",", ".")
    .replace(/[^0-9.]/g, "")
    .replace(/(\..*)\./g, "$1");

  const [whole, decimal] = cleaned.split(".");
  return decimal !== undefined ? `${whole}.${decimal.slice(0, PRODUCT_PRICE_DECIMALS)}` : whole;
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

function isPrecisionRetailType(storeType: any) {
  const t = String(storeType ?? "").trim().toUpperCase();
  return t === "PRECISION_RETAIL" || t === "PRECISION" || t === "PHARMACY" || t === "PHARMA";
}

function localYMD(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default function AdjustStockScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    productId?: string | string[];
    productName?: string | string[];
    sku?: string | string[];
    currentQty?: string | string[];
  }>();

  const { activeOrgId, activeRole, activeStoreId, activeStoreName, activeStoreType } = useOrg();
  const isCapitalRecoveryStore = activeStoreType === "CAPITAL_RECOVERY";

  const canAdjust = useMemo(() => {
    if (isCapitalRecoveryStore) return false;
    const r = (activeRole ?? "staff") as "owner" | "admin" | "staff" | "cashier";
    return r === "owner" || r === "admin";
  }, [activeRole, isCapitalRecoveryStore]);

  const productId = (one(params.productId) ?? "").trim();
  const passedName = (one(params.productName) ?? "").trim();
  const passedSku = (one(params.sku) ?? "").trim();
  const currentQty = (one(params.currentQty) ?? "—").trim() || "—";

 const [displayName, setDisplayName] = useState<string>(passedName || "Product");
const [displaySku, setDisplaySku] = useState<string>(passedSku || "—");

const [precisionMeta, setPrecisionMeta] = useState<PrecisionMeta>({
  is_precision_product: false,
  precision_pack_size: null,
  precision_base_unit: null,
  precision_package_unit: null,
});

const [precisionStockMode, setPrecisionStockMode] = useState<"UNIT" | "BOX">("BOX");

  const [mode, setMode] = useState<Mode>("ADD");
  const [amount, setAmount] = useState<string>("");
  const [reason, setReason] = useState<string>("");
  const [supplierName, setSupplierName] = useState<string>("");
  const [supplierInvoiceNo, setSupplierInvoiceNo] = useState<string>("");
  const [suppliers, setSuppliers] = useState<SupplierRow[]>([]);
  const [supplierLoading, setSupplierLoading] = useState(false);
  const [expiryDate, setExpiryDate] = useState<string>("");
  const [expiryAlertDays, setExpiryAlertDays] = useState<number>(30);
const [saving, setSaving] = useState(false);
const [showOptionalDetails, setShowOptionalDetails] = useState(false);

const isPrecisionRetailStore = isPrecisionRetailType(activeStoreType);
const productStoreScope = isPrecisionRetailStore ? activeStoreId : null;
const canQuickEditProduct = canAdjust;

const [productDetails, setProductDetails] = useState<any | null>(null);
const [quickEditOpen, setQuickEditOpen] = useState(false);
const [quickEditSaving, setQuickEditSaving] = useState(false);

const [quickName, setQuickName] = useState("");
const [quickSku, setQuickSku] = useState("");
const [quickUnit, setQuickUnit] = useState("");
const [quickCategory, setQuickCategory] = useState("");
const [quickBarcode, setQuickBarcode] = useState("");
const [quickCostPrice, setQuickCostPrice] = useState("");
const [quickSellingPrice, setQuickSellingPrice] = useState("");

const [quickPrecisionPackQty, setQuickPrecisionPackQty] = useState("");
const [quickPrecisionPackCost, setQuickPrecisionPackCost] = useState("");
const [quickPrecisionPackSelling, setQuickPrecisionPackSelling] = useState("");
const [quickPrecisionUnit, setQuickPrecisionUnit] = useState("");

const [kbHeight, setKbHeight] = useState(0);

  useEffect(() => {
    const show = Keyboard.addListener("keyboardDidShow", (e: any) => {
      const h = e?.endCoordinates?.height ?? 0;
      setKbHeight(h);
    });

    const hide = Keyboard.addListener("keyboardDidHide", () => setKbHeight(0));

    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function hydrateFromDb() {
      if (passedName) {
        setDisplayName(passedName);
        if (passedSku) setDisplaySku(passedSku);
      }

      if (!productId) return;

      if (isCapitalRecoveryStore) {
        if (!cancelled) {
          setDisplayName(passedName || "Product");
          setDisplaySku("—");
        }
        return;
      }

      try {
        if (activeStoreId) {
          const access = await supabase.rpc("ensure_my_store_access", {
            p_store_id: activeStoreId,
          });

          if (access.error) throw access.error;
        }

       if (!activeOrgId) {
  throw new Error("org_id required");
}

const { data, error } = await supabase.rpc("get_products_manage", {
  p_org_id: activeOrgId,
  p_store_id: activeStoreId,
});

if (error) throw error;

const found = Array.isArray(data)
  ? data.find((x: any) => String(x.id) === String(productId))
  : null;

if (error) throw error;

      

console.log("PRECISION PRODUCT RAW =>", found);

if (!cancelled) {
  setDisplayName((found?.name ?? "").trim() || "Product");
  if (!passedSku) setDisplaySku((found?.sku ?? "").trim() || "—");

  setProductDetails(found ?? null);

setPrecisionMeta({
    is_precision_product: Boolean(found?.is_precision_product),
    precision_pack_size:
      found?.precision_pack_size != null ? Number(found.precision_pack_size) : null,
    precision_base_unit: found?.precision_base_unit ?? null,
    precision_package_unit: found?.unit ?? null,
  });
}
      } catch (e) {
        console.log("ADJUST HYDRATE ERROR =>", e);
        if (!cancelled) {
          setDisplayName(passedName || "Product");
          setDisplaySku(passedSku || "—");
        }
      }
    }

    void hydrateFromDb();

    return () => {
      cancelled = true;
    };
  }, [productId, passedName, passedSku, activeOrgId, activeStoreId, isCapitalRecoveryStore]);

  useEffect(() => {
    let cancelled = false;

    async function loadSuppliers() {
      if (!activeStoreId || isCapitalRecoveryStore) {
        setSuppliers([]);
        return;
      }

      setSupplierLoading(true);

      try {
        const { data: storeData, error: storeErr } = await supabase
          .from("stores")
          .select("organization_id")
          .eq("id", activeStoreId)
          .maybeSingle();

        if (storeErr) throw storeErr;

        const orgId = String((storeData as any)?.organization_id ?? "").trim();
        if (!orgId) {
          if (!cancelled) setSuppliers([]);
          return;
        }

        const { data, error } = await supabase
          .from("suppliers")
          .select("id, name, phone, email")
          .eq("organization_id", orgId)
          .order("name", { ascending: true });

        if (error) throw error;

        if (!cancelled) {
          setSuppliers((data ?? []) as SupplierRow[]);
        }
      } catch {
        if (!cancelled) setSuppliers([]);
      } finally {
        if (!cancelled) setSupplierLoading(false);
      }
    }

    void loadSuppliers();

    return () => {
      cancelled = true;
    };
  }, [activeStoreId, isCapitalRecoveryStore]);

  const onAmountChange = useCallback((txt: string) => {
    const raw = String(txt ?? "").replace(",", ".");
    const cleaned = raw.replace(/[^0-9.]/g, "").replace(/(\..*)\./g, "$1");

    const [whole, decimal] = cleaned.split(".");
    const next = decimal !== undefined ? `${whole}.${decimal.slice(0, 3)}` : whole;

    setAmount(next);
  }, []);

  const isValidExpiryInput = useCallback((value: string) => {
    const s = String(value ?? "").trim();
    if (!s) return true;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;

    const d = new Date(`${s}T00:00:00`);
    if (!Number.isFinite(d.getTime())) return false;

    return localYMD(d) === s;
  }, []);

  const ensureNotLockedToday = useCallback(async () => {
    if (!activeStoreId) return false;
    if (isCapitalRecoveryStore) return false;

    const today = localYMD();

    const { data, error } = await supabase.rpc("is_closing_locked", {
      p_store_id: activeStoreId,
      p_date: today,
    });

    if (error) return true;

    const locked = Boolean(data);

    if (locked) {
      Alert.alert(
        "Locked",
        `Siku ${today} imefungwa. Huwezi kubadili stock kwenye siku iliyolockiwa.`
      );
      return false;
    }

    return true;
  }, [activeStoreId, isCapitalRecoveryStore]);

  const applyQuickPrecisionFormula = useCallback(() => {
    const packQty = Number(normalizeDecimalInput(quickPrecisionPackQty));
    const packCost = Number(normalizeDecimalInput(quickPrecisionPackCost));
    const packSelling = Number(normalizeDecimalInput(quickPrecisionPackSelling));

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

    setQuickCostPrice(String(Number((packCost / packQty).toFixed(PRODUCT_PRICE_DECIMALS))));
    setQuickSellingPrice(String(Number((packSelling / packQty).toFixed(PRODUCT_PRICE_DECIMALS))));

    if (!quickCategory.trim()) setQuickCategory("General");
  }, [quickCategory, quickPrecisionPackCost, quickPrecisionPackQty, quickPrecisionPackSelling]);

  const openQuickEdit = useCallback(() => {
    if (!canQuickEditProduct) {
      Alert.alert("No Access", "Owner/Admin only.");
      return;
    }

    const p = productDetails ?? {};

    setQuickName(String(p?.name ?? displayName ?? ""));
    setQuickSku(String(p?.sku ?? (displaySku === "—" ? "" : displaySku) ?? ""));
    setQuickUnit(String(p?.unit ?? ""));
    setQuickCategory(String(p?.category ?? ""));
    setQuickBarcode(String(p?.barcode ?? ""));
    setQuickCostPrice(p?.cost_price != null ? String(Number(p.cost_price)) : "");
    setQuickSellingPrice(p?.selling_price != null ? String(Number(p.selling_price)) : "");

    setQuickPrecisionPackQty(
      p?.precision_pack_size != null ? String(Number(p.precision_pack_size)) : ""
    );
    setQuickPrecisionPackCost("");
    setQuickPrecisionPackSelling("");
    setQuickPrecisionUnit(String(p?.precision_base_unit ?? ""));

    setQuickEditOpen(true);
  }, [canQuickEditProduct, displayName, displaySku, productDetails]);

  const closeQuickEdit = useCallback(() => {
    if (quickEditSaving) return;
    setQuickEditOpen(false);
  }, [quickEditSaving]);

  const saveQuickEdit = useCallback(async () => {
    if (!activeOrgId || !productId) return;

    const n = quickName.trim();
    if (!n) {
      Alert.alert("Missing", "Weka product name.");
      return;
    }

    const sp = parsePositiveNumberOrNull(quickSellingPrice);
    if (quickSellingPrice.trim() && sp === null) {
      Alert.alert("Invalid", "Selling Price iwe namba (> 0) au uiache wazi.");
      return;
    }

    const cp = parseZeroOrPositiveNumberOrNull(quickCostPrice);
    if (quickCostPrice.trim() && cp === null) {
      Alert.alert("Invalid", "Cost Price iwe namba (>= 0) au uiache wazi.");
      return;
    }

    if (sp === null && cp === null) {
      Alert.alert("Missing", "Weka angalau Cost Price au Selling Price.");
      return;
    }

    const bc = cleanBarcode(quickBarcode);
    if (bc && bc.length < 6) {
      Alert.alert("Invalid", "Barcode inaonekana fupi sana.");
      return;
    }

    setQuickEditSaving(true);

    try {
      const { error } = await supabase.rpc("upsert_product", {
        p_org_id: activeOrgId,
        p_product_id: productId,
        p_name: n,
        p_sku: quickSku.trim() || null,
        p_unit: quickUnit.trim() || null,
        p_category: quickCategory.trim() || null,
        p_is_active: true,
        p_selling_price: sp,
        p_cost_price: cp,
        p_barcode: bc || null,
        p_store_id: productStoreScope,

        p_is_precision_product: isPrecisionRetailStore,
        p_precision_pack_size: isPrecisionRetailStore
          ? parsePositiveNumberOrNull(quickPrecisionPackQty)
          : null,
        p_precision_base_unit: isPrecisionRetailStore
          ? quickPrecisionUnit.trim() || quickUnit.trim() || null
          : null,
        p_precision_sell_mode: isPrecisionRetailStore ? "BOTH" : "UNIT",
        p_precision_allow_box_sales: isPrecisionRetailStore,
        p_precision_allow_unit_sales: true,
      });

      if (error) throw error;

      setDisplayName(n);
      setDisplaySku(quickSku.trim() || "—");
      setProductDetails((prev: any) => ({
        ...(prev ?? {}),
        id: productId,
        name: n,
        sku: quickSku.trim() || null,
        unit: quickUnit.trim() || null,
        category: quickCategory.trim() || null,
        barcode: bc || null,
        cost_price: cp,
        selling_price: sp,
        is_precision_product: isPrecisionRetailStore,
        precision_pack_size: isPrecisionRetailStore
          ? parsePositiveNumberOrNull(quickPrecisionPackQty)
          : null,
        precision_base_unit: isPrecisionRetailStore
          ? quickPrecisionUnit.trim() || quickUnit.trim() || null
          : null,
      }));

      setPrecisionMeta((prev) => ({
        ...prev,
        is_precision_product: isPrecisionRetailStore,
        precision_pack_size: isPrecisionRetailStore
          ? parsePositiveNumberOrNull(quickPrecisionPackQty)
          : null,
        precision_base_unit: isPrecisionRetailStore
          ? quickPrecisionUnit.trim() || quickUnit.trim() || null
          : null,
        precision_package_unit: quickUnit.trim() || prev.precision_package_unit,
      }));

      setQuickEditOpen(false);
      Alert.alert("Success ✅", "Product details updated.");
    } catch (err: any) {
      Alert.alert("Update failed", err?.message ?? "Unknown error");
    } finally {
      setQuickEditSaving(false);
    }
  }, [
    activeOrgId,
    productId,
    quickName,
    quickSku,
    quickUnit,
    quickCategory,
    quickBarcode,
    quickCostPrice,
    quickSellingPrice,
    productStoreScope,
    productDetails,
    isPrecisionRetailStore,
    quickPrecisionPackQty,
    quickPrecisionUnit,
  ]);

  const submit = useCallback(async () => {
    if (saving) return;

    if (!activeStoreId) {
      Alert.alert("Missing", "No active store selected.");
      return;
    }

    if (isCapitalRecoveryStore) {
      Alert.alert("Not Available", "Adjust Stock haitumiki kwa Capital Recovery store.");
      return;
    }

    if (!productId) {
      Alert.alert("Missing", "Product not found.");
      return;
    }

    if (!canAdjust) {
      Alert.alert("No Access", "Owner/Admin only.");
      return;
    }

    const okToProceed = await ensureNotLockedToday();
    if (!okToProceed) return;

    const trimmed = (amount ?? "").trim();
    const trimmedExpiry = (expiryDate ?? "").trim();

    if (!trimmed) {
      Alert.alert("Invalid", "Amount lazima iandikwe.");
      return;
    }

    const n = Number(trimmed);

    if (!Number.isFinite(n) || n < 0) {
      Alert.alert("Invalid", "Amount haiwezi kuwa negative.");
      return;
    }

    const decimalAmount = asDecimal(n);

    if (decimalAmount < 0) {
      Alert.alert("Invalid", "Amount lazima iwe namba halali.");
      return;
    }

    if (mode === "ADD" && trimmedExpiry) {
      if (!isValidExpiryInput(trimmedExpiry)) {
        Alert.alert("Invalid Expiry", "Tumia format sahihi ya expiry date: YYYY-MM-DD");
        return;
      }

      if (trimmedExpiry < localYMD()) {
        Alert.alert("Invalid Expiry", "Expiry date haiwezi kuwa ya nyuma.");
        return;
      }
    }

    if (decimalAmount === 0) {
      if (mode !== "ADD") {
        Alert.alert("Invalid", "Amount ya 0 inaruhusiwa kwa expiry update tu.");
        return;
      }

      if (!trimmedExpiry) {
        Alert.alert("Invalid", "Weka expiry date kama amount ni 0.");
        return;
      }
    }

    setSaving(true);

    try {
      const access = await supabase.rpc("ensure_my_store_access", {
        p_store_id: activeStoreId,
      });

      if (access.error) throw access.error;

      const { data, error } = await supabase.rpc("adjust_stock", {
        p_store_id: activeStoreId,
        p_product_id: productId,
        p_amount: Math.abs(decimalAmount),
        p_mode: mode,
        p_note: reason?.trim() ? reason.trim() : null,
        p_expiry_date: mode === "ADD" && expiryDate.trim() ? expiryDate.trim() : null,
        p_supplier_name: mode === "ADD" && supplierName.trim() ? supplierName.trim() : null,
        p_supplier_invoice_no:
  mode === "ADD" && supplierInvoiceNo.trim() ? supplierInvoiceNo.trim() : null,

p_expiry_alert_days:
  mode === "ADD" && expiryDate.trim()
    ? expiryAlertDays
    : null,

p_precision_stock_mode: precisionMeta.is_precision_product ? precisionStockMode : "UNIT",
      } as any);

      if (error) throw error;

      const newQty =
        Array.isArray(data) && data.length > 0 ? (data[0] as any)?.new_qty : null;

      Alert.alert(
        "Success ✅",
        decimalAmount === 0
          ? "Expiry updated"
          : newQty === null
            ? "Stock updated"
            : `New Qty: ${newQty}`
      );

      setExpiryDate("");
      setExpiryAlertDays(30);
      setSupplierName("");
      setSupplierInvoiceNo("");
      setAmount("");

      router.back();
    } catch (err: any) {
      Alert.alert("Failed", err?.message ?? "Unknown error");
    } finally {
      setSaving(false);
    }
  }, [
    saving,
    activeStoreId,
    isCapitalRecoveryStore,
    productId,
    canAdjust,
    ensureNotLockedToday,
    amount,
    reason,
    supplierName,
    supplierInvoiceNo,
    mode,
   expiryDate,
expiryAlertDays,
isValidExpiryInput,
precisionMeta.is_precision_product,
precisionStockMode,
router,
  ]);

const content = (
    <View style={{ flex: 1, gap: 12 }}>
      <View style={{ gap: 6 }}>
        <Text style={{ fontSize: 28, fontWeight: "900", color: theme.colors.text }}>
          {isCapitalRecoveryStore ? "Adjust Disabled" : "Adjust Stock"}
        </Text>

        <Text style={{ color: theme.colors.muted, fontWeight: "800", lineHeight: 20 }}>
          {activeStoreName ?? "—"} • {displayName} • Current Qty: {currentQty}
        </Text>
      </View>

      {isCapitalRecoveryStore ? (
        <Card style={{ gap: 8 }}>
          <Text style={{ color: theme.colors.text, fontWeight: "900" }}>
            Capital Recovery store haitumii Adjust Stock.
          </Text>
          <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>
            Tumia Products + Capital Recovery Workspace. Inventory adjustment imezimwa kwenye mode hii.
          </Text>
        </Card>
      ) : null}

      <Card style={{ gap: 12 }}>
        <View style={{ gap: 4 }}>
          <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>Product</Text>
          <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 18 }}>
            {displayName}
          </Text>
          <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>
            SKU: {displaySku} • Store: {activeStoreName ?? "—"}
          </Text>
        </View>

        <View style={{ flexDirection: "row", gap: 10 }}>
          <Pressable
            onPress={() => setMode("ADD")}
            disabled={isCapitalRecoveryStore || saving}
            style={({ pressed }) => ({
              flex: 1,
              minHeight: 46,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: mode === "ADD" ? "rgba(52,211,153,0.55)" : theme.colors.border,
              backgroundColor: mode === "ADD" ? "rgba(52,211,153,0.12)" : "rgba(255,255,255,0.05)",
              alignItems: "center",
              justifyContent: "center",
              opacity: pressed ? 0.92 : isCapitalRecoveryStore ? 0.6 : 1,
            })}
          >
            <Text style={{ color: theme.colors.text, fontWeight: "900" }}>Add Stock</Text>
          </Pressable>

          <Pressable
            onPress={() => {
              setMode("REDUCE");
              setExpiryDate("");
              setExpiryAlertDays(30);
              setSupplierName("");
              setSupplierInvoiceNo("");
              setShowOptionalDetails(false);
            }}
            disabled={isCapitalRecoveryStore || saving}
            style={({ pressed }) => ({
              flex: 1,
              minHeight: 46,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: mode === "REDUCE" ? theme.colors.dangerBorder : theme.colors.border,
              backgroundColor: mode === "REDUCE" ? "rgba(239,68,68,0.10)" : "rgba(255,255,255,0.05)",
              alignItems: "center",
              justifyContent: "center",
              opacity: pressed ? 0.92 : isCapitalRecoveryStore ? 0.6 : 1,
            })}
          >
            <Text style={{ color: theme.colors.text, fontWeight: "900" }}>Reduce Stock</Text>
          </Pressable>
        </View>

        <View style={{ gap: 8 }}>
          <Text style={{ color: theme.colors.text, fontWeight: "900" }}>
            {precisionMeta.is_precision_product
              ? precisionStockMode === "BOX"
                ? `Stock Quantity (${precisionMeta.precision_package_unit ?? "Box/Pack"})`
                : `Stock Quantity (${precisionMeta.precision_base_unit ?? "Units"})`
              : "Stock Quantity"}
          </Text>

          {precisionMeta.is_precision_product ? (
            <View style={{ flexDirection: "row", gap: 10 }}>
              <Pressable
                onPress={() => setPrecisionStockMode("BOX")}
                disabled={saving}
                style={{
                  flex: 1,
                  minHeight: 42,
                  borderRadius: 999,
                  alignItems: "center",
                  justifyContent: "center",
                  borderWidth: 1,
                  borderColor:
                    precisionStockMode === "BOX"
                      ? theme.colors.emeraldBorder
                      : theme.colors.border,
                  backgroundColor:
                    precisionStockMode === "BOX"
                      ? theme.colors.emeraldSoft
                      : "rgba(255,255,255,0.05)",
                }}
              >
                <Text style={{ color: theme.colors.text, fontWeight: "900" }}>
  {precisionMeta.precision_package_unit ?? "Box/Pack"}
</Text>
              </Pressable>

              <Pressable
                onPress={() => setPrecisionStockMode("UNIT")}
                disabled={saving}
                style={{
                  flex: 1,
                  minHeight: 42,
                  borderRadius: 999,
                  alignItems: "center",
                  justifyContent: "center",
                  borderWidth: 1,
                  borderColor:
                    precisionStockMode === "UNIT"
                      ? theme.colors.emeraldBorder
                      : theme.colors.border,
                  backgroundColor:
                    precisionStockMode === "UNIT"
                      ? theme.colors.emeraldSoft
                      : "rgba(255,255,255,0.05)",
                }}
              >
                <Text style={{ color: theme.colors.text, fontWeight: "900" }}>
                  {precisionMeta.precision_base_unit ?? "Unit"}
                </Text>
              </Pressable>
            </View>
          ) : null}

          <TextInput
            value={amount}
            onChangeText={onAmountChange}
            onFocus={() => {
              if (amount === "0") setAmount("");
            }}
            keyboardType="decimal-pad"
            returnKeyType="done"
            onSubmitEditing={Keyboard.dismiss}
            placeholder={
  precisionMeta.is_precision_product
    ? precisionStockMode === "BOX"
      ? `mf. 1 ${precisionMeta.precision_package_unit ?? "box"}`
      : `mf. 100 ${precisionMeta.precision_base_unit ?? "unit"}`
    : "0"
}
            placeholderTextColor="rgba(255,255,255,0.35)"
            editable={!isCapitalRecoveryStore && !saving}
            style={{
              borderWidth: 1,
              borderColor: theme.colors.border,
              borderRadius: theme.radius.lg,
              backgroundColor: "rgba(255,255,255,0.05)",
              paddingHorizontal: 14,
              paddingVertical: 12,
              color: theme.colors.text,
              fontWeight: "900",
              opacity: isCapitalRecoveryStore ? 0.6 : 1,
            }}
          />

          {mode === "ADD" ? (
            <Text style={{ color: theme.colors.muted, fontWeight: "800", lineHeight: 18 }}>
              {precisionMeta.is_precision_product && precisionMeta.precision_pack_size
  ? precisionStockMode === "BOX"
  ? `Mfano: ukiweka 1 ${precisionMeta.precision_package_unit ?? "box"}, mfumo utaongeza ${precisionMeta.precision_pack_size} ${precisionMeta.precision_base_unit ?? "units"} kwenye stock.`
  : `Mfano: ukiweka ${precisionMeta.precision_pack_size} ${precisionMeta.precision_base_unit ?? "units"}, ni sawa na 1 ${precisionMeta.precision_package_unit ?? "box"}.`
  : "Weka 0 kama unabadilisha expiry date tu."}
            </Text>
          ) : null}
        </View>

        {mode === "ADD" ? (
          <View style={{ gap: 8 }}>
            <Text style={{ color: theme.colors.text, fontWeight: "900" }}>
              Expiry Date (optional)
            </Text>

            <TextInput
              value={expiryDate}
              onChangeText={setExpiryDate}
              placeholder="YYYY-MM-DD"
              placeholderTextColor="rgba(255,255,255,0.35)"
              editable={!isCapitalRecoveryStore && !saving}
              autoCapitalize="none"
              autoCorrect={false}
              style={{
                borderWidth: 1,
                borderColor: theme.colors.border,
                borderRadius: theme.radius.lg,
                backgroundColor: "rgba(255,255,255,0.05)",
                paddingHorizontal: 14,
                paddingVertical: 12,
                color: theme.colors.text,
                fontWeight: "900",
                opacity: isCapitalRecoveryStore ? 0.6 : 1,
              }}
            />

            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {[7, 14, 30, 60, 90].map((d) => {
                const active = expiryAlertDays === d;

                return (
                  <Pressable
                    key={d}
                    onPress={() => setExpiryAlertDays(d)}
                    style={({ pressed }) => ({
                      borderWidth: 1,
                      borderColor: active ? theme.colors.dangerBorder : theme.colors.border,
                      backgroundColor: active ? "rgba(239,68,68,0.12)" : "rgba(255,255,255,0.05)",
                      borderRadius: 999,
                      paddingHorizontal: 12,
                      paddingVertical: 8,
                      opacity: pressed ? 0.9 : 1,
                    })}
                  >
                    <Text
                      style={{
                        color: active ? theme.colors.danger : theme.colors.text,
                        fontWeight: "900",
                        fontSize: 12,
                      }}
                    >
                      {d}d
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ) : null}

        <Pressable
          onPress={openQuickEdit}
          disabled={saving || isCapitalRecoveryStore || !canQuickEditProduct}
          style={({ pressed }) => ({
            minHeight: 64,
            borderRadius: 18,
            borderWidth: 1.2,
            borderColor: "rgba(14,165,233,0.28)",
            backgroundColor: "rgba(14,165,233,0.08)",
            paddingHorizontal: 14,
            paddingVertical: 10,
            opacity: pressed ? 0.9 : isCapitalRecoveryStore || !canQuickEditProduct ? 0.55 : 1,
          })}
        >
          <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 15 }}>
            Edit Product Details
          </Text>
          <Text style={{ color: theme.colors.muted, fontWeight: "800", fontSize: 12, marginTop: 3 }}>
            Edit product details exactly like Products page before saving stock.
          </Text>
        </Pressable>

        <Pressable
          onPress={() => setShowOptionalDetails((v) => !v)}
          disabled={saving || isCapitalRecoveryStore}
          style={({ pressed }) => ({
            minHeight: 64,
            borderRadius: 18,
            borderWidth: 1.2,
            borderColor: showOptionalDetails
              ? "rgba(52,211,153,0.55)"
              : "rgba(37,99,235,0.28)",
            backgroundColor: showOptionalDetails
              ? "rgba(52,211,153,0.13)"
              : "rgba(37,99,235,0.08)",
            paddingHorizontal: 14,
            paddingVertical: 10,
            shadowColor: "#000",
            shadowOpacity: 0.08,
            shadowRadius: 10,
            shadowOffset: { width: 0, height: 4 },
            elevation: 2,
            opacity: pressed ? 0.9 : isCapitalRecoveryStore ? 0.6 : 1,
          })}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
            }}
          >
            <View style={{ flex: 1, gap: 3 }}>
              <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 15 }}>
                {showOptionalDetails ? "Hide More Stock Details" : "More Stock Details"}
              </Text>

              <Text style={{ color: theme.colors.muted, fontWeight: "800", fontSize: 12 }}>
                {showOptionalDetails
                  ? "Tap to hide supplier, invoice/ref and stock note."
                  : "Add supplier, invoice/ref and stock note."}
              </Text>
            </View>

            <Text
              style={{
                color: showOptionalDetails ? theme.colors.emerald : theme.colors.text,
                fontWeight: "900",
                fontSize: 20,
              }}
            >
              {showOptionalDetails ? "⌃" : "⌄"}
            </Text>
          </View>
        </Pressable>

        {showOptionalDetails ? (
          <View style={{ gap: 10 }}>
            {mode === "ADD" ? (
              <>
                <Text style={{ color: theme.colors.text, fontWeight: "900" }}>
                  Supplier Name (optional)
                </Text>

                {supplierLoading ? (
                  <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>
                    Loading suppliers...
                  </Text>
                ) : suppliers.length > 0 ? (
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                    contentContainerStyle={{ gap: 8, paddingVertical: 2 }}
                  >
                    {suppliers.map((s) => {
                      const active =
                        supplierName.trim().toLowerCase() === s.name.trim().toLowerCase();

                      return (
                        <Pressable
                          key={s.id}
                          onPress={() => setSupplierName(s.name)}
                          style={({ pressed }) => ({
                            borderWidth: 1,
                            borderColor: active ? theme.colors.emeraldBorder : theme.colors.border,
                            backgroundColor: active
                              ? theme.colors.emeraldSoft
                              : "rgba(255,255,255,0.05)",
                            borderRadius: 999,
                            paddingHorizontal: 12,
                            paddingVertical: 8,
                            opacity: pressed ? 0.9 : 1,
                          })}
                        >
                          <Text
                            style={{
                              color: active ? theme.colors.emerald : theme.colors.text,
                              fontWeight: "900",
                            }}
                          >
                            {s.name}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                ) : null}

                <TextInput
                  value={supplierName}
                  onChangeText={setSupplierName}
                  placeholder="mf. MSD, Duka la dawa..."
                  placeholderTextColor="rgba(255,255,255,0.35)"
                  editable={!isCapitalRecoveryStore && !saving}
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

                <Text style={{ color: theme.colors.text, fontWeight: "900" }}>
                  Supplier Invoice / Ref (optional)
                </Text>

                <TextInput
                  value={supplierInvoiceNo}
                  onChangeText={setSupplierInvoiceNo}
                  placeholder="mf. INV-001, Receipt no..."
                  placeholderTextColor="rgba(255,255,255,0.35)"
                  editable={!isCapitalRecoveryStore && !saving}
                  autoCapitalize="characters"
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
              </>
            ) : null}

            <Text style={{ color: theme.colors.text, fontWeight: "900" }}>
              Stock Note (optional)
            </Text>

            <TextInput
              value={reason}
              onChangeText={setReason}
              placeholder="mf. Damaged, transfer, supplier correction..."
              placeholderTextColor="rgba(255,255,255,0.35)"
              multiline
              textAlignVertical="top"
              editable={!isCapitalRecoveryStore && !saving}
              style={{
                minHeight: 80,
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
        ) : null}

        <View style={{ gap: 10 }}>
          <Button
            title={
              isCapitalRecoveryStore
                ? "Adjust Disabled"
                : saving
                  ? "Saving..."
                  : "Save Stock Update"
            }
            onPress={() => {
              Keyboard.dismiss();
              void submit();
            }}
            disabled={saving || isCapitalRecoveryStore}
            variant="primary"
          />

          <Button
            title="Back"
            onPress={() => {
              Keyboard.dismiss();
              router.back();
            }}
            disabled={saving}
            variant="secondary"
          />
        </View>

        {isCapitalRecoveryStore ? (
          <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>
            Capital Recovery store haitumii stock adjustment.
          </Text>
        ) : !canAdjust ? (
          <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>
            Huna ruhusa ya kubadili stock. (Owner/Admin only)
          </Text>
        ) : null}
      </Card>
    </View>
  );

    
  return (
    <Screen scroll bottomPad={kbHeight > 0 ? kbHeight + 24 : 160}>
      {Platform.OS === "web" ? (
        content
      ) : (
        <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
          {content}
        </TouchableWithoutFeedback>
      )}
    <Modal
        visible={quickEditOpen}
        animationType="fade"
        transparent
        presentationStyle="overFullScreen"
        statusBarTranslucent
        onRequestClose={closeQuickEdit}
      >
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <View
            style={{
              flex: 1,
              backgroundColor: "rgba(15,23,42,0.34)",
              paddingHorizontal: 16,
              paddingTop: 34,
              paddingBottom: 24,
              justifyContent: "center",
            }}
          >
            <View
              style={{
                width: "100%",
                maxHeight: "86%",
                borderRadius: 28,
                backgroundColor: "#FFFFFF",
                borderWidth: 1,
                borderColor: "rgba(15,23,42,0.12)",
                overflow: "hidden",
                shadowColor: "#0F172A",
                shadowOpacity: 0.24,
                shadowRadius: 24,
                shadowOffset: { width: 0, height: 12 },
                elevation: 18,
              }}
            >
              <View
                style={{
                  padding: 16,
                  borderBottomWidth: 1,
                  borderBottomColor: "rgba(15,23,42,0.10)",
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 20 }}>
                  Edit Product
                </Text>

                <Pressable
                  onPress={closeQuickEdit}
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 999,
                    alignItems: "center",
                    justifyContent: "center",
                    borderWidth: 1,
                    borderColor: "rgba(15,23,42,0.12)",
                    backgroundColor: "#F8FAFC",
                  }}
                >
                  <Text style={{ color: theme.colors.text, fontSize: 24, fontWeight: "900" }}>×</Text>
                </Pressable>
              </View>

              <ScrollView
                style={{ flexGrow: 0 }}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{
                  padding: 16,
                  paddingBottom: 24,
                  gap: 12,
                }}
              >
                <TextInput value={quickName} onChangeText={setQuickName} placeholder="Product name" placeholderTextColor={theme.colors.faint} style={{ borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.lg, backgroundColor: "#FFFFFF", paddingHorizontal: 14, paddingVertical: 12, color: theme.colors.text, fontWeight: "900" }} />

                <View style={{ flexDirection: "row", gap: 10 }}>
                  <TextInput value={quickSku} onChangeText={setQuickSku} placeholder="SKU" placeholderTextColor={theme.colors.faint} style={{ flex: 1, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.lg, backgroundColor: "#FFFFFF", paddingHorizontal: 14, paddingVertical: 12, color: theme.colors.text, fontWeight: "900" }} />
                  <TextInput value={quickUnit} onChangeText={setQuickUnit} placeholder="Unit" placeholderTextColor={theme.colors.faint} style={{ flex: 1, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.lg, backgroundColor: "#FFFFFF", paddingHorizontal: 14, paddingVertical: 12, color: theme.colors.text, fontWeight: "900" }} />
                </View>

                <TextInput value={quickCategory} onChangeText={setQuickCategory} placeholder="Category" placeholderTextColor={theme.colors.faint} style={{ borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.lg, backgroundColor: "#FFFFFF", paddingHorizontal: 14, paddingVertical: 12, color: theme.colors.text, fontWeight: "900" }} />

                <TextInput value={quickBarcode} onChangeText={(t) => setQuickBarcode(cleanBarcode(t))} placeholder="Barcode (optional)" placeholderTextColor={theme.colors.faint} style={{ borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.lg, backgroundColor: "#FFFFFF", paddingHorizontal: 14, paddingVertical: 12, color: theme.colors.text, fontWeight: "900" }} />

                {isPrecisionRetailStore ? (
                  <Card
                    style={{
                      gap: 8,
                      borderRadius: 22,
                      borderColor: "rgba(52,211,153,0.28)",
                      backgroundColor: "rgba(52,211,153,0.08)",
                      padding: 12,
                    }}
                  >
                    <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 15 }}>
                      Unit & Pack Calculator
                    </Text>

                    <Text style={{ color: theme.colors.muted, fontWeight: "800", lineHeight: 19 }}>
                      Badili pack size, unit ya ndani, cost ya pack na selling ya pack. Mfumo utahesabu bei ya unit moja automatic.
                    </Text>

                    <View style={{ flexDirection: "row", gap: 10 }}>
                      <TextInput value={quickPrecisionPackQty} onChangeText={(t) => setQuickPrecisionPackQty(normalizeDecimalInput(t))} placeholder="Pack size e.g. 100" keyboardType="numeric" placeholderTextColor={theme.colors.faint} style={{ flex: 1.15, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.lg, backgroundColor: "#FFFFFF", paddingHorizontal: 14, paddingVertical: 12, color: theme.colors.text, fontWeight: "900" }} />

                      <TextInput value={quickPrecisionUnit} onChangeText={setQuickPrecisionUnit} placeholder="Unit e.g. capsule" placeholderTextColor={theme.colors.faint} style={{ flex: 1, borderWidth: 1, borderColor: theme.colors.emeraldBorder, borderRadius: theme.radius.lg, backgroundColor: "#ECFDF5", paddingHorizontal: 14, paddingVertical: 12, color: theme.colors.text, fontWeight: "900" }} />
                    </View>

                    <TextInput value={quickPrecisionPackCost} onChangeText={(t) => setQuickPrecisionPackCost(normalizeDecimalInput(t))} placeholder="Buying/Cost price ya box/pack" keyboardType="numeric" placeholderTextColor={theme.colors.faint} style={{ borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.lg, backgroundColor: "#FFFFFF", paddingHorizontal: 14, paddingVertical: 12, color: theme.colors.text, fontWeight: "900" }} />

                    <TextInput value={quickPrecisionPackSelling} onChangeText={(t) => setQuickPrecisionPackSelling(normalizeDecimalInput(t))} placeholder="Selling price ya box/pack" keyboardType="numeric" placeholderTextColor={theme.colors.faint} style={{ borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.lg, backgroundColor: "#FFFFFF", paddingHorizontal: 14, paddingVertical: 12, color: theme.colors.text, fontWeight: "900" }} />

                    <Button title="Calculate Per Unit Price" onPress={applyQuickPrecisionFormula} disabled={quickEditSaving} variant="secondary" />

                    <Text style={{ color: theme.colors.faint, fontWeight: "800" }}>
                      Baada ya calculate, Cost Price na Selling Price chini zitabadilishwa kama bei ya unit moja.
                    </Text>
                  </Card>
                ) : null}

                <TextInput value={quickCostPrice} onChangeText={(t) => setQuickCostPrice(normalizeDecimalInput(t))} placeholder="Cost Price" keyboardType="numeric" placeholderTextColor={theme.colors.faint} style={{ borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.lg, backgroundColor: "#FFFFFF", paddingHorizontal: 14, paddingVertical: 12, color: theme.colors.text, fontWeight: "900" }} />

                <TextInput value={quickSellingPrice} onChangeText={(t) => setQuickSellingPrice(normalizeDecimalInput(t))} placeholder="Selling Price" keyboardType="numeric" placeholderTextColor={theme.colors.faint} style={{ borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.lg, backgroundColor: "#FFFFFF", paddingHorizontal: 14, paddingVertical: 12, color: theme.colors.text, fontWeight: "900" }} />

                <View style={{ flexDirection: "row", gap: 10, marginTop: 4 }}>
                  <View style={{ flex: 1 }}>
                    <Button title="Cancel" variant="secondary" onPress={closeQuickEdit} disabled={quickEditSaving} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Button title={quickEditSaving ? "Saving..." : "Save Changes"} variant="primary" onPress={saveQuickEdit} disabled={quickEditSaving} />
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