import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, FlatList, Pressable, Text, View } from "react-native";

import { useNetInfo } from "@react-native-community/netinfo";

import { useOrg } from "../../../src/context/OrgContext";
import { useOrgMoneyPrefs } from "@/src/ui/money";
import { supabase } from "../../../src/supabase/supabaseClient";
import { Button } from "../../../src/ui/Button";
import { Card } from "../../../src/ui/Card";
import { Screen } from "../../../src/ui/Screen";
import { theme } from "../../../src/ui/theme";

import { countPending, listPending } from "../../../src/offline/salesQueue";
import { syncSalesQueueOnce } from "../../../src/offline/salesSync";

type SaleRow = {
  sale_id?: string;
  sold_at?: string;
  status?: string | null;
  total_qty?: number | null;
  total_amount?: number | null;
};

// Raw row from RPC may vary (id vs sale_id, qty vs total_qty, etc.)
type AnyRow = Record<string, any>;

type RangeKey = "today" | "week" | "month";

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
  const day = x.getDay();
  const diff = (day === 0 ? -6 : 1) - day;
  x.setDate(x.getDate() + diff);
  return x;
}
function startOfMonthLocal(d: Date) {
  const x = startOfDayLocal(d);
  x.setDate(1);
  return x;
}
function labelForRange(r: RangeKey) {
  if (r === "today") return "Today";
  if (r === "week") return "This Week";
  return "This Month";
}

function toNum(v: any): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * ✅ Normalizer:
 * get_sales inaweza kurudisha tofauti za naming:
 *  - sale_id vs id
 *  - sold_at vs created_at
 *  - total_qty vs qty vs sum_qty
 *  - total_amount vs amount vs sum_amount
 */
function normalizeSaleRow(r: AnyRow): SaleRow {
  const saleId =
    (r.sale_id ?? r.id ?? r.saleId ?? r.saleID ?? r.sale) != null
      ? String(r.sale_id ?? r.id ?? r.saleId ?? r.saleID ?? r.sale)
      : undefined;

  const soldAt =
    (r.sold_at ?? r.created_at ?? r.inserted_at ?? r.createdAt) != null
      ? String(r.sold_at ?? r.created_at ?? r.inserted_at ?? r.createdAt)
      : undefined;

  const statusRaw = r.status ?? r.sale_status ?? r.saleStatus ?? null;
  const status = statusRaw != null ? String(statusRaw) : null;

  const qty =
    r.total_qty ?? r.totalQty ?? r.qty ?? r.sum_qty ?? r.sumQty ?? r.items_qty ?? r.itemsQty;

  const amount =
    r.total_amount ??
    r.totalAmount ??
    r.amount ??
    r.sum_amount ??
    r.sumAmount ??
    r.total ??
    r.total_price ??
    r.totalPrice;

  return {
    sale_id: saleId,
    sold_at: soldAt,
    status,
    total_qty: qty == null ? null : toNum(qty),
    total_amount: amount == null ? null : toNum(amount),
  };
}

function safeWhenLabel(iso?: string) {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "—";
  try {
    return new Date(t).toLocaleString();
  } catch {
    return iso;
  }
}

function sumPendingFromPayload(payload: any): { qty: number; amount: number } {
  const items = Array.isArray(payload?.items) ? payload.items : [];
  let qty = 0;
  let amount = 0;

  for (const it of items) {
    const q = Math.trunc(Number(it?.qty ?? 0));
    const p = Number(it?.unit_price ?? 0);
    if (Number.isFinite(q) && q > 0) qty += q;
    if (Number.isFinite(q) && q > 0 && Number.isFinite(p) && p > 0) amount += q * p;
  }

  // apply discount if present (payload already has discount info)
  const dType = String(payload?.discount_type ?? "").toUpperCase();
  const dVal = Number(payload?.discount_value ?? 0);

  if (Number.isFinite(amount) && amount > 0 && Number.isFinite(dVal) && dVal > 0) {
    if (dType === "PERCENT") {
      const pct = Math.min(100, Math.max(0, dVal));
      const disc = Math.round((amount * pct) / 100);
      amount = Math.max(0, amount - disc);
    } else if (dType === "FIXED") {
      amount = Math.max(0, amount - Math.round(dVal));
    }
  }

  return { qty, amount: Math.round(amount) };
}

export default function SalesHistoryScreen() {
  const router = useRouter();
  const { activeOrgId, activeOrgName, activeStoreId, activeStoreName, activeRole } = useOrg() as any;

  const money = useOrgMoneyPrefs(activeOrgId);
  // ✅ FIX: hook returns money.fmt (NOT money.formatMoney)
  const fmtMoney = useCallback((n: number) => money.fmt(Number(n || 0)), [money]);

  const netInfo = useNetInfo();
  const isOnline = !!(netInfo.isConnected && netInfo.isInternetReachable !== false);
  const isOffline = !isOnline;

  const [range, setRange] = useState<RangeKey>("month");

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [rows, setRows] = useState<SaleRow[]>([]);

  // ✅ Pending offline sales
  const [pendingRows, setPendingRows] = useState<SaleRow[]>([]);
  const [pendingCountState, setPendingCountState] = useState<number>(0);
  const [syncing, setSyncing] = useState(false);

  const canView = useMemo(() => {
    const r = (activeRole ?? "staff") as "owner" | "admin" | "staff";
    return r === "owner" || r === "admin" || r === "staff";
  }, [activeRole]);

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

  const loadPending = useCallback(async () => {
    try {
      if (!activeStoreId) {
        setPendingRows([]);
        setPendingCountState(0);
        return;
      }

      const n = await countPending(activeStoreId);
      setPendingCountState(n);

      const list = await listPending(activeStoreId);

      const normalized: SaleRow[] = (list ?? []).map((x: any) => {
        const cid = String(x?.client_sale_id ?? x?.clientSaleId ?? x?.id ?? "").trim() || "UNKNOWN";
        const created =
          String(x?.created_at ?? x?.createdAt ?? x?.queued_at ?? x?.queuedAt ?? "").trim() ||
          undefined;

        const payload = x?.payload ?? null;
        const sums = sumPendingFromPayload(payload);

        return {
          sale_id: `PENDING:${cid}`, // unique key for list
          sold_at: created, // show queued time
          status: "PENDING_OFFLINE",
          total_qty: sums.qty,
          total_amount: sums.amount,
        };
      });

      // newest first
      normalized.sort((a, b) => {
        const ta = a.sold_at ? Date.parse(a.sold_at) : 0;
        const tb = b.sold_at ? Date.parse(b.sold_at) : 0;
        return tb - ta;
      });

      setPendingRows(normalized);
    } catch {
      setPendingRows([]);
      setPendingCountState(0);
    }
  }, [activeStoreId]);

  // ✅ Summary: hesabu only COMPLETED (kuepuka drafts/void)
  const summary = useMemo(() => {
    const completed = rows.filter((r) => String(r.status ?? "").toUpperCase() === "COMPLETED");
    const count = completed.length;
    const totalQty = completed.reduce((a, r) => a + toNum(r.total_qty ?? 0), 0);
    const totalAmount = completed.reduce((a, r) => a + toNum(r.total_amount ?? 0), 0);
    return { count, totalQty, totalAmount };
  }, [rows]);

  const load = useCallback(
    async (mode: "boot" | "refresh") => {
      setErr(null);
      if (mode === "boot") setLoading(true);
      if (mode === "refresh") setRefreshing(true);

      try {
        if (!activeStoreId) throw new Error("No active store selected.");
        if (!canView) throw new Error("No permission.");

        // always load pending (works offline)
        await loadPending();

        const access = await supabase.rpc("ensure_my_store_access", {
          p_store_id: activeStoreId,
        });
        if (access.error) throw access.error;

        const { from, to } = ranges[range];

        const res = await supabase.rpc("get_sales", { p_store_id: activeStoreId, p_from: from, p_to: to } as any);
        if (res.error) throw res.error;

        const raw = (res.data ?? []) as AnyRow[];
        const list = raw.map(normalizeSaleRow);

        // sort desc by sold_at
        list.sort((a, b) => {
          const ta = a.sold_at ? Date.parse(a.sold_at) : 0;
          const tb = b.sold_at ? Date.parse(b.sold_at) : 0;
          return tb - ta;
        });

        setRows(list);
      } catch (e: any) {
        setErr(e?.message ?? "Failed to load sales");
        setRows([]);
        // still try pending even if online fetch fails
        try {
          await loadPending();
        } catch {}
      } finally {
        if (mode === "boot") setLoading(false);
        if (mode === "refresh") setRefreshing(false);
      }
    },
    [activeStoreId, canView, range, ranges, loadPending]
  );

  // boot
  useEffect(() => {
    void load("boot");
  }, [load]);

  // ✅ IMPORTANT: auto refresh whenever this screen gets focus
  useFocusEffect(
    useCallback(() => {
      void load("refresh");
      return () => {};
    }, [load])
  );

  // ✅ when network comes back, attempt sync and refresh pending count
  useEffect(() => {
    if (!activeStoreId) return;
    if (!isOnline) return;

    void (async () => {
      try {
        await syncSalesQueueOnce(activeStoreId);
      } catch {
        // ignore
      } finally {
        await loadPending();
      }
    })();
  }, [activeStoreId, isOnline, loadPending]);

  const syncNow = useCallback(async () => {
    if (!activeStoreId) return;
    if (!isOnline) {
      Alert.alert("Offline", "Mtandao haupo. Sync itafanya kazi mtandao ukirudi.");
      return;
    }
    if (syncing) return;

    setSyncing(true);
    try {
      await syncSalesQueueOnce(activeStoreId);
      await loadPending();
      await load("refresh");
      Alert.alert("Sync ✅", "Pending sales zimejaribiwa kusync.");
    } catch (e: any) {
      Alert.alert("Sync Failed", e?.message ?? "Failed to sync pending sales");
    } finally {
      setSyncing(false);
    }
  }, [activeStoreId, isOnline, load, loadPending, syncing]);

  const openReceipt = useCallback(
    (row: SaleRow) => {
      const status = String(row.status ?? "").toUpperCase();

      // ✅ Offline receipt route
      if (status === "PENDING_OFFLINE") {
        const sid = String(activeStoreId ?? "").trim();
        const saleKey = String(row.sale_id ?? "").trim(); // "PENDING:<clientSaleId>"
        const cid = saleKey.startsWith("PENDING:") ? saleKey.replace("PENDING:", "").trim() : "";

        if (!sid || !cid) {
          Alert.alert("Missing", "Imeshindikana kufungua Offline Receipt (missing ids).");
          return;
        }

        router.push({
          pathname: "/(tabs)/sales/offline-receipt",
          params: { storeId: sid, clientSaleId: cid },
        } as any);
        return;
      }

      const saleId = (row.sale_id ?? "").trim();
      if (!saleId) return;
      router.push({ pathname: "/(tabs)/sales/receipt", params: { saleId } } as any);
    },
    [router, activeStoreId]
  );

  const SegButton = useCallback(
    ({ k, label }: { k: RangeKey; label: string }) => {
      const active = range === k;
      return (
        <Pressable
          onPress={() => setRange(k)}
          style={{
            flex: 1,
            paddingVertical: 10,
            borderRadius: 999,
            alignItems: "center",
            justifyContent: "center",
            borderWidth: 1,
            borderColor: active ? theme.colors.emeraldBorder : theme.colors.border,
            backgroundColor: active ? theme.colors.emeraldSoft : "rgba(255,255,255,0.06)",
          }}
        >
          <Text style={{ color: theme.colors.text, fontWeight: "900" }}>{label}</Text>
        </Pressable>
      );
    },
    [range]
  );

  const PendingHeader = useMemo(() => {
    if (!activeStoreId) return null;

    if (pendingCountState <= 0) {
      return (
        <Card style={{ gap: 8 }}>
          <Text style={{ color: theme.colors.muted, fontWeight: "900" }}>
            Offline Queue: 0 pending {isOffline ? "• OFFLINE" : "• ONLINE"}
          </Text>
        </Card>
      );
    }

    const pendingTotalQty = pendingRows.reduce((a, r) => a + toNum(r.total_qty ?? 0), 0);
    const pendingTotalAmt = pendingRows.reduce((a, r) => a + toNum(r.total_amount ?? 0), 0);

    return (
      <Card style={{ gap: 10 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 10 }}>
          <Text style={{ color: theme.colors.text, fontWeight: "900" }}>Pending Offline Sales</Text>

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
            <Text style={{ color: theme.colors.text, fontWeight: "900" }}>{pendingCountState}</Text>
          </View>
        </View>

        <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>
          Qty: <Text style={{ color: theme.colors.text, fontWeight: "900" }}>{pendingTotalQty}</Text>
          {"   "}•{"   "}
          Amount: <Text style={{ color: theme.colors.text, fontWeight: "900" }}>{fmtMoney(pendingTotalAmt)}</Text>
        </Text>

        <Button
          title={syncing ? "Syncing..." : isOnline ? "Sync Now" : "Offline"}
          onPress={syncNow}
          disabled={!isOnline || syncing}
          variant="primary"
        />

        <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>
          {isOnline
            ? "Ukisync, sales hizi zitaingia DB na zitaonekana kwenye list ya kawaida."
            : "Mtandao ukirudi, sync itajaribu automatically."}
        </Text>
      </Card>
    );
  }, [activeStoreId, isOffline, isOnline, pendingCountState, pendingRows, syncNow, syncing, fmtMoney]);

  const ListHeader = useMemo(() => {
    return (
      <View style={{ gap: 14, paddingBottom: 10 }}>
        {/* Header */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <Pressable
            onPress={() => router.back()}
            style={{
              width: 44,
              height: 44,
              borderRadius: 999,
              alignItems: "center",
              justifyContent: "center",
              borderWidth: 1,
              borderColor: theme.colors.border,
              backgroundColor: "rgba(255,255,255,0.06)",
            }}
          >
            <Ionicons name="chevron-back" size={22} color={theme.colors.text} />
          </Pressable>

          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 26, fontWeight: "900", color: theme.colors.text }}>History</Text>
            <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>
              {activeOrgName ?? "—"} • {activeStoreName ?? "No store"} • {activeRole ?? "—"}
            </Text>

            <Text style={{ color: theme.colors.muted, fontWeight: "800", fontSize: 12 }}>
              {isOffline ? "OFFLINE" : "ONLINE"}
              {pendingCountState > 0 ? ` • Pending: ${pendingCountState}` : ""}
            </Text>
          </View>
        </View>

        {/* Pending Queue Summary */}
        {PendingHeader}

        {/* Filters */}
        <Card style={{ gap: 10 }}>
          <Text style={{ color: theme.colors.text, fontWeight: "900" }}>Range</Text>
          <View style={{ flexDirection: "row", gap: 10 }}>
            <SegButton k="today" label="Today" />
            <SegButton k="week" label="Week" />
            <SegButton k="month" label="Month" />
          </View>

          <Button
            title={refreshing ? "Refreshing..." : "Refresh"}
            onPress={() => load("refresh")}
            disabled={refreshing}
            variant="primary"
          />

          {!!err && <Text style={{ color: theme.colors.dangerText, fontWeight: "800" }}>{err}</Text>}
        </Card>

        {/* Summary */}
        <Text style={{ fontWeight: "900", fontSize: 16, color: theme.colors.text }}>
          Summary ({labelForRange(range)})
        </Text>

        <View style={{ flexDirection: "row", gap: 10 }}>
          <Card style={{ flex: 1, gap: 6 }}>
            <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>Sales Count</Text>
            <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 18 }}>{summary.count}</Text>
          </Card>

          <Card style={{ flex: 1, gap: 6 }}>
            <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>Total Qty</Text>
            <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 18 }}>{summary.totalQty}</Text>
          </Card>
        </View>

        <Card style={{ gap: 6 }}>
          <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>TOTAL MONEY IN</Text>
          <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 22 }}>
            {fmtMoney(summary.totalAmount)}
          </Text>
        </Card>

        {loading && (
          <View style={{ paddingTop: 10, alignItems: "center" }}>
            <ActivityIndicator />
            <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>Loading sales...</Text>
          </View>
        )}

        {/* Pending List Title */}
        {pendingRows.length > 0 && (
          <Text style={{ color: theme.colors.text, fontWeight: "900", marginTop: 4 }}>
            Pending (Offline Queue)
          </Text>
        )}
      </View>
    );
  }, [
    PendingHeader,
    activeOrgName,
    activeRole,
    activeStoreName,
    err,
    isOffline,
    load,
    loading,
    pendingCountState,
    pendingRows.length,
    range,
    refreshing,
    router,
    SegButton,
    summary.count,
    summary.totalAmount,
    summary.totalQty,
    fmtMoney,
  ]);

  const combined = useMemo(() => {
    // Show pending first, then remote rows
    return [...pendingRows, ...rows];
  }, [pendingRows, rows]);

  return (
    <Screen scroll={false}>
      <FlatList
        style={{ flex: 1 }}
        data={loading ? [] : combined}
        keyExtractor={(item, idx) => String(item.sale_id ?? idx)}
        refreshing={refreshing}
        onRefresh={() => load("refresh")}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={ListHeader}
        contentContainerStyle={{ paddingBottom: 0 }}
        renderItem={({ item }) => {
          const saleId = (item.sale_id ?? "").trim();
          const when = safeWhenLabel(item.sold_at);
          const qty = toNum(item.total_qty ?? 0);
          const amount = toNum(item.total_amount ?? 0);
          const status = String(item.status ?? "OK").toUpperCase();

          const isPending = status === "PENDING_OFFLINE";

          const chipBorder = isPending ? "rgba(245,158,11,0.35)" : theme.colors.emeraldBorder;
          const chipBg = isPending ? "rgba(245,158,11,0.12)" : theme.colors.emeraldSoft;
          const chipText = theme.colors.text;

          const title = isPending
            ? `Queued ${saleId.startsWith("PENDING:") ? saleId.replace("PENDING:", "").slice(0, 8) : "—"}`
            : `Sale ${saleId ? saleId.slice(0, 8) : "—"}`;

          return (
            <Pressable onPress={() => openReceipt(item)}>
              <Card style={{ marginBottom: 12, gap: 10 }}>
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                  <Text
                    style={{ color: theme.colors.text, fontWeight: "900", fontSize: 16, flex: 1 }}
                    numberOfLines={1}
                  >
                    {title}
                  </Text>

                  <View
                    style={{
                      paddingHorizontal: 10,
                      paddingVertical: 6,
                      borderRadius: 999,
                      borderWidth: 1,
                      borderColor: chipBorder,
                      backgroundColor: chipBg,
                    }}
                  >
                    <Text style={{ color: chipText, fontWeight: "900" }}>
                      {isPending ? "PENDING OFFLINE" : status}
                    </Text>
                  </View>
                </View>

                <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>
                  When: <Text style={{ color: theme.colors.text }}>{when}</Text>
                </Text>

                <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>
                  Qty: <Text style={{ color: theme.colors.text }}>{qty}</Text>
                  {"   "}•{"   "}
                  Amount: <Text style={{ color: theme.colors.text }}>{fmtMoney(amount)}</Text>
                </Text>

                <Text style={{ color: theme.colors.muted, fontWeight: "800", textDecorationLine: "underline" }}>
                  {isPending ? "Open Offline Receipt" : "Open Receipt"}
                </Text>
              </Card>
            </Pressable>
          );
        }}
        ListEmptyComponent={
          !loading ? (
            <View style={{ paddingTop: 16, alignItems: "center" }}>
              <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>
                No sales ({labelForRange(range)}).
              </Text>
            </View>
          ) : null
        }
      />
    </Screen>
  );
}