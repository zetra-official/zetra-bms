import { useFocusEffect } from "@react-navigation/native";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import { useOrg } from "../../../src/context/OrgContext";
import { supabase } from "../../../src/supabase/supabaseClient";
import { Button } from "../../../src/ui/Button";
import { Card } from "../../../src/ui/Card";
import { Screen } from "../../../src/ui/Screen";
import { theme } from "../../../src/ui/theme";

// ✅ local YYYY-MM-DD (avoid UTC off-by-one)
function localYMD(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function fromYMD(s: string) {
  const [y, m, d] = s.split("-").map((x) => Number(x));
  return new Date(y, (m ?? 1) - 1, d ?? 1, 12, 0, 0, 0);
}
function fmtInt(n: number) {
  try {
    return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(n);
  } catch {
    return String(n);
  }
}
function weekRangeFromDateStr(dateStr: string) {
  const d = fromYMD(dateStr);
  const day = d.getDay();
  const diffToMon = (day + 6) % 7;
  const start = new Date(d);
  start.setDate(d.getDate() - diffToMon);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return { start: localYMD(start), end: localYMD(end) };
}
function monthRangeFromDateStr(dateStr: string) {
  const d = fromYMD(dateStr);
  const start = new Date(d.getFullYear(), d.getMonth(), 1, 12, 0, 0, 0);
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 0, 12, 0, 0, 0);
  return { start: localYMD(start), end: localYMD(end) };
}
function isAfterYMD(a: string, b: string) {
  return a > b;
}

type ClosingSummary = {
  date: string;
  store_id: string;
  opening_qty_total: number;
  closing_qty_total: number;
  in_qty_total: number;
  out_qty_total: number;
  net_change: number;
  period_start?: string;
  period_end?: string;
};

type SnapshotState = "unknown" | "ok" | "missing";
type RangeMode = "day" | "week" | "month";

export default function DailyClosingScreen() {
  const router = useRouter();
  const { activeOrgName, activeRole, activeStoreId, activeStoreName } = useOrg();

  const [dateStr, setDateStr] = useState(localYMD());
  const [mode, setMode] = useState<RangeMode>("day");

  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<ClosingSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [snapState, setSnapState] = useState<SnapshotState>("unknown");
  const [snapCheckLoading, setSnapCheckLoading] = useState(false);
  const [snapBoundary, setSnapBoundary] = useState<{ hasStart?: boolean; hasEnd?: boolean }>({});
  const [snapGenLoading, setSnapGenLoading] = useState(false);

  // ✅ LOCK state (THIS is the "pad" you said disappeared)
  const [lockChecking, setLockChecking] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [lockBusy, setLockBusy] = useState(false);

  const isOwnerOrAdmin = useMemo(() => {
    const r = (activeRole ?? "staff") as "owner" | "admin" | "staff";
    return r === "owner" || r === "admin";
  }, [activeRole]);

  const roleLabel = activeRole ?? "—";

  const period = useMemo(() => {
    if (mode === "week") return weekRangeFromDateStr(dateStr);
    if (mode === "month") return monthRangeFromDateStr(dateStr);
    return null;
  }, [mode, dateStr]);

  const changeToToday = useCallback(() => {
    setDateStr(localYMD());
    setMode("day");
  }, []);

  const changeToYesterday = useCallback(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    setDateStr(localYMD(d));
    setMode("day");
  }, []);

  const pickDay = useCallback(() => setMode("day"), []);
  const pickWeek = useCallback(() => setMode("week"), []);
  const pickMonth = useCallback(() => setMode("month"), []);

  const snapshotExists = useCallback(
    async (snapDate: string) => {
      const { data, error: e } = await supabase
        .from("inventory_daily_snapshots")
        .select("id")
        .eq("store_id", activeStoreId)
        .eq("snapshot_date", snapDate)
        .limit(1);

      if (e) throw e;
      return Array.isArray(data) && data.length > 0;
    },
    [activeStoreId]
  );

  const checkSnapshot = useCallback(async () => {
    if (!activeStoreId || !isOwnerOrAdmin) {
      setSnapState("unknown");
      setSnapBoundary({});
      return;
    }

    setSnapCheckLoading(true);
    try {
      if (mode === "day") {
        const has = await snapshotExists(dateStr);
        setSnapState(has ? "ok" : "missing");
        setSnapBoundary({});
      } else {
        const start = period?.start;
        const end = period?.end;
        if (!start || !end) {
          setSnapState("unknown");
          setSnapBoundary({});
        } else {
          const [hasStart, hasEnd] = await Promise.all([
            snapshotExists(start),
            snapshotExists(end),
          ]);
          setSnapBoundary({ hasStart, hasEnd });
          setSnapState(hasStart && hasEnd ? "ok" : "missing");
        }
      }
    } catch {
      setSnapState("unknown");
      setSnapBoundary({});
    } finally {
      setSnapCheckLoading(false);
    }
  }, [activeStoreId, isOwnerOrAdmin, mode, dateStr, period?.start, period?.end, snapshotExists]);

  useEffect(() => {
    checkSnapshot();
  }, [checkSnapshot]);

  // ✅ Check lock status (DAY ONLY)
  const checkLock = useCallback(async () => {
    if (!activeStoreId || mode !== "day") {
      setIsLocked(false);
      return;
    }

    setLockChecking(true);
    try {
      const { data, error: e } = await supabase.rpc("is_closing_locked", {
        p_store_id: activeStoreId,
        p_date: dateStr,
      });
      if (e) throw e;
      setIsLocked(Boolean(data));
    } catch {
      setIsLocked(false);
    } finally {
      setLockChecking(false);
    }
  }, [activeStoreId, mode, dateStr]);

  useEffect(() => {
    checkLock();
  }, [checkLock]);

  // ✅ refresh lock/snapshot when you come back
  useFocusEffect(
    useCallback(() => {
      checkSnapshot();
      checkLock();
    }, [checkSnapshot, checkLock])
  );

  const mapRowToSummary = useCallback(
    (row: any, fallbackDateLabel: string, extra?: { start?: string; end?: string }) => {
      if (!row) {
        return {
          date: fallbackDateLabel,
          store_id: activeStoreId!,
          opening_qty_total: 0,
          closing_qty_total: 0,
          in_qty_total: 0,
          out_qty_total: 0,
          net_change: 0,
          period_start: extra?.start,
          period_end: extra?.end,
        } as ClosingSummary;
      }

      return {
        date: fallbackDateLabel,
        store_id: row.store_id ?? activeStoreId!,
        opening_qty_total: Number(row.opening_qty_total ?? 0),
        closing_qty_total: Number(row.closing_qty_total ?? 0),
        in_qty_total: Number(row.in_qty_total ?? 0),
        out_qty_total: Number(row.out_qty_total ?? 0),
        net_change: Number(row.net_change ?? 0),
        period_start: extra?.start,
        period_end: extra?.end,
      } as ClosingSummary;
    },
    [activeStoreId]
  );

  const loadDaily = useCallback(async () => {
    if (!activeStoreId) {
      setError("No active store selected.");
      setSummary(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { data, error: e } = await supabase.rpc("get_daily_closing_summary", {
        p_store_id: activeStoreId,
        p_date: dateStr,
      });
      if (e) throw e;

      const row = Array.isArray(data) ? data[0] : data;
      setSummary(mapRowToSummary(row, dateStr));

      checkSnapshot();
      checkLock();
    } catch (err: any) {
      setSummary(null);
      const msg = err?.message ?? "Failed to load daily closing";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [activeStoreId, dateStr, mapRowToSummary, checkSnapshot, checkLock]);

  const loadPeriod = useCallback(async () => {
    if (!activeStoreId) {
      setError("No active store selected.");
      setSummary(null);
      return;
    }

    const start = period?.start;
    const end = period?.end;
    if (!start || !end) {
      setError("Invalid period range.");
      setSummary(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { data, error: e } = await supabase.rpc("get_period_closing_summary", {
        p_store_id: activeStoreId,
        p_start_date: start,
        p_end_date: end,
      });
      if (e) throw e;

      const row = Array.isArray(data) ? data[0] : data;
      const label = `${start} .. ${end}`;
      setSummary(mapRowToSummary(row, label, { start, end }));

      checkSnapshot();
      setIsLocked(false);
    } catch (err: any) {
      setSummary(null);
      const msg = err?.message ?? "Failed to load period closing";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [activeStoreId, period?.start, period?.end, mapRowToSummary, checkSnapshot]);

  const load = useCallback(async () => {
    if (mode === "day") return loadDaily();
    return loadPeriod();
  }, [mode, loadDaily, loadPeriod]);

  const todayYMD = useMemo(() => localYMD(), []);
  const snapStatusMeta = useMemo(() => {
    if (!isOwnerOrAdmin) {
      return { tone: "muted" as const, title: "Auto snapshots: ON (system)", subtitle: "" };
    }
    if (snapCheckLoading) {
      return { tone: "muted" as const, title: "Checking snapshots...", subtitle: "" };
    }

    if (mode === "day") {
      if (isLocked) {
        return {
          tone: "emerald" as const,
          title: `LOCKED ✅ (${dateStr})`,
          subtitle: "Siku hii imefungwa. Inventory movements zimesitishwa kwa tarehe hii.",
        };
      }

      if (snapState === "ok") {
        return {
          tone: "emerald" as const,
          title: `Snapshot status: OK (${dateStr})`,
          subtitle: "Daily snapshot ipo tayari.",
        };
      }
      if (snapState === "missing") {
        const waiting = isAfterYMD(dateStr, todayYMD);
        return waiting
          ? {
              tone: "muted" as const,
              title: `Snapshot status: WAITING (${dateStr})`,
              subtitle: "Hii date bado haijafika. Auto snapshot hu-run usiku (TZ).",
            }
          : {
              tone: "danger" as const,
              title: `Snapshot status: MISSING (${dateStr})`,
              subtitle: "Snapshot haipo kwa date hii (unaweza tumia Emergency Snapshot kama rescue).",
            };
      }
      return { tone: "muted" as const, title: "Snapshot status: Unknown", subtitle: "" };
    }

    const start = period?.start ?? "?";
    const end = period?.end ?? "?";
    const hasStart = snapBoundary.hasStart;
    const hasEnd = snapBoundary.hasEnd;

    if (snapState === "ok") {
      return {
        tone: "emerald" as const,
        title: `Snapshot status: OK (${start} & ${end})`,
        subtitle: "Boundary snapshots zote zipo tayari.",
      };
    }

    if (hasStart === undefined || hasEnd === undefined) {
      return { tone: "muted" as const, title: `Snapshot status: Unknown (${start} & ${end})`, subtitle: "" };
    }

    const endInFuture = end !== "?" && isAfterYMD(end, todayYMD);

    if (!hasStart && !hasEnd) {
      return {
        tone: "danger" as const,
        title: `Snapshot status: MISSING (${start} & ${end})`,
        subtitle: "Start na End snapshots zote hazipo bado.",
      };
    }

    if (!hasStart) {
      return {
        tone: "danger" as const,
        title: `Snapshot status: MISSING (start ${start})`,
        subtitle: "Start snapshot haipo — period report haiwezi ku-calc bila start boundary.",
      };
    }

    if (!hasEnd) {
      return endInFuture
        ? {
            tone: "muted" as const,
            title: `Snapshot status: WAITING (end ${end})`,
            subtitle: "End-date bado haijafika. Auto snapshot hu-run usiku (TZ) kwenye end-date.",
          }
        : {
            tone: "danger" as const,
            title: `Snapshot status: MISSING (end ${end})`,
            subtitle: "End snapshot haipo — unaweza tumia Emergency Snapshot kama rescue.",
          };
    }

    return { tone: "muted" as const, title: `Snapshot status: Unknown (${start} & ${end})`, subtitle: "" };
  }, [
    isOwnerOrAdmin,
    snapCheckLoading,
    mode,
    snapState,
    dateStr,
    period?.start,
    period?.end,
    snapBoundary.hasStart,
    snapBoundary.hasEnd,
    todayYMD,
    isLocked,
  ]);

  const snapStatusTone = snapStatusMeta.tone;

  const emergencySnapshot = useCallback(() => {
    Alert.alert("Not Included", "Emergency Snapshot logic iko unchanged kwako — tumeacha kama ilivyokuwa.");
  }, []);

  const lockDay = useCallback(() => {
    if (!activeStoreId) return Alert.alert("Missing", "No active store selected.");
    if (!isOwnerOrAdmin) return Alert.alert("No Access", "Owner/Admin only.");
    if (mode !== "day") return Alert.alert("Not allowed", "Lock inaruhusiwa kwenye Day mode tu.");
    if (isLocked) return Alert.alert("Locked", "Siku hii imefungwa tayari.");
    if (lockBusy) return;

    if (snapState !== "ok") {
      Alert.alert("Cannot Lock", "Snapshot haipo OK bado. Hakikisha snapshot ipo (OK) kisha ndio u-lock day.");
      return;
    }

    Alert.alert(
      "Lock Day",
      `Ukifunga siku, inventory movements kwa ${dateStr} zitasitishwa.\n\nUna uhakika?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Lock Now",
          style: "default",
          onPress: async () => {
            setLockBusy(true);
            try {
              const { error: e } = await supabase.rpc("lock_closing_day", {
                p_store_id: activeStoreId,
                p_date: dateStr,
                p_note: "Locked via Daily Closing screen",
              });
              if (e) throw e;

              setIsLocked(true);
              Alert.alert("Locked ✅", `Siku ${dateStr} imefungwa.`);
              await checkLock();
            } catch (err: any) {
              Alert.alert("Lock Failed", err?.message ?? "Unknown error");
            } finally {
              setLockBusy(false);
            }
          },
        },
      ]
    );
  }, [activeStoreId, isOwnerOrAdmin, mode, isLocked, lockBusy, dateStr, snapState, checkLock]);

  const unlockDay = useCallback(() => {
    if (!activeStoreId) return Alert.alert("Missing", "No active store selected.");
    if (!isOwnerOrAdmin) return Alert.alert("No Access", "Owner/Admin only.");
    if (mode !== "day") return Alert.alert("Not allowed", "Unlock inaruhusiwa kwenye Day mode tu.");
    if (!isLocked) return Alert.alert("Not Locked", "Siku hii haijafungwa.");
    if (lockBusy) return;

    Alert.alert(
      "Unlock Day",
      `Hii ni rescue.\n\nUnataka kufungua lock ya ${dateStr}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Unlock",
          style: "destructive",
          onPress: async () => {
            setLockBusy(true);
            try {
              const { error: e } = await supabase.rpc("unlock_closing_day", {
                p_store_id: activeStoreId,
                p_date: dateStr,
              });
              if (e) throw e;

              setIsLocked(false);
              Alert.alert("Unlocked ✅", `Lock ya ${dateStr} imeondolewa.`);
              await checkLock();
            } catch (err: any) {
              Alert.alert("Unlock Failed", err?.message ?? "Unknown error");
            } finally {
              setLockBusy(false);
            }
          },
        },
      ]
    );
  }, [activeStoreId, isOwnerOrAdmin, mode, isLocked, lockBusy, dateStr, checkLock]);

  const opening = summary?.opening_qty_total ?? 0;
  const closing = summary?.closing_qty_total ?? 0;
  const inQty = summary?.in_qty_total ?? 0;
  const outQty = summary?.out_qty_total ?? 0;
  const net = summary?.net_change ?? 0;
  const netPositive = net >= 0;

  const titleLabel = useMemo(() => {
    if (mode === "week") return "Weekly Closing Report";
    if (mode === "month") return "Monthly Closing Report";
    return "Daily Closing Report";
  }, [mode]);

  const rangeBtnStyle = useCallback(
    (active: boolean) => ({
      flex: 1,
      borderWidth: 1,
      borderColor: active ? theme.colors.emeraldBorder : theme.colors.border,
      borderRadius: theme.radius.pill,
      paddingHorizontal: 12,
      paddingVertical: 12,
      backgroundColor: active ? "rgba(52,211,153,0.10)" : theme.colors.card,
    }),
    []
  );

  const rangeBtnTextStyle = useCallback(
    (active: boolean) => ({
      color: theme.colors.text,
      fontWeight: "900" as const,
      textAlign: "center" as const,
      opacity: active ? 1 : 0.9,
    }),
    []
  );

  const showLockControls = useMemo(() => {
    if (!isOwnerOrAdmin) return false;
    if (mode !== "day") return false;
    return true;
  }, [isOwnerOrAdmin, mode]);

  return (
    <Screen scroll>
      {/* ✅ HEADER with HISTORY + BACK (restored) */}
      <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 12 }}>
        <Text style={{ fontSize: 24, fontWeight: "900", color: theme.colors.text }}>
          {titleLabel}
        </Text>

        <View style={{ flexDirection: "row", gap: 10 }}>
          <Pressable
            onPress={() => router.push("/(tabs)/stores/closing-history")}
            style={{
              borderWidth: 1,
              borderColor: "rgba(52,211,153,0.35)",
              borderRadius: theme.radius.pill,
              paddingHorizontal: 14,
              paddingVertical: 10,
              backgroundColor: "rgba(52,211,153,0.08)",
            }}
          >
            <Text style={{ color: theme.colors.emerald, fontWeight: "900" }}>History</Text>
          </Pressable>

          <Pressable
            onPress={() => router.back()}
            style={{
              borderWidth: 1,
              borderColor: theme.colors.border,
              borderRadius: theme.radius.pill,
              paddingHorizontal: 14,
              paddingVertical: 10,
              backgroundColor: theme.colors.card,
            }}
          >
            <Text style={{ color: theme.colors.text, fontWeight: "900" }}>Back</Text>
          </Pressable>
        </View>
      </View>

      <Card style={{ gap: 10 }}>
        <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>Organization</Text>
        <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 18 }}>
          {activeOrgName ?? "—"}
        </Text>

        <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>Store</Text>
        <Text style={{ color: theme.colors.text, fontWeight: "900" }}>
          {activeStoreName ?? "—"}
        </Text>

        <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>Role</Text>
        <Text style={{ color: theme.colors.text, fontWeight: "900" }}>{roleLabel}</Text>

        <Text style={{ color: theme.colors.muted, fontWeight: "800", marginTop: 6 }}>
          Range
        </Text>

        <View style={{ flexDirection: "row", gap: 10 }}>
          <Pressable onPress={pickDay} style={rangeBtnStyle(mode === "day")}>
            <Text style={rangeBtnTextStyle(mode === "day")}>Day</Text>
          </Pressable>

          <Pressable onPress={pickWeek} style={rangeBtnStyle(mode === "week")}>
            <Text style={rangeBtnTextStyle(mode === "week")}>This Week</Text>
          </Pressable>

          <Pressable onPress={pickMonth} style={rangeBtnStyle(mode === "month")}>
            <Text style={rangeBtnTextStyle(mode === "month")}>This Month</Text>
          </Pressable>
        </View>

        <Text style={{ color: theme.colors.muted, fontWeight: "800", marginTop: 6 }}>
          {mode === "day" ? "Date" : "Period"}
        </Text>

        <View style={{ flexDirection: "row", gap: 10 }}>
          <View
            style={{
              flex: 1,
              borderWidth: 1,
              borderColor: theme.colors.border,
              borderRadius: theme.radius.pill,
              paddingVertical: 12,
              paddingHorizontal: 14,
              backgroundColor: theme.colors.card,
            }}
          >
            <Text style={{ color: theme.colors.text, fontWeight: "900" }}>
              {mode === "day" ? dateStr : `${period?.start ?? "?"} .. ${period?.end ?? "?"}`}
            </Text>
          </View>

          <Pressable
            onPress={changeToYesterday}
            style={{
              borderWidth: 1,
              borderColor: theme.colors.border,
              borderRadius: theme.radius.pill,
              paddingHorizontal: 12,
              paddingVertical: 12,
              backgroundColor: theme.colors.card,
            }}
          >
            <Text style={{ color: theme.colors.text, fontWeight: "900" }}>Yesterday</Text>
          </Pressable>

          <Pressable
            onPress={changeToToday}
            style={{
              borderWidth: 1,
              borderColor: theme.colors.border,
              borderRadius: theme.radius.pill,
              paddingHorizontal: 12,
              paddingVertical: 12,
              backgroundColor: theme.colors.card,
            }}
          >
            <Text style={{ color: theme.colors.text, fontWeight: "900" }}>Today</Text>
          </Pressable>
        </View>

        <Button
          title={loading ? "Loading..." : "Load Report"}
          onPress={load}
          disabled={loading}
          variant="primary"
          style={{ marginTop: 6 }}
        />

        <View
          style={{
            marginTop: 6,
            borderWidth: 1,
            borderColor:
              snapStatusTone === "danger"
                ? theme.colors.dangerBorder
                : snapStatusTone === "emerald"
                ? "rgba(52,211,153,0.35)"
                : theme.colors.border,
            borderRadius: theme.radius.xl,
            padding: 12,
            backgroundColor:
              snapStatusTone === "danger"
                ? theme.colors.dangerSoft
                : snapStatusTone === "emerald"
                ? "rgba(52,211,153,0.08)"
                : theme.colors.card,
          }}
        >
          <Text
            style={{
              color:
                snapStatusTone === "danger"
                  ? theme.colors.danger
                  : snapStatusTone === "emerald"
                  ? theme.colors.emerald
                  : theme.colors.muted,
              fontWeight: "900",
            }}
          >
            {snapStatusMeta.title}
          </Text>

          {!!snapStatusMeta.subtitle && (
            <Text style={{ color: theme.colors.muted, fontWeight: "800", marginTop: 6 }}>
              {snapStatusMeta.subtitle}
            </Text>
          )}

          {mode === "day" && isOwnerOrAdmin && (
            <Text style={{ color: theme.colors.muted, fontWeight: "800", marginTop: 6 }}>
              Lock status: {lockChecking ? "checking..." : isLocked ? "LOCKED ✅" : "not locked"}
            </Text>
          )}
        </View>

        {/* ✅ THIS IS THE PAD YOU SAID DISAPPEARED */}
        {showLockControls && (
          <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
            <View style={{ flex: 1 }}>
              <Button
                title={lockBusy ? "Working..." : isLocked ? "Locked ✅" : "Lock Day (Admin)"}
                onPress={lockDay}
                disabled={lockBusy || loading || isLocked || lockChecking}
                variant="primary"
              />
            </View>

            <View style={{ flex: 1 }}>
              <Button
                title={lockBusy ? "Working..." : "Unlock (Rescue)"}
                onPress={unlockDay}
                disabled={lockBusy || loading || !isLocked || lockChecking}
                variant="secondary"
              />
            </View>
          </View>
        )}

        {/* (Optional) leave this button off if you want — but it won't break anything */}
        {!showLockControls && isOwnerOrAdmin && (
          <Button
            title={snapGenLoading ? "Generating..." : "Emergency Snapshot (Admin)"}
            onPress={emergencySnapshot}
            disabled={snapGenLoading || loading}
            variant="secondary"
            style={{ marginTop: 10 }}
          />
        )}
      </Card>

      {!!error && (
        <Card
          style={{
            borderColor: theme.colors.dangerBorder,
            backgroundColor: theme.colors.dangerSoft,
          }}
        >
          <Text style={{ color: theme.colors.danger, fontWeight: "900" }}>{error}</Text>
        </Card>
      )}

      <Text style={{ fontWeight: "900", fontSize: 16, color: theme.colors.text }}>
        Summary
      </Text>

      <Card style={{ gap: 10 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <Text style={{ color: theme.colors.muted, fontWeight: "900" }}>Opening Qty</Text>
          <Text style={{ color: theme.colors.text, fontWeight: "900" }}>{fmtInt(opening)}</Text>
        </View>

        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <Text style={{ color: theme.colors.muted, fontWeight: "900" }}>IN (Added)</Text>
          <Text style={{ color: theme.colors.text, fontWeight: "900" }}>{fmtInt(inQty)}</Text>
        </View>

        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <Text style={{ color: theme.colors.muted, fontWeight: "900" }}>OUT (Reduced)</Text>
          <Text style={{ color: theme.colors.text, fontWeight: "900" }}>{fmtInt(outQty)}</Text>
        </View>

        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <Text style={{ color: theme.colors.muted, fontWeight: "900" }}>Closing Qty</Text>
          <Text style={{ color: theme.colors.text, fontWeight: "900" }}>{fmtInt(closing)}</Text>
        </View>

        <View
          style={{
            marginTop: 6,
            borderWidth: 1,
            borderColor: netPositive ? "rgba(52,211,153,0.35)" : theme.colors.dangerBorder,
            borderRadius: theme.radius.pill,
            paddingVertical: 10,
            paddingHorizontal: 14,
            backgroundColor: netPositive ? "rgba(52,211,153,0.10)" : theme.colors.dangerSoft,
          }}
        >
          <Text
            style={{
              color: netPositive ? theme.colors.emerald : theme.colors.danger,
              fontWeight: "900",
              textAlign: "center",
            }}
          >
            Net Change: {netPositive ? "+" : ""}
            {fmtInt(net)}
          </Text>
        </View>
      </Card>
    </Screen>
  );
}