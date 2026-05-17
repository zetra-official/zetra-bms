import { useOrg } from "@/src/context/OrgContext";
import { supabase } from "@/src/supabase/supabaseClient";
import { Button } from "@/src/ui/Button";
import { Card } from "@/src/ui/Card";
import { Screen } from "@/src/ui/Screen";
import { useOrgMoneyPrefs } from "@/src/ui/money";
import { theme } from "@/src/ui/theme";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  Share,
  Text,
  TextInput,
  View,
} from "react-native";

type AccountRow = {
  account_id: string;
  customer_name: string | null;
  phone?: string | null;
  balance: number | null;
};

type Txn = {
  id: string;
  kind: "SALE" | "PAYMENT" | string;
  amount: number;
  created_at: string | null;
  note: string | null;
  reference: string | null;
  method: string | null;
};

type TxnWithRunning = Txn & {
  running_after: number;
  signed_delta: number;
};

function cryptoRandomFallback() {
  return `${Date.now()}_${Math.floor(Math.random() * 1e9)}`;
}

export default function CreditPaymentReceiptScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ creditId?: string; paymentId?: string }>();

  const creditId = String(params.creditId ?? "").trim();
  const paymentId = String(params.paymentId ?? "").trim();

  const { activeOrgId, activeStoreName, activeStoreId } = useOrg();
  const money = useOrgMoneyPrefs(String(activeOrgId ?? ""));

  const [loading, setLoading] = useState(true);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [account, setAccount] = useState<AccountRow | null>(null);
  const [txns, setTxns] = useState<Txn[]>([]);

  const [editOpen, setEditOpen] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [deletingPayment, setDeletingPayment] = useState(false);
  const [editAmount, setEditAmount] = useState("");
  const [editMethod, setEditMethod] = useState("CASH");
  const [editReference, setEditReference] = useState("");
  const [editNote, setEditNote] = useState("");

  const load = useCallback(async () => {
    if (!creditId || !paymentId) {
      setErrMsg("Missing receipt params.");
      setLoading(false);
      return;
    }

    try {
      setErrMsg(null);
      setLoading(true);

      if (!activeStoreId) {
        setAccount(null);
        setTxns([]);
        setErrMsg("Missing activeStoreId. Chagua store kwanza.");
        return;
      }

      const { data: list, error: le } = await supabase.rpc(
        "get_store_credit_accounts_v2",
        { p_store_id: activeStoreId, p_status: "ALL" } as any
      );
      if (le) throw le;

      const row = ((list ?? []) as any[]).find((x) => {
        const id = x.account_id ?? x.credit_account_id ?? x.id;
        return String(id) === creditId;
      });

      setAccount(
        row
          ? {
              account_id: String(row.account_id ?? row.credit_account_id ?? row.id),
              customer_name: row.customer_name ?? row.full_name ?? row.name ?? null,
              phone: row.phone ?? row.normalized_phone ?? null,
              balance: Number(row.balance ?? row.balance_amount ?? 0),
            }
          : {
              account_id: creditId,
              customer_name: "Customer",
              phone: null,
              balance: 0,
            }
      );

      const { data: t, error: te } = await supabase.rpc(
        "get_credit_account_transactions_v2",
        { p_credit_account_id: creditId, p_limit: 200 } as any
      );
      if (te) throw te;

      const mapped: Txn[] = ((t ?? []) as any[]).map((x) => {
        const id = x.id ?? x.txn_id ?? x.transaction_id ?? cryptoRandomFallback();

        const kind =
          String(x.entry_type ?? x.kind ?? x.type ?? x.txn_type ?? x.entry_kind ?? "")
            .toUpperCase()
            .trim() || "TXN";

        const amountRaw = x.amount ?? x.delta ?? x.delta_amount ?? 0;
        const created_at =
          x.created_at ?? x.txn_date ?? x.transaction_date ?? x.inserted_at ?? null;

        const note = x.note ?? x.description ?? null;
        const reference = x.reference ?? x.ref ?? null;
        const method = x.payment_method ?? x.method ?? null;

        return {
          id: String(id),
          kind,
          amount: Number(amountRaw ?? 0),
          created_at,
          note,
          reference,
          method,
        };
      });

      mapped.sort((a, b) => {
        const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
        const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
        return tb - ta;
      });

      setTxns(mapped);
    } catch (e: any) {
      setAccount(null);
      setTxns([]);
      setErrMsg(e?.message ?? "Failed to load payment receipt.");
    } finally {
      setLoading(false);
    }
  }, [creditId, paymentId, activeStoreId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const txnsWithRunning: TxnWithRunning[] = useMemo(() => {
    if (!txns || txns.length === 0) return [];

    const chronological = [...txns].sort((a, b) => {
      const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
      const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
      return ta - tb;
    });

    let run = 0;
    const computedChrono: TxnWithRunning[] = chronological.map((t) => {
      const k = String(t.kind).toUpperCase();
      const amt = Math.abs(Number(t.amount ?? 0));
      const signed = k === "PAYMENT" ? -amt : k === "SALE" ? +amt : +Number(t.amount ?? 0);
      run = run + signed;

      return { ...t, signed_delta: signed, running_after: run };
    });

    computedChrono.sort((a, b) => {
      const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
      const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
      return tb - ta;
    });

    return computedChrono;
  }, [txns]);

  const paymentTxn = useMemo(
    () => txnsWithRunning.find((t) => String(t.id) === paymentId) ?? null,
    [txnsWithRunning, paymentId]
  );

  const amountPaid = Math.abs(Number(paymentTxn?.amount ?? 0));
  const balanceAfter = Number(paymentTxn?.running_after ?? 0);
  const balanceBefore = Number(paymentTxn?.running_after ?? 0) + amountPaid;
  const when = paymentTxn?.created_at ? new Date(paymentTxn.created_at).toLocaleString() : "—";

  const paymentMethodLabel = String(paymentTxn?.method ?? "CASH").toUpperCase();
  const paymentReferenceLabel = paymentTxn?.reference ? String(paymentTxn.reference) : "—";
  const paymentIdLabel = paymentTxn?.id ? String(paymentTxn.id) : "—";
  const paymentNoteLabel = paymentTxn?.note ? String(paymentTxn.note) : "—";

  const receiptText = [
    "ZETRA BMS",
    "CREDIT PAYMENT RECEIPT",
    "",
    `Customer: ${account?.customer_name ?? "Customer"}`,
    `Phone: ${account?.phone ?? "No phone"}`,
    `Store: ${activeStoreName ?? "—"}`,
    `Date/Time: ${when}`,
    "",
    `Debt Before Payment: ${money.fmt(balanceBefore)}`,
    `Paid Today: ${money.fmt(amountPaid)}`,
    `Balance After Payment: ${money.fmt(balanceAfter)}`,
    "",
    `Method: ${paymentMethodLabel}`,
    `Reference: ${paymentReferenceLabel}`,
    `Payment ID: ${paymentIdLabel.length > 18 ? `${paymentIdLabel.slice(0, 18)}…` : paymentIdLabel}`,
    `Note: ${paymentNoteLabel}`,
  ].join("\n");

  const onShareReceipt = useCallback(async () => {
    try {
      await Share.share({
        title: "Credit Payment Receipt",
        message: receiptText,
      });
    } catch {}
  }, [receiptText]);

  const onShareReceiptPdf = useCallback(async () => {
    const html = `
      <html>
        <head>
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <style>
            body { font-family: Arial, sans-serif; padding: 24px; color: #111827; }
            .top { border-bottom: 2px solid #10b981; padding-bottom: 14px; margin-bottom: 18px; }
            .brand { color: #047857; font-size: 14px; font-weight: 900; letter-spacing: 1px; }
            h1 { margin: 6px 0 4px; font-size: 26px; }
            .box { border: 1px solid #e5e7eb; border-radius: 12px; padding: 12px; margin-bottom: 10px; }
            .label { color: #6b7280; font-size: 12px; font-weight: 800; }
            .value { margin-top: 4px; font-weight: 900; }
            .total { border: 1px solid #10b981; background: #ecfdf5; border-radius: 14px; padding: 14px; margin-top: 16px; }
            .row { display: flex; justify-content: space-between; border-bottom: 1px solid #e5e7eb; padding: 10px 0; }
            .footer { margin-top: 24px; color: #6b7280; font-size: 12px; text-align:center; }
          </style>
        </head>
        <body>
          <div class="top">
            <div class="brand">ZETRA BMS</div>
            <h1>Credit Payment Receipt</h1>
            <div>Payment ID: ${paymentIdLabel}</div>
          </div>

          <div class="box"><div class="label">Customer</div><div class="value">${account?.customer_name ?? "Customer"}</div></div>
          <div class="box"><div class="label">Phone</div><div class="value">${account?.phone ?? "No phone"}</div></div>
          <div class="box"><div class="label">Store</div><div class="value">${activeStoreName ?? "—"}</div></div>
          <div class="box"><div class="label">Date / Time</div><div class="value">${when}</div></div>
          <div class="box"><div class="label">Method</div><div class="value">${paymentMethodLabel}</div></div>
          <div class="box"><div class="label">Reference</div><div class="value">${paymentReferenceLabel}</div></div>

          <div class="total">
            <div class="row"><strong>Debt Before Payment</strong><strong>${money.fmt(balanceBefore)}</strong></div>
            <div class="row"><strong>Paid Today</strong><strong>${money.fmt(amountPaid)}</strong></div>
            <div class="row"><strong>Balance After Payment</strong><strong>${money.fmt(balanceAfter)}</strong></div>
          </div>

          <div class="footer">Generated by ZETRA BMS • Official credit payment receipt.</div>
        </body>
      </html>
    `;

    try {
      const file = await Print.printToFileAsync({ html });
      await Sharing.shareAsync(file.uri, {
        mimeType: "application/pdf",
        dialogTitle: "Share Credit Payment Receipt PDF",
      });
    } catch (e: any) {
      Alert.alert("PDF failed", e?.message ?? "Failed to create PDF.");
    }
  }, [
    paymentIdLabel,
    account?.customer_name,
    account?.phone,
    activeStoreName,
    when,
    paymentMethodLabel,
    paymentReferenceLabel,
    money,
    balanceBefore,
    amountPaid,
    balanceAfter,
  ]);

  const openEdit = useCallback(() => {
    setEditAmount(String(amountPaid || ""));
    setEditMethod(paymentMethodLabel || "CASH");
    setEditReference(paymentTxn?.reference ? String(paymentTxn.reference) : "");
    setEditNote(paymentTxn?.note ? String(paymentTxn.note) : "");
    setEditOpen(true);
  }, [amountPaid, paymentMethodLabel, paymentTxn?.reference, paymentTxn?.note]);

  const saveEdit = useCallback(async () => {
    const amt = Number(String(editAmount).replace(/[, ]+/g, ""));
    if (!Number.isFinite(amt) || amt <= 0) {
      Alert.alert("Invalid", "Weka kiasi sahihi cha malipo.");
      return;
    }

    try {
      setSavingEdit(true);
      const { error } = await supabase.rpc("edit_credit_payment_v1", {
        p_payment_id: paymentId,
        p_amount: amt,
        p_method: editMethod,
        p_reference: editReference.trim() || null,
        p_note: editNote.trim() || null,
      } as any);

      if (error) throw error;

      setEditOpen(false);
      await load();
      Alert.alert("Updated", "Payment imebadilishwa vizuri.");
    } catch (e: any) {
      Alert.alert("Edit failed", e?.message ?? "Failed to edit payment.");
    } finally {
      setSavingEdit(false);
    }
  }, [editAmount, editMethod, editReference, editNote, paymentId, load]);

  const deletePayment = useCallback(() => {
    Alert.alert(
      "Delete Payment?",
      "Ukifuta payment hii, deni la mteja litarudi kuongezeka kulingana na kiasi cha payment.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              setDeletingPayment(true);
              const { error } = await supabase.rpc("delete_credit_payment_v1", {
                p_payment_id: paymentId,
              } as any);

              if (error) throw error;

              Alert.alert("Deleted", "Payment imefutwa vizuri.");
              router.replace({
                pathname: "/(tabs)/credit/[creditId]",
                params: { creditId },
              } as any);
            } catch (e: any) {
              Alert.alert("Delete failed", e?.message ?? "Failed to delete payment.");
            } finally {
              setDeletingPayment(false);
            }
          },
        },
      ]
    );
  }, [paymentId, router, creditId]);

  const onPrintReceipt = useCallback(() => {
    if (Platform.OS === "web" && typeof window !== "undefined") {
      window.print();
      return;
    }
    void onShareReceiptPdf();
  }, [onShareReceiptPdf]);

  if (loading) {
    return (
      <Screen>
        <View style={{ paddingVertical: 18 }}>
          <ActivityIndicator />
        </View>
      </Screen>
    );
  }

  if (errMsg) {
    return (
      <Screen>
        <Card>
          <Text style={{ color: theme.colors.danger, fontWeight: "900" }}>{errMsg}</Text>
        </Card>
      </Screen>
    );
  }

  if (!paymentTxn) {
    return (
      <Screen>
        <Card>
          <Text style={{ color: theme.colors.text, fontWeight: "900" }}>
            Payment receipt not found.
          </Text>
        </Card>
      </Screen>
    );
  }

  return (
    <Screen scroll bottomPad={120}>
      <View style={{ gap: 14 }}>
        <View style={{ paddingTop: 6, paddingBottom: 6 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <Pressable
              onPress={() => router.back()}
              hitSlop={10}
              style={{
                width: 44,
                height: 44,
                borderRadius: 999,
                alignItems: "center",
                justifyContent: "center",
                borderWidth: 1,
                borderColor: "rgba(148,163,184,0.22)",
                backgroundColor: "#FFFFFF",
              }}
            >
              <Ionicons name="chevron-back" size={22} color={theme.colors.text} />
            </Pressable>

            <View style={{ flex: 1 }}>
              <Text style={{ color: theme.colors.text, fontSize: 22, fontWeight: "900" }}>
                Credit Payment Receipt
              </Text>
              <Text style={{ color: theme.colors.muted, marginTop: 4 }}>
                Risiti ya punguzo la deni.
              </Text>
            </View>
          </View>
        </View>

        <Card
          style={{
            gap: 14,
            padding: 18,
            borderColor: "rgba(148,163,184,0.22)",
            backgroundColor: "#FFFFFF",
            shadowColor: "#0F172A",
            shadowOpacity: 0.08,
            shadowRadius: 14,
            shadowOffset: { width: 0, height: 8 },
            elevation: 3,
          }}
        >
          <View style={{ alignItems: "center", gap: 4 }}>
            <Text
              style={{
                color: theme.colors.text,
                fontWeight: "900",
                fontSize: 20,
                letterSpacing: 0.6,
              }}
            >
              ZETRA BMS
            </Text>
            <Text
              style={{
                color: theme.colors.muted,
                fontWeight: "900",
                fontSize: 12,
                letterSpacing: 1.2,
              }}
            >
              CREDIT PAYMENT RECEIPT
            </Text>
          </View>

          <View
            style={{
              height: 1,
              backgroundColor: "rgba(148,163,184,0.20)",
            }}
          />

          <View style={{ gap: 10 }}>
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                gap: 12,
              }}
            >
              <Text style={{ color: theme.colors.muted, fontWeight: "800", flex: 0.95 }}>
                Customer
              </Text>
              <Text
                style={{
                  color: theme.colors.text,
                  fontWeight: "900",
                  flex: 1.4,
                  textAlign: "right",
                }}
              >
                {account?.customer_name ?? "Customer"}
              </Text>
            </View>

            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                gap: 12,
              }}
            >
              <Text style={{ color: theme.colors.muted, fontWeight: "800", flex: 0.95 }}>
                Phone
              </Text>
              <Text
                style={{
                  color: theme.colors.text,
                  fontWeight: "900",
                  flex: 1.4,
                  textAlign: "right",
                }}
              >
                {account?.phone ?? "No phone"}
              </Text>
            </View>

            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                gap: 12,
              }}
            >
              <Text style={{ color: theme.colors.muted, fontWeight: "800", flex: 0.95 }}>
                Store
              </Text>
              <Text
                style={{
                  color: theme.colors.text,
                  fontWeight: "900",
                  flex: 1.4,
                  textAlign: "right",
                }}
              >
                {activeStoreName ?? "—"}
              </Text>
            </View>

            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                gap: 12,
              }}
            >
              <Text style={{ color: theme.colors.muted, fontWeight: "800", flex: 0.95 }}>
                Date / Time
              </Text>
              <Text
                style={{
                  color: theme.colors.text,
                  fontWeight: "900",
                  flex: 1.4,
                  textAlign: "right",
                }}
              >
                {when}
              </Text>
            </View>

            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                gap: 12,
              }}
            >
              <Text style={{ color: theme.colors.muted, fontWeight: "800", flex: 0.95 }}>
                Method
              </Text>
              <Text
                style={{
                  color: theme.colors.text,
                  fontWeight: "900",
                  flex: 1.4,
                  textAlign: "right",
                }}
              >
                {paymentMethodLabel}
              </Text>
            </View>

            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                gap: 12,
              }}
            >
              <Text style={{ color: theme.colors.muted, fontWeight: "800", flex: 0.95 }}>
                Reference
              </Text>
              <Text
                style={{
                  color: theme.colors.text,
                  fontWeight: "900",
                  flex: 1.4,
                  textAlign: "right",
                }}
              >
                {paymentReferenceLabel}
              </Text>
            </View>

            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                gap: 12,
              }}
            >
              <Text style={{ color: theme.colors.muted, fontWeight: "800", flex: 0.95 }}>
                Payment ID
              </Text>
              <Text
                style={{
                  color: theme.colors.text,
                  fontWeight: "900",
                  flex: 1.4,
                  textAlign: "right",
                }}
              >
                {paymentIdLabel}
              </Text>
            </View>
          </View>

          <View
            style={{
              height: 1,
              backgroundColor: "rgba(148,163,184,0.20)",
            }}
          />

          <View
            style={{
              borderWidth: 1,
              borderColor: "rgba(148,163,184,0.22)",
              borderRadius: theme.radius.xl,
              overflow: "hidden",
            }}
          >
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                paddingHorizontal: 14,
                paddingVertical: 12,
                backgroundColor: "#F8FAFC",
              }}
            >
              <Text style={{ color: theme.colors.muted, fontWeight: "900" }}>
                Debt Before Payment
              </Text>
              <Text style={{ color: theme.colors.text, fontWeight: "900" }}>
                {money.fmt(balanceBefore)}
              </Text>
            </View>

            <View
              style={{
                height: 1,
                backgroundColor: "rgba(148,163,184,0.18)",
              }}
            />

            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                paddingHorizontal: 14,
                paddingVertical: 12,
                backgroundColor: "rgba(16,185,129,0.08)",
              }}
            >
              <Text style={{ color: theme.colors.muted, fontWeight: "900" }}>
                Paid Today
              </Text>
              <Text style={{ color: theme.colors.emerald, fontWeight: "900" }}>
                {money.fmt(amountPaid)}
              </Text>
            </View>

            <View
              style={{
                height: 1,
                backgroundColor: "rgba(148,163,184,0.18)",
              }}
            />

            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                paddingHorizontal: 14,
                paddingVertical: 12,
                backgroundColor: "rgba(255,255,255,0.04)",
              }}
            >
              <Text style={{ color: theme.colors.muted, fontWeight: "900" }}>
                Balance After Payment
              </Text>
              <Text style={{ color: theme.colors.text, fontWeight: "900" }}>
                {money.fmt(balanceAfter)}
              </Text>
            </View>
          </View>

          <View
            style={{
              height: 1,
              backgroundColor: "rgba(148,163,184,0.20)",
            }}
          />

          <View style={{ alignItems: "center", gap: 6 }}>
            <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 13 }}>
              THANK YOU
            </Text>
            <Text
              style={{
                color: theme.colors.muted,
                fontWeight: "800",
                fontSize: 12,
                textAlign: "center",
                lineHeight: 18,
              }}
            >
              Hii ni risiti rasmi ya punguzo la deni la mteja.
            </Text>
            <Text
              style={{
                color: theme.colors.faint,
                fontWeight: "800",
                fontSize: 11.5,
                textAlign: "center",
              }}
            >
              {paymentTxn?.note ? String(paymentTxn.note) : "No extra note"}
            </Text>
          </View>
        </Card>

        <View style={{ gap: 10 }}>
          <Pressable
            onPress={onShareReceipt}
            style={({ pressed }) => ({
              minHeight: 56,
              borderRadius: 18,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: "#059669",
              opacity: pressed ? 0.9 : 1,
              shadowColor: "#059669",
              shadowOpacity: 0.18,
              shadowRadius: 12,
              shadowOffset: { width: 0, height: 8 },
              elevation: 3,
            })}
          >
            <Text style={{ color: "#FFFFFF", fontWeight: "900", fontSize: 16 }}>
              Share Receipt
            </Text>
          </Pressable>

          <Button
            title="Share as PDF"
            onPress={onShareReceiptPdf}
            variant="secondary"
          />

          <Button
            title="Edit Payment"
            onPress={openEdit}
            variant="secondary"
          />

          <Button
            title={deletingPayment ? "Deleting..." : "Delete Payment"}
            onPress={deletePayment}
            variant="secondary"
          />

          <Button
            title="Back to Credit Detail"
            onPress={() => router.back()}
            variant="secondary"
          />
        </View>
      </View>

      <Modal
        visible={editOpen}
        transparent
        animationType="fade"
        presentationStyle="overFullScreen"
        onRequestClose={() => setEditOpen(false)}
      >
        <View style={{ flex: 1, backgroundColor: "rgba(15,23,42,0.42)", justifyContent: "flex-end" }}>
          <Pressable
            onPress={() => setEditOpen(false)}
            style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0 }}
          />

          <View
            style={{
              backgroundColor: "#FFFFFF",
              borderTopLeftRadius: 28,
              borderTopRightRadius: 28,
              padding: 18,
              gap: 12,
              borderWidth: 1,
              borderColor: "rgba(148,163,184,0.22)",
            }}
          >
            <Text style={{ color: theme.colors.text, fontSize: 22, fontWeight: "900" }}>
              Edit Payment
            </Text>

            <TextInput
              value={editAmount}
              onChangeText={setEditAmount}
              keyboardType="numeric"
              placeholder="Amount"
              placeholderTextColor={theme.colors.faint}
              style={{
                borderWidth: 1,
                borderColor: "rgba(148,163,184,0.24)",
                borderRadius: 18,
                paddingHorizontal: 14,
                paddingVertical: 14,
                color: theme.colors.text,
                fontWeight: "900",
                fontSize: 16,
              }}
            />

            <View style={{ flexDirection: "row", gap: 10 }}>
              {["CASH", "MOBILE", "BANK"].map((m) => {
                const active = editMethod === m;
                return (
                  <Pressable
                    key={m}
                    onPress={() => setEditMethod(m)}
                    style={{
                      flex: 1,
                      minHeight: 46,
                      borderRadius: 999,
                      borderWidth: 1,
                      borderColor: active ? theme.colors.emeraldBorder : "rgba(148,163,184,0.24)",
                      backgroundColor: active ? "rgba(16,185,129,0.10)" : "#FFFFFF",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Text style={{ color: active ? theme.colors.emerald : theme.colors.text, fontWeight: "900" }}>
                      {m}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <TextInput
              value={editReference}
              onChangeText={setEditReference}
              placeholder="Reference optional"
              placeholderTextColor={theme.colors.faint}
              style={{
                borderWidth: 1,
                borderColor: "rgba(148,163,184,0.24)",
                borderRadius: 18,
                paddingHorizontal: 14,
                paddingVertical: 14,
                color: theme.colors.text,
                fontWeight: "900",
              }}
            />

            <TextInput
              value={editNote}
              onChangeText={setEditNote}
              placeholder="Note optional"
              placeholderTextColor={theme.colors.faint}
              multiline
              style={{
                minHeight: 76,
                borderWidth: 1,
                borderColor: "rgba(148,163,184,0.24)",
                borderRadius: 18,
                paddingHorizontal: 14,
                paddingVertical: 14,
                color: theme.colors.text,
                fontWeight: "800",
              }}
            />

            <Pressable
              onPress={saveEdit}
              disabled={savingEdit}
              style={{
                minHeight: 54,
                borderRadius: 18,
                backgroundColor: "#059669",
                alignItems: "center",
                justifyContent: "center",
                opacity: savingEdit ? 0.6 : 1,
              }}
            >
              <Text style={{ color: "#FFFFFF", fontWeight: "900", fontSize: 16 }}>
                {savingEdit ? "Saving..." : "Save Changes"}
              </Text>
            </Pressable>

            <Pressable
              onPress={() => setEditOpen(false)}
              style={{
                minHeight: 54,
                borderRadius: 18,
                borderWidth: 1,
                borderColor: "rgba(148,163,184,0.24)",
                backgroundColor: "#FFFFFF",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 16 }}>
                Cancel
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}