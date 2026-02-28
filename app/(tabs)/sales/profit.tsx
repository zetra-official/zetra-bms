// app/(tabs)/sales/profit.tsx
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  BackHandler,
  Easing,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useOrg } from "../../../src/context/OrgContext";
import { supabase } from "../../../src/supabase/supabaseClient";
import { Button } from "../../../src/ui/Button";
import { Card } from "../../../src/ui/Card";
import { Screen } from "../../../src/ui/Screen";
import { theme } from "../../../src/ui/theme";
import { useOrgMoneyPrefs } from "../../../src/ui/money";

type ProfitRowAny = Record<string, any>;

type Summary = {
  net: number;
  sales: number | null;
  cogs: number | null;
  expenses: number | null;
};

type RangeKey = "today" | "week" | "month";

type ArchivePresetKey = "THIS_YEAR" | "LAST_YEAR" | "LAST_6_MONTHS" | "CUSTOM";

function startOfDayLocal(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfDayLocal(d: Date) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

function startOfWeekMondayLocal(d: Date) {
  const x = startOfDayLocal(d);
  const day = x.getDay(); // 0 Sun ... 6 Sat
  const diff = (day === 0 ? -6 : 1) - day;
  x.setDate(x.getDate() + diff);
  return x;
}

function startOfMonthLocal(d: Date) {
  const x = startOfDayLocal(d);
  x.setDate(1);
  return x;
}

function pickNumber(obj: ProfitRowAny, keys: string[]): number | null {
  for (const k of keys) {
    if (obj && obj[k] !== undefined && obj[k] !== null) {
      const n = Number(obj[k]);
      if (!Number.isNaN(n)) return n;
    }
  }
  return null;
}

function labelForRange(r: RangeKey) {
  if (r === "today") return "Today";
  if (r === "week") return "This Week";
  return "This Month";
}

/**
 * Compare helper:
 * - Calculates previous period by shifting the same duration back.
 * - Stable across months/timezones.
 */
function previousRange(fromISO: string, toISO: string) {
  const from = new Date(fromISO).getTime();
  const to = new Date(toISO).getTime();
  const duration = Math.max(0, to - from);

  // End previous period 1ms before current starts
  const prevTo = from - 1;
  const prevFrom = prevTo - duration;

  return { from: new Date(prevFrom).toISOString(), to: new Date(prevTo).toISOString() };
}

function pctChange(current: number, prev: number): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(prev)) return null;
  if (prev === 0) return null;
  return ((current - prev) / Math.abs(prev)) * 100;
}

/** ✅ A) Money text that NEVER cuts with "..." — it auto-fits */
function MoneyText({ children, style }: { children: React.ReactNode; style?: any }) {
  return (
    <Text style={style} numberOfLines={1} ellipsizeMode="clip" adjustsFontSizeToFit minimumFontScale={0.75}>
      {children}
    </Text>
  );
}

/* =========================
   ARCHIVE MODE HELPERS
========================= */
function ymdFromDateLocal(d: Date) {
  const yy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function isValidYmd(s: string) {
  // strict YYYY-MM-DD
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [yy, mm, dd] = s.split("-").map((x) => Number(x));
  if (!Number.isFinite(yy) || !Number.isFinite(mm) || !Number.isFinite(dd)) return false;
  if (mm < 1 || mm > 12) return false;
  if (dd < 1 || dd > 31) return false;

  // Verify date actually exists (e.g. 2026-02-30 invalid)
  const d = new Date(yy, mm - 1, dd);
  if (d.getFullYear() !== yy) return false;
  if (d.getMonth() !== mm - 1) return false;
  if (d.getDate() !== dd) return false;
  return true;
}

function startOfDayFromYmdLocal(ymd: string) {
  const [yy, mm, dd] = ymd.split("-").map((x) => Number(x));
  const d = new Date(yy, mm - 1, dd, 0, 0, 0, 0);
  return d;
}

function endOfDayFromYmdLocal(ymd: string) {
  const [yy, mm, dd] = ymd.split("-").map((x) => Number(x));
  const d = new Date(yy, mm - 1, dd, 23, 59, 59, 999);
  return d;
}

export default function ProfitScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const { activeOrgId, activeOrgName, activeRole, activeStoreId, activeStoreName } = useOrg();

  // ✅ Global money formatter (org-level prefs)
  const money = useOrgMoneyPrefs(String(activeOrgId || ""));
  const fmt = useCallback((n: number) => money.fmt(n), [money]);

  const isOwner = useMemo(() => (activeRole ?? "staff") === "owner", [activeRole]);

  const [view, setView] = useState<RangeKey>("month");

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [today, setToday] = useState<Summary>({ net: 0, sales: null, cogs: null, expenses: null });
  const [week, setWeek] = useState<Summary>({ net: 0, sales: null, cogs: null, expenses: null });
  const [month, setMonth] = useState<Summary>({ net: 0, sales: null, cogs: null, expenses: null });

  // Trend per view (net profit vs previous period)
  const [trend, setTrend] = useState<{
    delta: number;
    pct: number | null;
    direction: "up" | "down" | "flat";
    prevNet: number;
  } | null>(null);

  const ranges = useMemo(() => {
    const now = new Date();

    const tFrom = startOfDayLocal(now).toISOString();
    const tTo = endOfDayLocal(now).toISOString();

    const wFrom = startOfWeekMondayLocal(now).toISOString();
    const wTo = endOfDayLocal(now).toISOString();

    const mFrom = startOfMonthLocal(now).toISOString();
    const mTo = endOfDayLocal(now).toISOString();

    return {
      today: { from: tFrom, to: tTo },
      week: { from: wFrom, to: wTo },
      month: { from: mFrom, to: mTo },
    };
  }, []);

  /**
   * DORA v1 (profit must be computed in DB; owner-only; cost hidden):
   * ✅ Use ONE canonical DB function for profit: get_store_net_profit_v2
   *   Returns: sales_total, cogs_total, expenses_total, net_profit
   */
  const callProfit = useCallback(
    async (fromISO: string, toISO: string): Promise<Summary> => {
      if (!activeStoreId) return { net: 0, sales: null, cogs: null, expenses: null };

      const res = await supabase.rpc("get_store_net_profit_v2", {
        p_store_id: activeStoreId,
        p_from: fromISO,
        p_to: toISO,
      });

      if (res.error) throw res.error;

      const row = Array.isArray(res.data) ? res.data[0] : res.data;

      const net = pickNumber(row ?? {}, ["net_profit"]) ?? pickNumber(row ?? {}, ["net"]) ?? 0;

      const sales =
        pickNumber(row ?? {}, ["sales_total"]) ?? pickNumber(row ?? {}, ["revenue"]) ?? null;

      const cogs = pickNumber(row ?? {}, ["cogs_total"]) ?? null;

      const expenses =
        pickNumber(row ?? {}, ["expenses_total"]) ?? pickNumber(row ?? {}, ["expense_total"]) ?? null;

      return {
        net: Number.isFinite(net) ? net : 0,
        sales: sales === null ? null : Number.isFinite(sales) ? sales : null,
        cogs: cogs === null ? null : Number.isFinite(cogs) ? cogs : null,
        expenses: expenses === null ? null : Number.isFinite(expenses) ? expenses : null,
      };
    },
    [activeStoreId]
  );

  const computeTrendForView = useCallback(
    async (k: RangeKey) => {
      const cur = ranges[k];
      const prev = previousRange(cur.from, cur.to);

      const [curSum, prevSum] = await Promise.all([callProfit(cur.from, cur.to), callProfit(prev.from, prev.to)]);

      const curNet = Number(curSum.net) || 0;
      const prevNet = Number(prevSum.net) || 0;

      const delta = curNet - prevNet;
      const pct = pctChange(curNet, prevNet);

      let direction: "up" | "down" | "flat" = "flat";
      if (delta > 0) direction = "up";
      else if (delta < 0) direction = "down";

      setTrend({ delta, pct, direction, prevNet });
    },
    [callProfit, ranges]
  );

  const loadAll = useCallback(async () => {
    setErr(null);
    setTrend(null);

    if (!activeStoreId) {
      setErr("No active store selected.");
      setToday({ net: 0, sales: null, cogs: null, expenses: null });
      setWeek({ net: 0, sales: null, cogs: null, expenses: null });
      setMonth({ net: 0, sales: null, cogs: null, expenses: null });
      return;
    }

    // ✅ HARD OWNER-ONLY GATE (no RPC calls from UI)
    if (!isOwner) {
      setErr("Huna ruhusa ya kuona Profit (Owner only).");
      setToday({ net: 0, sales: null, cogs: null, expenses: null });
      setWeek({ net: 0, sales: null, cogs: null, expenses: null });
      setMonth({ net: 0, sales: null, cogs: null, expenses: null });
      return;
    }

    setLoading(true);
    try {
      const [a, b, c] = await Promise.all([
        callProfit(ranges.today.from, ranges.today.to),
        callProfit(ranges.week.from, ranges.week.to),
        callProfit(ranges.month.from, ranges.month.to),
      ]);

      setToday(a);
      setWeek(b);
      setMonth(c);

      await computeTrendForView(view);
    } catch (e: any) {
      setErr(e?.message ?? "Failed to load profit");
      setToday({ net: 0, sales: null, cogs: null, expenses: null });
      setWeek({ net: 0, sales: null, cogs: null, expenses: null });
      setMonth({ net: 0, sales: null, cogs: null, expenses: null });
      setTrend(null);
    } finally {
      setLoading(false);
    }
  }, [activeStoreId, callProfit, computeTrendForView, isOwner, ranges, view]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  // When user changes view, recompute trend (owner only)
  useEffect(() => {
    if (!isOwner) return;
    if (!activeStoreId) return;
    void computeTrendForView(view);
  }, [view, computeTrendForView, isOwner, activeStoreId]);

  const current = useMemo(() => {
    if (view === "today") return today;
    if (view === "week") return week;
    return month;
  }, [view, today, week, month]);

  /** ✅ B) "PowerPoint" transition on view change (slide + fade) */
  const animOpacity = useRef(new Animated.Value(1)).current;
  const animX = useRef(new Animated.Value(0)).current;
  const didMount = useRef(false);

  useEffect(() => {
    if (!isOwner) return;
    if (!didMount.current) {
      didMount.current = true;
      return;
    }

    animOpacity.setValue(0);
    animX.setValue(18);

    Animated.parallel([
      Animated.timing(animOpacity, {
        toValue: 1,
        duration: 220,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(animX, {
        toValue: 0,
        duration: 220,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [view, isOwner, animOpacity, animX]);

  const SegButton = useCallback(
    ({ k, label }: { k: RangeKey; label: string }) => {
      const active = view === k;
      return (
        <Pressable
          onPress={() => setView(k)}
          style={({ pressed }) => ({
            flex: 1,
            paddingVertical: 9,
            borderRadius: 999,
            alignItems: "center",
            justifyContent: "center",
            borderWidth: 1,
            borderColor: active ? theme.colors.emeraldBorder : theme.colors.border,
            backgroundColor: active ? theme.colors.emeraldSoft : "rgba(255,255,255,0.06)",
            opacity: pressed ? 0.92 : 1,
            transform: pressed ? [{ scale: 0.995 }] : [{ scale: 1 }],
          })}
        >
          <Text style={{ color: theme.colors.text, fontWeight: "900" }}>{label}</Text>
        </Pressable>
      );
    },
    [view]
  );

  const MiniCard = useCallback(
    ({ title, value, icon }: { title: string; value: string; icon: any }) => {
      return (
        <Card style={{ flex: 1, gap: 6, padding: 14 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Ionicons name={icon} size={16} color="rgba(255,255,255,0.75)" />
            <Text style={{ color: theme.colors.muted, fontWeight: "800" }} numberOfLines={1}>
              {title}
            </Text>
          </View>

          <MoneyText style={{ color: theme.colors.text, fontWeight: "900", fontSize: 16 }}>{value}</MoneyText>
        </Card>
      );
    },
    []
  );

  const TrendHint = useMemo(() => {
    if (!isOwner) return null;
    if (!trend) return null;

    const arrow =
      trend.direction === "up" ? "arrow-up" : trend.direction === "down" ? "arrow-down" : "remove";

    const label = view === "today" ? "vs yesterday" : view === "week" ? "vs previous week" : "vs previous period";

    const pctText = trend.pct === null ? "—" : `${trend.pct >= 0 ? "+" : ""}${trend.pct.toFixed(1)}%`;
    const deltaText = fmt(Math.abs(trend.delta));

    return (
      <Card
        style={{
          borderColor: theme.colors.border,
          backgroundColor: "rgba(255,255,255,0.05)",
          gap: 8,
          padding: 14,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }}>
            <View
              style={{
                width: 34,
                height: 34,
                borderRadius: 999,
                alignItems: "center",
                justifyContent: "center",
                borderWidth: 1,
                borderColor: theme.colors.emeraldBorder,
                backgroundColor: theme.colors.emeraldSoft,
              }}
            >
              <Ionicons name={arrow as any} size={18} color={theme.colors.text} />
            </View>

            <View style={{ gap: 2, flex: 1 }}>
              <Text style={{ color: theme.colors.text, fontWeight: "900" }}>Trend hint</Text>
              <Text style={{ color: theme.colors.muted, fontWeight: "800" }} numberOfLines={1} ellipsizeMode="tail">
                {labelForRange(view)} {label}
              </Text>
            </View>
          </View>

          <View style={{ alignItems: "flex-end" }}>
            <Text style={{ color: theme.colors.text, fontWeight: "900" }}>{pctText}</Text>
            <Text style={{ color: theme.colors.muted, fontWeight: "800" }} numberOfLines={1}>
              Δ {deltaText}
            </Text>
          </View>
        </View>

        <Text style={{ color: theme.colors.muted, fontWeight: "800" }} numberOfLines={1}>
          Previous net: <Text style={{ color: theme.colors.text, fontWeight: "900" }}>{fmt(trend.prevNet)}</Text>
        </Text>
      </Card>
    );
  }, [isOwner, trend, view, fmt]);

  const headerSubtitle = useMemo(() => {
    const org = activeOrgName ?? "—";
    const store = activeStoreName ?? "—";
    const role = activeRole ?? "—";
    return `${org} • ${store} • ${role}`;
  }, [activeOrgName, activeStoreName, activeRole]);

  /* =========================
     ✅ ARCHIVE MODE (Owner-only)
  ========================= */
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [archivePreset, setArchivePreset] = useState<ArchivePresetKey>("THIS_YEAR");

  const [archiveFrom, setArchiveFrom] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-01-01`;
  });
  const [archiveTo, setArchiveTo] = useState(() => ymdFromDateLocal(new Date()));

  const [archiveLoading, setArchiveLoading] = useState(false);
  const [archiveErr, setArchiveErr] = useState<string | null>(null);
  const [archiveResult, setArchiveResult] = useState<{
    fromYmd: string;
    toYmd: string;
    summary: Summary;
  } | null>(null);

  const applyArchivePreset = useCallback((preset: ArchivePresetKey) => {
    const now = new Date();
    const todayYmd = ymdFromDateLocal(now);

    if (preset === "THIS_YEAR") {
      const y = now.getFullYear();
      setArchiveFrom(`${y}-01-01`);
      setArchiveTo(todayYmd);
      return;
    }

    if (preset === "LAST_YEAR") {
      const y = now.getFullYear() - 1;
      setArchiveFrom(`${y}-01-01`);
      setArchiveTo(`${y}-12-31`);
      return;
    }

    if (preset === "LAST_6_MONTHS") {
      const start = startOfDayLocal(now);
      start.setMonth(start.getMonth() - 6);
      setArchiveFrom(ymdFromDateLocal(start));
      setArchiveTo(todayYmd);
      return;
    }

    // CUSTOM: keep user inputs
  }, []);

  useEffect(() => {
    if (!archiveOpen) return;
    if (archivePreset === "CUSTOM") return;
    applyArchivePreset(archivePreset);
  }, [archiveOpen, archivePreset, applyArchivePreset]);

  const closeArchive = useCallback(() => {
    setArchiveOpen(false);
  }, []);

  // ✅ Polish #2: Android back button closes Archive first
  useEffect(() => {
    if (!archiveOpen) return;

    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      closeArchive();
      return true;
    });

    return () => sub.remove();
  }, [archiveOpen, closeArchive]);

  // ✅ Polish #1: openArchive uses archiveErr only (doesn't touch main err)
  const openArchive = useCallback(() => {
    if (!isOwner) {
      setArchiveErr("Owner only.");
      setArchiveResult(null);
      setArchiveOpen(true);
      return;
    }
    setArchiveErr(null);
    setArchiveResult(null);
    setArchiveOpen(true);
  }, [isOwner]);

  const runArchive = useCallback(async () => {
    setArchiveErr(null);
    setArchiveResult(null);

    if (!activeStoreId) {
      setArchiveErr("No active store selected.");
      return;
    }
    if (!isOwner) {
      setArchiveErr("Owner only.");
      return;
    }

    const fromYmd = archiveFrom.trim();
    const toYmd = archiveTo.trim();

    if (!isValidYmd(fromYmd) || !isValidYmd(toYmd)) {
      setArchiveErr("Tarehe si sahihi. Tumia format: YYYY-MM-DD");
      return;
    }

    const fromD = startOfDayFromYmdLocal(fromYmd);
    const toD = endOfDayFromYmdLocal(toYmd);

    if (fromD.getTime() > toD.getTime()) {
      setArchiveErr("From date lazima iwe <= To date.");
      return;
    }

    setArchiveLoading(true);
    try {
      const sum = await callProfit(fromD.toISOString(), toD.toISOString());
      setArchiveResult({ fromYmd, toYmd, summary: sum });
    } catch (e: any) {
      setArchiveErr(e?.message ?? "Failed to generate archive report.");
    } finally {
      setArchiveLoading(false);
    }
  }, [activeStoreId, isOwner, archiveFrom, archiveTo, callProfit]);

  const PresetChip = useCallback(
    ({ k, label }: { k: ArchivePresetKey; label: string }) => {
      const active = archivePreset === k;
      return (
        <Pressable
          onPress={() => setArchivePreset(k)}
          hitSlop={8}
          style={({ pressed }) => ({
            flex: 1,
            paddingVertical: 10,
            borderRadius: 999,
            alignItems: "center",
            justifyContent: "center",
            borderWidth: 1,
            borderColor: active ? theme.colors.emeraldBorder : theme.colors.border,
            backgroundColor: active ? theme.colors.emeraldSoft : "rgba(255,255,255,0.06)",
            opacity: pressed ? 0.92 : 1,
          })}
        >
          <Text style={{ color: theme.colors.text, fontWeight: "900" }}>{label}</Text>
        </Pressable>
      );
    },
    [archivePreset]
  );

  return (
    <Screen scroll={false} contentStyle={{ paddingHorizontal: 0, paddingTop: 0, paddingBottom: 0 }}>
      <View style={{ flex: 1, padding: theme.spacing.page, gap: 10 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, paddingTop: 4 }}>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={{ fontSize: 23, fontWeight: "900", color: theme.colors.text }}>Profit</Text>
            <Text style={{ color: theme.colors.muted, fontWeight: "800" }} numberOfLines={1}>
              {headerSubtitle}
            </Text>
          </View>

          <Pressable
            onPress={() => router.back()}
            hitSlop={10}
            style={({ pressed }) => ({
              width: 42,
              height: 42,
              borderRadius: 999,
              alignItems: "center",
              justifyContent: "center",
              borderWidth: 1,
              borderColor: theme.colors.border,
              backgroundColor: "rgba(255,255,255,0.06)",
              opacity: pressed ? 0.92 : 1,
              transform: pressed ? [{ scale: 0.995 }] : [{ scale: 1 }],
            })}
          >
            <Ionicons name="chevron-back" size={22} color={theme.colors.text} />
          </Pressable>
        </View>

        {!isOwner ? (
          <Card style={{ borderColor: theme.colors.dangerBorder, backgroundColor: theme.colors.dangerSoft, gap: 10, padding: 14 }}>
            <Text style={{ color: theme.colors.danger, fontWeight: "900", fontSize: 16 }}>Owner only</Text>
            <Text style={{ color: theme.colors.text, fontWeight: "800" }}>
              Profit inaonekana kwa Owner tu. Admin/Staff hawaruhusiwi kuona faida.
            </Text>

            <Button title="Back" onPress={() => router.back()} variant="secondary" />
          </Card>
        ) : (
          <>
            <Card style={{ gap: 10, padding: 14 }}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                <Text style={{ color: theme.colors.text, fontWeight: "900" }}>View</Text>

                <View style={{ flexDirection: "row", gap: 10 }}>
                  <Pressable
                    onPress={openArchive}
                    hitSlop={10}
                    style={({ pressed }) => ({
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 8,
                      paddingVertical: 7,
                      paddingHorizontal: 12,
                      borderRadius: theme.radius.pill,
                      borderWidth: 1,
                      borderColor: theme.colors.border,
                      backgroundColor: "rgba(255,255,255,0.06)",
                      opacity: pressed ? 0.92 : 1,
                      transform: pressed ? [{ scale: 0.995 }] : [{ scale: 1 }],
                    })}
                  >
                    <Ionicons name="time-outline" size={15} color={theme.colors.text} />
                    <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 13 }}>Archive</Text>
                  </Pressable>

                  <Pressable
                    onPress={loadAll}
                    disabled={loading}
                    style={({ pressed }) => ({
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 8,
                      paddingVertical: 7,
                      paddingHorizontal: 12,
                      borderRadius: theme.radius.pill,
                      borderWidth: 1,
                      borderColor: theme.colors.border,
                      backgroundColor: loading ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.06)",
                      opacity: loading ? 0.55 : pressed ? 0.92 : 1,
                      transform: pressed ? [{ scale: 0.995 }] : [{ scale: 1 }],
                    })}
                  >
                    <Ionicons name="refresh" size={15} color={theme.colors.text} />
                    <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 13 }}>
                      {loading ? "Loading..." : "Refresh"}
                    </Text>
                  </Pressable>
                </View>
              </View>

              <View style={{ flexDirection: "row", gap: 10 }}>
                <SegButton k="today" label="Today" />
                <SegButton k="week" label="This Week" />
                <SegButton k="month" label="This Month" />
              </View>

              {loading && (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <ActivityIndicator />
                  <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>Loading profit...</Text>
                </View>
              )}
            </Card>

            {!!err && (
              <Card style={{ borderColor: theme.colors.dangerBorder, backgroundColor: theme.colors.dangerSoft, padding: 14 }}>
                <Text style={{ color: theme.colors.danger, fontWeight: "900" }}>{err}</Text>
              </Card>
            )}

            <View style={{ flex: 1, justifyContent: "space-between", gap: 10 }}>
              <Animated.View style={{ opacity: animOpacity, transform: [{ translateX: animX }], gap: 10 }}>
                {TrendHint}

                <Text style={{ fontWeight: "900", fontSize: 16, color: theme.colors.text }}>
                  Summary ({labelForRange(view)})
                </Text>

                <Card style={{ gap: 10, padding: 14 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                    <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>Net Profit</Text>

                    <View
                      style={{
                        paddingHorizontal: 10,
                        paddingVertical: 6,
                        borderRadius: 999,
                        borderWidth: 1,
                        borderColor: theme.colors.emeraldBorder,
                        backgroundColor: theme.colors.emeraldSoft,
                      }}
                    >
                      <Text style={{ color: theme.colors.text, fontWeight: "900" }}>{labelForRange(view)}</Text>
                    </View>
                  </View>

                  <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 24 }}>{fmt(current.net)}</Text>

                  <View style={{ flexDirection: "row", gap: 10, marginTop: 2 }}>
                    <MiniCard title="Sales" value={current.sales === null ? "—" : fmt(current.sales)} icon="cash-outline" />
                    <MiniCard title="COGS" value={current.cogs === null ? "—" : fmt(current.cogs)} icon="pricetag-outline" />
                    <MiniCard
                      title="Expenses"
                      value={current.expenses === null ? "—" : fmt(current.expenses)}
                      icon="remove-circle-outline"
                    />
                  </View>
                </Card>

                <Text style={{ fontWeight: "900", fontSize: 16, color: theme.colors.text }}>Quick Glance</Text>

                <View style={{ flexDirection: "row", gap: 10 }}>
                  <Card style={{ flex: 1, gap: 6, padding: 14 }}>
                    <Text style={{ color: theme.colors.muted, fontWeight: "800" }} numberOfLines={1}>
                      Today
                    </Text>
                    <MoneyText style={{ color: theme.colors.text, fontWeight: "900", fontSize: 16 }}>
                      {fmt(today.net)}
                    </MoneyText>
                  </Card>

                  <Card style={{ flex: 1, gap: 6, padding: 14 }}>
                    <Text style={{ color: theme.colors.muted, fontWeight: "800" }} numberOfLines={1}>
                      This Week
                    </Text>
                    <MoneyText style={{ color: theme.colors.text, fontWeight: "900", fontSize: 16 }}>
                      {fmt(week.net)}
                    </MoneyText>
                  </Card>

                  <Card style={{ flex: 1, gap: 6, padding: 14 }}>
                    <Text style={{ color: theme.colors.muted, fontWeight: "800" }} numberOfLines={1}>
                      This Month
                    </Text>
                    <MoneyText style={{ color: theme.colors.text, fontWeight: "900", fontSize: 16 }}>
                      {fmt(month.net)}
                    </MoneyText>
                  </Card>
                </View>
              </Animated.View>

              <View style={{ paddingTop: 6 }}>
                <Text style={{ color: theme.colors.muted, fontWeight: "900", letterSpacing: 1, fontSize: 12 }}>SECURITY</Text>
                <Text
                  style={{
                    color: theme.colors.text,
                    fontWeight: "800",
                    opacity: 0.92,
                    marginTop: 4,
                    lineHeight: 18,
                  }}
                  numberOfLines={2}
                >
                  Owner-only profit. Cost data is protected. Database is the source of truth.
                </Text>
              </View>
            </View>

            {archiveOpen ? (
              <View
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  backgroundColor: "rgba(0,0,0,0.78)",
                  paddingTop: Math.max(12, insets.top + 10),
                  paddingBottom: Math.max(12, insets.bottom + 10),
                  paddingHorizontal: 14,
                }}
              >
                <View style={{ flex: 1, width: "100%", maxWidth: 720, alignSelf: "center" }}>
                  <Card
                    style={{
                      flex: 1,
                      gap: 12,
                      backgroundColor: "rgba(16,18,24,0.98)",
                      borderColor: "rgba(255,255,255,0.10)",
                      padding: 16,
                    }}
                  >
                    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                      <View style={{ gap: 2, flex: 1 }}>
                        <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 18 }}>Profit Archive</Text>
                        <Text style={{ color: theme.colors.muted, fontWeight: "800", fontSize: 12 }} numberOfLines={1}>
                          Store: {activeStoreName ?? "—"} • Choose a range
                        </Text>
                      </View>

                      <Pressable onPress={closeArchive} hitSlop={10}>
                        <Ionicons name="close" size={20} color={theme.colors.muted} />
                      </Pressable>
                    </View>

                    <View style={{ flexDirection: "row", gap: 10 }}>
                      <PresetChip k="THIS_YEAR" label="This Year" />
                      <PresetChip k="LAST_6_MONTHS" label="6 Months" />
                    </View>
                    <View style={{ flexDirection: "row", gap: 10 }}>
                      <PresetChip k="LAST_YEAR" label="Last Year" />
                      <PresetChip k="CUSTOM" label="Custom" />
                    </View>

                    <View style={{ gap: 10 }}>
                      <Text style={{ color: theme.colors.text, fontWeight: "900" }}>Date Range (YYYY-MM-DD)</Text>

                      <View style={{ flexDirection: "row", gap: 10 }}>
                        <View style={{ flex: 1, gap: 6 }}>
                          <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>From</Text>
                          <View
                            style={{
                              borderWidth: 1,
                              borderColor: theme.colors.border,
                              backgroundColor: "rgba(255,255,255,0.05)",
                              borderRadius: theme.radius.xl,
                              paddingHorizontal: 12,
                              height: 44,
                              justifyContent: "center",
                            }}
                          >
                            <TextInput
                              value={archiveFrom}
                              onChangeText={(t) => {
                                setArchivePreset("CUSTOM");
                                setArchiveFrom(t);
                              }}
                              placeholder="YYYY-MM-DD"
                              placeholderTextColor={theme.colors.faint}
                              autoCapitalize="none"
                              autoCorrect={false}
                              style={{ color: theme.colors.text, fontWeight: "900" }}
                            />
                          </View>
                        </View>

                        <View style={{ flex: 1, gap: 6 }}>
                          <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>To</Text>
                          <View
                            style={{
                              borderWidth: 1,
                              borderColor: theme.colors.border,
                              backgroundColor: "rgba(255,255,255,0.05)",
                              borderRadius: theme.radius.xl,
                              paddingHorizontal: 12,
                              height: 44,
                              justifyContent: "center",
                            }}
                          >
                            <TextInput
                              value={archiveTo}
                              onChangeText={(t) => {
                                setArchivePreset("CUSTOM");
                                setArchiveTo(t);
                              }}
                              placeholder="YYYY-MM-DD"
                              placeholderTextColor={theme.colors.faint}
                              autoCapitalize="none"
                              autoCorrect={false}
                              style={{ color: theme.colors.text, fontWeight: "900" }}
                            />
                          </View>
                        </View>
                      </View>

                      <View style={{ flexDirection: "row", gap: 10 }}>
                        <Pressable
                          onPress={() => void runArchive()}
                          disabled={archiveLoading}
                          hitSlop={10}
                          style={({ pressed }) => ({
                            flex: 1,
                            height: 44,
                            borderRadius: theme.radius.xl,
                            borderWidth: 1,
                            borderColor: theme.colors.emeraldBorder,
                            backgroundColor: theme.colors.emeraldSoft,
                            alignItems: "center",
                            justifyContent: "center",
                            opacity: archiveLoading ? 0.55 : pressed ? 0.92 : 1,
                          })}
                        >
                          <Text style={{ color: theme.colors.emerald, fontWeight: "900" }}>
                            {archiveLoading ? "Generating..." : "Generate Report"}
                          </Text>
                        </Pressable>

                        <Pressable
                          onPress={closeArchive}
                          hitSlop={10}
                          style={({ pressed }) => ({
                            width: 120,
                            height: 44,
                            borderRadius: theme.radius.xl,
                            borderWidth: 1,
                            borderColor: theme.colors.border,
                            backgroundColor: "rgba(255,255,255,0.06)",
                            alignItems: "center",
                            justifyContent: "center",
                            opacity: pressed ? 0.92 : 1,
                          })}
                        >
                          <Text style={{ color: theme.colors.text, fontWeight: "900" }}>Close</Text>
                        </Pressable>
                      </View>

                      {!!archiveErr && (
                        <Card style={{ borderColor: theme.colors.dangerBorder, backgroundColor: theme.colors.dangerSoft, padding: 14 }}>
                          <Text style={{ color: theme.colors.danger, fontWeight: "900" }}>{archiveErr}</Text>
                        </Card>
                      )}

                      {archiveLoading ? (
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                          <ActivityIndicator />
                          <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>Loading archive...</Text>
                        </View>
                      ) : null}

                      {!!archiveResult ? (
                        <View style={{ gap: 10 }}>
                          <Text style={{ fontWeight: "900", fontSize: 16, color: theme.colors.text }}>Report</Text>

                          <Card style={{ gap: 10, padding: 14 }}>
                            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                              <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>Net Profit</Text>

                              <View
                                style={{
                                  paddingHorizontal: 10,
                                  paddingVertical: 6,
                                  borderRadius: 999,
                                  borderWidth: 1,
                                  borderColor: theme.colors.border,
                                  backgroundColor: "rgba(255,255,255,0.06)",
                                }}
                              >
                                <Text style={{ color: theme.colors.text, fontWeight: "900" }}>
                                  {archiveResult.fromYmd} → {archiveResult.toYmd}
                                </Text>
                              </View>
                            </View>

                            <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 24 }}>
                              {fmt(archiveResult.summary.net)}
                            </Text>

                            <View style={{ flexDirection: "row", gap: 10, marginTop: 2 }}>
                              <MiniCard
                                title="Sales"
                                value={archiveResult.summary.sales === null ? "—" : fmt(archiveResult.summary.sales)}
                                icon="cash-outline"
                              />
                              <MiniCard
                                title="COGS"
                                value={archiveResult.summary.cogs === null ? "—" : fmt(archiveResult.summary.cogs)}
                                icon="pricetag-outline"
                              />
                              <MiniCard
                                title="Expenses"
                                value={archiveResult.summary.expenses === null ? "—" : fmt(archiveResult.summary.expenses)}
                                icon="remove-circle-outline"
                              />
                            </View>

                            <Text style={{ color: theme.colors.muted, fontWeight: "800", marginTop: 6 }}>
                              Archive Mode = kumbukumbu za muda wote (owner-only). Unaweza kuangalia hata miaka mingi nyuma kwa kuchagua tarehe.
                            </Text>
                          </Card>
                        </View>
                      ) : null}
                    </View>

                    <View style={{ flex: 1 }} />
                  </Card>
                </View>
              </View>
            ) : null}
          </>
        )}
      </View>
    </Screen>
  );
}