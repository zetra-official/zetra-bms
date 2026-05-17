// app/(tabs)/staff/index.tsx
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import {
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useOrg } from "../../../src/context/OrgContext";
import { supabase } from "../../../src/supabase/supabaseClient";

type StaffStoreRow = {
  store_id: string;
  store_name: string;
};

type StaffRole = "owner" | "admin" | "staff" | "cashier";

type StaffRow = {
  user_id: string;
  role: StaffRole;
  membership_id: string;

  // ✅ RPC inaweza kurudisha email (au user_email)
  email?: string | null;
  user_email?: string | null;

  stores?: StaffStoreRow[];
};

const UI = {
  bg0: "#F3F7FC",
  card: "#FFFFFF",
  border: "rgba(15,23,42,0.10)",
  text: "#0F172A",
  muted: "#64748B",
  faint: "#94A3B8",
  emerald: "#059669",
  emeraldSoft: "rgba(5,150,105,0.10)",
  danger: "#E11D48",
};

function shortId(v: string) {
  if (!v) return "—";
  return v.length > 10 ? `${v.slice(0, 8)}...` : v;
}

function pickEmail(r: StaffRow) {
  const e = (r.email ?? r.user_email ?? "").trim();
  return e || null;
}

function initialsFromEmail(email: string | null, fallback = "UD") {
  if (!email) return fallback;
  const base = email.split("@")[0]?.trim() ?? "";
  const letters = base.replace(/[^a-zA-Z]/g, "");
  if (letters.length >= 2) return letters.slice(0, 2).toUpperCase();
  if (letters.length === 1) return (letters + "D").toUpperCase();
  return fallback;
}

function roleBorderColor(role: StaffRole) {
  if (role === "owner") return "rgba(52,211,153,0.35)";
  if (role === "admin") return "rgba(255,255,255,0.20)";
  if (role === "cashier") return "rgba(52,211,153,0.28)";
  return "rgba(255,255,255,0.14)";
}

function roleBadgeBg(role: StaffRole) {
  if (role === "cashier") return "rgba(52,211,153,0.10)";
  return "rgba(255,255,255,0.06)";
}

function roleLabel(role: StaffRole | string | null | undefined) {
  const r = String(role ?? "").trim().toLowerCase();
  if (r === "owner") return "OWNER";
  if (r === "admin") return "ADMIN";
  if (r === "staff") return "STAFF";
  if (r === "cashier") return "CASHIER";
  return "—";
}

export default function StaffTabScreen() {
  const router = useRouter();
  const { activeOrgId, activeOrgName, activeRole } = useOrg();

  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [q, setQ] = useState("");
  const [rows, setRows] = useState<StaffRow[]>([]);

  const canManage = activeRole === "owner" || activeRole === "admin";
  const [removingByMembershipId, setRemovingByMembershipId] = useState<Record<string, boolean>>({});

  const fetchStaff = useCallback(
    async (opts?: { silent?: boolean }) => {
      const silent = !!opts?.silent;

      if (!silent) setError(null);

      if (!activeOrgId) {
        setRows([]);
        return;
      }

      if (!silent) setLoading(true);

      try {
        const { data, error: e } = await supabase.rpc("get_org_staff_with_stores", {
          p_org_id: activeOrgId,
        });

        if (e) throw e;

        setRows((data ?? []) as StaffRow[]);
      } catch (err: any) {
        if (!silent) setError(err?.message ?? "Failed to load staff");
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [activeOrgId]
  );

  useFocusEffect(
    useCallback(() => {
      void fetchStaff({ silent: true });
    }, [fetchStaff])
  );

  const onPullRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await fetchStaff();
    } finally {
      setRefreshing(false);
    }
  }, [fetchStaff]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;

    return rows.filter((r) => {
      const email = pickEmail(r) ?? "";
      const hay = `${email} ${r.user_id} ${r.membership_id} ${r.role}`.toLowerCase();
      return hay.includes(needle);
    });
  }, [rows, q]);

  const openAssign = (membershipId: string) => {
    if (!canManage) {
      Alert.alert("No Access", "Owner/Admin only.");
      return;
    }

    router.push({
      pathname: "/(tabs)/staff/assign",
      params: { membershipId },
    });
  };

  const openAdd = () => {
    if (!canManage) {
      Alert.alert("No Access", "Owner/Admin only.");
      return;
    }

    router.push({
      pathname: "/(tabs)/staff/add",
      params: { orgId: activeOrgId ?? "" },
    });
  };

  const openCommission = () => {
    if (!canManage) {
      Alert.alert("No Access", "Owner/Admin only.");
      return;
    }

    router.push("/(tabs)/staff/commission");
  };

  const openMySales = () => {
    if (activeRole !== "staff") {
      Alert.alert("No Access", "Staff only.");
      return;
    }

    router.push("/(tabs)/staff/my-sales");
  };

  const openPayoutProfile = () => {
    if (activeRole !== "staff") {
      Alert.alert("No Access", "Staff only.");
      return;
    }

    router.push("/(tabs)/staff/payout-profile");
  };

  const openCommissionHistory = () => {
    if (activeRole !== "staff") {
      Alert.alert("No Access", "Staff only.");
      return;
    }

    router.push("/(tabs)/staff/commission-history");
  };

  const openCommissionCashOut = () => {
    if (!canManage) {
      Alert.alert("No Access", "Owner/Admin only.");
      return;
    }

    router.push("/(tabs)/staff/cash-out");
  };

  const removeStaff = (r: StaffRow) => {
    if (!canManage) {
      Alert.alert("No Access", "Owner/Admin only.");
      return;
    }

    if (!activeOrgId) {
      Alert.alert("Missing", "Organization haijapatikana.");
      return;
    }

    if (r.role === "owner") {
      Alert.alert("Not Allowed", "Owner hawezi kuondolewa kwenye screen hii.");
      return;
    }

    const email = pickEmail(r) ?? shortId(r.user_id);

    Alert.alert(
      "Remove Staff",
      `Una uhakika unataka kumuondoa ${email}?\n\nAtaondolewa kwenye stores zote na hataweza kuendelea kufanya majukumu yake, lakini history zake za zamani zitabaki salama.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            setRemovingByMembershipId((p) => ({ ...p, [r.membership_id]: true }));
            setError(null);

            try {
              const { error: e } = await supabase.rpc("remove_org_staff_v1", {
                p_org_id: activeOrgId,
                p_membership_id: r.membership_id,
              });

              if (e) throw e;

              await fetchStaff();
              Alert.alert("Removed ✅", "Staff ameondolewa kikamilifu.");
            } catch (err: any) {
              Alert.alert("Failed", err?.message ?? "Imeshindikana kumuondoa staff.");
            } finally {
              setRemovingByMembershipId((p) => ({ ...p, [r.membership_id]: false }));
            }
          },
        },
      ]
    );
  };

  const info = (r: StaffRow) => {
    const email = pickEmail(r);
    Alert.alert(
      "Staff Info",
      `Email: ${email ?? "—"}\nUser: ${r.user_id}\nRole: ${r.role}\nMembership: ${
        r.membership_id
      }\nStores: ${(r.stores ?? []).map((s) => s.store_name).join(", ") || "—"}`
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: UI.bg0 }} edges={["top"]}>
      <ScrollView
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onPullRefresh} />
        }
        contentContainerStyle={{
          padding: 18,
          paddingBottom: 170,
          gap: 12,
        }}
      >
        <Text style={{ fontSize: 30, fontWeight: "900", color: UI.text, letterSpacing: -0.8 }}>
          Staff Management
        </Text>

        <View
          style={{
            borderWidth: 1,
            borderColor: UI.border,
            borderRadius: 22,
            backgroundColor: UI.card,
            padding: 16,
            gap: 10,
          }}
        >
          <Text style={{ color: UI.muted, fontWeight: "800" }}>Organization</Text>
          <Text style={{ fontSize: 18, fontWeight: "900", color: UI.text }}>
            {activeOrgName ?? "—"}
          </Text>

          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <Text style={{ color: UI.muted, fontWeight: "800" }}>Role:</Text>
            <View
              style={{
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.18)",
                backgroundColor: "rgba(255,255,255,0.06)",
                paddingHorizontal: 12,
                paddingVertical: 6,
                borderRadius: 999,
              }}
            >
              <Text style={{ color: UI.text, fontWeight: "900" }}>
                {roleLabel(activeRole)}
              </Text>
            </View>
          </View>

          <Text style={{ color: UI.muted, fontWeight: "800", lineHeight: 20 }}>
            Owner/Admin anaweza kuongeza staff, ku-assign store, kuweka commission, na kufanya cash out.
          </Text>
        </View>

        {!!error && (
          <View
            style={{
              borderWidth: 1,
              borderColor: "rgba(251,113,133,0.35)",
              borderRadius: 18,
              backgroundColor: "rgba(251,113,133,0.08)",
              padding: 12,
            }}
          >
            <Text style={{ color: UI.danger, fontWeight: "900" }}>{error}</Text>
          </View>
        )}

        {canManage ? (
          <>
            <Pressable
              onPress={openCommission}
              style={{
                backgroundColor: "rgba(52,211,153,0.10)",
                borderWidth: 1,
                borderColor: "rgba(52,211,153,0.30)",
                paddingVertical: 16,
                borderRadius: 22,
                alignItems: "center",
              }}
            >
              <Text style={{ color: UI.text, fontWeight: "900", fontSize: 16 }}>
                Staff Sales & Commission
              </Text>
            </Pressable>

            <Pressable
              onPress={openCommissionCashOut}
              style={{
                backgroundColor: "rgba(255,255,255,0.06)",
                borderWidth: 1,
                borderColor: "rgba(52,211,153,0.24)",
                paddingVertical: 16,
                borderRadius: 22,
                alignItems: "center",
              }}
            >
              <Text style={{ color: UI.text, fontWeight: "900", fontSize: 16 }}>
                Commission Cash Out
              </Text>
            </Pressable>
          </>
        ) : null}

        {activeRole === "staff" ? (
          <>
            <Pressable
              onPress={openMySales}
              style={{
                backgroundColor: "rgba(52,211,153,0.10)",
                borderWidth: 1,
                borderColor: "rgba(52,211,153,0.30)",
                paddingVertical: 16,
                borderRadius: 22,
                alignItems: "center",
              }}
            >
              <Text style={{ color: UI.text, fontWeight: "900", fontSize: 16 }}>
                My Sales
              </Text>
            </Pressable>

            <Pressable
              onPress={openPayoutProfile}
              style={{
                backgroundColor: "rgba(255,255,255,0.06)",
                borderWidth: 1,
                borderColor: "rgba(52,211,153,0.24)",
                paddingVertical: 16,
                borderRadius: 22,
                alignItems: "center",
              }}
            >
              <Text style={{ color: UI.text, fontWeight: "900", fontSize: 16 }}>
                Payout Profile
              </Text>
            </Pressable>

            <Pressable
              onPress={openCommissionHistory}
              style={{
                backgroundColor: "rgba(255,255,255,0.05)",
                borderWidth: 1,
                borderColor: UI.border,
                paddingVertical: 16,
                borderRadius: 22,
                alignItems: "center",
              }}
            >
              <Text style={{ color: UI.text, fontWeight: "900", fontSize: 16 }}>
                Commission History
              </Text>
            </Pressable>
          </>
        ) : null}

        <Pressable
          onPress={openAdd}
          disabled={!canManage}
          style={{
            backgroundColor: "rgba(255,255,255,0.06)",
            borderWidth: 1,
            borderColor: canManage ? "rgba(52,211,153,0.30)" : UI.border,
            paddingVertical: 14,
            borderRadius: 18,
            alignItems: "center",
            opacity: canManage ? 1 : 0.55,
          }}
        >
          <Text style={{ color: UI.text, fontWeight: "900", fontSize: 16 }}>
            + Ongeza Mfanyakazi
          </Text>
        </Pressable>

        <Pressable
          onPress={() => void fetchStaff()}
          disabled={loading}
          style={{
            backgroundColor: "rgba(255,255,255,0.05)",
            borderWidth: 1,
            borderColor: UI.border,
            paddingVertical: 14,
            borderRadius: 18,
            alignItems: "center",
            opacity: loading ? 0.65 : 1,
          }}
        >
          <Text style={{ color: UI.text, fontWeight: "900", fontSize: 16 }}>
            {loading ? "Loading..." : "Refresh Staff List"}
          </Text>
        </Pressable>

        <Text style={{ fontWeight: "900", fontSize: 16, color: UI.text }}>
          Wafanyakazi
        </Text>

        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder="Tafuta kwa email / user id / role..."
          placeholderTextColor="rgba(255,255,255,0.35)"
          style={{
            borderWidth: 1,
            borderColor: UI.border,
            borderRadius: 18,
            backgroundColor: "rgba(255,255,255,0.05)",
            paddingHorizontal: 14,
            paddingVertical: 12,
            color: UI.text,
            fontWeight: "800",
          }}
        />

        {filtered.length === 0 ? (
          <View
            style={{
              borderWidth: 1,
              borderColor: UI.border,
              borderRadius: 22,
              backgroundColor: UI.card,
              padding: 16,
            }}
          >
            <Text style={{ fontWeight: "900", color: UI.text }}>
              No staff found
            </Text>
            <Text style={{ marginTop: 6, color: UI.muted, fontWeight: "700" }}>
              List inajirefresh yenyewe ukifungua. Unaweza pia kudrag juu (pull-to-refresh).
            </Text>
          </View>
        ) : (
          filtered.map((r) => {
            const storesText =
              (r.stores ?? []).map((s) => s.store_name).join(", ") || "—";

            const email = pickEmail(r);
            const displayTop = email ? email : `User: ${shortId(r.user_id)}`;
            const badge = initialsFromEmail(email, "UD");

            return (
              <View
                key={r.membership_id}
                style={{
                  borderWidth: 1,
                  borderColor: UI.border,
                  borderRadius: 22,
                  backgroundColor: UI.card,
                  padding: 16,
                  gap: 10,
                }}
              >
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <View
                    style={{
                      width: 46,
                      height: 46,
                      borderRadius: 999,
                      borderWidth: 1,
                      borderColor: "rgba(255,255,255,0.18)",
                      backgroundColor: "rgba(255,255,255,0.06)",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Text style={{ color: UI.text, fontWeight: "900" }}>{badge}</Text>
                  </View>

                  <View style={{ flex: 1 }}>
                    <Text style={{ color: UI.text, fontWeight: "900" }}>
                      {displayTop}
                    </Text>

                    <Text style={{ color: UI.muted, fontWeight: "800", marginTop: 4 }}>
                      Membership: {shortId(r.membership_id)}
                    </Text>

                    {email ? (
                      <Text style={{ color: UI.faint, fontWeight: "800", marginTop: 4 }}>
                        User: {shortId(r.user_id)}
                      </Text>
                    ) : null}
                  </View>

                  <View
                    style={{
                      borderWidth: 1,
                      borderColor: roleBorderColor(r.role),
                      backgroundColor: roleBadgeBg(r.role),
                      paddingHorizontal: 12,
                      paddingVertical: 7,
                      borderRadius: 999,
                    }}
                  >
                    <Text
                      style={{
                        color: r.role === "cashier" ? UI.emerald : UI.text,
                        fontWeight: "900",
                      }}
                    >
                      {r.role.toUpperCase()}
                    </Text>
                  </View>
                </View>

                <View>
                  <Text style={{ color: UI.muted, fontWeight: "800" }}>Stores</Text>
                  <Text style={{ color: UI.text, fontWeight: "900", marginTop: 4 }}>
                    {storesText}
                  </Text>
                </View>

                <View style={{ flexDirection: "row", gap: 10 }}>
                  <Pressable
                    onPress={() => openAssign(r.membership_id)}
                    disabled={!canManage}
                    style={{
                      flex: 1,
                      backgroundColor: "rgba(255,255,255,0.08)",
                      borderWidth: 1,
                      borderColor: canManage ? "rgba(52,211,153,0.30)" : UI.border,
                      paddingVertical: 12,
                      borderRadius: 18,
                      alignItems: "center",
                      opacity: canManage ? 1 : 0.55,
                    }}
                  >
                    <Text style={{ color: UI.text, fontWeight: "900" }}>
                      Assign Store
                    </Text>
                  </Pressable>

                  <Pressable
                    onPress={() => info(r)}
                    style={{
                      width: 96,
                      backgroundColor: "rgba(255,255,255,0.05)",
                      borderWidth: 1,
                      borderColor: UI.border,
                      paddingVertical: 12,
                      borderRadius: 18,
                      alignItems: "center",
                    }}
                  >
                    <Text style={{ color: UI.text, fontWeight: "900" }}>Info</Text>
                  </Pressable>
                </View>

                {canManage && r.role !== "owner" ? (
                  <Pressable
                    onPress={() => removeStaff(r)}
                    disabled={!!removingByMembershipId[r.membership_id]}
                    style={{
                      backgroundColor: "rgba(251,113,133,0.10)",
                      borderWidth: 1,
                      borderColor: "rgba(251,113,133,0.35)",
                      paddingVertical: 12,
                      borderRadius: 18,
                      alignItems: "center",
                      opacity: removingByMembershipId[r.membership_id] ? 0.55 : 1,
                    }}
                  >
                    <Text style={{ color: UI.danger, fontWeight: "900" }}>
                      {removingByMembershipId[r.membership_id] ? "Removing..." : "Remove Staff"}
                    </Text>
                  </Pressable>
                ) : null}

                <Text style={{ color: UI.muted, fontWeight: "700", marginTop: 2, lineHeight: 20 }}>
                  Tip: Bonyeza “Assign Store” kwenye {r.role === "cashier" ? "cashier" : "staff"} card ili uende ku-assign /
                  ku-unassign (membershipId tayari ✅)
                </Text>
              </View>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}