// app/(tabs)/stores/index.tsx
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, FlatList, Pressable, Switch, Text, View } from "react-native";
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
  // ✅ CREDIT SWITCH (FINAL)
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
  // ✅ MOVEMENT SWITCH (POLISH)
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

  const pick = (storeId: string, storeName: string) => {
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
    return (
      <View style={{ gap: 14 }}>
        <Text style={{ fontSize: 26, fontWeight: "900", color: theme.colors.text }}>
          Stores
        </Text>

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

        <Card style={{ gap: 10 }}>
          <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>Organization</Text>
          <Text style={{ fontSize: 20, fontWeight: "900", color: theme.colors.text }}>
            {activeOrgName ?? "—"}
          </Text>

          <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>Role</Text>
          <Text style={{ fontWeight: "900", color: theme.colors.text }}>
            {activeRole ?? "—"}
          </Text>

          <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>Active Store</Text>
          <Text style={{ fontWeight: "900", color: theme.colors.text }}>
            {activeStoreName ?? "—"}
          </Text>

          <Button
            title={
              loading ||
              refreshing ||
              mgrLoading ||
              creditFlagLoading ||
              movementFlagLoading
                ? "Refreshing..."
                : "Refresh"
            }
            onPress={onRefreshAll}
            disabled={
              loading || refreshing || mgrLoading || creditFlagLoading || movementFlagLoading
            }
            variant="primary"
          />
        </Card>

        {canManage && (
          <Button
            title="+ Add Store"
            variant="primary"
            onPress={() => {
              // @ts-ignore
              router.push("/(tabs)/stores/add");
            }}
          />
        )}

        {/* Store Actions */}
        <Button
          title="Open Inventory"
          variant="secondary"
          onPress={() => {
            // @ts-ignore
            router.push("/(tabs)/stores/inventory");
          }}
        />

        <Button title="Stock Movement" variant="secondary" onPress={openMovement} />

        <Text style={{ fontWeight: "900", fontSize: 16, color: theme.colors.text }}>
          Available Stores
        </Text>
      </View>
    );
  }, [
    activeOrgName,
    activeRole,
    activeStoreName,
    canManage,
    error,
    loading,
    mgrLoading,
    creditFlagLoading,
    movementFlagLoading,
    onRefreshAll,
    refreshing,
    router,
    openMovement,
  ]);

  return (
    <Screen
      scroll={false}
      bottomPad={0}
      contentStyle={{ paddingHorizontal: 0, paddingTop: 0, paddingBottom: 0 }}
    >
      <FlatList
        data={list}
        keyExtractor={(item: any) => item.store_id}
        onRefresh={onRefreshAll}
        refreshing={!!(refreshing || mgrLoading || creditFlagLoading || movementFlagLoading)}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View style={{ paddingHorizontal: theme.spacing.page, paddingTop: theme.spacing.page }}>
            {Header}
          </View>
        }
        contentContainerStyle={{
          paddingHorizontal: theme.spacing.page,
          paddingBottom: 140,
        }}
        renderItem={({ item }: { item: any }) => {
          const storeId = String(item.store_id);
          const isActive = storeId === activeStoreId;
          const mgr = mgrByStoreId?.[storeId];
          const managedBy = (mgr?.email ?? "").trim() || "UNASSIGNED";

          const staffCreditEnabled = !!creditFlagByStoreId?.[storeId];
          const creditSaving = !!creditFlagSaving?.[storeId];

          const staffMovementEnabled = !!movementFlagByStoreId?.[storeId];
          const movementSaving = !!movementFlagSaving?.[storeId];

          return (
            <Pressable
              onPress={() => pick(storeId, item.store_name)}
              style={{
                borderWidth: 1,
                borderColor: isActive ? "rgba(52,211,153,0.55)" : theme.colors.border,
                borderRadius: theme.radius.xl,
                backgroundColor: theme.colors.card,
                padding: 16,
                marginBottom: 12,
              }}
            >
              <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: "900", color: theme.colors.text, fontSize: 16 }}>
                    {item.store_name}
                  </Text>

                  <Text style={{ marginTop: 6, color: theme.colors.muted, fontWeight: "800" }}>
                    Managed by:{" "}
                    <Text style={{ color: theme.colors.text, fontWeight: "900" }}>
                      {managedBy}
                    </Text>
                  </Text>
                </View>

                {isActive ? (
                  <View
                    style={{
                      paddingHorizontal: 10,
                      paddingVertical: 6,
                      borderRadius: theme.radius.pill,
                      borderWidth: 1,
                      borderColor: "rgba(52,211,153,0.45)",
                      backgroundColor: "rgba(16,185,129,0.12)",
                      alignSelf: "flex-start",
                    }}
                  >
                    <Text style={{ color: theme.colors.emerald, fontWeight: "900", fontSize: 12 }}>
                      ACTIVE
                    </Text>
                  </View>
                ) : null}
              </View>

              {canManage ? (
                <View style={{ marginTop: 12, gap: 12 }}>
                  {/* Credit switch */}
                  <View
                    style={{
                      borderWidth: 1,
                      borderColor: theme.colors.borderSoft,
                      backgroundColor: theme.colors.surface2,
                      borderRadius: theme.radius.xl,
                      paddingVertical: 10,
                      paddingHorizontal: 12,
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 10,
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: theme.colors.faint, fontWeight: "900" }}>
                        Staff can manage credit
                      </Text>
                      <Text style={{ color: theme.colors.muted, marginTop: 4, lineHeight: 18 }}>
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
                    <Text style={{ color: theme.colors.faint, marginTop: -4, fontWeight: "800" }}>
                      Saving credit setting...
                    </Text>
                  ) : null}

                  {/* Movement switch */}
                  <View
                    style={{
                      borderWidth: 1,
                      borderColor: theme.colors.borderSoft,
                      backgroundColor: theme.colors.surface2,
                      borderRadius: theme.radius.xl,
                      paddingVertical: 10,
                      paddingHorizontal: 12,
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 10,
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: theme.colors.faint, fontWeight: "900" }}>
                        Allow staff stock movement
                      </Text>
                      <Text style={{ color: theme.colors.muted, marginTop: 4, lineHeight: 18 }}>
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
                    <Text style={{ color: theme.colors.faint, marginTop: -4, fontWeight: "800" }}>
                      Saving movement setting...
                    </Text>
                  ) : null}
                </View>
              ) : null}
            </Pressable>
          );
        }}
        ListEmptyComponent={
          <View style={{ paddingTop: 10 }}>
            <Card>
              <Text style={{ fontWeight: "900", color: theme.colors.text }}>No stores found</Text>
            </Card>
          </View>
        }
      />

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