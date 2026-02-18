import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Keyboard, Text, TextInput, View } from "react-native";
import { supabase } from "../../../../src/supabase/supabaseClient";
import { Button } from "../../../../src/ui/Button";
import { Card } from "../../../../src/ui/Card";
import { Screen } from "../../../../src/ui/Screen";
import { theme } from "../../../../src/ui/theme";

export default function LowStockScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    storeId?: string;
    storeName?: string;
    productId?: string;
    productName?: string;
    currentQty?: string;
  }>();

  const storeId = String(params.storeId ?? "");
  const storeName = String(params.storeName ?? "Store");
  const productId = String(params.productId ?? "");
  const productName = String(params.productName ?? "Product");
  const currentQty = String(params.currentQty ?? "—");

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // IMPORTANT: tunatumia string ili "0" ibaki placeholder (si value).
  const [thrText, setThrText] = useState<string>("");

  const canSave = useMemo(() => {
    if (!storeId || !productId) return false;
    if (saving || loading) return false;
    // Empty => allowed (it means clear/disable)
    if (thrText.trim() === "") return true;

    const n = Number(thrText);
    return Number.isFinite(n) && n >= 0;
  }, [loading, productId, saving, storeId, thrText]);

  const loadCurrent = useCallback(async () => {
    if (!storeId || !productId) return;

    setLoading(true);
    try {
      const { data, error } = await supabase.rpc("get_inventory_threshold", {
        p_store_id: storeId,
        p_product_id: productId,
      });
      if (error) throw error;

      const n = Number(data ?? 0);

      // ✅ If 0/invalid -> show placeholder (empty value)
      if (!Number.isFinite(n) || n <= 0) {
        setThrText("");
      } else {
        // Keep integer-looking string
        setThrText(String(Math.floor(n)));
      }
    } catch (e: any) {
      // silent-ish: keep input usable
      // unaweza kubadilisha uwe Alert kama unataka
      setThrText("");
    } finally {
      setLoading(false);
    }
  }, [productId, storeId]);

  useEffect(() => {
    void loadCurrent();
  }, [loadCurrent]);

  const onChangeThr = useCallback((t: string) => {
    // keep digits only (no minus, no spaces)
    const cleaned = (t ?? "").replace(/[^\d]/g, "");
    setThrText(cleaned);
  }, []);

  const save = useCallback(async () => {
    if (!storeId || !productId) {
      Alert.alert("Missing", "storeId au productId haipo.");
      return;
    }

    Keyboard.dismiss();
    setSaving(true);

    try {
      const raw = thrText.trim();

      // ✅ Empty => clear/disable (threshold null)
      const thresholdOrNull =
        raw === ""
          ? null
          : (() => {
              const n = Number(raw);
              if (!Number.isFinite(n)) return null;
              const i = Math.floor(n);

              // ✅ 0 => treat as disabled (null) ili isiwe low stock
              if (i <= 0) return null;
              return i;
            })();

      const { error } = await supabase.rpc("set_low_stock_threshold_v2", {
        p_store_id: storeId,
        p_product_id: productId,
        p_threshold: thresholdOrNull,
      });

      if (error) throw error;

      // ✅ RETURN TO INVENTORY automatically (not just back)
      router.replace("/(tabs)/stores/inventory" as any);
    } catch (e: any) {
      Alert.alert("Failed", e?.message ?? "Imeshindikana kusave alert level.");
    } finally {
      setSaving(false);
    }
  }, [productId, router, storeId, thrText]);

  return (
    <Screen scroll>
      <Text style={{ fontSize: 26, fontWeight: "900", color: theme.colors.text }}>
        Alert Level
      </Text>

      <Card style={{ gap: 10 }}>
        <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>Store</Text>
        <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 18 }}>
          {storeName}
        </Text>

        <Text style={{ color: theme.colors.muted, fontWeight: "800", marginTop: 2 }}>
          Product
        </Text>
        <Text style={{ color: theme.colors.text, fontWeight: "900" }}>
          {productName}
        </Text>

        <Text style={{ color: theme.colors.muted, fontWeight: "800", marginTop: 2 }}>
          Current QTY
        </Text>
        <Text style={{ color: theme.colors.text, fontWeight: "900" }}>
          {currentQty}
        </Text>
      </Card>

      <Card style={{ gap: 10 }}>
        <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 16 }}>
          Set Alert Level (Low Stock Threshold)
        </Text>

        <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>
          Ukiweka mfano <Text style={{ color: theme.colors.text, fontWeight: "900" }}>10</Text>,
          mfumo utaiona stock ikiwa{" "}
          <Text style={{ color: theme.colors.text, fontWeight: "900" }}>&le; 10</Text>{" "}
          kama “LOW STOCK”.
        </Text>

        <TextInput
          value={thrText}
          onChangeText={onChangeThr}
          placeholder="0"
          placeholderTextColor="rgba(255,255,255,0.35)"
          keyboardType="number-pad"
          returnKeyType="done"
          onSubmitEditing={Keyboard.dismiss}
          style={{
            borderWidth: 1,
            borderColor: theme.colors.border,
            borderRadius: theme.radius.xl,
            backgroundColor: "rgba(255,255,255,0.05)",
            paddingHorizontal: 16,
            paddingVertical: 14,
            color: theme.colors.text,
            fontWeight: "900",
            fontSize: 18,
          }}
        />

        <View style={{ flexDirection: "row", gap: 10, marginTop: 6 }}>
          <View style={{ flex: 1 }}>
            <Button
              title={loading ? "Loading..." : "Reload"}
              variant="secondary"
              onPress={loadCurrent}
              disabled={loading || saving}
            />
          </View>

          <View style={{ flex: 1 }}>
            <Button
              title={saving ? "Saving..." : "Save"}
              variant="primary"
              onPress={save}
              disabled={!canSave}
            />
          </View>
        </View>

        <Text style={{ color: theme.colors.muted, fontWeight: "800", marginTop: 6 }}>
          Tip: Ukiiacha tupu au ukiweka{" "}
          <Text style={{ color: theme.colors.text, fontWeight: "900" }}>0</Text>, alert
          itakuwa “OFF”.
        </Text>
      </Card>
    </Screen>
  );
}