// app/(tabs)/credit/_components/AddPaymentSheet.tsx
import { useOrg } from "@/src/context/OrgContext";
import { supabase } from "@/src/supabase/supabaseClient";
import { theme } from "@/src/ui/theme";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type Props = {
  visible: boolean;
  creditId: string;
  canManageCredit: boolean; // ✅ NEW
  onClose: () => void;
  onSuccess?: (paymentId?: string) => void;
};

type PayMethod = "CASH" | "MOBILE" | "BANK";

function asNumber(v: string) {
  const n = Number(String(v).replace(/[, ]+/g, "").trim());
  return Number.isFinite(n) ? n : 0;
}

const { height: SCREEN_H } = Dimensions.get("window");

function MethodChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        flex: 1,
        paddingVertical: 10,
        borderRadius: theme.radius.pill,
        borderWidth: 1,
        borderColor: active ? theme.colors.emeraldBorder : "rgba(148,163,184,0.22)",
        backgroundColor: active ? "rgba(16,185,129,0.10)" : "#FFFFFF",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text style={{ color: active ? theme.colors.emerald : theme.colors.text, fontWeight: "900" }}>
        {label}
      </Text>
    </Pressable>
  );
}

export default function AddPaymentSheet({
  visible,
  creditId,
  canManageCredit,
  onClose,
  onSuccess,
}: Props) {
  const insets = useSafeAreaInsets();
  const { activeStoreId, activeRole } = useOrg();

  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<PayMethod>("CASH");
  const [channel, setChannel] = useState("");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);

  

  useEffect(() => {
    if (!visible) return;
    setAmount("");
    setMethod("CASH");
    setChannel("");
    setReference("");
    setNote("");
    setLoading(false);
  }, [visible]);

  const invalidReason = useMemo(() => {
    const amt = asNumber(amount);

    if (!activeStoreId) return "Missing active store. Chagua store kwanza.";
    if (!canManageCredit) return "Hauruhusiwi kurekodi malipo ya credit kwenye store hii.";
    if (!creditId) return "Missing credit account id.";
    if (!(amt > 0)) return "Ingiza kiasi sahihi cha malipo.";

    if (method === "MOBILE") {
      if (!channel.trim()) return "Chagua channel ya Mobile (mf: M-PESA).";
      if (!reference.trim()) return "Weka reference/transaction id ya Mobile.";
    }
    if (method === "BANK") {
      if (!channel.trim()) return "Weka jina la benki (mf: NMB/CRDB).";
      if (!reference.trim()) return "Weka reference/slip no. ya benki.";
    }

    return null;
  }, [activeStoreId, canManageCredit, creditId, amount, method, channel, reference]);

  const canSave = useMemo(() => !loading && !invalidReason, [loading, invalidReason]);

  const onSetMethod = useCallback(
    (m: PayMethod) => {
      setMethod(m);
      if (m === "CASH") {
        setChannel("");
        setReference("");
      }
      if (m === "MOBILE") {
        if (!channel) setChannel("M-PESA");
      }
      if (m === "BANK") {
        // leave empty
      }
    },
    [channel]
  );

  async function save() {
    if (loading) return;

    if (invalidReason) {
      Alert.alert("Blocked", invalidReason);
      return;
    }

    try {
      setLoading(true);

      const refPacked =
        method === "CASH"
          ? null
          : `${(channel || "").trim()}${channel?.trim() ? " • " : ""}${reference.trim()}`.trim();

      const { data, error } = await supabase.rpc(
        "record_credit_payment_v2",
        {
          p_store_id: activeStoreId,
          p_credit_account_id: creditId,
          p_amount: asNumber(amount),
          p_method: (method || "CASH").trim().toUpperCase(),
          p_reference: refPacked || null,
          p_note: note?.trim() || null,
        } as any
      );

      if (error) throw error;

      const paymentId = String(data ?? "").trim() || undefined;

      Keyboard.dismiss();
      onClose();
      onSuccess?.(paymentId);
    } catch (e: any) {
      Alert.alert("Payment failed", e?.message ?? "Failed to save payment.");
    } finally {
      setLoading(false);
    }
  }

  const accessLabel = canManageCredit ? "Allowed" : "Blocked";
  const topGap = Math.max(insets.top, 10) + 8;
  const bottomGap = Math.max(insets.bottom, 10);

  const HEADER_H = 86;
  const FOOTER_H = 150 + bottomGap;
  const maxSheetH = Math.min(SCREEN_H * 0.84, SCREEN_H - topGap - 18);
  const minSheetH = Math.min(500, SCREEN_H * 0.76);

  const availableH = Math.max(360, SCREEN_H - topGap - 18);
  const sheetH = Math.max(Math.min(maxSheetH, availableH), minSheetH);

  const bodyMaxH = Math.max(220, sheetH - HEADER_H - FOOTER_H);
  const bodyPadBottom = Math.max(18, FOOTER_H + 18);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      presentationStyle="overFullScreen"
      hardwareAccelerated
      onRequestClose={onClose}
    >
      <View style={{ flex: 1, backgroundColor: "rgba(15,23,42,0.38)" }}>
        <Pressable
          onPress={onClose}
          style={{ position: "absolute", left: 0, top: 0, right: 0, bottom: 0 }}
        />

        <KeyboardAvoidingView
          style={{ flex: 1, justifyContent: "flex-end" }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          keyboardVerticalOffset={0}
        >
          <Pressable onPress={() => {}} style={{ width: "100%" }}>
            <View
              style={{
                width: "100%",
                height: sheetH,
                borderTopLeftRadius: 28,
                borderTopRightRadius: 28,
                borderWidth: 1,
                borderColor: "rgba(148,163,184,0.22)",
                backgroundColor: "#FFFFFF",
                overflow: "hidden",
                shadowColor: "#0F172A",
                shadowOpacity: 0.18,
                shadowRadius: 22,
                shadowOffset: { width: 0, height: -8 },
                elevation: 12,
              }}
            >
              <View
                style={{
                  paddingHorizontal: 18,
                  paddingTop: 14,
                  paddingBottom: 12,
                  borderBottomWidth: 1,
                  borderBottomColor: "rgba(148,163,184,0.18)",
                  backgroundColor: "#FFFFFF",
                }}
              >
                <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 20 }}>
                  Add Payment
                </Text>
                <Text style={{ color: theme.colors.muted, marginTop: 4 }}>
                  {String(activeRole ?? "role")} • Credit v2 • {accessLabel}
                </Text>
              </View>

              <ScrollView
                style={{ maxHeight: bodyMaxH }}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="none"
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{
                  paddingHorizontal: 18,
                  paddingTop: 16,
                  paddingBottom: bodyPadBottom + 90,
                  gap: 12,
                }}
              >
                <View
                  style={{
                    borderWidth: 1,
                    borderColor: "rgba(148,163,184,0.20)",
                    borderRadius: 20,
                    backgroundColor: "#FFFFFF",
                    padding: 14,
                    gap: 10,
                  }}
                >
                  <Text style={{ color: theme.colors.muted, fontWeight: "900" }}>Amount</Text>

                  <TextInput
                    value={amount}
                    onChangeText={setAmount}
                    keyboardType="numeric"
                    placeholder="mf: 50000"
                    placeholderTextColor={theme.colors.faint}
                    style={{
                      borderWidth: 1,
                      borderColor: "rgba(148,163,184,0.22)",
                      borderRadius: 18,
                      backgroundColor: "#FFFFFF",
                      paddingHorizontal: 14,
                      paddingVertical: 12,
                      color: theme.colors.text,
                      fontWeight: "900",
                      fontSize: 16,
                    }}
                  />
                </View>

                <View
                  style={{
                    borderWidth: 1,
                    borderColor: "rgba(148,163,184,0.20)",
                    borderRadius: 20,
                    backgroundColor: "#FFFFFF",
                    padding: 14,
                    gap: 12,
                  }}
                >
                  <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 16 }}>
                    Payment
                  </Text>

                  <View style={{ flexDirection: "row", gap: 10 }}>
                    <MethodChip
                      label="Cash"
                      active={method === "CASH"}
                      onPress={() => onSetMethod("CASH")}
                    />
                    <MethodChip
                      label="Mobile"
                      active={method === "MOBILE"}
                      onPress={() => onSetMethod("MOBILE")}
                    />
                  </View>

                  <View style={{ flexDirection: "row", gap: 10 }}>
                    <MethodChip
                      label="Bank"
                      active={method === "BANK"}
                      onPress={() => onSetMethod("BANK")}
                    />
                    <View style={{ flex: 1 }} />
                  </View>

                  {(method === "MOBILE" || method === "BANK") && (
                    <View style={{ gap: 10 }}>
                      <View style={{ gap: 8 }}>
                        <Text style={{ color: theme.colors.muted, fontWeight: "900" }}>
                          {method === "MOBILE" ? "Mobile Channel" : "Bank"}
                        </Text>
                        <TextInput
                          value={channel}
                          onChangeText={setChannel}
                          placeholder={method === "MOBILE" ? "mf: M-PESA" : "mf: NMB/CRDB"}
                          placeholderTextColor={theme.colors.faint}
                          style={{
                            borderWidth: 1,
                            borderColor: "rgba(148,163,184,0.22)",
                            borderRadius: 18,
                            backgroundColor: "#FFFFFF",
                            paddingHorizontal: 14,
                            paddingVertical: 12,
                            color: theme.colors.text,
                            fontWeight: "900",
                          }}
                        />
                      </View>

                      <View style={{ gap: 8 }}>
                        <Text style={{ color: theme.colors.muted, fontWeight: "900" }}>
                          Reference / Transaction ID
                        </Text>
                        <TextInput
                          value={reference}
                          onChangeText={setReference}
                          placeholder="mf: TXN123456"
                          placeholderTextColor={theme.colors.faint}
                          style={{
                            borderWidth: 1,
                            borderColor: "rgba(148,163,184,0.22)",
                            borderRadius: 18,
                            backgroundColor: "#FFFFFF",
                            paddingHorizontal: 14,
                            paddingVertical: 12,
                            color: theme.colors.text,
                            fontWeight: "900",
                          }}
                        />
                      </View>
                    </View>
                  )}
                </View>

                <View
                  style={{
                    borderWidth: 1,
                    borderColor: "rgba(148,163,184,0.20)",
                    borderRadius: 20,
                    backgroundColor: "#FFFFFF",
                    padding: 14,
                    gap: 10,
                  }}
                >
                  <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 16 }}>
                    Note (optional)
                  </Text>

                  <TextInput
                    value={note}
                    onChangeText={setNote}
                    placeholder="mf: customer paid cash"
                    placeholderTextColor={theme.colors.faint}
                    multiline
                    textAlignVertical="top"
                    style={{
                      minHeight: 68,
                      borderWidth: 1,
                      borderColor: "rgba(148,163,184,0.22)",
                      borderRadius: 18,
                      backgroundColor: "#FFFFFF",
                      paddingHorizontal: 14,
                      paddingVertical: 12,
                      color: theme.colors.text,
                      fontWeight: "800",
                    }}
                  />
                </View>
              </ScrollView>

              <View
                style={{
                  paddingHorizontal: 18,
                  paddingTop: 12,
                  paddingBottom: 12 + bottomGap,
                  borderTopWidth: 1,
                  borderTopColor: "rgba(148,163,184,0.18)",
                  backgroundColor: "#FFFFFF",
                  gap: 10,
                }}
              >
                <Pressable
                  onPress={save}
                  disabled={!canSave}
                  style={({ pressed }) => ({
                    borderRadius: 18,
                    paddingVertical: 16,
                    alignItems: "center",
                    justifyContent: "center",
                    borderWidth: 1,
                    borderColor: theme.colors.emeraldBorder,
                    backgroundColor: canSave ? "#059669" : "rgba(16,185,129,0.22)",
                    opacity: pressed ? 0.92 : 1,
                  })}
                >
                  {loading ? (
                    <ActivityIndicator />
                  ) : (
                    <Text style={{ color: "#FFFFFF", fontWeight: "900", fontSize: 16 }}>
                      Save Payment
                    </Text>
                  )}
                </Pressable>

                <Pressable
                  onPress={onClose}
                  style={({ pressed }) => ({
                    borderRadius: 18,
                    paddingVertical: 16,
                    alignItems: "center",
                    justifyContent: "center",
                    borderWidth: 1,
                    borderColor: "rgba(148,163,184,0.24)",
                    backgroundColor: "#FFFFFF",
                    opacity: pressed ? 0.92 : 1,
                  })}
                >
                  <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 16 }}>
                    Close
                  </Text>
                </Pressable>

                {!!invalidReason && (
                  <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>
                    {invalidReason}
                  </Text>
                )}
              </View>
            </View>
          </Pressable>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}