// app/(tabs)/staff/assign.tsx
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Text, View } from "react-native";
import { useOrg } from "../../../src/context/OrgContext";
import { supabase } from "../../../src/supabase/supabaseClient";
import { Button } from "../../../src/ui/Button";
import { Card } from "../../../src/ui/Card";
import { Screen } from "../../../src/ui/Screen";
import { UI } from "../../../src/ui/theme";

type AssignedRow = { store_id: string };

export default function AssignStaffStoresScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ membershipId?: string }>();
  const membershipId = (params.membershipId?.toString() || "").trim();

  const { activeOrgId, activeOrgName, activeRole, stores, refresh } = useOrg();
  const canManage = activeRole === "owner" || activeRole === "admin";

  const orgStores = useMemo(() => {
    if (!activeOrgId) return [];
    return (stores ?? []).filter((s) => s.organization_id === activeOrgId);
  }, [stores, activeOrgId]);

  const [loading, setLoading] = useState(false);
  const [assignedIds, setAssignedIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const loadAssigned = useCallback(async () => {
    setError(null);

    if (!membershipId) {
      setAssignedIds([]);
      return;
    }

    setLoading(true);
    try {
      // ✅ RPC-only (no direct table select)
      const { data, error: e } = await supabase.rpc(
        "get_assigned_stores_for_membership",
        { p_membership_id: membershipId }
      );

      if (e) throw e;

      const rows = (data ?? []) as AssignedRow[];
      const ids = rows.map((r) => r.store_id).filter(Boolean);
      setAssignedIds(ids);
    } catch (err: any) {
      setError(err?.message ?? "Failed to load assigned stores");
      setAssignedIds([]);
    } finally {
      setLoading(false);
    }
  }, [membershipId]);

  useEffect(() => {
    loadAssigned();
  }, [loadAssigned]);

  const isAssigned = (storeId: string) => assignedIds.includes(storeId);

  const toggle = async (storeId: string, storeName: string) => {
    if (!canManage) {
      Alert.alert("No Access", "Owner/Admin only.");
      return;
    }
    if (!membershipId) {
      Alert.alert("Missing membershipId", "Rudi kwenye Staff list kisha ufungue tena.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      if (isAssigned(storeId)) {
        // ✅ UNASSIGN via RPC (no direct delete)
        const { error: delErr } = await supabase.rpc(
          "unassign_membership_from_store",
          { p_membership_id: membershipId, p_store_id: storeId }
        );
        if (delErr) throw delErr;

        Alert.alert("Removed ✅", `${storeName} imeondolewa kwa staff.`);
      } else {
        // ✅ ASSIGN via existing RPC
        const { error: rpcErr } = await supabase.rpc("assign_membership_to_store", {
          p_membership_id: membershipId,
          p_store_id: storeId,
        });
        if (rpcErr) throw rpcErr;

        Alert.alert("Assigned ✅", `${storeName} ime-assign kwa staff.`);
      }

      await loadAssigned();
      await refresh();
    } catch (e: any) {
      Alert.alert("Action failed", e?.message ?? "Unknown error");
      setError(e?.message ?? "Action failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen>
      <Text style={{ fontSize: 22, fontWeight: "900", color: UI.text }}>
        Assign Stores
      </Text>

      <Text style={{ color: UI.muted, fontWeight: "700" }}>
        Org:{" "}
        <Text style={{ color: UI.text, fontWeight: "900" }}>
          {activeOrgName ?? "—"}
        </Text>
      </Text>

      <Card style={{ gap: 10 }}>
        <Text style={{ color: UI.muted, fontWeight: "800" }}>Membership ID</Text>
        <Text style={{ color: UI.text, fontWeight: "900" }}>
          {membershipId ? `${membershipId.slice(0, 10)}...` : "—"}
        </Text>

        <Text style={{ color: UI.muted, fontWeight: "800" }}>Your Role</Text>
        <Text style={{ color: UI.text, fontWeight: "900" }}>
          {(activeRole ?? "—").toUpperCase()}
        </Text>
      </Card>

      {!!error && (
        <Card
          style={{
            borderColor: "rgba(251,113,133,0.35)",
            backgroundColor: "rgba(251,113,133,0.08)",
          }}
        >
          <Text style={{ color: UI.danger, fontWeight: "900" }}>{error}</Text>
        </Card>
      )}

      <Button
        title={loading ? "Loading..." : "Refresh Assigned"}
        variant="primary"
        onPress={loadAssigned}
        disabled={loading}
      />

      <Text style={{ fontSize: 16, fontWeight: "900", color: UI.text }}>
        Stores
      </Text>

      {orgStores.length === 0 ? (
        <Card>
          <Text style={{ color: UI.text, fontWeight: "900" }}>No stores found</Text>
          <Text style={{ marginTop: 6, color: UI.muted, fontWeight: "700" }}>
            Hakuna stores kwenye org hii (au bado haijaload).
          </Text>
        </Card>
      ) : (
        orgStores.map((s) => {
          const active = isAssigned(s.store_id);

          return (
            <Card
              key={s.store_id}
              style={{
                borderColor: active ? "rgba(52,211,153,0.55)" : UI.border,
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 10,
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text style={{ color: UI.text, fontWeight: "900", fontSize: 16 }}>
                    {s.store_name}
                  </Text>
                  <Text style={{ marginTop: 6, color: UI.muted, fontWeight: "700" }}>
                    Store ID: {s.store_id.slice(0, 8)}...
                  </Text>
                </View>

                <View
                  style={{
                    borderWidth: 1,
                    borderColor: active ? "rgba(52,211,153,0.70)" : UI.border,
                    paddingHorizontal: 12,
                    paddingVertical: 7,
                    borderRadius: 999,
                    backgroundColor: active ? UI.emeraldSoft : "transparent",
                  }}
                >
                  <Text
                    style={{
                      fontWeight: "900",
                      color: active ? UI.emerald : UI.faint,
                    }}
                  >
                    {active ? "ASSIGNED" : "NOT"}
                  </Text>
                </View>
              </View>

              <View style={{ height: 10 }} />

              <Button
                title={active ? "Remove (Unassign)" : "Assign"}
                variant={active ? "secondary" : "primary"}
                onPress={() => toggle(s.store_id, s.store_name)}
                disabled={!canManage || loading}
              />
            </Card>
          );
        })
      )}

      <Button title="Back" variant="secondary" onPress={() => router.back()} />
    </Screen>
  );
}