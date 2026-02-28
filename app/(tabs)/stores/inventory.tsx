// app/(tabs)/stores/inventory.tsx
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useNetInfo } from "@react-native-community/netinfo";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Keyboard, Pressable, Text, TextInput, View, Vibration } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { useOrg } from "../../../src/context/OrgContext";
import { supabase } from "../../../src/supabase/supabaseClient";
import { Button } from "../../../src/ui/Button";
import { Card } from "../../../src/ui/Card";
import { Screen } from "../../../src/ui/Screen";
import { theme } from "../../../src/ui/theme";

import { subscribeScanBarcode } from "@/src/utils/scanBus";

type InventoryRow = {
  product_id: string;
  product_name: string;
  sku: string | null;
  unit: string | null;
  category: string | null;
  barcode: string | null; // ✅ v2
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

function cleanBarcode(raw: any) {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  return s.replace(/\s+/g, "");
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

  const rawIsOnline = !!(netInfo.isConnected && netInfo.isInternetReachable !== false);

  const [stableIsOnline, setStableIsOnline] = useState<boolean>(rawIsOnline);
  const netDebounceRef = useRef<any>(null);

  useEffect(() => {
    if (netDebounceRef.current) clearTimeout(netDebounceRef.current);
    netDebounceRef.current = setTimeout(() => {
      setStableIsOnline(rawIsOnline);
    }, 700);
    return () => {
      if (netDebounceRef.current) clearTimeout(netDebounceRef.current);
    };
  }, [rawIsOnline]);

  const isOffline = !stableIsOnline;

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

  // ✅ NEW: recent scanned priority
  const [recentScannedIds, setRecentScannedIds] = useState<string[]>([]);
  const bumpRecent = useCallback((productId: string) => {
    if (!productId) return;
    setRecentScannedIds((prev) => {
      const next = [productId, ...prev.filter((x) => x !== productId)];
      return next.slice(0, 25);
    });
  }, []);

  const vibrateScan = useCallback(() => {
    try {
      Vibration.vibrate(12);
    } catch {}
  }, []);

  // Threshold cache
  const [thrByProductId, setThrByProductId] = useState<Record<string, number>>({});
  const [thrLoading, setThrLoading] = useState(false);

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

      if (syncIso) setLastSyncedAt(syncIso);

      if (Array.isArray(parsed) && parsed.length > 0) {
        setRows(parsed);
        setSource("CACHED");
        setError(null);
      } else {
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
      } catch {}
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
      setError(null);
      await loadFromCache();
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // ✅ D1: use v2 (includes barcode)
      const { data, error: e } = await supabase.rpc("get_store_inventory_v2", {
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
      setError(err?.message ?? "Failed to load inventory");
      await loadFromCache();
    } finally {
      setLoading(false);
    }
  }, [activeStoreId, storeOrgMismatch, isOffline, loadFromCache, saveCache, rows]);

  const loadThresholds = useCallback(async () => {
    if (!activeStoreId) return;
    if (storeOrgMismatch) return;
    if (isOffline) return;

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

  useEffect(() => {
    didInitRef.current = false;
    setError(null);
    setThrByProductId({});
    setThrLoading(false);
    setRecentScannedIds([]);
  }, [activeStoreId]);

  useEffect(() => {
    if (!activeStoreId) return;
    if (didInitRef.current) return;
    didInitRef.current = true;

    void (async () => {
      await loadFromCache();
      await loadLive();
    })();
  }, [activeStoreId, loadFromCache, loadLive]);

  const AUTO_REFRESH_MS = 25_000;
  const lastAutoRefreshAtRef = useRef<number>(0);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      let intervalId: any = null;

      const runOnce = async () => {
        if (!alive) return;
        if (!activeStoreId) return;
        if (storeOrgMismatch) return;

        const now = Date.now();
        if (now - lastAutoRefreshAtRef.current < 1500) return;
        lastAutoRefreshAtRef.current = now;

        if (loading) return;

        if (isOffline) {
          await loadFromCache();
          return;
        }

        await loadLive();
      };

      void runOnce();

      intervalId = setInterval(() => {
        if (!alive) return;
        if (!activeStoreId) return;
        if (storeOrgMismatch) return;
        if (isOffline) return;
        if (loading) return;
        void loadLive();
      }, AUTO_REFRESH_MS);

      return () => {
        alive = false;
        if (intervalId) clearInterval(intervalId);
      };
    }, [activeStoreId, storeOrgMismatch, isOffline, loading, loadFromCache, loadLive])
  );

  useEffect(() => {
    void loadThresholds();
  }, [loadThresholds]);

  // ✅ C: Listen to ScanBus for Inventory
  const handleInventoryScan = useCallback(
    (rawInput: any) => {
      const code = cleanBarcode(rawInput);
      if (!code) return;

      setQ(code);

      // try match for bump + vibrate
      const target =
        rows.find((r) => cleanBarcode(r.barcode) === code) ||
        rows.find((r) => cleanBarcode(r.sku) === code);

      if (target) {
        bumpRecent(target.product_id);
        vibrateScan();
      } else {
        // no match yet -> user can press Refresh if needed
        // keep silent (no error spam)
      }
    },
    [bumpRecent, rows, vibrateScan]
  );

  useEffect(() => {
    const unsub = subscribeScanBarcode((barcode) => {
      handleInventoryScan(barcode);
    });
    return unsub;
  }, [handleInventoryScan]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();

    const base = !needle
      ? rows
      : rows.filter((r) => {
          const hay = `${r.product_name ?? ""} ${r.sku ?? ""} ${r.unit ?? ""} ${r.category ?? ""} ${r.barcode ?? ""}`.toLowerCase();
          return hay.includes(needle);
        });

    if (!recentScannedIds.length) return base;

    const rank = new Map<string, number>();
    recentScannedIds.forEach((id, idx) => rank.set(id, idx));

    const copy = [...base];
    copy.sort((a, b) => {
      const ra = rank.has(a.product_id) ? (rank.get(a.product_id) as number) : 999999;
      const rb = rank.has(b.product_id) ? (rank.get(b.product_id) as number) : 999999;
      if (ra !== rb) return ra - rb;
      return (a.product_name ?? "").localeCompare(b.product_name ?? "");
    });

    return copy;
  }, [rows, q, recentScannedIds]);

  const openAdjust = useCallback(
    (r: InventoryRow) => {
      if (!activeStoreId) return;

      if (!canAdjust) {
        Alert.alert("No Access", "Owner/Admin only.");
        return;
      }

      if (isOffline) {
        Alert.alert(
          "Offline",
          "Huwezi kufanya Adjust Stock bila mtandao. Washa data/Wi-Fi kisha jaribu tena."
        );
        return;
      }

      router.push({
        pathname: "/(tabs)/stores/adjust" as any,
        params: {
          storeId: activeStoreId,
          storeName: activeStoreName ?? "",
          productId: r.product_id,
          productName: r.product_name,
          sku: r.sku ?? "",
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
      Alert.alert(
        "Offline",
        "Low Stock list inahitaji mtandao kwa sasa. Washa data/Wi-Fi kisha jaribu tena."
      );
      return;
    }
    router.push({
      pathname: "/(tabs)/stores/inventory/low-stock-alerts" as any,
      params: { storeId: activeStoreId, storeName: activeStoreName ?? "" },
    } as any);
  }, [activeStoreId, activeStoreName, router, storeOrgMismatch, isOffline]);

  // ✅ C: go scan
  const goScan = useCallback(() => {
    if (!activeStoreId) {
      Alert.alert("Missing", "No active store selected.");
      return;
    }
    if (storeOrgMismatch) {
      Alert.alert("Mismatch", "Active store haifanani na Organization. Chagua store tena.");
      return;
    }
    router.push("/(tabs)/stores/scan");
  }, [activeStoreId, router, storeOrgMismatch]);

  const StatusLine = useMemo(() => {
    const mode = isOffline ? "OFFLINE" : "ONLINE";

    const effectiveSource: SourceMode =
      source === "NONE" && (rows ?? []).length > 0 ? "CACHED" : source;

    const src = isOffline
      ? "CACHED"
      : effectiveSource === "LIVE"
        ? "LIVE"
        : effectiveSource === "CACHED"
          ? "CACHED"
          : "—";

    return `${mode} • Source: ${src} • Last sync: ${fmtLocal(lastSyncedAt)}`;
  }, [isOffline, source, lastSyncedAt, rows]);

  return (
    <Screen scroll>
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

        {/* ✅ C: action row with Scan icon (no big card) */}
        <View style={{ flexDirection: "row", gap: 10, marginTop: 6, alignItems: "center" }}>
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

          <Pressable
            onPress={goScan}
            hitSlop={10}
            style={({ pressed }) => [
              {
                width: 52,
                height: 52,
                borderRadius: 999,
                alignItems: "center",
                justifyContent: "center",
                borderWidth: 1,
                borderColor: theme.colors.emeraldBorder,
                backgroundColor: theme.colors.emeraldSoft,
                opacity: !activeStoreId ? 0.5 : pressed ? 0.92 : 1,
                transform: pressed ? [{ scale: 0.995 }] : [{ scale: 1 }],
                shadowColor: "#000",
                shadowOpacity: !activeStoreId ? 0 : 0.25,
                shadowRadius: 10,
                shadowOffset: { width: 0, height: 6 },
                elevation: !activeStoreId ? 0 : 8,
              },
            ]}
          >
            <Ionicons name="barcode-outline" size={24} color={theme.colors.text} />
          </Pressable>
        </View>

        <View style={{ marginTop: 10 }}>
          <Button
            title={thrLoading ? "Checking Low Stock..." : "Low Stock"}
            onPress={openLowStockList}
            disabled={loading || thrLoading || !activeStoreId || isOffline}
            variant="secondary"
          />
        </View>

        <Text style={{ color: theme.colors.muted, fontWeight: "800", marginTop: 8 }}>
          Tip: Scan → search inawekwa auto → item inapanda juu ili u-Adjust haraka.
        </Text>
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
          placeholder="Tafuta kwa jina / SKU / category / barcode..."
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
                    {r.barcode ? (
                      <>
                        {"   "}•{"   "}
                        <Text style={{ color: theme.colors.text }}>{r.barcode}</Text>
                      </>
                    ) : null}
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