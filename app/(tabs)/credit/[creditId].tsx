import { useOrg } from "@/src/context/OrgContext";
import { useOrgMoneyPrefs } from "@/src/ui/money";
import { supabase } from "@/src/supabase/supabaseClient";
import { Button } from "@/src/ui/Button";
import { Card } from "@/src/ui/Card";
import { Screen } from "@/src/ui/Screen";
import { theme } from "@/src/ui/theme";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import AddPaymentSheet from "./_components/AddPaymentSheet";
import PaymentRow, { Payment } from "./_components/PaymentRow";

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
  sale_id?: string | null;
};

type TxnWithRunning = Txn & {
  running_after: number;
  signed_delta: number;
};

function looksLikeUuid(s: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    s
  );
}

function extractSaleId(t: { sale_id?: string | null; reference?: string | null; note?: string | null }) {
  const direct = String(t.sale_id ?? "").trim();
  if (looksLikeUuid(direct)) return direct;

  const ref = String(t.reference ?? "").trim();
  if (looksLikeUuid(ref)) return ref;

  const note = String(t.note ?? "").trim();
  if (looksLikeUuid(note)) return note;

  const blob = `${ref} ${note}`.trim();
  const m = blob.match(
    /([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})/i
  );
  return m?.[1] ?? null;
}

export default function CreditDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ creditId: string }>();
  const accountId = String(params.creditId || "");

  const { activeRole, activeStoreId, activeOrgId } = useOrg();

  // ✅ single source of truth for money formatting
  const money = useOrgMoneyPrefs(String(activeOrgId ?? ""));

  const isOwnerAdmin = useMemo(
    () => activeRole === "owner" || activeRole === "admin",
    [activeRole]
  );

  // ✅ NEW: switch-aware permission (staff allowed only when store switch ON)
  const [canManageCredit, setCanManageCredit] = useState(false);

  const [account, setAccount] = useState<AccountRow | null>(null);
  const [txns, setTxns] = useState<Txn[]>([]);
  const [loading, setLoading] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  const balance = useMemo(() => Number(account?.balance ?? 0), [account]);

  // 🔒 Freeze rule (UX only): balance = 0
  const isCleared = useMemo(() => Number(balance) <= 0, [balance]);

  const payments: Payment[] = useMemo(() => {
    return txns
      .filter((t) => String(t.kind).toUpperCase() === "PAYMENT")
      .map((t) => ({
        id: String(t.id),
        amount: Number(t.amount ?? 0),
        payment_date: t.created_at ?? null,
        note: t.note ?? null,
        method: t.method ?? null,
        reference: t.reference ?? null,
      }));
  }, [txns]);

  const openReceipt = useCallback(
    (saleId: string) => {
      const s = String(saleId ?? "").trim();
      if (!s) return;
      router.push({ pathname: "/(tabs)/sales/receipt", params: { saleId: s } } as any);
    },
    [router]
  );

  const loadAccess = useCallback(async () => {
    try {
      if (!activeStoreId) {
        setCanManageCredit(false);
        return;
      }
      if (isOwnerAdmin) {
        setCanManageCredit(true);
        return;
      }

      const { data, error } = await supabase.rpc("can_manage_credit_for_store", {
        p_store_id: activeStoreId,
      } as any);

      if (error) throw error;
      setCanManageCredit(!!data);
    } catch {
      setCanManageCredit(false);
    }
  }, [activeStoreId, isOwnerAdmin]);

  const openPaymentSheet = useCallback(() => {
    if (isCleared) return;
    if (!canManageCredit) return;
    setSheetOpen(true);
  }, [isCleared, canManageCredit]);

  const load = useCallback(async () => {
    if (!accountId) return;

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
        return String(id) === String(accountId);
      });

      setAccount(
        row
          ? {
              account_id: String(row.account_id ?? row.credit_account_id ?? row.id),
              customer_name: row.customer_name ?? row.full_name ?? row.name ?? null,
              phone: row.phone ?? row.normalized_phone ?? null,
              balance: Number(row.balance ?? row.balance_amount ?? 0),
            }
          : { account_id: accountId, customer_name: "Customer", phone: null, balance: 0 }
      );

      const { data: t, error: te } = await supabase.rpc(
        "get_credit_account_transactions_v2",
        { p_credit_account_id: accountId, p_limit: 200 } as any
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

        const saleId =
          x.sale_id ??
          x.saleId ??
          x.saleID ??
          x.related_sale_id ??
          x.related_sale ??
          x.sale ??
          null;

        return {
          id: String(id),
          kind,
          amount: Number(amountRaw ?? 0),
          created_at,
          note,
          reference,
          method,
          sale_id: saleId != null ? String(saleId) : null,
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
      setErrMsg(e?.message ?? "Failed to load credit detail.");
    } finally {
      setLoading(false);
    }
  }, [accountId, activeStoreId]);

  useEffect(() => {
    loadAccess();
    load();
  }, [loadAccess, load]);

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

  if (loading) {
    return (
      <Screen>
        <View style={{ paddingVertical: 18 }}>
          <ActivityIndicator />
        </View>
      </Screen>
    );
  }

  const custName = account?.customer_name ?? "Customer";
  const custPhone = account?.phone ?? null;

  return (
    <Screen scroll bottomPad={220}>
      <View style={{ flex: 1, gap: 14 }}>
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
                Credit Detail
              </Text>
              <Text style={{ color: theme.colors.muted, marginTop: 4 }}>
                Transactions + taarifa za mteja.
              </Text>
            </View>
          </View>
        </View>

        {errMsg ? (
          <Card>
            <Text style={{ color: theme.colors.dangerText, fontWeight: "900" }}>{errMsg}</Text>
          </Card>
        ) : null}

        <Card style={{ gap: 10 }}>
          <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>Summary</Text>

          <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 18 }}>
            {custName}
          </Text>

          {custPhone ? (
            <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>{custPhone}</Text>
          ) : (
            <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>No phone</Text>
          )}

          <View
            style={{
              marginTop: 4,
              paddingVertical: 10,
              paddingHorizontal: 12,
              borderRadius: theme.radius.lg,
              borderWidth: 1,
              borderColor: "rgba(52,211,153,0.35)",
              backgroundColor: "rgba(52,211,153,0.10)",
            }}
          >
            <Text style={{ color: theme.colors.muted, fontWeight: "900" }}>Balance</Text>
            <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 18 }}>
              {money.fmt(balance)}
            </Text>
          </View>

          <View style={{ height: 6 }} />

          {isCleared ? (
            <View
              style={{
                borderWidth: 1,
                borderColor: theme.colors.emeraldBorder,
                backgroundColor: theme.colors.emeraldSoft,
                paddingVertical: 12,
                paddingHorizontal: 14,
                borderRadius: theme.radius.xl,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text style={{ color: theme.colors.emerald, fontWeight: "900", fontSize: 16 }}>
                Account Cleared 🔒
              </Text>
              <Text style={{ color: theme.colors.muted, marginTop: 6, textAlign: "center" }}>
                Balance ni 0. Malipo mapya hayaruhusiwi kwenye account hii.
              </Text>
            </View>
          ) : null}

          <Button
            title={isCleared ? "Account Cleared 🔒" : "Add Payment"}
            onPress={openPaymentSheet}
            disabled={!accountId || !canManageCredit || isCleared}
          />

          <Text style={{ color: theme.colors.faint, fontSize: 12 }}>
            {canManageCredit ? "Staff (Allowed) / Owner/Admin" : "Staff"} • Credit v2 • Transactions
          </Text>
        </Card>

        <Card style={{ gap: 10 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 16 }}>
              Recent Transactions
            </Text>
            <Pressable onPress={load} style={{ paddingVertical: 6, paddingHorizontal: 10 }}>
              <Text style={{ color: theme.colors.emerald, fontWeight: "900" }}>Refresh</Text>
            </Pressable>
          </View>

          {txnsWithRunning.length === 0 ? (
            <Text style={{ color: theme.colors.muted }}>No transactions yet.</Text>
          ) : (
            txnsWithRunning.map((t) => {
              const kind = String(t.kind).toUpperCase();
              const amtAbs = Math.abs(Number(t.amount ?? 0));
              const isPayment = kind === "PAYMENT";
              const isSale = kind === "SALE";

              const amountColor = isPayment ? theme.colors.text : theme.colors.emerald;
              const deltaLabel = isPayment ? `-${money.fmt(amtAbs)}` : `+${money.fmt(amtAbs)}`;
              const when = t.created_at ? new Date(t.created_at).toLocaleString() : "—";

              const saleIdForReceipt = isSale ? extractSaleId(t) : null;
              const canOpenReceipt = isSale && !!saleIdForReceipt;

              return (
                <View
                  key={t.id}
                  style={{
                    paddingTop: 10,
                    borderTopWidth: 1,
                    borderTopColor: "rgba(255,255,255,0.06)",
                  }}
                >
                  <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 10 }}>
                    <Text style={{ color: theme.colors.text, fontWeight: "900" }}>{kind}</Text>
                    <Text style={{ color: amountColor, fontWeight: "900" }}>{deltaLabel}</Text>
                  </View>

                  <Text style={{ color: theme.colors.muted, marginTop: 4, fontWeight: "900" }}>
                    Running:{" "}
                    <Text style={{ color: theme.colors.text }}>{money.fmt(t.running_after)}</Text>
                  </Text>

                  {!!t.method && isPayment ? (
                    <Text style={{ color: theme.colors.muted, marginTop: 4, fontWeight: "800" }}>
                      {String(t.method).toUpperCase()}
                      {t.reference ? ` • ${t.reference}` : ""}
                    </Text>
                  ) : null}

                  {!!t.note ? (
                    <Text style={{ color: theme.colors.muted, marginTop: 4 }}>{t.note}</Text>
                  ) : null}

                  <Text style={{ color: theme.colors.faint, marginTop: 6, fontSize: 12 }}>
                    {when}
                  </Text>

                  {canOpenReceipt ? (
                    <Pressable
                      onPress={() => openReceipt(String(saleIdForReceipt))}
                      hitSlop={10}
                      style={{ marginTop: 8, alignSelf: "flex-start" }}
                    >
                      <Text
                        style={{
                          color: theme.colors.emerald,
                          fontWeight: "900",
                          textDecorationLine: "underline",
                        }}
                      >
                        Open Receipt →
                      </Text>
                    </Pressable>
                  ) : null}
                </View>
              );
            })
          )}
        </Card>

        <Card style={{ gap: 10 }}>
          <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 16 }}>
            Payments
          </Text>

          {payments.length === 0 ? (
            <Text style={{ color: theme.colors.muted }}>No payments yet.</Text>
          ) : (
            payments.map((p) => <PaymentRow key={p.id} payment={p} />)
          )}
        </Card>

        <AddPaymentSheet
          visible={sheetOpen}
          creditId={accountId}
          canManageCredit={canManageCredit}
          onClose={() => setSheetOpen(false)}
          onSuccess={() => {
            loadAccess();
            load();
          }}
        />
      </View>
    </Screen>
  );
}

function cryptoRandomFallback() {
  return `${Date.now()}_${Math.floor(Math.random() * 1e9)}`;
}