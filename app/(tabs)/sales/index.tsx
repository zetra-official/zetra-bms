// app/(tabs)/sales/index.tsx
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  FlatList,
  Keyboard,
  Modal,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";

import { useNetInfo } from "@react-native-community/netinfo";

import { useOrg } from "../../../src/context/OrgContext";
import { supabase } from "../../../src/supabase/supabaseClient";

import { loadSalesProductsCache, saveSalesProductsCache } from "../../../src/offline/salesProductsCache";
import { countPending } from "../../../src/offline/salesQueue";
import { syncSalesQueueOnce } from "../../../src/offline/salesSync";

import { Card } from "../../../src/ui/Card";
import { Input } from "../../../src/ui/Input";
import { PriceModal } from "../../../src/ui/PriceModal";
import { Screen } from "../../../src/ui/Screen";
import { theme } from "../../../src/ui/theme";

/* =========================
   Types
========================= */
type ProductRow = {
  id: string;
  name: string;
  sku: string | null;
  unit: string | null;
  category: string | null;

  // selling price used by addAuto()
  selling_price?: number | null;

  // OPTIONAL: cost price (owner/admin gets it; staff will be null)
  cost_price?: number | null;

  // stock qty displayed if present
  stock_qty?: number | null;
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

function fmtTZS(n: number) {
  try {
    return new Intl.NumberFormat("en-TZ", {
      style: "currency",
      currency: "TZS",
      maximumFractionDigits: 0,
    }).format(n);
  } catch {
    return `TZS ${Math.round(n).toLocaleString()}`;
  }
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

/* =========================
   Screen
========================= */
export default function SalesHomeScreen() {
  const router = useRouter();
  const { activeOrgName, activeStoreId, activeStoreName, activeRole } = useOrg();

  const netInfo = useNetInfo();
  const isOnline = !!(netInfo.isConnected && netInfo.isInternetReachable !== false);
  const isOffline = !isOnline;

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [err, setErr] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);

  // Offline/cache status
  const [source, setSource] = useState<"LIVE" | "CACHED" | "NONE">("NONE");
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [pendingCount, setPendingCount] = useState<number>(0);

  const canSell = useMemo(() => {
    const r = (activeRole ?? "staff") as "owner" | "admin" | "staff";
    return r === "owner" || r === "admin" || r === "staff";
  }, [activeRole]);

  const isOwner = useMemo(() => (activeRole ?? "staff") === "owner", [activeRole]);

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

    // ✅ ASARA WARNING (only works if cost_price exists; staff will see no warning because cost is null)
    const cp = Number(selected.cost_price ?? NaN);
    if (Number.isFinite(cp) && unitPrice < cp) {
      setModalErr(
        `ASARA: Bei uliyoweka (${fmtTZS(unitPrice)}) iko chini ya Cost (${fmtTZS(cp)}).`
      );
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

    closePriceModal();
  }, [closePriceModal, priceDraft, qtyDraft, selected]);

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
    },
    [openPriceModal]
  );

  const inc = useCallback((productId: string) => {
    setCart((prev) =>
      prev.map((x) => {
        if (x.product_id !== productId) return x;
        const nextQty = clampQty(x.qty + 1);
        return { ...x, qty: nextQty, line_total: Number(x.unit_price) * nextQty };
      })
    );
  }, []);

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

  const openQtyEditor = useCallback((item: CartItem) => {
    setQtyEditorErr(null);
    setQtyEditorProductId(item.product_id);
    setQtyEditorName(item.name ?? "Product");
    setQtyEditorDraft(String(Math.trunc(Number(item.qty ?? 1))));
    setQtyEditorOpen(true);
  }, []);

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

    closeQtyEditor();
  }, [closeQtyEditor, qtyEditorDraft, qtyEditorProductId]);

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
        if (!activeStoreId) {
          setProducts([]);
          setErr("No active store selected.");
          setSource("NONE");
          setLastSync(null);
          return;
        }

        // ✅ 1) Load cache first (fast + works offline)
        try {
          const cached = await loadSalesProductsCache(activeStoreId);
          if (cached.rows.length > 0) {
            setProducts(cached.rows as any);
            setSource("CACHED");
            setLastSync(cached.lastSync);
          }
        } catch {
          // ignore cache errors
        }

        // ✅ 2) If offline, stop here
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
        }));

        list.sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
        setProducts(list);

        // ✅ 3) Save cache after live load
        try {
          const syncIso = await saveSalesProductsCache(activeStoreId, list as any);
          setSource("LIVE");
          setLastSync(syncIso);
        } catch {
          setSource("LIVE");
        }
      } catch (e: any) {
        // If live load fails but cache exists, keep cache and show error
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
    [activeStoreId, isOffline, products.length]
  );

  useEffect(() => {
    setCart([]);
    setQuery("");
    void loadProducts("boot");
  }, [activeStoreId, loadProducts]);

  // ✅ sync pending queue when online
  useEffect(() => {
    if (!activeStoreId) return;
    if (isOffline) return;

    void (async () => {
      try {
        await syncSalesQueueOnce(activeStoreId);
      } catch {
        // ignore
      } finally {
        const n = await countPending(activeStoreId);
        setPendingCount(n);
      }
    })();
  }, [activeStoreId, isOffline]);

  // ✅ update pending count on store/online changes
  useEffect(() => {
    if (!activeStoreId) return;
    void (async () => {
      const n = await countPending(activeStoreId);
      setPendingCount(n);
    })();
  }, [activeStoreId, isOnline]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return products;
    return products.filter((p) => {
      const name = (p.name ?? "").toLowerCase();
      const sku = (p.sku ?? "").toLowerCase();
      const cat = (p.category ?? "").toLowerCase();
      return name.includes(q) || sku.includes(q) || cat.includes(q);
    });
  }, [products, query]);

  /* =========================
     Navigation
  ========================= */
  const goCheckout = useCallback(() => {
    setErr(null);

    if (!activeStoreId) return setErr("No active store selected.");
    if (!canSell) return setErr("No permission to sell.");
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
  }, [activeStoreId, activeStoreName, canSell, cart, router]);

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
    if (!canSell) return "Huna ruhusa ya kuuza. (Owner/Admin/Staff only)";
    return null;
  }, [canSell]);

  const checkoutDisabled = useMemo(() => {
    return !activeStoreId || cart.length === 0 || !canSell;
  }, [activeStoreId, cart.length, canSell]);

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

  /* =========================
     UI Sections
  ========================= */
  const TopBar = useMemo(() => {
    return (
      <View style={{ gap: 6 }}>
        <View style={{ flexDirection: "row", alignItems: "flex-end" }}>
          <Text style={{ fontSize: 26, fontWeight: "900", color: theme.colors.text }}>
            Sales
          </Text>
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
            {fmtTZS(cartTotalAmount)}
          </Text>
        </View>

        {!!err && (
          <Text style={{ color: theme.colors.dangerText, fontWeight: "900" }}>{err}</Text>
        )}

        {!!headerBlockedReason && (
          <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>
            {headerBlockedReason}
          </Text>
        )}

        <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
          <Pressable
            onPress={goCheckout}
            disabled={checkoutDisabled}
            style={({ pressed }) => [
              {
                paddingVertical: 10,
                paddingHorizontal: 14,
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
              },
            ]}
          >
            <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 14 }}>
              Checkout
            </Text>
          </Pressable>

          <Pressable
            onPress={clearCart}
            disabled={cart.length === 0}
            style={({ pressed }) => [
              {
                paddingVertical: 10,
                paddingHorizontal: 12,
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
            <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 14 }}>
              Clear
            </Text>
          </Pressable>

          <View style={{ flex: 1 }}>
            <Input
              value={query}
              onChangeText={setQuery}
              placeholder="Search name / SKU / category..."
            />
          </View>
        </View>

        {loading && (
          <Text style={{ color: theme.colors.muted, fontWeight: "800", marginTop: 2 }}>
            Loading products...
          </Text>
        )}
      </Card>
    );
  }, [
    cart.length,
    cartCount,
    cartTotalAmount,
    cartTotalLines,
    checkoutDisabled,
    clearCart,
    err,
    goCheckout,
    headerBlockedReason,
    loading,
    query,
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
                <Text style={{ color: theme.colors.text }}>
                  {fmtTZS(Number(inCart?.unit_price ?? 0))}
                </Text>{" "}
                • Line:{" "}
                <Text style={{ color: theme.colors.text }}>
                  {fmtTZS(Number(inCart?.line_total ?? 0))}
                </Text>
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
    [addAuto, cart, dec, getStockQty, inc, openPriceModal, openQtyEditor, removeItem]
  );

  return (
    <Screen
      scroll={false}
      contentStyle={{ paddingHorizontal: 0, paddingTop: 0, paddingBottom: 0 }}
    >
      <View style={{ padding: theme.spacing.page, paddingBottom: 8, gap: 10 }}>
        {TopBar}
        {QuickBar}
      </View>

      <FlatList
        data={loading ? [] : filtered}
        keyExtractor={(item) => item.id}
        refreshing={refreshing}
        onRefresh={() => loadProducts("refresh")}
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

      <PriceModal
        visible={priceModalOpen}
        productName={selected?.name ?? "—"}
        price={priceDraft}
        qty={qtyDraft}
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
            justifyContent: "flex-end",
          }}
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

              <Text style={{ color: theme.colors.muted, fontWeight: "800" }} numberOfLines={1}>
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
                <Text style={{ color: theme.colors.dangerText, fontWeight: "900" }}>
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
            </Card>
          </Pressable>
        </Pressable>
      </Modal>
    </Screen>
  );
}