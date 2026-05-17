// app/(tabs)/stores/inventory/low-stock.tsx
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  Platform,
  Pressable,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  View,
} from "react-native";

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
    storeId?: string;
    storeName?: string;
    productId?: string;
    productName?: string;
    currentQty?: string;
  }>();

  const storeId = String(params.storeId ?? "").trim();
  const productId = String(params.productId ?? "").trim();
  const storeName = String(params.storeName ?? "Store").trim() || "Store";
  const productName = String(params.productName ?? "Product").trim() || "Product";
  const currentQty = String(params.currentQty ?? "0").trim() || "0";

  const { activeRole } = useOrg();

  const canEdit = useMemo(
    () => (["owner", "admin"] as const).includes((activeRole ?? "staff") as any),
    [activeRole]
  );

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Empty means placeholder 0; this prevents ugly fixed “0”.
  const [threshold, setThreshold] = useState("");

  const load = useCallback(async () => {
    if (!storeId || !productId) {
      Alert.alert("Missing", "storeId au productId haipo.");
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.rpc("get_inventory_threshold", {
        p_store_id: storeId,
        p_product_id: productId,
      });

      if (error) throw error;

      const v = toIntSafe(data);
      setThreshold(v > 0 ? String(v) : "");
    } catch (e: any) {
      Alert.alert("Failed", e?.message ?? "Imeshindikana kusoma alert level.");
    } finally {
      setLoading(false);
    }
  }, [storeId, productId]);

  useEffect(() => {
    void load();
  }, [load]);

  const onChangeThreshold = useCallback((t: string) => {
    const digits = String(t ?? "").replace(/[^\d]/g, "");
    setThreshold(digits);
  }, []);

  const save = useCallback(async () => {
    if (!storeId || !productId) return;

    if (!canEdit) {
      Alert.alert("No Access", "Ni Owner/Admin tu anaweza kubadili Alert Level.");
      return;
    }

    Keyboard.dismiss();

    const raw = threshold.trim();
    const n = raw === "" ? 0 : toIntSafe(raw);

    setSaving(true);
    try {
      const { error: e1 } = await supabase.rpc("set_low_stock_threshold_v2", {
        p_store_id: storeId,
        p_product_id: productId,
        p_threshold: n <= 0 ? null : n,
      } as any);

      if (e1) {
        const { error: e2 } = await supabase.rpc("set_low_stock_threshold", {
          p_store_id: storeId,
          p_product_id: productId,
          p_threshold: n,
        } as any);

        if (e2) {
          const { error: e3 } = await supabase.rpc("set_inventory_threshold", {
            p_store_id: storeId,
            p_product_id: productId,
            p_threshold: n,
          } as any);

          if (e3) throw e3;
        }
      }

      router.replace("/(tabs)/stores/inventory" as any);
    } catch (e: any) {
      Alert.alert("Save Failed", e?.message ?? "Imeshindikana kusave alert level.");
    } finally {
      setSaving(false);
    }
  }, [storeId, productId, threshold, canEdit, router]);

  const content = (
    <View style={{ flex: 1, gap: 12 }}>
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

        <Text style={{ fontSize: 24, fontWeight: "900", color: theme.colors.text }}>
          Alert Level
        </Text>
      </View>

      <Card style={{ gap: 8 }}>
        <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>Store</Text>
        <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 17 }}>
          {storeName}
        </Text>

        <Text style={{ color: theme.colors.muted, fontWeight: "800", marginTop: 4 }}>
          Product
        </Text>
        <Text style={{ color: theme.colors.text, fontWeight: "900" }}>{productName}</Text>

        <Text style={{ color: theme.colors.muted, fontWeight: "800", marginTop: 4 }}>
          Current QTY
        </Text>
        <Text style={{ color: theme.colors.text, fontWeight: "900" }}>{currentQty}</Text>
      </Card>

      <Card style={{ gap: 10 }}>
        <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 16 }}>
          Low Stock Alert
        </Text>

        <Text style={{ color: theme.colors.muted, fontWeight: "800", lineHeight: 18 }}>
          Weka kiwango cha chini cha stock. Mfano ukiweka 10, bidhaa itaonekana LOW STOCK
          ikifika 10 au chini yake.
        </Text>

        <TextInput
          value={threshold}
          onChangeText={onChangeThreshold}
          onFocus={() => {
            if (threshold === "0") setThreshold("");
          }}
          keyboardType="number-pad"
          returnKeyType="done"
          onSubmitEditing={Keyboard.dismiss}
          placeholder="0"
          placeholderTextColor="rgba(255,255,255,0.35)"
          editable={!saving && !loading && canEdit}
          style={{
            borderWidth: 1,
            borderColor: theme.colors.border,
            borderRadius: theme.radius.lg,
            backgroundColor: "rgba(255,255,255,0.05)",
            paddingHorizontal: 16,
            paddingVertical: 12,
            color: theme.colors.text,
            fontWeight: "900",
            fontSize: 18,
          }}
        />

        {!canEdit ? (
          <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>
            Staff hawezi kubadili Alert Level.
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

        {(loading || saving) ? <ActivityIndicator /> : null}
      </Card>
    </View>
  );

  return (
    <Screen scroll bottomPad={220}>
      {Platform.OS === "web" ? (
        content
      ) : (
        <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
          {content}
        </TouchableWithoutFeedback>
      )}
    </Screen>
  );
}