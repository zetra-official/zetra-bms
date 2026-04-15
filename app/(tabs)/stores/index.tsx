// app/(tabs)/stores/index.tsx
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import SafeIcon from "@/src/ui/SafeIcon";
import {
  Alert,
  FlatList,
  Modal,
  Platform,
  Pressable,
  Switch,
  Text,
  TextInput,
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

type StoreProductPreviewRow = {
  id: string;
  name: string;
  sku: string | null;
  qty: number;
};

function normalizeStoreType(v: any): "STANDARD" | "CAPITAL_RECOVERY" {
  const t = String(v ?? "STANDARD").trim().toUpperCase();
  return t === "CAPITAL_RECOVERY" ? "CAPITAL_RECOVERY" : "STANDARD";
}

function HeaderActionButton({
  title,
  icon,
  onPress,
  disabled,
  fullWidth,
  textColor,
  mutedColor,
  borderColor,
  backgroundColor,
  accentColor,
  isWebOnlyPolish,
}: {
  title: string;
  icon: string;
  onPress: () => void;
  disabled?: boolean;
  fullWidth?: boolean;
  textColor: string;
  mutedColor: string;
  borderColor: string;
  backgroundColor: string;
  accentColor: string;
  isWebOnlyPolish?: boolean;
}) {
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      style={({ pressed }) => ({
        minHeight: isWebOnlyPolish ? 58 : 52,
        borderRadius: isWebOnlyPolish ? 20 : 18,
        borderWidth: 1,
        borderColor,
        backgroundColor,
        paddingHorizontal: isWebOnlyPolish ? 16 : 14,
        paddingVertical: isWebOnlyPolish ? 13 : 12,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: isWebOnlyPolish ? 12 : 10,
        opacity: disabled ? 0.55 : pressed ? 0.92 : 1,
        width: fullWidth ? "100%" : undefined,
        shadowColor: "#000",
        shadowOpacity: isWebOnlyPolish ? 0.18 : 0,
        shadowRadius: isWebOnlyPolish ? 16 : 0,
        shadowOffset: { width: 0, height: isWebOnlyPolish ? 8 : 0 },
      })}
    >
      <View
        style={{
          width: isWebOnlyPolish ? 32 : 28,
          height: isWebOnlyPolish ? 32 : 28,
          borderRadius: 999,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "rgba(255,255,255,0.08)",
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.10)",
        }}
      >
        <SafeIcon name={icon} size={isWebOnlyPolish ? 17 : 16} color={accentColor} />
      </View>

      <Text
        style={{
          color: textColor,
          fontWeight: "900",
          fontSize: isWebOnlyPolish ? 15 : 14,
          lineHeight: 18,
        }}
        numberOfLines={1}
      >
        {title}
      </Text>
    </Pressable>
  );
}

function CompactSettingRow({
  title,
  subtitle,
  value,
  onValueChange,
  disabled,
  borderColor,
  backgroundColor,
  textColor,
  mutedColor,
}: {
  title: string;
  subtitle: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
  disabled?: boolean;
  borderColor: string;
  backgroundColor: string;
  textColor: string;
  mutedColor: string;
}) {
  return (
    <View
      style={{
        borderWidth: 1,
        borderColor,
        backgroundColor,
        borderRadius: 16,
        paddingVertical: 10,
        paddingHorizontal: 12,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
      }}
    >
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ color: textColor, fontWeight: "900", fontSize: 13 }}>
          {title}
        </Text>
        <Text
          style={{
            color: mutedColor,
            marginTop: 4,
            lineHeight: 17,
            fontWeight: "800",
            fontSize: 11.5,
          }}
          numberOfLines={2}
        >
          {subtitle}
        </Text>
      </View>

      <Switch value={value} onValueChange={onValueChange} disabled={disabled} />
    </View>
  );
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
    activeStoreType,
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
  // ✅ EXPENSE SWITCH
  // =========================
  const [expenseFlagByStoreId, setExpenseFlagByStoreId] = useState<Record<string, boolean>>({});
  const [expenseFlagLoading, setExpenseFlagLoading] = useState(false);
  const [expenseFlagSaving, setExpenseFlagSaving] = useState<Record<string, boolean>>({});

  const loadExpenseFlags = useCallback(async () => {
    if (!canManage || !activeOrgId) {
      setExpenseFlagByStoreId({});
      return;
    }

    const ids = (list ?? []).map((s: any) => s.store_id).filter(Boolean);
    if (ids.length === 0) {
      setExpenseFlagByStoreId({});
      return;
    }

    setExpenseFlagLoading(true);

    const apply = (rows: any[], key: "staff_can_manage_expense" | "allow_staff_expense") => {
      const map: Record<string, boolean> = {};
      for (const r of rows ?? []) {
        map[String(r.id)] = !!r?.[key];
      }
      setExpenseFlagByStoreId(map);
    };

    try {
      const { data, error: e } = await supabase
        .from("stores")
        .select("id, staff_can_manage_expense")
        .in("id", ids);

      if (e) throw e;
      apply(data ?? [], "staff_can_manage_expense");
    } catch {
      try {
        const { data: d2, error: e2 } = await supabase
          .from("stores")
          .select("id, allow_staff_expense")
          .in("id", ids);

        if (e2) throw e2;
        apply(d2 ?? [], "allow_staff_expense");
      } catch {
        // keep last known
      }
    } finally {
      setExpenseFlagLoading(false);
    }
  }, [activeOrgId, canManage, list]);

  useEffect(() => {
    void loadExpenseFlags();
  }, [loadExpenseFlags]);

  const toggleStoreExpense = useCallback(
    async (storeId: string, next: boolean) => {
      if (!canManage) {
        Alert.alert("No Access", "Owner/Admin only.");
        return;
      }

      setExpenseFlagSaving((p) => ({ ...p, [storeId]: true }));
      setExpenseFlagByStoreId((p) => ({ ...p, [storeId]: next }));

      try {
        const { error: e } = await supabase
          .from("stores")
          .update({ staff_can_manage_expense: next } as any)
          .eq("id", storeId);

        if (e) throw e;

        await refresh();
        await loadExpenseFlags();
      } catch (err1: any) {
        try {
          const { error: e2 } = await supabase
            .from("stores")
            .update({ allow_staff_expense: next } as any)
            .eq("id", storeId);

          if (e2) throw e2;

          await refresh();
          await loadExpenseFlags();
        } catch (err2: any) {
          setExpenseFlagByStoreId((p) => ({ ...p, [storeId]: !next }));
          Alert.alert(
            "Failed",
            err2?.message ?? err1?.message ?? "Imeshindikana kubadili expense setting."
          );
        }
      } finally {
        setExpenseFlagSaving((p) => ({ ...p, [storeId]: false }));
      }
    },
    [canManage, loadExpenseFlags, refresh]
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

  const [renameOpen, setRenameOpen] = useState(false);
  const [renameStoreId, setRenameStoreId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renameSaving, setRenameSaving] = useState(false);

  const [closeOpen, setCloseOpen] = useState(false);
  const [closeStoreId, setCloseStoreId] = useState<string | null>(null);
  const [closeStoreName, setCloseStoreName] = useState("");
  const [closeConfirmText, setCloseConfirmText] = useState("");
  const [closeSaving, setCloseSaving] = useState(false);

  const [actionsOpenByStoreId, setActionsOpenByStoreId] = useState<Record<string, boolean>>({});
  const [productsByStoreId, setProductsByStoreId] = useState<Record<string, StoreProductPreviewRow[]>>({});
  const [productsLoadingByStoreId, setProductsLoadingByStoreId] = useState<Record<string, boolean>>({});

  useFocusEffect(
    useCallback(() => {
      return () => {
        setActionsOpenByStoreId({});
      };
    }, [])
  );

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

  const openRename = useCallback((storeId: string, storeName: string) => {
    setRenameStoreId(storeId);
    setRenameValue(storeName);
    setRenameOpen(true);
  }, []);

  const closeRename = useCallback(() => {
    if (renameSaving) return;
    setRenameOpen(false);
    setRenameStoreId(null);
    setRenameValue("");
  }, [renameSaving]);

  const openCloseStore = useCallback((storeId: string, storeName: string) => {
    setCloseStoreId(storeId);
    setCloseStoreName(storeName);
    setCloseConfirmText("");
    setCloseOpen(true);
  }, []);

  const closeCloseStore = useCallback(() => {
    if (closeSaving) return;
    setCloseOpen(false);
    setCloseStoreId(null);
    setCloseStoreName("");
    setCloseConfirmText("");
  }, [closeSaving]);

  const loadStoreProductsPreview = useCallback(async (storeId: string) => {
    const sid = String(storeId ?? "").trim();
    if (!sid) return;

    setProductsLoadingByStoreId((prev) => ({ ...prev, [sid]: true }));

    try {
      const { data, error } = await supabase.rpc("get_store_inventory_v2", {
        p_store_id: sid,
      });

      if (error) throw error;

      const rows = Array.isArray(data) ? data : [];

      const mapped: StoreProductPreviewRow[] = rows
        .map((r: any, index: number) => {
          const rawId =
            r?.product_id ??
            r?.id ??
            `${sid}-${index}`;

          const rawName =
            r?.product_name ??
            r?.name ??
            r?.item_name ??
            "Unnamed Product";

          const rawSku =
            r?.sku ??
            r?.product_sku ??
            r?.item_sku ??
            null;

          const rawQty =
            r?.quantity ??
            r?.qty ??
            r?.on_hand_qty ??
            r?.stock_qty ??
            r?.current_stock ??
            r?.current_qty ??
            0;

          return {
            id: String(rawId),
            name: String(rawName ?? "Unnamed Product"),
            sku: rawSku ? String(rawSku) : null,
            qty: Number(rawQty ?? 0),
          };
        })
        .filter((r) => !!r.name)
        .sort((a, b) => a.name.localeCompare(b.name));

      setProductsByStoreId((prev) => ({
        ...prev,
        [sid]: mapped,
      }));
    } catch {
      setProductsByStoreId((prev) => ({
        ...prev,
        [sid]: [],
      }));
    } finally {
      setProductsLoadingByStoreId((prev) => ({ ...prev, [sid]: false }));
    }
  }, []);

  const toggleStoreActions = useCallback((storeId: string) => {
    const sid = String(storeId ?? "").trim();
    if (!sid) return;

    const nextOpen = !actionsOpenByStoreId[sid];

    setActionsOpenByStoreId(nextOpen ? { [sid]: true } : {});

    if (nextOpen && !productsByStoreId[sid] && !productsLoadingByStoreId[sid]) {
      void loadStoreProductsPreview(sid);
    }
  }, [actionsOpenByStoreId, productsByStoreId, productsLoadingByStoreId, loadStoreProductsPreview]);

  const saveRenameStore = useCallback(async () => {
    if (!canManage) {
      Alert.alert("No Access", "Owner/Admin only.");
      return;
    }

    const orgId = String(activeOrgId ?? "").trim();
    const sid = String(renameStoreId ?? "").trim();
    const nextName = String(renameValue ?? "").trim();

    if (!orgId) {
      Alert.alert("Missing", "Organization haijapatikana.");
      return;
    }

    if (!sid) {
      Alert.alert("Missing", "Store haijapatikana.");
      return;
    }

    if (!nextName) {
      Alert.alert("Missing", "Weka jina jipya la store.");
      return;
    }

    setRenameSaving(true);
    try {
      const { error: e } = await supabase.rpc("rename_store_v1", {
        p_org_id: orgId,
        p_store_id: sid,
        p_new_name: nextName,
      });

      if (e) throw e;

      await refresh();
      await loadManagers();
      await loadCreditFlags();
      await loadExpenseFlags();
      await loadMovementFlags();

      if (sid === String(activeStoreId ?? "").trim()) {
        await setActiveStoreId(sid);
      }

      Alert.alert("Success ✅", "Store name updated successfully.");
      closeRename();
    } catch (err: any) {
      Alert.alert("Rename failed", err?.message ?? "Unknown error");
    } finally {
      setRenameSaving(false);
    }
  }, [
    canManage,
    activeOrgId,
    renameStoreId,
    renameValue,
    activeStoreId,
    setActiveStoreId,
    refresh,
    loadManagers,
    loadCreditFlags,
    loadMovementFlags,
    closeRename,
  ]);

  const closeStoreNow = useCallback(async () => {
    if (!canManage) {
      Alert.alert("No Access", "Owner/Admin only.");
      return;
    }

    const orgId = String(activeOrgId ?? "").trim();
    const sid = String(closeStoreId ?? "").trim();
    const closingName = String(closeStoreName ?? "").trim();
    const typedName = String(closeConfirmText ?? "").trim();

    if (!orgId) {
      Alert.alert("Missing", "Organization haijapatikana.");
      return;
    }

    if (!sid) {
      Alert.alert("Missing", "Store haijapatikana.");
      return;
    }

    if (!closingName) {
      Alert.alert("Missing", "Store name haijapatikana.");
      return;
    }

    if (typedName !== closingName) {
      Alert.alert("Confirmation failed", "Andika jina la store sawa kabisa ili kuendelea.");
      return;
    }

    setCloseSaving(true);
    try {
      const { error: e } = await supabase.rpc("close_store_v1", {
        p_org_id: orgId,
        p_store_id: sid,
        p_close_note: `Closed from app by ${String(activeRole ?? "owner").toUpperCase()}`,
      });

      if (e) throw e;

      const wasActive = sid === String(activeStoreId ?? "").trim();

      await refresh();
      await loadManagers();
      await loadCreditFlags();
      await loadExpenseFlags();
      await loadMovementFlags();

      if (wasActive) {
        const nextActive = (list ?? []).find((s: any) => {
          const id = String(s?.store_id ?? "").trim();
          return id && id !== sid && (typeof s?.is_allowed === "boolean" ? s.is_allowed : true);
        });

        if (nextActive?.store_id) {
          await setActiveStoreId(String(nextActive.store_id));
        }
      }

      Alert.alert("Success ✅", "Store imefungwa vizuri.");
      closeCloseStore();
    } catch (err: any) {
      Alert.alert("Close failed", err?.message ?? "Unknown error");
    } finally {
      setCloseSaving(false);
    }
  }, [
    canManage,
    activeOrgId,
    closeStoreId,
    closeStoreName,
    closeConfirmText,
    activeRole,
    activeStoreId,
    list,
    setActiveStoreId,
    refresh,
    loadManagers,
    loadCreditFlags,
    loadMovementFlags,
    closeCloseStore,
  ]);

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
    await loadExpenseFlags();
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
      loading ||
      refreshing ||
      mgrLoading ||
      creditFlagLoading ||
      expenseFlagLoading ||
      movementFlagLoading;

    return (
      <View style={{ gap: 16 }}>
        <View
          style={{
            gap: 12,
            flexDirection: isDesktopWeb ? "row" : "column",
            alignItems: isDesktopWeb ? "center" : "flex-start",
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
              flexWrap: isDesktopWeb ? "nowrap" : "wrap",
              gap: isWeb ? 12 : 10,
              width: isDesktopWeb ? "auto" : "100%",
              justifyContent: isDesktopWeb ? "flex-end" : "flex-start",
              alignItems: "center",
            }}
          >
            <View
              style={{
                flex: isDesktopWeb ? 0 : 1,
                minWidth: isDesktopWeb ? 160 : 0,
              }}
            >
              <HeaderActionButton
                title={busy ? "Refreshing..." : "Refresh"}
                icon="refresh"
                onPress={onRefreshAll}
                disabled={busy}
                fullWidth
                textColor={TEXT}
                mutedColor={MUTED}
                borderColor={busy ? "rgba(255,255,255,0.10)" : "rgba(16,185,129,0.30)"}
                backgroundColor={busy ? "rgba(255,255,255,0.05)" : "rgba(16,185,129,0.10)"}
                accentColor={EMERALD}
                isWebOnlyPolish={isWeb}
              />
            </View>

            {canManage ? (
              <View
                style={{
                  flex: isDesktopWeb ? 0 : 1,
                  minWidth: isDesktopWeb ? 180 : 0,
                }}
              >
                <HeaderActionButton
                  title="Add Store"
                  icon="add"
                  onPress={() => {
                    // @ts-ignore
                    router.push("/(tabs)/stores/add");
                  }}
                  fullWidth
                  textColor={TEXT}
                  mutedColor={MUTED}
                  borderColor="rgba(255,255,255,0.12)"
                  backgroundColor="#161C27"
                  accentColor={EMERALD}
                  isWebOnlyPolish={isWeb}
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
                if (activeStoreType === "CAPITAL_RECOVERY") {
                  Alert.alert(
                    "Not Available",
                    "Inventory haitumiki kwa Capital Recovery store."
                  );
                  return;
                }
                // @ts-ignore
                router.push("/(tabs)/stores/inventory");
              }}
              style={({ pressed }) => ({
                borderRadius: radiusXL,
                borderWidth: 1,
                borderColor: BORDER_SOFT,
                backgroundColor: "#161C27",
                paddingVertical: 14,
                paddingHorizontal: 16,
                opacity: activeStoreType === "CAPITAL_RECOVERY" ? 0.55 : pressed ? 0.92 : 1,
              })}
            >
              <Text style={{ color: TEXT, fontWeight: "900", fontSize: 15 }}>Open Inventory</Text>
              <Text style={{ color: MUTED, fontWeight: "800", marginTop: 4, fontSize: 12 }}>
                {activeStoreType === "CAPITAL_RECOVERY"
                  ? "Inventory imezimwa kwa Capital Recovery"
                  : "Fungua inventory ya active store"}
              </Text>
            </Pressable>

            <Pressable
              onPress={() => {
                if (activeStoreType === "CAPITAL_RECOVERY") {
                  Alert.alert(
                    "Not Available",
                    "Stock Movement haitumiki kwa Capital Recovery store."
                  );
                  return;
                }
                openMovement();
              }}
              style={({ pressed }) => ({
                borderRadius: radiusXL,
                borderWidth: 1,
                borderColor: BORDER_SOFT,
                backgroundColor: "#161C27",
                paddingVertical: 14,
                paddingHorizontal: 16,
                opacity: activeStoreType === "CAPITAL_RECOVERY" ? 0.55 : pressed ? 0.92 : 1,
              })}
            >
              <Text style={{ color: TEXT, fontWeight: "900", fontSize: 15 }}>Stock Movement</Text>
              <Text style={{ color: MUTED, fontWeight: "800", marginTop: 4, fontSize: 12 }}>
                {activeStoreType === "CAPITAL_RECOVERY"
                  ? "Movement imezimwa kwa Capital Recovery"
                  : "Hamisha stock kutoka active store"}
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
    activeStoreType,
    canManage,
    error,
    isDesktopWeb,
    loading,
    mgrLoading,
    creditFlagLoading,
    expenseFlagLoading,
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
        refreshing={!!(
          refreshing ||
          mgrLoading ||
          creditFlagLoading ||
          expenseFlagLoading ||
          movementFlagLoading
        )}
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

          const staffExpenseEnabled = !!expenseFlagByStoreId?.[storeId];
          const expenseSaving = !!expenseFlagSaving?.[storeId];

          const staffMovementEnabled = !!movementFlagByStoreId?.[storeId];
          const movementSaving = !!movementFlagSaving?.[storeId];

          const borderColor = isActive
            ? "rgba(52,211,153,0.55)"
            : !isAllowed
            ? "rgba(255,255,255,0.10)"
            : BORDER;

          const opacity = !isAllowed ? 0.72 : 1;
          const actionsOpen = !!actionsOpenByStoreId[storeId];
          const productPreview = productsByStoreId[storeId] ?? [];
          const productPreviewLoading = !!productsLoadingByStoreId[storeId];

          return (
            <View
              style={{
                width: isDesktopWeb ? "49.1%" : "100%",
                maxWidth: isDesktopWeb ? undefined : desktopMaxWidth,
                alignSelf: "center",
                marginBottom: 10,
              }}
            >
    <Pressable
                onPress={() => pick(storeId, item.store_name, isAllowed, lockReason)}
                style={({ pressed }) => ({
                  borderWidth: 1,
                  borderColor,
                  borderRadius: 22,
                  backgroundColor: "#0F141C",
                  padding: isDesktopWeb ? 18 : 14,
                  opacity: pressed ? Math.max(0.9, opacity - 0.03) : opacity,
                  transform: pressed ? [{ scale: 0.996 }] : [{ scale: 1 }],
                })}
              >
                <View style={{ gap: 8 }}>
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "flex-start",
                      justifyContent: "space-between",
                      gap: 12,
                    }}
                  >
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text
                        style={{
                          fontWeight: "900",
                          color: TEXT,
                          fontSize: isWeb ? 18 : 17,
                          letterSpacing: 0.2,
                        }}
                        numberOfLines={1}
                      >
                        {item.store_name}
                      </Text>

                      <Text
                        style={{
                          marginTop: 4,
                          color: isCapitalRecovery ? EMERALD : MUTED,
                          fontWeight: "900",
                          fontSize: 11.5,
                          letterSpacing: 0.4,
                        }}
                        numberOfLines={1}
                      >
                        {isCapitalRecovery ? "CAPITAL RECOVERY STORE" : "STANDARD STORE"}
                      </Text>

                      <Text
                        style={{
                          marginTop: 5,
                          color: MUTED,
                          fontWeight: "800",
                          fontSize: 11.5,
                        }}
                        numberOfLines={1}
                      >
                        Managed by:{" "}
                        <Text style={{ color: TEXT, fontWeight: "900" }}>
                          {managedBy}
                        </Text>
                      </Text>
                    </View>

                    <View style={{ gap: 8, alignItems: "flex-end", justifyContent: "flex-start" }}>
                      {isActive ? (
                        <View
                          style={{
                            paddingHorizontal: 10,
                            paddingVertical: 6,
                            borderRadius: radiusPill,
                            borderWidth: 1,
                            borderColor: "rgba(52,211,153,0.45)",
                            backgroundColor: "rgba(16,185,129,0.12)",
                          }}
                        >
                          <Text style={{ color: EMERALD, fontWeight: "900", fontSize: 11.5 }}>
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
                          }}
                        >
                          <Text style={{ color: MUTED, fontWeight: "900", fontSize: 11.5 }}>
                            Tap to activate ›
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
                          }}
                        >
                          <Text style={{ color: EMERALD, fontWeight: "900", fontSize: 11.5 }}>
                            CAPITAL
                          </Text>
                        </View>
                      ) : (
                        <View
                          style={{
                            paddingHorizontal: 10,
                            paddingVertical: 6,
                            borderRadius: radiusPill,
                            borderWidth: 1,
                            borderColor: "rgba(255,255,255,0.16)",
                            backgroundColor: "rgba(255,255,255,0.07)",
                          }}
                        >
                          <Text style={{ color: TEXT, fontWeight: "900", fontSize: 11.5 }}>
                            STANDARD
                          </Text>
                        </View>
                      )}

                      {!isAllowed ? (
                        <View
                          style={{
                            paddingHorizontal: 10,
                            paddingVertical: 6,
                            borderRadius: radiusPill,
                            borderWidth: 1,
                            borderColor: "rgba(255,255,255,0.14)",
                            backgroundColor: "rgba(255,255,255,0.06)",
                          }}
                        >
                          <Text style={{ color: FAINT, fontWeight: "900", fontSize: 11.5 }}>
                            LOCKED
                          </Text>
                        </View>
                      ) : null}
                    </View>
                  </View>

                  <View style={{ height: 2 }} />

                  {!isAllowed ? (
                    <Text style={{ color: FAINT, fontWeight: "900", fontSize: 12, lineHeight: 18 }}>
                      🔒 LOCKED — upgrade plan ili u-activate.
                    </Text>
                  ) : !isActive ? (
                    <Text style={{ color: FAINT, fontWeight: "800", fontSize: 12, lineHeight: 18 }}>
                      Bonyeza kadi hii kuchagua store hii kama Active Store.
                    </Text>
                  ) : (
                    <Text style={{ color: EMERALD, fontWeight: "800", fontSize: 12, lineHeight: 18 }}>
                      Hii ndiyo Active Store ya sasa.
                    </Text>
                  )}
                </View>

             {isCapitalRecovery && isAllowed ? (
  <View style={{ marginTop: 8 }}>
    <Pressable
      onPress={() => {
        setActiveStoreId(storeId);
        // @ts-ignore
        router.push("/(tabs)/capital-recovery/workspace");
      }}
      style={({ pressed }) => ({
        borderRadius: 16,
        borderWidth: 1,
        borderColor: "rgba(16,185,129,0.26)",
        backgroundColor: "rgba(16,185,129,0.10)",
        paddingVertical: 11,
        paddingHorizontal: 13,
        opacity: pressed ? 0.92 : 1,
      })}
    >
      <Text style={{ color: TEXT, fontWeight: "900", fontSize: 13.5 }}>
        Open Capital Recovery Workspace
      </Text>
      <Text style={{ color: MUTED, fontWeight: "800", marginTop: 3, fontSize: 11.5 }}>
        Fungua dashboard maalum ya Capital Recovery
      </Text>
    </Pressable>
  </View>
) : null}

{canManage && isAllowed ? (
  <View style={{ marginTop: 10, gap: 10 }}>
    <Pressable
      onPress={() => toggleStoreActions(storeId)}
      style={({ pressed }) => ({
        borderRadius: 16,
        borderWidth: 1,
        borderColor: actionsOpen ? "rgba(16,185,129,0.24)" : BORDER_SOFT,
        backgroundColor: actionsOpen ? "rgba(16,185,129,0.08)" : "#161C27",
        paddingVertical: 11,
        paddingHorizontal: 14,
        opacity: pressed ? 0.92 : 1,
      })}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
        }}
      >
        <View style={{ flex: 1 }}>
          <Text style={{ color: TEXT, fontWeight: "900", fontSize: 14 }}>
            Store Actions
          </Text>
          <Text style={{ color: MUTED, fontWeight: "800", marginTop: 4, fontSize: 12 }}>
            Settings, products, rename na close store
          </Text>
        </View>

        <Text style={{ color: actionsOpen ? EMERALD : MUTED, fontWeight: "900", fontSize: 18 }}>
          {actionsOpen ? "−" : "+"}
        </Text>
      </View>
    </Pressable>

    {actionsOpen ? (
      <View
        style={{
          gap: 8,
          paddingTop: 2,
        }}
      >
        <CompactSettingRow
          title="Staff credit"
          subtitle="Staff arekodi na aone credit ya store hii"
          value={staffCreditEnabled}
          onValueChange={(v) => toggleStoreCredit(storeId, v)}
          disabled={creditSaving}
          borderColor={BORDER_SOFT}
          backgroundColor="#141A24"
          textColor={FAINT}
          mutedColor={MUTED}
        />

        {creditSaving ? (
          <Text style={{ color: FAINT, marginTop: -4, fontWeight: "800", fontSize: 11.5 }}>
            Saving credit setting...
          </Text>
        ) : null}

        <CompactSettingRow
          title="Staff expense"
          subtitle="Ruhusu staff kurekodi expense katika store hii"
          value={staffExpenseEnabled}
          onValueChange={(v) => toggleStoreExpense(storeId, v)}
          disabled={expenseSaving}
          borderColor={BORDER_SOFT}
          backgroundColor="#141A24"
          textColor={FAINT}
          mutedColor={MUTED}
        />

        {expenseSaving ? (
          <Text style={{ color: FAINT, marginTop: -4, fontWeight: "800", fontSize: 11.5 }}>
            Saving expense setting...
          </Text>
        ) : null}

        <CompactSettingRow
          title="Stock movement"
          subtitle="Ruhusu staff kuhamisha stock kutoka store hii"
          value={staffMovementEnabled}
          onValueChange={(v) => toggleStoreMovement(storeId, v)}
          disabled={movementSaving}
          borderColor={BORDER_SOFT}
          backgroundColor="#141A24"
          textColor={FAINT}
          mutedColor={MUTED}
        />

        {movementSaving ? (
          <Text style={{ color: FAINT, marginTop: -4, fontWeight: "800", fontSize: 11.5 }}>
            Saving movement setting...
          </Text>
        ) : null}

        <Pressable
          onPress={() => {
            // @ts-ignore
            router.push({
              pathname: "/(tabs)/stores/store-products",
              params: {
                storeId,
                storeName: item.store_name,
              },
            });
          }}
          style={({ pressed }) => ({
            borderRadius: 16,
            borderWidth: 1,
            borderColor: BORDER_SOFT,
            backgroundColor: "#141A24",
            paddingVertical: 11,
            paddingHorizontal: 13,
            opacity: pressed ? 0.92 : 1,
          })}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 10,
            }}
          >
            <View style={{ flex: 1 }}>
              <Text style={{ color: TEXT, fontWeight: "900", fontSize: 14 }}>
                Products in this store
              </Text>
              <Text
                style={{
                  color: MUTED,
                  fontWeight: "800",
                  marginTop: 4,
                  fontSize: 12,
                }}
              >
                Open full page — view store products only
              </Text>
            </View>

            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <View
                style={{
                  paddingHorizontal: 10,
                  paddingVertical: 6,
                  borderRadius: radiusPill,
                  borderWidth: 1,
                  borderColor: BORDER_SOFT,
                  backgroundColor: "rgba(255,255,255,0.06)",
                }}
              >
                <Text style={{ color: TEXT, fontWeight: "900", fontSize: 11.5 }}>
                  {productPreviewLoading ? "..." : `${productPreview.length} items`}
                </Text>
              </View>

              <Text style={{ color: MUTED, fontWeight: "900", fontSize: 18 }}>
                ›
              </Text>
            </View>
          </View>
        </Pressable>

        <Pressable
          onPress={() => openRename(storeId, item.store_name)}
          style={({ pressed }) => ({
            borderRadius: 16,
            borderWidth: 1,
            borderColor: BORDER_SOFT,
            backgroundColor: "#141A24",
            paddingVertical: 11,
            paddingHorizontal: 13,
            opacity: pressed ? 0.92 : 1,
          })}
        >
          <Text style={{ color: TEXT, fontWeight: "900", fontSize: 14 }}>
            Rename Store
          </Text>
          <Text style={{ color: MUTED, fontWeight: "800", marginTop: 4, fontSize: 12 }}>
            Badili jina la store hii
          </Text>
        </Pressable>

        <Pressable
          onPress={() => openCloseStore(storeId, item.store_name)}
          style={({ pressed }) => ({
            borderRadius: 16,
            borderWidth: 1,
            borderColor: DANGER_BORDER,
            backgroundColor: "rgba(239,68,68,0.12)",
            paddingVertical: 11,
            paddingHorizontal: 13,
            opacity: pressed ? 0.92 : 1,
          })}
        >
          <Text style={{ color: DANGER, fontWeight: "900", fontSize: 14 }}>
            Close Store
          </Text>
          <Text style={{ color: MUTED, fontWeight: "800", marginTop: 4, fontSize: 12 }}>
            Funga store hii na kufungua slot ya store mpya
          </Text>
        </Pressable>
      </View>
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

      <Modal
        visible={renameOpen}
        transparent
        animationType="fade"
        statusBarTranslucent={false}
        hardwareAccelerated
        // @ts-ignore
        presentationStyle="overFullScreen"
        onRequestClose={closeRename}
      >
        <Pressable
          onPress={closeRename}
          style={{
            flex: 1,
            backgroundColor: "rgba(4,8,15,0.94)",
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
              backgroundColor: "#11161F",
              overflow: "hidden",
            }}
          >
            <View style={{ padding: 14, borderBottomWidth: 1, borderBottomColor: BORDER_SOFT }}>
              <Text style={{ color: TEXT, fontWeight: "900", fontSize: 18 }}>
                Rename Store
              </Text>
              <Text style={{ color: MUTED, fontWeight: "800", marginTop: 6, lineHeight: 20 }}>
                Badili jina la store bila kugusa reports za zamani.
              </Text>
            </View>

            <View style={{ padding: 14, gap: 12 }}>
              <TextInput
                value={renameValue}
                onChangeText={setRenameValue}
                placeholder="Store name"
                placeholderTextColor="rgba(255,255,255,0.35)"
                style={{
                  borderWidth: 1,
                  borderColor: BORDER_SOFT,
                  borderRadius: radiusXL,
                  backgroundColor: "#161C27",
                  paddingHorizontal: 14,
                  paddingVertical: 12,
                  color: TEXT,
                  fontWeight: "800",
                }}
              />

              <View style={{ flexDirection: "row", gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Button
                    title="Cancel"
                    onPress={closeRename}
                    disabled={renameSaving}
                    variant="secondary"
                  />
                </View>

                <View style={{ flex: 1 }}>
                  <Button
                    title={renameSaving ? "Saving..." : "Save Name"}
                    onPress={saveRenameStore}
                    disabled={renameSaving}
                    variant="primary"
                  />
                </View>
              </View>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={closeOpen}
        transparent
        animationType="fade"
        statusBarTranslucent={false}
        hardwareAccelerated
        // @ts-ignore
        presentationStyle="overFullScreen"
        onRequestClose={closeCloseStore}
      >
        <Pressable
          onPress={closeCloseStore}
          style={{
            flex: 1,
            backgroundColor: "rgba(4,8,15,0.94)",
            paddingHorizontal: 14,
            justifyContent: "center",
          }}
        >
          <Pressable
            onPress={() => {}}
            style={{
              borderRadius: radiusXL,
              borderWidth: 1,
              borderColor: DANGER_BORDER,
              backgroundColor: "#11161F",
              overflow: "hidden",
            }}
          >
            <View style={{ padding: 14, borderBottomWidth: 1, borderBottomColor: BORDER_SOFT }}>
              <Text style={{ color: TEXT, fontWeight: "900", fontSize: 18 }}>
                Close Store
              </Text>
              <Text style={{ color: MUTED, fontWeight: "800", marginTop: 6, lineHeight: 20 }}>
                Store ikifungwa, live operational data inaweza kuondolewa lakini reports/snapshots za zamani zibaki salama.
              </Text>
            </View>

            <View style={{ padding: 14, gap: 12 }}>
              <Card style={{ borderColor: DANGER_BORDER, backgroundColor: DANGER_SOFT }}>
                <Text style={{ color: TEXT, fontWeight: "900", lineHeight: 20 }}>
                  Unaenda kufunga store:
                </Text>
                <Text style={{ color: DANGER, fontWeight: "900", marginTop: 6, fontSize: 16 }}>
                  {closeStoreName || "—"}
                </Text>
                <Text style={{ color: MUTED, fontWeight: "800", marginTop: 8, lineHeight: 20 }}>
                  Ili kuendelea, andika jina la store hii kama uthibitisho. Ukifunga store, slot yake itafunguka kwa store mpya kulingana na plan yako.
                </Text>
              </Card>

              <TextInput
                value={closeConfirmText}
                onChangeText={setCloseConfirmText}
                placeholder="Andika jina la store hapa"
                placeholderTextColor="rgba(255,255,255,0.35)"
                style={{
                  borderWidth: 1,
                  borderColor: BORDER_SOFT,
                  borderRadius: radiusXL,
                  backgroundColor: "#161C27",
                  paddingHorizontal: 14,
                  paddingVertical: 12,
                  color: TEXT,
                  fontWeight: "800",
                }}
              />

              <View style={{ flexDirection: "row", gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Button
                    title="Cancel"
                    onPress={closeCloseStore}
                    disabled={closeSaving}
                    variant="secondary"
                  />
                </View>

                <View style={{ flex: 1 }}>
                  <Button
                    title={closeSaving ? "Closing..." : "Close Store"}
                    onPress={closeStoreNow}
                    disabled={
                      closeSaving ||
                      String(closeConfirmText).trim() !== String(closeStoreName).trim()
                    }
                    variant="primary"
                  />
                </View>
              </View>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

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
            backgroundColor: "rgba(4,8,15,0.94)",
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
              backgroundColor: "#11161F",
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