// app/(tabs)/credit/index.tsx
import { useOrg } from "@/src/context/OrgContext";
import { supabase } from "@/src/supabase/supabaseClient";
import { Card } from "@/src/ui/Card";
import { Screen } from "@/src/ui/Screen";
import { theme } from "@/src/ui/theme";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
    ActivityIndicator,
    FlatList,
    Pressable,
    Text,
    TextInput,
    View,
} from "react-native";

type CreditAccountRow = {
  account_id: string;
  customer_name: string | null;
  phone: string | null;
  balance: number | null;
};

type SortKey = "BAL_DESC" | "BAL_ASC" | "NAME_ASC";

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

function norm(s: any) {
  return String(s ?? "").toLowerCase().trim();
}

export default function CreditHomeScreen() {
  const router = useRouter();
  const { activeRole, activeStoreId, activeStoreName } = useOrg();

  const isOwnerAdmin = useMemo(
    () => activeRole === "owner" || activeRole === "admin",
    [activeRole]
  );

  // ✅ NEW: store switch permission for staff
  const [canStaffManage, setCanStaffManage] = useState(false);

  const roleLabel = useMemo(() => {
    if (!activeRole) return "—";
    return String(activeRole).toUpperCase();
  }, [activeRole]);

  const [rows, setRows] = useState<CreditAccountRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  const [q, setQ] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("BAL_DESC");

  const loadAccess = useCallback(async () => {
    try {
      if (!activeStoreId) {
        setCanStaffManage(false);
        return;
      }
      if (isOwnerAdmin) {
        setCanStaffManage(true);
        return;
      }

      // staff: ask DB helper (switch aware)
      const { data, error } = await supabase.rpc("can_manage_credit_for_store", {
        p_store_id: activeStoreId,
      } as any);

      if (error) throw error;
      setCanStaffManage(!!data);
    } catch {
      setCanStaffManage(false);
    }
  }, [activeStoreId, isOwnerAdmin]);

  const load = useCallback(async () => {
    try {
      setErrMsg(null);
      setLoading(true);

      if (!activeStoreId) {
        setRows([]);
        setErrMsg("Chagua store kwanza. Credit ni store-scoped.");
        return;
      }

      // ✅ FIX: pass p_status because DB keeps (uuid, text) signature
      const { data, error } = await supabase.rpc(
        "get_store_credit_accounts_v2",
        {
          p_store_id: activeStoreId,
          p_status: "ALL",
        } as any
      );

      if (error) throw error;

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
        .filter((r) => Number(r.balance ?? 0) > 0);

      mapped.sort((a, b) => Number(b.balance ?? 0) - Number(a.balance ?? 0));
      setRows(mapped);
    } catch (e: any) {
      setRows([]);
      setErrMsg(e?.message ?? "Failed to load credit accounts.");
    } finally {
      setLoading(false);
    }
  }, [activeStoreId]);

  useEffect(() => {
    loadAccess();
    load();
  }, [loadAccess, load]);

  useFocusEffect(
    useCallback(() => {
      loadAccess();
      load();
    }, [loadAccess, load])
  );

  function openAccount(accountId: string) {
    router.push({
      pathname: "/(tabs)/credit/[creditId]",
      params: { creditId: accountId },
    } as any);
  }

  function openCleared() {
    router.push("/(tabs)/credit/cleared" as any);
  }

  const headerSubtitle = useMemo(() => {
    return `Store: ${activeStoreName ?? "No active store"} • Role: ${roleLabel}`;
  }, [activeStoreName, roleLabel]);

  const filtered = useMemo(() => {
    const query = norm(q);
    let list = rows;

    if (query) {
      list = list.filter((r) => {
        const name = norm(r.customer_name);
        const phone = norm(r.phone);
        return name.includes(query) || phone.includes(query);
      });
    }

    const sorted = [...list];
    if (sortKey === "BAL_DESC") {
      sorted.sort((a, b) => Number(b.balance ?? 0) - Number(a.balance ?? 0));
    } else if (sortKey === "BAL_ASC") {
      sorted.sort((a, b) => Number(a.balance ?? 0) - Number(b.balance ?? 0));
    } else if (sortKey === "NAME_ASC") {
      sorted.sort((a, b) =>
        String(a.customer_name ?? "").localeCompare(String(b.customer_name ?? ""))
      );
    }
    return sorted;
  }, [rows, q, sortKey]);

  const Seg = useCallback(
    ({ k, label }: { k: SortKey; label: string }) => {
      const active = sortKey === k;
      return (
        <Pressable
          onPress={() => setSortKey(k)}
          hitSlop={8}
          style={{
            flex: 1,
            paddingVertical: 10,
            borderRadius: 999,
            alignItems: "center",
            justifyContent: "center",
            borderWidth: 1,
            borderColor: active ? theme.colors.emeraldBorder : theme.colors.border,
            backgroundColor: active ? theme.colors.emeraldSoft : "rgba(255,255,255,0.06)",
          }}
        >
          <Text style={{ color: theme.colors.text, fontWeight: "900" }}>{label}</Text>
        </Pressable>
      );
    },
    [sortKey]
  );

  const accessText = useMemo(() => {
    if (isOwnerAdmin) return "Owner/Admin wanaweza ku-manage (record sale + record payment).";
    return canStaffManage
      ? "Staff wanaweza kurekodi malipo (store yao tu)."
      : "Staff wanaweza kuona (read-only) taarifa za credit kwenye store yao.";
  }, [isOwnerAdmin, canStaffManage]);

  return (
    <Screen scroll bottomPad={160}>
      <View style={{ paddingTop: 6, paddingBottom: 10 }}>
        <Text style={{ color: theme.colors.text, fontSize: 20, fontWeight: "900" }}>
          Credit
        </Text>
        <Text style={{ color: theme.colors.muted, marginTop: 4, fontWeight: "800" }}>
          Credit v2 – Accounts
        </Text>
      </View>

      <Card style={{ padding: 14, gap: 12 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <View
            style={{
              width: 52,
              height: 52,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: theme.colors.emeraldBorder,
              backgroundColor: theme.colors.emeraldSoft,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Ionicons name="card-outline" size={22} color={theme.colors.emerald} />
          </View>

          <View style={{ flex: 1 }}>
            <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 16 }}>
              Credit Accounts (v2)
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
          <Text style={{ color: theme.colors.text, fontWeight: "900" }}>Access</Text>
          <Text style={{ color: theme.colors.muted, fontWeight: "800", lineHeight: 18 }}>
            {accessText}
          </Text>
        </View>

        <View style={{ gap: 10 }}>
          <Text style={{ color: theme.colors.text, fontWeight: "900" }}>Search</Text>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 10,
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.10)",
              backgroundColor: "rgba(255,255,255,0.04)",
              borderRadius: theme.radius.xl,
              paddingHorizontal: 12,
              height: 48,
            }}
          >
            <Ionicons name="search" size={18} color={theme.colors.muted} />
            <TextInput
              value={q}
              onChangeText={setQ}
              placeholder="Tafuta jina au simu..."
              placeholderTextColor={theme.colors.faint}
              style={{ flex: 1, color: theme.colors.text, fontWeight: "800" }}
              autoCorrect={false}
              autoCapitalize="none"
            />
            {!!q ? (
              <Pressable onPress={() => setQ("")} hitSlop={10}>
                <Ionicons name="close-circle" size={18} color={theme.colors.muted} />
              </Pressable>
            ) : null}
          </View>

          <Text style={{ color: theme.colors.text, fontWeight: "900" }}>Sort</Text>
          <View style={{ flexDirection: "row", gap: 10 }}>
            <Seg k="BAL_DESC" label="Top Debt" />
            <Seg k="NAME_ASC" label="Name" />
            <Seg k="BAL_ASC" label="Low Debt" />
          </View>
        </View>

        <Pressable
          onPress={openCleared}
          hitSlop={10}
          style={({ pressed }) => ({
            height: 48,
            borderRadius: theme.radius.xl,
            borderWidth: 1,
            borderColor: theme.colors.borderSoft,
            backgroundColor: "rgba(255,255,255,0.04)",
            alignItems: "center",
            justifyContent: "center",
            opacity: pressed ? 0.92 : 1,
          })}
        >
          <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 16 }}>
            View Cleared
          </Text>
        </Pressable>

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
        ) : filtered.length === 0 && activeStoreId ? (
          <View style={{ paddingVertical: 10 }}>
            <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>
              {q ? "No match found." : "No active debtors right now."}
            </Text>
            <Text style={{ color: theme.colors.faint, marginTop: 6 }}>
              (Waliomaliza wapo kwenye View Cleared.)
            </Text>
          </View>
        ) : (
          <FlatList
            data={filtered}
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
                      <Text style={{ color: theme.colors.emerald, fontWeight: "900" }}>
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
          onPress={() => {
            loadAccess();
            load();
          }}
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