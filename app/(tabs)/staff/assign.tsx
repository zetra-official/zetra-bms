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

type MembershipMetaRow = {
  membership_id: string;
  organization_id: string;
  role: string | null;
};

function clean(s: any) {
  return String(s ?? "").trim();
}

function mapAssignErrorMessage(e: any): string {
  const msg = clean(e?.message ?? e?.error_description ?? e?.details ?? e);
  const m = msg.toLowerCase();

  if (
    m.includes("cashier can only be assigned to one store") ||
    m.includes("this store already has a cashier")
  ) {
    return (
      "Bado kuna legacy blocker upande wa database au app cache ya zamani.\n\n" +
      "Kwa muundo mpya:\n" +
      "• Cashier anaweza kuassigniwa stores nyingi\n" +
      "• Store moja inaweza kuwa na cashiers wengi wa zamu\n\n" +
      "Reload app kisha jaribu tena."
    );
  }

  if (m.includes("selected membership is not a cashier")) {
    return "Member huyu si cashier.";
  }

  if (m.includes("cashier and store must belong to same organization")) {
    return "Cashier na store lazima wawe ndani ya organization moja.";
  }

  if (m.includes("only owner/admin can assign cashier")) {
    return "Owner/Admin tu ndio wanaweza kuassign cashier.";
  }

  if (m.includes("membership not found")) {
    return "Membership haijapatikana. Rudi Staff list kisha fungua tena.";
  }

  if (m.includes("store not found")) {
    return "Store haijapatikana.";
  }

  return msg || "Unknown error";
}

export default function AssignStaffStoresScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ membershipId?: string }>();
  const membershipId = clean(params.membershipId?.toString() || "");

  const { activeOrgId, activeOrgName, activeRole, stores, refresh } = useOrg();
  const canManage = activeRole === "owner" || activeRole === "admin";

  const orgStores = useMemo(() => {
    if (!activeOrgId) return [];
    return (stores ?? []).filter((s) => s.organization_id === activeOrgId);
  }, [stores, activeOrgId]);

  const [loading, setLoading] = useState(false);
  const [assignedIds, setAssignedIds] = useState<string[]>([]);
  const [membershipRole, setMembershipRole] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  const loadAssigned = useCallback(async () => {
    setError(null);

    if (!membershipId) {
      setAssignedIds([]);
      return;
    }

    setLoading(true);
    try {
      const { data, error: e } = await supabase.rpc(
        "get_assigned_stores_for_membership",
        { p_membership_id: membershipId }
      );

      if (e) throw e;

      const rows = (data ?? []) as AssignedRow[];
      const ids = rows.map((r) => clean(r.store_id)).filter(Boolean);
      setAssignedIds(ids);
    } catch (err: any) {
      setError(clean(err?.message) || "Failed to load assigned stores");
      setAssignedIds([]);
    } finally {
      setLoading(false);
    }
  }, [membershipId]);

  const loadMeta = useCallback(async () => {
    if (!membershipId) {
      setMembershipRole("");
      return;
    }

    try {
      const { data, error: e } = await supabase.rpc("get_membership_manage_meta_v1", {
        p_membership_id: membershipId,
      });

      if (e) throw e;

      const row = (Array.isArray(data) ? data?.[0] : data) as MembershipMetaRow | null;
      setMembershipRole(clean(row?.role).toLowerCase());
    } catch (err: any) {
      setMembershipRole("");
      setError(clean(err?.message) || "Failed to load membership role");
    }
  }, [membershipId]);

  useEffect(() => {
    void loadMeta();
    void loadAssigned();
  }, [loadMeta, loadAssigned]);

  const isAssigned = useCallback(
    (storeId: string) => assignedIds.includes(clean(storeId)),
    [assignedIds]
  );

  const isCashier = membershipRole === "cashier";

  const toggle = async (storeId: string, storeName: string) => {
    if (!canManage) {
      Alert.alert("No Access", "Owner/Admin only.");
      return;
    }

    if (!membershipId) {
      Alert.alert("Missing membershipId", "Rudi kwenye Staff list kisha ufungue tena.");
      return;
    }

    const safeStoreId = clean(storeId);
    const alreadyAssigned = isAssigned(safeStoreId);

    setLoading(true);
    setError(null);

    try {
      if (alreadyAssigned) {
        const { error: delErr } = await supabase.rpc("unassign_membership_from_store", {
          p_membership_id: membershipId,
          p_store_id: safeStoreId,
        });
        if (delErr) throw delErr;

        Alert.alert("Removed ✅", `${storeName} imeondolewa kwa member.`);
      } else {
        if (isCashier) {
          const { error: rpcErr } = await supabase.rpc("assign_cashier_to_store_v2", {
            p_membership_id: membershipId,
            p_store_id: safeStoreId,
          });
          if (rpcErr) throw rpcErr;

          Alert.alert("Cashier Assigned ✅", `${storeName} imeongezwa kwa cashier huyu.`);
        } else {
          const { error: rpcErr } = await supabase.rpc("assign_membership_to_store", {
            p_membership_id: membershipId,
            p_store_id: safeStoreId,
          });
          if (rpcErr) throw rpcErr;

          Alert.alert("Assigned ✅", `${storeName} ime-assign kwa member.`);
        }
      }

      await loadAssigned();
      await refresh();
    } catch (e: any) {
      const msg = mapAssignErrorMessage(e);
      setError(msg);
      Alert.alert("Action failed", msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen scroll>
      <Text style={{ fontSize: 22, fontWeight: "900", color: UI.text }}>
        Assign Stores
      </Text>

      <Text style={{ color: UI.muted, fontWeight: "700", marginTop: 6 }}>
        Org:{" "}
        <Text style={{ color: UI.text, fontWeight: "900" }}>
          {activeOrgName ?? "—"}
        </Text>
      </Text>

      <Card style={{ gap: 10, marginTop: 14 }}>
        <Text style={{ color: UI.muted, fontWeight: "800" }}>Membership ID</Text>
        <Text style={{ color: UI.text, fontWeight: "900" }}>
          {membershipId ? `${membershipId.slice(0, 10)}...` : "—"}
        </Text>

        <Text style={{ color: UI.muted, fontWeight: "800" }}>Member Role</Text>
        <Text style={{ color: UI.text, fontWeight: "900" }}>
          {(membershipRole || "—").toUpperCase()}
        </Text>

        <Text style={{ color: UI.muted, fontWeight: "800" }}>Your Role</Text>
        <Text style={{ color: UI.text, fontWeight: "900" }}>
          {(activeRole ?? "—").toUpperCase()}
        </Text>
      </Card>

      {isCashier ? (
        <Card
          style={{
            marginTop: 12,
            borderColor: UI.emeraldBorder,
            backgroundColor: UI.emeraldSoft,
          }}
        >
          <Text style={{ color: UI.text, fontWeight: "900" }}>CASHIER ASSIGN RULE</Text>
          <Text style={{ marginTop: 6, color: UI.muted, fontWeight: "800" }}>
            • Cashier anaweza kuassigniwa stores nyingi ndani ya organization.
          </Text>
          <Text style={{ marginTop: 6, color: UI.muted, fontWeight: "800" }}>
            • Store moja inaweza kuwa na cashiers wengi wa zamu.
          </Text>
          <Text style={{ marginTop: 6, color: UI.muted, fontWeight: "800" }}>
            • Hii inasaidia shift work, peak hours, supermarket na pharmacy flow.
          </Text>
        </Card>
      ) : null}

      {!!error && (
        <Card
          style={{
            marginTop: 12,
            borderColor: "rgba(251,113,133,0.35)",
            backgroundColor: "rgba(251,113,133,0.08)",
          }}
        >
          <Text style={{ color: UI.danger, fontWeight: "900" }}>{error}</Text>
        </Card>
      )}

      <View style={{ marginTop: 12 }}>
        <Button
          title={loading ? "Loading..." : "Refresh Assigned"}
          variant="primary"
          onPress={loadAssigned}
          disabled={loading}
        />
      </View>

      <Text
        style={{
          fontSize: 16,
          fontWeight: "900",
          color: UI.text,
          marginTop: 14,
          marginBottom: 8,
        }}
      >
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
                marginTop: 10,
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
                title={active ? "Remove (Unassign)" : isCashier ? "Assign Cashier" : "Assign"}
                variant={active ? "secondary" : "primary"}
                onPress={() => toggle(s.store_id, s.store_name)}
                disabled={!canManage || loading}
              />
            </Card>
          );
        })
      )}

      <View style={{ marginTop: 14 }}>
        <Button title="Back" variant="secondary" onPress={() => router.back()} />
      </View>
    </Screen>
  );
}