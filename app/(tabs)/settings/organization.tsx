// app/(tabs)/settings/organization.tsx
import React, { useMemo } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import { Screen } from "@/src/ui/Screen";
import { Card } from "@/src/ui/Card";
import { UI } from "@/src/ui/theme";
import { useOrg } from "@/src/context/OrgContext";

function Pill({ icon, label }: { icon: keyof typeof Ionicons.glyphMap; label: string }) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.12)",
        backgroundColor: "rgba(255,255,255,0.05)",
      }}
    >
      <Ionicons name={icon} size={14} color={UI.emerald} />
      <Text style={{ color: UI.text, fontWeight: "900", fontSize: 12 }}>{label}</Text>
    </View>
  );
}

export default function OrganizationSettings() {
  const router = useRouter();
  const org = useOrg();

  const name = org.activeOrgName ?? "No organization";
  const role = org.activeRole ? String(org.activeRole).toUpperCase() : "—";
  const store = org.activeStoreName ?? "—";
  const orgId = org.activeOrgId ?? "—";

  const canManageOrg = useMemo(() => {
    return org.activeRole === "owner" || org.activeRole === "admin";
  }, [org.activeRole]);

  return (
    <Screen scroll>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginTop: 2 }}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [
            {
              width: 42,
              height: 42,
              borderRadius: 16,
              alignItems: "center",
              justifyContent: "center",
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.10)",
              backgroundColor: "rgba(255,255,255,0.04)",
              opacity: pressed ? 0.9 : 1,
            },
          ]}
        >
          <Ionicons name="chevron-back" size={20} color={UI.text} />
        </Pressable>

        <View style={{ flex: 1 }}>
          <Text style={{ color: UI.text, fontWeight: "900", fontSize: 20 }}>
            Organization
          </Text>
          <Text style={{ color: UI.muted, fontWeight: "800", marginTop: 4 }}>
            Manage org identity and core setup.
          </Text>
        </View>
      </View>

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 14 }}>
        <Pill icon="person-outline" label={role} />
        <Pill icon="storefront-outline" label={store} />
        <Pill icon="finger-print-outline" label={orgId} />
      </View>

      <View style={{ marginTop: 14 }}>
        <Card>
          <Text style={{ color: UI.text, fontWeight: "900", fontSize: 16 }}>
            {name}
          </Text>
          <Text style={{ color: UI.muted, fontWeight: "800", marginTop: 6 }}>
            This is your active organization. Regional Settings will apply here.
          </Text>

          <View
            style={{
              height: 1,
              backgroundColor: "rgba(255,255,255,0.10)",
              marginVertical: 14,
            }}
          />

          <Pressable
            onPress={() => router.push("/(tabs)/settings/regional")}
            style={({ pressed }) => [
              {
                flexDirection: "row",
                alignItems: "center",
                gap: 10,
                paddingVertical: 12,
                paddingHorizontal: 12,
                borderRadius: 16,
                borderWidth: 1,
                borderColor: UI.emeraldBorder,
                backgroundColor: pressed ? "rgba(16,185,129,0.18)" : UI.emeraldSoft,
              },
            ]}
          >
            <View
              style={{
                width: 40,
                height: 40,
                borderRadius: 14,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: "rgba(0,0,0,0.25)",
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.10)",
              }}
            >
              <Ionicons name="globe-outline" size={20} color={UI.emerald} />
            </View>

            <View style={{ flex: 1 }}>
              <Text style={{ color: UI.text, fontWeight: "900", fontSize: 14 }}>
                Regional Settings
              </Text>
              <Text style={{ color: UI.faint, fontWeight: "800", fontSize: 12, marginTop: 2 }}>
                Language • Currency • Timezone • Date • Number
              </Text>
            </View>

            <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.55)" />
          </Pressable>
        </Card>
      </View>

      <View style={{ marginTop: 12 }}>
        <Card>
          <Text style={{ color: UI.text, fontWeight: "900", fontSize: 14 }}>
            Permissions
          </Text>
          <Text style={{ color: UI.muted, fontWeight: "800", marginTop: 6 }}>
            Only Owner/Admin should change organization-level settings (accounting consistency).
          </Text>

          <View style={{ marginTop: 12 }}>
            <Pressable
              onPress={() => {
                if (!canManageOrg) {
                  Alert.alert("Not allowed", "Only Owner/Admin can manage organization settings.");
                  return;
                }
                Alert.alert("Coming next", "Organization identity editing will be added next.");
              }}
              style={({ pressed }) => [
                {
                  alignSelf: "flex-start",
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 8,
                  paddingVertical: 10,
                  paddingHorizontal: 12,
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.12)",
                  backgroundColor: pressed ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.04)",
                  opacity: canManageOrg ? 1 : 0.55,
                },
              ]}
            >
              <Ionicons name="pencil-outline" size={16} color={UI.text} />
              <Text style={{ color: UI.text, fontWeight: "900", fontSize: 12 }}>
                Edit org info (soon)
              </Text>
            </Pressable>
          </View>
        </Card>
      </View>
    </Screen>
  );
}