// app/(tabs)/credit/cleared.tsx
import { useOrg } from "@/src/context/OrgContext";
import { supabase } from "@/src/supabase/supabaseClient";
import { Card } from "@/src/ui/Card";
import { Screen } from "@/src/ui/Screen";
import { theme } from "@/src/ui/theme";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, Text, View } from "react-native";

type CreditAccountRow = {
  account_id: string;
  customer_name: string | null;
  phone: string | null;
  balance: number | null;
};

function fmtTZS(n: number) {
  try {
    return new Intl.NumberFormat("en-TZ", {
      style: "currency",
      currency: "TZS",
      maximumFractionDigits: 0,
    }).format(n);
  } catch {
    return `TZS ${n}`;
  }
}

export default function CreditClearedScreen() {
  const router = useRouter();
  const { activeStoreId, activeStoreName, activeRole } = useOrg();

  const roleLabel = useMemo(() => {
    if (!activeRole) return "—";
    return String(activeRole).toUpperCase();
  }, [activeRole]);

  const [rows, setRows] = useState<CreditAccountRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setErrMsg(null);
      setLoading(true);

      if (!activeStoreId) {
        setRows([]);
        setErrMsg("Chagua store kwanza. Credit ni store-scoped.");
        return;
      }

      // ✅ FIX: now function is (uuid, text) only => always pass p_status
      const { data, error } = await supabase.rpc(
        "get_store_credit_accounts_v2",
        {
          p_store_id: activeStoreId,
          p_status: "ALL",
        } as any
      );

      if (error) throw error;

      // ✅ Cleared: balance <= 0
      const mapped: CreditAccountRow[] = ((data ?? []) as any[])
        .map((x) => {
          const id = x.account_id ?? x.credit_account_id ?? x.id;
          return {
            account_id: String(id),
            customer_name: x.customer_name ?? x.full_name ?? x.name ?? null,
            phone: x.phone ?? x.normalized_phone ?? null,
            balance: Number(x.balance ?? x.balance_amount ?? 0),
          };
        })
        .filter((r) => Number(r.balance ?? 0) <= 0);

      mapped.sort((a, b) =>
        String(a.customer_name ?? "").localeCompare(String(b.customer_name ?? ""))
      );

      setRows(mapped);
    } catch (e: any) {
      setRows([]);
      setErrMsg(e?.message ?? "Failed to load cleared accounts.");
    } finally {
      setLoading(false);
    }
  }, [activeStoreId]);

  useEffect(() => {
    load();
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  function openAccount(accountId: string) {
    router.push({
      pathname: "/(tabs)/credit/[creditId]",
      params: { creditId: accountId },
    } as any);
  }

  const headerSubtitle = useMemo(() => {
    return `Store: ${activeStoreName ?? "No active store"} • Role: ${roleLabel}`;
  }, [activeStoreName, roleLabel]);

  return (
    <Screen scroll bottomPad={160}>
      <View style={{ paddingTop: 6, paddingBottom: 10 }}>
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
            <Text style={{ color: theme.colors.text, fontSize: 20, fontWeight: "900" }}>
              Cleared
            </Text>
            <Text style={{ color: theme.colors.muted, marginTop: 4, fontWeight: "800" }}>
              Credit v2 – Paid Off
            </Text>
          </View>
        </View>
      </View>

      <Card style={{ padding: 14, gap: 12 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <View
            style={{
              width: 52,
              height: 52,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: theme.colors.borderSoft,
              backgroundColor: "rgba(255,255,255,0.04)",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Ionicons name="checkmark-done-outline" size={22} color={theme.colors.text} />
          </View>

          <View style={{ flex: 1 }}>
            <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 16 }}>
              Cleared Accounts
            </Text>
            <Text style={{ color: theme.colors.faint, fontWeight: "900", marginTop: 4 }}>
              {headerSubtitle}
            </Text>
          </View>
        </View>

        <View
          style={{
            borderWidth: 1,
            borderColor: "rgba(255,255,255,0.10)",
            backgroundColor: "rgba(255,255,255,0.04)",
            borderRadius: theme.radius.xl,
            padding: 12,
            gap: 6,
          }}
        >
          <Text style={{ color: theme.colors.text, fontWeight: "900" }}>Info</Text>
          <Text style={{ color: theme.colors.muted, fontWeight: "800", lineHeight: 18 }}>
            Hawa ni wateja waliomaliza deni (balance = 0). Unabaki na history yao hapa.
          </Text>
        </View>

        {!activeStoreId ? (
          <View
            style={{
              borderWidth: 1,
              borderColor: theme.colors.dangerBorder,
              backgroundColor: theme.colors.dangerSoft,
              padding: 12,
              borderRadius: theme.radius.xl,
            }}
          >
            <Text style={{ color: theme.colors.dangerText, fontWeight: "900" }}>
              Chagua store kwanza
            </Text>
            <Text style={{ color: theme.colors.dangerText, marginTop: 4 }}>
              Activate store kisha list itaonekana hapa.
            </Text>
          </View>
        ) : null}

        {errMsg ? (
          <View
            style={{
              borderWidth: 1,
              borderColor: theme.colors.dangerBorder,
              backgroundColor: theme.colors.dangerSoft,
              padding: 12,
              borderRadius: theme.radius.xl,
            }}
          >
            <Text style={{ color: theme.colors.dangerText, fontWeight: "900" }}>{errMsg}</Text>
          </View>
        ) : null}

        {loading ? (
          <View style={{ paddingVertical: 16 }}>
            <ActivityIndicator />
          </View>
        ) : rows.length === 0 && activeStoreId ? (
          <View style={{ paddingVertical: 10 }}>
            <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>
              No cleared accounts yet.
            </Text>
            <Text style={{ color: theme.colors.faint, marginTop: 6 }}>
              (Wakitoka kwenye wadaiwa—baada ya malipo kamili—wataonekana hapa.)
            </Text>
          </View>
        ) : (
          <FlatList
            data={rows}
            keyExtractor={(it) => it.account_id}
            scrollEnabled={false}
            ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
            renderItem={({ item }) => {
              const name = item.customer_name ?? "Customer";
              const phone = item.phone ?? "No phone";
              const bal = Number(item.balance ?? 0);

              return (
                <Pressable
                  onPress={() => openAccount(item.account_id)}
                  hitSlop={10}
                  style={({ pressed }) => ({
                    borderWidth: 1,
                    borderColor: "rgba(255,255,255,0.10)",
                    backgroundColor: "rgba(255,255,255,0.04)",
                    borderRadius: theme.radius.xl,
                    padding: 12,
                    opacity: pressed ? 0.92 : 1,
                  })}
                >
                  <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 10 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: theme.colors.text, fontWeight: "900" }}>{name}</Text>
                      <Text style={{ color: theme.colors.faint, marginTop: 4, fontWeight: "800" }}>
                        {phone}
                      </Text>
                    </View>

                    <View style={{ alignItems: "flex-end" }}>
                      <Text style={{ color: theme.colors.muted, fontSize: 12 }}>Balance</Text>
                      <Text style={{ color: theme.colors.text, fontWeight: "900" }}>
                        {fmtTZS(Math.max(0, bal))}
                      </Text>
                    </View>
                  </View>

                  <View style={{ height: 10 }} />
                  <Text style={{ color: theme.colors.emerald, fontWeight: "900" }}>Open →</Text>
                </Pressable>
              );
            }}
          />
        )}

        <Pressable
          onPress={load}
          hitSlop={10}
          style={({ pressed }) => ({
            height: 48,
            borderRadius: theme.radius.xl,
            borderWidth: 1,
            borderColor: theme.colors.emeraldBorder,
            backgroundColor: theme.colors.emeraldSoft,
            alignItems: "center",
            justifyContent: "center",
            opacity: pressed ? 0.92 : 1,
          })}
        >
          <Text style={{ color: theme.colors.emerald, fontWeight: "900", fontSize: 16 }}>
            Refresh
          </Text>
        </Pressable>
      </Card>
    </Screen>
  );
}