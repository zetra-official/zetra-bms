import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { useRouter } from "expo-router";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { Paths } from "expo-file-system";
import * as FileSystem from "expo-file-system";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useOrg } from "@/src/context/OrgContext";
import { supabase } from "@/src/supabase/supabaseClient";
import { Screen } from "@/src/ui/Screen";
import { Card } from "@/src/ui/Card";
import { Button } from "@/src/ui/Button";
import { UI } from "@/src/ui/theme";
import { formatMoney, useOrgMoneyPrefs } from "@/src/ui/money";
type DraftInboundItem = {
  product_name: string;
  sku: string;
  unit: string;
  category: string;
  barcode: string;
  quantity: string;
  unit_cost: string;
  selling_price: string;
};

const INBOUND_PRICE_DECIMALS = 6;

function normalizeDecimalInput(raw: string) {
  const cleaned = String(raw ?? "")
    .replace(",", ".")
    .replace(/[^0-9.]/g, "")
    .replace(/(\..*)\./g, "$1");

  const [whole, decimal] = cleaned.split(".");
  return decimal !== undefined ? `${whole}.${decimal.slice(0, INBOUND_PRICE_DECIMALS)}` : whole;
}

function fmtFormulaNumber(n: number) {
  if (!Number.isFinite(n)) return "";
  const fixed = n.toFixed(INBOUND_PRICE_DECIMALS);
  return fixed.includes(".") ? fixed.replace(/\.?0+$/, "") : fixed;
}

function isPrecisionRetailType(storeType: any) {
  const t = String(storeType ?? "").trim().toUpperCase();
  return t === "PRECISION_RETAIL" || t === "PRECISION" || t === "PHARMACY" || t === "PHARMA";
}

function moneyNum(v: string) {
  const n = Number(String(v ?? "").replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : 0;
}
type InboundOrderItem = {
  id: string;
  product_name: string | null;
  sku: string | null;
  barcode: string | null;
  qty_ordered: number;
  qty_received: number;
  damaged_qty: number;
  missing_qty: number;
  unit_cost: number;
  proposed_sell_price: number;
  total_cost: number;
  note: string | null;
};

type ProductSuggestion = {
  id: string;
  name: string | null;
  sku: string | null;
  unit: string | null;
  category: string | null;
  barcode: string | null;
  cost_price: number | null;
  selling_price: number | null;
};

type SupplierSuggestion = {
  supplier_name: string;
  supplier_phone?: string | null;
  supplier_email?: string | null;
  supplier_location?: string | null;
  supplier_address?: string | null;
  source_country: string | null;
  source_city: string | null;
  destination_name: string | null;
};

type InboundOrder = {
  id: string;
  order_code: string | null;
  supplier_name: string | null;
  source_country: string | null;
  source_city: string | null;
  destination_name: string | null;
  status: string;
  total_items: number;
  total_goods_value: number;
  total_paid_amount: number;
  total_balance_amount: number;
  expected_arrival_date: string | null;
  created_at: string;
};

export default function InboundStockScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  const isWeb = Platform.OS === "web";
  const isDesktopWeb = isWeb && width >= 900;
  const isMobileWeb = isWeb && width < 900;

  const pageMaxWidth = isDesktopWeb ? 1180 : undefined;
  const pagePaddingX = isDesktopWeb ? 28 : 16;
  const desktopGrid = isDesktopWeb ? "row" : "column";
  const orgCtx = useOrg() as any;

  const orgId = String(orgCtx.activeOrgId ?? orgCtx.orgId ?? "").trim();
  const storeId = String(
    orgCtx.activeStoreId ??
      orgCtx.activeStore?.id ??
      orgCtx.selectedStoreId ??
      orgCtx.storeId ??
      ""
  ).trim();

  const money = useOrgMoneyPrefs(orgId);

  const fmt = useCallback(
    (n: number) =>
      formatMoney(Number(n || 0), {
        currency: money.currency || "TZS",
        locale: money.locale || "en-TZ",
      }).replace(/\s+/g, " "),
    [money.currency, money.locale]
  );

  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [rows, setRows] = useState<InboundOrder[]>([]);
  const [openAdd, setOpenAdd] = useState(false);

  const [supplierName, setSupplierName] = useState("");
  const [sourceCountry, setSourceCountry] = useState("");
  const [sourceCity, setSourceCity] = useState("");
  const [destinationName, setDestinationName] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [trackingNumber, setTrackingNumber] = useState("");
  const [expectedDate, setExpectedDate] = useState("");
  const [note, setNote] = useState("");

  const [paidAmount, setPaidAmount] = useState("");
  const [itemName, setItemName] = useState("");
  const [itemSku, setItemSku] = useState("");
  const [itemUnit, setItemUnit] = useState("");
  const [itemCategory, setItemCategory] = useState("");
  const [itemBarcode, setItemBarcode] = useState("");
  const [itemQty, setItemQty] = useState("");
  const [itemCost, setItemCost] = useState("");
  const [itemSelling, setItemSelling] = useState("");

  const [precisionPackQty, setPrecisionPackQty] = useState("");
  const [precisionPackCost, setPrecisionPackCost] = useState("");
  const [precisionPackSelling, setPrecisionPackSelling] = useState("");
  const [precisionUnit, setPrecisionUnit] = useState("");
  const [precisionCalcOpen, setPrecisionCalcOpen] = useState(false);

  const [draftItems, setDraftItems] = useState<DraftInboundItem[]>([]);
const [showItemForm, setShowItemForm] = useState(false);
const [editingDraftIndex, setEditingDraftIndex] = useState<number | null>(null);

const [selectedOrder, setSelectedOrder] = useState<InboundOrder | null>(null);
const [selectedItems, setSelectedItems] = useState<InboundOrderItem[]>([]);
const [detailLoading, setDetailLoading] = useState(false);
const [deletingOrder, setDeletingOrder] = useState(false);
const [receivingOrder, setReceivingOrder] = useState(false);
const [receiveQtyMap, setReceiveQtyMap] = useState<Record<string, string>>({});
const [editingItem, setEditingItem] = useState<InboundOrderItem | null>(null);

const [productSuggestions, setProductSuggestions] = useState<ProductSuggestion[]>([]);
const [supplierSuggestions, setSupplierSuggestions] = useState<SupplierSuggestion[]>([]);
const [showProductSuggest, setShowProductSuggest] = useState(false);
const [showSupplierSuggest, setShowSupplierSuggest] = useState(false);
const [showUnitSuggest, setShowUnitSuggest] = useState(false);
const [showCategorySuggest, setShowCategorySuggest] = useState(false);
const [showEditUnitSuggest, setShowEditUnitSuggest] = useState(false);
const [showEditCategorySuggest, setShowEditCategorySuggest] = useState(false);

const [editItemName, setEditItemName] = useState("");
const [editItemSku, setEditItemSku] = useState("");
const [editItemBarcode, setEditItemBarcode] = useState("");
const [editItemQty, setEditItemQty] = useState("");
const [editItemCost, setEditItemCost] = useState("");
const [editItemSelling, setEditItemSelling] = useState("");
const [editItemNote, setEditItemNote] = useState("");

const [searchText, setSearchText] = useState("");
const [statusFilter, setStatusFilter] = useState<"ALL" | "IN_TRANSIT" | "PARTIAL_RECEIVED" | "RECEIVED">("ALL");
const [fromDateFilter, setFromDateFilter] = useState("");
const [toDateFilter, setToDateFilter] = useState("");
const [deleteReason, setDeleteReason] = useState("");
const [businessName, setBusinessName] = useState("Active Business");
const [storeName, setStoreName] = useState("Active Store");
const [storeType, setStoreType] = useState("STANDARD");
const [currentUserLabel, setCurrentUserLabel] = useState("Current User");

const [fullEditOpen, setFullEditOpen] = useState(false);
const [savingFullEdit, setSavingFullEdit] = useState(false);

const [editSupplierName, setEditSupplierName] = useState("");
const [editSourceCountry, setEditSourceCountry] = useState("");
const [editSourceCity, setEditSourceCity] = useState("");
const [editDestinationName, setEditDestinationName] = useState("");
const [editInvoiceNumber, setEditInvoiceNumber] = useState("");
const [editTrackingNumber, setEditTrackingNumber] = useState("");
const [editExpectedDate, setEditExpectedDate] = useState("");
const [editOrderNote, setEditOrderNote] = useState("");

const [editNewItems, setEditNewItems] = useState<DraftInboundItem[]>([]);
const [editOrderItemName, setEditOrderItemName] = useState("");
const [editOrderItemSku, setEditOrderItemSku] = useState("");
const [editOrderItemUnit, setEditOrderItemUnit] = useState("");
const [editOrderItemCategory, setEditOrderItemCategory] = useState("");
const [editOrderItemBarcode, setEditOrderItemBarcode] = useState("");
const [editOrderItemQty, setEditOrderItemQty] = useState("");
const [editOrderItemCost, setEditOrderItemCost] = useState("");
const [editOrderItemSelling, setEditOrderItemSelling] = useState("");
const [showEditProductSuggest, setShowEditProductSuggest] = useState(false);

const isPrecisionInboundStore = isPrecisionRetailType(storeType);
  const loadSuggestions = useCallback(async (queryText?: string) => {
    if (!orgId) return;

    const cleanQuery = String(queryText ?? "").trim();

    try {
      const { data, error } = await supabase.rpc("get_inbound_stock_suggestions_v1", {
        p_org_id: orgId,
        p_store_id: storeId || null,
        p_query: cleanQuery || null,
      });

      if (error) throw error;

      const rows = Array.isArray(data) ? data : [];

      const products: ProductSuggestion[] = [];
      const suppliers: SupplierSuggestion[] = [];

      const seenProducts = new Set<string>();
      const seenSuppliers = new Set<string>();

      for (const r of rows as any[]) {
        const productId = String(r?.product_id ?? r?.id ?? "").trim();
        const productName = String(r?.product_name ?? r?.name ?? "").trim();

        if (productId && productName && !seenProducts.has(productId)) {
          seenProducts.add(productId);
          products.push({
            id: productId,
            name: productName,
            sku: r?.sku ?? null,
            unit: r?.unit ?? null,
            category: r?.category ?? null,
            barcode: r?.barcode ?? null,
            cost_price: r?.cost_price == null ? null : Number(r.cost_price),
            selling_price: r?.selling_price == null ? null : Number(r.selling_price),
          });
        }

        const supplierName = String(r?.supplier_name ?? "").trim();
        const supplierKey = supplierName.toLowerCase();

        if (supplierName && !seenSuppliers.has(supplierKey)) {
          seenSuppliers.add(supplierKey);
    suppliers.push({
  supplier_name: supplierName,
  supplier_phone: r?.supplier_phone ?? null,
  supplier_email: r?.supplier_email ?? null,
  supplier_location: r?.supplier_location ?? null,
  supplier_address: r?.supplier_address ?? null,
  source_country: r?.source_country ?? null,
  source_city: r?.source_city ?? null,
  destination_name: r?.destination_name ?? null,
});
        }
      }

      setProductSuggestions(products);
setSupplierSuggestions(suppliers);
    } catch (e: any) {
      Alert.alert("Suggestions Error", e?.message ?? "Failed to load suggestions");
      setProductSuggestions([]);
      setSupplierSuggestions([]);
    }
  }, [orgId, storeId]);

  const load = useCallback(async () => {
    if (!orgId) return;

    setLoading(true);

    try {
      const { data, error } = await supabase.rpc("get_inbound_stock_orders_v1", {
        p_org_id: orgId,
        p_store_id: storeId || null,
      });

      if (error) throw error;

      setRows(
  (Array.isArray(data) ? data : []).map((r: any) => ({
    ...r,
    total_goods_value: Number(r.total_goods_value ?? r.total_value ?? 0),
    total_paid_amount: Number(r.total_paid_amount ?? r.total_paid ?? 0),
    total_balance_amount: Number(r.total_balance_amount ?? r.balance_amount ?? 0),
  })) as InboundOrder[]
);
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "Failed to load incoming stock");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [orgId, storeId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (openAdd) {
      void loadSuggestions();
    }
  }, [openAdd, loadSuggestions]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  }, [load]);
useEffect(() => {
  const run = async () => {
    try {
      const { data: userData } = await supabase.auth.getUser();
      const userEmail = userData?.user?.email || "Current User";
      setCurrentUserLabel(userEmail);

      if (orgId) {
        const { data: orgRow } = await supabase
          .from("organizations")
          .select("name,business_name")
          .eq("id", orgId)
          .maybeSingle();

        setBusinessName(
          String((orgRow as any)?.business_name || (orgRow as any)?.name || "Active Business")
        );
      }

      if (storeId) {
        const { data: storeRow, error: storeError } = await supabase
          .from("stores")
          .select("*")
          .eq("id", storeId)
          .maybeSingle();

        if (storeError) throw storeError;

        setStoreName(
          String(
            (storeRow as any)?.name ||
              (storeRow as any)?.store_name ||
              orgCtx.activeStore?.name ||
              "Active Store"
          )
        );

        setStoreType(
          String(
            (storeRow as any)?.store_type ||
              (storeRow as any)?.type ||
              (storeRow as any)?.category ||
              (storeRow as any)?.store_kind ||
              orgCtx.activeStore?.store_type ||
              orgCtx.activeStore?.type ||
              "STANDARD"
          ).toUpperCase()
        );
      } else {
        setStoreName("No Active Store");
        setStoreType("UNKNOWN");
      }
    } catch {
      // Do not block the screen if profile metadata is not available.
    }
  };

  void run();
}, [orgId, storeId]);

const draftItemsTotal = useMemo(() => {
  return draftItems.reduce((acc, item) => {
    return acc + moneyNum(item.quantity) * moneyNum(item.unit_cost);
  }, 0);
}, [draftItems]);

const draftBalance = useMemo(() => {
  return Math.max(0, draftItemsTotal - moneyNum(paidAmount));
}, [draftItemsTotal, paidAmount]);
  const filteredRows = useMemo(() => {
  const q = searchText.trim().toLowerCase();

  return rows.filter((x) => {
    const status = String(x.status ?? "").toUpperCase();
    const haystack = [
      x.supplier_name,
      x.order_code,
      x.source_city,
      x.source_country,
      x.destination_name,
      x.expected_arrival_date,
      x.status,
    ]
      .join(" ")
      .toLowerCase();

    const matchSearch = !q || haystack.includes(q);
    const matchStatus = statusFilter === "ALL" || status === statusFilter;

    const d = String(x.expected_arrival_date ?? "");
    const matchFrom = !fromDateFilter.trim() || d >= fromDateFilter.trim();
    const matchTo = !toDateFilter.trim() || d <= toDateFilter.trim();

    return matchSearch && matchStatus && matchFrom && matchTo;
  });
}, [rows, searchText, statusFilter, fromDateFilter, toDateFilter]);

  const summary = useMemo(() => {
    return rows.reduce(
      (acc, r) => {
        acc.orders += 1;
        acc.goods += Number(r.total_goods_value || 0);
        acc.paid += Number(r.total_paid_amount || 0);
        acc.balance += Number(r.total_balance_amount || 0);
        return acc;
      },
      { orders: 0, goods: 0, paid: 0, balance: 0 }
    );
  }, [rows]);

  const resetForm = useCallback(() => {
    setSupplierName("");
    setSourceCountry("");
    setSourceCity("");
    setDestinationName("");
    setInvoiceNumber("");
    setTrackingNumber("");
    setExpectedDate("");
    setNote("");
    setPaidAmount("");

    setItemName("");
    setItemSku("");
    setItemUnit(""); 
        setItemCategory("");
    setItemBarcode("");
    setItemQty("");
    setItemCost("");
    setItemSelling("");
    setPrecisionPackQty("");
    setPrecisionPackCost("");
    setPrecisionPackSelling("");
    setPrecisionUnit("");
    setPrecisionCalcOpen(false);
    setDraftItems([]);
  setShowItemForm(false);
  setEditingDraftIndex(null);
  setShowProductSuggest(false);
setShowUnitSuggest(false);
setShowCategorySuggest(false);
  setShowSupplierSuggest(false);
  setShowUnitSuggest(false);
  setShowCategorySuggest(false);
}, []);
 const removeDraftItem = useCallback((index: number) => {
  setDraftItems((prev) => prev.filter((_, i) => i !== index));

  setEditingDraftIndex((current) => {
    if (current === null) return null;
    if (current === index) return null;
    if (current > index) return current - 1;
    return current;
  });
}, []);

const openEditDraftItem = useCallback(
  (index: number) => {
    const item = draftItems[index];
    if (!item) return;

    setEditingDraftIndex(index);
    setItemName(item.product_name);
    setItemSku(item.sku);
    setItemUnit(item.unit);
    setItemCategory(item.category);
    setItemBarcode(item.barcode);
    setItemQty(item.quantity);
    setItemCost(item.unit_cost);
    setItemSelling(item.selling_price);
    setShowItemForm(true);
    setShowProductSuggest(false);
  },
  [draftItems]
);

const cancelDraftEdit = useCallback(() => {
  setEditingDraftIndex(null);
  setItemName("");
  setItemSku("");
  setItemUnit("");
  setItemCategory("");
  setItemBarcode("");
  setItemQty("");
  setItemCost("");
  setItemSelling("");
  setPrecisionPackQty("");
  setPrecisionPackCost("");
  setPrecisionPackSelling("");
  setPrecisionUnit("");
  setShowProductSuggest(false);
  setShowUnitSuggest(false);
  setShowCategorySuggest(false);
}, []); 
const filteredSupplierSuggestions = useMemo(() => {
  const q = supplierName.trim().toLowerCase();
  if (!q) return [];

  return supplierSuggestions
    .filter((x) => String(x.supplier_name ?? "").trim().toLowerCase().startsWith(q))
    .slice(0, 30);
}, [supplierName, supplierSuggestions]);

const filteredProductSuggestions = useMemo(() => {
  const q = itemName.trim().toLowerCase();
  if (!q) return [];

  return productSuggestions
    .filter((x) => {
      const name = String(x.name ?? "").trim().toLowerCase();
      const sku = String(x.sku ?? "").trim().toLowerCase();
      const barcode = String(x.barcode ?? "").trim().toLowerCase();

      return name.includes(q) || sku.includes(q) || barcode.includes(q);
    })
    .slice(0, 6);
}, [itemName, productSuggestions]);
const unitSuggestions = useMemo(() => {
  const seen = new Set<string>();
  return productSuggestions
    .map((x) => String(x.unit ?? "").trim())
    .filter((x) => {
      const key = x.toLowerCase();
      if (!x || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 30);
}, [productSuggestions]);

const categorySuggestions = useMemo(() => {
  const seen = new Set<string>();
  return productSuggestions
    .map((x) => String(x.category ?? "").trim())
    .filter((x) => {
      const key = x.toLowerCase();
      if (!x || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 30);
}, [productSuggestions]);

const filteredUnitSuggestions = useMemo(() => {
  const q = itemUnit.trim().toLowerCase();
  if (!q) return [];

  return unitSuggestions
    .filter((x) => x.toLowerCase().includes(q))
    .slice(0, 10);
}, [itemUnit, unitSuggestions]);

const filteredCategorySuggestions = useMemo(() => {
  const q = itemCategory.trim().toLowerCase();
  if (!q) return [];

  return categorySuggestions
    .filter((x) => x.toLowerCase().includes(q))
    .slice(0, 10);
}, [itemCategory, categorySuggestions]);

const filteredEditUnitSuggestions = useMemo(() => {
  const q = editOrderItemUnit.trim().toLowerCase();
  if (!q) return [];

  return unitSuggestions
    .filter((x) => x.toLowerCase().includes(q))
    .slice(0, 10);
}, [editOrderItemUnit, unitSuggestions]);

const filteredEditCategorySuggestions = useMemo(() => {
  const q = editOrderItemCategory.trim().toLowerCase();
  if (!q) return [];

  return categorySuggestions
    .filter((x) => x.toLowerCase().includes(q))
    .slice(0, 10);
}, [editOrderItemCategory, categorySuggestions]);
const filteredEditProductSuggestions = useMemo(() => {
  const q = editOrderItemName.trim().toLowerCase();
  if (!q) return [];

  return productSuggestions
    .filter((x) => {
      const name = String(x.name ?? "").trim().toLowerCase();
      const sku = String(x.sku ?? "").trim().toLowerCase();
      const barcode = String(x.barcode ?? "").trim().toLowerCase();

      return name.includes(q) || sku.includes(q) || barcode.includes(q);
    })
    .slice(0, 6);
}, [editOrderItemName, productSuggestions]);
const selectSupplierSuggestion = useCallback((s: SupplierSuggestion) => {
  setSupplierName(String(s.supplier_name ?? ""));

  setSourceCountry(String(s.source_country ?? ""));
  setSourceCity(String(s.source_city ?? ""));
  setDestinationName(
    String(s.destination_name ?? s.supplier_location ?? s.supplier_address ?? "")
  );

  setShowSupplierSuggest(false);
}, []);

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

  setItemQty(fmtFormulaNumber(packQty));
  setItemCost(fmtFormulaNumber(unitCost));
  setItemSelling(fmtFormulaNumber(unitSelling));

  if (precisionUnit.trim()) setItemUnit(precisionUnit.trim());
  if (!itemCategory.trim()) setItemCategory("General");
}, [itemCategory, precisionPackCost, precisionPackQty, precisionPackSelling, precisionUnit]);

const selectProductSuggestion = useCallback((p: ProductSuggestion) => {
  setItemName(String(p.name ?? ""));
  setItemSku(String(p.sku ?? ""));
  setItemUnit(String(p.unit ?? ""));
  setItemCategory(String(p.category ?? ""));
  setItemBarcode(String(p.barcode ?? ""));

  const cost = Number(p.cost_price ?? 0);
  const sell = Number(p.selling_price ?? 0);

  setItemCost(cost > 0 ? String(cost) : "");
  setItemSelling(sell > 0 ? String(sell) : "");

  setShowProductSuggest(false);
}, []);

const addDraftItem = useCallback(() => {
    if (!itemName.trim()) {
      Alert.alert("Required", "Weka product/item name.");
      return;
    }
if (moneyNum(itemQty) <= 0) {
  Alert.alert("Required", "Weka quantity sahihi.");
  return;
}

if (moneyNum(itemCost) <= 0) {
  Alert.alert("Required", "Weka cost/unit sahihi ili thamani ya mzigo ihesabiwe vizuri.");
  return;
}

    const nextItem: DraftInboundItem = {
      product_name: itemName.trim(),
      sku: itemSku.trim(),
      unit: itemUnit.trim(),
      category: itemCategory.trim(),
      barcode: itemBarcode.trim(),
      quantity: itemQty.trim(),
      unit_cost: itemCost.trim(),
      selling_price: itemSelling.trim(),
    };

    setDraftItems((prev) => {
      if (editingDraftIndex === null) {
        return [...prev, nextItem];
      }

      return prev.map((x, i) => (i === editingDraftIndex ? nextItem : x));
    });

    setEditingDraftIndex(null);

    setItemName("");
    setItemSku("");
    setItemUnit("");
    setItemCategory("");
    setItemBarcode("");
    setItemQty("");
    setItemCost("");
    setItemSelling("");
    setPrecisionPackQty("");
    setPrecisionPackCost("");
    setPrecisionPackSelling("");
    setPrecisionUnit("");
setShowProductSuggest(false);
  }, [itemName, itemSku, itemUnit, itemCategory, itemBarcode, itemQty, itemCost, itemSelling, editingDraftIndex]);
 const createOrder = useCallback(async () => {
    try {
      if (!orgId) {
        Alert.alert("Missing", "No active organization.");
        return;
      }

      if (!storeId) {
        Alert.alert("Missing Store", "Chagua active store kwanza kabla ya kuweka incoming order.");
        return;
      }

      if (!supplierName.trim()) {
        Alert.alert("Required", "Weka supplier name.");
        return;
      }

      if (draftItems.length === 0) {
        Alert.alert("Required", "Ongeza angalau product/item moja kwenye order.");
        return;
      }
if (moneyNum(paidAmount) > draftItemsTotal) {
  Alert.alert("Invalid Payment", "Paid amount haiwezi kuzidi total value ya items.");
  return;
}
      const { data, error } = await supabase.rpc("create_inbound_stock_order_v1", {
        p_org_id: orgId,
        p_store_id: storeId || null,
        p_supplier_name: supplierName.trim(),
        p_source_country: sourceCountry.trim() || null,
        p_source_city: sourceCity.trim() || null,
        p_destination_name: destinationName.trim() || null,
        p_invoice_number: invoiceNumber.trim() || null,
        p_tracking_number: trackingNumber.trim() || null,
        p_expected_arrival_date: expectedDate.trim() || null,
        p_note: note.trim() || null,
      });

      if (error) throw error;

      const orderId =
        typeof data === "string"
          ? data
          : Array.isArray(data)
          ? String(data[0] ?? "")
          : String((data as any)?.id ?? (data as any)?.create_inbound_stock_order_v1 ?? "");

      if (!orderId) {
        throw new Error("Order imeundwa lakini order id haijarudi kutoka RPC.");
      }

      for (const item of draftItems) {
        const itemRes = await supabase.rpc("add_inbound_stock_item_v1", {
          p_order_id: orderId,
          p_product_name: item.product_name,
          p_sku: item.sku || null,
          p_unit: item.unit || null,
          p_category: item.category || null,
          p_barcode: item.barcode || null,
          p_quantity: moneyNum(item.quantity),
          p_unit_cost: moneyNum(item.unit_cost),
          p_selling_price: moneyNum(item.selling_price),
          p_note: null,
        });

        if (itemRes.error) throw itemRes.error;
      }

      if (moneyNum(paidAmount) > 0) {
       const payRes = await supabase.rpc("record_inbound_stock_payment_v1", {
  p_order_id: orderId,
  p_amount: moneyNum(paidAmount),
  p_payment_method: "GOODS",
  p_reference: invoiceNumber.trim() || trackingNumber.trim() || null,
  p_note: note.trim() || "Initial goods payment",
});

        if (payRes.error) throw payRes.error;
      }

      setOpenAdd(false);
      resetForm();
      await load();

      Alert.alert("Success", "Incoming stock order na items zimehifadhiwa.");
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "Failed to create order");
    }
  }, [
    orgId,
    storeId,
    supplierName,
    sourceCountry,
    sourceCity,
    destinationName,
    invoiceNumber,
    trackingNumber,
    expectedDate,
    note,
   paidAmount,
draftItems,
draftItemsTotal,
resetForm,
load,
  ]);
const openOrderDetail = useCallback(async (order: InboundOrder) => {
  setSelectedOrder(order);
  setSelectedItems([]);
  setDetailLoading(true);

  try {
    const { data, error } = await supabase.rpc("get_inbound_stock_order_items_v1", {
      p_order_id: order.id,
    });

    if (error) throw error;

    const items = (Array.isArray(data) ? data : []) as InboundOrderItem[];
setSelectedItems(items);

const nextMap: Record<string, string> = {};
items.forEach((x) => {
  const remaining = Math.max(0, Number(x.qty_ordered || 0) - Number(x.qty_received || 0));
  nextMap[x.id] = remaining > 0 ? String(remaining) : "";
});
setReceiveQtyMap(nextMap);
  } catch (e: any) {
    Alert.alert("Error", e?.message ?? "Failed to load order items");
  } finally {
    setDetailLoading(false);
  }
}, []);
const receiveSelectedOrder = useCallback(() => {
  if (!selectedOrder) return;

  Alert.alert(
    "Receive Incoming Stock?",
    `Unataka kuingiza mzigo wa ${selectedOrder.supplier_name || "supplier"} kwenye inventory sasa?`,
    [
      { text: "Cancel", style: "cancel" },
      {
        text: "Receive",
        onPress: async () => {
          setReceivingOrder(true);

          try {
            const { error } = await supabase.rpc("receive_inbound_stock_v1", {
              p_order_id: selectedOrder.id,
            });

            if (error) throw error;

            await load();

            setSelectedOrder((prev) =>
              prev
                ? {
                    ...prev,
                    status: "RECEIVED",
                  }
                : prev
            );

            Alert.alert(
              "Success",
              "Incoming stock imeingia inventory successfully."
            );
          } catch (e: any) {
            Alert.alert(
              "Error",
              e?.message ?? "Failed to receive incoming stock"
            );
          } finally {
            setReceivingOrder(false);
          }
        },
      },
    ]
  );
}, [selectedOrder, load]);
const openEditItem = useCallback((item: InboundOrderItem) => {
  setEditingItem(item);
  setEditItemName(String(item.product_name ?? ""));
  setEditItemSku(String(item.sku ?? ""));
  setEditItemBarcode(String(item.barcode ?? ""));
  setEditItemQty(String(item.qty_ordered ?? ""));
  setEditItemCost(String(item.unit_cost ?? ""));
  setEditItemSelling(String(item.proposed_sell_price ?? ""));
  setEditItemNote(String(item.note ?? ""));
}, []);

const saveEditItem = useCallback(async () => {
  if (!editingItem) return;

  try {
    if (!editItemName.trim()) {
      Alert.alert("Required", "Weka jina la bidhaa.");
      return;
    }

    if (moneyNum(editItemQty) <= 0) {
      Alert.alert("Required", "Weka quantity sahihi.");
      return;
    }

    if (moneyNum(editItemCost) <= 0) {
      Alert.alert("Required", "Weka cost/unit sahihi.");
      return;
    }

    const { error } = await supabase.rpc("update_inbound_stock_item_v1", {
      p_item_id: editingItem.id,
      p_product_name: editItemName.trim(),
      p_sku: editItemSku.trim() || null,
      p_unit: null,
      p_category: null,
      p_barcode: editItemBarcode.trim() || null,
      p_qty_ordered: moneyNum(editItemQty),
      p_unit_cost: moneyNum(editItemCost),
      p_selling_price: moneyNum(editItemSelling),
      p_note: editItemNote.trim() || null,
    });

    if (error) throw error;

    setEditingItem(null);

    if (selectedOrder) {
      await openOrderDetail(selectedOrder);
    }

    await load();

    Alert.alert("Success", "Item imebadilishwa successfully.");
  } catch (e: any) {
    Alert.alert("Edit Error", e?.message ?? "Failed to update item.");
  }
}, [
  editingItem,
  editItemName,
  editItemSku,
  editItemBarcode,
  editItemQty,
  editItemCost,
  editItemSelling,
  editItemNote,
  selectedOrder,
  openOrderDetail,
  load,
]);

const receivePartialOrder = useCallback(() => {
  if (!selectedOrder) return;

  const payload = selectedItems
    .map((x) => {
      const qty = moneyNum(receiveQtyMap[x.id] || "");
      const remaining = Math.max(0, Number(x.qty_ordered || 0) - Number(x.qty_received || 0));
      return {
        item_id: x.id,
        qty: Math.min(qty, remaining),
      };
    })
    .filter((x) => x.qty > 0);

  if (payload.length === 0) {
    Alert.alert("Required", "Weka qty ya kupokea kwa angalau item moja.");
    return;
  }

  Alert.alert("Receive Partial Stock?", "Unataka kuingiza qty ulizoweka kwenye inventory sasa?", [
    { text: "Cancel", style: "cancel" },
    {
      text: "Receive",
      onPress: async () => {
        setReceivingOrder(true);
        try {
          const { error } = await supabase.rpc("receive_inbound_stock_partial_v1", {
            p_order_id: selectedOrder.id,
            p_receipts: payload,
          });

          if (error) throw error;

          await load();
          await openOrderDetail(selectedOrder);

          Alert.alert("Success", "Partial stock imeingia inventory successfully.");
        } catch (e: any) {
          Alert.alert("Error", e?.message ?? "Failed to receive partial stock.");
        } finally {
          setReceivingOrder(false);
        }
      },
    },
  ]);
}, [selectedOrder, selectedItems, receiveQtyMap, load, openOrderDetail]);
const safeText = useCallback((v: any) => {
  return String(v ?? "—")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}, []);

const cleanFilePart = useCallback((v: any) => {
  return String(v ?? "ZETRA")
    .trim()
    .replace(/[^\w\s.-]/g, "")
    .replace(/\s+/g, "-")
    .slice(0, 80);
}, []);

const friendlyDate = useCallback((v: any) => {
  if (!v) return "—";
  const d = new Date(String(v));
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleString("en-TZ", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}, []);

const friendlyDateOnly = useCallback((v: any) => {
  if (!v) return "—";
  const d = new Date(String(v));
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleDateString("en-TZ", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
}, []);

const makePdfFile = useCallback(
  async (uri: string, fileName: string) => {
    const baseDir = `${Paths.cache}/`;
    if (!baseDir) return uri;

    const finalUri = `${baseDir}${fileName.endsWith(".pdf") ? fileName : `${fileName}.pdf`}`;

    try {
      await FileSystem.deleteAsync(finalUri, { idempotent: true });
      await FileSystem.copyAsync({ from: uri, to: finalUri });
      return finalUri;
    } catch {
      return uri;
    }
  },
  []
);

const reportDate = useMemo(() => friendlyDate(new Date().toISOString()), [friendlyDate]);

const downloadHtmlPdfOnWeb = useCallback((html: string, fileName: string) => {
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
      } catch {
        // Safe cleanup only.
      }
    }, 1200);
  }, 500);

  return true;
}, []);

const resolveUserLabels = useCallback(
  async (ids: Array<string | null | undefined>) => {
    const cleanIds = Array.from(
      new Set(ids.map((x) => String(x ?? "").trim()).filter(Boolean))
    );

    const map: Record<string, string> = {};

    cleanIds.forEach((id) => {
      map[id] = id === String((supabase as any)?.auth?.user?.id ?? "") ? currentUserLabel : `User ${id.slice(0, 8)}`;
    });

    if (cleanIds.length === 0) return map;

    try {
      const { data } = await supabase
        .from("profiles")
        .select("id,full_name,name,email")
        .in("id", cleanIds);

      (Array.isArray(data) ? data : []).forEach((p: any) => {
        const id = String(p?.id ?? "");
        if (!id) return;
        map[id] = String(p?.full_name || p?.name || p?.email || map[id] || `User ${id.slice(0, 8)}`);
      });
    } catch {
      // Profiles table may not exist. Keep safe fallback.
    }

    return map;
  },
  [currentUserLabel]
);

const pdfShell = useCallback(
  (title: string, body: string) => `
<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${safeText(title)}</title>
  <style>
    @page {
      size: A4;
      margin: 12mm 10mm;
    }

    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    html,
    body {
      margin: 0 !important;
      padding: 0 !important;
      font-family: Arial, Helvetica, sans-serif;
      color: #111827;
      background: #ffffff;
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
      font-size: 17px;
      font-weight: 900;
      letter-spacing: 0.25px;
      text-transform: uppercase;
    }

    .brand-sub {
      margin-top: 3px;
      font-size: 10px;
      font-weight: 800;
      color: #475569;
    }

    .meta {
      text-align: right;
      font-size: 9.5px;
      color: #334155;
      line-height: 1.45;
      width: 42%;
    }

    .report-title {
      display: none;
    }

    .section-title {
      font-size: 12px;
      font-weight: 900;
      text-transform: uppercase;
      margin: 13px 0 6px;
      border-bottom: 1px solid #cbd5e1;
      padding-bottom: 4px;
    }

    .grid {
      display: table;
      width: 100%;
      table-layout: fixed;
      margin: 12px 0 4px;
      border-spacing: 6px;
    }

    .box {
      display: table-cell;
      border: 1px solid #cbd5e1;
      padding: 8px;
      background: #f8fafc;
      vertical-align: top;
    }

    .label {
      color: #64748b;
      font-size: 9px;
      font-weight: 800;
      text-transform: uppercase;
    }

    .value {
      font-size: 13px;
      font-weight: 900;
      margin-top: 3px;
      color: #111827;
    }

    .info-table, .data-table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 6px;
      table-layout: fixed;
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

    .data-table td {
      font-size: 9px;
    }

    .right {
      text-align: right;
    }

    .muted {
      color: #64748b;
      font-weight: 700;
    }

    .summary-bottom {
      page-break-inside: avoid;
      break-inside: avoid;
      margin-top: 14px;
    }

    .no-print,
    button,
    input,
    textarea,
    select {
      display: none !important;
    }
  </style>
</head>
<body>
  <div class="page">
    <div class="header">
      <div class="brand">
        <div class="brand-title">${safeText(storeName || businessName || "ZETRA BMS")}</div>
        <div class="brand-sub">Incoming Stock / Goods In Transit Report</div>
      </div>
      <div class="meta">
        <b>Business:</b> ${safeText(businessName)}<br/>
        <b>Store:</b> ${safeText(storeName)}<br/>
        <b>Generated:</b> ${safeText(reportDate)}
      </div>
    </div>

    ${body}
  </div>
</body>
</html>
`,
  [businessName, storeName, reportDate, safeText]
);

const exportAllInboundPdf = useCallback(async () => {
  try {
    const sourceRows = filteredRows.length > 0 ? filteredRows : rows;

    const rowsHtml = sourceRows
      .map(
        (x, i) => `
        <tr>
          <td>${i + 1}</td>
          <td>${safeText(x.supplier_name || "Supplier")}</td>
          <td>${safeText(x.order_code || "No code")}</td>
          <td>${safeText(x.status)}</td>
          <td>${safeText(`${x.source_city || "—"}, ${x.source_country || "—"}`)}</td>
          <td>${safeText(x.destination_name || "—")}</td>
          <td>${safeText(friendlyDateOnly(x.expected_arrival_date))}</td>
          <td>${safeText(fmt(Number(x.total_goods_value || 0)))}</td>
          <td>${safeText(fmt(Number(x.total_paid_amount || 0)))}</td>
          <td>${safeText(fmt(Number(x.total_balance_amount || 0)))}</td>
        </tr>
      `
      )
      .join("");

    const body = `
      <table class="info-table">
        <tr>
          <td><b>Filter</b><br/>${safeText(searchText || "All records")}</td>
          <td><b>Status</b><br/>${safeText(statusFilter)}</td>
          <td><b>Date Range</b><br/>${safeText(fromDateFilter || "Any")} to ${safeText(toDateFilter || "Any")}</td>
        </tr>
      </table>

      <div class="grid">
        <div class="box"><div class="label">Orders</div><div class="value">${sourceRows.length}</div></div>
        <div class="box"><div class="label">Goods Value</div><div class="value">${safeText(fmt(sourceRows.reduce((a, x) => a + Number(x.total_goods_value || 0), 0)))}</div></div>
        <div class="box"><div class="label">Paid</div><div class="value">${safeText(fmt(sourceRows.reduce((a, x) => a + Number(x.total_paid_amount || 0), 0)))}</div></div>
        <div class="box"><div class="label">Balance</div><div class="value">${safeText(fmt(sourceRows.reduce((a, x) => a + Number(x.total_balance_amount || 0), 0)))}</div></div>
      </div>

      <h2>Incoming Orders</h2>
      <table>
        <thead>
          <tr>
            <th>#</th><th>Supplier</th><th>Code</th><th>Status</th>
            <th>From</th><th>To</th><th>Expected</th>
            <th>Goods</th><th>Paid</th><th>Balance</th>
          </tr>
        </thead>
        <tbody>${rowsHtml || `<tr><td colspan="10">No records found.</td></tr>`}</tbody>
      </table>
    `;

    const html = pdfShell("Incoming Stock Summary Report", body);

    if (downloadHtmlPdfOnWeb(
      html,
      `${cleanFilePart(businessName)}-Incoming-Stock-Summary-${new Date().toISOString().slice(0, 10)}.pdf`
    )) {
      return;
    }

    const { uri } = await Print.printToFileAsync({ html });

    const fileUri = await makePdfFile(
      uri,
      `${cleanFilePart(businessName)}-Incoming-Stock-Summary-${new Date().toISOString().slice(0, 10)}.pdf`
    );

    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(fileUri, {
        dialogTitle: "ZETRA BMS Incoming Stock Summary",
        mimeType: "application/pdf",
        UTI: "com.adobe.pdf",
      });
    } else {
      Alert.alert("PDF Ready", fileUri);
    }
  } catch (e: any) {
    Alert.alert("PDF Error", e?.message ?? "Failed to export summary PDF.");
  }
}, [
  filteredRows,
  rows,
  searchText,
  statusFilter,
  fromDateFilter,
  toDateFilter,
  fmt,
  safeText,
  friendlyDateOnly,
  pdfShell,
  makePdfFile,
  cleanFilePart,
  businessName,
]);

const exportSelectedOrderPdf = useCallback(async () => {
  if (!selectedOrder) return;

  try {
    const { data: orderMeta } = await supabase
      .from("inbound_stock_orders")
      .select("created_at,updated_at,created_by,updated_by,received_at,received_by,deleted_at,deleted_by,delete_reason,status")
      .eq("id", selectedOrder.id)
      .maybeSingle();

    const { data: paymentsData } = await supabase
      .from("inbound_stock_payments")
      .select("amount,payment_method,payment_type,reference_number,note,paid_at,created_at,created_by")
      .eq("inbound_order_id", selectedOrder.id)
      .order("paid_at", { ascending: true });

    const payments = Array.isArray(paymentsData) ? paymentsData : [];

    const userMap = await resolveUserLabels([
      (orderMeta as any)?.created_by,
      (orderMeta as any)?.updated_by,
      (orderMeta as any)?.received_by,
      (orderMeta as any)?.deleted_by,
      ...payments.map((p: any) => p?.created_by),
    ]);

    const itemsHtml = selectedItems
      .map((x, i) => {
        const remaining = Math.max(0, Number(x.qty_ordered || 0) - Number(x.qty_received || 0));

        return `
          <tr>
            <td>${i + 1}</td>
            <td>${safeText(x.product_name || "Product")}</td>
            <td>${safeText(x.sku || "—")}</td>
            <td>${safeText(x.barcode || "—")}</td>
            <td>${safeText(x.qty_ordered || 0)}</td>
            <td>${safeText(x.qty_received || 0)}</td>
            <td>${safeText(remaining)}</td>
            <td>${safeText(fmt(Number(x.unit_cost || 0)))}</td>
            <td>${safeText(fmt(Number(x.proposed_sell_price || 0)))}</td>
            <td>${safeText(fmt(Number(x.total_cost || 0)))}</td>
          </tr>
        `;
      })
      .join("");

    const paymentsHtml = payments
      .map(
        (p: any, i: number) => `
        <tr>
          <td>${i + 1}</td>
          <td>${safeText(friendlyDate(p.paid_at || p.created_at))}</td>
          <td>${safeText(p.payment_type || "PAYMENT")}</td>
          <td>${safeText(p.payment_method || "—")}</td>
          <td>${safeText(p.reference_number || "—")}</td>
          <td>${safeText(fmt(Number(p.amount || 0)))}</td>
          <td>${safeText(userMap[String(p.created_by ?? "")] || currentUserLabel)}</td>
          <td>${safeText(p.note || "—")}</td>
        </tr>
      `
      )
      .join("");

    const fileTitle = `${selectedOrder.order_code || "INB"} - ${selectedOrder.supplier_name || "Supplier"}`;

   const body = `
      <table class="info-table">
        <tr>
          <td><b>Supplier</b><br/>${safeText(selectedOrder.supplier_name || "Supplier")}</td>
          <td><b>Order Code</b><br/>${safeText(selectedOrder.order_code || "No code")}</td>
          <td><b>Status</b><br/>${safeText((orderMeta as any)?.status || selectedOrder.status)}</td>
        </tr>
        <tr>
          <td><b>From</b><br/>${safeText(selectedOrder.source_city || "—")}, ${safeText(selectedOrder.source_country || "—")}</td>
          <td><b>To</b><br/>${safeText(selectedOrder.destination_name || "—")}</td>
          <td><b>Expected Arrival</b><br/>${safeText(friendlyDateOnly(selectedOrder.expected_arrival_date))}</td>
        </tr>
      </table>

      

      <div class="section-title">Order Items</div>
      <table class="data-table">
        <thead>
          <tr>
            <th style="width:4%">#</th>
            <th style="width:28%">Product</th>
            <th style="width:20%">SKU / Barcode</th>
            <th style="width:8%">Ordered</th>
            <th style="width:8%">Received</th>
            <th style="width:8%">Remain</th>
            <th style="width:12%">Cost</th>
            <th style="width:12%">Total</th>
          </tr>
        </thead>
        <tbody>
          ${
            selectedItems
              .map((x, i) => {
                const remaining = Math.max(0, Number(x.qty_ordered || 0) - Number(x.qty_received || 0));
                return `
                  <tr>
                    <td>${i + 1}</td>
                    <td>${safeText(x.product_name || "Product")}</td>
                    <td>${safeText([x.sku, x.barcode].filter(Boolean).join(" / ") || "—")}</td>
                    <td>${safeText(x.qty_ordered || 0)}</td>
                    <td>${safeText(x.qty_received || 0)}</td>
                    <td>${safeText(remaining)}</td>
                    <td class="right">${safeText(fmt(Number(x.unit_cost || 0)))}</td>
                    <td class="right">${safeText(fmt(Number(x.total_cost || 0)))}</td>
                  </tr>
                `;
              })
              .join("") || `<tr><td colspan="8">No items found.</td></tr>`
          }
        </tbody>
      </table>

      <div class="section-title">Payment History</div>
      <table class="data-table">
        <thead>
          <tr>
            <th style="width:5%">#</th>
            <th style="width:22%">Date</th>
            <th style="width:16%">Method</th>
            <th style="width:22%">Reference</th>
            <th style="width:15%">Amount</th>
            <th style="width:20%">Note</th>
          </tr>
        </thead>
        <tbody>
          ${
            payments
              .map(
                (p: any, i: number) => `
                <tr>
                  <td>${i + 1}</td>
                  <td>${safeText(friendlyDate(p.paid_at || p.created_at))}</td>
                  <td>${safeText(p.payment_method || "—")}</td>
                  <td>${safeText(p.reference_number || "—")}</td>
                  <td class="right">${safeText(fmt(Number(p.amount || 0)))}</td>
                  <td>${safeText(p.note || "—")}</td>
                </tr>
              `
              )
              .join("") || `<tr><td colspan="6">No payment history found.</td></tr>`
          }
        </tbody>
      </table>

      <table class="info-table" style="margin-top:14px;">
        <tr>
          <td><b>Prepared By</b><br/>${safeText(currentUserLabel)}</td>
          <td><b>Created</b><br/>${safeText(friendlyDate((orderMeta as any)?.created_at || selectedOrder.created_at))}</td>
          <td><b>Signature / Stamp</b><br/><br/>________________________</td>
        </tr>
      </table>

      <div class="summary-bottom">
        <div class="section-title">Order Summary</div>
        <div class="grid">
          <div class="box"><div class="label">Goods Value</div><div class="value">${safeText(fmt(selectedOrder.total_goods_value))}</div></div>
          <div class="box"><div class="label">Paid</div><div class="value">${safeText(fmt(selectedOrder.total_paid_amount))}</div></div>
          <div class="box"><div class="label">Balance</div><div class="value">${safeText(fmt(selectedOrder.total_balance_amount))}</div></div>
          <div class="box"><div class="label">Items</div><div class="value">${selectedItems.length}</div></div>
        </div>
      </div>
    `;

    const html = pdfShell(fileTitle, body);

    if (downloadHtmlPdfOnWeb(
      html,
      `${cleanFilePart(selectedOrder.order_code || "INB")}-${cleanFilePart(selectedOrder.supplier_name || "Supplier")}.pdf`
    )) {
      return;
    }

    const { uri } = await Print.printToFileAsync({ html });

    const fileUri = await makePdfFile(
      uri,
      `${cleanFilePart(selectedOrder.order_code || "INB")}-${cleanFilePart(selectedOrder.supplier_name || "Supplier")}.pdf`
    );

    try {
      await supabase.from("inbound_stock_audit").insert({
        organization_id: orgId,
        inbound_order_id: selectedOrder.id,
        action: "PDF_EXPORTED",
        reason: null,
        metadata: {
          order_code: selectedOrder.order_code,
          supplier_name: selectedOrder.supplier_name,
          exported_by: currentUserLabel,
          exported_at: new Date().toISOString(),
        },
      });
    } catch {
      // Audit table should not block PDF export.
    }

    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(fileUri, {
        dialogTitle: `${selectedOrder.order_code || "INB"} ${selectedOrder.supplier_name || "Supplier"} PDF`,
        mimeType: "application/pdf",
        UTI: "com.adobe.pdf",
      });
    } else {
      Alert.alert("PDF Ready", fileUri);
    }
  } catch (e: any) {
    Alert.alert("PDF Error", e?.message ?? "Failed to export PDF.");
  }
}, [
  selectedOrder,
  selectedItems,
  fmt,
  safeText,
  friendlyDate,
  friendlyDateOnly,
  pdfShell,
  reportDate,
  orgId,
  currentUserLabel,
  resolveUserLabels,
  makePdfFile,
  cleanFilePart,
]);
const resetEditOrderItemForm = useCallback(() => {
  setEditOrderItemName("");
  setEditOrderItemSku("");
  setEditOrderItemUnit("");
  setEditOrderItemCategory("");
  setEditOrderItemBarcode("");
  setEditOrderItemQty("");
  setEditOrderItemCost("");
  setEditOrderItemSelling("");
  setShowEditProductSuggest(false);
  setShowEditUnitSuggest(false);
  setShowEditCategorySuggest(false);
}, []);

const openFullOrderEdit = useCallback(async () => {
  if (!selectedOrder) return;

  if (String(selectedOrder.status ?? "").toUpperCase() === "RECEIVED") {
    Alert.alert("Locked", "Order iliyopokelewa haiwezi ku-edit full details kwa usalama wa inventory.");
    return;
  }

  try {
    const { data, error } = await supabase
      .from("inbound_stock_orders")
      .select("supplier_name,source_country,source_city,destination_name,invoice_number,tracking_number,expected_arrival_date,note")
      .eq("id", selectedOrder.id)
      .maybeSingle();

    if (error) throw error;

    const row: any = data || selectedOrder;

    setEditSupplierName(String(row.supplier_name ?? selectedOrder.supplier_name ?? ""));
    setEditSourceCountry(String(row.source_country ?? selectedOrder.source_country ?? ""));
    setEditSourceCity(String(row.source_city ?? selectedOrder.source_city ?? ""));
    setEditDestinationName(String(row.destination_name ?? selectedOrder.destination_name ?? ""));
    setEditInvoiceNumber(String(row.invoice_number ?? ""));
    setEditTrackingNumber(String(row.tracking_number ?? ""));
    setEditExpectedDate(String(row.expected_arrival_date ?? selectedOrder.expected_arrival_date ?? ""));
    setEditOrderNote(String(row.note ?? ""));

    setEditNewItems([]);
    resetEditOrderItemForm();
    setFullEditOpen(true);
    void loadSuggestions();
  } catch (e: any) {
    Alert.alert("Edit Error", e?.message ?? "Failed to open full edit.");
  }
}, [selectedOrder, resetEditOrderItemForm, loadSuggestions]);

const selectEditProductSuggestion = useCallback((p: ProductSuggestion) => {
  setEditOrderItemName(String(p.name ?? ""));
  setEditOrderItemSku(String(p.sku ?? ""));
  setEditOrderItemUnit(String(p.unit ?? ""));
  setEditOrderItemCategory(String(p.category ?? ""));
  setEditOrderItemBarcode(String(p.barcode ?? ""));

  const cost = Number(p.cost_price ?? 0);
  const sell = Number(p.selling_price ?? 0);

  setEditOrderItemCost(cost > 0 ? String(cost) : "");
  setEditOrderItemSelling(sell > 0 ? String(sell) : "");
  setShowEditProductSuggest(false);
}, []);

const addEditNewItem = useCallback(() => {
  if (!editOrderItemName.trim()) {
    Alert.alert("Required", "Weka product/item name.");
    return;
  }

  if (moneyNum(editOrderItemQty) <= 0) {
    Alert.alert("Required", "Weka quantity sahihi.");
    return;
  }

  if (moneyNum(editOrderItemCost) <= 0) {
    Alert.alert("Required", "Weka cost/unit sahihi.");
    return;
  }

  setEditNewItems((prev) => [
    ...prev,
    {
      product_name: editOrderItemName.trim(),
      sku: editOrderItemSku.trim(),
      unit: editOrderItemUnit.trim(),
      category: editOrderItemCategory.trim(),
      barcode: editOrderItemBarcode.trim(),
      quantity: editOrderItemQty.trim(),
      unit_cost: editOrderItemCost.trim(),
      selling_price: editOrderItemSelling.trim(),
    },
  ]);

  resetEditOrderItemForm();
}, [
  editOrderItemName,
  editOrderItemSku,
  editOrderItemUnit,
  editOrderItemCategory,
  editOrderItemBarcode,
  editOrderItemQty,
  editOrderItemCost,
  editOrderItemSelling,
  resetEditOrderItemForm,
]);

const saveFullOrderEdit = useCallback(async () => {
  if (!selectedOrder || savingFullEdit) return;

  if (!editSupplierName.trim()) {
    Alert.alert("Required", "Weka supplier name.");
    return;
  }

  setSavingFullEdit(true);

  try {
    const { error } = await supabase
      .from("inbound_stock_orders")
      .update({
        supplier_name: editSupplierName.trim(),
        source_country: editSourceCountry.trim() || null,
        source_city: editSourceCity.trim() || null,
        destination_name: editDestinationName.trim() || null,
        invoice_number: editInvoiceNumber.trim() || null,
        tracking_number: editTrackingNumber.trim() || null,
        expected_arrival_date: editExpectedDate.trim() || null,
        note: editOrderNote.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", selectedOrder.id);

    if (error) throw error;

    for (const item of editNewItems) {
      const itemRes = await supabase.rpc("add_inbound_stock_item_v1", {
        p_order_id: selectedOrder.id,
        p_product_name: item.product_name,
        p_sku: item.sku || null,
        p_unit: item.unit || null,
        p_category: item.category || null,
        p_barcode: item.barcode || null,
        p_quantity: moneyNum(item.quantity),
        p_unit_cost: moneyNum(item.unit_cost),
        p_selling_price: moneyNum(item.selling_price),
        p_note: null,
      });

      if (itemRes.error) throw itemRes.error;
    }

    setFullEditOpen(false);
    setEditNewItems([]);
    await load();
    await openOrderDetail(selectedOrder);

    Alert.alert("Success", "Incoming order imebadilishwa successfully.");
  } catch (e: any) {
    Alert.alert("Save Error", e?.message ?? "Failed to save full edit.");
  } finally {
    setSavingFullEdit(false);
  }
}, [
  selectedOrder,
  savingFullEdit,
  editSupplierName,
  editSourceCountry,
  editSourceCity,
  editDestinationName,
  editInvoiceNumber,
  editTrackingNumber,
  editExpectedDate,
  editOrderNote,
  editNewItems,
  load,
  openOrderDetail,
]);
const deleteSelectedOrder = useCallback(() => {
  if (!selectedOrder || deletingOrder) return;

  const isReceived = String(selectedOrder.status ?? "").toUpperCase() === "RECEIVED";

  if (isReceived && deleteReason.trim().length < 10) {
    Alert.alert(
      "Reason Required",
      "Order iliyopokelewa haiwezi kufutwa bila sababu ya wazi. Andika reason yenye angalau herufi 10."
    );
    return;
  }

  const runDelete = async () => {
    setDeletingOrder(true);

    try {
      try {
        await supabase.from("inbound_stock_audit").insert({
          organization_id: orgId,
          inbound_order_id: selectedOrder.id,
          action: "DELETE_REQUESTED",
          reason: deleteReason.trim() || null,
          metadata: {
            order_code: selectedOrder.order_code,
            supplier_name: selectedOrder.supplier_name,
            status: selectedOrder.status,
            requested_by: currentUserLabel,
            requested_at: new Date().toISOString(),
          },
        });
      } catch {
        // Do not block delete if audit table is unavailable.
      }

      await supabase
        .from("inbound_stock_orders")
        .update({
          delete_reason: deleteReason.trim() || null,
          deleted_at: new Date().toISOString(),
        })
        .eq("id", selectedOrder.id);

      const { error } = await supabase.rpc("delete_inbound_stock_order_v1", {
        p_order_id: selectedOrder.id,
      });

      if (error) throw error;

      setSelectedOrder(null);
      setSelectedItems([]);
      setDeleteReason("");
      await load();

      Alert.alert("Deleted", "Incoming order imefutwa na audit imehifadhiwa.");
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "Failed to delete order");
    } finally {
      setDeletingOrder(false);
    }
  };

  const message = isReceived
    ? "Order hii tayari imepokelewa. Kufuta kunaweza kuathiri audit/history. Una uhakika unataka kufuta?"
    : `Unataka kufuta order ya ${selectedOrder.supplier_name || "supplier"}?`;

  if (Platform.OS === "web") {
    const ok =
      typeof window !== "undefined"
        ? window.confirm(message)
        : false;

    if (ok) {
      void runDelete();
    }

    return;
  }

  Alert.alert(
    isReceived ? "Strict Delete Confirmation" : "Delete Incoming Order?",
    message,
    [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          void runDelete();
        },
      },
    ]
  );
}, [selectedOrder, deletingOrder, deleteReason, orgId, currentUserLabel, load]);
  return (
    <Screen
      scroll
      contentStyle={{
        paddingTop: Math.max(insets.top, 12),
        paddingHorizontal: pagePaddingX,
        paddingBottom: Math.max(insets.bottom, 18) + 24,
        width: "100%",
        maxWidth: pageMaxWidth,
        alignSelf: "center",
      }}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={UI.text} />
      }
    >
      <View style={{ gap: 14 }}>
        <Pressable onPress={() => router.back()}>
          <Text style={{ color: UI.primary, fontWeight: "900", fontSize: 15 }}>‹ Back</Text>
        </Pressable>

        <Card style={{ borderRadius: 24, gap: 14 }}>
  <View
    style={{
      borderWidth: 1,
      borderColor: UI.emeraldBorder,
      backgroundColor: UI.emeraldSoft,
      borderRadius: 16,
      padding: 12,
      gap: 4,
    }}
  >
    <Text style={{ color: UI.text, fontWeight: "900" }}>
      Active Store: {storeName}
    </Text>
    <Text style={{ color: UI.emerald, fontWeight: "900", fontSize: 12 }}>
      {storeType} STORE
    </Text>
  </View>
          <Text style={{ color: UI.text, fontWeight: "900", fontSize: 26 }}>
            Incoming Stock
          </Text>

          <Text style={{ color: UI.muted, fontWeight: "800", lineHeight: 22 }}>
            Fuatilia mzigo uliopo njiani kabla haujaingia inventory.
          </Text>

          <View style={{ flexDirection: "row", gap: 10, flexWrap: "wrap" }}>
            <Mini label="Orders" value={String(summary.orders)} desktop={isDesktopWeb} />
            <Mini label="Goods Value" value={fmt(summary.goods)} desktop={isDesktopWeb} />
            <Mini label="Paid" value={fmt(summary.paid)} desktop={isDesktopWeb} />
            <Mini label="Balance" value={fmt(summary.balance)} desktop={isDesktopWeb} />
          </View>

          <View style={{ gap: 10 }}>
  <Button title="Add Incoming Order" onPress={() => setOpenAdd(true)} />

  <Input placeholder="Search supplier / order / destination" value={searchText} onChangeText={setSearchText} />

  <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
    {(["ALL", "IN_TRANSIT", "PARTIAL_RECEIVED", "RECEIVED"] as const).map((s) => (
      <Pressable
        key={s}
        onPress={() => setStatusFilter(s)}
        style={{
          paddingHorizontal: 10,
          paddingVertical: 8,
          borderRadius: 999,
          borderWidth: 1,
          borderColor: statusFilter === s ? UI.primary : UI.border,
          backgroundColor: statusFilter === s ? "rgba(37,99,235,0.10)" : UI.background,
        }}
      >
        <Text style={{ color: UI.text, fontWeight: "900", fontSize: 11 }}>{s}</Text>
      </Pressable>
    ))}
  </View>

  <View style={{ flexDirection: isDesktopWeb ? "row" : "column", gap: 10 }}>
    <View style={{ flex: 1 }}>
      <Input placeholder="From date YYYY-MM-DD" value={fromDateFilter} onChangeText={setFromDateFilter} />
    </View>
    <View style={{ flex: 1 }}>
      <Input placeholder="To date YYYY-MM-DD" value={toDateFilter} onChangeText={setToDateFilter} />
    </View>
  </View>

  <Pressable
    onPress={exportAllInboundPdf}
    disabled={rows.length === 0}
    style={({ pressed }) => ({
      height: 52,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: pressed ? UI.primary : UI.border,
      backgroundColor: pressed ? "rgba(37,99,235,0.10)" : UI.background,
      alignItems: "center",
      justifyContent: "center",
      opacity: rows.length === 0 ? 0.55 : pressed ? 0.72 : 1,
      transform: [{ scale: pressed ? 0.97 : 1 }],
    })}
  >
    <Text style={{ color: UI.text, fontWeight: "900" }}>
      Export All PDF
    </Text>
  </Pressable>
</View>
        </Card>

        {loading ? (
          <Card style={{ alignItems: "center", paddingVertical: 28 }}>
            <ActivityIndicator />
            <Text style={{ color: UI.muted, fontWeight: "800", marginTop: 8 }}>
              Loading incoming stock...
            </Text>
          </Card>
        ) : rows.length === 0 ? (
          <Card style={{ borderRadius: 22, paddingVertical: 30, alignItems: "center" }}>
            <Text style={{ color: UI.text, fontWeight: "900", fontSize: 16 }}>
              No Incoming Stock
            </Text>
            <Text style={{ color: UI.muted, fontWeight: "800", marginTop: 8, textAlign: "center" }}>
              Hakuna mzigo wa njiani uliorekodiwa bado.
            </Text>
          </Card>
        ) : (
          <View
            style={{
              flexDirection: isDesktopWeb ? "row" : "column",
              flexWrap: isDesktopWeb ? "wrap" : "nowrap",
              gap: 14,
            }}
          >
          {filteredRows.map((item) => (
            <Pressable
  key={item.id}
  onPress={() => openOrderDetail(item)}
  style={({ pressed }) => ({
    width: isDesktopWeb ? "49%" : "100%",
    opacity: pressed ? 0.72 : 1,
    transform: [{ scale: pressed ? 0.985 : 1 }],
  })}
>
<Card style={{ borderRadius: 22, gap: 10 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: UI.text, fontWeight: "900", fontSize: 17 }}>
                    {item.supplier_name || "Supplier"}
                  </Text>
                  <Text style={{ color: UI.muted, fontWeight: "800", marginTop: 3 }}>
                    {item.order_code || "No code"} • {item.status}
                  </Text>
                </View>

                <View
                  style={{
                    paddingHorizontal: 10,
                    paddingVertical: 6,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: UI.emeraldBorder,
                    backgroundColor: UI.emeraldSoft,
                  }}
                >
                <Text style={{ color: UI.emerald, fontWeight: "900", fontSize: 11 }}>
  {String(item.status ?? "").toUpperCase() === "RECEIVED" ? "RECEIVED" : "IN TRANSIT"}
</Text>
                </View>
              </View>

              <Text style={{ color: UI.text, fontWeight: "900", fontSize: 20 }}>
                {fmt(item.total_goods_value)}
              </Text>

              <Text style={{ color: UI.muted, fontWeight: "800" }}>
                Paid: {fmt(item.total_paid_amount)} • Balance: {fmt(item.total_balance_amount)}
              </Text>

              <Text style={{ color: UI.faint, fontWeight: "800" }}>
                From: {item.source_city || "—"}, {item.source_country || "—"} • To:{" "}
                {item.destination_name || "—"}
              </Text>

              <Text style={{ color: UI.faint, fontWeight: "800" }}>
                Expected: {item.expected_arrival_date || "No date"}
              </Text>
            </Card>
</Pressable>
          ))}
          </View>
        )}
      </View>

      <Modal visible={openAdd} transparent animationType="slide" onRequestClose={() => setOpenAdd(false)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.70)", justifyContent: isDesktopWeb ? "center" : "flex-end" }}
        >
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1, justifyContent: isDesktopWeb ? "center" : "flex-end" }}>
            <View
              style={{
                backgroundColor: UI.card,
                borderTopLeftRadius: 28,
                borderTopRightRadius: 28,
                padding: 18,
                paddingBottom: Math.max(insets.bottom, 24) + 70,
                gap: 12,
              }}
            >
              <Text style={{ color: UI.text, fontWeight: "900", fontSize: 22 }}>
                Add Incoming Order
              </Text>

              <SuggestInput
                placeholder="Supplier name"
                value={supplierName}
               onChangeText={(v) => {
  setSupplierName(v);
  setShowSupplierSuggest(v.trim().length >= 1);

  if (v.trim().length >= 1) {
    void loadSuggestions(v);
  }
}}
onFocus={() => setShowSupplierSuggest(supplierName.trim().length >= 1)}
              />

              {showSupplierSuggest &&
 supplierName.trim().length >= 1 &&
 filteredSupplierSuggestions.length > 0 ? (
                <SuggestBox>
                  {filteredSupplierSuggestions.map((s, index) => (
                    <SuggestRow
                      key={`${s.supplier_name}-${index}`}
                      title={s.supplier_name}
                      subtitle={`Phone: ${s.supplier_phone || "—"} • Email: ${s.supplier_email || "—"} • Location: ${s.supplier_location || s.supplier_address || s.destination_name || "—"}`}
                      onPress={() => selectSupplierSuggestion(s)}
                    />
                  ))}
                </SuggestBox>
              ) : null}
              <Input placeholder="Source country e.g. China" value={sourceCountry} onChangeText={setSourceCountry} />
              <Input placeholder="Source city e.g. Guangzhou / Dar" value={sourceCity} onChangeText={setSourceCity} />
              <Input placeholder="Destination e.g. PRO 1 / Mbeya Store" value={destinationName} onChangeText={setDestinationName} />
              <Input placeholder="Invoice number" value={invoiceNumber} onChangeText={setInvoiceNumber} />
              <Input placeholder="Tracking number" value={trackingNumber} onChangeText={setTrackingNumber} />
              <Input placeholder="Expected arrival date YYYY-MM-DD" value={expectedDate} onChangeText={setExpectedDate} />
<Card style={{ borderRadius: 18, gap: 10 }}>
  <Pressable
    onPress={() => setShowItemForm((v) => !v)}
    style={({ pressed }) => ({
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      opacity: pressed ? 0.68 : 1,
      transform: [{ scale: pressed ? 0.985 : 1 }],
    })}
  >
    <View style={{ flex: 1 }}>
      <Text style={{ color: UI.text, fontWeight: "900", fontSize: 16 }}>
        Order Items ({draftItems.length})
      </Text>
      <Text style={{ color: UI.muted, fontWeight: "800", marginTop: 3 }}>
        {draftItems.length > 0
          ? `${draftItems.length} item(s) added`
          : "Bonyeza hapa kuongeza bidhaa za mzigo"}
      </Text>
    </View>

    <Text style={{ color: UI.text, fontWeight: "900", fontSize: 22 }}>
      {showItemForm ? "⌃" : "⌄"}
    </Text>
  </Pressable>

  {showItemForm ? (
    <>
      <SuggestInput
        placeholder="Product / item name"
        value={itemName}
      onChangeText={(v) => {
  setItemName(v);
  setShowProductSuggest(true);

  if (v.trim().length >= 2) {
    void loadSuggestions(v);
  }
}}
        onFocus={() => setShowProductSuggest(true)}
      />

      {showProductSuggest && filteredProductSuggestions.length > 0 ? (
        <SuggestBox>
          {filteredProductSuggestions.map((p) => (
            <SuggestRow
              key={p.id}
              title={p.name || "Product"}
              subtitle={`SKU: ${p.sku || "—"} • Barcode: ${p.barcode || "—"} • Cost: ${fmt(Number(p.cost_price || 0))} • Sell: ${fmt(Number(p.selling_price || 0))}`}
              onPress={() => selectProductSuggestion(p)}
            />
          ))}
        </SuggestBox>
      ) : null}

      <View style={{ flexDirection: "row", gap: 10 }}>
        <View style={{ flex: 1 }}>
          <Input placeholder="SKU optional" value={itemSku} onChangeText={setItemSku} />
        </View>
        <View style={{ flex: 1 }}>
          <SuggestInput
            placeholder="Unit e.g. pcs"
            value={itemUnit}
            onChangeText={(v) => {
              setItemUnit(v);
              setShowUnitSuggest(true);
            }}
            onFocus={() => setShowUnitSuggest(true)}
          />
        </View>
      </View>

      {showUnitSuggest &&
 itemUnit.trim().length >= 1 &&
 filteredUnitSuggestions.length > 0 ? (
        <SuggestBox>
          {filteredUnitSuggestions.map((unit) => (
            <SuggestRow
              key={`unit-${unit}`}
              title={unit}
              subtitle="Saved unit from previous products"
              onPress={() => {
                setItemUnit(unit);
                setShowUnitSuggest(false);
              }}
            />
          ))}
        </SuggestBox>
      ) : null}

      <SuggestInput
        placeholder="Category optional"
        value={itemCategory}
        onChangeText={(v) => {
          setItemCategory(v);
          setShowCategorySuggest(true);
        }}
        onFocus={() => setShowCategorySuggest(true)}
      />

      {showCategorySuggest &&
 itemCategory.trim().length >= 1 &&
 filteredCategorySuggestions.length > 0 ? (
        <SuggestBox>
          {filteredCategorySuggestions.map((category) => (
            <SuggestRow
              key={`category-${category}`}
              title={category}
              subtitle="Saved category from previous products"
              onPress={() => {
                setItemCategory(category);
                setShowCategorySuggest(false);
              }}
            />
          ))}
        </SuggestBox>
      ) : null}
      <Input placeholder="Barcode optional" value={itemBarcode} onChangeText={setItemBarcode} />

      {isPrecisionInboundStore ? (
        <Card style={{ borderRadius: 18, gap: 10, borderColor: UI.emeraldBorder, backgroundColor: UI.emeraldSoft }}>
          <Pressable
            onPress={() => setPrecisionCalcOpen((v) => !v)}
            style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}
          >
            <View style={{ flex: 1 }}>
              <Text style={{ color: UI.text, fontWeight: "900", fontSize: 15 }}>
                Unit & Pack Calculator
              </Text>
              <Text style={{ color: UI.muted, fontWeight: "800", marginTop: 3 }}>
                Kwa precision store: calculate cost/selling ya unit moja
              </Text>
            </View>
            <Text style={{ color: UI.text, fontWeight: "900", fontSize: 22 }}>
              {precisionCalcOpen ? "⌃" : "⌄"}
            </Text>
          </Pressable>

          {precisionCalcOpen ? (
            <>
              <Text style={{ color: UI.muted, fontWeight: "800", lineHeight: 19 }}>
                Mfano: Box/carton/pack yenye tablets 100. Mfumo utajaza Qty, Cost/unit na Selling/unit automatic.
              </Text>

              <View style={{ flexDirection: "row", gap: 10 }}>
                <View style={{ flex: 1.15 }}>
                  <Input
                    placeholder="Pack size e.g. 100"
                    value={precisionPackQty}
                    onChangeText={(t) => setPrecisionPackQty(normalizeDecimalInput(t))}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Input
                    placeholder="Unit e.g. tablet"
                    value={precisionUnit}
                    onChangeText={setPrecisionUnit}
                  />
                </View>
              </View>

              <Input
                placeholder="Buying/Cost price ya box/pack"
                value={precisionPackCost}
                onChangeText={(t) => setPrecisionPackCost(normalizeDecimalInput(t))}
              />

              <Input
                placeholder="Selling price ya box/pack"
                value={precisionPackSelling}
                onChangeText={(t) => setPrecisionPackSelling(normalizeDecimalInput(t))}
              />

              <Button title="Calculate Per Unit Price" onPress={applyPrecisionFormula} variant="secondary" />

              <Text style={{ color: UI.faint, fontWeight: "800" }}>
                Baada ya calculate, fields za Qty, Cost/unit, Selling/unit na Unit zitajazwa.
              </Text>
            </>
          ) : null}
        </Card>
      ) : null}

      <View style={{ flexDirection: "row", gap: 10 }}>
        <View style={{ flex: 1 }}>
          <Input placeholder="Qty" value={itemQty} onChangeText={(t) => setItemQty(normalizeDecimalInput(t))} />
        </View>
        <View style={{ flex: 1 }}>
          <Input placeholder="Cost/unit" value={itemCost} onChangeText={(t) => setItemCost(normalizeDecimalInput(t))} />
        </View>
      </View>

      <Input
        placeholder="Selling price/unit optional"
        value={itemSelling}
        onChangeText={(t) => setItemSelling(normalizeDecimalInput(t))}
      />

      <Button
  title={editingDraftIndex === null ? "Add Item to Order" : "Save Item Changes"}
  onPress={addDraftItem}
  variant="secondary"
/>

{editingDraftIndex !== null ? (
  <Pressable
    onPress={cancelDraftEdit}
    style={({ pressed }) => ({
      borderRadius: 14,
      borderWidth: 1,
      borderColor: pressed ? UI.primary : UI.border,
      backgroundColor: pressed ? "rgba(37,99,235,0.08)" : "transparent",
      paddingVertical: 10,
      alignItems: "center",
      opacity: pressed ? 0.75 : 1,
      transform: [{ scale: pressed ? 0.97 : 1 }],
    })}
  >
    <Text style={{ color: UI.text, fontWeight: "900" }}>
      Cancel Edit
    </Text>
  </Pressable>
) : null}
    </>
  ) : null}

  {draftItems.length > 0 ? (
  <View
    style={{
      borderWidth: 1,
      borderColor: UI.emeraldBorder,
      backgroundColor: UI.emeraldSoft,
      borderRadius: 14,
      padding: 10,
      gap: 4,
    }}
  >
    <Text style={{ color: UI.text, fontWeight: "900" }}>
      Items Total: {fmt(draftItemsTotal)}
    </Text>
    <Text style={{ color: UI.muted, fontWeight: "800" }}>
      Paid: {fmt(moneyNum(paidAmount))} • Balance: {fmt(draftBalance)}
    </Text>
  </View>
) : null}

{draftItems.length > 0 ? (
    <View style={{ gap: 8 }}>
      {draftItems.map((x, i) => (
        <View
          key={`${x.product_name}-${i}`}
          style={{
            borderWidth: 1,
            borderColor: UI.border,
            backgroundColor: UI.background,
            borderRadius: 14,
            padding: 10,
          }}
        >
          <Text style={{ color: UI.text, fontWeight: "900" }}>
            {i + 1}. {x.product_name}
          </Text>
          <Text style={{ color: UI.muted, fontWeight: "800", marginTop: 4 }}>
            Qty: {x.quantity} • Cost: {x.unit_cost || "0"} • Sell: {x.selling_price || "—"}
          </Text>
          <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
          <Pressable
  onPress={() => openEditDraftItem(i)}
  style={({ pressed }) => ({
    borderWidth: 1,
    borderColor: UI.emeraldBorder,
    backgroundColor: pressed ? UI.emeraldSoft : "rgba(42,168,118,0.08)",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    opacity: pressed ? 0.78 : 1,
    transform: [{ scale: pressed ? 0.96 : 1 }],
  })}
>
  <Text style={{ color: UI.emerald, fontWeight: "900", fontSize: 12 }}>
    Edit
  </Text>
</Pressable>

          <Pressable
  onPress={() => removeDraftItem(i)}
  style={({ pressed }) => ({
    alignSelf: "flex-start",
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.35)",
    backgroundColor: pressed ? "rgba(239,68,68,0.18)" : "rgba(239,68,68,0.08)",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    opacity: pressed ? 0.78 : 1,
    transform: [{ scale: pressed ? 0.96 : 1 }],
  })}
>
  <Text style={{ color: UI.danger, fontWeight: "900", fontSize: 12 }}>
    Remove
  </Text>
</Pressable>
</View>
        </View>
      ))}
    </View>
  ) : null}
</Card>
            

              <Text style={{ color: UI.text, fontWeight: "900", fontSize: 15 }}>
  Payment Made
</Text>
<Text style={{ color: UI.muted, fontWeight: "800", marginTop: -6 }}>
  Weka kiasi kilicholipwa kwa supplier/shipping mpaka sasa.
</Text>

<Input placeholder="Paid amount e.g. 1000000" value={paidAmount} onChangeText={setPaidAmount} />
              <TextInput
                placeholder="Note"
                placeholderTextColor={UI.faint}
                value={note}
                onChangeText={setNote}
                multiline
                style={{
                  borderWidth: 1,
                  borderColor: UI.border,
                  borderRadius: 16,
                  paddingHorizontal: 14,
                  paddingVertical: 14,
                  minHeight: 100,
                  color: UI.text,
                  fontWeight: "800",
                  backgroundColor: UI.background,
                  textAlignVertical: "top",
                }}
              />

              <View style={{ flexDirection: "row", gap: 12 }}>
                <Pressable
                  onPress={() => setOpenAdd(false)}
                  style={({ pressed }) => ({
                    flex: 1,
                    height: 52,
                    borderRadius: 18,
                    borderWidth: 1,
                    borderColor: pressed ? UI.primary : UI.border,
                    backgroundColor: pressed ? "rgba(37,99,235,0.08)" : "transparent",
                    alignItems: "center",
                    justifyContent: "center",
                    opacity: pressed ? 0.75 : 1,
                    transform: [{ scale: pressed ? 0.97 : 1 }],
                  })}
                >
                  <Text style={{ color: UI.text, fontWeight: "900" }}>Cancel</Text>
                </Pressable>

                <Pressable
                  onPress={createOrder}
                  style={({ pressed }) => ({
                    flex: 1,
                    height: 52,
                    borderRadius: 18,
                    backgroundColor: UI.primary,
                    alignItems: "center",
                    justifyContent: "center",
                    opacity: pressed ? 0.72 : 1,
                    transform: [{ scale: pressed ? 0.97 : 1 }],
                  })}
                >
                  <Text style={{ color: "#FFFFFF", fontWeight: "900" }}>Save</Text>
                </Pressable>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
      <Modal
  visible={!!selectedOrder}
  transparent
  animationType="slide"
  onRequestClose={() => setSelectedOrder(null)}
>
  <KeyboardAvoidingView
    behavior={Platform.OS === "ios" ? "padding" : "height"}
    style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.70)", justifyContent: isDesktopWeb ? "center" : "flex-end" }}
  >
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1, justifyContent: isDesktopWeb ? "center" : "flex-end" }}>
      <View
        style={{
          backgroundColor: UI.card,
          width: isDesktopWeb ? 820 : "100%",
          maxHeight: isDesktopWeb ? "92%" : undefined,
          alignSelf: "center",
          borderRadius: isDesktopWeb ? 28 : 0,
          borderTopLeftRadius: 28,
          borderTopRightRadius: 28,
          padding: 18,
          paddingBottom: Math.max(insets.bottom, 24) + 24,
          gap: 12,
        }}
      >
        <Text style={{ color: UI.text, fontWeight: "900", fontSize: 22 }}>
          Incoming Order Detail
        </Text>

        {!!selectedOrder && (
          <>
            <Text style={{ color: UI.text, fontWeight: "900", fontSize: 18 }}>
              {selectedOrder.supplier_name || "Supplier"}
            </Text>

            <Text style={{ color: UI.muted, fontWeight: "800" }}>
              {selectedOrder.order_code || "No code"} • {selectedOrder.status}
            </Text>

            <View style={{ flexDirection: "row", gap: 10 }}>
              <Mini label="Goods" value={fmt(selectedOrder.total_goods_value)} />
              <Mini label="Paid" value={fmt(selectedOrder.total_paid_amount)} />
            </View>

            <View style={{ flexDirection: "row", gap: 10 }}>
              <Mini label="Balance" value={fmt(selectedOrder.total_balance_amount)} />
              <Mini label="Items" value={String(selectedItems.length)} />
            </View>

            <Text style={{ color: UI.muted, fontWeight: "800" }}>
              From: {selectedOrder.source_city || "—"}, {selectedOrder.source_country || "—"}
            </Text>

            <Text style={{ color: UI.muted, fontWeight: "800" }}>
              To: {selectedOrder.destination_name || "—"}
            </Text>

           <Text style={{ color: UI.muted, fontWeight: "800" }}>
  Expected: {selectedOrder.expected_arrival_date || "No date"}
</Text>

{selectedOrder?.status !== "RECEIVED" ? (
  <Button title="Edit Full Order" onPress={openFullOrderEdit} variant="secondary" />
) : null}
          </>
        )}

        <Text style={{ color: UI.text, fontWeight: "900", fontSize: 16, marginTop: 6 }}>
          Order Items
        </Text>

        {detailLoading ? (
          <Card style={{ alignItems: "center", paddingVertical: 22 }}>
            <ActivityIndicator />
            <Text style={{ color: UI.muted, fontWeight: "800", marginTop: 8 }}>
              Loading items...
            </Text>
          </Card>
        ) : selectedItems.length === 0 ? (
          <Card style={{ borderRadius: 18 }}>
            <Text style={{ color: UI.muted, fontWeight: "800" }}>
              Hakuna items zilizoonekana kwenye order hii.
            </Text>
          </Card>
        ) : (
          selectedItems.map((x, i) => (
            <Card key={x.id} style={{ borderRadius: 18, gap: 8 }}>
              <Text style={{ color: UI.text, fontWeight: "900", fontSize: 15 }}>
                {i + 1}. {x.product_name || "Product"}
              </Text>

              <Text style={{ color: UI.muted, fontWeight: "800" }}>
                Ordered: {x.qty_ordered} • Received: {x.qty_received || 0} • Remaining:{" "}
                {Math.max(0, Number(x.qty_ordered || 0) - Number(x.qty_received || 0))}
              </Text>

              <Text style={{ color: UI.muted, fontWeight: "800" }}>
                Cost: {fmt(x.unit_cost)} • Total: {fmt(x.total_cost)}
              </Text>

              <Text style={{ color: UI.faint, fontWeight: "800" }}>
                SKU: {x.sku || "—"} • Barcode: {x.barcode || "—"} • Sell: {fmt(x.proposed_sell_price)}
              </Text>

              {selectedOrder?.status !== "RECEIVED" ? (
                <View style={{ gap: 8 }}>
                  <TextInput
                    placeholder="Qty to receive now"
                    placeholderTextColor={UI.faint}
                    keyboardType="numeric"
                    value={receiveQtyMap[x.id] ?? ""}
                    onChangeText={(v) =>
                      setReceiveQtyMap((prev) => ({
                        ...prev,
                        [x.id]: v,
                      }))
                    }
                    style={{
                      borderWidth: 1,
                      borderColor: UI.border,
                      borderRadius: 14,
                      paddingHorizontal: 12,
                      height: 46,
                      color: UI.text,
                      fontWeight: "800",
                      backgroundColor: UI.background,
                    }}
                  />

                  <Pressable
                    onPress={() => openEditItem(x)}
                    style={({ pressed }) => ({
                      borderRadius: 14,
                      borderWidth: 1,
                      borderColor: pressed ? UI.primary : UI.border,
                      backgroundColor: pressed ? "rgba(37,99,235,0.08)" : UI.background,
                      paddingVertical: 10,
                      alignItems: "center",
                      opacity: pressed ? 0.75 : 1,
                      transform: [{ scale: pressed ? 0.97 : 1 }],
                    })}
                  >
                    <Text style={{ color: UI.text, fontWeight: "900" }}>Edit Item</Text>
                  </Pressable>
                </View>
              ) : null}
            </Card>
          ))
        )}
<TextInput
  placeholder="Delete reason required for received order"
  placeholderTextColor={UI.faint}
  value={deleteReason}
  onChangeText={setDeleteReason}
  multiline
  style={{
    borderWidth: 1,
    borderColor: UI.border,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 70,
    color: UI.text,
    fontWeight: "800",
    backgroundColor: UI.background,
    textAlignVertical: "top",
  }}
/>

<Pressable
  onPress={exportSelectedOrderPdf}
  disabled={detailLoading || selectedItems.length === 0}
  style={({ pressed }) => ({
    height: 52,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: pressed ? UI.primary : UI.border,
    backgroundColor: pressed ? "rgba(37,99,235,0.10)" : UI.background,
    alignItems: "center",
    justifyContent: "center",
    opacity: detailLoading || selectedItems.length === 0 ? 0.55 : pressed ? 0.72 : 1,
    transform: [{ scale: pressed ? 0.97 : 1 }],
  })}
>
  <Text style={{ color: UI.text, fontWeight: "900" }}>
    Export PDF
  </Text>
</Pressable>
      {selectedOrder?.status !== "RECEIVED" && selectedItems.length > 0 ? (
  <Pressable
    onPress={receivePartialOrder}
    disabled={receivingOrder}
    style={({ pressed }) => ({
      height: 52,
      borderRadius: 18,
      backgroundColor: UI.primary,
      alignItems: "center",
      justifyContent: "center",
      opacity: receivingOrder ? 0.65 : pressed ? 0.72 : 1,
      transform: [{ scale: pressed ? 0.97 : 1 }],
    })}
  >
    <Text style={{ color: "#FFFFFF", fontWeight: "900" }}>
      {receivingOrder ? "Receiving..." : "Receive Partial Qty"}
    </Text>
  </Pressable>
) : null}

<View style={{ flexDirection: "row", gap: 10 }}>
  <Pressable
    onPress={() => setSelectedOrder(null)}
    style={{
      flex: 1,
      height: 52,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: UI.border,
      alignItems: "center",
      justifyContent: "center",
    }}
  >
    <Text style={{ color: UI.text, fontWeight: "900" }}>
      Close
    </Text>
  </Pressable>

  {selectedOrder?.status !== "RECEIVED" ? (
    <Pressable
      onPress={receiveSelectedOrder}
      disabled={receivingOrder}
      style={{
        flex: 1,
        height: 52,
        borderRadius: 18,
        backgroundColor: UI.emerald,
        alignItems: "center",
        justifyContent: "center",
        opacity: receivingOrder ? 0.65 : 1,
      }}
    >
      <Text style={{ color: "#FFFFFF", fontWeight: "900" }}>
        {receivingOrder ? "Receiving..." : "Receive Stock"}
      </Text>
    </Pressable>
  ) : (
    <View
      style={{
        flex: 1,
        height: 52,
        borderRadius: 18,
        backgroundColor: UI.emeraldSoft,
        borderWidth: 1,
        borderColor: UI.emeraldBorder,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text style={{ color: UI.emerald, fontWeight: "900" }}>
        RECEIVED
      </Text>
    </View>
  )}

  <Pressable
    onPress={deleteSelectedOrder}
    disabled={deletingOrder}
    style={{
      flex: 1,
      height: 52,
      borderRadius: 18,
      backgroundColor: UI.danger,
      alignItems: "center",
      justifyContent: "center",
      opacity: deletingOrder ? 0.65 : 1,
    }}
  >
    <Text style={{ color: "#FFFFFF", fontWeight: "900" }}>
      {deletingOrder ? "Deleting..." : "Delete"}
    </Text>
  </Pressable>
</View>
      </View>
    </ScrollView>
  </KeyboardAvoidingView>
</Modal>
<Modal
  visible={fullEditOpen}
  transparent
  animationType="slide"
  onRequestClose={() => setFullEditOpen(false)}
>
  <KeyboardAvoidingView
    behavior={Platform.OS === "ios" ? "padding" : "height"}
    style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.70)", justifyContent: isDesktopWeb ? "center" : "flex-end" }}
  >
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1, justifyContent: isDesktopWeb ? "center" : "flex-end" }}>
      <View
        style={{
          backgroundColor: UI.card,
          width: isDesktopWeb ? 820 : "100%",
          maxHeight: isDesktopWeb ? "92%" : undefined,
          alignSelf: "center",
          borderRadius: isDesktopWeb ? 28 : 0,
          borderTopLeftRadius: 28,
          borderTopRightRadius: 28,
          padding: 18,
          paddingBottom: Math.max(insets.bottom, 24) + 24,
          gap: 12,
        }}
      >
        <Text style={{ color: UI.text, fontWeight: "900", fontSize: 22 }}>
          Edit Full Incoming Order
        </Text>

        <Input placeholder="Supplier name" value={editSupplierName} onChangeText={setEditSupplierName} />
        <Input placeholder="Source country" value={editSourceCountry} onChangeText={setEditSourceCountry} />
        <Input placeholder="Source city" value={editSourceCity} onChangeText={setEditSourceCity} />
        <Input placeholder="Destination" value={editDestinationName} onChangeText={setEditDestinationName} />
        <Input placeholder="Invoice number" value={editInvoiceNumber} onChangeText={setEditInvoiceNumber} />
        <Input placeholder="Tracking number" value={editTrackingNumber} onChangeText={setEditTrackingNumber} />
        <Input placeholder="Expected arrival date YYYY-MM-DD" value={editExpectedDate} onChangeText={setEditExpectedDate} />

        <TextInput
          placeholder="Order note"
          placeholderTextColor={UI.faint}
          value={editOrderNote}
          onChangeText={setEditOrderNote}
          multiline
          style={{
            borderWidth: 1,
            borderColor: UI.border,
            borderRadius: 16,
            paddingHorizontal: 14,
            paddingVertical: 14,
            minHeight: 90,
            color: UI.text,
            fontWeight: "800",
            backgroundColor: UI.background,
            textAlignVertical: "top",
          }}
        />

        <Card style={{ borderRadius: 18, gap: 10 }}>
          <Text style={{ color: UI.text, fontWeight: "900", fontSize: 16 }}>
            Add More Items
          </Text>

          <SuggestInput
            placeholder="Product / item name"
            value={editOrderItemName}
            onChangeText={(v) => {
              setEditOrderItemName(v);
              setShowEditProductSuggest(true);

              if (v.trim().length >= 2) {
                void loadSuggestions(v);
              }
            }}
            onFocus={() => setShowEditProductSuggest(true)}
          />

          {showEditProductSuggest && filteredEditProductSuggestions.length > 0 ? (
            <SuggestBox>
              {filteredEditProductSuggestions.map((p) => (
                <SuggestRow
                  key={p.id}
                  title={p.name || "Product"}
                  subtitle={`SKU: ${p.sku || "—"} • Barcode: ${p.barcode || "—"} • Cost: ${fmt(Number(p.cost_price || 0))} • Sell: ${fmt(Number(p.selling_price || 0))}`}
                  onPress={() => selectEditProductSuggestion(p)}
                />
              ))}
            </SuggestBox>
          ) : null}

          <View style={{ flexDirection: "row", gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Input placeholder="SKU optional" value={editOrderItemSku} onChangeText={setEditOrderItemSku} />
            </View>
            <View style={{ flex: 1 }}>
              <SuggestInput
                placeholder="Unit e.g. pcs"
                value={editOrderItemUnit}
                onChangeText={(v) => {
                  setEditOrderItemUnit(v);
                  setShowEditUnitSuggest(true);
                }}
                onFocus={() => setShowEditUnitSuggest(true)}
              />
            </View>
          </View>

          {showEditUnitSuggest && filteredEditUnitSuggestions.length > 0 ? (
            <SuggestBox>
              {filteredEditUnitSuggestions.map((unit) => (
                <SuggestRow
                  key={`edit-unit-${unit}`}
                  title={unit}
                  subtitle="Saved unit from previous products"
                  onPress={() => {
                    setEditOrderItemUnit(unit);
                    setShowEditUnitSuggest(false);
                  }}
                />
              ))}
            </SuggestBox>
          ) : null}

          <SuggestInput
            placeholder="Category optional"
            value={editOrderItemCategory}
            onChangeText={(v) => {
              setEditOrderItemCategory(v);
              setShowEditCategorySuggest(true);
            }}
            onFocus={() => setShowEditCategorySuggest(true)}
          />

          {showEditCategorySuggest && filteredEditCategorySuggestions.length > 0 ? (
            <SuggestBox>
              {filteredEditCategorySuggestions.map((category) => (
                <SuggestRow
                  key={`edit-category-${category}`}
                  title={category}
                  subtitle="Saved category from previous products"
                  onPress={() => {
                    setEditOrderItemCategory(category);
                    setShowEditCategorySuggest(false);
                  }}
                />
              ))}
            </SuggestBox>
          ) : null}
          <Input placeholder="Barcode optional" value={editOrderItemBarcode} onChangeText={setEditOrderItemBarcode} />

          <View style={{ flexDirection: "row", gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Input placeholder="Qty" value={editOrderItemQty} onChangeText={(t) => setEditOrderItemQty(normalizeDecimalInput(t))} />
            </View>
            <View style={{ flex: 1 }}>
              <Input placeholder="Cost/unit" value={editOrderItemCost} onChangeText={(t) => setEditOrderItemCost(normalizeDecimalInput(t))} />
            </View>
          </View>

          <Input
            placeholder="Selling price/unit optional"
            value={editOrderItemSelling}
            onChangeText={(t) => setEditOrderItemSelling(normalizeDecimalInput(t))}
          />

          <Button title="Add New Item" onPress={addEditNewItem} variant="secondary" />

          {editNewItems.length > 0 ? (
            <View style={{ gap: 8 }}>
              {editNewItems.map((x, i) => (
                <View
                  key={`${x.product_name}-${i}`}
                  style={{
                    borderWidth: 1,
                    borderColor: UI.border,
                    backgroundColor: UI.background,
                    borderRadius: 14,
                    padding: 10,
                  }}
                >
                  <Text style={{ color: UI.text, fontWeight: "900" }}>
                    {i + 1}. {x.product_name}
                  </Text>
                  <Text style={{ color: UI.muted, fontWeight: "800", marginTop: 4 }}>
                    Qty: {x.quantity} • Cost: {x.unit_cost || "0"} • Sell: {x.selling_price || "—"}
                  </Text>

                  <Pressable
                    onPress={() => setEditNewItems((prev) => prev.filter((_, idx) => idx !== i))}
                    style={{ alignSelf: "flex-start", marginTop: 8 }}
                  >
                    <Text style={{ color: UI.danger, fontWeight: "900" }}>Remove</Text>
                  </Pressable>
                </View>
              ))}
            </View>
          ) : null}
        </Card>

        <View style={{ flexDirection: "row", gap: 12 }}>
          <Pressable
            onPress={() => setFullEditOpen(false)}
            style={{
              flex: 1,
              height: 52,
              borderRadius: 18,
              borderWidth: 1,
              borderColor: UI.border,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text style={{ color: UI.text, fontWeight: "900" }}>Cancel</Text>
          </Pressable>

          <Pressable
            onPress={saveFullOrderEdit}
            disabled={savingFullEdit}
            style={{
              flex: 1,
              height: 52,
              borderRadius: 18,
              backgroundColor: UI.primary,
              alignItems: "center",
              justifyContent: "center",
              opacity: savingFullEdit ? 0.65 : 1,
            }}
          >
            <Text style={{ color: "#FFFFFF", fontWeight: "900" }}>
              {savingFullEdit ? "Saving..." : "Save Changes"}
            </Text>
          </Pressable>
        </View>
      </View>
    </ScrollView>
  </KeyboardAvoidingView>
</Modal>
<Modal
  visible={!!editingItem}
  transparent
  animationType="slide"
  onRequestClose={() => setEditingItem(null)}
>
  <KeyboardAvoidingView
    behavior={Platform.OS === "ios" ? "padding" : "height"}
    style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.70)", justifyContent: isDesktopWeb ? "center" : "flex-end" }}
  >
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1, justifyContent: isDesktopWeb ? "center" : "flex-end" }}>
      <View
        style={{
          backgroundColor: UI.card,
          width: isDesktopWeb ? 820 : "100%",
          maxHeight: isDesktopWeb ? "92%" : undefined,
          alignSelf: "center",
          borderRadius: isDesktopWeb ? 28 : 0,
          borderTopLeftRadius: 28,
          borderTopRightRadius: 28,
          padding: 18,
          paddingBottom: Math.max(insets.bottom, 24) + 24,
          gap: 12,
        }}
      >
        <Text style={{ color: UI.text, fontWeight: "900", fontSize: 22 }}>
          Edit Order Item
        </Text>

        <Input placeholder="Product / item name" value={editItemName} onChangeText={setEditItemName} />
        <Input placeholder="SKU optional" value={editItemSku} onChangeText={setEditItemSku} />
        <Input placeholder="Barcode optional" value={editItemBarcode} onChangeText={setEditItemBarcode} />
        <Input placeholder="Qty ordered" value={editItemQty} onChangeText={setEditItemQty} />
        <Input placeholder="Cost/unit" value={editItemCost} onChangeText={setEditItemCost} />
        <Input placeholder="Selling price/unit optional" value={editItemSelling} onChangeText={setEditItemSelling} />

        <TextInput
          placeholder="Note"
          placeholderTextColor={UI.faint}
          value={editItemNote}
          onChangeText={setEditItemNote}
          multiline
          style={{
            borderWidth: 1,
            borderColor: UI.border,
            borderRadius: 16,
            paddingHorizontal: 14,
            paddingVertical: 14,
            minHeight: 90,
            color: UI.text,
            fontWeight: "800",
            backgroundColor: UI.background,
            textAlignVertical: "top",
          }}
        />

        <View style={{ flexDirection: "row", gap: 12 }}>
          <Pressable
            onPress={() => setEditingItem(null)}
            style={({ pressed }) => ({
              flex: 1,
              height: 52,
              borderRadius: 18,
              borderWidth: 1,
              borderColor: pressed ? UI.primary : UI.border,
              alignItems: "center",
              justifyContent: "center",
              opacity: pressed ? 0.75 : 1,
              transform: [{ scale: pressed ? 0.97 : 1 }],
            })}
          >
            <Text style={{ color: UI.text, fontWeight: "900" }}>Cancel</Text>
          </Pressable>

          <Pressable
            onPress={saveEditItem}
            style={({ pressed }) => ({
              flex: 1,
              height: 52,
              borderRadius: 18,
              backgroundColor: UI.primary,
              alignItems: "center",
              justifyContent: "center",
              opacity: pressed ? 0.72 : 1,
              transform: [{ scale: pressed ? 0.97 : 1 }],
            })}
          >
            <Text style={{ color: "#FFFFFF", fontWeight: "900" }}>Save Edit</Text>
          </Pressable>
        </View>
      </View>
    </ScrollView>
  </KeyboardAvoidingView>
</Modal>
    </Screen>
  );
}

function SuggestBox({ children }: { children: React.ReactNode }) {
  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: UI.border,
        backgroundColor: UI.card,
        borderRadius: 16,
        overflow: "hidden",
      }}
    >
      {children}
    </View>
  );
}

function SuggestRow({
  title,
  subtitle,
  onPress,
}: {
  title: string;
  subtitle: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        paddingHorizontal: 14,
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: UI.border,
        backgroundColor: pressed ? UI.background : UI.card,
      })}
    >
      <Text style={{ color: UI.text, fontWeight: "900", fontSize: 14 }}>
        {title}
      </Text>
      <Text style={{ color: UI.muted, fontWeight: "800", marginTop: 4, fontSize: 12 }}>
        {subtitle}
      </Text>
    </Pressable>
  );
}

function SuggestInput({
  placeholder,
  value,
  onChangeText,
  onFocus,
}: {
  placeholder: string;
  value: string;
  onChangeText: (v: string) => void;
  onFocus: () => void;
}) {
  return (
    <TextInput
      placeholder={placeholder}
      placeholderTextColor={UI.faint}
      value={value}
      onChangeText={onChangeText}
      onFocus={onFocus}
      style={{
        borderWidth: 1,
        borderColor: UI.border,
        borderRadius: 16,
        paddingHorizontal: 14,
        height: 52,
        color: UI.text,
        fontWeight: "800",
        backgroundColor: UI.background,
      }}
    />
  );
}

function Mini({ label, value, desktop = false }: { label: string; value: string; desktop?: boolean }) {
  return (
    <View
      style={{
        flex: desktop ? undefined : 1,
        width: desktop ? "24%" : undefined,
        minWidth: desktop ? 180 : undefined,
        borderWidth: 1,
        borderColor: UI.border,
        backgroundColor: UI.background,
        borderRadius: 16,
        padding: 12,
        gap: 4,
      }}
    >
      <Text style={{ color: UI.faint, fontWeight: "900", fontSize: 11 }}>{label}</Text>
      <Text style={{ color: UI.text, fontWeight: "900", fontSize: 15 }} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

function Input({
  placeholder,
  value,
  onChangeText,
}: {
  placeholder: string;
  value: string;
  onChangeText: (v: string) => void;
}) {
  return (
    <TextInput
      placeholder={placeholder}
      placeholderTextColor={UI.faint}
      value={value}
      onChangeText={onChangeText}
      style={{
        borderWidth: 1,
        borderColor: UI.border,
        borderRadius: 16,
        paddingHorizontal: 14,
        height: 52,
        color: UI.text,
        fontWeight: "800",
        backgroundColor: UI.background,
      }}
    />
  );
}