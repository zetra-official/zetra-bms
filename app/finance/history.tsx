// app/finance/history.tsx
// ZETRA Finance History — Clean V2
// Rebuilt around one canonical period snapshot.
// Existing RPCs are reused; no database changes are required.

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { useRouter } from "expo-router";
import SafeIcon from "@/src/ui/SafeIcon";

import { useOrg } from "@/src/context/OrgContext";
import { supabase } from "@/src/supabase/supabaseClient";
import { Screen } from "@/src/ui/Screen";

type Scope = "STORE" | "ALL";
type Channel = "CASH" | "BANK" | "MOBILE" | "CREDIT" | "OTHER";
type StockBucket =
  | "FAST_MOVING"
  | "SLOW_MOVING"
  | "DEAD_STOCK"
  | "LOW_STOCK";

type StoreRow = {
  id: string;
  name: string;
  organization_id: string;
};

type SalesSummary = {
  total: number;
  orders: number;
  direct: number;
  club: number;
};

type ChannelSummary = {
  cash: number;
  bank: number;
  mobile: number;
  credit: number;
  other: number;
};

type ExpenseSummary = {
  total: number;
  count: number;
  channels: ChannelSummary;
};

type CollectionsSummary = {
  cash: number;
  bank: number;
  mobile: number;
  other: number;
  payments: number;
};

type ProfitSummary = {
  sales: number;
  cogs: number;
  expenses: number;
  net: number;
  orders: number;
};

type StockRow = {
  bucket: StockBucket;
  product_id: string;
  product_name: string;
  sku: string | null;
  category: string | null;
  unit: string | null;
  store_id: string | null;
  qty_sold: number;
  sales_count: number;
  stock_on_hand: number;
  low_stock_threshold: number;
  stock_status: string;
  activity_score: number;
};



type Snapshot = {
  sales: SalesSummary;
  payments: ChannelSummary;
  expenses: ExpenseSummary;
  collections: CollectionsSummary;
  outstandingCredit: number;
  profit: ProfitSummary | null;
  stock: StockRow[];
};

const EMPTY_CHANNELS: ChannelSummary = {
  cash: 0,
  bank: 0,
  mobile: 0,
  credit: 0,
  other: 0,
};

const EMPTY_SNAPSHOT: Snapshot = {
  sales: {
    total: 0,
    orders: 0,
    direct: 0,
    club: 0,
  },
  payments: { ...EMPTY_CHANNELS },
  expenses: {
    total: 0,
    count: 0,
    channels: { ...EMPTY_CHANNELS },
  },
  collections: {
    cash: 0,
    bank: 0,
    mobile: 0,
    other: 0,
    payments: 0,
  },
  outstandingCredit: 0,
  profit: null,
  stock: [],
};

function n(v: any): number {
  const x = Number(v ?? 0);
  return Number.isFinite(x) ? x : 0;
}

function i(v: any): number {
  return Math.trunc(n(v));
}

function pad(v: number) {
  return String(v).padStart(2, "0");
}

function ymdLocal(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function parseYMD(v: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;

  const [y, m, d] = v.split("-").map(Number);
  const out = new Date(y, m - 1, d);

  if (
    out.getFullYear() !== y ||
    out.getMonth() !== m - 1 ||
    out.getDate() !== d
  ) {
    return null;
  }

  return out;
}

function addDaysYMD(v: string, days: number) {
  const d = parseYMD(v);

  if (!d) return v;

  d.setDate(d.getDate() + days);

  return ymdLocal(d);
}

function startISO(v: string) {
  const d = parseYMD(v);

  if (!d) {
    throw new Error("Invalid date");
  }

  d.setHours(0, 0, 0, 0);

  return d.toISOString();
}

function nextDayISO(v: string) {
  const d = parseYMD(v);

  if (!d) {
    throw new Error("Invalid date");
  }

  d.setDate(d.getDate() + 1);
  d.setHours(0, 0, 0, 0);

  return d.toISOString();
}

/**
 * get_store_net_profit_v2 currently treats its expense p_to
 * calendar date as inclusive.
 *
 * Sending the final millisecond of the selected day prevents
 * the next calendar day from being included in expenses.
 */
function profitToISO(v: string) {
  const d = parseYMD(v);

  if (!d) {
    throw new Error("Invalid date");
  }

  d.setHours(23, 59, 59, 999);

  return d.toISOString();
}

function money(v: number) {
  try {
    return `TSh ${Math.round(v).toLocaleString("en-US")}`;
  } catch {
    return `TSh ${Math.round(v)}`;
  }
}

function pct(v: number) {
  return `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;
}

function changePct(current: number, previous: number) {
  if (previous === 0) {
    return current > 0 ? 100 : 0;
  }

  return ((current - previous) / Math.abs(previous)) * 100;
}

function channelOf(v: any): Channel {
  const x = String(v ?? "")
    .trim()
    .toUpperCase();

  if (x === "CASH") {
    return "CASH";
  }

  if (
    x === "BANK" ||
    x === "BANK_TRANSFER" ||
    x === "TRANSFER"
  ) {
    return "BANK";
  }

  if (
    x === "MOBILE" ||
    x === "MOBILE_MONEY" ||
    x === "M-PESA" ||
    x === "MPESA" ||
    x === "TIGOPESA" ||
    x === "AIRTELMONEY" ||
    x === "HALOPESA" ||
    x === "AZAMPESA"
  ) {
    return "MOBILE";
  }

  if (x === "CREDIT") {
    return "CREDIT";
  }

  return "OTHER";
}

function stockBucket(v: any): StockBucket {
  const x = String(v ?? "")
    .trim()
    .toUpperCase();

  if (x === "FAST_MOVING") {
    return "FAST_MOVING";
  }

  if (x === "SLOW_MOVING") {
    return "SLOW_MOVING";
  }

  if (x === "DEAD_STOCK") {
    return "DEAD_STOCK";
  }

  return "LOW_STOCK";
}
function stockStatusView(v: any) {
  const raw = String(v ?? "OK")
    .trim()
    .toUpperCase();

  if (
    raw === "OUT_OF_STOCK" ||
    raw === "OUT OF STOCK"
  ) {
    return {
      label: "OUT OF STOCK",
      tone: "danger" as const,
    };
  }

  if (
    raw === "LOW_STOCK" ||
    raw === "LOW STOCK"
  ) {
    return {
      label: "LOW STOCK",
      tone: "warning" as const,
    };
  }

  return {
    label: raw.replace(/_/g, " "),
    tone: "normal" as const,
  };
}
function addChannels(
  a: ChannelSummary,
  b: ChannelSummary
): ChannelSummary {
  return {
    cash: a.cash + b.cash,
    bank: a.bank + b.bank,
    mobile: a.mobile + b.mobile,
    credit: a.credit + b.credit,
    other: a.other + b.other,
  };
}

function cleanError(e: any) {
  return String(
    e?.message ??
      e ??
      "Unknown error"
  );
}

function Card({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: any;
}) {
  return (
    <View style={[styles.card, style]}>
      {children}
    </View>
  );
}

function Metric({
  label,
  value,
  hint,
  wide = false,
}: {
  label: string;
  value: string;
  hint?: string;
  wide?: boolean;
}) {
  return (
    <View
      style={[
        styles.metric,
        wide && styles.metricWide,
      ]}
    >
      <Text style={styles.metricLabel}>
        {label}
      </Text>

      <Text
        numberOfLines={1}
        adjustsFontSizeToFit
        style={styles.metricValue}
      >
        {value}
      </Text>

      {!!hint && (
        <Text style={styles.metricHint}>
          {hint}
        </Text>
      )}
    </View>
  );
}

function SectionTitle({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <View style={styles.sectionHeading}>
      <Text style={styles.sectionTitle}>
        {title}
      </Text>

      {!!subtitle && (
        <Text style={styles.sectionSubtitle}>
          {subtitle}
        </Text>
      )}
    </View>
  );
}

function TinyPill({
  text,
  active = false,
  onPress,
}: {
  text: string;
  active?: boolean;
  onPress?: () => void;
}) {
  return (
    <Pressable
      disabled={!onPress}
      onPress={onPress}
      style={[
        styles.pill,
        active && styles.pillActive,
      ]}
    >
      <Text
        style={[
          styles.pillText,
          active && styles.pillTextActive,
        ]}
      >
        {text}
      </Text>
    </Pressable>
  );
}

export default function FinanceHistoryScreen() {
  const router = useRouter();
  const org = useOrg() as any;
  const { width } = useWindowDimensions();

  const orgId: string | null =
    org?.activeOrgId ??
    org?.activeOrganizationId ??
    org?.organization?.id ??
    null;

  const activeStoreId: string | null =
    org?.activeStoreId ??
    org?.store?.id ??
    null;

  const role = String(
    org?.activeRole ??
      org?.role ??
      ""
  ).toLowerCase();

  const isOwner = role === "owner";
  const isAdmin = role === "admin";

  const canAll = isOwner || isAdmin;
  const canSeeExpenses = isOwner || isAdmin;

  const today = useMemo(
    () => ymdLocal(new Date()),
    []
  );

  const [fromYMD, setFromYMD] =
    useState(today);

  const [toYMD, setToYMD] =
    useState(today);

  const [scope, setScope] =
    useState<Scope>(
      activeStoreId ? "STORE" : "ALL"
    );

  const [stores, setStores] =
    useState<StoreRow[]>([]);

  const [
    selectedStoreId,
    setSelectedStoreId,
  ] = useState<string | null>(
    activeStoreId
  );

  const [snapshot, setSnapshot] =
    useState<Snapshot>(
      EMPTY_SNAPSHOT
    );

  const [previous, setPrevious] =
    useState<Snapshot | null>(null);

  const [loading, setLoading] =
    useState(false);

  const [refreshing, setRefreshing] =
    useState(false);

const [errorText, setErrorText] =
  useState("");

type QuickRange =
  | 1
  | 7
  | 30
  | 90
  | 365
  | null;

const [quickRange, setQuickRangeSelected] =
  useState<QuickRange>(1);

const [expandedStock, setExpandedStock] =
  useState<Partial<Record<StockBucket, boolean>>>({});

const compact = width < 720;

  useEffect(() => {
    if (!canAll) {
      setScope("STORE");
    }
  }, [canAll]);

  useEffect(() => {
    if (activeStoreId) {
      setSelectedStoreId(
        activeStoreId
      );
    }
  }, [activeStoreId]);

  const loadStores =
    useCallback(async () => {
      if (!orgId) return;

      const {
        data,
        error,
      } = await supabase
        .from("stores")
        .select(
          "id,name,organization_id"
        )
        .eq(
          "organization_id",
          orgId
        )
        .order("name");

      if (error) {
        throw error;
      }

      const rows =
        (data ?? []) as StoreRow[];

      setStores(rows);

      if (
        !selectedStoreId &&
        rows.length
      ) {
        setSelectedStoreId(
          rows[0].id
        );
      }
    }, [
      orgId,
      selectedStoreId,
    ]);

  useEffect(() => {
    loadStores().catch((e) => {
      setErrorText(
        cleanError(e)
      );
    });
  }, [loadStores]);

  const targetStoreIds =
    useCallback(
      (
        wantedScope: Scope,
        wantedStoreId: string | null
      ) => {
        if (
          wantedScope === "STORE"
        ) {
          return wantedStoreId
            ? [wantedStoreId]
            : [];
        }

        return stores.map(
          (s) => s.id
        );
      },
      [stores]
    );

  const salesForStore =
    useCallback(
      async (
        storeId: string,
        fromISO: string,
        toISO: string
      ) => {
        const {
          data,
          error,
        } = await supabase.rpc(
          "get_sales",
          {
            p_store_id:
              storeId,
            p_from:
              fromISO,
            p_to:
              toISO,
          } as any
        );

        if (error) {
          throw error;
        }

        let total = 0;
        let orders = 0;
        let direct = 0;
        let club = 0;

        for (
          const r of
          (data ?? []) as any[]
        ) {
          const amount = n(
            r.total_amount
          );

          total += amount;
          orders += 1;

          const src = String(
            r.source ?? ""
          )
            .trim()
            .toUpperCase();

          if (
            src ===
              "CLUB_ORDER" ||
            src === "CLUB" ||
            src ===
              "BUSINESS_CLUB"
          ) {
            club += amount;
          } else {
            direct += amount;
          }
        }

        return {
          total,
          orders,
          direct,
          club,
        } as SalesSummary;
      },
      []
    );

  const paymentsForScope =
    useCallback(
      async (
        wantedScope: Scope,
        storeId: string | null,
        fromISO: string,
        toISO: string
      ) => {
        if (!orgId) {
          return {
            ...EMPTY_CHANNELS,
          };
        }

        const {
          data,
          error,
        } = await supabase.rpc(
          "get_sales_channel_summary_v3",
          {
            p_org_id:
              orgId,
            p_from:
              fromISO,
            p_to:
              toISO,
            p_store_id:
              wantedScope ===
              "STORE"
                ? storeId
                : null,
          } as any
        );

        if (error) {
          throw error;
        }

        const out = {
          ...EMPTY_CHANNELS,
        };

        for (
          const r of
          (data ?? []) as any[]
        ) {
          const c =
            channelOf(
              r.channel
            );

          const value = n(
            r.revenue
          );

          if (c === "CASH") {
            out.cash += value;
          } else if (
            c === "BANK"
          ) {
            out.bank += value;
          } else if (
            c === "MOBILE"
          ) {
            out.mobile += value;
          } else if (
            c === "CREDIT"
          ) {
            out.credit += value;
          } else {
            out.other += value;
          }
        }

        return out;
      },
      [orgId]
    );

  const collectionsForScope =
    useCallback(
      async (
        wantedScope: Scope,
        storeId: string | null,
        fromISO: string,
        toISO: string
      ) => {
        if (!orgId) {
          return {
            cash: 0,
            bank: 0,
            mobile: 0,
            other: 0,
            payments: 0,
          };
        }

        const {
          data,
          error,
        } = await supabase.rpc(
          "get_credit_collections_summary_v2",
          {
            p_org_id:
              orgId,
            p_from:
              fromISO,
            p_to:
              toISO,
            p_store_id:
              wantedScope ===
              "STORE"
                ? storeId
                : null,
          } as any
        );

        if (error) {
          throw error;
        }

        const out:
          CollectionsSummary = {
          cash: 0,
          bank: 0,
          mobile: 0,
          other: 0,
          payments: 0,
        };

        for (
          const r of
          (data ?? []) as any[]
        ) {
          const c =
            channelOf(
              r.channel
            );

          const value = n(
            r.amount
          );

          if (c === "CASH") {
            out.cash += value;
          } else if (
            c === "BANK"
          ) {
            out.bank += value;
          } else if (
            c === "MOBILE"
          ) {
            out.mobile += value;
          } else {
            out.other += value;
          }

          out.payments += i(
            r.payments
          );
        }

        return out;
      },
      [orgId]
    );

  const expenseForStore =
    useCallback(
      async (
        storeId: string,
        fromDate: string,
        toDate: string
      ) => {
        const {
          data,
          error,
        } = await supabase.rpc(
          "get_expense_summary_v2",
          {
            p_store_id:
              storeId,
            p_from:
              fromDate,
            p_to:
              toDate,
          } as any
        );

        if (error) {
          throw error;
        }

        const row: any =
          Array.isArray(data)
            ? data[0]
            : data;

        return {
          total: n(
            row?.total
          ),
          count: i(
            row?.count
          ),
        };
      },
      []
    );

  const expenseChannelsForStore =
    useCallback(
      async (
        storeId: string,
        fromDate: string,
        toDate: string
      ) => {
        const {
          data,
          error,
        } = await supabase.rpc(
          "get_expense_channel_summary_v2",
          {
            p_store_id:
              storeId,
            p_from:
              fromDate,
            p_to:
              toDate,
          } as any
        );

        if (error) {
          throw error;
        }

        const out = {
          ...EMPTY_CHANNELS,
        };

        for (
          const r of
          (data ?? []) as any[]
        ) {
          const c =
            channelOf(
              r.channel
            );

          const value = n(
            r.amount
          );

          if (c === "CASH") {
            out.cash += value;
          } else if (
            c === "BANK"
          ) {
            out.bank += value;
          } else if (
            c === "MOBILE"
          ) {
            out.mobile += value;
          } else {
            out.other += value;
          }
        }

        return out;
      },
      []
    );

  const creditBalanceForStore =
    useCallback(
      async (
        storeId: string
      ) => {
        const {
          data,
          error,
        } = await supabase.rpc(
          "get_store_credit_accounts_v2",
          {
            p_store_id:
              storeId,
            p_status:
              "OPEN",
          } as any
        );

        if (error) {
          throw error;
        }

        return (
          (data ?? []) as any[]
        ).reduce(
          (
            sum,
            r
          ) =>
            sum +
            Math.max(
              0,
              n(r.balance)
            ),
          0
        );
      },
      []
    );

  const profitForStore =
    useCallback(
      async (
        storeId: string,
        fromISO: string,
        selectedToYMD: string
      ) => {
        if (!isOwner) {
          return null;
        }

        const {
          data,
          error,
        } = await supabase.rpc(
          "get_store_net_profit_v2",
          {
            p_store_id:
              storeId,
            p_from:
              fromISO,
            p_to:
              profitToISO(
                selectedToYMD
              ),
          } as any
        );

        if (error) {
          throw error;
        }

        const r: any =
          Array.isArray(data)
            ? data[0]
            : data;

        return {
          sales: n(
            r?.sales_total
          ),
          cogs: n(
            r?.cogs_total
          ),
          expenses: n(
            r?.expenses_total
          ),
          net: n(
            r?.net_profit
          ),
          orders: i(
            r?.orders_count
          ),
        } as ProfitSummary;
      },
      [isOwner]
    );  const stockForScope =
    useCallback(
      async (
        wantedScope: Scope,
        storeId: string | null,
        fromISO: string,
        toISO: string
      ) => {
        if (!orgId) {
          return [];
        }

        const {
          data,
          error,
        } = await supabase.rpc(
          "get_stock_intelligence_v1",
          {
            p_org_id:
              orgId,
            p_store_id:
              wantedScope ===
              "STORE"
                ? storeId
                : null,
            p_scope:
              wantedScope,
            p_from:
              fromISO,
            p_to:
              toISO,
          p_limit:
  5000,
          } as any
        );

        if (error) {
          throw error;
        }

        return (
          (data ?? []) as any[]
        ).map(
          (r): StockRow => ({
            bucket:
              stockBucket(
                r.bucket
              ),
            product_id:
              String(
                r.product_id ??
                  ""
              ),
            product_name:
              String(
                r.product_name ??
                  "Product"
              ),
            sku:
              r.sku ?? null,
            category:
              r.category ??
              null,
            unit:
              r.unit ?? null,
            store_id:
              r.store_id ??
              null,
            qty_sold:
              n(r.qty_sold),
            sales_count:
              i(
                r.sales_count
              ),
            stock_on_hand:
              n(
                r.stock_on_hand
              ),
            low_stock_threshold:
              n(
                r.low_stock_threshold
              ),
            stock_status:
              String(
                r.stock_status ??
                  "OK"
              ),
            activity_score:
              n(
                r.activity_score
              ),
          })
        );
      },
      [orgId]
    );



 

  const buildSnapshot =
    useCallback(
      async (
        wantedScope: Scope,
        wantedStoreId:
          string | null,
        fromDate: string,
        toDate: string,
        includeSecondary = true
      ): Promise<Snapshot> => {
        if (!orgId) {
          throw new Error(
            "No active organization."
          );
        }

        const ids =
          targetStoreIds(
            wantedScope,
            wantedStoreId
          );

        if (!ids.length) {
          throw new Error(
            "No store available for this selection."
          );
        }

        const fromISO =
          startISO(fromDate);

        const toISO =
          nextDayISO(toDate);

        /*
         * SALES
         * Canonical sales data is always loaded,
         * regardless of which finance section
         * the user is viewing.
         */
        const salesParts =
          await Promise.all(
            ids.map(
              (sid) =>
                salesForStore(
                  sid,
                  fromISO,
                  toISO
                )
            )
          );

        const sales =
          salesParts.reduce<SalesSummary>(
            (
              a,
              b
            ) => ({
              total:
                a.total +
                b.total,
              orders:
                a.orders +
                b.orders,
              direct:
                a.direct +
                b.direct,
              club:
                a.club +
                b.club,
            }),
            {
              total: 0,
              orders: 0,
              direct: 0,
              club: 0,
            }
          );

        /*
         * PAYMENT CHANNELS + CREDIT COLLECTIONS
         *
         * No frontend split-payment parser here.
         * get_sales_channel_summary_v3 already
         * handles sale_payments and split notes.
         */
        const [
          payments,
          collections,
        ] = await Promise.all([
          paymentsForScope(
            wantedScope,
            wantedStoreId,
            fromISO,
            toISO
          ),
          collectionsForScope(
            wantedScope,
            wantedStoreId,
            fromISO,
            toISO
          ),
        ]);

        /*
         * EXPENSES
         */
        let expenses:
          ExpenseSummary = {
          total: 0,
          count: 0,
          channels: {
            ...EMPTY_CHANNELS,
          },
        };

        if (
          canSeeExpenses
        ) {
          const expenseParts =
            await Promise.all(
              ids.map(
                async (
                  sid
                ) => {
                  const [
                    summary,
                    channels,
                  ] =
                    await Promise.all(
                      [
                        expenseForStore(
                          sid,
                          fromDate,
                          toDate
                        ),
                        expenseChannelsForStore(
                          sid,
                          fromDate,
                          toDate
                        ),
                      ]
                    );

                  return {
                    summary,
                    channels,
                  };
                }
              )
            );

          expenses =
            expenseParts.reduce<ExpenseSummary>(
              (
                a,
                b
              ) => ({
                total:
                  a.total +
                  b.summary
                    .total,
                count:
                  a.count +
                  b.summary
                    .count,
                channels:
                  addChannels(
                    a.channels,
                    b.channels
                  ),
              }),
              {
                total: 0,
                count: 0,
                channels: {
                  ...EMPTY_CHANNELS,
                },
              }
            );
        }

        /*
         * OUTSTANDING CREDIT
         * This is current balance, not a historical
         * date-range value.
         */
        const creditParts =
          await Promise.all(
            ids.map(
              (sid) =>
                creditBalanceForStore(
                  sid
                )
            )
          );

        const outstandingCredit =
          creditParts.reduce(
            (
              a,
              b
            ) => a + b,
            0
          );

        /*
         * OWNER PROFIT
         */
        let profit:
          ProfitSummary | null =
          null;

        if (isOwner) {
          const profitParts =
            await Promise.all(
              ids.map(
                (sid) =>
                  profitForStore(
                    sid,
                    fromISO,
                    toDate
                  )
              )
            );

          profit =
            (
              profitParts.filter(
                Boolean
              ) as ProfitSummary[]
            ).reduce<ProfitSummary>(
              (
                a,
                b
              ) => ({
                sales:
                  a.sales +
                  b.sales,
                cogs:
                  a.cogs +
                  b.cogs,
                expenses:
                  a.expenses +
                  b.expenses,
                net:
                  a.net +
                  b.net,
                orders:
                  a.orders +
                  b.orders,
              }),
              {
                sales: 0,
                cogs: 0,
                expenses: 0,
                net: 0,
                orders: 0,
              }
            );
        }

        /*
         * INVENTORY INTELLIGENCE
         *
         * Stock intelligence is secondary to the verified
         * Finance totals. If this RPC fails, the core
         * Finance page must still render normally.
         */
        let stock: StockRow[] = [];

        if (includeSecondary) {
          const result = await Promise.allSettled([
            stockForScope(
              wantedScope,
              wantedStoreId,
              fromISO,
              toISO
            ),
          ]);

          if (result[0].status === "fulfilled") {
            stock = result[0].value as StockRow[];
          }
        }

        return {
          sales,
          payments,
          expenses,
          collections,
          outstandingCredit,
          profit,
          stock,
        };
      },
      [
        orgId,
        targetStoreIds,
        salesForStore,
        paymentsForScope,
        collectionsForScope,
        canSeeExpenses,
        expenseForStore,
        expenseChannelsForStore,
        creditBalanceForStore,
        isOwner,
        profitForStore,
        stockForScope,
      ]
    );

  const run =
    useCallback(
      async (
        asRefresh = false
      ) => {
        if (!orgId) {
          return;
        }

        if (
          !parseYMD(
            fromYMD
          ) ||
          !parseYMD(
            toYMD
          )
        ) {
          setErrorText(
            "Use date format YYYY-MM-DD."
          );
          return;
        }

        if (
          fromYMD >
          toYMD
        ) {
          setErrorText(
            "From date cannot be after To date."
          );
          return;
        }

        if (
          scope ===
            "STORE" &&
          !selectedStoreId
        ) {
          setErrorText(
            "Choose a store."
          );
          return;
        }

        if (asRefresh) {
          setRefreshing(
            true
          );
        } else {
          setLoading(
            true
          );
        }

        setErrorText("");

        try {
          /*
           * CURRENT PERIOD
           */
          const current =
            await buildSnapshot(
              scope,
              selectedStoreId,
              fromYMD,
              toYMD,
              true
            );

          /*
           * PREVIOUS EQUIVALENT PERIOD
           */
          const from =
            parseYMD(
              fromYMD
            )!;

          const to =
            parseYMD(
              toYMD
            )!;

          const days =
            Math.floor(
              (
                to.getTime() -
                from.getTime()
              ) /
                86400000
            ) + 1;

          const previousTo =
            addDaysYMD(
              fromYMD,
              -1
            );

          const previousFrom =
            addDaysYMD(
              previousTo,
              -(
                days - 1
              )
            );

          const prev =
            await buildSnapshot(
              scope,
              selectedStoreId,
              previousFrom,
              previousTo,
              false
            );

          setSnapshot(
            current
          );

          setPrevious(
            prev
          );
        } catch (e) {
          setErrorText(
            cleanError(e)
          );
        } finally {
          setLoading(
            false
          );

          setRefreshing(
            false
          );
        }
      },
      [
        orgId,
        fromYMD,
        toYMD,
        scope,
        selectedStoreId,
        buildSnapshot,
      ]
    );

  /*
   * Initial load and automatic reload
   * when period/scope/store changes.
   */
  useEffect(() => {
    if (
      !orgId ||
      !stores.length
    ) {
      return;
    }

    run(false);
  }, [
    orgId,
    stores.length,
    scope,
    selectedStoreId,
    fromYMD,
    toYMD,
    run,
  ]);

const setQuickRange =
  useCallback(
    (days: 1 | 7 | 30 | 90 | 365) => {
      const end = ymdLocal(new Date());

      const start = addDaysYMD(
        end,
        -(days - 1)
      );

      setQuickRangeSelected(days);
      setFromYMD(start);
      setToYMD(end);

      // Period mpya inaanza ikiwa collapsed.
      setExpandedStock({});
    },
    []
  );

const changeFromDate =
  useCallback((value: string) => {
    setQuickRangeSelected(null);
    setFromYMD(value);
    setExpandedStock({});
  }, []);

const changeToDate =
  useCallback((value: string) => {
    setQuickRangeSelected(null);
    setToYMD(value);
    setExpandedStock({});
  }, []);

const toggleStockGroup =
  useCallback((bucket: StockBucket) => {
    setExpandedStock((current) => ({
      ...current,
      [bucket]: !current[bucket],
    }));
  }, []);

  const selectedStoreName =
    stores.find(
      (s) =>
        s.id ===
        selectedStoreId
    )?.name ??
    "Store";

  /*
   * VERIFIED MONEY FLOW
   *
   * Money available per channel =
   * sale payments
   * + credit collections
   * - expenses paid through that channel.
   *
   * Each channel is floored independently at zero,
   * matching the previous verified Finance behavior.
   */
  const collectionsTotal =
    snapshot.collections
      .cash +
    snapshot.collections
      .bank +
    snapshot.collections
      .mobile +
    snapshot.collections
      .other;

  const availableCash =
    Math.max(
      0,
      snapshot.payments
        .cash +
        snapshot
          .collections
          .cash -
        snapshot.expenses
          .channels.cash
    );

  const availableBank =
    Math.max(
      0,
      snapshot.payments
        .bank +
        snapshot
          .collections
          .bank -
        snapshot.expenses
          .channels.bank
    );

  const availableMobile =
    Math.max(
      0,
      snapshot.payments
        .mobile +
        snapshot
          .collections
          .mobile -
        snapshot.expenses
          .channels.mobile
    );

  const availableOther =
    Math.max(
      0,
      snapshot.payments
        .other +
        snapshot
          .collections
          .other -
        snapshot.expenses
          .channels.other
    );

  const moneyIn =
    availableCash +
    availableBank +
    availableMobile +
    availableOther;

  const avgOrder =
    snapshot.sales
      .orders > 0
      ? snapshot.sales
          .total /
        snapshot.sales
          .orders
      : 0;

  const grossProfit =
    snapshot.profit
      ? snapshot.profit
          .sales -
        snapshot.profit
          .cogs
      : 0;

  /*
   * STOCK BUCKETS
   */
  const stockGroups =
    useMemo(() => {
      const buckets:
        StockBucket[] = [
        "FAST_MOVING",
        "SLOW_MOVING",
        "DEAD_STOCK",
        "LOW_STOCK",
      ];

      return buckets.map(
        (
          bucket
        ) => ({
          bucket,
          rows:
            snapshot.stock.filter(
              (r) =>
                r.bucket ===
                bucket
            ),
        })
      );
    }, [
      snapshot.stock,
    ]);

  /*
   * FACTUAL BUSINESS INSIGHTS
   *
   * No AI claim and no causal assumptions.
   */
  const insights =
    useMemo(() => {
      const out:
        string[] = [];

      if (previous) {
        const salesDelta =
          changePct(
            snapshot.sales
              .total,
            previous.sales
              .total
          );

        if (
          Math.abs(
            salesDelta
          ) >= 1
        ) {
          out.push(
            `Sales ${
              salesDelta >= 0
                ? "increased"
                : "decreased"
            } ${Math.abs(
              salesDelta
            ).toFixed(
              1
            )}% versus the previous equivalent period.`
          );
        }

        if (
          canSeeExpenses &&
          snapshot.sales
            .total > 0
        ) {
          const expenseRatio =
            (
              snapshot
                .expenses
                .total /
              snapshot.sales
                .total
            ) * 100;

          out.push(
            `Expenses are ${expenseRatio.toFixed(
              1
            )}% of sales for the selected period.`
          );
        }
      }

      if (
        snapshot
          .outstandingCredit >
        0
      ) {
        out.push(
          `${money(
            snapshot.outstandingCredit
          )} remains outstanding in customer credit.`
        );
      }

      const low =
        stockGroups.find(
          (x) =>
            x.bucket ===
            "LOW_STOCK"
        )?.rows ?? [];

      if (
        low.length
      ) {
        out.push(
          `${low.length} priority stock-risk item${
            low.length === 1
              ? ""
              : "s"
          } are shown for review.`
        );
      }



      if (
        !out.length
      ) {
        out.push(
          "No major exception is visible in the selected period."
        );
      }

      return out.slice(0, 3);
    }, [
      previous,
      snapshot.sales
        .total,
      snapshot.expenses
        .total,
      snapshot
        .outstandingCredit,

      stockGroups,
      canSeeExpenses,
    ]);

  const deltaSales =
    previous
      ? changePct(
          snapshot.sales
            .total,
          previous.sales
            .total
        )
      : 0;

  const deltaExpenses =
    previous &&
    canSeeExpenses
      ? changePct(
          snapshot
            .expenses
            .total,
          previous
            .expenses
            .total
        )
      : 0;

  const deltaProfit =
    previous &&
    snapshot.profit &&
    previous.profit
      ? changePct(
          snapshot.profit
            .net,
          previous.profit
            .net
        )
      : 0;
  const selectedPeriodDays =
    parseYMD(fromYMD) && parseYMD(toYMD)
      ? Math.floor(
          (parseYMD(toYMD)!.getTime() -
            parseYMD(fromYMD)!.getTime()) /
            86400000
        ) + 1
      : 0;
  return (
    <Screen>
      <ScrollView
        contentContainerStyle={[
          styles.page,
          {
            maxWidth:
              compact
                ? undefined
                : 1040,
          },
        ]}
        refreshControl={
          <RefreshControl
            refreshing={
              refreshing
            }
            onRefresh={() =>
              run(true)
            }
          />
        }
        keyboardShouldPersistTaps="handled"
      >
        {/* HEADER */}
     <View style={styles.header}>
  <Pressable
    onPress={() => router.back()}
    style={styles.iconButton}
  >
            <SafeIcon
              name="arrow-back"
              size={20}
              color="#0F172A"
            />
          </Pressable>

          <View
            style={
              styles.headerCopy
            }
          >
            <Text
              style={
                styles.title
              }
            >
              Finance
            </Text>

            <Text
              style={
                styles.subtitle
              }
            >
              {scope ===
              "ALL"
                ? "All stores"
                : selectedStoreName}
              {" · "}
              {fromYMD}
              {" → "}
              {toYMD}
            </Text>
          </View>

          <Pressable
            onPress={() =>
              run(true)
            }
            style={
              styles.iconButton
            }
          >
            {refreshing ? (
              <ActivityIndicator
                size="small"
              />
            ) : (
              <SafeIcon
                name="refresh"
                size={20}
                color="#0F172A"
              />
            )}
          </Pressable>
        </View>

        {/* FILTERS */}
        <Card>
          <View
            style={
              styles.filterTop
            }
          >
            <View>
              <Text
                style={
                  styles.eyebrow
                }
              >
                PERIOD & SCOPE
              </Text>

              <Text
                style={
                  styles.filterTitle
                }
              >
                Finance history
              </Text>
            </View>

            {canAll && (
              <View
                style={
                  styles.pillRow
                }
              >
                <TinyPill
                  text="Store"
                  active={
                    scope ===
                    "STORE"
                  }
                  onPress={() =>
                    setScope(
                      "STORE"
                    )
                  }
                />

                <TinyPill
                  text="All Stores"
                  active={
                    scope ===
                    "ALL"
                  }
                  onPress={() =>
                    setScope(
                      "ALL"
                    )
                  }
                />
              </View>
            )}
          </View>

          {scope ===
            "STORE" &&
            stores.length >
              1 && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={
                  false
                }
                contentContainerStyle={
                  styles.storeScroller
                }
              >
                {stores.map(
                  (s) => (
                    <TinyPill
                      key={
                        s.id
                      }
                      text={
                        s.name
                      }
                      active={
                        s.id ===
                        selectedStoreId
                      }
                      onPress={() =>
                        setSelectedStoreId(
                          s.id
                        )
                      }
                    />
                  )
                )}
              </ScrollView>
            )}

          <View
            style={[
              styles.dateRow,
              compact &&
                styles.dateRowCompact,
            ]}
          >
            <View
              style={
                styles.dateField
              }
            >
              <Text
                style={
                  styles.inputLabel
                }
              >
                From
              </Text>

              <TextInput
  value={fromYMD}
  onChangeText={changeFromDate}
  placeholder="YYYY-MM-DD"
  style={styles.input}
  autoCapitalize="none"
/>
            </View>

            <View
              style={
                styles.dateField
              }
            >
              <Text
                style={
                  styles.inputLabel
                }
              >
                To
              </Text>

              <TextInput
  value={toYMD}
  onChangeText={changeToDate}
  placeholder="YYYY-MM-DD"
  style={styles.input}
  autoCapitalize="none"
/>
            </View>
          </View>

 <View style={styles.pillRow}>
  <TinyPill
    text="Today"
    active={quickRange === 1}
    onPress={() => setQuickRange(1)}
  />

  <TinyPill
    text="7 Days"
    active={quickRange === 7}
    onPress={() => setQuickRange(7)}
  />

  <TinyPill
    text="30 Days"
    active={quickRange === 30}
    onPress={() => setQuickRange(30)}
  />

  <TinyPill
    text="90 Days"
    active={quickRange === 90}
    onPress={() => setQuickRange(90)}
  />

  <TinyPill
    text="1 Year"
    active={quickRange === 365}
    onPress={() => setQuickRange(365)}
  />
</View>
        </Card>

        {Boolean(errorText) ? (
          <View
            style={
              styles.errorBox
            }
          >
            <Text
              style={
                styles.errorTitle
              }
            >
              Could not load Finance
            </Text>

            <Text
              style={
                styles.errorText
              }
            >
              {errorText}
            </Text>
          </View>
        ) : null}

        {loading ? (
          <Card
            style={
              styles.loadingCard
            }
          >
            <ActivityIndicator
              size="large"
            />

            <Text
              style={
                styles.loadingText
              }
            >
              Loading finance data…
            </Text>
          </Card>
        ) : (
          <>
            {/* OVERVIEW */}
            <SectionTitle
              title="Overview"
              subtitle="The important numbers first."
            />

            <View
              style={
                styles.metricsGrid
              }
            >
              <Metric
                label="Sales"
                value={money(
                  snapshot.sales
                    .total
                )}
              />

              <Metric
                label="Money In"
                value={money(
                  moneyIn
                )}
              />

              {canSeeExpenses && (
                <Metric
                  label="Expenses"
                  value={money(
                    snapshot
                      .expenses
                      .total
                  )}
                />
              )}

              {isOwner &&
                snapshot.profit && (
                  <Metric
                    label="Net Profit"
                    value={money(
                      snapshot
                        .profit!
                        .net
                    )}
                  />
                )}

              <Metric
                label="Orders"
                value={String(
                  snapshot.sales
                    .orders
                )}
                hint={`Avg ${money(
                  avgOrder
                )}`}
              />

              <Metric
                label="Outstanding Credit"
                value={money(
                  snapshot.outstandingCredit
                )}
                hint="Current balance"
              />
            </View>

            {/* MONEY FLOW */}
            <SectionTitle
              title="Money Flow"
              subtitle="Available inflow after expenses by payment channel."
            />

            <Card>
              <View style={styles.compactMoneyGrid}>
                <View style={styles.compactMoneyCell}>
                  <Text style={styles.compactMoneyLabel}>
                    Cash
                  </Text>
                  <Text
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    style={styles.compactMoneyValue}
                  >
                    {money(availableCash)}
                  </Text>
                </View>

                <View style={styles.compactMoneyCell}>
                  <Text style={styles.compactMoneyLabel}>
                    Mobile
                  </Text>
                  <Text
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    style={styles.compactMoneyValue}
                  >
                    {money(availableMobile)}
                  </Text>
                </View>

                <View style={styles.compactMoneyCell}>
                  <Text style={styles.compactMoneyLabel}>
                    Bank
                  </Text>
                  <Text
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    style={styles.compactMoneyValue}
                  >
                    {money(availableBank)}
                  </Text>
                </View>

                <View style={styles.compactMoneyCell}>
                  <Text style={styles.compactMoneyLabel}>
                    Other
                  </Text>
                  <Text
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    style={styles.compactMoneyValue}
                  >
                    {money(availableOther)}
                  </Text>
                </View>
              </View>

              <View
                style={
                  styles.divider
                }
              />

              <View
                style={
                  styles.twoCol
                }
              >
                <View
                  style={
                    styles.infoBlock
                  }
                >
                  <Text
                    style={
                      styles.infoLabel
                    }
                  >
                    Credit Collections
                  </Text>

                  <Text
                    style={
                      styles.infoValue
                    }
                  >
                    {money(
                      collectionsTotal
                    )}
                  </Text>

                  <Text style={styles.infoHint}>
  {`${snapshot.collections.payments} ${
    snapshot.collections.payments === 1 ? "payment" : "payments"
  }`}
</Text>
                </View>

                <View
                  style={
                    styles.infoBlock
                  }
                >
                  <Text
                    style={
                      styles.infoLabel
                    }
                  >
                    Credit Today
                  </Text>

                  <Text
                    style={
                      styles.infoValue
                    }
                  >
                    {money(
                      snapshot
                        .payments
                        .credit
                    )}
                  </Text>

                  <Text
                    style={
                      styles.infoHint
                    }
                  >
                    Outstanding{" "}
                    {money(
                      snapshot
                        .outstandingCredit
                    )}
                  </Text>
                </View>
              </View>

              {canSeeExpenses && (
                <>
                  <View
                    style={
                      styles.divider
                    }
                  />

                  <Text
                    style={
                      styles.miniHeading
                    }
                  >
                    EXPENSE CHANNELS
                  </Text>

                  <View
                    style={
                      styles.channelLine
                    }
                  >
                    <Text
                      style={
                        styles.channelText
                      }
                    >
                      Cash{" "}
                      {money(
                        snapshot
                          .expenses
                          .channels
                          .cash
                      )}
                    </Text>

                    <Text
                      style={
                        styles.channelText
                      }
                    >
                      Mobile{" "}
                      {money(
                        snapshot
                          .expenses
                          .channels
                          .mobile
                      )}
                    </Text>

                    <Text
                      style={
                        styles.channelText
                      }
                    >
                      Bank{" "}
                      {money(
                        snapshot
                          .expenses
                          .channels
                          .bank
                      )}
                    </Text>

                    <Text
                      style={
                        styles.channelText
                      }
                    >
                      Other{" "}
                      {money(
                        snapshot
                          .expenses
                          .channels
                          .other
                      )}
                    </Text>
                  </View>
                </>
              )}
            </Card>            {/* PROFITABILITY */}
            {isOwner &&
              snapshot.profit && (
                <>
                  <SectionTitle
                    title="Profitability"
                    subtitle="Owner-only profitability for this period."
                  />

                  <Card>
                    <View style={styles.compactMoneyGrid}>
                      <View style={styles.compactMoneyCell}>
                        <Text style={styles.compactMoneyLabel}>
                          Sales
                        </Text>
                        <Text
                          numberOfLines={1}
                          adjustsFontSizeToFit
                          style={styles.compactMoneyValue}
                        >
                          {money(snapshot.profit.sales)}
                        </Text>
                      </View>

                      <View style={styles.compactMoneyCell}>
                        <Text style={styles.compactMoneyLabel}>
                          COGS
                        </Text>
                        <Text
                          numberOfLines={1}
                          adjustsFontSizeToFit
                          style={styles.compactMoneyValue}
                        >
                          {money(snapshot.profit.cogs)}
                        </Text>
                      </View>

                      <View style={styles.compactMoneyCell}>
                        <Text style={styles.compactMoneyLabel}>
                          Gross Profit
                        </Text>
                        <Text
                          numberOfLines={1}
                          adjustsFontSizeToFit
                          style={styles.compactMoneyValue}
                        >
                          {money(grossProfit)}
                        </Text>
                      </View>

                      <View style={styles.compactMoneyCell}>
                        <Text style={styles.compactMoneyLabel}>
                          Net Profit
                        </Text>
                        <Text
                          numberOfLines={1}
                          adjustsFontSizeToFit
                          style={styles.compactMoneyValue}
                        >
                          {money(snapshot.profit.net)}
                        </Text>
                      </View>
                    </View>
                  </Card>
                </>
              )}

            {/* PERFORMANCE */}
            <SectionTitle
              title="Performance"
              subtitle={`vs previous ${selectedPeriodDays} ${
                selectedPeriodDays === 1 ? "day" : "days"
              }`}
            />

            <Card>
              <View
                style={
                  styles.compareRow
                }
              >
                <View>
                  <Text
                    style={
                      styles.compareLabel
                    }
                  >
                    Sales
                  </Text>

                  <Text
                    style={
                      styles.compareValue
                    }
                  >
                    {money(
                      snapshot
                        .sales
                        .total
                    )}
                  </Text>
                </View>

                <Text
                  style={[
                    styles.delta,
                    deltaSales <
                      0 &&
                      styles.deltaNegative,
                  ]}
                >
                  {previous
                    ? pct(
                        deltaSales
                      )
                    : "—"}
                </Text>
              </View>

              {canSeeExpenses && (
                <View
                  style={
                    styles.compareRow
                  }
                >
                  <View>
                    <Text
                      style={
                        styles.compareLabel
                      }
                    >
                      Expenses
                    </Text>

                    <Text
                      style={
                        styles.compareValue
                      }
                    >
                      {money(
                        snapshot
                          .expenses
                          .total
                      )}
                    </Text>
                  </View>

                  <Text
                    style={[
                      styles.delta,
                      deltaExpenses >
                        0 &&
                        styles.deltaWarning,
                    ]}
                  >
                    {previous
                      ? pct(
                          deltaExpenses
                        )
                      : "—"}
                  </Text>
                </View>
              )}

              {isOwner &&
                snapshot.profit && (
                  <View
                    style={
                      styles.compareRow
                    }
                  >
                    <View>
                      <Text
                        style={
                          styles.compareLabel
                        }
                      >
                        Net Profit
                      </Text>

                      <Text
                        style={
                          styles.compareValue
                        }
                      >
                        {money(
                          snapshot
                            .profit
                            .net
                        )}
                      </Text>
                    </View>

                    <Text
                      style={[
                        styles.delta,
                        deltaProfit <
                          0 &&
                          styles.deltaNegative,
                      ]}
                    >
                      {previous
                        ? pct(
                            deltaProfit
                          )
                        : "—"}
                    </Text>
                  </View>
                )}
            </Card>

            {/* INVENTORY */}
            <SectionTitle
              title="Inventory Intelligence"
              subtitle="Movement and stock risk are shown separately."
            />

            <Card>
              <View
                style={
                  styles.stockSummary
                }
              >
                {stockGroups.map(
                  (g) => (
                    <View
                      key={
                        g.bucket
                      }
                      style={
                        styles.stockCount
                      }
                    >
                      <Text
                        style={
                          styles.stockCountValue
                        }
                      >
                        {
                          g.rows
                            .length
                        }
                      </Text>

                      <Text
                        style={
                          styles.stockCountLabel
                        }
                      >
                        {g.bucket === "FAST_MOVING"
                          ? "Fast"
                          : g.bucket === "SLOW_MOVING"
                          ? "Slow"
                          : g.bucket === "DEAD_STOCK"
                          ? "No Sales"
                          : "Stock Risk"}
                      </Text>
                    </View>
                  )
                )}
              </View>

              {stockGroups.map((g) => {
                if (!g.rows.length) {
                  return null;
                }

                const isExpanded =
                  !!expandedStock[g.bucket];

                const visibleRows =
                  isExpanded
                    ? g.rows
                    : g.rows.slice(0, 3);

                const hasMore =
                  g.rows.length > 3;

                return (
                <View
  key={`${g.bucket}-rows`}
  style={[
    styles.stockGroup,

    g.bucket === "FAST_MOVING" &&
      styles.stockGroupFast,

    g.bucket === "SLOW_MOVING" &&
      styles.stockGroupSlow,

    g.bucket === "DEAD_STOCK" &&
      styles.stockGroupDead,

    g.bucket === "LOW_STOCK" &&
      styles.stockGroupRisk,
  ]}
>
                    <View
                      style={styles.stockGroupHeader}
                    >
                      <Text
                        style={styles.miniHeading}
                      >
                        {g.bucket === "DEAD_STOCK"
                          ? "NO SALES IN PERIOD"
                          : g.bucket === "LOW_STOCK"
                          ? "STOCK RISK"
                          : g.bucket.replace(/_/g, " ")}
                      </Text>

                      <Text
                        style={styles.stockGroupCount}
                      >
                        {g.rows.length}{" "}
                        {g.rows.length === 1
                          ? "item"
                          : "items"}
                      </Text>
                    </View>

                    {visibleRows.map((r) => (
                      <View
                        key={`${g.bucket}-${r.product_id}-${r.store_id ?? ""}`}
                        style={styles.stockRow}
                      >
                        <View
                          style={styles.stockMain}
                        >
                          <Text
                            numberOfLines={1}
                            style={styles.stockName}
                          >
                            {r.product_name}
                          </Text>

                        <View style={styles.stockMetaLine}>
  <Text style={styles.stockMeta}>
    Sold {r.qty_sold}
    {" · "}
    On hand {r.stock_on_hand}
    {" · "}
  </Text>

  {(() => {
    const status = stockStatusView(
      r.stock_status
    );

    return (
      <Text
        style={[
          styles.stockStatus,
          status.tone === "danger" &&
            styles.stockStatusDanger,
          status.tone === "warning" &&
            styles.stockStatusWarning,
        ]}
      >
        {status.label}
      </Text>
    );
  })()}
</View>
                        </View>

                        <Text
                          style={styles.stockActivity}
                        >
                          {r.activity_score.toFixed(1)}
                        </Text>
                      </View>
                    ))}

                    {hasMore && (
                      <Pressable
                        onPress={() =>
                          toggleStockGroup(g.bucket)
                        }
                        style={styles.seeMoreButton}
                      >
                        <Text
                          style={styles.seeMoreText}
                        >
                          {isExpanded
                            ? "Show less"
                            : `See more (${g.rows.length - 3})`}
                        </Text>

                        <SafeIcon
                          name={
                            isExpanded
                              ? "chevron-up"
                              : "chevron-down"
                          }
                          size={16}
                          color="#2563EB"
                        />
                      </Pressable>
                    )}
                  </View>
                );
              })}
            </Card>

            {/* BUSINESS INSIGHTS */}
            <SectionTitle
              title="Business Insights"
              subtitle="Facts and review points from the selected period."
            />

            <Card>
              {insights.map(
                (
                  item,
                  idx
                ) => (
                  <View
                    key={`${idx}-${item}`}
                    style={[
                      styles.insightRow,
                      idx ===
                        insights.length -
                          1 &&
                        styles.insightRowLast,
                    ]}
                  >
                    <View
                      style={
                        styles.insightIndex
                      }
                    >
                      <Text
                        style={
                          styles.insightIndexText
                        }
                      >
                        {idx +
                          1}
                      </Text>
                    </View>

                    <Text
                      style={
                        styles.insightText
                      }
                    >
                      {item}
                    </Text>
                  </View>
                )
              )}
            </Card>

            <View
              style={
                styles.footerSpace
              }
            />
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

/* ============================================================
   STYLES
   ============================================================ */

const styles =
  StyleSheet.create({
    page: {
      width: "100%",
      alignSelf:
        "center",
      paddingHorizontal:
        16,
      paddingTop: 10,
      paddingBottom:
        36,
      gap: 12,
    },

    header: {
      flexDirection:
        "row",
      alignItems:
        "center",
      gap: 12,
      paddingVertical:
        6,
    },

    headerCopy: {
      flex: 1,
    },

    title: {
      fontSize: 26,
      lineHeight: 32,
      fontWeight:
        "800",
      color:
        "#0F172A",
    },

    subtitle: {
      marginTop: 2,
      fontSize: 12,
      lineHeight: 18,
      color:
        "#64748B",
    },

    iconButton: {
      width: 42,
      height: 42,
      borderRadius:
        14,
      alignItems:
        "center",
      justifyContent:
        "center",
      backgroundColor:
        "#FFFFFF",
      borderWidth: 1,
      borderColor:
        "#E2E8F0",
    },

    card: {
      backgroundColor:
        "#FFFFFF",
      borderRadius:
        18,
      borderWidth: 1,
      borderColor:
        "#E2E8F0",
      padding: 16,
    },

    filterTop: {
      flexDirection:
        "row",
      alignItems:
        "center",
      justifyContent:
        "space-between",
      gap: 12,
      flexWrap:
        "wrap",
    },

    eyebrow: {
      fontSize: 10,
      letterSpacing:
        1.2,
      fontWeight:
        "800",
      color:
        "#64748B",
    },

    filterTitle: {
      marginTop: 3,
      fontSize: 18,
      fontWeight:
        "800",
      color:
        "#0F172A",
    },

    pillRow: {
      flexDirection:
        "row",
      alignItems:
        "center",
      gap: 8,
      flexWrap:
        "wrap",
    },

    pill: {
      minHeight: 34,
      justifyContent:
        "center",
      paddingHorizontal:
        12,
      borderRadius:
        999,
      backgroundColor:
        "#F8FAFC",
      borderWidth: 1,
      borderColor:
        "#E2E8F0",
    },

    pillActive: {
      backgroundColor:
        "#EFF6FF",
      borderColor:
        "#93C5FD",
    },

    pillText: {
      fontSize: 12,
      fontWeight:
        "700",
      color:
        "#475569",
    },

    pillTextActive: {
      color:
        "#1D4ED8",
    },

    storeScroller: {
      gap: 8,
      paddingTop: 14,
      paddingRight:
        10,
    },

    dateRow: {
      flexDirection:
        "row",
      gap: 12,
      marginTop: 14,
      marginBottom:
        12,
    },

    dateRowCompact: {
      flexDirection:
        "column",
    },

    dateField: {
      flex: 1,
    },

    inputLabel: {
      marginBottom: 6,
      fontSize: 11,
      fontWeight:
        "700",
      color:
        "#64748B",
    },

    input: {
      minHeight: 44,
      borderWidth: 1,
      borderColor:
        "#CBD5E1",
      borderRadius:
        12,
      paddingHorizontal:
        12,
      fontSize: 14,
      color:
        "#0F172A",
      backgroundColor:
        "#FFFFFF",
    },

    errorBox: {
      borderRadius:
        14,
      padding: 14,
      borderWidth: 1,
      borderColor:
        "#FECACA",
      backgroundColor:
        "#FEF2F2",
    },

    errorTitle: {
      fontSize: 13,
      fontWeight:
        "800",
      color:
        "#991B1B",
    },

    errorText: {
      marginTop: 4,
      fontSize: 12,
      lineHeight: 18,
      color:
        "#B91C1C",
    },

    loadingCard: {
      alignItems:
        "center",
      paddingVertical:
        34,
    },

    loadingText: {
      marginTop: 10,
      fontSize: 13,
      color:
        "#64748B",
    },

    sectionHeading: {
      marginTop: 8,
      marginBottom: 0,
    },

    sectionTitle: {
      fontSize: 17,
      lineHeight: 23,
      fontWeight:
        "800",
      color:
        "#0F172A",
    },

    sectionSubtitle: {
      marginTop: 2,
      fontSize: 12,
      lineHeight: 18,
      color:
        "#64748B",
    },

    metricsGrid: {
      flexDirection:
        "row",
      flexWrap:
        "wrap",
      gap: 10,
    },

    metricsGridInner: {
      flexDirection:
        "row",
      flexWrap:
        "wrap",
      gap: 10,
    },
    compactMoneyGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      borderWidth: 1,
      borderColor: "#E2E8F0",
      borderRadius: 16,
      overflow: "hidden",
    },

    compactMoneyCell: {
      width: "50%",
      minHeight: 92,
      paddingHorizontal: 14,
      paddingVertical: 13,
      justifyContent: "center",
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: "#E2E8F0",
      backgroundColor: "#FFFFFF",
    },

    compactMoneyLabel: {
      fontSize: 11,
      lineHeight: 16,
      fontWeight: "700",
      color: "#64748B",
    },

    compactMoneyValue: {
      marginTop: 5,
      fontSize: 18,
      lineHeight: 24,
      fontWeight: "800",
      color: "#0F172A",
    },
    metric: {
      flexGrow: 1,
      flexBasis: 150,
      minWidth: 140,
      backgroundColor:
        "#FFFFFF",
      borderWidth: 1,
      borderColor:
        "#E2E8F0",
      borderRadius:
        16,
      padding: 14,
    },

    metricWide: {
      flexBasis: 300,
    },

    metricLabel: {
      fontSize: 11,
      lineHeight: 16,
      fontWeight:
        "700",
      color:
        "#64748B",
    },

    metricValue: {
      marginTop: 6,
      fontSize: 19,
      lineHeight: 25,
      fontWeight:
        "800",
      color:
        "#0F172A",
    },

    metricHint: {
      marginTop: 4,
      fontSize: 11,
      lineHeight: 16,
      color:
        "#64748B",
    },

    divider: {
      height: 1,
      backgroundColor:
        "#E2E8F0",
      marginVertical:
        16,
    },

    twoCol: {
      flexDirection:
        "row",
      gap: 16,
      flexWrap:
        "wrap",
    },

    infoBlock: {
      flex: 1,
      minWidth: 150,
    },

    infoLabel: {
      fontSize: 11,
      fontWeight:
        "700",
      color:
        "#64748B",
    },

    infoValue: {
      marginTop: 5,
      fontSize: 18,
      fontWeight:
        "800",
      color:
        "#0F172A",
    },

    infoHint: {
      marginTop: 4,
      fontSize: 11,
      lineHeight: 17,
      color:
        "#64748B",
    },

 miniHeading: {
  fontSize: 11,
  lineHeight: 16,
  letterSpacing: 0.9,
  fontWeight: "900",
  color: "#475569",
},

    channelLine: {
      flexDirection:
        "row",
      flexWrap:
        "wrap",
      gap: 12,
      marginTop: 9,
    },

    channelText: {
      fontSize: 12,
      fontWeight:
        "700",
      color:
        "#334155",
    },

    compareRow: {
      minHeight: 58,
      flexDirection:
        "row",
      alignItems:
        "center",
      justifyContent:
        "space-between",
      gap: 12,
      borderBottomWidth:
        StyleSheet.hairlineWidth,
      borderBottomColor:
        "#E2E8F0",
    },

    compareLabel: {
      fontSize: 11,
      color:
        "#64748B",
      fontWeight:
        "700",
    },

    compareValue: {
      marginTop: 3,
      fontSize: 15,
      color:
        "#0F172A",
      fontWeight:
        "800",
    },

    delta: {
      fontSize: 13,
      fontWeight:
        "800",
      color:
        "#15803D",
    },

    deltaNegative: {
      color:
        "#B91C1C",
    },

    deltaWarning: {
      color:
        "#B45309",
    },

    stockSummary: {
      flexDirection:
        "row",
      flexWrap:
        "wrap",
      gap: 8,
    },

    stockCount: {
      flex: 1,
      minWidth: 90,
      borderRadius:
        14,
      backgroundColor:
        "#F8FAFC",
      padding: 12,
    },

    stockCountValue: {
      fontSize: 20,
      fontWeight:
        "800",
      color:
        "#0F172A",
    },

 stockCountLabel: {
  marginTop: 2,
  fontSize: 11,
  lineHeight: 16,
  fontWeight: "800",
  color: "#475569",
},

  stockGroup: {
  marginTop: 14,
  paddingHorizontal: 12,
  paddingTop: 12,
  paddingBottom: 12,
  borderRadius: 14,
  borderWidth: 1,
},

stockGroupFast: {
  backgroundColor: "#F0FDF4",
  borderColor: "#DCFCE7",
},

stockGroupSlow: {
  backgroundColor: "#FFFBEB",
  borderColor: "#FEF3C7",
},

stockGroupDead: {
  backgroundColor: "#F8FAFC",
  borderColor: "#E2E8F0",
},

stockGroupRisk: {
  backgroundColor: "#FEF2F2",
  borderColor: "#FEE2E2",
},

    stockGroupHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
      marginBottom: 4,
    },

 stockGroupCount: {
  fontSize: 11,
  lineHeight: 16,
  fontWeight: "800",
  color: "#475569",
},

    seeMoreButton: {
      minHeight: 40,
      marginTop: 8,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      borderRadius: 12,
      backgroundColor: "#EFF6FF",
    },

    seeMoreText: {
      fontSize: 12,
      lineHeight: 17,
      fontWeight: "800",
      color: "#2563EB",
    },

    stockRow: {
      flexDirection:
        "row",
      alignItems:
        "center",
      gap: 10,
      paddingVertical:
        10,
      borderBottomWidth:
        StyleSheet.hairlineWidth,
      borderBottomColor:
        "#E2E8F0",
    },

    stockMain: {
      flex: 1,
    },

    stockName: {
      fontSize: 13,
      fontWeight:
        "800",
      color:
        "#0F172A",
    },

  stockMetaLine: {
  marginTop: 3,
  flexDirection: "row",
  alignItems: "center",
  flexWrap: "wrap",
},

stockMeta: {
  fontSize: 11,
  lineHeight: 16,
  fontWeight: "700",
  color: "#64748B",
},

stockStatus: {
  fontSize: 11,
  lineHeight: 16,
  fontWeight: "900",
  color: "#475569",
},

stockStatusDanger: {
  color: "#DC2626",
},

stockStatusWarning: {
  color: "#D97706",
},

    stockActivity: {
      fontSize: 12,
      fontWeight:
        "800",
      color:
        "#475569",
    },



    insightRow: {
      flexDirection:
        "row",
      alignItems:
        "flex-start",
      gap: 10,
      paddingVertical:
        11,
      borderBottomWidth:
        StyleSheet.hairlineWidth,
      borderBottomColor:
        "#E2E8F0",
    },

    insightRowLast: {
      borderBottomWidth:
        0,
    },

    insightIndex: {
      width: 24,
      height: 24,
      borderRadius: 8,
      alignItems:
        "center",
      justifyContent:
        "center",
      backgroundColor:
        "#F1F5F9",
    },

    insightIndexText: {
      fontSize: 11,
      fontWeight:
        "800",
      color:
        "#475569",
    },

    insightText: {
      flex: 1,
      fontSize: 12,
      lineHeight: 19,
      color:
        "#334155",
    },

    footerSpace: {
      height: 20,
    },
  });