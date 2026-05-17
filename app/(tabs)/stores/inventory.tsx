// app/(tabs)/stores/inventory.tsx
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useNetInfo } from "@react-native-community/netinfo";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Keyboard, Platform, Pressable, Text, TextInput, View, Vibration } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { useOrg } from "../../../src/context/OrgContext";
import { supabase } from "../../../src/supabase/supabaseClient";
import { Button } from "../../../src/ui/Button";
import { Card } from "../../../src/ui/Card";
import { Screen } from "../../../src/ui/Screen";
import { theme } from "../../../src/ui/theme";

import { setActiveScanScope, subscribeScanBarcode } from "@/src/utils/scanBus";

type InventoryRow = {
  product_id: string;
  product_name: string;
  sku: string | null;
  unit: string | null;
  category: string | null;
  barcode: string | null;
  qty: number;
  is_precision_product?: boolean | null;
  precision_pack_size?: number | null;
  precision_base_unit?: string | null;
  pack_unit_qty?: number | null;
  base_unit_qty?: number | null;
};

type SourceMode = "LIVE" | "CACHED" | "NONE";

type ExpirySummaryRow = {
  product_id: string;
  nearest_expiry_date: string | null;
  nearest_expiry_days_left: number | null;
  expiry_status: "SAFE" | "NEAR_EXPIRY" | "URGENT" | "EXPIRED" | null;
};

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

function fmtQty(v: any) {
  const n = Number(v ?? 0);
  if (!Number.isFinite(n)) return "0";
  return n.toFixed(3).replace(/\.?0+$/, "");
}

function getPrecisionQtyLabels(r: InventoryRow) {
  const isPrecision = Boolean(r.is_precision_product);
  const packSize = Number(r.precision_pack_size ?? 0);
  const baseQty = Number(r.base_unit_qty ?? r.qty ?? 0);

  if (!isPrecision || !Number.isFinite(packSize) || packSize <= 0) return null;

  const packQty = Number.isFinite(Number(r.pack_unit_qty))
    ? Number(r.pack_unit_qty)
    : baseQty / packSize;

  return {
    packLabel: `${r.unit ?? "Pack"}: ${fmtQty(packQty)}`,
    baseLabel: `${r.precision_base_unit ?? "Units"}: ${fmtQty(baseQty)}`,
  };
}

function fmtExpiryDate(ymd: string | null) {
  if (!ymd) return "—";
  const d = new Date(`${ymd}T00:00:00`);
  if (Number.isNaN(d.getTime())) return ymd;
  try {
    return d.toLocaleDateString();
  } catch {
    return ymd;
  }
}

function expiryLabel(daysLeft: number | null, status: string | null, ymd: string | null) {
  if (!ymd || daysLeft === null || !status) return "No expiry";

  if (status === "EXPIRED") {
    return `Expired ${Math.abs(daysLeft)}d`;
  }

  if (daysLeft === 0) {
    return "Exp today";
  }

  if (status === "URGENT") {
    return `Exp ${daysLeft}d`;
  }

  if (status === "NEAR_EXPIRY") {
    return `Exp ${daysLeft}d`;
  }

  return `Exp ${daysLeft}d`;
}

function expiryTone(status: string | null) {
  if (status === "EXPIRED") {
    return {
      borderColor: "rgba(239,68,68,0.45)",
      backgroundColor: "rgba(239,68,68,0.10)",
      textColor: "#FCA5A5",
      subColor: "#FECACA",
    };
  }

  if (status === "URGENT") {
    return {
      borderColor: "rgba(239,68,68,0.40)",
      backgroundColor: "rgba(239,68,68,0.08)",
      textColor: "#FCA5A5",
      subColor: "#FECACA",
    };
  }

  if (status === "NEAR_EXPIRY") {
    return {
      borderColor: "rgba(245,158,11,0.45)",
      backgroundColor: "rgba(245,158,11,0.10)",
      textColor: "#FCD34D",
      subColor: "#FDE68A",
    };
  }

  return {
    borderColor: "rgba(52,211,153,0.35)",
    backgroundColor: "rgba(52,211,153,0.10)",
    textColor: theme.colors.emerald,
    subColor: theme.colors.muted,
  };
}

function sameRows(a: InventoryRow[], b: InventoryRow[]) {
  if (a === b) return true;
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  if (a.length !== b.length) return false;

  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    const y = b[i];
    if (
      x.product_id !== y.product_id ||
      x.product_name !== y.product_name ||
      x.sku !== y.sku ||
      x.unit !== y.unit ||
      x.category !== y.category ||
      x.barcode !== y.barcode ||
      Number(x.qty ?? 0) !== Number(y.qty ?? 0) ||
      Boolean(x.is_precision_product) !== Boolean(y.is_precision_product) ||
      Number(x.precision_pack_size ?? 0) !== Number(y.precision_pack_size ?? 0) ||
      x.precision_base_unit !== y.precision_base_unit ||
      Number(x.pack_unit_qty ?? 0) !== Number(y.pack_unit_qty ?? 0) ||
      Number(x.base_unit_qty ?? 0) !== Number(y.base_unit_qty ?? 0)
    ) {
      return false;
    }
  }

  return true;
}

function isTypingIntoField(target: any) {
  if (!target) return false;
  const tag = String(target.tagName ?? "").toLowerCase();
  const editable = !!target.isContentEditable;
  return editable || tag === "input" || tag === "textarea" || tag === "select";
}

function ScannerFabIcon({ size = 28, color = "#E5E7EB" }: { size?: number; color?: string }) {
  const w = Math.max(22, Math.round(size * 1.05));
  const h = Math.max(18, Math.round(size * 0.78));
  const barHeights = [0.72, 0.46, 0.86, 0.58, 0.92, 0.52, 0.8];
  const barWidths = [2, 1.5, 2.2, 1.4, 2.4, 1.6, 2];
  const gap = Math.max(1.5, Math.round(size * 0.04));

  return (
    <View
      style={{
        width: size + 4,
        height: size + 4,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <View
        style={{
          width: w,
          height: h,
          borderRadius: 7,
          borderWidth: 1.8,
          borderColor: color,
          paddingHorizontal: 3,
          flexDirection: "row",
          alignItems: "flex-end",
          justifyContent: "center",
          backgroundColor: "transparent",
          gap,
        }}
      >
        {barHeights.map((ratio, idx) => (
          <View
            key={idx}
            style={{
              width: barWidths[idx],
              height: Math.max(5, Math.round(h * ratio)),
              backgroundColor: color,
              borderRadius: 1.5,
            }}
          />
        ))}
      </View>

      <View
        style={{
          position: "absolute",
          left: -1,
          top: -1,
          width: 8,
          height: 8,
          borderLeftWidth: 2,
          borderTopWidth: 2,
          borderColor: color,
          borderTopLeftRadius: 3,
        }}
      />
      <View
        style={{
          position: "absolute",
          right: -1,
          top: -1,
          width: 8,
          height: 8,
          borderRightWidth: 2,
          borderTopWidth: 2,
          borderColor: color,
          borderTopRightRadius: 3,
        }}
      />
      <View
        style={{
          position: "absolute",
          left: -1,
          bottom: -1,
          width: 8,
          height: 8,
          borderLeftWidth: 2,
          borderBottomWidth: 2,
          borderColor: color,
          borderBottomLeftRadius: 3,
        }}
      />
      <View
        style={{
          position: "absolute",
          right: -1,
          bottom: -1,
          width: 8,
          height: 8,
          borderRightWidth: 2,
          borderBottomWidth: 2,
          borderColor: color,
          borderBottomRightRadius: 3,
        }}
      />
    </View>
  );
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
    activeStoreType,
    stores,
  } = useOrg();

  const isCapitalRecoveryStore = activeStoreType === "CAPITAL_RECOVERY";

  const canAdjust = useMemo(
    () =>
      !isCapitalRecoveryStore &&
      (["owner", "admin"] as const).includes((activeRole ?? "staff") as any),
    [activeRole, isCapitalRecoveryStore]
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
  const rowsRef = useRef<InventoryRow[]>([]);
  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);

  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");

  const [recentScannedIds, setRecentScannedIds] = useState<string[]>([]);

  const webScanBufferRef = useRef("");
  const webScanLastAtRef = useRef(0);
  const webScanTimerRef = useRef<any>(null);
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

  const [thrByProductId, setThrByProductId] = useState<Record<string, number>>({});
  const thrRef = useRef<Record<string, number>>({});

  const [expiryByProductId, setExpiryByProductId] = useState<Record<string, ExpirySummaryRow>>({});
  const expiryRef = useRef<Record<string, ExpirySummaryRow>>({});
  useEffect(() => {
    thrRef.current = thrByProductId;
  }, [thrByProductId]);

  useEffect(() => {
    expiryRef.current = expiryByProductId;
  }, [expiryByProductId]);

  const [thrLoading, setThrLoading] = useState(false);

  const loadExpirySummary = useCallback(
    async (inputRows: InventoryRow[]) => {
      if (!activeStoreId) return;
      if (isCapitalRecoveryStore) return;
      if (storeOrgMismatch) return;
      if (isOffline) return;

      const ids = (inputRows ?? []).map((r) => r.product_id).filter(Boolean);
      if (!ids.length) {
        setExpiryByProductId({});
        return;
      }

      try {
        const { data, error } = await supabase.rpc("get_store_inventory_expiry_summary_v1", {
          p_store_id: activeStoreId,
        });

        if (error) throw error;

        const rows = Array.isArray(data) ? (data as any[]) : [];
        const next: Record<string, ExpirySummaryRow> = {};

        for (const row of rows) {
          const pid = String(row?.product_id ?? "").trim();
          if (!pid) continue;

          next[pid] = {
            product_id: pid,
            nearest_expiry_date: row?.nearest_expiry_date ?? null,
            nearest_expiry_days_left:
              row?.nearest_expiry_days_left == null
                ? null
                : Number(row.nearest_expiry_days_left),
            expiry_status: (row?.expiry_status ?? null) as any,
          };
        }

        const prevJson = JSON.stringify(expiryRef.current);
        const nextJson = JSON.stringify(next);
        if (prevJson !== nextJson) {
          setExpiryByProductId(next);
        }
      } catch {
        // keep existing expiry map silently
      }
    },
    [activeStoreId, isCapitalRecoveryStore, storeOrgMismatch, isOffline]
  );

  // Visible status only (do not update this during silent refresh)
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
  const inFlightLiveRef = useRef(false);
  const lastFocusRefreshAtRef = useRef(0);

  const loadFromCache = useCallback(async () => {
    if (isCapitalRecoveryStore) {
      setRows([]);
      setSource("NONE");
      setLastSyncedAt(null);
      return;
    }

    if (!CACHE_KEY || !SYNC_KEY) return;

    try {
      const [rawRows, rawSync] = await Promise.all([
        AsyncStorage.getItem(CACHE_KEY),
        AsyncStorage.getItem(SYNC_KEY),
      ]);

      const parsed: InventoryRow[] = rawRows ? JSON.parse(rawRows) : [];
      const syncIso = rawSync ? String(rawSync) : null;

      if (Array.isArray(parsed)) {
        setRows(parsed);
      } else {
        setRows([]);
      }

      setSource(Array.isArray(parsed) && parsed.length > 0 ? "CACHED" : "NONE");
      setLastSyncedAt(syncIso || null);
      setError(null);
    } catch {
      setRows([]);
      setSource("NONE");
      setLastSyncedAt(null);
    }
  }, [CACHE_KEY, SYNC_KEY, isCapitalRecoveryStore]);

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

  const loadThresholdsForRows = useCallback(
    async (
      inputRows: InventoryRow[],
      opts: { silent?: boolean } = {}
    ) => {
      const { silent = false } = opts;

      if (!activeStoreId) return;
      if (isCapitalRecoveryStore) return;
      if (storeOrgMismatch) return;
      if (isOffline) return;

      const ids = (inputRows ?? []).map((r) => r.product_id).filter(Boolean);
      if (ids.length === 0) {
        if (!silent) setThrByProductId({});
        return;
      }

      if (!silent) setThrLoading(true);

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

        const prevJson = JSON.stringify(thrRef.current);
        const nextJson = JSON.stringify(next);
        if (prevJson !== nextJson) {
          setThrByProductId(next);
        }
      } finally {
        if (!silent) setThrLoading(false);
      }
    },
    [activeStoreId, isCapitalRecoveryStore, storeOrgMismatch, isOffline]
  );

  const loadLive = useCallback(
    async ({ silent = false }: { silent?: boolean } = {}) => {
      if (!activeStoreId) {
        setError("No active store selected.");
        if (rowsRef.current.length === 0) setSource("NONE");
        return;
      }

      if (isCapitalRecoveryStore) {
        setRows([]);
        setThrByProductId({});
        setError(null);
        setSource("NONE");
        return;
      }

      if (storeOrgMismatch) {
        setError("Active store haifanani na Organization. Tafadhali chagua store tena.");
        if (rowsRef.current.length === 0) setSource("NONE");
        return;
      }

      if (isOffline) {
        setError(null);
        if (!silent) {
          await loadFromCache();
        }
        return;
      }

      if (inFlightLiveRef.current) return;
      inFlightLiveRef.current = true;

      if (!silent) setLoading(true);
      if (!silent) setError(null);

      try {
        const { data, error: e } = await supabase.rpc("get_store_inventory_v2", {
          p_store_id: activeStoreId,
        });
        if (e) throw e;

        const nextRows = (data ?? []) as InventoryRow[];
        const changed = !sameRows(rowsRef.current, nextRows);

        if (changed) {
          setRows(nextRows);
        }

        const nowIso = new Date().toISOString();
        void saveCache(nextRows, nowIso);

        // Visible status updates only for manual/visible refresh
        if (!silent) {
          setSource("LIVE");
          setLastSyncedAt(nowIso);
        }

        // Thresholds + expiry refresh silently too
        void loadThresholdsForRows(nextRows, { silent: true });
        void loadExpirySummary(nextRows);
      } catch (err: any) {
        if (!silent) {
          setError(err?.message ?? "Failed to load inventory");
          await loadFromCache();
        }
      } finally {
        if (!silent) setLoading(false);
        inFlightLiveRef.current = false;
      }
    },
    [
      activeStoreId,
      isCapitalRecoveryStore,
      storeOrgMismatch,
      isOffline,
      loadFromCache,
      saveCache,
      loadThresholdsForRows,
      loadExpirySummary,
    ]
  );

  useEffect(() => {
    didInitRef.current = false;
    inFlightLiveRef.current = false;
    lastFocusRefreshAtRef.current = 0;
    rowsRef.current = [];
    thrRef.current = {};
    setError(null);
    setThrByProductId({});
    setExpiryByProductId({});
    setThrLoading(false);
    setRecentScannedIds([]);
    setRows([]);
    setSource("NONE");
    setLastSyncedAt(null);
  }, [activeStoreId, isCapitalRecoveryStore]);

  useEffect(() => {
    if (!activeStoreId) return;
    if (isCapitalRecoveryStore) return;
    if (didInitRef.current) return;
    didInitRef.current = true;

    void (async () => {
      await loadFromCache();
      void loadLive({ silent: true });
    })();
  }, [activeStoreId, isCapitalRecoveryStore, loadFromCache, loadLive]);

  const AUTO_REFRESH_MS = 20000;

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      let intervalId: any = null;

      const runImmediateRefresh = async () => {
        if (!alive) return;
        if (!activeStoreId) return;
        if (isCapitalRecoveryStore) return;
        if (storeOrgMismatch) return;

        const now = Date.now();
        if (now - lastFocusRefreshAtRef.current < 700) return;
        lastFocusRefreshAtRef.current = now;

        // On focus: refresh silently only, no visible status dancing
        if (!isOffline) {
          void loadLive({ silent: true });
        }
      };

      void runImmediateRefresh();

      intervalId = setInterval(() => {
       if (!alive) return;
        if (!activeStoreId) return;
        if (isCapitalRecoveryStore) return;
        if (storeOrgMismatch) return;
        if (isOffline) return;
        void loadLive({ silent: true });
      }, AUTO_REFRESH_MS);

      return () => {
        alive = false;
        if (intervalId) clearInterval(intervalId);
      };
    }, [activeStoreId, isCapitalRecoveryStore, storeOrgMismatch, isOffline, loadLive])
  );

  useEffect(() => {
    if (!rows.length) {
      setThrByProductId({});
      setExpiryByProductId({});
      return;
    }
    if (isOffline) return;
    void loadThresholdsForRows(rows, { silent: true });
    void loadExpirySummary(rows);
  }, [rows, isOffline, loadThresholdsForRows, loadExpirySummary]);

  const handleInventoryScan = useCallback(
    (rawInput: any) => {
      const code = cleanBarcode(rawInput);
      if (!code) return;

      setQ(code);

      const target =
        rows.find((r) => cleanBarcode(r.barcode) === code) ||
        rows.find((r) => cleanBarcode(r.sku) === code);

      if (target) {
        bumpRecent(target.product_id);
        vibrateScan();
      }
    },
    [bumpRecent, rows, vibrateScan]
  );

  useFocusEffect(
    useCallback(() => {
      if (isCapitalRecoveryStore) {
        setActiveScanScope("GLOBAL");
        return () => {
          setActiveScanScope("GLOBAL");
        };
      }

      setActiveScanScope("INVENTORY");

      const unsub = subscribeScanBarcode(
        (barcode) => {
          handleInventoryScan(barcode);
        },
        { scope: "INVENTORY" }
      );

      return () => {
        unsub();
        setActiveScanScope("GLOBAL");
      };
    }, [handleInventoryScan, isCapitalRecoveryStore])
  );

  useEffect(() => {
    if (Platform.OS !== "web") return;
    if (isCapitalRecoveryStore) return;

    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as any;
      if (isTypingIntoField(target)) return;

      const key = String(e.key ?? "");
      const now = Date.now();

      if (key === "Enter") {
        const code = cleanBarcode(webScanBufferRef.current);
        webScanBufferRef.current = "";
        webScanLastAtRef.current = 0;

        if (webScanTimerRef.current) {
          clearTimeout(webScanTimerRef.current);
          webScanTimerRef.current = null;
        }

        if (code.length >= 4) {
          handleInventoryScan(code);
        }
        return;
      }

      if (key.length !== 1) return;
      if (e.ctrlKey || e.altKey || e.metaKey) return;

      if (now - webScanLastAtRef.current > 120) {
        webScanBufferRef.current = "";
      }

      webScanBufferRef.current += key;
      webScanLastAtRef.current = now;

      if (webScanTimerRef.current) clearTimeout(webScanTimerRef.current);
      webScanTimerRef.current = setTimeout(() => {
        webScanBufferRef.current = "";
        webScanLastAtRef.current = 0;
      }, 180);
    };

    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      if (webScanTimerRef.current) {
        clearTimeout(webScanTimerRef.current);
        webScanTimerRef.current = null;
      }
    };
  }, [handleInventoryScan, isCapitalRecoveryStore]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();

    const base = !needle
      ? rows
      : rows.filter((r) => {
          const hay =
            `${r.product_name ?? ""} ${r.sku ?? ""} ${r.unit ?? ""} ${r.category ?? ""} ${r.barcode ?? ""}`.toLowerCase();
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

      if (isCapitalRecoveryStore) {
        Alert.alert("Not Available", "Adjust Stock haitumiki kwa Capital Recovery store.");
        return;
      }

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
          currentQty: fmtQty(r.qty),
        },
      } as any);
    },
    [activeStoreId, activeStoreName, canAdjust, isCapitalRecoveryStore, router, isOffline]
  );

  const openHistory = useCallback(() => {
    if (!activeStoreId) {
      Alert.alert("Missing", "No active store selected.");
      return;
    }
    if (isCapitalRecoveryStore) {
      Alert.alert("Not Available", "Inventory Scan haitumiki kwa Capital Recovery store.");
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
  }, [activeStoreId, activeStoreName, isCapitalRecoveryStore, router, storeOrgMismatch]);

  

  const goScan = useCallback(() => {
    if (!activeStoreId) {
      Alert.alert("Missing", "No active store selected.");
      return;
    }
    if (isCapitalRecoveryStore) {
      Alert.alert("Not Available", "Inventory Scan haitumiki kwa Capital Recovery store.");
      return;
    }
    if (storeOrgMismatch) {
      Alert.alert("Mismatch", "Active store haifanani na Organization. Chagua store tena.");
      return;
    }
    router.push("/(tabs)/stores/scan");
  }, [activeStoreId, isCapitalRecoveryStore, router, storeOrgMismatch]);

  const StatusLine = useMemo(() => {
    const mode = isOffline ? "OFFLINE" : "ONLINE";

    const effectiveSource: SourceMode =
      source === "NONE" && rows.length > 0 ? "CACHED" : source;

    const src = isOffline
      ? "CACHED"
      : effectiveSource === "LIVE"
        ? "LIVE"
        : effectiveSource === "CACHED"
          ? "CACHED"
          : "—";

    return `${mode} • Source: ${src} • Last sync: ${fmtLocal(lastSyncedAt)}`;
  }, [isOffline, source, lastSyncedAt, rows.length]);

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
        {isCapitalRecoveryStore ? "Inventory Disabled" : "Inventory"}
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
            borderColor: isCapitalRecoveryStore ? theme.colors.emeraldBorder : theme.colors.border,
            borderRadius: theme.radius.xl,
            backgroundColor: isCapitalRecoveryStore ? theme.colors.emeraldSoft : theme.colors.card,
            padding: 14,
          }}
        >
          <Text style={{ color: theme.colors.muted, fontWeight: "900" }}>Status</Text>
          <Text style={{ color: theme.colors.text, fontWeight: "900", marginTop: 6 }}>
            {isCapitalRecoveryStore ? "Capital Recovery store haitumii inventory." : StatusLine}
          </Text>

          {isCapitalRecoveryStore ? (
            <Text style={{ color: theme.colors.muted, fontWeight: "800", marginTop: 8 }}>
              Bidhaa za Capital Recovery hutumika kwenye income flow tu, si inventory/stock tracking.
            </Text>
          ) : isOffline ? (
            <Text style={{ color: theme.colors.muted, fontWeight: "800", marginTop: 8 }}>
              Ukiwa OFFLINE, app itaonyesha “last known cache” bila kukwama.
            </Text>
          ) : null}
        </View>

        <View style={{ flexDirection: "row", gap: 10, marginTop: 6, alignItems: "center" }}>
          <View style={{ flex: 1 }}>
            <Button
              title={loading ? "Loading..." : "Refresh"}
              onPress={() => loadLive({ silent: false })}
              disabled={loading || isCapitalRecoveryStore}
              variant="primary"
            />
          </View>

          <View style={{ flex: 1 }}>
            <Button
              title="History"
              onPress={openHistory}
              disabled={loading || !activeStoreId || isCapitalRecoveryStore}
              variant="secondary"
            />
          </View>

          <Pressable
            onPress={goScan}
            hitSlop={10}
            style={({ pressed }) => [
              {
                width: 62,
                height: 62,
                borderRadius: 999,
                alignItems: "center",
                justifyContent: "center",
                borderWidth: 1,
                borderColor: theme.colors.emeraldBorder,
                backgroundColor: theme.colors.emeraldSoft,
                opacity: !activeStoreId || isCapitalRecoveryStore ? 0.5 : pressed ? 0.92 : 1,
                transform: pressed ? [{ scale: 0.995 }] : [{ scale: 1 }],
                shadowColor: "#000",
                shadowOpacity: !activeStoreId || isCapitalRecoveryStore ? 0 : 0.25,
                shadowRadius: 10,
                shadowOffset: { width: 0, height: 6 },
                elevation: !activeStoreId || isCapitalRecoveryStore ? 0 : 8,
              },
            ]}
          >
            <View style={{ marginLeft: 1, marginTop: 1 }}>
              <ScannerFabIcon size={28} color={theme.colors.text} />
            </View>
          </Pressable>
        </View>

        

        <Text style={{ color: theme.colors.muted, fontWeight: "800", marginTop: 4 }}>
          {isCapitalRecoveryStore
            ? "Capital Recovery hutumia Products + Workspace, si inventory refresh."
            : "Tip: Inventory inajirefresh kimya kimya bila UI kuonyesha kuchezacheza."}
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
          {isCapitalRecoveryStore ? "Inventory Disabled" : "Search"}
        </Text>

        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder={
            isCapitalRecoveryStore
              ? "Inventory haitumiki kwa Capital Recovery"
              : "Tafuta kwa jina / SKU / category / barcode..."
          }
          placeholderTextColor="rgba(255,255,255,0.35)"
          returnKeyType="search"
          onSubmitEditing={Keyboard.dismiss}
          editable={!isCapitalRecoveryStore}
          style={{
            borderWidth: 1,
            borderColor: theme.colors.border,
            borderRadius: theme.radius.lg,
            backgroundColor: "rgba(255,255,255,0.05)",
            paddingHorizontal: 14,
            paddingVertical: 12,
            color: theme.colors.text,
            fontWeight: "800",
            opacity: isCapitalRecoveryStore ? 0.6 : 1,
          }}
        />

        {isCapitalRecoveryStore ? (
          <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>
            Capital Recovery store haitumii inventory, stock alert, au stock adjustment.
          </Text>
        ) : !canAdjust ? (
          <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>
            (Read-only) Muombe Owner/Admin kufanya stock adjustment.
          </Text>
        ) : isOffline ? (
          <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>
            Offline: “write actions” (Adjust/Save Alert) zimezimwa kwa usalama.
          </Text>
        ) : null}
      </Card>

      <Text style={{ fontWeight: "900", fontSize: 16, color: theme.colors.text }}>
        {isCapitalRecoveryStore ? "Inventory Not Used" : `Items (${filtered.length})`}
      </Text>

      {isCapitalRecoveryStore ? (
        <Card>
          <Text style={{ color: theme.colors.text, fontWeight: "900" }}>
            Inventory disabled for Capital Recovery
          </Text>
          <Text style={{ color: theme.colors.muted, fontWeight: "700", marginTop: 6 }}>
            Tumia Products + Capital Recovery Workspace kwa income entries. Inventory haitumiki kwenye mode hii.
          </Text>
        </Card>
      ) : filtered.length === 0 ? (
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

          const expiry = expiryByProductId?.[r.product_id] ?? null;
          const expiryStatus = expiry?.expiry_status ?? null;
          const expiryDaysLeft =
            expiry?.nearest_expiry_days_left == null
              ? null
              : Number(expiry.nearest_expiry_days_left);
          const expiryDate = expiry?.nearest_expiry_date ?? null;
          const expiryUi = expiryTone(expiryStatus);

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
                  {getPrecisionQtyLabels(r) ? (
                    <>
                      <Text
                        style={{
                          color: theme.colors.emerald,
                          fontWeight: "900",
                          fontSize: 14,
                          textAlign: "center",
                        }}
                      >
                        {getPrecisionQtyLabels(r)?.packLabel}
                      </Text>

                      <Text
                        style={{
                          color: theme.colors.text,
                          fontWeight: "900",
                          fontSize: 12,
                          marginTop: 5,
                          textAlign: "center",
                        }}
                      >
                        {getPrecisionQtyLabels(r)?.baseLabel}
                      </Text>
                    </>
                  ) : (
                    <Text
                      style={{
                        color: theme.colors.emerald,
                        fontWeight: "900",
                        fontSize: 16,
                        textAlign: "center",
                      }}
                    >
                      QTY: {fmtQty(r.qty)}
                    </Text>
                  )}

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
                          currentQty: fmtQty(r.qty),
                        },
                      } as any);
                    }}
                    disabled={loading || !activeStoreId || isOffline}
                  />

                  <View
                    style={{
                      borderWidth: 1,
                      borderColor: expiryUi.borderColor,
                      borderRadius: theme.radius.lg,
                      backgroundColor: expiryUi.backgroundColor,
                      paddingHorizontal: 12,
                      paddingVertical: 10,
                      minHeight: 56,
                      justifyContent: "center",
                    }}
                  >
                    <Text
                      style={{
                        color: expiryUi.textColor,
                        fontWeight: "900",
                        fontSize: 13,
                      }}
                    >
                      {expiryLabel(expiryDaysLeft, expiryStatus, expiryDate)}
                    </Text>

                    <Text
                      style={{
                        color: expiryUi.subColor,
                        fontWeight: "800",
                        fontSize: 11,
                        marginTop: 4,
                      }}
                      numberOfLines={1}
                    >
                      {expiryDate ? fmtExpiryDate(expiryDate) : "No expiry tracked"}
                    </Text>
                  </View>

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