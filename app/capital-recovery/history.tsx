// app/capital-recovery/history.tsx
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useOrg } from "../../src/context/OrgContext";
import { supabase } from "../../src/supabase/supabaseClient";
import { Card } from "../../src/ui/Card";
import { Screen } from "../../src/ui/Screen";
import { UI } from "../../src/ui/theme";
import { formatMoney } from "../../src/ui/money";

type RangeKey = "today" | "7d" | "30d";
type EntryType = "ASSET" | "COST" | "INCOME";
type FilterType = "ALL" | EntryType;

type CapitalRecoveryHistoryRow = {
  id: string;
  entry_type: EntryType;
  amount: number;
  note: string | null;
  created_at: string;
  created_by?: string | null;
};

function clean(v: any) {
  return String(v ?? "").trim();
}

function toNum(x: any) {
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
}

function fmtLocal(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  try {
    return d.toLocaleString();
  } catch {
    return iso;
  }
}

function startOfLocalDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

function rangeStartDate(range: RangeKey) {
  const now = new Date();
  const from = startOfLocalDay(now);

  if (range === "7d") {
    from.setDate(from.getDate() - 6);
  } else if (range === "30d") {
    from.setDate(from.getDate() - 29);
  }

  return from;
}

export default function CapitalRecoveryHistoryScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { activeStoreId, activeStoreName, activeOrgName } = useOrg();

  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [history, setHistory] = useState<CapitalRecoveryHistoryRow[]>([]);
  const [searchText, setSearchText] = useState("");
  const [filterType, setFilterType] = useState<FilterType>("ALL");
  const [range, setRange] = useState<RangeKey>("today");

  const storeId = String(activeStoreId ?? "").trim();

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = !!opts?.silent;

    if (!storeId) {
      setHistory([]);
      setError("No active Capital Recovery store selected");
      return;
    }

    if (!silent) setLoading(true);
    setError(null);

    try {
      const { data, error: hErr } = await supabase.rpc("get_capital_recovery_history_v1", {
        p_store_id: storeId,
        p_limit: 300,
      });

      if (hErr) throw hErr;

      const rows = (Array.isArray(data) ? data : []) as any[];

      setHistory(
        rows.map((r) => ({
          id: String(r?.id ?? ""),
          entry_type: String(r?.entry_type ?? "ASSET").toUpperCase() as EntryType,
          amount: toNum(r?.amount),
          note: clean(r?.note) || null,
          created_at: String(r?.created_at ?? ""),
          created_by: clean(r?.created_by) || null,
        }))
      );
    } catch (e: any) {
      setError(clean(e?.message) || "Failed to load Capital Recovery history");
      setHistory([]);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [storeId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await load({ silent: true });
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  const filteredHistory = useMemo(() => {
    const q = clean(searchText).toLowerCase();
    const fromDate = rangeStartDate(range).getTime();

    return history.filter((item) => {
      const passType = filterType === "ALL" ? true : item.entry_type === filterType;
      const hay = `${item.note ?? ""} ${item.entry_type}`.toLowerCase();
      const passSearch = !q ? true : hay.includes(q);

      const createdAtMs = new Date(item.created_at).getTime();
      const passRange = Number.isFinite(createdAtMs) ? createdAtMs >= fromDate : false;

      return passType && passSearch && passRange;
    });
  }, [history, filterType, searchText, range]);

  const report = useMemo(() => {
    const base = {
      ASSET: { count: 0, amount: 0 },
      COST: { count: 0, amount: 0 },
      INCOME: { count: 0, amount: 0 },
    };

    for (const item of filteredHistory) {
      base[item.entry_type].count += 1;
      base[item.entry_type].amount += toNum(item.amount);
    }

    return base;
  }, [filteredHistory]);

  const fmt = useCallback(
    (n: number) =>
      formatMoney(n, {
        currency: "TZS",
        locale: "en-TZ",
      }).replace(/\s+/g, " "),
    []
  );

  const typeTone = (type: EntryType) => {
    if (type === "ASSET") {
      return {
        borderColor: "rgba(59,130,246,0.28)",
        backgroundColor: "rgba(59,130,246,0.10)",
      };
    }
    if (type === "COST") {
      return {
        borderColor: "rgba(245,158,11,0.28)",
        backgroundColor: "rgba(245,158,11,0.10)",
      };
    }
    return {
      borderColor: "rgba(16,185,129,0.28)",
      backgroundColor: "rgba(16,185,129,0.10)",
    };
  };

  const Pill = ({
    title,
    active,
    onPress,
  }: {
    title: string;
    active: boolean;
    onPress: () => void;
  }) => {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => ({
          flex: 1,
          minWidth: 0,
          minHeight: 46,
          paddingHorizontal: 12,
          paddingVertical: 10,
          borderRadius: 16,
          borderWidth: 1,
          borderColor: active ? "rgba(16,185,129,0.34)" : "rgba(255,255,255,0.10)",
          backgroundColor: active ? "rgba(16,185,129,0.14)" : "rgba(255,255,255,0.05)",
          alignItems: "center",
          justifyContent: "center",
          opacity: pressed ? 0.92 : 1,
        })}
      >
        <Text style={{ color: UI.text, fontWeight: "900", fontSize: 12 }}>{title}</Text>
      </Pressable>
    );
  };

  const onEditPress = useCallback((item: CapitalRecoveryHistoryRow) => {
    Alert.alert(
      "Edit UI Ready",
      `Entry ${item.entry_type} imeonekana.\n\nHatua inayofuata ni kufunga RPC ya update ili edit ifanye kazi kweli.`
    );
  }, []);

  const onDeletePress = useCallback((item: CapitalRecoveryHistoryRow) => {
    Alert.alert(
      "Delete UI Ready",
      `Entry ${item.entry_type} imeonekana.\n\nHatua inayofuata ni kufunga RPC ya delete ili kufuta entry kweli.`
    );
  }, []);

  return (
    <Screen
      scroll={false}
      contentStyle={{
        paddingTop: Math.max(insets.top, 10) + 8,
        paddingBottom: Math.max(insets.bottom, 8) + 14,
        paddingHorizontal: 16,
      }}
    >
      <ScrollView
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={UI.text} />
        }
        contentContainerStyle={{ paddingBottom: 20 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ gap: 14 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <Pressable
              onPress={() => router.back()}
              style={({ pressed }) => ({
                width: 44,
                height: 44,
                borderRadius: 14,
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.10)",
                backgroundColor: "rgba(255,255,255,0.05)",
                alignItems: "center",
                justifyContent: "center",
                opacity: pressed ? 0.92 : 1,
              })}
            >
              <Ionicons name="arrow-back" size={20} color={UI.text} />
            </Pressable>

            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ color: UI.text, fontWeight: "900", fontSize: 24 }} numberOfLines={1}>
                Recent History
              </Text>
              <Text style={{ color: UI.muted, fontWeight: "800", marginTop: 4 }} numberOfLines={1}>
                {activeOrgName ?? "Organization"} • {activeStoreName ?? "Capital Recovery Store"}
              </Text>
            </View>

            <Pressable
              onPress={() => void load()}
              style={({ pressed }) => ({
                paddingHorizontal: 12,
                paddingVertical: 8,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: "rgba(16,185,129,0.24)",
                backgroundColor: "rgba(16,185,129,0.10)",
                opacity: pressed ? 0.92 : 1,
              })}
            >
              <Text style={{ color: UI.text, fontWeight: "900", fontSize: 11 }}>
                {loading ? "LOADING" : "LIVE"}
              </Text>
            </Pressable>
          </View>

          {!!error ? (
            <Card
              style={{
                borderColor: "rgba(201,74,74,0.35)",
                backgroundColor: "rgba(201,74,74,0.10)",
                borderRadius: 18,
                padding: 12,
              }}
            >
              <Text style={{ color: UI.danger, fontWeight: "900" }}>{error}</Text>
            </Card>
          ) : null}

          <Card
            style={{
              gap: 14,
              borderRadius: 24,
              borderColor: "rgba(16,185,129,0.22)",
              backgroundColor: "rgba(15,18,24,0.98)",
            }}
          >
            <Text style={{ color: UI.text, fontWeight: "900", fontSize: 20 }}>
              Filters
            </Text>

            <View style={{ gap: 10 }}>
              <TextInput
                value={searchText}
                onChangeText={setSearchText}
                placeholder="Search note or type..."
                placeholderTextColor="rgba(234,242,255,0.35)"
                style={{
                  borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.10)",
                  backgroundColor: "rgba(255,255,255,0.05)",
                  color: UI.text,
                  borderRadius: 18,
                  paddingHorizontal: 14,
                  paddingVertical: 14,
                  fontWeight: "800",
                  fontSize: 14,
                }}
              />

              <View style={{ flexDirection: "row", gap: 10 }}>
                <Pill title="Today" active={range === "today"} onPress={() => setRange("today")} />
                <Pill title="7 Days" active={range === "7d"} onPress={() => setRange("7d")} />
                <Pill title="30 Days" active={range === "30d"} onPress={() => setRange("30d")} />
              </View>

              <View style={{ flexDirection: "row", gap: 10 }}>
                <Pill title="ALL" active={filterType === "ALL"} onPress={() => setFilterType("ALL")} />
                <Pill title="ASSET" active={filterType === "ASSET"} onPress={() => setFilterType("ASSET")} />
                <Pill title="COST" active={filterType === "COST"} onPress={() => setFilterType("COST")} />
                <Pill title="INCOME" active={filterType === "INCOME"} onPress={() => setFilterType("INCOME")} />
              </View>
            </View>
          </Card>

          <Card
            style={{
              gap: 14,
              borderRadius: 24,
              borderColor: "rgba(16,185,129,0.22)",
              backgroundColor: "rgba(15,18,24,0.98)",
            }}
          >
            <Text style={{ color: UI.text, fontWeight: "900", fontSize: 20 }}>
              Reports
            </Text>

            <View style={{ flexDirection: "row", gap: 12 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12 }}>Asset Entries</Text>
                <Text style={{ color: UI.text, fontWeight: "900", fontSize: 18, marginTop: 4 }}>
                  {report.ASSET.count}
                </Text>
                <Text style={{ color: UI.faint, fontWeight: "800", fontSize: 12, marginTop: 4 }}>
                  {fmt(report.ASSET.amount)}
                </Text>
              </View>

              <View style={{ flex: 1 }}>
                <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12 }}>Cost Entries</Text>
                <Text style={{ color: UI.text, fontWeight: "900", fontSize: 18, marginTop: 4 }}>
                  {report.COST.count}
                </Text>
                <Text style={{ color: UI.faint, fontWeight: "800", fontSize: 12, marginTop: 4 }}>
                  {fmt(report.COST.amount)}
                </Text>
              </View>

              <View style={{ flex: 1 }}>
                <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12 }}>Income Entries</Text>
                <Text style={{ color: UI.text, fontWeight: "900", fontSize: 18, marginTop: 4 }}>
                  {report.INCOME.count}
                </Text>
                <Text style={{ color: UI.faint, fontWeight: "800", fontSize: 12, marginTop: 4 }}>
                  {fmt(report.INCOME.amount)}
                </Text>
              </View>
            </View>
          </Card>

          <Card
            style={{
              gap: 14,
              borderRadius: 24,
              borderColor: "rgba(16,185,129,0.22)",
              backgroundColor: "rgba(15,18,24,0.98)",
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <Text style={{ color: UI.text, fontWeight: "900", fontSize: 20, flex: 1 }}>
                Results
              </Text>

              <View
                style={{
                  paddingHorizontal: 10,
                  paddingVertical: 6,
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.10)",
                  backgroundColor: "rgba(255,255,255,0.05)",
                }}
              >
                <Text style={{ color: UI.text, fontWeight: "900", fontSize: 11 }}>
                  {filteredHistory.length}
                </Text>
              </View>
            </View>

            {loading ? (
              <View style={{ paddingVertical: 24, alignItems: "center", justifyContent: "center" }}>
                <ActivityIndicator color={UI.text} />
              </View>
            ) : filteredHistory.length === 0 ? (
              <Card
                style={{
                  borderColor: "rgba(255,255,255,0.10)",
                  backgroundColor: "rgba(255,255,255,0.04)",
                  borderRadius: 18,
                  padding: 12,
                }}
              >
                <Text style={{ color: UI.faint, fontWeight: "800", lineHeight: 20 }}>
                  Hakuna result kwa filter/search/range uliyochagua.
                </Text>
              </Card>
            ) : (
              <View style={{ gap: 10 }}>
                {filteredHistory.map((item) => {
                  const tone = typeTone(item.entry_type);

                  return (
                    <Card
                      key={item.id}
                      style={{
                        gap: 10,
                        borderRadius: 18,
                        borderColor: "rgba(255,255,255,0.10)",
                        backgroundColor: "rgba(255,255,255,0.04)",
                      }}
                    >
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                        <View
                          style={{
                            paddingHorizontal: 10,
                            paddingVertical: 6,
                            borderRadius: 999,
                            borderWidth: 1,
                            ...tone,
                          }}
                        >
                          <Text style={{ color: UI.text, fontWeight: "900", fontSize: 11 }}>
                            {item.entry_type}
                          </Text>
                        </View>

                        <View style={{ flex: 1 }} />

                        <Text style={{ color: UI.text, fontWeight: "900", fontSize: 15 }}>
                          {fmt(item.amount)}
                        </Text>
                      </View>

                      <Text style={{ color: UI.muted, fontWeight: "800", lineHeight: 20 }}>
                        {item.note || "No note"}
                      </Text>

                      <Text style={{ color: UI.faint, fontWeight: "800", fontSize: 12 }}>
                        {fmtLocal(item.created_at)}
                      </Text>

                      <View style={{ flexDirection: "row", gap: 10 }}>
                        <Pressable
                          onPress={() => onEditPress(item)}
                          style={({ pressed }) => ({
                            flex: 1,
                            borderRadius: 16,
                            borderWidth: 1,
                            borderColor: "rgba(59,130,246,0.28)",
                            backgroundColor: "rgba(59,130,246,0.10)",
                            paddingVertical: 12,
                            alignItems: "center",
                            justifyContent: "center",
                            opacity: pressed ? 0.92 : 1,
                          })}
                        >
                          <Text style={{ color: UI.text, fontWeight: "900", fontSize: 13 }}>
                            Edit
                          </Text>
                        </Pressable>

                        <Pressable
                          onPress={() => onDeletePress(item)}
                          style={({ pressed }) => ({
                            flex: 1,
                            borderRadius: 16,
                            borderWidth: 1,
                            borderColor: "rgba(201,74,74,0.30)",
                            backgroundColor: "rgba(201,74,74,0.10)",
                            paddingVertical: 12,
                            alignItems: "center",
                            justifyContent: "center",
                            opacity: pressed ? 0.92 : 1,
                          })}
                        >
                          <Text style={{ color: UI.text, fontWeight: "900", fontSize: 13 }}>
                            Delete
                          </Text>
                        </Pressable>
                      </View>
                    </Card>
                  );
                })}
              </View>
            )}
          </Card>
        </View>
      </ScrollView>
    </Screen>
  );
}