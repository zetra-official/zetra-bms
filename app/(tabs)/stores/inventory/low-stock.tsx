// app/(tabs)/stores/inventory/low-stock.tsx
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Pressable, Text, TextInput, View } from "react-native";
import { useOrg } from "../../../../src/context/OrgContext";
import { supabase } from "../../../../src/supabase/supabaseClient";
import { Button } from "../../../../src/ui/Button";
import { Card } from "../../../../src/ui/Card";
import { Screen } from "../../../../src/ui/Screen";
import { theme } from "../../../../src/ui/theme";

function toIntSafe(x: any) {
  const n = Number(x);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.trunc(n));
}

export default function LowStockScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    storeId: string;
    storeName?: string;
    productId: string;
    productName?: string;
    currentQty?: string;
  }>();

  const storeId = String(params.storeId ?? "").trim();
  const productId = String(params.productId ?? "").trim();
  const storeName = (params.storeName ?? "Store").trim() || "Store";
  const productName = (params.productName ?? "Product").trim() || "Product";
  const currentQty = String(params.currentQty ?? "0");

  const { activeRole } = useOrg();
  const canEdit = useMemo(
    () => (["owner", "admin"] as const).includes((activeRole ?? "staff") as any),
    [activeRole]
  );

  const [loading, setLoading] = useState(false);
  const [threshold, setThreshold] = useState<string>("0");
  const [saving, setSaving] = useState(false);

  // -----------------------------
  // LOAD current threshold (read)
  // -----------------------------
  const load = useCallback(async () => {
    if (!storeId || !productId) {
      Alert.alert("Missing", "storeId au productId haipo.");
      return;
    }

    setLoading(true);
    try {
      // Preferred read function
      const { data, error } = await supabase.rpc("get_inventory_threshold", {
        p_store_id: storeId,
        p_product_id: productId,
      });

      if (error) throw error;

      const v = toIntSafe(data);
      setThreshold(String(v));
    } catch (e: any) {
      Alert.alert("Failed", e?.message ?? "Imeshindikana kusoma alert level.");
    } finally {
      setLoading(false);
    }
  }, [storeId, productId]);

  useEffect(() => {
    void load();
  }, [load]);

  // -----------------------------------------
  // SAVE threshold (write) v2 + fallback safe
  // -----------------------------------------
  const save = useCallback(async () => {
    if (!storeId || !productId) return;

    if (!canEdit) {
      Alert.alert("No Access", "Ni Owner/Admin tu anaweza kubadili Alert Level.");
      return;
    }

    const n = toIntSafe(threshold);

    setSaving(true);
    try {
      // ✅ 1) TRY preferred v2 (if exists)
      const { error: e1 } = await supabase.rpc("set_low_stock_threshold_v2", {
        p_store_id: storeId,
        p_product_id: productId,
        p_threshold: n,
      } as any);

      if (!e1) {
        Alert.alert("Saved ✅", `Alert Level: ${n}`);
        await load();
        return;
      }

      // If v2 doesn't exist OR fails, fallback:
      // - if function missing => e1.code often "42883" (undefined_function)
      // - if signature mismatch => still fallback
      // We do NOT assume codes always; we just try next.

      // ✅ 2) Try legacy set_low_stock_threshold (returns TABLE)
      const { error: e2 } = await supabase.rpc("set_low_stock_threshold", {
        p_store_id: storeId,
        p_product_id: productId,
        p_threshold: n,
      } as any);

      if (!e2) {
        Alert.alert("Saved ✅", `Alert Level: ${n}`);
        await load();
        return;
      }

      // ✅ 3) Try set_inventory_threshold (returns void)
      const { error: e3 } = await supabase.rpc("set_inventory_threshold", {
        p_store_id: storeId,
        p_product_id: productId,
        p_threshold: n,
      } as any);

      if (e3) throw e3;

      Alert.alert("Saved ✅", `Alert Level: ${n}`);
      await load();
    } catch (e: any) {
      Alert.alert("Save Failed", e?.message ?? "Imeshindikana kusave alert level.");
    } finally {
      setSaving(false);
    }
  }, [storeId, productId, threshold, canEdit, load]);

  return (
    <Screen scroll>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => ({
            paddingHorizontal: 14,
            paddingVertical: 10,
            borderRadius: theme.radius.pill,
            borderWidth: 1,
            borderColor: theme.colors.border,
            backgroundColor: theme.colors.card,
            opacity: pressed ? 0.92 : 1,
          })}
        >
          <Text style={{ color: theme.colors.text, fontWeight: "900" }}>Back</Text>
        </Pressable>

        <Text style={{ fontSize: 20, fontWeight: "900", color: theme.colors.text }}>
          Alert Level
        </Text>
      </View>

      <Card style={{ gap: 10, marginTop: 12 }}>
        <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>Store</Text>
        <Text style={{ color: theme.colors.text, fontWeight: "900" }}>{storeName}</Text>

        <Text style={{ color: theme.colors.muted, fontWeight: "800", marginTop: 6 }}>
          Product
        </Text>
        <Text style={{ color: theme.colors.text, fontWeight: "900" }}>{productName}</Text>

        <Text style={{ color: theme.colors.muted, fontWeight: "800", marginTop: 6 }}>
          Current QTY
        </Text>
        <Text style={{ color: theme.colors.text, fontWeight: "900" }}>{currentQty}</Text>
      </Card>

      <Card style={{ gap: 10, marginTop: 12 }}>
        <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 16 }}>
          Set Alert Level (Low Stock Threshold)
        </Text>

        <Text style={{ color: theme.colors.muted, fontWeight: "700", lineHeight: 18 }}>
          Ukiweka mfano <Text style={{ color: theme.colors.text, fontWeight: "900" }}>10</Text>,
          mfumo utaiona stock ikiwa ≤ 10 kama “LOW STOCK”.
        </Text>

        <TextInput
          value={threshold}
          onChangeText={(t) => {
            // keep digits only
            const digits = String(t ?? "").replace(/[^\d]/g, "");
            setThreshold(digits === "" ? "0" : digits);
          }}
          keyboardType="number-pad"
          placeholder="0"
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
            fontSize: 18,
          }}
        />

        {!canEdit ? (
          <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>
            (Read-only) Staff hawezi kubadili Alert Level.
          </Text>
        ) : null}

        <View style={{ flexDirection: "row", gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Button
              title={loading ? "Loading..." : "Reload"}
              variant="secondary"
              onPress={load}
              disabled={loading || saving}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Button
              title={saving ? "Saving..." : "Save"}
              variant="primary"
              onPress={save}
              disabled={saving || loading || !canEdit}
            />
          </View>
        </View>

        {(loading || saving) && (
          <View style={{ marginTop: 6 }}>
            <ActivityIndicator />
          </View>
        )}
      </Card>
    </Screen>
  );
}