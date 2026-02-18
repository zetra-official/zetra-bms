// app/(tabs)/stores/adjust.tsx
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Keyboard,
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

// ✅ local YYYY-MM-DD
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

  const { activeRole, activeStoreId, activeStoreName } = useOrg();

  const canAdjust = useMemo(() => {
    const r = (activeRole ?? "staff") as "owner" | "admin" | "staff";
    return r === "owner" || r === "admin";
  }, [activeRole]);

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

  // ✅ threshold state
  const [threshold, setThreshold] = useState<string>(""); // empty => no alert
  const [thresholdLoading, setThresholdLoading] = useState(false);
  const [thresholdSaving, setThresholdSaving] = useState(false);

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

  // hydrate product name/sku if missing
  useEffect(() => {
    let cancelled = false;

    async function hydrateFromDb() {
      if (passedName) {
        setDisplayName(passedName);
        if (passedSku) setDisplaySku(passedSku);
        return;
      }

      if (!productId) return;

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

    hydrateFromDb();
    return () => {
      cancelled = true;
    };
  }, [productId, passedName, passedSku, activeStoreId]);

  // ✅ load existing threshold (best-effort)
  const loadThreshold = useCallback(async () => {
    if (!activeStoreId || !productId) return;
    setThresholdLoading(true);
    try {
      const { data, error } = await supabase
        .from("inventory")
        .select("low_stock_threshold")
        .eq("store_id", activeStoreId)
        .eq("product_id", productId)
        .maybeSingle();

      if (!error) {
        const v = (data as any)?.low_stock_threshold;
        if (v === null || v === undefined) setThreshold("");
        else setThreshold(String(v));
      }
    } catch {
      // ignore
    } finally {
      setThresholdLoading(false);
    }
  }, [activeStoreId, productId]);

  useEffect(() => {
    void loadThreshold();
  }, [loadThreshold]);

  const onAmountChange = useCallback((txt: string) => {
    const cleaned = txt.replace(/[^\d]/g, "");
    setAmount(cleaned);
  }, []);

  const onThresholdChange = useCallback((txt: string) => {
    const cleaned = txt.replace(/[^\d]/g, "");
    setThreshold(cleaned);
  }, []);

  // ✅ UI guard: block if day locked
  const ensureNotLockedToday = useCallback(async () => {
    if (!activeStoreId) return false;

    const today = localYMD();
    const { data, error } = await supabase.rpc("is_closing_locked", {
      p_store_id: activeStoreId,
      p_date: today,
    });

    if (error) {
      // if rpc fails, we do NOT block UI here (DB trigger still blocks)
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
  }, [activeStoreId]);

  // ✅ save threshold via RPC
  const saveThreshold = useCallback(async () => {
    if (thresholdSaving) return;

    if (!activeStoreId) return Alert.alert("Missing", "No active store selected.");
    if (!productId) return Alert.alert("Missing", "Product not found.");
    if (!canAdjust) return Alert.alert("No Access", "Owner/Admin only.");

    const raw = (threshold ?? "").trim();
    const value = raw === "" ? null : asInt(Number(raw));

    if (raw !== "" && (!Number.isFinite(Number(raw)) || value === null || value < 0)) {
      return Alert.alert(
        "Invalid",
        "Threshold lazima iwe namba >= 0, au uache tupu kuondoa alert."
      );
    }

    setThresholdSaving(true);
    try {
      const res = await supabase.rpc("set_low_stock_threshold", {
        p_store_id: activeStoreId,
        p_product_id: productId,
        p_threshold: value,
      } as any);

      if (res.error) throw res.error;

      Alert.alert(
        "Saved ✅",
        value === null ? "Alert level removed." : `Alert itatoka qty ikifika ${value} au chini.`
      );

      void loadThreshold();
    } catch (err: any) {
      Alert.alert("Failed", err?.message ?? "Failed to save alert level");
    } finally {
      setThresholdSaving(false);
    }
  }, [thresholdSaving, activeStoreId, productId, canAdjust, threshold, loadThreshold]);

  const submit = useCallback(async () => {
    if (saving) return;

    if (!activeStoreId) return Alert.alert("Missing", "No active store selected.");
    if (!productId) return Alert.alert("Missing", "Product not found.");
    if (!canAdjust) return Alert.alert("No Access", "Owner/Admin only.");

    const okToProceed = await ensureNotLockedToday();
    if (!okToProceed) return;

    const trimmed = (amount ?? "").trim();
    if (!trimmed) return Alert.alert("Invalid", "Amount lazima iandikwe.");

    const n = Number(trimmed);
    if (!Number.isFinite(n) || n <= 0) return Alert.alert("Invalid", "Amount lazima iwe namba > 0");

    const intAmount = asInt(n);
    if (intAmount <= 0) return Alert.alert("Invalid", "Amount lazima iwe namba halali (> 0).");

    setSaving(true);
    try {
      const access = await supabase.rpc("ensure_my_store_access", {
        p_store_id: activeStoreId,
      });
      if (access.error) throw access.error;

      // ✅ FIX: use canonical adjust_stock (updates public.inventory)
      const { data, error } = await supabase.rpc("adjust_stock", {
        p_store_id: activeStoreId,
        p_product_id: productId,
        p_amount: Math.abs(intAmount),
        p_mode: mode, // "ADD" | "REDUCE"
        p_note: reason?.trim() ? reason.trim() : null,
      } as any);

      if (error) throw error;

      // adjust_stock returns TABLE(new_qty integer) - usually array with 1 row
      const newQty =
        Array.isArray(data) && data.length > 0 ? (data[0] as any)?.new_qty : null;

      Alert.alert(
        "Success ✅",
        newQty === null ? "Stock updated" : `New Qty: ${newQty}`
      );

      router.back();
    } catch (err: any) {
      Alert.alert("Failed", err?.message ?? "Unknown error");
    } finally {
      setSaving(false);
    }
  }, [
    saving,
    activeStoreId,
    productId,
    canAdjust,
    ensureNotLockedToday,
    amount,
    reason,
    mode,
    router,
  ]);

  return (
    <Screen scroll bottomPad={kbHeight > 0 ? kbHeight + 24 : 160}>
      <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
        <View style={{ flex: 1, gap: 14 }}>
          <Text style={{ fontSize: 26, fontWeight: "900", color: theme.colors.text }}>
            Adjust Stock
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
          </Card>

          {/* Alert Threshold */}
          <Card style={{ gap: 10 }}>
            <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 16 }}>
              Low Stock Alert Level
            </Text>

            <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>
              Ikitokea QTY ikawa ≤ kiwango ulichoweka, mfumo uta-log alert (once per day).
            </Text>

            <Text style={{ color: theme.colors.text, fontWeight: "900", marginTop: 4 }}>
              Alert when qty ≤ (optional)
            </Text>

            <TextInput
              value={threshold}
              onChangeText={onThresholdChange}
              keyboardType="numeric"
              returnKeyType="done"
              onSubmitEditing={Keyboard.dismiss}
              placeholder={thresholdLoading ? "Loading..." : "e.g 10 (leave empty to disable)"}
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
                <Button
                  title={thresholdSaving ? "Saving..." : "Save Alert Level"}
                  onPress={() => {
                    Keyboard.dismiss();
                    saveThreshold();
                  }}
                  disabled={thresholdSaving || !canAdjust}
                  variant="secondary"
                />
              </View>

              <View style={{ flex: 1 }}>
                <Button
                  title="Reload"
                  onPress={() => {
                    Keyboard.dismiss();
                    loadThreshold();
                  }}
                  disabled={thresholdLoading}
                  variant="secondary"
                />
              </View>
            </View>

            {!canAdjust && (
              <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>
                (Read-only) Muombe Owner/Admin kuweka alert level.
              </Text>
            )}
          </Card>

          {/* Stock Adjustment */}
          <Card style={{ gap: 10 }}>
            <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 16 }}>
              Mode
            </Text>

            <View style={{ flexDirection: "row", gap: 10 }}>
              <Button
                title="ADD"
                variant="secondary"
                onPress={() => setMode("ADD")}
                style={{
                  flex: 1,
                  borderColor: mode === "ADD" ? "rgba(52,211,153,0.55)" : theme.colors.border,
                }}
              />

              <Button
                title="REDUCE"
                variant="secondary"
                onPress={() => setMode("REDUCE")}
                style={{
                  flex: 1,
                  borderColor: mode === "REDUCE" ? theme.colors.dangerBorder : theme.colors.border,
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
              }}
            />

            <View style={{ gap: 10, marginTop: 2 }}>
              <Button
                title={saving ? "Saving..." : "Submit"}
                onPress={() => {
                  Keyboard.dismiss();
                  submit();
                }}
                disabled={saving}
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

            {!canAdjust && (
              <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>
                Huna ruhusa ya kubadili stock. (Owner/Admin only)
              </Text>
            )}
          </Card>
        </View>
      </TouchableWithoutFeedback>
    </Screen>
  );
}