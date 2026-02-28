// src/ui/PriceModal.tsx
import React, { useEffect, useMemo, useRef } from "react";
import {
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { Button } from "./Button";
import { Card } from "./Card";
import { Input } from "./Input";
import { theme } from "./theme";
import { formatMoney } from "./money";

type Props = {
  visible: boolean;

  title?: string;
  productName: string;

  price: string;
  qty: string;

  // ✅ NEW (optional): used for "ASARA" warning
  costPrice?: number | null;

  // ✅ NEW (optional): currency/locale for display formatting (backward compatible)
  currency?: string | null;
  locale?: string | null;

  error?: string | null;

  onChangePrice: (v: string) => void;
  onChangeQty: (v: string) => void;

  onClose: () => void;
  onConfirm: () => void;
};

function PriceModalImpl({
  visible,
  title = "Add with Price",
  productName,
  price,
  qty,
  costPrice = null,
  currency = null,
  locale = null,
  error,
  onChangePrice,
  onChangeQty,
  onClose,
  onConfirm,
}: Props) {
  const qtyRef = useRef<any>(null);

  useEffect(() => {
    if (!visible) return;
    const t = setTimeout(() => Keyboard.dismiss(), 0);
    return () => clearTimeout(t);
  }, [visible]);

  const safeProductName = useMemo(
    () => (productName?.trim() ? productName : ""),
    [productName]
  );

  const priceNumber = useMemo(() => {
    const n = Number(String(price ?? "").trim());
    return Number.isFinite(n) ? n : null;
  }, [price]);

  const fmt = useCallbackLike(
    (n: number) => formatMoney(n, { currency: currency ?? undefined, locale: locale ?? undefined }).replace(/\s+/g, " "),
    [currency, locale]
  );

  const isLoss = useMemo(() => {
    if (costPrice == null) return false;
    if (priceNumber == null) return false;
    return priceNumber > 0 && priceNumber < Number(costPrice);
  }, [costPrice, priceNumber]);

  const lossText = useMemo(() => {
    if (!isLoss) return null;
    return `⚠ ASARA: Bei uliyoweka iko chini ya Cost (${fmt(Number(costPrice ?? 0))}).`;
  }, [costPrice, fmt, isLoss]);

  const unitLabel = useMemo(() => {
    const c = String(currency ?? "").trim().toUpperCase();
    return c ? `Unit price (${c})` : "Unit price";
  }, [currency]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      presentationStyle="overFullScreen"
      statusBarTranslucent
      hardwareAccelerated
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "padding"}
        keyboardVerticalOffset={0}
      >
        <Pressable
          onPress={() => {
            Keyboard.dismiss();
            onClose();
          }}
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
                maxHeight: "85%",
              }}
            >
              <ScrollView
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ gap: 12 }}
              >
                <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 18 }}>
                  {title}
                </Text>

                <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>
                  Product:{" "}
                  <Text style={{ color: theme.colors.text, fontWeight: "900" }}>
                    {safeProductName}
                  </Text>
                </Text>

                {/* ✅ Show cost if available */}
                {costPrice != null && (
                  <Text style={{ color: theme.colors.faint, fontWeight: "900" }}>
                    Cost: {fmt(Math.trunc(Number(costPrice)))}
                  </Text>
                )}

                <View style={{ gap: 10 }}>
                  <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>
                    {unitLabel}
                  </Text>
                  <Input
                    value={price}
                    onChangeText={onChangePrice}
                    placeholder="mf: 15000"
                    keyboardType="numeric"
                    returnKeyType="next"
                    onSubmitEditing={() => qtyRef.current?.focus?.()}
                  />

                  {/* ✅ Loss warning */}
                  {!!lossText && (
                    <Text style={{ color: theme.colors.dangerText, fontWeight: "900" }}>
                      {lossText}
                    </Text>
                  )}

                  <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>Qty</Text>
                  <Input
                    ref={qtyRef}
                    value={qty}
                    onChangeText={onChangeQty}
                    placeholder="1"
                    keyboardType="numeric"
                    returnKeyType="done"
                    onSubmitEditing={() => {
                      Keyboard.dismiss();
                      onConfirm();
                    }}
                  />
                </View>

                {!!error && (
                  <Text style={{ color: theme.colors.dangerText, fontWeight: "900" }}>
                    {error}
                  </Text>
                )}

                <View style={{ flexDirection: "row", gap: 10, marginTop: 2 }}>
                  <Button
                    title="Cancel"
                    onPress={() => {
                      Keyboard.dismiss();
                      onClose();
                    }}
                    variant="secondary"
                    style={{ flex: 1 }}
                  />
                  <Button
                    title="Add"
                    onPress={() => {
                      Keyboard.dismiss();
                      onConfirm();
                    }}
                    variant="primary"
                    style={{ flex: 1 }}
                  />
                </View>

                <Text style={{ color: theme.colors.muted, fontWeight: "800", marginTop: 6 }}>
                  Tip: Uki-add product ambayo tayari ipo cart, itaongeza qty na itaendelea kutumia
                  bei ya mwanzo.
                </Text>
              </ScrollView>
            </Card>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/**
 * Tiny hook helper (keeps file self-contained, avoids adding new deps).
 * Behaves like useCallback but we only need stable identity + deps.
 */
function useCallbackLike<T extends (...args: any[]) => any>(fn: T, deps: any[]): T {
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const ref = React.useRef(fn);
  ref.current = fn;
  // eslint-disable-next-line react-hooks/rules-of-hooks
  return React.useMemo(() => ((...args: any[]) => ref.current(...args)) as T, deps);
}

export const PriceModal = PriceModalImpl;
export default PriceModalImpl;