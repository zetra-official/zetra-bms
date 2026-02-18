// app/(tabs)/staff/index.tsx
import { useRouter } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useOrg } from "../../../src/context/OrgContext";
import { supabase } from "../../../src/supabase/supabaseClient";

type StaffStoreRow = {
  store_id: string;
  store_name: string;
};

type StaffRow = {
  user_id: string;
  role: "owner" | "admin" | "staff";
  membership_id: string;

  // ✅ NEW (safe): RPC inaweza kurudisha email (au user_email)
  email?: string | null;
  user_email?: string | null;

  stores?: StaffStoreRow[];
};

const UI = {
  bg0: "#05070D",
  card: "rgba(255,255,255,0.06)",
  border: "rgba(255,255,255,0.10)",
  text: "rgba(255,255,255,0.92)",
  muted: "rgba(255,255,255,0.65)",
  faint: "rgba(255,255,255,0.45)",
  emerald: "#34D399",
  emeraldSoft: "rgba(52,211,153,0.14)",
  danger: "#FB7185",
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

export default function StaffTabScreen() {
  const router = useRouter();
  const { activeOrgId, activeOrgName, activeRole } = useOrg();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [q, setQ] = useState("");
  const [rows, setRows] = useState<StaffRow[]>([]);

  const canManage = activeRole === "owner" || activeRole === "admin";

  const fetchStaff = useCallback(async () => {
    setError(null);
    if (!activeOrgId) {
      setRows([]);
      return;
    }

    setLoading(true);
    try {
      const { data, error: e } = await supabase.rpc("get_org_staff_with_stores", {
        p_org_id: activeOrgId,
      });
      if (e) throw e;

      setRows((data ?? []) as StaffRow[]);
    } catch (err: any) {
      setError(err?.message ?? "Failed to load staff");
    } finally {
      setLoading(false);
    }
  }, [activeOrgId]);

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
        contentContainerStyle={{
          padding: 16,
          paddingBottom: 120, // ✅ nafasi juu ya tab bar + buttons za simu
          gap: 12,
        }}
      >
        <Text style={{ fontSize: 26, fontWeight: "900", color: UI.text }}>
          Staff Management
        </Text>

        {/* Org card */}
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
                {activeRole ?? "—"}
              </Text>
            </View>
          </View>
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

        {/* Actions */}
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
          onPress={fetchStaff}
          disabled={loading}
          style={{
            backgroundColor: "rgba(255,255,255,0.08)",
            borderWidth: 1,
            borderColor: "rgba(52,211,153,0.30)",
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
              Bonyeza “Refresh Staff List”.
            </Text>
          </View>
        ) : (
          filtered.map((r) => {
            const storesText =
              (r.stores ?? []).map((s) => s.store_name).join(", ") || "—";

            const roleBorder =
              r.role === "owner"
                ? "rgba(52,211,153,0.35)"
                : r.role === "admin"
                ? "rgba(255,255,255,0.20)"
                : "rgba(255,255,255,0.14)";

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

                    {/* ✅ Show user_id only as secondary detail (small) */}
                    {email ? (
                      <Text style={{ color: UI.faint, fontWeight: "800", marginTop: 4 }}>
                        User: {shortId(r.user_id)}
                      </Text>
                    ) : null}
                  </View>

                  <View
                    style={{
                      borderWidth: 1,
                      borderColor: roleBorder,
                      backgroundColor: "rgba(255,255,255,0.06)",
                      paddingHorizontal: 12,
                      paddingVertical: 7,
                      borderRadius: 999,
                    }}
                  >
                    <Text style={{ color: UI.text, fontWeight: "900" }}>
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

                <Text style={{ color: UI.muted, fontWeight: "700", marginTop: 2 }}>
                  Tip: Bonyeza “Assign Store” kwenye staff card ili uende ku-assign /
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