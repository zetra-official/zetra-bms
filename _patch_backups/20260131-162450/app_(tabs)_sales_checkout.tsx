// app/(tabs)/sales/checkout.tsx
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import { Alert, Pressable, Text, TextInput, View } from "react-native";
import { useOrg } from "../../../src/context/OrgContext";
import { supabase } from "../../../src/supabase/supabaseClient";
import { Button } from "../../../src/ui/Button";
import { Card } from "../../../src/ui/Card";
import { Screen } from "../../../src/ui/Screen";
import { theme } from "../../../src/ui/theme";

type CartItem = {
  product_id: string;
  name: string;
  sku: string | null;
  qty: number;
  unit: string | null;
};

function one(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : v;
}

type PayMethod = "CASH" | "MOBILE" | "CREDIT";

export default function CheckoutScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    storeId?: string | string[];
    storeName?: string | string[];
    cart?: string | string[];
  }>();

  const { activeStoreId, activeStoreName, activeRole } = useOrg();

  const storeId = (one(params.storeId) ?? "").trim();
  const storeNameParam = (one(params.storeName) ?? "").trim();

  const cart: CartItem[] = useMemo(() => {
    try {
      const raw = one(params.cart);
      if (!raw) return [];
      const decoded = decodeURIComponent(raw);
      const parsed = JSON.parse(decoded);
      if (!Array.isArray(parsed)) return [];
      return parsed
        .map((x: any) => ({
          product_id: String(x.product_id ?? ""),
          name: String(x.name ?? "Product"),
          sku: x.sku ?? null,
          qty: Number(x.qty ?? 0),
          unit: x.unit ?? null,
        }))
        .filter((x) => x.product_id && x.qty > 0);
    } catch {
      return [];
    }
  }, [params.cart]);

  const canSell = useMemo(() => {
    const r = (activeRole ?? "staff") as "owner" | "admin" | "staff";
    return r === "owner" || r === "admin" || r === "staff";
  }, [activeRole]);

  const totalQty = useMemo(() => cart.reduce((a, c) => a + (c.qty || 0), 0), [cart]);

  const [note, setNote] = useState("");
  const [method, setMethod] = useState<PayMethod>("CASH");
  const [paidAmount, setPaidAmount] = useState<string>("");
  const [saving, setSaving] = useState(false);

  const invalidReason = useMemo(() => {
    if (!canSell) return "No permission to sell.";
    if (!storeId) return "Missing storeId.";
    if (cart.length === 0) return "Cart is empty.";
    return null;
  }, [canSell, storeId, cart.length]);

  const callCreateSale = useCallback(async () => {
    const items = cart.map((c) => ({
      product_id: c.product_id,
      qty: Math.trunc(Number(c.qty)),
    }));

    const base = {
      p_store_id: storeId,
      p_items: items,
      p_note: note.trim() || null,
      p_payment_method: method,
      p_paid_amount: paidAmount.trim() ? Number(paidAmount.trim()) : null,
    };

    let res = await supabase.rpc("create_sale", base as any);
    if (!res.error) return res;

    res = await supabase.rpc("create_sale", {
      p_store_id: storeId,
      p_sale_items: items,
      p_note: note.trim() || null,
      p_payment_method: method,
      p_paid_amount: paidAmount.trim() ? Number(paidAmount.trim()) : null,
    } as any);
    if (!res.error) return res;

    res = await supabase.rpc("create_sale", {
      p_store_id: storeId,
      p_items_json: items,
      p_note: note.trim() || null,
      p_payment_method: method,
      p_paid_amount: paidAmount.trim() ? Number(paidAmount.trim()) : null,
    } as any);

    return res;
  }, [cart, storeId, note, method, paidAmount]);

  const confirm = useCallback(async () => {
    if (saving) return;

    if (invalidReason) {
      Alert.alert("Blocked", invalidReason);
      return;
    }

    if (paidAmount.trim()) {
      const n = Number(paidAmount.trim());
      if (!Number.isFinite(n) || n < 0) {
        Alert.alert("Invalid", "Paid amount lazima iwe namba halali (>= 0).");
        return;
      }
    }

    setSaving(true);
    try {
      const access = await supabase.rpc("ensure_my_store_access", {
        p_store_id: storeId,
      });
      if (access.error) throw access.error;

      const { data, error } = await callCreateSale();
      if (error) throw error;

      let saleId: string | null = null;
      if (typeof data === "string") saleId = data;
      else if (data?.sale_id) saleId = data.sale_id;
      else if (Array.isArray(data) && data[0]?.sale_id) saleId = data[0].sale_id;

      Alert.alert("Success ✅", "Sale created");

      if (saleId) {
        router.replace({
          pathname: "/(tabs)/sales/receipt",
          params: { saleId },
        } as any);
      } else {
        router.replace("/(tabs)/sales/history" as any);
      }
    } catch (e: any) {
      Alert.alert("Failed", e?.message ?? "Unknown error");
    } finally {
      setSaving(false);
    }
  }, [saving, invalidReason, paidAmount, storeId, callCreateSale, router]);

  const headerStoreName = storeNameParam || activeStoreName || "—";
  const mismatch = activeStoreId && storeId && activeStoreId !== storeId;

  return (
    <Screen bottomPad={140}>
      <View style={{ flex: 1, gap: 14 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <Pressable
            onPress={() => router.back()}
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
            <Ionicons name="chevron-back" size={22} color={theme.colors.text} />
          </Pressable>

          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 26, fontWeight: "900", color: theme.colors.text }}>
              Checkout
            </Text>
            <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>
              Store: {headerStoreName}
            </Text>
          </View>
        </View>

        {mismatch && (
          <Card>
            <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>
              Note: Active store imebadilika. Checkout inatumia store iliyoletwa (storeId).
            </Text>
          </Card>
        )}

        <Card style={{ gap: 10 }}>
          <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>Summary</Text>
          <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 18 }}>
            {cart.length} items • {totalQty} qty
          </Text>

          {cart.slice(0, 4).map((c) => (
            <View
              key={c.product_id}
              style={{ flexDirection: "row", justifyContent: "space-between", gap: 10, paddingTop: 6 }}
            >
              <Text style={{ color: theme.colors.text, fontWeight: "800", flex: 1 }} numberOfLines={1}>
                {c.name}
              </Text>
              <Text style={{ color: theme.colors.muted, fontWeight: "900" }}>x{c.qty}</Text>
            </View>
          ))}

          {cart.length > 4 && (
            <Text style={{ color: theme.colors.muted, fontWeight: "800", marginTop: 6 }}>
              +{cart.length - 4} more...
            </Text>
          )}
        </Card>

        <Card style={{ gap: 10 }}>
          <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 16 }}>
            Payment
          </Text>

          <View style={{ flexDirection: "row", gap: 10 }}>
            <Button
              title="CASH"
              variant="secondary"
              onPress={() => setMethod("CASH")}
              style={{
                flex: 1,
                borderColor: method === "CASH" ? "rgba(52,211,153,0.55)" : theme.colors.border,
              }}
            />
            <Button
              title="MOBILE"
              variant="secondary"
              onPress={() => setMethod("MOBILE")}
              style={{
                flex: 1,
                borderColor: method === "MOBILE" ? "rgba(52,211,153,0.55)" : theme.colors.border,
              }}
            />
            <Button
              title="CREDIT"
              variant="secondary"
              onPress={() => setMethod("CREDIT")}
              style={{
                flex: 1,
                borderColor: method === "CREDIT" ? "rgba(52,211,153,0.55)" : theme.colors.border,
              }}
            />
          </View>

          <Text style={{ color: theme.colors.text, fontWeight: "900", marginTop: 6 }}>
            Paid Amount (optional)
          </Text>
          <TextInput
            value={paidAmount}
            onChangeText={(t) => setPaidAmount(t.replace(/[^\d]/g, ""))}
            keyboardType="numeric"
            placeholder="e.g 20000"
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
            Note (optional)
          </Text>
          <TextInput
            value={note}
            onChangeText={setNote}
            placeholder="mf: Discount, Customer name, Reference..."
            placeholderTextColor="rgba(255,255,255,0.35)"
            multiline
            textAlignVertical="top"
            style={{
              minHeight: 90,
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
        </Card>

        <Card style={{ gap: 10 }}>
          <Button
            title={saving ? "Creating..." : "Confirm Sale"}
            onPress={confirm}
            disabled={saving || !!invalidReason}
            variant="primary"
          />

          <Button title="Back" onPress={() => router.back()} disabled={saving} variant="secondary" />

          {!!invalidReason && (
            <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>
              {invalidReason}
            </Text>
          )}
        </Card>
      </View>
    </Screen>
  );
}


