// app/(tabs)/index.tsx
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  AppState,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useOrg } from "../../src/context/OrgContext";
import { supabase } from "../../src/supabase/supabaseClient";
import { Button } from "../../src/ui/Button";
import { Card } from "../../src/ui/Card";
import { Screen } from "../../src/ui/Screen";
import { StoreGuard } from "../../src/ui/StoreGuard";
import { UI } from "../../src/ui/theme";
import { formatMoney, useOrgMoneyPrefs } from "../../src/ui/money";

type RangeKey = "today" | "7d" | "30d";

type MoneyBreak = { revenue: number; orders: number };
type JsonBreak = Record<string, MoneyBreak>;

type DashRow = {
  store_id: string;
  from_ts: string;
  to_ts: string;
  currency: string;

  revenue: number;
  delivered_orders: number;

  total_orders: number;
  pending_orders: number;
  confirmed_orders: number;
  ready_orders: number;
  cancelled_orders: number;

  avg_order_value: number;

  paid_revenue: number;
  awaiting_revenue: number;
  paid_orders: number;
  awaiting_orders: number;

  by_method: JsonBreak | null;
  by_channel: JsonBreak | null;
};

type FinRow = {
  org_id: string;
  store_id: string | null;
  date_from: string; // YYYY-MM-DD
  date_to: string; // YYYY-MM-DD
  stock_on_hand_value: number;
  stock_in_value: number;
};

type SalesSummary = {
  total: number;
  orders: number;
  currency?: string | null;
};

type ExpenseSummary = {
  total: number;
  count: number;
};

type ProfitSummary = {
  net: number; // TRUE net profit
  sales: number | null;
  expenses: number | null;
};

type PayBreakdown = {
  cash: number;
  bank: number;
  mobile: number;
  credit: number; // outstanding balance (NOT money in)
  other: number; // kept for backward compatibility (should be 0 in STRICT mode)
  orders: number;
};

type CollectionBreakdown = {
  cash: number;
  bank: number;
  mobile: number;
  other: number; // kept for backward compatibility (should be 0 in STRICT mode)
  total: number;
  payments: number;
};

const AUTO_REFRESH_MS = 30_000;

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

// local-safe YYYY-MM-DD (NO UTC shift)
function toIsoDateLocal(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function startOfLocalDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

function endOfLocalDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

function rangeToFromTo(k: RangeKey) {
  const now = new Date();
  const to = endOfLocalDay(now);
  const from = startOfLocalDay(now);

  if (k === "today") {
    // already set
  } else if (k === "7d") {
    from.setDate(from.getDate() - 6);
  } else {
    from.setDate(from.getDate() - 29);
  }

  return { from: from.toISOString(), to: to.toISOString() };
}

function rangeToDates(k: RangeKey) {
  const now = new Date();
  const to = new Date(now);
  const from = new Date(now);

  if (k === "today") {
    // today
  } else if (k === "7d") {
    from.setDate(from.getDate() - 6);
  } else {
    from.setDate(from.getDate() - 29);
  }

  return { from: toIsoDateLocal(from), to: toIsoDateLocal(to) };
}

/**
 * ✅ PROFIT date range helper (END-EXCLUSIVE)
 * Many profit RPCs validate p_to > p_from.
 * If we send today->today, DB returns "Invalid range".
 * Fix: keep UI dates intact, but for PROFIT only send to = tomorrow (exclusive end).
 */
function rangeToProfitDatesExclusive(k: RangeKey) {
  const now = new Date();
  const from = new Date(now);
  const toExclusive = new Date(now);

  if (k === "today") {
    // from stays today
  } else if (k === "7d") {
    from.setDate(from.getDate() - 6);
  } else {
    from.setDate(from.getDate() - 29);
  }

  // end-exclusive => tomorrow
  toExclusive.setDate(toExclusive.getDate() + 1);

  const fromYMD = toIsoDateLocal(from);
  const toYMD = toIsoDateLocal(toExclusive);

  // extra safety: ensure to > from
  if (toYMD <= fromYMD) {
    const bump = new Date(from);
    bump.setDate(bump.getDate() + 1);
    return { from: fromYMD, to: toIsoDateLocal(bump) };
  }

  return { from: fromYMD, to: toYMD };
}

function toNum(x: any) {
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
}

function toInt(x: any) {
  const n = Number(x);
  if (!Number.isFinite(n)) return 0;
  return Math.trunc(n);
}

function normalizeBreak(obj: any): JsonBreak | null {
  if (!obj || typeof obj !== "object") return null;
  const out: JsonBreak = {};
  for (const [k, v] of Object.entries(obj)) {
    const revenue = toNum((v as any)?.revenue);
    const orders = toInt((v as any)?.orders);
    out[String(k)] = { revenue, orders };
  }
  return out;
}

function normalizeDash(raw: any, fallbackFrom: string, fallbackTo: string, storeId: string): DashRow {
  const store_id = String(raw?.store_id ?? raw?.p_store_id ?? storeId ?? "").trim();

  const from_ts = String(raw?.from_ts ?? raw?.date_from ?? raw?.p_from ?? fallbackFrom ?? "").trim();
  const to_ts = String(raw?.to_ts ?? raw?.date_to ?? raw?.p_to ?? fallbackTo ?? "").trim();

  const currency = String(raw?.currency ?? "TZS").trim() || "TZS";

  const revenue = toNum(raw?.revenue ?? raw?.revenue_amount ?? 0);
  const delivered_orders = toInt(raw?.delivered_orders ?? raw?.revenue_orders ?? 0);

  const total_orders = toInt(raw?.total_orders ?? raw?.total ?? 0);
  const pending_orders = toInt(raw?.pending_orders ?? raw?.pending ?? 0);
  const confirmed_orders = toInt(raw?.confirmed_orders ?? raw?.confirmed ?? 0);
  const ready_orders = toInt(raw?.ready_orders ?? raw?.ready ?? 0);
  const cancelled_orders = toInt(raw?.cancelled_orders ?? raw?.cancelled ?? 0);

  const avg_order_value = toNum(raw?.avg_order_value ?? 0);

  const paid_revenue = toNum(raw?.paid_revenue ?? 0);
  const awaiting_revenue = toNum(raw?.awaiting_revenue ?? 0);
  const paid_orders = toInt(raw?.paid_orders ?? 0);
  const awaiting_orders = toInt(raw?.awaiting_orders ?? 0);

  const by_method = normalizeBreak(raw?.by_method);
  const by_channel = normalizeBreak(raw?.by_channel);

  return {
    store_id,
    from_ts,
    to_ts,
    currency,
    revenue,
    delivered_orders,
    total_orders,
    pending_orders,
    confirmed_orders,
    ready_orders,
    cancelled_orders,
    avg_order_value,
    paid_revenue,
    awaiting_revenue,
    paid_orders,
    awaiting_orders,
    by_method,
    by_channel,
  };
}

function extractScalarValue(x: any): number {
  if (x == null) return 0;
  if (typeof x === "number" || typeof x === "string") return toNum(x);

  if (typeof x === "object" && !Array.isArray(x)) {
    const known =
      x?.value ??
      x?.amount ??
      x?.total ??
      x?.sum ??
      x?.stock_value ??
      x?.stock_on_hand_value ??
      x?.on_hand_value ??
      x?.stock_in_value ??
      x?.stock_in ??
      x?.in_value ??
      x?.received_value;

    if (known != null) return toNum(known);

    const keys = Object.keys(x);
    if (keys.length === 1) return toNum((x as any)[keys[0]]);

    for (const k of keys) {
      const v = (x as any)[k];
      const n = Number(v);
      if (Number.isFinite(n)) return n;
    }
  }

  return 0;
}

// numbers should NOT be ellipsized; autoshrink instead.
function MiniStat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <View style={{ flex: 1, gap: 4, minWidth: 0 }}>
      <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12 }} numberOfLines={1} ellipsizeMode="tail">
        {label}
      </Text>

      <Text
        style={{ color: UI.text, fontWeight: "900", fontSize: 16 }}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.75}
        allowFontScaling={false}
      >
        {value}
      </Text>

      {!!hint && (
        <Text style={{ color: UI.faint, fontWeight: "800", fontSize: 12 }} numberOfLines={1} ellipsizeMode="tail">
          {hint}
        </Text>
      )}
    </View>
  );
}

function useAutoRefresh(cb: () => void, enabled: boolean, ms: number) {
  const cbRef = useRef(cb);
  cbRef.current = cb;

  useEffect(() => {
    if (!enabled) return;

    let alive = true;
    let interval: any = null;

    const start = () => {
      if (!alive) return;
      if (interval) clearInterval(interval);
      interval = setInterval(() => {
        if (!alive) return;
        cbRef.current();
      }, ms);
    };

    const sub = AppState.addEventListener("change", (state) => {
      if (!alive) return;
      if (state === "active") start();
      else {
        if (interval) clearInterval(interval);
        interval = null;
      }
    });

    start();

    return () => {
      alive = false;
      try {
        // @ts-ignore
        sub?.remove?.();
      } catch {}
      if (interval) clearInterval(interval);
    };
  }, [enabled, ms]);
}

/** ---------- ✅ Finance Card (SALES / EXPENSES / PROFIT) ---------- */
function CompactFinanceCard() {
  const router = useRouter();
  const org = useOrg();

  const orgId = String(org.activeOrgId ?? "").trim();
  const orgName = String(org.activeOrgName ?? "Org").trim() || "Org";

  const storeId = String(org.activeStoreId ?? "").trim();
  const storeName = String(org.activeStoreName ?? "Store").trim() || "Store";

  const roleLower = String(org.activeRole ?? "").trim().toLowerCase();
  const isAdmin = roleLower === "admin";
  const isOwner = roleLower === "owner";

  // katiba: admin can ALL stores, but never profit
  const canAll = isOwner || isAdmin;

  // ✅ org-level currency prefs
  const money = useOrgMoneyPrefs(orgId);

  // ✅ FIX-CURRENCY-A: refresh prefs on focus so Home reflects latest currency immediately
  useFocusEffect(
    useCallback(() => {
      void money.refresh();
    }, [money])
  );

  const displayCurrency = money.currency || "TZS";
  const displayLocale = money.locale || "en-TZ";

  type Mode = "SALES" | "EXPENSES" | "PROFIT";

  const [mode, setMode] = useState<Mode>("SALES");
  const [range, setRange] = useState<RangeKey>("today");
  const [scope, setScope] = useState<"STORE" | "ALL">(() => (storeId ? "STORE" : "ALL"));

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [salesRow, setSalesRow] = useState<SalesSummary>({ total: 0, orders: 0, currency: "TZS" });
  const [expRow, setExpRow] = useState<ExpenseSummary>({ total: 0, count: 0 });
  const [profitRow, setProfitRow] = useState<ProfitSummary>({ net: 0, sales: null, expenses: null });

  // payment breakdown:
  // - CASH/BANK/MOBILE = paid money from sales in date range
  // - CREDIT = outstanding balance in date range (NOT money-in)
  const [pay, setPay] = useState<PayBreakdown>({
    cash: 0,
    bank: 0,
    mobile: 0,
    credit: 0,
    other: 0,
    orders: 0,
  });

  // credit collections (payments received)
  const [collections, setCollections] = useState<CollectionBreakdown>({
    cash: 0,
    bank: 0,
    mobile: 0,
    other: 0,
    total: 0,
    payments: 0,
  });

  const reqIdRef = useRef(0);

  useEffect(() => {
    if (!canAll) setScope("STORE");
  }, [canAll]);

  useEffect(() => {
    if (scope === "STORE" && !storeId && canAll) setScope("ALL");
  }, [scope, storeId, canAll]);

  useEffect(() => {
    if (mode === "PROFIT" && !isOwner) {
      setMode("SALES");
    }
  }, [mode, isOwner]);

  const storeIdsInOrg = useMemo(() => {
    const ids = (org.stores ?? [])
      .filter((s) => String((s as any)?.organization_id ?? "").trim() === orgId)
      .map((s) => String((s as any)?.store_id ?? "").trim())
      .filter(Boolean);
    return Array.from(new Set(ids));
  }, [org.stores, orgId]);

  const callSalesForStore = useCallback(async (sid: string, fromISO: string, toISO: string): Promise<SalesSummary> => {
    const { data, error } = await supabase.rpc("get_sales", { p_store_id: sid, p_from: fromISO, p_to: toISO } as any);
    if (error) throw error;

    const rows = (Array.isArray(data) ? data : []) as any[];

    const pickAmount = (r: any) => {
      const candidates = [r?.total_amount, r?.total, r?.amount, r?.grand_total, r?.paid_amount, r?.revenue];
      for (const c of candidates) {
        const n = Number(c);
        if (Number.isFinite(n)) return n;
      }
      return 0;
    };

    const isCancelled = (r: any) => {
      const st = String(r?.status ?? "").toLowerCase().trim();
      return st === "cancelled" || st === "canceled" || st === "void";
    };

    const total = rows.reduce((acc, r) => acc + toNum(pickAmount(r)), 0);
    const orders = rows.reduce((acc, r) => acc + (isCancelled(r) ? 0 : 1), 0);

    const currency = String(rows?.[0]?.currency ?? "TZS").trim() || "TZS";
    return { total, orders, currency };
  }, []);

  const callPaymentBreakdown = useCallback(
    async (fromISO: string, toISO: string, sidOrNull: string | null): Promise<PayBreakdown> => {
      if (!orgId) return { cash: 0, bank: 0, mobile: 0, credit: 0, other: 0, orders: 0 };

      const { data, error } = await supabase.rpc(
        "get_sales_channel_summary_v3",
        { p_org_id: orgId, p_from: fromISO, p_to: toISO, p_store_id: sidOrNull } as any
      );
      if (error) throw error;

      const rows = (Array.isArray(data) ? data : []) as any[];
      const out: PayBreakdown = { cash: 0, bank: 0, mobile: 0, credit: 0, other: 0, orders: 0 };

      for (const r of rows) {
        const ch = String(r?.channel ?? r?.payment_method ?? "").trim().toUpperCase();
        const rev = toNum(r?.revenue ?? r?.total ?? 0);
        const ord = toInt(r?.orders ?? 0);

        out.orders += ord;

        if (ch === "CASH") out.cash += rev;
        else if (ch === "BANK") out.bank += rev;
        else if (ch === "MOBILE") out.mobile += rev;
        else if (ch === "CREDIT") out.credit += rev; // outstanding
        else out.other += rev; // should remain 0 in STRICT mode
      }

      return out;
    },
    [orgId]
  );

  // ✅ Credit Collections summary (money received)
  const callCreditCollections = useCallback(
    async (fromISO: string, toISO: string, sidOrNull: string | null): Promise<CollectionBreakdown> => {
      if (!orgId) return { cash: 0, bank: 0, mobile: 0, other: 0, total: 0, payments: 0 };

      const fnCandidates = [
        "get_credit_collections_summary_v2",
        "get_credit_collections_channel_summary_v2",
        "get_credit_collections_channel_summary_v1",
        "get_credit_collections_channel_summary",
        "get_credit_payments_channel_summary_v1",
        "get_credit_payments_channel_summary",
      ];

      let lastErr: any = null;

      for (const fn of fnCandidates) {
        const { data, error } = await supabase.rpc(
          fn,
          { p_org_id: orgId, p_from: fromISO, p_to: toISO, p_store_id: sidOrNull } as any
        );

        if (error) {
          lastErr = error;
          continue;
        }

        const rows = (Array.isArray(data) ? data : []) as any[];
        const out: CollectionBreakdown = { cash: 0, bank: 0, mobile: 0, other: 0, total: 0, payments: 0 };

        for (const r of rows) {
          const ch = String(r?.channel ?? r?.payment_method ?? r?.method ?? "").trim().toUpperCase();
          const amt = toNum(r?.amount ?? r?.revenue ?? r?.total ?? 0);
          const cnt = toInt(r?.payments ?? r?.count ?? 0);

          out.payments += cnt;

          if (ch === "CASH") out.cash += amt;
          else if (ch === "BANK") out.bank += amt;
          else if (ch === "MOBILE") out.mobile += amt;
          else out.other += amt; // should remain 0 in STRICT mode
        }

        // STRICT total (ignore other if any)
        out.total = out.cash + out.bank + out.mobile;
        return out;
      }

      const _ = lastErr;
      return { cash: 0, bank: 0, mobile: 0, other: 0, total: 0, payments: 0 };
    },
    [orgId]
  );

  const callExpenseForStore = useCallback(async (sid: string, dateFrom: string, dateTo: string): Promise<ExpenseSummary> => {
    const { data, error } = await supabase.rpc(
      "get_expense_summary",
      { p_store_id: sid, p_from: dateFrom, p_to: dateTo } as any
    );
    if (error) throw error;
    const row = (Array.isArray(data) ? data[0] : data) as any;

    return { total: toNum(row?.total ?? row?.amount ?? row?.sum ?? 0), count: toInt(row?.count ?? row?.items ?? 0) };
  }, []);

  const callProfitForStoreOwnerOnly = useCallback(
    async (sid: string, fromYMD: string, toYMD: string): Promise<ProfitSummary> => {
      if (!isOwner) return { net: 0, sales: null, expenses: null };

      const { data, error } = await supabase.rpc(
        "get_store_net_profit_v2",
        { p_store_id: sid, p_from: fromYMD, p_to: toYMD } as any
      );
      if (error) throw error;

      const row = (Array.isArray(data) ? data[0] : data) as any;
      const net = toNum(row?.net_profit ?? row?.net ?? 0);

      const sales =
        row?.sales_total != null ? toNum(row?.sales_total) : row?.revenue != null ? toNum(row?.revenue) : null;
      const expenses =
        row?.expenses_total != null
          ? toNum(row?.expenses_total)
          : row?.expense_total != null
          ? toNum(row?.expense_total)
          : null;

      return { net, sales, expenses };
    },
    [isOwner]
  );

  const load = useCallback(async () => {
    const rid = ++reqIdRef.current;

    if (!orgId) {
      setErr("No active organization selected");
      return;
    }

    if (scope === "STORE" && !storeId) {
      setErr("No active store selected");
      return;
    }

    if (mode === "PROFIT" && !isOwner) {
      setErr("Huna ruhusa ya kuona Profit (Owner only).");
      setProfitRow({ net: 0, sales: null, expenses: null });
      return;
    }

    setLoading(true);
    setErr(null);

    try {
      const { from, to } = rangeToFromTo(range); // ISO for SALES + channel summaries
      const dates = rangeToDates(range); // YYYY-MM-DD for EXPENSES + UI/history
      const profitDates = rangeToProfitDatesExclusive(range); // ✅ PROFIT only (end-exclusive)

      const targets =
        scope === "STORE"
          ? [storeId]
          : storeIdsInOrg.length
          ? storeIdsInOrg
          : storeId
          ? [storeId]
          : [];

      if (!targets.length) {
        if (rid !== reqIdRef.current) return;
        setErr("No stores found for this org");
        return;
      }

      if (mode === "SALES") {
        const rows = await Promise.all(targets.map((sid) => callSalesForStore(sid, from, to)));
        const sumTotal = rows.reduce((a, r) => a + toNum(r.total), 0);
        const sumOrders = rows.reduce((a, r) => a + toInt(r.orders), 0);
        const currency = rows[0]?.currency ?? "TZS";

        const sidOrNull = scope === "STORE" ? storeId : null;

        const pb = await callPaymentBreakdown(from, to, sidOrNull);
        const cc = await callCreditCollections(from, to, sidOrNull);

        if (rid !== reqIdRef.current) return;
        setSalesRow({ total: sumTotal, orders: sumOrders, currency });
        setPay(pb);
        setCollections(cc);
        return;
      }

      if (mode === "EXPENSES") {
        const rows = await Promise.all(targets.map((sid) => callExpenseForStore(sid, dates.from, dates.to)));
        const sumTotal = rows.reduce((a, r) => a + toNum(r.total), 0);
        const sumCount = rows.reduce((a, r) => a + toInt(r.count), 0);

        if (rid !== reqIdRef.current) return;
        setExpRow({ total: sumTotal, count: sumCount });
        return;
      }

      const rows = await Promise.all(
        targets.map((sid) => callProfitForStoreOwnerOnly(sid, profitDates.from, profitDates.to))
      );
      const sumNet = rows.reduce((a, r) => a + toNum(r.net), 0);

      const sumSalesRaw = rows.reduce((a, r) => a + (r.sales == null ? 0 : toNum(r.sales)), 0);
      const sumSalesAny = rows.some((r) => r.sales != null) ? sumSalesRaw : null;

      const sumExpRaw = rows.reduce((a, r) => a + (r.expenses == null ? 0 : toNum(r.expenses)), 0);
      const sumExpAny = rows.some((r) => r.expenses != null) ? sumExpRaw : null;

      if (rid !== reqIdRef.current) return;
      setProfitRow({ net: sumNet, sales: sumSalesAny, expenses: sumExpAny });
    } catch (e: any) {
      if (rid !== reqIdRef.current) return;
      setErr(e?.message ?? "Failed to load finance");
    } finally {
      if (rid === reqIdRef.current) setLoading(false);
    }
  }, [
    orgId,
    storeId,
    scope,
    mode,
    range,
    storeIdsInOrg,
    isOwner,
    callSalesForStore,
    callExpenseForStore,
    callProfitForStoreOwnerOnly,
    callPaymentBreakdown,
    callCreditCollections,
  ]);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, storeId, scope, mode, range]);

  useAutoRefresh(
    () => {
      if (!orgId) return;
      void load();
    },
    !!orgId,
    AUTO_REFRESH_MS
  );

  const openHistory = useCallback(() => {
    const dates = rangeToDates(range);
    router.push({
      pathname: "/finance/history",
      params: { mode, scope, range, from: dates.from, to: dates.to } as any,
    } as any);
  }, [router, mode, scope, range]);

  const Pill = ({ k, label }: { k: RangeKey; label: string }) => {
    const active = range === k;
    return (
      <Pressable
        onPress={() => setRange(k)}
        hitSlop={10}
        style={({ pressed }) => ({
          flex: 1,
          height: 38,
          borderRadius: 999,
          borderWidth: 1,
          borderColor: active ? "rgba(42,168,118,0.35)" : "rgba(255,255,255,0.12)",
          backgroundColor: active ? "rgba(42,168,118,0.10)" : "rgba(255,255,255,0.06)",
          alignItems: "center",
          justifyContent: "center",
          opacity: pressed ? 0.92 : 1,
        })}
      >
        <Text style={{ color: UI.text, fontWeight: "900" }}>{label}</Text>
      </Pressable>
    );
  };

  const Chip = ({
    k,
    label,
    disabled,
    danger,
  }: {
    k: string;
    label: string;
    disabled?: boolean;
    danger?: boolean;
  }) => {
    const active = mode === (k as any);
    return (
      <Pressable
        onPress={() => {
          if (disabled) return;
          setMode(k as any);
        }}
        hitSlop={10}
        style={({ pressed }) => ({
          flex: 1,
          height: 38,
          borderRadius: 999,
          borderWidth: 1,
          borderColor: active
            ? danger
              ? "rgba(201,74,74,0.45)"
              : "rgba(42,168,118,0.35)"
            : "rgba(255,255,255,0.12)",
          backgroundColor: active
            ? danger
              ? "rgba(201,74,74,0.10)"
              : "rgba(42,168,118,0.10)"
            : "rgba(255,255,255,0.06)",
          alignItems: "center",
          justifyContent: "center",
          opacity: disabled ? 0.45 : pressed ? 0.92 : 1,
        })}
      >
        <Text style={{ color: UI.text, fontWeight: "900" }}>{label}</Text>
      </Pressable>
    );
  };

  const ScopeChip = ({ k, label }: { k: "STORE" | "ALL"; label: string }) => {
    const active = scope === k;
    const disabled = !canAll && k === "ALL";
    return (
      <Pressable
        onPress={() => {
          if (disabled) return;
          setScope(k);
        }}
        hitSlop={10}
        style={({ pressed }) => ({
          height: 34,
          paddingHorizontal: 12,
          borderRadius: 999,
          borderWidth: 1,
          borderColor: active ? "rgba(42,168,118,0.35)" : "rgba(255,255,255,0.12)",
          backgroundColor: active ? "rgba(42,168,118,0.10)" : "rgba(255,255,255,0.06)",
          alignItems: "center",
          justifyContent: "center",
          opacity: disabled ? 0.45 : pressed ? 0.92 : 1,
        })}
      >
        <Text style={{ color: UI.text, fontWeight: "900", fontSize: 12 }}>{label}</Text>
      </Pressable>
    );
  };

  const subtitle = scope === "STORE" ? `Store: ${storeName}` : `Org: ${orgName} (ALL)`;

  const body = useMemo(() => {
    const fmt = (n: number) => formatMoney(n, { currency: displayCurrency, locale: displayLocale }).replace(/\s+/g, " ");

    if (mode === "SALES") {
      const totalSales = fmt(salesRow.total);
      const orders = String(salesRow.orders ?? 0);
      const avg = salesRow.orders > 0 ? fmt(salesRow.total / Math.max(1, salesRow.orders)) : "—";

      const paidCash = fmt(pay.cash);
      const paidBank = fmt(pay.bank);
      const paidMobile = fmt(pay.mobile);
      const creditBal = fmt(pay.credit);

      // ✅ Paid Total (money-in from sales)
      const paidTotalNum = pay.cash + pay.bank + pay.mobile; // ignore other in strict mode

      // ✅ TOTAL MONEY IN (money received) = paid sales + credit collections received
      const totalMoneyInNum = paidTotalNum + toNum(collections.total);
      const totalMoneyIn = fmt(totalMoneyInNum);

      // Collections (money received)
      const colCash = fmt(collections.cash);
      const colBank = fmt(collections.bank);
      const colMobile = fmt(collections.mobile);
      const colTotal = fmt(collections.total);
      const colCountHint = collections.payments > 0 ? `${collections.payments} payments` : "0 payments";

      return (
        <View style={{ gap: 10, paddingTop: 2 }}>
          <View style={{ flexDirection: "row", gap: 12 }}>
            <MiniStat label="Sales" value={totalSales} />
            <MiniStat label="Orders" value={orders} />
            <MiniStat label="Avg/Order" value={avg.toString().replace(/\s+/g, " ")} />
          </View>

          <View style={{ height: 1, backgroundColor: "rgba(255,255,255,0.08)" }} />

          <Text style={{ color: UI.faint, fontWeight: "900", fontSize: 12, letterSpacing: 0.3 }}>
            PAYMENT BREAKDOWN (PAID + CREDIT BALANCE)
          </Text>

          <View style={{ flexDirection: "row", gap: 12 }}>
            <MiniStat label="Cash" value={paidCash} />
            <MiniStat label="Mobile" value={paidMobile} />
            <MiniStat label="TOTAL MONEY IN" value={totalMoneyIn} hint="money received" />
          </View>

          <View style={{ flexDirection: "row", gap: 12 }}>
            <MiniStat label="Bank" value={paidBank} />
            <MiniStat label="Credit (Balance)" value={creditBal} hint="not money-in" />
            <View style={{ flex: 1 }} />
          </View>

          <View style={{ height: 1, backgroundColor: "rgba(255,255,255,0.08)" }} />

          <Text style={{ color: UI.faint, fontWeight: "900", fontSize: 12, letterSpacing: 0.3 }}>
            CREDIT COLLECTIONS (PAYMENTS RECEIVED)
          </Text>

          <View style={{ flexDirection: "row", gap: 12 }}>
            <MiniStat label="Cash" value={colCash} />
            <MiniStat label="Mobile" value={colMobile} />
            <MiniStat label="Total" value={colTotal} hint={colCountHint} />
          </View>

          <View style={{ flexDirection: "row", gap: 12 }}>
            <MiniStat label="Bank" value={colBank} />
            <View style={{ flex: 1 }} />
            <View style={{ flex: 1 }} />
          </View>
        </View>
      );
    }

    if (mode === "EXPENSES") {
      const total = fmt(expRow.total);
      const count = String(expRow.count ?? 0);
      const avg = expRow.count > 0 ? fmt(expRow.total / Math.max(1, expRow.count)) : "—";
      return (
        <View style={{ flexDirection: "row", gap: 12, paddingTop: 2 }}>
          <MiniStat label="Expenses" value={total} />
          <MiniStat label="Count" value={count} />
          <MiniStat label="Avg/Expense" value={avg.toString().replace(/\s+/g, " ")} />
        </View>
      );
    }

    const net = fmt(profitRow.net);
    const sales = profitRow.sales == null ? "—" : fmt(profitRow.sales);
    const exp = profitRow.expenses == null ? "—" : fmt(profitRow.expenses);

    return (
      <View style={{ flexDirection: "row", gap: 12, paddingTop: 2 }}>
        <MiniStat label="Profit" value={net} hint="owner-only" />
        <MiniStat label="Sales" value={sales} />
        <MiniStat label="Expenses" value={exp} />
      </View>
    );
  }, [mode, salesRow, expRow, profitRow, pay, collections, displayCurrency, displayLocale]);

  return (
    <View style={{ paddingTop: 12 }}>
      <Card style={{ gap: 10 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ color: UI.text, fontWeight: "900", fontSize: 16 }}>Finance</Text>
            <Text style={{ color: UI.muted, fontWeight: "700", marginTop: 2 }} numberOfLines={1}>
              {subtitle}
            </Text>
          </View>

          <Pressable
            onPress={() => void load()}
            hitSlop={10}
            style={({ pressed }) => ({
              paddingHorizontal: 12,
              paddingVertical: 10,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.12)",
              backgroundColor: "rgba(255,255,255,0.06)",
              opacity: pressed ? 0.92 : 1,
            })}
          >
            <Text style={{ color: UI.text, fontWeight: "900" }}>{loading ? "..." : "Reload"}</Text>
          </Pressable>
        </View>

        <View style={{ flexDirection: "row", gap: 10 }}>
          <Chip k="SALES" label="Sales" />
          <Chip k="EXPENSES" label="Expenses" />
          <Chip k="PROFIT" label="Profit" disabled={!isOwner} danger />
        </View>

        {canAll && (
          <View style={{ flexDirection: "row", gap: 10 }}>
            <ScopeChip k="STORE" label="STORE" />
            <ScopeChip k="ALL" label="ALL" />
          </View>
        )}

        <View style={{ flexDirection: "row", gap: 10 }}>
          <Pill k="today" label="Today" />
          <Pill k="7d" label="7 Days" />
          <Pill k="30d" label="30 Days" />
        </View>

        {!!err && (
          <Card
            style={{
              borderColor: "rgba(201,74,74,0.35)",
              backgroundColor: "rgba(201,74,74,0.10)",
              borderRadius: 18,
              padding: 12,
            }}
          >
            <Text style={{ color: UI.danger, fontWeight: "900" }}>{err}</Text>
            {!isOwner && (
              <Text style={{ color: UI.faint, fontWeight: "800", marginTop: 6 }}>
                Note: Profit is Owner-only (DORA v1).
              </Text>
            )}
          </Card>
        )}

        {body}

        <View style={{ height: 1, backgroundColor: "rgba(255,255,255,0.08)", marginTop: 4 }} />

        {/* ✅ CTA -> Finance Search */}
        <Pressable
          onPress={() => {
            const dates = rangeToDates(range);
            router.push({
              pathname: "/finance/history",
              params: { mode, scope, range, from: dates.from, to: dates.to } as any,
            } as any);
          }}
          hitSlop={10}
          style={({ pressed }) => ({
            flexDirection: "row",
            alignItems: "center",
            opacity: pressed ? 0.92 : 1,
          })}
        >
          <Text style={{ color: UI.muted, fontWeight: "800" }}>
            {scope === "ALL" ? `${storeIdsInOrg.length || 0} stores` : "1 store"}
          </Text>
          <View style={{ flex: 1 }} />
          {loading ? <ActivityIndicator /> : <Text style={{ color: UI.muted, fontWeight: "900", fontSize: 18 }}>›</Text>}
        </Pressable>
      </Card>
    </View>
  );
}

/** ---------- Existing: Club Revenue (silent footer) ---------- */
function CompactClubRevenueCard({ onOpen }: { onOpen: () => void }) {
  const orgAny = useOrg() as any;

  const orgId: string = String(
    orgAny?.activeOrgId ??
      orgAny?.activeOrganizationId ??
      orgAny?.organizationId ??
      orgAny?.orgId ??
      orgAny?.activeOrg?.id ??
      orgAny?.activeOrg?.org_id ??
      ""
  ).trim();

  const money = useOrgMoneyPrefs(orgId);
  const displayCurrency = money.currency || "TZS";
  const displayLocale = money.locale || "en-TZ";

  const storeId: string = String(
    orgAny?.activeStoreId ?? orgAny?.activeStore?.id ?? orgAny?.selectedStoreId ?? orgAny?.selectedStore?.id ?? ""
  ).trim();

  const storeName: string = String(orgAny?.activeStoreName ?? orgAny?.activeStore?.name ?? "Store").trim() || "Store";

  const [range, setRange] = useState<RangeKey>("today");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [row, setRow] = useState<DashRow | null>(null);

  const reqIdRef = useRef(0);

  const load = useCallback(async () => {
    const rid = ++reqIdRef.current;

    if (!storeId) {
      setErr("No active store selected");
      setRow(null);
      return;
    }

    setLoading(true);
    setErr(null);

    try {
      const { from, to } = rangeToFromTo(range);

      const { data: d1, error: e1 } = await supabase.rpc(
        "get_club_revenue_dashboard_v4",
        { p_store_id: storeId, p_from: from, p_to: to } as any
      );
      if (e1) throw e1;

      const raw = (Array.isArray(d1) ? d1[0] : d1) as any;

      if (rid !== reqIdRef.current) return;
      setRow(raw ? normalizeDash(raw, from, to, storeId) : null);
    } catch (e: any) {
      if (rid !== reqIdRef.current) return;
      setErr(e?.message ?? "Failed to load club revenue");
      setRow(null);
    } finally {
      if (rid === reqIdRef.current) setLoading(false);
    }
  }, [range, storeId]);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range, storeId]);

  useAutoRefresh(
    () => {
      if (!storeId) return;
      void load();
    },
    !!storeId,
    AUTO_REFRESH_MS
  );

  const revenue = formatMoney(toNum(row?.revenue), { currency: displayCurrency, locale: displayLocale }).replace(/\s+/g, " ");
  const paid = formatMoney(toNum(row?.paid_revenue), { currency: displayCurrency, locale: displayLocale }).replace(/\s+/g, " ");

  const Pill = ({ k, label }: { k: RangeKey; label: string }) => {
    const active = range === k;
    return (
      <Pressable
        onPress={() => setRange(k)}
        hitSlop={10}
        style={({ pressed }) => ({
          flex: 1,
          height: 38,
          borderRadius: 999,
          borderWidth: 1,
          borderColor: active ? "rgba(42,168,118,0.35)" : "rgba(255,255,255,0.12)",
          backgroundColor: active ? "rgba(42,168,118,0.10)" : "rgba(255,255,255,0.06)",
          alignItems: "center",
          justifyContent: "center",
          opacity: pressed ? 0.92 : 1,
        })}
      >
        <Text style={{ color: UI.text, fontWeight: "900" }}>{label}</Text>
      </Pressable>
    );
  };

  return (
    <View style={{ paddingTop: 10 }}>
      <Pressable
        onPress={onOpen}
        style={({ pressed }) => ({
          opacity: pressed ? 0.96 : 1,
          transform: pressed ? [{ scale: 0.998 }] : [{ scale: 1 }],
        })}
      >
        <Card style={{ gap: 10 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ color: UI.text, fontWeight: "900", fontSize: 16 }}>Club Revenue</Text>
              <Text style={{ color: UI.muted, fontWeight: "700", marginTop: 2 }} numberOfLines={1}>
                Store: {storeName}
              </Text>
            </View>

            <Pressable
              onPress={(e) => {
                // @ts-ignore
                e?.stopPropagation?.();
                void load();
              }}
              hitSlop={10}
              style={({ pressed }) => ({
                paddingHorizontal: 12,
                paddingVertical: 10,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.12)",
                backgroundColor: "rgba(255,255,255,0.06)",
                opacity: pressed ? 0.92 : 1,
              })}
            >
              <Text style={{ color: UI.text, fontWeight: "900" }}>{loading ? "..." : "Reload"}</Text>
            </Pressable>
          </View>

          <View style={{ flexDirection: "row", gap: 10 }}>
            <Pill k="today" label="Today" />
            <Pill k="7d" label="7 Days" />
            <Pill k="30d" label="30 Days" />
          </View>

          {!!err && (
            <Card
              style={{
                borderColor: "rgba(201,74,74,0.35)",
                backgroundColor: "rgba(201,74,74,0.10)",
                borderRadius: 18,
                padding: 12,
              }}
            >
              <Text style={{ color: UI.danger, fontWeight: "900" }}>{err}</Text>
            </Card>
          )}

          <View style={{ flexDirection: "row", gap: 12, paddingTop: 2 }}>
            <MiniStat label="Revenue" value={revenue} />
            <MiniStat label="Paid" value={paid} />
            <MiniStat label="Orders" value={String(row?.delivered_orders ?? 0)} hint="delivered" />
          </View>

          <View style={{ height: 1, backgroundColor: "rgba(255,255,255,0.08)", marginTop: 4 }} />

          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <Text style={{ color: UI.muted, fontWeight: "800" }} numberOfLines={1}>
              {row ? "Live dashboard" : "—"}
            </Text>
            <View style={{ flex: 1 }} />
            {loading ? <ActivityIndicator /> : <Text style={{ color: UI.muted, fontWeight: "900", fontSize: 18 }}>›</Text>}
          </View>
        </Card>
      </Pressable>
    </View>
  );
}

/** ---------- Existing: Stock Value (silent footer) ---------- */
function CompactStockValueCard() {
  const router = useRouter();
  const orgAny = useOrg() as any;

  const orgId: string = String(
    orgAny?.activeOrgId ??
      orgAny?.activeOrganizationId ??
      orgAny?.organizationId ??
      orgAny?.orgId ??
      orgAny?.activeOrg?.id ??
      orgAny?.activeOrg?.org_id ??
      ""
  ).trim();

  const money = useOrgMoneyPrefs(orgId);
  const displayCurrency = money.currency || "TZS";
  const displayLocale = money.locale || "en-TZ";

  const orgName: string = String(orgAny?.activeOrgName ?? orgAny?.activeOrg?.name ?? "Org").trim() || "Org";

  const storeId: string = String(
    orgAny?.activeStoreId ?? orgAny?.activeStore?.id ?? orgAny?.selectedStoreId ?? orgAny?.selectedStore?.id ?? ""
  ).trim();

  const storeName: string = String(orgAny?.activeStoreName ?? orgAny?.activeStore?.name ?? "Store").trim() || "Store";

  const role: string = String(orgAny?.activeRole ?? orgAny?.role ?? "").trim();
  const roleLower = (role || "").toLowerCase();
  const isStaff = roleLower === "staff";
  const canAll = roleLower === "owner" || roleLower === "admin";

  const [range, setRange] = useState<RangeKey>("today");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [row, setRow] = useState<FinRow | null>(null);

  const STOCK_IN_VERSION_BADGE = "v2";

  const [scope, setScope] = useState<"STORE" | "ALL">(() => {
    return storeId ? "STORE" : "ALL";
  });

  const reqIdRef = useRef(0);

  useEffect(() => {
    if (!canAll) setScope("STORE");
  }, [canAll]);

  useEffect(() => {
    if (scope === "STORE" && !storeId && canAll) {
      setScope("ALL");
    }
  }, [scope, storeId, canAll]);

  const extractStoreIds = useCallback((): string[] => {
    const candidates: any[] = [
      orgAny?.stores,
      orgAny?.myStores,
      orgAny?.activeStores,
      orgAny?.storesInOrg,
      orgAny?.orgStores,
      orgAny?.storeOptions,
    ].filter(Boolean);

    const ids: string[] = [];
    for (const list of candidates) {
      if (!Array.isArray(list)) continue;
      for (const s of list) {
        const sid = String(s?.store_id ?? s?.id ?? s?.storeId ?? "").trim();
        const sOrg = String(s?.organization_id ?? s?.org_id ?? s?.organizationId ?? "").trim();
        if (!sid) continue;
        if (sOrg && orgId && sOrg !== orgId) continue;
        ids.push(sid);
      }
    }

    return Array.from(new Set(ids));
  }, [orgAny, orgId]);

  const rpcTryScalar = useCallback(async (fnNames: string[], args: Record<string, any>) => {
    let lastErr: any = null;

    for (const fn of fnNames) {
      const { data, error } = await supabase.rpc(fn, args as any);
      if (error) {
        lastErr = error;
        continue;
      }
      const raw = (Array.isArray(data) ? data[0] : data) as any;
      return extractScalarValue(raw);
    }

    throw lastErr ?? new Error("RPC failed");
  }, []);

  const loadForStore = useCallback(
    async (sid: string, dateFrom: string, dateTo: string) => {
      const onVal = await rpcTryScalar(["get_stock_on_hand_value_v1"], {
        p_org_id: orgId,
        p_store_id: sid,
      });

      const inVal = await rpcTryScalar(["get_stock_in_value_v2", "get_stock_in_value_v1"], {
        p_org_id: orgId,
        p_store_id: sid,
        p_date_from: dateFrom,
        p_date_to: dateTo,
      });

      return {
        org_id: orgId,
        store_id: sid,
        date_from: dateFrom,
        date_to: dateTo,
        stock_on_hand_value: onVal,
        stock_in_value: inVal,
      } as FinRow;
    },
    [orgId, rpcTryScalar]
  );

  const load = useCallback(async () => {
    const rid = ++reqIdRef.current;

    if (!orgId) {
      setErr("No active organization selected");
      setRow(null);
      return;
    }

    if (isStaff && !storeId) {
      setErr("Staff must select a store to view stock values");
      setRow(null);
      return;
    }

    setLoading(true);
    setErr(null);

    try {
      const { from, to } = rangeToDates(range);

      if (!canAll || scope === "STORE") {
        if (!storeId) {
          if (rid !== reqIdRef.current) return;
          setErr("Select a store to view stock values");
          setRow(null);
          return;
        }

        const r = await loadForStore(storeId, from, to);
        if (rid !== reqIdRef.current) return;
        setRow({
          org_id: orgId,
          store_id: storeId,
          date_from: from,
          date_to: to,
          stock_on_hand_value: toNum(r.stock_on_hand_value),
          stock_in_value: toNum(r.stock_in_value),
        });
        return;
      }

      const storeIds = extractStoreIds();

      if (!storeIds.length) {
        if (storeId) {
          const r = await loadForStore(storeId, from, to);
          if (rid !== reqIdRef.current) return;
          setRow({
            org_id: orgId,
            store_id: null,
            date_from: from,
            date_to: to,
            stock_on_hand_value: toNum(r.stock_on_hand_value),
            stock_in_value: toNum(r.stock_in_value),
          });
          return;
        }
        if (rid !== reqIdRef.current) return;
        setErr("No stores found for this org (cannot compute ALL)");
        setRow(null);
        return;
      }

      const results = await Promise.all(storeIds.map((sid) => loadForStore(sid, from, to)));

      const sumOn = results.reduce((acc, r) => acc + toNum(r.stock_on_hand_value), 0);
      const sumIn = results.reduce((acc, r) => acc + toNum(r.stock_in_value), 0);

      if (rid !== reqIdRef.current) return;
      setRow({
        org_id: orgId,
        store_id: null,
        date_from: from,
        date_to: to,
        stock_on_hand_value: sumOn,
        stock_in_value: sumIn,
      });
    } catch (e: any) {
      if (rid !== reqIdRef.current) return;
      setErr(e?.message ?? "Failed to load stock values");
      setRow(null);
    } finally {
      if (rid === reqIdRef.current) setLoading(false);
    }
  }, [orgId, isStaff, storeId, range, canAll, scope, extractStoreIds, loadForStore]);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, storeId, range, scope, canAll]);

  useAutoRefresh(
    () => {
      if (!orgId) return;
      void load();
    },
    !!orgId,
    AUTO_REFRESH_MS
  );

  const openHistory = useCallback(() => {
    router.push("/stocks/history");
  }, [router]);

  const Pill = ({ k, label }: { k: RangeKey; label: string }) => {
    const active = range === k;
    return (
      <Pressable
        onPress={() => setRange(k)}
        hitSlop={10}
        style={({ pressed }) => ({
          flex: 1,
          height: 38,
          borderRadius: 999,
          borderWidth: 1,
          borderColor: active ? "rgba(42,168,118,0.35)" : "rgba(255,255,255,0.12)",
          backgroundColor: active ? "rgba(42,168,118,0.10)" : "rgba(255,255,255,0.06)",
          alignItems: "center",
          justifyContent: "center",
          opacity: pressed ? 0.92 : 1,
        })}
      >
        <Text style={{ color: UI.text, fontWeight: "900" }}>{label}</Text>
      </Pressable>
    );
  };

  const ScopeChip = ({ k, label }: { k: "STORE" | "ALL"; label: string }) => {
    const active = scope === k;
    const disabled = isStaff && k === "ALL";
    return (
      <Pressable
        onPress={() => {
          if (disabled) return;
          setScope(k);
        }}
        hitSlop={10}
        style={({ pressed }) => ({
          height: 34,
          paddingHorizontal: 12,
          borderRadius: 999,
          borderWidth: 1,
          borderColor: active ? "rgba(42,168,118,0.35)" : "rgba(255,255,255,0.12)",
          backgroundColor: active ? "rgba(42,168,118,0.10)" : "rgba(255,255,255,0.06)",
          alignItems: "center",
          justifyContent: "center",
          opacity: disabled ? 0.45 : pressed ? 0.92 : 1,
        })}
      >
        <Text style={{ color: UI.text, fontWeight: "900", fontSize: 12 }}>{label}</Text>
      </Pressable>
    );
  };

  const onHand = formatMoney(toNum(row?.stock_on_hand_value), { currency: displayCurrency, locale: displayLocale }).replace(/\s+/g, " ");
  const stockIn = formatMoney(toNum(row?.stock_in_value), { currency: displayCurrency, locale: displayLocale }).replace(/\s+/g, " ");

  const subtitle = isStaff
    ? `Store: ${storeName}`
    : scope === "STORE"
    ? storeId
      ? `Store: ${storeName}`
      : "Select store"
    : `Org: ${orgName} (ALL)`;

  return (
    <View style={{ paddingTop: 12 }}>
      <Card style={{ gap: 10 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ color: UI.text, fontWeight: "900", fontSize: 16 }}>Stock Value</Text>
            <Text style={{ color: UI.muted, fontWeight: "700", marginTop: 2 }} numberOfLines={1}>
              {subtitle}
            </Text>
          </View>

          <Pressable
            onPress={() => void load()}
            hitSlop={10}
            style={({ pressed }) => ({
              paddingHorizontal: 12,
              paddingVertical: 10,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.12)",
              backgroundColor: "rgba(255,255,255,0.06)",
              opacity: pressed ? 0.92 : 1,
            })}
          >
            <Text style={{ color: UI.text, fontWeight: "900" }}>{loading ? "..." : "Reload"}</Text>
          </Pressable>
        </View>

        {canAll && (
          <View style={{ flexDirection: "row", gap: 10 }}>
            <ScopeChip k="STORE" label="STORE" />
            <ScopeChip k="ALL" label="ALL" />
          </View>
        )}

        <View style={{ flexDirection: "row", gap: 10 }}>
          <Pill k="today" label="Today" />
          <Pill k="7d" label="7 Days" />
          <Pill k="30d" label="30 Days" />
        </View>

        {!!err && (
          <Card
            style={{
              borderColor: "rgba(201,74,74,0.35)",
              backgroundColor: "rgba(201,74,74,0.10)",
              borderRadius: 18,
              padding: 12,
            }}
          >
            <Text style={{ color: UI.danger, fontWeight: "900" }}>{err}</Text>
            <Text style={{ color: UI.faint, fontWeight: "800", marginTop: 6 }}>
              Tip: stock-in uses {STOCK_IN_VERSION_BADGE} (fallback to v1 if missing).
            </Text>
          </Card>
        )}

        <View style={{ flexDirection: "row", gap: 12, paddingTop: 2 }}>
          <MiniStat label="On Hand Value" value={onHand} hint="current stock" />
          <MiniStat label="Stock In Value" value={stockIn} hint="received (+)" />
        </View>

        <View style={{ height: 1, backgroundColor: "rgba(255,255,255,0.08)", marginTop: 4 }} />

        <Pressable
          onPress={openHistory}
          hitSlop={10}
          style={({ pressed }) => ({
            flexDirection: "row",
            alignItems: "center",
            opacity: pressed ? 0.92 : 1,
          })}
        >
          <Text style={{ color: UI.muted, fontWeight: "800" }}>
            {row ? `Range: ${row.date_from} → ${row.date_to}` : "—"}
          </Text>
          <View style={{ flex: 1 }} />
          {loading ? (
            <ActivityIndicator />
          ) : (
            <Text style={{ color: UI.faint, fontWeight: "900" }}>{STOCK_IN_VERSION_BADGE}</Text>
          )}
        </Pressable>
      </Card>
    </View>
  );
}

/** ✅ ZETRA AI Card v4 (unchanged) */
function ZetraAiCard({ onOpen }: { onOpen: () => void }) {
  const tips = useMemo(
    () => [
      "Stock alert: cheki bidhaa zilizo chini ya kiwango.",
      "Sales insight: kuongeza bei kidogo kwa bidhaa hot inaweza kuongeza faida.",
      "Staff ops: weka staff kwenye store husika kwa urahisi.",
      "Club: boresha post zako + response kwa customers kwa haraka.",
    ],
    []
  );

  const [i, setI] = useState(0);
  const fade = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const t = setInterval(() => setI((x) => (x + 1) % tips.length), 4500);
    return () => clearInterval(t);
  }, [tips.length]);

  useEffect(() => {
    fade.setValue(0);
    Animated.timing(fade, { toValue: 1, duration: 260, useNativeDriver: true }).start();
  }, [i, fade]);

  const preview = tips[i];

  const CtaButton = ({
    title,
    kind,
    onPress,
  }: {
    title: string;
    kind: "primary" | "ghost";
    onPress: () => void;
  }) => {
    const primary = kind === "primary";
    return (
      <Pressable
        onPress={onPress}
        hitSlop={10}
        style={({ pressed }) => ({
          flex: 1,
          height: 42,
          borderRadius: 999,
          borderWidth: 1,
          borderColor: primary ? "rgba(16,185,129,0.30)" : "rgba(255,255,255,0.12)",
          backgroundColor: primary ? "rgba(16,185,129,0.14)" : "rgba(255,255,255,0.06)",
          alignItems: "center",
          justifyContent: "center",
          opacity: pressed ? 0.92 : 1,
          transform: pressed ? [{ scale: 0.995 }] : [{ scale: 1 }],
        })}
      >
        <Text style={{ color: UI.text, fontWeight: "900" }}>{title}</Text>
      </Pressable>
    );
  };

  return (
    <View style={{ paddingTop: 12 }}>
      <Pressable
        onPress={onOpen}
        hitSlop={10}
        style={({ pressed }) => ({
          opacity: pressed ? 0.97 : 1,
          transform: pressed ? [{ scale: 0.997 }] : [{ scale: 1 }],
        })}
      >
        <Card
          style={{
            padding: 0,
            overflow: "hidden",
            borderRadius: 22,
            borderColor: "rgba(16,185,129,0.28)",
            backgroundColor: "rgba(15,18,24,0.98)",
          }}
        >
          <View style={{ position: "relative" }}>
            <View
              pointerEvents="none"
              style={{
                position: "absolute",
                left: -80,
                top: -90,
                width: 260,
                height: 260,
                borderRadius: 999,
                backgroundColor: "rgba(16,185,129,0.10)",
              }}
            />
            <View
              pointerEvents="none"
              style={{
                position: "absolute",
                right: -120,
                top: -110,
                width: 320,
                height: 320,
                borderRadius: 999,
                backgroundColor: "rgba(34,211,238,0.05)",
              }}
            />
            <View
              pointerEvents="none"
              style={{
                position: "absolute",
                left: -60,
                bottom: -180,
                width: 360,
                height: 360,
                borderRadius: 999,
                backgroundColor: "rgba(0,0,0,0.42)",
              }}
            />
            <View
              pointerEvents="none"
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                top: 0,
                height: 1,
                backgroundColor: "rgba(255,255,255,0.10)",
              }}
            />

            <View style={{ padding: 16, gap: 12 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                <View style={{ position: "relative" }}>
                  <View
                    pointerEvents="none"
                    style={{
                      position: "absolute",
                      left: -12,
                      top: -12,
                      width: 74,
                      height: 74,
                      borderRadius: 999,
                      backgroundColor: "rgba(16,185,129,0.08)",
                      borderWidth: 1,
                      borderColor: "rgba(16,185,129,0.16)",
                    }}
                  />
                  <View
                    style={{
                      width: 50,
                      height: 50,
                      borderRadius: 999,
                      borderWidth: 1,
                      borderColor: "rgba(16,185,129,0.36)",
                      backgroundColor: "rgba(16,185,129,0.14)",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Text style={{ color: (UI as any).colors?.emerald ?? UI.text, fontWeight: "900", fontSize: 16 }}>
                      AI
                    </Text>
                  </View>
                  <View
                    pointerEvents="none"
                    style={{
                      position: "absolute",
                      left: 10,
                      top: 10,
                      width: 10,
                      height: 10,
                      borderRadius: 999,
                      backgroundColor: "rgba(255,255,255,0.18)",
                    }}
                  />
                </View>

                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ color: UI.text, fontWeight: "900", fontSize: 17 }} numberOfLines={1}>
                    ZETRA AI
                  </Text>
                  <Text style={{ color: UI.muted, fontWeight: "800", marginTop: 3 }} numberOfLines={1}>
                    Business Intelligence Engine
                  </Text>
                </View>

                <View
                  style={{
                    paddingHorizontal: 10,
                    paddingVertical: 6,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: "rgba(16,185,129,0.22)",
                    backgroundColor: "rgba(16,185,129,0.10)",
                  }}
                >
                  <Text style={{ color: UI.text, fontWeight: "900", fontSize: 11, letterSpacing: 0.3 }}>
                    LIVE • COPILOT
                  </Text>
                </View>
              </View>

              <View style={{ height: 1, backgroundColor: "rgba(255,255,255,0.08)" }} />

              <View style={{ gap: 6 }}>
                <Text style={{ color: UI.faint, fontWeight: "900", fontSize: 12, letterSpacing: 0.4 }}>
                  SMART INSIGHT
                </Text>

                <Animated.Text
                  style={{
                    opacity: fade,
                    color: UI.text,
                    fontWeight: "900",
                    fontSize: 14,
                    lineHeight: 20,
                  }}
                  numberOfLines={2}
                >
                  {preview}
                </Animated.Text>

                <Text style={{ color: UI.muted, fontWeight: "800" }} numberOfLines={1}>
                  SW/EN auto • mwongozo wa kutumia ZETRA BMS • maamuzi ya biashara
                </Text>
              </View>

              <View style={{ flexDirection: "row", gap: 10, paddingTop: 2 }}>
                <CtaButton title="Ask AI" kind="primary" onPress={onOpen} />
                <CtaButton title="View Insights" kind="ghost" onPress={onOpen} />
              </View>

              <Text style={{ color: UI.faint, fontWeight: "800" }} numberOfLines={2}>
                Tip: “Nifanyeje kuongeza bidhaa?” • “How do I manage staff?” • “Nipe wazo la biashara.”
              </Text>
            </View>
          </View>
        </Card>
      </Pressable>
    </View>
  );
}

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const { loading, refreshing, error, refresh, activeOrgName, activeRole, activeStoreName } = useOrg();

  const [dashTick, setDashTick] = useState(0);
  const [pulling, setPulling] = useState(false);

  const onLogout = useCallback(async () => {
    try {
      const { error: e } = await supabase.auth.signOut();
      if (e) throw e;
    } catch (err: any) {
      Alert.alert("Logout failed", err?.message ?? "Unknown error");
    }
  }, []);

  const goStaff = useCallback(() => {
    router.push("/(tabs)/staff");
  }, [router]);

  const goOrgSwitcher = useCallback(() => {
    router.push("/org-switcher");
  }, [router]);

  const goClubRevenue = useCallback(() => {
    router.push("/club-revenue");
  }, [router]);

  const goAI = useCallback(() => {
    router.push("/ai");
  }, [router]);

  const bottomPad = useMemo(() => Math.max(insets.bottom, 8) + 12, [insets.bottom]);
  const topPad = useMemo(() => Math.max(insets.top, 10) + 8, [insets.top]);

  const onPullRefresh = useCallback(async () => {
    setPulling(true);
    try {
      await Promise.resolve(refresh());
      setDashTick((x) => x + 1);
    } finally {
      setPulling(false);
    }
  }, [refresh]);

  return (
    <Screen>
      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={pulling || refreshing} onRefresh={onPullRefresh} tintColor={UI.text} />}
        contentContainerStyle={{
          paddingTop: topPad,
          paddingHorizontal: 16,
          paddingBottom: bottomPad,
        }}
      >
        <Text style={{ fontSize: 28, fontWeight: "900", color: UI.text }}>ZETRA BMS</Text>
        <Text style={{ color: UI.muted, fontWeight: "700", marginTop: 2 }}>Dashboard</Text>

        <ZetraAiCard onOpen={goAI} />

        <StoreGuard>
          <CompactClubRevenueCard key={`club-mini-${dashTick}`} onOpen={goClubRevenue} />
        </StoreGuard>

        <StoreGuard>
          <CompactFinanceCard />
        </StoreGuard>

        <StoreGuard>
          <CompactStockValueCard />
        </StoreGuard>

        {!!error && (
          <Card
            style={{
              borderColor: "rgba(201,74,74,0.35)",
              backgroundColor: "rgba(201,74,74,0.10)",
              borderRadius: 18,
              padding: 12,
              marginTop: 12,
            }}
          >
            <Text style={{ color: UI.danger, fontWeight: "900" }}>{error}</Text>
          </Card>
        )}

        <StoreGuard>
          <View style={{ height: 14 }} />

          <Card style={{ gap: 10 }}>
            <Text style={{ color: UI.muted, fontWeight: "800" }}>Active</Text>

            <Pressable
              onPress={goOrgSwitcher}
              hitSlop={10}
              style={({ pressed }) => ({
                opacity: pressed ? 0.92 : 1,
                transform: pressed ? [{ scale: 0.998 }] : [{ scale: 1 }],
              })}
            >
              <Text style={{ color: UI.faint, fontWeight: "800" }}>
                Org: <Text style={{ color: UI.text, fontWeight: "900" }}>{activeOrgName ?? "—"}</Text>
                <Text style={{ color: UI.muted, fontWeight: "900" }}>  ›</Text>
              </Text>
            </Pressable>

            <Text style={{ color: UI.faint, fontWeight: "800" }}>
              Role: <Text style={{ color: UI.text, fontWeight: "900" }}>{activeRole ?? "—"}</Text>
            </Text>

            <Text style={{ color: UI.faint, fontWeight: "800" }}>
              Store: <Text style={{ color: UI.text, fontWeight: "900" }}>{activeStoreName ?? "—"}</Text>
            </Text>
          </Card>

          <View style={{ height: 14 }} />

          <Text style={{ color: UI.muted, fontWeight: "800", marginBottom: 8 }}>Actions</Text>

          <Button
            title={loading ? "Loading..." : refreshing ? "Refreshing..." : "Refresh"}
            onPress={() => {
              refresh();
              setDashTick((x) => x + 1);
            }}
            disabled={loading || refreshing}
            variant="primary"
          />

          <View style={{ height: 10 }} />

          <Pressable
            onPress={goStaff}
            style={({ pressed }) => [
              {
                opacity: pressed ? 0.92 : 1,
                transform: pressed ? [{ scale: 0.995 }] : [{ scale: 1 }],
              },
            ]}
          >
            <Card
              style={{
                paddingVertical: 14,
                paddingHorizontal: 16,
                borderRadius: 18,
                borderColor: "rgba(42,168,118,0.22)",
                backgroundColor: "rgba(23,27,33,0.92)",
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: UI.text, fontWeight: "900", fontSize: 16 }}>Staff Management</Text>
                  <Text style={{ color: UI.muted, fontWeight: "700", marginTop: 2 }}>Add staff and assign stores</Text>
                </View>
                <Text style={{ color: UI.muted, fontWeight: "900", fontSize: 18 }}>›</Text>
              </View>
            </Card>
          </Pressable>

          <View style={{ height: 14 }} />

          <Button
            title="Logout"
            onPress={onLogout}
            variant="secondary"
            style={{
              borderColor: "rgba(201,74,74,0.28)",
              backgroundColor: "rgba(201,74,74,0.06)",
            }}
          />
        </StoreGuard>
      </ScrollView>
    </Screen>
  );
}