import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";

import { useOrg } from "../../../src/context/OrgContext";
import { supabase } from "../../../src/supabase/supabaseClient";
import { Card } from "../../../src/ui/Card";
import { Screen } from "../../../src/ui/Screen";
import { StoreGuard } from "../../../src/ui/StoreGuard";
import { UI } from "../../../src/ui/theme";
import { formatMoney } from "../../../src/ui/money";

type CapitalRecoveryHistoryRow = {
  id: string;
  entry_type: "ASSET" | "COST" | "INCOME";
  amount: number;
  note: string | null;
  created_at: string;
  created_by?: string | null;
};

function toNum(x: any) {
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
}

function toInt(x: any) {
  const n = Number(x);
  if (!Number.isFinite(n)) return 0;
  return Math.trunc(n);
}

function clean(v: any) {
  return String(v ?? "").trim();
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

function MiniStat({
  label,
  value,
  hint,
  multilineValue = false,
}: {
  label: string;
  value: string;
  hint?: string;
  multilineValue?: boolean;
}) {
  return (
    <View style={{ flex: 1, gap: 4, minWidth: 0 }}>
      <Text
        style={{ color: UI.muted, fontWeight: "800", fontSize: 12 }}
        numberOfLines={1}
      >
        {label}
      </Text>

      <Text
        style={{ color: UI.text, fontWeight: "900", fontSize: 16, lineHeight: 20 }}
        numberOfLines={multilineValue ? 2 : 1}
        adjustsFontSizeToFit={!multilineValue}
        minimumFontScale={0.75}
        allowFontScaling={false}
      >
        {value}
      </Text>

      {!!hint && (
        <Text
          style={{ color: UI.faint, fontWeight: "800", fontSize: 12 }}
          numberOfLines={1}
        >
          {hint}
        </Text>
      )}
    </View>
  );
}

export default function CapitalRecoveryWorkspaceScreen() {
  const router = useRouter();
  const { activeOrgName, activeStoreName, activeStoreId, refresh } = useOrg();

  const [entryType, setEntryType] = useState<"ASSET" | "COST" | "INCOME">("ASSET");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [history, setHistory] = useState<CapitalRecoveryHistoryRow[]>([]);

  const storeId = String(activeStoreId ?? "").trim();

  const amountNum = toNum(String(amount).replace(/,/g, "").trim());
  const canSave = amountNum > 0;

  const previewTitle =
    entryType === "ASSET"
      ? "Asset Entry Preview"
      : entryType === "COST"
      ? "Operating Cost Preview"
      : "Income Entry Preview";

  const previewHint =
    entryType === "ASSET"
      ? "Hii itaingia upande wa mtaji/asset."
      : entryType === "COST"
      ? "Hii itaingia upande wa gharama za uendeshaji."
      : "Hii itaingia upande wa mapato/income.";

  const formattedPreviewAmount = formatMoney(amountNum, {
    currency: "TZS",
    locale: "en-TZ",
  }).replace(/\s+/g, " ");

  const loadHistory = useCallback(async () => {
    if (!storeId) {
      setHistory([]);
      setHistoryError("No active Capital Recovery store selected");
      return;
    }

    setHistoryLoading(true);
    setHistoryError(null);

    try {
      const { data, error } = await supabase.rpc("get_capital_recovery_history_v1", {
        p_store_id: storeId,
        p_limit: 100,
      });

      if (error) throw error;

      const rows = (Array.isArray(data) ? data : []) as any[];

      setHistory(
        rows.map((r) => ({
          id: String(r?.id ?? ""),
          entry_type: String(r?.entry_type ?? "ASSET").toUpperCase() as
            | "ASSET"
            | "COST"
            | "INCOME",
          amount: toNum(r?.amount),
          note: clean(r?.note) || null,
          created_at: String(r?.created_at ?? ""),
          created_by: clean(r?.created_by) || null,
        }))
      );
    } catch (e: any) {
      setHistoryError(clean(e?.message) || "Failed to load Capital Recovery history");
      setHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  }, [storeId]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  useFocusEffect(
    useCallback(() => {
      void loadHistory();
    }, [loadHistory])
  );

  const report = useMemo(() => {
    const base = {
      ASSET: { count: 0, amount: 0 },
      COST: { count: 0, amount: 0 },
      INCOME: { count: 0, amount: 0 },
    };

    for (const item of history) {
      base[item.entry_type].count += 1;
      base[item.entry_type].amount += toNum(item.amount);
    }

    return base;
  }, [history]);

  const latestEntry = history[0] ?? null;

  const onSaveEntry = useCallback(async () => {
    if (!storeId) {
      Alert.alert("Missing Store", "Hakuna active Capital Recovery store.");
      return;
    }

    if (!canSave) {
      Alert.alert("Invalid Amount", "Weka amount sahihi zaidi ya sifuri.");
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase.rpc("create_capital_recovery_entry", {
        p_store_id: storeId,
        p_entry_type: entryType,
        p_amount: amountNum,
        p_note: clean(note) || null,
      });

      if (error) throw error;

      setAmount("");
      setNote("");
      await Promise.resolve(refresh());
      await loadHistory();

      Alert.alert("Success ✅", `${entryType} entry imehifadhiwa vizuri.`);
    } catch (e: any) {
      Alert.alert("Save failed", clean(e?.message) || "Unknown error");
    } finally {
      setSaving(false);
    }
  }, [storeId, canSave, entryType, amountNum, note, refresh, loadHistory]);

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
        hitSlop={10}
        style={({ pressed }) => ({
          flex: 1,
          minWidth: 96,
          minHeight: 50,
          paddingHorizontal: 12,
          paddingVertical: 12,
          borderRadius: 16,
          borderWidth: 1,
          borderColor: active ? "rgba(16,185,129,0.40)" : "rgba(255,255,255,0.10)",
          backgroundColor: active ? "rgba(16,185,129,0.18)" : "rgba(255,255,255,0.05)",
          alignItems: "center",
          justifyContent: "center",
          opacity: pressed ? 0.92 : 1,
          transform: pressed ? [{ scale: 0.985 }] : [{ scale: 1 }],
        })}
      >
        <Text style={{ color: UI.text, fontWeight: "900", fontSize: 13 }}>{title}</Text>
      </Pressable>
    );
  };

  const fmt = (n: number) =>
    formatMoney(n, {
      currency: "TZS",
      locale: "en-TZ",
    }).replace(/\s+/g, " ");

  return (
    <Screen
      scroll
      contentStyle={{
        paddingTop: 14,
        paddingHorizontal: 16,
        paddingBottom: 24,
      }}
    >
      <StoreGuard>
        <Card
          style={{
            gap: 16,
            borderRadius: 24,
            borderColor: "rgba(16,185,129,0.24)",
            backgroundColor: "rgba(15,18,24,0.98)",
            overflow: "hidden",
          }}
        >
          <View
            pointerEvents="none"
            style={{
              position: "absolute",
              top: -80,
              right: -60,
              width: 220,
              height: 220,
              borderRadius: 999,
              backgroundColor: "rgba(16,185,129,0.08)",
            }}
          />

          <View
            pointerEvents="none"
            style={{
              position: "absolute",
              left: -70,
              bottom: -100,
              width: 220,
              height: 220,
              borderRadius: 999,
              backgroundColor: "rgba(34,211,238,0.04)",
            }}
          />

          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <View
              style={{
                width: 52,
                height: 52,
                borderRadius: 18,
                alignItems: "center",
                justifyContent: "center",
                borderWidth: 1,
                borderColor: "rgba(16,185,129,0.30)",
                backgroundColor: "rgba(16,185,129,0.12)",
              }}
            >
              <Ionicons name="layers-outline" size={22} color={UI.emerald} />
            </View>

            <View style={{ flex: 1, minWidth: 0 }}>
              <Text
                style={{
                  color: UI.faint,
                  fontWeight: "900",
                  fontSize: 11,
                  letterSpacing: 0.9,
                }}
              >
                CAPITAL RECOVERY WORKSPACE
              </Text>

              <Text
                style={{ color: UI.text, fontWeight: "900", fontSize: 22, marginTop: 4 }}
                numberOfLines={1}
              >
                {activeStoreName ?? "Capital Recovery Store"}
              </Text>
            </View>
          </View>

          <Text style={{ color: UI.muted, fontWeight: "800", lineHeight: 22 }}>
            Organization: {activeOrgName ?? "—"}
          </Text>

          <Card
            style={{
              gap: 12,
              borderRadius: 20,
              borderColor: "rgba(255,255,255,0.10)",
              backgroundColor: "rgba(255,255,255,0.04)",
            }}
          >
            <Text style={{ color: UI.text, fontWeight: "900", fontSize: 17 }}>
              Quick Entry
            </Text>

            <Text style={{ color: UI.muted, fontWeight: "800", lineHeight: 20 }}>
              Hapa ndipo uta-record Asset, Cost, na Income.
            </Text>

            <View
              style={{
                flexDirection: "row",
                flexWrap: "wrap",
                gap: 10,
                width: "100%",
              }}
            >
              <Pill
                title="Add Asset"
                active={entryType === "ASSET"}
                onPress={() => setEntryType("ASSET")}
              />
              <Pill
                title="Add Cost"
                active={entryType === "COST"}
                onPress={() => setEntryType("COST")}
              />
              <Pill
                title="Add Income"
                active={entryType === "INCOME"}
                onPress={() => setEntryType("INCOME")}
              />
            </View>

            <View style={{ gap: 8 }}>
              <Text style={{ color: UI.muted, fontWeight: "800" }}>Amount (TZS)</Text>
              <TextInput
                value={amount}
                onChangeText={setAmount}
                placeholder="mfano: 250000"
                placeholderTextColor="rgba(234,242,255,0.35)"
                keyboardType="numeric"
                style={{
                  borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.10)",
                  backgroundColor: "rgba(255,255,255,0.05)",
                  color: UI.text,
                  borderRadius: 18,
                  paddingHorizontal: 14,
                  paddingVertical: 14,
                  fontWeight: "800",
                  fontSize: 15,
                }}
              />
            </View>

            <View style={{ gap: 8 }}>
              <Text style={{ color: UI.muted, fontWeight: "800" }}>Note / Description</Text>
              <TextInput
                value={note}
                onChangeText={setNote}
                placeholder="mfano: kununua mashine / gharama ya kodi / mapato ya biashara"
                placeholderTextColor="rgba(234,242,255,0.35)"
                multiline
                style={{
                  minHeight: 96,
                  borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.10)",
                  backgroundColor: "rgba(255,255,255,0.05)",
                  color: UI.text,
                  borderRadius: 18,
                  paddingHorizontal: 14,
                  paddingVertical: 14,
                  fontWeight: "800",
                  fontSize: 15,
                  textAlignVertical: "top",
                }}
              />
            </View>
          </Card>

          <Card
            style={{
              gap: 10,
              borderRadius: 20,
              borderColor: canSave ? "rgba(16,185,129,0.22)" : "rgba(255,255,255,0.10)",
              backgroundColor: canSave ? "rgba(16,185,129,0.07)" : "rgba(255,255,255,0.04)",
            }}
          >
            <Text style={{ color: UI.text, fontWeight: "900", fontSize: 16 }}>
              {previewTitle}
            </Text>

            <Text style={{ color: UI.muted, fontWeight: "800", lineHeight: 20 }}>
              {previewHint}
            </Text>

            <View style={{ flexDirection: "row", gap: 12 }}>
              <MiniStat label="Entry Type" value={entryType} hint="current selection" />
              <MiniStat
                label="Amount"
                value={canSave ? formattedPreviewAmount : "TSh 0"}
                hint="preview"
              />
            </View>

            <Card
              style={{
                borderColor: "rgba(255,255,255,0.10)",
                backgroundColor: "rgba(255,255,255,0.04)",
                borderRadius: 18,
                padding: 12,
              }}
            >
              <Text style={{ color: UI.faint, fontWeight: "800", lineHeight: 20 }}>
                {clean(note)
                  ? note
                  : "Hakuna maelezo bado. Weka note fupi ili entry iwe clear."}
              </Text>
            </Card>
          </Card>

          <Pressable
            onPress={onSaveEntry}
            disabled={!canSave || saving}
            style={({ pressed }) => ({
              borderRadius: 18,
              borderWidth: 1,
              borderColor:
                canSave && !saving
                  ? "rgba(16,185,129,0.30)"
                  : "rgba(255,255,255,0.10)",
              backgroundColor:
                canSave && !saving
                  ? "rgba(16,185,129,0.12)"
                  : "rgba(255,255,255,0.05)",
              paddingVertical: 15,
              paddingHorizontal: 16,
              alignItems: "center",
              justifyContent: "center",
              opacity: pressed ? 0.92 : canSave && !saving ? 1 : 0.6,
            })}
          >
            <Text style={{ color: UI.text, fontWeight: "900", fontSize: 15 }}>
              {saving ? "Saving..." : "Save Entry"}
            </Text>
          </Pressable>
        </Card>

        <Card
          style={{
            marginTop: 14,
            gap: 14,
            borderRadius: 24,
            borderColor: "rgba(16,185,129,0.22)",
            backgroundColor: "rgba(15,18,24,0.98)",
          }}
        >
          <Text style={{ color: UI.text, fontWeight: "900", fontSize: 20 }}>
            Reports
          </Text>

          {!!historyError ? (
            <Card
              style={{
                borderColor: "rgba(201,74,74,0.35)",
                backgroundColor: "rgba(201,74,74,0.10)",
                borderRadius: 18,
                padding: 12,
              }}
            >
              <Text style={{ color: UI.danger, fontWeight: "900" }}>{historyError}</Text>
            </Card>
          ) : null}

          <View style={{ flexDirection: "row", gap: 12 }}>
            <MiniStat
              label="Asset Entries"
              value={String(report.ASSET.count)}
              hint={fmt(report.ASSET.amount)}
            />
            <MiniStat
              label="Cost Entries"
              value={String(report.COST.count)}
              hint={fmt(report.COST.amount)}
            />
            <MiniStat
              label="Income Entries"
              value={String(report.INCOME.count)}
              hint={fmt(report.INCOME.amount)}
            />
          </View>

          <View style={{ flexDirection: "row", gap: 12 }}>
            <MiniStat
              label="Latest Entry"
              value={latestEntry ? latestEntry.entry_type : "—"}
              hint={latestEntry ? fmtLocal(latestEntry.created_at) : "no history"}
              multilineValue
            />
            <MiniStat
              label="Total Records"
              value={historyLoading ? "..." : String(history.length)}
              hint="history loaded"
            />
          </View>

          <Pressable
            onPress={() => router.push("/capital-recovery/history")}
            style={({ pressed }) => ({
              borderRadius: 20,
              borderWidth: 1,
              borderColor: "rgba(16,185,129,0.34)",
              backgroundColor: "rgba(16,185,129,0.16)",
              paddingVertical: 16,
              paddingHorizontal: 16,
              alignItems: "center",
              justifyContent: "center",
              opacity: pressed ? 0.92 : 1,
            })}
          >
            <Text style={{ color: UI.text, fontWeight: "900", fontSize: 15 }}>
              Open Recent History
            </Text>
          </Pressable>
        </Card>
      </StoreGuard>
    </Screen>
  );
}