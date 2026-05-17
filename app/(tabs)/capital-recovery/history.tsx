// app/(tabs)/capital-recovery/history.tsx

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Modal, Pressable, ScrollView, Text, TextInput, View } from "react-native";

import { useOrg } from "@/src/context/OrgContext";
import { supabase } from "@/src/supabase/supabaseClient";
import { Screen } from "@/src/ui/Screen";
import { Card } from "@/src/ui/Card";
const UI = {
  text: "#0F172A",
  muted: "#5B6575",
  faint: "#8A94A6",
  emerald: "#059669",
  warning: "#B45309",
  danger: "#DC2626",
};

type RangeKey = "today" | "yesterday" | "7d" | "30d" | "custom";

type Row = {
  id: string;
  entry_type: "ASSET" | "COST" | "INCOME";
  amount: number;
  note: string | null;
  created_at: string;
  created_by?: string | null;
  created_role?: string | null;
  created_by_name?: string | null;
};

function toNum(x: any) {
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
}

function clean(v: any) {
  return String(v ?? "").trim();
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function toIsoDateLocal(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function isValidYYYYMMDD(s: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

function fmtLocal(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

function fmtMoney(n: number) {
  return `TSh ${Math.round(toNum(n)).toLocaleString("en-US")}`;
}

function getRangeDates(k: RangeKey) {
  const now = new Date();
  const from = new Date(now);
  const to = new Date(now);

  if (k === "yesterday") {
    from.setDate(from.getDate() - 1);
    to.setDate(to.getDate() - 1);
  } else if (k === "7d") {
    from.setDate(from.getDate() - 6);
  } else if (k === "30d") {
    from.setDate(from.getDate() - 29);
  }

  return { from: toIsoDateLocal(from), to: toIsoDateLocal(to) };
}

function inDateRange(iso: string, fromYMD: string, toYMD: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return false;
  const ymd = toIsoDateLocal(d);
  return ymd >= fromYMD && ymd <= toYMD;
}

function Chip({
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
      hitSlop={10}
      style={({ pressed }) => ({
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: active ? "rgba(16,185,129,0.40)" : "rgba(255,255,255,0.12)",
        backgroundColor: active ? "rgba(16,185,129,0.14)" : "rgba(255,255,255,0.06)",
        opacity: pressed ? 0.9 : 1,
      })}
    >
      <Text style={{ color: UI.text, fontWeight: "900", fontSize: 12 }}>{label}</Text>
    </Pressable>
  );
}

function MiniStat({
  label,
  value,
  hint,
  hidden,
}: {
  label: string;
  value: string;
  hint?: string;
  hidden?: boolean;
}) {
  if (hidden) return null;

  return (
    <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
      <Text style={{ color: UI.muted, fontWeight: "900", fontSize: 12 }} numberOfLines={1}>
        {label}
      </Text>
      <Text
        style={{ color: UI.text, fontWeight: "900", fontSize: 18 }}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.7}
      >
        {value}
      </Text>
      {!!hint && (
        <Text style={{ color: UI.faint, fontWeight: "800", fontSize: 12 }} numberOfLines={1}>
          {hint}
        </Text>
      )}
    </View>
  );
}

export default function CapitalRecoveryHistoryScreen() {
  const { activeStoreId, activeRole } = useOrg();

  const roleLower = clean(activeRole).toLowerCase();
  const isOwner = roleLower === "owner";
  const canSeeCapitalSecrets = isOwner;

  const today = useMemo(() => toIsoDateLocal(new Date()), []);
  const [range, setRange] = useState<RangeKey>("today");
  const [dateFrom, setDateFrom] = useState(today);
  const [dateTo, setDateTo] = useState(today);

  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [emailMap, setEmailMap] = useState<Record<string, string>>({});

  const [editOpen, setEditOpen] = useState(false);
  const [editRow, setEditRow] = useState<Row | null>(null);
  const [editAmount, setEditAmount] = useState("");
  const [editNote, setEditNote] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  const applyRange = useCallback((k: RangeKey) => {
    setRange(k);
    if (k !== "custom") {
      const d = getRangeDates(k);
      setDateFrom(d.from);
      setDateTo(d.to);
    }
  }, []);

  const load = useCallback(async () => {
    const storeId = clean(activeStoreId);
    if (!storeId) {
      setRows([]);
      setErr("No active Capital Recovery store selected");
      return;
    }

    if (!isValidYYYYMMDD(dateFrom) || !isValidYYYYMMDD(dateTo)) {
      setErr("Tarehe lazima iwe format YYYY-MM-DD");
      return;
    }

    setLoading(true);
    setErr(null);

    try {
      const { data, error } = await supabase.rpc("get_capital_recovery_history_v2", {
        p_store_id: storeId,
        p_limit: 500,
      });

      if (error) throw error;

      const list = Array.isArray(data) ? data : [];

      const mapped: Row[] = list
        .map((r: any) => ({
          id: String(r?.id ?? ""),
          entry_type: String(r?.entry_type ?? "").toUpperCase() as Row["entry_type"],
          amount: toNum(r?.amount),
          note: clean(r?.note) || null,
          created_at: String(r?.created_at ?? ""),
          created_by: clean(r?.created_by) || null,
          created_role: clean(r?.created_role) || null,
          created_by_name: clean(r?.created_by_name) || null,
        }))
        .filter((r) => ["ASSET", "COST", "INCOME"].includes(r.entry_type))
        .filter((r) => inDateRange(r.created_at, dateFrom, dateTo));

      setRows(mapped);
    } catch (e: any) {
      setRows([]);
      setErr(e?.message ?? "Failed to load Capital Recovery history");
    } finally {
      setLoading(false);
    }
  }, [activeStoreId, dateFrom, dateTo]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    let alive = true;

    const run = async () => {
      const ids = Array.from(new Set(rows.map((r) => clean(r.created_by)).filter(Boolean)));

      if (!ids.length) {
        if (alive) setEmailMap({});
        return;
      }

      const next: Record<string, string> = {};

      await Promise.all(
        ids.map(async (id) => {
          try {
            const { data, error } = await supabase.rpc("get_user_email_safe", {
              p_user_id: id,
            });

            if (!error) {
              const email = clean(data);
              if (email) next[id] = email;
            }
          } catch {}
        })
      );

      if (alive) setEmailMap(next);
    };

    void run();

    return () => {
      alive = false;
    };
  }, [rows]);

  const canEditRow = useCallback(
    (item: Row) => {
      const createdDate = toIsoDateLocal(new Date(item.created_at));
      const isToday = createdDate === today;
      if (!isToday) return false;

      const role = roleLower;
      if (role === "owner" || role === "admin") return true;

      return clean(item.created_by) !== "";
    },
    [roleLower, today]
  );

  const openEdit = useCallback((item: Row) => {
    setEditRow(item);
    setEditAmount(String(Math.round(toNum(item.amount))));
    setEditNote(clean(item.note));
    setEditOpen(true);
  }, []);

  const saveEdit = useCallback(async () => {
    if (!editRow) return;

    const amount = toNum(editAmount);
    if (amount <= 0) {
      Alert.alert("Invalid amount", "Amount lazima iwe kubwa kuliko 0.");
      return;
    }

    setSavingEdit(true);

    try {
      const { error } = await supabase.rpc("edit_capital_recovery_entry_v1", {
        p_entry_id: editRow.id,
        p_amount: amount,
        p_note: editNote,
      });

      if (error) throw error;

      setEditOpen(false);
      setEditRow(null);
      await load();
    } catch (e: any) {
      Alert.alert("Edit failed", e?.message ?? "Failed to edit record.");
    } finally {
      setSavingEdit(false);
    }
  }, [editAmount, editNote, editRow, load]);

  const displayRows = useMemo(() => {
    return rows.map((item) => {
      const uid = clean(item.created_by);
      return {
        ...item,
        displayRecordedBy:
          clean(item.created_by_name) || clean(emailMap[uid]) || clean(item.created_by) || "Unknown",
      };
    });
  }, [rows, emailMap]);

  const summary = useMemo(() => {
    let asset = 0;
    let cost = 0;
    let income = 0;

    for (const r of rows) {
      if (r.entry_type === "ASSET") asset += r.amount;
      if (r.entry_type === "COST") cost += r.amount;
      if (r.entry_type === "INCOME") income += r.amount;
    }

    const netToday = income - cost;

    return {
      asset,
      cost,
      income,
      netToday,
      totalRecords: rows.length,
    };
  }, [rows]);

  const netPositive = summary.netToday > 0;
  const netNegative = summary.netToday < 0;
  const netColor = netPositive ? UI.emerald : netNegative ? UI.danger : UI.muted;
  const netLabel = netPositive ? "Profit Today" : netNegative ? "Loss Today" : "Balanced Today";
  const netValue =
    summary.netToday > 0
      ? `+${fmtMoney(summary.netToday)}`
      : summary.netToday < 0
      ? `-${fmtMoney(Math.abs(summary.netToday))}`
      : fmtMoney(0);

  return (
    <Screen
      scroll
      contentStyle={{
        backgroundColor: "#EAF2FA",
        padding: 16,
        paddingBottom: 120,
      }}
    >
      <Modal visible={editOpen} transparent animationType="fade">
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.72)",
            justifyContent: "center",
            padding: 16,
          }}
        >
          <Card style={{ gap: 12, borderRadius: 22, backgroundColor: "#10141c" }}>
            <Text style={{ color: UI.text, fontWeight: "900", fontSize: 18 }}>
              Edit Record
            </Text>

            <TextInput
              value={editAmount}
              onChangeText={setEditAmount}
              keyboardType="numeric"
              placeholder="Amount"
              placeholderTextColor={UI.faint}
              style={{
                color: UI.text,
                fontWeight: "900",
                borderRadius: 16,
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.12)",
                backgroundColor: "rgba(255,255,255,0.06)",
                paddingHorizontal: 12,
                paddingVertical: 12,
              }}
            />

            <TextInput
              value={editNote}
              onChangeText={setEditNote}
              placeholder="Note"
              placeholderTextColor={UI.faint}
              multiline
              style={{
                color: UI.text,
                fontWeight: "800",
                minHeight: 90,
                textAlignVertical: "top",
                borderRadius: 16,
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.12)",
                backgroundColor: "rgba(255,255,255,0.06)",
                paddingHorizontal: 12,
                paddingVertical: 12,
              }}
            />

            <View style={{ flexDirection: "row", gap: 10 }}>
              <Pressable
                onPress={() => setEditOpen(false)}
                style={{
                  flex: 1,
                  padding: 14,
                  borderRadius: 16,
                  borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.12)",
                  alignItems: "center",
                }}
              >
                <Text style={{ color: UI.text, fontWeight: "900" }}>Cancel</Text>
              </Pressable>

              <Pressable
                onPress={() => void saveEdit()}
                disabled={savingEdit}
                style={{
                  flex: 1,
                  padding: 14,
                  borderRadius: 16,
                  borderWidth: 1,
                  borderColor: "rgba(16,185,129,0.32)",
                  backgroundColor: "#D1FAE5",
                  alignItems: "center",
                  opacity: savingEdit ? 0.6 : 1,
                }}
              >
                <Text style={{ color: UI.emerald, fontWeight: "900" }}>
                  {savingEdit ? "Saving..." : "Save"}
                </Text>
              </Pressable>
            </View>
          </Card>
        </View>
      </Modal>
      <Text style={{ color: UI.text, fontWeight: "900", fontSize: 22 }}>
        Capital Recovery History
      </Text>

      <Text style={{ color: UI.muted, fontWeight: "800", marginTop: 4 }}>
        Angalia rekodi kwa siku, wiki, mwezi, au custom date.
      </Text>

      <View style={{ height: 14 }} />

      <Card
        style={{
          gap: 12,
          borderRadius: 26,
          borderColor: "rgba(147,197,253,0.55)",
          backgroundColor: "#FFFFFF",
        }}
      >
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
          <Chip label="Today" active={range === "today"} onPress={() => applyRange("today")} />
          <Chip label="Yesterday" active={range === "yesterday"} onPress={() => applyRange("yesterday")} />
          <Chip label="7 Days" active={range === "7d"} onPress={() => applyRange("7d")} />
          <Chip label="30 Days" active={range === "30d"} onPress={() => applyRange("30d")} />
          <Chip label="Custom" active={range === "custom"} onPress={() => applyRange("custom")} />
        </View>

        <View style={{ flexDirection: "row", gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: UI.muted, fontWeight: "900", marginBottom: 6 }}>From</Text>
            <TextInput
              value={dateFrom}
              onChangeText={(v) => {
                setRange("custom");
                setDateFrom(v);
              }}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={UI.faint}
              style={{
                color: UI.text,
                fontWeight: "900",
                borderRadius: 16,
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.12)",
                backgroundColor: "#F8FAFC",
                paddingHorizontal: 12,
                paddingVertical: 12,
              }}
            />
          </View>

          <View style={{ flex: 1 }}>
            <Text style={{ color: UI.muted, fontWeight: "900", marginBottom: 6 }}>To</Text>
            <TextInput
              value={dateTo}
              onChangeText={(v) => {
                setRange("custom");
                setDateTo(v);
              }}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={UI.faint}
              style={{
                color: UI.text,
                fontWeight: "900",
                borderRadius: 16,
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.12)",
                backgroundColor: "rgba(255,255,255,0.06)",
                paddingHorizontal: 12,
                paddingVertical: 12,
              }}
            />
          </View>
        </View>

        <Pressable
          onPress={() => void load()}
          hitSlop={10}
          style={({ pressed }) => ({
            borderRadius: 18,
            borderWidth: 1,
            borderColor: "rgba(16,185,129,0.32)",
            backgroundColor: "rgba(16,185,129,0.14)",
            paddingVertical: 14,
            alignItems: "center",
            opacity: pressed ? 0.92 : 1,
          })}
        >
          <Text style={{ color: UI.text, fontWeight: "900" }}>
            {loading ? "Loading..." : "Search"}
          </Text>
        </Pressable>

        {!!err && (
          <Text style={{ color: UI.danger, fontWeight: "900" }}>{err}</Text>
        )}
      </Card>

      <View style={{ height: 14 }} />

      <Card
        style={{
          gap: 14,
          borderRadius: 26,
          borderColor: "rgba(16,185,129,0.28)",
          backgroundColor: "#ECFDF5",
        }}
      >
        <Text style={{ color: UI.text, fontWeight: "900", fontSize: 18 }}>
          Range Summary
        </Text>

        <View style={{ flexDirection: "row", gap: 12 }}>
          <MiniStat hidden={!canSeeCapitalSecrets} label="Asset" value={fmtMoney(summary.asset)} />
          <MiniStat label="Cost" value={fmtMoney(summary.cost)} />
          <MiniStat label="Income" value={fmtMoney(summary.income)} />
        </View>

        <View
          style={{
            borderRadius: 18,
            borderWidth: 1,
            borderColor: netPositive
              ? "rgba(16,185,129,0.34)"
              : netNegative
              ? "rgba(239,68,68,0.34)"
              : "rgba(255,255,255,0.12)",
            backgroundColor: netPositive
              ? "rgba(16,185,129,0.12)"
              : netNegative
              ? "rgba(239,68,68,0.10)"
              : "rgba(255,255,255,0.05)",
            padding: 14,
            gap: 4,
          }}
        >
          <Text style={{ color: UI.muted, fontWeight: "900", fontSize: 12 }}>
            DAILY NET CHECK
          </Text>
          <Text style={{ color: netColor, fontWeight: "900", fontSize: 22 }}>
            {netLabel}: {netValue}
          </Text>
          <Text style={{ color: UI.faint, fontWeight: "800" }}>
            Income minus Cost kwa range uliyochagua.
          </Text>
        </View>

        <Text style={{ color: UI.muted, fontWeight: "800" }}>
          Records: <Text style={{ color: UI.text, fontWeight: "900" }}>{summary.totalRecords}</Text>{" "}
          • Range: <Text style={{ color: UI.text, fontWeight: "900" }}>{dateFrom}</Text> →{" "}
          <Text style={{ color: UI.text, fontWeight: "900" }}>{dateTo}</Text>
        </Text>
      </Card>

      <View style={{ height: 14 }} />

      {displayRows.length === 0 ? (
        <Card
          style={{
            borderRadius: 26,
            borderColor: "rgba(147,197,253,0.55)",
            backgroundColor: "#FFFFFF",
          }}
        >
          <Text style={{ color: UI.text, fontWeight: "900", fontSize: 16 }}>
            No records found
          </Text>
          <Text style={{ color: UI.muted, fontWeight: "800", marginTop: 6 }}>
            Hakuna rekodi kwa range hii.
          </Text>
        </Card>
      ) : (
        displayRows.map((item) => {
          const isAsset = item.entry_type === "ASSET";
          const isCost = item.entry_type === "COST";
          const isIncome = item.entry_type === "INCOME";

          if (isAsset && !canSeeCapitalSecrets) return null;

          const color = isIncome ? UI.emerald : isCost ? UI.danger : UI.text;

          return (
            <Card
              key={item.id}
              style={{
                marginBottom: 12,
                borderRadius: 26,
                borderColor: "rgba(147,197,253,0.55)",
                backgroundColor: "#FFFFFF",
              }}
            >
              <Text style={{ color, fontWeight: "900", fontSize: 16 }}>
                {item.entry_type} — {fmtMoney(item.amount)}
              </Text>

              {!!item.note && (
                <Text style={{ color: UI.muted, marginTop: 6, fontWeight: "800" }}>
                  {item.note}
                </Text>
              )}

              <Text style={{ color: UI.faint, marginTop: 8, fontWeight: "800" }}>
                {fmtLocal(item.created_at)}
              </Text>

              <Text style={{ color: UI.faint, marginTop: 4, fontWeight: "800" }}>
                Recorded by: {item.displayRecordedBy}
              </Text>

              <Text style={{ color: UI.faint, fontWeight: "800" }}>
                Role: {clean(item.created_role || "—").toUpperCase()}
              </Text>

              {canEditRow(item) ? (
                <Pressable
                  onPress={() => openEdit(item)}
                  style={({ pressed }) => ({
                    marginTop: 12,
                    borderRadius: 16,
                    borderWidth: 1,
                    borderColor: "rgba(16,185,129,0.28)",
                    backgroundColor: "rgba(16,185,129,0.10)",
                    paddingVertical: 11,
                    alignItems: "center",
                    opacity: pressed ? 0.9 : 1,
                  })}
                >
                  <Text style={{ color: UI.emerald, fontWeight: "900" }}>Edit</Text>
                </Pressable>
              ) : null}
            </Card>
          );
        })
      )}
    </Screen>
  );
}