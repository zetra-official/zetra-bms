// app/(tabs)/index.tsx
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Animated,
  AppState,
  Platform,
  Pressable,
  RefreshControl,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNetInfo } from "@react-native-community/netinfo";
import { syncSalesQueueOnce } from "../../src/offline/salesSync";

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

type CapitalRecoverySummaryRow = {
  total_asset: number;
  total_cost: number;
  total_income: number;
  remaining_cost: number;
  remaining_asset: number;
  realized_profit: number;
  entries_count: number;
  last_entry_at: string | null;
};

type CapitalRecoveryHistoryRow = {
  id: string;
  entry_type: "ASSET" | "COST" | "INCOME";
  amount: number;
  note: string | null;
  created_at: string;
  created_by?: string | null;
};

type CapitalRecoveryTodayReport = {
  asset: number;
  cost: number;
  income: number;
  net: number;
};

const AUTO_REFRESH_MS = 20_000;

const HOME_CARD_TEXT = "#FFFFFF";
const HOME_CARD_MUTED = "rgba(255,255,255,0.78)";
const HOME_CARD_FAINT = "rgba(255,255,255,0.58)";

const HOME_CARD_BG = "#0F3D5E";
const HOME_CARD_ALT_BG = "#064E3B";
const HOME_CARD_AI_BG = "#3B1D78";
const HOME_CARD_BORDER = "rgba(255,255,255,0.18)";
const HOME_CARD_BORDER_STRONG = "rgba(255,255,255,0.26)";
const HOME_CARD_SOFT_BLUE = "rgba(255,255,255,0.12)";
const HOME_CARD_SOFT_EMERALD = "rgba(255,255,255,0.14)";

const HOME_PALETTE = {
  finance: {
    bg: "#0B5CAD",
    border: "rgba(147,197,253,0.44)",
    soft: "rgba(255,255,255,0.13)",
    accent: "#BFDBFE",
  },
  stock: {
    bg: "#0F766E",
    border: "rgba(153,246,228,0.42)",
    soft: "rgba(255,255,255,0.13)",
    accent: "#99F6E4",
  },
  notification: {
    bg: "#0B5CAD",
    border: "rgba(147,197,253,0.44)",
    soft: "rgba(255,255,255,0.13)",
    accent: "#BFDBFE",
  },
  ai: {
    bg: "#0F766E",
    border: "rgba(153,246,228,0.42)",
    soft: "rgba(255,255,255,0.13)",
    accent: "#99F6E4",
  },
  club: {
    bg: "#92400E",
    border: "rgba(253,186,116,0.44)",
    soft: "rgba(255,255,255,0.13)",
    accent: "#FDBA74",
  },
  workspace: {
    bg: "#1E3A8A",
    border: "rgba(191,219,254,0.44)",
    soft: "rgba(255,255,255,0.13)",
    accent: "#BFDBFE",
  },
} as const;

const HomeCardToneContext = React.createContext({
  text: UI.text,
  muted: UI.muted,
  faint: UI.faint,
});

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

function isDesktopWebEnv(_width?: number) {
  if (Platform.OS !== "web") return false;

  // MOBILE-FORCE FIX:
  // Kwenye browser tunalazimisha Home isome kama mobile UI
  // ili kuepuka desktop/web fallback rendering inayosababisha vibox.
  return false;
}

function isMobileWebEnv(width?: number) {
  return Platform.OS === "web" && !isDesktopWebEnv(width);
}

function webIconFallback(name: keyof typeof Ionicons.glyphMap) {
  switch (name) {
    case "storefront-outline":
      return "S";
    case "ellipsis-horizontal":
      return "...";
    case "heart":
      return "♥";
    case "heart-outline":
      return "♡";
    case "chatbubble-outline":
      return "C";
    case "paper-plane-outline":
      return ">";
    case "bookmark":
      return "B";
    case "bookmark-outline":
      return "B";
    case "add":
      return "+";
    case "person-circle-outline":
      return "P";
    case "speedometer-outline":
      return "O";
    case "refresh":
      return "R";
    case "hourglass-outline":
      return "...";
    case "chevron-down":
      return "v";
    default:
      return "•";
  }
}

function SafeIcon({
  name,
  size = 18,
  color,
}: {
  name: keyof typeof Ionicons.glyphMap;
  size?: number;
  color: string;
}) {
  if (Platform.OS === "web") {
    const label = webIconFallback(name);

    return (
      <View
        style={{
          minWidth: size + 10,
          height: size + 10,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text
          style={{
            color,
            fontSize: Math.max(12, size - 2),
            lineHeight: Math.max(14, size),
            fontWeight: "900",
            textAlign: "center",
            includeFontPadding: false,
          }}
          numberOfLines={1}
        >
          {label}
        </Text>
      </View>
    );
  }

  return <Ionicons name={name} size={size} color={color} />;
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
  const tone = React.useContext(HomeCardToneContext);

  return (
    <View style={{ flex: 1, gap: 4, minWidth: 0 }}>
      <Text
        style={{ color: tone.muted, fontWeight: "800", fontSize: 12 }}
        numberOfLines={1}
        ellipsizeMode="tail"
      >
        {label}
      </Text>

      <Text
        style={{ color: tone.text, fontWeight: "900", fontSize: 16, lineHeight: 20 }}
        numberOfLines={multilineValue ? 2 : 1}
        adjustsFontSizeToFit={!multilineValue}
        minimumFontScale={0.75}
        allowFontScaling={false}
      >
        {value}
      </Text>

      {!!hint && (
        <Text
         style={{ color: tone.faint, fontWeight: "800", fontSize: 12 }}
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
    // ✅ WEB HOTFIX:
    // Browser static export imekuwa ikipata request-storm / page freeze.
    // Auto refresh ibaki MOBILE only.
    if (!enabled || Platform.OS === "web") return;

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
            borderColor: "rgba(79,140,255,0.22)",
            backgroundColor: "transparent",
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
  mobileWebLite = false,
  tone = "finance",
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
  mobileWebLite?: boolean;
  tone?: keyof typeof HOME_PALETTE;
}) {
  const p = HOME_PALETTE[tone];

  return (
    <View style={{ paddingTop: 14 }}>
      <View
        style={{
          gap: 14,
          borderRadius: 22,
          borderWidth: 1,
          borderColor: p.border,
          backgroundColor: p.bg,
          overflow: "hidden",
          padding: 16,
        }}
      >
        

        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: 0,
            height: 1,
            backgroundColor: UI.borderSoft,
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
              borderColor: "rgba(79,140,255,0.32)",
              backgroundColor: p.soft,
            }}
          >
            <SafeIcon
  name={loading ? "ellipsis-horizontal" : iconName}
  size={20}
  color={p.accent}
/>
          </View>

          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ color: HOME_CARD_TEXT, fontWeight: "900", fontSize: 16 }} numberOfLines={1}>
              {title}
            </Text>
            <Text style={{ color: HOME_CARD_MUTED, fontWeight: "800", marginTop: 2 }} numberOfLines={1}>
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
                borderColor: "rgba(79,140,255,0.28)",
                backgroundColor: "rgba(79,140,255,0.10)",
              }}
            >
              <Text style={{ color: HOME_CARD_TEXT, fontWeight: "900", fontSize: 11 }}>{badgeText}</Text>
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

        <HomeCardToneContext.Provider
          value={{
            text: HOME_CARD_TEXT,
            muted: HOME_CARD_MUTED,
            faint: HOME_CARD_FAINT,
          }}
        >
          {children}
        </HomeCardToneContext.Provider>

        <View style={{ height: 1, backgroundColor: UI.borderSoft }} />

        <Pressable
          onPress={onPress}
          // @ts-ignore - web click fallback
          onClick={onPress}
          hitSlop={10}
          style={({ pressed }) => ({
            borderRadius: 18,
            borderWidth: 1,
            borderColor: UI.primaryBorder,
            backgroundColor: p.soft,
            paddingVertical: 15,
            paddingHorizontal: 16,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 10,
            opacity: pressed ? 0.92 : 1,
          })}
        >
          <Text style={{ color: HOME_CARD_TEXT, fontWeight: "900", fontSize: 15 }}>{ctaLabel}</Text>
          {footerRight ? footerRight : <Text style={{ color: UI.faint, fontWeight: "900", fontSize: 16 }}>›</Text>}
        </Pressable>
      </View>
    </View>
  );
}

function CompactNotificationsHomeCard() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { activeStoreId, activeStoreName, stores } = useOrg();
  const isDesktopWeb = isDesktopWebEnv(width);

  if (isDesktopWeb) return null;

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
      if (isDesktopWeb) return;
      void load();
    }, [isDesktopWeb, load])
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
    const scopedStoreId = String(activeStoreId ?? "").trim();
    if (!scopedStoreId) return 0;
    return receipts.filter((r) => clean(r.store_id) === scopedStoreId && !r.is_read).length;
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
        <View
          style={{
            gap: 10,
            padding: 14,
            borderRadius: 20,
            borderWidth: 1,
            borderColor: HOME_PALETTE.notification.border,
            backgroundColor: HOME_PALETTE.notification.bg,
            overflow: "hidden",
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
                borderColor: HOME_PALETTE.notification.border,
                backgroundColor: HOME_PALETTE.notification.soft,
              }}
            >
             <SafeIcon
  name={unreadCount > 0 ? "notifications" : "notifications-outline"}
  size={18}
  color={HOME_PALETTE.notification.accent}
/>
            </View>

            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ color: HOME_CARD_TEXT, fontWeight: "900", fontSize: 16 }} numberOfLines={1}>
                Notifications
              </Text>
              <Text
                style={{ color: HOME_CARD_MUTED, fontWeight: "800", fontSize: 12, marginTop: 2 }}
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
                borderColor: HOME_PALETTE.notification.border,
                backgroundColor: HOME_PALETTE.notification.soft,
                alignItems: "center",
              }}
            >
              <Text style={{ color: HOME_CARD_TEXT, fontWeight: "900", fontSize: 11 }}>
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
              <Text style={{ color: UI.danger, fontWeight: "900", fontSize: 12 }}>
                {error}
              </Text>
            </Card>
          )}

          <View style={{ flexDirection: "row", gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: HOME_CARD_MUTED, fontWeight: "800", fontSize: 11 }}>Unread</Text>
              <Text style={{ color: HOME_CARD_TEXT, fontWeight: "900", fontSize: 18, marginTop: 2 }}>
                {unreadCount}
              </Text>
            </View>

            <View style={{ flex: 1 }}>
              <Text style={{ color: HOME_CARD_MUTED, fontWeight: "800", fontSize: 11 }}>This Store</Text>
              <Text style={{ color: HOME_CARD_TEXT, fontWeight: "900", fontSize: 18, marginTop: 2 }}>
                {activeStoreUnread}
              </Text>
              <Text
                style={{ color: HOME_CARD_FAINT, fontWeight: "800", fontSize: 11, marginTop: 2 }}
                numberOfLines={1}
              >
                {activeStoreName ?? "Active store only"}
              </Text>
            </View>

            <View style={{ flex: 1 }}>
              <Text style={{ color: HOME_CARD_MUTED, fontWeight: "800", fontSize: 11 }}>Receipts</Text>
              <Text style={{ color: HOME_CARD_TEXT, fontWeight: "900", fontSize: 18, marginTop: 2 }}>
                {receipts.length}
              </Text>
              <Text
                style={{ color: HOME_CARD_FAINT, fontWeight: "800", fontSize: 11, marginTop: 2 }}
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
            <Text style={{ color: HOME_CARD_TEXT, fontWeight: "900", fontSize: 13 }}>
              Open Notification Center
            </Text>
            <View style={{ flex: 1 }} />
            <Text style={{ color: HOME_CARD_MUTED, fontWeight: "900", fontSize: 16 }}>›</Text>
          </Pressable>
        </View>
      </Pressable>
    </View>
  );
}

function CompactFinanceCardHomePreview() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const org = useOrg();
  const isDesktopWeb = isDesktopWebEnv(width);
  const isMobileWeb = isMobileWebEnv(width);

  if (isDesktopWeb) return null;

  const orgId = String(org.activeOrgId ?? "").trim();
  const storeId = String(org.activeStoreId ?? "").trim();
  const storeName = String(org.activeStoreName ?? "Store").trim() || "Store";
  const roleLower = String(org.activeRole ?? "").trim().toLowerCase();
  const isOwner = roleLower === "owner";
  const canSeeCapitalSecrets = isOwner;
  const isOwnerOrAdmin = roleLower === "owner" || roleLower === "admin";
  const isStaffView = roleLower === "staff";

  const [staffExpenseAllowed, setStaffExpenseAllowed] = useState(false);
  const [staffExpenseLoading, setStaffExpenseLoading] = useState(false);

  const money = useOrgMoneyPrefs(orgId);

  useFocusEffect(
    useCallback(() => {
      void money.refresh();
    }, [money])
  );

  const loadStaffExpensePermission = useCallback(async () => {
    if (!storeId || !isStaffView) {
      setStaffExpenseAllowed(false);
      setStaffExpenseLoading(false);
      return;
    }

    setStaffExpenseLoading(true);

    try {
      const { data, error } = await supabase
        .from("stores")
        .select("staff_can_manage_expense")
        .eq("id", storeId)
        .maybeSingle();

      if (error) throw error;
      setStaffExpenseAllowed(!!data?.staff_can_manage_expense);
    } catch {
      try {
        const { data, error } = await supabase
          .from("stores")
          .select("allow_staff_expense")
          .eq("id", storeId)
          .maybeSingle();

        if (error) throw error;
        setStaffExpenseAllowed(!!data?.allow_staff_expense);
      } catch {
        setStaffExpenseAllowed(false);
      }
    } finally {
      setStaffExpenseLoading(false);
    }
  }, [storeId, isStaffView]);

  useEffect(() => {
    void loadStaffExpensePermission();
  }, [loadStaffExpensePermission]);

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

  const canStaffSeeExpenseFinance = isStaffView && staffExpenseAllowed;

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
      const fnName = "get_expense_summary_v2";

      const { data, error } = await supabase.rpc(fnName, {
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
    [isStaffView, canStaffSeeExpenseFinance]
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
      const { data, error } = await supabase.rpc("get_expense_channel_summary_v2", {
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

      // ✅ reset preview state before each fresh load
      // this prevents stale profit/sales/expenses from a previous successful request
      setSalesRow({
        total: 0,
        orders: 0,
        currency: "TZS",
      });

      setExpRow({
        total: 0,
        count: 0,
      });

      setProfitRow({
        net: 0,
        sales: null,
        expenses: null,
      });

      setPay({
        cash: 0,
        bank: 0,
        mobile: 0,
        credit: 0,
        other: 0,
        orders: 0,
      });

      setCollections({
        cash: 0,
        bank: 0,
        mobile: 0,
        other: 0,
        total: 0,
        payments: 0,
      });

      setExpenseByChannel({
        cash: 0,
        bank: 0,
        mobile: 0,
      });

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

        if (salesRes.status === "fulfilled") {
          setSalesRow(salesRes.value);
        } else {
          setSalesRow({
            total: 0,
            orders: 0,
            currency: "TZS",
          });
        }

        if (expenseRes.status === "fulfilled") {
          setExpRow(expenseRes.value);
        } else {
          setExpRow({
            total: 0,
            count: 0,
          });
        }

        if (profitRes.status === "fulfilled") {
          setProfitRow(profitRes.value);
        } else {
          setProfitRow({
            net: 0,
            sales: null,
            expenses: null,
          });
        }

        if (payRes.status === "fulfilled") {
          setPay(payRes.value);
        } else {
          setPay({
            cash: 0,
            bank: 0,
            mobile: 0,
            credit: 0,
            other: 0,
            orders: 0,
          });
        }

        if (collectionsRes.status === "fulfilled") {
          setCollections(collectionsRes.value);
        } else {
          setCollections({
            cash: 0,
            bank: 0,
            mobile: 0,
            other: 0,
            total: 0,
            payments: 0,
          });
        }

        if (expenseBreakdownRes.status === "fulfilled") {
          setExpenseByChannel(expenseBreakdownRes.value);
        } else {
          setExpenseByChannel({
            cash: 0,
            bank: 0,
            mobile: 0,
          });
        }

        const firstErr =
          (salesRes.status === "rejected" && salesRes.reason) ||
          (expenseRes.status === "rejected" && expenseRes.reason) ||
          (profitRes.status === "rejected" && profitRes.reason) ||
          (collectionsRes.status === "rejected" && collectionsRes.reason) ||
          (expenseBreakdownRes.status === "rejected" && expenseBreakdownRes.reason) ||
          null;

        if (firstErr) {
          const msg = firstErr?.message ?? "Failed to load some finance data";

          if (isStaffView && canStaffSeeExpenseFinance) {
            if (/owner\/admin only|no access|not allowed/i.test(String(msg))) {
              setErr(null);
            } else {
              setErr(msg);
            }
          } else {
            setErr(msg);
          }
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
      if (isDesktopWeb) return;
      if (!orgId || !storeId) return;
      void load();
    }, [isDesktopWeb, orgId, storeId, load])
  );

  useFocusEffect(
    useCallback(() => {
      if (isDesktopWeb) return;
      if (!orgId || !storeId) return;
      void load({ silent: true });
    }, [isDesktopWeb, orgId, storeId, load])
  );
  useAutoRefresh(() => {
    if (!orgId || !storeId) return;
    void load({ silent: true });
  }, !!orgId && !!storeId, AUTO_REFRESH_MS);

  const financeTitle = isStaffView
    ? canStaffSeeExpenseFinance
      ? "Finance"
      : "Sales Summary"
    : "Finance";

  const financeSubtitle = `Store: ${storeName}`;

  const financeCtaLabel = isStaffView
    ? canStaffSeeExpenseFinance
      ? "Open Expenses"
      : "Open Sales Summary"
    : "Open Finance";

  const financeError =
    isStaffView
      ? canStaffSeeExpenseFinance
        ? null
        : null
      : err;

  const body = useMemo(() => {
    const fmtMoney = (n: number) =>
      formatMoney(n, { currency: displayCurrency, locale: displayLocale }).replace(/\s+/g, " ");

    const expenseBreakdownTotal =
      toNum(expenseByChannel.cash) +
      toNum(expenseByChannel.bank) +
      toNum(expenseByChannel.mobile);

    const effectiveExpenseTotal =
      isStaffView && canStaffSeeExpenseFinance
        ? Math.max(toNum(expRow.total), expenseBreakdownTotal)
        : toNum(expRow.total);

    const totalSales = fmtMoney(salesRow.total);
    const totalExpenses = fmtMoney(effectiveExpenseTotal);
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

    const rowStyle = isMobileWeb
      ? ({ flexDirection: "row", flexWrap: "wrap", gap: 12 } as const)
      : ({ flexDirection: "row", gap: 12 } as const);

    const cellStyle = isMobileWeb
      ? ({ flexBasis: "47%" } as const)
      : ({ flex: 1 } as const);

    return (
      <View style={{ gap: 10, paddingTop: 2 }}>
        {isStaffView ? (
          canStaffSeeExpenseFinance ? (
            <>
              <View style={rowStyle}>
                <View style={cellStyle}>
                  <MiniStat
                    label="Sales"
                    value={totalSales}
                    hint="today"
                    multilineValue={isMobileWeb}
                  />
                </View>
                <View style={cellStyle}>
                  <MiniStat
                    label="Expenses"
                    value={totalExpenses}
                    hint="today"
                    multilineValue={isMobileWeb}
                  />
                </View>
                <View style={cellStyle}>
                  <MiniStat
                    label="Money In"
                    value={totalMoneyIn}
                    hint="after expenses"
                    multilineValue={isMobileWeb}
                  />
                </View>
              </View>

              <View style={rowStyle}>
                <View style={cellStyle}>
                  <MiniStat label="Orders" value={orders} hint="completed" />
                </View>
                <View style={cellStyle}>
                  <MiniStat
                    label="Avg/Order"
                    value={avg.toString().replace(/\s+/g, " ")}
                    multilineValue={isMobileWeb}
                  />
                </View>
                <View style={cellStyle}>
                  <MiniStat label="Access" value="Expense Enabled" hint="staff finance view" />
                </View>
              </View>
            </>
          ) : (
            <>
              <View style={rowStyle}>
                <View style={cellStyle}>
                  <MiniStat
                    label="Sales"
                    value={totalSales}
                    hint="today"
                    multilineValue={isMobileWeb}
                  />
                </View>
                <View style={cellStyle}>
                  <MiniStat
                    label="Money In"
                    value={totalMoneyIn}
                    hint="today"
                    multilineValue={isMobileWeb}
                  />
                </View>
                <View style={cellStyle}>
                  <MiniStat label="Orders" value={orders} hint="completed" />
                </View>
              </View>

              <View style={rowStyle}>
                <View style={cellStyle}>
                  <MiniStat
                    label="Avg/Order"
                    value={avg.toString().replace(/\s+/g, " ")}
                    multilineValue={isMobileWeb}
                  />
                </View>
                <View style={cellStyle}>
                  <MiniStat label="Store View" value="Active" hint="sales summary" />
                </View>
                <View style={cellStyle}>
                  <MiniStat label="Access" value="Standard" hint="staff view" />
                </View>
              </View>
            </>
          )
        ) : (
          <>
            <View style={rowStyle}>
              <View style={cellStyle}>
                <MiniStat
                  label="Sales"
                  value={totalSales}
                  hint="today"
                  multilineValue={isMobileWeb}
                />
              </View>
              <View style={cellStyle}>
                <MiniStat
                  label="Expenses"
                  value={totalExpenses}
                  hint="today"
                  multilineValue={isMobileWeb}
                />
              </View>
              <View style={cellStyle}>
                <MiniStat
                  label="Net Profit"
                  value={netProfit}
                  hint={isOwner ? "after expenses" : "owner-only"}
                  multilineValue={isMobileWeb}
                />
              </View>
            </View>

            <View style={rowStyle}>
              <View style={cellStyle}>
                <MiniStat label="Orders" value={orders} />
              </View>
              <View style={cellStyle}>
                <MiniStat
                  label="Avg/Order"
                  value={avg.toString().replace(/\s+/g, " ")}
                  multilineValue={isMobileWeb}
                />
              </View>
              <View style={cellStyle}>
                <MiniStat
                  label="Money In"
                  value={totalMoneyIn}
                  hint="after expenses"
                  multilineValue={isMobileWeb}
                />
              </View>
            </View>
          </>
        )}
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
    isStaffView,
    canStaffSeeExpenseFinance,
    isMobileWeb,
  ]);

  return (
   <PremiumMetricCard
      title={financeTitle}
      subtitle={financeSubtitle}
      iconName="bar-chart-outline"
      loading={loading || staffExpenseLoading}
      badgeText={
        isOwnerOrAdmin
          ? "LIVE"
          : canStaffSeeExpenseFinance
          ? "EXPENSE"
          : "STORE"
      }
      error={financeError}
      ctaLabel={financeCtaLabel}
      mobileWebLite={isMobileWeb}
      tone="finance"
      onPress={() => {
        if (isStaffView) {
          if (canStaffSeeExpenseFinance) {
            router.push("/(tabs)/sales/expenses" as any);
            return;
          }

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
          return;
        }

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
  const { width } = useWindowDimensions();
  const orgAny = useOrg() as any;
  const isDesktopWeb = isDesktopWebEnv(width);
  const isMobileWeb = isMobileWebEnv(width);

  if (isDesktopWeb) return null;

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

  useFocusEffect(
    useCallback(() => {
      if (isDesktopWeb) return;
      if (!storeId) return;
      void load();
    }, [isDesktopWeb, storeId, load])
  );

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
      mobileWebLite={isMobileWeb}
      tone="club"
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
  const { width } = useWindowDimensions();
  const orgAny = useOrg() as any;
  const isDesktopWeb = isDesktopWebEnv(width);
  const isMobileWeb = isMobileWebEnv(width);

  if (isDesktopWeb) return null;

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
        stock_on_hand_value:onVal,
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

  useFocusEffect(
    useCallback(() => {
      if (isDesktopWeb) return;
      if (!orgId || !storeId) return;
      void load();
    }, [isDesktopWeb, orgId, storeId, load])
  );

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
      mobileWebLite={isMobileWeb}
      tone="stock"
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
  const { width } = useWindowDimensions();
  const isDesktopWeb = isDesktopWebEnv(width);
  const isMobileWeb = isMobileWebEnv(width);

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
    if (Platform.OS === "web") return;

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
  }, [isDesktopWeb, tips.length]);

  useEffect(() => {
    if (Platform.OS === "web") {
      fade.setValue(1);
      return;
    }

    fade.setValue(0);
    Animated.timing(fade, { toValue: 1, duration: 260, useNativeDriver: true }).start();
  }, [fade, i, isDesktopWeb]);

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
          borderColor: primary ? "rgba(79,140,255,0.34)" : "rgba(255,255,255,0.12)",
          backgroundColor: primary ? "rgba(79,140,255,0.14)" : "rgba(255,255,255,0.06)",
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
        <View
          style={{
            padding: 0,
            overflow: "hidden",
            borderRadius: 22,
            borderWidth: 1,
            borderColor: HOME_PALETTE.ai.border,
            backgroundColor: HOME_PALETTE.ai.bg,
          }}
        >
          <View style={{ position: "relative" }}>
            
            <View
              pointerEvents="none"
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                top: 0,
                height: 1,
                backgroundColor: UI.borderSoft,
              }}
            />

            <View style={{ padding: 14, gap: 10 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                <View style={{ position: "relative" }}>
                  
                  <View
                    style={{
                     width: 42,
height: 38,
                      borderRadius: 999,
                      borderWidth: 1,
                      borderColor: "rgba(16,185,129,0.36)",
                      backgroundColor: "rgba(79,140,255,0.14)",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Text style={{ color: HOME_CARD_TEXT, fontWeight: "900", fontSize: 14 }}>AI</Text>
                  </View>
                  
                </View>

                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ color: HOME_CARD_TEXT, fontWeight: "900", fontSize: 16 }} numberOfLines={1}>
                    ZETRA AI
                  </Text>
                  <Text style={{ color: HOME_CARD_MUTED, fontWeight: "800", marginTop: 3 }} numberOfLines={1}>
                    Business Intelligence Engine
                  </Text>
                </View>

                <View
                  style={{
                    paddingHorizontal: 10,
                    paddingVertical: 6,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: "rgba(79,140,255,0.26)",
                    backgroundColor: "rgba(79,140,255,0.10)",
                  }}
                >
                  <Text style={{ color: HOME_CARD_TEXT, fontWeight: "900", fontSize: 11, letterSpacing: 0.3 }}>
                    LIVE • COPILOT
                  </Text>
                </View>
              </View>

              <View style={{ height: 1, backgroundColor: UI.borderSoft, marginVertical: -2 }} />

              <View style={{ gap: 6 }}>
                <Text style={{ color: HOME_CARD_FAINT, fontWeight: "900", fontSize: 12, letterSpacing: 0.4 }}>
                  SMART INSIGHT
                </Text>

              <Animated.Text
  style={{ opacity: fade, color: HOME_CARD_TEXT, fontWeight: "900", fontSize: 13, lineHeight: 18 }}
  numberOfLines={1}
>
              
                  {preview}
                </Animated.Text>

                <Text style={{ color: HOME_CARD_MUTED, fontWeight: "800" }} numberOfLines={1}>
                  SW/EN auto • mwongozo wa kutumia ZETRA BMS • maamuzi ya biashara
                </Text>
              </View>

              <View style={{ flexDirection: "row", gap: 10, paddingTop: 2 }}>
                <CtaButton title="Ask AI" kind="primary" onPress={onOpen} />
                <CtaButton title="View Insights" kind="ghost" onPress={onOpen} />
              </View>

        <Text style={{ color: HOME_CARD_FAINT, fontWeight: "800", fontSize: 11 }} numberOfLines={1}>
  Smart tips • Business guidance • Fast decisions
</Text>
            </View>
          </View>
        </View>
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
          borderColor: UI.primaryBorder,
          backgroundColor: UI.primarySoft,
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
          borderColor: UI.primaryBorder,
          backgroundColor: UI.primarySoft,
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
  const { width } = useWindowDimensions();
  const isMobileWeb = isMobileWebEnv(width);
  const roleLabel = String(activeRole ?? "—").trim() || "—";
  const orgLabel = String(activeOrgName ?? "—").trim() || "—";
  const storeLabel = String(activeStoreName ?? "—").trim() || "—";

  return (
    <View style={{ marginTop: 14 }}>
      <View
        style={{
          gap: 10,
          borderRadius: 22,
          borderWidth: 1,
          borderColor: HOME_PALETTE.workspace.border,
          backgroundColor: HOME_PALETTE.workspace.bg,
          overflow: "hidden",
          padding: 14,
        }}
      >
        {!isMobileWeb ? (
          <View
            pointerEvents="none"
            style={{
              position: "absolute",
              top: -52,
              right: -42,
              width: 140,
              height: 140,
              borderRadius: 999,
              backgroundColor: "transparent",
            }}
          />
        ) : null}

        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <View
            style={{
              width: 42,
              height: 38,
              borderRadius: 14,
              alignItems: "center",
              justifyContent: "center",
              borderWidth: 1,
              borderColor: "rgba(79,140,255,0.28)",
              backgroundColor: HOME_PALETTE.workspace.soft,
            }}
          >
            <SafeIcon name="business-outline" size={18} color={UI.primary} />
          </View>

          <View style={{ flex: 1, minWidth: 0 }}>
            <Text
              style={{
                color: HOME_CARD_FAINT,
                fontWeight: "900",
                fontSize: 10,
                letterSpacing: 0.8,
              }}
            >
              CURRENT WORKSPACE
            </Text>

            <Text
              style={{ color: HOME_CARD_TEXT, fontWeight: "900", fontSize: 17, marginTop: 2 }}
              numberOfLines={1}
            >
              {orgLabel}
            </Text>
          </View>

          <View
            style={{
              paddingHorizontal: 10,
              paddingVertical: 5,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: "rgba(79,140,255,0.26)",
              backgroundColor: "rgba(79,140,255,0.10)",
            }}
          >
            <Text style={{ color: UI.text, fontWeight: "900", fontSize: 10 }}>
              {roleLabel.toUpperCase()}
            </Text>
          </View>
        </View>

        <HomeCardToneContext.Provider
          value={{ text: HOME_CARD_TEXT, muted: HOME_CARD_MUTED, faint: HOME_CARD_FAINT }}
        >
        <View style={{ flexDirection: "row", gap: 10 }}>
          <MiniStat label="Organization" value={orgLabel} />
          <MiniStat label="Role" value={roleLabel} />
          <MiniStat
            label="Active Store"
            value={storeLabel}
            hint={activeStoreId ? "live context" : "not selected"}
          />
        </View>

        </HomeCardToneContext.Provider>

        {!activeStoreId ? (
          <Text style={{ color: UI.muted, fontWeight: "800" }}>
            Hujachagua active store bado. Fungua workspace switcher uchague context sahihi ya kazi.
          </Text>
        ) : null}

        <Pressable
          onPress={onOpen}
          hitSlop={10}
          style={({ pressed }) => ({
            borderRadius: 16,
            borderWidth: 1,
            borderColor: "rgba(79,140,255,0.32)",
            backgroundColor: HOME_PALETTE.workspace.soft,
            paddingVertical: 13,
            paddingHorizontal: 16,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 10,
            opacity: pressed ? 0.92 : 1,
          })}
        >
          <SafeIcon name="swap-horizontal" size={17} color={UI.text} />
          <Text style={{ color: UI.text, fontWeight: "900", fontSize: 14 }}>
            Switch Org / Workspace
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

function WebSafeHomeActions({
  onOpenAI,
  onOpenOrgSwitcher,
  onOpenFinance,
  width,
}: {
  onOpenAI: () => void;
  onOpenOrgSwitcher: () => void;
  onOpenFinance: () => void;
  width: number;
}) {
  const isWide = width >= 1100;
  const buttonWidth = isWide ? "48.8%" : "100%";

  const ActionButton = ({
    label,
    sublabel,
    onPress,
  }: {
    label: string;
    sublabel: string;
    onPress: () => void;
  }) => {
    return (
      <Pressable
        onPress={onPress}
        hitSlop={10}
        style={({ pressed }) => ({
          width: buttonWidth as any,
          minHeight: 92,
          borderRadius: 20,
          borderWidth: 1,
          borderColor: "rgba(16,185,129,0.26)",
          backgroundColor: "rgba(79,140,255,0.10)",
          paddingVertical: 16,
          paddingHorizontal: 16,
          justifyContent: "center",
          opacity: pressed ? 0.92 : 1,
        })}
      >
        <Text style={{ color: UI.text, fontWeight: "900", fontSize: 16 }}>
          {label}
        </Text>

        <Text
          style={{
            color: UI.muted,
            fontWeight: "800",
            fontSize: 12,
            marginTop: 6,
            lineHeight: 18,
          }}
          numberOfLines={2}
        >
          {sublabel}
        </Text>
      </Pressable>
    );
  };

  return (
    <View style={{ paddingTop: 14 }}>
      <Card
        style={{
          gap: 16,
          borderRadius: 24,
          borderColor: HOME_CARD_BORDER,
          backgroundColor: HOME_CARD_BG,
          padding: 18,
          overflow: "hidden",
        }}
      >
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            top: -50,
            right: -40,
            width: 180,
            height: 180,
            borderRadius: 999,
            backgroundColor: "transparent",
          }}
        />

        <View style={{ gap: 6 }}>
          <Text style={{ color: UI.text, fontWeight: "900", fontSize: 22 }}>
            Quick Actions
          </Text>

          <Text style={{ color: UI.muted, fontWeight: "800", lineHeight: 22, fontSize: 13 }}>
            Hatua za haraka za kila siku kwa desktop workflow.
          </Text>
        </View>

        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <ActionButton
            label="Open AI"
            sublabel="Assistant, ideas, and business guidance"
            onPress={onOpenAI}
          />
          <ActionButton
            label="Switch Org / Workspace"
            sublabel="Badili organization au active context"
            onPress={onOpenOrgSwitcher}
          />
          <ActionButton
            label="Open Finance"
            sublabel="Sales, expenses, and finance history"
            onPress={onOpenFinance}
          />
        </View>
      </Card>
    </View>
  );
}

function DesktopKpiStrip({
  sales,
  expenses,
  profit,
  orders,
  moneyIn,
  stockValue,
  isOwner,
}: {
  sales: string;
  expenses: string;
  profit: string;
  orders: string;
  moneyIn: string;
  stockValue: string;
  isOwner: boolean;
}) {
  const Item = ({
    label,
    value,
    hint,
  }: {
    label: string;
    value: string;
    hint?: string;
  }) => {
    return (
      <Card
        style={{
          flex: 1,
          minWidth: 180,
          gap: 6,
          borderRadius: 20,
          borderColor: "rgba(79,140,255,0.20)",
          backgroundColor: UI.card,
          padding: 16,
        }}
      >
        <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12 }} numberOfLines={1}>
          {label}
        </Text>
        <Text
          style={{ color: UI.text, fontWeight: "900", fontSize: 22 }}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.8}
        >
          {value}
        </Text>
        {!!hint && (
          <Text style={{ color: UI.faint, fontWeight: "800", fontSize: 11 }} numberOfLines={1}>
            {hint}
          </Text>
        )}
      </Card>
    );
  };

  return (
    <View
      style={{
        flexDirection: "row",
        flexWrap: "wrap",
        gap: 12,
        marginTop: 14,
      }}
    >
      <Item label="Sales Today" value={sales} hint="store performance" />
      <Item label="Expenses" value={expenses} hint="today" />
      <Item label="Orders" value={orders} hint="completed" />
      <Item label="Money In" value={moneyIn} hint="after expenses" />
      <Item label="Stock Value" value={stockValue} hint="on hand" />
      <Item label="Net Profit" value={profit} hint={isOwner ? "owner view" : "owner-only"} />
    </View>
  );
}

function DesktopSignalCard({
  title,
  body,
  badge,
}: {
  title: string;
  body: string;
  badge?: string;
}) {
  return (
    <Card
      style={{
        gap: 10,
        borderRadius: 20,
        borderColor: "rgba(79,140,255,0.20)",
        backgroundColor: UI.card,
        padding: 16,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <Text style={{ color: UI.text, fontWeight: "900", fontSize: 16, flex: 1 }}>{title}</Text>
        {!!badge ? (
          <View
            style={{
              paddingHorizontal: 9,
              paddingVertical: 5,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: "rgba(79,140,255,0.26)",
              backgroundColor: "rgba(79,140,255,0.10)",
            }}
          >
            <Text style={{ color: UI.text, fontWeight: "900", fontSize: 11 }}>{badge}</Text>
          </View>
        ) : null}
      </View>

      <Text style={{ color: UI.muted, fontWeight: "800", lineHeight: 21 }}>{body}</Text>
    </Card>
  );
}

function CapitalRecoverySummaryCard({
  loading,
  error,
  summary,
  canSeeCapitalSecrets,
}: {
  loading: boolean;
  error: string | null;
  summary: CapitalRecoverySummaryRow;
  canSeeCapitalSecrets: boolean;
}) {
  const fmt = useCallback(
    (n: number) =>
      formatMoney(n, {
        currency: "TZS",
        locale: "en-TZ",
      }).replace(/\s+/g, " "),
    []
  );

  return (
    <Card
      style={{
        gap: 14,
        borderRadius: 24,
        borderColor: "rgba(79,140,255,0.26)",
        backgroundColor: UI.card,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <Text style={{ color: UI.text, fontWeight: "900", fontSize: 20, flex: 1 }}>
          Capital Recovery Summary
        </Text>
      </View>

      {!!error ? (
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
      ) : null}

      <View style={{ flexDirection: "row", gap: 12 }}>
        <MiniStat label="Income" value={fmt(summary.total_income)} hint="all entries" />
        <MiniStat label="Cost" value={fmt(summary.total_cost)} hint="operating" />
        {canSeeCapitalSecrets ? (
          <MiniStat label="Asset" value={fmt(summary.total_asset)} hint="capital target" />
        ) : null}
      </View>

      <View style={{ flexDirection: "row", gap: 12 }}>
        <MiniStat label="Remaining Cost" value={fmt(summary.remaining_cost)} />
        {canSeeCapitalSecrets ? (
          <MiniStat label="Remaining Asset" value={fmt(summary.remaining_asset)} />
        ) : null}
        {canSeeCapitalSecrets ? (
          <MiniStat label="Profit" value={fmt(summary.realized_profit)} hint="after cost + asset" />
        ) : null}
      </View>

      <View style={{ flexDirection: "row", gap: 12 }}>
        <MiniStat label="Entries" value={String(summary.entries_count ?? 0)} />
        <MiniStat
          label="Last Entry"
          value={summary.last_entry_at ? fmtLocal(summary.last_entry_at) : "—"}
          multilineValue
        />
      </View>
    </Card>
  );
}
function CapitalRecoveryActionHero({
  activeOrgName,
  activeStoreName,
}: {
  activeOrgName?: string | null;
  activeStoreName?: string | null;
}) {
  return (
    <View style={{ marginTop: 14 }}>
      <Card
        style={{
          gap: 14,
          borderRadius: 24,
          borderColor: "rgba(79,140,255,0.28)",
          backgroundColor: UI.card,
          overflow: "hidden",
        }}
      >
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            top: -60,
            right: -40,
            width: 180,
            height: 180,
            borderRadius: 999,
            backgroundColor: "transparent",
          }}
        />

        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            left: -50,
            bottom: -90,
            width: 170,
            height: 170,
            borderRadius: 999,
            backgroundColor: "transparent",
          }}
        />

        <Text style={{ color: UI.faint, fontWeight: "900", fontSize: 11, letterSpacing: 0.8 }}>
          CAPITAL RECOVERY MODE
        </Text>

        <Text style={{ color: UI.text, fontWeight: "900", fontSize: 22 }}>
          Recovery Command Zone
        </Text>

        <Text style={{ color: UI.muted, fontWeight: "800", lineHeight: 22 }}>
          Hii ni mode maalum ya Capital Recovery. Focus kuu hapa ni Asset, Cost, Income,
          na ufuatiliaji wa kurejesha mtaji bila kuchanganya na maeneo yasiyo ya recovery.
        </Text>

        <View style={{ flexDirection: "row", gap: 12 }}>
          <MiniStat label="Organization" value={String(activeOrgName ?? "—")} />
          <MiniStat label="Recovery Store" value={String(activeStoreName ?? "—")} />
        </View>
      </Card>
    </View>
  );
}
function CapitalRecoveryHomeShell({
  activeOrgName,
  activeStoreName,
  activeStoreId,
  summary,
  summaryLoading,
  summaryError,
  canSeeCapitalSecrets,
}: {
  activeOrgName?: string | null;
  activeStoreName?: string | null;
  activeStoreId?: string | null;
  summary: CapitalRecoverySummaryRow;
  summaryLoading: boolean;
  summaryError: string | null;
  canSeeCapitalSecrets: boolean;
}) {
  return (
    <View style={{ marginTop: 14, gap: 14 }}>
      <CapitalRecoveryActionHero
        activeOrgName={activeOrgName}
        activeStoreName={activeStoreName}
      />

      <CapitalRecoverySummaryCard
        loading={summaryLoading}
        error={summaryError}
        summary={summary}
        canSeeCapitalSecrets={canSeeCapitalSecrets}
      />
    </View>
  );
}

function CapitalRecoveryBottomSwitcherCard({
  onOpenOrgSwitcher,
}: {
  onOpenOrgSwitcher: () => void;
}) {
  return (
    <View style={{ marginTop: 14 }}>
      <Card
        style={{
          gap: 12,
          borderRadius: 24,
          borderColor: HOME_CARD_BORDER,
          backgroundColor: HOME_CARD_BG,
        }}
      >
        <Text style={{ color: UI.text, fontWeight: "900", fontSize: 18 }}>
          Switch Organization
        </Text>

        <Text style={{ color: UI.muted, fontWeight: "800", lineHeight: 22 }}>
          Ukiwa bado kwenye dashboard hii unaweza kubadili organization au workspace na kuhamia
          biashara nyingine moja kwa moja.
        </Text>

        <Pressable
          onPress={onOpenOrgSwitcher}
          // @ts-ignore
          onClick={onOpenOrgSwitcher}
          hitSlop={10}
          style={({ pressed }) => ({
            borderRadius: 20,
            borderWidth: 1,
            borderColor: "rgba(16,185,129,0.34)",
            backgroundColor: "rgba(79,140,255,0.16)",
            paddingVertical: 16,
            paddingHorizontal: 16,
            alignItems: "center",
            justifyContent: "center",
            opacity: pressed ? 0.92 : 1,
            transform: pressed ? [{ scale: 0.99 }] : [{ scale: 1 }],
          })}
        >
          <Text style={{ color: UI.text, fontWeight: "900", fontSize: 15 }}>
            Switch Org / Workspace
          </Text>
        </Pressable>
      </Card>
    </View>
  );
}

function CapitalRecoveryReportsCard({
  activeStoreId,
  reloadKey = 0,
  canSeeCapitalSecrets,
}: {
  activeStoreId?: string | null;
  reloadKey?: number;
  canSeeCapitalSecrets: boolean;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<CapitalRecoveryHistoryRow[]>([]);
 const [todayReport, setTodayReport] = useState<CapitalRecoveryTodayReport>({
  asset: 0,
  cost: 0,
  income: 0,
  net: 0,
});

  const storeId = String(activeStoreId ?? "").trim();

  const load = useCallback(async () => {
    if (!storeId) {
      setHistory([]);
      setTodayReport({
  asset: 0,
  cost: 0,
  income: 0,
  net: 0,
});
      setError("No active Capital Recovery store selected");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { data, error: hErr } = await supabase.rpc("get_capital_recovery_history_v2", {
        p_store_id: storeId,
        p_limit: 100,
      });

      if (hErr) throw hErr;

      const rows = (Array.isArray(data) ? data : []) as any[];

      const mappedRows: CapitalRecoveryHistoryRow[] = rows.map((r) => ({
        id: String(r?.id ?? ""),
        entry_type: String(r?.entry_type ?? "ASSET").toUpperCase() as
          | "ASSET"
          | "COST"
          | "INCOME",
        amount: toNum(r?.amount),
        note: clean(r?.note) || null,
        created_at: String(r?.created_at ?? ""),
        created_by: clean(r?.created_by) || null,
      }));

      setHistory(mappedRows);

      const today = toIsoDateLocal(new Date());

      let asset = 0;
      let cost = 0;
      let income = 0;

      for (const item of mappedRows) {
        const created = clean(item.created_at);
        if (!created) continue;

        const d = new Date(created);
        if (Number.isNaN(d.getTime())) continue;

        const itemDay = toIsoDateLocal(d);
        if (itemDay !== today) continue;

        if (item.entry_type === "ASSET") asset += toNum(item.amount);
        else if (item.entry_type === "COST") cost += toNum(item.amount);
        else if (item.entry_type === "INCOME") income += toNum(item.amount);
      }

      setTodayReport({
  asset,
  cost,
  income,
  net: income - cost,
});
    } catch (e: any) {
      setError(clean(e?.message) || "Failed to load Capital Recovery history");
      setHistory([]);
      setTodayReport({
  asset: 0,
  cost: 0,
  income: 0,
  net: 0,
});
    } finally {
      setLoading(false);
    }
  }, [storeId]);

  useEffect(() => {
    void load();
  }, [load, reloadKey]);
useFocusEffect(
  useCallback(() => {
    void load();
  }, [load])
);
  const fmt = useCallback(
    (n: number) =>
      formatMoney(n, {
        currency: "TZS",
        locale: "en-TZ",
      }).replace(/\s+/g, " "),
    []
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

  return (
    <View style={{ marginTop: 14 }}>
      <Card
        style={{
          gap: 14,
          borderRadius: 24,
          borderColor: "rgba(79,140,255,0.26)",
          backgroundColor: "rgba(255,255,255,0.055)",
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <Text style={{ color: UI.text, fontWeight: "900", fontSize: 18, flex: 1 }}>
            Reports
          </Text>

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
              {loading ? "..." : history.length}
            </Text>
          </View>
        </View>

        {!!error ? (
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
        ) : null}

        <View style={{ flexDirection: "row", gap: 12 }}>
          {canSeeCapitalSecrets ? (
            <MiniStat
              label="Asset"
              value={String(report.ASSET.count)}
              hint={fmt(report.ASSET.amount)}
            />
          ) : null}
          <MiniStat
            label="Cost"
            value={String(report.COST.count)}
            hint={fmt(report.COST.amount)}
          />
          <MiniStat
  label="Income"
  value={String(report.INCOME.count)}
  hint={fmt(report.INCOME.amount)}
/>
</View>

{/* 🔽 TODAY NET POSITION */}
<View
  style={{
    borderWidth: 1,
    borderColor:
      todayReport.income - todayReport.cost >= 0
        ? "rgba(16,185,129,0.32)"
        : "rgba(239,68,68,0.32)",
    backgroundColor:
      todayReport.income - todayReport.cost >= 0
        ? "rgba(79,140,255,0.10)"
        : "rgba(239,68,68,0.10)",
    borderRadius: 18,
    padding: 12,
    gap: 6,
  }}
>
  <Text style={{ color: UI.muted, fontWeight: "900", fontSize: 12 }}>
    TODAY NET POSITION
  </Text>

  <Text
    style={{
      color: todayReport.income - todayReport.cost >= 0 ? UI.success : UI.danger,
      fontWeight: "900",
      fontSize: 18,
    }}
  >
    {todayReport.income - todayReport.cost >= 0
      ? `+ ${fmt(todayReport.income - todayReport.cost)}`
      : `- ${fmt(Math.abs(todayReport.income - todayReport.cost))}`}
  </Text>

  <Text style={{ color: UI.faint, fontWeight: "800", fontSize: 12 }}>
    {todayReport.income - todayReport.cost >= 0 ? "Today profit" : "Today loss"}
  </Text>
</View>

<View
  style={{
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 18,
    padding: 12,
    gap: 10,
  }}
></View>
          <Text style={{ color: UI.muted, fontWeight: "900", fontSize: 12 }}>
            TODAY REPORT
          </Text>

         <View style={{ flexDirection: "row", gap: 12 }}>
  {canSeeCapitalSecrets ? (
    <MiniStat label="Today Asset" value={fmt(todayReport.asset)} hint="today" />
  ) : null}
  <MiniStat label="Today Cost" value={fmt(todayReport.cost)} hint="today" />
  <MiniStat label="Today Income" value={fmt(todayReport.income)} hint="today" />
</View>

<View
  style={{
    marginTop: 10,
    borderWidth: 1,
    borderColor:
      todayReport.net < 0 ? "rgba(201,74,74,0.45)" : "rgba(16,185,129,0.35)",
    backgroundColor:
      todayReport.net < 0 ? "rgba(201,74,74,0.12)" : "rgba(79,140,255,0.10)",
    borderRadius: 16,
    padding: 12,
  }}
>
  <Text
    style={{
      color: todayReport.net < 0 ? UI.danger : UI.emerald,
      fontWeight: "900",
      fontSize: 12,
    }}
  >
    TODAY NET POSITION
  </Text>

  <Text
    style={{
      color: todayReport.net < 0 ? UI.danger : UI.emerald,
      fontWeight: "900",
      fontSize: 20,
      marginTop: 6,
    }}
    numberOfLines={1}
    adjustsFontSizeToFit
    minimumFontScale={0.75}
  >
    {todayReport.net < 0 ? "-" : "+"}
    {fmt(Math.abs(todayReport.net))}
  </Text>

  <Text style={{ color: UI.muted, fontWeight: "800", marginTop: 4 }}>
    {todayReport.net < 0 ? "Cost imezidi income ya leo" : "Income imezidi cost ya leo"}
  </Text>
</View>
</Card>
    </View>
  );
}
     
     

function WebDesktopShell({
  width: _width,
  left,
  right,
}: {
  width: number;
  left: React.ReactNode;
  right: React.ReactNode;
}) {
 const desktopMax = _width >= 1600 ? 1480 : _width >= 1380 ? 1320 : 1200;
const twoCols = _width >= 1180;

  if (!twoCols) {
    return (
      <View style={{ width: "100%", maxWidth: 980, alignSelf: "center" }}>
        {left}
        {right}
      </View>
    );
  }

  return (
    <View
      style={{
        width: "100%",
        maxWidth: desktopMax,
        alignSelf: "center",
        flexDirection: "row",
        alignItems: "flex-start",
        gap: 20,
      }}
    >
      <View style={{ flex: 1.35, minWidth: 0 }}>{left}</View>
      <View style={{ width: 390, minWidth: 390 }}>{right}</View>
    </View>
  );
}

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

const {
  refreshing,
  error,
  refresh,
  activeOrgId,
  activeOrgName,
  activeRole,
  activeStoreName,
  activeStoreId,
  stores,
} = useOrg();

  const netInfo = useNetInfo();
  const isOnline = !!(netInfo.isConnected && netInfo.isInternetReachable !== false);

  const [dashTick, setDashTick] = useState(0);
  const [capitalRecoveryTick, setCapitalRecoveryTick] = useState(0);
  const [pulling, setPulling] = useState(false);

  const [desktopLoading, setDesktopLoading] = useState(false);
  const [desktopFinanceErr, setDesktopFinanceErr] = useState<string | null>(null);
  const [desktopSales, setDesktopSales] = useState<SalesSummary>({
    total: 0,
    orders: 0,
    currency: "TZS",
  });
  const [desktopExpenses, setDesktopExpenses] = useState<ExpenseSummary>({
    total: 0,
    count: 0,
  });
  const [desktopProfit, setDesktopProfit] = useState<ProfitSummary>({
    net: 0,
    sales: null,
    expenses: null,
  });
  const [desktopPay, setDesktopPay] = useState<PayBreakdown>({
    cash: 0,
    bank: 0,
    mobile: 0,
    credit: 0,
    other: 0,
    orders: 0,
  });
  const [desktopCollections, setDesktopCollections] = useState<CollectionBreakdown>({
    cash: 0,
    bank: 0,
    mobile: 0,
    other: 0,
    total: 0,
    payments: 0,
  });
  const [desktopExpenseByChannel, setDesktopExpenseByChannel] = useState<ExpenseChannelBreakdown>({
    cash: 0,
    bank: 0,
    mobile: 0,
  });
  const [desktopStockValue, setDesktopStockValue] = useState(0);

  const [capitalSummaryLoading, setCapitalSummaryLoading] = useState(false);
  const [capitalSummaryError, setCapitalSummaryError] = useState<string | null>(null);
  const [capitalSummary, setCapitalSummary] = useState<CapitalRecoverySummaryRow>({
    total_asset: 0,
    total_cost: 0,
    total_income: 0,
    remaining_cost: 0,
    remaining_asset: 0,
    realized_profit: 0,
    entries_count: 0,
    last_entry_at: null,
  });

  const desktopLoadBusyRef = useRef(false);
  const desktopLoadSeqRef = useRef(0);

  const goOrgSwitcher = useCallback(() => {
    router.push("/org-switcher");
  }, [router]);

  

  const goAI = useCallback(() => {
    router.push("/ai");
  }, [router]);

  const goLive = useCallback(() => {
    router.push("/finance/live");
  }, [router]);

  const goStockValue = useCallback(() => {
    router.push("/stocks/history" as any);
  }, [router]);

  const bottomPad = useMemo(() => Math.max(insets.bottom, 8) + 14, [insets.bottom]);
  const topPad = useMemo(() => Math.max(insets.top, 10) + 8, [insets.top]);

  const onPullRefresh = useCallback(async () => {
    setPulling(true);
    try {
      await Promise.resolve(refresh());

      if (activeStoreId && isOnline) {
        try {
          await syncSalesQueueOnce(String(activeStoreId));
        } catch {}
      }

      setDashTick((x) => x + 1);
      setCapitalRecoveryTick((x) => x + 1);
    } finally {
      setPulling(false);
    }
  }, [refresh, activeStoreId, isOnline]);

  const isCashier = String(activeRole ?? "").trim().toLowerCase() === "cashier";
  const isWeb = Platform.OS === "web";
  const isDesktopWeb = isDesktopWebEnv(width);
  const isMobileWeb = isWeb && !isDesktopWeb;

  // WEB SAFE LITE MODE:
  // Browser Home ibaki very light ili buttons zisigande.
  const isWebLiteHome = isWeb;

  const activeStoreType = useMemo(() => {
    const row = (stores ?? []).find(
      (s: any) => String(s?.store_id ?? "") === String(activeStoreId ?? "")
    );
    const t = String((row as any)?.store_type ?? "STANDARD").trim().toUpperCase();
    return t === "CAPITAL_RECOVERY" ? "CAPITAL_RECOVERY" : "STANDARD";
  }, [stores, activeStoreId]);

  const isCapitalRecoveryStore = activeStoreType === "CAPITAL_RECOVERY";

  const orgId = String(activeOrgId ?? "").trim();
  const storeId = String(activeStoreId ?? "").trim();
  const roleLower = String(activeRole ?? "").trim().toLowerCase();
  const isOwner = roleLower === "owner";
  const canSeeCapitalSecrets = isOwner;

  const moneyPrefs = useOrgMoneyPrefs(orgId);
  const moneyRefreshRef = useRef<null | (() => Promise<any> | any)>(null);
  moneyRefreshRef.current = moneyPrefs.refresh;

  const desktopFmtMoney = useCallback(
    (n: number) =>
      formatMoney(n, {
        currency: moneyPrefs.currency || "TZS",
        locale: moneyPrefs.locale || "en-TZ",
      }).replace(/\s+/g, " "),
    [moneyPrefs.currency, moneyPrefs.locale]
  );

  const loadCapitalRecoverySummary = useCallback(async () => {
    const sid = String(activeStoreId ?? "").trim();

    if (!sid) {
      setCapitalSummary({
        total_asset: 0,
        total_cost: 0,
        total_income: 0,
        remaining_cost: 0,
        remaining_asset: 0,
        realized_profit: 0,
        entries_count: 0,
        last_entry_at: null,
      });
      setCapitalSummaryError("No active Capital Recovery store selected");
      return;
    }

    setCapitalSummaryLoading(true);
    setCapitalSummaryError(null);

    try {
      const { data, error } = await supabase.rpc("get_capital_recovery_summary_v1", {
        p_store_id: sid,
      });

      if (error) throw error;

      const row = (Array.isArray(data) ? data[0] : data) as any;

      setCapitalSummary({
        total_asset: toNum(row?.total_asset),
        total_cost: toNum(row?.total_cost),
        total_income: toNum(row?.total_income),
        remaining_cost: toNum(row?.remaining_cost),
        remaining_asset: toNum(row?.remaining_asset),
        realized_profit: toNum(row?.realized_profit),
        entries_count: toInt(row?.entries_count),
        last_entry_at: clean(row?.last_entry_at) || null,
      });
    } catch (e: any) {
      setCapitalSummaryError(clean(e?.message) || "Failed to load Capital Recovery summary");
      setCapitalSummary({
        total_asset: 0,
        total_cost: 0,
        total_income: 0,
        remaining_cost: 0,
        remaining_asset: 0,
        realized_profit: 0,
        entries_count: 0,
        last_entry_at: null,
      });
    } finally {
      setCapitalSummaryLoading(false);
    }
  }, [activeStoreId]);

  const onCapitalRecoveryRefreshDone = useCallback(async () => {
    await Promise.resolve(refresh());

    if (activeStoreId && isOnline) {
      try {
        await syncSalesQueueOnce(String(activeStoreId));
      } catch {}
    }

    await loadCapitalRecoverySummary();
    setCapitalRecoveryTick((x) => x + 1);
  }, [refresh, activeStoreId, isOnline, loadCapitalRecoverySummary]);

  const desktopLoad = useCallback(async () => {
    // WEB SAFE MODE HOTFIX:
    // Desktop browser Home imekuwa ikipata freeze / page unresponsive.
    // Tunazima live heavy RPC loading kwenye Home ya web desktop kwa sasa.
    // Detailed pages (Finance / Stores / Products / Sales) bado zinafunguka kawaida.
    if (Platform.OS === "web") return;
    if (!isDesktopWeb) return;
    if (isCapitalRecoveryStore) return;
    if (!orgId || !storeId) return;
    if (desktopLoadBusyRef.current) return;

    const seq = ++desktopLoadSeqRef.current;
    desktopLoadBusyRef.current = true;

    setDesktopLoading(true);
    setDesktopFinanceErr(null);

    try {
      const { from, to } = rangeToFromTo("today");
      const { from: fromYMD, to: toYMD } = rangeToDates("today");

      const salesPromise = supabase.rpc("get_sales", {
        p_store_id: storeId,
        p_from: from,
        p_to: to,
      } as any);

      const expensePromise = supabase.rpc("get_expense_summary_v2", {
        p_store_id: storeId,
        p_from: fromYMD,
        p_to: toYMD,
      } as any);

      const profitPromise = isOwner
        ? supabase.rpc("get_store_net_profit_v2", {
            p_store_id: storeId,
            p_from: from,
            p_to: to,
          } as any)
        : Promise.resolve({ data: null, error: null } as any);

      const payPromise = supabase.rpc("get_sales_channel_summary_v3", {
        p_org_id: orgId,
        p_from: from,
        p_to: to,
        p_store_id: storeId,
      } as any);

      const collectionsPromise = supabase.rpc("get_credit_collections_summary_v2", {
        p_org_id: orgId,
        p_from: from,
        p_to: to,
        p_store_id: storeId,
      } as any);

      const expenseChannelPromise = supabase.rpc("get_expense_channel_summary_v1", {
        p_store_id: storeId,
        p_from: fromYMD,
        p_to: toYMD,
      } as any);

      const stockPromise = supabase.rpc("get_stock_on_hand_value_v1", {
        p_org_id: orgId,
        p_store_id: storeId,
      } as any);

      const [
        salesRes,
        expenseRes,
        profitRes,
        payRes,
        collectionsRes,
        expenseChannelRes,
        stockRes,
      ] = await Promise.all([
        salesPromise,
        expensePromise,
        profitPromise,
        payPromise,
        collectionsPromise,
        expenseChannelPromise,
        stockPromise,
      ]);

      if (salesRes.error) throw salesRes.error;
      if (expenseRes.error) throw expenseRes.error;
      if (profitRes?.error) throw profitRes.error;
      if (payRes.error) throw payRes.error;
      if (expenseChannelRes.error) throw expenseChannelRes.error;
      if (stockRes.error) throw stockRes.error;

      const salesRows = Array.isArray(salesRes.data) ? salesRes.data : [];
      const salesTotal = salesRows.reduce((acc: number, r: any) => {
        return (
          acc +
          toNum(
            r?.total_amount ??
              r?.total ??
              r?.amount ??
              r?.grand_total ??
              r?.paid_amount ??
              r?.revenue ??
              0
          )
        );
      }, 0);

      const salesOrders = salesRows.reduce((acc: number, r: any) => {
        const st = String(r?.status ?? "").toLowerCase().trim();
        if (st === "cancelled" || st === "canceled" || st === "void") return acc;
        return acc + 1;
      }, 0);

      if (seq !== desktopLoadSeqRef.current) return;

      setDesktopSales({
        total: salesTotal,
        orders: salesOrders,
        currency: "TZS",
      });

      const expenseRow = Array.isArray(expenseRes.data) ? expenseRes.data[0] : expenseRes.data;
      setDesktopExpenses({
        total: toNum(expenseRow?.total ?? expenseRow?.amount ?? expenseRow?.sum ?? 0),
        count: toInt(expenseRow?.count ?? expenseRow?.items ?? 0),
      });

      const profitRow = Array.isArray(profitRes?.data) ? profitRes.data[0] : profitRes?.data;
      setDesktopProfit({
        net: isOwner ? toNum(profitRow?.net_profit ?? profitRow?.net ?? 0) : 0,
        sales: profitRow?.sales_total != null ? toNum(profitRow?.sales_total) : null,
        expenses: profitRow?.expenses_total != null ? toNum(profitRow?.expenses_total) : null,
      });

      const payRows = Array.isArray(payRes.data) ? payRes.data : [];
      const payOut: PayBreakdown = {
        cash: 0,
        bank: 0,
        mobile: 0,
        credit: 0,
        other: 0,
        orders: 0,
      };

      for (const r of payRows) {
        const ch = String(r?.channel ?? r?.payment_method ?? "").trim().toUpperCase();
        const amt = toNum(r?.revenue ?? r?.total ?? 0);
        const ord = toInt(r?.orders ?? 0);
        payOut.orders += ord;

        if (ch === "CASH") payOut.cash += amt;
        else if (ch === "BANK") payOut.bank += amt;
        else if (ch === "MOBILE") payOut.mobile += amt;
        else if (ch === "CREDIT") payOut.credit += amt;
        else payOut.other += amt;
      }

      setDesktopPay(payOut);

      const collectionRows = Array.isArray(collectionsRes.data) ? collectionsRes.data : [];
      const collOut: CollectionBreakdown = {
        cash: 0,
        bank: 0,
        mobile: 0,
        other: 0,
        total: 0,
        payments: 0,
      };

      for (const r of collectionRows) {
        const ch = String(r?.channel ?? r?.payment_method ?? r?.method ?? "")
          .trim()
          .toUpperCase();
        const amt = toNum(r?.amount ?? r?.revenue ?? r?.total ?? 0);
        const cnt = toInt(r?.payments ?? r?.count ?? 0);

        collOut.payments += cnt;

        if (ch === "CASH") collOut.cash += amt;
        else if (ch === "BANK") collOut.bank += amt;
        else if (ch === "MOBILE") collOut.mobile += amt;
        else collOut.other += amt;
      }

      collOut.total = collOut.cash + collOut.bank + collOut.mobile;
      setDesktopCollections(collOut);

      const expenseChannelRows = Array.isArray(expenseChannelRes.data) ? expenseChannelRes.data : [];
      const expCh: ExpenseChannelBreakdown = { cash: 0, bank: 0, mobile: 0 };

      for (const r of expenseChannelRows) {
        const ch = String(r?.channel ?? "").trim().toUpperCase();
        const amt = toNum(r?.amount ?? 0);

        if (ch === "CASH") expCh.cash += amt;
        else if (ch === "BANK") expCh.bank += amt;
        else if (ch === "MOBILE") expCh.mobile += amt;
      }

      setDesktopExpenseByChannel(expCh);

      const stockRaw = Array.isArray(stockRes.data) ? stockRes.data[0] : stockRes.data;
      setDesktopStockValue(extractScalarValue(stockRaw));
    } catch (e: any) {
      if (seq === desktopLoadSeqRef.current) {
        setDesktopFinanceErr(e?.message ?? "Failed to load desktop dashboard");
      }
    } finally {
      if (seq === desktopLoadSeqRef.current) {
        setDesktopLoading(false);
      }
      desktopLoadBusyRef.current = false;
    }
  }, [isDesktopWeb, isCapitalRecoveryStore, orgId, storeId, isOwner]);

  useEffect(() => {
    if (!orgId) return;

    const run = async () => {
      try {
        await moneyRefreshRef.current?.();
      } catch {}
    };

    void run();
  }, [orgId]);

  useEffect(() => {
    if (isWebLiteHome) return;
    if (!isDesktopWeb) return;
    if (isCapitalRecoveryStore) return;
    if (!orgId || !storeId) return;

    void desktopLoad();
  }, [isWebLiteHome, isDesktopWeb, isCapitalRecoveryStore, orgId, storeId, desktopLoad]);

  useFocusEffect(
    useCallback(() => {
      if (Platform.OS === "web") return;
      if (!activeStoreId || !isOnline) return;
      void syncSalesQueueOnce(String(activeStoreId));
    }, [activeStoreId, isOnline])
  );

  useEffect(() => {
    if (!isCapitalRecoveryStore) return;
    void loadCapitalRecoverySummary();
  }, [isCapitalRecoveryStore, activeStoreId, capitalRecoveryTick, loadCapitalRecoverySummary]);

  useFocusEffect(
    useCallback(() => {
      if (!isCapitalRecoveryStore) return;
      void loadCapitalRecoverySummary();
    }, [isCapitalRecoveryStore, loadCapitalRecoverySummary])
  );

  useEffect(() => {
    if (isWebLiteHome) return;
    if (!activeStoreId || !isOnline) return;

    void syncSalesQueueOnce(String(activeStoreId));

    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active" && activeStoreId && isOnline) {
        void syncSalesQueueOnce(String(activeStoreId));
      }
    });

    const timer = setInterval(() => {
      if (activeStoreId && isOnline) {
        void syncSalesQueueOnce(String(activeStoreId));
      }
    }, 15000);

    return () => {
      try {
        // @ts-ignore
        sub?.remove?.();
      } catch {}
      clearInterval(timer);
    };
  }, [activeStoreId, isOnline, isWebLiteHome]);

  const homeRefreshControl =
    Platform.OS === "web"
      ? undefined
      : (
          <RefreshControl
            refreshing={pulling || refreshing}
            onRefresh={onPullRefresh}
            tintColor={UI.text}
          />
        );
  return (
    <Screen
      scroll
      refreshControl={homeRefreshControl as any}
      contentStyle={{
        paddingTop: isDesktopWeb ? Math.max(insets.top, 18) + 10 : topPad,
        paddingHorizontal: isDesktopWeb ? 22 : 16,
        paddingBottom: bottomPad,
      }}
    >
      {!isDesktopWeb ? (
        <HeaderHero
          activeOrgName={activeOrgName}
          activeStoreName={
            isCapitalRecoveryStore
              ? `${activeStoreName ?? "Store"} • CAPITAL RECOVERY`
              : activeStoreName
          }
          isCashier={isCashier}
        />
      ) : null}

    {!isCashier && !isDesktopWeb && !isCapitalRecoveryStore ? (
  <>
    <CompactNotificationsHomeCard />
    <ZetraAiCard onOpen={goAI} />
  </>
) : null}

      {!!error && !String(error).toLowerCase().includes("not allowed") && (
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

      {isCapitalRecoveryStore ? (
        <>
          <StoreGuard>
            <CapitalRecoveryHomeShell
              activeOrgName={activeOrgName}
              activeStoreName={activeStoreName}
              activeStoreId={activeStoreId}
              summaryLoading={capitalSummaryLoading}
              summaryError={capitalSummaryError}
              summary={capitalSummary}
              canSeeCapitalSecrets={canSeeCapitalSecrets}
            />

            <CapitalRecoveryReportsCard
              activeStoreId={activeStoreId}
              reloadKey={capitalRecoveryTick}
              canSeeCapitalSecrets={canSeeCapitalSecrets}
            />

            <CapitalRecoveryBottomSwitcherCard
              onOpenOrgSwitcher={goOrgSwitcher}
            />
          </StoreGuard>
        </>
      ) : isWebLiteHome ? (
        <>
          <WorkspaceCard
            activeOrgName={activeOrgName}
            activeRole={activeRole}
            activeStoreName={activeStoreName}
            activeStoreId={activeStoreId}
            onOpen={goOrgSwitcher}
          />

          <Card
            style={{
              marginTop: 14,
              gap: 16,
              borderRadius: 24,
              borderColor: "rgba(79,140,255,0.26)",
              backgroundColor: UI.card,
              padding: 18,
            }}
          >
            <View style={{ gap: 6 }}>
              <Text style={{ color: UI.text, fontWeight: "900", fontSize: 22 }}>
                Quick Actions
              </Text>

              <Text style={{ color: UI.muted, fontWeight: "800", lineHeight: 22, fontSize: 13 }}>
                Fungua maeneo muhimu ya kazi kwa haraka kutoka Home.
              </Text>
            </View>

            <View style={{ gap: 10 }}>
              <Pressable
                onPress={goAI}
                // @ts-ignore
                onClick={goAI}
                hitSlop={10}
                style={({ pressed }) => ({
                  borderRadius: 20,
                  borderWidth: 1,
                  borderColor: "rgba(79,140,255,0.28)",
                  backgroundColor: "rgba(79,140,255,0.10)",
                  paddingVertical: 16,
                  paddingHorizontal: 16,
                  alignItems: "center",
                  justifyContent: "center",
                  opacity: pressed ? 0.92 : 1,
                  transform: pressed ? [{ scale: 0.995 }] : [{ scale: 1 }],
                })}
              >
                <Text style={{ color: UI.text, fontWeight: "900", fontSize: 15 }}>
                  Open AI
                </Text>
              </Pressable>

              <Pressable
                onPress={goOrgSwitcher}
                // @ts-ignore
                onClick={goOrgSwitcher}
                hitSlop={10}
                style={({ pressed }) => ({
                  borderRadius: 20,
                  borderWidth: 1,
                  borderColor: "rgba(79,140,255,0.28)",
                  backgroundColor: "rgba(79,140,255,0.10)",
                  paddingVertical: 16,
                  paddingHorizontal: 16,
                  alignItems: "center",
                  justifyContent: "center",
                  opacity: pressed ? 0.92 : 1,
                  transform: pressed ? [{ scale: 0.995 }] : [{ scale: 1 }],
                })}
              >
                <Text style={{ color: UI.text, fontWeight: "900", fontSize: 15 }}>
                  Switch Workspace
                </Text>
              </Pressable>

              <Pressable
                onPress={goLive}
                // @ts-ignore
                onClick={goLive}
                hitSlop={10}
                style={({ pressed }) => ({
                  borderRadius: 20,
                  borderWidth: 1,
                  borderColor: "rgba(79,140,255,0.28)",
                  backgroundColor: "rgba(79,140,255,0.10)",
                  paddingVertical: 16,
                  paddingHorizontal: 16,
                  alignItems: "center",
                  justifyContent: "center",
                  opacity: pressed ? 0.92 : 1,
                  transform: pressed ? [{ scale: 0.995 }] : [{ scale: 1 }],
                })}
              >
                <Text style={{ color: UI.text, fontWeight: "900", fontSize: 15 }}>
                  Open Live
                </Text>
              </Pressable>

              <Pressable
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
                // @ts-ignore
                onClick={() => {
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
                hitSlop={10}
                style={({ pressed }) => ({
                  borderRadius: 20,
                  borderWidth: 1,
                  borderColor: "rgba(79,140,255,0.28)",
                  backgroundColor: "rgba(79,140,255,0.10)",
                  paddingVertical: 16,
                  paddingHorizontal: 16,
                  alignItems: "center",
                  justifyContent: "center",
                  opacity: pressed ? 0.92 : 1,
                  transform: pressed ? [{ scale: 0.995 }] : [{ scale: 1 }],
                })}
              >
                <Text style={{ color: UI.text, fontWeight: "900", fontSize: 15 }}>
                  Open Finance
                </Text>
              </Pressable>

              <Pressable
                onPress={goStockValue}
                // @ts-ignore
                onClick={goStockValue}
                hitSlop={10}
                style={({ pressed }) => ({
                  borderRadius: 20,
                  borderWidth: 1,
                  borderColor: "rgba(79,140,255,0.28)",
                  backgroundColor: "rgba(79,140,255,0.10)",
                  paddingVertical: 16,
                  paddingHorizontal: 16,
                  alignItems: "center",
                  justifyContent: "center",
                  opacity: pressed ? 0.92 : 1,
                  transform: pressed ? [{ scale: 0.995 }] : [{ scale: 1 }],
                })}
              >
                <Text style={{ color: UI.text, fontWeight: "900", fontSize: 15 }}>
                  Open Stock Value
                </Text>
              </Pressable>
            </View>
          </Card>
        </>
      ) : isCashier ? (
        <>
          <WorkspaceCard
            activeOrgName={activeOrgName}
            activeRole={activeRole}
            activeStoreName={activeStoreName}
            activeStoreId={activeStoreId}
            onOpen={goOrgSwitcher}
          />
          <CashierQuickHome />
        </>
      ) : isDesktopWeb ? (
        <WebDesktopShell
          width={width}
          left={
            <>
              <HeaderHero
                activeOrgName={activeOrgName}
                activeStoreName={activeStoreName}
                isCashier={isCashier}
              />

              <WorkspaceCard
                activeOrgName={activeOrgName}
                activeRole={activeRole}
                activeStoreName={activeStoreName}
                activeStoreId={activeStoreId}
                onOpen={goOrgSwitcher}
              />

              <Card
                style={{
                  marginTop: 14,
                  gap: 12,
                  borderRadius: 22,
                  borderColor: "rgba(79,140,255,0.26)",
                  backgroundColor: UI.card,
                }}
              >
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <Text style={{ color: UI.text, fontWeight: "900", fontSize: 22, flex: 1 }}>
                    Executive Overview
                  </Text>

                  <View
                    style={{
                      paddingHorizontal: 10,
                      paddingVertical: 6,
                      borderRadius: 999,
                      borderWidth: 1,
                      borderColor: "rgba(79,140,255,0.28)",
                      backgroundColor: "rgba(79,140,255,0.10)",
                    }}
                  >
                    <Text style={{ color: UI.text, fontWeight: "900", fontSize: 11 }}>
                      DESKTOP
                    </Text>
                  </View>
                </View>

                <Text style={{ color: UI.muted, fontWeight: "800", lineHeight: 22 }}>
                  Muhtasari wa haraka wa workspace yako ya sasa. Tumia Finance, AI, na Workspace switcher
                  kama command center ya kila siku kwenye browser ya kompyuta.
                </Text>

                {!!desktopFinanceErr ? (
                  <Card
                    style={{
                      borderColor: "rgba(201,74,74,0.35)",
                      backgroundColor: "rgba(201,74,74,0.10)",
                      borderRadius: 18,
                      padding: 12,
                    }}
                  >
                    <Text style={{ color: UI.danger, fontWeight: "900" }}>{desktopFinanceErr}</Text>
                  </Card>
                ) : null}

                <Pressable
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
                  hitSlop={10}
                  style={({ pressed }) => ({
                    borderRadius: 18,
                    borderWidth: 1,
                    borderColor: UI.primaryBorder,
                    backgroundColor: UI.primarySoft,
                    paddingVertical: 15,
                    paddingHorizontal: 16,
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 10,
                    opacity: pressed ? 0.92 : 1,
                  })}
                >
                  <SafeIcon name="bar-chart-outline" size={18} color={UI.text} />
                  <Text style={{ color: UI.text, fontWeight: "900", fontSize: 15 }}>
                    Open Finance
                  </Text>
                </Pressable>
              </Card>
            </>
          }
          right={
            <>
              <WebSafeHomeActions
                width={width}
                onOpenAI={goAI}
                onOpenOrgSwitcher={goOrgSwitcher}
                onOpenFinance={() => {
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
              />

              <View style={{ height: 14 }} />

              <DesktopSignalCard
                title="Notifications"
                badge="LIVE"
                body="Fuatilia alerts, stock movements, receipts, na matukio muhimu ya biashara kutoka eneo moja la usimamizi."
              />

              <View style={{ height: 14 }} />

              <DesktopSignalCard
                title="AI Insights"
                badge="COPILOT"
                body="Pata mwongozo wa biashara, bidhaa, staff, na maamuzi ya kila siku kwa mtazamo wa haraka na wa kitaalamu."
              />
            </>
          }
        />
      ) : (
        <>
         <WorkspaceCard
  activeOrgName={activeOrgName}
  activeRole={activeRole}
  activeStoreName={activeStoreName}
  activeStoreId={activeStoreId}
  onOpen={goOrgSwitcher}
/>

<StoreGuard>
  <CompactFinanceCardHomePreview />
  <CompactStockValueCardHomePreview />
</StoreGuard>
        </>
      )}
    </Screen>
  );
}