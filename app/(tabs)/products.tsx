// app/(tabs)/products.tsx
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Pressable, Text, TextInput, View } from "react-native";
import { useOrg } from "../../src/context/OrgContext";
import { supabase } from "../../src/supabase/supabaseClient";
import { Button } from "../../src/ui/Button";
import { Card } from "../../src/ui/Card";
import { Screen } from "../../src/ui/Screen";
import { theme } from "../../src/ui/theme";

type ProductRow = {
  id: string;
  organization_id: string;
  name: string;
  sku: string | null;
  unit: string | null;
  category: string | null;

  selling_price: number | null;

  // manage-only RPC may return it; staff-safe might omit/return null
  cost_price?: number | null;

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

export default function ProductsTabScreen() {
  const { activeOrgId, activeOrgName, activeRole } = useOrg();

  const canManage = useMemo(
    () => (["owner", "admin"] as const).includes((activeRole ?? "staff") as any),
    [activeRole]
  );

  const canSeeCost = useMemo(
    () => (["owner", "admin"] as const).includes((activeRole ?? "staff") as any),
    [activeRole]
  );

  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<ProductRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [unit, setUnit] = useState("");
  const [category, setCategory] = useState("");

  // ✅ Selling OPTIONAL
  const [sellingPrice, setSellingPrice] = useState("");

  // ✅ Cost OPTIONAL
  const [costPrice, setCostPrice] = useState("");

  const load = useCallback(async () => {
    if (!activeOrgId) {
      setRows([]);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      if (canManage) {
        const { data, error: e } = await supabase.rpc("get_products_manage", {
          p_org_id: activeOrgId,
        });
        if (e) throw e;
        setRows((data ?? []) as ProductRow[]);
      } else {
        const { data, error: e } = await supabase.rpc("get_products", {
          p_org_id: activeOrgId,
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
  }, [activeOrgId, canManage]);

  useEffect(() => {
    void load();
  }, [load]);

  const add = useCallback(async () => {
    if (!activeOrgId) return;

    const n = name.trim();
    if (!n) {
      Alert.alert("Missing", "Weka product name.");
      return;
    }

    if (!canManage) {
      Alert.alert("No Access", "Owner/Admin only.");
      return;
    }

    // ✅ Selling OPTIONAL
    const sp = parsePositiveNumberOrNull(sellingPrice);
    if (sellingPrice.trim() && sp === null) {
      Alert.alert("Invalid", "Selling Price iwe namba (> 0) au uiache wazi.");
      return;
    }

    // ✅ Cost OPTIONAL
    const cp = parseZeroOrPositiveNumberOrNull(costPrice);
    if (costPrice.trim() && cp === null) {
      Alert.alert("Invalid", "Cost Price iwe namba (>= 0) au uiache wazi.");
      return;
    }

    // ✅ must have at least one of them
    if (sp === null && cp === null) {
      Alert.alert("Missing", "Weka angalau Cost Price au Selling Price (hata moja).");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { error: e } = await supabase.rpc("upsert_product", {
        p_org_id: activeOrgId,
        p_product_id: null,
        p_name: n,
        p_sku: sku.trim() || null,
        p_unit: unit.trim() || null,
        p_category: category.trim() || null,
        p_is_active: true,
        p_selling_price: sp,
        p_cost_price: cp,
      });

      if (e) throw e;

      setName("");
      setSku("");
      setUnit("");
      setCategory("");
      setSellingPrice("");
      setCostPrice("");

      await load();
      Alert.alert("Success ✅", "Product added");
    } catch (err: any) {
      Alert.alert("Failed", err?.message ?? "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [activeOrgId, canManage, name, sku, unit, category, sellingPrice, costPrice, load]);

  const remove = useCallback(
    async (productId: string, productName: string) => {
      if (!activeOrgId) return;

      if (!canManage) {
        Alert.alert("No Access", "Owner/Admin only.");
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
                });
                if (e) throw e;
                await load();
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
    [activeOrgId, canManage, load]
  );

  return (
    <Screen scroll>
      <Text style={{ fontSize: 26, fontWeight: "900", color: theme.colors.text }}>
        Products
      </Text>

      <Card style={{ gap: 8 }}>
        <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>Organization</Text>
        <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 18 }}>
          {activeOrgName ?? "—"}
        </Text>

        <Text style={{ color: theme.colors.muted, fontWeight: "800", marginTop: 6 }}>
          Role
        </Text>
        <Text style={{ color: theme.colors.text, fontWeight: "900" }}>{activeRole ?? "—"}</Text>

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
            Add Product
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

          {/* Selling Price OPTIONAL */}
          <TextInput
            value={sellingPrice}
            onChangeText={(t) => setSellingPrice(t.replace(/[^0-9]/g, ""))}
            placeholder="Selling Price (TZS) (optional)"
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

          {/* Cost Price (Owner/Admin only) */}
          {canSeeCost && (
            <TextInput
              value={costPrice}
              onChangeText={(t) => setCostPrice(t.replace(/[^0-9]/g, ""))}
              placeholder="Cost Price (TZS) (optional)"
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

          <Button
            title={loading ? "Saving..." : "Add Product"}
            onPress={add}
            disabled={loading}
            variant="primary"
          />
        </Card>
      )}

      <Text style={{ fontWeight: "900", fontSize: 16, color: theme.colors.text }}>
        Product List
      </Text>

      {rows.length === 0 ? (
        <Card>
          <Text style={{ color: theme.colors.text, fontWeight: "900" }}>No products yet</Text>
          <Text style={{ color: theme.colors.muted, fontWeight: "700", marginTop: 6 }}>
            {canManage ? "Ongeza product juu kisha Refresh." : "Muombe admin/owner aongeze products."}
          </Text>
        </Card>
      ) : (
        rows.map((p) => {
          const sp = Number(p.selling_price ?? 0);
          const cp = Number(p.cost_price ?? NaN);

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
              <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 16 }}>
                {p.name}
              </Text>

              <Text style={{ color: theme.colors.muted, fontWeight: "800", marginTop: 6 }}>
                SKU: <Text style={{ color: theme.colors.text }}>{p.sku ?? "—"}</Text>
                {"   "}•{"   "}
                Unit: <Text style={{ color: theme.colors.text }}>{p.unit ?? "—"}</Text>
              </Text>

              <Text style={{ color: theme.colors.muted, fontWeight: "800", marginTop: 6 }}>
                Category: <Text style={{ color: theme.colors.text }}>{p.category ?? "—"}</Text>
              </Text>

              <Text style={{ color: theme.colors.muted, fontWeight: "900", marginTop: 8 }}>
                Selling Price:{" "}
                <Text style={{ color: theme.colors.text }}>
                  {sp > 0 ? fmtTZS(sp) : "—"}
                </Text>
              </Text>

              {canSeeCost && (
                <Text style={{ color: theme.colors.muted, fontWeight: "900", marginTop: 6 }}>
                  Cost Price:{" "}
                  <Text style={{ color: theme.colors.text }}>
                    {Number.isFinite(cp) ? fmtTZS(cp) : "—"}
                  </Text>
                </Text>
              )}

              {canManage && (
                <View style={{ marginTop: 12 }}>
                  <Button
                    title="Delete"
                    variant="secondary"
                    onPress={() => remove(p.id, p.name)}
                    disabled={loading}
                  />
                </View>
              )}
            </Pressable>
          );
        })
      )}
    </Screen>
  );
}