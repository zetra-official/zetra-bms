import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Animated, Easing, Pressable, Text, View } from "react-native";
import { useOrg } from "../../../src/context/OrgContext";
import { supabase } from "../../../src/supabase/supabaseClient";
import { Button } from "../../../src/ui/Button";
import { Card } from "../../../src/ui/Card";
import { Screen } from "../../../src/ui/Screen";
import { theme } from "../../../src/ui/theme";

type ProfitRowAny = Record<string, any>;

type Summary = {
  net: number;
  sales: number | null;
  expenses: number | null;
};

type RangeKey = "today" | "week" | "month";

function fmtTZS(n: number) {
  try {
    return new Intl.NumberFormat("en-TZ", {
      style: "currency",
      currency: "TZS",
      maximumFractionDigits: 0,
    }).format(n);
  } catch {
    return `TZS ${Math.round(n).toLocaleString()}`;
  }
}

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
function MoneyText({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: any;
}) {
  return (
    <Text
      style={style}
      numberOfLines={1}
      ellipsizeMode="clip"
      adjustsFontSizeToFit
      minimumFontScale={0.75}
    >
      {children}
    </Text>
  );
}

export default function ProfitScreen() {
  const router = useRouter();
  const { activeOrgName, activeRole, activeStoreId, activeStoreName } = useOrg();

  const isOwner = useMemo(() => (activeRole ?? "staff") === "owner", [activeRole]);

  const [view, setView] = useState<RangeKey>("month");

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [today, setToday] = useState<Summary>({ net: 0, sales: null, expenses: null });
  const [week, setWeek] = useState<Summary>({ net: 0, sales: null, expenses: null });
  const [month, setMonth] = useState<Summary>({ net: 0, sales: null, expenses: null });

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
   * DORA v1:
   * - Net Profit comes ONLY from DB profit RPC (owner-only): get_profit_summary
   * - Expenses are safe to show; we read expenses_total via get_store_net_profit
   *   but we DO NOT trust its net_profit (it is sales - expenses, not true margin).
   */
  const callProfit = useCallback(
    async (fromISO: string, toISO: string): Promise<Summary> => {
      if (!activeStoreId) return { net: 0, sales: null, expenses: null };

      // Run in parallel
      const [profitRes, netRes] = await Promise.all([
        supabase.rpc("get_profit_summary", {
          p_store_id: activeStoreId,
          p_from: fromISO,
          p_to: toISO,
        }),
        supabase.rpc("get_store_net_profit", {
          p_store_id: activeStoreId,
          p_from: fromISO,
          p_to: toISO,
        }),
      ]);

      if (profitRes.error) throw profitRes.error;
      if (netRes.error) throw netRes.error;

      const profitRow = Array.isArray(profitRes.data) ? profitRes.data[0] : profitRes.data;
      const netRow = Array.isArray(netRes.data) ? netRes.data[0] : netRes.data;

      const net =
        pickNumber(profitRow ?? {}, ["net_profit"]) ??
        pickNumber(profitRow ?? {}, ["net"]) ??
        0;

      const sales =
        pickNumber(profitRow ?? {}, ["revenue"]) ??
        pickNumber(profitRow ?? {}, ["sales_total"]) ??
        null;

      const expenses =
        pickNumber(netRow ?? {}, ["expenses_total"]) ??
        pickNumber(netRow ?? {}, ["expense_total"]) ??
        null;

      return {
        net: Number.isFinite(net) ? net : 0,
        sales: sales === null ? null : (Number.isFinite(sales) ? sales : null),
        expenses: expenses === null ? null : (Number.isFinite(expenses) ? expenses : null),
      };
    },
    [activeStoreId]
  );

  const computeTrendForView = useCallback(
    async (k: RangeKey) => {
      const cur = ranges[k];
      const prev = previousRange(cur.from, cur.to);

      const [curSum, prevSum] = await Promise.all([
        callProfit(cur.from, cur.to),
        callProfit(prev.from, prev.to),
      ]);

      const curNet = Number(curSum.net) || 0;
      const prevNet = Number(prevSum.net) || 0;

      const delta = curNet - prevNet;
      const pct = pctChange(curNet, prevNet);

      let direction: "up" | "down" | "flat" = "flat";
      if (delta > 0) direction = "up";
      else if (delta < 0) direction = "down";

      setTrend({
        delta,
        pct,
        direction,
        prevNet,
      });
    },
    [callProfit, ranges]
  );

  const loadAll = useCallback(async () => {
    setErr(null);
    setTrend(null);

    if (!activeStoreId) {
      setErr("No active store selected.");
      setToday({ net: 0, sales: null, expenses: null });
      setWeek({ net: 0, sales: null, expenses: null });
      setMonth({ net: 0, sales: null, expenses: null });
      return;
    }

    // ✅ HARD OWNER-ONLY GATE (no RPC calls from UI)
    if (!isOwner) {
      setErr("Huna ruhusa ya kuona Profit (Owner only).");
      setToday({ net: 0, sales: null, expenses: null });
      setWeek({ net: 0, sales: null, expenses: null });
      setMonth({ net: 0, sales: null, expenses: null });
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
      setToday({ net: 0, sales: null, expenses: null });
      setWeek({ net: 0, sales: null, expenses: null });
      setMonth({ net: 0, sales: null, expenses: null });
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

          <MoneyText style={{ color: theme.colors.text, fontWeight: "900", fontSize: 16 }}>
            {value}
          </MoneyText>
        </Card>
      );
    },
    []
  );

  const TrendHint = useMemo(() => {
    if (!isOwner) return null;
    if (!trend) return null;

    const arrow =
      trend.direction === "up"
        ? "arrow-up"
        : trend.direction === "down"
        ? "arrow-down"
        : "remove";

    const label =
      view === "today"
        ? "vs yesterday"
        : view === "week"
        ? "vs previous week"
        : "vs previous period";

    const pctText =
      trend.pct === null ? "—" : `${trend.pct >= 0 ? "+" : ""}${trend.pct.toFixed(1)}%`;

    const deltaText = fmtTZS(Math.abs(trend.delta));

    return (
      <Card
        style={{
          borderColor: theme.colors.border,
          backgroundColor: "rgba(255,255,255,0.05)",
          gap: 8,
          padding: 14,
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
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
              <Text
                style={{ color: theme.colors.muted, fontWeight: "800" }}
                numberOfLines={1}
                ellipsizeMode="tail"
              >
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
          Previous net:{" "}
          <Text style={{ color: theme.colors.text, fontWeight: "900" }}>
            {fmtTZS(trend.prevNet)}
          </Text>
        </Text>
      </Card>
    );
  }, [isOwner, trend, view]);

  const headerSubtitle = useMemo(() => {
    const org = activeOrgName ?? "—";
    const store = activeStoreName ?? "—";
    const role = activeRole ?? "—";
    return `${org} • ${store} • ${role}`;
  }, [activeOrgName, activeStoreName, activeRole]);

  return (
    <Screen
      scroll={false}
      // Keep Screen background/keyboard behavior, but we fully control layout.
      contentStyle={{ paddingHorizontal: 0, paddingTop: 0, paddingBottom: 0 }}
    >
      {/* Whole page (no scroll) */}
      <View style={{ flex: 1, padding: theme.spacing.page, gap: 10 }}>
        {/* ✅ Header: compact + aligned back button */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            paddingTop: 4,
          }}
        >
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={{ fontSize: 23, fontWeight: "900", color: theme.colors.text }}>
              Profit
            </Text>
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

        {/* Owner-only block (UX clean) */}
        {!isOwner ? (
          <Card
            style={{
              borderColor: theme.colors.dangerBorder,
              backgroundColor: theme.colors.dangerSoft,
              gap: 10,
              padding: 14,
            }}
          >
            <Text style={{ color: theme.colors.danger, fontWeight: "900", fontSize: 16 }}>
              Owner only
            </Text>
            <Text style={{ color: theme.colors.text, fontWeight: "800" }}>
              Profit inaonekana kwa Owner tu. Admin/Staff hawaruhusiwi kuona faida.
            </Text>

            <Button title="Back" onPress={() => router.back()} variant="secondary" />
          </Card>
        ) : (
          <>
            {/* ✅ Controls */}
            <Card style={{ gap: 10, padding: 14 }}>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 10,
                }}
              >
                <Text style={{ color: theme.colors.text, fontWeight: "900" }}>View</Text>

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
                    backgroundColor: loading
                      ? "rgba(255,255,255,0.04)"
                      : "rgba(255,255,255,0.06)",
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

              <View style={{ flexDirection: "row", gap: 10 }}>
                <SegButton k="today" label="Today" />
                <SegButton k="week" label="This Week" />
                <SegButton k="month" label="This Month" />
              </View>

              {loading && (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <ActivityIndicator />
                  <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>
                    Loading profit...
                  </Text>
                </View>
              )}
            </Card>

            {!!err && (
              <Card
                style={{
                  borderColor: theme.colors.dangerBorder,
                  backgroundColor: theme.colors.dangerSoft,
                  padding: 14,
                }}
              >
                <Text style={{ color: theme.colors.danger, fontWeight: "900" }}>{err}</Text>
              </Card>
            )}

            {/* ✅ Main content + footer area (no scroll) */}
            <View style={{ flex: 1, justifyContent: "space-between", gap: 10 }}>
              {/* ✅ B) Animated content zone (PowerPoint feel) */}
              <Animated.View
                style={{
                  opacity: animOpacity,
                  transform: [{ translateX: animX }],
                  gap: 10,
                }}
              >
                {TrendHint}

                <Text style={{ fontWeight: "900", fontSize: 16, color: theme.colors.text }}>
                  Summary ({labelForRange(view)})
                </Text>

                <Card style={{ gap: 10, padding: 14 }}>
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 10,
                    }}
                  >
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
                      <Text style={{ color: theme.colors.text, fontWeight: "900" }}>
                        {labelForRange(view)}
                      </Text>
                    </View>
                  </View>

                  <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 24 }}>
                    {fmtTZS(current.net)}
                  </Text>

                  <View style={{ flexDirection: "row", gap: 10, marginTop: 2 }}>
                    <MiniCard
                      title="Sales"
                      value={current.sales === null ? "—" : fmtTZS(current.sales)}
                      icon="cash-outline"
                    />
                    <MiniCard
                      title="Expenses"
                      value={current.expenses === null ? "—" : fmtTZS(current.expenses)}
                      icon="remove-circle-outline"
                    />
                  </View>
                </Card>

                <Text style={{ fontWeight: "900", fontSize: 16, color: theme.colors.text }}>
                  Quick Glance
                </Text>

                {/* ✅ A) Quick glance values auto-fit (no truncation / no broken lines) */}
                <View style={{ flexDirection: "row", gap: 10 }}>
                  <Card style={{ flex: 1, gap: 6, padding: 14 }}>
                    <Text style={{ color: theme.colors.muted, fontWeight: "800" }} numberOfLines={1}>
                      Today
                    </Text>
                    <MoneyText style={{ color: theme.colors.text, fontWeight: "900", fontSize: 16 }}>
                      {fmtTZS(today.net)}
                    </MoneyText>
                  </Card>

                  <Card style={{ flex: 1, gap: 6, padding: 14 }}>
                    <Text style={{ color: theme.colors.muted, fontWeight: "800" }} numberOfLines={1}>
                      This Week
                    </Text>
                    <MoneyText style={{ color: theme.colors.text, fontWeight: "900", fontSize: 16 }}>
                      {fmtTZS(week.net)}
                    </MoneyText>
                  </Card>

                  <Card style={{ flex: 1, gap: 6, padding: 14 }}>
                    <Text style={{ color: theme.colors.muted, fontWeight: "800" }} numberOfLines={1}>
                      This Month
                    </Text>
                    <MoneyText style={{ color: theme.colors.text, fontWeight: "900", fontSize: 16 }}>
                      {fmtTZS(month.net)}
                    </MoneyText>
                  </Card>
                </View>
              </Animated.View>

              {/* ✅ A) SECURITY footer (NOT a Card) — bottom-most, premium, stable */}
              <View style={{ paddingTop: 6 }}>
                <Text
                  style={{
                    color: theme.colors.muted,
                    fontWeight: "900",
                    letterSpacing: 1,
                    fontSize: 12,
                  }}
                >
                  SECURITY
                </Text>

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
          </>
        )}
      </View>
    </Screen>
  );
}