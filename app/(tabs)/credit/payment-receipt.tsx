import { useOrg } from "@/src/context/OrgContext";
import { supabase } from "@/src/supabase/supabaseClient";
import { Button } from "@/src/ui/Button";
import { Card } from "@/src/ui/Card";
import { Screen } from "@/src/ui/Screen";
import { useOrgMoneyPrefs } from "@/src/ui/money";
import { theme } from "@/src/ui/theme";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Platform, Pressable, Share, Text, View } from "react-native";

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
    `Payment ID: ${paymentIdLabel}`,
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

  const onPrintReceipt = useCallback(() => {
    if (Platform.OS === "web" && typeof window !== "undefined") {
      window.print();
      return;
    }
    void onShareReceipt();
  }, [onShareReceipt]);

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
                borderColor: theme.colors.border,
                backgroundColor: "rgba(255,255,255,0.06)",
              }}
            >
              <Ionicons name="chevron-back" size={22} color={theme.colors.text} />
            </Pressable>

            <View style={{ flex: 1 }}>
              <Text style={{ color: theme.colors.text, fontSize: 18, fontWeight: "900" }}>
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
            borderColor: "rgba(255,255,255,0.12)",
            backgroundColor: "#0B1118",
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
              backgroundColor: "rgba(255,255,255,0.10)",
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
              backgroundColor: "rgba(255,255,255,0.10)",
            }}
          />

          <View
            style={{
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.10)",
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
                backgroundColor: "rgba(255,255,255,0.04)",
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
                backgroundColor: "rgba(255,255,255,0.08)",
              }}
            />

            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                paddingHorizontal: 14,
                paddingVertical: 12,
                backgroundColor: "rgba(16,185,129,0.10)",
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
                backgroundColor: "rgba(255,255,255,0.08)",
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
              backgroundColor: "rgba(255,255,255,0.10)",
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
          <Button
            title="Share Receipt"
            onPress={onShareReceipt}
            variant="primary"
          />

          <Button
            title={Platform.OS === "web" ? "Print Receipt" : "Print / Share Receipt"}
            onPress={onPrintReceipt}
            variant="secondary"
          />

          <Button
            title="Back to Credit Detail"
            onPress={() => router.back()}
            variant="secondary"
          />
        </View>
      </View>
    </Screen>
  );
}