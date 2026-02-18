import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import { useOrg } from "../../../src/context/OrgContext";
import { supabase } from "../../../src/supabase/supabaseClient";
import { Button } from "../../../src/ui/Button";
import { Card } from "../../../src/ui/Card";
import { Screen } from "../../../src/ui/Screen";
import { theme } from "../../../src/ui/theme";

type MovementRow = {
  movement_id?: string;
  id?: string;

  store_id?: string;
  store_name?: string;

  product_id?: string;
  product_name?: string;
  name?: string;

  sku?: string | null;
  unit?: string | null;
  category?: string | null;

  // ✅ NEW canonical output (DB)
  movement_mode?: string | null;

  // keep backward compat (old payloads)
  mode?: string | null;

  qty_change?: number;
  delta?: number;
  change_qty?: number;
  amount?: number;

  note?: string | null;
  created_at?: string;
  created_by?: string | null;

  // ✅ NEW canonical output (DB)
  actor_user_id?: string | null;
};

const DEFAULT_LIMIT = 50;

function pickMovementId(r: MovementRow) {
  return r.movement_id ?? r.id ?? `${r.product_id ?? "x"}-${r.created_at ?? Math.random()}`;
}

function pickProductName(r: MovementRow) {
  return r.product_name ?? r.name ?? "Product";
}

function pickDelta(r: MovementRow) {
  // ✅ Canonical first
  if (typeof r.qty_change === "number") return r.qty_change;
  if (typeof r.delta === "number") return r.delta;
  if (typeof r.change_qty === "number") return r.change_qty;

  // fallback legacy
  if (typeof r.amount === "number" && r.amount !== 0) {
    const m = String(r.mode ?? "").toUpperCase();
    if (m === "REDUCE") return -Math.abs(r.amount);
    if (m === "ADD") return Math.abs(r.amount);
    return r.amount;
  }

  return 0;
}

function pickMode(r: MovementRow) {
  return r.movement_mode ?? r.mode ?? "—";
}

function fmtDelta(n: number) {
  const sign = n > 0 ? "+" : "";
  return `${sign}${n}`;
}

function fmtWhen(iso?: string) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

// ✅ local YYYY-MM-DD (avoid UTC off-by-one)
function localYMD(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

type SnapshotStatus = "unknown" | "ok" | "missing";

export default function InventoryHistoryScreen() {
  const router = useRouter();
  const { activeOrgName, activeRole, activeStoreId, activeStoreName } = useOrg();

  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<MovementRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [limit] = useState(DEFAULT_LIMIT);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);

  // ✅ Emergency Snapshot state
  const [snapshotLoading, setSnapshotLoading] = useState(false);
  const [snapshotStatus, setSnapshotStatus] = useState<SnapshotStatus>("unknown");

  const roleLabel = useMemo(() => activeRole ?? "—", [activeRole]);

  const isOwnerOrAdmin = useMemo(() => {
    const r = (activeRole ?? "staff") as "owner" | "admin" | "staff";
    return r === "owner" || r === "admin";
  }, [activeRole]);

  const checkTodaySnapshot = useCallback(async () => {
    // We only care for owner/admin (since emergency button is owner/admin)
    if (!activeStoreId || !isOwnerOrAdmin) {
      setSnapshotStatus("unknown");
      return;
    }

    const today = localYMD();

    try {
      // ✅ check if snapshot exists for today (auto succeeded)
      const { data, error: e } = await supabase
        .from("inventory_daily_snapshots")
        .select("id")
        .eq("store_id", activeStoreId)
        .eq("snapshot_date", today)
        .limit(1);

      if (e) throw e;

      if (Array.isArray(data) && data.length > 0) setSnapshotStatus("ok");
      else setSnapshotStatus("missing");
    } catch {
      // if table blocked by RLS or any error → treat as unknown (no button shown unless missing is confirmed)
      setSnapshotStatus("unknown");
    }
  }, [activeStoreId, isOwnerOrAdmin]);

  const load = useCallback(
    async (opts?: { reset?: boolean }) => {
      if (!activeStoreId) {
        setRows([]);
        setError("No active store selected.");
        return;
      }

      const reset = !!opts?.reset;
      const nextOffset = reset ? 0 : offset;

      setLoading(true);
      setError(null);

      try {
        const { data, error: e } = await supabase.rpc("get_inventory_movements", {
          p_store_id: activeStoreId,
          p_limit: limit,
          p_offset: nextOffset,
        });
        if (e) throw e;

        const incoming = (data ?? []) as MovementRow[];

        if (reset) {
          setRows(incoming);
          setOffset(incoming.length);
        } else {
          setRows((prev) => [...prev, ...incoming]);
          setOffset(nextOffset + incoming.length);
        }

        setHasMore(incoming.length === limit);
      } catch (err: any) {
        setError(err?.message ?? "Failed to load history");
        if (reset) setRows([]);
      } finally {
        setLoading(false);
      }
    },
    [activeStoreId, limit, offset]
  );

  useEffect(() => {
    setOffset(0);
    setHasMore(true);
    load({ reset: true });
    // ✅ also check snapshot status on store change
    checkTodaySnapshot();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeStoreId]);

  const refresh = useCallback(async () => {
    await load({ reset: true });
    await checkTodaySnapshot();
  }, [load, checkTodaySnapshot]);

  const loadMore = useCallback(() => {
    if (loading) return;
    if (!hasMore) return;
    load({ reset: false });
  }, [loading, hasMore, load]);

  // ✅ Emergency Snapshot (Owner/Admin only, only when auto missing)
  const generateEmergencySnapshot = useCallback(async () => {
    if (snapshotLoading) return;

    if (!activeStoreId) {
      Alert.alert("Missing", "No active store selected.");
      return;
    }

    if (!isOwnerOrAdmin) {
      Alert.alert("No Access", "Owner/Admin only.");
      return;
    }

    const dateStr = localYMD(); // local date

    setSnapshotLoading(true);
    try {
      const access = await supabase.rpc("ensure_my_store_access", {
        p_store_id: activeStoreId,
      });
      if (access.error) throw access.error;

      const { error: snapErr } = await supabase.rpc("generate_daily_inventory_snapshot", {
        p_store_id: activeStoreId,
        p_date: dateStr,
      });

      if (snapErr) throw snapErr;

      Alert.alert("Emergency Snapshot ✅", `Snapshot created for ${dateStr}`);
      await refresh();
    } catch (err: any) {
      Alert.alert("Snapshot Failed", err?.message ?? "Unknown error");
    } finally {
      setSnapshotLoading(false);
    }
  }, [snapshotLoading, activeStoreId, isOwnerOrAdmin, refresh]);

  const showEmergencyButton = isOwnerOrAdmin && snapshotStatus === "missing";

  const autoStatusText = useMemo(() => {
    if (!isOwnerOrAdmin) {
      return "Auto snapshot runs automatically. (Emergency tools are Admin only.)";
    }
    if (snapshotStatus === "ok") return "Auto snapshot: OK ✅ (today already captured)";
    if (snapshotStatus === "missing")
      return "Auto snapshot: MISSING ⚠️ (use Emergency Snapshot below)";
    return "Auto snapshot: Checking…";
  }, [isOwnerOrAdmin, snapshotStatus]);

  return (
    <Screen scroll>
      <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 12 }}>
        <Text style={{ fontSize: 26, fontWeight: "900", color: theme.colors.text }}>
          History
        </Text>

        <Pressable
          onPress={() => router.back()}
          style={{
            borderWidth: 1,
            borderColor: theme.colors.border,
            borderRadius: theme.radius.pill,
            paddingHorizontal: 14,
            paddingVertical: 10,
            backgroundColor: theme.colors.card,
          }}
        >
          <Text style={{ color: theme.colors.text, fontWeight: "900" }}>Back</Text>
        </Pressable>
      </View>

      <Card style={{ gap: 10 }}>
        <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>Organization</Text>
        <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 18 }}>
          {activeOrgName ?? "—"}
        </Text>

        <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>Active Store</Text>
        <Text style={{ color: theme.colors.text, fontWeight: "900" }}>
          {activeStoreName ?? "—"}
        </Text>

        <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>Role</Text>
        <Text style={{ color: theme.colors.text, fontWeight: "900" }}>{roleLabel}</Text>

        {/* ✅ Auto snapshot status info */}
        <Text style={{ color: theme.colors.muted, fontWeight: "800", marginTop: 6 }}>
          {autoStatusText}
        </Text>

        {/* ✅ ORDER + STYLE */}
        <Button
          title={loading ? "Loading..." : "Refresh"}
          onPress={refresh}
          disabled={loading}
          variant="primary"
          style={{ marginTop: 6 }}
        />

        {/* ✅ MNONO / PROMINENT */}
        <Button
          title="Daily Closing Report"
          onPress={() => router.push("/(tabs)/stores/daily-closing")}
          disabled={loading}
          variant="primary"
          style={{ marginTop: 10 }}
        />

        {/* ✅ EMERGENCY ONLY (shows only when auto missing) */}
        {showEmergencyButton && (
          <>
            <Text style={{ color: theme.colors.muted, fontWeight: "800", marginTop: 10 }}>
              (Emergency) Tumia hii tu pale ambapo auto snapshot imeshindwa. Mfumo utajaribu
              ku-snapshot automatically kila siku.
            </Text>

            <Button
              title={snapshotLoading ? "Generating..." : "Emergency Snapshot (Admin)"}
              onPress={generateEmergencySnapshot}
              disabled={snapshotLoading || loading}
              variant="secondary"
              style={{ marginTop: 10 }}
            />
          </>
        )}
      </Card>

      {!!error && (
        <Card
          style={{
            borderColor: theme.colors.dangerBorder,
            backgroundColor: theme.colors.dangerSoft,
          }}
        >
          <Text style={{ color: theme.colors.danger, fontWeight: "900" }}>{error}</Text>
        </Card>
      )}

      <Text style={{ fontWeight: "900", fontSize: 16, color: theme.colors.text }}>
        Movements ({rows.length})
      </Text>

      {rows.length === 0 ? (
        <Card>
          <Text style={{ color: theme.colors.text, fontWeight: "900" }}>No history yet</Text>
          <Text style={{ color: theme.colors.muted, fontWeight: "700", marginTop: 6 }}>
            Fanya Adjust Stock kisha urudi hapa ku-check movement logs.
          </Text>
        </Card>
      ) : (
        rows.map((r) => {
          const delta = pickDelta(r);
          const positive = delta >= 0;

          return (
            <Card key={pickMovementId(r)} style={{ gap: 8 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 10 }}>
                <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 16 }}>
                  {pickProductName(r)}
                </Text>

                <View
                  style={{
                    borderWidth: 1,
                    borderColor: positive ? "rgba(52,211,153,0.35)" : theme.colors.dangerBorder,
                    paddingHorizontal: 12,
                    paddingVertical: 6,
                    borderRadius: theme.radius.pill,
                    backgroundColor: positive ? "rgba(52,211,153,0.10)" : theme.colors.dangerSoft,
                  }}
                >
                  <Text
                    style={{
                      color: positive ? theme.colors.emerald : theme.colors.danger,
                      fontWeight: "900",
                    }}
                  >
                    {fmtDelta(delta)}
                  </Text>
                </View>
              </View>

              <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>
                SKU: <Text style={{ color: theme.colors.text }}>{r.sku ?? "—"}</Text>
                {"   "}•{"   "}
                Mode: <Text style={{ color: theme.colors.text }}>{pickMode(r)}</Text>
              </Text>

              {!!r.note && (
                <Text style={{ color: theme.colors.text, fontWeight: "800" }}>
                  Note: <Text style={{ color: theme.colors.muted }}>{r.note}</Text>
                </Text>
              )}

              <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>
                When: <Text style={{ color: theme.colors.text }}>{fmtWhen(r.created_at)}</Text>
              </Text>
            </Card>
          );
        })
      )}

      <View style={{ height: 14 }} />

      {hasMore && rows.length > 0 && (
        <Button
          title={loading ? "Loading..." : "Load more"}
          onPress={loadMore}
          disabled={loading}
          variant="secondary"
        />
      )}
    </Screen>
  );
}