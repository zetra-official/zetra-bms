// app/(tabs)/index.tsx
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  AppState,
  Platform,
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

function normalizeDash(
  raw: any,
  fallbackFrom: string,
  fallbackTo: string,
  storeId: string
): DashRow {
  const store_id = String(raw?.store_id ?? raw?.p_store_id ?? storeId ?? "").trim();

  const from_ts = String(
    raw?.from_ts ?? raw?.date_from ?? raw?.p_from ?? fallbackFrom ?? ""
  ).trim();
  const to_ts = String(
    raw?.to_ts ?? raw?.date_to ?? raw?.p_to ?? fallbackTo ?? ""
  ).trim();

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
    <View style={{ flex: 1, gap: 4, minWidth: 0 }}>
      <Text
        style={{ color: UI.muted, fontWeight: "800", fontSize: 12 }}
        numberOfLines={1}
        ellipsizeMode="tail"
      >
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
        <Text
          style={{ color: UI.faint, fontWeight: "800", fontSize: 12 }}
          numberOfLines={1}
          ellipsizeMode="tail"
        >
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

/**
 * ✅ HOME PREVIEW RULE (stability-first)
 * Home cards are preview-only (no chips/pills) to avoid Android touch conflicts.
 * Full filters live inside the dedicated screens (history/full dashboards).
 */

/** ---------- ✅ Finance Card (HOME PREVIEW ONLY) ---------- */
function CompactFinanceCardHomePreview() {
  const router = useRouter();
  const org = useOrg();

  const orgId = String(org.activeOrgId ?? "").trim();
  const orgName = String(org.activeOrgName ?? "Org").trim() || "Org";

  const storeId = String(org.activeStoreId ?? "").trim();
  const storeName = String(org.activeStoreName ?? "Store").trim() || "Store";

  // ✅ org-level currency prefs
  const money = useOrgMoneyPrefs(orgId);

  useFocusEffect(
    useCallback(() => {
      void money.refresh();
    }, [money])
  );

  const displayCurrency = money.currency || "TZS";
  const displayLocale = money.locale || "en-TZ";

  const range: RangeKey = "today"; // fixed for Home
  const scope: "STORE" | "ALL" = "STORE"; // fixed for Home
  const mode: "SALES" = "SALES"; // fixed for Home

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [salesRow, setSalesRow] = useState<SalesSummary>({
    total: 0,
    orders: 0,
    currency: "TZS",
  });

  const [pay, setPay] = useState<PayBreakdown>({
    cash: 0,
    bank: 0,
    mobile: 0,
    credit: 0,
    other: 0,
    orders: 0,
  });

  const [collections, setCollections] = useState<CollectionBreakdown>({
    cash: 0,
    bank: 0,
    mobile: 0,
    other: 0,
    total: 0,
    payments: 0,
  });

  const reqIdRef = useRef(0);

  const callSalesForStore = useCallback(
    async (sid: string, fromISO: string, toISO: string): Promise<SalesSummary> => {
      const { data, error } = await supabase.rpc("get_sales", {
        p_store_id: sid,
        p_from: fromISO,
        p_to: toISO,
      } as any);
      if (error) throw error;

      const rows = (Array.isArray(data) ? data : []) as any[];

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

      const total = rows.reduce((acc, r) => acc + toNum(pickAmount(r)), 0);
      const orders = rows.reduce((acc, r) => acc + (isCancelled(r) ? 0 : 1), 0);

      const currency = String(rows?.[0]?.currency ?? "TZS").trim() || "TZS";
      return { total, orders, currency };
    },
    []
  );

  const callPaymentBreakdown = useCallback(
    async (fromISO: string, toISO: string, sidOrNull: string | null): Promise<PayBreakdown> => {
      if (!orgId) return { cash: 0, bank: 0, mobile: 0, credit: 0, other: 0, orders: 0 };

      const { data, error } = await supabase.rpc("get_sales_channel_summary_v3", {
        p_org_id: orgId,
        p_from: fromISO,
        p_to: toISO,
        p_store_id: sidOrNull,
      } as any);
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
        else out.other += rev;
      }

      return out;
    },
    [orgId]
  );

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
        const { data, error } = await supabase.rpc(fn, {
          p_org_id: orgId,
          p_from: fromISO,
          p_to: toISO,
          p_store_id: sidOrNull,
        } as any);

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
          else out.other += amt;
        }

        out.total = out.cash + out.bank + out.mobile;
        return out;
      }

      const _ = lastErr;
      return { cash: 0, bank: 0, mobile: 0, other: 0, total: 0, payments: 0 };
    },
    [orgId]
  );

  const load = useCallback(async () => {
    const rid = ++reqIdRef.current;

    if (!orgId) {
      setErr("No active organization selected");
      return;
    }
    if (!storeId) {
      setErr("No active store selected");
      return;
    }

    setLoading(true);
    setErr(null);

    try {
      const { from, to } = rangeToFromTo(range);

      const row = await callSalesForStore(storeId, from, to);
      const pb = await callPaymentBreakdown(from, to, storeId);
      const cc = await callCreditCollections(from, to, storeId);

      if (rid !== reqIdRef.current) return;
      setSalesRow(row);
      setPay(pb);
      setCollections(cc);
    } catch (e: any) {
      if (rid !== reqIdRef.current) return;
      setErr(e?.message ?? "Failed to load finance");
    } finally {
      if (rid === reqIdRef.current) setLoading(false);
    }
  }, [orgId, storeId, range, callSalesForStore, callPaymentBreakdown, callCreditCollections]);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, storeId]);

  useAutoRefresh(() => {
    if (!orgId || !storeId) return;
    void load();
  }, !!orgId && !!storeId, AUTO_REFRESH_MS);

  const subtitle = `Store: ${storeName}`;

  const body = useMemo(() => {
    const fmtMoney = (n: number) =>
      formatMoney(n, { currency: displayCurrency, locale: displayLocale }).replace(/\s+/g, " ");

    const totalSales = fmtMoney(salesRow.total);
    const orders = String(salesRow.orders ?? 0);
    const avg =
      salesRow.orders > 0 ? fmtMoney(salesRow.total / Math.max(1, salesRow.orders)) : "—";

    const paidCash = fmtMoney(pay.cash);
    const paidBank = fmtMoney(pay.bank);
    const paidMobile = fmtMoney(pay.mobile);
    const creditBal = fmtMoney(pay.credit);

    const paidTotalNum = pay.cash + pay.bank + pay.mobile;
    const totalMoneyInNum = paidTotalNum + toNum(collections.total);
    const totalMoneyIn = fmtMoney(totalMoneyInNum);

    const colCash = fmtMoney(collections.cash);
    const colBank = fmtMoney(collections.bank);
    const colMobile = fmtMoney(collections.mobile);
    const colTotal = fmtMoney(collections.total);
    const colCountHint =
      collections.payments > 0 ? `${collections.payments} payments` : "0 payments";

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
  }, [salesRow, pay, collections, displayCurrency, displayLocale]);

  return (
    <View style={{ paddingTop: 12 }}>
      <Card style={{ gap: 10 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ color: UI.text, fontWeight: "900", fontSize: 16 }}>
              Finance
            </Text>
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

        {body}

        <View style={{ height: 1, backgroundColor: "rgba(255,255,255,0.08)", marginTop: 4 }} />

        {/* ✅ Switch row ONLY (opens full filter screen) */}
        <Pressable
          onPress={() => {
            const dates = rangeToDates("today");
            router.push({
              pathname: "/finance/history",
              params: { mode, scope, range: "today", from: dates.from, to: dates.to } as any,
            } as any);
          }}
          hitSlop={10}
          style={({ pressed }) => ({
            flexDirection: "row",
            alignItems: "center",
            opacity: pressed ? 0.92 : 1,
          })}
        >
          <Text style={{ color: UI.muted, fontWeight: "800" }}>1 store</Text>
          <View style={{ flex: 1 }} />
          {loading ? (
            <ActivityIndicator />
          ) : (
            <Text style={{ color: UI.muted, fontWeight: "900", fontSize: 18 }}>›</Text>
          )}
        </Pressable>
      </Card>
    </View>
  );
}

/** ---------- ✅ Club Revenue (HOME PREVIEW ONLY) ---------- */
function CompactClubRevenueCardHomePreview({ onOpen }: { onOpen: () => void }) {
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

  useFocusEffect(
    useCallback(() => {
      void money.refresh();
    }, [money])
  );

  const displayCurrency = money.currency || "TZS";
  const displayLocale = money.locale || "en-TZ";

  const storeId: string = String(
    orgAny?.activeStoreId ??
      orgAny?.activeStore?.id ??
      orgAny?.selectedStoreId ??
      orgAny?.selectedStore?.id ??
      ""
  ).trim();

  const storeName: string =
    String(orgAny?.activeStoreName ?? orgAny?.activeStore?.name ?? "Store").trim() || "Store";

  const range: RangeKey = "today"; // fixed for Home

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

      const { data: d1, error: e1 } = await supabase.rpc("get_club_revenue_dashboard_v4", {
        p_store_id: storeId,
        p_from: from,
        p_to: to,
      } as any);
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
  }, [storeId]);

  useAutoRefresh(() => {
    if (!storeId) return;
    void load();
  }, !!storeId, AUTO_REFRESH_MS);

  const revenue = formatMoney(toNum(row?.revenue), {
    currency: displayCurrency,
    locale: displayLocale,
  }).replace(/\s+/g, " ");
  const paid = formatMoney(toNum(row?.paid_revenue), {
    currency: displayCurrency,
    locale: displayLocale,
  }).replace(/\s+/g, " ");

  return (
    <View style={{ paddingTop: 10 }}>
      <Card style={{ gap: 10 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ color: UI.text, fontWeight: "900", fontSize: 16 }}>
              Club Revenue
            </Text>
            <Text style={{ color: UI.muted, fontWeight: "700", marginTop: 2 }} numberOfLines={1}>
              Store: {storeName}
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
          <MiniStat
            label="Orders"
            value={String(row?.delivered_orders ?? 0)}
            hint="delivered"
          />
        </View>

        <View style={{ height: 1, backgroundColor: "rgba(255,255,255,0.08)", marginTop: 4 }} />

        {/* ✅ Switch row ONLY */}
        <Pressable
          onPress={onOpen}
          hitSlop={10}
          style={({ pressed }) => ({
            flexDirection: "row",
            alignItems: "center",
            opacity: pressed ? 0.92 : 1,
          })}
        >
          <Text style={{ color: UI.muted, fontWeight: "800" }} numberOfLines={1}>
            {row ? "Live dashboard" : "—"}
          </Text>
          <View style={{ flex: 1 }} />
          {loading ? (
            <ActivityIndicator />
          ) : (
            <Text style={{ color: UI.muted, fontWeight: "900", fontSize: 18 }}>›</Text>
          )}
        </Pressable>
      </Card>
    </View>
  );
}

/** ---------- ✅ Stock Value (HOME PREVIEW ONLY) ---------- */
function CompactStockValueCardHomePreview() {
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

  useFocusEffect(
    useCallback(() => {
      void money.refresh();
    }, [money])
  );

  const displayCurrency = money.currency || "TZS";
  const displayLocale = money.locale || "en-TZ";

  const storeId: string = String(
    orgAny?.activeStoreId ??
      orgAny?.activeStore?.id ??
      orgAny?.selectedStoreId ??
      orgAny?.selectedStore?.id ??
      ""
  ).trim();

  const storeName: string =
    String(orgAny?.activeStoreName ?? orgAny?.activeStore?.name ?? "Store").trim() || "Store";

  const range: RangeKey = "today"; // fixed for Home

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [row, setRow] = useState<FinRow | null>(null);

  const STOCK_IN_VERSION_BADGE = "v2";

  const reqIdRef = useRef(0);

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
    if (!storeId) {
      setErr("No active store selected");
      setRow(null);
      return;
    }

    setLoading(true);
    setErr(null);

    try {
      const { from, to } = rangeToDates(range);

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
    } catch (e: any) {
      if (rid !== reqIdRef.current) return;
      setErr(e?.message ?? "Failed to load stock values");
      setRow(null);
    } finally {
      if (rid === reqIdRef.current) setLoading(false);
    }
  }, [orgId, storeId, range, loadForStore]);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, storeId]);

  useAutoRefresh(() => {
    if (!orgId || !storeId) return;
    void load();
  }, !!orgId && !!storeId, AUTO_REFRESH_MS);

  const openHistory = useCallback(() => {
    router.push("/stocks/history");
  }, [router]);

  const onHand = formatMoney(toNum(row?.stock_on_hand_value), {
    currency: displayCurrency,
    locale: displayLocale,
  }).replace(/\s+/g, " ");
  const stockIn = formatMoney(toNum(row?.stock_in_value), {
    currency: displayCurrency,
    locale: displayLocale,
  }).replace(/\s+/g, " ");

  const subtitle = `Store: ${storeName}`;

  return (
    <View style={{ paddingTop: 12 }}>
      <Card style={{ gap: 10 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ color: UI.text, fontWeight: "900", fontSize: 16 }}>
              Stock Value
            </Text>
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

        {/* ✅ Switch row ONLY */}
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

/** ✅ ZETRA AI Card v4 */
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
    let alive = true;
    let interval: any = null;

    const start = () => {
      if (!alive) return;
      if (interval) clearInterval(interval);
      interval = setInterval(() => {
        if (!alive) return;
        setI((x) => (x + 1) % tips.length);
      }, 4500);
    };

    const stop = () => {
      if (interval) clearInterval(interval);
      interval = null;
    };

    const sub = AppState.addEventListener("change", (state) => {
      if (!alive) return;
      if (state === "active") start();
      else stop();
    });

    start();

    return () => {
      alive = false;
      stop();
      try {
        // @ts-ignore
        sub?.remove?.();
      } catch {}
    };
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
                    <Text style={{ color: UI.text, fontWeight: "900", fontSize: 16 }}>AI</Text>
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
                  style={{ opacity: fade, color: UI.text, fontWeight: "900", fontSize: 14, lineHeight: 20 }}
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
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={pulling || refreshing}
            onRefresh={onPullRefresh}
            tintColor={UI.text}
          />
        }
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
          <CompactClubRevenueCardHomePreview key={`club-mini-${dashTick}`} onOpen={goClubRevenue} />
        </StoreGuard>

        <StoreGuard>
          <CompactFinanceCardHomePreview />
        </StoreGuard>

        <StoreGuard>
          <CompactStockValueCardHomePreview />
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
                  <Text style={{ color: UI.text, fontWeight: "900", fontSize: 16 }}>
                    Staff Management
                  </Text>
                  <Text style={{ color: UI.muted, fontWeight: "700", marginTop: 2 }}>
                    Add staff and assign stores
                  </Text>
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