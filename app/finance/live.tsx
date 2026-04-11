import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";

import { useOrg } from "@/src/context/OrgContext";
import { supabase } from "@/src/supabase/supabaseClient";
import { Screen } from "@/src/ui/Screen";
import { Card } from "@/src/ui/Card";
import { UI } from "@/src/ui/theme";
import { formatMoney, useOrgMoneyPrefs } from "@/src/ui/money";

type ScopeMode = "ALL" | "STORE";

type StoreLiveRow = {
  storeId: string;
  storeName: string;
  sales: number;
  expenses: number;
  profit: number | null;
  orders: number;
  moneyIn: number;
  stockValue: number;
};

type MetricTone = "good" | "warn" | "danger" | "neutral";

function getMetricTone(value: number, kind: "sales" | "profit" | "expenses" | "moneyIn"): MetricTone {
  const n = toNum(value);

  if (kind === "expenses") {
    if (n <= 0) return "neutral";
    if (n < 50_000) return "good";
    if (n < 300_000) return "warn";
    return "danger";
  }

  if (kind === "profit") {
    if (n > 0) return "good";
    if (n < 0) return "danger";
    return "neutral";
  }

  if (kind === "sales" || kind === "moneyIn") {
    if (n > 0) return "good";
    return "neutral";
  }

  return "neutral";
}

function getToneStyle(tone: MetricTone) {
  if (tone === "good") {
    return {
      borderColor: "rgba(16,185,129,0.24)",
      backgroundColor: "rgba(16,185,129,0.10)",
      textColor: UI.text,
    };
  }

  if (tone === "warn") {
    return {
      borderColor: "rgba(245,158,11,0.24)",
      backgroundColor: "rgba(245,158,11,0.10)",
      textColor: UI.text,
    };
  }

  if (tone === "danger") {
    return {
      borderColor: "rgba(201,74,74,0.28)",
      backgroundColor: "rgba(201,74,74,0.10)",
      textColor: UI.text,
    };
  }

  return {
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(255,255,255,0.05)",
    textColor: UI.text,
  };
}

function getRowScore(row: StoreLiveRow) {
  return (
    toNum(row.sales) * 1 +
    toNum(row.moneyIn) * 0.9 +
    toNum(row.profit) * 0.8 +
    toNum(row.orders) * 2500 +
    toNum(row.stockValue) * 0.12 -
    toNum(row.expenses) * 0.45
  );
}

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
  net: number;
  sales: number | null;
  expenses: number | null;
};

type PayBreakdown = {
  cash: number;
  bank: number;
  mobile: number;
  credit: number;
  other: number;
  orders: number;
};

type CollectionBreakdown = {
  cash: number;
  bank: number;
  mobile: number;
  other: number;
  total: number;
  payments: number;
};

type ExpenseChannelBreakdown = {
  cash: number;
  bank: number;
  mobile: number;
};

const AUTO_REFRESH_MS = 20_000;

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function toIsoDateLocal(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function startOfLocalDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

function rangeToday() {
  const now = new Date();
  const from = startOfLocalDay(now);
  const to = startOfLocalDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1));
  return {
    fromISO: from.toISOString(),
    toISO: to.toISOString(),
    fromYMD: toIsoDateLocal(now),
    toYMD: toIsoDateLocal(now),
  };
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

function subtractFloor(a: number, b: number) {
  return Math.max(0, toNum(a) - toNum(b));
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

function useAutoRefresh(cb: () => void, enabled: boolean, ms: number) {
  const cbRef = useRef(cb);
  cbRef.current = cb;

  useEffect(() => {
    if (!enabled || Platform.OS === "web") return;

    const timer = setInterval(() => {
      cbRef.current();
    }, ms);

    return () => clearInterval(timer);
  }, [enabled, ms]);
}

function Chip({
  active,
  label,
  onPress,
}: {
  active: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={10}
      style={({ pressed }) => ({
        height: 36,
        paddingHorizontal: 14,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: active ? "rgba(16,185,129,0.34)" : "rgba(255,255,255,0.12)",
        backgroundColor: active ? "rgba(16,185,129,0.12)" : "rgba(255,255,255,0.06)",
        alignItems: "center",
        justifyContent: "center",
        opacity: pressed ? 0.92 : 1,
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
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
      <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12 }} numberOfLines={1}>
        {label}
      </Text>
      <Text
        style={{ color: UI.text, fontWeight: "900", fontSize: 16 }}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.75}
      >
        {value}
      </Text>
      {!!hint ? (
        <Text style={{ color: UI.faint, fontWeight: "800", fontSize: 11 }} numberOfLines={1}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

function MetricPill({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: MetricTone;
}) {
  const style = getToneStyle(tone);

  return (
    <View
      style={{
        minWidth: 110,
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: style.borderColor,
        backgroundColor: style.backgroundColor,
        gap: 4,
      }}
    >
      <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 11 }} numberOfLines={1}>
        {label}
      </Text>
      <Text
        style={{ color: style.textColor, fontWeight: "900", fontSize: 14 }}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.8}
      >
        {value}
      </Text>
    </View>
  );
}

export default function FinanceLiveScreen() {
  const router = useRouter();
  const org = useOrg();

  const orgId = String(org.activeOrgId ?? "").trim();
  const orgName = String(org.activeOrgName ?? "Organization").trim() || "Organization";
  const activeStoreId = String(org.activeStoreId ?? "").trim();
  const activeStoreName = String(org.activeStoreName ?? "Store").trim() || "Store";
  const roleLower = String(org.activeRole ?? "").trim().toLowerCase();

  const isOwner = roleLower === "owner";
  const canAll = roleLower === "owner" || roleLower === "admin";

  const [scope, setScope] = useState<ScopeMode>(canAll ? "ALL" : "STORE");
  const [selectedStoreId, setSelectedStoreId] = useState<string>(activeStoreId);

  const money = useOrgMoneyPrefs(orgId);
  const displayCurrency = money.currency || "TZS";
  const displayLocale = money.locale || "en-TZ";

  const fmtMoney = useCallback(
    (n: number) =>
      formatMoney(n, {
        currency: displayCurrency,
        locale: displayLocale,
      }).replace(/\s+/g, " "),
    [displayCurrency, displayLocale]
  );

  const storeOptions = useMemo(() => {
    const rows = (org.stores ?? [])
      .filter((s: any) => String(s?.organization_id ?? "").trim() === orgId)
      .map((s: any) => ({
        storeId: String(s?.store_id ?? "").trim(),
        storeName: String(s?.store_name ?? s?.name ?? "Store").trim() || "Store",
      }))
      .filter((x) => !!x.storeId);

    const uniq = new Map<string, string>();
    for (const row of rows) uniq.set(row.storeId, row.storeName);

    if (activeStoreId && !uniq.has(activeStoreId)) {
      uniq.set(activeStoreId, activeStoreName);
    }

    return Array.from(uniq.entries()).map(([storeId, storeName]) => ({ storeId, storeName }));
  }, [org.stores, orgId, activeStoreId, activeStoreName]);

  const visibleStoreIds = useMemo(() => {
    if (scope === "STORE") {
      return selectedStoreId ? [selectedStoreId] : activeStoreId ? [activeStoreId] : [];
    }
    return storeOptions.map((x) => x.storeId);
  }, [scope, selectedStoreId, activeStoreId, storeOptions]);

  const storeNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of storeOptions) map.set(row.storeId, row.storeName);
    return map;
  }, [storeOptions]);

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [rows, setRows] = useState<StoreLiveRow[]>([]);

  const reqRef = useRef(0);

  useEffect(() => {
    if (!canAll) setScope("STORE");
  }, [canAll]);

  useEffect(() => {
    if (!selectedStoreId && activeStoreId) {
      setSelectedStoreId(activeStoreId);
    }
  }, [selectedStoreId, activeStoreId]);

  const callSalesForStore = useCallback(
    async (sid: string, fromISO: string, toISO: string): Promise<SalesSummary> => {
      const { data, error } = await supabase.rpc("get_sales", {
        p_store_id: sid,
        p_from: fromISO,
        p_to: toISO,
      } as any);
      if (error) throw error;

      const list = (Array.isArray(data) ? data : []) as any[];

      const pickAmount = (r: any) => {
        const candidates = [
          r?.total_amount,
          r?.total,
          r?.amount,
          r?.grand_total,
          r?.paid_amount,
          r?.revenue,
        ];
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

      const total = list.reduce((acc, r) => acc + toNum(pickAmount(r)), 0);
      const orders = list.reduce((acc, r) => acc + (isCancelled(r) ? 0 : 1), 0);
      const currency = String(list?.[0]?.currency ?? "TZS").trim() || "TZS";

      return { total, orders, currency };
    },
    []
  );

  const callExpenseForStore = useCallback(
    async (sid: string, fromYMD: string, toYMD: string): Promise<ExpenseSummary> => {
      const { data, error } = await supabase.rpc("get_expense_summary", {
        p_store_id: sid,
        p_from: fromYMD,
        p_to: toYMD,
      } as any);
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

      const { data, error } = await supabase.rpc("get_store_net_profit_v2", {
        p_store_id: sid,
        p_from: fromISO,
        p_to: toISO,
      } as any);
      if (error) throw error;

      const row = (Array.isArray(data) ? data[0] : data) as any;
      return {
        net: toNum(row?.net_profit ?? row?.net ?? 0),
        sales: row?.sales_total != null ? toNum(row?.sales_total) : null,
        expenses: row?.expenses_total != null ? toNum(row?.expenses_total) : null,
      };
    },
    [isOwner]
  );

  const callPaymentBreakdown = useCallback(
    async (sid: string, fromISO: string, toISO: string): Promise<PayBreakdown> => {
      if (!orgId) return { cash: 0, bank: 0, mobile: 0, credit: 0, other: 0, orders: 0 };

      const { data, error } = await supabase.rpc("get_sales_channel_summary_v3", {
        p_org_id: orgId,
        p_from: fromISO,
        p_to: toISO,
        p_store_id: sid,
      } as any);
      if (error) throw error;

      const items = (Array.isArray(data) ? data : []) as any[];
      const out: PayBreakdown = { cash: 0, bank: 0, mobile: 0, credit: 0, other: 0, orders: 0 };

      for (const r of items) {
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

  const callCollections = useCallback(
    async (sid: string, fromISO: string, toISO: string): Promise<CollectionBreakdown> => {
      if (!orgId) return { cash: 0, bank: 0, mobile: 0, other: 0, total: 0, payments: 0 };

      const { data, error } = await supabase.rpc("get_credit_collections_summary_v2", {
        p_org_id: orgId,
        p_from: fromISO,
        p_to: toISO,
        p_store_id: sid,
      } as any);
      if (error) throw error;

      const items = (Array.isArray(data) ? data : []) as any[];
      const out: CollectionBreakdown = {
        cash: 0,
        bank: 0,
        mobile: 0,
        other: 0,
        total: 0,
        payments: 0,
      };

      for (const r of items) {
        const ch = String(r?.channel ?? r?.payment_method ?? r?.method ?? "")
          .trim()
          .toUpperCase();
        const amt = toNum(r?.amount ?? r?.revenue ?? r?.total ?? 0);
        const cnt = toInt(r?.payments ?? r?.count ?? 0);

        out.payments += cnt;

        if (ch === "CASH") out.cash += amt;
        else if (ch === "BANK") out.bank += amt;
        else if (ch === "MOBILE") out.mobile += amt;
        else out.other += amt;
      }

      out.total = out.cash + out.bank + out.mobile;
      return out;
    },
    [orgId]
  );

  const callExpenseBreakdown = useCallback(
    async (sid: string, fromYMD: string, toYMD: string): Promise<ExpenseChannelBreakdown> => {
      const { data, error } = await supabase.rpc("get_expense_channel_summary_v1", {
        p_store_id: sid,
        p_from: fromYMD,
        p_to: toYMD,
      } as any);
      if (error) throw error;

      const items = (Array.isArray(data) ? data : []) as any[];
      const out: ExpenseChannelBreakdown = { cash: 0, bank: 0, mobile: 0 };

      for (const r of items) {
        const ch = String(r?.channel ?? "").trim().toUpperCase();
        const amt = toNum(r?.amount ?? 0);

        if (ch === "CASH") out.cash += amt;
        else if (ch === "BANK") out.bank += amt;
        else if (ch === "MOBILE") out.mobile += amt;
      }

      return out;
    },
    []
  );

  const callStockValue = useCallback(
    async (sid: string): Promise<number> => {
      const { data, error } = await supabase.rpc("get_stock_on_hand_value_v1", {
        p_org_id: orgId,
        p_store_id: sid,
      } as any);
      if (error) throw error;

      const raw = Array.isArray(data) ? data[0] : data;
      return extractScalarValue(raw);
    },
    [orgId]
  );

  const load = useCallback(async () => {
    const rid = ++reqRef.current;

    if (!orgId) {
      setErr("No active organization selected");
      setRows([]);
      return;
    }

    if (!visibleStoreIds.length) {
      setErr("No stores found");
      setRows([]);
      return;
    }

    setLoading(true);
    setErr(null);

    try {
      const { fromISO, toISO, fromYMD, toYMD } = rangeToday();

      const result = await Promise.all(
        visibleStoreIds.map(async (sid) => {
          const [sales, expenses, profit, pay, collections, expCh, stockValue] =
            await Promise.all([
              callSalesForStore(sid, fromISO, toISO),
              callExpenseForStore(sid, fromYMD, toYMD),
              callProfitOwnerOnly(sid, fromISO, toISO),
              callPaymentBreakdown(sid, fromISO, toISO),
              callCollections(sid, fromISO, toISO),
              callExpenseBreakdown(sid, fromYMD, toYMD),
              callStockValue(sid),
            ]);

          const availableCashNum = subtractFloor(pay.cash + collections.cash, expCh.cash);
          const availableBankNum = subtractFloor(pay.bank + collections.bank, expCh.bank);
          const availableMobileNum = subtractFloor(pay.mobile + collections.mobile, expCh.mobile);
          const moneyIn = availableCashNum + availableBankNum + availableMobileNum;

          return {
            storeId: sid,
            storeName: storeNameById.get(sid) ?? "Store",
            sales: toNum(sales.total),
            expenses: toNum(expenses.total),
            profit: isOwner ? toNum(profit.net) : null,
            orders: toInt(sales.orders),
            moneyIn,
            stockValue: toNum(stockValue),
          } as StoreLiveRow;
        })
      );

      if (rid !== reqRef.current) return;

      setRows(result);
    } catch (e: any) {
      if (rid !== reqRef.current) return;
      setErr(e?.message ?? "Failed to load live finance");
      setRows([]);
    } finally {
      if (rid === reqRef.current) setLoading(false);
    }
  }, [
    orgId,
    visibleStoreIds,
    callSalesForStore,
    callExpenseForStore,
    callProfitOwnerOnly,
    callPaymentBreakdown,
    callCollections,
    callExpenseBreakdown,
    callStockValue,
    storeNameById,
    isOwner,
  ]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  useAutoRefresh(() => {
    void load();
  }, true, AUTO_REFRESH_MS);

  const sortedRows = useMemo(() => {
    return [...rows].sort((a, b) => getRowScore(b) - getRowScore(a));
  }, [rows]);

  const topPerformerStoreId = useMemo(() => {
    return sortedRows.length ? sortedRows[0].storeId : null;
  }, [sortedRows]);

  const totals = useMemo(() => {
    return rows.reduce(
      (acc, row) => {
        acc.sales += toNum(row.sales);
        acc.expenses += toNum(row.expenses);
        acc.profit += toNum(row.profit);
        acc.orders += toInt(row.orders);
        acc.moneyIn += toNum(row.moneyIn);
        acc.stockValue += toNum(row.stockValue);
        return acc;
      },
      {
        sales: 0,
        expenses: 0,
        profit: 0,
        orders: 0,
        moneyIn: 0,
        stockValue: 0,
      }
    );
  }, [rows]);

  const currentStoreLabel =
    scope === "STORE"
      ? storeNameById.get(selectedStoreId) ?? activeStoreName ?? "Store"
      : `All Stores (${rows.length})`;

  return (
    <Screen>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: 16, paddingHorizontal: 16, paddingBottom: 28 }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <Pressable
            onPress={() => router.back()}
            hitSlop={10}
            style={({ pressed }) => ({
              width: 42,
              height: 42,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.12)",
              backgroundColor: "rgba(255,255,255,0.06)",
              alignItems: "center",
              justifyContent: "center",
              opacity: pressed ? 0.92 : 1,
            })}
          >
            <Ionicons name="arrow-back" size={18} color={UI.text} />
          </Pressable>

          <View
            style={{
              flex: 1,
              minWidth: 0,
              flexDirection: "row",
              alignItems: "center",
              gap: 12,
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.10)",
              backgroundColor: "rgba(255,255,255,0.04)",
              borderRadius: 18,
              paddingHorizontal: 12,
              paddingVertical: 10,
            }}
          >
            <View
              style={{
                width: 42,
                height: 42,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: "rgba(16,185,129,0.30)",
                backgroundColor: "rgba(16,185,129,0.10)",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Ionicons name="pulse-outline" size={18} color={UI.text} />
            </View>

            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ color: UI.text, fontWeight: "900", fontSize: 18 }} numberOfLines={1}>
                Live Finance
              </Text>
              <Text style={{ color: UI.muted, fontWeight: "800" }} numberOfLines={1}>
                {orgName} • {currentStoreLabel}
              </Text>
            </View>
          </View>

          <Pressable
            onPress={() => void load()}
            hitSlop={10}
            style={({ pressed }) => ({
              width: 42,
              height: 42,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: "rgba(16,185,129,0.35)",
              backgroundColor: "rgba(16,185,129,0.10)",
              alignItems: "center",
              justifyContent: "center",
              opacity: pressed ? 0.92 : 1,
            })}
          >
            {loading ? (
              <ActivityIndicator size="small" />
            ) : (
              <Ionicons name="refresh" size={18} color={UI.text} />
            )}
          </Pressable>
        </View>

        <View style={{ height: 12 }} />

        <Card style={{ gap: 12 }}>
          <Text style={{ color: UI.faint, fontWeight: "900", fontSize: 12, letterSpacing: 0.4 }}>
            LIVE SCOPE
          </Text>

          <View style={{ flexDirection: "row", gap: 10 }}>
            <Chip
              active={scope === "STORE"}
              label="STORE"
              onPress={() => setScope("STORE")}
            />
            {canAll ? (
              <Chip
                active={scope === "ALL"}
                label="ALL STORES"
                onPress={() => setScope("ALL")}
              />
            ) : null}
          </View>

          {scope === "STORE" ? (
            <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
              {storeOptions.map((item) => (
                <Chip
                  key={item.storeId}
                  active={selectedStoreId === item.storeId}
                  label={item.storeName}
                  onPress={() => setSelectedStoreId(item.storeId)}
                />
              ))}
            </View>
          ) : null}

          {!!err ? (
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
          ) : null}
        </Card>

        <View style={{ height: 12 }} />

        <Card style={{ gap: 12 }}>
          <Text style={{ color: UI.text, fontWeight: "900", fontSize: 16 }}>
            Live Overview • Today
          </Text>

          <View style={{ flexDirection: "row", gap: 12 }}>
            <MiniStat label="Sales" value={fmtMoney(totals.sales)} />
            <MiniStat label="Expenses" value={fmtMoney(totals.expenses)} />
            <MiniStat label="Orders" value={String(totals.orders)} />
          </View>

          <View style={{ flexDirection: "row", gap: 12 }}>
            <MiniStat label="Money In" value={fmtMoney(totals.moneyIn)} />
            <MiniStat label="Stock Value" value={fmtMoney(totals.stockValue)} />
            <MiniStat
              label="Profit"
              value={isOwner ? fmtMoney(totals.profit) : "—"}
              hint={isOwner ? "owner-only" : "owner only"}
            />
          </View>

          <Text style={{ color: UI.muted, fontWeight: "800", lineHeight: 20 }}>
            Hapa unaona live snapshot ya leo. ALL STORES inaonyesha aggregate ya organization.
            STORE inaonyesha store moja moja.
          </Text>

          {scope === "ALL" && sortedRows.length ? (
            <View
              style={{
                borderRadius: 16,
                borderWidth: 1,
                borderColor: "rgba(16,185,129,0.24)",
                backgroundColor: "rgba(16,185,129,0.08)",
                paddingHorizontal: 12,
                paddingVertical: 10,
              }}
            >
              <Text style={{ color: UI.text, fontWeight: "900", fontSize: 13 }}>
                Top Performer Today: {sortedRows[0].storeName}
              </Text>
              <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12, marginTop: 4 }}>
                Sales {fmtMoney(sortedRows[0].sales)} • Money In {fmtMoney(sortedRows[0].moneyIn)}
                {isOwner ? ` • Profit ${fmtMoney(toNum(sortedRows[0].profit))}` : ""}
              </Text>
            </View>
          ) : null}
        </Card>

        <View style={{ height: 12 }} />

        <View style={{ gap: 12 }}>
          {sortedRows.map((row, idx) => {
            const isTopPerformer = row.storeId === topPerformerStoreId;

            return (
              <Card
                key={row.storeId}
                style={{
                  gap: 12,
                  borderRadius: 22,
                  borderColor: isTopPerformer
                    ? "rgba(16,185,129,0.34)"
                    : "rgba(16,185,129,0.22)",
                  backgroundColor: isTopPerformer
                    ? "rgba(18,24,28,0.99)"
                    : "rgba(15,18,24,0.98)",
                }}
              >
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <View
                    style={{
                      width: 42,
                      height: 42,
                      borderRadius: 14,
                      alignItems: "center",
                      justifyContent: "center",
                      borderWidth: 1,
                      borderColor: isTopPerformer
                        ? "rgba(16,185,129,0.34)"
                        : "rgba(16,185,129,0.24)",
                      backgroundColor: isTopPerformer
                        ? "rgba(16,185,129,0.14)"
                        : "rgba(16,185,129,0.10)",
                    }}
                  >
                    <Ionicons
                      name={isTopPerformer ? "flash-outline" : "business-outline"}
                      size={18}
                      color={UI.text}
                    />
                  </View>

                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text
                      style={{ color: UI.text, fontWeight: "900", fontSize: 16 }}
                      numberOfLines={1}
                    >
                      {row.storeName}
                    </Text>
                    <Text style={{ color: UI.muted, fontWeight: "800" }} numberOfLines={1}>
                      {isTopPerformer ? "Top performer right now" : "Live store snapshot"}
                    </Text>
                  </View>

                  {isTopPerformer ? (
                    <View
                      style={{
                        paddingHorizontal: 10,
                        paddingVertical: 6,
                        borderRadius: 999,
                        borderWidth: 1,
                        borderColor: "rgba(16,185,129,0.26)",
                        backgroundColor: "rgba(16,185,129,0.10)",
                      }}
                    >
                      <Text style={{ color: UI.text, fontWeight: "900", fontSize: 11 }}>
                        TOP #{idx + 1}
                      </Text>
                    </View>
                  ) : (
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
                        #{idx + 1}
                      </Text>
                    </View>
                  )}
                </View>

                <View style={{ flexDirection: "row", gap: 10, flexWrap: "wrap" }}>
                  <MetricPill
                    label="Sales"
                    value={fmtMoney(row.sales)}
                    tone={getMetricTone(row.sales, "sales")}
                  />
                  <MetricPill
                    label="Money In"
                    value={fmtMoney(row.moneyIn)}
                    tone={getMetricTone(row.moneyIn, "moneyIn")}
                  />
                  <MetricPill
                    label="Expenses"
                    value={fmtMoney(row.expenses)}
                    tone={getMetricTone(row.expenses, "expenses")}
                  />
                  <MetricPill
                    label="Stock Value"
                    value={fmtMoney(row.stockValue)}
                    tone="neutral"
                  />
                  <MetricPill
                    label="Orders"
                    value={String(row.orders)}
                    tone="neutral"
                  />
                  <MetricPill
                    label="Profit"
                    value={isOwner ? fmtMoney(toNum(row.profit)) : "—"}
                    tone={isOwner ? getMetricTone(toNum(row.profit), "profit") : "neutral"}
                  />
                </View>

                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 10,
                    paddingTop: 2,
                  }}
                >
                  <Text style={{ color: UI.faint, fontWeight: "800", fontSize: 12, flex: 1 }}>
                    {isTopPerformer
                      ? "Store hii inaongoza kwa live performance ya sasa."
                      : "Open detail kuona finance history ya store hii moja kwa moja."}
                  </Text>

                  <Pressable
                    onPress={() => {
                      const today = rangeToday();
                      router.push({
                        pathname: "/finance/history",
                        params: {
                          mode: "SALES",
                          scope: "STORE",
                          range: "today",
                          from: today.fromYMD,
                          to: today.toYMD,
                          storeId: row.storeId,
                          storeName: row.storeName,
                        } as any,
                      } as any);
                    }}
                    hitSlop={10}
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
                      OPEN DETAIL
                    </Text>
                  </Pressable>
                </View>
              </Card>
            );
          })}

          {!loading && !sortedRows.length ? (
            <Card
              style={{
                borderRadius: 18,
                borderColor: "rgba(255,255,255,0.10)",
                backgroundColor: "rgba(255,255,255,0.04)",
              }}
            >
              <Text style={{ color: UI.muted, fontWeight: "800" }}>
                No live store data yet.
              </Text>
            </Card>
          ) : null}
        </View>

        <View style={{ height: 20 }} />
      </ScrollView>
    </Screen>
  );
}