import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
  Vibration,
} from "react-native";

import { useNetInfo } from "@react-native-community/netinfo";

import { useOrg } from "../../../src/context/OrgContext";
import { supabase } from "../../../src/supabase/supabaseClient";

import {
  loadSalesProductsCache,
  saveSalesProductsCache,
} from "../../../src/offline/salesProductsCache";
import { countPending } from "../../../src/offline/salesQueue";
import { syncSalesQueueOnce } from "../../../src/offline/salesSync";

import { Card } from "../../../src/ui/Card";
import { Input } from "../../../src/ui/Input";
import { PriceModal } from "../../../src/ui/PriceModal";
import { Screen } from "../../../src/ui/Screen";
import { theme } from "../../../src/ui/theme";

import { formatMoney, useOrgMoneyPrefs } from "@/src/ui/money";
import { subscribeScanBarcode } from "@/src/utils/scanBus";

/* =========================
   Types
========================= */
type ProductRow = {
  id: string;
  name: string;
  sku: string | null;
  unit: string | null;
  category: string | null;
  selling_price?: number | null;
  cost_price?: number | null;
  stock_qty?: number | null;
  barcode?: string | null;
};

type CartItem = {
  product_id: string;
  name: string;
  sku: string | null;
  qty: number;
  unit: string | null;
  unit_price: number;
  line_total: number;
};

type SalesRole = "owner" | "admin" | "staff" | "cashier";

type CashierHandoffStatus = "PENDING" | "ACCEPTED" | "COMPLETED" | string;

type CashierHandoffRow = {
  id: string;
  organization_id: string;
  store_id: string;
  store_name?: string | null;
  cashier_membership_id?: string | null;
  source_membership_id?: string | null;
  source_user_id?: string | null;
  items: any[] | null;
  subtotal: number | null;
  discount_amount: number | null;
  total: number | null;
  note: string | null;
  status: CashierHandoffStatus | null;
  sale_id?: string | null;
  accepted_at?: string | null;
  completed_at?: string | null;
  created_at: string | null;
  updated_at?: string | null;
  item_count?: number | null;
};

/* =========================
   Utils
========================= */
function clampQty(n: number) {
  if (!Number.isFinite(n)) return 1;
  return Math.max(1, Math.min(999999, Math.trunc(n)));
}

function parsePositiveNumber(raw: string): number | null {
  const x = Number(String(raw ?? "").trim());
  if (!Number.isFinite(x) || x <= 0) return null;
  return x;
}

function parsePositiveInt(raw: string): number | null {
  const x = Number(String(raw ?? "").trim());
  if (!Number.isFinite(x) || x <= 0) return null;
  return Math.trunc(x);
}

function fmtDateShort(d = new Date()) {
  try {
    return new Intl.DateTimeFormat("en-GB", {
      weekday: "short",
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(d);
  } catch {
    return d.toDateString();
  }
}

function cleanBarcode(raw: any) {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  return s.replace(/\s+/g, "");
}

function normalizeRole(role: unknown): SalesRole | "" {
  const r = String(role ?? "").trim().toLowerCase();
  if (r === "owner" || r === "admin" || r === "staff" || r === "cashier") return r;
  return "";
}

function normalizeHandoffs(rows: any[]): CashierHandoffRow[] {
  return (rows ?? []).map((r) => ({
    id: String(r?.id ?? "").trim(),
    organization_id: String(r?.organization_id ?? "").trim(),
    store_id: String(r?.store_id ?? "").trim(),
    store_name: r?.store_name ?? null,
    cashier_membership_id: r?.cashier_membership_id ?? null,
    source_membership_id: r?.source_membership_id ?? null,
    source_user_id: r?.source_user_id ?? null,
    items: Array.isArray(r?.items) ? r.items : [],
    subtotal: Number(r?.subtotal ?? 0),
    discount_amount: Number(r?.discount_amount ?? 0),
    total: Number(r?.total ?? 0),
    note: r?.note ?? null,
    status: String(r?.status ?? "").trim().toUpperCase() || null,
    sale_id: r?.sale_id ?? null,
    accepted_at: r?.accepted_at ?? null,
    completed_at: r?.completed_at ?? null,
    created_at: r?.created_at ?? null,
    updated_at: r?.updated_at ?? null,
    item_count: Number(r?.item_count ?? (Array.isArray(r?.items) ? r.items.length : 0)),
  }));
}

function fmtDateTimeLocal(input?: string | null) {
  if (!input) return "—";
  try {
    const d = new Date(input);
    return new Intl.DateTimeFormat("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(d);
  } catch {
    return String(input);
  }
}

/* =========================
   Screen
========================= */
export default function SalesHomeScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ barcode?: string; _ts?: string }>();

  const { activeOrgId, activeOrgName, activeStoreId, activeStoreName, activeRole } = useOrg();

  const netInfo = useNetInfo();
  const isOnline = !!(netInfo.isConnected && netInfo.isInternetReachable !== false);
  const isOffline = !isOnline;

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);

  const [source, setSource] = useState<"LIVE" | "CACHED" | "NONE">("NONE");
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [pendingCount, setPendingCount] = useState<number>(0);

  const [lastHandledParamScan, setLastHandledParamScan] = useState<string>("");

  const [recentScannedIds, setRecentScannedIds] = useState<string[]>([]);

  const [cashierFilter, setCashierFilter] = useState<
    "PENDING" | "ACCEPTED" | "COMPLETED" | "ALL"
  >("PENDING");
  const [cashierLoading, setCashierLoading] = useState(false);
  const [cashierRefreshing, setCashierRefreshing] = useState(false);
  const [cashierErr, setCashierErr] = useState<string | null>(null);
  const [cashierRows, setCashierRows] = useState<CashierHandoffRow[]>([]);

  const orgId = String(activeOrgId ?? "").trim();
  const money = useOrgMoneyPrefs(orgId);
  const displayCurrency = money.currency || "TZS";
  const displayLocale = money.locale || "en-TZ";

  const fmt = useCallback(
    (n: number) =>
      formatMoney(n, { currency: displayCurrency, locale: displayLocale }).replace(/\s+/g, " "),
    [displayCurrency, displayLocale]
  );

  const bumpRecent = useCallback((productId: string) => {
    if (!productId) return;
    setRecentScannedIds((prev) => {
      const next = [productId, ...prev.filter((x) => x !== productId)];
      return next.slice(0, 25);
    });
  }, []);

  const vibrateScan = useCallback(() => {
    try {
      Vibration.vibrate(12);
    } catch {}
  }, []);

  const currentRole = useMemo(() => normalizeRole(activeRole), [activeRole]);

  const isCashier = useMemo(() => currentRole === "cashier", [currentRole]);

  const canSellDirect = useMemo(() => {
    return currentRole === "owner" || currentRole === "admin" || currentRole === "staff";
  }, [currentRole]);

  const canUseCashierHandoff = useMemo(() => {
    return currentRole === "owner" || currentRole === "admin" || currentRole === "staff";
  }, [currentRole]);

  const isOwner = useMemo(() => currentRole === "owner", [currentRole]);

  /* =========================
     Cart summary
  ========================= */
  const cartCount = useMemo(() => cart.reduce((a, c) => a + (c.qty || 0), 0), [cart]);
  const cartTotalLines = useMemo(() => cart.length, [cart]);

  const cartTotalAmount = useMemo(
    () => cart.reduce((a, c) => a + Number(c.line_total || 0), 0),
    [cart]
  );

  /* =========================
     Price Modal State
  ========================= */
  const [priceModalOpen, setPriceModalOpen] = useState(false);
  const [selected, setSelected] = useState<ProductRow | null>(null);
  const [priceDraft, setPriceDraft] = useState("");
  const [qtyDraft, setQtyDraft] = useState("1");
  const [modalErr, setModalErr] = useState<string | null>(null);

  const openPriceModal = useCallback((p: ProductRow) => {
    setModalErr(null);
    setSelected(p);

    const sp = Number(p.selling_price ?? 0);
    setPriceDraft(sp > 0 ? String(Math.trunc(sp)) : "");

    setQtyDraft("1");
    setPriceModalOpen(true);
  }, []);

  const closePriceModal = useCallback(() => {
    setPriceModalOpen(false);
    setSelected(null);
    setPriceDraft("");
    setQtyDraft("1");
    setModalErr(null);
  }, []);

  const confirmAddWithPrice = useCallback(() => {
    if (!selected) return;

    const unitPrice = parsePositiveNumber(priceDraft);
    if (!unitPrice) {
      setModalErr("Weka bei sahihi (namba > 0).");
      return;
    }

    const cp = Number(selected.cost_price ?? NaN);
    if (Number.isFinite(cp) && unitPrice < cp) {
      setModalErr(`ASARA: Bei uliyoweka (${fmt(unitPrice)}) iko chini ya Cost (${fmt(cp)}).`);
      return;
    }

    const qn = clampQty(Number(qtyDraft));
    if (!Number.isFinite(qn) || qn <= 0) {
      setModalErr("Weka quantity sahihi.");
      return;
    }

    setCart((prev) => {
      const idx = prev.findIndex((x) => x.product_id === selected.id);

      if (idx >= 0) {
        const existing = prev[idx];
        const nextQty = clampQty(existing.qty + qn);

        const next = [...prev];
        next[idx] = {
          ...existing,
          qty: nextQty,
          line_total: Number(existing.unit_price) * nextQty,
        };
        return next;
      }

      return [
        ...prev,
        {
          product_id: selected.id,
          name: selected.name,
          sku: selected.sku ?? null,
          qty: qn,
          unit: selected.unit ?? null,
          unit_price: unitPrice,
          line_total: unitPrice * qn,
        },
      ];
    });

    bumpRecent(selected.id);
    closePriceModal();
  }, [bumpRecent, closePriceModal, fmt, priceDraft, qtyDraft, selected]);

  /* =========================
     Cart Helpers
  ========================= */
  const addAuto = useCallback(
    (p: ProductRow) => {
      const spRaw = Number(p.selling_price ?? 0);
      const sp = Math.trunc(spRaw);

      if (!Number.isFinite(sp) || sp <= 0) {
        openPriceModal(p);
        return;
      }

      setCart((prev) => {
        const idx = prev.findIndex((x) => x.product_id === p.id);
        if (idx >= 0) {
          const existing = prev[idx];
          const nextQty = clampQty(existing.qty + 1);
          const next = [...prev];
          next[idx] = {
            ...existing,
            qty: nextQty,
            line_total: Number(existing.unit_price) * nextQty,
          };
          return next;
        }

        return [
          ...prev,
          {
            product_id: p.id,
            name: p.name,
            sku: p.sku ?? null,
            qty: 1,
            unit: p.unit ?? null,
            unit_price: sp,
            line_total: sp * 1,
          },
        ];
      });

      bumpRecent(p.id);
    },
    [bumpRecent, openPriceModal]
  );

  const inc = useCallback(
    (productId: string) => {
      setCart((prev) =>
        prev.map((x) => {
          if (x.product_id !== productId) return x;
          const nextQty = clampQty(x.qty + 1);
          return { ...x, qty: nextQty, line_total: Number(x.unit_price) * nextQty };
        })
      );
      bumpRecent(productId);
    },
    [bumpRecent]
  );

  const dec = useCallback((productId: string) => {
    setCart((prev) =>
      prev
        .map((x) => {
          if (x.product_id !== productId) return x;
          const nextQty = x.qty - 1;
          return {
            ...x,
            qty: nextQty,
            line_total: Number(x.unit_price) * Math.max(nextQty, 0),
          };
        })
        .filter((x) => x.qty > 0)
    );
  }, []);

  const clearCart = useCallback(() => setCart([]), []);
  const removeItem = useCallback((productId: string) => {
    setCart((prev) => prev.filter((x) => x.product_id !== productId));
  }, []);

  /* =========================
     Qty editor modal
  ========================= */
  const [qtyEditorOpen, setQtyEditorOpen] = useState(false);
  const [qtyEditorProductId, setQtyEditorProductId] = useState<string | null>(null);
  const [qtyEditorName, setQtyEditorName] = useState<string>("");
  const [qtyEditorDraft, setQtyEditorDraft] = useState<string>("");
  const [qtyEditorErr, setQtyEditorErr] = useState<string | null>(null);

  const openQtyEditor = useCallback(
    (item: CartItem) => {
      setQtyEditorErr(null);
      setQtyEditorProductId(item.product_id);
      setQtyEditorName(item.name ?? "Product");
      setQtyEditorDraft(String(Math.trunc(Number(item.qty ?? 1))));
      setQtyEditorOpen(true);
      bumpRecent(item.product_id);
    },
    [bumpRecent]
  );

  const closeQtyEditor = useCallback(() => {
    Keyboard.dismiss();
    setQtyEditorOpen(false);
    setQtyEditorProductId(null);
    setQtyEditorName("");
    setQtyEditorDraft("");
    setQtyEditorErr(null);
  }, []);

  const confirmQtyEditor = useCallback(() => {
    if (!qtyEditorProductId) return;

    const q = parsePositiveInt(qtyEditorDraft);
    if (!q) {
      setQtyEditorErr("Weka quantity sahihi (namba > 0).");
      return;
    }

    const nextQty = clampQty(q);

    setCart((prev) =>
      prev.map((x) => {
        if (x.product_id !== qtyEditorProductId) return x;
        return {
          ...x,
          qty: nextQty,
          line_total: Number(x.unit_price) * nextQty,
        };
      })
    );

    bumpRecent(qtyEditorProductId);
    closeQtyEditor();
  }, [bumpRecent, closeQtyEditor, qtyEditorDraft, qtyEditorProductId]);

  const removeFromQtyEditor = useCallback(() => {
    if (!qtyEditorProductId) return;
    removeItem(qtyEditorProductId);
    closeQtyEditor();
  }, [closeQtyEditor, qtyEditorProductId, removeItem]);

  /* =========================
     Load STORE-SCOPED sale items
  ========================= */
  const loadProducts = useCallback(
    async (mode: "boot" | "refresh") => {
      setErr(null);
      if (mode === "boot") setLoading(true);
      if (mode === "refresh") setRefreshing(true);

      try {
        if (isCashier) {
          setProducts([]);
          setSource("NONE");
          setLastSync(null);
          return;
        }

        if (!activeStoreId) {
          setProducts([]);
          setErr("No active store selected.");
          setSource("NONE");
          setLastSync(null);
          return;
        }

        try {
          const cached = await loadSalesProductsCache(activeStoreId);
          if (cached.rows.length > 0) {
            setProducts(cached.rows as any);
            setSource("CACHED");
            setLastSync(cached.lastSync);
          }
        } catch {}

        if (isOffline) return;

        const { data, error } = await supabase.rpc("get_store_sale_items", {
          p_store_id: activeStoreId,
        });
        if (error) throw error;

        const rows = (data ?? []) as Array<{
          product_id: string;
          name: string | null;
          sku: string | null;
          category: string | null;
          unit: string | null;
          selling_price: number | null;
          cost_price: number | null;
          qty: number | null;
          barcode?: string | null;
        }>;

        const list: ProductRow[] = rows.map((r) => ({
          id: r.product_id,
          name: (r.name ?? "").trim() || "Product",
          sku: r.sku ?? null,
          category: r.category ?? null,
          unit: r.unit ?? null,
          selling_price: r.selling_price ?? null,
          cost_price: r.cost_price ?? null,
          stock_qty: r.qty ?? null,
          barcode: (r as any).barcode ?? null,
        }));

        list.sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
        setProducts(list);

        try {
          const syncIso = await saveSalesProductsCache(activeStoreId, list as any);
          setSource("LIVE");
          setLastSync(syncIso);
        } catch {
          setSource("LIVE");
        }
      } catch (e: any) {
        setErr(e?.message ?? "Failed to load products");
        if (products.length === 0) {
          setProducts([]);
          setSource("NONE");
        }
      } finally {
        if (mode === "boot") setLoading(false);
        if (mode === "refresh") setRefreshing(false);
      }
    },
    [activeStoreId, isCashier, isOffline, products.length]
  );

  const loadCashierHandoffs = useCallback(
    async (mode: "boot" | "refresh" = "boot") => {
      if (!isCashier) return;

      setCashierErr(null);
      if (mode === "boot") setCashierLoading(true);
      if (mode === "refresh") setCashierRefreshing(true);

      try {
        const statusParam = cashierFilter === "ALL" ? null : cashierFilter;

        const { data, error } = await supabase.rpc("get_my_cashier_handoffs_v2", {
          p_status: statusParam,
        });

        if (error) throw error;

        setCashierRows(normalizeHandoffs((data ?? []) as any[]));
      } catch (e: any) {
        setCashierErr(e?.message ?? "Failed to load cashier queue");
        setCashierRows([]);
      } finally {
        if (mode === "boot") setCashierLoading(false);
        if (mode === "refresh") setCashierRefreshing(false);
      }
    },
    [cashierFilter, isCashier]
  );

  useEffect(() => {
    setCart([]);
    setQuery("");
    setRecentScannedIds([]);

    if (isCashier) {
      void loadCashierHandoffs("boot");
      return;
    }

    void loadProducts("boot");
  }, [activeStoreId, isCashier, loadProducts, loadCashierHandoffs]);

  useEffect(() => {
    if (!activeStoreId) return;
    if (isOffline) return;
    if (isCashier) return;

    void (async () => {
      try {
        await syncSalesQueueOnce(activeStoreId);
      } catch {
        // no-op
      } finally {
        const n = await countPending(activeStoreId);
        setPendingCount(n);
      }
    })();
  }, [activeStoreId, isCashier, isOffline]);

  useEffect(() => {
    if (!activeStoreId) return;
    if (isCashier) return;

    void (async () => {
      const n = await countPending(activeStoreId);
      setPendingCount(n);
    })();
  }, [activeStoreId, isCashier, isOnline]);

  useEffect(() => {
    if (!isCashier) return;
    void loadCashierHandoffs("boot");
  }, [isCashier, cashierFilter, loadCashierHandoffs]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();

    const base = !q
      ? products
      : products.filter((p) => {
          const name = (p.name ?? "").toLowerCase();
          const sku = (p.sku ?? "").toLowerCase();
          const cat = (p.category ?? "").toLowerCase();
          const bc = (p.barcode ?? "").toLowerCase();
          return name.includes(q) || sku.includes(q) || cat.includes(q) || bc.includes(q);
        });

    if (!recentScannedIds.length) return base;

    const rank = new Map<string, number>();
    recentScannedIds.forEach((id, idx) => rank.set(id, idx));

    const copy = [...base];
    copy.sort((a, b) => {
      const ra = rank.has(a.id) ? (rank.get(a.id) as number) : 999999;
      const rb = rank.has(b.id) ? (rank.get(b.id) as number) : 999999;
      if (ra !== rb) return ra - rb;
      return (a.name ?? "").localeCompare(b.name ?? "");
    });

    return copy;
  }, [products, query, recentScannedIds]);

  /* =========================
     Barcode handler
  ========================= */
  const handleBarcode = useCallback(
    (rawInput: any) => {
      if (isCashier) {
        setErr("Cashier role haitumii product-picking screen.");
        return;
      }

      const raw = cleanBarcode(rawInput);
      if (!raw) return;

      if (!activeStoreId) {
        setErr("No active store selected.");
        return;
      }

      const localTarget =
        products.find((p) => cleanBarcode(p.barcode) === raw) ||
        products.find((p) => cleanBarcode(p.sku) === raw);

      if (localTarget) {
        setErr(null);
        bumpRecent(localTarget.id);
        addAuto(localTarget);
        vibrateScan();
        return;
      }

      if (isOffline) {
        setErr(`OFFLINE: Barcode haipo kwenye cache: ${raw}`);
        return;
      }

      void (async () => {
        try {
          const { data, error } = await supabase.rpc("get_store_sale_item_by_barcode", {
            p_store_id: activeStoreId,
            p_barcode: raw,
          });
          if (error) throw error;

          const row = Array.isArray(data) ? data[0] : null;
          if (!row) {
            setErr(`Barcode haijapatikana: ${raw}`);
            return;
          }

          const p: ProductRow = {
            id: row.product_id,
            name: String(row.name ?? "Product").trim() || "Product",
            sku: row.sku ?? null,
            category: row.category ?? null,
            unit: row.unit ?? null,
            selling_price: row.selling_price ?? null,
            cost_price: row.cost_price ?? null,
            stock_qty: row.qty ?? null,
            barcode: raw,
          };

          setProducts((prev) => {
            if (prev.some((x) => x.id === p.id)) return prev;
            const next = [...prev, p];
            next.sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
            return next;
          });

          setErr(null);
          bumpRecent(p.id);
          addAuto(p);
          vibrateScan();
        } catch (e: any) {
          setErr(e?.message ?? `Failed to fetch barcode item: ${raw}`);
        }
      })();
    },
    [activeStoreId, addAuto, bumpRecent, isCashier, isOffline, products, vibrateScan]
  );

  useEffect(() => {
    const unsub = subscribeScanBarcode((barcode) => {
      handleBarcode(barcode);
    });
    return unsub;
  }, [handleBarcode]);

  useEffect(() => {
    const raw = cleanBarcode(params?.barcode);
    if (!raw) return;

    const key = `${activeStoreId ?? "no-store"}::${raw}::${String(params?._ts ?? "")}`;
    if (key === lastHandledParamScan) return;
    setLastHandledParamScan(key);

    handleBarcode(raw);
  }, [activeStoreId, handleBarcode, lastHandledParamScan, params?._ts, params?.barcode]);

  /* =========================
     Navigation
  ========================= */
  const goCheckout = useCallback(() => {
    setErr(null);

    if (!activeStoreId) return setErr("No active store selected.");
    if (!canSellDirect) return setErr("No permission to sell directly.");
    if (cart.length === 0) return setErr("Cart is empty.");

    if (cart.some((c) => !Number.isFinite(c.unit_price) || c.unit_price <= 0)) {
      return setErr("Kuna bidhaa kwenye cart haina bei sahihi.");
    }

    const payload = encodeURIComponent(JSON.stringify(cart));
    router.push({
      pathname: "/(tabs)/sales/checkout",
      params: {
        storeId: activeStoreId,
        storeName: activeStoreName ?? "",
        cart: payload,
      },
    });

    setCart([]);
  }, [activeStoreId, activeStoreName, canSellDirect, cart, router]);

  const goCashierCheckout = useCallback(() => {
    setErr(null);

    if (!activeStoreId) return setErr("No active store selected.");
    if (!canUseCashierHandoff) return setErr("No permission to send order to cashiers.");
    if (cart.length === 0) return setErr("Cart is empty.");

    if (cart.some((c) => !Number.isFinite(c.unit_price) || c.unit_price <= 0)) {
      return setErr("Kuna bidhaa kwenye cart haina bei sahihi.");
    }

    const payload = encodeURIComponent(JSON.stringify(cart));
    router.push({
      pathname: "/(tabs)/sales/checkout",
      params: {
        storeId: activeStoreId,
        storeName: activeStoreName ?? "",
        cart: payload,
        cashierMode: "1",
      },
    });

    setCart([]);
  }, [activeStoreId, activeStoreName, canUseCashierHandoff, cart, router]);

  const goScan = useCallback(() => {
    setErr(null);
    if (!activeStoreId) return setErr("No active store selected.");
    if (!canSellDirect) return setErr("Huna ruhusa ya kuuza.");
    if (isCashier) return setErr("Cashier role haitumii scan ya product-picking.");
    router.push("/(tabs)/sales/scan");
  }, [activeStoreId, canSellDirect, isCashier, router]);

  const goHandoffDetail = useCallback(
    (handoffId: string) => {
      const id = String(handoffId ?? "").trim();
      if (!id) return;

      router.push({
        pathname: "/(tabs)/sales/[handoffId]",
        params: { handoffId: id },
      } as any);
    },
    [router]
  );

  /* =========================
     Derived display helpers
  ========================= */
  const todayLabel = useMemo(() => fmtDateShort(new Date()), []);

  const headerSubtitle = useMemo(() => {
    const org = activeOrgName ?? "—";
    const store = activeStoreName ?? "—";
    const role = activeRole ?? "—";
    return `${org} • ${store} • ${role}`;
  }, [activeOrgName, activeStoreName, activeRole]);

  const headerBlockedReason = useMemo(() => {
    if (isCashier) {
      return "Cashier role hupokea handoff na kukamilisha malipo tu. Product picking haipo kwenye screen hii.";
    }
    if (!canSellDirect) return "Huna ruhusa ya kuuza. (Owner/Admin/Staff only)";
    return null;
  }, [canSellDirect, isCashier]);

  const checkoutDisabled = useMemo(() => {
    return !activeStoreId || cart.length === 0 || !canSellDirect || isCashier;
  }, [activeStoreId, cart.length, canSellDirect, isCashier]);

  const cashierDisabled = useMemo(() => {
    return !activeStoreId || cart.length === 0 || !canUseCashierHandoff || isCashier;
  }, [activeStoreId, cart.length, canUseCashierHandoff, isCashier]);

  const getStockQty = useCallback((p: ProductRow): number | null => {
    const n = Number(p.stock_qty);
    return Number.isFinite(n) ? Math.trunc(n) : null;
  }, []);

  const statusLine = useMemo(() => {
    const net = isOffline ? "OFFLINE" : "ONLINE";
    const src = isOffline ? "CACHED" : source;
    const pend = pendingCount > 0 ? ` • Pending: ${pendingCount}` : "";
    const sync = ` • Last sync: ${lastSync ?? "—"}`;
    return `${net} • Source: ${src}${sync}${pend}`;
  }, [isOffline, lastSync, pendingCount, source]);

  const cashierCounts = useMemo(() => {
    const out = { pending: 0, accepted: 0, completed: 0, all: cashierRows.length };

    for (const r of cashierRows) {
      const s = String(r.status ?? "").toUpperCase();
      if (s === "PENDING") out.pending += 1;
      else if (s === "ACCEPTED") out.accepted += 1;
      else if (s === "COMPLETED") out.completed += 1;
    }

    return out;
  }, [cashierRows]);

  const cashierTotalAmount = useMemo(
    () => cashierRows.reduce((a, r) => a + Number(r.total ?? 0), 0),
    [cashierRows]
  );

  const CashierFilterChip = ({
    label,
    value,
  }: {
    label: string;
    value: "PENDING" | "ACCEPTED" | "COMPLETED" | "ALL";
  }) => {
    const active = cashierFilter === value;

    return (
      <Pressable
        onPress={() => setCashierFilter(value)}
        style={({ pressed }) => ({
          paddingVertical: 10,
          paddingHorizontal: 14,
          borderRadius: theme.radius.pill,
          borderWidth: 1,
          borderColor: active ? theme.colors.emeraldBorder : theme.colors.border,
          backgroundColor: active ? theme.colors.emeraldSoft : "rgba(255,255,255,0.06)",
          opacity: pressed ? 0.92 : 1,
        })}
      >
        <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 13 }}>
          {label}
        </Text>
      </Pressable>
    );
  };

  /* =========================
     UI Sections
  ========================= */
  const TopBar = useMemo(() => {
    return (
      <View style={{ gap: 6 }}>
        <View style={{ flexDirection: "row", alignItems: "flex-end" }}>
          <Text style={{ fontSize: 26, fontWeight: "900", color: theme.colors.text }}>Sales</Text>
        </View>

        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
          }}
        >
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ color: theme.colors.muted, fontWeight: "800", fontSize: 12 }}>
              {headerSubtitle}
            </Text>
            <Text style={{ color: theme.colors.faint, fontWeight: "800", fontSize: 12 }}>
              {todayLabel}
            </Text>

            <Text style={{ color: theme.colors.muted, fontWeight: "800", fontSize: 12 }}>
              {statusLine}
            </Text>
          </View>

          <View style={{ flexDirection: "row", gap: 8 }}>
            <Pressable
              onPress={() => router.push("/(tabs)/sales/expenses")}
              hitSlop={10}
              style={{
                width: 40,
                height: 40,
                borderRadius: 999,
                alignItems: "center",
                justifyContent: "center",
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.10)",
                backgroundColor: "rgba(255,255,255,0.06)",
              }}
            >
              <Ionicons name="cash-outline" size={19} color={theme.colors.text} />
            </Pressable>

            {isOwner && (
              <Pressable
                onPress={() => router.push("/(tabs)/sales/profit")}
                hitSlop={10}
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 999,
                  alignItems: "center",
                  justifyContent: "center",
                  borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.10)",
                  backgroundColor: "rgba(255,255,255,0.06)",
                }}
              >
                <Ionicons name="stats-chart" size={19} color={theme.colors.text} />
              </Pressable>
            )}

            <Pressable
              onPress={() => router.push("/(tabs)/sales/history")}
              hitSlop={10}
              style={{
                width: 40,
                height: 40,
                borderRadius: 999,
                alignItems: "center",
                justifyContent: "center",
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.10)",
                backgroundColor: "rgba(255,255,255,0.06)",
              }}
            >
              <Ionicons name="time-outline" size={19} color={theme.colors.text} />
            </Pressable>
          </View>
        </View>
      </View>
    );
  }, [headerSubtitle, isOwner, router, statusLine, todayLabel]);

  const QuickBar = useMemo(() => {
    return (
      <Card style={{ gap: 10, padding: 12 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 10 }}>
          <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 15 }}>
            {cartTotalLines} items • {cartCount} qty
          </Text>

          <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 15 }}>
            {fmt(cartTotalAmount)}
          </Text>
        </View>

        {!!err && <Text style={{ color: theme.colors.danger, fontWeight: "900" }}>{err}</Text>}

        {!!headerBlockedReason && (
          <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>{headerBlockedReason}</Text>
        )}

        <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
          <Pressable
            onPress={goCheckout}
            disabled={checkoutDisabled}
            style={({ pressed }) => [
              {
                paddingVertical: 12,
                paddingHorizontal: 16,
                borderRadius: theme.radius.pill,
                borderWidth: 1,
                borderColor: checkoutDisabled
                  ? "rgba(255,255,255,0.10)"
                  : theme.colors.emeraldBorder,
                backgroundColor: checkoutDisabled
                  ? "rgba(255,255,255,0.05)"
                  : theme.colors.emeraldSoft,
                alignItems: "center",
                justifyContent: "center",
                opacity: checkoutDisabled ? 0.55 : pressed ? 0.92 : 1,
                transform: pressed ? [{ scale: 0.995 }] : [{ scale: 1 }],
                shadowColor: "#000",
                shadowOpacity: checkoutDisabled ? 0 : 0.25,
                shadowRadius: 10,
                shadowOffset: { width: 0, height: 6 },
                elevation: checkoutDisabled ? 0 : 8,
                flexDirection: "row",
                gap: 8,
                flex: 1,
              },
            ]}
          >
            <Ionicons name="shield-checkmark-outline" size={16} color={theme.colors.text} />
            <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 14 }}>
              Complete Sale
            </Text>
          </Pressable>

          {!isCashier ? (
            <Pressable
              onPress={goCashierCheckout}
              disabled={cashierDisabled}
              style={({ pressed }) => [
                {
                  paddingVertical: 12,
                  paddingHorizontal: 16,
                  borderRadius: theme.radius.pill,
                  borderWidth: 1,
                  borderColor: cashierDisabled
                    ? "rgba(255,255,255,0.10)"
                    : theme.colors.emeraldBorder,
                  backgroundColor: cashierDisabled
                    ? "rgba(255,255,255,0.05)"
                    : "rgba(16,185,129,0.10)",
                  alignItems: "center",
                  justifyContent: "center",
                  opacity: cashierDisabled ? 0.55 : pressed ? 0.92 : 1,
                  transform: pressed ? [{ scale: 0.995 }] : [{ scale: 1 }],
                  flexDirection: "row",
                  gap: 8,
                  flex: 1,
                },
              ]}
            >
              <Ionicons name="wallet-outline" size={16} color={theme.colors.text} />
              <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 14 }}>
                Cashiers
              </Text>
            </Pressable>
          ) : null}

          <Pressable
            onPress={goScan}
            disabled={!activeStoreId || !canSellDirect || isCashier}
            style={({ pressed }) => [
              {
                width: 58,
                height: 58,
                borderRadius: 999,
                alignItems: "center",
                justifyContent: "center",
                borderWidth: 1,
                borderColor: theme.colors.emeraldBorder,
                backgroundColor: theme.colors.emeraldSoft,
                opacity: !activeStoreId || !canSellDirect || isCashier ? 0.5 : pressed ? 0.92 : 1,
                transform: pressed ? [{ scale: 0.995 }] : [{ scale: 1 }],
                shadowColor: "#000",
                shadowOpacity: !activeStoreId || !canSellDirect || isCashier ? 0 : 0.25,
                shadowRadius: 10,
                shadowOffset: { width: 0, height: 6 },
                elevation: !activeStoreId || !canSellDirect || isCashier ? 0 : 8,
              },
            ]}
            hitSlop={10}
          >
            <Ionicons name="barcode-outline" size={26} color={theme.colors.text} />
          </Pressable>

          <Pressable
            onPress={clearCart}
            disabled={cart.length === 0}
            style={({ pressed }) => [
              {
                paddingVertical: 12,
                paddingHorizontal: 14,
                borderRadius: theme.radius.pill,
                borderWidth: 1,
                borderColor: theme.colors.border,
                backgroundColor:
                  cart.length === 0 ? "rgba(255,255,255,0.03)" : "rgba(255,255,255,0.06)",
                opacity: cart.length === 0 ? 0.5 : pressed ? 0.92 : 1,
                transform: pressed ? [{ scale: 0.995 }] : [{ scale: 1 }],
                alignItems: "center",
                justifyContent: "center",
              },
            ]}
          >
            <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 14 }}>Clear</Text>
          </Pressable>
        </View>

        {!isCashier ? (
          <View style={{ width: "100%" }}>
            <Input
              value={query}
              onChangeText={setQuery}
              placeholder="Search name / SKU / category / barcode..."
            />
          </View>
        ) : null}

        {loading && !isCashier && (
          <Text style={{ color: theme.colors.muted, fontWeight: "800", marginTop: 2 }}>
            Loading products...
          </Text>
        )}
      </Card>
    );
  }, [
    activeStoreId,
    canSellDirect,
    cart.length,
    cartCount,
    cartTotalAmount,
    cartTotalLines,
    cashierDisabled,
    checkoutDisabled,
    clearCart,
    err,
    fmt,
    goCashierCheckout,
    goCheckout,
    goScan,
    headerBlockedReason,
    isCashier,
    loading,
    query,
  ]);

  const CashierBar = useMemo(() => {
    if (!isCashier) return null;

    return (
      <Card style={{ gap: 12, padding: 12 }}>
        <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 16 }}>
          Cashier Queue
        </Text>

        <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>
          Hapa cashier anaona orders zilizotumwa kwenye cashier queue ya stores alizoassigniwa.
        </Text>

        {!!cashierErr && (
          <Text style={{ color: theme.colors.danger, fontWeight: "900" }}>{cashierErr}</Text>
        )}

        <View style={{ flexDirection: "row", gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>Pending</Text>
            <Text style={{ color: theme.colors.text, fontWeight: "900", marginTop: 4 }}>
              {cashierCounts.pending}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>Accepted</Text>
            <Text style={{ color: theme.colors.text, fontWeight: "900", marginTop: 4 }}>
              {cashierCounts.accepted}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>Completed</Text>
            <Text style={{ color: theme.colors.text, fontWeight: "900", marginTop: 4 }}>
              {cashierCounts.completed}
            </Text>
          </View>
        </View>

        <View
          style={{
            borderWidth: 1,
            borderColor: theme.colors.emeraldBorder,
            backgroundColor: theme.colors.emeraldSoft,
            borderRadius: 16,
            padding: 12,
          }}
        >
          <Text style={{ color: theme.colors.text, fontWeight: "900" }}>
            Queue Total: {fmt(cashierTotalAmount)}
          </Text>
        </View>

        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
          <CashierFilterChip label={`Pending (${cashierCounts.pending})`} value="PENDING" />
          <CashierFilterChip label={`Accepted (${cashierCounts.accepted})`} value="ACCEPTED" />
          <CashierFilterChip label={`Completed (${cashierCounts.completed})`} value="COMPLETED" />
          <CashierFilterChip label={`All (${cashierCounts.all})`} value="ALL" />
        </View>

        <Pressable
          onPress={() => void loadCashierHandoffs("refresh")}
          style={({ pressed }) => ({
            paddingVertical: 12,
            borderRadius: theme.radius.pill,
            borderWidth: 1,
            borderColor: theme.colors.border,
            backgroundColor: "rgba(255,255,255,0.06)",
            alignItems: "center",
            opacity: pressed ? 0.92 : 1,
          })}
        >
          <Text style={{ color: theme.colors.text, fontWeight: "900" }}>
            {cashierLoading || cashierRefreshing ? "Refreshing..." : "Refresh Queue"}
          </Text>
        </Pressable>
      </Card>
    );
  }, [
    isCashier,
    cashierErr,
    cashierCounts,
    cashierTotalAmount,
    fmt,
    cashierLoading,
    cashierRefreshing,
    loadCashierHandoffs,
  ]);

  const renderItem = useCallback(
    ({ item }: { item: ProductRow }) => {
      const inCart = cart.find((c) => c.product_id === item.id);
      const qty = inCart?.qty ?? 0;

      const stockQty = getStockQty(item);
      const stockLabel =
        stockQty === null ? null : stockQty <= 0 ? "Out of stock" : `Stock: ${stockQty}`;

      return (
        <Card style={{ marginBottom: 10, gap: 8, padding: 14 }}>
          <View style={{ gap: 4 }}>
            <Text
              style={{ color: theme.colors.text, fontWeight: "900", fontSize: 16 }}
              numberOfLines={1}
            >
              {item.name}
            </Text>

            <Text style={{ color: theme.colors.muted, fontWeight: "800" }} numberOfLines={1}>
              SKU: {item.sku ?? "—"}
              {item.category ? `  •  ${item.category}` : ""}
              {item.barcode ? `  •  ${item.barcode}` : ""}
            </Text>

            {!!stockLabel && (
              <Text
                style={{
                  color: stockQty && stockQty > 0 ? theme.colors.faint : theme.colors.muted,
                  fontWeight: "800",
                }}
              >
                {stockLabel}
              </Text>
            )}

            {qty > 0 && (
              <Text style={{ color: theme.colors.muted, fontWeight: "900" }} numberOfLines={1}>
                Price:{" "}
                <Text style={{ color: theme.colors.text }}>{fmt(Number(inCart?.unit_price ?? 0))}</Text>
                {" • "}
                Line:{" "}
                <Text style={{ color: theme.colors.text }}>{fmt(Number(inCart?.line_total ?? 0))}</Text>
              </Text>
            )}
          </View>

          {qty <= 0 ? (
            <Pressable
              onPress={() => addAuto(item)}
              onLongPress={() => openPriceModal(item)}
              style={({ pressed }) => [
                {
                  paddingVertical: 11,
                  borderRadius: theme.radius.pill,
                  borderWidth: 1,
                  borderColor: theme.colors.emeraldBorder,
                  backgroundColor: theme.colors.emeraldSoft,
                  alignItems: "center",
                  opacity: pressed ? 0.92 : 1,
                  transform: pressed ? [{ scale: 0.995 }] : [{ scale: 1 }],
                },
              ]}
            >
              <Text style={{ color: theme.colors.text, fontWeight: "900" }}>Add</Text>
            </Pressable>
          ) : (
            <View style={{ gap: 10 }}>
              <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
                <Pressable
                  onPress={() => dec(item.id)}
                  style={({ pressed }) => [
                    {
                      flex: 1,
                      paddingVertical: 11,
                      borderRadius: theme.radius.pill,
                      borderWidth: 1,
                      borderColor: theme.colors.border,
                      backgroundColor: "rgba(255,255,255,0.06)",
                      alignItems: "center",
                      opacity: pressed ? 0.92 : 1,
                      transform: pressed ? [{ scale: 0.995 }] : [{ scale: 1 }],
                    },
                  ]}
                >
                  <Text style={{ color: theme.colors.text, fontWeight: "900" }}>−</Text>
                </Pressable>

                <Pressable
                  onPress={() => openQtyEditor(inCart as CartItem)}
                  hitSlop={10}
                  style={({ pressed }) => [
                    {
                      minWidth: 66,
                      paddingVertical: 11,
                      borderRadius: theme.radius.pill,
                      borderWidth: 1,
                      borderColor: theme.colors.emeraldBorder,
                      backgroundColor: "rgba(16,185,129,0.10)",
                      alignItems: "center",
                      justifyContent: "center",
                      paddingHorizontal: 14,
                      opacity: pressed ? 0.92 : 1,
                      transform: pressed ? [{ scale: 0.995 }] : [{ scale: 1 }],
                    },
                  ]}
                >
                  <Text style={{ color: theme.colors.text, fontWeight: "900" }}>{qty}</Text>
                </Pressable>

                <Pressable
                  onPress={() => inc(item.id)}
                  style={({ pressed }) => [
                    {
                      flex: 1,
                      paddingVertical: 11,
                      borderRadius: theme.radius.pill,
                      borderWidth: 1,
                      borderColor: theme.colors.emeraldBorder,
                      backgroundColor: theme.colors.emeraldSoft,
                      alignItems: "center",
                      opacity: pressed ? 0.92 : 1,
                      transform: pressed ? [{ scale: 0.995 }] : [{ scale: 1 }],
                    },
                  ]}
                >
                  <Text style={{ color: theme.colors.text, fontWeight: "900" }}>+</Text>
                </Pressable>

                <Pressable
                  onPress={() => removeItem(item.id)}
                  hitSlop={10}
                  style={({ pressed }) => [
                    {
                      paddingVertical: 11,
                      paddingHorizontal: 14,
                      borderRadius: theme.radius.pill,
                      borderWidth: 1,
                      borderColor: theme.colors.border,
                      backgroundColor: "rgba(255,255,255,0.06)",
                      alignItems: "center",
                      justifyContent: "center",
                      opacity: pressed ? 0.92 : 1,
                      transform: pressed ? [{ scale: 0.995 }] : [{ scale: 1 }],
                    },
                  ]}
                >
                  <Text style={{ color: theme.colors.text, fontWeight: "900" }}>Remove</Text>
                </Pressable>
              </View>
            </View>
          )}
        </Card>
      );
    },
    [addAuto, cart, dec, fmt, getStockQty, inc, openPriceModal, openQtyEditor, removeItem]
  );

  const renderCashierItem = useCallback(
    ({ item }: { item: CashierHandoffRow }) => {
      const itemsCount = Number(
        item.item_count ?? (Array.isArray(item.items) ? item.items.length : 0)
      );
      const status = String(item.status ?? "—").toUpperCase();
      const createdAt = fmtDateTimeLocal(item.created_at);
      const acceptedAt = fmtDateTimeLocal(item.accepted_at);
      const completedAt = fmtDateTimeLocal(item.completed_at);

      return (
        <Pressable
          onPress={() => goHandoffDetail(item.id)}
          style={({ pressed }) => ({
            opacity: pressed ? 0.96 : 1,
            transform: pressed ? [{ scale: 0.997 }] : [{ scale: 1 }],
          })}
        >
          <Card style={{ marginBottom: 10, gap: 10, padding: 14 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 16 }}>
                  {item.store_name || activeStoreName || "Store"}
                </Text>
                <Text style={{ color: theme.colors.muted, fontWeight: "800", marginTop: 4 }}>
                  Handoff: {String(item.id).slice(0, 8)}...
                </Text>
              </View>

              <View
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 7,
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor:
                    status === "PENDING"
                      ? theme.colors.emeraldBorder
                      : status === "ACCEPTED"
                      ? "rgba(255,255,255,0.18)"
                      : "rgba(255,255,255,0.12)",
                  backgroundColor:
                    status === "PENDING" ? theme.colors.emeraldSoft : "rgba(255,255,255,0.06)",
                }}
              >
                <Text style={{ color: theme.colors.text, fontWeight: "900" }}>{status}</Text>
              </View>
            </View>

            <View style={{ flexDirection: "row", gap: 12 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>Items</Text>
                <Text style={{ color: theme.colors.text, fontWeight: "900", marginTop: 4 }}>
                  {itemsCount}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>Subtotal</Text>
                <Text style={{ color: theme.colors.text, fontWeight: "900", marginTop: 4 }}>
                  {fmt(Number(item.subtotal ?? 0))}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>Total</Text>
                <Text style={{ color: theme.colors.text, fontWeight: "900", marginTop: 4 }}>
                  {fmt(Number(item.total ?? 0))}
                </Text>
              </View>
            </View>

            {!!Number(item.discount_amount ?? 0) && (
              <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>
                Discount: {fmt(Number(item.discount_amount ?? 0))}
              </Text>
            )}

            {!!String(item.note ?? "").trim() && (
              <View
                style={{
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                  backgroundColor: "rgba(255,255,255,0.04)",
                  borderRadius: 14,
                  padding: 12,
                }}
              >
                <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>Note</Text>
                <Text style={{ color: theme.colors.text, fontWeight: "800", marginTop: 6 }}>
                  {String(item.note ?? "").trim()}
                </Text>
              </View>
            )}

            <View style={{ gap: 4 }}>
              <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>
                Created: {createdAt}
              </Text>

              {status === "ACCEPTED" ? (
                <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>
                  Accepted: {acceptedAt}
                </Text>
              ) : null}

              {status === "COMPLETED" ? (
                <>
                  <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>
                    Accepted: {acceptedAt}
                  </Text>
                  <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>
                    Completed: {completedAt}
                  </Text>
                </>
              ) : null}
            </View>

            <Text
              style={{
                color: theme.colors.muted,
                fontWeight: "900",
                textDecorationLine: "underline",
              }}
            >
              Open details
            </Text>
          </Card>
        </Pressable>
      );
    },
    [activeStoreName, fmt, goHandoffDetail]
  );

  return (
    <Screen
      scroll={false}
      contentStyle={{ paddingHorizontal: 0, paddingTop: 0, paddingBottom: 0 }}
    >
      <View style={{ padding: theme.spacing.page, paddingBottom: 8, gap: 10 }}>
        {TopBar}
        {!isCashier ? QuickBar : null}
      </View>

      {isCashier ? (
        <FlatList<CashierHandoffRow>
          data={cashierLoading && cashierRows.length === 0 ? [] : cashierRows}
          keyExtractor={(item) => item.id}
          refreshing={cashierRefreshing}
          onRefresh={() => {
            void loadCashierHandoffs("refresh");
          }}
          showsVerticalScrollIndicator={false}
          renderItem={renderCashierItem}
          contentContainerStyle={{
            paddingHorizontal: theme.spacing.page,
            paddingBottom: 140,
          }}
          ListHeaderComponent={<View style={{ paddingBottom: 10 }}>{CashierBar}</View>}
          ListEmptyComponent={
            !cashierLoading ? (
              <View style={{ paddingTop: 10, alignItems: "center" }}>
                <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>
                  No cashier handoffs found.
                </Text>
              </View>
            ) : null
          }
        />
      ) : (
        <FlatList<ProductRow>
          data={loading ? [] : filtered}
          keyExtractor={(item) => item.id}
          refreshing={refreshing}
          onRefresh={() => {
            void loadProducts("refresh");
          }}
          showsVerticalScrollIndicator={false}
          renderItem={renderItem}
          contentContainerStyle={{
            paddingHorizontal: theme.spacing.page,
            paddingBottom: 140,
          }}
          ListEmptyComponent={
            !loading ? (
              <View style={{ paddingTop: 10, alignItems: "center" }}>
                <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>
                  No products found.
                </Text>
              </View>
            ) : null
          }
        />
      )}

      <PriceModal
        visible={priceModalOpen}
        productName={selected?.name ?? "—"}
        price={priceDraft}
        qty={qtyDraft}
        costPrice={selected?.cost_price ?? null}
        currency={displayCurrency}
        locale={displayLocale}
        error={modalErr}
        onChangePrice={(t: string) => {
          setModalErr(null);
          setPriceDraft(t);
        }}
        onChangeQty={(t: string) => {
          setModalErr(null);
          setQtyDraft(t);
        }}
        onClose={closePriceModal}
        onConfirm={confirmAddWithPrice}
      />

      <Modal
        visible={qtyEditorOpen}
        transparent
        animationType="fade"
        presentationStyle="overFullScreen"
        statusBarTranslucent
        hardwareAccelerated
        onRequestClose={closeQtyEditor}
      >
        <Pressable
          onPress={closeQtyEditor}
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.78)",
            padding: 18,
          }}
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            style={{ flex: 1, justifyContent: "flex-end" }}
            keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}
          >
            <Pressable
              onPress={() => {}}
              style={{ width: "100%", maxWidth: 520, alignSelf: "center" }}
            >
              <Card
                style={{
                  gap: 12,
                  backgroundColor: "rgba(16,18,24,0.98)",
                  borderColor: "rgba(255,255,255,0.10)",
                  padding: 18,
                }}
              >
                <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 18 }}>
                  Set Quantity
                </Text>

                <Text
                  style={{ color: theme.colors.muted, fontWeight: "800" }}
                  numberOfLines={1}
                >
                  Product:{" "}
                  <Text style={{ color: theme.colors.text, fontWeight: "900" }}>
                    {qtyEditorName}
                  </Text>
                </Text>

                <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>Qty</Text>

                <TextInput
                  value={qtyEditorDraft}
                  onChangeText={(t) => {
                    setQtyEditorErr(null);
                    setQtyEditorDraft(t);
                  }}
                  placeholder="mf: 15"
                  placeholderTextColor="rgba(255,255,255,0.35)"
                  keyboardType="numeric"
                  returnKeyType="done"
                  blurOnSubmit
                  onSubmitEditing={confirmQtyEditor}
                  style={{
                    borderWidth: 1,
                    borderColor: theme.colors.border,
                    borderRadius: theme.radius.lg,
                    backgroundColor: "rgba(255,255,255,0.05)",
                    paddingHorizontal: 14,
                    paddingVertical: 12,
                    color: theme.colors.text,
                    fontWeight: "900",
                    fontSize: 16,
                  }}
                />

                {!!qtyEditorErr && (
                  <Text style={{ color: theme.colors.danger, fontWeight: "900" }}>
                    {qtyEditorErr}
                  </Text>
                )}

                <View style={{ flexDirection: "row", gap: 10, marginTop: 4 }}>
                  <Pressable
                    onPress={closeQtyEditor}
                    style={({ pressed }) => [
                      {
                        flex: 1,
                        paddingVertical: 12,
                        borderRadius: theme.radius.pill,
                        borderWidth: 1,
                        borderColor: theme.colors.border,
                        backgroundColor: "rgba(255,255,255,0.06)",
                        alignItems: "center",
                        opacity: pressed ? 0.92 : 1,
                        transform: pressed ? [{ scale: 0.995 }] : [{ scale: 1 }],
                      },
                    ]}
                  >
                    <Text style={{ color: theme.colors.text, fontWeight: "900" }}>Cancel</Text>
                  </Pressable>

                  <Pressable
                    onPress={confirmQtyEditor}
                    style={({ pressed }) => [
                      {
                        flex: 1,
                        paddingVertical: 12,
                        borderRadius: theme.radius.pill,
                        borderWidth: 1,
                        borderColor: theme.colors.emeraldBorder,
                        backgroundColor: theme.colors.emeraldSoft,
                        alignItems: "center",
                        opacity: pressed ? 0.92 : 1,
                        transform: pressed ? [{ scale: 0.995 }] : [{ scale: 1 }],
                      },
                    ]}
                  >
                    <Text style={{ color: theme.colors.text, fontWeight: "900" }}>Update</Text>
                  </Pressable>
                </View>

                <Pressable
                  onPress={removeFromQtyEditor}
                  style={({ pressed }) => [
                    {
                      paddingVertical: 12,
                      borderRadius: theme.radius.pill,
                      borderWidth: 1,
                      borderColor: theme.colors.border,
                      backgroundColor: "rgba(255,255,255,0.06)",
                      alignItems: "center",
                      opacity: pressed ? 0.92 : 1,
                      transform: pressed ? [{ scale: 0.995 }] : [{ scale: 1 }],
                      marginTop: 2,
                    },
                  ]}
                >
                  <Text style={{ color: theme.colors.text, fontWeight: "900" }}>Remove</Text>
                </Pressable>

                <View style={{ height: 6 }} />
              </Card>
            </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>
    </Screen>
  );
}