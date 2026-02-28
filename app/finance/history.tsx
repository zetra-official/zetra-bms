// app/finance/history.tsx
import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";

import { useOrg } from "@/src/context/OrgContext";
import { supabase } from "@/src/supabase/supabaseClient";
import { Screen } from "@/src/ui/Screen";
import { Card } from "@/src/ui/Card";
import { UI } from "@/src/ui/theme";
import { formatMoney, useOrgMoneyPrefs } from "@/src/ui/money";

type Mode = "SALES" | "EXPENSES" | "PROFIT";

type SalesSummary = { total: number; orders: number; currency?: string | null };
type ExpenseSummary = { total: number; count: number };
type ProfitSummary = { net: number; sales: number | null; expenses: number | null };

type PayBreakdown = {
  cash: number;
  bank: number;
  mobile: number;
  credit: number; // outstanding balance (NOT money-in)
  other: number; // kept for backward compat (should be 0 in STRICT mode)
  orders: number;
};

type CreditCollections = {
  cash: number;
  bank: number;
  mobile: number;
  other: number; // kept for backward compat (should be 0 in STRICT mode)
  payments: number;
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
function pad2(n: number) {
  return String(n).padStart(2, "0");
}
function toIsoDateLocal(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
function startOfLocalDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}
function endOfLocalDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}
function isValidYYYYMMDD(s: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split("-").map((x) => Number(x));
  if (!y || m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}
function ymdToISOFrom(s: string) {
  const [y, m, d] = s.split("-").map((x) => Number(x));
  return startOfLocalDay(new Date(y, m - 1, d)).toISOString();
}
function ymdToISOTo(s: string) {
  const [y, m, d] = s.split("-").map((x) => Number(x));
  return endOfLocalDay(new Date(y, m - 1, d)).toISOString();
}

function Chip({
  active,
  label,
  danger,
  disabled,
  onPress,
}: {
  active: boolean;
  label: string;
  danger?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={() => {
        if (disabled) return;
        onPress();
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
}

function SmallChip({
  active,
  label,
  disabled,
  onPress,
}: {
  active: boolean;
  label: string;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={() => {
        if (disabled) return;
        onPress();
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
}

function MiniStat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <View style={{ flex: 1, gap: 4, minWidth: 0 }}>
      <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12 }} numberOfLines={1}>
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
        <Text style={{ color: UI.faint, fontWeight: "800", fontSize: 12 }} numberOfLines={1}>
          {hint}
        </Text>
      )}
    </View>
  );
}

export default function FinanceHistoryScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<any>();
  const org = useOrg();

  const orgId = String(org.activeOrgId ?? "").trim();
  const orgName = String(org.activeOrgName ?? "Org").trim() || "Org";
  const storeId = String(org.activeStoreId ?? "").trim();
  const storeName = String(org.activeStoreName ?? "Store").trim() || "Store";

  const roleLower = String(org.activeRole ?? "").trim().toLowerCase();
  const isOwner = roleLower === "owner";
  const isAdmin = roleLower === "admin";
  const canAll = isOwner || isAdmin;

  const money = useOrgMoneyPrefs(orgId);
  const displayCurrency = money.currency || "TZS";
  const displayLocale = money.locale || "en-TZ";
  const fmt = useCallback(
    (n: number) => formatMoney(n, { currency: displayCurrency, locale: displayLocale }).replace(/\s+/g, " "),
    [displayCurrency, displayLocale]
  );

  const storeIdsInOrg = useMemo(() => {
    const ids =
      (org.stores ?? [])
        .filter((s) => String((s as any)?.organization_id ?? "").trim() === orgId)
        .map((s) => String((s as any)?.store_id ?? "").trim())
        .filter(Boolean) ?? [];

    if (!ids.length && storeId) return [storeId];
    return Array.from(new Set(ids));
  }, [org.stores, orgId, storeId]);

  const today = useMemo(() => toIsoDateLocal(new Date()), []);

  const [mode, setMode] = useState<Mode>("SALES");
  const [scope, setScope] = useState<"STORE" | "ALL">(() => (storeId ? "STORE" : "ALL"));
  const [dateFrom, setDateFrom] = useState<string>(today);
  const [dateTo, setDateTo] = useState<string>(today);

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [salesRow, setSalesRow] = useState<SalesSummary>({
    total: 0,
    orders: 0,
    currency: "TZS",
  });
  const [expRow, setExpRow] = useState<ExpenseSummary>({ total: 0, count: 0 });
  const [profitRow, setProfitRow] = useState<ProfitSummary>({
    net: 0,
    sales: null,
    expenses: null,
  });

  const [pay, setPay] = useState<PayBreakdown>({
    cash: 0,
    bank: 0,
    mobile: 0,
    credit: 0,
    other: 0,
    orders: 0,
  });

  const [collections, setCollections] = useState<CreditCollections>({
    cash: 0,
    bank: 0,
    mobile: 0,
    other: 0,
    payments: 0,
  });

  const reqRef = useRef(0);

  const desiredRef = useRef<{
    mode?: Mode;
    scope?: "STORE" | "ALL";
    from?: string;
    to?: string;
  }>({});

  const appliedOnceRef = useRef(false);
  const autoRanRef = useRef(false);

  React.useEffect(() => {
    const pMode = String(params?.mode ?? "").trim().toUpperCase();
    const pScope = String(params?.scope ?? "").trim().toUpperCase();
    const pFrom = String(params?.from ?? params?.dateFrom ?? "").trim();
    const pTo = String(params?.to ?? params?.dateTo ?? "").trim();

    const next: any = {};
    if (pMode === "SALES" || pMode === "EXPENSES" || pMode === "PROFIT") next.mode = pMode as Mode;
    if (pScope === "STORE" || pScope === "ALL") next.scope = pScope as "STORE" | "ALL";
    if (pFrom && isValidYYYYMMDD(pFrom)) next.from = pFrom;
    if (pTo && isValidYYYYMMDD(pTo)) next.to = pTo;

    desiredRef.current = next;
    appliedOnceRef.current = false;
    autoRanRef.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params?.mode, params?.scope, params?.from, params?.to, params?.dateFrom, params?.dateTo]);

  React.useEffect(() => {
    if (appliedOnceRef.current) return;
    if (!orgId) return;

    const desired = desiredRef.current || {};

    let nextMode: Mode = desired.mode ?? mode;
    let nextScope: "STORE" | "ALL" = desired.scope ?? scope;

    if (!canAll) nextScope = "STORE";
    if (nextMode === "PROFIT" && !isOwner) nextMode = "SALES";

    if (nextScope === "STORE" && !storeId) return;

    setMode(nextMode);
    setScope(nextScope);

    if (desired.from) setDateFrom(desired.from);
    if (desired.to) setDateTo(desired.to);

    appliedOnceRef.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, storeId, canAll, isOwner]);

  React.useEffect(() => {
    if (!canAll) setScope("STORE");
  }, [canAll]);

  React.useEffect(() => {
    if (mode === "PROFIT" && !isOwner) setMode("SALES");
  }, [mode, isOwner]);

  const applyQuick = useCallback((k: "today" | "7d" | "30d" | "90d" | "1y") => {
    const now = new Date();
    const to = new Date(now);
    const from = new Date(now);

    if (k === "today") {
      // no change
    } else if (k === "7d") {
      from.setDate(from.getDate() - 6);
    } else if (k === "30d") {
      from.setDate(from.getDate() - 29);
    } else if (k === "90d") {
      from.setDate(from.getDate() - 89);
    } else {
      from.setDate(from.getDate() - 364);
    }

    setDateFrom(toIsoDateLocal(from));
    setDateTo(toIsoDateLocal(to));
  }, []);

  const callSalesForStore = useCallback(
    async (sid: string, fromISO: string, toISO: string): Promise<SalesSummary> => {
      const { data, error } = await supabase.rpc(
        "get_sales",
        { p_store_id: sid, p_from: fromISO, p_to: toISO } as any
      );
      if (error) throw error;

      const rows = (Array.isArray(data) ? data : []) as any[];

      const pickAmount = (r: any) => {
        const candidates = [r?.total_amount, r?.grand_total, r?.total, r?.amount, r?.paid_amount, r?.revenue];
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
    },
    []
  );

  const callPaymentBreakdownV3 = useCallback(
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
        else if (ch === "CREDIT") out.credit += rev;
        else out.other += rev;
      }
      return out;
    },
    [orgId]
  );

  const callCreditCollections = useCallback(
    async (fromISO: string, toISO: string, sidOrNull: string | null): Promise<CreditCollections> => {
      if (!orgId) return { cash: 0, bank: 0, mobile: 0, other: 0, payments: 0 };

      const { data, error } = await supabase.rpc(
        "get_credit_collections_summary_v2",
        { p_org_id: orgId, p_from: fromISO, p_to: toISO, p_store_id: sidOrNull } as any
      );
      if (error) throw error;

      const rows = (Array.isArray(data) ? data : []) as any[];
      const out: CreditCollections = { cash: 0, bank: 0, mobile: 0, other: 0, payments: 0 };

      for (const r of rows) {
        const ch = String(r?.channel ?? "").trim().toUpperCase();
        const amt = toNum(r?.amount ?? r?.total ?? 0);
        const cnt = toInt(r?.payments ?? r?.count ?? 0);
        out.payments += cnt;

        if (ch === "CASH") out.cash += amt;
        else if (ch === "BANK") out.bank += amt;
        else if (ch === "MOBILE") out.mobile += amt;
        else out.other += amt;
      }
      return out;
    },
    [orgId]
  );

  const callExpenseForStore = useCallback(
    async (sid: string, fromYMD: string, toYMD: string): Promise<ExpenseSummary> => {
      const { data, error } = await supabase.rpc(
        "get_expense_summary",
        { p_store_id: sid, p_from: fromYMD, p_to: toYMD } as any
      );
      if (error) throw error;
      const row = (Array.isArray(data) ? data[0] : data) as any;
      return {
        total: toNum(row?.total ?? row?.amount ?? row?.sum ?? 0),
        count: toInt(row?.count ?? row?.items ?? 0),
      };
    },
    []
  );

  const callProfitOwnerOnly = useCallback(
    async (sid: string, fromISO: string, toISO: string): Promise<ProfitSummary> => {
      if (!isOwner) return { net: 0, sales: null, expenses: null };

      const { data, error } = await supabase.rpc(
        "get_store_net_profit_v2",
        { p_store_id: sid, p_from: fromISO, p_to: toISO } as any
      );
      if (error) throw error;

      const row = (Array.isArray(data) ? data[0] : data) as any;
      const net = toNum(row?.net_profit ?? row?.net ?? 0);
      const sales = row?.sales_total != null ? toNum(row?.sales_total) : null;
      const expenses = row?.expenses_total != null ? toNum(row?.expenses_total) : null;
      return { net, sales, expenses };
    },
    [isOwner]
  );

  const run = useCallback(async () => {
    const rid = ++reqRef.current;

    if (!orgId) {
      setErr("No active organization selected");
      return;
    }
    if (scope === "STORE" && !storeId) {
      setErr("No active store selected");
      return;
    }
    if (!isValidYYYYMMDD(dateFrom) || !isValidYYYYMMDD(dateTo)) {
      setErr("Tarehe lazima iwe format: YYYY-MM-DD (mfano 2025-12-31)");
      return;
    }

    const fromISO = ymdToISOFrom(dateFrom);
    const toISO = ymdToISOTo(dateTo);

    const targets =
      scope === "STORE"
        ? [storeId].filter(Boolean)
        : storeIdsInOrg.length
        ? storeIdsInOrg
        : storeId
        ? [storeId]
        : [];

    if (!targets.length) {
      setErr("No stores found for this org");
      return;
    }

    if (mode === "PROFIT" && !isOwner) {
      setErr("Huna ruhusa ya kuona Profit (Owner only).");
      return;
    }

    setLoading(true);
    setErr(null);

    try {
      if (mode === "SALES") {
        const rows = await Promise.all(targets.map((sid) => callSalesForStore(sid, fromISO, toISO)));
        const sumTotal = rows.reduce((a, r) => a + toNum(r.total), 0);
        const sumOrders = rows.reduce((a, r) => a + toInt(r.orders), 0);
        const currency = rows[0]?.currency ?? "TZS";

        const sidOrNull = scope === "STORE" ? storeId : null;

        const pb = await callPaymentBreakdownV3(fromISO, toISO, sidOrNull);
        const cc = await callCreditCollections(fromISO, toISO, sidOrNull);

        if (rid !== reqRef.current) return;
        setSalesRow({ total: sumTotal, orders: sumOrders, currency });
        setPay(pb);
        setCollections(cc);
        return;
      }

      if (mode === "EXPENSES") {
        const rows = await Promise.all(targets.map((sid) => callExpenseForStore(sid, dateFrom, dateTo)));
        const sumTotal = rows.reduce((a, r) => a + toNum(r.total), 0);
        const sumCount = rows.reduce((a, r) => a + toInt(r.count), 0);

        if (rid !== reqRef.current) return;
        setExpRow({ total: sumTotal, count: sumCount });
        return;
      }

      const rows = await Promise.all(targets.map((sid) => callProfitOwnerOnly(sid, fromISO, toISO)));
      const sumNet = rows.reduce((a, r) => a + toNum(r.net), 0);

      const sumSalesRaw = rows.reduce((a, r) => a + (r.sales == null ? 0 : toNum(r.sales)), 0);
      const sumSalesAny = rows.some((r) => r.sales != null) ? sumSalesRaw : null;

      const sumExpRaw = rows.reduce((a, r) => a + (r.expenses == null ? 0 : toNum(r.expenses)), 0);
      const sumExpAny = rows.some((r) => r.expenses != null) ? sumExpRaw : null;

      if (rid !== reqRef.current) return;
      setProfitRow({ net: sumNet, sales: sumSalesAny, expenses: sumExpAny });
    } catch (e: any) {
      if (rid !== reqRef.current) return;
      setErr(e?.message ?? "Failed to search");
    } finally {
      if (rid === reqRef.current) setLoading(false);
    }
  }, [
    orgId,
    scope,
    storeId,
    storeIdsInOrg,
    mode,
    isOwner,
    dateFrom,
    dateTo,
    callSalesForStore,
    callPaymentBreakdownV3,
    callCreditCollections,
    callExpenseForStore,
    callProfitOwnerOnly,
  ]);

  React.useEffect(() => {
    if (!appliedOnceRef.current) return;
    if (autoRanRef.current) return;
    if (!orgId) return;
    if (scope === "STORE" && !storeId) return;
    if (!isValidYYYYMMDD(dateFrom) || !isValidYYYYMMDD(dateTo)) return;

    autoRanRef.current = true;
    void run();
  }, [orgId, storeId, scope, dateFrom, dateTo, run]);

  const subtitle = scope === "STORE" ? `Store: ${storeName}` : `Org: ${orgName} (ALL)`;

  const salesTotal = fmt(salesRow.total);
  const salesOrders = String(salesRow.orders ?? 0);
  const salesAvg = salesRow.orders > 0 ? fmt(salesRow.total / Math.max(1, salesRow.orders)) : "—";

  const cash = fmt(pay.cash);
  const bank = fmt(pay.bank);
  const mobile = fmt(pay.mobile);
  const credit = fmt(pay.credit);

  const expTotal = fmt(expRow.total);
  const expCount = String(expRow.count ?? 0);
  const expAvg = expRow.count > 0 ? fmt(expRow.total / Math.max(1, expRow.count)) : "—";

  const pNet = fmt(profitRow.net);
  const pSales = profitRow.sales == null ? "—" : fmt(profitRow.sales);
  const pExp = profitRow.expenses == null ? "—" : fmt(profitRow.expenses);

  const cCash = fmt(collections.cash);
  const cBank = fmt(collections.bank);
  const cMobile = fmt(collections.mobile);
  const cTotalNum = collections.cash + collections.bank + collections.mobile; // strict
  const cTotal = fmt(cTotalNum);
  const cPayments = String(collections.payments ?? 0);

  const paidMoneyInNum = pay.cash + pay.bank + pay.mobile; // strict
  const totalMoneyInNum = paidMoneyInNum + cTotalNum;

  const paidMoneyIn = fmt(paidMoneyInNum);
  const totalMoneyIn = fmt(totalMoneyInNum);

  const totalReceipts = salesTotal;

  const totalInCash = fmt(pay.cash + collections.cash);
  const totalInBank = fmt(pay.bank + collections.bank);
  const totalInMobile = fmt(pay.mobile + collections.mobile);

  return (
    <Screen>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: 16, paddingHorizontal: 16, paddingBottom: 24 }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <Pressable
            onPress={() => router.back()}
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
            <Text style={{ color: UI.text, fontWeight: "900" }}>Back</Text>
          </Pressable>

          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ color: UI.text, fontWeight: "900", fontSize: 18 }} numberOfLines={1}>
              Finance Search
            </Text>
            <Text style={{ color: UI.muted, fontWeight: "800" }} numberOfLines={1}>
              {subtitle}
            </Text>
          </View>

          <Pressable
            onPress={() => void run()}
            hitSlop={10}
            style={({ pressed }) => ({
              paddingHorizontal: 12,
              paddingVertical: 10,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: "rgba(42,168,118,0.35)",
              backgroundColor: "rgba(42,168,118,0.10)",
              opacity: pressed ? 0.92 : 1,
            })}
          >
            <Text style={{ color: UI.text, fontWeight: "900" }}>{loading ? "..." : "Search"}</Text>
          </Pressable>
        </View>

        <View style={{ height: 12 }} />

        <Card style={{ gap: 10 }}>
          <Text style={{ color: UI.faint, fontWeight: "900", fontSize: 12, letterSpacing: 0.4 }}>
            MODE
          </Text>

          <View style={{ flexDirection: "row", gap: 10 }}>
            <Chip active={mode === "SALES"} label="Sales" onPress={() => setMode("SALES")} />
            <Chip active={mode === "EXPENSES"} label="Expenses" onPress={() => setMode("EXPENSES")} />
            <Chip
              active={mode === "PROFIT"}
              label="Profit"
              danger
              disabled={!isOwner}
              onPress={() => setMode("PROFIT")}
            />
          </View>

          {canAll && (
            <>
              <View style={{ height: 4 }} />
              <Text style={{ color: UI.faint, fontWeight: "900", fontSize: 12, letterSpacing: 0.4 }}>
                SCOPE
              </Text>
              <View style={{ flexDirection: "row", gap: 10 }}>
                <SmallChip active={scope === "STORE"} label="STORE" onPress={() => setScope("STORE")} />
                <SmallChip active={scope === "ALL"} label="ALL" onPress={() => setScope("ALL")} />
              </View>
            </>
          )}

          <View style={{ height: 4 }} />

          <Text style={{ color: UI.faint, fontWeight: "900", fontSize: 12, letterSpacing: 0.4 }}>
            DATE RANGE (YYYY-MM-DD)
          </Text>

          <View style={{ flexDirection: "row", gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: UI.muted, fontWeight: "800", marginBottom: 6 }}>From</Text>
              <TextInput
                value={dateFrom}
                onChangeText={setDateFrom}
                placeholder="2025-01-01"
                placeholderTextColor={UI.faint}
                autoCapitalize="none"
                style={{
                  borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.12)",
                  backgroundColor: "rgba(255,255,255,0.06)",
                  borderRadius: 14,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  color: UI.text,
                  fontWeight: "900",
                }}
              />
            </View>

            <View style={{ flex: 1 }}>
              <Text style={{ color: UI.muted, fontWeight: "800", marginBottom: 6 }}>To</Text>
              <TextInput
                value={dateTo}
                onChangeText={setDateTo}
                placeholder="2025-01-31"
                placeholderTextColor={UI.faint}
                autoCapitalize="none"
                style={{
                  borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.12)",
                  backgroundColor: "rgba(255,255,255,0.06)",
                  borderRadius: 14,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  color: UI.text,
                  fontWeight: "900",
                }}
              />
            </View>
          </View>

          <View style={{ flexDirection: "row", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
            <SmallChip active={false} label="Today" onPress={() => applyQuick("today")} />
            <SmallChip active={false} label="7 Days" onPress={() => applyQuick("7d")} />
            <SmallChip active={false} label="30 Days" onPress={() => applyQuick("30d")} />
            <SmallChip active={false} label="90 Days" onPress={() => applyQuick("90d")} />
            <SmallChip active={false} label="1 Year" onPress={() => applyQuick("1y")} />
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
        </Card>

        <View style={{ height: 12 }} />

        <Card style={{ gap: 10 }}>
          <Text style={{ color: UI.text, fontWeight: "900", fontSize: 16 }}>Results</Text>

          {loading ? (
            <View style={{ paddingVertical: 18 }}>
              <ActivityIndicator />
            </View>
          ) : mode === "SALES" ? (
            <View style={{ gap: 12 }}>
              <View style={{ flexDirection: "row", gap: 12 }}>
                <MiniStat label="Sales" value={salesTotal} />
                <MiniStat label="Orders" value={salesOrders} />
                <MiniStat label="Avg/Order" value={String(salesAvg).replace(/\s+/g, " ")} />
              </View>

              <View
                style={{
                  borderRadius: 20,
                  borderWidth: 1,
                  borderColor: "rgba(16,185,129,0.24)",
                  backgroundColor: "rgba(16,185,129,0.07)",
                  padding: 12,
                  gap: 10,
                }}
              >
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <Text style={{ color: UI.text, fontWeight: "900", fontSize: 13, letterSpacing: 0.3 }}>
                    RECEIPTS SUMMARY
                  </Text>
                  <View style={{ flex: 1 }} />
                  <Text style={{ color: UI.faint, fontWeight: "900", fontSize: 12 }}>strict methods</Text>
                </View>

                <View style={{ height: 1, backgroundColor: "rgba(255,255,255,0.10)" }} />

                <View style={{ flexDirection: "row", gap: 12 }}>
                  <MiniStat label="Total Receipts" value={totalReceipts} hint="sales total (incl. credit)" />
                  <MiniStat label="Total Money In" value={totalMoneyIn} hint="money received" />
                </View>

                <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12 }}>
                  Total Receipts = Sales total (including Credit). Total Money In = Sales paid + Credit collections.
                </Text>
              </View>

              <View style={{ height: 1, backgroundColor: "rgba(255,255,255,0.08)" }} />

              <Text style={{ color: UI.faint, fontWeight: "900", fontSize: 12, letterSpacing: 0.3 }}>
                PAYMENT BREAKDOWN (PAID + CREDIT BALANCE)
              </Text>

              <View style={{ flexDirection: "row", gap: 12 }}>
                <MiniStat label="Cash" value={cash} />
                <MiniStat label="Mobile" value={mobile} />
                <MiniStat label="Paid Total" value={paidMoneyIn} hint="money-in" />
              </View>

              <View style={{ flexDirection: "row", gap: 12 }}>
                <MiniStat label="Bank" value={bank} />
                <MiniStat label="Credit (Balance)" value={credit} hint="not money-in" />
                <View style={{ flex: 1 }} />
              </View>

              <View style={{ height: 1, backgroundColor: "rgba(255,255,255,0.08)" }} />

              <Text style={{ color: UI.faint, fontWeight: "900", fontSize: 12, letterSpacing: 0.3 }}>
                CREDIT COLLECTIONS (PAYMENTS RECEIVED)
              </Text>

              <View style={{ flexDirection: "row", gap: 12 }}>
                <MiniStat label="Cash" value={cCash} />
                <MiniStat label="Mobile" value={cMobile} />
                <MiniStat label="Total" value={cTotal} hint={`${cPayments} payments`} />
              </View>

              <View style={{ flexDirection: "row", gap: 12 }}>
                <MiniStat label="Bank" value={cBank} />
                <View style={{ flex: 1 }} />
                <View style={{ flex: 1 }} />
              </View>

              <View
                style={{
                  marginTop: 6,
                  borderRadius: 20,
                  borderWidth: 1,
                  borderColor: "rgba(16,185,129,0.26)",
                  backgroundColor: "rgba(16,185,129,0.08)",
                  padding: 12,
                  gap: 10,
                }}
              >
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <Text style={{ color: UI.text, fontWeight: "900", fontSize: 13, letterSpacing: 0.3 }}>
                    TOTAL MONEY IN
                  </Text>
                  <View style={{ flex: 1 }} />
                  <Text style={{ color: UI.faint, fontWeight: "900", fontSize: 12 }}>Money received</Text>
                </View>

                <View style={{ height: 1, backgroundColor: "rgba(255,255,255,0.10)" }} />

                <View style={{ flexDirection: "row", gap: 12 }}>
                  <MiniStat label="Cash" value={totalInCash} />
                  <MiniStat label="Mobile" value={totalInMobile} />
                  <MiniStat label="Total" value={totalMoneyIn} hint="received" />
                </View>

                <View style={{ flexDirection: "row", gap: 12 }}>
                  <MiniStat label="Bank" value={totalInBank} />
                  <View style={{ flex: 1 }} />
                  <View style={{ flex: 1 }} />
                </View>

                <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12 }}>
                  Includes: Sales PAID + Credit Collections received. Excludes: Credit (Balance).
                </Text>

                <View style={{ height: 1, backgroundColor: "rgba(255,255,255,0.08)" }} />

                <View style={{ flexDirection: "row", gap: 12 }}>
                  <MiniStat label="Sales Paid" value={paidMoneyIn} hint="money-in" />
                  <MiniStat label="Collections" value={cTotal} hint="payments received" />
                  <View style={{ flex: 1 }} />
                </View>
              </View>
            </View>
          ) : mode === "EXPENSES" ? (
            <View style={{ flexDirection: "row", gap: 12 }}>
              <MiniStat label="Expenses" value={expTotal} />
              <MiniStat label="Count" value={expCount} />
              <MiniStat label="Avg/Expense" value={String(expAvg).replace(/\s+/g, " ")} />
            </View>
          ) : (
            <View style={{ flexDirection: "row", gap: 12 }}>
              <MiniStat label="Profit" value={pNet} hint="owner-only" />
              <MiniStat label="Sales" value={pSales} />
              <MiniStat label="Expenses" value={pExp} />
            </View>
          )}

          <View style={{ height: 1, backgroundColor: "rgba(255,255,255,0.08)", marginTop: 10 }} />

          <Text style={{ color: UI.muted, fontWeight: "800" }}>
            Range: <Text style={{ color: UI.text, fontWeight: "900" }}>{dateFrom}</Text> →{" "}
            <Text style={{ color: UI.text, fontWeight: "900" }}>{dateTo}</Text>
          </Text>

          {!orgId ? (
            <Text style={{ color: UI.danger, fontWeight: "900", marginTop: 8 }}>
              No active org selected.
            </Text>
          ) : null}

          {scope === "STORE" && !storeId ? (
            <Text style={{ color: UI.danger, fontWeight: "900", marginTop: 8 }}>
              No active store selected.
            </Text>
          ) : null}

          {mode === "PROFIT" && !isOwner ? (
            <Text style={{ color: UI.danger, fontWeight: "900", marginTop: 8 }}>
              Profit ni Owner-only (DORA v1).
            </Text>
          ) : null}
        </Card>

        <View style={{ height: 18 }} />

        <Pressable
          onPress={() => {
            Alert.alert(
              "How it works",
              "TOTAL RECEIPTS: Sales total (ina include Credit).\n\nPAYMENT BREAKDOWN: inaonyesha pesa zilizolipwa (Cash/Bank/Mobile) + Credit (Balance) ambayo bado haijalipwa.\n\nCREDIT COLLECTIONS: ni malipo ya madeni yaliyopokelewa ndani ya date range.\n\nTOTAL MONEY IN: Sales PAID + Credit Collections (money received). Credit balance haijumuishwi."
            );
          }}
          style={({ pressed }) => ({ opacity: pressed ? 0.92 : 1, alignSelf: "flex-start" })}
        >
          <Text style={{ color: UI.faint, fontWeight: "900" }}>💡 How it works</Text>
        </Pressable>

        <View style={{ height: 30 }} />
      </ScrollView>
    </Screen>
  );
}