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

  const reqRef = useRef(0);

  React.useEffect(() => {
    if (!canAll) setScope("STORE");
  }, [canAll]);

  React.useEffect(() => {
    if (isStaff) setScope("STORE");
  }, [isStaff]);

  const storeIdsInOrg = useMemo(() => {
    const ids = (org.stores ?? [])
      .filter((s) => String((s as any)?.organization_id ?? "").trim() === orgId)
      .map((s) => String((s as any)?.store_id ?? "").trim())
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

  const loadForStore = useCallback(
    async (sid: string, fromYMD: string, toYMD: string): Promise<FinRow> => {
      const onVal = await rpcTryScalar(["get_stock_on_hand_value_v1"], {
        p_org_id: orgId,
        p_store_id: sid,
      });

      const inVal = await rpcTryScalar(["get_stock_in_value_v2", "get_stock_in_value_v1"], {
        p_org_id: orgId,
        p_store_id: sid,
        p_date_from: fromYMD,
        p_date_to: toYMD,
      });

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

  const applyQuick = useCallback((k: "today" | "7d" | "30d") => {
    const now = new Date();
    const to = new Date(now);
    const from = new Date(now);
    if (k === "today") {
      // none
    } else if (k === "7d") {
      from.setDate(from.getDate() - 6);
    } else {
      from.setDate(from.getDate() - 29);
    }
    setDateFrom(toIsoDateLocal(from));
    setDateTo(toIsoDateLocal(to));
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
        const r = await loadForStore(storeId, dateFrom, dateTo);
        if (rid !== reqRef.current) return;
        setRow(r);
        return;
      }

      // ALL
      const ids = storeIdsInOrg.length ? storeIdsInOrg : storeId ? [storeId] : [];
      if (!ids.length) {
        setErr("No stores found for this org");
        return;
      }

      const results = await Promise.all(ids.map((sid) => loadForStore(sid, dateFrom, dateTo)));
      const sumOn = results.reduce((a, r) => a + toNum(r.stock_on_hand_value), 0);
      const sumIn = results.reduce((a, r) => a + toNum(r.stock_in_value), 0);

      if (rid !== reqRef.current) return;
      setRow({
        org_id: orgId,
        store_id: null,
        date_from: dateFrom,
        date_to: dateTo,
        stock_on_hand_value: sumOn,
        stock_in_value: sumIn,
      });
    } catch (e: any) {
      if (rid !== reqRef.current) return;
      setErr(e?.message ?? "Failed to search stock values");
      setRow(null);
    } finally {
      if (rid === reqRef.current) setLoading(false);
    }
  }, [orgId, dateFrom, dateTo, scope, storeId, canAll, isStaff, storeIdsInOrg, loadForStore]);

  const subtitle = isStaff
    ? `Store: ${storeName}`
    : scope === "STORE"
    ? `Store: ${storeName}`
    : `Org: ${orgName} (ALL)`;

  const onHand = fmtMoney(toNum(row?.stock_on_hand_value), "TZS").replace(/\s+/g, " ");
  const stockIn = fmtMoney(toNum(row?.stock_in_value), "TZS").replace(/\s+/g, " ");

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

          <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
            <SmallChip active={false} label="Today" onPress={() => applyQuick("today")} />
            <SmallChip active={false} label="7 Days" onPress={() => applyQuick("7d")} />
            <SmallChip active={false} label="30 Days" onPress={() => applyQuick("30d")} />
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

        <View style={{ height: 24 }} />
      </ScrollView>
    </Screen>
  );
}