// app/stocks/history.tsx
import React, { useCallback, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";

import { useOrg } from "@/src/context/OrgContext";
import { supabase } from "@/src/supabase/supabaseClient";
import { Screen } from "@/src/ui/Screen";
import { Card } from "@/src/ui/Card";
import { UI } from "@/src/ui/theme";

type FinRow = {
  org_id: string;
  store_id: string | null;
  date_from: string;
  date_to: string;
  stock_on_hand_value: number;
  stock_in_value: number;
};

type StockInItemRow = {
  id: string;
  product_id: string | null;
  product_name: string;
  store_id: string | null;
  qty: number;
  unit_cost: number;
  total_value: number;
  created_at: string | null;
  source: string | null;
  movement_mode?: string | null;
  mode?: string | null;
  note?: string | null;
};

function toNum(x: any) {
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
}
function pad2(n: number) {
  return String(n).padStart(2, "0");
}
function toIsoDateLocal(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
function isValidYYYYMMDD(s: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split("-").map((x) => Number(x));
  if (!y || m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}
function fmtMoney(n: number, currency?: string | null) {
  const c = String(currency || "TZS").trim() || "TZS";
  try {
    return new Intl.NumberFormat("en-TZ", { style: "currency", currency: c, maximumFractionDigits: 0 }).format(
      Number(n) || 0
    );
  } catch {
    return `${c} ${String(Math.round(Number(n) || 0))}`;
  }
}

function extractScalarValue(x: any): number {
  if (x == null) return 0;
  if (typeof x === "number" || typeof x === "string") return toNum(x);

  if (typeof x === "object" && !Array.isArray(x)) {
    const known =
      (x as any)?.value ??
      (x as any)?.amount ??
      (x as any)?.total ??
      (x as any)?.sum ??
      (x as any)?.stock_value ??
      (x as any)?.stock_on_hand_value ??
      (x as any)?.on_hand_value ??
      (x as any)?.stock_in_value ??
      (x as any)?.stock_in ??
      (x as any)?.in_value ??
      (x as any)?.received_value;

    if (known != null) return toNum(known);

    const keys = Object.keys(x);
    if (keys.length === 1) return toNum((x as any)[keys[0]]);
  }

  return 0;
}

function stockInModeOf(r: any) {
  return String(
    r?.movement_mode ??
      r?.mode ??
      r?.source ??
      r?.movement_type ??
      r?.type ??
      r?.reason ??
      r?.note ??
      ""
  )
    .trim()
    .toUpperCase();
}

function isRealStockInRow(r: any) {
  const qty = toNum(r?.qty ?? r?.qty_change ?? r?.delta ?? r?.change_qty ?? r?.amount);
  const mode = stockInModeOf(r);

  if (qty <= 0) return false;

  const blocked = [
    "SALE",
    "SALES",
    "SOLD",
    "POS",
    "CHECKOUT",
    "REDUCE",
    "OUT",
    "STOCK_OUT",
    "TRANSFER_OUT",
    "ADJUST_REDUCE",
    "DELETE_SALE",
    "VOID",
    "RETURN_OUT",
  ];

  return !blocked.some((x) => mode.includes(x));
}

function normalizeStockInRow(r: any, sid: string): StockInItemRow {
  const qty = toNum(r?.qty ?? r?.qty_change ?? r?.delta ?? r?.change_qty ?? r?.amount);
  const unitCost = toNum(r?.unit_cost ?? r?.cost_price ?? r?.buying_price ?? r?.purchase_price);
  const totalValue = toNum(r?.total_value ?? r?.value ?? qty * unitCost);

  return {
    id: String(r.id ?? r.movement_id ?? `${r.product_id ?? "row"}-${r.created_at ?? ""}`),
    product_id: r.product_id ? String(r.product_id) : null,
    product_name: String(r.product_name ?? r.name ?? "Unknown Product"),
    store_id: r.store_id ? String(r.store_id) : sid,
    qty,
    unit_cost: unitCost,
    total_value: totalValue,
    created_at: r.created_at ? String(r.created_at) : null,
    source: String(r.source ?? "stock_movements"),
    movement_mode: r.movement_mode ? String(r.movement_mode) : null,
    mode: r.mode ? String(r.mode) : null,
    note: r.note ? String(r.note) : null,
  };
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
        style={{
          color: UI.text,
          fontWeight: "900",
          fontSize: 16,
          lineHeight: 20,
          flexShrink: 1,
          width: "100%",
        }}
        numberOfLines={2}
        ellipsizeMode="tail"
        adjustsFontSizeToFit
        minimumFontScale={0.62}
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

export default function StockHistoryScreen() {
  const router = useRouter();
  const org = useOrg();

  const orgId = String(org.activeOrgId ?? "").trim();
  const orgName = String(org.activeOrgName ?? "Org").trim() || "Org";
  const storeId = String(org.activeStoreId ?? "").trim();
  const storeName = String(org.activeStoreName ?? "Store").trim() || "Store";

  const roleLower = String(org.activeRole ?? "").trim().toLowerCase();
  const isOwner = roleLower === "owner";
  const isAdmin = roleLower === "admin";
  const isStaff = roleLower === "staff";
  const canAll = isOwner || isAdmin;

  const today = useMemo(() => toIsoDateLocal(new Date()), []);
  const [dateFrom, setDateFrom] = useState<string>(today);
  const [dateTo, setDateTo] = useState<string>(today);

  const [scope, setScope] = useState<"STORE" | "ALL">(() => (storeId ? "STORE" : "ALL"));

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [row, setRow] = useState<FinRow | null>(null);
  const [stockInItems, setStockInItems] = useState<StockInItemRow[]>([]);

  const reqRef = useRef(0);

  React.useEffect(() => {
    if (!canAll) setScope("STORE");
  }, [canAll]);

  React.useEffect(() => {
    if (isStaff) setScope("STORE");
  }, [isStaff]);

  const storeIdsInOrg = useMemo(() => {
    const ids = (org.stores ?? [])
      .filter((s: any) => {
        const rowOrgId = String(
          s?.organization_id ??
            s?.org_id ??
            s?.activeOrgId ??
            s?.activeOrganizationId ??
            ""
        ).trim();

        // Forward-safe: if store row has no org id in OrgContext, don't exclude it.
        return !rowOrgId || rowOrgId === orgId;
      })
      .map((s: any) => String(s?.store_id ?? s?.id ?? "").trim())
      .filter(Boolean);

    return Array.from(new Set(ids));
  }, [org.stores, orgId]);

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
async function loadStockInItems(args: {
  orgId: string;
  storeId: string | null;
  storeIds: string[];
  scope: "STORE" | "ALL";
  fromYMD: string;
  toYMD: string;
}): Promise<StockInItemRow[]> {
  const ids =
    args.scope === "STORE"
      ? args.storeId
        ? [args.storeId]
        : []
      : args.storeIds;

  if (!args.orgId || ids.length === 0) return [];

  const allRows: StockInItemRow[] = [];

  for (const sid of ids) {
    const { data, error } = await supabase.rpc("get_stock_in_items_v1", {
      p_org_id: args.orgId,
      p_store_id: sid,
      p_date_from: args.fromYMD,
      p_date_to: args.toYMD,
    } as any);

    if (error) throw error;

    for (const r of (data ?? []) as any[]) {
      if (!isRealStockInRow(r)) continue;
      allRows.push(normalizeStockInRow(r, sid));
    }
  }

  return allRows.sort((a, b) => {
    const ta = a.created_at ? Date.parse(a.created_at) : 0;
    const tb = b.created_at ? Date.parse(b.created_at) : 0;
    return tb - ta;
  });
}
  const loadForStore = useCallback(
    async (sid: string, fromYMD: string, toYMD: string): Promise<FinRow> => {
      const onVal = await rpcTryScalar(["get_stock_on_hand_value_v1"], {
        p_org_id: orgId,
        p_store_id: sid,
      });

      const stockInRows = await loadStockInItems({
        orgId,
        storeId: sid,
        storeIds: [sid],
        scope: "STORE",
        fromYMD,
        toYMD,
      });

      const inVal = stockInRows.reduce((sum, x) => sum + toNum(x.total_value), 0);

      return {
        org_id: orgId,
        store_id: sid,
        date_from: fromYMD,
        date_to: toYMD,
        stock_on_hand_value: onVal,
        stock_in_value: inVal,
      };
    },
    [orgId, rpcTryScalar]
  );

 const [quickRange, setQuickRange] = useState<"today" | "7d" | "30d" | "custom">("today");

  const applyQuick = useCallback((k: "today" | "7d" | "30d") => {
    const now = new Date();
    const to = new Date(now);
    const from = new Date(now);

    if (k === "7d") from.setDate(from.getDate() - 6);
    if (k === "30d") from.setDate(from.getDate() - 29);

    setQuickRange(k);
    setDateFrom(toIsoDateLocal(from));
    setDateTo(toIsoDateLocal(to));
  }, []);

  const onChangeFrom = useCallback((v: string) => {
    setQuickRange("custom");
    setDateFrom(v);
  }, []);

  const onChangeTo = useCallback((v: string) => {
    setQuickRange("custom");
    setDateTo(v);
  }, []);
  const run = useCallback(async () => {
    const rid = ++reqRef.current;

    if (!orgId) {
      setErr("No active organization selected");
      return;
    }

    if (!isValidYYYYMMDD(dateFrom) || !isValidYYYYMMDD(dateTo)) {
      setErr("Tarehe lazima iwe format: YYYY-MM-DD (mfano 2025-12-31)");
      return;
    }

    if (scope === "STORE" && !storeId) {
      setErr("No active store selected");
      return;
    }

    setLoading(true);
    setErr(null);

    try {
      if (!canAll || isStaff || scope === "STORE") {
        const [r, items] = await Promise.all([
          loadForStore(storeId, dateFrom, dateTo),
          loadStockInItems({
            orgId,
            storeId,
            storeIds: storeIdsInOrg,
            scope: "STORE",
            fromYMD: dateFrom,
            toYMD: dateTo,
          }),
        ]);

        if (rid !== reqRef.current) return;
        setRow(r);
        setStockInItems(items);
        return;
      }

      // ALL
      const ids = storeIdsInOrg.length ? storeIdsInOrg : storeId ? [storeId] : [];
      if (!ids.length) {
        setErr("No stores found for this org");
        return;
      }

      const [results, items] = await Promise.all([
        Promise.all(ids.map((sid) => loadForStore(sid, dateFrom, dateTo))),
        loadStockInItems({
          orgId,
          storeId: null,
          storeIds: ids,
          scope: "ALL",
          fromYMD: dateFrom,
          toYMD: dateTo,
        }),
      ]);

      const sumOn = results.reduce((a: number, r: FinRow) => a + toNum(r.stock_on_hand_value), 0);
      const sumIn = results.reduce((a: number, r: FinRow) => a + toNum(r.stock_in_value), 0);

      if (rid !== reqRef.current) return;
      setRow({
        org_id: orgId,
        store_id: null,
        date_from: dateFrom,
        date_to: dateTo,
        stock_on_hand_value: sumOn,
        stock_in_value: sumIn,
      });
      setStockInItems(items);
    } catch (e: any) {
      if (rid !== reqRef.current) return;
      setErr(e?.message ?? "Failed to search stock values");
      setRow(null);
      setStockInItems([]);
    } finally {
      if (rid === reqRef.current) setLoading(false);
    }
  }, [orgId, dateFrom, dateTo, scope, storeId, canAll, isStaff, storeIdsInOrg, loadForStore]);

  React.useEffect(() => {
    if (!orgId) return;
    if (scope === "STORE" && !storeId) return;

    void run();
  }, [orgId, storeId, scope, dateFrom, dateTo, run]);

  const subtitle = isStaff
    ? `Store: ${storeName}`
    : scope === "STORE"
    ? `Store: ${storeName}`
    : `Org: ${orgName} (ALL)`;

  const onHand = fmtMoney(toNum(row?.stock_on_hand_value), "TZS").replace(/\s+/g, " ");
  const stockIn = fmtMoney(toNum(row?.stock_in_value), "TZS").replace(/\s+/g, " ");

  const stockInItemsQty = useMemo(
    () => stockInItems.reduce((a, x) => a + toNum(x.qty), 0),
    [stockInItems]
  );

  const stockInItemsTotal = useMemo(
    () => stockInItems.reduce((a, x) => a + toNum(x.total_value), 0),
    [stockInItems]
  );

  const stockInItemsTotalLabel = useMemo(
    () => fmtMoney(stockInItemsTotal, "TZS").replace(/\s+/g, " "),
    [stockInItemsTotal]
  );

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ paddingTop: 16, paddingHorizontal: 16, paddingBottom: 24 }}>
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
              Stock Value Search
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
          {canAll && !isStaff ? (
            <View style={{ flexDirection: "row", gap: 10 }}>
              <SmallChip active={scope === "STORE"} label="STORE" onPress={() => setScope("STORE")} />
              <SmallChip active={scope === "ALL"} label="ALL" onPress={() => setScope("ALL")} />
            </View>
          ) : null}

          <Text style={{ color: UI.faint, fontWeight: "900", fontSize: 12, letterSpacing: 0.4 }}>
            DATE RANGE (YYYY-MM-DD)
          </Text>

          <View style={{ flexDirection: "row", gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: UI.muted, fontWeight: "800", marginBottom: 6 }}>From</Text>
              <TextInput
                value={dateFrom}
                onChangeText={onChangeFrom}
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
                onChangeText={onChangeTo}
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

          <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
          <SmallChip active={quickRange === "today"} label="Today" onPress={() => applyQuick("today")} />
<SmallChip active={quickRange === "7d"} label="7 Days" onPress={() => applyQuick("7d")} />
<SmallChip active={quickRange === "30d"} label="30 Days" onPress={() => applyQuick("30d")} />
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

        <Card style={{ gap: 10 }}>
          <Text style={{ color: UI.text, fontWeight: "900", fontSize: 16 }}>Results</Text>

          {loading ? (
            <View style={{ paddingVertical: 18 }}>
              <ActivityIndicator />
            </View>
          ) : (
            <View style={{ flexDirection: "row", gap: 12 }}>
              <MiniStat label="On Hand Value" value={onHand} hint="current stock" />
              <MiniStat label="Stock In Value" value={stockIn} hint="received (+)" />
            </View>
          )}

          <View style={{ height: 1, backgroundColor: "rgba(255,255,255,0.08)", marginTop: 10 }} />

          <Text style={{ color: UI.muted, fontWeight: "800" }}>
            Range: <Text style={{ color: UI.text, fontWeight: "900" }}>{dateFrom}</Text> →{" "}
            <Text style={{ color: UI.text, fontWeight: "900" }}>{dateTo}</Text>
          </Text>
        </Card>

        <View style={{ height: 12 }} />

     <Card style={{ gap: 14 }}>
  <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
    <View style={{ flex: 1, minWidth: 0 }}>
      <Text style={{ color: UI.text, fontWeight: "900", fontSize: 18 }}>
        Stock In Items
      </Text>
      <Text style={{ color: UI.muted, fontWeight: "800", marginTop: 4 }}>
        Bidhaa zilizoingia ndani ya range uliyochagua.
      </Text>
    </View>

    <View
      style={{
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 999,
        backgroundColor: "rgba(42,168,118,0.10)",
        borderWidth: 1,
        borderColor: "rgba(42,168,118,0.25)",
      }}
    >
      <Text style={{ color: UI.text, fontWeight: "900", fontSize: 12 }}>
        {stockInItems.length} items
      </Text>
    </View>
  </View>

  {!loading && stockInItems.length > 0 ? (
    <View
      style={{
        flexDirection: "row",
        gap: 10,
        padding: 12,
        borderRadius: 18,
        backgroundColor: "rgba(37,99,235,0.08)",
        borderWidth: 1,
        borderColor: "rgba(37,99,235,0.18)",
      }}
    >
      <MiniStat label="Total Qty In" value={String(stockInItemsQty)} />
      <MiniStat label="Items Value" value={stockInItemsTotalLabel} />
    </View>
  ) : null}

  {loading ? (
    <View style={{ paddingVertical: 18 }}>
      <ActivityIndicator />
    </View>
  ) : stockInItems.length === 0 ? (
    <View
      style={{
        padding: 14,
        borderRadius: 18,
        backgroundColor: "rgba(148,163,184,0.10)",
        borderWidth: 1,
        borderColor: "rgba(148,163,184,0.16)",
      }}
    >
      <Text style={{ color: UI.faint, fontWeight: "900" }}>
        Hakuna bidhaa zilizoingia kwenye range hii.
      </Text>
    </View>
  ) : (
    <View style={{ gap: 12 }}>
      {stockInItems.slice(0, 120).map((item, idx) => {
        const itemTotal = fmtMoney(item.total_value, "TZS").replace(/\s+/g, " ");
        const unitCost = fmtMoney(item.unit_cost, "TZS").replace(/\s+/g, " ");
        const dt = item.created_at ? new Date(item.created_at).toLocaleString() : "—";

        return (
          <View
            key={`${item.id}-${idx}`}
            style={{
              borderWidth: 1,
              borderColor: "rgba(15,23,42,0.08)",
              backgroundColor: "rgba(255,255,255,0.72)",
              borderRadius: 18,
              padding: 14,
              gap: 10,
            }}
          >
            <View style={{ flexDirection: "row", gap: 10, alignItems: "flex-start" }}>
              <View
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 999,
                  backgroundColor: "rgba(42,168,118,0.12)",
                  borderWidth: 1,
                  borderColor: "rgba(42,168,118,0.22)",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text style={{ color: UI.text, fontWeight: "900", fontSize: 12 }}>
                  {idx + 1}
                </Text>
              </View>

              <View style={{ flex: 1, minWidth: 0 }}>
                <Text
                  style={{ color: UI.text, fontWeight: "900", fontSize: 15 }}
                  numberOfLines={2}
                >
                  {item.product_name}
                </Text>
                <Text style={{ color: UI.faint, fontWeight: "800", marginTop: 3, fontSize: 12 }}>
                  Date: {dt}
                </Text>
              </View>
            </View>

            <View style={{ flexDirection: "row", gap: 10 }}>
              <MiniStat label="Qty In" value={String(item.qty)} />
              <MiniStat label="Unit Cost" value={unitCost} />
              <MiniStat label="Total Value" value={itemTotal} />
            </View>
          </View>
        );
      })}
    </View>
  )}
</Card>

        <View style={{ height: 24 }} />
      </ScrollView>
    </Screen>
  );
}