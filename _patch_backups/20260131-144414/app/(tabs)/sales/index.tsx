// app/(tabs)/sales/index.tsx
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
    ActivityIndicator,
    FlatList,
    Pressable,
    Text,
    TextInput,
    View,
} from "react-native";
import { useOrg } from "../../../src/context/OrgContext";
import { supabase } from "../../../src/supabase/supabaseClient";
import { Button } from "../../../src/ui/Button";
import { Card } from "../../../src/ui/Card";
import { Screen } from "../../../src/ui/Screen";
import { theme } from "../../../src/ui/theme";

type ProductRow = {
  id: string;
  name: string;
  sku: string | null;
  unit: string | null;
  category: string | null;
};

type CartItem = {
  product_id: string;
  name: string;
  sku: string | null;
  qty: number;
  unit: string | null;
};

function clampQty(n: number) {
  if (!Number.isFinite(n)) return 1;
  return Math.max(1, Math.min(999999, Math.trunc(n)));
}

export default function SalesHomeScreen() {
  const router = useRouter();
  const { activeOrgName, activeStoreId, activeStoreName, activeRole } = useOrg();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);

  const canSell = useMemo(() => {
    // Kwa DORA v1: staff anaweza kuuza kwenye store aliyoassigniwa.
    // Access ya store inathibitishwa na ensure_my_store_access (tutaita kwenye checkout).
    const r = (activeRole ?? "staff") as "owner" | "admin" | "staff";
    return r === "owner" || r === "admin" || r === "staff";
  }, [activeRole]);

  const cartCount = useMemo(() => {
    return cart.reduce((a, c) => a + (c.qty || 0), 0);
  }, [cart]);

  const cartTotalLines = useMemo(() => cart.length, [cart.length]);

  const loadProducts = useCallback(async (mode: "boot" | "refresh") => {
    setErr(null);
    if (mode === "boot") setLoading(true);
    if (mode === "refresh") setRefreshing(true);

    try {
      const { data, error } = await supabase.rpc("get_products");
      if (error) throw error;

      const list = (data ?? []) as ProductRow[];
      // sort by name (stable)
      list.sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
      setProducts(list);
    } catch (e: any) {
      setErr(e?.message ?? "Failed to load products");
    } finally {
      if (mode === "boot") setLoading(false);
      if (mode === "refresh") setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadProducts("boot");
  }, [loadProducts]);

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

  const addToCart = useCallback((p: ProductRow) => {
    setCart((prev) => {
      const idx = prev.findIndex((x) => x.product_id === p.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], qty: clampQty(next[idx].qty + 1) };
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
        },
      ];
    });
  }, []);

  const inc = useCallback((productId: string) => {
    setCart((prev) =>
      prev.map((x) =>
        x.product_id === productId ? { ...x, qty: clampQty(x.qty + 1) } : x
      )
    );
  }, []);

  const dec = useCallback((productId: string) => {
    setCart((prev) =>
      prev
        .map((x) =>
          x.product_id === productId ? { ...x, qty: clampQty(x.qty - 1) } : x
        )
        .filter((x) => x.qty > 0)
    );
  }, []);

  const removeLine = useCallback((productId: string) => {
    setCart((prev) => prev.filter((x) => x.product_id !== productId));
  }, []);

  const clearCart = useCallback(() => setCart([]), []);

  const goCheckout = useCallback(() => {
    if (!activeStoreId) {
      setErr("No active store selected.");
      return;
    }
    if (!canSell) {
      setErr("No permission to sell.");
      return;
    }
    if (cart.length === 0) {
      setErr("Cart is empty.");
      return;
    }

    // Pass cart as encoded JSON string (expo-router params are strings)
    const payload = encodeURIComponent(JSON.stringify(cart));

    router.push({
      pathname: "/(tabs)/sales/checkout",
      params: {
        storeId: activeStoreId,
        storeName: activeStoreName ?? "",
        cart: payload,
      },
    });
  }, [activeStoreId, activeStoreName, canSell, cart, router]);

  const openHistory = useCallback(() => {
    router.push("/(tabs)/sales/history");
  }, [router]);

  return (
    <Screen bottomPad={140}>
      <View style={{ flex: 1, gap: 14 }}>
        {/* Header */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <View style={{ flex: 1 }}>
            <Text
              style={{
                fontSize: 26,
                fontWeight: "900",
                color: theme.colors.text,
              }}
            >
              Sales
            </Text>
            <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>
              {activeOrgName ?? "—"} • {activeStoreName ?? "No store"} •{" "}
              {activeRole ?? "—"}
            </Text>
          </View>

          <Pressable
            onPress={openHistory}
            style={{
              width: 44,
              height: 44,
              borderRadius: 999,
              alignItems: "center",
              justifyContent: "center",
              borderWidth: 1,
              borderColor: theme.colors.border,
              backgroundColor: "rgba(255,255,255,0.06)",
            }}
          >
            <Ionicons
              name="time-outline"
              size={22}
              color={theme.colors.text}
            />
          </Pressable>
        </View>

        {/* Top summary */}
        <Card style={{ gap: 10 }}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <View>
              <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>
                Cart
              </Text>
              <Text
                style={{
                  color: theme.colors.text,
                  fontWeight: "900",
                  fontSize: 18,
                }}
              >
                {cartTotalLines} items • {cartCount} qty
              </Text>
            </View>

            <View style={{ flexDirection: "row", gap: 10 }}>
              <Pressable
                onPress={clearCart}
                disabled={cart.length === 0}
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                  backgroundColor:
                    cart.length === 0
                      ? "rgba(255,255,255,0.03)"
                      : "rgba(255,255,255,0.06)",
                  opacity: cart.length === 0 ? 0.5 : 1,
                }}
              >
                <Text style={{ color: theme.colors.text, fontWeight: "800" }}>
                  Clear
                </Text>
              </Pressable>
            </View>
          </View>

          <Button
            title="Checkout"
            onPress={goCheckout}
            disabled={!activeStoreId || cart.length === 0 || !canSell}
            variant="primary"
          />

          {!canSell && (
            <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>
              Huna ruhusa ya kuuza. (Owner/Admin/Staff only)
            </Text>
          )}
        </Card>

        {/* Search */}
        <Card style={{ gap: 10 }}>
          <Text style={{ color: theme.colors.text, fontWeight: "900" }}>
            Products
          </Text>

          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 10,
              borderWidth: 1,
              borderColor: theme.colors.border,
              borderRadius: theme.radius.lg,
              backgroundColor: "rgba(255,255,255,0.05)",
              paddingHorizontal: 12,
              paddingVertical: 10,
            }}
          >
            <Ionicons
              name="search-outline"
              size={18}
              color="rgba(255,255,255,0.55)"
            />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search by name, SKU, category..."
              placeholderTextColor="rgba(255,255,255,0.35)"
              style={{
                flex: 1,
                color: theme.colors.text,
                fontWeight: "800",
              }}
            />
            {query.trim().length > 0 && (
              <Pressable onPress={() => setQuery("")} hitSlop={10}>
                <Ionicons
                  name="close-circle"
                  size={18}
                  color="rgba(255,255,255,0.55)"
                />
              </Pressable>
            )}
          </View>

          {err && (
            <Text style={{ color: theme.colors.dangerText, fontWeight: "800" }}>
              {err}
            </Text>
          )}
        </Card>

        {/* List */}
        {loading ? (
          <View style={{ paddingTop: 18, alignItems: "center" }}>
            <ActivityIndicator />
            <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>
              Loading products...
            </Text>
          </View>
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={(item) => item.id}
            onRefresh={() => loadProducts("refresh")}
            refreshing={refreshing}
            contentContainerStyle={{ paddingBottom: 18 }}
            renderItem={({ item }) => {
              const inCart = cart.find((c) => c.product_id === item.id);
              const qty = inCart?.qty ?? 0;

              return (
                <Card style={{ marginBottom: 12 }}>
                  <View style={{ flexDirection: "row", gap: 12 }}>
                    <View style={{ flex: 1, gap: 6 }}>
                      <Text
                        style={{
                          color: theme.colors.text,
                          fontWeight: "900",
                          fontSize: 16,
                        }}
                        numberOfLines={1}
                      >
                        {item.name}
                      </Text>

                      <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>
                        SKU: {item.sku ?? "—"}
                        {item.category ? `  •  ${item.category}` : ""}
                      </Text>
                    </View>

                    {/* Right controls */}
                    {qty <= 0 ? (
                      <Pressable
                        onPress={() => addToCart(item)}
                        style={{
                          paddingHorizontal: 12,
                          paddingVertical: 10,
                          borderRadius: 999,
                          borderWidth: 1,
                          borderColor: "rgba(52,211,153,0.55)",
                          backgroundColor: "rgba(52,211,153,0.12)",
                          alignSelf: "center",
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 8,
                        }}
                      >
                        <Ionicons
                          name="add"
                          size={18}
                          color={theme.colors.emerald}
                        />
                        <Text
                          style={{
                            color: theme.colors.text,
                            fontWeight: "900",
                          }}
                        >
                          Add
                        </Text>
                      </Pressable>
                    ) : (
                      <View style={{ alignItems: "flex-end", gap: 8 }}>
                        <View style={{ flexDirection: "row", gap: 10 }}>
                          <Pressable
                            onPress={() => dec(item.id)}
                            style={{
                              width: 40,
                              height: 40,
                              borderRadius: 999,
                              alignItems: "center",
                              justifyContent: "center",
                              borderWidth: 1,
                              borderColor: theme.colors.border,
                              backgroundColor: "rgba(255,255,255,0.06)",
                            }}
                          >
                            <Ionicons
                              name="remove"
                              size={18}
                              color={theme.colors.text}
                            />
                          </Pressable>

                          <View
                            style={{
                              minWidth: 48,
                              height: 40,
                              borderRadius: 999,
                              alignItems: "center",
                              justifyContent: "center",
                              borderWidth: 1,
                              borderColor: "rgba(52,211,153,0.35)",
                              backgroundColor: "rgba(52,211,153,0.10)",
                              paddingHorizontal: 12,
                            }}
                          >
                            <Text
                              style={{
                                color: theme.colors.text,
                                fontWeight: "900",
                              }}
                            >
                              {qty}
                            </Text>
                          </View>

                          <Pressable
                            onPress={() => inc(item.id)}
                            style={{
                              width: 40,
                              height: 40,
                              borderRadius: 999,
                              alignItems: "center",
                              justifyContent: "center",
                              borderWidth: 1,
                              borderColor: "rgba(52,211,153,0.55)",
                              backgroundColor: "rgba(52,211,153,0.12)",
                            }}
                          >
                            <Ionicons
                              name="add"
                              size={18}
                              color={theme.colors.emerald}
                            />
                          </Pressable>
                        </View>

                        <Pressable onPress={() => removeLine(item.id)}>
                          <Text
                            style={{
                              color: theme.colors.muted,
                              fontWeight: "800",
                              textDecorationLine: "underline",
                            }}
                          >
                            Remove
                          </Text>
                        </Pressable>
                      </View>
                    )}
                  </View>
                </Card>
              );
            }}
            ListEmptyComponent={
              <View style={{ paddingTop: 16, alignItems: "center" }}>
                <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>
                  No products found.
                </Text>
              </View>
            }
          />
        )}
      </View>
    </Screen>
  );
}