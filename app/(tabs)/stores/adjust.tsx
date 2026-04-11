// app/(tabs)/stores/adjust.tsx
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Keyboard,
  Platform,
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

function one(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : v;
}

function asInt(n: number) {
  const x = Math.trunc(n);
  return Number.isFinite(x) ? x : 0;
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

  const { activeRole, activeStoreId, activeStoreName, activeStoreType } = useOrg();
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

  const [mode, setMode] = useState<Mode>("ADD");
  const [amount, setAmount] = useState<string>("1");
  const [reason, setReason] = useState<string>("");
  const [saving, setSaving] = useState(false);

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
        return;
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

        const { data, error } = await supabase.rpc("get_products");
        if (error) throw error;

        const list = (data ?? []) as Array<{
          id: string;
          name?: string | null;
          sku?: string | null;
        }>;

        const found = list.find((p) => p.id === productId);

        if (!cancelled) {
          setDisplayName((found?.name ?? "").trim() || "Product");
          if (!passedSku) setDisplaySku((found?.sku ?? "").trim() || "—");
        }
      } catch {
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
  }, [productId, passedName, passedSku, activeStoreId, isCapitalRecoveryStore]);

  const onAmountChange = useCallback((txt: string) => {
    const cleaned = txt.replace(/[^\d]/g, "");
    setAmount(cleaned);
  }, []);

  const ensureNotLockedToday = useCallback(async () => {
    if (!activeStoreId) return false;
    if (isCapitalRecoveryStore) return false;

    const today = localYMD();
    const { data, error } = await supabase.rpc("is_closing_locked", {
      p_store_id: activeStoreId,
      p_date: today,
    });

    if (error) {
      return true;
    }

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
    if (!trimmed) {
      Alert.alert("Invalid", "Amount lazima iandikwe.");
      return;
    }

    const n = Number(trimmed);
    if (!Number.isFinite(n) || n <= 0) {
      Alert.alert("Invalid", "Amount lazima iwe namba > 0");
      return;
    }

    const intAmount = asInt(n);
    if (intAmount <= 0) {
      Alert.alert("Invalid", "Amount lazima iwe namba halali (> 0).");
      return;
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
        p_amount: Math.abs(intAmount),
        p_mode: mode,
        p_note: reason?.trim() ? reason.trim() : null,
      } as any);

      if (error) throw error;

      const newQty =
        Array.isArray(data) && data.length > 0 ? (data[0] as any)?.new_qty : null;

      Alert.alert("Success ✅", newQty === null ? "Stock updated" : `New Qty: ${newQty}`);
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
    mode,
    router,
  ]);

  const content = (
    <View style={{ flex: 1, gap: 14 }}>
      <Text style={{ fontSize: 26, fontWeight: "900", color: theme.colors.text }}>
        {isCapitalRecoveryStore ? "Adjust Disabled" : "Adjust Stock"}
      </Text>

      <Card style={{ gap: 8 }}>
        <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>Active Store</Text>
        <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 18 }}>
          {activeStoreName ?? "—"}
        </Text>

        <Text style={{ color: theme.colors.muted, fontWeight: "800", marginTop: 6 }}>
          Product
        </Text>
        <Text style={{ color: theme.colors.text, fontWeight: "900" }}>{displayName}</Text>

        <Text style={{ color: theme.colors.muted, fontWeight: "800", marginTop: 6 }}>
          SKU
        </Text>
        <Text style={{ color: theme.colors.text, fontWeight: "900" }}>{displaySku}</Text>

        <Text style={{ color: theme.colors.muted, fontWeight: "800", marginTop: 6 }}>
          Current Qty
        </Text>
        <Text style={{ color: theme.colors.text, fontWeight: "900" }}>{currentQty}</Text>

        {isCapitalRecoveryStore ? (
          <View
            style={{
              marginTop: 10,
              borderWidth: 1,
              borderColor: theme.colors.emeraldBorder,
              borderRadius: theme.radius.xl,
              backgroundColor: theme.colors.emeraldSoft,
              padding: 14,
            }}
          >
            <Text style={{ color: theme.colors.text, fontWeight: "900" }}>
              Capital Recovery store haitumii Adjust Stock.
            </Text>
            <Text style={{ color: theme.colors.muted, fontWeight: "800", marginTop: 8 }}>
              Tumia Products + Capital Recovery Workspace. Inventory adjustment imezimwa kwenye mode hii.
            </Text>
          </View>
        ) : null}
      </Card>

      <Card style={{ gap: 10 }}>
        <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 16 }}>
          Mode
        </Text>

        <View style={{ flexDirection: "row", gap: 10 }}>
          <Button
            title="ADD"
            variant="secondary"
            onPress={() => setMode("ADD")}
            disabled={isCapitalRecoveryStore || saving}
            style={{
              flex: 1,
              borderColor:
                mode === "ADD" ? "rgba(52,211,153,0.55)" : theme.colors.border,
              opacity: isCapitalRecoveryStore ? 0.6 : 1,
            }}
          />

          <Button
            title="REDUCE"
            variant="secondary"
            onPress={() => setMode("REDUCE")}
            disabled={isCapitalRecoveryStore || saving}
            style={{
              flex: 1,
              borderColor:
                mode === "REDUCE" ? theme.colors.dangerBorder : theme.colors.border,
              opacity: isCapitalRecoveryStore ? 0.6 : 1,
            }}
          />
        </View>

        <Text style={{ color: theme.colors.text, fontWeight: "900", marginTop: 6 }}>
          Amount
        </Text>
        <TextInput
          value={amount}
          onChangeText={onAmountChange}
          keyboardType="numeric"
          returnKeyType="done"
          onSubmitEditing={Keyboard.dismiss}
          placeholder="e.g 5"
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
            opacity: isCapitalRecoveryStore ? 0.6 : 1,
          }}
        />

        <Text style={{ color: theme.colors.text, fontWeight: "900", marginTop: 6 }}>
          Reason (optional)
        </Text>
        <TextInput
          value={reason}
          onChangeText={setReason}
          placeholder="mf: Damaged, Transfer, Adjustment..."
          placeholderTextColor="rgba(255,255,255,0.35)"
          multiline
          textAlignVertical="top"
          editable={!isCapitalRecoveryStore && !saving}
          style={{
            minHeight: 110,
            borderWidth: 1,
            borderColor: theme.colors.border,
            borderRadius: theme.radius.lg,
            backgroundColor: "rgba(255,255,255,0.05)",
            paddingHorizontal: 14,
            paddingVertical: 12,
            color: theme.colors.text,
            fontWeight: "800",
            opacity: isCapitalRecoveryStore ? 0.6 : 1,
          }}
        />

        <View style={{ gap: 10, marginTop: 2 }}>
          <Button
            title={
              isCapitalRecoveryStore
                ? "Adjust Disabled"
                : saving
                ? "Saving..."
                : "Submit"
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
    </Screen>
  );
}