// app/(tabs)/stores/index.tsx
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  FlatList,
  Modal,
  Platform,
  Pressable,
  Switch,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useOrg } from "../../../src/context/OrgContext";
import { supabase } from "../../../src/supabase/supabaseClient";
import { Button } from "../../../src/ui/Button";
import { Card } from "../../../src/ui/Card";
import { Screen } from "../../../src/ui/Screen";
import { theme } from "../../../src/ui/theme";

type StoreWithManagerRow = {
  store_id: string;
  store_name: string;
  organization_id: string;
  manager_membership_id: string | null;
  manager_email: string | null;
  manager_role: string | null;
};

// A18 fallback
type StoreManagerEmailRow = {
  store_id: string;
  store_name: string;
  manager_email: string | null;
};

type StaffChoiceRow = {
  membership_id: string;
  user_id: string;
  email: string | null;
  role: string;
};

function normalizeStoreType(v: any): "STANDARD" | "CAPITAL_RECOVERY" {
  const t = String(v ?? "STANDARD").trim().toUpperCase();
  return t === "CAPITAL_RECOVERY" ? "CAPITAL_RECOVERY" : "STANDARD";
}

export default function StoresTabScreen() {
  const router = useRouter();

  const {
    activeOrgName,
    activeRole,
    activeOrgId,
    stores,
    activeStoreId,
    activeStoreName,
    setActiveStoreId,
    refresh,
    loading,
    refreshing,
    error,
  } = useOrg();

  const canManage = (["owner", "admin"] as const).includes(
    (activeRole ?? "staff") as any
  );

  const { width } = useWindowDimensions();
  const isWeb = Platform.OS === "web";
  const isDesktopWeb = isWeb && width >= 1100;
  const desktopMaxWidth = width >= 1600 ? 1480 : width >= 1380 ? 1320 : 1200;
  const desktopColumns = isDesktopWeb ? 2 : 1;

  // ✅ SAFE spacing (prevents: Cannot read property 'page' of undefined)
  const PAGE = (theme as any)?.spacing?.page ?? 16;

  // ✅ SAFE theme colors (prevents TS errors + runtime crashes if keys missing)
  const C: any = (theme as any)?.colors ?? {};
  const col = (key: string, fallback: string) => {
    const v = C?.[key];
    return typeof v === "string" && v.trim() ? v : fallback;
  };

  // Core fallbacks (dark premium)
  const TEXT = col("text", "#EAF2FF");
  const MUTED = col("muted", "rgba(234,242,255,0.70)");
  const FAINT = col("faint", MUTED);
  const BORDER = col("border", "rgba(255,255,255,0.14)");
  const BORDER_SOFT = col("borderSoft", "rgba(255,255,255,0.10)");
  const CARD = col("card", "rgba(255,255,255,0.06)");
  const SURFACE2 = col("surface2", CARD);
  const EMERALD = col("emerald", "#34D399");

  const DANGER = col("danger", "#EF4444");
  const DANGER_BORDER = col("dangerBorder", "rgba(239,68,68,0.45)");
  const DANGER_SOFT = col("dangerSoft", "rgba(239,68,68,0.10)");

  const R: any = (theme as any)?.radius ?? {};
  const radiusXL = R?.xl ?? 18;
  const radiusPill = R?.pill ?? 999;

  // ===========
  // ✅ Upgrade Modal (for LOCKED stores)
  // ===========
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [upgradeMsg, setUpgradeMsg] = useState("");

  const openUpgrade = (msg: string) => {
    setUpgradeMsg(msg);
    setUpgradeOpen(true);
  };

  // canonical store list
  const list = useMemo(() => {
    if (!activeOrgId) return stores ?? [];
    return (stores ?? []).filter((s: any) => s.organization_id === activeOrgId);
  }, [stores, activeOrgId]);

  // =========================
  // Manager overlay (A20)
  // =========================
  const [mgrByStoreId, setMgrByStoreId] = useState<
    Record<
      string,
      { membershipId: string | null; email: string | null; role: string | null }
    >
  >({});
  const [mgrLoading, setMgrLoading] = useState(false);

  const loadManagers = useCallback(async () => {
    if (!activeOrgId) {
      setMgrByStoreId({});
      return;
    }

    setMgrLoading(true);

    const applyMap = (
      map: Record<
        string,
        { membershipId: string | null; email: string | null; role: string | null }
      >
    ) => setMgrByStoreId(map);

    try {
      // TRY new RPC
      const { data, error: e } = await supabase.rpc("get_org_stores_with_manager", {
        p_org_id: activeOrgId,
      });
      if (e) throw e;

      const rows = (data ?? []) as StoreWithManagerRow[];
      const map: Record<
        string,
        { membershipId: string | null; email: string | null; role: string | null }
      > = {};

      for (const r of rows) {
        if (!r?.store_id) continue;
        map[r.store_id] = {
          membershipId: r.manager_membership_id ?? null,
          email: (r.manager_email ?? "").trim() || null,
          role: (r.manager_role ?? "").trim() || null,
        };
      }

      if (Object.keys(map).length > 0) {
        applyMap(map);
        return;
      }

      // FALLBACK A18
      const { data: d2, error: e2 } = await supabase.rpc("get_stores_with_manager_email", {
        p_org_id: activeOrgId,
      });
      if (e2) throw e2;

      const rows2 = (d2 ?? []) as StoreManagerEmailRow[];
      const map2: Record<
        string,
        { membershipId: string | null; email: string | null; role: string | null }
      > = {};

      for (const r of rows2) {
        if (!r?.store_id) continue;
        map2[r.store_id] = {
          membershipId: null,
          email: (r.manager_email ?? "").trim() || null,
          role: null,
        };
      }

      applyMap(map2);
    } catch {
      // keep last known state
    } finally {
      setMgrLoading(false);
    }
  }, [activeOrgId]);

  useEffect(() => {
    void loadManagers();
  }, [loadManagers]);

  // =========================
  // ✅ CREDIT SWITCH
  // =========================
  const [creditFlagByStoreId, setCreditFlagByStoreId] = useState<Record<string, boolean>>({});
  const [creditFlagLoading, setCreditFlagLoading] = useState(false);
  const [creditFlagSaving, setCreditFlagSaving] = useState<Record<string, boolean>>({});

  const loadCreditFlags = useCallback(async () => {
    if (!canManage || !activeOrgId) {
      setCreditFlagByStoreId({});
      return;
    }

    const ids = (list ?? []).map((s: any) => s.store_id).filter(Boolean);
    if (ids.length === 0) {
      setCreditFlagByStoreId({});
      return;
    }

    setCreditFlagLoading(true);

    const apply = (rows: any[], key: "staff_can_manage_credit" | "allow_staff_credit") => {
      const map: Record<string, boolean> = {};
      for (const r of rows ?? []) {
        map[String(r.id)] = !!r?.[key];
      }
      setCreditFlagByStoreId(map);
    };

    try {
      const { data, error: e } = await supabase
        .from("stores")
        .select("id, staff_can_manage_credit")
        .in("id", ids);

      if (e) throw e;
      apply(data ?? [], "staff_can_manage_credit");
    } catch {
      try {
        const { data: d2, error: e2 } = await supabase
          .from("stores")
          .select("id, allow_staff_credit")
          .in("id", ids);

        if (e2) throw e2;
        apply(d2 ?? [], "allow_staff_credit");
      } catch {
        // keep last known
      }
    } finally {
      setCreditFlagLoading(false);
    }
  }, [activeOrgId, canManage, list]);

  useEffect(() => {
    void loadCreditFlags();
  }, [loadCreditFlags]);

  const toggleStoreCredit = useCallback(
    async (storeId: string, next: boolean) => {
      if (!canManage) {
        Alert.alert("No Access", "Owner/Admin only.");
        return;
      }

      setCreditFlagSaving((p) => ({ ...p, [storeId]: true }));
      setCreditFlagByStoreId((p) => ({ ...p, [storeId]: next }));

      try {
        const { error: e } = await supabase
          .from("stores")
          .update({ staff_can_manage_credit: next } as any)
          .eq("id", storeId);

        if (e) throw e;

        await refresh();
        await loadCreditFlags();
      } catch (err1: any) {
        try {
          const { error: e2 } = await supabase
            .from("stores")
            .update({ allow_staff_credit: next } as any)
            .eq("id", storeId);

          if (e2) throw e2;

          await refresh();
          await loadCreditFlags();
        } catch (err2: any) {
          setCreditFlagByStoreId((p) => ({ ...p, [storeId]: !next }));
          Alert.alert("Failed", err2?.message ?? err1?.message ?? "Imeshindikana kubadili setting.");
        }
      } finally {
        setCreditFlagSaving((p) => ({ ...p, [storeId]: false }));
      }
    },
    [canManage, loadCreditFlags, refresh]
  );

  // =========================
  // ✅ MOVEMENT SWITCH
  // =========================
  const [movementFlagByStoreId, setMovementFlagByStoreId] = useState<Record<string, boolean>>({});
  const [movementFlagLoading, setMovementFlagLoading] = useState(false);
  const [movementFlagSaving, setMovementFlagSaving] = useState<Record<string, boolean>>({});

  const loadMovementFlags = useCallback(async () => {
    if (!canManage || !activeOrgId) {
      setMovementFlagByStoreId({});
      return;
    }

    const ids = (list ?? []).map((s: any) => s.store_id).filter(Boolean);
    if (ids.length === 0) {
      setMovementFlagByStoreId({});
      return;
    }

    setMovementFlagLoading(true);

    const apply = (rows: any[], key: "staff_can_manage_movement" | "allow_staff_movement") => {
      const map: Record<string, boolean> = {};
      for (const r of rows ?? []) {
        map[String(r.id)] = !!r?.[key];
      }
      setMovementFlagByStoreId(map);
    };

    try {
      const { data, error: e } = await supabase
        .from("stores")
        .select("id, staff_can_manage_movement")
        .in("id", ids);

      if (e) throw e;
      apply(data ?? [], "staff_can_manage_movement");
    } catch {
      try {
        const { data: d2, error: e2 } = await supabase
          .from("stores")
          .select("id, allow_staff_movement")
          .in("id", ids);

        if (e2) throw e2;
        apply(d2 ?? [], "allow_staff_movement");
      } catch {
        // keep last known
      }
    } finally {
      setMovementFlagLoading(false);
    }
  }, [activeOrgId, canManage, list]);

  useEffect(() => {
    void loadMovementFlags();
  }, [loadMovementFlags]);

  const toggleStoreMovement = useCallback(
    async (storeId: string, next: boolean) => {
      if (!canManage) {
        Alert.alert("No Access", "Owner/Admin only.");
        return;
      }

      setMovementFlagSaving((p) => ({ ...p, [storeId]: true }));
      setMovementFlagByStoreId((p) => ({ ...p, [storeId]: next }));

      try {
        const { error: e } = await supabase
          .from("stores")
          .update({ staff_can_manage_movement: next } as any)
          .eq("id", storeId);

        if (e) throw e;

        await refresh();
        await loadMovementFlags();
      } catch (err1: any) {
        try {
          const { error: e2 } = await supabase
            .from("stores")
            .update({ allow_staff_movement: next } as any)
            .eq("id", storeId);

          if (e2) throw e2;

          await refresh();
          await loadMovementFlags();
        } catch (err2: any) {
          setMovementFlagByStoreId((p) => ({ ...p, [storeId]: !next }));
          Alert.alert(
            "Failed",
            err2?.message ?? err1?.message ?? "Imeshindikana kubadili movement setting."
          );
        }
      } finally {
        setMovementFlagSaving((p) => ({ ...p, [storeId]: false }));
      }
    },
    [canManage, loadMovementFlags, refresh]
  );

  // =========================
  // Staff choices (kept)
  // =========================
  const [choices, setChoices] = useState<StaffChoiceRow[]>([]);
  const [choicesLoading, setChoicesLoading] = useState(false);
  const [choicesError, setChoicesError] = useState<string | null>(null);

  const loadChoices = useCallback(async () => {
    if (!activeOrgId) {
      setChoices([]);
      return;
    }

    setChoicesLoading(true);
    setChoicesError(null);
    try {
      const { data, error: e } = await supabase.rpc("get_org_staff_choices", {
        p_org_id: activeOrgId,
      });
      if (e) throw e;

      setChoices((data ?? []) as StaffChoiceRow[]);
    } catch (err: any) {
      setChoices([]);
      setChoicesError(err?.message ?? "Failed to load staff choices");
    } finally {
      setChoicesLoading(false);
    }
  }, [activeOrgId]);

  // =========================
  // Manage UI state (kept)
  // =========================
  const [manageStoreId, setManageStoreId] = useState<string | null>(null);
  const [manageStoreName, setManageStoreName] = useState<string>("");
  const [q, setQ] = useState("");
  const [savingAssign, setSavingAssign] = useState(false);

  const openManage = async (storeId: string, storeName: string) => {
    if (!canManage) {
      Alert.alert("No Access", "Owner/Admin only.");
      return;
    }
    setManageStoreId(storeId);
    setManageStoreName(storeName);
    setQ("");

    if (choices.length === 0) {
      await loadChoices();
    }
  };

  const closeManage = () => {
    setManageStoreId(null);
    setManageStoreName("");
    setQ("");
  };

  const filteredChoices = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return choices;

    return choices.filter((c) => {
      const hay = `${c.email ?? ""} ${c.role ?? ""} ${c.membership_id ?? ""}`.toLowerCase();
      return hay.includes(needle);
    });
  }, [choices, q]);

  const assign = async (storeId: string, membershipId: string | null, label: string) => {
    if (!canManage) {
      Alert.alert("No Access", "Owner/Admin only.");
      return;
    }
    if (!storeId) return;

    setSavingAssign(true);
    try {
      const { error: e } = await supabase.rpc("set_store_manager", {
        p_store_id: storeId,
        p_membership_id: membershipId,
      });
      if (e) throw e;

      Alert.alert("Success ✅", label);
      await refresh();
      await loadManagers();
      closeManage();
    } catch (err: any) {
      Alert.alert("Action failed", err?.message ?? "Unknown error");
    } finally {
      setSavingAssign(false);
    }
  };

  // ✅ Activate gating (LOCKED stores)
  const pick = (storeId: string, storeName: string, isAllowed: boolean, reason?: string | null) => {
    if (!isAllowed) {
      openUpgrade(
        (reason ?? "").trim() ||
          "LOCKED: Store hii inahitaji plan ya kulipia. Free plan inaruhusu store 1 tu. Upgrade ili u-activate store hii."
      );
      return;
    }
    setActiveStoreId(storeId);
    Alert.alert("Selected ✅", `Active store: ${storeName}`);
  };

  const onRefreshAll = async () => {
    await refresh();
    await loadManagers();
    await loadCreditFlags();
    await loadMovementFlags();
  };

  const openMovement = useCallback(() => {
    if (!activeStoreId) {
      Alert.alert("Select store", "Chagua store kwanza (Active Store).");
      return;
    }
    // @ts-ignore
    router.push({
      pathname: "/(tabs)/stores/movement",
      params: {
        fromStoreId: activeStoreId,
        fromStoreName: activeStoreName ?? "",
      },
    });
  }, [activeStoreId, activeStoreName, router]);

  const Header = useMemo(() => {
    const busy =
      loading || refreshing || mgrLoading || creditFlagLoading || movementFlagLoading;

    return (
      <View style={{ gap: 16 }}>
        <View
          style={{
            gap: 8,
            flexDirection: isDesktopWeb ? "row" : "column",
            alignItems: isDesktopWeb ? "flex-end" : "flex-start",
            justifyContent: "space-between",
          }}
        >
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ fontSize: isDesktopWeb ? 34 : 26, fontWeight: "900", color: TEXT }}>
              Stores
            </Text>

            <Text
              style={{
                color: MUTED,
                fontWeight: "800",
                marginTop: 6,
                fontSize: isDesktopWeb ? 14 : 13,
                lineHeight: 22,
                maxWidth: isDesktopWeb ? 760 : undefined,
              }}
            >
              Simamia stores zako, badili active store, fungua inventory, na dhibiti ruhusa za staff
              kwa muonekano wa desktop ulio wazi, mpana, na wa biashara halisi.
            </Text>
          </View>

          <View
            style={{
              flexDirection: "row",
              gap: 10,
              width: isDesktopWeb ? "auto" : "100%",
            }}
          >
            <View style={{ flex: isDesktopWeb ? 0 : 1 }}>
              <Button
                title={busy ? "Refreshing..." : "Refresh"}
                onPress={onRefreshAll}
                disabled={busy}
                variant="primary"
              />
            </View>

            {canManage ? (
              <View style={{ flex: isDesktopWeb ? 0 : 1 }}>
                <Button
                  title="+ Add Store"
                  variant="primary"
                  onPress={() => {
                    // @ts-ignore
                    router.push("/(tabs)/stores/add");
                  }}
                />
              </View>
            ) : null}
          </View>
        </View>

        {!!error && !String(error).toLowerCase().includes("not allowed") && (
          <Card
            style={{
              borderColor: DANGER_BORDER,
              backgroundColor: DANGER_SOFT,
            }}
          >
            <Text style={{ color: DANGER, fontWeight: "900" }}>{error}</Text>
          </Card>
        )}

        <View
          style={{
            flexDirection: isDesktopWeb ? "row" : "column",
            gap: 14,
            alignItems: "stretch",
          }}
        >
          <Card
            style={{
              gap: 12,
              flex: isDesktopWeb ? 1.2 : undefined,
              minHeight: isDesktopWeb ? 220 : undefined,
            }}
          >
            <Text style={{ color: FAINT, fontWeight: "900", fontSize: 11, letterSpacing: 0.8 }}>
              STORE WORKSPACE
            </Text>

            <Text style={{ color: MUTED, fontWeight: "800" }}>Organization</Text>
            <Text style={{ fontSize: isDesktopWeb ? 24 : 20, fontWeight: "900", color: TEXT }}>
              {activeOrgName ?? "—"}
            </Text>

            <View
              style={{
                flexDirection: isDesktopWeb ? "row" : "column",
                gap: 14,
              }}
            >
              <View style={{ flex: 1 }}>
                <Text style={{ color: MUTED, fontWeight: "800" }}>Role</Text>
                <Text style={{ fontWeight: "900", color: TEXT, marginTop: 4 }}>
                  {activeRole ?? "—"}
                </Text>
              </View>

              <View style={{ flex: 1 }}>
                <Text style={{ color: MUTED, fontWeight: "800" }}>Active Store</Text>
                <Text style={{ fontWeight: "900", color: TEXT, marginTop: 4 }}>
                  {activeStoreName ?? "—"}
                </Text>
              </View>
            </View>

            <Text style={{ color: MUTED, fontWeight: "800", lineHeight: 20 }}>
              Chagua store sahihi kama active context kabla ya kufanya inventory, movement, au
              marekebisho ya ruhusa za staff.
            </Text>
          </Card>

          <Card
            style={{
              gap: 12,
              flex: isDesktopWeb ? 0.9 : undefined,
              minHeight: isDesktopWeb ? 220 : undefined,
            }}
          >
            <Text style={{ color: FAINT, fontWeight: "900", fontSize: 11, letterSpacing: 0.8 }}>
              QUICK ACTIONS
            </Text>

            <Pressable
              onPress={() => {
                // @ts-ignore
                router.push("/(tabs)/stores/inventory");
              }}
              style={({ pressed }) => ({
                borderRadius: radiusXL,
                borderWidth: 1,
                borderColor: BORDER_SOFT,
                backgroundColor: "rgba(255,255,255,0.05)",
                paddingVertical: 14,
                paddingHorizontal: 16,
                opacity: pressed ? 0.92 : 1,
              })}
            >
              <Text style={{ color: TEXT, fontWeight: "900", fontSize: 15 }}>Open Inventory</Text>
              <Text style={{ color: MUTED, fontWeight: "800", marginTop: 4, fontSize: 12 }}>
                Fungua inventory ya active store
              </Text>
            </Pressable>

            <Pressable
              onPress={openMovement}
              style={({ pressed }) => ({
                borderRadius: radiusXL,
                borderWidth: 1,
                borderColor: BORDER_SOFT,
                backgroundColor: "rgba(255,255,255,0.05)",
                paddingVertical: 14,
                paddingHorizontal: 16,
                opacity: pressed ? 0.92 : 1,
              })}
            >
              <Text style={{ color: TEXT, fontWeight: "900", fontSize: 15 }}>Stock Movement</Text>
              <Text style={{ color: MUTED, fontWeight: "800", marginTop: 4, fontSize: 12 }}>
                Hamisha stock kutoka active store
              </Text>
            </Pressable>

            <Text style={{ color: MUTED, fontWeight: "800", lineHeight: 18 }}>
              Stores zilizofungwa (LOCKED) zitaonekana hapa, lakini haziwezi kuwa ACTIVE mpaka
              u-upgrade plan.
            </Text>
          </Card>
        </View>

        <View style={{ gap: 4 }}>
          <Text style={{ fontWeight: "900", fontSize: 16, color: TEXT }}>
            Available Stores
          </Text>
          <Text style={{ color: MUTED, fontWeight: "800", lineHeight: 18 }}>
            Desktop view imepangwa ili cards za stores zisibane na kila store ionekane kwa nafasi
            yake vizuri.
          </Text>
        </View>
      </View>
    );
  }, [
    TEXT,
    MUTED,
    FAINT,
    DANGER,
    DANGER_BORDER,
    DANGER_SOFT,
    BORDER_SOFT,
    activeOrgName,
    activeRole,
    activeStoreName,
    canManage,
    error,
    isDesktopWeb,
    loading,
    mgrLoading,
    creditFlagLoading,
    movementFlagLoading,
    onRefreshAll,
    refreshing,
    router,
    openMovement,
    radiusXL,
  ]);

  return (
    <Screen
      scroll={false}
      bottomPad={0}
      contentStyle={{ paddingHorizontal: 0, paddingTop: 0, paddingBottom: 0 }}
    >
      <FlatList
        data={list}
        key={isDesktopWeb ? "stores-desktop-grid" : "stores-mobile-list"}
        numColumns={desktopColumns}
        keyExtractor={(item: any) => item.store_id}
        onRefresh={onRefreshAll}
        refreshing={!!(refreshing || mgrLoading || creditFlagLoading || movementFlagLoading)}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View
            style={{
              width: "100%",
              maxWidth: desktopMaxWidth,
              alignSelf: "center",
              paddingHorizontal: PAGE,
              paddingTop: PAGE,
              paddingBottom: 6,
            }}
          >
            {Header}
          </View>
        }
        columnWrapperStyle={
          isDesktopWeb
            ? {
                gap: 14,
                alignItems: "stretch",
              }
            : undefined
        }
        contentContainerStyle={{
          paddingHorizontal: PAGE,
          paddingBottom: 140,
        }}
        style={{
          width: "100%",
        }}
        renderItem={({ item }: { item: any }) => {
        const storeId = String(item.store_id);
const isActive = storeId === activeStoreId;
const storeType = normalizeStoreType(item?.store_type);
const isCapitalRecovery = storeType === "CAPITAL_RECOVERY";

          // ✅ lock flags from v2 (default allowed if missing)
          const isAllowed =
            typeof item?.is_allowed === "boolean" ? item.is_allowed : true;
          const lockReason = (item?.lock_reason ?? "").toString();

          const mgr = mgrByStoreId?.[storeId];
          const managedBy = (mgr?.email ?? "").trim() || "UNASSIGNED";

          const staffCreditEnabled = !!creditFlagByStoreId?.[storeId];
          const creditSaving = !!creditFlagSaving?.[storeId];

          const staffMovementEnabled = !!movementFlagByStoreId?.[storeId];
          const movementSaving = !!movementFlagSaving?.[storeId];

          const borderColor = isActive
            ? "rgba(52,211,153,0.55)"
            : !isAllowed
            ? "rgba(255,255,255,0.10)"
            : BORDER;

          const opacity = !isAllowed ? 0.72 : 1;

          return (
            <View
              style={{
                width: isDesktopWeb ? "49.4%" : "100%",
                maxWidth: isDesktopWeb ? undefined : desktopMaxWidth,
                alignSelf: "center",
                marginBottom: 12,
              }}
            >
              <Pressable
                onPress={() => pick(storeId, item.store_name, isAllowed, lockReason)}
                style={({ pressed }) => ({
                  borderWidth: 1,
                  borderColor,
                  borderRadius: radiusXL,
                  backgroundColor: CARD,
                  padding: isDesktopWeb ? 18 : 16,
                  minHeight: isDesktopWeb ? 250 : undefined,
                  opacity: pressed ? Math.max(0.88, opacity - 0.04) : opacity,
                  transform: pressed ? [{ scale: 0.995 }] : [{ scale: 1 }],
                })}
              >
                <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: "900", color: TEXT, fontSize: 16 }}>
  {item.store_name}
</Text>

<Text style={{ marginTop: 4, color: isCapitalRecovery ? EMERALD : MUTED, fontWeight: "900", fontSize: 12 }}>
  {isCapitalRecovery ? "CAPITAL RECOVERY STORE" : "STANDARD STORE"}
</Text>

<Text style={{ marginTop: 6, color: MUTED, fontWeight: "800" }}>
  Managed by:{" "}
  <Text style={{ color: TEXT, fontWeight: "900" }}>
    {managedBy}
  </Text>
</Text>
                 {!isAllowed ? (
                    <Text style={{ marginTop: 8, color: FAINT, fontWeight: "900", lineHeight: 18 }}>
                      🔒 LOCKED — upgrade plan ili u-activate.
                    </Text>
                  ) : !isActive ? (
                    <Text style={{ marginTop: 8, color: FAINT, fontWeight: "800", lineHeight: 18 }}>
                      Bonyeza kadi hii kuchagua store hii kama Active Store.
                    </Text>
                  ) : (
                    <Text style={{ marginTop: 8, color: EMERALD, fontWeight: "800", lineHeight: 18 }}>
                      Hii ndiyo Active Store ya sasa.
                    </Text>
                  )} 
                </View>

                {/* Badges / Selection Hint */}
                <View style={{ gap: 8, alignItems: "flex-end" }}>
                  {isActive ? (
                    <View
                      style={{
                        paddingHorizontal: 10,
                        paddingVertical: 6,
                        borderRadius: radiusPill,
                        borderWidth: 1,
                        borderColor: "rgba(52,211,153,0.45)",
                        backgroundColor: "rgba(16,185,129,0.12)",
                        alignSelf: "flex-start",
                      }}
                    >
                      <Text style={{ color: EMERALD, fontWeight: "900", fontSize: 12 }}>
                        ACTIVE
                      </Text>
                    </View>
                  ) : isAllowed ? (
                    <View
                      style={{
                        paddingHorizontal: 10,
                        paddingVertical: 6,
                        borderRadius: radiusPill,
                        borderWidth: 1,
                        borderColor: BORDER_SOFT,
                        backgroundColor: "rgba(255,255,255,0.06)",
                        alignSelf: "flex-start",
                      }}
                    >
                      <Text style={{ color: MUTED, fontWeight: "900", fontSize: 12 }}>
                        Tap to activate  ›
                      </Text>
                    </View>
                  ) : null}

                 {isCapitalRecovery ? (
  <View
    style={{
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: radiusPill,
      borderWidth: 1,
      borderColor: "rgba(16,185,129,0.28)",
      backgroundColor: "rgba(16,185,129,0.12)",
      alignSelf: "flex-start",
    }}
  >
    <Text style={{ color: EMERALD, fontWeight: "900", fontSize: 12 }}>
      CAPITAL
    </Text>
  </View>
) : null}

{!isAllowed ? (
  <View
    style={{
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: radiusPill,
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.14)",
      backgroundColor: "rgba(255,255,255,0.06)",
      alignSelf: "flex-start",
    }}
  >
    <Text style={{ color: FAINT, fontWeight: "900", fontSize: 12 }}>
      LOCKED
    </Text>
  </View>
) : null}
                </View>
              </View>

             {isCapitalRecovery && isAllowed ? (
  <View style={{ marginTop: 12, gap: 10 }}>
    <Pressable
      onPress={() => {
        setActiveStoreId(storeId);
        router.push("/(tabs)");
      }}
      style={({ pressed }) => ({
        borderRadius: radiusXL,
        borderWidth: 1,
        borderColor: "rgba(16,185,129,0.30)",
        backgroundColor: "rgba(16,185,129,0.12)",
        paddingVertical: 12,
        paddingHorizontal: 14,
        opacity: pressed ? 0.92 : 1,
      })}
    >
      <Text style={{ color: TEXT, fontWeight: "900", fontSize: 14 }}>
        Open Capital Workspace
      </Text>
      <Text style={{ color: MUTED, fontWeight: "800", marginTop: 4, fontSize: 12 }}>
        Fungua dashboard maalum ya Capital Recovery
      </Text>
    </Pressable>
  </View>
) : null}

{canManage && isAllowed ? (
  <View style={{ marginTop: 12, gap: 12 }}>
                  {/* Credit switch */}
                  <View
                    style={{
                      borderWidth: 1,
                      borderColor: BORDER_SOFT,
                      backgroundColor: SURFACE2,
                      borderRadius: radiusXL,
                      paddingVertical: 10,
                      paddingHorizontal: 12,
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 10,
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: FAINT, fontWeight: "900" }}>
                        Staff can manage credit
                      </Text>
                      <Text style={{ color: MUTED, marginTop: 4, lineHeight: 18 }}>
                        Ikiwashwa, staff wa store hii ataona/kurekodi malipo ya madeni ya store yake
                        tu. Ikizimwa, ataona tu (read-only).
                      </Text>
                    </View>

                    <Switch
                      value={staffCreditEnabled}
                      onValueChange={(v) => toggleStoreCredit(storeId, v)}
                      disabled={creditSaving}
                    />
                  </View>

                  {creditSaving ? (
                    <Text style={{ color: FAINT, marginTop: -4, fontWeight: "800" }}>
                      Saving credit setting...
                    </Text>
                  ) : null}

                  {/* Movement switch */}
                  <View
                    style={{
                      borderWidth: 1,
                      borderColor: BORDER_SOFT,
                      backgroundColor: SURFACE2,
                      borderRadius: radiusXL,
                      paddingVertical: 10,
                      paddingHorizontal: 12,
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 10,
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: FAINT, fontWeight: "900" }}>
                        Allow staff stock movement
                      </Text>
                      <Text style={{ color: MUTED, marginTop: 4, lineHeight: 18 }}>
                        Ikiwashwa, staff wa store hii ataruhusiwa kuhamisha stock (FROM store yake).
                        Ikizimwa, movement itakuwa Owner/Admin tu. (Admin/Owner wana ruhusa muda wote.)
                      </Text>
                    </View>

                    <Switch
                      value={staffMovementEnabled}
                      onValueChange={(v) => toggleStoreMovement(storeId, v)}
                      disabled={movementSaving}
                    />
                  </View>

                  {movementSaving ? (
                    <Text style={{ color: FAINT, marginTop: -4, fontWeight: "800" }}>
                      Saving movement setting...
                    </Text>
                  ) : null}
                </View>
              ) : null}
              </Pressable>
            </View>
          );
        }}
        ListEmptyComponent={
          <View style={{ paddingTop: 10 }}>
            <Card>
              <Text style={{ fontWeight: "900", color: TEXT }}>
                {activeRole === "staff" ? "No assigned stores loaded" : "No stores found"}
              </Text>

              <Text style={{ color: MUTED, fontWeight: "700", marginTop: 6 }}>
                {activeRole === "staff"
                  ? "Store zako bado hazijarudi kutoka mfumo. Hii ni dalili ya store-assignment/RPC issue, siyo kwamba account yako imekosea."
                  : "Hakuna stores zilizopatikana kwenye organization hii."}
              </Text>
            </Card>
          </View>
        }
      />

      {/* ✅ Upgrade Modal */}
      <Modal
        visible={upgradeOpen}
        transparent
        animationType="fade"
        statusBarTranslucent={false}
        hardwareAccelerated
        // @ts-ignore
        presentationStyle="overFullScreen"
        onRequestClose={() => setUpgradeOpen(false)}
      >
        <Pressable
          onPress={() => setUpgradeOpen(false)}
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.75)",
            paddingHorizontal: 14,
            justifyContent: "center",
          }}
        >
          <Pressable
            onPress={() => {}}
            style={{
              borderRadius: radiusXL,
              borderWidth: 1,
              borderColor: BORDER_SOFT,
              backgroundColor: CARD,
              overflow: "hidden",
            }}
          >
            <View style={{ padding: 14, borderBottomWidth: 1, borderBottomColor: BORDER_SOFT }}>
              <Text style={{ color: TEXT, fontWeight: "900", fontSize: 18 }}>
                Upgrade Required
              </Text>
              <Text style={{ color: MUTED, fontWeight: "800", marginTop: 6, lineHeight: 20 }}>
                Store hii imefungwa kwenye FREE plan.
              </Text>
            </View>

            <View style={{ padding: 14, gap: 12 }}>
              <Card style={{ borderColor: BORDER_SOFT, backgroundColor: SURFACE2 }}>
                <Text style={{ color: TEXT, fontWeight: "900", lineHeight: 20 }}>
                  {upgradeMsg || "LOCKED: Upgrade plan ili u-activate store hii."}
                </Text>
              </Card>

              <Button title="OK, Sawa" onPress={() => setUpgradeOpen(false)} />
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* kept state variables so future manager UI won't break lint/TS logic */}
      {/* manageStoreId: {String(!!manageStoreId)} */}
      {/* manageStoreName: {manageStoreName} */}
      {/* filteredChoices: {filteredChoices.length} */}
      {/* choicesLoading: {String(choicesLoading)} */}
      {/* choicesError: {choicesError ?? "—"} */}
      {/* savingAssign: {String(savingAssign)} */}
    </Screen>
  );
}