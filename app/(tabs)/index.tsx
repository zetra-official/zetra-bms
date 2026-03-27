// app/(tabs)/index.tsx
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  AppState,
  Pressable,
  RefreshControl,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import { useOrg } from "../../src/context/OrgContext";
import { supabase } from "../../src/supabase/supabaseClient";
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
  date_from: string;
  date_to: string;
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

type NotifRow = {
  id: string;
  organization_id: string;
  store_id: string;
  source_store_id: string | null;
  event_type: string;
  title: string;
  body: any;
  items: any;
  total_units: number;
  total_skus: number;
  actor_user_id: string;
  actor_name: string | null;
  ref_movement_id: string | null;
  created_by: string;
  created_at: string;
  is_read: boolean;
  read_at: string | null;
};

type Receipt = {
  key: string;
  movement_id: string | null;
  organization_id: string;
  store_id: string;
  source_store_id: string | null;
  event_type: string;
  title: string;
  actor_user_id: string;
  actor_name: string | null;
  created_at: string;
  total_units: number;
  total_skus: number;
  is_read: boolean;
  rows: NotifRow[];
  items: any[];
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

function endOfLocalDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

function rangeToFromTo(k: RangeKey) {
  const now = new Date();
  const from = startOfLocalDay(now);
  const to = startOfLocalDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1));

  if (k === "today") {
    // no change
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
    // no change
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

function subtractFloor(a: number, b: number) {
  return Math.max(0, toNum(a) - toNum(b));
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

function clean(v: any) {
  return String(v ?? "").trim();
}

function clampInt(n: any, fallback = 0) {
  const x = Number(n);
  if (!Number.isFinite(x)) return fallback;
  return Math.floor(x);
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

function HeaderHero({
  activeOrgName,
  activeStoreName,
  isCashier,
}: {
  activeOrgName?: string | null;
  activeStoreName?: string | null;
  isCashier: boolean;
}) {
  const orgLabel = String(activeOrgName ?? "Workspace").trim() || "Workspace";
  const storeLabel = String(activeStoreName ?? "No active store").trim() || "No active store";

  return (
    <View style={{ marginBottom: 6 }}>
      <Text style={{ fontSize: 30, fontWeight: "900", color: UI.text, letterSpacing: 0.2 }}>
        ZETRA BMS
      </Text>

      <Text style={{ color: UI.muted, fontWeight: "800", marginTop: 4, fontSize: 16 }}>
        {isCashier ? "Cashier Dashboard" : "Business Command Center"}
      </Text>

      <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
        <View
          style={{
            paddingHorizontal: 10,
            paddingVertical: 6,
            borderRadius: 999,
            borderWidth: 1,
            borderColor: "rgba(255,255,255,0.10)",
            backgroundColor: "rgba(255,255,255,0.04)",
          }}
        >
          <Text style={{ color: UI.text, fontWeight: "900", fontSize: 11 }} numberOfLines={1}>
            {orgLabel}
          </Text>
        </View>

        <View
          style={{
            paddingHorizontal: 10,
            paddingVertical: 6,
            borderRadius: 999,
            borderWidth: 1,
            borderColor: "rgba(16,185,129,0.20)",
            backgroundColor: "rgba(16,185,129,0.08)",
            maxWidth: "55%",
          }}
        >
          <Text style={{ color: UI.text, fontWeight: "900", fontSize: 11 }} numberOfLines={1}>
            {storeLabel}
          </Text>
        </View>
      </View>
    </View>
  );
}

function PremiumMetricCard({
  title,
  subtitle,
  iconName,
  loading,
  badgeText,
  children,
  ctaLabel,
  onPress,
  footerRight,
  error,
}: {
  title: string;
  subtitle: string;
  iconName: keyof typeof Ionicons.glyphMap;
  loading?: boolean;
  badgeText?: string;
  children: React.ReactNode;
  ctaLabel: string;
  onPress: () => void;
  footerRight?: React.ReactNode;
  error?: string | null;
}) {
  return (
    <View style={{ paddingTop: 14 }}>
      <Card
        style={{
          gap: 14,
          borderRadius: 22,
          borderColor: "rgba(16,185,129,0.22)",
          backgroundColor: "rgba(15,18,24,0.98)",
          overflow: "hidden",
        }}
      >
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            top: -72,
            right: -42,
            width: 180,
            height: 180,
            borderRadius: 999,
            backgroundColor: "rgba(16,185,129,0.08)",
          }}
        />

        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            left: -46,
            bottom: -82,
            width: 170,
            height: 170,
            borderRadius: 999,
            backgroundColor: "rgba(34,211,238,0.04)",
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

        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <View
            style={{
              width: 48,
              height: 48,
              borderRadius: 16,
              alignItems: "center",
              justifyContent: "center",
              borderWidth: 1,
              borderColor: "rgba(16,185,129,0.28)",
              backgroundColor: "rgba(16,185,129,0.12)",
            }}
          >
            <Ionicons name={loading ? "ellipsis-horizontal" : iconName} size={20} color={UI.emerald} />
          </View>

          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ color: UI.text, fontWeight: "900", fontSize: 16 }} numberOfLines={1}>
              {title}
            </Text>
            <Text style={{ color: UI.muted, fontWeight: "700", marginTop: 2 }} numberOfLines={1}>
              {subtitle}
            </Text>
          </View>

          {badgeText ? (
            <View
              style={{
                paddingHorizontal: 10,
                paddingVertical: 6,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: "rgba(16,185,129,0.24)",
                backgroundColor: "rgba(16,185,129,0.10)",
              }}
            >
              <Text style={{ color: UI.text, fontWeight: "900", fontSize: 11 }}>{badgeText}</Text>
            </View>
          ) : null}
        </View>

        {!!error && (
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
        )}

        {children}

        <View style={{ height: 1, backgroundColor: "rgba(255,255,255,0.08)" }} />

        <Pressable
          onPress={onPress}
          hitSlop={10}
          style={({ pressed }) => ({
            borderRadius: 18,
            borderWidth: 1,
            borderColor: "rgba(16,185,129,0.30)",
            backgroundColor: "rgba(16,185,129,0.12)",
            paddingVertical: 15,
            paddingHorizontal: 16,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 10,
            opacity: pressed ? 0.92 : 1,
          })}
        >
          <Text style={{ color: UI.text, fontWeight: "900", fontSize: 15 }}>{ctaLabel}</Text>
          {footerRight ? footerRight : <Text style={{ color: UI.faint, fontWeight: "900", fontSize: 16 }}>›</Text>}
        </Pressable>
      </Card>
    </View>
  );
}

function CompactNotificationsHomeCard() {
  const router = useRouter();
  const { activeStoreId, activeStoreName, stores } = useOrg();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<NotifRow[]>([]);

  const storeNameById = useMemo(() => {
    const map: Record<string, string> = {};
    for (const s of stores ?? []) {
      map[String((s as any).store_id)] = String((s as any).store_name ?? "Store");
    }
    return map;
  }, [stores]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const { data, error: e } = await supabase.rpc("get_my_notifications", {
        p_store_id: null,
        p_limit: 80,
      });

      if (e) throw e;
      setRows((data ?? []) as NotifRow[]);
    } catch (err: any) {
      setError(err?.message ?? "Failed to load notifications");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  useAutoRefresh(() => {
    void load();
  }, true, AUTO_REFRESH_MS);

  const receipts: Receipt[] = useMemo(() => {
    const map = new Map<string, Receipt>();

    for (const n of rows ?? []) {
      const key = n.ref_movement_id ? `mv:${n.ref_movement_id}` : `n:${n.id}`;
      const itemsArr = Array.isArray(n.items) ? n.items : [];

      const existing = map.get(key);
      if (!existing) {
        map.set(key, {
          key,
          movement_id: n.ref_movement_id ?? null,
          organization_id: n.organization_id,
          store_id: n.store_id,
          source_store_id: n.source_store_id ?? null,
          event_type: n.event_type,
          title: n.title,
          actor_user_id: n.actor_user_id,
          actor_name: n.actor_name ?? null,
          created_at: n.created_at,
          total_units: clampInt(n.total_units, 0),
          total_skus: clampInt(n.total_skus, 0),
          is_read: !!n.is_read,
          rows: [n],
          items: [...itemsArr],
        });
        continue;
      }

      existing.rows.push(n);

      if (new Date(n.created_at).getTime() > new Date(existing.created_at).getTime()) {
        existing.created_at = n.created_at;
      }

      existing.total_units += clampInt(n.total_units, 0);

      if (itemsArr.length > 0) {
        existing.items.push(...itemsArr);
      }

      existing.is_read = existing.is_read && !!n.is_read;
    }

    const out = Array.from(map.values());
    out.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    return out;
  }, [rows]);

  const unreadCount = useMemo(() => receipts.filter((r) => !r.is_read).length, [receipts]);

  const activeStoreUnread = useMemo(() => {
    if (!activeStoreId) return 0;
    return receipts.filter((r) => clean(r.store_id) === clean(activeStoreId) && !r.is_read).length;
  }, [receipts, activeStoreId]);

  const openNotifications = useCallback(() => {
    router.push("/notifications");
  }, [router]);

  return (
    <View style={{ paddingTop: 14 }}>
      <Pressable
        onPress={openNotifications}
        hitSlop={10}
        style={({ pressed }) => ({
          opacity: pressed ? 0.97 : 1,
          transform: pressed ? [{ scale: 0.997 }] : [{ scale: 1 }],
        })}
      >
        <Card
          style={{
            gap: 10,
            padding: 14,
            borderRadius: 20,
            borderColor: unreadCount > 0 ? "rgba(16,185,129,0.24)" : "rgba(255,255,255,0.10)",
            backgroundColor: "rgba(15,18,24,0.98)",
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
                borderColor: unreadCount > 0 ? UI.emeraldBorder : "rgba(255,255,255,0.10)",
                backgroundColor: unreadCount > 0 ? UI.emeraldSoft : "rgba(255,255,255,0.05)",
              }}
            >
              <Ionicons
                name={unreadCount > 0 ? "notifications" : "notifications-outline"}
                size={18}
                color={unreadCount > 0 ? UI.emerald : UI.text}
              />
            </View>

            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ color: UI.text, fontWeight: "900", fontSize: 16 }} numberOfLines={1}>
                Notifications
              </Text>
              <Text
                style={{ color: UI.muted, fontWeight: "800", fontSize: 12, marginTop: 2 }}
                numberOfLines={1}
              >
                Alerts, movements, stock entries
              </Text>
            </View>

            <View
              style={{
                minWidth: 40,
                paddingHorizontal: 10,
                paddingVertical: 5,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: unreadCount > 0 ? UI.emeraldBorder : "rgba(255,255,255,0.10)",
                backgroundColor: unreadCount > 0 ? UI.emeraldSoft : "rgba(255,255,255,0.05)",
                alignItems: "center",
              }}
            >
              <Text style={{ color: UI.text, fontWeight: "900", fontSize: 11 }}>
                {loading ? "..." : unreadCount}
              </Text>
            </View>
          </View>

          {!!error && (
            <Card
              style={{
                borderColor: "rgba(201,74,74,0.35)",
                backgroundColor: "rgba(201,74,74,0.10)",
                borderRadius: 16,
                padding: 10,
              }}
            >
              <Text style={{ color: UI.danger, fontWeight: "900", fontSize: 12 }}>{error}</Text>
            </Card>
          )}

          <View style={{ flexDirection: "row", gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 11 }}>Unread</Text>
              <Text style={{ color: UI.text, fontWeight: "900", fontSize: 18, marginTop: 2 }}>
                {unreadCount}
              </Text>
            </View>

            <View style={{ flex: 1 }}>
              <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 11 }}>This Store</Text>
              <Text style={{ color: UI.text, fontWeight: "900", fontSize: 18, marginTop: 2 }}>
                {activeStoreUnread}
              </Text>
              <Text
                style={{ color: UI.faint, fontWeight: "800", fontSize: 11, marginTop: 2 }}
                numberOfLines={1}
              >
                {activeStoreName ?? "—"}
              </Text>
            </View>

            <View style={{ flex: 1 }}>
              <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 11 }}>Receipts</Text>
              <Text style={{ color: UI.text, fontWeight: "900", fontSize: 18, marginTop: 2 }}>
                {receipts.length}
              </Text>
              <Text
                style={{ color: UI.faint, fontWeight: "800", fontSize: 11, marginTop: 2 }}
                numberOfLines={1}
              >
                recently loaded
              </Text>
            </View>
          </View>

          <Pressable
            onPress={openNotifications}
            hitSlop={10}
            style={({ pressed }) => ({
              flexDirection: "row",
              alignItems: "center",
              opacity: pressed ? 0.92 : 1,
              paddingTop: 2,
            })}
          >
            <Text style={{ color: UI.text, fontWeight: "900", fontSize: 13 }}>
              Open Notification Center
            </Text>
            <View style={{ flex: 1 }} />
            <Text style={{ color: UI.muted, fontWeight: "900", fontSize: 16 }}>›</Text>
          </Pressable>
        </Card>
      </Pressable>
    </View>
  );
}

function CompactFinanceCardHomePreview() {
  const router = useRouter();
  const org = useOrg();

  const orgId = String(org.activeOrgId ?? "").trim();
  const storeId = String(org.activeStoreId ?? "").trim();
  const storeName = String(org.activeStoreName ?? "Store").trim() || "Store";
  const roleLower = String(org.activeRole ?? "").trim().toLowerCase();
  const isOwner = roleLower === "owner";

  const money = useOrgMoneyPrefs(orgId);

  useFocusEffect(
    useCallback(() => {
      void money.refresh();
    }, [money])
  );

  const displayCurrency = money.currency || "TZS";
  const displayLocale = money.locale || "en-TZ";

  const range: RangeKey = "today";

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [salesRow, setSalesRow] = useState<SalesSummary>({
    total: 0,
    orders: 0,
    currency: "TZS",
  });

  const [expRow, setExpRow] = useState<ExpenseSummary>({
    total: 0,
    count: 0,
  });

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

  const [collections, setCollections] = useState<CollectionBreakdown>({
    cash: 0,
    bank: 0,
    mobile: 0,
    other: 0,
    total: 0,
    payments: 0,
  });

  const [expenseByChannel, setExpenseByChannel] = useState<ExpenseChannelBreakdown>({
    cash: 0,
    bank: 0,
    mobile: 0,
  });

  const reqIdRef = useRef(0);
  const loadingRef = useRef(false);

  useEffect(() => {
    loadingRef.current = loading;
  }, [loading]);

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
      if (!isOwner) {
        return { net: 0, sales: null, expenses: null };
      }

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
        else if (ch === "CREDIT") out.credit += rev;
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
        const out: CollectionBreakdown = {
          cash: 0,
          bank: 0,
          mobile: 0,
          other: 0,
          total: 0,
          payments: 0,
        };

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

  const callExpenseBreakdown = useCallback(
    async (sid: string, fromYMD: string, toYMD: string): Promise<ExpenseChannelBreakdown> => {
      const { data, error } = await supabase.rpc("get_expense_channel_summary_v1", {
        p_store_id: sid,
        p_from: fromYMD,
        p_to: toYMD,
      } as any);
      if (error) throw error;

      const rows = (Array.isArray(data) ? data : []) as any[];

      const out: ExpenseChannelBreakdown = {
        cash: 0,
        bank: 0,
        mobile: 0,
      };

      for (const r of rows) {
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

  const load = useCallback(
    async (opts?: { silent?: boolean }) => {
      const silent = !!opts?.silent;
      const rid = ++reqIdRef.current;

      if (!orgId) {
        setErr("No active organization selected");
        return;
      }
      if (!storeId) {
        setErr("No active store selected");
        return;
      }
      if (!silent && loadingRef.current) return;

      if (!silent) setLoading(true);
      setErr(null);

      try {
        const { from, to } = rangeToFromTo(range);
        const { from: fromYMD, to: toYMD } = rangeToDates(range);

        const [
          salesRes,
          expenseRes,
          profitRes,
          payRes,
          collectionsRes,
          expenseBreakdownRes,
        ] = await Promise.allSettled([
          callSalesForStore(storeId, from, to),
          callExpenseForStore(storeId, fromYMD, toYMD),
          callProfitOwnerOnly(storeId, from, to),
          callPaymentBreakdown(from, to, storeId),
          callCreditCollections(from, to, storeId),
          callExpenseBreakdown(storeId, fromYMD, toYMD),
        ]);

        if (rid !== reqIdRef.current) return;

        if (salesRes.status === "fulfilled") setSalesRow(salesRes.value);
        if (expenseRes.status === "fulfilled") setExpRow(expenseRes.value);
        if (profitRes.status === "fulfilled") setProfitRow(profitRes.value);
        if (payRes.status === "fulfilled") setPay(payRes.value);
        if (collectionsRes.status === "fulfilled") setCollections(collectionsRes.value);
        if (expenseBreakdownRes.status === "fulfilled") setExpenseByChannel(expenseBreakdownRes.value);

        const firstErr =
          (salesRes.status === "rejected" && salesRes.reason) ||
          (expenseRes.status === "rejected" && expenseRes.reason) ||
          (profitRes.status === "rejected" && profitRes.reason) ||
          (payRes.status === "rejected" && payRes.reason) ||
          (collectionsRes.status === "rejected" && collectionsRes.reason) ||
          (expenseBreakdownRes.status === "rejected" && expenseBreakdownRes.reason) ||
          null;

        if (firstErr) {
          setErr(firstErr?.message ?? "Failed to load some finance data");
        }
      } catch (e: any) {
        if (rid !== reqIdRef.current) return;
        setErr(e?.message ?? "Failed to load finance");
      } finally {
        if (!silent && rid === reqIdRef.current) setLoading(false);
      }
    },
    [
      orgId,
      storeId,
      range,
      callSalesForStore,
      callExpenseForStore,
      callProfitOwnerOnly,
      callPaymentBreakdown,
      callCreditCollections,
      callExpenseBreakdown,
    ]
  );

  useEffect(() => {
    void load();
  }, [orgId, storeId, load]);

  useFocusEffect(
    useCallback(() => {
      if (!orgId || !storeId) return;
      void load({ silent: true });
    }, [orgId, storeId, load])
  );

  useAutoRefresh(() => {
    if (!orgId || !storeId) return;
    void load({ silent: true });
  }, !!orgId && !!storeId, AUTO_REFRESH_MS);

  const body = useMemo(() => {
    const fmtMoney = (n: number) =>
      formatMoney(n, { currency: displayCurrency, locale: displayLocale }).replace(/\s+/g, " ");

    const totalSales = fmtMoney(salesRow.total);
    const totalExpenses = fmtMoney(expRow.total);
    const netProfit = isOwner ? fmtMoney(profitRow.net) : "—";

    const orders = String(salesRow.orders ?? 0);
    const avg =
      salesRow.orders > 0 ? fmtMoney(salesRow.total / Math.max(1, salesRow.orders)) : "—";

    const availableCashNum = subtractFloor(pay.cash + collections.cash, expenseByChannel.cash);
    const availableBankNum = subtractFloor(pay.bank + collections.bank, expenseByChannel.bank);
    const availableMobileNum = subtractFloor(
      pay.mobile + collections.mobile,
      expenseByChannel.mobile
    );

    const totalMoneyInNum = availableCashNum + availableBankNum + availableMobileNum;
    const totalMoneyIn = fmtMoney(totalMoneyInNum);

    return (
      <View style={{ gap: 10, paddingTop: 2 }}>
        <View style={{ flexDirection: "row", gap: 12 }}>
          <MiniStat label="Sales" value={totalSales} hint="today" />
          <MiniStat label="Expenses" value={totalExpenses} hint="today" />
          <MiniStat label="Net Profit" value={netProfit} hint={isOwner ? "after expenses" : "owner-only"} />
        </View>

        <View style={{ flexDirection: "row", gap: 12 }}>
          <MiniStat label="Orders" value={orders} />
          <MiniStat label="Avg/Order" value={avg.toString().replace(/\s+/g, " ")} />
          <MiniStat label="Money In" value={totalMoneyIn} hint="after expenses" />
        </View>
      </View>
    );
  }, [
    salesRow,
    expRow,
    profitRow,
    pay,
    collections,
    expenseByChannel,
    displayCurrency,
    displayLocale,
    isOwner,
  ]);

  return (
    <PremiumMetricCard
      title="Finance"
      subtitle={`Store: ${storeName}`}
      iconName="bar-chart-outline"
      loading={loading}
      badgeText={isOwner ? "LIVE" : "STORE"}
      error={err}
      ctaLabel="Open Finance"
      onPress={() => {
        const dates = rangeToDates("today");
        router.push({
          pathname: "/finance/history",
          params: {
            mode: "SALES",
            scope: "STORE",
            range: "today",
            from: dates.from,
            to: dates.to,
          } as any,
        } as any);
      }}
    >
      {body}
    </PremiumMetricCard>
  );
}

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

  const range: RangeKey = "today";

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
  }, [storeId, load]);

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
    <PremiumMetricCard
      title="Club Revenue"
      subtitle={`Store: ${storeName}`}
      iconName="pulse-outline"
      loading={loading}
      badgeText="LIVE"
      error={err}
      ctaLabel="Open Club Revenue"
      onPress={onOpen}
    >
      <View style={{ flexDirection: "row", gap: 12, paddingTop: 2 }}>
        <MiniStat label="Revenue" value={revenue} />
        <MiniStat label="Paid" value={paid} />
        <MiniStat label="Orders" value={String(row?.delivered_orders ?? 0)} hint="delivered" />
      </View>
    </PremiumMetricCard>
  );
}

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

  const range: RangeKey = "today";

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
  }, [orgId, storeId, load]);

  useAutoRefresh(() => {
    if (!orgId || !storeId) return;
    void load();
  }, !!orgId && !!storeId, AUTO_REFRESH_MS);

  const onHand = formatMoney(toNum(row?.stock_on_hand_value), {
    currency: displayCurrency,
    locale: displayLocale,
  }).replace(/\s+/g, " ");
  const stockIn = formatMoney(toNum(row?.stock_in_value), {
    currency: displayCurrency,
    locale: displayLocale,
  }).replace(/\s+/g, " ");

  return (
    <PremiumMetricCard
      title="Stock Value"
      subtitle={`Store: ${storeName}`}
      iconName="cube-outline"
      loading={loading}
      badgeText="INVENTORY"
      error={err}
      ctaLabel="Open Stock History"
      onPress={() => router.push("/stocks/history")}
      footerRight={
        <Text style={{ color: UI.faint, fontWeight: "900", fontSize: 12 }}>
          {loading ? "..." : STOCK_IN_VERSION_BADGE}
        </Text>
      }
    >
      <View style={{ flexDirection: "row", gap: 12, paddingTop: 2 }}>
        <MiniStat label="On Hand Value" value={onHand} hint="current stock" />
        <MiniStat label="Stock In Value" value={stockIn} hint="received (+)" />
      </View>
    </PremiumMetricCard>
  );
}

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
    <View style={{ paddingTop: 14 }}>
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

function CashierQuickHome() {
  const router = useRouter();
  const { refreshing, refresh, activeOrgName, activeRole, activeStoreName } = useOrg();

  const [handoffCount, setHandoffCount] = useState<number>(0);
  const [handoffLoading, setHandoffLoading] = useState(false);
  const [handoffError, setHandoffError] = useState<string | null>(null);

  const loadCashierQueue = useCallback(async () => {
    setHandoffLoading(true);
    setHandoffError(null);

    try {
      const { data, error } = await supabase.rpc("get_my_cashier_handoffs_v2", {
        p_status: "PENDING",
      } as any);

      if (error) throw error;

      const rows = Array.isArray(data) ? data : [];
      setHandoffCount(rows.length);
    } catch (e: any) {
      setHandoffCount(0);
      setHandoffError(e?.message ?? "Failed to load cashier queue");
    } finally {
      setHandoffLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCashierQueue();
  }, [loadCashierQueue]);

  useAutoRefresh(() => {
    void loadCashierQueue();
  }, true, AUTO_REFRESH_MS);

  const onRefreshAll = useCallback(async () => {
    await refresh();
    await loadCashierQueue();
  }, [refresh, loadCashierQueue]);

  return (
    <Card style={{ gap: 12, marginTop: 14 }}>
      <Text style={{ color: UI.muted, fontWeight: "800" }}>
        Cashier Workspace (depends on active org/workspace)
      </Text>

      <Text style={{ color: UI.faint, fontWeight: "800" }}>
        Organization: <Text style={{ color: UI.text, fontWeight: "900" }}>{activeOrgName ?? "—"}</Text>
      </Text>

      <Text style={{ color: UI.faint, fontWeight: "800" }}>
        Role: <Text style={{ color: UI.text, fontWeight: "900" }}>{activeRole ?? "—"}</Text>
      </Text>

      <Text style={{ color: UI.faint, fontWeight: "800" }}>
        Active Store: <Text style={{ color: UI.text, fontWeight: "900" }}>{activeStoreName ?? "—"}</Text>
      </Text>

      {!!handoffError && (
        <Card
          style={{
            borderColor: "rgba(201,74,74,0.35)",
            backgroundColor: "rgba(201,74,74,0.10)",
            borderRadius: 18,
            padding: 12,
          }}
        >
          <Text style={{ color: UI.danger, fontWeight: "900" }}>{handoffError}</Text>
        </Card>
      )}

      <Card
        style={{
          borderColor: UI.emeraldBorder,
          backgroundColor: UI.emeraldSoft,
          gap: 8,
        }}
      >
        <Text style={{ color: UI.text, fontWeight: "900", fontSize: 16 }}>
          Pending Cashier Orders
        </Text>

        <Text style={{ color: UI.text, fontWeight: "900", fontSize: 28 }}>
          {handoffLoading ? "..." : String(handoffCount)}
        </Text>

        <Text style={{ color: UI.muted, fontWeight: "800" }}>
          Hizi ni order zilizotumwa kwenye cashier queue yako.
        </Text>
      </Card>

      <Pressable
        onPress={onRefreshAll}
        disabled={refreshing || handoffLoading}
        style={({ pressed }) => ({
          borderRadius: 18,
          borderWidth: 1,
          borderColor: "rgba(16,185,129,0.30)",
          backgroundColor: "rgba(16,185,129,0.12)",
          paddingVertical: 15,
          paddingHorizontal: 16,
          alignItems: "center",
          justifyContent: "center",
          opacity: pressed || refreshing || handoffLoading ? 0.92 : 1,
        })}
      >
        <Text style={{ color: UI.text, fontWeight: "900", fontSize: 15 }}>
          {refreshing || handoffLoading ? "Refreshing..." : "Refresh Workspace"}
        </Text>
      </Pressable>

      <Pressable
        onPress={() => router.push("/(tabs)/sales")}
        style={({ pressed }) => ({
          borderRadius: 18,
          borderWidth: 1,
          borderColor: "rgba(16,185,129,0.30)",
          backgroundColor: "rgba(16,185,129,0.12)",
          paddingVertical: 15,
          paddingHorizontal: 16,
          alignItems: "center",
          justifyContent: "center",
          opacity: pressed ? 0.92 : 1,
        })}
      >
        <Text style={{ color: UI.text, fontWeight: "900", fontSize: 15 }}>Open Sales</Text>
      </Pressable>
    </Card>
  );
}

function WorkspaceCard({
  activeOrgName,
  activeRole,
  activeStoreName,
  activeStoreId,
  onOpen,
}: {
  activeOrgName?: string | null;
  activeRole?: string | null;
  activeStoreName?: string | null;
  activeStoreId?: string | null;
  onOpen: () => void;
}) {
  const roleLabel = String(activeRole ?? "—").trim() || "—";
  const orgLabel = String(activeOrgName ?? "—").trim() || "—";
  const storeLabel = String(activeStoreName ?? "—").trim() || "—";

  return (
    <View style={{ marginTop: 14 }}>
      <Card
        style={{
          gap: 14,
          borderRadius: 22,
          borderColor: "rgba(16,185,129,0.22)",
          backgroundColor: "rgba(15,18,24,0.98)",
          overflow: "hidden",
        }}
      >
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            top: -70,
            right: -50,
            width: 180,
            height: 180,
            borderRadius: 999,
            backgroundColor: "rgba(16,185,129,0.08)",
          }}
        />

        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            left: -50,
            bottom: -80,
            width: 180,
            height: 180,
            borderRadius: 999,
            backgroundColor: "rgba(34,211,238,0.04)",
          }}
        />

        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <View
            style={{
              width: 48,
              height: 48,
              borderRadius: 16,
              alignItems: "center",
              justifyContent: "center",
              borderWidth: 1,
              borderColor: "rgba(16,185,129,0.28)",
              backgroundColor: "rgba(16,185,129,0.12)",
            }}
          >
            <Ionicons name="business-outline" size={20} color={UI.emerald} />
          </View>

          <View style={{ flex: 1, minWidth: 0 }}>
            <Text
              style={{
                color: UI.faint,
                fontWeight: "900",
                fontSize: 10,
                letterSpacing: 0.9,
              }}
            >
              CURRENT WORKSPACE
            </Text>

            <Text
              style={{ color: UI.text, fontWeight: "900", fontSize: 20, marginTop: 4 }}
              numberOfLines={1}
            >
              {orgLabel}
            </Text>
          </View>

          <View
            style={{
              paddingHorizontal: 10,
              paddingVertical: 6,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: "rgba(16,185,129,0.24)",
              backgroundColor: "rgba(16,185,129,0.10)",
            }}
          >
            <Text style={{ color: UI.text, fontWeight: "900", fontSize: 11 }}>
              {roleLabel.toUpperCase()}
            </Text>
          </View>
        </View>

        <View style={{ flexDirection: "row", gap: 10 }}>
          <MiniStat label="Organization" value={orgLabel} />
          <MiniStat label="Role" value={roleLabel} />
          <MiniStat
            label="Active Store"
            value={storeLabel}
            hint={activeStoreId ? "live context" : "not selected"}
          />
        </View>

        {!activeStoreId ? (
          <Text style={{ color: UI.muted, fontWeight: "800" }}>
            Hujachagua active store bado. Fungua workspace switcher uchague context sahihi ya kazi.
          </Text>
        ) : null}

        <Pressable
          onPress={onOpen}
          hitSlop={10}
          style={({ pressed }) => ({
            borderRadius: 18,
            borderWidth: 1,
            borderColor: "rgba(16,185,129,0.30)",
            backgroundColor: "rgba(16,185,129,0.12)",
            paddingVertical: 15,
            paddingHorizontal: 16,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 10,
            opacity: pressed ? 0.92 : 1,
          })}
        >
          <Ionicons name="swap-horizontal" size={18} color={UI.text} />
          <Text style={{ color: UI.text, fontWeight: "900", fontSize: 15 }}>Switch Org / Workspace</Text>
        </Pressable>
      </Card>
    </View>
  );
}

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const { refreshing, error, refresh, activeOrgName, activeRole, activeStoreName, activeStoreId } =
    useOrg();

  const [dashTick, setDashTick] = useState(0);
  const [pulling, setPulling] = useState(false);

  const goOrgSwitcher = useCallback(() => {
    router.push("/org-switcher");
  }, [router]);

  const goClubRevenue = useCallback(() => {
    router.push("/club-revenue");
  }, [router]);

  const goAI = useCallback(() => {
    router.push("/ai");
  }, [router]);

  const bottomPad = useMemo(() => Math.max(insets.bottom, 8) + 14, [insets.bottom]);
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

  const isCashier = String(activeRole ?? "").trim().toLowerCase() === "cashier";

  return (
    <Screen
      scroll
      refreshControl={
        <RefreshControl
          refreshing={pulling || refreshing}
          onRefresh={onPullRefresh}
          tintColor={UI.text}
        />
      }
      contentStyle={{
        paddingTop: topPad,
        paddingHorizontal: 16,
        paddingBottom: bottomPad,
      }}
    >
      <HeaderHero
        activeOrgName={activeOrgName}
        activeStoreName={activeStoreName}
        isCashier={isCashier}
      />

      {!isCashier ? <ZetraAiCard onOpen={goAI} /> : null}
      {!isCashier ? <CompactNotificationsHomeCard /> : null}

      {!!error && (
        <Card
          style={{
            borderColor: "rgba(201,74,74,0.35)",
            backgroundColor: "rgba(201,74,74,0.10)",
            borderRadius: 18,
            padding: 12,
            marginTop: 14,
          }}
        >
          <Text style={{ color: UI.danger, fontWeight: "900" }}>{error}</Text>
        </Card>
      )}

      <WorkspaceCard
        activeOrgName={activeOrgName}
        activeRole={activeRole}
        activeStoreName={activeStoreName}
        activeStoreId={activeStoreId}
        onOpen={goOrgSwitcher}
      />

      {isCashier ? (
        <CashierQuickHome />
      ) : (
        <StoreGuard>
          <CompactFinanceCardHomePreview />
          <CompactStockValueCardHomePreview />
          <CompactClubRevenueCardHomePreview key={`club-mini-${dashTick}`} onOpen={goClubRevenue} />
        </StoreGuard>
      )}
    </Screen>
  );
}