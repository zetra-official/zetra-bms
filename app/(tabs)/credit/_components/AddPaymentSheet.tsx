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
  onSuccess?: () => void;
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
        borderColor: active ? "rgba(52,211,153,0.40)" : theme.colors.border,
        backgroundColor: active ? "rgba(52,211,153,0.12)" : "rgba(255,255,255,0.06)",
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

  const [kbH, setKbH] = useState(0);

  useEffect(() => {
    const show = Keyboard.addListener("keyboardDidShow", (e) => {
      setKbH(e.endCoordinates?.height ?? 0);
    });
    const hide = Keyboard.addListener("keyboardDidHide", () => setKbH(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

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

      const { error } = await supabase.rpc(
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

      Keyboard.dismiss();
      onClose();
      onSuccess?.();
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
  const FOOTER_H = 132 + bottomGap;
  const maxSheetH = Math.min(SCREEN_H * 0.92, SCREEN_H - topGap);
  const minSheetH = 520;

  const availableH = Math.max(360, SCREEN_H - kbH - topGap);
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
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.72)" }}>
        <Pressable
          onPress={onClose}
          style={{ position: "absolute", left: 0, top: 0, right: 0, bottom: 0 }}
        />

        <KeyboardAvoidingView
          style={{ flex: 1, justifyContent: "flex-end" }}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          keyboardVerticalOffset={0}
        >
          <Pressable onPress={() => {}} style={{ width: "100%" }}>
            <View
              style={{
                width: "100%",
                height: sheetH,
                borderTopLeftRadius: theme.radius.xl,
                borderTopRightRadius: theme.radius.xl,
                borderWidth: 1,
                borderColor: theme.colors.borderSoft,
                backgroundColor: "rgba(11,15,20,0.96)",
                overflow: "hidden",
              }}
            >
              <View
                style={{
                  paddingHorizontal: 16,
                  paddingTop: 16,
                  paddingBottom: 12,
                  borderBottomWidth: 1,
                  borderBottomColor: theme.colors.border,
                  backgroundColor: "rgba(11,15,20,0.98)",
                }}
              >
                <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 22 }}>
                  Add Payment
                </Text>
                <Text style={{ color: theme.colors.muted, marginTop: 4 }}>
                  {String(activeRole ?? "role")} • Credit v2 • {accessLabel}
                </Text>
              </View>

              <ScrollView
                style={{ maxHeight: bodyMaxH }}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="on-drag"
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{
                  paddingHorizontal: 16,
                  paddingTop: 14,
                  paddingBottom: bodyPadBottom,
                  gap: 14,
                }}
              >
                <View
                  style={{
                    borderWidth: 1,
                    borderColor: theme.colors.border,
                    borderRadius: theme.radius.xl,
                    backgroundColor: "rgba(255,255,255,0.03)",
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
                    placeholderTextColor="rgba(255,255,255,0.30)"
                    style={{
                      borderWidth: 1,
                      borderColor: theme.colors.border,
                      borderRadius: theme.radius.lg,
                      backgroundColor: "rgba(255,255,255,0.05)",
                      paddingHorizontal: 14,
                      paddingVertical: 12,
                      color: theme.colors.text,
                      fontWeight: "900",
                    }}
                  />
                </View>

                <View
                  style={{
                    borderWidth: 1,
                    borderColor: theme.colors.border,
                    borderRadius: theme.radius.xl,
                    backgroundColor: "rgba(255,255,255,0.03)",
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
                          placeholderTextColor="rgba(255,255,255,0.30)"
                          style={{
                            borderWidth: 1,
                            borderColor: theme.colors.border,
                            borderRadius: theme.radius.lg,
                            backgroundColor: "rgba(255,255,255,0.05)",
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
                          placeholderTextColor="rgba(255,255,255,0.30)"
                          style={{
                            borderWidth: 1,
                            borderColor: theme.colors.border,
                            borderRadius: theme.radius.lg,
                            backgroundColor: "rgba(255,255,255,0.05)",
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
                    borderColor: theme.colors.border,
                    borderRadius: theme.radius.xl,
                    backgroundColor: "rgba(255,255,255,0.03)",
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
                    placeholderTextColor="rgba(255,255,255,0.30)"
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
                </View>
              </ScrollView>

              <View
                style={{
                  paddingHorizontal: 16,
                  paddingTop: 14,
                  paddingBottom: 14 + bottomGap,
                  borderTopWidth: 1,
                  borderTopColor: theme.colors.border,
                  backgroundColor: "rgba(11,15,20,0.98)",
                  gap: 10,
                }}
              >
                <Pressable
                  onPress={save}
                  disabled={!canSave}
                  style={({ pressed }) => ({
                    borderRadius: theme.radius.xl,
                    paddingVertical: 16,
                    alignItems: "center",
                    justifyContent: "center",
                    borderWidth: 1,
                    borderColor: theme.colors.emeraldBorder,
                    backgroundColor: theme.colors.emeraldSoft,
                    opacity: !canSave ? 0.55 : pressed ? 0.92 : 1,
                  })}
                >
                  {loading ? (
                    <ActivityIndicator />
                  ) : (
                    <Text style={{ color: theme.colors.emerald, fontWeight: "900", fontSize: 16 }}>
                      Save Payment
                    </Text>
                  )}
                </Pressable>

                <Pressable
                  onPress={onClose}
                  style={({ pressed }) => ({
                    borderRadius: theme.radius.xl,
                    paddingVertical: 16,
                    alignItems: "center",
                    justifyContent: "center",
                    borderWidth: 1,
                    borderColor: theme.colors.borderSoft,
                    backgroundColor: "rgba(255,255,255,0.04)",
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