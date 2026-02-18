// app/(tabs)/stores/inventory.tsx
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useNetInfo } from "@react-native-community/netinfo";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Keyboard, Pressable, Text, TextInput, View } from "react-native";

import { useOrg } from "../../../src/context/OrgContext";
import { supabase } from "../../../src/supabase/supabaseClient";
import { Button } from "../../../src/ui/Button";
import { Card } from "../../../src/ui/Card";
import { Screen } from "../../../src/ui/Screen";
import { theme } from "../../../src/ui/theme";

type InventoryRow = {
  product_id: string;
  product_name: string;
  sku: string | null;
  unit: string | null;
  category: string | null;
  qty: number;
};

type SourceMode = "LIVE" | "CACHED" | "NONE";

function fmtLocal(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  try {
    return d.toLocaleString();
  } catch {
    return String(d);
  }
}

export default function StoreInventoryScreen() {
  const router = useRouter();
  const netInfo = useNetInfo();

  const {
    activeOrgId,
    activeOrgName,
    activeRole,
    activeStoreId,
    activeStoreName,
    stores,
  } = useOrg();

  const canAdjust = useMemo(
    () => (["owner", "admin"] as const).includes((activeRole ?? "staff") as any),
    [activeRole]
  );

  /**
   * ✅ IMPORTANT: NetInfo can “flutter” (kimulimuli) when isInternetReachable changes.
   * We debounce into a STABLE online/offline signal to avoid flashing + loops.
   */
  const rawIsOnline = !!(netInfo.isConnected && netInfo.isInternetReachable !== false);

  const [stableIsOnline, setStableIsOnline] = useState<boolean>(rawIsOnline);
  const netDebounceRef = useRef<any>(null);

  useEffect(() => {
    if (netDebounceRef.current) clearTimeout(netDebounceRef.current);
    netDebounceRef.current = setTimeout(() => {
      setStableIsOnline(rawIsOnline);
    }, 700); // 0.7s debounce = no flashing
    return () => {
      if (netDebounceRef.current) clearTimeout(netDebounceRef.current);
    };
  }, [rawIsOnline]);

  const isOffline = !stableIsOnline;

  // ✅ Guard: ensure activeStore belongs to activeOrg (prevents cross-org bleed)
  const storeOrgMismatch = useMemo(() => {
    if (!activeStoreId || !activeOrgId) return false;
    const s = (stores ?? []).find((x: any) => String(x.store_id) === String(activeStoreId));
    if (!s) return false;
    return String(s.organization_id) !== String(activeOrgId);
  }, [activeOrgId, activeStoreId, stores]);

  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<InventoryRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [q, setQ] = useState("");

  // ✅ Threshold cache: product_id -> threshold (LIVE only for now)
  const [thrByProductId, setThrByProductId] = useState<Record<string, number>>({});
  const [thrLoading, setThrLoading] = useState(false);

  // ✅ Offline-first status
  const [source, setSource] = useState<SourceMode>("NONE");
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);

  const CACHE_KEY = useMemo(() => {
    if (!activeStoreId) return null;
    return `zetra_inv_cache_v1:${activeStoreId}`;
  }, [activeStoreId]);

  const SYNC_KEY = useMemo(() => {
    if (!activeStoreId) return null;
    return `zetra_inv_last_sync_v1:${activeStoreId}`;
  }, [activeStoreId]);

  const didInitRef = useRef(false);

  const loadFromCache = useCallback(async () => {
    if (!CACHE_KEY || !SYNC_KEY) return;

    try {
      const [rawRows, rawSync] = await Promise.all([
        AsyncStorage.getItem(CACHE_KEY),
        AsyncStorage.getItem(SYNC_KEY),
      ]);

      const parsed: InventoryRow[] = rawRows ? JSON.parse(rawRows) : [];
      const syncIso = rawSync ? String(rawSync) : null;

      // ✅ Always set lastSyncedAt if we have it (even when rows empty)
      if (syncIso) setLastSyncedAt(syncIso);

      if (Array.isArray(parsed) && parsed.length > 0) {
        setRows(parsed);
        setSource("CACHED");
        setError(null);
      } else {
        // no cache found: keep existing rows if any (do NOT wipe)
        if ((rows ?? []).length === 0) setSource("NONE");
      }
    } catch {
      if ((rows ?? []).length === 0) setSource("NONE");
    }
  }, [CACHE_KEY, SYNC_KEY, rows]);

  const saveCache = useCallback(
    async (nextRows: InventoryRow[], syncIso: string) => {
      if (!CACHE_KEY || !SYNC_KEY) return;
      try {
        await Promise.all([
          AsyncStorage.setItem(CACHE_KEY, JSON.stringify(nextRows ?? [])),
          AsyncStorage.setItem(SYNC_KEY, syncIso),
        ]);
      } catch {
        // best-effort only
      }
    },
    [CACHE_KEY, SYNC_KEY]
  );

  const loadLive = useCallback(async () => {
    if (!activeStoreId) {
      setError("No active store selected.");
      if ((rows ?? []).length === 0) setSource("NONE");
      return;
    }

    if (storeOrgMismatch) {
      setError("Active store haifanani na Organization. Tafadhali chagua store tena.");
      if ((rows ?? []).length === 0) setSource("NONE");
      return;
    }

    if (isOffline) {
      // ✅ Offline: never fetch, show cache only (no flashing)
      setError(null);
      await loadFromCache();
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { data, error: e } = await supabase.rpc("get_store_inventory", {
        p_store_id: activeStoreId,
      });
      if (e) throw e;

      const nextRows = (data ?? []) as InventoryRow[];
      setRows(nextRows);
      setSource("LIVE");

      const nowIso = new Date().toISOString();
      setLastSyncedAt(nowIso);

      void saveCache(nextRows, nowIso);
    } catch (err: any) {
      // Live failed -> fallback to cache (if any)
      setError(err?.message ?? "Failed to load inventory");
      await loadFromCache();
    } finally {
      setLoading(false);
    }
  }, [activeStoreId, storeOrgMismatch, isOffline, loadFromCache, saveCache, rows]);

  const loadThresholds = useCallback(async () => {
    // ✅ Only when ONLINE + have rows
    if (!activeStoreId) return;
    if (storeOrgMismatch) return;
    if (isOffline) {
      // keep previous thresholds (do NOT spam setState to new {})
      return;
    }

    const ids = (rows ?? []).map((r) => r.product_id).filter(Boolean);
    if (ids.length === 0) {
      setThrByProductId({});
      return;
    }

    setThrLoading(true);
    try {
      const results = await Promise.all(
        ids.map(async (pid) => {
          try {
            const { data, error: e } = await supabase.rpc("get_inventory_threshold", {
              p_store_id: activeStoreId,
              p_product_id: pid,
            });
            if (e) throw e;

            const n = Number(data ?? 0);
            return [pid, Number.isFinite(n) ? n : 0] as const;
          } catch {
            return [pid, 0] as const;
          }
        })
      );

      const next: Record<string, number> = {};
      for (const [pid, thr] of results) next[pid] = thr;
      setThrByProductId(next);
    } finally {
      setThrLoading(false);
    }
  }, [activeStoreId, rows, storeOrgMismatch, isOffline]);

  // ✅ INIT: load cache once when store changes, then attempt live if online
  useEffect(() => {
    didInitRef.current = false;
    // Also reset status safely
    setError(null);
    setThrByProductId({});
    setThrLoading(false);
  }, [activeStoreId]);

  useEffect(() => {
    if (!activeStoreId) return;

    // Run only once per store selection
    if (didInitRef.current) return;
    didInitRef.current = true;

    void (async () => {
      await loadFromCache(); // always show last known fast
      await loadLive(); // if online, upgrade to live; if offline, stays cached
    })();
  }, [activeStoreId, loadFromCache, loadLive]);

  // ✅ When rows change, refresh thresholds (ONLINE only)
  useEffect(() => {
    void loadThresholds();
  }, [loadThresholds]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;

    return rows.filter((r) => {
      const hay = `${r.product_name ?? ""} ${r.sku ?? ""} ${r.unit ?? ""} ${r.category ?? ""}`.toLowerCase();
      return hay.includes(needle);
    });
  }, [rows, q]);

  const openAdjust = useCallback(
    (r: InventoryRow) => {
      if (!activeStoreId) return;

      if (!canAdjust) {
        Alert.alert("No Access", "Owner/Admin only.");
        return;
      }

      if (isOffline) {
        Alert.alert("Offline", "Huwezi kufanya Adjust Stock bila mtandao. Washa data/Wi-Fi kisha jaribu tena.");
        return;
      }

      router.push({
        pathname: "/(tabs)/stores/adjust" as any,
        params: {
          storeId: activeStoreId,
          storeName: activeStoreName ?? "",
          productId: r.product_id,
          productName: r.product_name,
          currentQty: String(r.qty),
        },
      } as any);
    },
    [activeStoreId, activeStoreName, canAdjust, router, isOffline]
  );

  const openHistory = useCallback(() => {
    if (!activeStoreId) {
      Alert.alert("Missing", "No active store selected.");
      return;
    }
    if (storeOrgMismatch) {
      Alert.alert("Mismatch", "Active store haifanani na Organization. Chagua store tena.");
      return;
    }
    router.push({
      pathname: "/(tabs)/stores/history" as any,
      params: { storeId: activeStoreId, storeName: activeStoreName ?? "" },
    } as any);
  }, [activeStoreId, activeStoreName, router, storeOrgMismatch]);

  const openLowStockList = useCallback(() => {
    if (!activeStoreId) {
      Alert.alert("Missing", "No active store selected.");
      return;
    }
    if (storeOrgMismatch) {
      Alert.alert("Mismatch", "Active store haifanani na Organization. Chagua store tena.");
      return;
    }
    if (isOffline) {
      Alert.alert("Offline", "Low Stock list inahitaji mtandao kwa sasa. Washa data/Wi-Fi kisha jaribu tena.");
      return;
    }
    router.push({
      pathname: "/(tabs)/stores/inventory/low-stock-alerts" as any,
      params: { storeId: activeStoreId, storeName: activeStoreName ?? "" },
    } as any);
  }, [activeStoreId, activeStoreName, router, storeOrgMismatch, isOffline]);

  const StatusLine = useMemo(() => {
    const mode = isOffline ? "OFFLINE" : "ONLINE";

    // ✅ If we have rows but source is NONE, treat as CACHED to avoid weird “—”
    const effectiveSource: SourceMode =
      source === "NONE" && (rows ?? []).length > 0 ? "CACHED" : source;

    const src =
      isOffline
        ? "CACHED"
        : (effectiveSource === "LIVE"
            ? "LIVE"
            : effectiveSource === "CACHED"
              ? "CACHED"
              : "—");

    return `${mode} • Source: ${src} • Last sync: ${fmtLocal(lastSyncedAt)}`;
  }, [isOffline, source, lastSyncedAt, rows]);

  return (
    <Screen scroll>
      {/* ✅ Top offline banner (stable, no blinking) */}
      {isOffline ? (
        <View
          style={{
            borderWidth: 1,
            borderColor: "rgba(245,158,11,0.45)",
            backgroundColor: "rgba(245,158,11,0.10)",
            paddingVertical: 10,
            paddingHorizontal: 12,
            borderRadius: theme.radius.lg,
            marginBottom: 8,
          }}
        >
          <Text style={{ color: theme.colors.text, fontWeight: "900" }}>
            OFFLINE • Mtandao haupatikani (data ya mwisho inaweza kuonekana)
          </Text>
        </View>
      ) : null}

      <Text style={{ fontSize: 26, fontWeight: "900", color: theme.colors.text }}>
        Inventory
      </Text>

      <Card style={{ gap: 10 }}>
        <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>Organization</Text>
        <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 18 }}>
          {activeOrgName ?? "—"}
        </Text>

        <Text style={{ color: theme.colors.muted, fontWeight: "800", marginTop: 2 }}>
          Active Store
        </Text>
        <Text style={{ color: theme.colors.text, fontWeight: "900" }}>
          {activeStoreName ?? "—"}
        </Text>

        <Text style={{ color: theme.colors.muted, fontWeight: "800", marginTop: 2 }}>
          Role
        </Text>
        <Text style={{ color: theme.colors.text, fontWeight: "900" }}>
          {activeRole ?? "—"}
        </Text>

        {/* ✅ Status card */}
        <View
          style={{
            marginTop: 6,
            borderWidth: 1,
            borderColor: theme.colors.border,
            borderRadius: theme.radius.xl,
            backgroundColor: theme.colors.card,
            padding: 14,
          }}
        >
          <Text style={{ color: theme.colors.muted, fontWeight: "900" }}>Status</Text>
          <Text style={{ color: theme.colors.text, fontWeight: "900", marginTop: 6 }}>
            {StatusLine}
          </Text>

          {isOffline ? (
            <Text style={{ color: theme.colors.muted, fontWeight: "800", marginTop: 8 }}>
              Ukiwa OFFLINE, app itaonyesha “last known cache” bila kukwama.
            </Text>
          ) : null}
        </View>

        <View style={{ flexDirection: "row", gap: 10, marginTop: 6 }}>
          <View style={{ flex: 1 }}>
            <Button
              title={loading ? "Loading..." : "Refresh"}
              onPress={loadLive}
              disabled={loading}
              variant="primary"
            />
          </View>

          <View style={{ flex: 1 }}>
            <Button
              title="History"
              onPress={openHistory}
              disabled={loading || !activeStoreId}
              variant="secondary"
            />
          </View>
        </View>

        <View style={{ marginTop: 10 }}>
          <Button
            title={thrLoading ? "Checking Low Stock..." : "Low Stock"}
            onPress={openLowStockList}
            disabled={loading || thrLoading || !activeStoreId || isOffline}
            variant="secondary"
          />
        </View>
      </Card>

      {!!error && (
        <Card
          style={{
            borderColor: theme.colors.dangerBorder,
            backgroundColor: theme.colors.dangerSoft,
          }}
        >
          <Text style={{ color: theme.colors.danger, fontWeight: "900" }}>{error}</Text>

          {storeOrgMismatch && (
            <Text style={{ color: theme.colors.muted, fontWeight: "800", marginTop: 8 }}>
              Nenda Stores → chagua store ya org hii kisha urudi Inventory.
            </Text>
          )}
        </Card>
      )}

      <Card style={{ gap: 10 }}>
        <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 16 }}>
          Search
        </Text>

        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder="Tafuta kwa jina / SKU / category..."
          placeholderTextColor="rgba(255,255,255,0.35)"
          returnKeyType="search"
          onSubmitEditing={Keyboard.dismiss}
          style={{
            borderWidth: 1,
            borderColor: theme.colors.border,
            borderRadius: theme.radius.lg,
            backgroundColor: "rgba(255,255,255,0.05)",
            paddingHorizontal: 14,
            paddingVertical: 12,
            color: theme.colors.text,
            fontWeight: "800",
          }}
        />

        {!canAdjust && (
          <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>
            (Read-only) Muombe Owner/Admin kufanya stock adjustment.
          </Text>
        )}

        {isOffline ? (
          <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>
            Offline: “write actions” (Adjust/Save Alert) zimezimwa kwa usalama.
          </Text>
        ) : null}
      </Card>

      <Text style={{ fontWeight: "900", fontSize: 16, color: theme.colors.text }}>
        Items ({filtered.length})
      </Text>

      {filtered.length === 0 ? (
        <Card>
          <Text style={{ color: theme.colors.text, fontWeight: "900" }}>
            No inventory rows
          </Text>
          <Text style={{ color: theme.colors.muted, fontWeight: "700", marginTop: 6 }}>
            Bonyeza "Refresh" au hakikisha ume-select active store.
          </Text>
        </Card>
      ) : (
        filtered.map((r) => {
          const thr = Number(thrByProductId?.[r.product_id] ?? 0);
          const isLow = !isOffline && thr > 0 && Number(r.qty ?? 0) <= thr;

          return (
            <Pressable
              key={r.product_id}
              android_ripple={{ color: "transparent" }}
              style={({ pressed }) => [
                {
                  borderWidth: 1,
                  borderColor: isLow ? "rgba(245,158,11,0.55)" : theme.colors.border,
                  borderRadius: theme.radius.xl,
                  backgroundColor: theme.colors.card,
                  padding: 16,
                  opacity: pressed ? 0.96 : 1,
                  marginBottom: 12,
                },
              ]}
            >
              <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 16 }}>
                    {r.product_name}
                  </Text>

                  <Text style={{ color: theme.colors.muted, fontWeight: "800", marginTop: 6 }}>
                    SKU: <Text style={{ color: theme.colors.text }}>{r.sku ?? "—"}</Text>
                    {"   "}|{"   "}
                    Unit: <Text style={{ color: theme.colors.text }}>{r.unit ?? "—"}</Text>
                  </Text>

                  <Text style={{ color: theme.colors.muted, fontWeight: "800", marginTop: 6 }}>
                    Category:{" "}
                    <Text style={{ color: theme.colors.text }}>{r.category ?? "—"}</Text>
                  </Text>
                </View>

                {isLow ? (
                  <View
                    style={{
                      alignSelf: "flex-start",
                      paddingHorizontal: 10,
                      paddingVertical: 6,
                      borderRadius: theme.radius.pill,
                      borderWidth: 1,
                      borderColor: "rgba(245,158,11,0.45)",
                      backgroundColor: "rgba(245,158,11,0.12)",
                    }}
                  >
                    <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 12 }}>
                      LOW STOCK
                    </Text>
                  </View>
                ) : null}
              </View>

              <View style={{ marginTop: 10, flexDirection: "row", gap: 10 }}>
                {/* Qty circle */}
                <View
                  style={{
                    borderWidth: 1,
                    borderColor: "rgba(52,211,153,0.35)",
                    borderRadius: 999,
                    backgroundColor: "rgba(52, 211, 153, 0.10)",
                    width: 118,
                    height: 118,
                    alignItems: "center",
                    justifyContent: "center",
                    paddingHorizontal: 10,
                  }}
                >
                  <Text
                    style={{
                      color: theme.colors.emerald,
                      fontWeight: "900",
                      fontSize: 16,
                      textAlign: "center",
                    }}
                  >
                    QTY: {r.qty}
                  </Text>

                  <Text
                    style={{
                      color: theme.colors.muted,
                      fontWeight: "800",
                      marginTop: 6,
                      textAlign: "center",
                    }}
                  >
                    Alert {"\u2264"} {isOffline ? "—" : String(thr)}
                  </Text>
                </View>

                {/* Buttons column */}
                <View style={{ flex: 1, gap: 10 }}>
                  <Button
                    title="Alert Level"
                    variant="secondary"
                    onPress={() => {
                      if (isOffline) {
                        Alert.alert("Offline", "Huwezi kubadili Alert Level bila mtandao.");
                        return;
                      }
                      router.push({
                        pathname: "/(tabs)/stores/inventory/low-stock" as any,
                        params: {
                          storeId: activeStoreId,
                          storeName: activeStoreName ?? "",
                          productId: r.product_id,
                          productName: r.product_name,
                          currentQty: String(r.qty),
                        },
                      } as any);
                    }}
                    disabled={loading || !activeStoreId || isOffline}
                  />

                  {canAdjust && (
                    <Button
                      title="Adjust Stock"
                      variant="secondary"
                      onPress={() => openAdjust(r)}
                      disabled={loading || isOffline}
                    />
                  )}
                </View>
              </View>
            </Pressable>
          );
        })
      )}
    </Screen>
  );
}